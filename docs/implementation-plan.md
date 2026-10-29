# Pathway implementation plan

Source of authority: the user's pasted implementation request overrides the attached architecture report, including its Python/FastAPI recommendation. The Pathway boards provide visual direction, not fabricated product data. New workspace inspected: empty Git repository, no README, code, migrations, tests, or AGENTS.md to preserve.

## Scope and decisions

Build a local, free-enrollment pilot using Next.js App Router, NestJS modular monolith, PostgreSQL/Prisma, Redis/BullMQ, private MinIO, Mailpit, and ClamAV. No public publishing or paid provisioning. Public community, payment, certificates, AI, institutional standards, and native mobile applications remain outside this release.

## Execution

| Phase | Work                                                                                     | State                                                          |
| ----- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1     | Read references, create workspace, schema, authentication, infrastructure, design system | Implemented; local service verification in progress            |
| 2     | Catalog, enrollment, home, lessons and server-confirmed progress                         | Implemented; integration/browser acceptance in progress        |
| 3     | Frozen practice, durable assignments, rubric grading and release                         | Implemented; real database and live-service checks in progress |
| 4     | Authoring, immutable publication, preview, administration                                | Implemented; browser checks and listed gaps remain             |
| 5     | Offline text, language fallback, help, notices, hardening                                | Partial; resource downloads and complete localization remain   |
| 6     | Migration/seed, authorization and failure tests, mobile/browser/a11y checks              | In progress; results belong in verification.md                 |
| 7     | Verification evidence, screenshots, traceability and operational handoff                 | In progress; README/runbook/matrix written                     |

The frontend, core learning backend, and identity/media backend are implemented independently against shared contracts. Integration and verification run against actual PostgreSQL. No successful check is claimed until it has run.

## Integration decisions

- Use Next.js 16.4.3, React 19.3.1, NestJS 11.2.8 and Prisma 6.19.3, with a committed pnpm lockfile. Nest11 preserves compatibility with the current CommonJS/Jest pipeline.
- Keep PostgreSQL authoritative and use transactions plus immutable-content/attempt/receipt triggers. API/worker are separate processes from the same application.
- Bind local infrastructure to loopback. Compose uses PostgreSQL 55433 and Redis 56379; the optional Windows native PostgreSQL helper uses 55432. Preserve existing local data when changing a connection URL.
- Build the local MinIO adapter from pinned source; document archived upstream and require a supported storage decision for production.
- Generate the frontend OpenAPI contract and verify browser→API→PostgreSQL behavior. Do not substitute mock-only checks for persistence tests.
- Capture responsive/a11y evidence, then reconcile every traceability status with actual results. Keep remaining pilot gaps explicit.

No production deployment, paid provisioning, repository publication, or import of real learner data is authorized by this implementation task.
