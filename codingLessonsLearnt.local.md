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
