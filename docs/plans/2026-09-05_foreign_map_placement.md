# Terv — külföldi programok a térképre

**Dátum:** 2026-09-05 · **Cél verzió:** v1.70.0 · **Állapot:** terv → megvalósítás

## A hiány, pontosan

A v1.69.0-ban a térkép már **rákeretez** a kiválasztott országra, de **pont nincs
rajta**, mert:

| Mérés (2026-09-05) | Érték |
| --- | ---: |
| Külföldi jövőbeli esemény koordinátával | **0** |
| `geo_places` sor összesen | 1055 |
| `geo_places` ország-oszlop | **nincs** (megye/kerület/irányítószám — tisztán magyar) |

A `map_markers` RPC a `geo_places` névtárból dolgozik, ami a magyar
közigazgatásra épül. Egy külföldi eseménynek tehát ma fizikailag nincs hova
kerülnie.

## Döntések

**D1. Nem geokódoló szolgáltatást hívunk, hanem a saját városainkat pozicionáljuk.**
A kanonizálás után a hat külföldi országban **mindössze ~120 különböző város**
van, és a hosszú farok néhány eseményes. Egy külső geokódolóhoz API-kulcs, kvóta,
hálózati hiba és adatvédelmi kérdés tartozna — egy 120 soros koordinátatábla
determinisztikus, ingyenes, offline és auditálható. A meglévő magyar
`geo_places` út **érintetlen marad**.

**D2. Új tábla, nem a `geo_places` átalakítása.**
`public.city_coordinates(country_code, city_norm, lat, lon, source, note)`. A
`geo_places` a magyar, címszintű, geokódolt névtár marad a maga
`place_key`-eivel; ezt nem keverjük össze egy város-középpont táblával. Külön
tábla = a magyar térképlogika egyetlen sora sem változik.

**D3. A pont a VÁROS középpontja, és ezt ki is mondjuk.**
Nincs házszám-pontosságunk külföldön. A marker `kind: 'city'` lesz — ugyanaz a
buborék-megjelenés, amit a magyar városszinten már használunk —, nem `venue`.
Így senki nem hiszi, hogy a pont a bejáratot jelöli.

**D4. A lefedettséget megmérjük és megmutatjuk.**
Amelyik városhoz nincs koordináta, az esemény továbbra is a listában van, és a
felület megmondja, hány program nem került térképre. Néma elhagyás nincs.

## Végrehajtás

1. Migráció: `city_coordinates` tábla + RLS (olvasás publikus) + seed a
   ténylegesen meglévő kanonikus városokra, országonként.
2. `map_markers` és `map_events_list` kiegészítése `p_countries` paraméterrel
   (additív, alapértelmezés `NULL` = mai viselkedés), és a külföldi ág a
   `city_coordinates`-ből építi a `city` szintű markereket.
3. A kliens átadja a kiválasztott országokat; a „nincs elhelyezés" figyelmeztetés
   helyére a valódi lefedettség kerül.
4. Ellenőrzés: országonként hány program kerül térképre, és melyik város marad ki.

## Regressziós korlátok

- `p_countries = NULL` → a magyar viselkedés **bitre a mai**.
- A magyar ág továbbra is a `geo_places`-ből jön; a `city_coordinates` csak akkor
  szólal meg, ha külföldi ország van kiválasztva.
- A seed **mért adatból** készül (a ténylegesen meglévő kanonikus városok), nem
  egy általános világ-gazetteerből.
