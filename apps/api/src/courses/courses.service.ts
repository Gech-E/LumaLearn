import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { Actor, courseCard, CoursePolicy, outlineInclude, versionOutline } from './course.policy';
import { CatalogQuery, CreateCourseDto, OutlineDto } from './courses.dto';

@Injectable()
export class CoursesService {
  constructor(
    private db: PrismaService,
    private policy: CoursePolicy,
  ) {}
  async catalog(q: CatalogQuery) {
    const where: Prisma.CourseWhereInput = {
      state: 'PUBLISHED',
      isPublic: true,
      ...(q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: 'insensitive' } },
              { summary: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(q.subject ? { subject: q.subject } : {}),
      ...(q.level ? { level: q.level } : {}),
      ...(q.language ? { language: q.language } : {}),
      ...(q.format ? { format: q.format } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.course.findMany({
        where,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { title: 'asc' },
      }),
      this.db.course.count({ where }),
    ]);
    return { items: items.map(courseCard), total, page: q.page, limit: q.limit };
  }
  async detail(id: string) {
    const course = await this.db.course.findFirst({
      where: { OR: [{ id }, { slug: id }], state: 'PUBLISHED', isPublic: true },
    });
    if (!course?.currentVersionId) throw new NotFoundException('Course unavailable');
    const version = await this.db.courseVersion.findUniqueOrThrow({
      where: { id: course.currentVersionId },
      include: outlineInclude,
    });
    return {
      ...courseCard(course),
      freeEnrollment: course.freeEnrollment,
      version: versionOutline(version),
    };
  }
  async assigned(actor: Actor) {
    const where: Prisma.CourseWhereInput = {
      organizationId: actor.organizationId,
      ...(actor.roles.includes('ADMIN') ? {} : { assignments: { some: { userId: actor.id } } }),
    };
    if (!actor.roles.some((r) => ['INSTRUCTOR', 'ADMIN'].includes(r)))
      throw new ForbiddenException('Instructor permission required');
    const items = await this.db.course.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { _count: { select: { enrollments: true } } },
    });
    return {
      items: items.map((c) => ({
        ...courseCard(c),
        state: c.state,
        enrollmentCount: c._count.enrollments,
      })),
    };
  }
  async create(actor: Actor, dto: CreateCourseDto) {
    if (!actor.roles.some((r) => ['INSTRUCTOR', 'ADMIN'].includes(r)))
      throw new ForbiddenException('Instructor permission required');
    const slug =
      dto.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      randomUUID().slice(0, 8);
    return this.db.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          ...dto,
          slug,
          organizationId: actor.organizationId,
          instructorName: actor.name,
          assignments: { create: { userId: actor.id } },
          versions: {
            create: {
              number: 1,
              title: dto.title,
              description: dto.summary,
              outcomes: [],
              prerequisites: [],
            },
          },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          organizationId: actor.organizationId,
          action: 'course.created',
          objectId: course.id,
        },
      });
      return { ...courseCard(course), state: course.state };
    });
  }
  async editor(actor: Actor, id: string) {
    const course = await this.policy.manage(actor, id);
    const versions = await this.db.courseVersion.findMany({
      where: { courseId: id },
      orderBy: { number: 'desc' },
      include: outlineInclude,
    });
    const version = versions[0];
    return {
      course: { ...courseCard(course), state: course.state },
      version: version ? this.editableVersion(version) : null,
      versions: versions.map((v) => ({
        id: v.id,
        number: v.number,
        revision: v.revision,
        state: v.state,
        publishedAt: v.publishedAt,
      })),
    };
  }
  private editableVersion(v: any) {
    return {
      ...versionOutline(v),
      state: v.state,
      revision: v.revision,
      modules: v.modules.map((m: any) => ({
        id: m.id,
        title: m.title,
        activities: m.activities.map((a: any) => ({
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
          accessibility: a.accessibility,
          rights: a.rights,
          offlineAllowed: a.offlineAllowed,
          prerequisiteIds: a.prerequisiteIds,
          assessment: a.assessment
            ? {
                maxAttempts: a.assessment.maxAttempts,
                passPercent: a.assessment.passPercent,
                feedbackRelease: a.assessment.feedbackRelease,
                deadline: a.assessment.deadline,
                timeLimitMinutes: a.assessment.timeLimitMinutes,
                questions: a.assessment.questions.map((q: any) => ({
                  kind: q.kind,
                  prompt: q.prompt,
                  options: q.options,
                  answer: q.answer,
                  explanation: q.explanation,
                  points: q.points,
                })),
              }
            : undefined,
          rubric: a.rubric
            ? {
                criteria: a.rubric.criteria,
                passPercent: a.rubric.passPercent,
                deadline: a.rubric.deadline,
              }
            : undefined,
        })),
      })),
    };
  }
  async save(actor: Actor, id: string, dto: OutlineDto) {
    await this.policy.manage(actor, id);
    this.validateGraph(dto);
    await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${id} FOR UPDATE`;
        const last = await tx.courseVersion.findFirst({
          where: { courseId: id },
          orderBy: { number: 'desc' },
        });
        if (
          (last?.id ?? null) !== dto.expectedVersionId ||
          (last?.revision ?? 0) !== dto.expectedRevision
        )
          throw new ConflictException({
            code: 'OUTLINE_CONFLICT',
            message:
              'This course changed after you opened it. Keep your draft and load the latest version before saving again.',
          });
        let versionId: string;
        if (last && ['DRAFT', 'REVIEW'].includes(last.state)) {
          const activities = await tx.activityVersion.findMany({
            where: { module: { courseVersionId: last.id } },
            select: { id: true },
          });
          const ids = activities.map((a) => a.id);
          await tx.questionVersion.deleteMany({
            where: { assessment: { activityId: { in: ids } } },
          });
          await tx.assessmentVersion.deleteMany({ where: { activityId: { in: ids } } });
          await tx.rubricVersion.deleteMany({ where: { activityId: { in: ids } } });
          await tx.activityVersion.deleteMany({ where: { id: { in: ids } } });
          await tx.module.deleteMany({ where: { courseVersionId: last.id } });
          const version = await tx.courseVersion.update({
            where: { id: last.id },
            data: {
              title: dto.title,
              description: dto.description,
              outcomes: dto.outcomes,
              prerequisites: dto.prerequisites,
              completionRule: dto.completionRule,
              state: 'DRAFT',
              revision: { increment: 1 },
            },
          });
          versionId = version.id;
        } else {
          const version = await tx.courseVersion.create({
            data: {
              courseId: id,
              number: (last?.number ?? 0) + 1,
              title: dto.title,
              description: dto.description,
              outcomes: dto.outcomes,
              prerequisites: dto.prerequisites,
              completionRule: dto.completionRule,
            },
          });
          versionId = version.id;
        }
        const mapping = new Map<string, string>();
        dto.modules
          .flatMap((m) => m.activities)
          .forEach((a) => {
            if (a.id) mapping.set(a.id, randomUUID());
          });
        for (const [position, m] of dto.modules.entries()) {
          const module = await tx.module.create({
            data: { courseVersionId: versionId, title: m.title, position },
          });
          for (const [activityPosition, a] of m.activities.entries()) {
            const activity = await tx.activityVersion.create({
              data: {
                id: a.id ? mapping.get(a.id) : undefined,
                moduleId: module.id,
                title: a.title,
                kind: a.kind,
                position: activityPosition,
                objective: a.objective,
                body: a.body,
                example: a.example,
                reflection: a.reflection,
                estimatedMinutes: a.estimatedMinutes,
                videoUrl: a.videoUrl || null,
                captionsUrl: a.captionsUrl || null,
                transcript: a.transcript || null,
                resources: a.resources as any,
                accessibility: a.accessibility as any,
                rights: a.rights,
                offlineAllowed: a.offlineAllowed,
                prerequisiteIds: a.prerequisiteIds.map((p) => mapping.get(p)!),
              },
            });
            if (a.assessment && a.kind === 'PRACTICE')
              await tx.assessmentVersion.create({
                data: {
                  activityId: activity.id,
                  maxAttempts: a.assessment.maxAttempts,
                  passPercent: a.assessment.passPercent,
                  feedbackRelease: a.assessment.feedbackRelease,
                  deadline: a.assessment.deadline ? new Date(a.assessment.deadline) : null,
                  timeLimitMinutes: a.assessment.timeLimitMinutes,
                  questions: {
                    create: a.assessment.questions.map((q, position) => ({ ...q, position })),
                  },
                },
              });
            if (a.rubric && a.kind === 'ASSIGNMENT')
              await tx.rubricVersion.create({
                data: {
                  activityId: activity.id,
                  criteria: a.rubric.criteria as any,
                  passPercent: a.rubric.passPercent,
                  deadline: a.rubric.deadline ? new Date(a.rubric.deadline) : null,
                },
              });
          }
        }
      },
      { timeout: 30000 },
    );
    return this.editor(actor, id);
  }
  private validateGraph(dto: OutlineDto) {
    const list = dto.modules.flatMap((m) => m.activities);
    const ids = list.filter((a) => a.id).map((a) => a.id!);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Activity IDs must be unique');
    const graph = new Map(list.filter((a) => a.id).map((a) => [a.id!, a.prerequisiteIds]));
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) throw new BadRequestException('Prerequisites cannot contain cycles');
      if (done.has(id)) return;
      if (!graph.has(id))
        throw new BadRequestException('Prerequisite must belong to this course version');
      visiting.add(id);
      for (const p of graph.get(id)!) visit(p);
      visiting.delete(id);
      done.add(id);
    };
    for (const a of list) {
      for (const p of a.prerequisiteIds) visit(p);
      if (a.id) visit(a.id);
    }
  }
  async review(actor: Actor, id: string) {
    await this.policy.manage(actor, id);
    const version = await this.db.courseVersion.findFirst({
      where: { courseId: id },
      orderBy: { number: 'desc' },
      include: outlineInclude,
    });
    if (!version) throw new NotFoundException('Version unavailable');
    const issues: string[] = [];
    if (!version.title.trim() || !version.outcomes.length || !version.description.trim())
      issues.push('Add a title, description and learning outcomes.');
    if (!version.modules.length || version.modules.some((m) => !m.activities.length))
      issues.push('Every course module needs at least one activity.');
    for (const a of version.modules.flatMap((m) => m.activities)) {
      const label = a.title || 'Untitled activity';
      const access = a.accessibility as any;
      if (!a.objective.trim() || !a.body.trim())
        issues.push(`${label}: add an objective and readable content.`);
      if (!a.rights.trim()) issues.push(`${label}: record content rights.`);
      if (!access.imagesHaveAlt || !access.resourcesReviewed || !access.headingsReviewed)
        issues.push(`${label}: complete accessibility review.`);
      if (a.videoUrl && (!a.captionsUrl || !a.transcript))
        issues.push(`${label}: video needs captions and a transcript.`);
      if ((a.resources as any[]).some((r) => !r.accessible))
        issues.push(`${label}: review resource accessibility.`);
      if (a.kind === 'PRACTICE') {
        const ass = a.assessment;
        if (!ass?.questions.length) issues.push(`${label}: add assessment questions.`);
        if (ass?.feedbackRelease === 'AFTER_DEADLINE' && !ass.deadline)
          issues.push(`${label}: delayed feedback requires a deadline.`);
        for (const q of ass?.questions ?? []) {
          const answers = q.answer as string[];
          const opts = q.options as string[];
          if (
            !answers.length ||
            !q.prompt.trim() ||
            !q.explanation.trim() ||
            (q.kind === 'SINGLE' && answers.length !== 1) ||
            (q.kind !== 'SHORT_TEXT' &&
              (opts.length < 2 || answers.some((x) => !opts.includes(x)))) ||
            new Set(opts).size !== opts.length
          )
            issues.push(`${label}: question configuration is incomplete.`);
        }
      }
      if (a.kind === 'ASSIGNMENT') {
        const criteria = a.rubric?.criteria as any[] | undefined;
        if (!criteria?.length || new Set(criteria.map((c) => c.id)).size !== criteria.length)
          issues.push(`${label}: add unique rubric criteria.`);
      }
    }
    if (!version.completionRule.trim()) issues.push('Describe completion rules.');
    return {
      versionId: version.id,
      state: version.state,
      canPublish: issues.length === 0,
      issues,
      completionPreview:
        'Lessons require completion. Practices and assignments require a passing score. All required activities must be satisfied.',
    };
  }
  async publish(actor: Actor, id: string) {
    await this.policy.manage(actor, id);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${id} FOR UPDATE`;
      const check = await this.review(actor, id);
      if (!check.canPublish)
        throw new BadRequestException({
          message: 'Publication review failed',
          issues: check.issues,
        });
      const version = await tx.courseVersion.findUniqueOrThrow({
        where: { id: check.versionId },
        include: outlineInclude,
      });
      if (!['DRAFT', 'REVIEW'].includes(version.state))
        throw new ConflictException('This version is already published');
      const modified = await tx.courseVersion.updateMany({
        where: { id: version.id, state: { in: ['DRAFT', 'REVIEW'] } },
        data: { state: 'PUBLISHED', publishedAt: new Date() },
      });
      if (!modified.count) throw new ConflictException('Version changed; review it again');
      await tx.course.update({
        where: { id },
        data: {
          currentVersionId: version.id,
          state: 'PUBLISHED',
          title: version.title,
          effortMinutes: version.modules
            .flatMap((m) => m.activities)
            .reduce((s, a) => s + a.estimatedMinutes, 0),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          organizationId: actor.organizationId,
          action: 'course.published',
          objectId: id,
          detail: { versionId: version.id, number: version.number },
        },
      });
      return { id, versionId: version.id, state: 'PUBLISHED' };
    });
  }
  async state(actor: Actor, id: string, state: 'REVIEW' | 'ARCHIVED') {
    await this.policy.manage(actor, id);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Course" WHERE id=${id} FOR UPDATE`;
      if (state === 'REVIEW') {
        const version = await tx.courseVersion.findFirst({
          where: { courseId: id, state: 'DRAFT' },
          orderBy: { number: 'desc' },
        });
        if (!version) throw new ConflictException('Save a draft first');
        await tx.courseVersion.update({ where: { id: version.id }, data: { state: 'REVIEW' } });
      } else await tx.course.update({ where: { id }, data: { state } });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          organizationId: actor.organizationId,
          action: `course.${state.toLowerCase()}`,
          objectId: id,
        },
      });
      return { id, state };
    });
  }
}
