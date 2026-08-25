# Versenytárs-alapú funkcióelemzés — 20 értékteremtő funkció

Minden tétel egy bizonyítottan működő versenytárs-megoldásra épül, és a Hobbeast
**mai** állapotához mérve kapott pontot (1063 külső program, 0 belső esemény,
induló felhasználói bázis, most indult kattintásmérés).

## Értékelési szempontok

- **Hatás**: mennyit ad a North Star metrikához (visszatérő tag: 2+ esemény/30 nap)
  vagy a bevételi lánchoz
- **Illeszkedés**: van-e hozzá már adatunk/infránk
- **Kockázat**: mekkora felületet érint (a feed sorrendlogikája a legérzékenyebb)

## A 20 funkció

| # | Funkció | Versenytárs-minta | Hatás | Nálunk |
|---|---|---|---|---|
| 1 | **Programok mentése** | Meetup „Save", Eventbrite „Like", FB „Érdekel" | Nagyon magas | **Hiányzik** |
| 2 | **Naptár-export (ICS + Google)** | Luma, Eventbrite, Dice | Nagyon magas | **Hiányzik** |
| 3 | **Hobbi-alapú program-riasztás** | Bandsintown „Track artist", Songkick | Nagyon magas | Hobbi-adat ✓, riasztás hiányzik |
| 4 | **Térképes felfedezés a listán** | Yelp, Google Maps, Fever | Magas | Térkép-komponensek ✓, listanézet hiányzik |
| 5 | **Megosztás / meghívó link** | Partiful, Luma | Magas | Részleges |
| 6 | Heti szerkesztett ajánló | Timeout, Fever | Magas | Digest-infra ✓ |
| 7 | Emlékeztető az esemény előtt | Dice, Eventbrite | Magas | `reminders` tábla ✓ |
| 8 | „Kik jönnek még" láthatóság | Meetup, Partiful | Magas | Piggyback intent ✓ |
| 9 | Visszatérő események / sorozatok | Meetup csoportok | Közepes | `event_series` ✓ |
| 10 | Értékelés / visszajelzés | TripAdvisor, Eventbrite | Közepes | Post-event feedback ✓ |
| 11 | Jegyár-szűrő (ingyenes/fizetős) | Eventbrite, Fever | Közepes | Ár adat ✓, szűrő hiányzik |
| 12 | Barátok követése | Strava, FB | Közepes | Connections ✓ |
| 13 | Gamifikáció (sorozat, jelvény) | Duolingo, Strava | Közepes | Korai a bázishoz |
| 14 | Személyes évösszegzés | Spotify Wrapped | Közepes | Korai |
| 15 | Kurált tematikus gyűjtemények | Fever, Timeout | Közepes | Kézi munkaigény |
| 16 | Szervezői önkiszolgáló feltöltés | Eventbrite, Luma | Magas (B2B) | Organizer dashboard ✓ |
| 17 | Kiemelt/szponzorált hely | Eventbrite Boost | Magas (bevétel) | Séma belső eseményre korlátozva |
| 18 | Jegyvásárlás a platformon belül | Eventbrite, Dice | Nagyon magas | Jogi/pénzügyi előfeltételek |
| 19 | Mobilalkalmazás / push | Meetup, Dice | Magas | PWA + push részben ✓ |
| 20 | Csoportos chat | Meetup, Discord | Közepes | Event messages ✓ |

## A kiválasztott top 5 és az indoklás

**1. Programok mentése** — ez a hiányzó alapkő. Ma ha valaki érdekes programot lát,
nincs hová tennie: vagy azonnal cselekszik, vagy örökre elveszik. Minden versenytárs
első funkciója. Közvetlenül hajtja a visszatérést.

**2. Naptár-export** — a legerősebb *tényleges részvétel* hajtó: ami bekerül a
felhasználó naptárába, azon meg is jelenik. Nulla kockázat, azonnali hasznosság.

**3. Hobbi-alapú program-riasztás** — a Bandsintown modell: követsz valamit, szólunk,
ha jön. Nálunk már megvan a hobbi-kedvenc adat és a programállomány; csak az
összekötés hiányzik. Ez a visszatérés motorja.

**4. Ingyenes/fizetős szűrő** — a scraper begyűjti az árakat, de a felhasználó nem
tud szűrni rá. Az „ingyenes programok" a legkeresettebb szűrő a kategóriában, és
apró munka.

**5. Megosztás** — az organikus növekedés motorja: egy program továbbküldése hozza a
következő felhasználót.

## Tudatosan kihagyva

- **18. Jegyvásárlás a platformon** — a legnagyobb bevételi ugrás, de pénzforgalmi
  engedély, elszámolás és szerződések előfeltétele; nem fejlesztési kérdés.
- **17. Kiemelt hely** — a séma ma csak belső eseményre enged kiemelést, amiből 0 van;
  a külső programokra kiterjesztés a feed sorrendlogikáját érinti (legnagyobb
  regressziós felület), ezért külön, gondosan tesztelt lépés.
- **13–14. Gamifikáció, évösszegzés** — érdemi felhasználói bázis alatt nem mérhető.
