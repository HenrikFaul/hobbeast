# LEGFONTOSABB: SEMMILYEN MÁR JÓL MŰKÖDŐ FUNKCIÓT NEM SZABAD ELRONTANI.

# FEJLESZTÉSI MÓDSZERTAN (MINDIG EZT KÖVESD ELŐSZÖR)

**KÖTELEZŐ indító prompt minden új fejlesztéshez / hibajavításhoz:**
1. **Legfontosabb, hogy semmilyen már jól működő funkciót ne ronts el.**
2. Olvasd be a `codingLessonsLearnt.md` és a `changelog.md` fájlt.
3. Az újonnan megfogalmazott üzleti követelmény vagy hibajavítás érdekében **szedd össze az összes szükséges tudást elsődlegesen hivatalos forrásokból / megbízható dokumentációból**.
4. A begyűjtött tudás alapján **detektáld a valós gyökérokot** a kódban / konfigurációban / futási láncban.
5. **Tesztek vagy célzott próbák alapján** hasonlíts össze legalább 2 megoldási koncepciót, és a **leghatékonyabbat / legkisebb regressziós kockázatút** válaszd.
6. A fejlesztést checklist-alapon végezd el.
7. A fejlesztés végén kötelezően ellenőrizd:
   - minden kért javítás / fejlesztés elkészült-e,
   - minden korábbi fontos funkció megmaradt-e,
   - a `codingLessonsLearnt.md`-ben felsorolt korábbi hibaminták nem tértek-e vissza,
   - a `changelog.md` frissült-e,
   - ha a projekt módszertana megköveteli, a `versioning/` mappába bekerült-e az új PDF + MD dokumentumpár.

**Kötelező végellenőrző checklist minden szállítás előtt:**
- [ ] `codingLessonsLearnt.md` beolvasva
- [ ] `changelog.md` beolvasva
- [ ] szükséges forráskutatás / dokumentációellenőrzés megtörtént
- [ ] gyökérok detektálva
- [ ] legalább 2 megoldási koncepció kiértékelve
- [ ] a legkisebb regressziós kockázatú megoldás kiválasztva
- [ ] korábbi működő funkciók megléte double-checkelve
- [ ] új regresszió nem maradt bent
- [ ] changelog frissítve
- [ ] projekt-specifikus átadási artefaktumok elkészítve, ha kötelezőek

# codingLessonsLearnt.md — ÖSSZEVONT KÖZÖS TUDÁSBÁZIS

## ⚠️ UTASÍTÁSOK (MINDIG OLVASD EL ELŐSZÖR!)

**KÖTELEZŐ MUNKAFOLYAMAT — Minden fejlesztés előtt:**
1. Nyisd meg és olvasd végig ezt a fájlt MIELŐTT bármit kódolnál.
2. Ellenőrizd, hogy az új kódod nem tartalmaz-e az itt felsorolt hibamintákat.
3. Ha új hibát találsz/javítasz, AZONNAL appendeld a megfelelő kategóriába.
4. SOHA ne töröld a meglévő tartalmat — csak hozzáadni szabad.
5. SOHA ne hozz létre új fájlt ezzel a céllal — mindig ebbe a fájlba írd.

**Struktúra minden hiba bejegyzésnél:**
```md
### [HIBA-XXX] Rövid cím
- **Dátum**: Mikor fordult elő
- **Fájl**: Melyik fájlban volt / melyik logikai komponenshez tartozik
- **Hibaüzenet**: Pontos TypeScript/build/runtime/API error
- **Gyökérok**: Miért történt
- **Javítás**: Hogyan lett megoldva
- **Megelőzés**: Hogyan kerüld el a jövőben
```

**Megjegyzés az összevont tudásbázishoz:**
- A duplikált tanulságok csak EGYSZER szerepelnek.
- A több alkalmazásból származó, de azonos hibaminták összevonva kerültek be.
- Az alkalmazásfüggetlen külső API / integrációs hibák is bekerültek általános mintaként.

---

## 🔴 KATEGÓRIA 1: TypeScript / React / komponens szerződés hibák

### [HIBA-001] Hiányzó property az interface-ből
- **Dátum**: 2026-03-30 (v1.1.0)
- **Fájl**: `src/app/admin/menu/templates/page.tsx:157`
- **Hibaüzenet**: `Type error: Property 'item_sort' does not exist on type 'TemplateItem'.`
- **Gyökérok**: A `TemplateItem` interface-ben nem volt definiálva az `item_sort` property, miközben a kód hivatkozott rá (`sort_order: item.item_sort`). Az interface-t kézzel írtam, és kifelejtettem egy mezőt amit az SQL tábla tartalmaz.
- **Javítás**: Hozzáadtam `item_sort: number` a `TemplateItem` interface-hez.
- **Megelőzés**: **MINDIG** hasonlítsd össze az interface mezőket az SQL tábla oszlopaival. Ha az SQL-ben van `item_sort`, az interface-ben is KELL lennie. Checklist: minden SQL oszlop = egy interface property.

### [HIBA-002] Supabase FK reláció típusozás — `.table.number` hiba
- **Dátum**: 2026-03-30 (v1.2.0)
- **Fájl**: `src/app/admin/reports/page.tsx:61`
- **Hibaüzenet**: `Type error: Property 'number' does not exist on type '{ number: any; }[]'.`
- **Gyökérok**: Supabase `.select('table:tables(number)')` esetén a TypeScript a relációt **tömbként** (`{ number: any }[]`) típusozza, nem objektumként. Ezért `o.table.number` helyett `o.table[0].number` kellene, de valójában futásidőben objektumot ad vissza (nem tömböt).
- **Javítás**: A `.map()` callback-ben `(o: any)` típust használtam: `.map((o: any) => [...])` — ez megkerüli a Supabase TS típus problémát.
- **Megelőzés**: **MINDIG** használj `(item: any)` cast-ot amikor Supabase `.select()` eredményt iterálsz és FK relációkat (`table:tables(...)`, `venue:venues(...)`, `menu_item:menu_items(...)`) használsz. VAGY használj `useState<any[]>([])` a state-hez. A kettő közül az egyik KÖTELEZŐ.

### [HIBA-003] Supabase FK — új oszlopok nem ismertek a TS típusokban
- **Dátum**: 2026-03-30 (v1.2.0)
- **Fájl**: `src/app/admin/reports/page.tsx:137`
- **Hibaüzenet**: Potenciális — `total_orders`, `total_spent` nem létezik a `profiles` Supabase típusban.
- **Gyökérok**: Ha ALTER TABLE-lel új oszlopot adsz hozzá (`total_orders`, `total_spent`), a Supabase TS generált típusok nem frissülnek automatikusan. A `.select()` eredmény típusa nem tartalmazza az új mezőket.
- **Javítás**: `(c: any)` cast a `.map()` callback-ben.
- **Megelőzés**: Ha SQL migrációval új oszlopokat adsz egy meglévő táblához, az adott tábla select eredményeit MINDIG `(row: any)` casttal kezeld, amíg a típusok nem lesznek újragenerálva (`supabase gen types`).

### [HIBA-038] AppShell prop contractot nem szabad megsérteni
- **Dátum**: 2026-03-31
- **Fájl**: AppShell használó oldalak (`automation`, `releases`)
- **Hibaüzenet**: `Property 'projectName' does not exist on type ...`
- **Gyökérok**: Az `AppShell` csak `children` és opcionális `projectId` propot fogad, mégis `projectName` prop került átadásra.
- **Javítás**: A hibás `projectName` propot el kell távolítani, és csak `projectId` maradjon átadva.
- **Megelőzés**: Komponens használat előtt mindig ellenőrizni kell az aktuális prop típust, különösen hotfix közben. Külön ellenőrző keresés: `AppShell projectName=`.

---

## 🟡 KATEGÓRIA 2: SQL / RLS / Adatbázis hibák

### [HIBA-004] SQL szintaxis hiba — RLS policy zárójelezés
- **Dátum**: 2026-03-29 (v1.0.0)
- **Fájl**: `supabase/migrations/001_initial_schema.sql:47`
- **Hibaüzenet**: `syntax error at or near "or" LINE 47: ) or is_active = true;`
- **Gyökérok**: Az RLS policy USING() zárójelén kívül volt egy `or is_active = true` feltétel. A helyes szintaxis: `USING ((feltétel1) OR (feltétel2))` — minden feltétel a USING() BELSEJÉBE kerül.
- **Javítás**: Az egész policy-t újraírtam helyes zárójelezéssel.
- **Megelőzés**: RLS policy írásakor MINDIG ellenőrizd, hogy MINDEN feltétel a `USING(...)` zárójelen BELÜL van. Soha ne legyen logikai operátor a zárójelen kívül.

### [HIBA-005] RLS policy circular dependency — profil olvasás blokkolva
- **Dátum**: 2026-03-29 (v1.0.1)
- **Fájl**: Profiles RLS policies
- **Hibaüzenet**: Profil lekérdezés sikertelen admin felhasználóknál.
- **Gyökérok**: A profiles SELECT policy JOIN-t tartalmazott a `venues` táblára, ami maga is RLS-sel volt védve. Ha a venues policy is hivatkozott a profiles-ra → circular dependency. Az admin felhasználó nem tudta olvasni a saját profilját.
- **Javítás**: Egyszerű policy: `CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);` — minden bejelentkezett felhasználó olvashat minden profilt.
- **Megelőzés**: **SOHA** ne legyen RLS SELECT policy-ban JOIN más RLS-védett táblára. Ha kell cross-table check, használj egyszerű `auth.uid()` alapú feltételt, vagy SECURITY DEFINER funkciót.

### [HIBA-006] Profil email NULL — role update 0 rows
- **Dátum**: 2026-03-29 (v1.0.1)
- **Fájl**: profiles / auth trigger
- **Hibaüzenet**: `UPDATE public.profiles SET role = 'admin' WHERE email = 'x@y.com'` → 0 rows affected
- **Gyökérok**: A `handle_new_user()` trigger nem másolta át az email-t az `auth.users` táblából a `profiles` táblába. A `profiles.email` mező NULL volt, ezért a WHERE feltétel nem talált sort.
- **Javítás**: JOIN-os UPDATE: `UPDATE profiles p SET role = 'admin' FROM auth.users u WHERE p.id = u.id AND u.email = 'x@y.com';`
- **Megelőzés**: A `handle_new_user()` trigger MINDIG másolja át az email-t: `NEW.raw_user_meta_data->>'email'` VAGY `(SELECT email FROM auth.users WHERE id = NEW.id)`. Soha ne feltételezd, hogy a profiles.email ki van töltve.

### [HIBA-007] Supabase FK constraint név — törékeny hivatkozás
- **Dátum**: 2026-03-30 (v1.1.0)
- **Fájl**: `src/app/siteadmin/venues/page.tsx`
- **Hibaüzenet**: Potenciális — `profiles!venues_owner_id_fkey` nem létezik.
- **Gyökérok**: `.select('*, owner:profiles!venues_owner_id_fkey(full_name, email)')` — a constraint név adatbázisonként eltérhet. A Supabase automatikusan generálja a FK constraint nevet, és nem garantált, hogy mindig `venues_owner_id_fkey`.
- **Javítás**: Lecseréltem `.select('*, owner:profiles(full_name, email)')` — constraint név nélkül, a Supabase automatikusan feloldja.
- **Megelőzés**: **SOHA** ne használj explicit FK constraint nevet a `.select()` relációkban. Használd a szimpla `table_name(columns)` szintaxist. Ha ambiguous, használd a `table_name!column_name(columns)` formátumot (oszlopnevet, NEM constraint nevet).

---

## 🟠 KATEGÓRIA 3: Auth / Redirect / Session hibák

### [HIBA-008] Auth redirect loop — 4 helyen konkurens redirect
- **Dátum**: 2026-03-29 (v1.0.0 → v1.0.1)
- **Fájl**: `middleware.ts` + `page.tsx` + `customer/page.tsx` + `admin/layout.tsx`
- **Hibaüzenet**: Végtelen loading screen — az alkalmazás sosem jutott túl az „Átirányítás...” képernyőn.
- **Gyökérok**: 4 különböző helyen volt routing logika, és egymásba irányítottak: middleware → `/admin` → `admin/layout` ellenőrzi → `/customer` → `customer/page` ellenőrzi → `/admin` → ∞ loop.
- **Javítás**:
  1. `middleware.ts` — CSAK cookie frissítés, NULLA redirect
  2. `page.tsx` — Egyetlen auth check 4s timeout-tal, `hasRedirected` ref a dupla redirect ellen
  3. `customer/page.tsx` — Admin felhasználóknak "Admin panel megnyitása" GOMB, nem redirect
  4. `admin/layout.tsx` — Nem-admin felhasználóknak error screen, nem redirect
- **Megelőzés**: **EGY SZABÁLY**: Routing döntés KIZÁRÓLAG client-side, egyetlen helyen. Middleware SOHA ne redirecteljen. Ha jogosultsági hiba van, mutass error screen-t, ne redirectelj másik oldalra.

### [HIBA-009] getSession() vs getUser() — elavult session
- **Dátum**: 2026-03-29
- **Fájl**: auth ellenőrzési flow-k
- **Hibaüzenet**: Közvetlen build error nincs, de elavult session állapot miatt hibás routing/jogosultsági döntés történhet.
- **Gyökérok**: `getSession()` a helyi cache-ből olvas, ami elavult lehet. `getUser()` mindig a Supabase szerverhez fordul.
- **Javítás**: Auth ellenőrzéseknél a kritikus pontokon `getUser()` használata.
- **Megelőzés**: Auth ellenőrzésnél MINDIG `getUser()` a megbízható módszer, NEM `getSession()`.

### [HIBA-014] Venue JOIN a profil lekérdezésben blokkolja az auth-ot
- **Dátum**: 2026-03-30 (v1.2.0)
- **Fájl**: `src/app/admin/layout.tsx`
- **Hibaüzenet**: "Nincs hozzáférésed" — admin felhasználó nem tud belépni az admin panelre.
- **Gyökérok**: A profil lekérdezés `select('*, venue:venues(*)')` formában volt, ami FK JOIN-t csinál a venues táblára. Ha a `profiles.venue_id` NULL, vagy nincs explicit FK constraint a DB-ben, vagy az RLS policy blokkolja a venues lekérést, az EGÉSZ lekérdezés hibával tér vissza (`profileError != null`). Emiatt a kód a `no-permission` ágra futott, pedig a felhasználó valójában admin role-lal rendelkezett.
- **Javítás**: A profil és venue lekérdezést SZÉTVÁLASZTOTTAM:
  1. Először: `select('*')` a profiles-ból (FK JOIN nélkül) — ez az auth check
  2. Utána: külön `select('*')` a venues-ból `venue_id` alapján — ez már NEM blokkolja az auth-ot
- **Megelőzés**: **SOHA** ne legyen FK JOIN egy auth-kritikus lekérdezésben. Az auth ellenőrzés (profil + role check) MINDIG egyszerű, single-table query legyen. Ha kiegészítő adatok kellenek (venue, orders stb.), azokat KÜLÖN, NEM-BLOKKOLÓ lekérdezésben szerezd be MIUTÁN az auth check sikeres.

---

## 🔵 KATEGÓRIA 4: Build / Import / Kompatibilitás hibák

### [HIBA-010] Next.js fájlnév konvenció — `page.tsx` kötelező
- **Dátum**: 2026-03-29
- **Fájl**: route fájlok
- **Hibaüzenet**: Direkt build error csak később látszik, de az oldal/routing nem épül be megfelelően.
- **Gyökérok**: A letöltött fájlokat `admin-layout.tsx` és `customer-page.tsx` néven mentették el `layout.tsx` és `page.tsx` helyett. Next.js App Router CSAK a `page.tsx`, `layout.tsx`, `loading.tsx` stb. pontos neveket ismeri fel.
- **Javítás**: A fájlok visszanevezése a pontos Next.js konvenció szerint.
- **Megelőzés**: Fájlok MINDIG a pontos Next.js konvenció szerinti nevekkel készüljenek. A letöltési/mentési utasításokban MINDIG jelöld meg a cél fájlnevet.

### [HIBA-011] Lucide React ikon import — nem létező ikon név
- **Dátum**: Általános
- **Fájl**: ikon importok
- **Hibaüzenet**: Import/build hiba nem létező ikon esetén.
- **Gyökérok**: Nem létező Lucide ikon importálása.
- **Javítás**: Biztosan létező ikonra cserélés.
- **Megelőzés**: Lucide React ikonokat MINDIG a hivatalos listáról importáld. Ha nem biztos, hogy létezik, használj olyan ikont ami biztosan megvan (pl. `Settings`, `User`, `Search`, `Plus`, `Check`, `X`).

---

## 🟢 KATEGÓRIA 5: CSS / UI / UX hibák

### [HIBA-012] Admin `.input` class hiányzik
- **Dátum**: 2026-03-30 (v1.1.0)
- **Fájl**: `globals.css`
- **Hibaüzenet**: Az admin inputok nem a várt stílussal jelennek meg / hiányzik az egyedi class.
- **Gyökérok**: Az admin oldalak `.input` CSS class-t használnak az input mezőkhöz, de ez nem volt definiálva a `globals.css`-ben. A Tailwind nem generálja automatikusan.
- **Javítás**: `.input` class hozzáadása a `globals.css`-hez explicit CSS-ként.
- **Megelőzés**: Ha egyedi CSS class-t használsz (`.input`, `.status-badge`, `.animate-slide-up`), MINDIG ellenőrizd, hogy definiálva van-e a `globals.css`-ben.

### [HIBA-013] Admin sidebar mobil nézet — nem jelenik meg
- **Dátum**: 2026-03-30
- **Fájl**: admin sidebar CSS
- **Hibaüzenet**: Mobilon a sidebar nem jelenik meg, hiába váltana `translate-x-0` állapotba.
- **Gyökérok**: A `display: none` `@media (max-width:768px)` felülírta a JavaScript-ből adott `translate-x-0` class-t.
- **Javítás**: CSS override: `.admin-sidebar.translate-x-0 { display: flex !important; }`
- **Megelőzés**: Ha egy elem CSS-ből `display:none`, a JS class hozzáadás NEM elég — `!important` kell a CSS-ben is.

### [HIBA-030] Belső komponensdefiníció a page komponensen belül → input fókuszvesztés minden billentyűleütésnél
- **Dátum**: 2026-03-31 (v1.3.6)
- **Fájl**: `src/app/page.tsx`, `src/app/customer/page.tsx`
- **Hibaüzenet**: Futás közben a beviteli mező 1 karakter után elvesztette a fókuszt; a jelszómezőbe és a venue finder keresőbe minden új karakter előtt újra bele kellett kattintani.
- **Gyökérok**: A page komponensen belül újradefiniált belső React komponensek (`<AuthFrame />`, `<HomeContent />`, `<DiscoverContent />` stb.) minden state-frissítésnél új komponens-típusként jöttek létre. Emiatt a React remountolta a teljes részfát, az input DOM node cserélődött, a fókusz elveszett.
- **Javítás**: A belső JSX részeket vagy külső top-level komponensekké kell emelni, vagy sima render helper függvényként kell használni komponens-hívás helyett. A mostani javítás a remountoló belső komponenseket megszüntette.
- **Megelőzés**: **SOHA** ne definiálj stateful inputokat tartalmazó React komponenseket egy másik page komponens törzsében úgy, hogy JSX komponensként (`<Valami />`) legyenek használva. Input/textarea/search mezőknél ez kötelező fókuszvesztés-check pont.

### [HIBA-031] Redesign regresszió — működő menüpontok és entry pointok eltűntek
- **Dátum**: 2026-03-31 (v1.3.6)
- **Fájl**: `src/app/customer/page.tsx`, `src/app/admin/layout.tsx`
- **Hibaüzenet**: A Játékok menü eltűnt, a Barátok külön menü lett, a profilból eltűntek a hűségpont fókuszú elemek, az admin sidebarból eltűnt az Étlap menüpont, a főoldalon pedig rossz üzleti logikával jelentek meg gyorscsempék.
- **Gyökérok**: A redesign során a navigációs struktúra és a csempe-logika a meglévő funkciók teljes funkcionális ellenőrzése nélkül lett átírva. A feature technikailag részben még létezett, de a felhasználó számára nem volt jó helyen vagy nem volt elérhető.
- **Javítás**: A Játékok külön menüpont visszakerült, a barát/lista funkciók a Profil alá kerültek, a hűségpont fókusz visszaállt, az admin oldalon az Étlap menü visszakerült, a főoldali gyorscsempék pedig már csak aktív becsekkolási kontextus esetén jelennek meg.
- **Megelőzés**: **MINDIG** legyen regressziós checklist: navigáció, fő CTA-k, étlap elérés, játékok, profil-pontok, admin oldal kulcsmenük. Nem elég, hogy a háttérlogika megvan — a feature látható entry pointja is kötelező.

### [HIBA-032] Select dropdown opciók láthatatlanok sötét témában
- **Dátum**: 2026-03-31 (v1.3.6)
- **Fájl**: `src/app/customer/page.tsx`
- **Hibaüzenet**: A kategória legördülőben csak az aktuális érték látszott; a többi opció fehér háttéren fehér vagy túl halvány szöveggel jelent meg.
- **Gyökérok**: A sötét themed select mező stílusa nem terjedt ki megbízhatóan az egyes `<option>` elemekre minden böngészőn. Emiatt a popup lista olvashatatlan lett.
- **Javítás**: Az option elemek explicit háttér- és színszínezést kaptak a kritikus dropdownokban.
- **Megelőzés**: Sötét témás `<select>` komponensnél **MINDIG** ellenőrizni kell magukat az `<option>` elemeket is Chromium alatt. A zárt mező jó kinézete nem garancia arra, hogy a lenyíló lista is olvasható.

### [HIBA-033] Discover auto-refresh + no-result toast → toast spam és félrevezető üres állapot
- **Dátum**: 2026-03-31 (v1.3.6)
- **Fájl**: `src/app/customer/page.tsx`
- **Hibaüzenet**: Többször egymás után megjelent a „Nem találtam helyet...” üzenet, miközben a kereső még gépelés alatt volt vagy a lista automatikusan frissült.
- **Gyökérok**: Az automatikus discovery futás és a no-result toast ugyanabban a flow-ban volt, ezért minden újraszámolásnál feljött a hibaüzenet. Ez egyszerre volt zajos és félrevezető.
- **Javítás**: Az automatikus no-result toast el lett távolítva; a „nincs találat” csak passzív üres állapotként marad a felületen.
- **Megelőzés**: Automatikusan futó search/filter flow-ban **SOHA** ne legyen toastszintű „nincs találat” üzenet. Az ilyen állapotot inline empty state-ként kell kezelni.

---

## 🟣 KATEGÓRIA 6: Külső Places / Search / Geometria / Rate limit / API-integráció hibák

### [HIBA-034] Geoapify Places API v2 — `text` paraméter csendben figyelmen kívül van hagyva
- **Dátum**: 2026-04-01 (v1.3.9)
- **Fájl**: `supabase/functions/place-search/index.ts`
- **Hibaüzenet**: Venue névkeresés nem adott találatot, bár a Places API kérés sikeres volt (HTTP 200).
- **Gyökérok**: A `https://api.geoapify.com/v2/places` endpoint **nem** ismeri a `text` paramétert — az a geocoding API-hoz tartozik (`/v1/geocode/search`). A Places API v2-ben a POI névszűrés paramétere `name`. Mivel `text` csendben figyelmen kívül volt hagyva, az endpoint kategória+terület alapján adott vissza találatokat, de a névszűrés teljesen kimaradt.
- **Javítás**: `&text=...` helyett `&name=...` paraméter a Places API hívásban. A két Geoapify keresési mód külön függvénybe lett szétválasztva: `searchGeoapifyByName()` és `searchGeoapifyNearby()`.
- **Megelőzés**: **MINDIG** a Places API v2 dokumentációját ellenőrizd, NE a geocoding API dokumentációját. A két API más paramétereket fogad el. Szöveg alapú POI névszűrés = `name`, geocode query = `text`.

### [HIBA-035] TomTom poiSearch — text + category kombinálása nullázza a találatokat
- **Dátum**: 2026-04-01 (v1.3.9)
- **Fájl**: `supabase/functions/place-search/index.ts`
- **Hibaüzenet**: `poiSearch/"BUDAPEST restaurant"` → 0 találat, bár a területen rengeteg étterem van.
- **Gyökérok**: A korábbi kód `searchQuery = textQuery + " " + category` kombinációt adott át a `poiSearch` endpointnak. A TomTom `poiSearch` POI-neveket keres — egy „BUDAPEST restaurant” nevű helyszín nem létezik. A helyes megközelítés: a szöveges query és a kategória alapú közelségi keresés **teljesen különálló** API hívások.
- **Javítás**: A TomTom keresés két önálló függvényre bontva:
  - `searchTomTomByName(query)` → `fuzzySearch/{query}` — szöveges névkeresés, opcionális helybias
  - `searchTomTomNearby(category)` → `poiSearch/{category}` — csak a kategória kulcsszóval, koordináta alapján
- **Megelőzés**: **SOHA** ne kombinálj szabad szöveges keresési queryt és kategória kulcsszót egyetlen TomTom `poiSearch` URL-be. A `fuzzySearch` szabad szövegre, a `poiSearch` kategória/keyword alapú közelségi keresésre való.

### [HIBA-036] Hard `textMatchesQuery` végszűrő — nullázza a provider találatokat
- **Dátum**: 2026-04-01 (v1.3.9)
- **Fájl**: `supabase/functions/place-search/index.ts`
- **Hibaüzenet**: Keresés „BUDAPEST”-re → 0 találat, bár Geoapify és TomTom is adott vissza eredményt.
- **Gyökérok**: A `textMatchesQuery()` hard filterként volt alkalmazva a merge utáni listán: csak azok a sorok maradtak, ahol a query szó megjelenik a `name` / `address` / `city` / `category` mezők valamelyikében. Emiatt egy egyébként releváns venue kieshetett. Ráadásul a TomTom `distance_km` fallback is hibás volt, ezért a távolsági feltétel is tévesen szűrhetett.
- **Javítás**: Score-alapú relevancia szűrő, három szinttel (3=névegyezés, 2=cím/városegyezés, 1=részleges szóegyezés) + lenient fallback: ha semmi sem kap 1+ pontot, az összes találat megmarad, csak távolság szerint rendezve.
- **Megelőzés**: Keresési pipeline végén **SOHA** ne legyen hard text filter, amely nullára vághat egy egyébként érvényes találatlistát. Mindig score+fallback stratégiát alkalmazz.

### [HIBA-037] `open_now` filter — `!Array.isArray(opening_hours_text)` mindig false
- **Dátum**: 2026-04-01 (v1.3.9)
- **Fájl**: `supabase/functions/place-search/index.ts`
- **Hibaüzenet**: `open_now: true` szűrővel a lista teljesen üres lett, bár nyitva lévő helyek is kellett volna legyenek benne.
- **Gyökérok**: A feltétel `row.open_now === true || !Array.isArray(row.opening_hours_text)`, de a mapper mindig `opening_hours_text: []` üres tömböt adott vissza, ezért `Array.isArray(...)` mindig `true`, a negált feltétel mindig `false`. Így az összes olyan venue kiesett, amelyiknek nem volt ismert nyitvatartása.
- **Javítás**: `row.open_now !== false` — csak az explicit `false` értéket zárja ki, a `null` / `undefined` (ismeretlen) értékű venue-k megmaradnak.
- **Megelőzés**: Nyitvatartás szűrőnél **MINDIG** az ismeretlen értékeket is vedd figyelembe. `=== true` helyett `!== false` a biztonságos feltétel.

### [HIBA-039] Geoapify Places API — hiányzó `categories` paraméter
- **Dátum**: 2026-04-01
- **Fájl**: Places / POI keresési integrációk
- **Hibaüzenet**: API-hiba vagy üres találatlista, ha csak név vagy csak térbeli szűrés van megadva.
- **Gyökérok**: A `v2/places` végpontnál kötelező legalább egy `categories` érték (pl. `commercial.supermarket`, `catering.restaurant`). Emberi vagy AI-hiba esetén gyakori, hogy csak `name=Starbucks` vagy csak `filter=circle:...` szerepel.
- **Javítás**: A query builder mindig állítson elő legalább egy valid Geoapify kategóriát, vagy a keresést explicit kétfázisú logikára bontsa.
- **Megelőzés**: **MINDIG** validáld, hogy a Places API hívás előtt van-e legalább egy támogatott `categories` érték.

### [HIBA-040] Geoapify `filter` / `bias` / koordináta sorrend hiba
- **Dátum**: 2026-04-01
- **Fájl**: Places / geometriakezelő réteg
- **Hibaüzenet**: Távoli vagy irreleváns találatok, vagy üres eredmény.
- **Gyökérok**: `filter` és `bias` hibás kombinálása, nem additív használata, illetve a `lon,lat` sorrend felcserélése (`lat,lon`), vagy hibás sugárérték.
- **Javítás**: Egységes geometria-helper bevezetése, amely mindenhol ugyanúgy generálja a `filter=circle:lon,lat,radius` és `bias=proximity:lon,lat` paramétereket.
- **Megelőzés**: **MINDIG** központi helperből generáld a koordinátás paramétereket. Kézzel ne interpolálj `lat/lon` stringeket több helyen.

### [HIBA-041] TomTom Search API — `lat/lon` csere és érvénytelen `radius`
- **Dátum**: 2026-04-01
- **Fájl**: TomTom keresési integrációk
- **Hibaüzenet**: `400 Bad Request`, irreleváns találatok, vagy teljesen hibás földrajzi középpont.
- **Gyökérok**: A `lat` / `lon` felcserélése, rossz WGS-84 koordináta, 0 alatti vagy túl nagy `radius`, illetve hibás string interpoláció.
- **Javítás**: Numerikus inputvalidáció és koordináta-normalizálás a request összeállítása előtt.
- **Megelőzés**: **MINDIG** validáld: `-90 <= lat <= 90`, `-180 <= lon <= 180`, `radius > 0`, és a query összeállítás után logold a végső request paramétereket debug módban.

### [HIBA-042] TomTom bbox vs. point-radius zavar
- **Dátum**: 2026-04-01
- **Fájl**: TomTom keresési integrációk
- **Hibaüzenet**: A találatok nem a várt földrajzi régióból érkeznek.
- **Gyökérok**: `topLeft + btmRight` és `lat/lon + radius` vagy `geobias=point:` egyszerre kerül használatra. A TomTom dokumentáció szerint ilyenkor a point-radius érvényesülhet, a bbox pedig ignorálódhat vagy félreérthető lesz.
- **Javítás**: Egy keresési kérésben csak EGY geometriai stratégiát használj: bbox VAGY point-radius.
- **Megelőzés**: **SOHA** ne keverd ugyanabban a kérésben a bbox és point-radius logikát.

### [HIBA-043] TomTom rate limit / kvóta — nincs throttling vagy backoff
- **Dátum**: 2026-04-01
- **Fájl**: batch keresések / provider orchestration
- **Hibaüzenet**: `403 Over the limit` vagy `429 Too Many Requests`
- **Gyökérok**: AI-vezérelt vagy batch lekérdezéseknél nincs QPS-limit, backoff vagy retry stratégia, ezért a kliens túllépi a napi / másodpercenkénti kereteket.
- **Javítás**: Request queue, concurrency limit, exponential backoff és limit-header figyelés (`X-RateLimit-*`).
- **Megelőzés**: **MINDIG** legyen provider-szintű throttle és retry policy.

### [HIBA-044] Geoapify rate limit — túl sok párhuzamos kérés
- **Dátum**: 2026-04-01
- **Fájl**: provider orchestration / autocomplete / place search
- **Hibaüzenet**: Időszakos teljesítményromlás, instabil válaszidő, esetenként rate-limit jellegű viselkedés.
- **Gyökérok**: A kliens vagy edge function túl sok párhuzamos kérdést indít, miközben nincs semaphore / concurrency limit.
- **Javítás**: Parallel request limiter, debounce, cache és kérés-összefűzés.
- **Megelőzés**: **MINDIG** legyen concurrency cap a Geoapify hívások körül, még akkor is, ha a provider nem minden esetben tilt azonnal.

### [HIBA-045] Geoapify kategória-hierarchia rossz lekérdezése
- **Dátum**: 2026-04-01
- **Fájl**: Geoapify category mapper / prompt-vezérelt query builder
- **Hibaüzenet**: Üres találatok látszólag helyes kategóriákkal.
- **Gyökérok**: Hibás kategórianév (`catering.fastfood`, `catering.fast_food.fast_food`, wildcard-szerű álértékek stb.). Az AI-modellek különösen hajlamosak nem létező hierarchikus kategóriákat generálni.
- **Javítás**: Whitelist-alapú kategóriamapper és dokumentált supported category lista.
- **Megelőzés**: **SOHA** ne engedj át közvetlenül nyers AI által generált Geoapify kategóriát validáció nélkül.

### [HIBA-046] TomTom `categorySet` / `classifications` / `language` félreértelmezése
- **Dátum**: 2026-04-01
- **Fájl**: TomTom kategóriakezelés
- **Hibaüzenet**: Üres vagy irreleváns kategóriás találatok, lokalizációs anomáliák.
- **Gyökérok**: Nem létező `categorySet` kód, deprecated mező félrehasználata, vagy nem támogatott IETF `language` érték.
- **Javítás**: TomTom-specifikus validálás a támogatott kategóriakódokra és nyelvi kódokra.
- **Megelőzés**: **MINDIG** provider-specifikus validációval engedd át a kategória- és language-paramétereket.

### [HIBA-047] Geoapify autocomplete / geocoder végpont és API-kulcs mismatch
- **Dátum**: 2026-04-01
- **Fájl**: autocomplete / geocoder integráció
- **Hibaüzenet**: `401`, `403`, vagy csendes 0 találat hibás végpont esetén.
- **Gyökérok**: Rossz endpoint (`/v1/geocode/autocomplete` elírása), hibás protokoll, vagy rossz / hiányzó `apiKey`. Gyakori hiba az is, hogy a frontend olyan paramétert enged át, amit a backend másik végpontra küld.
- **Javítás**: Endpoint-konstansok egységesítése, kulcsjelenlét-ellenőrzés, request/response contract egységesítése frontend és backend között.
- **Megelőzés**: **MINDIG** ugyanarra a végpontra és ugyanazzal a paraméterkészlettel építsen a frontend és a backend.

### [HIBA-048] TomTom fuzzy / typeahead keresés — bias nem ugyanaz, mint földrajzi szűrés
- **Dátum**: 2026-04-01
- **Fájl**: TomTom typeahead / fuzzy flow
- **Hibaüzenet**: A felhasználó távoli POI-kat lát, pedig „környéki” keresésre számított.
- **Gyökérok**: `radius` nélkül a `lat/lon` vagy `geobias` csak rangsorolási bias-t ad, nem kemény földrajzi szűrést.
- **Javítás**: Ha lokális találatok kellenek, használj valódi térbeli szűrést (`radius`, bbox vagy point-radius stratégia), és ezt különítsd el a puszta fuzzy/typeahead flow-tól.
- **Megelőzés**: **MINDIG** külön kezeld a „biasolt” és a „szűrt” keresést az UX és az API rétegben is.

### [HIBA-049] TomTom kategória + brand túl szigorú kombinálása
- **Dátum**: 2026-04-01
- **Fájl**: kategória- és brand-szűrő logika
- **Hibaüzenet**: 0 találat egyébként releváns területen.
- **Gyökérok**: Túl szűk `categorySet` + `brandSet` kombináció olyan régióban, ahol az adott brand valójában nincs jelen.
- **Javítás**: Kétlépcsős szűrés: előbb szélesebb provider-kategória, utána UI- vagy alkalmazásszintű finomszűrés.
- **Megelőzés**: **SOHA** ne szűkíts első körben túl agresszíven provider-oldalon, ha a régiós lefedettség nem garantált.

### [HIBA-050] Geoapify ↔ TomTom kategóriamapping primitív string-regex alapján
- **Dátum**: 2026-04-01
- **Fájl**: cross-provider category mapper
- **Hibaüzenet**: Támogatott provider-kategóriák helyett hibás vagy nem létező párok jönnek létre.
- **Gyökérok**: A fejlesztők egyszerű regex / string tartalmazás alapú mappinggel próbálnak Geoapify kategóriákat TomTom kategóriákhoz illeszteni.
- **Javítás**: Kézzel karbantartott, explicit mapping-tábla providerenként, fallback nélkül csak valid célértékekkel.
- **Megelőzés**: **SOHA** ne építs cross-provider kategóriamappinget puszta string-hasonlóság alapján. Providerenként explicit, validált mapping kell.

### [HIBA-051] Supabase auth trigger user_id=NULL — generált felhasználók user_origin='real' maradtak
- **Dátum**: 2026-04-12
- **Fájl**: `supabase/functions/mass-create-users/index.ts`, `handle_new_user_profile` trigger
- **Hibaüzenet**: Generált felhasználók "Igazi"-ként jelennek meg; city és hobbies mezők üresek.
- **Gyökérok**: Az `auth.users` INSERT triggerek (`handle_new_user`, `handle_new_user_profile`) profilt hoztak létre `id=auth_id` de `user_id=NULL` értékkel. A `persistProfile` függvény `user_id` alapján keresett → nem találta → INSERT-et próbált → konflikt `id`-n → csendesen meghiúsult → a profil megtartotta a trigger-alapértelmezett értékeket (`user_origin='real'`, `city=null`, `hobbies='{}'`).
- **Javítás**: (a) `persistProfile` átírva: upsert `id` konflikt alapján; (b) trigger javítva `user_id=NEW.id`-vel; (c) meglévő törött profilok backfill migrációval javítva.
- **Megelőzés**: **MINDIG** feltételezd, hogy auth triggerek futnak és részleges adattal írnak profilokat. Profile upsert-nél MINDIG `id`-t használj konflikt kulcsként, ne `user_id`-t. Az auth trigger kódját olvasd el mielőtt profile-kezelési logikát írsz.

### [HIBA-052] Supabase Edge Function alapértelmezetten verify_jwt=true — 401 Invalid JWT
- **Dátum**: 2026-04-12
- **Fájl**: `supabase/functions/eventbrite-import/index.ts`
- **Hibaüzenet**: `401 Invalid JWT` a fejlesztői konzolban; a funkció soha nem fut le.
- **Gyökérok**: A Supabase gateway alapértelmezés szerint ellenőrzi a JWT-t (`verify_jwt=true`). A `config.toml`-ban nem szereplő funkciók ezzel az alapértelmezéssel futnak. Az `eventbrite-import` soha nem igényelt felhasználói JWT-t (csak Eventbrite API kulcsot), de az admin UI-ból hívták lejárt/érvénytelen session tokennel.
- **Javítás**: A funkció újratelepítve `verify_jwt=false`-szal; hozzáadva a `config.toml`-hoz.
- **Megelőzés**: **MINDIG** ellenőrizd a `supabase/config.toml`-t minden edge function esetén. Ha egy funkció nem igényel felhasználói azonosítást (pl. admin-only, service-role alapú, API-key alapú), állítsd be `verify_jwt=false`. Ha a JWT ellenőrzés szükséges, gondoskodj róla, hogy az admin UI mindig friss session tokent küld.

---

## 📋 ELLENŐRZŐ LISTA (Minden commit előtt)

- [ ] Auth-kritikus lekérdezésben NINCS FK JOIN? (`profiles` select = egyszerű `select('*')`)
- [ ] Minden interface/type property megegyezik az SQL tábla oszlopaival?
- [ ] Supabase `.select()` FK relációk használatánál van `(row: any)` cast?
- [ ] Nincs explicit FK constraint név a Supabase select-ben?
- [ ] Nincs middleware-ben redirect?
- [ ] Auth check `getUser()`-t használ, nem `getSession()`-t?
- [ ] Fájlnevek Next.js konvenciónak megfelelnek (`page.tsx`, `layout.tsx`)?
- [ ] Egyedi CSS class-ok definiálva vannak a `globals.css`-ben?
- [ ] Lucide ikonok a hivatalos listáról importálva?
- [ ] RLS policy-kban nincs cross-table JOIN más RLS-védett táblára?
- [ ] Új SQL oszlopok esetén a kód `(row: any)` castot használ?
- [ ] Places / Search API hívásnál a provider-specifikus paraméterek validak?
- [ ] `lat/lon` sorrend, `radius`, `bbox`, `bias`, `filter` stratégia explicit ellenőrizve?
- [ ] Van throttling / retry / concurrency limit a külső kereső API-k körül?
- [ ] Nincs olyan utólagos hard filter, ami lenullázhatja a provider által már visszaadott érvényes listát?
- [ ] Az ismeretlen / `null` állapotokat (pl. `open_now`) nem kezeli-e túl szigorúan a szűrés?

---

---

## 🗺️ Geokódolás: a névegyezés kapuja (2026-08-26)

**Hiba:** a Photon/Nominatim fuzzy találatot ad, és a "Dürer Kert"-re
"ELTE Fűvészkert", a "Ferenczy Múzeum"-ra "Országos Színháztörténeti Múzeum",
a "Bridge Garden"-re "Vénusz Garden" jött vissza. Mindegyik CSAK az
épülettípus-szót osztotta a kereséssel — a térképen viszont magabiztosan rossz
helyre tette a programot.

**Szabály:** külső geokódoló találatát SOHA nem fogadjuk el ellenőrzés nélkül.
- az épülettípus-szavak (múzeum, kert, klub, kulturális központ, ház, terem…)
  nem azonosítanak, ezért nem számítanak bele az egyezésbe
- az azonosító szavak legalább 60%-ának meg kell jelennie a válaszban
- a válasz utcája és városa is beleszámít az egyezésbe
- a bizonytalan találat helyett a város-szintű elhelyezés a helyes válasz:
  egy magabiztosan rossz tű rosszabb, mint a tű hiánya

**Ellenőrzés:** `src/features/__tests__/geocodeNameGate.test.ts` — minden
elutasított eset valódi éles találat volt.

---

## ⚠️ Git Bash heredoc: a dupla backslash összeomlik (2026-08-26)

**Hiba:** `<<'PY'` idézőjeles heredocban is `\\` → `\` lett, így egy
teszt ICS-escape-je (`Budapest\\,`) egyszerű `Budapest\,` lett — az
ESLint `no-useless-escape` fogta meg, a teszt viszont "átment", mert a rossz
bemenetet a rossz elvárás igazolta.

**Szabály:** ha a beírandó szöveg backslasht tartalmaz, ne heredocból menjen.
Használj `chr(92)`-t a Python payloadban, vagy a Write eszközt.

*Utoljára frissítve: 2026-08-26*

*Utoljára frissítve: 2026-04-01 — összevont közös tudásbázis*
*Ez egy FOLYAMATOSAN BŐVÜLŐ fájl. Új hibákat MINDIG appendelj, SOHA ne törölj!*

---

## 🚀 Edge Function telepítés: a CLI be van jelentkezve (2026-08-26)

**Tény:** a Supabase CLI ezen a gépen hitelesített (a token a Windows
Credential Managerben van, nem fájlban és nem környezeti változóban — ezért
`SUPABASE_ACCESS_TOKEN` üresnek látszik, a `supabase projects list` mégis megy).

**Ebből következik:** edge function telepítéshez NEM kell a fájl tartalmát
kézzel átmásolni semmilyen API-hívásba. A helyes parancs:

```
node scripts/sync-edge-recipes.mjs --check
npx --no-install supabase functions deploy source-manager --project-ref bqdvqmpwccsxumzijspj
```

**Miért fontos:** a source-manager a receptmotor szó szerinti másolatát
csomagolja; kézi másolásnál minden telepítés ~50 kB átgépelése, elgépelési
kockázattal. A CLI ugyanazt a repóban lévő fájlt tölti fel.

*Utoljára frissítve: 2026-08-26*

---

## 🔗 Külsős programra tett kiterjesztés SOHA nem lehet külön esemény (2026-08-26)

**Probléma:** ha egy külső programhoz "menjünk együtt" funkciót csinálunk, a
kézenfekvő megoldás egy `events` sor létrehozása lenne. Ez azonnal duplikációt
okoz: ugyanaz a program kétszer szerepel a katalógusban, két külön dátummal,
két külön helyszínnel, és a két példány elkezd elsodródni egymástól.

**Szabály:** a közös látogatás CSAK kiterjesztés. Két kicsi tábla
(`external_event_companion_plans`, `external_event_companion_members`) hivatkozik
az `external_events` sorra; a `events` táblába SEMMI nem íródik.

**A duplikáció ellen az adatbázis véd, nem a UI:**

```sql
CREATE UNIQUE INDEX external_event_companion_plans_one_open
  ON public.external_event_companion_plans (external_event_id)
  WHERE status = 'open';
```

Egy programhoz egyetlen nyitott terv tartozhat. Aki másodikként érkezik, nem
tud rivális tervet indítani — a meglévőhöz csatlakozik. A létrehozó RPC
`ON CONFLICT ... WHERE status = 'open' DO NOTHING`-gal idempotens, így két
egyidejű "igen" sem hoz létre két tervet.

**A listákban jelölni kell:** a program külsős marad (forrásbadge, eredeti
link, jegyvásárlás a szervezőnél), csak egy `Közös látogatás · N fő` címke
kerül rá.

**Ellenőrzés:** `src/features/__tests__/companionVisibility.test.ts`,
`src/components/events/ExternalEventCompanionCard.test.tsx`,
`src/lib/__tests__/externalCompanionPlan.test.ts`.

*Utoljára frissítve: 2026-08-26*

---

## 🚪 `/events/:id` nem csak a saját eseményeket jelenti (2026-08-26)

**Hiba:** a térkép kártyái `/events/<external_events.id>`-re linkeltek, de az
`EventDetail` csak a `events` táblát nézte (illetve `eb-`/`ext-` előtagú
id-knál a sessionStorage-ot). Eredmény: "Az esemény nem található" minden
térképes kattintásra — és minden megosztott vagy könyvjelzőzött linkre is.

**Szabály:** ha egy id nem található a saját táblában, MIELŐTT hibát írnánk ki,
meg kell nézni a külsős táblát is (`get_external_event_safe`), ugyanazzal a
láthatósági kapuval, amit a lista használ. A sessionStorage-alapú átadás
kényelmi gyorsítás lehet, de sosem lehet az egyetlen út egy oldalhoz.

*Utoljára frissítve: 2026-08-26*

---

## 🔎 Kulcsszavas szűrő: mindig éles adaton kell ellenőrizni (2026-08-26)

**Hiba:** a „Közösségi programok" szűrő elsőre beengedett egy koncertet
(„Színpadra fel! – Dúros Zenekar"), mert a szabály tartalmazta a `zenekar`
szót. A cím a FELLÉPŐT nevezi meg, nem azt, hogy a látogató zenél.

**Szabály:** kulcsszavas osztályozó szabályt SOHA ne csak kitalált példákkal
teszteljünk. A szabály megírása után futtatni kell az éles katalóguson, és
minden hamis találatból teszteset lesz. Három ilyen jött elő:

- `zenekar` / `korus` → a fellépőt nevezi meg, nem részvételi formát
- `tura` szóhatár nélkül → a `kultura` is tartalmazza (`\btura` kell)
- rossz upstream kategória (stand-up est „Társasjáték" kategóriával) → a CÍM
  felülírja a kategóriát, ha a cím egyértelműen nézői formátumot mond
  (`SPECTATOR_TITLE` a `src/features/events/eventFacets.ts`-ben)

**Kétfeltételes szezonalitás:** a „szezonális" szűrő csak akkor enged át egy
programot, ha (1) a szövege megnevezi a szezont ÉS (2) a program SAJÁT dátuma
abba a szezonba esik. Egyik feltétel önmagában használhatatlan: decemberben
minden mozielőadás „karácsonyi" lenne, júliusban meg a „Karácsonyi vásár"
elnevezésű raktárkiárusítás jönne be.

**Ellenőrzés:** `src/features/__tests__/eventFacets.test.ts` (26 teszt, köztük
minden éles hamis találat).

*Utoljára frissítve: 2026-08-26*

---

## 📦 Bundle-budget: új funkció előtt nézd meg, mit lehet lustán tölteni (2026-08-26)

**Tény:** a három új szűrő + a hero rotátor 5,7 KB-tal átvitte az
`events-route` nyers budgetjét (128 527 > 122 880 bájt).

**Rossz válasz:** megemelni a küszöböt. **Jó válasz:** a `CreateEventDialog`
(642 sor) csak akkor kell, ha a felhasználó megnyomja a gombot — `React.lazy` +
`Suspense`, és a route 128 KB-ról 67 KB-ra esett. Ugyanaz a minta, mint az
admin paneleknél a v1.26.0-ban.

**Szabály:** ha egy route budget FAIL-t kap, előbb keress egy kattintás mögötti
nehéz komponenst, és csak akkor nyúlj a küszöbhöz, ha nincs ilyen.

*Utoljára frissítve: 2026-08-26*

---

## 🏛️ Klub ≠ hub ≠ kör: mielőtt új entitást csinálsz, nézd meg a meglévőket (2026-08-26)

**Kérdés volt:** kell-e külön `clubs` tábla, amikor van `virtual_hubs`,
`social_circles`, `venues` és `external_event_feed_sources`?

**Válasz:** igen, mert egyik sem ugyanaz:
- `virtual_hubs` — automatikusan generált online hobbi-hub, kvalifikációs
  pontszámmal; nincs címe és nincs edzésideje
- `social_circles` — kis, privát kör olyanoknak, akik már ismerik egymást
- `clubs` — valódi szervezet címmel, edzésrenddel, nyitott ajtóval, ami akkor
  is létezik, ha a Hobbeast nem

**A döntő szabály:** a „csatlakozás" nem tagfelvétel. A Hobbeast nem tud
felvenni senkit egy egyesületbe — csak jelezni tudja az érdeklődést. Ezt a
felületen KI KELL MONDANI, nem elég technikailag helyesen megcsinálni.
Ugyanez a szabály, mint a v1.28.0 közös látogatásainál.

**Katalógusból származó sor gazdátlan.** Egy nyilvános klubkeresőből átvett
adat tény a világról, nem a klub állítása: `owner_id IS NULL`, és az oldal ki is
írja, hogy „a klub még nem vette át”. Az ingest csak hiányt tölt ki
(`COALESCE(mező, új_érték)`), kézzel gondozott adatot soha nem ír felül.

*Utoljára frissítve: 2026-08-26*

---

## 🔗 Külső katalógus linkjei: normalizálni kell, mielőtt megkötésbe ütközik (2026-08-26)

**Hiba:** a `clubs_facebook_shape` CHECK megköveteli a `^https?://` kezdetet. A
klubkereső viszont írt `www.facebook.com/CowbellsFootball` alakot is, és az első
ilyen sor egy 200 elemű köteg egészét megölte (a plpgsql loopban a
constraint-hiba az egész függvényt visszagörgeti).

**Szabály:** külső forrásból jövő URL-t KÉT helyen kell kezelni:
1. a gyűjtőben normalizálni (`new URL()`-lel, séma pótlásával) — a puszta
   hostból használható link lesz, a `mailto:`/`#` pedig kiesik
2. az ingest függvényben újra szűrni — mert az nem bízhat a hívójában

A megkötést NEM lazítjuk: a féllábú URL az adatbázisban rosszabb, mint a hiánya.

*Utoljára frissítve: 2026-08-26*

---

## 🧮 Lapozott listát NEM lehet a böngészőben szűrni (2026-08-27)

**Szabály:** ha a lista lapozva jön (`p_limit`/`p_offset`), akkor minden olyan
szűrő, ami a teljes halmazra vonatkozik, az ADATBÁZISBAN kell legyen. A
kliensoldali szűrő csak a már letöltött oldalakat látja, és magabiztosan,
csendben hiányos választ ad — ez rosszabb, mint a hibaüzenet.

Konkrét eset: „december 12–14., Debrecen” az első 48 sorból válaszolt volna.

**Kliensoldalon maradhat** a második ellenőrzés (védelem mélységben), és azokra
a forrásokra, amik nem az RPC-n jönnek (minta-események, élő Eventbrite-előnézet).

*Utoljára frissítve: 2026-08-27*

---

## ⚠️ Függvényparaméter bővítés: DROP + CREATE, nem CREATE OR REPLACE (2026-08-27)

**Csapda:** ha egy meglévő függvényhez új (alapértelmezett) paramétert adsz
`CREATE OR REPLACE`-szel, az NEM cseréli le a régit — új **túlterhelést** hoz
létre. Ezután a régi, névvel hivatkozó hívás MINDKETTŐRE illeszkedik, és
`function ... is not unique` hibával elszáll. Ez élesben azonnali kiesés.

**Helyes sorrend:**
```sql
DROP FUNCTION IF EXISTS public.f(date, integer, integer);
CREATE FUNCTION public.f(..., p_new date DEFAULT NULL) ...
```
Az új paraméter a lista VÉGÉRE megy, NULL alapértékkel, és NULL = a régi
viselkedés.

**Bizonyítás kötelező:** csere ELŐTT rögzíts `md5(payload::text)` lenyomatot a
tipikus hívásokra, utána hasonlítsd össze. Ha nem bájtazonos, az regresszió.

*Utoljára frissítve: 2026-08-27*

---

## 🏘️ Közösségi klubot nem tart nyilván senki — a NÉV a szűrő (2026-08-27)

**Helyzet:** sportklubot országos szövetség regisztrál (Nagy Sportágválasztó:
2698 klub egy struktúrált listából). Baba-mama kört, nyugdíjas klubot,
társasjáték-estet SENKI. Az a művelődési ház oldalán él, és ezeknek az
oldalaknak nincs közös HTML-szerkezetük.

**Ezért nem elrendezést elemzünk.** A `scripts/lib/communityClubs.mjs` a
LINKEKET olvassa, és azokat tartja meg, amiknek a szövege klubnevet mond:

- kell benne klubszó szóhatáron: `klub`, `kör`, `szakkör`, `egyesület`,
  `műhely`, vagy tematikus jelző (`baba-mama`, `nyugdíjas`, `társasjáték`…)
- NEM lehet mondat (pont+szóköz, vagy 10 szónál hosszabb)
- NEM lehet a puszta kategóriaszó (`Klub`, `Klubjaink`, `Közösségeink`) — az az
  oldal saját címe, nem klubnév

Egy oldalról (pecsikult.hu) 29 valódi klub, nulla hamis találat.

**A visszahívást feláldozzuk a pontosságért:** az 54-ből 29-et talál meg, mert
a többi csak sima szövegben szerepel link és heading nélkül. Ez a jó irány —
egy kitalált klub rosszabb, mint egy hiányzó.

*Utoljára frissítve: 2026-08-27*

---

## ♻️ Katalógusból jövő adat: bélyegezni kell, nem törölni (2026-08-27)

**Szabály:** külső katalógusból származó sor NEM egyszeri import. A forrás
változik: klub megszűnik, szövetség kivezeti, az oldal átrendeződik.

Amit minden futásnak csinálnia kell:
1. `last_seen_at = now()` arra, amit MÉG megtalál (és `stale_since = NULL`)
2. ami ugyanabból a katalógusból kimaradt: `stale_since` bélyeg (45 nap)
3. ami régóta hiányzik: `is_active = false` (120 nap) — **de sosem DELETE**

**Amihez sosem nyúlunk:** ha `owner_id IS NOT NULL` (valaki a klubtól átvette),
vagy a `source` nem `directory` (admin vette fel / önregisztráció). A
frissítés csak a saját adatát rendezi.

**Ütemezés:** ne írj új mechanizmust. A `scraper_schedules` mintája
(`run_at_hours` + `days_of_week` + óránkénti pg_cron tick, ami GitHub workflow
dispatch-ot küld a vaultból olvasott tokennel) már bizonyított — a
`club_refresh_schedules` szó szerint ezt másolja.

*Utoljára frissítve: 2026-08-27*

---

## 🚫 Közösségi oldalt NEM gyűjtünk — de a szöveget be lehet másolni (2026-08-27)

**Tény:** Facebook/Instagram oldal posztjait kijelentkezve nem lehet lekérni (a
platform semmit nem ad ki), saját felhasználói fiókkal lekérni pedig a
szabályzatba ütközik és a fiók tiltását kockáztatja. A `recipes.mjs` `social`
receptje ezért `unsupported: true`, és az `inspectSource` a közösségi URL-re
figyelmeztetéssel válaszol, nem jelölttel.

**A helyes út HÁROM lépcsős, ebben a sorrendben:**
1. **A szervező saját oldala.** A posztok többsége hivatkozik rá
   (`sorfesztival.hu`, `chillislandclub.hu`, `foglalas.kvizestek.hu`). Ezt a
   forrásvarázslóval fel lehet venni — a `sorfesztival.hu`-t az elemző elsőre
   megtalálta `page-prose`-zal.
2. **Bejegyzés bemásolása** (`src/features/events/socialPostParser.ts` +
   admin → Bejegyzésből): amit az operátor jogszerűen elolvasott, azt
   továbbadhatja. Kézzel ellenőrzött, `external_source = 'manual'`.
3. **Kézi felvétel**, ha egyik sem megy.

**Amit soha:** felhasználói fiókkal scrape-elni a platformot.

*Utoljára frissítve: 2026-08-27*

---

## 🕐 Dátumból ne olvass órát (2026-08-27)

**Hiba:** a `2026.08.30. 18:00` szövegből a `08.30` lett a kezdési idő
(08:30-ként), mert a `[:.]` szeparátoros óraminta ráillett a dátumra is.

**Szabály:** időpont keresése ELŐTT törölni kell a szövegből a dátummintákat:

```js
const withoutDates = text
  .replace(/20\d{2}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}\.?/g, ' ')
  .replace(/\b20\d{2}\b/g, ' ');
```

Ez a második ilyen eset ebben a projektben (az első az ISO offset `+02:00`
órának olvasása volt v1.27.0 előtt). Ahol dátum és idő egy sorban van, ott a
dátum elsőbbséget élvez.

**Ellenőrzés:** `src/features/__tests__/socialPostParser.test.ts` — mind a 10
teszt valódi, beküldött bejegyzésből származik.

*Utoljára frissítve: 2026-08-27*

---

## 🔁 SECURITY DEFINER RPC + service role = auth.uid() NULL (2026-08-27)

**Hiba:** a `source-manager` edge function ellenőrizte a hívó
`providers.manage` jogosultságát (`requireAdmin()`), majd **service role
klienssel** hívta az `admin_upsert_scraper_source`-ot. Az RPC viszont maga is
ellenőriz: `admin_has_capability(auth.uid(), …)` — és service role kliensnél
nincs user a JWT-ben, tehát `auth.uid()` NULL → `CAPABILITY_REQUIRED`. A
felhasználó ennyit látott: „A forrás mentése nem sikerült."

**Szabály:** ha az RPC `auth.uid()`-ra épít, akkor a HÍVÓ nevében kell hívni
(`asUser.rpc`), nem service role-lal. Service role csak ott, ahol az RPC
kifejezetten `auth.role() = 'service_role'`-t vár.

**Bizonyítás:** ugyanaz a hívás admin identitással `OK`, service role claimmel
`42501 / CAPABILITY_REQUIRED`.

*Utoljára frissítve: 2026-08-27*

---

## 🔄 onAuthStateChange minden fókuszra új session objektumot ad (2026-08-27)

**Hiba:** tabváltás után visszatérve az egész oldal újratöltődni látszott.

**Ok:** a Supabase fókuszba kerüléskor újraellenőrzi a munkamenetet, és
`TOKEN_REFRESHED` eseménnyel ÚJ session objektumot ad ugyanarra az emberre.
A provider ezt feltétel nélkül `setUser()`-elte → a `user` referencia
megváltozott → MINDEN `useEffect(..., [user])` újrafutott → minden lista
újratöltött.

**Szabály:** auth állapotot csak akkor írj, ha tényleg változott — hasonlítsd
össze a `user.id`-t és az `access_token`-t, mielőtt setState-elsz. És a context
`value`-t `useMemo`-zd, különben a provider minden renderje újrarendereli az
összes fogyasztót.

**Ellenőrzés:** `src/features/__tests__/authSessionIdentity.test.tsx`.

*Utoljára frissítve: 2026-08-27*

---

## ⬆️ SPA-ban a görgetés visszaállítását kézbe kell venni (2026-08-27)

**Hiba:** hosszú lista közepéről megnyitott link a FRISS oldal aljára dobott.

**Ok:** a böngésző visszaállítja az előző görgetési pozíciót, és SPA-ban ez
arra kerül rá, ami épp megjelenik — nem arra, amiről származik.

**Szabály:** `history.scrollRestoration = 'manual'`, és útvonalváltáskor
`scrollTo(0,0)` — DE:

- `POP` (vissza/előre) esetén NEM, mert ott a megjegyzett pozíció a helyes,
- `#hivatkozás` esetén a megnevezett elem nyer,
- a query stringre NE figyelj: az események oldal gépelés közben írja a
  szűrőket az URL-be, és minden leütésre a tetejére ugrani rosszabb lenne,
  mint az eredeti hiba.

**Ellenőrzés:** `src/features/__tests__/scrollToTop.test.tsx`.

*Utoljára frissítve: 2026-08-27*

---

## 🔑 Bővítmény ne autentikáljon: adja át a webalkalmazásnak (2026-08-27)

**Hiba:** a Chrome-bővítmény e-mail–jelszó párossal lépett be a Supabase-be.
Az operátor Google-fiókkal regisztrált → **nincs jelszava**, amit megadhatna.
A Google-jelszó pedig nem a Supabase jelszava, így a `password` grant mindig
`invalid_grant`-tel bukott. Ráadásul API-kulcsot kellett a bővítménybe másolni.

**Szabály:** egy bővítmény ne legyen önálló API-kliens. Olvassa be, amit kell,
és **adja át a webalkalmazásnak**, ahol a felhasználó már be van jelentkezve —
bármilyen módszerrel. Így nincs kulcs, nincs második bejelentkezés, és a
meglévő, már ellenőrzött admin UI végzi a mentést.

**Átadás:** URL **fragmentben** (`#import=<base64url>`), amit a böngésző soha
nem küld el a szervernek — nem kerül kéreslogba.

**Buktató, amibe bele is futottunk:** ha a munkamenet lejárt, az `/auth`-ra
irányítás **eldobja a fragmentet**. Ezért a hand-offot az alkalmazás
indulásakor kell `sessionStorage`-be menteni (`src/main.tsx`), nem abban a
komponensben, amelyik felhasználja — az már a redirect után mountolódik.

**Ellenőrzés:** `src/features/__tests__/postImportHandoff.test.ts`.

*Utoljára frissítve: 2026-08-27*

---

## 💥 `\b` template literálban backspace, nem szóhatár (2026-08-27)

**Hiba:** `new RegExp(`\b(${CITIES.join('|')})\b`, 'i')` — a városnevek
**semmire nem illeszkedtek**. Template literálban a `\b` a **backspace
karakter** (U+0008), nem regex szóhatár. A regex forrása `JSON.stringify`-jal
kiíratva ugyanúgy `"\b"`-nek látszik, mert a JSON is így escape-eli — ezért
szemre nem lehet észrevenni.

**Szabály:** `new RegExp` template literálban MINDEN escape duplázandó:
`\b`, `\d`, `\s`. Regex literálban (`/\b/`) nem.

**Ellenőrzés:** `grep -rPn "\x08" src/` — üres kell legyen (a bináris
képfájlokat leszámítva).

**Külön csapda:** bash heredocon át írt fájl (`<<'EOF'`) **elnyelheti a
backslasheket**, így a helyesen megírt `\b` is `\b`-vé, majd backspace-szé
válhat. Regexet tartalmazó fájlt ne bash heredoccal írj — használj Write-ot.

*Utoljára frissítve: 2026-08-27*

---

## 🏷️ Közösségi posztban az emoji IS címke (2026-08-27)

**Hiba:** a `📍 Ráckeve – Kis-Duna` sorból nem lett helyszín, mert az emojit
dekorációként levágtuk, mielőtt bármi ránézett volna — és „Helyszín:" felirat
nélkül nem maradt mit illeszteni.

**Szabály:** előbb olvasd ki az emojit mint címkét, és csak utána strippeld.
Szócímke mindig veri az emojit (`📍 Időpont: 18:00` az időpontról szól).

**Buktató:** a `🌍` és a `🗺` ugyanolyan gyakran nyit marketingmondatot, mint
amilyen gyakran helyet jelöl — ezeket ne vedd címkének. Emojival bevezetett
sort csak akkor fogadj el értéknek, ha értékre hasonlít (rövid, nem kérdés,
nem összetett mondat).

**Ellenőrzés:** `src/features/__tests__/socialPostParserFields.test.ts`.

*Utoljára frissítve: 2026-08-27*

---

## 🔇 Nem ellenőrzött fájl = néma hiba a felhasználónál (2026-08-27)

**Hiba:** a `popup.js`-be egy szerkesztés valódi sortörést tett egy string
literálba → a fájl **nem parse-olható** → a Chrome csendben betölti, a modul el
sem indul → a gomb **nem csinál semmit**, hibaüzenet nélkül. A felhasználó
többször újratöltötte a bővítményt, mire kiderült.

**Szabály:** minden szerkesztett fájlt ellenőrizz le a saját eszközével,
MÉG akkor is, ha „csak egy sort" írtál át:

```bash
node --check <fajl.js>
```

Ha egy mappát semmilyen pipeline nem érint (nincs build/lint/typecheck —
tipikusan böngészőbővítmény, statikus asset), akkor **tesztet kell írni rá**,
különben a felhasználó a CI.

**Ellenőrzés:** `src/features/__tests__/extensionSyntax.test.ts` — parse-olja
minden `.js`-t, és nézi, hogy a `$('id')` hivatkozások léteznek-e a HTML-ben.
A guardot vissza kell ellenőrizni: tedd vissza a hibát, és bukjon el.

**Kapcsolódó:** a bash heredoc és a Python `\n` együtt többször is elrontotta
ugyanezt a fájlt — regexet vagy escape-et tartalmazó fájlt Write-tal írj.

*Utoljára frissítve: 2026-08-27*

---

## 🕷️ Crawler-tudás a Smartsearchtool-ból (2026-08-27)

**Forrás:** `C:\Work\Smartsearchtool` — működő scraping/crawling kód és
tudásbázis (`SEARCHFORGE/knowledge/K4_crawl_extract.md`, grepsearch
`crawler.server.ts`, hercules `crawler_actions.ts`).

**Amit átvettünk a Hobbeast forrásfelderítőjébe:**

- **SimHash near-dedup** (`scraper-worker/src/sources/fingerprint.mjs`) — a
  hercules 64-bites SimHash-e + Hamming-távolság. Küszöb: 3 bit VALÓS
  oldalhosszon (~20k karakter); rövid stringen a SimHash-nek túl kevés az
  entrópiája, ott a teszt is valósághű hosszal dolgozzon.
- **Frontier-crawl** (`crawlFrontier.mjs`) — mélységkorlátos BFS, per-host cap,
  összoldal-büdzsé, robots minden lekérésnél. A fetch és a robots **injektált**,
  így hálózat nélkül tesztelhető fake site-gráffal.
- **Tartalom-minőség** (`contentQuality`) — a QSDM nyelvfüggetlen fele. JSON-LD
  eseményt tartalmazó oldalt SOHA ne büntess vékonyságért — az is tartalom.
- **URL-kanonizálás** (K4 clean-params) + **crawl-trap őrök** (naptár, belső
  keresés, session-URL, szűrőrobbanás, mély lapozás, önismétlő útvonal).

**Szabály:** felderítés ≠ crawl ≠ index (K4). A promóció a valódi források közé
**emberi döntés** marad; a pontozás csak azt dönti el, mi kerül a listára.

**Buktató:** a meghajtó menet közben lecsatolódhat (`E:` → `C:`); ha a
felhasználó másik utat ad, onnan olvass tovább.

## Nyilvános B2B API (O-G) — pgcrypto, séma-feltevések, tiszta modul

- **pgcrypto az `extensions` sémában van, nem a `public`-ban.** A
  `gen_random_bytes` / `digest` hívó SECURITY DEFINER függvények `search_path`-ja
  tartalmazza az `extensions`-t is (`SET search_path TO 'public','extensions',
  'pg_temp'`), különben futásidőben `function ... does not exist`. A
  `CREATE EXTENSION IF NOT EXISTS pgcrypto` önmagában nem elég, mert nem a
  keresési úton lévő sémába telepít.
- **Az `events` táblán NINCS `source_payload` oszlop** — az a külső-események
  staging tábláé. Az `events`-nek van viszont `external_id` (text, unique index
  nélkül), ami külső eredetű eseményekhez való: az API-idempotenciát ide tesszük
  `b2b_api:<org_id>:<key>` alakban namespace-elve (org-onként egyedi, cross-org
  ütközés nélkül). **Tanulság:** minden beszúrt oszlopot előbb az élő
  `information_schema.columns`-ból igazolj — a részleges egyezés (14/15) csendben
  átcsúszhat, amíg a hiányzó oszlop futásidőben el nem hasal.
- **API-kulcsok: soha ne tárold a nyers kulcsot.** `hbk_live_<40hex>`, tárolva
  csak `sha256` hash + rövid előtag; a teljes kulcs egyszer, létrehozáskor jön
  vissza. A `resolve_api_key` `service_role`-only és a hash alapján keres — egy
  kiszivárgott adatbázissor nem ad használható kulcsot.
- **Tiszta modul az edge + a teszt között** — az OpenAPI-dokumentumot és a
  hibaborítékot Deno-mentes `openapi.ts` építi, amit az `index.ts` (Deno.serve)
  ÉS a vitest is importál. Az `index.ts` közvetlen importja tesztből tilos
  (`Deno.serve` importkor lefutna). A CI csak `src/**`-t futtat vitesttel; a
  Deno-tesztek (`*.test.ts` a functions alatt) manuálisak — a CI-védelemhez a
  tesztet `src/` alá tedd, a tiszta modult `.ts` kiterjesztéssel importálva
  (`allowImportingTsExtensions: true`, nincs `rootDir`, így a határon átnyúló
  import nem gond).
- **A MCP edge-deploy `verify_jwt=true`-t erőltet; nyilvános, x-api-key-es
  funkcióhoz a Supabase CLI kell** (`npx supabase functions deploy …`), ami a
  `config.toml` `[functions.api-b2b] verify_jwt=false`-át tiszteli.

*Utoljára frissítve: 2026-08-28*
