# Address Manager — v1.6.4 (503 hotfix) — feltöltendő fájlok

## A 503 oka

A Supabase Edge Functions runtime 503-at adott vissza minden
`address-manager-discovery` hívásra. A nyomozás eredménye:

1. **A `supabase/functions/address-manager-shared/` mappa nem `_` prefixű**
   → a Supabase CLI minden `supabase/functions/<dir>/` mappát külön
   functionnek tekint. Mivel az `address-manager-shared` mappának nincs
   `index.ts`-e, a deploy hibás állapotba kerülhet, ami egyes konfigokon
   503-at okoz.
2. A három address-manager function importál a `../shared/providerFetch.ts`
   fájlból, amelyben **module-szintű eager init** van
   (`export const supabaseAdmin = getSupabaseAdmin();`). Ha bármi okból
   elhasal (pl. tranziens env probléma, Deno boot race), a function nem
   indul el → 503, és sosem éri el a try/catch.

## Mit oldottunk meg

1. **Új mappa: `supabase/functions/_address-manager-shared/`** —
   underscore prefix, így Supabase **nem** próbálja deployolni
   functionként. Tartalom: `edgeRuntime.ts` (önálló admin client + safeServe
   wrapper, **zero module-level side effect**), `constants.ts`, `types.ts`,
   `repository.ts`.
2. **Mindhárom address-manager function átáll** az új importpathra
   (`../_address-manager-shared/...`), és **`safeServe`** wrapperben fut
   → bármilyen unhandled exception JSON 500-at ad 503 helyett.
3. Új **`health`** action a discovery functionön: zero DB hívás, csak az
   ENV jelenlétét tükrözi vissza. Az admin UI új **"Health (zero-DB)"**
   gombja ezt hívja → ha még a health is 503-mal jön, akkor function
   bootstrap probléma, nincs DB / migráció gond.
4. Új migráció (`20260425150000_address_manager_provider_check_relax.sql`)
   ami **superset provider check**-et tesz fel `NOT VALID` állapotban,
   hogy meglévő `provider='tomtom'` / `'geoapify'` rekordok ne blokkolják
   az `app_runtime_config` constraint felrakását, és újabb `notify pgrst`.

## KÖTELEZŐ — törlendő fájlok

A régi shared mappát **törölni kell** a repóból:

```
rm -rf supabase/functions/address-manager-shared
```

(Ha bent marad, a `discovery/task-generator/worker` az új útvonalon
importál, így önmagában nem törne meg, de a Supabase CLI továbbra is
megpróbálná deployolni "function" gyanánt index.ts nélkül.)

## Telepítési lépések

1. Töröld a régi mappát: `rm -rf supabase/functions/address-manager-shared`
2. Másold be a v1.6.4 zip tartalmát a repó gyökerébe (felülírás OK).
3. `supabase db push` — alkalmazza az új migrációt is.
4. `supabase functions deploy address-manager-discovery address-manager-task-generator address-manager-worker`
5. Vercel deploy a frontendhez.

## Verifikáció

1. Admin → Címkezelő → kattintsd a **"Health (zero-DB)"** gombot.
2. Toast üzenetnek meg kell jelennie: `Health: SUPABASE_URL=OK · service_role=OK · geoapify=OK · tomtom=OK`.
   - Ha bármelyik NO → állítsd be a Supabase secret-et a Dashboardon.
   - Ha 503-mal hibázik → nézd meg a Supabase Dashboard › Functions › Logs-t a stack trace-ért (a `safeServe` mostantól JSON 500-at ad pontos hibával, NEM csak 503-at).
3. Ezután **Provider self-test** → mindkét providernek HTTP 200 + sampleCount > 0.
4. Jelölj ki egy cellát, kattints **Kijelölt chunk futtatása**.
