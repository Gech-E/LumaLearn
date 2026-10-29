import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fixturePassword } from './helpers';

test('registration guides verification and invited privileged users can resolve MFA or switch account', async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Onboarding is covered once; responsive learner checks run at three widths.',
  );
  const account = { email: `onboarding-${randomUUID()}@pathway.local`, password: fixturePassword };
  await page.goto('/register');
  await page.getByLabel('Your name', { exact: true }).fill('Fictional onboarding check');
  await page.getByLabel('Email address', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await expect(
    page.getByText('Registration request received. Follow the verification instructions below.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Next step: open the local inbox', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open local inbox', exact: true })).toHaveAttribute(
    'href',
    'http://127.0.0.1:8025',
  );
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  let verification = '';
  await expect
    .poll(
      async () => {
        const listing = await (
          await request.get('http://127.0.0.1:8025/api/v1/messages?limit=100')
        ).json();
        const item = listing.messages.find(
          (mail: { Subject: string; To: { Address: string }[] }) =>
            mail.Subject === 'Verify your Pathway email' &&
            mail.To.some((to) => to.Address === account.email),
        );
        if (!item) return false;
        const mail = await (
          await request.get(`http://127.0.0.1:8025/api/v1/message/${item.ID}`)
        ).json();
        verification = mail.Text.match(/https?:\/\/\S+/)?.[0] || '';
        return Boolean(verification);
      },
      { timeout: 60000 },
    )
    .toBe(true);
  expect(new URL(verification).origin).toBe('http://localhost:3000');
  await page.goto(verification);
  const verified = page.waitForResponse(
    (response) => response.url().endsWith('/auth/verify') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  expect((await verified).status()).toBe(201);
  await page.goto(`/login?next=${encodeURIComponent('/\\untrusted.example')}`);
  await page.getByLabel('Email address', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:3000/home');

  const dependencies = createRequire(resolve('apps/api/package.json'));
  dependencies('dotenv').config({ path: 'apps/api/.env', quiet: true });
  expect(['localhost', '127.0.0.1', 'postgres']).toContain(
    new URL(process.env.DATABASE_URL || '').hostname,
  );
  const db = new (dependencies('@prisma/client').PrismaClient)();
  try {
    const membership = await db.membership.findFirstOrThrow({
      where: { user: { email: account.email } },
    });
    await db.roleAssignment.create({ data: { membershipId: membership.id, role: 'INSTRUCTOR' } });
  } finally {
    await db.$disconnect();
  }
  const invitation = `/join?courseId=${randomUUID()}&invitationCode=fictional-onboarding-code`;
  await page.goto(invitation);
  await expect(
    page.getByRole('button', { name: 'Set up two-step verification', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept invitation', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get('next')).toBe(invitation);
});
