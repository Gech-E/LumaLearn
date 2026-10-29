# Account recovery and privacy operations

## MFA recovery codes

An account with enabled two-step sign-in can generate ten saved recovery codes from its profile. Generation requires a current MFA-verified session, CSRF token, verified contact, and re-entry of the current password. Each code contains 128 bits from Node's cryptographic random generator. Codes are displayed once; the API persists SHA-256 digests and timestamps only. Generating another set deletes the previous set. Neither application logs nor audit records contain codes.

Sign-in always requires the password. An account can supply one saved recovery code instead of the authenticator code. A transaction locks the account row, consumes the unused digest, and creates the MFA-verified session atomically. Concurrent reuse produces one successful sign-in. A successful use creates an audit event and a security notification. Recovery codes do not disable MFA. Password reset leaves the second factor enabled.

The implementation follows the high-entropy saved-secret and single-use principles in [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html) and the [OWASP MFA cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html). This does not establish a certified authentication assurance level. Store recovery codes separately from the sign-in device. Losing the authenticator and every saved code requires an operator identity-review procedure; there is no unauthenticated MFA-disable endpoint.

## Privacy requests

`POST /api/v1/support` accepts `kind: HELP | EXPORT | DELETION`, with `HELP` as the default. The server derives the account and organization from the session. Learners see only their own requests. Organization support staff and administrators can review and respond, with actor, time, request kind, and status changes recorded in the audit log. Request creation or resolution does not automatically erase learning or academic evidence.

Before launch, the provider must approve a retention schedule, identity-review procedure, deletion/anonymization runbook, and request-response ownership. The application tracks review requests; it does not claim that retaining or deleting any particular record satisfies a jurisdiction's legal obligations. Backups, object storage, audit records, and third-party processors must be included in the provider's policy and execution process.

## Self-service data export

`GET /api/v1/users/me/export?page=1&limit=100` returns an explicitly selected JSON subset for the signed-in account and current organization: profile, membership, enrollments, progress events, submitted-content receipts, released grades, and support requests. It excludes password hashes, session/contact tokens, MFA secrets/digests, questions, answer keys, and unreleased feedback. Receipt snapshots expose only the learner's submitted text, link, and attachment IDs. File binaries and records outside this subset require a reviewed export request.

Every collection has its own `items`, `total`, `page`, and `limit`. Each page is bounded to 100 records per collection and reads a consistent database snapshot. Separate page requests can observe changes made between requests; the downloaded JSON is not an immutable archival snapshot. Export reads are audited without copying exported content into the audit event. Responses use `Cache-Control: no-store`.

## Verification

The real-PostgreSQL identity suite covers hash-only storage, password/CSRF/MFA generation checks, concurrent single-use recovery, old-code invalidation, privacy request ownership, pagination, and excluded authentication fields. The learning suite checks that exports exclude unreleased grades and other learners' receipts. Consult [verification.md](verification.md) for the latest executed results; the existence of these tests alone does not mean they passed.
