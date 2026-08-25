# Térképes programkereső — részletes fejlesztői prompt

## A cél

Booking.com-szintű térképes felfedezés a programokhoz: a felhasználó lát egy szép
térképet, ahol megyénként/városonként látszik, **hány program** van, kicsinyítve-
nagyítva a jelölők átalakulnak, rákattintva megnyílik a program Hobbeast-adatlapja,
onnan pedig át lehet kattintani a forrásoldalra. Oldalsávban kategória- és
megyeszűrés.

## Kiindulási adathelyzet (mért, 2026-08-26)

| Tény | Érték | Következmény |
|---|---|---|
| Aktív program | 1441 | van mit megjeleníteni |
| **Koordinátával** | **2** | **a térkép nem építhető koordinátákra** |
| Várossal | 1038 (36 különböző város) | a város a használható geo-kulcs |
| `Országos` álváros | 350 program | nem tehető pontra, külön kell kezelni |
| Helyszín-táblák (venues, places…) | mind üres | nulláról kell a geo-réteg |

**Ez a terv legfontosabb döntése:** nem geokódolunk 1441 eseményt külső API-val
(lassú, kvótás, költséges és felesleges), hanem egy **statikus magyar
település-koordináta táblát** építünk, és azon aggregálunk. 36 város fedi le a
teljes állományt; a tábla ennél bővebb (megyeszékhelyek + a valós eseményvárosok),
hogy az új források is azonnal a térképre kerüljenek.

## Architektúra

### 1. Adatréteg — `hu_settlements` + két RPC

```
hu_settlements(name_normalized PK, display_name, county, lat, lon)
```
- `name_normalized`: ékezet-hajtogatott kisbetűs név (`hu_fold`), hogy a források
  eltérő írásmódja is találjon ("Kőszeg" / "koszeg" / "KŐSZEG")
- megye = a szűréshez és a megye-szintű klaszterezéshez

**`map_event_clusters(p_category, p_county)`** → megyénkénti és városonkénti
aggregátum egyben: `{counties: [...], cities: [...], unplaced: {…}}`
- `counties`: megye, programszám, súlypont-koordináta → kis zoomon ez látszik
- `cities`: város, programszám, koordináta → nagy zoomon ez látszik
- `unplaced`: az `Országos` és a be nem azonosítható helyszínek száma, hogy a
  felület őszintén jelezze: „350 program nincs térképre helyezve"

**`map_events_at(p_city, p_county, p_category, p_limit)`** → az adott terület
programjai a kártyákhoz (cím, dátum, kép, ár, forráslink, external id).

Mindkettő `STABLE SECURITY DEFINER`, `anon`-nak is engedélyezve: a térkép a
kijelentkezett látogatónak is működjön (ez felfedezési felület).

### 2. Frontend — `EventsMapView`

**Elrendezés (Booking-minta):**
- Asztali: bal oldalsáv (szűrők + találatlista, `w-[380px]`), jobbra a térkép
- Mobil: teljes szélességű térkép, alul felcsúsztatható lista

**Zoom-viselkedés:**
- zoom < 9 → **megye-buborékok**: kör, benne a programszám, alatta a megye neve
- zoom ≥ 9 → **város-pinek**: csepp alakú jelölő a számmal
- A buborék mérete a programszámmal skálázódik (négyzetgyök-skála, hogy a
  Budapest-501 ne nyomja agyon a 7-es városokat)

**Interakció:**
- Megye-buborékra kattintva a térkép ráközelít a megyére (`flyTo`)
- Város-pinre kattintva az oldalsáv az adott város programjaira vált + popup
- A programkártya megnyitja a Hobbeast adatlapot (`/events/:id`), ahonnan a
  meglévő „Megnézem" gomb visz a forráshoz (és rögzíti a kimenő kattintást)

**Szűrők az oldalsávban:**
- Kategória-chipek (a valós kategóriákból, darabszámmal)
- Megye-legördülő
- A szűrés a szerveren történik (RPC paraméter), nem kliensoldali szeleteléssel

### 3. Vizuális terv — miért lesz szép

A jelenlegi térkép-komponensek az alapértelmezett kék Leaflet-pint használják;
itt **saját `divIcon` jelölőket** rajzolunk a Hobbeast designnyelvén:
- Márkaszínű körök `hsl(var(--primary))` alapon, fehér szegéllyel és lágy
  árnyékkal (`shadow-elevated` megfelelője inline SVG-ben)
- A szám a jelölő közepén, `font-display` súllyal
- Hover: finom felnagyítás; kiválasztott: kiemelt gyűrű
- A térképcsempe világos/sötét témához igazodik (CartoDB Positron / Dark Matter),
  hogy a felület ne törjön ki a design-rendszerből
- A térképkonténer lekerekített (`rounded-[2rem]`), keretezett — illeszkedik a
  meglévő kártyás nyelvhez

### 4. Teljesítmény és kockázat

- **Nincs új npm-függőség**: a `leaflet` már telepítve van; a React-integrációt
  saját, `useEffect`-alapú kis wrapper adja (`react-leaflet` nem kell)
- A csempeszolgáltató nyilvános CDN (OSM/Carto), kulcs nélkül
- A meglévő listás nézethez **nem nyúlunk**: a térkép új útvonal (`/events/map`),
  a listáról egy gomb visz oda. Így a feed sorrendlogikája — az alkalmazás
  legnagyobb regressziós felülete — érintetlen marad.
- Az `unplaced` szám látható marad, hogy a felület soha ne állítson többet,
  mint amennyi adatunk valóban van.

## Elfogadási kritériumok

1. A térkép betölt, és a megyék programszámai megegyeznek az adatbázis
   aggregátumával
2. Zoomolásra a megye-buborékok város-pinekké alakulnak
3. Városra kattintva az oldalsávban megjelennek az adott város programjai
4. A programkártyáról el lehet jutni az adatlapra, onnan a forráshoz
5. Kategória- és megyeszűrés a szerveren fut, és a térkép + lista együtt frissül
6. Az „Országos"/ismeretlen helyszínű programok száma őszintén jelezve van
7. Sötét és világos témában is helyes; mobilon használható
8. Nincs regresszió: a meglévő listás nézet és a feed változatlan
