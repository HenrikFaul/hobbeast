# AWS ↔ local address matching strategy

Target geodata project database: `buuoyyfzincmbxafvihc`

## New persistent tables
- `public.provider_category_mapper` — provider category kulcsok (`sport.fitness`, `catering.restaurant`, stb.) megfeleltetése a Hobbeast kategóriakatalógushoz.
- `public.aws_local_address_mapper` — AWS Places rekordok és a geodata helyi címsorok közti megfeleltetés / review queue.

## Current frontend state in this delivery
- Az Import / Címkereső oldalon a **Fordító / mapper nézet** most már láthatóvá teszi:
  - a provider kategóriák eredeti angol kulcsait,
  - azok frontend-oldali magyar fordítását,
  - a Hobbeast lokális katalógushoz becsült megfeleltetést.
- Ez a nézet jelenleg **frontend derived view**, nem írás a Supabase-be.
- A tartós DB táblákhoz a DDL a `docs/sql/geodata_project_mapper_tables.sql` fájlban van.

## Recommended industry-grade matching pipeline
1. **Normalize first**
   - címek lower-case + accent-fold + whitespace collapse
   - structured komponensek külön: házszám, utca, város, irányítószám, ország
2. **Use structured geocoding where possible**
   - AWS Places V2 támogat strukturált komponenseket (`Country`, `Locality`, `District`, `AddressNumber`) és részletes `Address` objektumot.
3. **Create candidate set by geography first**
   - ugyanaz a város / postcode
   - vagy max 50–150 m sugarú koordináta-jelölt lista
4. **Score multiple signals, not only one string**
   - name similarity
   - formatted address similarity
   - city/postcode exact match
   - geo distance
   - category compatibility
5. **Persist candidates + review status**
   - `candidate` → `matched` / `rejected` / `needs_review`
6. **Use manual review for borderline scores**
   - high-score auto-match
   - mid-score operator review
   - low-score reject

## Why this shape
- AWS Places V2 exposes place/address fields and place IDs that can be stored and later refreshed with `GetPlace`. citeturn858858search1turn858858search9
- AWS Places supports free-form and structured geocoding/search, which is useful when incoming data quality differs by source. citeturn858858search3turn858858search5turn858858search7
- Industry-grade fuzzy matching in PostgreSQL is commonly built with `pg_trgm`, which supports trigram similarity and index-accelerated similarity search. citeturn147920search1
- For difficult international address strings, libpostal is a strong normalization/parsing layer widely used for real-world address cleanup. citeturn851369search3
- Open geocoders like Nominatim also distinguish structured vs free-form queries, reinforcing the same architecture pattern. citeturn851369search0turn851369search4

## Recommended scoring skeleton
- `0.35` name similarity
- `0.30` formatted address similarity
- `0.15` city/postcode exactness
- `0.15` geo distance score
- `0.05` category/source compatibility

## Suggested thresholds
- `>= 0.92` auto-match
- `0.75 - 0.9199` needs review
- `< 0.75` reject by default

## Best next implementation step
1. populate `provider_category_mapper` from the currently visible frontend translator view
2. enrich AWS search ingestion with structured address components + `PlaceId`
3. generate candidate matches into `aws_local_address_mapper`
4. add an admin review UI over `aws_local_address_mapper`
