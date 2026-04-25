# Address Manager — feltöltendő fájlok (v1.6.2)

A csomag **csak** azokat a fájlokat tartalmazza, amelyeket fel kell
tölteni / felülírni. A repo összes többi fájlját ne nyúld meg.

## A repo gyökerébe másold be a `supabase/` és `src/` mappákat

A struktúra már a végleges helyen van — a zip kibontása után csak
mergeld be a repó gyökerébe (felülírás engedélyezett).

```
supabase/
  config.toml                                                  ← FELÜLÍRJUK (kiegészítve)
  migrations/
    20260425100000_address_manager_provider_fetch_fix.sql      ← ÚJ
  functions/
    address-manager-discovery/index.ts                         ← FELÜLÍRJUK
    address-manager-task-generator/index.ts                    ← FELÜLÍRJUK
    address-manager-worker/index.ts                            ← FELÜLÍRJUK
    address-manager-shared/
      constants.ts                                             ← FELÜLÍRJUK
      repository.ts                                            ← FELÜLÍRJUK
      types.ts                                                 ← FELÜLÍRJUK
src/
  components/admin/AdminAddressManager.tsx                     ← FELÜLÍRJUK
CHANGELOG_APPEND_v1.6.2.md                                     ← ÚJ (changelog.md végére append)
```

## Telepítési lépések

1. Másold be a fájlokat (felülírás OK).
2. `supabase db push` — futtatja az új migrációt
   (`20260425100000_address_manager_provider_fetch_fix.sql`).
3. Ellenőrizd, hogy a következő edge function secret-ek be vannak állítva
   a Supabase projecten:
    - `GEOAPIFY_API_KEY`
    - `TOMTOM_API_KEY`
    - `SUPABASE_SERVICE_ROLE_KEY` (auto-injected, de erősítsd meg)
4. `supabase functions deploy address-manager-discovery address-manager-task-generator address-manager-worker`
   — most már a `config.toml` regisztrálja őket, `verify_jwt = false`-szal.
5. Build/deploy a frontendet (`vercel deploy` vagy a CI flow).

## Verifikáció (kötelező regressziógát)

1. Admin → **Címkezelő** fül.
2. Klikk a **Provider self-test** gombra → az új panelben mindkét
   providernek zöld pipa + HTTP 200 + `sampleCount > 0`.
3. Jelölj ki 1-2 cellát (pl. HU/restaurant Geoapify).
4. Kattints **Kijelölt chunk futtatása** → toast jelezze, hogy `írt sorok > 0`.
5. raw_venues tábla növekedett (alsó panel + Supabase SQL editor).

## Mit oldottunk meg konkrétan

A `nem ad ki semmilyen adatokat geoapifyra vagy tomtomra` panaszra
válasz: a fő ok az volt, hogy
1. **az address-manager edge functionök nem voltak regisztrálva** a
   `supabase/config.toml`-ban (csak egy snippet fájl volt) → telepítéskor
   JWT-védettek maradtak, az internal subhívások 401-ezhettek;
2. a worker **a provider per-request limitet figyelmen kívül hagyta**
   (TomTom max 100, Geoapify max 500) → 1000-es kéréskor 400-as hibát
   kaptunk;
3. a worker **csak 1 tile-t dolgozott fel egy hívásban** → tömeges
   adatgyűjtés nem indult;
4. a belső subhívások **a user JWT-jét továbbították** szervizkulcs
   helyett → JWT lejártakor / kontextushiányos hívásnál fennakadt.

A v1.6.2 mind a négyet befoltozza, és kap egy `self_test` action-t,
ami élőben validálja a két providert.
