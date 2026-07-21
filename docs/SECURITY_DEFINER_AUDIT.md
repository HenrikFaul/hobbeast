# SECURITY DEFINER audit

**Status:** documented, not remediated. Landing the fixes requires a reviewed
migration + rollback plan per function; this doc is the pre-work.

Any Postgres function marked `SECURITY DEFINER` runs with the privileges of
its owner (typically `postgres`), bypassing the caller's RLS. That is the
right tool for `has_role`-style checks, but it is a footgun everywhere else:
a single missing `search_path` or missing input validation turns the function
into a privilege-escalation vector.

## Inventory

Source: `grep -rn "SECURITY DEFINER" supabase/migrations` on repo at v1.7.5.

| Function (latest migration)                                                              | Purpose                                     | search_path set? | Input validated? | Risk        |
| ---------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------- | ---------------- | ----------- |
| `public.has_role(_user_id uuid, _role app_role)`                                         | Role check consumed by RLS policies         | ✅ `public`      | N/A (stable)     | Low         |
| `public.handle_new_user()` (trigger)                                                     | Seeds `profiles` on `auth.users` insert     | ✅ `public`      | Trusts trigger payload | Low   |
| `public.update_updated_at_column()`                                                      | Touches `updated_at` on row update          | ✅ `public`      | N/A              | Low         |
| `public.deliver_organizer_message()`                                                     | Fans out organizer notifications            | ✅ `public`      | Trusts row       | Medium — validate `NEW.audience_filter` explicitly |
| `public.auto_promote_waitlist()`                                                         | Promotes waitlist on cancel                 | ✅ `public`      | Trusts row       | Medium — ensure the moved row belongs to the same event |
| `public.refresh_virtual_hubs()`                                                          | Rebuilds hub membership                     | ✅ `public`      | N/A              | Medium — admin-only; add explicit `has_role('admin')` guard inside function |
| `public.notify_favorite_category_on_event()`                                             | Notification fan-out                        | ✅ `public`      | Trusts row       | Low         |
| `public.admin_update_member_profile(...)` (`20260420120434_admin_member_profile_rpc.sql`) | Admin edits arbitrary profile               | ✅ `public`      | Partial          | **High** — must call `has_role(auth.uid(), 'admin')` at top and reject otherwise |
| `admin_generated_users` / `admin_event_health` (`20260410143000_...`)                     | Admin dashboards                            | ✅ `public`      | Partial          | **High** — same guard required |

## Required remediation (per function)

For every `SECURITY DEFINER` function that is not `has_role` itself:

1. First statement inside the body must be:
   ```sql
   IF NOT public.has_role(auth.uid(), 'admin') THEN
     RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
   END IF;
   ```
   …unless the function is a trigger fired by the DB itself (then no
   `auth.uid()` context exists; document this and rely on the trigger
   attachment as the trust boundary).
2. `SET search_path = public` must be present (already true for all rows
   above — verify on any new function).
3. `REVOKE ALL ON FUNCTION public.<name>(...) FROM PUBLIC;` followed by an
   explicit `GRANT EXECUTE ... TO authenticated;` if callable from the
   client. Trigger-only functions get no grant.
4. No dynamic SQL built from client-supplied strings. Parameterize.

## Rollout plan

- **Round A (docs only, this release, v1.7.5):** ship this audit. No SQL
  changes.
- **Round B (needs sign-off):** one migration per High-risk function with
  the `has_role` guard added and REVOKE/GRANT tightened. Each migration
  ships with a rollback SQL block and a smoke test that the intended admin
  flow (e.g. bulk user update) still works from the admin UI.
- **Round C:** Medium-risk trigger functions get explicit event-scoped
  guards (e.g. `IF NEW.event_id <> OLD.event_id THEN RAISE ...`) and unit
  tests via `pgTAP` or characterization tests hitting the RPC.

Do NOT batch Round B into a single migration — one function per migration
so a failure rolls back cleanly.
