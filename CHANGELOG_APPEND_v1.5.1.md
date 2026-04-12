## [1.5.1] - 2026-04-12
### Bug fixes

#### Generated users showing as "Real" / empty city & hobbies (regression fix)
- **Root cause**: Auth triggers (`handle_new_user`, `handle_new_user_profile`) created profiles with `id=auth_id` but `user_id=NULL`. `persistProfile` in `mass-create-users` queried by `user_id` → profile not found → INSERT conflicted on `id` → failed silently → profile kept trigger defaults (`user_origin='real'`, `city=null`, `hobbies='{}'`).
- **Fix 1**: `mass-create-users` `persistProfile` now uses upsert on `id` conflict, setting all generated-user fields including `user_id` and `user_origin='generated'`.
- **Fix 2**: Migration `20260412080000_fix_profile_trigger_userid_backfill.sql` — fixes `handle_new_user_profile()` trigger to always write `user_id=NEW.id`; backfills existing profiles where `user_id IS NULL`; backfills `user_origin='generated'` for test users incorrectly marked as `'real'`.
- **Deployed**: `mass-create-users` v5, migration applied to `dsymdijzydaehntlmfzl`.

#### Eventbrite tab 401 Invalid JWT error
- **Root cause**: `eventbrite-import` edge function was deployed with default `verify_jwt=true`. The Supabase gateway rejected requests with expired/invalid user session JWTs before the function body ran. The function never needed user identity — only Eventbrite API keys from env vars.
- **Fix**: Redeployed `eventbrite-import` with `verify_jwt=false`.
- **Deployed**: `eventbrite-import` v2, `dsymdijzydaehntlmfzl`.

#### sync-local-places "Teljes újratöltés" only ran one batch
- **Root cause**: With 375 total tile×category tasks and `task_batch_size=2`, a single button click only processed one batch then stopped. Also, the deployed function was a broken older version (stray `console.log` at line 1 with undefined variables; all helper functions missing).
- **Fix 1**: Restored complete `sync-local-places` edge function with all helpers (`executeSyncBatch`, `fetchGeoapify`, `fetchTomTom`, `buildTasks`, etc.) and inline execution mode.
- **Fix 2**: Added `continuousBatchingRef` auto-loop in `AdminEventbrite.tsx` — "Teljes újratöltés" now keeps triggering the next batch until all tasks complete.
- **Deployed**: `sync-local-places` v17, `dsymdijzydaehntlmfzl`.
