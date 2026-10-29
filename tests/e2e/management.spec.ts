import { test, expect } from '@playwright/test';
import { managementFixtures, privilegedSignIn, sessionHeaders } from './role-fixtures';
import { signIn, noHorizontalOverflow } from './helpers';

test('administrator and support complete scoped management workflows', async ({
  page,
  request,
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Management role boundaries are covered once; learner layouts run at all widths.',
  );
  test.setTimeout(360000);
  const fixture = await managementFixtures(request);
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  const learnerContext = await browser.newContext({ baseURL });
  const supportContext = await browser.newContext({ baseURL });
  try {
    const learnerPage = await learnerContext.newPage();
    const supportPage = await supportContext.newPage();
    await test.step('Administrator completes real MFA and cannot access academic records or another organization', async () => {
      await privilegedSignIn(page, fixture.admin);
      await expect(
        page.getByRole('heading', { name: 'Care for your learning community.', exact: true }),
      ).toBeVisible();
      const headers = await sessionHeaders(page);
      const academic = await page.request.get(`/api/v1/reporting/courses/${fixture.courseId}`);
      expect(academic.status()).toBe(403);
      const gradeList = await page.request.get('/api/v1/grading/submissions');
      expect(gradeList.status()).toBe(200);
      expect(await gradeList.json()).toMatchObject({ items: [], total: 0 });
      const privateWork = await page.request.get(
        `/api/v1/grading/submissions/${fixture.privateSubmissionId}`,
      );
      expect([403, 404]).toContain(privateWork.status());
      await page.goto('/instructor/submissions');
      await expect(
        page.getByText('Academic record access is required for this page.', { exact: true }),
      ).toBeVisible();
      await page.goto('/admin/users');
      await page
        .getByLabel('Search organization users', { exact: true })
        .fill(fixture.foreign.email);
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'No users match this search.', exact: true }),
      ).toBeVisible();
      const escalation = await page.request.patch(
        `/api/v1/memberships/${fixture.learnerMembershipId}`,
        { headers, data: { roles: ['LEARNER', 'ACADEMIC_ADMIN'] } },
      );
      expect(escalation.status()).toBe(403);
    });
    await test.step('Membership suspension revokes a learner session and restoration permits a new sign-in', async () => {
      await signIn(learnerPage, fixture.learner);
      await page
        .getByLabel('Search organization users', { exact: true })
        .fill(fixture.learner.email);
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      let member = page.locator('details.ticket').filter({ hasText: fixture.learner.email });
      await member.locator('summary').click();
      await expect(
        member.getByLabel('Academic records administrator', { exact: true }),
      ).toHaveCount(0);
      await member.getByLabel('Membership state', { exact: true }).selectOption('SUSPENDED');
      const suspended = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/memberships/${fixture.learnerMembershipId}`) &&
          response.request().method() === 'PATCH',
      );
      await member.getByRole('button', { name: 'Save membership', exact: true }).click();
      expect((await suspended).status()).toBe(200);
      const oldSession = await learnerPage.request.get('/api/v1/auth/session');
      expect([401, 403]).toContain(oldSession.status());
      await learnerPage.goto('/home');
      await expect(
        learnerPage.getByRole('heading', { name: 'Your learning is waiting.', exact: true }),
      ).toBeVisible();
      member = page.locator('details.ticket').filter({ hasText: fixture.learner.email });
      await expect(member.locator('summary')).toContainText('suspended');
      await member.locator('summary').click();
      await member.getByLabel('Membership state', { exact: true }).selectOption('ACTIVE');
      const restored = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/memberships/${fixture.learnerMembershipId}`) &&
          response.request().method() === 'PATCH',
      );
      await member.getByRole('button', { name: 'Save membership', exact: true }).click();
      expect((await restored).status()).toBe(200);
      await signIn(learnerPage, fixture.learner);
    });
    await test.step('Administrator saves isolated organization settings and delivers an essential service notice', async () => {
      await page.goto('/admin/settings');
      await page
        .getByLabel('Organization name', { exact: true })
        .fill('Fictional managed learning group');
      await page.getByRole('button', { name: 'Save settings', exact: true }).click();
      await expect(page.getByText('Organization settings saved.', { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByLabel('Organization name', { exact: true })).toHaveValue(
        'Fictional managed learning group',
      );
      await page.goto('/admin/notices');
      await page.getByLabel('Notice title', { exact: true }).fill('Local verification notice');
      await page
        .getByLabel('Notice message', { exact: true })
        .fill('Fictional notice for this isolated test organization only.');
      await page.getByRole('button', { name: 'Send service notice', exact: true }).click();
      await expect(page.getByText(/Notice queued for delivery/)).toBeVisible();
      await expect
        .poll(
          async () => {
            const response = await learnerPage.request.get('/api/v1/notifications?limit=100');
            const body = await response.json();
            return body.items.some(
              (item: { title: string }) => item.title === 'Local verification notice',
            );
          },
          { timeout: 60000, intervals: [1000, 2000] },
        )
        .toBe(true);
      await learnerPage.goto('/notifications');
      const notice = learnerPage
        .locator('.notification-item')
        .filter({ hasText: 'Local verification notice' });
      await notice.getByRole('button', { name: 'Mark as read', exact: true }).click();
      await expect(notice).toContainText('Read');
    });
    await test.step('Learner creates activity-linked help, support resolves it, and the learner sees the response', async () => {
      await learnerPage.goto(`/help?activityId=${fixture.activityId}`);
      await learnerPage
        .getByLabel('What do you need help with?', { exact: true })
        .fill('A useful fictional question');
      await learnerPage
        .getByLabel('Tell us a little more', { exact: true })
        .fill('I would like one more example for this fictional lesson.');
      await learnerPage.getByRole('button', { name: 'Send help request', exact: true }).click();
      await expect(
        learnerPage.getByText('Your request is saved. You can follow its status below.', {
          exact: true,
        }),
      ).toBeVisible();
      await privilegedSignIn(supportPage, fixture.support);
      await expect(
        supportPage.getByRole('heading', { name: 'A helpful next step.', exact: true }),
      ).toBeVisible();
      await expect(
        supportPage.getByRole('link', { name: 'Users & memberships', exact: true }),
      ).toHaveCount(0);
      const ticket = supportPage
        .locator('article.ticket')
        .filter({ hasText: 'A useful fictional question' });
      await expect(ticket).toContainText(fixture.activityId);
      await ticket.getByText('Respond & update status', { exact: true }).click();
      await ticket
        .getByLabel('Response visible to the learner', { exact: true })
        .fill('Start by naming the task, then write one clear next step.');
      await ticket.getByLabel('Request status', { exact: true }).selectOption('RESOLVED');
      await ticket.getByRole('button', { name: 'Send response', exact: true }).click();
      await expect(ticket).toContainText('resolved');
      await learnerPage.reload();
      await expect(
        learnerPage.getByText('Start by naming the task, then write one clear next step.', {
          exact: true,
        }),
      ).toBeVisible();
      const usersDenied = await supportPage.request.get('/api/v1/users');
      expect(usersDenied.status()).toBe(403);
      const gradesDenied = await supportPage.request.get('/api/v1/grading/submissions');
      expect(gradesDenied.status()).toBe(200);
      const privateList = await gradesDenied.json();
      expect(privateList).toMatchObject({ items: [], total: 0 });
      expect(JSON.stringify(privateList)).not.toContain(fixture.privateSubmissionId);
      expect(JSON.stringify(privateList)).not.toContain('Private fictional academic work');
      const privateWork = await supportPage.request.get(
        `/api/v1/grading/submissions/${fixture.privateSubmissionId}`,
      );
      expect([403, 404]).toContain(privateWork.status());
    });
    await test.step('Audit records management actions and management pages reflow without overflow', async () => {
      await page.goto('/admin/audit');
      await expect(
        page.getByRole('cell', { name: 'membership.updated', exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole('cell', { name: 'organization.updated', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('cell', { name: 'support.responded', exact: true }),
      ).toBeVisible();
      await noHorizontalOverflow(page);
      await page.screenshot({ path: 'docs/evidence/management-audit.png', fullPage: true });
      await supportPage.screenshot({ path: 'docs/evidence/support-resolved.png', fullPage: true });
    });
  } finally {
    await learnerContext.close();
    await supportContext.close();
  }
});
