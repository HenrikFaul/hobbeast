# codingLessonsLearnt.local

Ide appendelődnek az adott repo saját új tanulságai.
A collector eszköz innen olvassa vissza a governance central repóba.
SOHA ne töröld a meglévő tartalmat — csak hozzáadni szabad.

---

## ➕ APPEND — 2026-04-03 common_admin drift

### [HIBA-051] Shared admin capability drift across repos
- **Dátum**: 2026-04-03 (v1.4.3)
- **Fájl**: `src/components/admin/*`, governance `common_admin/*`
- **Hibaüzenet**: Az egyik app adminja tud valamit, a másik nem — ugyanaz a capability más helyre kerül és elveszik a közös modell.
- **Gyökérok**: Nem volt közös, kanonikus common_admin modell, ezért az admin képességek apponként elsodródtak.
- **Javítás**: A common_admin capability-k governance kanonikus forrásra lettek kötve, és a Hobbeast admin új Common Admin tabot kapott inventory + version réteggel. Az Import funkciók megmaradtak a meglévő tabban.
- **Megelőzés**: MINDEN shared admin változtatásnál először a governance `common_admin/` fájljait kell frissíteni, és csak utána szabad az app-specifikus implementációt módosítani.

## v1.7.4 — Dynamic discovery instead of static category mapping

- Do not maintain static category mapping files for Geodata-driven address search. Discover category/source values dynamically from the selected database table.
- Admin query tools must show evidence: row count, source column, response time, selected filters, and backend match strategy.
- Category filters should not rely only on exact equality. Use exact-first behavior and a fuzzy fallback so real-world provider category values remain usable.
- When frontend uses a backend response for diagnostics, render empty states with actionable suggestions from live database facets instead of generic “no result” messages.

## v1.7.5 — Location search async safety and modal crash prevention

- **Symptom**: Typing in the event creation location input could create many `place-search` Edge Function calls, several 500 responses, and unstable modal behavior.
- **Root cause**: The dynamic discovery backend referenced `buildPseudoSql` without defining it, while the frontend did not abort stale requests and did not isolate search failures from the modal render tree.
- **Fix**: Added the missing backend helper, AbortController-backed frontend search cancellation, a short cache, slow-query diagnostics, and an Error Boundary around the event creation modal.
- **Prevention**: Any future address/location search feature must support debounce, request cancellation, stale-response protection, UI empty/error states, and backend runtime marker checks before deployment.
- **Regression note**: Do not reintroduce direct `venue_cache`-only search paths for event venue suggestions when `db:*` providers are active; use the configured address provider path.

## v1.7.6 — Separate admin DB projection from runtime venue autocomplete

### Symptom
Typing activity-like text such as `board`, `hobbeast`, `társas`, or `játék` into event creation location search produced empty results while `db:unified-poi` was active.

### Root cause
The same direct table projection function was used for both admin diagnostics and runtime venue autocomplete. Admin diagnostics need raw selected columns and counts; runtime autocomplete needs mapped venue results, semantic fallback, and user-safe empty/error behavior.

### Fix
Keep `test_db_table_query` as direct table projection, but route `autocomplete` for `db:*` providers through a dedicated resilient DB autocomplete engine.

### Prevention
Never reuse admin/debug projection endpoints as production autocomplete behavior. Admin query tools and user-facing search must have separate contracts and fallback logic.

## v1.7.7 — Admin import mapper visibility and geodata-only persistence split

- **Symptom**: Az új mapper nézet már szűrhető volt, de a legfontosabb kategóriafordítások nem látszottak, ezért operátori ellenőrzésre kevésbé volt használható.
- **Root cause**: A nyers DB projection és a frontend mapper nézet között nem jelent meg külön, explicit oszlopként az angol provider kategória, a magyar fordítás és a lokális Hobbeast-katalógus megfeleltetés.
- **Fix**: A mapper nézet most derived oszlopokat rak ki (`categories_en`, `categories_hu`, `local_catalog_path_hu`, `local_catalog_slug`) és ezek is oszloponként, realtime szűrhetők.
- **Prevention**: Diagnosztikai admin tábláknál nem elég a nyers mezőket kilistázni; az operátori döntéshez szükséges normalizált / fordított / lokális megfeleltető mezőket is explicit oszlopként kell megjeleníteni.
- **Architecture note**: Ha a tényleges perzisztencia másik Supabase projektben él (itt: Geodata), a Hobbeast repo-ban külön jelölni kell, hogy a jelen kör frontendje csak derived nézetet ad, a célprojekt DDL pedig külön SQL fájlban van előkészítve.

## v1.7.8 — Realtime admin filters and mapper-assisted category search must co-exist

- **Symptom**: Egy új kategóriafordítási bővítés után könnyen eltűnhet a nyers DB eredménytábla fejléces realtime szűrése vagy maga a mapper nézet, mert ugyanazon admin panelen több, egymásra épülő diagnosztikai réteg él.
- **Root cause**: A feature-t nem külön regressziós invariánsként kezeltük: a raw-table filter sor és a mapper-table filter sor egyszerre kötelező capability, nem egymást helyettesítő UI-elemek.
- **Fix**: A két tábla külön, explicit blokkban marad, mindkettő saját oszlopfejléc-alatti realtime szűrőkkel. A kategória ajánló logika külön réteg lett, nem írhatja felül a raw/mapper gridet.
- **Prevention**: Admin diagnosztikai képernyőknél előre rögzíteni kell az invariánsokat: (1) raw projection table látszik, (2) mapper table látszik, (3) mindkettő szűrhető, (4) új suggestion/mapping logika csak additív lehet.
- **Search architecture note**: Ha HU/EN / local catalog aliasokkal akarunk provider kategóriára rákeresni, azt a dedikált mapper tábla (`public.provider_category_mapper`) term-expansion rétegében kell megoldani, nem a raw találati táblák egyszerűsítésével.

## v1.7.9 — Faceted suggestion overlays must be reusable, and trip planners must reject null-island coordinates

- **Symptom**: The counted suggestion overlay proved highly effective for category exploration, but without naming and documenting the pattern it becomes hard to reuse consistently across future admin screens.
- **Pattern name**: Treat this UI as a `live faceted typeahead with counted suggestions` (or `FacetTypeahead`) instead of a generic dropdown.
- **Implementation lesson**: Keep the source rows, normalized aliases, bucket aggregation, count rendering, and keyboard interaction as separate layers so the same component can be reused for provider categories, cities, hubs, and address mappers.
- **Planner bug**: Address providers can occasionally return incomplete hits without valid coordinates; silently coercing these to numeric zero creates random `0,0` route points.
- **Fix**: Route-planning suggestion pipelines must validate coordinates and either enrich missing provider coordinates from a details endpoint or drop the invalid suggestion before selection.
- **Prevention**: Any autocomplete that feeds a map or router must treat `0,0` as invalid unless it is explicitly intended, and nested admin detail dialogs should open additive overlays instead of replacing the parent modal.

## v1.8.0 — Multi-Supabase project-mismatch log must never echo the full URL

- **Symptom**: A wrong-project frontend boot log printed the full Supabase URL (`configuredUrl`) in `src/integrations/supabase/client.ts`, alongside the project ref. The URL is not a secret by itself, but it leaks deployment topology and violates the "never leak URL in the project-mismatch message" contract that `src/lib/supabaseProjects.ts` already enforces.
- **Root cause**: The auto-generated `client.ts` had its own inline mismatch log that copied `SUPABASE_URL` verbatim instead of delegating to the shared ref-only helper contract.
- **Fix (v1.8.0 production baseline)**: The mismatch `console.error` now logs only `configuredProjectRef` + `expectedProjectRef` — never the URL. Verified in the test run: the `placeSearch.test.ts` stderr line now shows only the refs, no URL.
- **Prevention**: Any Supabase-client or Edge-Function log that fires on project/target mismatch must emit `project ref` only — never the URL, key, or token. Reuse `extractProjectRef`/`classifyProjectRef` semantics from `src/lib/supabaseProjects.ts` everywhere; do not re-implement URL logging inline.

## v1.8.4 — Client body flags are never scheduler authentication

- **Symptom**: A `verify_jwt=false` Edge Function accepted client-controlled `_cron=true` and
  skipped `requireAdminUser`, then wrote events with a service-role client and charged AI quota.
- **Root cause**: Execution mode (`cron`) was confused with caller identity; a JSON body value
  was treated as a privileged trust boundary.
- **Fix**: Remove the bypass and require verified admin authorization for every action. Keep
  automation HOLD until a server-held signature, timestamp/replay guard and durable job lock exist.
- **Prevention**: No request body/query/header chosen by an untrusted caller can establish admin,
  scheduler or service identity on a gateway-unverified Edge Function.

## v1.8.4 — `.gitignore` does not protect a file that Git already tracks

- **Symptom**: Readiness documentation claimed `.env` was absent from the tracked tree while
  `git ls-files --stage -- .env` returned a tracked blob.
- **Root cause**: The audit checked the ignore rule/pattern scan but did not check the Git index.
- **Fix**: Release validation now fails when `.env` is tracked; risk/readiness evidence is HOLD.
  Rotation and tracking/history remediation remain operator-owned security actions.
- **Prevention**: Secret hygiene gates must check both ignore rules and `git ls-files`; never infer
  “untracked” from `.gitignore` alone.

## v1.8.4 — A default-limited query is not complete reconciliation state

- **Symptom**: A hub edit planned removals from an unpaginated `profiles` query. Above the
  PostgREST row limit, legitimate members absent from the response could be classified as stale.
- **Fix**: Keep the pure add/keep/remove planner as a tested migration contract, but do not apply
  it to runtime membership until pagination, one transaction and a concurrency lock are proven.
- **Prevention**: Destructive desired-state reconciliation requires a proven-complete snapshot or
  a DB-native set operation; partial client/Edge result sets may never authorize deletes.

## v1.8.4 — An authenticated Edge wrapper does not secure a direct RPC

- **Symptom**: The Edge refresh action gained admin auth, while the underlying destructive
  `SECURITY DEFINER` function retained legacy direct execution grants.
- **Fix**: Block the unsafe Edge action and UI control immediately; keep production on HOLD until
  an approved migration revokes broad grants and proves direct-call denial.
- **Prevention**: Review database grants separately from every wrapper route. Wrapper auth is
  defense in depth, not a replacement for least-privilege function privileges.

## v1.9.0 — The migration ledger is not the schema: only a dump replay proves the chain

- **Symptom**: 52 of 91 repository migrations had never run against production data. The chain
  also could not have run: `20260423193000` re-added a provider CHECK constraint that existing
  `db:*` rows violate, so replay aborted mid-chain and every later migration was unreachable.
- **Root cause**: Source-only review verified each migration in isolation, but nothing ever
  replayed the whole chain on top of the real database state. The live schema had also drifted
  from the migrations (dashboard-created policies, RLS toggled off, ledger entries missing for
  applied objects).
- **Fix**: `bun run db:verify` (`scripts/verify-database.mjs`) restores the production dump into a
  disposable local PostgreSQL 18 cluster (platform roles bootstrapped, pg_net/pg_cron/vault
  stubbed via `extension_control_path`), replays every pending migration, then runs all
  `supabase/tests/*.sql` fixtures. Constraint re-adds that legacy rows can violate are `NOT VALID`.
- **Prevention**: A migration is unverified until it has replayed over a real data snapshot.
  Re-adding a CHECK constraint in a migration must always be `NOT VALID` unless the same
  migration proves the data conforms.

## v1.9.0 — Live-DB drift can silently disable an entire security layer

- **Symptom**: The production dump had RLS DISABLED on `virtual_hubs`, `virtual_hub_members`,
  `notifications`, `notification_preferences` and `event_messages`, while migrations kept adding
  policies to them — every policy was inert and `anon` held full write grants. `profiles` carried
  a `USING (true)` SELECT policy (`profiles_select_authenticated`) that exposed every private
  column to any signed-in user, and `event_participants` had dashboard-created write policies
  bypassing the audited RPC state machine.
- **Root cause**: Hosted-dashboard edits (policy creation, RLS toggles) never landed in the
  migration chain, and no gate compared live state against migration intent.
- **Fix**: `20260823010000_production_rls_reassertion_and_profile_identity.sql` re-enables RLS,
  revokes anon writes, drops the blanket/bypass policies, and reconciles the contradictory
  double CHECK constraints (`profile_visibility`, `event_participants.status`,
  `events.participation_type` default `'open'` that its own allowlist rejected).
- **Prevention**: Never trust "the migration enabled RLS" — verify `relrowsecurity` and policy
  names on a restored dump. Dashboard changes must be back-ported into migrations immediately.

## v1.9.0 — RLS policies that cross-reference each other's tables recurse

- **Symptom**: `infinite recursion detected in policy for relation "virtual_hubs"` as soon as RLS
  was enabled on both hub tables: the hub policy consulted `virtual_hub_members` while the new
  member policy consulted `virtual_hubs`.
- **Fix**: The member policy checks host ownership through a `SECURITY DEFINER` helper
  (`is_virtual_hub_host`) that reads outside RLS, breaking the cycle.
- **Prevention**: When two RLS-enabled tables need each other for visibility decisions, at least
  one direction must go through a SECURITY DEFINER function with a fixed search_path.

## v1.9.0 — Windows pg_ctl start hangs a piped spawnSync forever

- **Symptom**: `scripts/verify-database.mjs` blocked indefinitely at cluster start.
- **Root cause**: On Windows the postmaster inherits `pg_ctl`'s stdout/stderr pipes; a piped
  `spawnSync` waits for those pipes to close, which never happens while the server runs.
- **Fix/Prevention**: Always launch `pg_ctl start` with `stdio: 'ignore'` (or shell redirection)
  and read startup diagnostics from the `-l` logfile instead of the pipes.

## v1.9.1 — GoTrue cannot read NULL from its token columns

- **Symptom**: Restored users' password login failed with 500 "Database error querying
  schema"; auth logs showed `Scan error on column "confirmation_token": converting NULL
  to string is unsupported`.
- **Root cause**: GoTrue always writes `''` into confirmation/recovery/email-change/phone-
  change/reauthentication token columns; a SQL-level user restore leaves them NULL and the
  Go scanner rejects that at login time — signup-created users are unaffected, so the
  defect only surfaces for migrated accounts.
- **Fix/Prevention**: Any auth.users data import must COALESCE all eight token columns to
  `''` (now step 0 of `scripts/restore/20_post_data_load.sql`).

## v1.9.1 — ON CONFLICT only arbitrates one constraint: dual signup triggers collide

- **Symptom**: INSERT INTO auth.users failed with `profiles_user_id_key` violation once
  both production signup triggers were reattached on the migrated schema.
- **Root cause**: trigger 1 inserts the full (id=user_id) profile row; trigger 2 upserts
  `ON CONFLICT (id)` — but the row now also collides on the user_id unique constraint,
  which is not the arbiter, so PostgreSQL raises instead of updating. On legacy production
  it worked only because trigger 1 left user_id NULL.
- **Fix/Prevention**: attach a single enriched signup trigger
  (`handle_new_user_profile`). Never pair triggers whose second insert can conflict on a
  non-arbiter unique index.

## v1.9.1 — A DB can bootstrap itself over pg_net when you have no direct connection

- **Pattern**: With only management-API SQL access (no DB password), the hosted database
  fetched all 93 migration files from the public repo via `net.http_get`, verified sizes,
  and executed them server-side (multi-statement `EXECUTE` works; strip standalone
  top-level `BEGIN;`/`COMMIT;` lines case-insensitively first, and check every fetched
  md5 against local `git show` blobs before executing anything).
- **Data path**: PII must not transit public URLs; a temporary double-keyed (random gate
  secret + anon key) SECURITY DEFINER exec RPC let curl stream 2.8MB of INSERT batches
  without exposing content, and was dropped immediately after. The PostgREST path enforces
  `safeupdate` (WHERE-less DELETE rejected) — run pre/post steps over the management API
  instead.

## v1.9.7 — A release is not closed until CI targets, secrets and local tooling agree

- **Symptom**: Local UI gates passed, but CI still targeted a deleted Supabase project, the
  repository tracked `.env`, the dependency audit stopped on high/critical advisories, and
  Playwright imported a package that had never existed in the manifest.
- **Root cause**: Visual delivery evidence was treated as release evidence while hosted CI
  configuration and inherited template tooling drifted independently. The tracked `.env`
  also masked the fact that Vitest had no explicit CI runtime configuration. A second
  Vercel Git integration existed with empty sensitive values and independently marked the
  same commit failed even while the canonical deployment was READY.
- **Fix**: Prove the Git index state directly, synchronize CI and GitHub Actions secrets to the
  current project, replace unavailable template tooling with the native runner, and require a
  zero-high dependency audit before publication.
- **Prevention**: A production release must prove the same target and lockfile from local gates,
  CI and hosting. Inspect every commit-status context, not only the canonical deployment;
  never infer deployability from a successful UI build alone.

## v1.9.8 — Consumer redesign must extend product depth, not conceal it

- **Symptom**: Competitor-inspired redesigns can look cleaner by silently removing advanced
  filters, lifecycle actions, role-aware entry points or disclosure states from the rendered UI.
- **Root cause**: Treating a screenshot as the product contract ignores the handlers, URL state,
  accessibility names and authorization rules that make an established application useful.
- **Fix**: Isolate presentation blocks from domain logic, keep every existing callback and route
  contract, and make new discovery surfaces hand off to the existing Events query model. Use safe
  provider images as progressive enhancement with local fallbacks instead of replacing data flows.
- **Prevention**: Every major visual round must run the full unit suite plus responsive route,
  overflow, mobile-menu and query-handoff E2E checks. Preserve the compressed asset budgets; if
  richer UI grows raw source, lazy-load below-fold code before considering any transfer increase.
