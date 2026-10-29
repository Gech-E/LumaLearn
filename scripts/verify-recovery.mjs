/* global AbortSignal */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { access, chmod, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';

// A bounded, local-only restore drill. Existing databases and buckets are never altered.
const workspace = fileURLToPath(new URL('../', import.meta.url));
const requireApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { parse } = requireApi('dotenv');
const { S3Client, CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand } =
  requireApi('@aws-sdk/client-s3');
const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
const maximumArchiveBytes = 256 * 1024 * 1024;
const maximumObjectBytes = 10 * 1024 * 1024;
const maximumTotalObjectBytes = 200 * 1024 * 1024;
const output = path.join(workspace, '.local/recovery-verification.json');
const startedAt = Date.now();
const evidence = {
  startedAt: new Date(startedAt).toISOString(),
  result: 'running',
  scope: 'Local PostgreSQL test database and local private S3 adapter only',
  productionRecoveryTargetsValidated: false,
  checks: [],
};
let storage;

function check(name, extra = {}) {
  evidence.checks.push({ name, passed: true, ...extra });
  console.log(`PASS: ${name}`);
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function run(executable, args, { env = process.env, input, label } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, shell: false, windowsHide: true });
    const chunks = [];
    let received = 0;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${label} exceeded the two-minute command limit`));
    }, 120000);
    child.stdout.on('data', (chunk) => {
      received += chunk.length;
      if (received > maximumArchiveBytes) {
        child.kill();
        reject(new Error(`${label} exceeded the bounded output limit`));
      } else chunks.push(chunk);
    });
    // Provider/SQL stderr may contain private data. Keep failure labels generic.
    child.stderr.resume();
    child.on('error', () => {
      clearTimeout(timer);
      reject(new Error(`${label} could not start`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${label} failed with exit code ${code}`));
      else resolve(Buffer.concat(chunks).toString('utf8').trim());
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

function localStorageUrl(value) {
  const url = new URL(value);
  assert(
    url.protocol === 'http:' &&
      loopback.has(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash,
    'Object storage must be a canonical HTTP loopback URL',
  );
  return url;
}

function encrypt(bytes, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
}

function decrypt(bytes, key) {
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
}

async function protectDirectory(directory) {
  await mkdir(directory, { recursive: false, mode: 0o700 });
  if (process.platform !== 'win32') return;
  const identity = await run('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
    label: 'Current Windows identity lookup',
  });
  const sid = identity.match(/S-1-\d+(?:-\d+)+/)?.[0];
  assert(sid, 'The current Windows identity must have a SID');
  await run(
    'icacls.exe',
    [
      directory,
      '/inheritance:r',
      '/grant:r',
      `*${sid}:(OI)(CI)F`,
      '*S-1-5-18:(OI)(CI)F',
      '*S-1-5-32-544:(OI)(CI)F',
    ],
    { label: 'Backup directory access restriction' },
  );
}

async function main() {
  const fileEnvironment = parse(await readFile(path.join(workspace, 'apps/api/.env')));
  const configuration = { ...fileEnvironment, ...process.env };
  assert(configuration.NODE_ENV !== 'production', 'This drill refuses a production environment');
  const databaseValue = process.env.PATHWAY_RECOVERY_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  assert(databaseValue, 'Set PATHWAY_RECOVERY_DATABASE_URL or TEST_DATABASE_URL explicitly');
  const database = new URL(databaseValue);
  const sourceDatabase = decodeURIComponent(database.pathname.slice(1));
  assert(
    ['postgresql:', 'postgres:'].includes(database.protocol) &&
      loopback.has(database.hostname) &&
      /^[a-z0-9_]+_test$/.test(sourceDatabase) &&
      database.username &&
      !database.hash,
    'Source must be a PostgreSQL loopback database whose name ends in _test',
  );
  const schema = database.searchParams.get('schema');
  assert(!schema || schema === 'public', 'The drill only supports the public schema');
  const endpoint = localStorageUrl(configuration.S3_ENDPOINT ?? 'http://127.0.0.1:9000');
  const sourceBucket = configuration.S3_BUCKET;
  assert(
    sourceBucket && configuration.S3_ACCESS_KEY && configuration.S3_SECRET_KEY,
    'Storage configuration is required',
  );
  const suffix = `${Date.now()}_${randomBytes(4).toString('hex')}`;
  const restoredDatabase = `pathway_${suffix}_restore_test`;
  const restoredBucket = `pathway-recovery-${suffix.replaceAll('_', '-')}`;
  assert(restoredDatabase !== sourceDatabase && restoredBucket !== sourceBucket);
  const backupParent = path.join(workspace, '.local/backups');
  await mkdir(backupParent, { recursive: true, mode: 0o700 });
  const backupDirectory = path.join(backupParent, `recovery-${suffix}`);
  assert(
    path.dirname(backupDirectory) === backupParent,
    'Backup directory must remain inside .local/backups',
  );
  await protectDirectory(backupDirectory);
  evidence.backupDirectory = backupDirectory;
  const encryptionKey = randomBytes(32);
  await writeFile(path.join(backupDirectory, 'local-drill-key.bin'), encryptionKey, {
    mode: 0o600,
    flag: 'wx',
  });
  const binaries =
    process.env.PATHWAY_POSTGRES_BIN ??
    (process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '');
  const executable = (name) =>
    binaries ? path.join(binaries, `${name}${process.platform === 'win32' ? '.exe' : ''}`) : name;
  if (binaries) await access(executable('pg_dump'));
  const databaseEnvironment = {
    ...process.env,
    PGPASSWORD: decodeURIComponent(database.password),
    PGCONNECT_TIMEOUT: '10',
    PGAPPNAME: 'pathway-local-recovery-drill',
  };
  const connection = [
    '--host',
    database.hostname.replace(/^\[|\]$/g, ''),
    '--port',
    database.port || '5432',
    '--username',
    decodeURIComponent(database.username),
    '--no-password',
  ];
  const sql = (target, statement) =>
    run(
      executable('psql'),
      [
        ...connection,
        '--dbname',
        target,
        '--no-psqlrc',
        '--tuples-only',
        '--no-align',
        '--set',
        'ON_ERROR_STOP=on',
        '--file',
        '-',
      ],
      {
        env: databaseEnvironment,
        input: statement,
        label: 'PostgreSQL recovery verification query',
      },
    );
  const tables = JSON.parse(
    await sql(
      sourceDatabase,
      "SELECT coalesce(jsonb_agg(tablename ORDER BY tablename), '[]'::jsonb)::text FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';",
    ),
  );
  assert(
    Array.isArray(tables) &&
      tables.length > 20 &&
      tables.every((table) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(table)),
    'Only known public schema tables can enter the restore comparison',
  );
  const snapshotSql = `SELECT jsonb_build_object(${tables
    .map(
      (table) =>
        `'${table}', (SELECT jsonb_build_object('count', count(*), 'records', coalesce(jsonb_agg(to_jsonb(r) ORDER BY r."id"), '[]'::jsonb)) FROM "${table}" r)`,
    )
    .join(',')})::text;`;
  const snapshot = async (target) => {
    const raw = JSON.parse(await sql(target, snapshotSql));
    return Object.fromEntries(
      Object.entries(raw).map(([table, value]) => [
        table,
        { count: value.count, sha256: hash(JSON.stringify(value.records)) },
      ]),
    );
  };
  const version = await run(executable('pg_dump'), ['--version'], {
    label: 'PostgreSQL tool version check',
  });
  assert(/\b18\./.test(version), 'Use PostgreSQL 18 dump/restore tooling for this drill');
  const before = await snapshot(sourceDatabase);
  const dumpFile = path.join(backupDirectory, 'database.pgdump');
  await run(
    executable('pg_dump'),
    [
      ...connection,
      '--dbname',
      sourceDatabase,
      '--format=custom',
      '--no-owner',
      '--no-acl',
      '--file',
      dumpFile,
    ],
    { env: databaseEnvironment, label: 'PostgreSQL custom-format backup' },
  );
  await chmod(dumpFile, 0o600);
  const archiveSize = (await stat(dumpFile)).size;
  assert(
    archiveSize > 0 && archiveSize <= maximumArchiveBytes,
    'Archive must remain within the local drill size limit',
  );
  const archive = await readFile(dumpFile);
  const archiveBackup = path.join(backupDirectory, 'database.pgdump.aesgcm');
  await writeFile(archiveBackup, encrypt(archive, encryptionKey), { mode: 0o600, flag: 'wx' });
  await unlink(dumpFile);
  const after = await snapshot(sourceDatabase);
  assert.deepEqual(
    before,
    after,
    'Source learning records changed during backup; repeat during an idle test window',
  );
  check('Custom-format database backup captured a stable test dataset', {
    archiveBytes: archiveSize,
  });
  const backupCompletedAt = Date.now();
  const exists = await sql(
    sourceDatabase,
    `SELECT count(*) FROM pg_database WHERE datname = '${restoredDatabase}';`,
  );
  assert.equal(exists, '0', 'Restore database must not already exist');
  await run(executable('createdb'), [...connection, '--template', 'template0', restoredDatabase], {
    env: databaseEnvironment,
    label: 'New isolated restore database creation',
  });
  evidence.restoredDatabase = restoredDatabase;
  await run(
    executable('pg_restore'),
    [...connection, '--dbname', restoredDatabase, '--no-owner', '--no-acl', '--exit-on-error'],
    {
      env: databaseEnvironment,
      input: decrypt(await readFile(archiveBackup), encryptionKey),
      label: 'Isolated PostgreSQL archive restore',
    },
  );
  const restored = await snapshot(restoredDatabase);
  assert.deepEqual(restored, after, 'Restored data counts and record hashes must match the backup');
  check('Restored course, enrollment, receipt, grade, audit and progress records match', {
    tables: restored,
  });
  storage = new S3Client({
    endpoint: endpoint.href,
    region: configuration.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: configuration.S3_ACCESS_KEY,
      secretAccessKey: configuration.S3_SECRET_KEY,
    },
    maxAttempts: 2,
  });
  const send = (command) => storage.send(command, { abortSignal: AbortSignal.timeout(30000) });
  let bucketExists = true;
  try {
    await send(new HeadBucketCommand({ Bucket: restoredBucket }));
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404) bucketExists = false;
    else throw new Error('Restore bucket availability check failed');
  }
  assert.equal(bucketExists, false, 'Restore bucket must not already exist');
  await send(new CreateBucketCommand({ Bucket: restoredBucket }));
  evidence.restoredBucket = restoredBucket;
  const assets = JSON.parse(
    await sql(
      sourceDatabase,
      `SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a."id"), '[]'::jsonb)::text FROM "Asset" a;`,
    ),
  );
  const requiredIds = new Set(
    JSON.parse(
      await sql(
        sourceDatabase,
        `SELECT coalesce(jsonb_agg(DISTINCT asset_id), '[]'::jsonb)::text FROM (SELECT unnest("assetIds") AS asset_id FROM "Submission" UNION SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof("snapshot"->'assetIds') = 'array' THEN "snapshot"->'assetIds' ELSE '[]'::jsonb END) AS asset_id FROM "SubmissionReceipt") referenced;`,
      ),
    ),
  );
  assert(assets.length <= 100, 'The local drill is limited to 100 asset metadata records');
  const objects = [];
  let missingUnreferencedFixtures = 0;
  let totalBytes = 0;
  for (const asset of assets) {
    assert(
      !asset.key.split('/').some((part) => part === '.' || part === '..'),
      'Asset keys must not contain traversal segments',
    );
    let source;
    try {
      source = await send(new GetObjectCommand({ Bucket: sourceBucket, Key: asset.key }));
    } catch (error) {
      if (
        error?.$metadata?.httpStatusCode === 404 &&
        asset.status !== 'CLEAN' &&
        !requiredIds.has(asset.id)
      ) {
        missingUnreferencedFixtures++;
        continue;
      }
      throw new Error('A required source object is missing or unavailable');
    }
    assert(
      source.Body && source.ContentLength > 0 && source.ContentLength <= maximumObjectBytes,
      'Object exceeds the local drill size limit',
    );
    const bytes = Buffer.from(await source.Body.transformToByteArray());
    totalBytes += bytes.length;
    assert(
      totalBytes <= maximumTotalObjectBytes,
      'Objects exceed the total local drill size limit',
    );
    assert.equal(bytes.length, asset.size, 'Source asset size must match metadata');
    const file = `object-${objects.length}.aesgcm`;
    await writeFile(path.join(backupDirectory, file), encrypt(bytes, encryptionKey), {
      mode: 0o600,
      flag: 'wx',
    });
    const restoredBytes = decrypt(await readFile(path.join(backupDirectory, file)), encryptionKey);
    await send(
      new PutObjectCommand({
        Bucket: restoredBucket,
        Key: asset.key,
        Body: restoredBytes,
        ContentType: asset.mime,
        CacheControl: 'private, no-store',
      }),
    );
    const downloaded = await send(new GetObjectCommand({ Bucket: restoredBucket, Key: asset.key }));
    const downloadedBytes = Buffer.from(await downloaded.Body.transformToByteArray());
    assert.equal(
      hash(downloadedBytes),
      hash(bytes),
      'Restored object bytes must match their source',
    );
    const anonymousUrl = new URL(
      `${restoredBucket}/${asset.key.split('/').map(encodeURIComponent).join('/')}`,
      endpoint,
    );
    const anonymous = await fetch(anonymousUrl, {
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    await anonymous.body?.cancel();
    assert.equal(anonymous.status, 403, 'Restored bucket must deny unsigned object download');
    objects.push({
      assetId: asset.id,
      key: asset.key,
      file,
      bytes: bytes.length,
      sha256: hash(bytes),
    });
  }
  assert(
    objects.length > 0,
    'Run the real-service upload verification first; at least one real object is required',
  );
  await writeFile(
    path.join(backupDirectory, 'manifest.json'),
    JSON.stringify(
      { sourceDatabase, sourceBucket, archiveSha256: hash(archive), objects },
      null,
      2,
    ),
    { mode: 0o600, flag: 'wx' },
  );
  check('Private object backup and isolated restore preserve bytes and reject anonymous access', {
    restoredObjects: objects.length,
    totalBytes,
    missingUnreferencedFixtureMetadata: missingUnreferencedFixtures,
  });
  evidence.backupDirectory = backupDirectory;
  evidence.sourceDatabase = sourceDatabase;
  evidence.backupCompletedAt = new Date(backupCompletedAt).toISOString();
  evidence.restoreElapsedMilliseconds = Date.now() - backupCompletedAt;
  evidence.retainedArtifacts =
    'New restore database, private restore bucket and encrypted local backup retained for inspection. Existing stores were not altered.';
  evidence.result = 'passed';
}

try {
  await main();
} catch (error) {
  evidence.result = 'failed';
  // Native errors can contain credentials/queries; only controlled assertion text is safe.
  evidence.failure =
    error instanceof assert.AssertionError
      ? error.message.split('\n')[0]
      : 'Recovery drill failed; inspect the failing operation locally without exposing private values.';
  console.error(evidence.failure);
  process.exitCode = 1;
} finally {
  storage?.destroy();
  evidence.completedAt = new Date().toISOString();
  evidence.elapsedMilliseconds = Date.now() - startedAt;
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}
