# Supabase cleanup candidates

Append-only working note for backend cleanup after frontend removals.


## 2026-04-27 — Address Manager frontend removal follow-up

Context: the admin UI no longer exposes the old `Címkezelő / Address Manager` surface, and the frontend no longer imports or calls that flow. Before deleting anything from Supabase, confirm there is no cron, manual ops flow, or hidden admin dependency still using it.

### Candidate Edge Functions to remove after verification
- `address-manager-discovery`
- `address-manager-task-generator`
- `address-manager-worker`
- shared helper folders used only by the three functions above:
  - `supabase/functions/_address-manager-shared/`
  - `supabase/functions/address-manager-shared/`

### Candidate config entries to remove after verification
- `app_runtime_config.key = 'address_manager_limits'`
- `app_runtime_config.key = 'address_manager_crawler_state'`
- related function declarations from `supabase/config.toml` and `supabase/config.address-manager.snippet.toml`

### Candidate tables to remove after verification
- `public.raw_venues`
- `public.sync_discovery_matrix`

### Candidate migration to retire from active backend roadmap
- `supabase/migrations/20260423193000_address_manager_parallel_rebuild.sql`

### Verification gate before deletion
- Check that no scheduled job, manual operator flow, or other admin surface still depends on the Address Manager pipeline.
- Check Supabase logs for recent calls to the three `address-manager-*` functions.
- Check whether `raw_venues` / `sync_discovery_matrix` are still being populated for any operational reason.
- Only after that should the actual DB/function deletion happen.
