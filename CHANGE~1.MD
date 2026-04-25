# Changelog append — v1.6.2 — Address Manager: provider fetch hardening

> Append-only — does not replace v1.6.0 / v1.6.1 entries.

## Üzleti cél
A Címkezelő modul tömeges venue-lekérése a TomTom és Geoapify rendszerekből
a gyakorlatban nem indult el (vagy 0 sort írt). A fix garantálja, hogy a
kijelölt mátrixcellák tényleges provider HTTP-hívást indítsanak, és
ezredsoros nagyságrendű adatot képesek legyenek `raw_venues`-be tölteni.

## Mit oldott meg

1. **`supabase/config.toml`** kiegészítve a három address-manager edge
   function regisztrációjával (`address-manager-discovery`,
   `-task-generator`, `-worker`, mind `verify_jwt = false`). Korábban csak
   egy különálló snippet-fájl (`config.address-manager.snippet.toml`)
   tartalmazta őket, így telepítéskor a függvények JWT-védettek maradtak,
   és a discovery belső `fetch`-ei 401-gyel buktak.

2. **`address-manager-worker`**:
   - TomTom limit oldalanként **max 100** (provider hard cap), pagination `ofs`-szal.
   - Geoapify limit oldalanként **max 500** (provider hard cap), pagination `offset`-tel.
   - Egy worker hívás **több tile-t** dolgoz fel egy futási idő-keret
     (`worker_time_budget_ms`, default 35 s) alatt → tényleges bulk
     adatgyűjtés egy "Kijelölt chunk futtatása" kattintásból.
   - Tile-en belüli több oldalas lekérés (`worker_max_pages_per_tile`,
     default 20), addig fut, amíg az admin által kért per-tile darabszámot
     el nem éri vagy a provider üres oldalt küld.
   - Provider hibákban a HTTP body első 400 karaktere is megjelenik a
     `last_error` mezőben → diagnosztizálható.
   - 20 másodperces request timeout `AbortController`-rel.
   - Surrogate `provider_venue_id` ha a provider üres ID-t küldene.
   - Per-batch dedup a `raw_venues` upsert előtt; chunked upsert (500/seq).

3. **`address-manager-task-generator`**:
   - 10 percnél régebbi `running` cellák lockját automatikusan feloldja
     (`releaseStaleLocks`), hogy az "elhalt" worker ne blokkolja örökre a
     mátrixot.

4. **`address-manager-discovery`**:
   - Új `self_test` action: két élő provider-hívással validálja a kulcsokat
     (Geoapify + TomTom, Budapest 2 km), ENV jelenlétét és a service-role
     kulcs meglétét.
   - Új `reset_cells` action: szűrt visszaállítás `pending`-re (admin
     meg tudja ismételni a már `completed` cellákat is).
   - Új `release_stale_locks` action a manuális mentéshez.
   - Belső subhívások (`task-generator`, `worker`) most explicit
     `SUPABASE_SERVICE_ROLE_KEY`-jel mennek (`Authorization` + `apikey`),
     nem a user JWT továbbításával — JWT-állapottól függetlenül megy.

5. **`address-manager-shared/repository.ts`**:
   - Új `releaseStaleLocks`, `resetCellsByFilter` exportok.
   - `loadLimits` / `saveLimits` kibővítve `worker_time_budget_ms` és
     `worker_max_pages_per_tile` mezőkkel.
   - `buildSummary` most a `running` és `error` cellaszámot is visszaadja.

6. **`address-manager-shared/constants.ts`**:
   - Bővebb Geoapify kategória-mapping (több releváns kategória `,`-vel).
   - Új `PROVIDER_PAGE_CAPS` konstans (Geoapify 500, TomTom 100).

7. **Új migráció** (`20260425100000_address_manager_provider_fetch_fix.sql`):
   - Append-only follow-up. CREATE TABLE IF NOT EXISTS biztosítja a
     `raw_venues` és `sync_discovery_matrix` tárolókat, kiegészíti az
     indexeket, eltávolítja a max-results jellegű CHECK constraint-eket,
     felveszi az `address_manager` provider értéket az engedélyezettek
     közé, és **`notify pgrst, 'reload schema'`-val** frissíti a
     PostgREST schema cache-t (különben az új táblák nem látszanak).
   - Az `app_runtime_config` `address_manager_limits` rekordja kibővül a
     `worker_time_budget_ms` / `worker_max_pages_per_tile` kulcsokkal,
     **merge** módon (meglévő admin értékek megmaradnak).
   - RLS engedélyezve a két új táblán (default deny → service-role
     továbbra is fér hozzá).

8. **`AdminAddressManager.tsx`**:
   - Új gombok: **Provider self-test**, **Befejezett cellák
     újraindítása**, ország/kategória szűrőhöz **"Mind kijelöl"**.
   - Self-test panel: provider szintű HTTP státusz, mintarekord-szám,
     hibaüzenet, ENV/service-role jelenlét.
   - Limit panel kiegészítve `worker_time_budget_ms` és
     `worker_max_pages_per_tile` mezőkkel.
   - Statisztikák bővítve (`Fut`, `Hibás` cellaszám), cellánkénti
     statisztikák bővítve (`last_chunk_written`, `last_chunk_tiles`).
   - Hibaüzenet ikonnal (AlertTriangle) jelenik meg az `error` cellákon.

## Regressziók (ellenőrizve)

- A `sync-local-places` legacy pipeline érintetlen — saját függvény,
  külön kategóriák, a fix nem nyúl hozzá.
- Az AdminAddressManager **továbbra is URL state-ben** tartja az aktív
  tab-ot, providert, ország/kategória szűrőket és a venue lapozást.
- A React Query továbbra is `refetchOnWindowFocus: false` mindkét queryn.
- A draft limitek továbbra is lokális state-ben élnek; csak a
  "Beállítások mentése" gomb küld backendnek.

## Verifikálási lépések (deploy után)

1. `supabase db push` — alkalmazza az új migrációt.
2. `supabase functions deploy address-manager-discovery
   address-manager-task-generator address-manager-worker` —
   most már a `config.toml` regisztrálja őket.
3. Admin → Címkezelő → **Provider self-test** — mindkét provider zöld
   pipát adjon, HTTP 200, `sampleCount` > 0.
4. Jelölj ki 1-2 cellát, állítsd a `geoapify_limit`-et 1500-ra,
   `tomtom_limit`-et 500-ra, kattints **Beállítások mentése** majd
   **Kijelölt chunk futtatása**.
5. raw_venues tartalom táblában meg kell jelennie az adatoknak;
   summary `Összes raw venue` ugorjon fel ezredsoros nagyságrendbe.
