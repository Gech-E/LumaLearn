import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { createLearner, enroll, noHorizontalOverflow, signIn } from './helpers';

test('catalog search, mobile reflow, keyboard focus, and accessibility', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const metrics = { lcpMs: 0, cls: 0 };
    (window as Window & { pathwayVitals?: typeof metrics }).pathwayVitals = metrics;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) metrics.lcpMs = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[]) {
        if (!entry.hadRecentInput) metrics.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  const response = await page.goto('/');
  const policy = response?.headers()['content-security-policy'] || '';
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(page.getByRole('heading', { name: 'Make room for something new.' })).toBeVisible();
  await expect(page.getByText('Everyday digital skills', { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const measurement = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    return {
      ...(window as Window & { pathwayVitals?: { lcpMs: number; cls: number } }).pathwayVitals,
      coldTransferredBytes:
        navigation.transferSize +
        resources.reduce((sum, resource) => sum + resource.transferSize, 0),
      resourceCount: resources.length,
    };
  });
  await mkdir('docs/evidence', { recursive: true });
  await writeFile(
    `docs/evidence/lab-${testInfo.project.name}.json`,
    `${JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        viewport: testInfo.project.use.viewport,
        buildMode: policy.includes("'unsafe-eval'") ? 'development' : 'production',
        scope:
          'Single local Chromium cold navigation; no network/CPU throttling and no field percentile claim',
        ...measurement,
        targetCompressedBytes: 512000,
      },
      null,
      2,
    )}\n`,
  );
  await noHorizontalOverflow(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  const landing = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(landing.violations).toEqual([]);
  await mkdir('docs/evidence', { recursive: true });
  await page.screenshot({
    path: `docs/evidence/landing-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.goto('/courses');
  await page.getByRole('searchbox').fill('nothing-matches-this-course');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No courses match just yet.' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByText('Everyday digital skills', { exact: true })).toBeVisible();
  await noHorizontalOverflow(page);
});

test('learner enrolls, completes and restores a lesson, practices, and receives a durable receipt', async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page, await createLearner(request));
  await enroll(page);
  await page.goto('/lesson/activity-files');
  await page.getByRole('button', { name: 'Mark lesson complete', exact: true }).click();
  await expect(page.getByText('Synced to your account', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Completed', exact: true })).toBeDisabled();
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: `docs/evidence/lesson-${testInfo.project.name}.png`,
    fullPage: true,
  });
  const lesson = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(lesson.violations).toEqual([]);
  await page.goto('/practice/activity-file-practice');
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await page.getByLabel('2026-10-25_tea-receipt.jpg', { exact: false }).check();
  await page.getByLabel('Keep a separate copy in a safe location', { exact: false }).check();
  await page.getByLabel('Check that the backup opens', { exact: false }).check();
  await page.getByLabel('Your answer', { exact: true }).fill('folder');
  await page.getByRole('button', { name: 'Check my answers', exact: true }).click();
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.goto('/assignment/activity-portfolio');
  await page
    .getByLabel('A note for your instructor', { exact: false })
    .fill(
      'I organized fictional receipt files, wrote a clear message, and checked named sharing permissions.',
    );
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('A note for your instructor', { exact: false })).toHaveValue(
    /fictional receipt/,
  );
  await page.getByRole('button', { name: 'Submit assignment', exact: true }).click();
  await expect(page.getByText('Submission receipt', { exact: false }).first()).toBeVisible();
  const receipt = await page.locator('.receipt span').innerText();
  await page.reload();
  await expect(page.locator('.receipt span')).toHaveText(receipt);
  await expect(page.getByRole('button', { name: 'Submit assignment', exact: true })).toBeDisabled();
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test('offline lesson progress is acknowledged on reconnection and private caches clear on sign out', async ({
  page,
  request,
  context,
}) => {
  await signIn(page, await createLearner(request));
  await enroll(page);
  await page.goto('/lesson/activity-files');
  await page.getByRole('button', { name: 'Save for offline', exact: true }).click();
  await expect(page.getByText(/saved on this device for 7 days/)).toBeVisible();
  await context.setOffline(true);
  await expect(page.locator('.offline-bar')).toContainText(
    'You’re offline. Downloaded lessons are still here.',
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Downloaded lessons', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Give every file a useful home', exact: true }).click();
  await page.getByRole('button', { name: 'Mark lesson complete', exact: true }).click();
  await expect(
    page.getByText('Saved on this device. Waiting to sync.', { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('link', { name: 'Return to Pathway', exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const open = indexedDB.open('pathway-offline-v1');
          open.onsuccess = () => resolve(open.result);
          open.onerror = () => reject(open.error);
        });
        const tx = db.transaction('events', 'readonly');
        return new Promise<number>((resolve) => {
          const query = tx.objectStore('events').count();
          query.onsuccess = () => resolve(query.result);
        });
      }),
    )
    .toBe(0);
  await page.goto('/lesson/activity-files');
  await expect(page.getByRole('button', { name: 'Completed', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /Account menu for/ }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    await page.evaluate(async () => {
      const open = indexedDB.open('pathway-offline-v1');
      const db = await new Promise<IDBDatabase>((resolve) => {
        open.onsuccess = () => resolve(open.result);
      });
      return Promise.all(
        ['lessons', 'events', 'identity', 'drafts'].map(
          (name) =>
            new Promise<number>((resolve) => {
              const query = db.transaction(name).objectStore(name).count();
              query.onsuccess = () => resolve(query.result);
            }),
        ),
      );
    }),
  ).toEqual([0, 0, 0, 0]);
});
