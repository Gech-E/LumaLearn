# Running and operating Pathway

## Deployment topology

Build separate immutable API, web and migration images from the same reviewed revision. The API image also runs the worker as a separate process. Next.js serves port 3000; NestJS serves 4000. Put HTTPS at the edge and proxy browser traffic to the web service. Its same-origin `/api/v1` rewrite reaches the private API. Set `WEB_ORIGIN` to the exact HTTPS origin, `COOKIE_SECURE=true`, a fresh 32-byte hexadecimal `MFA_ENCRYPTION_KEY`, and unique database/object-storage credentials. Delete `DEMO_PASSWORD`. Use separate staging and production services and secrets. `API_INTERNAL_URL` is a web **build-time** setting; a runtime environment override does not change a compiled Next.js rewrite.

Never seed demonstration accounts in production. The supplied Compose files contain local-only credentials and loopback port bindings; they are development configuration, not public deployment defaults. No paid service or public site has been provisioned.

The optional complete local container stack is:

```powershell
docker compose -f infra/compose.yaml -f infra/compose.app.yaml up --build -d
docker compose -f infra/compose.yaml -f infra/compose.app.yaml --profile tools run --rm seed
docker compose -f infra/compose.yaml -f infra/compose.app.yaml ps
```

The migration service runs before the API. Seed is an explicit development action using the development-only tooling target. Stop host-run services first to free ports 3000/4000. The web image uses `API_INTERNAL_URL=http://api:4000` at build time, matching the Compose DNS name. For a different topology, build with `--build-arg API_INTERNAL_URL=https://internal-api.example` or supply an edge API route. API, web, worker and migration images must come from the same reviewed revision and use a compatible database schema. The full image/Compose startup has its own verification entry; source configuration alone is not runtime evidence.

The API and web runtime images run as the unprivileged `node` user and contain compiled output plus runtime dependencies. API source, tests, Prisma migration tooling, seed data and environment files stay outside them. Prisma's optional compiler/CLI peers are removed after copying the generated client; a CI smoke check rejects their presence. The standalone web image includes traced server dependencies, public assets and static chunks. Migration tooling has its own image. The Docker build context excludes environment files and local data. See [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) for the tracing model.

## Production application template

`infra/compose.production.yaml` is an app-only template. It supplies no database, storage, email, Redis or antivirus defaults and publishes no host ports. Prepare supported private dependencies and an existing HTTPS reverse-proxy network first. Store the actual production environment file outside the checkout with restricted permissions, using `infra/production.env.example` as a checklist. The example intentionally contains invalid replacement markers. No build secret belongs in a Docker `ARG` or copied `.env` file.

Build the targets from a reviewed release revision:

```powershell
docker build -f infra/Dockerfile --target api -t pathway-api:RELEASE .
docker build -f infra/Dockerfile --target web --build-arg API_INTERNAL_URL=http://api:4000 -t pathway-web:RELEASE .
docker build -f infra/Dockerfile --target migration -t pathway-migration:RELEASE .
```

Scan and publish these images to the provider's approved registry only as an explicitly authorized release action. Record their immutable digests. Set `PATHWAY_API_IMAGE`, `PATHWAY_WEB_IMAGE`, `PATHWAY_MIGRATION_IMAGE` to the reviewed image references, `PATHWAY_ENV_FILE` to the restricted file's absolute path, `PATHWAY_MIGRATION_DATABASE_URL` to a separate migration-role connection, and `PATHWAY_EDGE_NETWORK` to the existing proxy network. The runtime file's `DATABASE_URL` must use a constrained application role. Compose fails when required release values are absent.

Validate configuration without printing interpolated secrets:

```powershell
docker compose -f infra/compose.production.yaml config --quiet
```

Apply this template to an approved staging host before production using `docker compose -f infra/compose.production.yaml up -d`. The migration job must complete before API/worker startup. The web waits for API liveness. Each runtime has a read-only filesystem, dropped capabilities, process initialization and bounded local logs; only temporary directories and the web cache are writable. The worker gets a two-minute termination grace period. Monitor its durable queue age and shared heartbeat separately because it does not expose an HTTP port. Container liveness does not replace external dependency readiness or an application smoke test.

Configure the existing edge proxy to route the public HTTPS origin to `web:3000` over `PATHWAY_EDGE_NETWORK`, preserve the request Host/Origin, forward HTTPS information, set an upload/body limit compatible with the API's 10 MB cap, and enforce request/time/connection limits. Terminate TLS with managed certificate renewal; configure HSTS only after verifying all intended subdomains support HTTPS. Keep API, Redis, PostgreSQL, scanner and SMTP management endpoints off public interfaces. Browser-accessible signed file URLs require HTTPS and a private bucket: possession of an unexpired signed URL is a short-lived capability.

The initial production organization uses the bootstrap operation, not the fictional seed. After migrations, prepare a separate restricted bootstrap environment file with `BOOTSTRAP_EMAIL`, `BOOTSTRAP_NAME`, `BOOTSTRAP_ORGANIZATION_ID`, `BOOTSTRAP_ORGANIZATION_NAME` and a unique `BOOTSTRAP_PASSWORD` of at least 16 characters. Keep these one-time values out of the persistent API/worker environment. The organization ID must match `DEFAULT_ORGANIZATION_ID`. The command rejects an existing email or organization and does not overwrite records. It creates an ordinary ADMIN; add `BOOTSTRAP_ACADEMIC_ACCESS=true` only for an explicitly authorized academic administrator. Run the compiled operation once with the release API image and both restricted environment files on the private application network, for example:

```powershell
docker run --rm --network PATHWAY_APPLICATION_NETWORK --env-file PATHWAY_RUNTIME_ENV_FILE --env-file PATHWAY_BOOTSTRAP_ENV_FILE PATHWAY_API_IMAGE node dist/operations/bootstrap.js
```

Replace the uppercase placeholders with the approved network, file paths and image digest. Keep the real SMTP worker running to deliver contact verification. The administrator must verify contact and enroll an authenticator before privileged access. Remove the one-time bootstrap password from the operator environment/file after verifying onboarding, according to the provider's secret-retention process. The operation does not print verification tokens or passwords.

The API auth limiter is process-local and IP-based. Tune `AUTH_RATE_LIMIT_MAX` and `AUTH_RATE_LIMIT_WINDOW_MS`; deploy shared edge abuse controls before multiple API replicas. `TRUST_PROXY_HOPS` accepts only 0 through 3 and defaults to 0. Select the exact hop count only after measuring the deployed chain, keeping direct API access private and stripping client-supplied forwarding headers at the edge. A Caddy → Next.js → NestJS chain commonly needs two trusted hops, but a different proxy route changes that assumption. With zero trust behind a proxy, requests can share the proxy's address and rate budget. Never enable unbounded forwarded-address trust. The web applies request-specific nonce CSP to script execution; inline style support remains for React styles and needs a separate review if tightened. See [dependency review](dependency-review.md) for the remaining tooling advisory and storage support gate.

## Local service troubleshooting

| Symptom                                | Inspect                                                      | Recovery                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| PostgreSQL unavailable                 | `docker compose -f infra/compose.yaml ps postgres` and logs  | Compose host port is 55433. The optional native cluster is 55432; do not switch databases without migrating/confirming records.                  |
| Redis unavailable                      | Compose Redis status; `REDIS_URL`                            | Host port is 56379, container port 6379. Restart after fixing the dependency; durable outbox events remain in PostgreSQL.                        |
| Storage unavailable                    | MinIO logs, `minio-init` exit status and bucket name         | Wait for the pinned source build/start. Re-run `docker compose -f infra/compose.yaml up -d minio-init` to create the private bucket if required. |
| Scanner unavailable                    | ClamAV logs/signature startup; readiness                     | Wait for signatures/load or fix its network. Leave pending files quarantined.                                                                    |
| Email missing                          | Worker heartbeat, outbox state, Mailpit                      | Run the worker and open Mailpit on 8025; SMTP submission uses 1025. Recovery does not return tokens in the API.                                  |
| MFA fails after changing configuration | Deployment MFA encryption-key history, clock synchronization | Restore the correct key through controlled secret management. Do not disable privileged MFA or edit secrets manually to bypass it.               |
| Cookie/CSRF errors                     | Browser host, exact `WEB_ORIGIN`, secure-cookie setting      | Use localhost consistently for local HTTP. Production requires HTTPS; reverse proxy must preserve the intended host/origin.                      |

Docker Desktop startup failures are host issues. Preserve existing Docker volumes and avoid a factory reset as a generic troubleshooting step. The optional Windows PostgreSQL helper isolates its own cluster under `.local/postgres` and never manages an unrelated installation's data directory.

## Release and rollback

1. Run formatting, lint, strict types, migration/schema checks, tests, and both builds against a clean checkout.
2. Back up PostgreSQL and private objects. Verify the backup metadata and encryption/access controls.
3. Apply backward-compatible migrations with `pnpm db:migrate`, then deploy the versioned API, worker and web image.
4. Check health/readiness, sign-in, course loading, progress, submission receipts, and a controlled grading release.
5. If needed, redeploy the prior application image. Do not undo database migrations by dropping tables. Restore only through a rehearsed incident procedure that reconciles submissions received after the backup.

## Backups and restore

Use PostgreSQL custom-format dumps with a restricted backup role. Prisma URLs in this project contain `schema` and `connection_limit` query options that are not libpq connection options: do not pass those URLs unchanged to `pg_dump`/`pg_restore`. Use explicit host/port/user/database arguments and a protected password file or a libpq-compatible connection string.

For the local fictional Compose database, these commands produce a file without a binary PowerShell pipeline:

```powershell
New-Item -ItemType Directory -Force .local/backups
docker compose -f infra/compose.yaml exec -T postgres pg_dump -U pathway --format=custom --file=/tmp/pathway.backup pathway
docker compose -f infra/compose.yaml cp postgres:/tmp/pathway.backup .local/backups/pathway.backup
docker compose -f infra/compose.yaml exec -T postgres pg_restore --list /tmp/pathway.backup
```

Copy the private object bucket using an authenticated S3 backup tool into a versioned, access-restricted backup location. Keep object keys and metadata; do not make the backup bucket public. Protect the MFA encryption key separately and retain its version with backup metadata. PostgreSQL alone cannot restore file contents or decrypt MFA secrets without their corresponding objects/key.

Restore into an isolated database, never over active learner records:

```powershell
docker compose -f infra/compose.yaml exec -T postgres createdb -U pathway pathway_restore
docker compose -f infra/compose.yaml cp .local/backups/pathway.backup postgres:/tmp/pathway-restore.backup
docker compose -f infra/compose.yaml exec -T postgres pg_restore -U pathway --no-owner --dbname=pathway_restore /tmp/pathway-restore.backup
```

`pathway_restore` must be new/empty. Restore private objects to a separate protected bucket and point an isolated application instance at both restored stores. Compare enrollment counts, receipt/request IDs, submitted revision snapshots, grades, audit records and referenced object keys; open a sample authorized file and verify a submission receipt. Record the elapsed time, backup timestamp, last recoverable transaction, and any unapplied events. Store validated encrypted backups outside the application host with a retention/restore owner. The 24-hour recovery-point and 8-hour recovery-time goals remain unproven until this timed exercise is performed.

For a rollback rehearsal, first create a controlled submission and record its receipt. Snapshot database/object state, deploy the candidate, create a second submission, and roll back the application image with the database schema kept compatible. Verify both receipts and their objects. A database restore to an older backup requires a separate reconciliation plan for work accepted after that backup; never label that as lossless rollback by default.

### Bounded local recovery drill

`pnpm recovery:verify` performs an executable drill against an explicitly selected local **test** database and the local S3 adapter. It requires PostgreSQL 18 command-line tools, a loopback PostgreSQL URL whose database name ends in `_test`, and an HTTP loopback storage endpoint from `apps/api/.env`. Set `PATHWAY_RECOVERY_DATABASE_URL` or `TEST_DATABASE_URL` before running it; it never falls back to the development database. Set `PATHWAY_POSTGRES_BIN` if the tools are not in the default Windows PostgreSQL 18 directory or the Unix PATH.

Run the real-service upload verification first against that same test database, then stop other writes while taking the snapshot. The drill requires at least one real uploaded object. It creates a custom-format backup, restores it into a new random database ending in `_restore_test`, and compares every public application table's count and hash, including hashed MFA recovery codes, durable receipts, grades, audit history and progress. Source records must remain unchanged during the backup. It restores referenced storage objects to a new private bucket, checks byte hashes and requires unsigned requests to return 403. Deliberately missing, unreferenced non-CLEAN negative-test fixture objects are counted explicitly; missing CLEAN or submission/receipt-referenced objects fail the drill.

Backups and object snapshots live under a new access-restricted `.local/backups/recovery-*` directory. Object files and the completed database archive are encrypted with AES-256-GCM; the local drill key is stored in the same restricted directory for inspection. This arrangement avoids writing rejected antivirus fixtures as plaintext object files. A real backup system must keep encryption keys separately under controlled secret management. No learner content or secret is printed in the JSON evidence.

The drill retains the newly created restore database, private bucket and encrypted backup. It does not delete or overwrite an existing database, bucket or object. Inspect the retained resources using the names in `.local/recovery-verification.json`; later cleanup must target only those recorded drill resources. The evidence records actual elapsed time and remains explicitly limited to the local test dataset. A passing local drill does not prove production RPO/RTO, provider outage recovery or rollback without reconciling later submissions.

## Incidents

- **Lost connection during submission:** check the durable receipt before resubmitting. Retries reuse the same request ID. Never infer success from upload progress.
- **Scanner unavailable:** leave files quarantined, restore the scanner, then replay failed scan jobs. Never mark a file CLEAN manually to make a submission work.
- **Queue backlog:** inspect outbox states, Redis availability and worker logs. Fix the cause, then replay stable event IDs. SMTP cannot guarantee exactly-once delivery after an ambiguous provider failure.
- **Account compromise:** suspend membership/revoke sessions, review scoped audit records, restore access only after verified recovery and MFA review.
- **Database unavailable:** preserve browser drafts, restore connectivity, validate migrations and connections, then reconcile pending event IDs and receipts.
- **Offline conflict:** keep unacknowledged local events; reauthenticate and sync. If content/access is no longer valid, explain rejection and let the learner recover text locally. Do not overwrite grades with local data.

Monitor API failures, auth rate limits, database connections, worker failures and queue age, scanning latency, object storage and free disk. Assign operational owners and escalation paths before launch. Avoid logging passwords, recovery tokens, private answers or raw uploaded content. Agree retention/deletion and academic record policy with the provider; logs alone are not an audit retention strategy.

## Privacy and deployment release gates

Development uses only fictional seeded/test records. Do not copy production data into development without explicit authorization, appropriate de-identification and controlled handling. No automated personal-data export/deletion or retention purge is currently provided; operational requests must be reviewed against the provider's academic record obligations. The reference report's suggested retention periods are planning values, not legal conclusions.

Before enrolling real learners, assign owners for support and incidents, approve content rights and accessible alternatives, decide learner age/jurisdictions/residency, review processor terms, complete the outstanding security/accessibility and Android tests, and rehearse backup/restore/rollback. Measure performance under the agreed load and collect field data after deployment. These items remain release gates even if the local checks pass.
