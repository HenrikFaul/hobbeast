## ➕ APPEND - 2026-04-07 Hobbeast local sync admin orchestration

### [LOCAL-HIBA-003] Long-running batch jobs must not be modeled as synchronous admin button calls
- **Date**: 2026-04-07
- **Files**: `src/components/admin/AdminEventbrite.tsx`, `supabase/functions/sync-local-places/index.ts`, `supabase/migrations/20260407223000_local_places_scheduler_and_enqueue.sql`
- **Error / symptom**: The admin UI could not reliably import local place data even after backend fixes because the browser waited on long-running batch jobs directly, causing timeouts and inconsistent UX.
- **Root cause**: The UI treated a multi-batch provider sync as a foreground request/response action instead of enqueueing a batch and polling status.
- **Fix**: Introduced runtime-configurable sync settings, enqueue RPC, scheduler RPCs, polling-based UI refresh, and configurable batch/provider parameters read by the edge function.
- **Prevention**: Any admin-triggered sync or import expected to take multiple seconds or multiple batches must use enqueue + status polling or background scheduling instead of synchronous waiting.
