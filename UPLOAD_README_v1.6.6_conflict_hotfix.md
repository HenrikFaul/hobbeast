# Hobbeast v1.6.6 conflict-marker deploy hotfix

## Mit javít?

Ez a csomag a Vercel buildet megállító Git merge conflict markereket javítja.
A konkrét Vercel hiba:

```text
[vite:esbuild] Transform failed with 1 error:
/vercel/path0/src/lib/placeSearch.ts:9:0: ERROR: Unexpected "<<"
```

## Kötelező ellenőrzés feltöltés után

```bash
grep -RInE '^(<<<<<<<|=======|>>>>>>>)' . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude='*.patch'
```

Elvárt eredmény: nincs találat.

## Fő felülírandó fájlok

- `src/lib/placeSearch.ts`
- `src/lib/commonAdminMetadata.ts`
- `src/components/admin/CommonAdminPanel.tsx`
- `src/components/admin/AdminEventbrite.tsx`
- `src/lib/searchProviderConfig.ts`
- `src/components/AddressAutocomplete.tsx`
- `supabase/config.toml`
- `supabase/functions/place-search/index.ts`
- `supabase/migrations/20260426203000_geodata_db_address_providers.sql`
- `changelog.md`
- `codingLessonsLearnt.local.md`

## Deploy parancsok

```bash
npm run build
supabase functions deploy place-search
```

A Geodata projekt kulcsai továbbra is secretként kellenek:

```bash
supabase secrets set GEODATA_SUPABASE_URL="https://buuoyyfzincmbxafvihc.supabase.co"
supabase secrets set GEODATA_SUPABASE_SERVICE_ROLE_KEY="IDE_JÖN_A_GEODATA_PROJECT_SERVICE_ROLE_KEY"
```
