## [1.4.7] - 2026-04-07
### Hobbeast local places admin UX + scheduler
- Reworked Hobbeast admin local-catalog import so the UI no longer tries to wait synchronously for multi-batch provider sync completion.
- Added UI-configurable local sync settings in the admin panel: interval minutes, task batch size, provider concurrency, radius meters, Geoapify limit, and TomTom limit.
- Added RPC enqueue flow so the admin button starts a batch quickly and the UI polls status instead of waiting for long-running request/response cycles.
- Added cron-scheduler helpers so local place batches can be triggered automatically at a configurable interval.
- Updated the local sync edge function to read runtime config from `app_runtime_config` and apply configurable batch/provider limits without code redeploy.

### Operational note
- Save the local sync settings once in the admin UI before enabling automatic execution.
- Use `Teljes újratöltés` for a reset run, then continue with `Következő batch indítása` or the configured schedule until cursor reaches task_count.
