# Try the fictional Pathway course

Use this walkthrough after the [README setup](../README.md). Start the API, web application and worker, confirm readiness, then open `http://localhost:3000`. Keep Mailpit at `http://localhost:8025` available for email. All example names and work are fictional.

## Learn, practice and save

1. Sign in as `learner2@pathway.local` with `PathwayDemo!2026` on a fresh seed. Explore courses, clear/change the available filters, and open **Everyday digital skills**. Read its outcomes and completion expectations, then join.
2. Open **My learning** and continue the first lesson. Read the objective, explanation, worked example and reflection. Mark the lesson complete, refresh, and confirm that the server-confirmed completion remains.
3. Open the practice when its prerequisites allow access. Try the single-choice, multiple-choice and short-text questions. Submit online and read the explanation. The server controls points and retries; refreshing does not reset either.
4. Progress through the course and open **Your practical portfolio**. Write a short example of an organized folder, a useful email and a safe-sharing check. Save a draft, refresh, then submit online. A server receipt confirms submission; an upload indicator alone does not.
5. To try a file, use a small harmless UTF-8 text or PDF file. Wait for the scanner to report CLEAN before submitting. If scanning is unavailable, the draft remains recoverable and the file stays quarantined.

The pre-enrolled `learner@pathway.local` account starts with progress and fictional released revision feedback. It is useful for reviewing that state immediately. Its example feedback asks for clearer filenames, an email subject and an explanation of safe sharing.

## Teach and release feedback

1. Use a separate browser profile or sign out before switching to `instructor@pathway.local`.
2. Complete two-step setup in Profile. Add the displayed secret to a TOTP authenticator and enter the current six-digit code. Keep that authenticator for later sign-ins; a code cannot be reused in its 30-second window.
3. Open the instructor workspace, choose the assigned course and view submissions. Select the learner's portfolio, enter rubric points and specific feedback, and save the grade.
4. Before release, the learner must not see the new grade or feedback. Release it explicitly, then return to the learner account and confirm the feedback is visible.
5. A revision request allows a new draft/submission revision. The earlier receipt and grade history remain preserved.

## Author and publish

1. From the instructor workspace, create a new fictional course or edit the assigned demo course. Editing a published course creates a draft version; existing enrollments retain their published version.
2. Add a module and lesson with a clear objective, readable explanation, worked example and reflection. Reorder with the labeled buttons. Give resources meaningful names and provide accessibility and content-rights metadata.
3. For practice, define questions, answers, explanations, points, retry limits and feedback release. For assignments, define criteria and point limits. Add only prerequisites that have no cycles.
4. Open the learner preview and completion-rule review. Preview is not an enrollment and must not write real progress, attempts or grades.
5. Run publication review. Resolve all issues before publishing. Missing required metadata or invalid assessment configuration is rejected by the API, even if a client submits the request directly.

## Manage and support

`admin@pathway.local` manages organization membership, roles and course operations after MFA. Ordinary administration does not grant permission to inspect private academic work. The application prevents self-role changes and granting an academic permission the actor does not hold.

Use `support@pathway.local` for scoped support tickets. A learner can request help from a lesson and follow the ticket status. The support role cannot impersonate an instructor or change grades. `unassigned@pathway.local` demonstrates an instructor who cannot manage the assigned demo course; `other@pathway.local` demonstrates the organization boundary. `suspended@pathway.local` is expected to be denied protected access.

Avoid suspending your only active administrator. The seed intentionally preserves existing state rather than silently undoing administrative changes.

## Try interrupted connectivity

1. While signed in and online, download an eligible text lesson. Open Downloads and confirm its size, version and expiry.
2. Disable the browser's network or use a browser offline test mode, then reopen the downloaded lesson. The page should explain its offline status. Text downloads have a seven-day limit; videos and resource binaries are not part of this pilot.
3. Mark permitted lesson progress locally. It should say it is waiting to sync. Final graded submission remains online-only.
4. Restore the connection and allow reauthentication if required. Queued progress is removed only after the API acknowledges its unique ID. Refresh to confirm the authoritative state.
5. Remove a download and confirm it no longer opens offline. Reconnect before sign-out so the server session can be revoked and private local records cleared.

Browser storage can be evicted and disconnected access cannot be revoked immediately. Do not store sensitive real learner information in a shared demonstration browser. Check [verification](verification.md) for which of these workflows has actually been exercised; this walkthrough is an acceptance guide, not a test-result claim.
