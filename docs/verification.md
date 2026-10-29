# Verification record

Updated **29 October 2026**. Results below describe the checked local working tree before its initial GitHub publication. They do not constitute a production launch approval.

## Recorded results

| Check                       | Outcome                                                                         | Evidence                                                                       |
| --------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| API and unit tests          | **57 passed, 6 suites**, 38.408 seconds                                         | `.local/api-full-final.log`                                                    |
| Real-service integration    | **10 checks passed**                                                            | `.local/services-final.log`, `.local/service-verification.json`                |
| Browser workflows           | **15 distinct scenarios passed**, combined runs                                 | Browser files in `tests/e2e`; logs listed below                                |
| Database                    | **6 migrations applied**; repeat seed preserved existing records                | `.local/manual-migration.log`, `.local/manual-seed.log`                        |
| API compilation             | Passed                                                                          | `.local/api-build.log`                                                         |
| Strict TypeScript           | Passed for API, web and browser tests; invitation fix rechecked                 | `.local/publish-types.log`, `.local/invitation-fix-typecheck.log`              |
| Production web build        | Passed in an isolated copy of the final web source                              | `.local/production-web-final.log`; compile 83 seconds, TypeScript 14.4 seconds |
| Production dependency audit | **0 advisories**                                                                | `.local/dependency-audit-production.json`                                      |
| Full dependency audit       | 1 documented low-severity development-tool finding                              | [Dependency review](dependency-review.md)                                      |
| Local service startup       | Frontend, API, worker and all six readiness dependencies responded successfully | `GET /api/v1/health/ready`; managed process logs in `.local`                   |

The production build ran in an ignored isolated directory so it did not replace the running development server's `.next` output. The application, identity, invitation and locale source hashes matched that build copy. No application container image or public deployment is claimed.

## Browser walkthrough

| Step                                 | Verified behavior                                                                                                                                          | Evidence                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Registration and verification        | UI submits a new fictional account, clears its password field, shows an explicit local-inbox action, consumes the delivered verification link and signs in | `onboarding.spec.ts`; `.local/onboarding-final.log`         |
| Sign-in redirects and invitation MFA | External redirect attempts stay on the app; privileged invitation pages provide setup or account switching and retain the invitation URL                   | `onboarding.spec.ts`                                        |
| Catalog                              | Search, no-results, clear filters, visible keyboard focus and reflow                                                                                       | `learner.spec.ts`                                           |
| Enrollment and learning              | Join, open a lesson, save completion, refresh and restore server-confirmed state                                                                           | `learner.spec.ts`                                           |
| Practice                             | Single choice, multiple choice and short text produce the expected server-scored result                                                                    | `learner.spec.ts`                                           |
| Assignment                           | Draft survives refresh; confirmed submission retains the same durable receipt and locks submitted work                                                     | `learner.spec.ts`                                           |
| Offline                              | A full offline reload opens the standalone reader; UUID completion replays after reconnection; sign-out clears all four private stores                     | `learner.spec.ts`                                           |
| Course authoring                     | Real MFA setup, course/module/activity creation, accessible-content review, read-only preview and publication                                              | `instructor.spec.ts`                                        |
| Grading                              | Private rubric feedback is absent from the learner view until explicit release, then the learner receives the grade and feedback                           | `instructor.spec.ts`                                        |
| Administrator and support            | MFA, cross-organization/academic denial, suspension/revocation/restore, settings, notices, contextual tickets, responses and audit                         | `management.spec.ts`; `.local/management-tests.log`         |
| Invitations and groups               | Private invitation email, sign-in return path, acceptance, pending revocation, denied revoked code and idempotent bulk enrollment                          | `teaching-controls.spec.ts`; `.local/teaching-controls.log` |
| Editing conflict                     | Concurrent save returns 409, preserves local input, downloads the unsaved draft and reloads the saved version                                              | `teaching-controls.spec.ts`                                 |
| Security and privacy                 | Recovery codes are shown once and support password-plus-code sign-in; own-data export excludes secrets; deletion remains a tracked review request          | `security-privacy.spec.ts`; `.local/security-browser.log`   |

The common three learner scenarios ran at **1440 × 1000**, **768 × 1024** and **360 × 800**. Role-specific and onboarding scenarios ran on desktop. Results are aggregated from scoped runs; repeated reruns are not counted as additional scenarios.

Responsive evidence is in `.local/responsive-functional.log`; the corrected phone case is in `.local/phone-recheck.log`. Instructor evidence is in `.local/desktop-functional.log`. Screenshots under [evidence](evidence/) use fictional records.

## Defects found and corrected

- Sidebar metadata and phone navigation labels failed contrast checks. Both now use the accessible muted-text token; the affected learner cases passed on rerun.
- The original receipt assertion compared layout-dependent `innerText` with `textContent`. It now checks the durable receipt field directly; the underlying persisted receipt was unchanged.
- Management assertions now distinguish an intentionally empty scoped list from forbidden direct-record access. Tests include an actual private submission.
- Concurrent-editor fixtures now contain the required accessibility metadata, so they exercise the intended 409 conflict rather than invalid input.
- The native PostgreSQL lifecycle helper now rejects startup/readiness failures and reports a mismatched running port instead of claiming success.
- Registration now offers a clear local inbox action. Invitation acceptance now presents MFA setup/sign-in guidance and account switching without bypassing authorization.

## API and adapter coverage

The 57-test suite uses actual PostgreSQL and the real authorization guard. It covers ownership and organization scope, inactive memberships, CSRF/origin checks, session expiry/revocation, TOTP and recovery-code replay, password-reset races, bootstrap safety, published/attempt/receipt immutability, enrollment/progress idempotency, prerequisite cycles, frozen scoring, deadlines/accommodations, grade release/history, draft conflicts, bulk enrollment and bounded privacy exports.

The ten live checks use the running local API, BullMQ worker, Mailpit, private MinIO and real ClamAV. They verify delivered registration/recovery messages, cookie sign-in, byte-matched clean downloads, unsigned-object denial, EICAR rejection, recovery token reuse denial, old-session revocation, logout and final readiness. Fixture credentials, recovery tokens, signed URLs and file bodies are not printed by the verification scripts.

## Environment and reproduction

- Windows desktop; Node.js 24.22 and pnpm 10.28.0.
- Next.js 16.4.3, React 19.3.1, NestJS 11.2.8, Prisma 6.19.3 and PostgreSQL 18.
- The running local app uses Compose PostgreSQL on **55433**. The final API suite used the isolated native `pathway_test` database on **55434** after port 55432 was unavailable. No production database was used.
- Six forward migrations are present. Real SMTP delivery outside Mailpit requires operator-supplied production settings.

Use [getting started](getting-started.md) for setup and test database preparation. Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`, `pnpm test:e2e` and `pnpm audit:production` in the appropriate prepared environment. `TEST_DATABASE_URL` must identify a separate database ending in `_test`.

Browser and live-service checks require a running API/web/worker stack. `pnpm services:verify` exercises the adapters. The isolated Windows `scripts/verify-browser.ps1` runner is intended for a stopped local stack; it must not be run over another person's active app. Local logs and traces remain ignored by Git.

## Evidence limits and release gates

- Axe checks on the landing and lesson screens do not establish whole-product WCAG conformance. Physical Android/TalkBack, zoom and broader assistive-technology review remain necessary.
- English and the explicit Tigrinya fallback are implemented; no fluent translation or cultural review is claimed.
- Browser lab JSON was captured against the **development build** and is labeled accordingly. It does not establish production transfer budgets or field Web Vitals percentiles.
- Load and encrypted local recovery scripts are implemented but their drills have not been executed in this record. Capacity, RPO/RTO and lossless rollback targets remain unverified.
- Production runtime container builds were interrupted during dependency download. CI contains build/smoke checks, but no completed application image or hosted CI run is claimed.
- Provider-specific HTTPS, SMTP, maintained object storage, monitoring, retention policy, independent security review and operational ownership remain deployment prerequisites.
- No public application deployment, paid infrastructure or production learner-data import has been performed.

See [requirements traceability](requirements-traceability.md), [security and privacy](security-and-privacy.md), and [operations](operations.md) for implementation boundaries and remaining acceptance work.
