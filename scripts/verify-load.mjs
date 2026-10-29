/* global AbortSignal */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const requireApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
requireApi('dotenv').config({ path: new URL('../apps/api/.env', import.meta.url), quiet: true });
const databaseUrl = new URL(process.env.TEST_DATABASE_URL || '');
assert(
  ['127.0.0.1', 'localhost'].includes(databaseUrl.hostname) &&
    databaseUrl.pathname.endsWith('_test'),
  'Use an isolated local test database.',
);
const api = new URL(process.env.PATHWAY_LOAD_API_URL || 'http://127.0.0.1:4000');
assert(
  api.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(api.hostname),
  'Load checks may only target a local test API.',
);
const { PrismaClient } = requireApi('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
const sessions = 100;
const simultaneousRequests = 10;
const runId = randomUUID();
const measurements = [];
const errors = [];
const startedAt = new Date().toISOString();

async function request(user, path, method = 'GET', data) {
  const start = performance.now();
  const response = await fetch(new URL(`/api/v1${path}`, api), {
    method,
    headers: {
      Origin: 'http://localhost:3000',
      Cookie: `pathway_session=${user.token}`,
      'X-CSRF-Token': user.csrf,
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json();
  measurements.push({
    route: `${method} ${path}`,
    milliseconds: performance.now() - start,
    status: response.status,
  });
  if (!response.ok) errors.push({ route: path, status: response.status, code: body.code });
  return body;
}
const percentile = (values, percentile) =>
  values.length ? values.toSorted((a, b) => a - b)[Math.ceil(values.length * percentile) - 1] : 0;

try {
  const course = await db.course.findUniqueOrThrow({ where: { id: 'course-digital-essentials' } });
  assert(course.currentVersionId && course.state === 'PUBLISHED');
  const passwordHash = await requireApi('argon2').hash(randomBytes(32));
  const users = Array.from({ length: sessions }, () => ({
    id: randomUUID(),
    membershipId: randomUUID(),
    token: randomBytes(32).toString('base64url'),
    csrf: randomBytes(32).toString('base64url'),
    eventId: randomUUID(),
    requestId: randomUUID(),
  }));
  // Fixtures use the same authoritative membership/session/enrollment constraints.
  // Password-login throughput is intentionally excluded from this core-learning benchmark.
  await db.$transaction(
    async (tx) => {
      await tx.user.createMany({
        data: users.map((user) => ({
          id: user.id,
          email: `load-${runId}-${user.id}@pathway.local`,
          name: 'Fictional load fixture',
          passwordHash,
          verifiedAt: new Date(),
          timezone: 'Africa/Nairobi',
        })),
      });
      await tx.membership.createMany({
        data: users.map((user) => ({
          id: user.membershipId,
          userId: user.id,
          organizationId: course.organizationId,
        })),
      });
      await tx.roleAssignment.createMany({
        data: users.map((user) => ({ membershipId: user.membershipId, role: 'LEARNER' })),
      });
      await tx.session.createMany({
        data: users.map((user) => ({
          userId: user.id,
          membershipId: user.membershipId,
          tokenHash: createHash('sha256').update(user.token).digest('hex'),
          csrfToken: user.csrf,
          expiresAt: new Date(Date.now() + 3600000),
        })),
      });
      await tx.enrollment.createMany({
        data: users.map((user) => ({
          userId: user.id,
          courseId: course.id,
          courseVersionId: course.currentVersionId,
        })),
      });
    },
    { timeout: 30000 },
  );
  let next = 0;
  await Promise.all(
    Array.from({ length: simultaneousRequests }, async () => {
      while (next < users.length) {
        const user = users[next++];
        try {
          await request(user, '/learning/home');
          await request(user, '/learning/progress', 'POST', {
            eventId: user.eventId,
            activityId: 'activity-files',
            state: 'COMPLETED',
          });
          await request(user, '/submissions/activity-portfolio', 'PUT', {
            text: 'Fictional local load-check portfolio. No personal information.',
            assetIds: [],
          });
          const first = await request(user, '/submissions/activity-portfolio/submit', 'POST', {
            requestId: user.requestId,
          });
          const retry = await request(user, '/submissions/activity-portfolio/submit', 'POST', {
            requestId: user.requestId,
          });
          if (!first.receipt || first.receipt !== retry.receipt)
            errors.push({ route: 'submission receipt retry', status: 0, code: 'RECEIPT_MISMATCH' });
        } catch {
          errors.push({ route: 'fixture workflow', status: 0, code: 'TRANSPORT_FAILURE' });
        }
      }
    }),
  );
  const routes = [...new Set(measurements.map((item) => item.route))].map((route) => {
    const values = measurements
      .filter((item) => item.route === route)
      .map((item) => item.milliseconds);
    return {
      route,
      requests: values.length,
      p50ms: Math.round(percentile(values, 0.5)),
      p95ms: Math.round(percentile(values, 0.95)),
      maximumMs: Math.round(Math.max(...values)),
    };
  });
  const p95ms = Math.round(
    percentile(
      measurements.map((item) => item.milliseconds),
      0.95,
    ),
  );
  const evidence = {
    startedAt,
    completedAt: new Date().toISOString(),
    scope:
      'Local production-build API with real PostgreSQL; credential login and cloud network excluded',
    sessions,
    simultaneousRequests,
    requests: measurements.length,
    errors,
    p95ms,
    targetP95ms: 500,
    latencyTargetMet: p95ms < 500,
    routes,
    result: errors.length ? 'failed' : 'passed',
  };
  await mkdir(new URL('../.local/', import.meta.url), { recursive: true });
  await writeFile(
    new URL('../.local/load-verification.json', import.meta.url),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({
      sessions,
      simultaneousRequests,
      requests: measurements.length,
      errorCount: errors.length,
      p95ms,
      latencyTargetMet: evidence.latencyTargetMet,
    }),
  );
  assert.equal(errors.length, 0, 'Core-learning load check had request or receipt failures.');
} finally {
  await db.$disconnect();
}
