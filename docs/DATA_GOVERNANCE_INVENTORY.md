# Data governance inventory — Prompt 13–15 delta

This inventory describes intended product purpose and engineering retention. Legal basis and final retention require the approvals in `LEGAL_SAFETY_LAUNCH_BLOCKERS.md`.

| Domain/field | Product purpose | Visibility/access | Engineering retention | Export/delete behavior | Downstream processor |
|---|---|---|---|---|---|
| `user_blocks` pair + reason | bilateral safety/discoverability exclusion | blocker; scoped safety reviewer | account lifetime unless removed | delete with user; user can unblock | Supabase target only |
| `user_reports.target_ref/category/details/severity` | reporter-private intake/triage | reporter receipt; safety reviewers; reported party cannot read reporter | provisional 730d then details redaction for closed cases | receipt in export; retain/redact under approved safety/legal hold | Supabase target only |
| `moderation_cases/notes/actions/appeals` + `moderation_resource_enforcements` | lifecycle, evidence, account/resource enforcement, appeal and reversible takedown | safety reviewer; appellant sees own appeal/enforcement status | policy decision required; evidence refs redacted with report retention | case evidence handled under safety/legal exception; resource ledger retained for reversal/audit | Supabase target only |
| `safety_audit_log` | immutable accountability | safety reviewers | provisional 2555d | not user-editable; disclosure/legal-hold rules TBD | Supabase target only |
| `event_safety_profiles` | venue disclosure, host/capacity acknowledgement, risk review | organizer/reviewer; safe summary to authenticated event viewer | event lifetime + policy exception | cascades with event | Supabase target only |
| `consent_records` | append-only product consent history | data subject | account lifetime/legal requirement | included in export; deleted/anonymized per approved DSR rule | Supabase target only |
| `data_deletion_receipts` | proof of retention batch | reviewers only; pseudonym/batch ID | policy decision required | receipt retained after source evidence deletion | Supabase target only |
| `feature_flags/overrides/audit` | controlled rollout and rollback | authenticated state; admin mutation/audit | flag expiry mandatory; audit policy required | override deletes with user; audit pseudonymization TBD | Supabase target only |
| `entitlement_grants/audit` | time-bound provider-independent access | subject reads grant; admin audited mutation | finance/legal policy required | export subject grant; finance retention exception possible | Supabase target only; payment provider inactive |
| `billing_provider_events.redacted_payload` | future reconciliation quarantine | admin/finance only | undefined until provider contract | provider/legal retention; no raw secret or unrestricted payload | none configured |
| `product_analytics_events.actor_pseudonym/properties` | outcome/quality metrics | aggregate/admin; no raw user ID | provisional 395d then hard delete with receipt | pseudonymous aggregate; deletion mapping depends protected salt process | Supabase target; no third-party analytics sink |

## Explicit prohibited analytics fields

E-mail, telephone, exact address, latitude/longitude, display name, biography, message/report text, description, credentials, token and secret. Unknown property names fail closed. Actor pseudonyms are generated server-side with `ANALYTICS_HASH_SALT`; missing salt blocks ingestion.

## Exact-location boundary

- `public_profile_cards` excludes exact address/coordinates and applies block/visibility filters.
- Event safety profiles can mark exact location participant-only; EventDetail hides exact text while the policy summary is loading and for non-participants when declared restricted.
- The legacy `events` table still contains exact-location columns readable under its event policy. A full column-level DB separation/backfill needs a separate two-phase migration and production data classification; therefore exact-event-location protection is `PARTIAL/HOLD`, not falsely marked complete.

## External data sharing

Supabase hosts application data. Provider integrations for places/events/routes receive the minimum query/location required by their existing contracts; contractual terms, DPA, residency and attribution evidence are not established by this repository. No report free text, moderation evidence or entitlement data is sent to external providers by the new code. No payment provider or third-party analytics sink is active.
