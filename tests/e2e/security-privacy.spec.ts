import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createLearner, signIn } from './helpers';

const dependencies = createRequire(resolve('apps/api/package.json'));

test('recovery-code sign-in, private account export and reviewed deletion request', async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Security UI is covered once; learner reflow has separate mobile checks.',
  );
  test.setTimeout(180000);
  const account = await createLearner(request);
  dependencies('dotenv').config({ path: 'apps/api/.env', quiet: true });
  expect(['127.0.0.1', 'localhost', 'postgres']).toContain(
    new URL(process.env.DATABASE_URL || '').hostname,
  );
  const db = new (dependencies('@prisma/client').PrismaClient)();
  try {
    const membership = await db.membership.findFirstOrThrow({
      where: { user: { email: account.email } },
    });
    const organization = await db.organization.create({
      data: { name: 'Fictional security browser test', id: randomUUID() },
    });
    await db.membership.update({
      where: { id: membership.id },
      data: { organizationId: organization.id },
    });
    await db.roleAssignment.create({ data: { membershipId: membership.id, role: 'INSTRUCTOR' } });
  } finally {
    await db.$disconnect();
  }
  await signIn(page, account, false);
  await page.goto('/instructor');
  await page.getByRole('button', { name: 'Set up two-step verification', exact: true }).click();
  const secret = (await page.getByLabel('Authenticator setup key').innerText()).trim();
  await page
    .getByLabel('Authenticator code', { exact: true })
    .fill(dependencies('otplib').authenticator.generate(secret));
  await page.getByRole('button', { name: 'Confirm authenticator', exact: true }).click();
  await page.goto('/profile');
  await page.getByLabel('Current password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Generate recovery codes', exact: true }).click();
  const codes = page.getByRole('region', { name: 'Recovery codes', exact: true }).locator('code');
  await expect.poll(() => codes.count()).toBeGreaterThanOrEqual(8);
  const recoveryCode = await codes.first().innerText();
  await page.getByRole('button', { name: 'I saved my codes', exact: true }).click();
  await expect(codes).toHaveCount(0);
  await page.getByRole('button', { name: /Account menu for/ }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByLabel('Email address', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.locator('.mfa-detail > summary').click();
  await page.getByLabel('Use a recovery code', { exact: true }).check();
  await page.getByLabel('Recovery code', { exact: true }).fill(recoveryCode);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/profile');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my account data', exact: true }).click();
  const downloaded = await downloading;
  const stream = await downloaded.createReadStream();
  if (!stream) throw new Error('Account export did not produce a readable download.');
  let text = '';
  for await (const chunk of stream) text += chunk.toString();
  const exported = JSON.parse(text);
  expect(exported.profile.email).toBe(account.email);
  for (const field of [
    'passwordHash',
    'mfaSecret',
    'mfaPendingSecret',
    'tokenHash',
    'csrfToken',
    'frozenQuestions',
    'codeHash',
  ])
    expect(text).not.toContain(field);
  await page.getByRole('link', { name: 'Request account deletion', exact: true }).click();
  await expect(page).toHaveURL(/\/help\?kind=DELETION$/);
  await page
    .getByLabel('What do you need help with?', { exact: true })
    .fill('Fictional account deletion review');
  await page
    .getByLabel('Tell us a little more', { exact: true })
    .fill(
      'This fictional verification request asks for a review of account deletion and retained academic records.',
    );
  await page.getByRole('button', { name: 'Send help request', exact: true }).click();
  await expect(
    page.getByText('Your request is saved. You can follow its status below.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Fictional account deletion review', { exact: true })).toBeVisible();
});
