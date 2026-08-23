# Design Master Rules

Ez a fájl a központi design/UI/UX operációs rendszer.
Nem helyettesíti a `controller.md`-t és nem helyettesíti a `codingLessonsLearnt.md`-t.
A szerepe az, hogy a design, UX, responsive és audit szabályokat külön, karbantartható módon tartsa.

## Kötelező munkafolyamat design vagy UI érintettségnél
1. Olvasd el a `controller.md` fájlt.
2. Olvasd el a `codingLessonsLearnt.md` releváns hibáit.
3. Olvasd el ezt a `design-master-rules.md` fájlt.
4. Azonosítsd az érintett képernyőket, route-okat, komponenseket és breakpointokat.
5. Úgy tervezz és implementálj, hogy a funkció ne sérüljön, csak a design/UX javuljon.
6. Futtasd le a design auditokat és a technikai regresszióellenőrzést.

## Senior role rendszer
### 1. Senior Fullstack Architect
- Full-context gondolkodás: soha ne csak egy fájlt nézz.
- A user goal fontosabb, mint a lokális esztétikai döntés.
- Minden redesignnál először a regressziós kockázatot auditáld.
- A design ne borítsa fel az adatmodellt, route-okat, auth flow-kat és backend szerződéseket.

### 2. Senior Product Designer + UI Architect
- Hierarchy first: az első 3 másodpercben látszódjon, mi a legfontosabb.
- Grouping: az összetartozó funkciók vizuálisan is együtt legyenek.
- Mobile-first: a 375px nézet nem mellékes, hanem elsőrangú állapot.
- Restraint: semleges alap + 1-2 akcentus, túlzsúfoltság tilos.
- Consistency: ugyanaz a spacing, ikonlogika, badge-logika és CTA-használat mindenhol.
- Accessibility a design része, nem utólagos javítás.

### 3. Senior Backend Architect
- UI döntés nem okozhat plusz instabilitást auth, RLS, rate-limit vagy query oldalon.
- A design változás után is maradjon meg a safe fallback, loading, empty és error state.

## Design blocker lista
Az alábbiak blockernek számítanak:
- nincs vizuális hierarchia
- kilógó szöveg, gomb, badge vagy input
- gyenge kontraszt
- desktop-only layout
- elavult vagy vegyes ikonrendszer
- túl sok egyformán hangsúlyos CTA
- inkonzisztens spacing és tipográfia
- nincs üres / loading / error állapot
- mobilon vízszintes overflow

## Kötelező design audit tesztek
1. Squint test — hunyorítva is látszik a hierarchia
2. Overflow test — hosszú címek, badge-ek, táblázatok, gombok sem lóghatnak ki
3. Responsive test — minimum 375 / 768 / 1200 px
4. Contrast test — WCAG AA törekvés minden fontos szövegnél és CTA-nál
5. Grouping test — a kapcsolódó elemek vizuálisan együtt legyenek
6. Modernity test — mai SaaS/product érzete legyen
7. Consistency test — ugyanaz a rendszer minden képernyőn

## Kötelező UI/UX parancsok
- maximum egy elsődleges CTA blokk területenként
- vizuális hangsúly: Primary > Secondary > Meta
- tipográfiai szintek száma legyen alacsony és tudatos
- spacing rendszer legyen konzisztens
- a web nézzen ki webesnek, a mobil nézzen ki mobilosnak
- a funkciók maradjanak meg, redesign csak additív vagy szerkezeti tisztítás lehet
- redesign közben ne romoljon az input használhatóság, modal, sheet, table, filter és pagination flow

## AI prompt rövid kivonat
Ezt a logikát kell tükröznie minden AI agentnek:
- ne csak megoldást generáljon, hanem auditáljon
- ne csak desktopot nézzen, hanem mobile-first gondolkodjon
- ne bontsa meg a működő funkciókat
- regresszió nélkül javítsa a hierarchy, grouping, consistency és responsiveness minőségét

## ChatGPT / Copilot / Codex / Claude / Cursor / Continue használati elv
- a részletes design referencia ez a fájl
- a rövidített kényszerítő szabályok a generált AI instruction fájlokba kerülnek
- a teljes design prompt gyűjteményt nem kell minden tool instruction fájlba teljes terjedelemben bemásolni

## Forrásfájl-hierarchia
1. `controller.md` — kötelező működési szabályok
2. `design-master-rules.md` — kötelező design rendszer
3. `codingLessonsLearnt.md` — ismert hibák és regresszióminták
4. `versioning-guidelines.md` — changelog / versioning működés

## Új design tanulságok kezelése
Ha design-specifikus visszatérő hiba jelenik meg:
- rövid kivonat menjen a `codingLessonsLearnt.local.md` fájlba
- strukturális design szabályváltozás menjen a központi `design-master-rules.md` fájlba
