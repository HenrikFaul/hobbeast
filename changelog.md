# Kapakka Hobbeast — Changelog

Minden változtatás dátummal és leírással. Append-only — korábbi bejegyzés nem törölhető, nem írható felül.

---

## [1.0.0] — 2026-03-28

### 🎉 Első kiadás
- Vendég oldal: helyszín kereső, QR rendelés, rendeléskövetés, kocsmakvíz, játékok
- Admin panel: kiszolgálás, rendelések, étlap, készlet, statisztikák, konfigurátor, segítség
- Supabase auth + RLS
- Valós idejű rendeléskezelés (Realtime)
- PWA manifest

---

## [1.0.1] — 2026-03-29

### 🐛 Hibajavítások
- Auth redirect loop javítása (middleware + page.tsx + customer/page.tsx + admin/layout.tsx egymásba irányított)
- RLS policy javítás: profil olvasás engedélyezés minden bejelentkezett felhasználónak
- Szerepkör hozzárendelés javítás: auth.users JOIN-nal email alapján
- Email mező szinkronizálás: handle_new_user() trigger javítás

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

## [1.3.6] — 2026-03-31

### 🐛 Regressziójavítások
- **Input fókuszvesztés javítva** a bejelentkezési / regisztrációs / venue finder mezőkön
  - a page komponenseken belüli remountoló belső komponensek megszüntetve
  - a kereső- és jelszómezők már nem halnak meg 1 karakter után
- **Venue finder stabilizálva**
  - megszűnt a többször egymásra dobott „Nincs találat" toast
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
- `src/app/customer/page.tsx` teljes regressziófix
- `src/components/PlaceAutocomplete.tsx` stabilabb controlled input viselkedés
- `src/lib/place-search.ts` szélesebb fallback keresés
- `supabase/functions/place-search/index.ts` szélesebb provider lekérés és jobb geocode/nearby összevonás

### 📝 Megjegyzés
- Ez a kiadás kifejezetten a korábban működő funkciók visszaállítására és a redesign regressziók megszüntetésére készült.

---

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
- A válasz debug-safe meta mezőt is ad (`raw_candidate_count`, `strict_match_count`, `returned_count`, `used_lenient_mode`).
- A kliensoldali `searchPlaces()` helper puhább retry logikát kapott, és csak ezután esik vissza cache-re.

### ✅ Végellenőrzési checklist
- [x] `codingLessonsLearnt.md` beolvasva
- [x] `changelog.md` beolvasva
- [x] hivatalos internetes forráskutatás megtörtént
- [x] gyökérok detektálva
- [x] megoldási koncepciók összevetve
- [x] regressziószegényebb megoldás kiválasztva
- [x] korábbi működő funkciók megőrizve
- [x] lessons/changelog frissítve
- [x] versioning dokumentumpár elkészítve

---

## [1.4.1] — 2026-04-03

### ✨ Hobbeast admin import és címkereső provider konfiguráció
- Az admin `Import` panel többprovideres hubbá bővült:
  - **Eventbrite** preview + token/szervezeti pull
  - **Ticketmaster** preview + import
  - **Ticketmaster source** választó: `ticketmaster`, `universe`, `frontgate`, `tmr`
  - **SeatGeek** preview + import
- Új admin funkcionalitás a **címkereső provider runtime konfigurációjához**:
  - választható provider: `AWS`, `Geoapify + TomTom`, `lokális címtábla`
  - adatbázisban mentett konfiguráció, nem kódcserés megoldás
  - a kiválasztott provider adminból tesztelhető
- Új lokális címtábla infrastruktúra: `app_runtime_config`, `places_local_catalog`, `place_sync_state`, `search_local_places(...)` RPC
- Új `sync-local-places` edge function: adminból manuálisan újratölthető Geoapify és TomTom adatokkal

### 🔧 Technikai
- `src/lib/placeSearch.ts` runtime provider-aware kereső wrapper lett
- `src/components/AddressAutocomplete.tsx` runtime provider konfigurációt követ
- `supabase/functions/place-search/index.ts` támogatja a `provider_mode` alapú útvonalválasztást
- Új versioning dokumentumpár:
  - `versioning/14040311_v1.4.1_business_request_summary.pdf`
  - `versioning/14040311_v1.4.1_ai_dev_prompts.md`

### ✅ Végellenőrzési checklist
- [x] `codingLessonsLearnt.md` beolvasva
- [x] `changelog.md` beolvasva
- [x] hivatalos dokumentációs kutatás megtörtént (Ticketmaster, AWS Places V2, Geoapify, TomTom)
- [x] legalább 2 megoldási koncepció összevetve
- [x] runtime konfiguráció kódcserementesen megoldva
- [x] TypeScript ellenőrzés lefuttatva (`tsc --noEmit`)

---

## [1.4.2] — 2026-04-03

### 🧩 Common Admin baseline rollout
- Az admin `Import` tab megtartva és működőképes maradt.
- Új **Common Admin** tab hozzáadva a meglévő admin entry pointok megőrzésével.
- Közös admin capability-k:
  - **Integrációk és hosting inventory**
  - **Alkalmazásverzió és deployment metaadatok**
  - **Changelog-alapú leszállított funkciólista**
  - **Külső szolgáltatók és provider inventory**
- Governance `common_admin` canonical modellel szinkronizálva.
- A provider runtime vezérlők és a lokális katalógus operációk megmaradtak.

### 🔧 Technikai
- Új versioning dokumentumpár:
  - `versioning/14040321_v1.4.2_business_request_summary.pdf`
  - `versioning/14040321_v1.4.2_ai_dev_prompts.md`

### ✅ Végellenőrzési checklist
- [x] Import tab megtartva és működőképes
- [x] Common Admin tab hozzáadva, nem lecserélve
- [x] Provider runtime controls megőrizve
- [x] Governance common_admin canonical modellel szinkronizálva

---

## [1.4.3] — 2026-04-03

### 🧩 Common Admin rollout — append-only javítás
- A közös adminmodell Hobbeast oldali rolloutja **append-only changelog** elv szerint került korrigálásra.
- A korábbi közös adminfejlesztéshez tartozó változások nem felülírással, hanem új történeti bejegyzésként kerülnek nyilvántartásba.
- Új **Common Admin** admin tab került bevezetésre a korábbi Import funkciók megőrzése mellett.
- A közös adminfelület capability blokkjai:
  - **Integrációk és hosting**
  - **Alkalmazásverzió és deployment metaadatok**
  - **Changelog-alapú leszállított funkciólista**
  - **Külső szolgáltatók és provider inventory**
- A Hobbeast megtartja a már korábban bekerült többprovideres import modult:
  - Eventbrite, Ticketmaster / Universe / FrontGate / TMR, SeatGeek
  - Címkereső provider konfiguráció és teszt
  - Lokális címtábla újratöltés és státuszellenőrzés

### 🔧 Technikai
- `src/components/admin/CommonAdminPanel.tsx`
- `src/lib/commonAdminMetadata.ts`
- Új versioning dokumentumpár:
  - `versioning/14040331_v1.4.3_business_request_summary.pdf`
  - `versioning/14040331_v1.4.3_ai_dev_prompts.md`

### ✅ Végellenőrzési checklist
- [x] A changelog korábbi tartalma megőrizve
- [x] Az új admin capability-k hozzáappendelve, nem felülírva
- [x] A korábban bekötött import/provider funkciók megőrizve
- [x] A common_admin Hobbeast-admin felületbe illesztve

---

## [1.4.4] — 2026-04-03

### 🐛 Eseményszűrés és helykereső stabilizálás
- Az eseménykereső mostantól csak a **mai vagy jövőbeli dátumú** eseményeket mutatja.
- A Hobbeast és a lokálisan tárolt külső események backend lekérése is kizárja a múltbeli dátumú elemeket.
- A kliensoldali összefésülés is kapott egy második védelmi szűrőt.

### 🗺️ Mapy.cz túratervező keresés javítás
- A túratervező autocomplete már **Magyarországra szűkítve** keres (`locality=hu`).
- A találati lista a **tényleges helynevet / címet** mutatja elsődleges címként.
- A suggest útvonal geocode fallbacket kapott.

### 🔧 Provider és build stabilizálás
- Az address provider resolver többé nem ragad hibás `aws` módba konfigurált kulcs nélkül.
- A `place-search` és `seed-venues` funkciókból kikerült a problémás edge runtime típusimport.

### ✅ Végellenőrzési checklist
- [x] `codingLessonsLearnt.md` beolvasva
- [x] `changelog.md` beolvasva
- [x] hivatalos dokumentációs kutatás megtörtént
- [x] gyökérok detektálva
- [x] legalább 2 megoldási koncepció kiértékelve
- [x] kisebb regressziós kockázatú javítás kiválasztva

---

## [1.4.5] — 2026-04-03

### 🔧 Governance integritás helyreállítása

- **Changelog rendje helyreállítva**: a bejegyzések kronológiai sorrendbe kerültek (1.0.0 → legújabb), és a korábban kimaradt v1.4.2 entry hozzáadva a meglévő versioning pár alapján.
- **Controller szinkronizálva**: `.governance/controller.md` kiegészítve a canonical governance controller hiányzó szekcióival (execution authority enforcement, common_admin canonical-source rule, append-only changelog rule).
- **`codingLessonsLearnt.local.md` létrehozva**: a governance catalog `localLessonsFile` elvárásnak megfelelve; HIBA-051 (Shared admin capability drift) tartalommal.
- **Root `codingLessonsLearnt.md` helyreállítva**: a helyes merged fájl (shared + local HIBA-051) lett.

### 🐛 Gyökérok
- A changelog bejegyzések vegyes sorrendbe kerültek (újak elejére kerültek, de a 1.3.6 kimaradt a helyes pozícióból).
- A hobbeast `.governance/controller.md` az egyszerűbb korábbi controller verzión maradt, nem kapta meg a governance csomag frissebb szekcióit.
- A `codingLessonsLearnt.local.md` a governance catalog elvárás ellenére soha nem jött létre.

### ✅ Végellenőrzési checklist
- [x] changelog kronológiai sorrend helyes
- [x] v1.4.2 bejegyzés hozzáadva (versioning fájl alapján)
- [x] controller szinkronizálva
- [x] codingLessonsLearnt.local.md létrehozva
- [x] korábbi history érintetlen
