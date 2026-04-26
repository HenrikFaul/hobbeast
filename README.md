# Hobbeast v1.6.7 — Geodata db:* provider hotfix

## Mi volt a hiba?

A `place-search` Edge Function a konfigurációs actionöket (`get_db_table_config`, `save_db_table_config`, `save_provider_config`) nem kezelte elég korán / elég szigorúan, ezért egyes config hívások normál keresésként futottak tovább, és ezt adták vissza:

```json
{
  "error": "query or coordinates are required"
}
```

Emellett a `save_provider_config` elfogadhatott hibás vagy fel nem oldott Postman változót, majd fallback providerként `aws` / régi érték maradt vissza.

## Mit javít ez a csomag?

- A config actionök keresési validáció előtt futnak le.
- A `save_db_table_config` ténylegesen ment, nem keresést indít.
- A `get_db_table_config` ténylegesen configot ad vissza, query/city nélkül is.
- A `save_provider_config` szigorúan validálja a providert. A `{{db_provider}}` típusú fel nem oldott változót hibaként jelzi.
- A `test_db_table_query` működik közvetlen `table` paraméterrel is.
- A Geodata REST query már nem kér le `raw_data` mezőt, így gyorsabb és kisebb választ ad.
- A DB provider mapping továbbra is gazdag venue metaadatot ad vissza: cím, city, lat/lon, categories, brand, operator, cuisine, phone, email, website, opening hours, accessibility/seating metaadatok.

## Felülírandó / új fájlok

Másold be a repo gyökerébe ezeket:

```text
supabase/functions/place-search/index.ts
supabase/migrations/20260426214500_fix_geodata_db_provider_runtime_config.sql
postman/hobbeast-geodata-db-provider-debug-v3.postman_collection.json
postman/hobbeast-geodata-db-provider-debug-v3.postman_environment.json
```

## Deploy sorrend

```bash
npm run build
npx supabase link --project-ref dsymdijzydaehntlmfzl
npx supabase db push
npx supabase functions deploy place-search --project-ref dsymdijzydaehntlmfzl
```

Ha a migrationt nem akarod CLI-ből futtatni, akkor a `20260426214500_fix_geodata_db_provider_runtime_config.sql` tartalmát futtasd le a Hobbeast Supabase projekt SQL Editorában.

## Secret ellenőrzés

A Hobbeast projektben legyenek beállítva:

```text
GEODATA_SUPABASE_URL=https://buuoyyfzincmbxafvihc.supabase.co
GEODATA_SUPABASE_SERVICE_ROLE_KEY=<a buuoyyfzincmbxafvihc Geodata projekt működő service_role/secret key-je>
```

Ellenőrzés:

```bash
npx supabase secrets list --project-ref dsymdijzydaehntlmfzl
```

## Kötelező Postman teszt sorrend

Importáld a `postman` mappában lévő collection + environment fájlt, majd állítsd be:

```text
geodata_key = működő Geodata key
hobbeast_anon_key = Hobbeast anon/publishable key
```

Futtatási sorrend:

1. `01 Direct Geodata REST / GET unified_pois basic`
2. `02 Hobbeast Edge / POST get_db_table_config`
3. `02 Hobbeast Edge / POST save_db_table_config literal unified`
4. `02 Hobbeast Edge / POST get_db_table_config`
5. `02 Hobbeast Edge / POST save_provider_config venue db literal`
6. `02 Hobbeast Edge / POST get_all_provider_configs`
7. `02 Hobbeast Edge / POST test_db_table_query literal unified Budapest`
8. `02 Hobbeast Edge / POST autocomplete db provider Budapest`

Elvárt eredmény: minden fenti hívás `200 OK`, a `venue` provider pedig `db:unified-poi`.
