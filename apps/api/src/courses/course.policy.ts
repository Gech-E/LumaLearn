import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface Actor {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  membershipId: string;
  roles: string[];
}
export const outlineInclude = {
  modules: {
    orderBy: { position: 'asc' as const },
    include: {
      activities: {
        orderBy: { position: 'asc' as const },
        include: {
          assessment: { include: { questions: { orderBy: { position: 'asc' as const } } } },
          rubric: true,
        },
      },
    },
  },
};

@Injectable()
export class CoursePolicy {
  constructor(readonly db: PrismaService) {}
  async manage(actor: Actor, courseId: string, academic = false) {
    const course = await this.db.course.findFirst({
      where: { id: courseId, organizationId: actor.organizationId },
    });
    if (!course) throw new NotFoundException('Course unavailable');
    const permittedAdmin = actor.roles.includes(academic ? 'ACADEMIC_ADMIN' : 'ADMIN');
    const assigned =
      actor.roles.includes('INSTRUCTOR') &&
      (await this.db.courseAssignment.findUnique({
        where: { userId_courseId: { userId: actor.id, courseId } },
      }));
    if (!permittedAdmin && !assigned)
      throw new ForbiddenException('Assigned course permission required');
    return course;
  }
  async enrollment(actor: Actor, courseId: string) {
    const enrollment = await this.db.enrollment.findFirst({
      where: {
        userId: actor.id,
        courseId,
        state: { in: ['ACTIVE', 'COMPLETED'] },
        course: { organizationId: actor.organizationId },
      },
      include: { course: true },
    });
    if (!enrollment) throw new NotFoundException('Learning access unavailable');
    return enrollment;
  }
  async activity(actor: Actor, activityId: string, requirePrerequisites = true) {
    const activity = await this.db.activityVersion.findFirst({
      where: {
        id: activityId,
        module: { courseVersion: { course: { organizationId: actor.organizationId } } },
      },
      include: {
        module: { include: { courseVersion: { include: { course: true } } } },
        assessment: { include: { questions: { orderBy: { position: 'asc' } } } },
        rubric: true,
      },
    });
    if (!activity) throw new NotFoundException('Activity unavailable');
    const enrollment = await this.enrollment(actor, activity.module.courseVersion.courseId);
    if (enrollment.courseVersionId !== activity.module.courseVersionId)
      throw new NotFoundException('Activity unavailable in your course version');
    if (requirePrerequisites && activity.prerequisiteIds.length) {
      const completed = await this.db.activityCompletion.count({
        where: {
          enrollmentId: enrollment.id,
          activityId: { in: activity.prerequisiteIds },
          OR: [{ state: 'PASSED' }, { state: 'COMPLETED', activity: { kind: 'LESSON' } }],
        },
      });
      if (completed !== activity.prerequisiteIds.length)
        throw new ForbiddenException('Complete the prerequisite activities first');
    }
    return { activity, enrollment };
  }
}

export function courseCard(course: any) {
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    summary: course.summary,
    subject: course.subject,
    level: course.level,
    language: course.language,
    format: course.format,
    instructorName: course.instructorName,
    effortMinutes: course.effortMinutes,
  };
}
export function versionOutline(version: any) {
  return {
    id: version.id,
    number: version.number,
    title: version.title,
    description: version.description,
    outcomes: version.outcomes,
    prerequisites: version.prerequisites,
    completionRule: version.completionRule,
    modules: version.modules.map((m: any) => ({
      id: m.id,
      title: m.title,
      position: m.position,
      activities: m.activities.map((a: any) => ({
        id: a.id,
        title: a.title,
        kind: a.kind,
        estimatedMinutes: a.estimatedMinutes,
        prerequisiteIds: a.prerequisiteIds,
      })),
    })),
  };
}
export async function lockEnrollment(tx: any, enrollmentId: string) {
  await tx.$queryRaw`SELECT id FROM "Enrollment" WHERE id = ${enrollmentId} FOR UPDATE`;
}
