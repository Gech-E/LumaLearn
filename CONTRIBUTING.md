# Working on Pathway

Use the Node/pnpm versions and setup instructions in [README](README.md). Keep personal environment files and local evidence under ignored paths. Never copy production learner records into development.

Each API domain owns its controller, request/response DTOs, service, permission checks and Nest module under `apps/api/src/<domain>`. Controllers translate HTTP requests; services enforce business rules and transactions. Reuse the shared authentication, course policy and stable error handling rather than introducing a second permission system. Changes to published learning records must preserve the database invariants and enrolled learners' pinned versions.

Frontend feature components live under `apps/web/src/components`; shared browser clients, offline persistence and formatting belong under `src/lib`. Reuse semantic UI controls and the English locale catalog. Keep generated OpenAPI files in `packages/api-client`; regenerate them from the running API with `pnpm api:generate` after changing public response contracts. Do not manually patch generated declarations.

Infrastructure belongs under `infra`, operational scripts under `scripts`, and cross-application browser tests under `tests`. Runtime containers must contain compiled application output and required dependencies only. Migration and seed tools have explicit separate targets. Keep `.env`, upload fixtures, credentials, screenshots of private records and local logs out of published images and commits.

Before handing off a change, run the relevant checks, then the repository quality gates:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --audit-level high
```

API integration tests require the separately migrated PostgreSQL database described in the README. Browser and real-service checks require a temporary local API/web/worker stack. Stop it after verification when the user has requested the application remain down. Tests must prove externally visible behavior, persistence, permissions or a meaningful failure case; avoid tests that only repeat implementation details.

Add a forward migration for schema changes and preserve existing migration history. Record actual commands/results and remaining gaps in `docs/verification.md`, and update `docs/requirements-traceability.md` when requirements change. A failing, interrupted or unrun check remains explicitly recorded. Public deployment, external communications and paid provisioning require the corresponding user authorization.
