import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { Actor, CoursePolicy } from '../courses/course.policy';
import {
  AccommodationDto,
  AssignDto,
  EnrollDto,
  InviteDto,
  BulkAssignDto,
  BulkEnrollmentPreviewItem,
  BulkEnrollmentPreview,
} from './enrollments.dto';
import { PaginationDto } from '../http/pagination.dto';

@Injectable()
export class EnrollmentsService {
  constructor(
    private db: PrismaService,
    private policy: CoursePolicy,
  ) {}
  async enroll(actor: Actor, dto: EnrollDto, userId = actor.id, source = 'SELF') {
    const course = await this.db.course.findFirst({
      where: { id: dto.courseId, organizationId: actor.organizationId, state: 'PUBLISHED' },
    });
    if (!course?.currentVersionId) throw new NotFoundException('Course unavailable');
    const membership = await this.db.membership.findFirst({
      where: { userId, organizationId: actor.organizationId, state: 'ACTIVE' },
    });
    if (!membership) throw new BadRequestException('An active organization membership is required');
    return this.db.$transaction(async (tx) => {
      // Serialize enrollment creation with other requests and publication changes.
      await tx.$queryRaw`SELECT id FROM "Course" WHERE id = ${course.id} FOR UPDATE`;
      const existing = await tx.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId: course.id } },
      });
      if (existing) {
        if (existing.state === 'WITHDRAWN')
          throw new ConflictException('Contact your administrator to restore enrollment');
        return { id: existing.id, courseId: course.id, state: existing.state };
      }
      const published = await tx.course.findUniqueOrThrow({ where: { id: course.id } });
      if (published.state !== 'PUBLISHED' || !published.currentVersionId)
        throw new NotFoundException('Course unavailable');
      // Invitation acceptance and revocation share the course lock, so a code
      // revoked by another request cannot be consumed from a stale read.
      const invitation =
        source === 'SELF' && dto.invitationCode
          ? await tx.enrollmentInvitation.findFirst({
              where: {
                courseId: course.id,
                codeHash: createHash('sha256').update(dto.invitationCode).digest('hex'),
                email: actor.email.toLowerCase(),
                expiresAt: { gt: new Date() },
                acceptedAt: null,
                revokedAt: null,
              },
            })
          : null;
      if (source === 'SELF' && !(published.isPublic && published.freeEnrollment) && !invitation)
        throw new NotFoundException('Course unavailable for enrollment');
      const enrollment = await this.createEnrollment(tx, actor, {
        userId,
        courseId: course.id,
        versionId: published.currentVersionId,
        title: published.title,
        source: invitation ? 'INVITATION' : source,
      });
      if (invitation)
        await tx.enrollmentInvitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });
      return { id: enrollment.id, courseId: course.id, state: enrollment.state };
    });
  }
  private async createEnrollment(
    tx: Prisma.TransactionClient,
    actor: Actor,
    input: { userId: string; courseId: string; versionId: string; title: string; source: string },
  ) {
    const enrollment = await tx.enrollment.create({
      data: {
        userId: input.userId,
        courseId: input.courseId,
        courseVersionId: input.versionId,
        source: input.source,
      },
    });
    await tx.notification.upsert({
      where: { eventId: `enrollment:${enrollment.id}` },
      create: {
        eventId: `enrollment:${enrollment.id}`,
        userId: input.userId,
        organizationId: actor.organizationId,
        title: 'You are enrolled',
        body: `Your place in ${input.title} is ready. Start when you are ready.`,
      },
      update: {},
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        organizationId: actor.organizationId,
        action: 'enrollment.created',
        objectId: enrollment.id,
      },
    });
    return { id: enrollment.id, courseId: input.courseId, state: enrollment.state };
  }
  private async bulkState(
    tx: Prisma.TransactionClient,
    actor: Actor,
    courseId: string,
    userIds: string[],
  ) {
    const course = await tx.course.findFirst({
      where: { id: courseId, organizationId: actor.organizationId, state: 'PUBLISHED' },
    });
    if (!course?.currentVersionId)
      throw new BadRequestException('Publish the course before assigning learners');
    const members = await tx.membership.findMany({
      where: { organizationId: actor.organizationId, userId: { in: userIds }, state: 'ACTIVE' },
      select: { userId: true, user: { select: { name: true, email: true } } },
    });
    const existing = await tx.enrollment.findMany({
      where: { courseId, userId: { in: userIds } },
      select: { id: true, userId: true, state: true },
    });
    const memberByUser = new Map(members.map((member) => [member.userId, member]));
    const enrollmentByUser = new Map(existing.map((enrollment) => [enrollment.userId, enrollment]));
    const items: BulkEnrollmentPreviewItem[] = userIds.map((userId) => {
      const member = memberByUser.get(userId);
      const enrollment = enrollmentByUser.get(userId);
      if (!member || enrollment?.state === 'WITHDRAWN') return { userId, status: 'UNAVAILABLE' };
      return {
        userId,
        name: member.user.name,
        email: member.user.email,
        status: enrollment ? 'ENROLLED' : 'ELIGIBLE',
      };
    });
    const unavailable = items.filter((item) => item.status === 'UNAVAILABLE').length;
    const preview: BulkEnrollmentPreview = {
      courseId,
      total: items.length,
      eligible: items.filter((item) => item.status === 'ELIGIBLE').length,
      alreadyEnrolled: items.filter((item) => item.status === 'ENROLLED').length,
      unavailable,
      canAssign: unavailable === 0,
      items,
    };
    return { course, enrollmentByUser, preview };
  }
  async previewBulk(actor: Actor, courseId: string, dto: BulkAssignDto) {
    await this.policy.manage(actor, courseId);
    return this.db.$transaction(
      async (tx) => (await this.bulkState(tx, actor, courseId, dto.userIds)).preview,
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async assignBulk(actor: Actor, courseId: string, dto: BulkAssignDto) {
    await this.policy.manage(actor, courseId);
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Course" WHERE id = ${courseId} FOR UPDATE`;
        // Membership updates serialize with the final eligibility check. Fixed lock order
        // prevents concurrent bulk assignments from locking learners in opposite orders.
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "Membership" WHERE "organizationId" = ${actor.organizationId} AND "userId" IN (${Prisma.join(dto.userIds)}) ORDER BY id FOR UPDATE`,
        );
        const { course, enrollmentByUser, preview } = await this.bulkState(
          tx,
          actor,
          courseId,
          dto.userIds,
        );
        if (!preview.canAssign)
          throw new ConflictException({
            code: 'BULK_ENROLLMENT_CONFLICT',
            message:
              'Some selected learners are unavailable. Review the preview before assigning again.',
          });
        const items = [];
        let created = 0;
        for (const userId of dto.userIds) {
          const enrollment = enrollmentByUser.get(userId);
          if (enrollment) items.push({ id: enrollment.id, courseId, state: enrollment.state });
          else {
            items.push(
              await this.createEnrollment(tx, actor, {
                userId,
                courseId,
                versionId: course.currentVersionId!,
                title: course.title,
                source: 'ASSIGNED',
              }),
            );
            created++;
          }
        }
        return { courseId, created, unchanged: items.length - created, items };
      },
      { timeout: 30000 },
    );
  }
  async list(actor: Actor, courseId: string, pagination: PaginationDto) {
    await this.policy.manage(actor, courseId);
    const [items, total] = await this.db.$transaction(
      [
        this.db.enrollment.findMany({
          where: { courseId },
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        this.db.enrollment.count({ where: { courseId } }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      total,
      page: pagination.page,
      limit: pagination.limit,
      items: items.map((e) => ({
        id: e.id,
        user: e.user,
        state: e.state,
        createdAt: e.createdAt,
        deadlineExtension: e.deadlineExtension,
        extraAttempts: e.extraAttempts,
        extraTimeMinutes: e.extraTimeMinutes,
      })),
    };
  }
  async assign(actor: Actor, courseId: string, dto: AssignDto) {
    await this.policy.manage(actor, courseId);
    return this.enroll(actor, { courseId }, dto.userId, 'ASSIGNED');
  }
  async invite(actor: Actor, courseId: string, dto: InviteDto) {
    const course = await this.policy.manage(actor, courseId);
    if (course.state !== 'PUBLISHED')
      throw new BadRequestException('Publish the course before inviting learners');
    const code = randomBytes(24).toString('base64url');
    const url = new URL('/join', (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0]);
    url.searchParams.set('courseId', courseId);
    url.searchParams.set('invitationCode', code);
    return this.db.$transaction(async (tx) => {
      const invitation = await tx.enrollmentInvitation.create({
        data: {
          courseId,
          email: dto.email.trim().toLowerCase(),
          codeHash: createHash('sha256').update(code).digest('hex'),
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
        select: { id: true, email: true, expiresAt: true, acceptedAt: true, revokedAt: true },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'EMAIL',
          payload: {
            organizationId: actor.organizationId,
            to: invitation.email,
            subject: `Invitation to ${course.title}`,
            text: `You are invited to ${course.title}. Sign in with this email address and open ${url.toString()}\nThis invitation expires in 7 days.`,
          },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          organizationId: actor.organizationId,
          action: 'enrollment.invited',
          objectId: invitation.id,
        },
      });
      return invitation;
    });
  }
  async invitations(actor: Actor, courseId: string, pagination: PaginationDto) {
    await this.policy.manage(actor, courseId);
    const [items, total] = await this.db.$transaction(
      [
        this.db.enrollmentInvitation.findMany({
          where: { courseId },
          select: { id: true, email: true, expiresAt: true, acceptedAt: true, revokedAt: true },
          orderBy: [{ expiresAt: 'desc' }, { id: 'desc' }],
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
        }),
        this.db.enrollmentInvitation.count({ where: { courseId } }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page: pagination.page, limit: pagination.limit };
  }
  async revokeInvitation(actor: Actor, id: string) {
    const invitation = await this.db.enrollmentInvitation.findUnique({ where: { id } });
    if (!invitation) throw new NotFoundException('Invitation unavailable');
    await this.policy.manage(actor, invitation.courseId);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Course" WHERE id = ${invitation.courseId} FOR UPDATE`;
      const current = await tx.enrollmentInvitation.findUniqueOrThrow({ where: { id } });
      if (current.acceptedAt)
        throw new ConflictException(
          'This invitation was already accepted. Manage the learner enrollment instead.',
        );
      if (!current.revokedAt) {
        await tx.enrollmentInvitation.update({ where: { id }, data: { revokedAt: new Date() } });
        await tx.auditEvent.create({
          data: {
            actorId: actor.id,
            organizationId: actor.organizationId,
            action: 'enrollment.invitation.revoked',
            objectId: id,
          },
        });
      }
      return { id, updated: true };
    });
  }
  async accommodate(actor: Actor, id: string, dto: AccommodationDto) {
    const e = await this.db.enrollment.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Enrollment unavailable');
    await this.policy.manage(actor, e.courseId, true);
    return this.db.$transaction(async (tx) => {
      await tx.enrollment.update({
        where: { id },
        data: {
          extraAttempts: dto.extraAttempts,
          extraTimeMinutes: dto.extraTimeMinutes,
          deadlineExtension: dto.deadlineExtension ? new Date(dto.deadlineExtension) : undefined,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          organizationId: actor.organizationId,
          action: 'enrollment.accommodation',
          objectId: id,
          detail: dto as any,
        },
      });
      return { id, updated: true };
    });
  }
}
