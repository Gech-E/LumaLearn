/* global AbortSignal, Blob, FormData */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

// This creates an isolated fictional learner and two private upload fixtures.
// It only talks to loopback services and sends mail to the local Mailpit sink.
// Credentials, recovery links, cookies, signed URLs and file bodies stay in memory.
const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
function localUrl(value, label) {
  const url = new URL(value);
  assert(
    url.protocol === 'http:' && loopback.has(url.hostname) && !url.username && !url.password,
    `${label} must be an HTTP loopback URL`,
  );
  return url;
}
const apiBase = localUrl(process.env.PATHWAY_VERIFY_API_URL ?? 'http://127.0.0.1:4000', 'API');
const mailpitBase = localUrl(
  process.env.PATHWAY_VERIFY_MAILPIT_URL ?? 'http://127.0.0.1:8025',
  'Mailpit',
);
const origin = localUrl(
  process.env.PATHWAY_VERIFY_WEB_ORIGIN ?? 'http://localhost:3000',
  'Web origin',
).origin;
const envText = await readFile(new URL('../apps/api/.env', import.meta.url), 'utf8');
const configuration = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => /^\s*[A-Z_]+\s*=/.test(line))
    .map((line) => {
      const split = line.indexOf('=');
      return [
        line.slice(0, split).trim(),
        line
          .slice(split + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ''),
      ];
    }),
);
assert(
  loopback.has(configuration.SMTP_HOST ?? '127.0.0.1') &&
    Number(configuration.SMTP_PORT ?? 1025) === 1025,
  'The API .env must point SMTP to the local Mailpit port 1025',
);
assert(
  configuration.NODE_ENV !== 'production',
  'This verification must use the local development configuration',
);

const evidence = { startedAt: new Date().toISOString(), result: 'running', checks: [] };
const output = new URL('../.local/service-verification.json', import.meta.url);
let cookie;
let csrf;
let fixtureEmail;
function record(name, details = {}) {
  evidence.checks.push({ name, passed: true, ...details });
  console.log(`PASS ${name}`);
}
async function persist() {
  await mkdir(new URL('../.local/', import.meta.url), { recursive: true });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
}
async function api(path, { method = 'GET', body, expected = 200, authenticated = true } = {}) {
  const isForm = body instanceof FormData;
  const headers = {
    Origin: origin,
    ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
  };
  if (authenticated && cookie) headers.Cookie = cookie;
  if (authenticated && csrf) headers['X-CSRF-Token'] = csrf;
  const response = await fetch(new URL(`/api/v1${path}`, apiBase), {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(30000),
    redirect: 'error',
  });
  assert.equal(response.status, expected, `${method} ${path} returned an unexpected HTTP status`);
  const data = await response.json();
  return { response, data };
}
async function poll(name, action, timeout = 120000) {
  const expiresAt = Date.now() + timeout;
  while (Date.now() < expiresAt) {
    const value = await action();
    if (value) return value;
    await delay(2000);
  }
  throw new Error(`${name} did not complete before its local verification timeout`);
}
async function readiness() {
  return poll('Dependency readiness', async () => {
    try {
      const response = await fetch(new URL('/api/v1/health/ready', apiBase), {
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return null;
      const data = await response.json();
      const required = ['database', 'redis', 'storage', 'scanner', 'email', 'worker'];
      return data.status === 'ready' && required.every((name) => data.dependencies?.[name] === true)
        ? data.dependencies
        : null;
    } catch {
      return null;
    }
  });
}
async function accountLink(subject, pathname) {
  return poll('Local Mailpit delivery', async () => {
    const listing = await fetch(new URL('/api/v1/messages?limit=100', mailpitBase), {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(listing.status, 200, 'Mailpit inbox must be available locally');
    const messages = (await listing.json()).messages;
    assert(Array.isArray(messages), 'Mailpit must return its message list');
    const summary = messages.find(
      (message) =>
        message.Subject === subject &&
        message.To?.some((recipient) => recipient.Address === fixtureEmail),
    );
    if (!summary) return null;
    const response = await fetch(
      new URL(`/api/v1/message/${encodeURIComponent(summary.ID)}`, mailpitBase),
      { signal: AbortSignal.timeout(10000) },
    );
    assert.equal(response.status, 200, 'Mailpit must return the verification message');
    const message = await response.json();
    const link = message.Text?.match(/https?:\/\/\S+/)?.[0];
    assert(link, 'The local account message must contain an account link');
    const url = localUrl(link, 'Account email link');
    assert.equal(url.pathname, pathname, 'Account email must link to the expected screen');
    assert(url.searchParams.get('token'), 'Account email must contain a token');
    return url.searchParams.get('token');
  });
}
async function login(email, password) {
  const result = await api('/auth/login', {
    method: 'POST',
    body: { email, password },
    expected: 201,
    authenticated: false,
  });
  const sessionCookie = result.response.headers
    .getSetCookie()
    .find((value) => value.startsWith('pathway_session='));
  assert(sessionCookie?.includes('HttpOnly'), 'Sign-in must return an HttpOnly session cookie');
  cookie = sessionCookie.split(';')[0];
  csrf = result.data.csrfToken;
  assert(typeof csrf === 'string' && csrf.length > 30, 'Sign-in must return a CSRF token');
  return result.data;
}
async function upload(text, filename) {
  const body = new FormData();
  body.append('file', new Blob([text], { type: 'text/plain' }), filename);
  const { data } = await api('/media/upload', { method: 'POST', body, expected: 201 });
  assert.equal(data.status, 'QUARANTINED', 'New uploads must start in quarantine');
  return data.id;
}
async function scanResult(id, expected) {
  return poll(
    'Worker antivirus verdict',
    async () => {
      const { data } = await api(`/media/${id}`);
      if (data.status === 'QUARANTINED' || data.status === 'UPLOADING') return null;
      assert.equal(data.status, expected, 'The real scanner must produce the expected verdict');
      return data;
    },
    180000,
  );
}

try {
  record('All six readiness dependencies are healthy', { dependencies: await readiness() });
  fixtureEmail = `services-${randomUUID()}@pathway.local`;
  const password = `Pathway-${randomBytes(24).toString('base64url')}!`;
  await api('/auth/register', {
    method: 'POST',
    body: { email: fixtureEmail, name: 'Local service verification', password },
    expected: 201,
    authenticated: false,
  });
  const verifyToken = await accountLink('Verify your Pathway email', '/verify');
  record('Registration email delivered through the worker to local Mailpit');
  await api('/auth/verify', {
    method: 'POST',
    body: { token: verifyToken },
    expected: 201,
    authenticated: false,
  });
  const identity = await login(fixtureEmail, password);
  assert.equal(identity.user.verified, true);
  record('Email verification and cookie sign-in succeed');

  const cleanText = 'Pathway local integration fixture. A safe, ordinary UTF-8 text attachment.\n';
  const cleanId = await upload(cleanText, 'local-clean.txt');
  await scanResult(cleanId, 'CLEAN');
  const { data: download } = await api(`/media/${cleanId}/download`);
  assert.equal(download.expiresIn, 60);
  const signedUrl = localUrl(download.url, 'Private object download');
  const cleanDownload = await fetch(signedUrl, {
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  assert.equal(cleanDownload.status, 200);
  assert.equal(await cleanDownload.text(), cleanText);
  const unsignedUrl = new URL(signedUrl);
  unsignedUrl.search = '';
  const anonymous = await fetch(unsignedUrl, {
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  assert.equal(anonymous.status, 403, 'The storage object must deny unsigned public access');
  record('Clean upload passes API, private S3, worker, and real ClamAV', { assetId: cleanId });
  record('Clean signed download matches uploaded bytes and unsigned access is denied');

  // Assemble the standard harmless antivirus test signature only in memory.
  const eicar = [
    'X5O!P%@AP[4',
    String.fromCharCode(92),
    'PZX54(P^)7CC)7}',
    '$EICAR-',
    'STANDARD-ANTIVIRUS-',
    'TEST-FILE!$H+H*',
  ].join('');
  assert.equal(eicar.length, 68);
  const rejectedId = await upload(eicar, 'local-antivirus-check.txt');
  await scanResult(rejectedId, 'REJECTED');
  const { data: denied } = await api(`/media/${rejectedId}/download`, { expected: 400 });
  assert.equal(denied.code, 'FILE_NOT_READY');
  assert.equal(denied.url, undefined);
  record('Standard EICAR fixture is rejected by real ClamAV and download is denied', {
    assetId: rejectedId,
  });

  await api('/auth/recover', {
    method: 'POST',
    body: { email: fixtureEmail },
    expected: 201,
    authenticated: false,
  });
  const recoveryToken = await accountLink('Reset your Pathway password', '/reset-password');
  record('Password recovery email delivered through the worker to local Mailpit');
  const replacement = `Pathway-${randomBytes(24).toString('base64url')}!`;
  await api('/auth/reset', {
    method: 'POST',
    body: { token: recoveryToken, password: replacement },
    expected: 201,
    authenticated: false,
  });
  await api('/auth/session', { expected: 401 });
  await api('/auth/reset', {
    method: 'POST',
    body: { token: recoveryToken, password },
    expected: 400,
    authenticated: false,
  });
  await api('/auth/login', {
    method: 'POST',
    body: { email: fixtureEmail, password },
    expected: 401,
    authenticated: false,
  });
  await login(fixtureEmail, replacement);
  record('Recovery revokes the old session, consumes the link once, and permits the new password');
  await api('/auth/logout', { method: 'POST', body: {}, expected: 201 });
  cookie = undefined;
  csrf = undefined;
  record('Verification account signed out');
  record('Final readiness remains healthy', { dependencies: await readiness() });
  evidence.result = 'passed';
} catch (error) {
  evidence.result = 'failed';
  // Assertions include only stable action labels and status codes, never tokens.
  evidence.error = error instanceof Error ? error.message : 'Local verification failed';
  console.error(`FAIL ${evidence.error}`);
  process.exitCode = 1;
} finally {
  if (cookie) {
    try {
      await api('/auth/logout', { method: 'POST', body: {}, expected: 201 });
    } catch {
      /* recovery may already have revoked this cookie */
    }
  }
  evidence.completedAt = new Date().toISOString();
  await persist();
  console.log('Saved token-free evidence to .local/service-verification.json');
}
