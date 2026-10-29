import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Actor, CoursePolicy, lockEnrollment } from '../courses/course.policy';
import { updateCourseCompletion } from '../learning/learning.completion';
import { AttemptSubmitDto } from './assessments.dto';
import { effectiveDeadline, scoreAnswer } from './assessment.rules';

@Injectable()
export class AssessmentsService {
  constructor(
    private db: PrismaService,
    private policy: CoursePolicy,
  ) {}
  async start(actor: Actor, activityId: string) {
    const { activity, enrollment } = await this.policy.activity(actor, activityId);
    const assessment = activity.assessment;
    if (!assessment || !assessment.questions.length)
      throw new NotFoundException('Practice unavailable');
    const deadline = effectiveDeadline(assessment.deadline, enrollment.deadlineExtension);
    if (deadline && deadline <= new Date())
      throw new ConflictException('The practice deadline has passed');
    return this.db.$transaction(async (tx) => {
      await lockEnrollment(tx, enrollment.id);
      const started = await tx.attempt.findFirst({
        where: { enrollmentId: enrollment.id, assessmentId: assessment.id, state: 'STARTED' },
      });
      if (started && (!started.expiresAt || started.expiresAt > new Date()))
        return this.present(started, assessment, []);
      if (started)
        await tx.attempt.update({
          where: { id: started.id },
          data: { state: 'SUBMITTED', score: 0, passed: false, submittedAt: new Date() },
        });
      const count = await tx.attempt.count({
        where: { enrollmentId: enrollment.id, assessmentId: assessment.id },
      });
      if (count >= assessment.maxAttempts + enrollment.extraAttempts)
        throw new ConflictException(
          'You have used the available attempts. Ask your instructor for help.',
        );
      const timed = assessment.timeLimitMinutes
        ? new Date(Date.now() + (assessment.timeLimitMinutes + enrollment.extraTimeMinutes) * 60000)
        : null;
      const expiresAt =
        deadline && timed
          ? new Date(Math.min(deadline.getTime(), timed.getTime()))
          : (deadline ?? timed);
      const frozen = assessment.questions.map((q) => ({
        id: q.id,
        kind: q.kind,
        prompt: q.prompt,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        points: q.points,
      }));
      const attempt = await tx.attempt.create({
        data: {
          enrollmentId: enrollment.id,
          assessmentId: assessment.id,
          number: count + 1,
          frozenQuestions: frozen as any,
          expiresAt,
        },
      });
      return this.present(attempt, assessment, []);
    });
  }
  private present(attempt: any, assessment: any, responses: any[], deadline = assessment.deadline) {
    const release =
      attempt.state === 'SUBMITTED' &&
      (assessment.feedbackRelease === 'AFTER_SUBMIT' ||
        (assessment.feedbackRelease === 'AFTER_DEADLINE' &&
          deadline &&
          new Date(deadline) <= new Date()));
    const questions = attempt.frozenQuestions as any[];
    return {
      id: attempt.id,
      number: attempt.number,
      state: attempt.state,
      expiresAt: attempt.expiresAt,
      score: attempt.score,
      passed: attempt.passed,
      submittedAt: attempt.submittedAt,
      questions: questions.map((q) => ({
        id: q.id,
        kind: q.kind,
        prompt: q.prompt,
        options: q.options,
        points: q.points,
      })),
      feedback: release
        ? questions.map((q) => ({
            questionId: q.id,
            correct: responses.find((r) => r.questionId === q.id)?.correct ?? false,
            answer: q.answer,
            explanation: q.explanation,
          }))
        : null,
    };
  }
  async get(actor: Actor, id: string) {
    const a = await this.db.attempt.findFirst({
      where: {
        id,
        enrollment: {
          userId: actor.id,
          state: { in: ['ACTIVE', 'COMPLETED'] },
          course: { organizationId: actor.organizationId },
        },
      },
      include: { assessment: true, responses: true, enrollment: true },
    });
    if (!a) throw new NotFoundException('Attempt unavailable');
    return this.present(
      a,
      a.assessment,
      a.responses,
      effectiveDeadline(a.assessment.deadline, a.enrollment.deadlineExtension),
    );
  }
  async submit(actor: Actor, id: string, dto: AttemptSubmitDto) {
    const original = await this.db.attempt.findFirst({
      where: {
        id,
        enrollment: {
          userId: actor.id,
          course: { organizationId: actor.organizationId },
          state: { in: ['ACTIVE', 'COMPLETED'] },
        },
      },
      include: { enrollment: true },
    });
    if (!original) throw new NotFoundException('Attempt unavailable');
    return this.db.$transaction(async (tx) => {
      await lockEnrollment(tx, original.enrollmentId);
      const attempt = await tx.attempt.findUniqueOrThrow({
        where: { id },
        include: { assessment: true, responses: true },
      });
      if (attempt.state === 'SUBMITTED')
        return this.present(
          attempt,
          attempt.assessment,
          attempt.responses,
          effectiveDeadline(attempt.assessment.deadline, original.enrollment.deadlineExtension),
        );
      if (attempt.expiresAt && attempt.expiresAt < new Date())
        throw new ConflictException('The attempt time has expired');
      const questions = attempt.frozenQuestions as any[];
      const byId = new Map(dto.responses.map((r) => [r.questionId, r.answer]));
      if (
        byId.size !== dto.responses.length ||
        byId.size !== questions.length ||
        questions.some((q) => !byId.has(q.id))
      )
        throw new BadRequestException('Provide exactly one response for every question');
      const responses = questions.map((q) => {
        const answer = byId.get(q.id)!;
        const correct = scoreAnswer(q, answer);
        return { attemptId: id, questionId: q.id, answer, correct, points: correct ? q.points : 0 };
      });
      const score =
        Math.round(
          (responses.reduce((s, r) => s + r.points, 0) /
            questions.reduce((s, q) => s + q.points, 0)) *
            10000,
        ) / 100;
      const passed = score >= attempt.assessment.passPercent;
      await tx.response.createMany({ data: responses });
      const updated = await tx.attempt.update({
        where: { id },
        data: { state: 'SUBMITTED', submittedAt: new Date(), score, passed },
      });
      const key = {
        enrollmentId: original.enrollmentId,
        activityId: attempt.assessment.activityId,
      };
      const current = await tx.activityCompletion.findUnique({
        where: { enrollmentId_activityId: key },
      });
      const state = passed || current?.state === 'PASSED' ? 'PASSED' : 'COMPLETED';
      await tx.activityCompletion.upsert({
        where: { enrollmentId_activityId: key },
        create: { ...key, state },
        update: { state },
      });
      await updateCourseCompletion(tx, original.enrollmentId, original.enrollment.courseVersionId);
      return this.present(
        updated,
        attempt.assessment,
        responses,
        effectiveDeadline(attempt.assessment.deadline, original.enrollment.deadlineExtension),
      );
    });
  }
}
