import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  Actor,
  courseCard,
  CoursePolicy,
  lockEnrollment,
  outlineInclude,
  versionOutline,
} from '../courses/course.policy';
import { ProgressDto } from './learning.dto';
import { updateCourseCompletion } from './learning.completion';
import type { ResourceDto } from '../courses/courses.dto';

const laterDeadline = (base: Date | null, extension: Date | null) =>
  base && extension ? new Date(Math.max(base.getTime(), extension.getTime())) : (base ?? extension);

@Injectable()
export class LearningService {
  constructor(
    private db: PrismaService,
    private policy: CoursePolicy,
  ) {}
  async home(actor: Actor) {
    const enrollments = await this.db.enrollment.findMany({
      where: {
        userId: actor.id,
        state: { in: ['ACTIVE', 'COMPLETED'] },
        course: { organizationId: actor.organizationId },
      },
      include: { course: true, courseVersion: { include: outlineInclude }, completions: true },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
    const grades = await this.db.grade.findMany({
      where: {
        releasedAt: { not: null },
        submission: {
          enrollment: { userId: actor.id, course: { organizationId: actor.organizationId } },
        },
      },
      orderBy: { releasedAt: 'desc' },
      take: 10,
      include: {
        submission: { include: { activity: true, enrollment: { include: { course: true } } } },
      },
    });
    return {
      items: enrollments.map((e) => {
        const s = this.summary(e.courseVersion, e.completions);
        return { id: e.id, state: e.state, course: courseCard(e.course), ...s };
      }),
      feedback: grades.map((g) => ({
        id: g.id,
        score: g.score,
        feedback: g.feedback,
        activityTitle: g.submission.activity.title,
        courseTitle: g.submission.enrollment.course.title,
        activityId: g.submission.activityId,
        releasedAt: g.releasedAt,
      })),
    };
  }
  private summary(v: any, completions: any[]) {
    const activities = v.modules.flatMap((m: any) => m.activities);
    const satisfied = (a: any) =>
      completions.some(
        (c) =>
          c.activityId === a.id &&
          (a.kind === 'LESSON' ? ['COMPLETED', 'PASSED'].includes(c.state) : c.state === 'PASSED'),
      );
    const complete = activities.filter(satisfied).length;
    const next = activities.find((a: any) => !satisfied(a));
    return {
      progress: activities.length ? Math.round((complete / activities.length) * 100) : 0,
      nextActivity: next ? { id: next.id, title: next.title, kind: next.kind } : null,
    };
  }
  async course(actor: Actor, id: string) {
    const e = await this.policy.enrollment(actor, id);
    const [version, completions] = await Promise.all([
      this.db.courseVersion.findUniqueOrThrow({
        where: { id: e.courseVersionId },
        include: outlineInclude,
      }),
      this.db.activityCompletion.findMany({
        where: { enrollmentId: e.id },
        select: { activityId: true, state: true },
      }),
    ]);
    return {
      course: courseCard(e.course),
      version: versionOutline(version),
      enrollment: { id: e.id, state: e.state },
      completions,
      ...this.summary(version, completions),
    };
  }
  async activity(actor: Actor, id: string) {
    const { activity: a, enrollment: e } = await this.policy.activity(actor, id);
    const [v, completion] = await Promise.all([
      this.db.courseVersion.findUniqueOrThrow({
        where: { id: e.courseVersionId },
        include: outlineInclude,
      }),
      this.db.activityCompletion.findUnique({
        where: { enrollmentId_activityId: { enrollmentId: e.id, activityId: id } },
      }),
    ]);
    const flat = v.modules.flatMap((m) => m.activities);
    const index = flat.findIndex((a) => a.id === id);
    return {
      id: a.id,
      title: a.title,
      kind: a.kind,
      objective: a.objective,
      body: a.body,
      example: a.example,
      reflection: a.reflection,
      estimatedMinutes: a.estimatedMinutes,
      videoUrl: a.videoUrl,
      captionsUrl: a.captionsUrl,
      transcript: a.transcript,
      resources: a.resources,
      offlineAllowed: a.offlineAllowed,
      courseId: e.courseId,
      courseTitle: e.course.title,
      versionId: e.courseVersionId,
      outline: versionOutline(v).modules,
      previousId: flat[index - 1]?.id ?? null,
      nextId: flat[index + 1]?.id ?? null,
      completion: completion?.state ?? null,
      assessment: a.assessment
        ? {
            maxAttempts: a.assessment.maxAttempts + e.extraAttempts,
            passPercent: a.assessment.passPercent,
            feedbackRelease: a.assessment.feedbackRelease,
            deadline: laterDeadline(a.assessment.deadline, e.deadlineExtension),
            timeLimitMinutes: a.assessment.timeLimitMinutes
              ? a.assessment.timeLimitMinutes + e.extraTimeMinutes
              : null,
          }
        : null,
      rubric: a.rubric
        ? {
            criteria: a.rubric.criteria,
            passPercent: a.rubric.passPercent,
            deadline: laterDeadline(a.rubric.deadline, e.deadlineExtension),
          }
        : null,
    };
  }
  async progress(actor: Actor, dto: ProgressDto) {
    const { activity, enrollment } = await this.policy.activity(actor, dto.activityId);
    if (dto.state === 'COMPLETED' && activity.kind !== 'LESSON')
      throw new BadRequestException(
        'Practice and assignment completion is calculated by the server',
      );
    return this.db.$transaction(async (tx) => {
      await lockEnrollment(tx, enrollment.id);
      const existing = await tx.progressEvent.findUnique({ where: { id: dto.eventId } });
      if (existing) {
        if (
          existing.enrollmentId !== enrollment.id ||
          existing.activityId !== dto.activityId ||
          existing.state !== dto.state
        )
          throw new ConflictException('Progress event ID was already used');
        return {
          acknowledged: dto.eventId,
          state:
            (
              await tx.activityCompletion.findUnique({
                where: {
                  enrollmentId_activityId: {
                    enrollmentId: enrollment.id,
                    activityId: dto.activityId,
                  },
                },
              })
            )?.state ?? existing.state,
        };
      }
      await tx.progressEvent.create({
        data: {
          id: dto.eventId,
          enrollmentId: enrollment.id,
          activityId: dto.activityId,
          state: dto.state,
          clientAt: dto.clientAt ? new Date(dto.clientAt) : null,
        },
      });
      const current = await tx.activityCompletion.findUnique({
        where: {
          enrollmentId_activityId: { enrollmentId: enrollment.id, activityId: dto.activityId },
        },
      });
      const rank = { VIEWED: 0, COMPLETED: 1, PASSED: 2 };
      const state = current && rank[current.state] > rank[dto.state] ? current.state : dto.state;
      await tx.activityCompletion.upsert({
        where: {
          enrollmentId_activityId: { enrollmentId: enrollment.id, activityId: dto.activityId },
        },
        create: { enrollmentId: enrollment.id, activityId: dto.activityId, state },
        update: { state },
      });
      await updateCourseCompletion(tx, enrollment.id, enrollment.courseVersionId);
      return { acknowledged: dto.eventId, state };
    });
  }
  async download(actor: Actor, id: string) {
    const a = await this.activity(actor, id);
    if (!a.offlineAllowed || a.kind !== 'LESSON')
      throw new BadRequestException('This activity is not available for offline reading');
    const payload = {
      ...a,
      videoUrl: null,
      captionsUrl: null,
      // Offline bundles contain only the reviewed text saved in this published
      // version. External links are never fetched or represented as cached files.
      resources: (a.resources as unknown as ResourceDto[])
        .filter(
          (resource) =>
            resource.offlineAllowed &&
            resource.accessible &&
            typeof resource.text === 'string' &&
            resource.text.trim().length > 0,
        )
        .map((resource) => ({
          title: resource.title,
          text: resource.text,
          accessible: true,
          offlineAllowed: true,
        })),
      downloadedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    };
    return { ...payload, sizeBytes: Buffer.byteLength(JSON.stringify(payload), 'utf8') };
  }
}
