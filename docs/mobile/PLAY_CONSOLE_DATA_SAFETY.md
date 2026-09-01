# Play Console hand-off — Data Safety + App content (Hobbeast)

Bizonyíték-alapú kitöltési vázlat a Play Console *App content* szekciójához.
Forrás: a `profiles` tábla oszlopai (`src/integrations/supabase/types.ts`), a
manifest jogosultságok, és a bundle-elemzés (nincs harmadik feles reklám/tracker SDK).
**Minden sort ellenőrizz** a beküldés előtt — a Google a store-listinggel és az
adatvédelmi szabályzattal keresztellenőriz (GP-80/GP-93).

> Alapelv: a Supabase a **saját backended (adatfeldolgozó)** → az oda küldött adat
> „collected", nem „shared". „Shared" csak akkor, ha adat **harmadik félhez** kerül.

## 1. Data safety — gyűjtött adattípusok

| Play kategória | Adat | Gyűjtött | Megosztott | Cél | Kötelező? |
|---|---|---|---|---|---|
| Personal info | Név (`display_name`) | Igen | Nem | App functionality, Account | Opcionális |
| Personal info | E-mail cím (Auth) | Igen | Nem | Account management | Kötelező (fiókhoz) |
| Personal info | Születési dátum (`date_of_birth`) | Igen | Nem | App functionality (életkor-megfelelőség) | Opcionális |
| Personal info | Gender (`gender`) | Igen | Nem | App functionality | Opcionális (`gender_public` szabályozza) |
| Personal info | Cím (`address`,`district`) | Igen | Nem | App functionality | Opcionális (`address_public`) |
| Personal info | Egyéb (`bio`) | Igen | Nem | App functionality | Opcionális |
| **Location** | Hozzávetőleges (`city`,`district`) | Igen | Nem¹ | App functionality (közeli események) | Opcionális |
| **Location** | Pontos (`location_lat/lon`) | Igen² | Nem¹ | App functionality (távolság/rádiusz) | Opcionális (`location_precision`) |
| Photos and videos | Profilkép (`avatar_url`) | Igen | Nem | App functionality | Opcionális |
| Health and fitness / **érzékeny** | `accessibility_needs` | Igen³ | Nem | App functionality (akadálymentesség) | Opcionális |
| App activity | Esemény-részvétel, keresés, in-app interakció | Igen | Nem | App functionality, Analytics⁴ | — |
| Device or other IDs | Push token (FCM) | Igen⁵ | Nem | App functionality (értesítés) | Opcionális |

**Lábjegyzetek / ellenőrizendő:**
1. **VERIFY:** a geokódolás/hely-lekérdezés a Geoapify/TomTom/mapy.cz felé
   **szerveroldalon** (Edge Functions) fut, ezért a kliens nem oszt meg
   felhasználói helyet harmadik féllel. Ha bármely hívás kliensoldali és a
   felhasználó helyét/keresését küldi ki, az **„shared"** lesz — nézd át.
2. Pontos lokáció csak akkor gyűjtött, ha a felhasználó a `location_precision`-t
   arra állítja; alapból az onboarding **nem kér** pontos címet.
3. `accessibility_needs` **GDPR Art.9 különleges adat** → explicit hozzájárulás
   (`privacy_consent_at`) + szigorú láthatóság (`interests_visibility`). A Play
   Data Safetyben nincs tökéletes vödör; „Personal info → Other" + a szabályzatban
   nevesítve. Kezeld a legóvatosabban.
4. Analytics **consent- és flag-gated**, first-party (Supabase) — **nincs**
   harmadik feles reklám-/tracker-SDK, nincs reklám-azonosító.
5. Push token csak akkor, ha a felhasználó engedélyezi az értesítést és az FCM be
   van állítva (jelenleg gate-elt).

## 2. Data handling practices (a formban jelöld)
- ✅ **Encrypted in transit** — igen (HTTPS/TLS; a `network_security_config` tiltja a cleartextet).
- ✅ **Users can request data deletion** — igen: **in-app** (Profil → „Saját adataim",
  `DeleteAccountCard`: fióktörlés 14 napos türelmi idővel + JSON adatexport) **és**
  publikus URL (lásd 3.).
- ✅ **Data collection is optional** — a profil-mezők többsége opcionális; csak az
  e-mail kötelező a fiókhoz.
- ⚠️ Reklám-azonosító: **nem** gyűjtött. Harmadik feles megosztás: **nincs** (a 1. lábjegyzet VERIFY tétele mellett).

## 3. App content — a maradék release-blokkolók lezárása
| Blokkoló | Teendő a Console-ban |
|---|---|
| GP-21 / GDPR-POLICY | **Privacy policy URL:** `https://expericentre.com/legal` (a tartalom kész). Írd be a *Store listing → Privacy policy* mezőbe. |
| GP-27 / GDPR-ERASURE | **Account deletion URL:** adj meg egy publikus törlési-tájékoztató URL-t (pl. `https://expericentre.com/legal#adatkezeles` vagy dedikált `/torles` oldal). Az in-app folyamat kész. |
| GP-23 / GP-93 | **Data Safety** — a fenti 1–2. tábla alapján; keresztellenőrizd az adatvédelmi szabályzattal. |
| GDPR-CONSENT / LAWFUL | A szabályzat nevesítse az Art.6 jogalapot célonként; az analytics opt-in gate már megvan. |
| GDPR-CHILDREN | **Target audience & content:** a `date_of_birth` miatt állítsd be a korosztályt; ha nem gyermek-célú, jelöld felnőtt/13+ közösségi appként, és tiltsd a 13 alattiakat. |
| GP-80 | **Store listing** = a tényleges viselkedés (cím/leírás/screenshot ne ígérjen többet, mint amit az app tud). |
| Jogosultságok | `POST_NOTIFICATIONS` (értesítés), (opcionális) location — mindegyikhez futásidejű, célt nevesítő indoklás; a Console érzékeny-jogosultság nyilatkozatai. |

## 4. Amit az app már tud (ne deklaráld hiányként)
- Fiók-törlés + adatexport (`DeleteAccountCard` + `data_subject_requests`, RPC-vel).
- Explicit hozzájárulás-időbélyegek (`privacy_consent_at`, `notification_consent_at`).
- Felhasználó-vezérelt láthatóság (`profile_visibility`, `age_public`, `gender_public`,
  `address_public`, `interests_visibility`).
- Titkosított átvitel (TLS) + cleartext-tiltó `network_security_config`.
