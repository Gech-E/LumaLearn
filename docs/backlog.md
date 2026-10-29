# Backlog

The user selected the P0 pilot plus the explicit additional implementation requirements. Deferred features are hidden from navigation.

| ID        | Priority            | Deferred work                                                                                                                                                                                                                      |
| --------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID06      | P1                  | Organization SSO and roster import with conflict preview                                                                                                                                                                           |
| LR06      | P1                  | Private notes and bookmarks with archived source handling                                                                                                                                                                          |
| AS06      | P1                  | Revocable certificates and privacy-safe public verification                                                                                                                                                                        |
| CM02      | P1                  | Cohort discussions, moderation, reporting and private replies                                                                                                                                                                      |
| CM03      | P1                  | Live session scheduling, reschedule history and timezone reminders                                                                                                                                                                 |
| CM04      | P1                  | Recording consent, retention and approved equivalent summaries                                                                                                                                                                     |
| NT02      | P1                  | Provider delivery receipts, operational rate budgets and dead-letter UI beyond basic durable jobs                                                                                                                                  |
| OF03      | P1, partly promoted | Download sizes/status/removal and queued counts are included by the user's explicit request. Remaining storage quota guidance, resource packages and cancellation of in-progress downloads need implementation and device testing. |
| CO01      | P1 conditional      | Paid checkout, prices, signed provider callbacks, refunds and access policy                                                                                                                                                        |
| CO02      | P1                  | Vouchers and sponsored enrollment                                                                                                                                                                                                  |
| IN01      | P1                  | Controlled CSV imports/exports with formula escaping                                                                                                                                                                               |
| IN02      | P2                  | LTI, QTI, xAPI, SCORM after a concrete integration requirement                                                                                                                                                                     |
| AI01–02   | P2                  | Course-grounded helper and instructor-reviewed suggestions                                                                                                                                                                         |
| Expansion | P2                  | Gather cohorts, Studio hosted project workspaces, native mobile apps, disconnected learning centers                                                                                                                                |

Production launch also requires accountable content rights review, learner age and jurisdiction decisions, retention policy, support staffing, fluent Tigrinya review, representative Android/TalkBack testing, field performance data, restore/rollback rehearsal, and independent security review. These are release gates rather than claims made by a software implementation.

## Remaining acceptance and extensions

The local functional evidence is recorded in [verification](verification.md): 57 API/unit tests, 10 live-service checks and 15 browser scenarios passed. Pagination, private invitations and revocation, approved offline text resources, full offline reload, MFA recovery codes, optimistic draft conflicts, bulk enrollment and reviewed privacy requests are implemented.

Remaining work includes physical Android/TalkBack and broader accessibility review, translated-string expansion and fluent Tigrinya review, production performance/load measurements, an executed restore/rollback drill, and validation of production runtime images and provider configuration. Binary/video offline packages and transcoding remain outside the focused text pilot. Privacy deletion fulfillment remains a reviewed provider-policy decision rather than automatic erasure of academic records.

No production capacity, availability or recovery guarantee is inferred from the local functional checks.
