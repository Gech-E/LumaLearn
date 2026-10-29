import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createLearner, signIn } from './helpers';

const apiDependencies = createRequire(resolve('apps/api/package.json'));

/** Management checks use an isolated fictional organization, never demo memberships. */
export async function managementFixtures(request: APIRequestContext) {
  const admin = await createLearner(request);
  const support = await createLearner(request);
  const learner = await createLearner(request);
  const foreign = await createLearner(request);
  const accounts = { admin, support, learner, foreign };
  for (const account of Object.values(accounts))
    expect(account.email).toMatch(/^browser-[a-f0-9-]+@pathway\.local$/);
  apiDependencies('dotenv').config({ path: 'apps/api/.env', quiet: true });
  const database = new URL(process.env.DATABASE_URL || '');
  expect(['localhost', '127.0.0.1', 'postgres']).toContain(database.hostname);
  const { PrismaClient } = apiDependencies('@prisma/client');
  const db = new PrismaClient();
  const organizationId = `management-${randomUUID()}`;
  const courseId = randomUUID();
  const activityId = randomUUID();
  let privateSubmissionId = '';
  let learnerMembershipId = '';
  try {
    await db.$transaction(
      async (tx: typeof db) => {
        await tx.organization.create({
          data: { id: organizationId, name: 'Fictional management verification' },
        });
        for (const [name, account] of Object.entries({ admin, support, learner })) {
          const membership = await tx.membership.findFirstOrThrow({
            where: { user: { email: account.email }, organizationId: 'org-pathway' },
          });
          await tx.membership.update({ where: { id: membership.id }, data: { organizationId } });
          if (name === 'learner') learnerMembershipId = membership.id;
          if (name !== 'learner') {
            await tx.roleAssignment.deleteMany({ where: { membershipId: membership.id } });
            await tx.roleAssignment.create({
              data: { membershipId: membership.id, role: name === 'admin' ? 'ADMIN' : 'SUPPORT' },
            });
          }
        }
        const course = await tx.course.create({
          data: {
            id: courseId,
            organizationId,
            slug: `management-${randomUUID()}`,
            title: 'Fictional help workflow',
            summary: 'Original local test lesson.',
            subject: 'Digital skills',
            level: 'Beginner',
            instructorName: 'Local test instructor',
            isPublic: false,
            freeEnrollment: false,
          },
        });
        const version = await tx.courseVersion.create({
          data: {
            courseId: course.id,
            number: 1,
            title: course.title,
            description: course.summary,
            outcomes: ['Ask for useful help.'],
            prerequisites: [],
          },
        });
        const module = await tx.module.create({
          data: { courseVersionId: version.id, title: 'Ask clearly', position: 0 },
        });
        await tx.activityVersion.create({
          data: {
            id: activityId,
            moduleId: module.id,
            title: 'Describe what you need',
            kind: 'LESSON',
            position: 0,
            objective: 'Name one useful question.',
            body: 'Use fictional information and describe your next step.',
            prerequisiteIds: [],
            rights: 'Original fictional verification content.',
            accessibility: { imagesHaveAlt: true, headingsReviewed: true, resourcesReviewed: true },
          },
        });
        const criteria = [
          {
            id: 'useful-question',
            title: 'Useful question',
            description: 'Names the task.',
            maxPoints: 10,
          },
        ];
        const assignment = await tx.activityVersion.create({
          data: {
            moduleId: module.id,
            title: 'Private fictional work',
            kind: 'ASSIGNMENT',
            position: 1,
            objective: 'Write one clear question.',
            body: 'Use fictional information.',
            prerequisiteIds: [],
            rights: 'Original fictional verification content.',
            accessibility: { imagesHaveAlt: true, resourcesReviewed: true, headingsReviewed: true },
            offlineAllowed: false,
            rubric: { create: { criteria, passPercent: 70 } },
          },
        });
        await tx.courseVersion.update({
          where: { id: version.id },
          data: { state: 'PUBLISHED', publishedAt: new Date() },
        });
        await tx.course.update({
          where: { id: courseId },
          data: { state: 'PUBLISHED', currentVersionId: version.id },
        });
        const membership = await tx.membership.findUniqueOrThrow({
          where: { id: learnerMembershipId },
        });
        const enrollment = await tx.enrollment.create({
          data: { userId: membership.userId, courseId, courseVersionId: version.id },
        });
        const receipt = `PW-MANAGEMENT-${randomUUID()}`;
        const requestId = randomUUID();
        const submission = await tx.submission.create({
          data: {
            enrollmentId: enrollment.id,
            activityId: assignment.id,
            state: 'SUBMITTED',
            text: 'Private fictional academic work for scope verification.',
            assetIds: [],
            frozenRubric: criteria,
            receipt,
            requestId,
            submittedAt: new Date(),
          },
        });
        privateSubmissionId = submission.id;
        await tx.submissionReceipt.create({
          data: {
            submissionId: submission.id,
            receipt,
            requestId,
            revision: 1,
            snapshot: { text: submission.text, assetIds: [] },
          },
        });
      },
      { timeout: 30000 },
    );
    return {
      ...accounts,
      organizationId,
      courseId,
      activityId,
      learnerMembershipId,
      privateSubmissionId,
    };
  } finally {
    await db.$disconnect();
  }
}

export async function privilegedSignIn(page: Page, account: { email: string; password: string }) {
  await signIn(page, account, false);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Set up two-step verification', exact: true }).click();
  const secret = await page.getByLabel('Authenticator setup key').innerText();
  const code = apiDependencies('otplib').authenticator.generate(secret.trim());
  await page.getByLabel('Authenticator code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirm authenticator', exact: true }).click();
  await expect(
    page.getByRole('navigation', { name: 'Administration navigation', exact: true }),
  ).toBeVisible();
}

export async function sessionHeaders(page: Page) {
  const response = await page.request.get('/api/v1/auth/session');
  expect(response.status()).toBe(200);
  const session = await response.json();
  return { Origin: 'http://localhost:3000', 'X-CSRF-Token': session.csrfToken };
}
