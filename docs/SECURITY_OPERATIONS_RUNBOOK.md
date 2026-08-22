# Security, abuse, restore and incident operations runbook

Status: implementation contract. Hosted configuration, operator approval and restore rehearsal remain launch gates.

## Ownership and evidence

| Area | Primary owner | Required evidence | Escalation |
|---|---|---|---|
| Authentication and credential exposure | security owner | redacted incident ID, rotation timestamps, revoked-session count | engineering lead + privacy owner |
| Database backup/restore | database owner | backup ID, restore target, row/count checks, RPO/RTO measurement | engineering lead |
| Social safety and moderation | trust & safety owner | case ID, policy reason, audit/correlation ID | legal/privacy owner when required |
| External providers | integrations owner | provider run ID, circuit state, last success, redacted error class | product operations |
| Notifications and jobs | operations owner | queue lag, retry/dead-letter count, replay ID | engineering on-call |
| Release rollback | release owner | commit/artifact hash, flag snapshot, migration decision log | engineering lead |

Never place secrets, raw tokens, full free text, exact home coordinates or unnecessary personal data in incident evidence. Preserve immutable audit identifiers and hashes instead.

## Abuse-resilience matrix

Limits are policy defaults for staging validation, not claims about a hosted gateway. Edge/RPC authorization, dedupe constraints and audit remain authoritative; gateway limits must be configured and verified before launch.

| Surface | Key / default burst | Abuse signal | Fail-safe response | Audit / false-positive path |
|---|---|---|---|---|
| Auth / reset | IP + normalized account, 5/15 min | credential stuffing, enumeration | generic response, progressive cooldown, session revoke on verified compromise | auth activity event; support can verify ownership without revealing account existence |
| RSVP / cancel / waitlist | user + event, 8/min | double submit, seat churn | atomic idempotency key, capacity lock, bounded cooldown | participation/event-operation audit; replay returns prior result |
| Event creation/edit | organizer, 10/hour creation | spam, unsafe content, ownership mismatch | owner/capability check, validation, review trigger | organizer audit; moderator review does not auto-ban |
| Invite / reconnect / Circle | actor + target/context, 20/day | unsolicited social contact | attendance/connection/consent boundary, block suppression, frequency cap | social audit; user can revoke/leave without support |
| Report | reporter + target, 10/day | report spam or duplicate evidence | idempotency key, minimal receipt, review queue | reporter-private case; moderator closes duplicates with reason |
| Upload / evidence | user + case, policy-sized payload | malware, PII oversharing | reject unsupported attachment; no attachment storage until bucket/policy is approved | redacted case note; manual safe-channel escalation |
| Place search | user/IP, 60/min; 10 burst | scraping, quota exhaustion | 32 KiB body cap, validated action, timeout, bounded retry, circuit/fallback | provider telemetry without query PII; operator can adjust quota after evidence |
| AI proposal | admin/worker + hub, budgeted queue | cost spike, prompt injection, duplicate generation | k-anonymity, daily budget, schema validation, kill switch, human publish | proposal/run audit and model/template version; fallback template |
| Admin bulk action | actor + filter snapshot, one active job | mass mutation, privilege abuse | dry run, capability guard, idempotency, approval for high risk | immutable before/after redacted diff and partial-failure report |

## Break-glass policy

Break-glass is not a permanent role. A security admin may request a time-limited `super_admin` capability only for a declared P0/P1 incident when normal least-privilege tools cannot contain the impact.

1. Record incident ID, requested capability, exact target, reason, requester and expiry before activation.
2. Require second approval for destructive, identity, entitlement, mass-user or permanent-enforcement actions.
3. Set the shortest workable expiry, never more than two hours without renewed approval.
4. Use the canonical admin control plane so correlation ID, role snapshot, before/after redacted diff and outcome enter the immutable audit log.
5. Revoke on containment or expiry, review every action, rotate any credential exposed during the incident, and attach the review to the incident record.

No hidden database superuser, browser-held service key or unaudited direct auth mutation is an acceptable break-glass mechanism.

## Backup and restore drill

Target objectives for operator approval: RPO <= 24 hours and RTO <= 4 hours for the first city beta. These are targets, not measured SLOs.

1. Database owner records the latest provider-managed backup and PITR capability on a disposable, access-restricted restore target.
2. Pause external sync, proposal generation, notification release and all write schedulers.
3. Restore the selected point, apply only the approved migration sequence and record duration/errors.
4. Verify schema version; RLS; SECURITY DEFINER ACL/search paths; representative profile/event/attendance/audit counts; and one user/organizer/admin persona flow.
5. Verify no notification, provider sync or AI publish escaped the isolated target.
6. Destroy or archive the restore target according to the data-retention policy; retain redacted drill evidence.
7. Schedule the next drill quarterly and before any destructive/backfill-heavy release.

Launch remains HOLD until a named operator performs and signs this drill or an equivalent provider restore rehearsal.

## Incident playbooks

### Migration failure

- Stop rollout and all dependent workers; do not run an unreviewed down migration.
- Capture migration name, database error class, lock/latency evidence and backup point.
- Prefer forward-compatible repair for append-only migrations. Use rollback only where the migration header documents it and data loss is ruled out.
- Re-run RLS/persona and critical event mutation checks before resuming.

### Provider outage or malformed data

- Open the provider circuit/kill switch, preserve last-known data with an explicit stale label, and continue native/local supply.
- Quarantine malformed records and provider provenance; do not canonical-merge uncertain duplicates.
- Resume with a bounded canary and schema-drift fixture after provider recovery.

### Credential exposure

- Treat the credential as compromised; identify provider/scope without copying the value.
- Revoke/rotate at the provider, invalidate affected sessions/webhooks, update hosted secret storage, and verify the old credential fails.
- Run tracked-file/history and artifact scans. Removal from Git history requires an approved, coordinated procedure.

### Privacy or safety incident

- Minimize access, preserve case/audit IDs, restrict evidence and assign trust & safety/privacy owners.
- Apply reversible feature/resource restriction when it safely contains harm; permanent enforcement requires explicit authorized review.
- Follow applicable notification/legal decisions made by the responsible human owner. The product must not promise emergency coverage it does not operate.

## Staging parity checklist

- Canonical Supabase project role and boot-time target assertion.
- Auth/OAuth callback and redirect allowlists.
- Feature flags, cohorts, owners, expiries and default 0% state.
- Provider callbacks, quotas, licenses/attribution, circuit breakers and kill switches.
- CSP and other security headers; HSTS only after real HTTPS/domain verification.
- Telemetry endpoint/DSN, PII redaction, sampling and release version.
- Cron/queue ownership, retry/dead-letter visibility and replay procedure.
- Storage buckets, MIME/size limits, RLS and retention.
- Email/push sender domain, templates, unsubscribe and sandbox-vs-production routing.
- Backup/restore evidence, support contact, moderation coverage and rollback communication.

## Dependency vulnerability triage

For every high/critical finding record package/version, advisory, severity, exploitability, runtime reachability, available fixed version, bundle/server scope, mitigation owner and due date. A scanner network/TLS failure is `HOLD`, never a clean audit. Lockfile and SBOM hashes must correspond to the reviewed release candidate.
