# codingLessonsLearnt.local

Ide appendelődnek az adott repo saját új tanulságai.
A collector eszköz innen olvassa vissza a governance central repóba.
SOHA ne töröld a meglévő tartalmat — csak hozzáadni szabad.

---

## ➕ APPEND — 2026-04-03 common_admin drift

### [HIBA-051] Shared admin capability drift across repos
- **Dátum**: 2026-04-03 (v1.4.3)
- **Fájl**: `src/components/admin/*`, governance `common_admin/*`
- **Hibaüzenet**: Az egyik app adminja tud valamit, a másik nem — ugyanaz a capability más helyre kerül és elveszik a közös modell.
- **Gyökérok**: Nem volt közös, kanonikus common_admin modell, ezért az admin képességek apponként elsodródtak.
- **Javítás**: A common_admin capability-k governance kanonikus forrásra lettek kötve, és a Hobbeast admin új Common Admin tabot kapott inventory + version réteggel. Az Import funkciók megmaradtak a meglévő tabban.
- **Megelőzés**: MINDEN shared admin változtatásnál először a governance `common_admin/` fájljait kell frissíteni, és csak utána szabad az app-specifikus implementációt módosítani.

## v1.7.4 — Dynamic discovery instead of static category mapping

- Do not maintain static category mapping files for Geodata-driven address search. Discover category/source values dynamically from the selected database table.
- Admin query tools must show evidence: row count, source column, response time, selected filters, and backend match strategy.
- Category filters should not rely only on exact equality. Use exact-first behavior and a fuzzy fallback so real-world provider category values remain usable.
- When frontend uses a backend response for diagnostics, render empty states with actionable suggestions from live database facets instead of generic “no result” messages.

## v1.7.5 — Location search async safety and modal crash prevention

- **Symptom**: Typing in the event creation location input could create many `place-search` Edge Function calls, several 500 responses, and unstable modal behavior.
- **Root cause**: The dynamic discovery backend referenced `buildPseudoSql` without defining it, while the frontend did not abort stale requests and did not isolate search failures from the modal render tree.
- **Fix**: Added the missing backend helper, AbortController-backed frontend search cancellation, a short cache, slow-query diagnostics, and an Error Boundary around the event creation modal.
- **Prevention**: Any future address/location search feature must support debounce, request cancellation, stale-response protection, UI empty/error states, and backend runtime marker checks before deployment.
- **Regression note**: Do not reintroduce direct `venue_cache`-only search paths for event venue suggestions when `db:*` providers are active; use the configured address provider path.

## v1.7.6 — Separate admin DB projection from runtime venue autocomplete

### Symptom
Typing activity-like text such as `board`, `hobbeast`, `társas`, or `játék` into event creation location search produced empty results while `db:unified-poi` was active.

### Root cause
The same direct table projection function was used for both admin diagnostics and runtime venue autocomplete. Admin diagnostics need raw selected columns and counts; runtime autocomplete needs mapped venue results, semantic fallback, and user-safe empty/error behavior.

### Fix
Keep `test_db_table_query` as direct table projection, but route `autocomplete` for `db:*` providers through a dedicated resilient DB autocomplete engine.

### Prevention
Never reuse admin/debug projection endpoints as production autocomplete behavior. Admin query tools and user-facing search must have separate contracts and fallback logic.

## v1.7.7 — Admin import mapper visibility and geodata-only persistence split

- **Symptom**: Az új mapper nézet már szűrhető volt, de a legfontosabb kategóriafordítások nem látszottak, ezért operátori ellenőrzésre kevésbé volt használható.
- **Root cause**: A nyers DB projection és a frontend mapper nézet között nem jelent meg külön, explicit oszlopként az angol provider kategória, a magyar fordítás és a lokális Hobbeast-katalógus megfeleltetés.
- **Fix**: A mapper nézet most derived oszlopokat rak ki (`categories_en`, `categories_hu`, `local_catalog_path_hu`, `local_catalog_slug`) és ezek is oszloponként, realtime szűrhetők.
- **Prevention**: Diagnosztikai admin tábláknál nem elég a nyers mezőket kilistázni; az operátori döntéshez szükséges normalizált / fordított / lokális megfeleltető mezőket is explicit oszlopként kell megjeleníteni.
- **Architecture note**: Ha a tényleges perzisztencia másik Supabase projektben él (itt: Geodata), a Hobbeast repo-ban külön jelölni kell, hogy a jelen kör frontendje csak derived nézetet ad, a célprojekt DDL pedig külön SQL fájlban van előkészítve.

## v1.7.8 — Realtime admin filters and mapper-assisted category search must co-exist

- **Symptom**: Egy új kategóriafordítási bővítés után könnyen eltűnhet a nyers DB eredménytábla fejléces realtime szűrése vagy maga a mapper nézet, mert ugyanazon admin panelen több, egymásra épülő diagnosztikai réteg él.
- **Root cause**: A feature-t nem külön regressziós invariánsként kezeltük: a raw-table filter sor és a mapper-table filter sor egyszerre kötelező capability, nem egymást helyettesítő UI-elemek.
- **Fix**: A két tábla külön, explicit blokkban marad, mindkettő saját oszlopfejléc-alatti realtime szűrőkkel. A kategória ajánló logika külön réteg lett, nem írhatja felül a raw/mapper gridet.
- **Prevention**: Admin diagnosztikai képernyőknél előre rögzíteni kell az invariánsokat: (1) raw projection table látszik, (2) mapper table látszik, (3) mindkettő szűrhető, (4) új suggestion/mapping logika csak additív lehet.
- **Search architecture note**: Ha HU/EN / local catalog aliasokkal akarunk provider kategóriára rákeresni, azt a dedikált mapper tábla (`public.provider_category_mapper`) term-expansion rétegében kell megoldani, nem a raw találati táblák egyszerűsítésével.

## v1.7.9 — Faceted suggestion overlays must be reusable, and trip planners must reject null-island coordinates

- **Symptom**: The counted suggestion overlay proved highly effective for category exploration, but without naming and documenting the pattern it becomes hard to reuse consistently across future admin screens.
- **Pattern name**: Treat this UI as a `live faceted typeahead with counted suggestions` (or `FacetTypeahead`) instead of a generic dropdown.
- **Implementation lesson**: Keep the source rows, normalized aliases, bucket aggregation, count rendering, and keyboard interaction as separate layers so the same component can be reused for provider categories, cities, hubs, and address mappers.
- **Planner bug**: Address providers can occasionally return incomplete hits without valid coordinates; silently coercing these to numeric zero creates random `0,0` route points.
- **Fix**: Route-planning suggestion pipelines must validate coordinates and either enrich missing provider coordinates from a details endpoint or drop the invalid suggestion before selection.
- **Prevention**: Any autocomplete that feeds a map or router must treat `0,0` as invalid unless it is explicitly intended, and nested admin detail dialogs should open additive overlays instead of replacing the parent modal.
