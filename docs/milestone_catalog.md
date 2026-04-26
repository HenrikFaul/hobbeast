# sync-local-places – milestone catalog

| Milestone | Jelentés |
|---|---|
| `REQ_RECEIVED` | a request biztosan beért az edge functionbe |
| `ACTION_RESOLVED` | eldőlt, melyik action ág fut |
| `STATUS_LOAD_STARTED` | státusz snapshot lekérés indult |
| `STATUS_LOAD_DONE` | státusz snapshot elkészült |
| `CONFIG_LOAD_STARTED` | config lekérés indult |
| `CONFIG_LOAD_DONE` | config sikeresen betöltve |
| `CONFIG_SAVE_STARTED` | config mentés indult |
| `CONFIG_SAVE_DONE` | config mentés sikeres |
| `TASK_SEEDS_BUILT` | tile/seed lista elkészült |
| `TASKS_BUILT` | teljes feldolgozási task lista elkészült |
| `BATCH_WINDOW_RESOLVED` | megvan, hogy melyik task ablak fut most |
| `BATCH_STARTED` | a batch ténylegesen elindult |
| `BATCH_FINISHED` | a batch lezárult |
| `TASK_STARTED` | egy konkrét task elindult |
| `TASK_FINISHED` | egy konkrét task lezárult |
| `PROVIDER_FETCH_STARTED` | provider HTTP kérés indul |
| `PROVIDER_FETCH_DONE` | provider válasz megjött |
| `PROVIDER_NORMALIZE_DONE` | provider válasz PlaceRow formára alakítva |
| `HU_FILTER_DONE` | HU szűrés lefutott |
| `TASK_DEDUPE_DONE` | deduplikálás lefutott |
| `CATALOG_ROWS_BUILT` | a végső catalog payload összeállt |
| `CATALOG_WRITE_ATTEMPT` | DB írási kísérlet indul |
| `CATALOG_WRITE_DONE` | DB írás sikeres |
| `STATE_WRITE_ATTEMPT` | sync state mentési kísérlet indul |
| `STATE_WRITE_DONE` | sync state mentés sikeres |
| `SNAPSHOT_LOAD_STARTED` | UI snapshot összeállítás indul |
| `SNAPSHOT_LOAD_DONE` | UI snapshot kész |
| `ERROR_THROWN` | kivétel történt futás közben |
| `ERROR_REPORTED` | a hiba logolva és visszaadva lett |
