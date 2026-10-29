import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { Actor, CoursePolicy, lockEnrollment } from '../courses/course.policy';
import { effectiveDeadline } from '../assessments/assessment.rules';
import { DraftDto, SubmitDto } from './submissions.dto';

@Injectable()
export class SubmissionsService {
  constructor(
    private db: PrismaService,
    private policy: CoursePolicy,
  ) {}
  async get(actor: Actor, activityId: string) {
    const { activity, enrollment } = await this.policy.activity(actor, activityId);
    if (activity.kind !== 'ASSIGNMENT' || !activity.rubric)
      throw new NotFoundException('Assignment unavailable');
    const s = await this.db.submission.findUnique({
      where: { enrollmentId_activityId: { enrollmentId: enrollment.id, activityId } },
      include: { grades: { where: { releasedAt: { not: null } }, orderBy: { revision: 'desc' } } },
    });
    return s
      ? this.present(s)
      : {
          id: null,
          state: 'DRAFT',
          text: '',
          link: null,
          assetIds: [],
          rubric: activity.rubric.criteria,
          receipt: null,
          revision: 1,
          grades: [],
        };
  }
  private present(s: any) {
    return {
      id: s.id,
      state: s.state,
      text: s.text,
      link: s.link,
      assetIds: s.assetIds,
      rubric: s.frozenRubric,
      receipt: s.receipt,
      revision: s.revision,
      submittedAt: s.submittedAt,
      updatedAt: s.updatedAt,
      grades: (s.grades ?? []).map((g: any) => ({
        id: g.id,
        revision: g.revision,
        submissionRevision: g.submissionRevision,
        criteriaScores: g.criteriaScores,
        score: g.score,
        passed: g.passed,
        feedback: g.feedback,
        revisionRequested: g.revisionRequested,
        releasedAt: g.releasedAt,
      })),
    };
  }
  async draft(actor: Actor, activityId: string, dto: DraftDto) {
    const { activity, enrollment } = await this.policy.activity(actor, activityId);
    if (activity.kind !== 'ASSIGNMENT' || !activity.rubric)
      throw new NotFoundException('Assignment unavailable');
    if (dto.assetIds.length) {
      const count = await this.db.asset.count({
        where: {
          id: { in: dto.assetIds },
          userId: actor.id,
          organizationId: actor.organizationId,
          status: { in: ['UPLOADING', 'QUARANTINED', 'CLEAN'] },
        },
      });
      if (count !== dto.assetIds.length)
        throw new BadRequestException('One or more attached files are unavailable');
    }
    return this.db.$transaction(async (tx) => {
      await lockEnrollment(tx, enrollment.id);
      const current = await tx.submission.findUnique({
        where: { enrollmentId_activityId: { enrollmentId: enrollment.id, activityId } },
      });
      if (current?.state === 'SUBMITTED')
        throw new ConflictException(
          'This work is submitted. Your instructor must request a revision before you can edit it.',
        );
      const s = await tx.submission.upsert({
        where: { enrollmentId_activityId: { enrollmentId: enrollment.id, activityId } },
        create: {
          enrollmentId: enrollment.id,
          activityId,
          text: dto.text,
          link: dto.link ?? null,
          assetIds: dto.assetIds,
          frozenRubric: activity.rubric!.criteria as any,
        },
        update: {
          text: dto.text,
          link: dto.link ?? null,
          assetIds: dto.assetIds,
          state: 'DRAFT',
          ...(current?.state === 'REVISION_REQUESTED'
            ? { revision: current.revision + 1, requestId: null, receipt: null, submittedAt: null }
            : {}),
        },
      });
      return this.present(s);
    });
  }
  async submit(actor: Actor, activityId: string, dto: SubmitDto) {
    const { activity, enrollment } = await this.policy.activity(actor, activityId);
    if (!activity.rubric) throw new NotFoundException('Assignment unavailable');
    return this.db.$transaction(async (tx) => {
      await lockEnrollment(tx, enrollment.id);
      const key = { enrollmentId: enrollment.id, activityId };
      const current = await tx.submission.findUnique({ where: { enrollmentId_activityId: key } });
      if (!current) throw new BadRequestException('Save your draft before submitting');
      const oldReceipt = await tx.submissionReceipt.findUnique({
        where: { requestId: dto.requestId },
      });
      if (oldReceipt) {
        if (oldReceipt.submissionId !== current.id)
          throw new ConflictException('Submission request ID already used');
        return {
          id: current.id,
          state: 'SUBMITTED',
          receipt: oldReceipt.receipt,
          revision: oldReceipt.revision,
          submittedAt: oldReceipt.createdAt,
        };
      }
      if (current.state === 'SUBMITTED')
        return {
          id: current.id,
          state: current.state,
          receipt: current.receipt,
          revision: current.revision,
          submittedAt: current.submittedAt,
        };
      if (current.state === 'REVISION_REQUESTED')
        throw new BadRequestException('Save a revised draft before submitting');
      const deadline = effectiveDeadline(activity.rubric!.deadline, enrollment.deadlineExtension);
      if (deadline && deadline < new Date())
        throw new ConflictException(
          'The assignment deadline has passed. Your draft is still saved.',
        );
      if (!current.text.trim() && !current.link && !current.assetIds.length)
        throw new BadRequestException('Add your work before submitting');
      if (current.assetIds.length) {
        const clean = await tx.asset.count({
          where: {
            id: { in: current.assetIds },
            userId: actor.id,
            organizationId: actor.organizationId,
            status: 'CLEAN',
          },
        });
        if (clean !== current.assetIds.length)
          throw new ConflictException('All files must finish security scanning before submission');
      }
      const receipt = `PW-${randomUUID()}`;
      const submittedAt = new Date();
      await tx.submissionReceipt.create({
        data: {
          submissionId: current.id,
          requestId: dto.requestId,
          receipt,
          revision: current.revision,
          snapshot: {
            text: current.text,
            link: current.link,
            assetIds: current.assetIds,
            rubric: current.frozenRubric,
          },
        },
      });
      await tx.submission.update({
        where: { id: current.id },
        data: { state: 'SUBMITTED', receipt, requestId: dto.requestId, submittedAt },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          organizationId: actor.organizationId,
          action: 'assignment.submitted',
          objectId: current.id,
          detail: { receipt, revision: current.revision },
        },
      });
      return {
        id: current.id,
        state: 'SUBMITTED',
        receipt,
        revision: current.revision,
        submittedAt,
      };
    });
  }
}
