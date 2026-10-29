import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export const demoCourse = 'course-digital-essentials';
export const fixturePassword = 'PathwayBrowser!2026';

/** Exercise real registration and the local email worker without touching demo accounts. */
export async function createLearner(request: APIRequestContext) {
  const email = `browser-${randomUUID()}@pathway.local`;
  const registered = await request.post('/api/v1/auth/register', {
    data: { name: 'Browser workflow learner', email, password: fixturePassword },
  });
  expect(registered.status()).toBe(201);
  const mailbox = process.env.PLAYWRIGHT_MAILPIT_URL || 'http://127.0.0.1:8025';
  expect(['127.0.0.1', 'localhost']).toContain(new URL(mailbox).hostname);
  let token = '';
  await expect
    .poll(
      async () => {
        const response = await request.get(`${mailbox}/api/v1/messages?limit=100`);
        const listing = await response.json();
        const mail = listing.messages.find(
          (message: { Subject: string; To: { Address: string }[] }) =>
            message.Subject === 'Verify your Pathway email' &&
            message.To.some((to) => to.Address === email),
        );
        if (!mail) return false;
        const detail = await request.get(
          `${mailbox}/api/v1/message/${encodeURIComponent(mail.ID)}`,
        );
        const content = await detail.json();
        const link = content.Text.match(/https?:\/\/\S+/)?.[0];
        token = link ? new URL(link).searchParams.get('token') || '' : '';
        return Boolean(token);
      },
      { timeout: 90000, intervals: [1000, 2000, 5000] },
    )
    .toBe(true);
  const verified = await request.post('/api/v1/auth/verify', { data: { token } });
  expect(verified.status()).toBe(201);
  return { email, password: fixturePassword };
}

export async function signIn(
  page: Page,
  account: { email: string; password: string },
  learner = true,
) {
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  if (learner) await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back');
}

export async function enroll(page: Page) {
  await page.goto(`/courses/${demoCourse}`);
  await page.getByRole('button', { name: 'Join this course', exact: true }).click();
  await page.getByRole('link', { name: 'Start learning', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${demoCourse}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Everyday digital skills');
}

export async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}
