import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.decorators';
import { PrismaService } from '../database/prisma.service';
import { PaginationDto } from '../http/pagination.dto';

/** Explicit field selections keep authentication secrets and assessment keys out of exports. */
@Injectable()
export class PrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  async exportOwnData(user: AuthUser, query: PaginationDto) {
    const pagination = { skip: (query.page - 1) * query.limit, take: query.limit };
    const enrollmentScope = { userId: user.id, course: { organizationId: user.organizationId } };
    const submissionScope = { enrollment: enrollmentScope };
    const gradeScope = { submission: submissionScope, releasedAt: { not: null } };
    const supportScope = { userId: user.id, organizationId: user.organizationId };
    const page = <T>(items: T[], total: number) => ({
      items,
      total,
      page: query.page,
      limit: query.limit,
    });

    return this.prisma.$transaction(
      async (tx) => {
        const profile = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: {
            id: true,
            name: true,
            email: true,
            timezone: true,
            locale: true,
            reminders: true,
            quietStart: true,
            quietEnd: true,
            verifiedAt: true,
            createdAt: true,
          },
        });
        const membership = await tx.membership.findFirst({
          where: {
            id: user.membershipId,
            userId: user.id,
            organizationId: user.organizationId,
            state: 'ACTIVE',
          },
          select: {
            id: true,
            organizationId: true,
            state: true,
            organization: { select: { name: true } },
            roles: { select: { role: true } },
          },
        });
        if (!membership) throw new NotFoundException('Membership not found.');
        const [
          enrollments,
          enrollmentTotal,
          progress,
          progressTotal,
          receipts,
          receiptTotal,
          grades,
          gradeTotal,
          support,
          supportTotal,
        ] = await Promise.all([
          tx.enrollment.findMany({
            where: enrollmentScope,
            ...pagination,
            orderBy: { id: 'asc' },
            select: {
              id: true,
              courseId: true,
              courseVersionId: true,
              state: true,
              source: true,
              deadlineExtension: true,
              extraAttempts: true,
              extraTimeMinutes: true,
              createdAt: true,
            },
          }),
          tx.enrollment.count({ where: enrollmentScope }),
          tx.progressEvent.findMany({
            where: { enrollment: enrollmentScope },
            ...pagination,
            orderBy: { id: 'asc' },
            select: {
              id: true,
              enrollmentId: true,
              activityId: true,
              state: true,
              clientAt: true,
              createdAt: true,
            },
          }),
          tx.progressEvent.count({ where: { enrollment: enrollmentScope } }),
          tx.submissionReceipt.findMany({
            where: { submission: submissionScope },
            ...pagination,
            orderBy: { id: 'asc' },
            select: {
              id: true,
              submissionId: true,
              receipt: true,
              revision: true,
              createdAt: true,
              snapshot: true,
            },
          }),
          tx.submissionReceipt.count({ where: { submission: submissionScope } }),
          tx.grade.findMany({
            where: gradeScope,
            ...pagination,
            orderBy: { id: 'asc' },
            select: {
              id: true,
              submissionId: true,
              revision: true,
              submissionRevision: true,
              criteriaScores: true,
              score: true,
              passed: true,
              feedback: true,
              revisionRequested: true,
              releasedAt: true,
            },
          }),
          tx.grade.count({ where: gradeScope }),
          tx.supportRequest.findMany({
            where: supportScope,
            ...pagination,
            orderBy: { id: 'asc' },
            select: {
              id: true,
              kind: true,
              subject: true,
              message: true,
              status: true,
              response: true,
              createdAt: true,
            },
          }),
          tx.supportRequest.count({ where: supportScope }),
        ]);
        await tx.auditEvent.create({
          data: {
            actorId: user.id,
            organizationId: user.organizationId,
            action: 'privacy.exported',
            objectId: user.id,
            detail: { page: query.page, limit: query.limit },
          },
        });
        const { verifiedAt, ...safeProfile } = profile;
        return {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          scope:
            'Current organization. Includes your profile, enrollments, progress, submission receipts, released grades, and support requests. Request a reviewed export for additional records.',
          profile: { ...safeProfile, verified: !!verifiedAt, mfaEnabled: user.mfaEnabled },
          membership: {
            id: membership.id,
            organizationId: membership.organizationId,
            organizationName: membership.organization.name,
            state: membership.state,
            roles: membership.roles.map(({ role }) => role),
          },
          enrollments: page(enrollments, enrollmentTotal),
          progress: page(progress, progressTotal),
          receipts: page(
            receipts.map(({ snapshot, ...receipt }) => {
              const content =
                snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
                  ? snapshot
                  : {};
              return {
                ...receipt,
                content: {
                  text: typeof content.text === 'string' ? content.text : '',
                  link: typeof content.link === 'string' ? content.link : null,
                  assetIds: Array.isArray(content.assetIds)
                    ? content.assetIds.filter((id): id is string => typeof id === 'string')
                    : [],
                },
              };
            }),
            receiptTotal,
          ),
          grades: page(grades, gradeTotal),
          support: page(support, supportTotal),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
