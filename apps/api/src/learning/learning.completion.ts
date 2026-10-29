import type { Prisma } from '@prisma/client';

export async function updateCourseCompletion(
  tx: Prisma.TransactionClient,
  enrollmentId: string,
  courseVersionId: string,
) {
  const activities = await tx.activityVersion.findMany({
    where: { module: { courseVersionId } },
    select: { id: true, kind: true },
  });
  const completions = await tx.activityCompletion.findMany({ where: { enrollmentId } });
  const finished =
    activities.length > 0 &&
    activities.every((a) =>
      completions.some(
        (c) =>
          c.activityId === a.id &&
          (a.kind === 'LESSON' ? ['COMPLETED', 'PASSED'].includes(c.state) : c.state === 'PASSED'),
      ),
    );
  await tx.enrollment.update({
    where: { id: enrollmentId },
    data: { state: finished ? 'COMPLETED' : 'ACTIVE' },
  });
}
