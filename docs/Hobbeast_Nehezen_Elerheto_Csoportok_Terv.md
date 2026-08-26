# Nehezen elérhető csoportok terve

*Otthon lévő szülők és nyugdíjasok — akiknek a legnehezebb társaságot találni*

Státusz: **terv, jóváhagyásra vár** · Készült: 2026-08-26 · Kapcsolódik: v1.28.0 (közös
látogatás), v1.29.0 (szűrők)

---

## 1. Mi a valódi akadály

Nem a programhiány. **1847 élő program** van a katalógusban, és naponta nő. Aki nem jut el
sehova, az nem azért nem jut el, mert nincs hova.

Három akadály van, ebben a sorrendben:

1. **„Egyedül nem megyek el."** A küszöb nem a program, hanem az első lépés társaság
   nélkül. Egy 68 éves özvegy nem azért nem megy el a szüreti fesztiválra, mert nem tud
   róla.
2. **„Oda engem nem várnak."** Nem tudja előre, hogy babakocsival bemehet-e, hogy kell-e
   sokat gyalogolni, hogy lesz-e ott rajta kívül más is 60 fölött, hogy baj-e, ha a gyerek
   sír. A bizonytalanság önmagában elrettent.
3. **„Nem tudom, hol keressem."** Ezek a csoportok nincsenek Instagramon. A védőnőnél, a
   könyvtárban, a háziorvosi váróban és a nyugdíjas klubban vannak.

Az 1. és 2. termékfeladat. A 3. terjesztési feladat, és **nem oldható meg a termékben** —
de a termék tud olyan lenni, hogy megérje róla szórólapot kitenni.

---

## 2. Amink már megvan (és nem használjuk)

Ez a terv nagyrészt **meglévő darabok összekötése**, nem nulláról építés.

| Ami megvan | Hol | Állapot |
|---|---|---|
| Közös látogatás („menjünk együtt") | `external_event_companion_plans` | v1.28.0-ban kész, működik |
| „Egyedül érkezem?" preferencia | `profiles.solo_arrival_comfort` | oszlop létezik, **0 kitöltés** |
| Preferált csoportméret | `profiles.preferred_group_size` | oszlop létezik, **0 kitöltés** |
| Akadálymentességi igény | `profiles.accessibility_needs` | oszlop létezik, **0 kitöltés** |
| Ráérési idősáv | `profiles.availability_window` | oszlop létezik, **sehol nem használjuk** |
| Kezdőbarát preferencia | `profiles.beginner_friendly_preference` | oszlop létezik |
| Program-elvárások (akadálymentesség, intenzitás, költség) | `events.accessibility_info`, `activity_intensity`, `cost_details` | szervező megadhatja |
| Kis, visszatérő csoportok | `social_circles`, `event_series` (recurrence_rule) | infrastruktúra kész |
| Szűrő-infrastruktúra | `src/features/events/eventFacets.ts` | v1.29.0, új szűrő ma ~50 sor |
| Kerületi pontosságú térkép | `event_map_placements` | 672 pontos tű |

### A legfontosabb megállapítás

A `FirstEventConfidenceCard` **létezik**, és pontosan a jó kérdéseket teszi fel
(egyedül érkezés, csoportméret, akadálymentességi igény). Két baj van vele:

1. a **Profil oldal aljára** van eltemetve (`src/pages/Profile.tsx:364`), ahova senki nem
   görget le;
2. **semmi nem olvassa vissza** — aki kitölti, ugyanazt a listát látja, mint aki nem.

Emiatt mind a három oszlop üres az adatbázisban. **Ez a terv legolcsóbb nyeresége:** a
kérdések már meg vannak írva, csak rossz helyen vannak és nincs következményük.

---

## 3. Őszinte helyzetkép: 4 valódi profil

Ma **4 valódi, aktív profil** van a rendszerben. Ezt ki kell mondani, mert az egész terv
ezen áll vagy bukik:

> Ha egy nyugdíjas rákattint a „Menjünk együtt?"-re, és 0 érdeklődőt lát, az **rosszabb,
> mintha ott sem lett volna a gomb.** Egy üres közösség megerősíti azt, amitől félt.

Ezért a terv **nem a felhasználóktól indul, hanem a horgonyprogramoktól** (4. fázis). Amíg
nincs kritikus tömeg, a felületnek nem szabad társaságot ígérnie — csak azt szabad
mutatnia, ami igaz.

---

## 4. Fázisok

### 0. fázis — Ne ígérjünk társaságot, amíg nincs *(azonnal, kicsi)*

A „Menjünk el együtt!" kártya külsős programnál ma akkor is felajánlja a szervezést, ha a
rendszerben rajta kívül szinte senki nincs. Ez nem hazugság, de félrevezető várakozást
kelt.

- A kártya szövege legyen pontos arról, hogy ez most **még induló közösség**: „Te lehetsz
  az első" már most is ezt mondja — ezt kell megtartani, és **nem szabad** mellé olyan
  számot tenni, ami nagyobb közösséget sugall.
- Ha egy tervre 7 napon belül senki nem csatlakozik, a szervező kapjon értesítést
  és felajánlást: átteszik-e egy horgonyprogramra, ahol lesznek mások.

**Kockázat, ha kihagyjuk:** az első 20 felhasználó csalódik, és nem jön vissza. Ebben a két
célcsoportban egy csalódás végleges.

---

### 1. fázis — A két profil megnevezése és az onboarding *(kicsi–közepes)*

**Cél:** a rendszer tudja, kivel beszél, és az érintett lássa, hogy számít.

1. A `FirstEventConfidenceCard` kérdései **kerüljenek be az onboardingba**, opcionális,
   átugorható lépésként. A Profil oldalon maradjanak, de ne ott legyen az első találkozás.
2. Egy új, **élethelyzet** kérdés (opcionális, privát, sosem publikus):
   - *Kisgyerekkel járok programokra*
   - *Nappal érek rá*
   - *Nyugdíjas vagyok*
   - *Nem szeretnék válaszolni*

   Tárolás: `profiles.preferred_activity_modes` (már tömb) vagy új
   `profiles.life_context text[]`. **Sosem jelenik meg mások számára**, kizárólag az
   alapértelmezett szűrőket állítja be.
3. Az `availability_window` végre kapjon funkciót: aki azt mondja „nappal érek rá", annak
   a lista **alapból** nappali programokat mutasson.

**Adatvédelmi kikötés:** ez érzékeny adat (élethelyzet, egészség, kor). Csak
`profile_visibility` alatt, aggregáltan sosem publikus, és a
`DATA_GOVERNANCE_INVENTORY.md`-be fel kell venni a törlési útvonallal együtt.

---

### 2. fázis — Szűrők, amik nekik szólnak *(kicsi)*

A v1.29.0 facet-motorja (`eventFacets.ts`) készen áll; egy új szűrő kb. 50 sor + tesztek.

| Szűrő | Logika | Kinek |
|---|---|---|
| **Nappali program** | hétköznap, 9:00–16:00 közötti kezdés (`event_time`-ból) | mindkettő |
| **Ingyenes** | már megvan (`Belépő` szűrő) | mindkettő |
| **Babakocsival is jó** | `Családi` kategória, vagy `babakocsi\|kisgyerek\|baba-mama\|családi` a szövegben | szülők |
| **Kevés gyaloglás** | `activity_intensity = 'low'`, vagy `ülő\|előadás\|klub\|olvasó\|kártya` és NEM `túra\|futás\|kerékpár` | nyugdíjasok |
| **Kezdőknek is jó** | `events.beginner_friendly` | mindkettő |
| **Tömegközlekedéssel elérhető** | van `location_lat/lon` és ≤500 m-re van megállótól | mindkettő |

**Őszinteségi szabály — kötelező:** ezt a hat állítást **csak akkor tesszük ki, ha az adat
alátámasztja.** Egy hamis „akadálymentes" címke miatt valaki feleslegesen utazik el
kerekesszékkel, és soha többé nem hisz nekünk. Ahol nem tudjuk, ott **nem írunk semmit** —
nem írunk „nem"-et sem.

A tömegközlekedés-szűrő adatigényes (megállók geokódolása); ez a fázis **utolsó** eleme, és
kihagyható, ha drágának bizonyul.

---

### 3. fázis — A „hozzám hasonlók" jelzés *(közepes, érzékeny)*

A 2. akadály („oda engem nem várnak") megoldása nem szűrő, hanem **jelenlét-információ**.

- Ha egy közös látogatásra jelentkezett már valaki, akinek ugyanaz az élethelyzete,
  jelenjen meg: *„Egy tag jelezte, hogy kisgyerekkel jön."* — **név nélkül, aggregáltan**,
  a v1.28.0 privacy-modellje szerint (csak a szervező neve látszik).
- Küszöb: ugyanaz, mint a meglévő `external_event_social_intents`-nél — **legalább 3**
  valódi, aktív profil, különben nem jelenik meg semmi. Kis számnál a „mutasd, ki jön"
  visszafelé sül el: kiszámíthatóvá teszi, ki az az egy ember.

**Amit nem csinálunk:** nem szegmentálunk kor szerint, nem csinálunk „nyugdíjas programok"
külön fület. A cél a bekapcsolás, nem a gettósítás. Egy 70 éves, aki jazzkoncertre akar
menni, jazzkoncertet keressen, ne „szépkorú programot".

---

### 4. fázis — Horgonyprogramok *(ez a lényeg)*

**A hidegindítás egyetlen valódi megoldása.** Nem a katalógusból jönnek, hanem mi hozzuk
létre őket partnerrel, és **visszatérők**.

Egy horgonyprogram jellemzői:
- **heti, fix nap és óra** — nem kell dönteni, csak odamenni
- **ingyenes**
- **nappali**, hétköznap
- **fix, könnyen megtalálható, nyilvános helyszín**
- **van gazdája**, aki biztosan ott lesz

Példák, amikre partnert kell keresni:

| Horgony | Mikor | Partner |
|---|---|---|
| Babakocsis séta | szerda 10:00, Városliget | védőnői szolgálat, baba-mama klub |
| Kártya- és társasdélelőtt | kedd 10:00 | kerületi könyvtár |
| Lassú séta + kávé | csütörtök 10:00 | nyugdíjas klub, művelődési ház |
| Közös főzés | péntek 11:00 | közösségi ház |

Technikailag: `event_series` (`recurrence_rule` már létezik) + `social_circles` a
visszatérő magra. Ehhez **nem kell séma-változás**, csak szervezői folyamat.

**Cél az első negyedévre: 3 horgony, mindegyik legalább 6 egymást követő alkalommal
megtartva.** Nem 30 program — 3, ami tényleg minden héten megvan.

---

### 5. fázis — Elérés: nem az Instagram *(terjesztés)*

A `growth_strategy/` anyag Instagram- és SEO-központú. Ez a két célcsoport ott nincs.

Ahol vannak:
- **védőnői tanácsadó, háziorvosi váró, gyógyszertár** — szórólap, QR-kód
- **kerületi könyvtár, művelődési ház, nyugdíjas klub** — plakát + a klubvezető mint partner
- **bölcsőde/óvoda faliújság** — a szülők naponta ott állnak
- **plébánia, egyházközség** — a legerősebb meglévő idős közösségi háló
- **Facebook anyukás csoportok** — az egyetlen digitális csatorna, ahol tényleg ott vannak
- **helyi önkormányzati újság** — nyugdíjasoknál még mindig működik

**Ehhez kell:** egy nyomtatható, egyoldalas leírás és egy QR-kód, ami egyenesen a nappali,
ingyenes, közeli programok listájára visz — nem a főoldalra.

---

### 6. fázis — Maga a felület *(folyamatos)*

A `.governance/ui_ux_rules.md` már előírja az akadálymentességet és olvashatóságot; ez a
konkrét lista hozzá:

- **Betűméret**: a 14 px alatti szövegeket felül kell vizsgálni. A kártyákon több
  `text-[10px]` és `text-[11px]` van — ezek 65 év fölött olvashatatlanok.
- **Kattintófelület**: minden érinthető elem legalább 44×44 px.
- **Nyelv**: „facet", „intent", „rollout" sosem kerülhet a felületre. Rövid mondatok.
- **Ne legyen időzített interakció**: semmi ne tűnjön el magától. *(A forgó hero kivétel:
  dekoratív, és `prefers-reduced-motion` esetén megáll.)*
- **Nagyítás**: 200%-os böngészőnagyításnál se törjön el a layout.
- **Telefonos alternatíva**: legyen egy szám vagy e-mail annak, aki nem akar regisztrálni.
  Ezt egy ember végzi, nem rendszer — de enélkül a nyugdíjas célcsoport fele elveszik.

---

## 5. Biztonság — ez a rész nem opcionális

Mindkét célcsoport **kiszolgáltatott**: idős emberek a csalások elsődleges célpontjai, az
otthon lévő szülőknél pedig a gyerek jelenléte miatt magasabb a tét.

Kötelező elemek, mielőtt bármelyik horgony elindul:

1. **Nyilvános találkozópont kötelező.** Közös látogatás terve nem hivatkozhat lakcímre.
   Ezt a `meeting_point` mezőre érdemes ellenőrzéssel is kikényszeríteni.
2. **Nincs pénzkérés a platformon belül.** Egyértelmű, ismételt üzenet: a Hobbeast soha nem
   kér pénzt átutalással, és a szervező sem a rendszeren keresztül.
3. **Ellenőrzött szervező** (`profiles.organizer_verified`) legyen kötelező a
   horgonyprogramokhoz.
4. **Jelentés és tiltás** minden felületen elérhető — ez ma is megvan (`SafetyActions`),
   de a szövegének érthetőnek kell lennie: „Jelentés" helyett „Valami nem stimmel? Szólj."
5. **Nincs privát üzenet ismeretlentől** találkozás előtt.

---

## 6. Mit mérünk

**Ne DAU-t.** Ebben a két csoportban a napi visszatérés nem cél és nem is reális.

| Mutató | Miért ez |
|---|---|
| **Első valódi találkozás aránya** — hány regisztrálóból lett olyan, aki legalább egyszer tényleg elment | ez a termék egyetlen valódi ígérete |
| **Horgony-folytonosság** — hány héten át volt megtartva egymás után | a megbízhatóság a termék, nem a választék |
| **Visszatérés a második alkalomra** | az első alkalom lehet udvariasság; a második már működés |
| **Magára hagyott tervek aránya** — hány közös látogatásra nem jelentkezett senki | ez méri a 0. fázis kockázatát |

---

## 7. Amit szándékosan nem csinálunk

- **Nem csinálunk külön „szépkorú" vagy „anyukás" aloldalt.** Elkülönítés helyett
  bekapcsolás. Az élethelyzet a szűrőt állítja, nem a felhasználót skatulyázza.
- **Nem kérünk kort kötelezően.** A `date_of_birth` opcionális marad.
- **Nem állítunk akadálymentességet adat nélkül.**
- **Nem hirdetünk közösséget, amíg nincs.** A 4. fázis megelőzi az 5-öt.

---

## 8. Javasolt sorrend

```
0. fázis  ─ most, a v1.28.0 kártyaszövegével együtt        (fél nap)
1. fázis  ─ onboarding + élethelyzet + availability_window (2–3 nap)
2. fázis  ─ hat szűrő az eventFacets.ts-ben                (1–2 nap)
4. fázis  ─ ELSŐ HORGONY, partnerrel                        ← itt dől el minden
3. fázis  ─ „hozzám hasonlók" jelzés, csak 3 fő fölött
5. fázis  ─ szórólap + QR, ha a horgony 6 hetet kibírt
6. fázis  ─ folyamatos
```

A 4. fázis a döntő. Az 1–2. fázis nélküle csak szebb üres polc; a 4. fázis viszont az 1–2.
nélkül is működik. **Ha csak egy dolgot csinálunk meg ebből, az legyen az első horgony.**
