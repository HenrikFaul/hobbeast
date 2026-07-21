# Changelog append — v1.6.3 — Address Manager hotfix (defenzív render + apikey header)

> Append-only — kiegészíti a v1.6.2-t.

## Üzleti probléma
Production (`hobbeast.vercel.app/admin?tab=address-manager`) a Provider
self-test gomb megnyomására fekete képernyőre dobott. A dev console
hibája:
`TypeError: Cannot read properties of undefined (reading 'hasServiceRole')`.

## Gyökérok
A v1.6.2 frontend bundle azt feltételezte, hogy a backend response **mindig**
tartalmazza az `env`, `pageCaps` és `providerResults` mezőket. Ha a Vercel
deploy lecserélte a frontendet, **de a Supabase edge functionöket még nem
telepítették újra**, akkor a régi `address-manager-discovery` a
`self_test` action-t nem ismerte fel és bootstrap választ adott vissza
(`{ ok: true, limits, matrix, summary }`). A frontend ezután közvetlenül
`selfTest.env.hasServiceRole`-t olvasta → React render crash → fekete
képernyő.

Másodlagos kockázat: a `supabase.functions.invoke` hívásnál a Supabase
function gateway routing-hoz **mindig** kéri az `apikey` headert (a
`verify_jwt = false` csak a JWT-ellenőrzést kapcsolja le, a routingot nem),
amit a régi `invokeFunctionWithDebug` csak feltételesen küldött.

## Mit oldott meg

1. **`src/components/admin/AdminAddressManager.tsx`** —
   - A self-test panel render most defenzív: `selfTest.env`,
     `selfTest.pageCaps`, `selfTest.providerResults` mind külön optional
     blokk, és minden hiányzó mezőre **figyelmeztető üzenet** jelenik meg
     (`"A backend nem küldött env mezőt — telepítsd újra…"`) → soha többé
     nincs render crash, és a felhasználó **azonnal megtudja, hogy a
     functionöket újra kell deployolni**.
   - `onSuccess` is biztonságos: nem dob, ha `providerResults` undefined.
   - `cell.stats` defenzíven olvasva (`(cell.stats || {})`).

2. **`src/integrations/supabase/client.ts`** —
   - `invokeFunctionWithDebug` mostantól **mindig** beállítja az `apikey`
     headert a publishable kulccsal. Ha nincs user session, az
     `Authorization` headerre is a publishable kulcs kerül fallback-ként,
     hogy a gateway sose dobjon 401-et a routing előtt.
   - Bővebb console log (`hasApikeyHeader`) a diagnózishoz.

## Regressziók (ellenőrizve)
- A bejelentkezett user JWT továbbra is felülírja a fallback Authorizationt
  (object spread sorrend: `baseHeaders` → `options.headers`-szel kombinálva).
- A `verify_jwt = false`-ra állított edge functionök eddig is a
  publishable kulcsot tudták routingolni, csak nem mindenhol érkezett meg.

## Kötelező lépés deploy után
A self-test panel mostantól megmondja, ha az edge function régi:
**"A backend nem küldött env mezőt — telepítsd újra"**. Ha ezt látod,
futtasd:

```
supabase functions deploy address-manager-discovery address-manager-task-generator address-manager-worker
```
