# sync-local-places – file execution matrix

## Futási sorrend, szerep, milestone-ok

| Sorrend | Fájl | Réteg | Mit csinál | Fő milestone-ok |
|---|---|---|---|---|
| 1 | `index.ts` | controller | request fogadás, action kiválasztás, handler meghívás | `REQ_RECEIVED`, `ERROR_REPORTED` |
| 2 | `_shared/handlers/handleStatus.ts` | handler | státusz lekérés | `STATUS_LOAD_STARTED`, `STATUS_LOAD_DONE` |
| 3 | `_shared/handlers/handleGetConfig.ts` | handler | config lekérés | `CONFIG_LOAD_STARTED`, `CONFIG_LOAD_DONE` |
| 4 | `_shared/handlers/handleSaveConfig.ts` | handler | config mentés | `CONFIG_SAVE_STARTED`, `CONFIG_SAVE_DONE` |
| 5 | `_shared/handlers/handleSchedule.ts` | handler | cron schedule bekapcsolás | nincs külön milestone, event alapú log használható |
| 6 | `_shared/handlers/handleUnschedule.ts` | handler | cron schedule kikapcsolás | nincs külön milestone, event alapú log használható |
| 7 | `_shared/handlers/handleEnqueue.ts` | handler | batch elindítás | `ACTION_RESOLVED`, `BATCH_STARTED` |
| 8 | `_shared/orchestrators/runBatch.ts` | orchestrator | a teljes batch pipeline vezérlése | `BATCH_STARTED`, `BATCH_WINDOW_RESOLVED`, `BATCH_FINISHED` |
| 9 | `_shared/tasks/buildCenters.ts` | task seed | HU tile center lista | `TASK_SEEDS_BUILT` |
| 10 | `_shared/tasks/buildTasks.ts` | task build | center × category task lista | `TASKS_BUILT` |
| 11 | `_shared/orchestrators/runTask.ts` | task orchestrator | egy task teljes futása | `TASK_STARTED`, `TASK_FINISHED` |
| 12 | `_shared/providers/geoapify.ts` | provider | Geoapify fetch | `PROVIDER_FETCH_STARTED`, `PROVIDER_FETCH_DONE` |
| 13 | `_shared/providers/tomtom.ts` | provider | TomTom fetch | `PROVIDER_FETCH_STARTED`, `PROVIDER_FETCH_DONE` |
| 14 | `_shared/normalizers/geoapify.ts` | normalize | Geoapify válasz normalizálása | `PROVIDER_NORMALIZE_DONE` |
| 15 | `_shared/normalizers/tomtom.ts` | normalize | TomTom válasz normalizálása | `PROVIDER_NORMALIZE_DONE` |
| 16 | `_shared/services/providerResultLogger.ts` | observability | raw vs HU-filter log | `HU_FILTER_DONE` |
| 17 | `_shared/utils/dedupe.ts` | filter | provider+external_id dedupe | `TASK_DEDUPE_DONE` |
| 18 | `_shared/services/catalogWriter.ts` | persistence | catalog chunkok írása | `CATALOG_WRITE_ATTEMPT`, `CATALOG_WRITE_DONE` |
| 19 | `_shared/repositories/stateRepo.ts` | persistence | sync state olvasás/írás | `STATE_WRITE_ATTEMPT`, `STATE_WRITE_DONE` |
| 20 | `_shared/services/statusService.ts` | snapshot | UI snapshot összeállítása | `SNAPSHOT_LOAD_STARTED`, `SNAPSHOT_LOAD_DONE` |
| 21 | `_shared/repositories/logRepo.ts` | logging | structured place_sync_logs írás | milestone/event függő |

## Javasolt következő további bontások

| Jelenlegi fájl | További bontás lehetősége |
|---|---|
| `runBatch.ts` | `prepareBatchWindow.ts`, `finalizeBatchState.ts`, `collectTaskResults.ts` |
| `runTask.ts` | `runGeoapifyStep.ts`, `runTomTomStep.ts`, `mergeProviderRows.ts` |
| `catalogWriter.ts` | `writeCatalogChunk.ts`, `verifyCatalogChunk.ts` |
| `statusService.ts` | `loadCatalogPreview.ts`, `loadProviderCounts.ts`, `loadSyncStateSnapshot.ts` |
