
## Design Audit eredmény (jelenlegi állapot)

### Azonosított problémák:
1. **Hero**: jó alap, de a statisztikák kicsik és laposak, a floating card túl egyszerű
2. **Features szekció**: kártyák laposak, nincs vizuális mélység, hover effect gyenge
3. **Research szekció**: kártyák egyformák, nincs kiemelés, túl zsúfolt
4. **CTA szekció**: generikus, nincs „wow" hatás
5. **Navbar**: logó kép nem látszik (vagy kicsi), glass effect finomítható
6. **Footer**: alapszintű, nincs karakter
7. **Spacing**: nem mindenhol konzisztens 8px grid
8. **Kártyák**: nincsenek finom árnyékok, hover állapotok gyengék

### Tervezett javítások (regresszió nélkül, csak design):

**Batch 1 – Landing page (Hero + Features + Research + CTA):**
- Hero: nagyobb badge, finomabb animációk, statisztikák kártya-stílusban
- Features: kártyák finom gradient border-rel, hover-on ikon animáció, jobb spacing
- Research: featured study kiemelés, jobb kártya design
- CTA: háttér minta, jobb tipográfia, secondary CTA gomb hozzáadása

**Batch 2 – Navbar + Footer:**
- Navbar: finomabb glass, aktív link indikátor
- Footer: vizuálisan gazdagabb, brand sáv

**Batch 3 – About oldal:**
- Kérdőív statisztikák vizuális javítása (progress bar)
- Probléma/megoldás szekció jobb kontraszt

Minden változás kizárólag design/CSS/Tailwind szintű, funkció nem változik.
