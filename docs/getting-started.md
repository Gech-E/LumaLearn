# Detailed setup guide

Pathway is a local learning-management pilot for practical, beginner-friendly courses. It combines a Next.js interface with a NestJS API, PostgreSQL learning records, and a separate BullMQ worker. The fictional demonstration course covers organizing files, writing useful email, and sharing safely.

The implementation and its evidence are tracked in [requirements traceability](requirements-traceability.md) and the [verification record](verification.md). Implemented behavior is not equivalent to a production launch approval; remaining gaps are stated there.

After setup, follow the [demo walkthrough](demo-guide.md) to try learning, grading, authoring, administration and offline reading.

## Requirements

- Node.js 24 LTS, within the supported `>=22.12 <25` range.
- pnpm 10.28.0, as pinned in `package.json`.
- Docker Engine with Docker Compose v2; on Windows, start Docker Desktop and its Linux engine.
- Internet access for the first dependency install, container images, ClamAV signatures, and the pinned MinIO source build.
- Available local ports 3000, 4000, 55433, 56379, 9000, 9001, 1025, 8025, and 3310.

Run commands from the repository root. The examples below use PowerShell. None publishes a public site or provisions a paid service.

## First run

```powershell
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
Copy-Item .env.example apps/api/.env
pnpm infra:up
docker compose -f infra/compose.yaml ps
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Keep an existing `apps/api/.env`; do not overwrite it on subsequent runs. The file is ignored by Git. Start infrastructure before migrating. The first MinIO build compiles pinned source and may take several minutes. ClamAV also needs time to load signatures. Inspect failures with `docker compose -f infra/compose.yaml logs --tail 100`.

Start the API, web application, and worker in three terminals:

```powershell
pnpm dev:api
```

```powershell
pnpm dev:web
```

```powershell
pnpm worker
```

On Windows, `powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1` can start all three as managed hidden processes with logs under `.local`. The script records the exact executable, workspace entry point and process creation time. An unrelated listener causes a startup error. Stop its processes, including the frontend's child server, with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/stop-local.ps1
```

Add `-Infrastructure` to stop this project's Compose services while preserving named volumes, and `-NativeDatabase` only when using this project's optional native PostgreSQL cluster. Services remain stopped after implementation work unless explicitly started for a local check.

Open [Pathway](http://localhost:3000), [Swagger API documentation](http://localhost:4000/api/v1/docs), and [Mailpit](http://localhost:8025). Use `localhost:3000` consistently: the configured browser origin and cookie host must agree. The API dev command compiles TypeScript before running Node; after changing API source, rebuild/restart it. The web dev server reloads frontend changes.

Check readiness after starting the worker:

```powershell
Invoke-RestMethod http://localhost:4000/api/v1/health
Invoke-RestMethod http://localhost:4000/api/v1/health/ready
```

Liveness only reports that the API is responding. Readiness checks PostgreSQL, Redis, the private object-storage bucket, scanner, email transport, and worker heartbeat. A degraded response must be investigated even if text lessons work.

## Demo accounts and course

All accounts below are fictional and use `PathwayDemo!2026` on a fresh seed, unless `DEMO_PASSWORD` was changed before seeding.

| Email                      | Purpose                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| `learner@pathway.local`    | Enrolled learner with saved progress and example released feedback   |
| `learner2@pathway.local`   | A second learner for independent enrollment and privacy checks       |
| `instructor@pathway.local` | Instructor assigned to Everyday digital skills                       |
| `admin@pathway.local`      | Organization administration; no automatic academic-record permission |
| `support@pathway.local`    | Scoped support-ticket handling                                       |
| `unassigned@pathway.local` | Instructor without assignment to the demo course                     |
| `suspended@pathway.local`  | Membership suspension demonstration                                  |
| `other@pathway.local`      | A learner in a different organization                                |

Privileged accounts require two-step sign-in. On first login, open Profile, start authenticator setup, add the displayed secret to a TOTP authenticator, and confirm its current code. Subsequent logins require a fresh code; an already-used 30-second code is rejected. There is no development MFA bypass. Keep the authenticator available and store the one-time recovery codes securely. A recovery code can be used once when the authenticator is unavailable; regenerate codes only after reauthentication.

Demo contacts are already verified. To exercise registration and recovery, create a new account, keep the worker running, and open its verification/reset email in Mailpit. Recovery links are single use and expire. Seed is idempotent and preserves existing passwords and learning records; changing `DEMO_PASSWORD` and rerunning seed does not reset an existing account. Production seeding is refused.

## Configuration

`apps/api/.env` configures both API and worker. Process environment variables override the file. Next.js uses a same-origin `/api/v1` rewrite; set `API_INTERNAL_URL` in the web build environment when its backend is elsewhere.

| Variable                                                   | Local value or meaning                                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`, `PORT`                                         | `development`, API port `4000`                                                                                        |
| `DATABASE_URL`                                             | PostgreSQL on `127.0.0.1:55433`, database `pathway`; keep Prisma `schema=public` and the local connection limit       |
| `WEB_ORIGIN`                                               | Exact browser origin, `http://localhost:3000`                                                                         |
| `DEFAULT_ORGANIZATION_ID`                                  | Registration organization, seeded as `org-pathway`                                                                    |
| `REDIS_URL`                                                | `redis://localhost:56379`                                                                                             |
| `S3_ENDPOINT`                                              | API/worker object-storage address, `http://localhost:9000`                                                            |
| `S3_PUBLIC_ENDPOINT`                                       | Browser-reachable address used in short-lived signed links                                                            |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION` | Local MinIO credentials, private bucket `pathway-private`, region `us-east-1`                                         |
| `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM`                      | Mailpit at `localhost:1025` and the sender identity                                                                   |
| `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`                | Optional deployment email settings; local Mailpit uses no TLS/authentication                                          |
| `CLAMAV_HOST`, `CLAMAV_PORT`                               | Real scanner at `localhost:3310`                                                                                      |
| `SESSION_TTL_HOURS`                                        | Default 24; privileged sessions are capped at 12 hours                                                                |
| `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS`         | Authentication mutations per process/IP: default 100 per 900000 ms; shared edge limits are required for replicas      |
| `TRUST_PROXY_HOPS`                                         | 0 by default; bounded 0–3 for an operator-verified private proxy chain, with forwarding-header sanitation at the edge |
| `COOKIE_SECURE`                                            | `false` only for local HTTP; `true` for HTTPS deployments                                                             |
| `MFA_ENCRYPTION_KEY`                                       | 64 hexadecimal characters representing 32 random bytes; preserve securely while accounts use it                       |
| `DEMO_PASSWORD`                                            | Development-only seed password; remove from production                                                                |
| `API_INTERNAL_URL`                                         | Web build-time backend URL; default `http://localhost:4000`                                                           |
| `TEST_DATABASE_URL`                                        | Separate test database whose name ends in `_test`; never point it at real learner records                             |

Generate a new MFA key for a shared environment using `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Store it in a secret manager. Replacing it without a migration makes existing encrypted authenticator secrets unreadable. The example credentials are deliberately local and must be replaced before deployment.

## Checks and test database

Create a dedicated database once, then migrate it with an environment override. Restore the normal database setting afterward.

```powershell
docker compose -f infra/compose.yaml exec -T postgres createdb -U pathway pathway_test
$env:TEST_DATABASE_URL = 'postgresql://pathway:pathway-local-db@127.0.0.1:55433/pathway_test?schema=public&connection_limit=5'
$previousDatabaseUrl = $env:DATABASE_URL
try {
  $env:DATABASE_URL = $env:TEST_DATABASE_URL
  pnpm db:migrate
} finally {
  if ($null -eq $previousDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
  else { $env:DATABASE_URL = $previousDatabaseUrl }
}
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

An existing `pathway_test` database makes `createdb` report that it already exists; do not reset a database merely to suppress that message. API tests require actual PostgreSQL and create isolated fictional fixtures. They do not prove that live SMTP, S3, or antivirus is healthy. The browser checks need the local application and its seeded data; consult [verification](verification.md) for current commands, results, and evidence boundaries.

Regenerate the API contract while the API is running:

```powershell
pnpm api:generate
pnpm typecheck
```

Review and commit the resulting contract changes with their API changes. Do not manually edit generated types.

## Offline pilot

Download an eligible text lesson while signed in and online. Downloads and permitted progress events are stored in account-scoped IndexedDB, expire after seven days, and are cleared on sign-out. The UI distinguishes local saves from server acknowledgment. Graded attempts and final assignment submission require a connection.

Browser storage can be evicted or cleared; this is not a backup. A disconnected device cannot learn immediately that access was revoked. Expired or rejected queued progress must be reconciled after reauthentication. Offline downloadable resource binaries, background media transcoding, and a complete offline course package remain outside the implemented text pilot; see traceability for the precise remaining scope.

## Layout and maintenance

| Location              | Responsibility                                                                      |
| --------------------- | ----------------------------------------------------------------------------------- |
| `apps/web`            | Next.js routes, semantic UI, brand tokens, locale fallback, offline browser records |
| `apps/api/src`        | NestJS domain modules, permissions, media adapters, outbox and worker               |
| `apps/api/prisma`     | Authoritative schema, ordered migrations, fictional seed                            |
| `apps/api/test`       | Business-rule and real-PostgreSQL API tests                                         |
| `packages/api-client` | OpenAPI-generated frontend contract                                                 |
| `infra`               | Local dependencies and application/container configuration                          |
| `scripts`             | Contract generation, local lifecycle and real-service verification                  |
| `.github/workflows`   | Formatting, lint/types, database, browser, runtime-container and advisory checks    |
| `docs`                | Architecture, scope, traceability, evidence, backlog and operations                 |

Brand configuration is in `apps/web/src/lib/brand.ts`; semantic colors and layout rules are in `apps/web/src/app/globals.css`. English localization and an explicitly unreviewed Tigrinya fallback live in `apps/web/src/locales`. Course language is independent of interface preference.

Stop API/web/worker with Ctrl+C. `pnpm infra:down` stops the infrastructure without deleting named data volumes. Do not add `--volumes` unless you deliberately intend to erase local data. The optional all-container setup and deployment/backup/incident guidance are in [operations](operations.md). No public deployment has been performed.

Production images use separate `api`, `web` and `migration` Docker targets. The app-only [production template](../infra/compose.production.yaml) requires explicit image references, a restricted environment file, a dedicated migration connection and an existing HTTPS proxy network. It publishes no host ports and contains no dependency credentials. Review [operations](operations.md), [dependency review](dependency-review.md), [verification](verification.md) and outstanding release gates before deploying real learner data.

### Windows PostgreSQL fallback

If Docker database startup is unavailable and PostgreSQL 18 is already installed at `C:\Program Files\PostgreSQL\18\bin`, the repository provides an isolated local-cluster helper:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local-postgres.ps1 -Action start
$env:PGPASSWORD = 'pathway-local-db'
& 'C:\Program Files\PostgreSQL\18\bin\createdb.exe' -h 127.0.0.1 -p 55432 -U pathway pathway
& 'C:\Program Files\PostgreSQL\18\bin\createdb.exe' -h 127.0.0.1 -p 55432 -U pathway pathway_test
Remove-Item Env:PGPASSWORD
```

Set `DATABASE_URL` in `apps/api/.env` and `TEST_DATABASE_URL` to port **55432** for this cluster, then run migrations and seed as above. The helper manages only `.local/postgres`; it does not create the application databases itself. Other services still use Compose. Stop only this cluster with `scripts/local-postgres.ps1 -Action stop`. Do not confuse its port with Compose PostgreSQL on **55433**.
