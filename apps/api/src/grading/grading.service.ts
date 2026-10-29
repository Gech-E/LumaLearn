import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Actor, CoursePolicy, lockEnrollment } from '../courses/course.policy';
import { updateCourseCompletion } from '../learning/learning.completion';
import { GradeDto, GradingQuery } from './grading.dto';

@Injectable()
export class GradingService {
  constructor(
    private db: PrismaService,
    private policy: CoursePolicy,
  ) {}
  async list(actor: Actor, q: GradingQuery) {
    if (q.courseId) await this.policy.manage(actor, q.courseId, true);
    const courses = await this.db.course.findMany({
      where: {
        organizationId: actor.organizationId,
        ...(q.courseId ? { id: q.courseId } : {}),
        ...(actor.roles.includes('ACADEMIC_ADMIN')
          ? {}
          : actor.roles.includes('INSTRUCTOR')
            ? { assignments: { some: { userId: actor.id } } }
            : { id: '__no_access__' }),
      },
      select: { id: true },
    });
    const where = {
      enrollment: { courseId: { in: courses.map((c) => c.id) } },
      state: { in: ['SUBMITTED', 'REVISION_REQUESTED'] as any[] },
    };
    const [items, total] = await Promise.all([
      this.db.submission.findMany({
        where,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { submittedAt: 'asc' },
        include: {
          activity: { select: { title: true } },
          enrollment: {
            include: {
              user: { select: { id: true, name: true, email: true } },
              course: { select: { title: true } },
            },
          },
          grades: { orderBy: { revision: 'desc' }, take: 1 },
        },
      }),
      this.db.submission.count({ where }),
    ]);
    return {
      items: items.map((s) => ({
        id: s.id,
        activityId: s.activityId,
        activityTitle: s.activity.title,
        courseId: s.enrollment.courseId,
        courseTitle: s.enrollment.course.title,
        learner: s.enrollment.user,
        state: s.state,
        submittedAt: s.submittedAt,
        revision: s.revision,
        latestGrade: s.grades[0] ? this.gradeView(s.grades[0]) : null,
      })),
      total,
      page: q.page,
      limit: q.limit,
    };
  }
  private gradeView(g: any) {
    return {
      id: g.id,
      revision: g.revision,
      submissionRevision: g.submissionRevision,
      criteriaScores: g.criteriaScores,
      score: g.score,
      passed: g.passed,
      feedback: g.feedback,
      revisionRequested: g.revisionRequested,
      releasedAt: g.releasedAt,
      createdAt: g.createdAt,
    };
  }
  async get(actor: Actor, id: string) {
    const s = await this.db.submission.findUnique({
      where: { id },
      include: {
        enrollment: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            course: { select: { title: true } },
          },
        },
        activity: true,
        grades: { orderBy: { revision: 'desc' } },
        receipts: { orderBy: { revision: 'desc' } },
      },
    });
    if (!s) throw new NotFoundException('Submission unavailable');
    await this.policy.manage(actor, s.enrollment.courseId, true);
    if (s.state === 'DRAFT') throw new NotFoundException('Submission is still a private draft');
    return {
      id: s.id,
      activityId: s.activityId,
      activityTitle: s.activity.title,
      courseTitle: s.enrollment.course.title,
      learner: s.enrollment.user,
      text: s.text,
      link: s.link,
      assetIds: s.assetIds,
      rubric: s.frozenRubric,
      state: s.state,
      revision: s.revision,
      receipt: s.receipt,
      submittedAt: s.submittedAt,
      grades: s.grades.map((g) => this.gradeView(g)),
      history: s.receipts.map((r) => ({
        revision: r.revision,
        receipt: r.receipt,
        snapshot: r.snapshot,
        submittedAt: r.createdAt,
      })),
    };
  }
  async grade(actor: Actor, id: string, dto: GradeDto) {
    const s = await this.db.submission.findUnique({
      where: { id },
      include: { enrollment: true, activity: { include: { rubric: true } } },
    });
    if (!s) throw new NotFoundException('Submission unavailable');
    await this.policy.manage(actor, s.enrollment.courseId, true);
    return this.db.$transaction(async (tx) => {
      await lockEnrollment(tx, s.enrollmentId);
      const current = await tx.submission.findUniqueOrThrow({ where: { id } });
      if (current.state !== 'SUBMITTED')
        throw new ConflictException('Only submitted work can be graded');
      const rubric = current.frozenRubric as any[];
      const scoreMap = new Map(dto.criteriaScores.map((c) => [c.criterionId, c.points]));
      if (
        scoreMap.size !== dto.criteriaScores.length ||
        scoreMap.size !== rubric.length ||
        rubric.some((c) => !scoreMap.has(c.id) || scoreMap.get(c.id)! > c.maxPoints)
      )
        throw new BadRequestException('Provide a valid score for every rubric criterion');
      if (!dto.feedback.trim())
        throw new BadRequestException('Provide useful feedback before saving a grade');
      const latest = await tx.grade.findFirst({
        where: { submissionId: id },
        orderBy: { revision: 'desc' },
      });
      const score =
        Math.round(
          (dto.criteriaScores.reduce((n, c) => n + c.points, 0) /
            rubric.reduce((n, c) => n + c.maxPoints, 0)) *
            10000,
        ) / 100;
      const grade = await tx.grade.create({
        data: {
          submissionId: id,
          graderId: actor.id,
          revision: (latest?.revision ?? 0) + 1,
          submissionRevision: current.revision,
          criteriaScores: dto.criteriaScores as any,
          score,
          passed: !dto.revisionRequested && score >= (s.activity.rubric?.passPercent ?? 70),
          feedback: dto.feedback,
          revisionRequested: dto.revisionRequested,
          feedbackHistory: { create: { actorId: actor.id, feedback: dto.feedback } },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          organizationId: actor.organizationId,
          action: 'grade.saved',
          objectId: grade.id,
          detail: { submissionId: id, revision: grade.revision, score },
        },
      });
      return this.gradeView(grade);
    });
  }
  async release(actor: Actor, id: string) {
    const g = await this.db.grade.findUnique({
      where: { id },
      include: { submission: { include: { enrollment: true } } },
    });
    if (!g) throw new NotFoundException('Grade unavailable');
    await this.policy.manage(actor, g.submission.enrollment.courseId, true);
    return this.db.$transaction(async (tx) => {
      await lockEnrollment(tx, g.submission.enrollmentId);
      const grade = await tx.grade.findUniqueOrThrow({ where: { id } });
      if (grade.releasedAt) return this.gradeView(grade);
      const latest = await tx.grade.findFirst({
        where: { submissionId: g.submissionId },
        orderBy: { revision: 'desc' },
      });
      const submission = await tx.submission.findUniqueOrThrow({ where: { id: g.submissionId } });
      if (
        latest?.id !== id ||
        grade.submissionRevision !== submission.revision ||
        submission.state !== 'SUBMITTED'
      )
        throw new ConflictException('Release the latest grade for the current submission');
      const released = await tx.grade.update({ where: { id }, data: { releasedAt: new Date() } });
      if (grade.revisionRequested)
        await tx.submission.update({
          where: { id: g.submissionId },
          data: { state: 'REVISION_REQUESTED' },
        });
      const key = { enrollmentId: g.submission.enrollmentId, activityId: g.submission.activityId };
      await tx.activityCompletion.upsert({
        where: { enrollmentId_activityId: key },
        create: { ...key, state: grade.passed ? 'PASSED' : 'COMPLETED' },
        update: { state: grade.passed ? 'PASSED' : 'COMPLETED' },
      });
      await updateCourseCompletion(
        tx,
        g.submission.enrollmentId,
        g.submission.enrollment.courseVersionId,
      );
      await tx.notification.create({
        data: {
          eventId: `grade:${id}`,
          userId: g.submission.enrollment.userId,
          organizationId: actor.organizationId,
          title: grade.revisionRequested
            ? 'Your instructor invited a revision'
            : 'Your feedback is ready',
          body: 'Open your assignment to read private feedback and your next steps.',
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          organizationId: actor.organizationId,
          action: 'grade.released',
          objectId: id,
          detail: { submissionId: g.submissionId, revision: grade.revision },
        },
      });
      return this.gradeView(released);
    });
  }
}
