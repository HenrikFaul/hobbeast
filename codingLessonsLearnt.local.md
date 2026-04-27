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
