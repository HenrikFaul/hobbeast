# Kapakka PubApp — Changelog

Minden változtatás dátummal és leírással.

---


## [1.4.1] - 2026-04-03

### ✨ Hobbeast admin import és címkereső provider konfiguráció
- Az admin `Import` panel többprovideres hubbá bővült:
  - **Eventbrite** preview + token/szervezeti pull
  - **Ticketmaster** preview + import
  - **Ticketmaster source** választó: `ticketmaster`, `universe`, `frontgate`, `tmr`
  - **SeatGeek** preview + import
- Új admin funkcionalitás került az Import panelre a **címkereső provider runtime konfigurációjához**:
  - választható provider: `AWS`, `Geoapify + TomTom`, `lokális címtábla`
  - a választás **adatbázisban mentett konfiguráció**, nem kódcserés megoldás
  - a kiválasztott provider adminból **tesztelhető** egy szabad szöveges kereséssel és találat preview-val
- Új lokális címtábla infrastruktúra került be:
  - `app_runtime_config`
  - `places_local_catalog`
  - `place_sync_state`
  - `search_local_places(...)` RPC
- Új `sync-local-places` edge function készült, ami adminból **manuálisan újratölthető** Geoapify és TomTom adatokkal, és visszaadja a betöltési státuszt / preview-t.

### 🔧 Technikai módosítások
- `src/lib/placeSearch.ts` runtime provider-aware kereső wrapper lett.
- `src/components/AddressAutocomplete.tsx` most már ugyanazt a runtime provider konfigurációt követi, mint a venue/hely kereső.
- `supabase/functions/place-search/index.ts` most már támogatja a `provider_mode` alapú útvonalválasztást és a lokális katalógusos keresést.
- Új versioning dokumentumpár készült:
  - `versioning/14040311_v1.4.1_business_request_summary.pdf`
  - `versioning/14040311_v1.4.1_ai_dev_prompts.md`

### ✅ Végellenőrzési checklist
- [x] `codingLessonsLearnt.md` beolvasva
- [x] `changelog.md` beolvasva
- [x] hivatalos dokumentációs kutatás megtörtént (Ticketmaster, AWS Places V2, Geoapify, TomTom)
- [x] legalább 2 megoldási koncepció összevetve
- [x] a kisebb regressziós kockázatú, adminból konfigurálható megoldás kiválasztva
- [x] Ticketmaster és egyéb integrált provider import UI visszakötve az admin panelre
- [x] runtime címkereső provider választás implementálva kódcserementesen
- [x] lokális címtábla újratöltés és ellenőrzés adminból megoldva
- [x] TypeScript ellenőrzés lefuttatva (`tsc --noEmit`)


## [1.3.8] — 2026-03-31

### 🧭 Versioning és fejlesztési metodika
- A fejlesztési workflow kiegészült azzal, hogy minden új üzleti kérés / hibajavítás előtt kötelező:
  - `codingLessonsLearnt.md` és `changelog.md` beolvasása
  - hivatalos internetes forráskutatás a gyökérok detektálásához
  - megoldási koncepciók kiértékelése és regressziós kockázat szerinti választás
- Új versioning dokumentumpár készült ehhez a hibajavításhoz:
  - `versioning/13804152_v1.3.8_business_request_summary.pdf`
  - `versioning/13804152_v1.3.8_ai_dev_prompts.md`

### 🐛 Venue finder / place-search hibajavítás
- A Geoapify Places integráció többé nem küld nem támogatott `text` paramétert a Places API felé; a helykeresés nearby + `name` alapú keresésre lett bontva.
- A TomTom integráció a közeli kategóriaalapú venue-listákhoz `categorySearch` irányt használ a korábbi túl szűk keresési út helyett.
- A `place-search` edge functionből kikerült a túl agresszív végszűrés, amely lenullázhatta a már megtalált provider venue-listát.
- A válasz debug-safe meta mezőt is ad (`raw_candidate_count`, `strict_match_count`, `returned_count`, `used_lenient_mode`), így a következő hibakeresés gyorsabb.
- A kliensoldali `searchPlaces()` helper puhább retry logikát kapott, és csak ezután esik vissza cache-re.

### ✅ Végellenőrzési checklist
- [x] `codingLessonsLearnt.md` beolvasva
- [x] `changelog.md` beolvasva
- [x] hivatalos internetes forráskutatás megtörtént
- [x] gyökérok detektálva
- [x] megoldási koncepciók összevetve
- [x] regressziószegényebb megoldás kiválasztva
- [x] korábbi működő funkciók search útvonala megőrizve
- [x] lessons/changelog frissítve
- [x] versioning dokumentumpár elkészítve

---

## [1.1.0] — 2026-03-30

### ✨ Új funkciók

#### Site Admin Panel (`/siteadmin/`)
- **Dashboard**: Összes felhasználó, helyszín, rendelés, bevétel metrikák valós időben
- **Felhasználó kezelés**: Szerepkörök módosítása, felhasználók tiltása/engedélyezése, keresés
- **Helyszín áttekintés**: Összes regisztrált venue státusza, aktivitása, bevételi adatok
- **Aktivitás logok**: Rendszer szintű eseménynapló (regisztrációk, rendelések, hibák)

#### Étlap/Itallap Sablonok (Vendéglátói panel)
- **Magyar kocsma sablon**: Csapolt sörök, üveges sörök, borok, röviditalok, koktélok, üdítők — 40+ előre kitöltött termék
- **Étterem sablon**: Előételek, levesek, főételek, desszertek, gyerekmenü — 30+ termék
- **Kávézó sablon**: Kávék, teák, limonádék, sütemények — 25+ termék
- **Koktélbár sablon**: Klasszikus és signature koktélok, gin&tonic, whisky válogatás — 35+ termék
- Egyetlen kattintással betölthetők az étlapra
- Kategóriák automatikus létrehozásával

#### Vendéglátói UI fejlesztések
- Továbbfejlesztett admin sidebar: ikonok Lucide React-ból, tooltipek, aktív állapot vizuálisan kiemelt
- Admin fejléc: venue név + élő rendelésjellző badge
- Konfigurátor bővítés: Asztal kapacitás szerkesztése, QR kód letöltés gomb
- Étlap szerkesztő: "Sablon betöltése" gomb a gyors induláshoz

### 🎨 UI/UX javítások
- Admin sidebar: sötét háttér gradienssel, átlátszó blur effekt mobil nézetben
- Státusz badge-ek: konzisztens szín és ikon rendszer (sárga/kék/narancs/zöld)
- Kártya design: finomabb árnyékok, lekerekített sarkok (16px)
- Gombok: hover animáció, disabled állapot vizuális visszajelzés
- Mobile-first responsive elrendezés az összes új oldalon
- Admin oldalsáv: Lucide ikonok az emoji ikonok helyett
- Siteadmin link a superadmin felhasználók számára

### 🗄️ Adatbázis
- `activity_logs` tábla: rendszer szintű eseménynaplózás
- `menu_templates` tábla: előre definiált étlap sablonok
- `menu_template_items` tábla: sablon tételek
- RLS policies az új táblákhoz
- Trigger: automatikus logolás regisztrációnál és rendelésnél

### 🔧 Technikai
- `changelog.md` bevezetése a változtatások nyomon követésére

---

## [1.0.1] — 2026-03-29

### 🐛 Hibajavítások
- Auth redirect loop javítása (middleware + page.tsx + customer/page.tsx + admin/layout.tsx egymásba irányított)
- RLS policy javítás: profil olvasás engedélyezés minden bejelentkezett felhasználónak
- Szerepkör hozzárendelés javítás: auth.users JOIN-nal email alapján
- Email mező szinkronizálás: handle_new_user() trigger javítás

---

## [1.0.0] — 2026-03-28

### 🎉 Első kiadás
- Vendég oldal: helyszín kereső, QR rendelés, rendeléskövetés, kocsmakvíz, játékok
- Admin panel: kiszolgálás, rendelések, étlap, készlet, statisztikák, konfigurátor, segítség
- Supabase auth + RLS
- Valós idejű rendeléskezelés (Realtime)
- PWA manifest


---

## [1.3.6] — 2026-03-31

### 🐛 Regressziójavítások
- **Input fókuszvesztés javítva** a bejelentkezési / regisztrációs / venue finder mezőkön
  - a page komponenseken belüli remountoló belső komponensek megszüntetve
  - a kereső- és jelszómezők már nem halnak meg 1 karakter után
- **Venue finder stabilizálva**
  - megszűnt a többször egymásra dobott „Nincs találat” toast
  - a kereső már csak inline empty state-et mutat
  - a kliens oldali keresés szélesebb fallbackgel hívja a `place-search` edge functiont
- **Select dropdown olvashatóság javítva**
  - a sötét témás option elemek explicit színt kaptak
- **Aktív becsekkolási logika visszaállítva**
  - a főoldali gyorselérés csempék csak aktív venue / asztal kontextus esetén látszanak
  - a becsekkolt venue neve és asztalszáma megjelenik
  - a scan és venue oldalak elmentik a becsekkolt kontextust

### ♻️ Visszatett korábbi funkciók
- **Játékok menü visszaállítva**
  - a külön Barátok menü helyére visszakerült a **Játékok** menüpont
  - ismét elérhető: kocsmakvíz / dice / igazság vagy mersz / részegségmérő
- **Barátok és közös listák** visszarakva a **Profil** oldal aljára
- **Hűségpont fókusz** visszaállítva a Profil oldalon
- **Egyéni ajánlataim** blokk hozzáadva a Profil oldalhoz
- **Admin oldali Étlap menüpont** visszaállítva az oldalsávba
- **Digitális étlap belépési pont** megőrizve és visszahangsúlyozva a vendég oldalon

### 🔧 Technikai
- `src/app/page.tsx` auth képernyő refaktor a fókuszvesztés megszüntetésére
- `src/app/customer/page.tsx` teljes regressziófix:
  - tabstruktúra helyreállítás
  - discover / games / profile logika rendezése
  - check-in context kezelés
- `src/components/PlaceAutocomplete.tsx` stabilabb controlled input viselkedés
- `src/app/customer/scan/page.tsx` és `src/app/customer/pub/[id]/page.tsx` aktív venue context mentés
- `src/lib/place-search.ts` szélesebb fallback keresés
- `supabase/functions/place-search/index.ts` szélesebb provider lekérés és jobb geocode/nearby összevonás

### 📝 Megjegyzés
- Ez a kiadás kifejezetten a korábban működő funkciók visszaállítására és a redesign regressziók megszüntetésére készült.
