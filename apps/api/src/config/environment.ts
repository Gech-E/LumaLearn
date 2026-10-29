import { z } from 'zod';

function validUrl(value: string, predicate: (url: URL) => boolean) {
  try {
    return predicate(new URL(value));
  } catch {
    return false;
  }
}
const httpUrl = z
  .string()
  .url()
  .refine(
    (value) =>
      validUrl(
        value,
        (url) =>
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash,
      ),
    'Use an HTTP(S) URL without credentials, query parameters or fragments',
  );
const webOrigin = httpUrl.refine(
  (value) => validUrl(value, (url) => url.origin === value),
  'WEB_ORIGIN must be an origin without a trailing slash or path',
);
const port = z.coerce.number().int().min(1).max(65535);
const optionalCredential = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const Environment = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(4000),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) =>
        validUrl(
          value,
          (url) =>
            url.protocol === 'postgresql:' &&
            Boolean(url.hostname) &&
            url.pathname.length > 1 &&
            !url.hash,
        ),
      'Use a PostgreSQL URL with a host and database',
    ),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
  WEB_ORIGIN: webOrigin.default('http://localhost:3000'),
  DEFAULT_ORGANIZATION_ID: z.string().min(1).default('org-pathway'),
  REDIS_URL: z
    .string()
    .url()
    .refine(
      (value) =>
        validUrl(
          value,
          (url) =>
            ['redis:', 'rediss:'].includes(url.protocol) &&
            (url.pathname === '' || /^\/(\d+)?$/.test(url.pathname)) &&
            !url.search &&
            !url.hash,
        ),
      'Use redis:// or rediss:// with an optional numeric database path',
    )
    .default('redis://127.0.0.1:6379'),
  S3_ENDPOINT: httpUrl.default('http://127.0.0.1:9000'),
  S3_PUBLIC_ENDPOINT: httpUrl.default('http://localhost:9000'),
  S3_BUCKET: z.string().min(3).default('pathway-private'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(3),
  S3_SECRET_KEY: z.string().min(8),
  SMTP_HOST: z
    .string()
    .min(1)
    .regex(/^[^\s]+$/)
    .default('127.0.0.1'),
  SMTP_PORT: port.default(1025),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: optionalCredential,
  SMTP_PASSWORD: optionalCredential,
  MAIL_FROM: z.string().default('Pathway <learning@pathway.local>'),
  CLAMAV_HOST: z
    .string()
    .min(1)
    .regex(/^[^\s]+$/)
    .default('127.0.0.1'),
  CLAMAV_PORT: port.default(3310),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10000).default(100),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(86400000).default(900000),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  MFA_ENCRYPTION_KEY: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
});
export function validateEnvironment(input: Record<string, unknown>) {
  const parsed = Environment.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ')}`,
    );
  if (Boolean(parsed.data.SMTP_USER) !== Boolean(parsed.data.SMTP_PASSWORD))
    throw new Error('Configure both SMTP_USER and SMTP_PASSWORD, or neither');
  if (parsed.data.NODE_ENV === 'production') {
    if (
      parsed.data.COOKIE_SECURE !== 'true' ||
      !parsed.data.WEB_ORIGIN.startsWith('https://') ||
      !parsed.data.S3_PUBLIC_ENDPOINT.startsWith('https://') ||
      !parsed.data.MFA_ENCRYPTION_KEY
    )
      throw new Error(
        'Production requires HTTPS web and public storage URLs, secure cookies, and MFA_ENCRYPTION_KEY',
      );
    if (
      ['pathway-local-storage', 'pathway-local-secret'].includes(parsed.data.S3_SECRET_KEY) ||
      parsed.data.MFA_ENCRYPTION_KEY.toLowerCase() ===
        '8f792ce1ab694e83e59b3b5e15ab978ed9cd8cd6a650b2fcab5a2737a16cf4a1' ||
      decodeURIComponent(new URL(parsed.data.DATABASE_URL).password) === 'pathway-local-db' ||
      input.DEMO_PASSWORD
    )
      throw new Error('Remove development credentials before production');
    if (
      ['127.0.0.1', 'localhost', '::1'].includes(parsed.data.SMTP_HOST.toLowerCase()) &&
      parsed.data.SMTP_PORT === 1025
    )
      throw new Error(
        'Production must use a delivery service rather than the local development mail inbox',
      );
  }
  return parsed.data;
}

/** process.env stringifies undefined, so optional credentials must be removed explicitly. */
export function applyValidatedEnvironment(
  environment: Record<string, string | undefined> = process.env,
) {
  const validated = validateEnvironment(environment);
  for (const [key, value] of Object.entries(validated)) {
    if (value === undefined) delete environment[key];
    else environment[key] = String(value);
  }
  return validated;
}
