# Terv — teljes i18n alap a Hobbeast/Expericentre felületére

**Dátum:** 2026-09-05 · **Cél verzió:** v1.70.0 · **Állapot:** terv → megvalósítás

## Miért

A prompt-pack kimondja: *„teljes i18n az UI-copy, template, notification, event
content, API enum label és forrásmegjelölés számára"*
(`Hobbeast_Ultimate_Event_Engine_Ultra_Premium_Additive_Prompt.md:1124`). A termék
ma **hét ország** programjait gyűjti (HU, AT, CZ, DE, PL, SI, SK), de a felület
kizárólag magyar, kódba írt szövegekkel — egy osztrák vagy lengyel látogató
számára használhatatlan, és a v1.69.0 ország-szűrője is magyar címkéket ad.

## Mérés, nem becslés

| | |
| --- | ---: |
| `src` alatti TS/TSX fájl | 355 |
| Magyar ékezetes string-literál `.tsx`-ben | ~1769 |
| Legterheltebb fájl | `pages/Events.tsx` (86) |

Ez a szám a tervet alakítja: **egy menetben mind az 1769 szöveg hét nyelvre
fordítása nem reális és nem is lenne jó minőségű.** A referencia-projektek sem
így csinálták — az `effectime-app-enterprise` `de/at/ro` csomagjai saját
kommentjük szerint „English-equivalent scaffolds", a professzionális fordítás
repón kívüli tartalmi feladat.

## Minta, amit követünk

`C:\Work\Github\effectime-app-enterprise-a95029a1` szerkezete bevált, ezt visszük át:

```
src/i18n/locales.ts          nyelvregiszter, detektálás, címkék, storage kulcs
src/i18n/I18nProvider.tsx    context + t(key, vars) + lazy bundle betöltés
src/i18n/localeBundles.ts    dinamikus import nyelvenként, cache
src/i18n/resources/<tag>.ts  beágyazott objektum-katalógus
```

Átvett részletek, amiket nem találunk ki újra:
- `t(key, vars)` `{{placeholder}}` interpolációval,
- **hiányzó kulcs → fallback az alapnyelvre**, nem üres string és nem a kulcs,
- `htmlLangForLocale()` a `<html lang>` beállításához (SEO és képernyőolvasó),
- localStorage-kulcs + böngészőnyelv detektálás, `try/catch`-csel (hardened
  böngésző, WebView).

## Döntések

**D1. Az alapnyelv MAGYAR marad, nem angol.**
Az effectime-nál `en` a default; nálunk a teljes meglévő felület magyar, és a
felhasználók magyarok. Ha az alapnyelv angol lenne, minden le nem fordított kulcs
angolul jelenne meg egy magyar felhasználónak — ez azonnali regresszió. Magyar
alapnyelvvel a **mai viselkedés bitre változatlan**.

**D2. Hét nyelv, pontosan a hét gyűjtött országhoz.**
`hu` (forrás), `en`, `de`, `cs`, `pl`, `sl`, `sk`. Az `en` a nemzetközi tartalék;
a `de` fedi AT-t és DE-t is (az effectime külön `at` tagot használ, nekünk erre
nincs szükségünk, mert nem osztrák-specifikus a copy).

**D3. Első körben a TAG-FELÉ NÉZŐ felületet fordítjuk, nem az admint.**
Sorrend: navigáció → Események lista és szűrők (benne a v1.69.0 ország-szűrő) →
Térkép → Klubok. Az admin (`components/admin/*`, ~400 literál) operátori felület,
magyarul marad; a keretrendszer viszont ott is elérhető.

**D4. Őr a visszaesés ellen.**
`scripts/check-i18n-hardcoded-copy.mjs` (a `C:\Work\diet` mintájára): a
lefordított fájlokban tiltja az új, kódba írt ékezetes literált. Allowlist a már
migrált fájlokra épül, tehát a lefedettség **csak nőhet**.

**D5. A nyelv perzisztens és a profilhoz köthető.**
localStorage azonnal; bejelentkezett felhasználónál a `profiles` táblán tárolt
`locale` az igazság, hogy eszközök között is stimmeljen.

## Végrehajtás

1. `src/i18n/locales.ts` — 7 nyelv, detektálás, címkék, `htmlLang`.
2. `src/i18n/resources/hu.ts` — a forráskatalógus a migrált felületekhez.
3. A többi hat `resources/<tag>.ts` — valódi fordítás a katalógus kulcsaira.
4. `src/i18n/localeBundles.ts` + `I18nProvider.tsx` + `useI18n()` hook.
5. `LanguageSwitcher` komponens a fejlécbe.
6. Migráció: `CountryFilterBar`, `Events` szűrőblokk, `EventsMapView` panel,
   `Clubs` lista, navigáció.
7. `profiles.locale` oszlop + `set_my_locale` RPC (additív migráció).
8. Tesztek: kulcs-paritás minden nyelvre, fallback, detektálás, interpoláció.
9. `check-i18n-hardcoded-copy.mjs` + `npm run i18n:check`.

## Regressziós korlátok

- **Alapnyelv magyar** → aki nem vált nyelvet, semmit nem vesz észre.
- A `t()` **soha nem dob**: ismeretlen kulcsra a kulcsot adja vissza fejlesztői
  módban és az alapnyelvi szöveget élesben.
- A bundle-ök **lazy import**-tal jönnek, tehát a magyar látogató nem tölt le hat
  fölösleges katalógust.
- Minden migrált szöveg **karakterre azonos** marad magyarul — a katalógusba a
  jelenlegi literál kerül, nem újrafogalmazás.
