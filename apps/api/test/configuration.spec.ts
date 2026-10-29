import { accountDelivery } from '../src/auth/auth.delivery';
import { applyValidatedEnvironment, validateEnvironment } from '../src/config/environment';
import express from 'express';
import request from 'supertest';
import { configureProxyTrust } from '../src/http/trusted-proxy';

const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://fixture:fictional-password@127.0.0.1:55432/pathway_test',
  WEB_ORIGIN: 'https://learn.example.com',
  S3_ENDPOINT: 'https://storage.example.com',
  S3_PUBLIC_ENDPOINT: 'https://storage.example.com',
  S3_ACCESS_KEY: 'fictional-access-key',
  S3_SECRET_KEY: 'fictional-test-storage-secret',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: 587,
  COOKIE_SECURE: 'true',
  MFA_ENCRYPTION_KEY: '1a'.repeat(32),
};

describe('deployment configuration boundaries', () => {
  test('applies worker defaults without converting empty optional credentials into literal undefined strings', () => {
    const environment: Record<string, string | undefined> = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://fixture:password@localhost/pathway_test',
      S3_ACCESS_KEY: 'fixture',
      S3_SECRET_KEY: 'fictional-test-secret',
      SMTP_USER: '',
      SMTP_PASSWORD: '',
    };
    applyValidatedEnvironment(environment);
    expect(environment).not.toHaveProperty('SMTP_USER');
    expect(environment).not.toHaveProperty('SMTP_PASSWORD');
    expect(environment).not.toHaveProperty('MFA_ENCRYPTION_KEY');
    expect(environment.TRUST_PROXY_HOPS).toBe('0');
  });
  test('validates transport and bounded account protections before startup', () => {
    expect(validateEnvironment(production)).toMatchObject({
      NODE_ENV: 'production',
      SESSION_TTL_HOURS: 24,
      AUTH_RATE_LIMIT_MAX: 100,
      AUTH_RATE_LIMIT_WINDOW_MS: 900000,
      TRUST_PROXY_HOPS: 0,
    });
    expect(
      validateEnvironment({ ...production, REDIS_URL: 'rediss://cache.example.com/0' }).REDIS_URL,
    ).toBe('rediss://cache.example.com/0');
  });

  test('production rejects insecure public transport, demo secrets and the local mail sink', () => {
    const invalid = [
      { WEB_ORIGIN: 'http://learn.example.com' },
      { S3_PUBLIC_ENDPOINT: 'http://storage.example.com' },
      { COOKIE_SECURE: 'false' },
      { MFA_ENCRYPTION_KEY: undefined },
      { S3_SECRET_KEY: 'pathway-local-storage' },
      { S3_SECRET_KEY: 'pathway-local-secret' },
      { DEMO_PASSWORD: 'a-development-password' },
      { MFA_ENCRYPTION_KEY: '8f792ce1ab694e83e59b3b5e15ab978ed9cd8cd6a650b2fcab5a2737a16cf4a1' },
      { DATABASE_URL: 'postgresql://pathway:pathway-local-db@database.example.com/pathway' },
      { DATABASE_URL: 'postgresql://pathway:pathway%2Dlocal%2Ddb@database.example.com/pathway' },
      { SMTP_HOST: 'localhost', SMTP_PORT: 1025 },
    ];
    for (const setting of invalid)
      expect(() => validateEnvironment({ ...production, ...setting })).toThrow();
  });

  test('rejects malformed service addresses, unbounded values and incomplete SMTP credentials', () => {
    const invalid = [
      { WEB_ORIGIN: 'https://learn.example.com/login' },
      { WEB_ORIGIN: 'https://learn.example.com/' },
      { WEB_ORIGIN: 'not-a-url' },
      { S3_ENDPOINT: 'ftp://storage.example.com' },
      { S3_PUBLIC_ENDPOINT: 'https://user:password@storage.example.com' },
      { REDIS_URL: 'https://cache.example.com' },
      { REDIS_URL: 'redis://cache.example.com/not-a-database' },
      { SMTP_PORT: 0 },
      { CLAMAV_PORT: 65536 },
      { SESSION_TTL_HOURS: 1.5 },
      { AUTH_RATE_LIMIT_MAX: 0 },
      { AUTH_RATE_LIMIT_WINDOW_MS: 0 },
      { SMTP_USER: 'fixture-user' },
      { TRUST_PROXY_HOPS: -1 },
      { TRUST_PROXY_HOPS: 1.5 },
      { TRUST_PROXY_HOPS: 4 },
    ];
    for (const setting of invalid)
      expect(() => validateEnvironment({ ...production, ...setting })).toThrow();
  });

  test('exposes the local inbox only for explicit local development SMTP', () => {
    expect(
      accountDelivery({ NODE_ENV: 'development', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025' }),
    ).toEqual({ mode: 'local-inbox', inboxUrl: 'http://127.0.0.1:8025' });
    expect(
      accountDelivery({ NODE_ENV: 'production', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025' }),
    ).toEqual({ mode: 'email' });
    expect(
      accountDelivery({ NODE_ENV: 'test', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025' }),
    ).toEqual({ mode: 'email' });
    expect(
      accountDelivery({
        NODE_ENV: 'development',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '1025',
      }),
    ).toEqual({ mode: 'email' });
    expect(
      accountDelivery({ NODE_ENV: 'development', SMTP_HOST: 'localhost', SMTP_PORT: '587' }),
    ).toEqual({ mode: 'email' });
  });

  test('ignores forged forwarded addresses by default and trusts only the configured ingress hop count', async () => {
    const app = express();
    configureProxyTrust(app, validateEnvironment(production).TRUST_PROXY_HOPS);
    app.get('/address', (req, res) => res.json({ address: req.ip }));
    const untrusted = await request(app)
      .get('/address')
      .set('X-Forwarded-For', '198.51.100.22, 10.0.0.20')
      .expect(200);
    expect(untrusted.body.address).toMatch(/127\.0\.0\.1|::1/);
    configureProxyTrust(
      app,
      validateEnvironment({ ...production, TRUST_PROXY_HOPS: 2 }).TRUST_PROXY_HOPS,
    );
    const trusted = await request(app)
      .get('/address')
      .set('X-Forwarded-For', '203.0.113.99, 198.51.100.22, 10.0.0.20')
      .expect(200);
    expect(trusted.body.address).toBe('198.51.100.22');
  });
});
