import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createLearner, demoCourse, enroll, noHorizontalOverflow, signIn } from './helpers';

const apiDependencies = createRequire(resolve('apps/api/package.json'));

/** Grant only this newly registered local fixture its instructor role. */
async function instructorFixture(email: string, courseId?: string) {
  expect(email).toMatch(/^browser-[a-f0-9-]+@pathway\.local$/);
  apiDependencies('dotenv').config({ path: 'apps/api/.env', quiet: true });
  const database = new URL(process.env.DATABASE_URL || '');
  expect(['localhost', '127.0.0.1', 'postgres']).toContain(database.hostname);
  const { PrismaClient } = apiDependencies('@prisma/client');
  const db = new PrismaClient();
  try {
    const membership = await db.membership.findFirstOrThrow({
      where: { user: { email }, organizationId: 'org-pathway' },
    });
    await db.roleAssignment.upsert({
      where: { membershipId_role: { membershipId: membership.id, role: 'INSTRUCTOR' } },
      create: { membershipId: membership.id, role: 'INSTRUCTOR' },
      update: {},
    });
    if (courseId)
      await db.courseAssignment.upsert({
        where: { userId_courseId: { userId: membership.userId, courseId } },
        create: { userId: membership.userId, courseId },
        update: {},
      });
  } finally {
    await db.$disconnect();
  }
}

async function enableMfa(page: Page) {
  await page.goto('/instructor');
  await page.getByRole('button', { name: 'Set up two-step verification', exact: true }).click();
  const secret = await page.getByLabel('Authenticator setup key').innerText();
  const code = apiDependencies('otplib').authenticator.generate(secret.trim());
  await page.getByLabel('Authenticator code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirm authenticator', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Create course', exact: true })).toBeVisible();
}

test('instructor sets up MFA, authors an accessible lesson, previews and publishes', async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Authoring flow is covered once; learner reflow runs at all three widths.',
  );
  const account = await createLearner(request);
  await instructorFixture(account.email);
  await signIn(page, account, false);
  await enableMfa(page);
  await page.getByRole('link', { name: 'Create course', exact: true }).click();
  await page.getByLabel('Course title', { exact: true }).fill('A clear handover');
  await page
    .getByLabel('Course summary', { exact: true })
    .fill('Practice writing a useful handover for a fictional community study group.');
  await page.getByRole('button', { name: 'Create course', exact: true }).click();
  await expect(page).toHaveURL(/\/instructor\/course\//);
  const courseId = new URL(page.url()).pathname.split('/').pop();
  await page.getByLabel('Course title', { exact: true }).fill('A clear handover');
  await page
    .locator('#outline-description')
    .fill('A short original reading lesson with a practical example and reflection.');
  await page
    .locator('#outline-outcomes')
    .fill('Write a handover that names the task and its next step.');
  await page.locator('#completion-rule').fill('Complete the reading lesson.');
  await page.getByRole('button', { name: 'Add module', exact: true }).click();
  await page.getByLabel('Module title', { exact: true }).fill('Share the next step');
  await page.getByRole('button', { name: 'Add activity', exact: true }).click();
  await page.locator('.activity-editor > summary').click();
  await page.getByLabel('Activity title', { exact: true }).fill('Write one useful next step');
  await page
    .getByLabel('Learning objective', { exact: true })
    .fill('Name the owner and next action in a handover.');
  await page
    .locator('#activity-0-0-body')
    .fill(
      'A useful handover describes the current state, the next action, and who can help. Use fictional examples and share only the information needed for the task.',
    );
  await page
    .locator('#activity-0-0-example')
    .fill('The notebooks are ready. Hana will check the count tomorrow.');
  await page
    .locator('#activity-0-0-reflection')
    .fill('What information will help the next person?');
  await page
    .getByLabel('Content rights', { exact: true })
    .fill('Original fictional browser verification content, permitted for this demo.');
  await page.getByLabel(/Images have meaningful alternatives/).check();
  await page.getByLabel(/Documents and resources have been reviewed/).check();
  await page.getByLabel(/Headings, reading order, and instructions are clear/).check();
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes(`/courses/${courseId}/outline`) &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save draft', exact: true }).first().click();
  expect((await saved).status()).toBe(200);
  await page.goto(`/instructor/preview/${courseId}`);
  await expect(
    page.getByRole('heading', { name: 'Write one useful next step', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark lesson complete' })).toHaveCount(0);
  await page.goto(`/instructor/review/${courseId}`);
  await page.getByRole('button', { name: 'Mark ready for review', exact: true }).click();
  await page.getByRole('button', { name: 'Publish course', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Published', exact: true })).toBeDisabled();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: 'docs/evidence/instructor-published.png', fullPage: true });
});

test('instructor private grading becomes visible only after explicit release', async ({
  page,
  request,
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Cross-account grading is covered once against the real API.',
  );
  test.setTimeout(180000);
  const teacher = await createLearner(request);
  const learner = await createLearner(request);
  await instructorFixture(teacher.email, demoCourse);
  await signIn(page, teacher, false);
  await enableMfa(page);
  const learnerContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
  });
  try {
    const learnerPage = await learnerContext.newPage();
    await signIn(learnerPage, learner);
    await enroll(learnerPage);
    await learnerPage.goto('/assignment/activity-portfolio');
    await learnerPage
      .getByLabel('A note for your instructor', { exact: true })
      .fill(
        'A fictional shop portfolio: clear date-based filenames, a specific email request, and named view-only sharing.',
      );
    const confirmation = learnerPage.waitForResponse(
      (response) =>
        response.url().endsWith('/submissions/activity-portfolio/submit') &&
        response.request().method() === 'POST',
    );
    await learnerPage.getByRole('button', { name: 'Submit assignment', exact: true }).click();
    const receipt = await (await confirmation).json();
    await expect(learnerPage.locator('.receipt')).toBeVisible();
    await page.goto(`/instructor/grade/${receipt.id}`);
    await page.getByLabel('Points for Clear organization', { exact: true }).fill('4');
    await page.getByLabel('Points for Useful email', { exact: true }).fill('4');
    await page.getByLabel('Points for Safe sharing', { exact: true }).fill('2');
    const feedback =
      'Your filenames are clear and the sharing permissions fit the task. Keep naming one useful next action.';
    await page.getByLabel('Feedback for the learner', { exact: true }).fill(feedback);
    await page.getByRole('button', { name: 'Save private feedback', exact: true }).click();
    await expect(
      page.getByText('Feedback saved privately. Release it explicitly when ready.', {
        exact: true,
      }),
    ).toBeVisible();
    await learnerPage.reload();
    await expect(learnerPage.getByText(feedback, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Release feedback', exact: true }).click();
    await expect(
      page.getByText('Feedback released to the learner.', { exact: true }),
    ).toBeVisible();
    await learnerPage.reload();
    await expect(learnerPage.getByText(feedback, { exact: true })).toBeVisible();
    await expect(learnerPage.getByText('100%', { exact: true })).toBeVisible();
    await learnerPage.screenshot({ path: 'docs/evidence/released-feedback.png', fullPage: true });
  } finally {
    await learnerContext.close();
  }
});
