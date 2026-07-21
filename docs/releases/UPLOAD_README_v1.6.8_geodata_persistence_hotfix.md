# Hobbeast v1.6.8 — Geodata DB provider persistence hotfix

## Mit javít ez a csomag?

Ez a hotfix azokat az inkonzisztenciákat javítja, amikor a Címkereső admin UI sikeres mentést jelzett, de frissítés után a `db:*` provider eltűnt, illetve a Postman `get_all_provider_configs` továbbra is `aws` / `geoapify_tomtom` értékeket mutatott.

## Gyökérok

1. A `save_db_table_config` és `save_provider_config` backend útvonal optimistán visszaadhatott sikert anélkül, hogy kötelezően visszaolvasta volna az `app_runtime_config` sort.
2. A frontend a mentés után nem kényszerített teljes provider-state újratöltést.
3. A repo `.env` snapshotban eltérő projektrefek szerepeltek:
   - backend/Hobbeast: `dsymdijzydaehntlmfzl`
   - frontend VITE snapshot: `olzvughcoqnfkdpvbwjy`
   Ez multi-project integrációnál nagyon könnyen olyan állapotot okoz, mintha a mentés elveszne.

## Módosított fájlok

- `supabase/functions/place-search/index.ts`
- `src/lib/searchProviderConfig.ts`
- `src/components/admin/AdminEventbrite.tsx`
- `src/integrations/supabase/client.ts`
- `supabase relationships.txt`
- `changelog.md`
- `codingLessonsLearnt.local.md`

## Telepítési lépések

1. Másold felül a fájlokat a repo gyökerében.
2. Ellenőrizd, hogy nincs conflict marker:

```bash
grep -RInE '^(<<<<<<<|=======|>>>>>>>)' . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude='*.patch'
```

3. Ellenőrizd a frontend Supabase env-et. Hobbeast frontendnek erre kell mutatnia:

```bash
VITE_SUPABASE_URL=https://dsymdijzydaehntlmfzl.supabase.co
```

A Geodata projekt URL-t NEM frontend env-ként kell használni, hanem Edge Function secrettel:

```bash
GEODATA_SUPABASE_URL=https://buuoyyfzincmbxafvihc.supabase.co
GEODATA_SUPABASE_SERVICE_ROLE_KEY=<GEODATA_PROJECT_SERVICE_ROLE_OR_SECRET_KEY>
```

4. Build:

```bash
npm run build
```

5. Edge Function deploy:

```bash
npx supabase link --project-ref dsymdijzydaehntlmfzl
npx supabase functions deploy place-search --project-ref dsymdijzydaehntlmfzl
```

6. Postman / curl sorrend:

```text
POST get_db_table_config
POST save_db_table_config literal unified
POST get_db_table_config
POST save_provider_config venue db literal
POST get_all_provider_configs
POST autocomplete db provider Budapest
```

## Elvárt `get_all_provider_configs` válasz

```json
{
  "providers": {
    "venue": "db:unified-poi"
  },
  "dbTables": [
    {
      "provider": "db:unified-poi",
      "table": "public.unified_pois"
    }
  ]
}
```

Ha a backend nem tudja ténylegesen visszaolvasni az elmentett sort, most már nem fog hamis sikert jelezni, hanem részletes `Runtime ... write verification failed` hibát ad.
