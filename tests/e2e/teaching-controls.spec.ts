import { test, expect, type APIRequestContext } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { managementFixtures, privilegedSignIn, sessionHeaders } from './role-fixtures';

const apiDependencies = createRequire(resolve('apps/api/package.json'));

async function fixtureMemberships(
  organizationId: string,
  emails: { support: string; learner: string; invited: string },
) {
  expect(organizationId).toMatch(/^management-/);
  for (const email of Object.values(emails))
    expect(email).toMatch(/^browser-[a-f0-9-]+@pathway\.local$/);
  apiDependencies('dotenv').config({ path: 'apps/api/.env', quiet: true });
  expect(['localhost', '127.0.0.1', 'postgres']).toContain(
    new URL(process.env.DATABASE_URL || '').hostname,
  );
  const { PrismaClient } = apiDependencies('@prisma/client');
  const db = new PrismaClient();
  try {
    const invited = await db.membership.findFirstOrThrow({
      where: { organizationId: 'org-pathway', user: { email: emails.invited } },
    });
    await db.membership.update({ where: { id: invited.id }, data: { organizationId } });
    const support = await db.membership.findFirstOrThrow({
      where: { organizationId, user: { email: emails.support } },
    });
    const learner = await db.membership.findFirstOrThrow({
      where: { organizationId, user: { email: emails.learner } },
    });
    return { invited: invited.userId, support: support.userId, learner: learner.userId };
  } finally {
    await db.$disconnect();
  }
}

async function invitationLink(request: APIRequestContext, email: string, courseId: string) {
  const mailbox = process.env.PLAYWRIGHT_MAILPIT_URL || 'http://127.0.0.1:8025';
  expect(['127.0.0.1', 'localhost']).toContain(new URL(mailbox).hostname);
  let result = '';
  await expect
    .poll(
      async () => {
        const listing = await (await request.get(`${mailbox}/api/v1/messages?limit=100`)).json();
        const summary = listing.messages.find(
          (mail: { Subject: string; To: { Address: string }[] }) =>
            mail.Subject === 'Invitation to Fictional help workflow' &&
            mail.To.some((to) => to.Address === email),
        );
        if (!summary) return false;
        const message = await (await request.get(`${mailbox}/api/v1/message/${summary.ID}`)).json();
        const link = message.Text.match(/https?:\/\/\S+/)?.[0];
        if (!link) return false;
        const url = new URL(link);
        expect(url.origin).toBe('http://localhost:3000');
        expect(url.pathname).toBe('/join');
        expect(url.searchParams.get('courseId')).toBe(courseId);
        expect(url.searchParams.get('invitationCode')).toBeTruthy();
        result = `${url.pathname}${url.search}`;
        return true;
      },
      { timeout: 60000, intervals: [1000, 2000, 5000] },
    )
    .toBe(true);
  return result;
}

test('private invitations, group enrollment, and concurrent draft recovery work end to end', async ({
  page,
  request,
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Teaching access and concurrency are covered once against real services.',
  );
  test.setTimeout(360000);
  const fixture = await managementFixtures(request);
  const userIds = await fixtureMemberships(fixture.organizationId, {
    support: fixture.support.email,
    learner: fixture.learner.email,
    invited: fixture.foreign.email,
  });
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  const invitedContext = await browser.newContext({ baseURL });
  const supportContext = await browser.newContext({ baseURL });
  try {
    await privilegedSignIn(page, fixture.admin);
    const invitedPage = await invitedContext.newPage();
    const supportPage = await supportContext.newPage();
    await test.step('A private course stays hidden while its email invitation survives sign-in and is accepted', async () => {
      expect((await request.get(`/api/v1/courses/${fixture.courseId}`)).status()).toBe(404);
      await page.goto(`/instructor/enrollments/${fixture.courseId}`);
      await page.getByLabel('Learner email', { exact: true }).fill(fixture.foreign.email);
      await page.getByRole('button', { name: 'Send course invitation', exact: true }).click();
      await expect(
        page.getByText('Invitation queued for email delivery.', { exact: true }),
      ).toBeVisible();
      const link = await invitationLink(request, fixture.foreign.email, fixture.courseId);
      await invitedPage.goto(link);
      await invitedPage.getByRole('link', { name: 'Sign in to accept', exact: true }).click();
      await invitedPage.getByLabel('Email address', { exact: true }).fill(fixture.foreign.email);
      await invitedPage.getByLabel('Password', { exact: true }).fill(fixture.foreign.password);
      await invitedPage.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(invitedPage).toHaveURL(/\/join\?/);
      await invitedPage.getByRole('button', { name: 'Accept invitation', exact: true }).click();
      await expect(invitedPage).toHaveURL(new RegExp(`/learn/${fixture.courseId}$`));
      await expect(invitedPage.getByRole('heading', { level: 1 })).toHaveText(
        'Fictional help workflow',
      );
      await page.getByRole('button', { name: 'Refresh invitations', exact: true }).click();
      await expect(
        page.locator('article.invitation-row').filter({ hasText: fixture.foreign.email }),
      ).toContainText('Accepted');
    });
    await test.step('A pending invitation can be revoked and its code can no longer enroll the recipient', async () => {
      await page.getByLabel('Learner email', { exact: true }).fill(fixture.support.email);
      await page.getByRole('button', { name: 'Send course invitation', exact: true }).click();
      const link = await invitationLink(request, fixture.support.email, fixture.courseId);
      const pending = page
        .locator('article.invitation-row')
        .filter({ hasText: fixture.support.email });
      await pending.getByRole('button', { name: 'Revoke invitation', exact: true }).click();
      await expect(pending).toContainText('Revoked');
      await privilegedSignIn(supportPage, fixture.support);
      await supportPage.goto(link);
      const rejected = supportPage.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/enrollments') && response.request().method() === 'POST',
      );
      await supportPage.getByRole('button', { name: 'Accept invitation', exact: true }).click();
      expect((await rejected).status()).toBe(404);
      await expect(
        supportPage.getByRole('alert').filter({ hasText: 'Course unavailable' }),
      ).toBeVisible();
      expect(
        (await supportPage.request.get(`/api/v1/learning/courses/${fixture.courseId}`)).status(),
      ).toBe(404);
    });
    await test.step('Bulk enrollment previews duplicates and existing enrollment, confirms once, and safely retries', async () => {
      await page
        .getByLabel('Organization user IDs', { exact: true })
        .fill(`${userIds.support}\n${userIds.learner},${userIds.invited}\n${userIds.support}`);
      await page.getByRole('button', { name: 'Preview enrollments', exact: true }).click();
      const preview = page.getByRole('region', { name: 'Enrollment preview', exact: true });
      await expect(preview).toContainText('1 ready · 2 already enrolled · 0 unavailable');
      const confirmed = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/enrollments/course/${fixture.courseId}/bulk/assign`) &&
          response.request().method() === 'POST',
      );
      await preview.getByRole('button', { name: 'Confirm group enrollment', exact: true }).click();
      const confirmation = await confirmed;
      expect(confirmation.status()).toBe(201);
      expect(await confirmation.json()).toMatchObject({ created: 1, unchanged: 2 });
      await expect(
        page.getByText('1 learners enrolled. 2 existing enrollments kept.', { exact: true }),
      ).toBeVisible();
      await page
        .getByLabel('Organization user IDs', { exact: true })
        .fill(Object.values(userIds).join('\n'));
      await page.getByRole('button', { name: 'Preview enrollments', exact: true }).click();
      await expect(preview).toContainText('0 ready · 3 already enrolled · 0 unavailable');
      await expect(
        preview.getByRole('button', { name: 'Confirm group enrollment', exact: true }),
      ).toBeDisabled();
      const repeated = await page.request.post(
        `/api/v1/enrollments/course/${fixture.courseId}/bulk/assign`,
        { headers: await sessionHeaders(page), data: { userIds: Object.values(userIds) } },
      );
      expect(repeated.status()).toBe(201);
      expect(await repeated.json()).toMatchObject({ created: 0, unchanged: 3 });
    });
    await test.step('Two editors cannot overwrite a newer draft and the losing editor can download then recover', async () => {
      const stalePage = await page.context().newPage();
      try {
        const editUrl = `/instructor/course/${fixture.courseId}`;
        await page.goto(editUrl);
        await stalePage.goto(editUrl);
        await expect(page.getByLabel('Course title', { exact: true })).toHaveValue(
          'Fictional help workflow',
        );
        await expect(stalePage.getByLabel('Course title', { exact: true })).toHaveValue(
          'Fictional help workflow',
        );
        await stalePage
          .getByLabel('Course title', { exact: true })
          .fill('Unsent second editor changes');
        await page.getByLabel('Course title', { exact: true }).fill('A newer saved draft');
        const saved = page.waitForResponse(
          (response) =>
            response.url().endsWith(`/courses/${fixture.courseId}/outline`) &&
            response.request().method() === 'PUT',
        );
        await page.getByRole('button', { name: 'Save draft', exact: true }).first().click();
        expect((await saved).status()).toBe(200);
        const conflict = stalePage.waitForResponse(
          (response) =>
            response.url().endsWith(`/courses/${fixture.courseId}/outline`) &&
            response.request().method() === 'PUT',
        );
        await stalePage.getByRole('button', { name: 'Save draft', exact: true }).first().click();
        const rejected = await conflict;
        expect(rejected.status()).toBe(409);
        expect(await rejected.json()).toMatchObject({ code: 'OUTLINE_CONFLICT' });
        await expect(
          stalePage.getByRole('region', { name: 'Draft conflict', exact: true }),
        ).toBeVisible();
        await expect(stalePage.getByLabel('Course title', { exact: true })).toHaveValue(
          'Unsent second editor changes',
        );
        const download = stalePage.waitForEvent('download');
        await stalePage
          .getByRole('button', { name: 'Download unsaved draft', exact: true })
          .click();
        const copy = await download;
        expect(copy.suggestedFilename()).toBe('pathway-unsaved-draft.json');
        const downloadedPath = await copy.path();
        expect(downloadedPath).toBeTruthy();
        expect(JSON.parse(await readFile(downloadedPath!, 'utf8'))).toMatchObject({
          title: 'Unsent second editor changes',
        });
        stalePage.once('dialog', (dialog) => void dialog.accept());
        await stalePage.getByRole('button', { name: 'Reload saved draft', exact: true }).click();
        await expect(stalePage.getByLabel('Course title', { exact: true })).toHaveValue(
          'A newer saved draft',
        );
        await expect(
          stalePage.getByRole('region', { name: 'Draft conflict', exact: true }),
        ).toHaveCount(0);
        await stalePage.screenshot({
          path: 'docs/evidence/teaching-conflict-recovered.png',
          fullPage: true,
        });
      } finally {
        await stalePage.close();
      }
    });
  } finally {
    await invitedContext.close();
    await supportContext.close();
  }
});
