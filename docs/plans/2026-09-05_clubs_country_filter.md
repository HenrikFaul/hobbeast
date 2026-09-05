# Terv — ország-szűrő a klubok listázójában

**Dátum:** 2026-09-05 · **Cél verzió:** v1.70.0 · **Állapot:** terv → megvalósítás

## Kiindulás

A `clubs` táblán **már van `country_code`** — a képesség tehát megvan, csak nincs
használva. Mérés (2026-09-05): **2741 aktív klub, mind `HU`.**

A v1.69.0-ban ezért nem szállítottam a szűrőt. A tulajdonos döntése az, hogy
kerüljön be: a listázók viselkedése legyen **egységes** az eseményekkel, és a
külföldi klubok érkezésekor ne kelljen hozzányúlni a felülethez.

## Döntések

**D1. Ugyanaz a `CountryFilterBar`, ugyanaz a mentett választás.**
Nem külön vezérlő: a felhasználó egyszer választ országot, és az az események, a
térkép és a klubok listáján egyaránt érvényes. Ez a `hobbeast.countryFilter.v1`
localStorage-kulcs, amit a v1.69.0 bevezetett.

**D2. A nulla darabszám nem rejtve, hanem kimondva.**
Egy ország, amihez nincs klub, **letiltott gombként** jelenik meg 0-val — pont
úgy, ahogy az eseményeknél már működik. Nem tüntetjük el: az információ, hogy
„Ausztriában még nincs klubunk", valós és hasznos. Amit elkerülünk, az a
kattintható gomb, ami üres listát ad indoklás nélkül.

**D3. A szűrés a szerveren történik, nem a kliensen.**
A `list_clubs_public` és a `list_club_facets` kap `p_countries` paramétert
(additív, `NULL` = minden ország), így a lapozás és a darabszámok helyesek
maradnak.

**D4. Új RPC a darabszámokhoz.**
`list_club_countries()` — országonkénti aktív klubszám, ugyanabban az alakban,
mint a `list_event_countries()`, hogy a `CountryFilterBar` változtatás nélkül
fogadja.

## Végrehajtás

1. Migráció: `list_club_countries()` + `p_countries` a `list_clubs_public`-on és
   a `list_club_facets`-en (a régi aláírás eldobva, hogy a PostgREST-nek ne
   legyen kétértelmű túlterhelés — ugyanaz a minta, mint v1.69.0-ban).
2. `clubOperations.ts`: `countries` paraméter átadása + `listClubCountries()`.
3. `Clubs.tsx`: `CountryFilterBar` beillesztése, a megosztott választással.
4. Teszt: a paraméter `NULL`-ként megy, ha nincs választás; a választás
   nagybetűsítve és duplikátum nélkül megy át.

## Regressziós korlátok

- `p_countries = NULL` → a mai lista **bitre változatlan**.
- A klub-oldal többi szűrője (téma, város, típus, közönség) érintetlen.
- Mivel minden klub magyar, a mai látogató ugyanazt a 2741 klubot látja, mint
  eddig — a szűrő csak akkor változtat bármit, amikor lesz külföldi klub.
