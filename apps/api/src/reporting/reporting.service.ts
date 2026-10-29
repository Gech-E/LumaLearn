import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Actor, CoursePolicy } from '../courses/course.policy';
import { PaginationDto } from '../http/pagination.dto';

@Injectable()
export class ReportingService {
  constructor(
    private db: PrismaService,
    private policy: CoursePolicy,
  ) {}
  async course(actor: Actor, id: string, pagination: PaginationDto) {
    const course = await this.policy.manage(actor, id, true);
    const [enrollments, total, completed] = await this.db.$transaction(
      [
        this.db.enrollment.findMany({
          where: { courseId: id },
          include: {
            user: { select: { id: true, name: true, email: true } },
            completions: true,
            courseVersion: {
              include: {
                modules: { include: { activities: { select: { id: true, kind: true } } } },
              },
            },
            attempts: { where: { state: 'SUBMITTED' }, select: { score: true, passed: true } },
            submissions: {
              include: {
                grades: {
                  where: { releasedAt: { not: null } },
                  orderBy: { revision: 'desc' },
                  take: 1,
                },
              },
            },
          },
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
        this.db.enrollment.count({ where: { courseId: id } }),
        this.db.enrollment.count({ where: { courseId: id, state: 'COMPLETED' } }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    const items = enrollments.map((e) => {
      const activities = e.courseVersion.modules.flatMap((m) => m.activities);
      const finished = activities.filter((a) =>
        e.completions.some(
          (c) =>
            c.activityId === a.id &&
            (a.kind === 'LESSON' ? c.state !== 'VIEWED' : c.state === 'PASSED'),
        ),
      ).length;
      return {
        enrollmentId: e.id,
        learner: e.user,
        state: e.state,
        progress: activities.length ? Math.round((finished / activities.length) * 100) : 0,
        attempts: e.attempts.length,
        practicesPassed: e.attempts.filter((a) => a.passed).length,
        submittedAssignments: e.submissions.filter((s) => s.state !== 'DRAFT').length,
        releasedGrades: e.submissions.flatMap((s) =>
          s.grades.map((g) => ({ score: g.score, passed: g.passed, releasedAt: g.releasedAt })),
        ),
      };
    });
    return {
      course: { id: course.id, title: course.title },
      total,
      completed,
      items,
      page: pagination.page,
      limit: pagination.limit,
      notice:
        'This report describes recorded activity and released grades. It does not measure learning time or compare learners publicly.',
    };
  }
}
