# Pubapp — Canonical Changelog (consolidation draft)

## Purpose
This file is a **single future append target** for release history in `HenrikFaul/pubapp`.

It is based on the current repository state, with the intent that future development rounds should append here instead of maintaining fragmented release-history notes.

## Recommended rule from now on
- Keep **one** canonical changelog file only.
- Use **append-only** updates.
- Never replace prior release history.
- Keep versioning references inside each new release block.
- If temporary append-snippet files are created during delivery, merge them into the canonical changelog immediately and do not continue parallel changelog streams.

---

## [1.0.0] — 2026-03-28
### First release
- Guest side: venue finder, QR ordering, order tracking, pub quiz, games
- Admin panel: service, orders, menu, stock, statistics, configurator, help
- Supabase auth + RLS
- Realtime order handling
- PWA manifest

---

## [1.0.1] — 2026-03-29
### Fixes
- Auth redirect loop fixed
- RLS policy fixed for profile reads
- Role assignment fixed with auth.users join
- Email field sync fixed in user/profile flow

---

## [1.1.0] — 2026-03-30
### New features
- Site Admin panel introduced
- Menu / drink templates introduced
- Venue admin UI improvements
- Activity log and template related DB additions

### UI/UX
- Sidebar improvements
- Badge / card / button consistency
- Mobile-first responsive polish

---

## [1.3.6] — 2026-03-31
### Regression fixes
- Input focus-loss fixed
- Venue finder stabilized
- Select dropdown readability fixed
- Active check-in logic restored

### Restored previously working features
- Games menu restored
- Friends / shared lists moved under Profile
- Loyalty-point emphasis restored
- Personalized offers restored
- Admin Menu entry restored
- Digital menu access preserved

---

## [1.4.0] — 2026-04-01
### Hungary local-first venue catalog
- Local venue catalog introduced
- Local search RPC introduced
- Sync-state table introduced
- Batch sync edge function introduced
- Scheduled sync helper introduced

### Venue finder direction change
- Local-first search became the preferred direction
- Provider fallback no longer fully dictates result visibility

### Documentation/process
- Versioning pair required
- Changelog and lessons must be read before development
- Root-cause-first and lowest-regression-risk delivery enforced

---

## [1.4.2] — 2026-04-03
### Common Admin baseline
- Common Admin baseline introduced in Pubapp
- Integration / hosting inventory concept introduced
- App version / deployment snapshot concept introduced
- Changelog-based delivered-features snapshot introduced
- Local catalog operational status concept introduced

### Important note
This release must remain append-only. No previous changelog content may be removed.

---

## Canonical changelog operating model
From the current repo state, the recommended future process is:

1. Keep `changelog.md` as the only canonical changelog.
2. Merge any temporary append snippets into it immediately.
3. Append new release blocks only.
4. Reference the matching `versioning/<id>_...pdf` and `versioning/<id>_...md` pair in each new block.
5. Never introduce a second long-lived changelog stream.

---

## Recommended next step in the repo
After review, rename or replace the active root changelog with this canonical structure only if done together with:
- a commit preserving the full prior history
- explicit append-only governance wording
- no deletion of historic entries

---

## [1.4.4] — 2026-04-07
### Hungary local-first venue catalog stabilization
- `sync-local-places` edge function országos HU tile alapú lefedést kapott Geoapify + TomTom forrásokkal.
- A sync pipeline deduplikálást és részleges hibák visszajelzését adja (`partial` státusz + hiba minták).
- `place-search` local-first merge módra állt: lokális katalógus + Geoapify + TomTom közös rangsorolt lista.
- A lokális találatok pontozási prioritást kaptak, így kereséskor elsődlegesek maradnak.

### Scheduling és admin modellezés
- Új SQL helper migráció készült napi sync ütemezéshez (`schedule_daily_local_places_sync`, `unschedule_daily_local_places_sync`).
- A common admin integráció inventory machine-readable `category` mezőt használ, és ebből történik a stabil csoportosítás.

### Versioning artifacts
- `versioning/14040710_v1.4.4_business_request_summary.md`
- `versioning/14040710_v1.4.4_business_request_summary.pdf`
- `versioning/14040710_v1.4.4_ai_dev_prompts.md`
- `versioning/14040710_v1.4.4_final_coder_prompt.md`

---

## [1.4.8] — 2026-04-08
### Added
- **Event Templates**: Users can save event configurations as templates and reuse them when creating new events. Templates store category, description, location, tags, and other settings.
- **Mass User Generator** (Admin): Admin tool to generate up to 1000 simulated users with realistic Hungarian/European names, geographical distribution across Hungary and neighboring countries, and random hobbies from the system taxonomy. Users are editable before creation. Backend batch insert via `mass-create-users` edge function.
- **Proximity-based venue sorting**: Venue suggestions now use Browser Geolocation API as Priority 1 source, with profile location as fallback.

### Fixed
- **Map Layer Z-index**: Fixed stacking context issue in the Create Event flow where the Leaflet map layer would obscure selected location data. Applied `isolation: isolate` and proper z-index containment.

### Improved
- **Distance filter**: Events distance filter now uses browser geolocation first, with profile location fallback. Removed the requirement of having a profile location set to enable the filter.
- **Admin panel**: Mass user generator merged into Felhasználók tab. Removed separate Generátor tab.

---

## [1.4.9] — 2026-04-09
### Added
- **Virtual Hubs (Admin)**: Invisible interest-based communities auto-generated from user hobbies and cities. Admin-only visibility in Felhasználók tab with refresh/recalculate function.
- **Favorite category event notifications**: Database trigger automatically notifies users when a new event is created matching their favorite activity categories (if notification preference enabled).

### Fixed
- **Invalid API key**: Fixed `supabase/config.toml` project_id pointing to wrong Supabase project, causing authentication failures across the entire app.

### Improved
- **Security**: Enabled leaked password protection (HIBP check) for signup.


## [1.5.2] — 2026-04-10
### Fixed
- **Mass user generator profile persistence**: Removed fragile `upsert(..., { onConflict })` dependency from `mass-create-users`; profile enrichment now uses safe select-then-update/insert flow, eliminating `no unique or exclusion constraint matching the ON CONFLICT specification` runtime errors.
- **Admin bulk selection stability**: Switched batch-selection UI state from `user_id`-based selection to `profile.id`-based selection so filtered multi-select count, partial deselect, and single-row deselect no longer collapse into shared state glitches.
- **Organizer mode owned event count**: Replaced `HEAD + count exact` query with safe `select('id')` length-based count to avoid admin-side `events ... 500` failures during mode detection.
- **Notification/admin hook resilience**: `has_role`, notifications, and notification preferences now fail softly with logging instead of destabilizing the whole admin page.
- **Common Admin startup noise**: Initial hidden-panel status polling no longer raises a user-facing generic edge-function toast on background failure.

### Added
- **Admin bulk user actions edge function**: Added `admin-bulk-user-actions` for preview/apply flows covering filtered selection, activate/deactivate, and delete operations.
- **Schema hardening migration**: Added v1.5.2 migration to ensure `profiles.user_origin`, `profiles.is_active`, and unique indexes required by admin/user flows remain present.

### Versioning artifacts
- `versioning/15041003_v1.5.2_business_request_summary.pdf`
- `versioning/15041003_v1.5.2_ai_dev_prompts.md`


## [1.5.6] — 2026-04-11
### Fixed
- **Admin bulk selection contract alignment**: Bulk preview/apply now supports `userIds` and `profileIds`, uses canonical `user_id` selection in the UI, and keeps backend count aligned with the modal badge even when no filters are applied.
- **Event create required-field hardening**: Event create/edit now computes and writes `start_time`, protects `place_categories` from `null`, surfaces backend error messages, and disables submit until mandatory inputs are present.
- **Catalog / notification preference writes**: Removed fragile `upsert(... onConflict: 'slug'/'user_id')` dependency from admin catalog seeding and notification preference saves.
- **Dialog accessibility**: Added missing descriptions to command palette and admin dialogs to prevent repeated `DialogContent` accessibility warnings.

### Added
- **Compatibility migration**: Added `20260411162000_event_start_time_bulk_and_catalog_fixes.sql` to harden event compatibility columns and unique indexes required by current frontend logic.

## [1.5.7] — 2026-04-19
### Fixed
- **Admin user tables sticky header UX**: Added consistent sticky table headers with explicit scroll containers (`overflow-y-auto` + responsive max-height) for admin user list, virtual hub list, and mass-user preview, including visual separation (`shadow-sm`, `border-b`) to prevent header/content overlap while scrolling.
- **Admin profile detail editability**: User detail dialog now supports controlled editing for gender (predefined values), status (active/inactive), hobbies (DB-driven searchable checklist), and event participations (searchable list from existing system events) without free-text drift.
- **Bio constraint hardening**: Bio editing remains free-text but now enforces a 500-character max in UI and backend save path.

### Added
- **Admin edge function for safe profile updates**: Added `admin-user-profile-update` edge function with explicit admin authorization check, profile field sanitization, and event participation synchronization logic using service-role writes.

## [1.5.8] — 2026-04-22
### Fixed
- **Lokális címtábla max results mentési korlát feloldva**: A `sync-local-places` config sanitize logikában a Geoapify és TomTom limitek felső határa 200-ról 1 000 000-ra emelve; az admin UI inputok is ehhez igazítva.
- **Fókusz-alapú újratöltés mérséklése**: React Query globális `refetchOnWindowFocus` kikapcsolva.
- **Admin tab állapotmegőrzés**: Az admin aktív tab URL query paraméterrel (`?tab=`) szinkronizálva, így visszatéréskor stabilan ugyanaz a nézet marad.

### Added
- **DB védelem migráció**: Új migráció eltávolítja az `app_runtime_config` táblán az esetleges, 200-as plafont kényszerítő `CHECK` constraint-eket (`geo_limit` / `tomtom_limit`) dinamikus drop logikával.

## [1.5.9] — 2026-04-22
### Fixed
- **Lokális sync beállítás mentés megbízhatósága**: Az admin mentés már nem közvetlen táblafrissítéssel történik, hanem a `sync-local-places` edge function `save_config` akcióján keresztül, így a backend validáció és a visszaolvasott mentett érték ellenőrzése egységes.
- **200-as legacy korlát maradványainak kezelése**: Új migráció törli az `app_runtime_config` táblán azokat a régi `CHECK` constraint-eket is, amelyek `max_results`/provider kulcsszavakkal továbbra is 200-as plafont kényszeríthetnek.

## [1.6.0] — 2026-04-23
### Added
- **Address Manager Phase 1 alapok**: új `raw_venues` és `sync_discovery_matrix` táblák, provider/country/category fókuszú discovery-mátrix támogatással.
- **Új admin tab: Címkezelő**: provider-alapú discovery matrix UI, ország/kategória kijelölés checkboxokkal, ország/kategória szintű „mindet kijelöl” műveletekkel.
- **Dinamikus crawler váz**: új edge function egységek (`address-manager-discovery`, `address-manager-task-generator`, `address-manager-worker`) discovery → következő chunk generálás → worker feldolgozás atomi bontásban.

### Changed
- **Zero-limit DB policy**: az `app_runtime_config` legacy max-results check korlátainak további dinamikus eltávolítása és address-manager runtime key-ek inicializálása korlátozásmentes alapértékekkel.
- **Admin URL state bővítés**: `tab=address-manager` és a Címkezelő szűrőállapot (`provider`, `countries`, `categories`) query paraméterből visszaállítható.

## [1.6.2] — 2026-04-23
### Fixed
- **Address Manager frontend stabilizálás**: A Címkezelő frontend már nem hívja automatikusan a még nem deployolt `address-manager-discovery` edge functiont, így megszűnik a 404 / `Failed to fetch` zaj.
- **Stabil mentési/futtatási útvonal**: A mentés és a batch indítás a stabil `sync-local-places` endpointon történik (`get_config`, `save_config`, `enqueue`).
- **NaN/null-biztos config mentés**: A Címkezelő mentési payload `parsePositiveInt` + fallback logikával védett, így nem küld invalid számokat.
- **Mátrix kijelölés state-megőrzés**: A kijelölés URL query paraméterben (`selected`) marad meg, így tabváltáskor sem vész el.

### Diagnostics / connectivity
- **Invoke diagnosztikai irány**: A kliensoldali invoke hívásoknál a cél URL, Authorization Bearer jelenlét és hiba/body kontextus naplózható, ami gyorsítja az edge connectivity hibák feltárását.
- **Edge connectivity hardening irány**: Az `internal_edge_function_base_url` normalizálása, a slash-mentes fix Supabase URL használata és a JSON `CHECK` korlátok oldása része a stabil kapcsolódási stratégiának.
- **sync-local-places request diagnosztika**: A request oldali method/url/auth-header jelenlét logolása bevezethető úgy, hogy az `OPTIONS` / CORS ág változatlan maradjon.

## v1.7.4 — Dynamic Address Integration & Auto-Mapping Engine

- Replaced static/manual category assumptions in the Geodata DB provider test flow with dynamic database discovery.
- Added `discover_db_table_facets` support in `place-search` to discover live category/source/city values from the selected Geodata table.
- Added Smart Filter logic for category searches: exact category matching is attempted first; if no result is found, the backend falls back to fuzzy/contains matching across category-like fields.
- Added multi-category backend support through string arrays or comma-separated values.
- Added admin UI semantic category assistance: Hungarian user inputs such as venue/food/game concepts are compared against live database category keys and surfaced as “Erre gondoltál?” suggestions.
- Added “Live from Database” transparency marker, response-time visibility, and >500 ms “Optimizing query...” feedback.
- Added diagnostics for empty results, including table reachability, row availability, and suggested live categories.

## v1.7.5 — Event Creation Stability & Place Search Hardening

### Fixed
- Stabilized the event creation location search path by fixing the `place-search` runtime crash caused by a missing `buildPseudoSql` helper in the dynamic discovery handler.
- Hardened `db:*` provider autocomplete so it returns normalized `results` and raw `rows` consistently instead of failing with non-2xx responses during typing.
- Added AbortController-backed request cancellation to the frontend place search client and location input, preventing stale requests from racing after fast typing or modal interaction.
- Added a guarded event creation modal Error Boundary so a rendering failure in the location search / suggestion panel no longer collapses the whole modal unexpectedly.
- Added actionable empty/error states and slow-query feedback for location autocomplete and venue suggestions.

### Changed
- Place search calls now use a small client-side cache and structured diagnostic logging for slow responses over 500 ms.
- Venue suggestions now use the configured address provider path instead of the older direct `venue_cache` dependency, preserving the dynamic Geodata provider flow.
- Backdrop clicks no longer close a dirty event creation modal, reducing accidental data loss.

### Regression guard
- Admin Import / Geodata DB provider configuration remains untouched except for backend stability compatibility.
- Existing AWS, Mapy.cz, and Geoapify+TomTom provider fallbacks remain available.

## v1.7.6 — Event location DB autocomplete stabilization

### Fixed
- Stabilized event creation location search when active provider is a configured `db:*` Geodata provider.
- Split DB provider behavior by use case: `test_db_table_query` remains direct table projection for admin diagnostics, while `autocomplete` now uses resilient venue autocomplete.
- Fixed the regression where venue autocomplete returned direct-select diagnostic payloads and empty results for activity-like terms such as `board`, `hobbeast`, `társas`, or `játék`.
- Added semantic fallback so board-game/social activity queries can surface useful cafe/pub/venue candidates from live Geodata rows.
- Contained Import → Címkereső diagnostic layout with `min-w-0`, horizontal overflow containment, and safer debug wrapping.

### Regression guard
- Traffic Import/Eventbrite provider panels were not modified.
- API key lab and provider persistence logic were not changed.
- Geodata service-role usage remains server-side in Supabase Edge Function secrets only.

### Verification notes
- Edge runtime marker: `v1.7.6-stable-db-autocomplete`.
- DB autocomplete debug mode: `db_autocomplete_resilient`.
- Admin direct query debug mode remains: `direct_table_select`.

## [1.7.7] — 2026-04-28
### Changed
- Az admin felületről kikerült a korábban létrehozott `Címkezelő / Address Manager` tab és route-state, így az elavult surface már nem jelenik meg az UI-ban.
- Az Import / Címkereső nyers DB eredménytáblája oszloponkénti, realtime frontend-szűrést kapott a megjelenített oszlopokra.
- Az Import / Címkereső új, látható `Fordító / mapper nézetet` kapott, amely ugyanarra a lekérdezésre kirakja az eredeti provider kategóriakulcsokat, a magyar fordítást és a Hobbeast lokális katalógushoz becsült megfeleltetést.

### Added
- `docs/sql/geodata_project_mapper_tables.sql`: Geodata projekt célú DDL a `public.provider_category_mapper` és `public.aws_local_address_mapper` táblákhoz.
- `docs/address_matching_strategy.md`: AWS ↔ helyi címtábla megfeleltetés, scoring és review-flow terv internetes/primer forrásokra támaszkodó összefoglalóval.

### Notes
- A most látható mapper nézet még frontend derived layer; a tartós Supabase táblák ehhez a körhöz SQL fájlban kerültek előkészítésre a Geodata projekt számára, nem a Hobbeast projekt migrációi közé.

## [1.7.8] — 2026-04-28
### Fixed
- Regressziójavítás: az Import / Címkereső nyers DB eredménytábla oszlopfejléc alatti realtime szűrősora és a Fordító / mapper nézet együtt maradnak aktívak; egyik sem kerülhet ki a felületről a másik bővítése miatt.
- A kategória mező Live from Database ajánlói most már a nyers provider kulcs mellett a magyar aliasokat is kirakják, így HU/EN gépelésre ugyanabból a mezőből lehet pontosabban rászűrni.

### Changed
- A mapper nézet preferált oszlopai kiegészültek a lokális katalógus angol útvonalával (`local_catalog_path_en`) is, hogy a magyar és angol megfeleltetés egyszerre ellenőrizhető legyen.
- A `place-search` DB autocomplete most már megpróbálja a Geodata projekt `public.provider_category_mapper` táblájából kibővíteni a kategória kifejezéseket, ezért a HU/EN / Hobbeast slug inputok jobban rá tudnak fordulni a provider kategóriakulcsokra.

### Added
- `docs/sql/geodata_project_mapper_tables.sql` bootstrap seed blokkot kapott, amely feltölthető kezdő HU/EN provider ↔ Hobbeast kategóriamapping sorokat ad a Geodata projekthez.

### Notes
- A Hobbeast lokális katalógustábla neve: `public.places_local_catalog`.
- A Geodata projektben használt tartós kategóriamapper tábla neve: `public.provider_category_mapper`.

---

## [1.7.9] — 2026-04-28
### Admin / planner stability and reusable faceted-search documentation
- Documented the counted suggestion overlay / live faceted typeahead pattern in `docs/live-faceted-search-pattern.md` for reuse across admin and mapping screens.
- Fixed a route-planner regression source where provider results with missing coordinates could degrade into `0,0` and create Gulf-of-Guinea start/end points.
- Added coordinate validation and AWS detail fallback before accepting planner suggestions.
- Virtual hub member lists now support inline profile viewing via eye icon without forcing the hub detail dialog to close.
