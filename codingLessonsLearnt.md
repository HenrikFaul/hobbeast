# LEGFONTOSABB: SEMMILYEN MÁR JÓL MŰKÖDŐ FUNKCIÓT NEM SZABAD ELRONTANI.

## 🔁 KÖTELEZŐ FEJLESZTÉSI MÓDSZERTAN (MINDEN ÚJ HIBA / REQUIREMENT ELŐTT)

**Kötelező indító prompt minden jövőbeli fejlesztéshez:**

> Olvasd be a `codingLessonsLearnt.md` és `changelog.md` fájlokat. A cél: **semmilyen már jól működő funkciót nem szabad elrontani**. Az újonnan megfogalmazott üzleti követelmény vagy hibajavítás érdekében először gyűjtsd össze az internetes / hivatalos dokumentációs tudást, ami a probléma detektálásához és a helyes megoldáshoz kell. Ezután detektáld a gyökérokot a kódban, készíts több megoldási koncepciót, végezz célzott teszteket a koncepciókra, és a leghatékonyabb, regressziószempontból legbiztonságosabb megoldást szállítsd. A fejlesztés végén checklist alapján ellenőrizd, hogy minden kérés teljesült, és hogy a korábbi hibaminták nem kerültek vissza.

**Kötelező lépések:**
1. `codingLessonsLearnt.md` és `changelog.md` elolvasása
2. Hivatalos webes / dokumentációs tudás összegyűjtése a problémáról
3. Gyökérok detektálása a kódban
4. Legalább 2 megoldási koncepció felállítása
5. Célzott teszt vagy szimuláció a koncepciókra
6. A legbiztonságosabb megoldás implementálása
7. Regresszióellenőrzés checklist alapján
8. `codingLessonsLearnt.md` és `changelog.md` frissítése
9. Versioning fájlpár generálása (`PDF` + `MD`)

## ⚠️ UTASÍTÁSOK (MINDIG OLVASD EL ELŐSZÖR!)

**KÖTELEZŐ MUNKAFOLYAMAT — Minden fejlesztés előtt:**
1. Nyisd meg és olvasd végig ezt a fájlt MIELŐTT bármit kódolnál
2. Ellenőrizd, hogy az új kódod nem tartalmaz-e az itt felsorolt hibamintákat
3. Ha új hibát találsz/javítasz, AZONNAL appendeld a megfelelő kategóriába
4. SOHA ne töröld a meglévő tartalmat — csak hozzáadni szabad
5. SOHA ne hozz létre új fájlt ezzel a céllal — mindig ebbe a fájlba írd

**Struktúra minden hiba bejegyzésnél:**
```
### [HIBA-XXX] Rövid cím
- **Dátum**: Mikor fordult elő
- **Fájl**: Melyik fájlban volt
- **Hibaüzenet**: Pontos TypeScript/build error
- **Gyökérok**: Miért történt
- **Javítás**: Hogyan lett megoldva
- **Megelőzés**: Hogyan kerüld el a jövőben
```

---

## 🔴 KATEGÓRIA 1: TypeScript típus hibák

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
- **Hibaüzenet**: Potenciális — `total_orders`, `total_spent` nem létezik a `profiles` Supabase típusban
- **Gyökérok**: Ha ALTER TABLE-lel új oszlopot adsz hozzá (`total_orders`, `total_spent`), a Supabase TS generált típusok nem frissülnek automatikusan. A `.select()` eredmény típusa nem tartalmazza az új mezőket.
- **Javítás**: `(c: any)` cast a `.map()` callback-ben.
- **Megelőzés**: Ha SQL migrációval új oszlopokat adsz egy meglévő táblához, az adott tábla select eredményeit MINDIG `(row: any)` casttal kezeld, amíg a típusok nem lesznek újragenerálva (`supabase gen types`).

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
- **Hibaüzenet**: Profil lekérdezés sikertelen admin felhasználóknál
- **Gyökérok**: A profiles SELECT policy JOIN-t tartalmazott a `venues` táblára, ami maga is RLS-sel volt védve. Ha a venues policy is hivatkozott a profiles-ra → circular dependency. Az admin felhasználó nem tudta olvasni a saját profilját.
- **Javítás**: Egyszerű policy: `CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);` — minden bejelentkezett felhasználó olvashat minden profilt.
- **Megelőzés**: **SOHA** ne legyen RLS SELECT policy-ban JOIN más RLS-védett táblára. Ha kell cross-table check, használj egyszerű `auth.uid()` alapú feltételt, vagy SECURITY DEFINER funkciót.

### [HIBA-006] Profil email NULL — role update 0 rows
- **Dátum**: 2026-03-29 (v1.0.1)
- **Hibaüzenet**: `UPDATE public.profiles SET role = 'admin' WHERE email = 'x@y.com'` → 0 rows affected
- **Gyökérok**: A `handle_new_user()` trigger nem másolta át az email-t az `auth.users` táblából a `profiles` táblába. A `profiles.email` mező NULL volt, ezért a WHERE feltétel nem talált sort.
- **Javítás**: JOIN-os UPDATE: `UPDATE profiles p SET role = 'admin' FROM auth.users u WHERE p.id = u.id AND u.email = 'x@y.com';`
- **Megelőzés**: A `handle_new_user()` trigger MINDIG másolja át az email-t: `NEW.raw_user_meta_data->>'email'` VAGY `(SELECT email FROM auth.users WHERE id = NEW.id)`. Soha ne feltételezd, hogy a profiles.email ki van töltve.

### [HIBA-007] Supabase FK constraint név — törékeny hivatkozás
- **Dátum**: 2026-03-30 (v1.1.0)
- **Fájl**: `src/app/siteadmin/venues/page.tsx`
- **Hibaüzenet**: Potenciális — `profiles!venues_owner_id_fkey` nem létezik
- **Gyökérok**: `.select('*, owner:profiles!venues_owner_id_fkey(full_name, email)')` — a constraint név adatbázisonként eltérhet. A Supabase automatikusan generálja a FK constraint nevet, és nem garantált, hogy mindig `venues_owner_id_fkey`.
- **Javítás**: Lecseréltem `.select('*, owner:profiles(full_name, email)')` — constraint név nélkül, a Supabase automatikusan feloldja.
- **Megelőzés**: **SOHA** ne használj explicit FK constraint nevet a `.select()` relációkban. Használd a szimpla `table_name(columns)` szintaxist. Ha ambiguous, használd a `table_name!column_name(columns)` formátumot (oszlop nevet, NEM constraint nevet).

---

## 🟠 KATEGÓRIA 3: Auth / Redirect / Session hibák

### [HIBA-008] Auth redirect loop — 4 helyen konkurens redirect
- **Dátum**: 2026-03-29 (v1.0.0 → v1.0.1)
- **Fájl**: middleware.ts + page.tsx + customer/page.tsx + admin/layout.tsx
- **Hibaüzenet**: Végtelen loading screen — az alkalmazás sosem jutott túl az „Átirányítás..." képernyőn
- **Gyökérok**: 4 különböző helyen volt routing logika, és egymásba irányítottak: middleware → /admin → admin/layout ellenőrzi → /customer → customer/page ellenőrzi → /admin → ∞ loop
- **Javítás**:
  1. `middleware.ts` — CSAK cookie frissítés, NULLA redirect
  2. `page.tsx` — Egyetlen auth check 4s timeout-tal, `hasRedirected` ref a dupla redirect ellen
  3. `customer/page.tsx` — Admin felhasználóknak "Admin panel megnyitása" GOMB, nem redirect
  4. `admin/layout.tsx` — Nem-admin felhasználóknak error screen, nem redirect
- **Megelőzés**: **EGY SZABÁLY**: Routing döntés KIZÁRÓLAG client-side, egyetlen helyen. Middleware SOHA ne redirecteljen. Ha jogosultsági hiba van, mutass error screen-t, ne redirectelj másik oldalra.

### [HIBA-009] getSession() vs getUser() — elavult session
- **Dátum**: 2026-03-29
- **Gyökérok**: `getSession()` a helyi cache-ből olvas, ami elavult lehet. `getUser()` mindig a Supabase szerverhez fordul.
- **Megelőzés**: Auth ellenőrzésnél MINDIG `getUser()` a megbízható módszer, NEM `getSession()`.

### [HIBA-014] Venue JOIN a profil lekérdezésben blokkolja az auth-ot
- **Dátum**: 2026-03-30 (v1.2.0)
- **Fájl**: `src/app/admin/layout.tsx`
- **Hibaüzenet**: "Nincs hozzáférésed" — admin felhasználó nem tud belépni az admin panelre
- **Gyökérok**: A profil lekérdezés `select('*, venue:venues(*)')` formában volt, ami FK JOIN-t csinál a venues táblára. Ha a `profiles.venue_id` NULL (nincs venue hozzárendelve), VAGY ha nincs explicit FK constraint a DB-ben, VAGY ha az RLS policy blokkolja a venues lekérést, az EGÉSZ lekérdezés hibával tér vissza (`profileError` != null). Emiatt a kód a `no-permission` ágra futott, pedig a felhasználó valójában admin role-lal rendelkezett.
- **Javítás**: A profil és venue lekérdezést SZÉTVÁLASZTOTTAM:
  1. Először: `select('*')` a profiles-ból (FK JOIN nélkül) — ez az auth check
  2. Utána: külön `select('*')` a venues-ból venue_id alapján — ez már NEM blokkolja az auth-ot
- **Megelőzés**: **SOHA** ne legyen FK JOIN egy auth-kritikus lekérdezésben! Az auth ellenőrzés (profil + role check) MINDIG egyszerű, single-table query legyen. Ha kiegészítő adatok kellenek (venue, orders stb.), azokat KÜLÖN, NEM-BLOKKOLÓ lekérdezésben szerzd be MIUTÁN az auth check sikeres.

---

## 🔵 KATEGÓRIA 4: Build / Import / Kompatibilitás hibák

### [HIBA-010] Next.js fájlnév konvenció — page.tsx kötelező
- **Dátum**: 2026-03-29
- **Gyökérok**: A felhasználó a letöltött fájlokat `admin-layout.tsx` és `customer-page.tsx` néven mentette el `layout.tsx` és `page.tsx` helyett. Next.js App Router CSAK a `page.tsx`, `layout.tsx`, `loading.tsx` stb. pontos neveket ismeri fel.
- **Megelőzés**: Fájlok MINDIG a pontos Next.js konvenció szerinti nevekkel készüljenek. A letöltési/mentési utasításokban MINDIG jelöld meg a cél fájlnevet.

### [HIBA-011] Lucide React ikon import — nem létező ikon név
- **Dátum**: Általános (megelőző figyelmeztetés)
- **Megelőzés**: Lucide React ikonokat MINDIG a hivatalos listáról importáld. Ha nem biztos, hogy létezik, használj olyan ikont ami biztosan megvan (pl. `Settings`, `User`, `Search`, `Plus`, `Check`, `X`). A `lucide-react@0.363.0` verzióban ezek biztosan elérhetők: Zap, ClipboardList, UtensilsCrossed, Package, BarChart3, Settings, HelpCircle, Menu, Bell, LogOut, Shield, ChevronRight, X, Monitor, CalendarClock, FileDown, Plus, Pencil, Trash2, Search, CheckCircle, XCircle, Volume2, VolumeX, Maximize, Minimize, RefreshCw, Check, Clock, AlertTriangle, Download, FileSpreadsheet, Calendar, TrendingUp, ShoppingBag, Users, Phone, Mail, User, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ArrowLeft, Sparkles, Star, MapPin, Store, ScrollText, LayoutDashboard, Activity, Info, AlertCircle, ToggleLeft, ToggleRight, Save, Filter, Bug, Send.

---

## 🟢 KATEGÓRIA 5: CSS / UI hibák

### [HIBA-012] Admin `.input` class hiányzik
- **Dátum**: 2026-03-30 (v1.1.0)
- **Gyökérok**: Az admin oldalak `.input` CSS class-t használnak az input mezőkhöz, de ez nem volt definiálva a globals.css-ben. A Tailwind nem generálja automatikusan.
- **Javítás**: `.input` class hozzáadása a globals.css-hez explicit CSS-ként.
- **Megelőzés**: Ha egyedi CSS class-t használsz (`.input`, `.status-badge`, `.animate-slide-up`), MINDIG ellenőrizd, hogy definiálva van-e a globals.css-ben.

### [HIBA-013] Admin sidebar mobil nézet — nem jelenik meg
- **Dátum**: 2026-03-30
- **Gyökérok**: A `display: none` `@media(max-width:768px)` felülírta a JavaScript-ből adott `translate-x-0` class-t.
- **Javítás**: CSS override: `.admin-sidebar.translate-x-0 { display: flex !important; }`
- **Megelőzés**: Ha egy elem CSS-ből `display:none`, a JS class hozzáadás NEM elég — `!important` kell a CSS-ben is.

---

## 📋 ELLENŐRZŐ LISTA (Minden commit előtt)

- [ ] Auth-kritikus lekérdezésben NINCS FK JOIN? (profiles select = egyszerű `select('*')`)
- [ ] Minden interface/type property megegyezik az SQL tábla oszlopaival?
- [ ] Supabase `.select()` FK relációk használatánál van `(row: any)` cast?
- [ ] Nincs explicit FK constraint név a Supabase select-ben?
- [ ] Nincs middleware-ben redirect?
- [ ] Auth check `getUser()`-t használ, nem `getSession()`-t?
- [ ] Fájlnevek Next.js konvenciónak megfelelnek (`page.tsx`, `layout.tsx`)?
- [ ] Egyedi CSS class-ok definiálva vannak a globals.css-ben?
- [ ] Lucide ikonok a hivatalos listáról importálva?
- [ ] RLS policy-kban nincs cross-table JOIN más RLS-védett táblára?
- [ ] Új SQL oszlopok esetén a kód `(: any)` castot használ?

---

*Utoljára frissítve: 2026-03-30 — v1.2.0*
*Ez egy FOLYAMATOSAN BŐVÜLŐ fájl. Új hibákat MINDIG appendelj, SOHA ne törölj!*


## ➕ APPEND — 2026-03-31 regressziók és UX-hibák

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

*Appendelve: 2026-03-31 — v1.3.6*


### [HIBA-034] Venue finder nullára szűrte a provider találatokat a function végén
- **Dátum**: 2026-03-31 (v1.3.9)
- **Fájl**: `supabase/functions/place-search/index.ts`, `src/lib/place-search.ts`
- **Hibaüzenet**: Futás közben a TomTom / Geoapify provider kérések ellenére a venue finder gyakran 0 találatot adott vissza (`Nincs találat`), különösen városnév vagy cím alapú keresésnél.
- **Gyökérok**: Két kombinált probléma volt:
  1. A Geoapify Places API lekérés a jelenlegi implementációban `text=` paraméterre épült, miközben a Places API hivatalos, dokumentált név-alapú POI szűrője a `name` paraméter. Emiatt a query-ág gyengén vagy kiszámíthatatlanul működött.
  2. A provider találatok összefésülése után a function végén egy kemény `textMatchesQuery()` filter újra nullára szűrhette a már megtalált közeli venue-ket is. Ha emiatt a lista üres lett, a kliens csak cache-fallbacket látott, ami első használatkor üres lehetett.
- **Javítás**: A keresési logika kétlépcsősre lett alakítva: előbb geocode / center feloldás query-variánsokkal, majd külön by-name és nearby POI lekérés. A végső szűrés hard filter helyett score + lenient fallback logikára váltott. A kliens `searchPlaces()` helper debug-safe retry/fallback lépcsőt kapott.
- **Megelőzés**: Provider API integrációnál **MINDIG** az adott szolgáltató hivatalos paramétereit kell követni, és a provider által már visszaadott találatokat nem szabad egy második, túl agresszív kliens-specifikus szűréssel lenullázni. Search pipeline-nál kötelező külön ellenőrizni: provider hits > merged results > UI results.
