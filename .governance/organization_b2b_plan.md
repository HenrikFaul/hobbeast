# Szervezeti (B2B) profil és professzionális szervezői funkciók — terv

**Készült:** 2026-08-28 · **Módszer:** kódbázis- és élő adatbázis-felmérés + versenytárs-kutatás
**Állapot:** TERV (kód még nem indult) · **Governance:** §20/§34 (bizonyíték előbb, additív, nem-regresszív)

---

## 0. A kérés

A személyes profilok már léteznek (érdeklődés, profilkép, értesítések, láthatóság).
A **B2B szerepkörrel regisztrált cégeknek / szervezeteknek** viszont ennél többre van
szükségük: **szervezeti profil**, **professzionális szervezői funkciók**, és a hozzájuk
tartozó **beállítások**. Ez a dokumentum ezt tervezi meg — a kódolás előtt.

---

## 1. Mit láttunk a piacon (inspiráció)

Rövid, forrásolt kivonat, hogy mit várnak ma a professzionális szervezők.

| Platform | Amit átveszünk | Amit NEM |
| --- | --- | --- |
| **Eventbrite** | Nyilvános **szervezői profiloldal** (összes élő esemény + brand-leírás + web/social linkek + **követés** új eseményre); **csapatszerepek** (Owner / Admin / Check-in), saját loginnal; **több brand/venue** egy fiók alatt; branding/sablonok | Bonyolult jegyértékesítési admin, saját fizetőkapu (nálunk kimenő-kattintás modell) |
| **Luma (lu.ma)** | **Kalendárium-primitívum**: egy szervezet eseményei egy helyen, követhető gyűjteményként; teljes **résztvevői adathozzáférés**; naptár-sync | „Nincs közösség" filozófia — nálunk a közösség érték marad |
| **Meetup Pro** | **Több csoport / hálózat** egy szervező alatt; visszatérő közösség; demand-fókusz | Havidíjas kényszer; merev csoport-modell |

**Kulcs-tanulságok:**
1. A **szervezet** legyen elsőrendű entitás, nem egy flag az egyéni profilon.
2. **Csapat**: több ember dolgozhasson egy szervezet neve alatt, saját fiókkal, tiszta jogosultságokkal.
3. **Nyilvános brand-oldal**: a szervezet arca, ahol minden eseménye + követés.
4. **Verifikáció / bizalom**: látható „hitelesített szervező" jelzés.
5. **Professzionális eszközök**: analitika, több esemény kezelése, sablonok, márka-alapértékek.

**Források:** [Eventbrite Organizer](https://www.eventbrite.com/organizer/overview/) ·
[Eventbrite roles &amp; permissions](https://www.eventbrite.com/help/en-us/articles/509534/how-to-manage-roles-and-permissions/) ·
[Luma vs Meetup](https://help.luma.com/p/luma-vs-meetup) ·
[Meetup vs Luma comparison](https://slashdot.org/software/comparison/Luma-vs-Meetup/)

---

## 2. As-Is: mi van már (bizonyíték)

Nem indulunk ki abból, hogy hiányzik. Ami **létezik és újrahasznosítjuk**:

| Terület | Ami megvan | Bizonyíték |
| --- | --- | --- |
| Egyéni szervező-jelzés | `profiles.is_organizer`, `profiles.organizer_verified` | oszlopok élnek |
| Szervező mód | `useOrganizerMode` (`canUseOrganizerMode = ownedEventCount > 0`) | [useOrganizerMode.tsx](../src/hooks/useOrganizerMode.tsx) |
| Szervezői felület | `OrganizerDashboard` 8 füllel (események, résztvevők, check-in, **Segítők/crew**, üzenetek, analitika, források, beállítások) | [OrganizerDashboard.tsx](../src/pages/OrganizerDashboard.tsx) |
| Esemény-szintű csapat | `event_crew_roles` + `manage_event_crew_role_atomic` (5 jogosultság, audit) | v1.41.0 |
| Kereslet-jelzés | `organizer_demand_insights`, `organizer_opportunities` (AI, eseményenként) | 20 + 11 oszlop |
| Monetizáció-váz | `entitlement_grants` (**user_id-ra**, plan/feature/limit/trial/billing state) | 19 oszlop |
| Kommunikáció | `organizer_messages` (+ a v1.42-es résztvevői „Frissítések") | 21 oszlop |
| Readiness | `organizer_readiness_assessments`, `buildOrganizerReadinessChecklist()` | v1.39 óta |

**A valódi hiány (zöldmező):** nincs **`organizations`** entitás. A szervező ma
egy magánszemély, aki eseményt birtokol. Nincs:
- szervezeti profil (név, logó, brand-leírás, web/social, város, kategória);
- **szervezeti csapat** (több tag egy szervezet alatt, org-szintű szerepekkel);
- szervezeti **verifikáció** és nyilvános **bizalmi jelzés**;
- nyilvános **brand-oldal** + **követés**;
- szervezeti **alapértékek** (alapértelmezett helyszín, kategória, lemondási szabály, márka-emoji/szín) az eseménylétrehozóhoz;
- szervezethez kötött **entitlement/terv** (a `entitlement_grants` ma user-re szól).

---

## 3. Adatmodell (append-only, additív)

Új táblák. Egyik meglévőt sem alakítjuk át; az egyéni szervező-út érintetlen marad.

### 3.1 `organizations` — a szervezet mint entitás
```
id uuid pk
slug text unique              -- nyilvános URL: /szervezet/<slug>
name text not null
kind text                     -- 'company' | 'ngo' | 'venue' | 'community' | 'creator'
tagline text                  -- egy mondat
description text
logo_url text
cover_url text
brand_color text              -- a márka színe (opcionális)
default_emoji text            -- eseménykártya alapemoji
website_url text
social jsonb                  -- { facebook, instagram, ... } (validált)
city text
country_code text
categories text[]             -- fő témák
default_cancellation_policy text
default_location_* (city/address/lat/lon)  -- eseménylétrehozó alapértékek
verification_status text      -- 'none' | 'pending' | 'verified' | 'rejected'
verified_at timestamptz
visibility text               -- 'public' | 'unlisted'
created_by uuid
created_at / updated_at
```
- **RLS:** nyilvános `public`/`verified` szervezet olvasható mindenkinek (a
  `public_organization_cards` nézeten át); a teljes sor csak a tagoknak.

### 3.2 `organization_members` — a szervezeti csapat
```
id uuid pk
organization_id uuid fk
user_id uuid
role text                     -- 'owner' | 'admin' | 'editor' | 'checkin' | 'viewer'
invited_by uuid
invited_at / accepted_at
status text                   -- 'invited' | 'active' | 'removed'
unique (organization_id, user_id)
```
- **Szerepek (Eventbrite-mintára, de a Hobbeast-crew-höz igazítva):**
  - **owner** — mindenhez joga, számlázás, tagok kezelése, szervezet törlése (min. 1);
  - **admin** — tagok kezelése (owner kivételével), minden esemény, beállítások;
  - **editor** — eseményt hoz létre/szerkeszt a szervezet nevében;
  - **checkin** — csak beléptetés a szervezet eseményein;
  - **viewer** — csak olvasás (analitika).
- **Kapcsolat az esemény-crew-hoz:** az org-tagság a *szervezet* szintje; az
  esemény-crew (`event_crew_roles`) az *esemény* szintje marad. Egy org-editor
  automatikusan operátora a szervezet eseményeinek — az `is_event_operator`
  bővül egy org-ághral (additív, meglévő ág marad).

### 3.3 `organization_followers` — követés (Eventbrite/Luma-minta)
```
organization_id uuid fk, user_id uuid, created_at
pk (organization_id, user_id)
```
- Új esemény → értesítés a követőknek (a meglévő notifications pipeline-on).

### 3.4 `events.organization_id` (új, nullable FK)
- Egy esemény opcionálisan egy szervezethez tartozik. **Nullable és additív:**
  a meglévő, magánszemély által birtokolt események érintetlenek.
- A nyilvános eseménykártya a szervezet nevét/logóját/verifikációját mutatja,
  ha van.

### 3.5 `organizations` ↔ `entitlement_grants`
- Az `entitlement_grants` ma `user_id`-ra szól. **Nem alakítjuk át.** Additívan
  kap egy `organization_id` (nullable) oszlopot, hogy egy terv a *szervezethez*
  tartozhasson. A feloldás: „a felhasználó jogosultsága = a saját grantjei ∪ az
  aktív szervezetei grantjei".

---

## 4. Funkciók — szeletekbe szedve (rollout)

A §34 szerint vékony, végig használható, visszagörgethető szeletek. Mindegyik:
karakterizáció → append-only migráció → RLS → RPC → UI → teszt → élő bizonyíték.

### Slice O-A — Szervezeti entitás + tagság (a gerinc)
- `organizations`, `organization_members` táblák + RLS.
- RPC-k: `create_organization`, `update_organization`, `list_my_organizations`,
  `invite_org_member`, `accept_org_invite`, `set_org_member_role`,
  `remove_org_member`.
- `is_event_operator` org-ág (additív).
- **UI:** „Szervezet létrehozása" flow; szervezetváltó a szervezői felületen;
  Csapat-kezelő (meghívás e-mailben/azonosítóval, szerep, eltávolítás).
- **Érték:** egy cég a saját neve alatt, több emberrel, tiszta jogosultságokkal.

### Slice O-B — Szervezeti profil és beállítások
- A szervezet szerkeszthető profilja: név, slug, logó, borító, tagline, leírás,
  web/social, város, kategóriák, márka-emoji/szín.
- **Márka-alapértékek** az eseménylétrehozóhoz: alapértelmezett helyszín,
  kategória, lemondási szabály, emoji — ezek előtöltik a v1.49-es composert.
- **UI:** szervezeti beállítások lap (a személyes profilbeállítások mintájára).

### Slice O-C — Nyilvános brand-oldal + követés
- `/szervezet/<slug>`: logó, leírás, linkek, **verifikációs jelzés**, a szervezet
  összes élő eseménye, **Követés** gomb.
- `public_organization_cards` nézet (biztonságos vetület).
- Új esemény a szervezettől → értesítés a követőknek.
- Az eseménykártyán és -oldalon **szervezet-chip** (logó + „hitelesített").

### Slice O-D — Szervezethez kötött esemény + professzionális composer
- `events.organization_id`; a composerben „Kinek a nevében?" választó
  (magánszemély ↔ szervezet), a szervezet alapértékeivel előtöltve.
- A szervezet eseményei egy helyen (Luma-kalendárium érzés) a szervezői
  felület „Események" fülén, szűrve org szerint.

### Slice O-E — Verifikáció és bizalom
- Szervezeti verifikáció kérése (web/social/dokumentum) → admin bírálat
  (a meglévő admin approval mintára) → `verification_status='verified'`.
- Nyilvános **hitelesített szervező** jelvény mindenhol.

### Slice O-F — Professzionális analitika és terv (entitlement)
- Szervezeti szintű összesített analitika (a meglévő `event_analytics`-ból):
  megtekintés/RSVP/megjelenés trend a szervezet minden eseményén.
- `entitlement_grants.organization_id` (additív) → szervezeti terv/limit
  (pl. hány aktív esemény, csapatlétszám) — feature-flag mögött, nem kényszer.

---

## 5. Biztonság és nem-regresszió (kötelező)

- **RLS mindenütt:** a szervezet teljes sora csak a tagoknak; a nyilvános
  vetület a `public`/`verified` szervezetekre korlátozott. Az írások RPC-n át,
  szerep-ellenőrzéssel (owner/admin), audit-naplóval (`organizer_audit_log`
  vagy új `organization_audit_log`).
- **Az egyéni szervező-út érintetlen:** minden org-mező nullable/additív; aki ma
  magánszemélyként hoz létre eseményt, ugyanúgy teheti.
- **Idempotens mutációk** (meghívás, szerepváltás) — kétszeri kattintás nem
  duplikál.
- **`is_event_operator` csak BŐVÜL** egy org-ággal; a meglévő tulajdonos/crew
  ágak változatlanok — karakterizációs teszt védi.
- **Feature-flag** minden magas kockázatú részre (entitlement, verifikáció).

## 6. Kockázatok

| Kockázat | Kezelés |
| --- | --- |
| `is_event_operator` bővítése elronthat meglévő jogosultságot | karakterizációs teszt a jelenlegi mátrixra ELŐBB, csak utána bővítés |
| Kettős igazság: user vs org tulajdon | az esemény tulajdonosa marad `created_by`; az `organization_id` csak *hozzárendelés*, nem váltja fel |
| Entitlement user↔org kettőssége | a feloldás explicit uniója, teszttel rögzítve |
| Slug-ütközés, foglalt nevek | egyediség DB-megkötéssel + tiltólista |

## 7. Elfogadási kritériumok (Slice O-A)

- [ ] Egy felhasználó szervezetet hoz létre → owner tag lesz.
- [ ] Owner meghív egy második felhasználót editorként → az elfogadás után a
      szervezet eseményeinek operátora, de a számlázáshoz/tagkezeléshez nem fér.
- [ ] Nem tag **nem** látja a szervezet privát sorát és **nem** kezelhet tagot
      (élő, jogosultság-próba az adatbázisban).
- [ ] A meglévő event-crew és a magánszemély-esemény jogosultságok
      **változatlanok** (karakterizációs teszt zöld).
- [ ] 754+ app-teszt zöld, lint tiszta, budgetek PASS.

### Slice O-G — Nyilvános B2B API (APIMaster/SwaggerMaster-kompatibilis) — KÉSZ (v1.52.0)

A „jöhet mind" kérésre elkészült. Új `api-b2b` edge function `x-api-key`
hitelesítéssel; `GET /openapi.json` (OpenAPI 3.1, `apiKey` scheme, enumok,
példák), `GET /openapi-index.json` a Workbench tömeges importjához, kanonikus
hibaboríték (`business|technical|validation|auth|rate_limit|dependency`);
`GET/POST /v1/events`, `GET /v1/organization`, `GET /v1/events/{id}`; a
`POST /v1/events` idempotens (`Idempotency-Key`). Kulcsok: `organization_api_keys`
tábla, sha256-hash tárolás, egyszeri felfedés, scope-ok (`events:read`/`write`),
admin-gated RPC-k. UI a brand-oldal „Kezelés" szekciójában. Élőben és HTTP-n
bizonyítva; a spec/boríték-invariánsokat vitest-teszt őrzi.

### Slice O-I — Több-márka egy szervezet alatt — KÉSZ (v1.53.0)

Egy márka = egy szervezet szülővel (`organizations.parent_organization_id`), így
minden meglévő szervezeti felület (nyilvános oldal, követés, verifikáció,
analitika, API-kulcs) újrahasznosul. Az `is_organization_member` egyetlen additív
ággal örökli a szülő csapatát a márkákra. Új RPC-k: `create_brand`,
`list_organization_brands`; a `list_my_organizations` a `parent_organization_id`-t
és a szülőn át elérhető márkákat is visszaadja. UI: „Márkák" panel a
Szervezeteim kártyán. Élőben bizonyítva; nem-regresszív.

### Slice O-H — Saját jegyértékesítés / fizetős események — KÉSZ (v1.54.0)

Opcionális, additív jegyréteg: `ticket_types` / `ticket_orders` / `tickets`,
sorzáras helyfoglalás (túlfoglalás-védelem), egyedi `HB-…` belépőkód, idempotens
beléptetés. Ingyenes → azonnali kiadás; fizetős → függő rendelés, majd
szervezői/webhook megerősítés (`confirm_order_payment` a fizetés-szeám —
**bankkártyát/pénzmozgást a rendszer NEM kezel**). Menedzsment a `finance`,
beléptetés a `check_in` képességhez kötve. UI: Jegyek szekció az esemény oldalán +
Jegyeim a profilon. Élőben bizonyítva; nem-regresszív.

## 8. Amit ez a terv NEM tartalmaz (szándékosan, későbbre)

- ~~Saját fizetőkapu / jegyértékesítés~~ → **elkészült, lásd Slice O-H** (a
  valódi fizetési szolgáltató-integráció a dokumentált `confirm_order_payment`
  szeámon keresztül köthető be később).
- ~~Több-márka egy szervezet alatt~~ → **elkészült, lásd Slice O-I.**
- ~~Nyilvános szervezeti API~~ → **elkészült, lásd Slice O-G.**

**A „jöhet mind" hármas (O-G API, O-I több-márka, O-H jegyértékesítés) elkészült.**

---

*A kódolás a Slice O-A-val kezdődik: `organizations` + `organization_members` +
RLS + a tagság-RPC-k + a szervezetváltó és csapat-UI, karakterizációs védelemmel.*
