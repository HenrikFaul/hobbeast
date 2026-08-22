# Launch operations plan

**Current authorization:** planning/source only. No deploy, migration, provider activation, payment activation or production flag change was performed.

## Staged rollout

| Stage | Cohort | Entry criteria | Exit criteria | Rollback |
|---|---|---|---|---|
| 0 | internal staff | staging migration dry-run; RLS personas green; secrets/target verified | critical flows + report/moderation + rollback rehearsal pass | all new flags off; revert functions/migration per runbook |
| 1 | generated/simulation | no real-user social proof; synthetic safety cases labelled | idempotency, queue load, alert and retention dry-run proven | disable flags; purge labelled simulation rows |
| 2 | small real cohort | legal copy and moderation coverage approved | zero P0; SLO/error budget stable; support/safety review accepts | cohort override off; preserve evidence |
| 3 | city beta | provider quota/support capacity sized | quality/safety guardrails inside approved thresholds | city eligibility removed; communications plan |
| 4 | general availability | explicit GO record with all P0/P1 evidence | ongoing Day 1/Week 1 review | percentage 0 / kill switches; prior artifact redeploy |

Safety report/block/privacy controls are core access and are not paywalled. The `moderation` flag controls operator rollout only, never whether a user can submit a safety report.

## Day 0

1. Freeze approved commit/tag/artifact hashes and DB backup/restore evidence.
2. Verify canonical Supabase target, untracked environment, OAuth redirects, provider quotas, cron and storage policies.
3. Run migration order on staging; record duration, locks, backfill count and rollback limitations.
4. Rehearse signup, profile, discovery, join/cancel/waitlist, organizer publish, report/block, notification, moderation action and rollback.
5. Confirm T&S/support/engineering incident owners and communication channel.
6. Enable only internal cohort flags with expiry; record audit IDs.

## Day 1

- Review availability, auth, RSVP, queue lag, provider freshness, notification delay and client errors.
- Triage safety reports by severity without promising unstaffed response times.
- Compare attendance/quality/safety guardrails, not screen time or raw impressions.
- Reconcile entitlements/provider events only if a separately approved provider has been activated.
- Record decisions, hotfix scope and flag rollback audit.

## Week 1

- Daily product/support/safety/engineering review.
- Inspect report rate, cancellation/no-show, notification opt-out, accessibility errors, performance and organizer quality.
- Validate retention jobs in dry-run/bounded batch mode and deletion receipts.
- Review expired flags and cleanup dates.
- Decide cohort expansion only from evidence.

## Post-launch review (2–4 weeks)

Append an immutable versioned review covering expected vs observed outcomes, regressions, support/safety signals, SLO/error-budget use, retention/funnel, technical debt, monetization guardrails and the next approved iteration. No current document is evidence that this review happened.
