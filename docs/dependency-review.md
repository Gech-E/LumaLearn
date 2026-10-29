# Dependency review

Reviewed 29 October 2026 against the installed lockfile using npm's advisory endpoint through `pnpm audit`. Re-run the review for every release; an advisory-free dependency graph is only one part of security verification.

| Scope                       | Before remediation                         | After remediation         |
| --------------------------- | ------------------------------------------ | ------------------------- |
| All installed packages      | 6 high, 16 moderate, 2 low                 | 0 high, 0 moderate, 1 low |
| Production dependency graph | Not separately recorded before remediation | 0 reported advisories     |

Evidence is recorded in ignored `.local/dependency-audit-final.json` and `.local/dependency-audit-production.json`. The low finding remains in the Jest tooling chain: `jest > @jest/core > jest-config > deepmerge@4.3.1`, [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). The advisory reports no patched release. Test configuration is trusted repository code; the application does not expose Jest configuration to users, and Jest is absent from API/web runtime images. Review again when Jest or a patched dependency is adopted; do not suppress new high findings globally.

The following changes address the reported findings:

- Nodemailer is pinned to 10.2.1 with its bundled TypeScript declarations. Its maintained CommonJS entry point and `createTransport` API support the existing SMTP adapter. The [official changelog](https://github.com/nodemailer/nodemailer/blob/master/CHANGELOG.md) records the security fixes and compatibility changes. The worker must still be tested against the real SMTP provider before release.
- Multer is pinned to 2.5.0, including the Nest Express adapter's dependency through a scoped override. The [official release notes](https://github.com/expressjs/multer/releases/tag/v2.5.0) identify the upload denial-of-service fix. Size/type checks and fail-closed scanning remain application responsibilities.
- The Swagger dependency on `js-yaml` is scoped to 5.4.3. The [maintainer changelog](https://github.com/nodeca/js-yaml/blob/master/CHANGELOG.md) records the merge-limit correction. OpenAPI JSON remains the browser client's contract.
- Prisma 6.19.3's configuration dependency is scoped to `deepmerge-ts` 8.0.0. Its [official release](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0) fixes recursive-object stack exhaustion and changes Map merge behavior. This repository uses ordinary trusted Prisma schema/environment configuration and does not supply Map values or user-authored executable Prisma configuration. Prisma generation, schema validation and migrations must pass with the override. Remove this override when an upstream compatible Prisma update supplies the fix.

The Node container base is pinned to the digest resolved during the local image build. Package resolution uses the committed frozen lockfile. Operating-system packages and the final images require a release-time image scan and an explicit digest refresh policy; npm audit does not inspect Debian, Go, ClamAV signatures, or container configuration.

Local MinIO and its client are built from fixed source commits for reproducible development. The upstream [MinIO server](https://github.com/minio/minio) and [client](https://github.com/minio/mc) repositories are archived. Production must use supported private S3-compatible storage with a documented patch/backup owner. The production Compose template intentionally does not deploy these local demonstration dependencies.
