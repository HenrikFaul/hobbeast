# Changelog append — v1.6.4 — Address Manager: 503 hotfix (self-contained edge runtime)

> Append-only — kiegészíti a v1.6.2 / v1.6.3 bejegyzést.

## Üzleti probléma
A v1.6.3 deploy után a `address-manager-discovery` minden hívásra
**503 Service Unavailable**-t adott. A self-test gomb nem futott le,
a teljes Címkezelő használhatatlan volt.

## Gyökérok
1. A `supabase/functions/address-manager-shared/` mappa nem `_` prefixű
   → a Supabase CLI külön functionnek tekinti, és deploy közben hibás
   állapotba kerülhet.
2. A `../shared/providerFetch.ts` modul-szintű `supabaseAdmin = getSupabaseAdmin()`
   eager init-je → ha bármi okból elhasal, az egész function bootstrap
   meghal, mielőtt a try/catch bekapcsolna → 503.

## Mit oldottunk meg
- **Új mappa**: `supabase/functions/_address-manager-shared/` (underscore
  prefix → Supabase nem deployolja functionként). Tartalom: `edgeRuntime.ts`
  (önálló helperek, **zero module-level side effect**), `constants.ts`,
  `repository.ts`, `types.ts`.
- A három address-manager function **leszakad** a `../shared/providerFetch.ts`-ről,
  és a saját `_address-manager-shared/edgeRuntime.ts`-t használja.
- Új **`safeServe`** wrapper: minden uncaught throw → strukturált JSON 500
  (stack trace tördelve), 503 helyett.
- Új **`health`** action a discovery functionön: zero DB hívás.
- Új admin UI gomb: **"Health (zero-DB)"** → a kapott válasz toast-on
  jelzi az env változók jelenlétét.
- Új migráció: `20260425150000_address_manager_provider_check_relax.sql`
  — provider check superset (`NOT VALID`-szel) hogy meglévő `'tomtom'` /
  `'geoapify'` provider értékekkel rendelkező rekordok ne blokkolják az
  `app_runtime_config` constraint felrakását. Plusz `notify pgrst`.

## KÖTELEZŐ takarítás
A régi `supabase/functions/address-manager-shared/` mappát törölni kell:
```
rm -rf supabase/functions/address-manager-shared
```

## Verifikálási sorrend deploy után
1. Health gomb → minden ENV változó OK.
2. Self-test gomb → mindkét provider HTTP 200 + sampleCount > 0.
3. Cell kijelölés + chunk futtatás → raw_venues feltöltődik.
