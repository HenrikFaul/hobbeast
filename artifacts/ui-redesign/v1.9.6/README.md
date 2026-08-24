# Hobbeast v1.9.6 — vizuális regressziós bizonyíték

Dátum: 2026-08-24

Ez a mappa a `d07140e` alapállapothoz képest készült, azonos helyi Vite
környezetben. A `before-*` képek a változtatás előtti, az `after-*` képek az új
Hobbeast „Warm Social Field Guide” vizuális rendszerrel renderelt felületeket
mutatják.

## Nézetek

- Főoldal: 1440×1000, 768×1024 és 390×844.
- Explore: 1440×1000 és 390×844.
- Eseményrészlet: 1440×1000 és 390×844.
- A mintarészlet a már létező `sample-1` lokális fallback-adatot használja.

## Interaktív böngészős ellenőrzés

- mobilmenü nyitás/zárás, `aria-expanded` és `aria-controls`: PASS;
- látható billentyűzetfókusz: PASS (3 px fókuszgyűrű);
- Explore kategória és alkategória natív gombinterakció: PASS;
- 390 px vízszintes overflow a főoldalon, Explore-on, Events oldalon és az
  eseményrészleten: PASS;
- eseménylétrehozó mobil modál: PASS (`role=dialog`, `aria-modal`, címkézett
  bezárógomb, háttérgörgetés-zárás, saját belső görgetés);
- 44 px-es mobil navigációs és esemény CTA touch targetek: PASS.

Az offline vizuális környezet szándékosan nem kapcsolódott a hosztolt Supabase-
és külső eseményszolgáltatásokhoz. Ezért az itt rögzített eredmény lokális UI-
bizonyíték, nem hosztolt vagy produkciós bizonyíték.
