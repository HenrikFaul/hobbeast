# Production go-live checklist

**Current verdict: NO-GO.** Checkboxes require direct evidence; source existence is insufficient.

## P0/P1 gates

- [ ] `.env` removed from Git history/current tracking as approved; all potentially exposed secrets rotated by operators.
- [ ] Canonical target Supabase ref verified for frontend, CLI and every Edge deployment.
- [ ] All migrations applied to a disposable/staging clone with RLS personas: anon, user A/B, organizer, unrelated organizer, moderator, admin, service role.
- [ ] SECURITY DEFINER inventory re-audited with grants/search paths and smoke evidence.
- [ ] Production build, full lint, typecheck, unit, Edge/Deno and Playwright critical flows green.
- [ ] Auth redirect/OAuth production domains proven.
- [ ] Provider quota, timeout/backoff, stale-state and kill-switch rehearsed.
- [ ] Cron/queue/webhook retry, dead-letter visibility, alert and replay process proven.
- [ ] Storage policies, backups and restore rehearsal proven.
- [ ] E-mail/push enabled only for configured, consent/preference-compatible channels.
- [ ] Legal/safety blockers LS-01–LS-14 resolved by named owners.
- [ ] Moderation coverage and urgent escalation exercise completed.
- [ ] Analytics opt-in, salt custody, taxonomy and deletion job approved/tested.
- [ ] Entitlement reconciliation proven; payment provider remains off until legal/tax/provider contract approval.
- [ ] Support contact, macros, status communication and incident handoff approved.
- [ ] Robots/sitemap/metadata and accessibility manual checks completed.
- [ ] Release tag/changelog/artifact hashes and rollback owner recorded.
- [ ] Full staging rehearsal including rollback completed.

## Migration/cutover order

1. Backup + restore verification and external sync pause.
2. Existing Prompt 01–12 append-only migrations in timestamp order.
3. `20260822130000_trust_safety_moderation_foundation.sql`.
4. Regenerate Supabase types; compile all browser/Edge consumers.
5. Exercise report/block/case/action/appeal and retention dry-run personas.
6. `20260822150000_feature_flags_entitlements_analytics.sql`.
7. Verify every new flag disabled/0% and expiry/owner present.
8. Exercise consent + suppressed analytics before enabling internal flag.
9. Resume external sync after freshness/integrity comparison.

Compatibility window: old `submit_user_report` remains supported through a normalization trigger; new clients use `submit_safety_report`. Rollback must preserve moderation/audit evidence before dropping tables. Exact-location DB column separation remains a separate two-phase prerequisite for private-event GA.
