# Pubapp — Canonical codingLessonsLearnt (consolidation draft)

## Purpose
This file is a **single future append target** for development lessons in `HenrikFaul/pubapp`.

It consolidates the intent of:
- shared governance lessons
- repo-level lessons
- local repo append lessons

## Canonical rule from now on
- Keep **one** canonical `codingLessonsLearnt` file only.
- Append new lessons here.
- Do not maintain parallel lesson streams long-term.
- Never delete earlier lessons.
- Repo-specific notes may still be staged temporarily, but they must be merged back into this file quickly.

---

## Absolute top rule
**Never break already working functionality.**

---

## Mandatory development workflow before every task
1. Read `codingLessonsLearnt.md`
2. Read `changelog.md`
3. Read repo-local governance notes if they still exist
4. Gather needed knowledge from reliable primary sources
5. Detect the real root cause before coding
6. Compare at least two solution options when risk is non-trivial
7. Choose the lowest-regression-risk solution
8. Validate the result with a final checklist

---

## Mandatory end-of-task checklist
- [ ] Only the requested scope was changed
- [ ] No already working feature was broken
- [ ] Prior lesson patterns were not repeated
- [ ] Changelog was updated append-only
- [ ] Versioning PDF + MD pair was created when required
- [ ] Delivery contains only the files that truly need replacement
- [ ] Navigation / route entry points were rechecked
- [ ] Auth / role / route logic was smoke-tested
- [ ] Any new lesson was appended here

---

## Consolidated lesson catalogue

### 1. TypeScript / component-contract lessons
- Interface definitions must match DB reality exactly.
- Supabase FK relation outputs are often safest with explicit `any` casts in mapped UI code when generated types lag behind schema changes.
- New DB columns must be reflected in types or handled defensively.
- Component prop contracts must be checked before wiring hotfixes.
- Do not place remount-prone inner React components around input-heavy flows.

### 2. SQL / RLS / schema lessons
- RLS conditions must remain syntactically contained inside the correct `USING(...)` block.
- Cross-table joins inside RLS are dangerous and can create circular access failures.
- Email / profile synchronization must not be assumed; auth and profile rows can drift.
- Avoid brittle explicit FK-constraint names in Supabase query selects.
- Schema changes must be reflected in queries, types, and migrations together.

### 3. Auth / redirect / routing lessons
- Routing decisions should not be duplicated in multiple competing places.
- `getUser()` is the trustworthy auth check, not `getSession()` cache state.
- Auth-critical profile reads should avoid FK joins.
- Do not redirect-loop between middleware, landing page, customer page, and admin layout.
- If a role mismatch happens, prefer a clear screen over redirect chaos.

### 4. Build / framework / import lessons
- Next.js App Router needs correct file names like `page.tsx` and `layout.tsx`.
- Lucide icon imports must be from real existing icon names.
- CSS utility abstractions that look “logical” still need actual implementation.
- Mobile drawer/sidebar visibility must be checked at CSS level, not only JS state level.

### 5. UI / UX / navigation regression lessons
- A redesign is not done until all prior entry points remain discoverable.
- Games, profile value, menu access, and admin navigation must survive redesigns.
- Select option visibility must be checked in dark mode.
- Inline empty states are better than toast spam for auto-running search flows.
- Input focus behavior must be tested interactively, not only visually.

### 6. External provider / search / places lessons
- Critical venue search should not rely only on live third-party provider results.
- Large geographic datasets need local-first catalog + sync, not one-shot provider queries.
- Provider-specific query parameters must match the provider’s actual docs.
- Name search, nearby search, and category search should be separated when providers require different endpoints or semantics.
- Hard end-of-pipeline filters can accidentally zero out valid provider results.
- Unknown states such as `open_now = null` must not be filtered too aggressively.
- Coordinate order, radius validation, bbox strategy, and throttling must be explicit.
- Cross-provider category mapping must be validated, not improvised by string similarity.

### 7. Site Admin / Venue Admin separation lessons
- Creating a separate route is not enough if the old shell still links to or embeds the separated feature.
- If `siteadmin` becomes a standalone admin scope, it must not remain a first-class menu item inside the venue-admin shell.
- Platform-level Common Admin functions belong to the standalone Site Admin scope, not the venue-admin configurator.
- Old tabs, old entry points, and old shell hooks must all be removed when scope separation happens.
- Route roots must point to the correct dashboard root, not to a deeper subpage that makes the feature appear empty.

### 8. Delivery / patch / documentation lessons
- Patch file lists must include all changed src files, not just governance files.
- A missing src path in a delivery package can make the repo look “updated” while the real feature never lands.
- Governance/documentation updates without source-code paths are insufficient for functional rollout.
- Append-only changelog discipline is non-negotiable.
- Temporary append-snippet files should not become permanent parallel history sources.

---

## Canonical future append format
Use this block shape for every new lesson:

### [HIBA-XXX] Short title
- **Date**:
- **File**:
- **Error / symptom**:
- **Root cause**:
- **Fix**:
- **Prevention**:

---

## Consolidation note
This file is the recommended single append target for future rounds.

If the repository keeps:
- `.governance/codingLessonsLearnt.md`
- `codingLessonsLearnt.local.md`

then those should be treated as temporary feeder files only and merged back here quickly, not developed as independent long-term lesson histories.

### [HIBA-051] Local catalog csak külön provider módban futott, local-first üzleti elv sérült
- **Dátum**: 2026-04-07
- **Fájl**: `supabase/functions/place-search/index.ts`
- **Error / symptom**: A `geoapify_tomtom` provider módban a kereső nem használta a lokális katalógust, csak live provider hívásokat.
- **Root cause**: A lokális RPC (`search_local_places`) meghívása kizárólag `local_catalog` provider ágon történt.
- **Fix**: A place-search pipeline elején mindig lekérjük a lokális találatokat, majd merge-eljük a remote találatokkal; a lokális sorok extra score prioritást kaptak.
- **Prevention**: Local-first követelménynél a lokális adatforrás mindig fusson az alap keresési ágon, ne külön feature flag mögött.

### [HIBA-052] Városközpont-minta nem elég országos lefedéshez batch venue syncnél
- **Dátum**: 2026-04-07
- **Fájl**: `supabase/functions/sync-local-places/index.ts`
- **Error / symptom**: A lokális HU katalógus sok megyében/településen hiányos maradt.
- **Root cause**: A batch sync csak néhány nagyváros középpontjára kérdezett rá.
- **Fix**: Tile-alapú országos HU rács bejárás, deduplikáció és részleges-hiba állapotvisszajelzés került be.
- **Prevention**: Országos cél esetén ne városlista alapú mintavételt használj; legalább bounding-box + grid stratégia kell.


### [HIBA-053] Batch user generator profile upsert nem épülhet kizárólag ON CONFLICT-specifikációra
- **Dátum**: 2026-04-10
- **Fájl**: `supabase/functions/mass-create-users/index.ts`
- **Error / symptom**: A tömeges user generálás auth usert létrehozott, de a profile mentés `there is no unique or exclusion constraint matching the ON CONFLICT specification` hibával elhasalt.
- **Root cause**: A function vakon `upsert(..., { onConflict: 'user_id' / 'id' })` logikára támaszkodott, miközben a tényleges DB állapotban a konfliktuskezelés nem volt garantáltan szinkronban a várt constraint-tel.
- **Fix**: A profile mentés select-then-update/insert flowra váltott, így nem függ közvetlenül az `ON CONFLICT` feltételtől.
- **Prevention**: Admin/service-role tömeges írásnál ne kizárólag `upsert onConflict`-ra építs, ha a projektben több migration/patch ág miatt a constraint drift reális kockázat.

### [HIBA-054] Tömeges kijelölésnél UI selection state nem használhat kevert azonosítót
- **Dátum**: 2026-04-10
- **Fájl**: `src/components/admin/AdminUsers.tsx`, `supabase/functions/admin-bulk-user-actions/index.ts`
- **Error / symptom**: A szűrés után a UI több sort kijelöltnek mutatott, miközben a darabszám hibás volt, és egyetlen sor deselect művelete minden kijelölést lenullázott.
- **Root cause**: A preview, row checkbox és bulk action state keverte a `profile.id` és `user_id` azonosítókat.
- **Fix**: A frontend selection state és a preview válasz is `profile.id` alapú lett; a backend apply fázis külön oldja fel a kiválasztott profile-okhoz tartozó `user_id` értékeket.
- **Prevention**: Tömeges UI műveleteknél a kijelölő állapot mindig egyetlen, a megjelenített sorhoz tartozó kanonikus kulcsot használjon.

### [HIBA-055] Hidden admin panelek ne dobjanak startup toastot háttérintegrációs hibák miatt
- **Dátum**: 2026-04-10
- **Fájl**: `src/components/admin/CommonAdminPanel.tsx`
- **Error / symptom**: A felhasználói admin tab megnyitásakor generikus edge-function hiba toast jelent meg akkor is, amikor a problémás hívás valójában háttérben mountolt másik admin panelhez tartozott.
- **Root cause**: A hidden panel induláskor user-facing toasttal reagált a státuszlekérés hibájára.
- **Fix**: Az induló állapotlekérés silent módot kapott; háttérhiba logolódik, de nem zavarja a felhasználót általános hibatoasttal.
- **Prevention**: Rejtett vagy nem aktív admin panelek automatikus háttérhívásai ne dobjanak user-facing toastot inicializáció közben.


### [HIBA-056] Bulk preview response and table checkbox state must use the same row identity
- **Dátum**: 2026-04-11
- **Fájl**: `src/components/admin/AdminUsers.tsx`, `supabase/functions/admin-bulk-user-actions/index.ts`
- **Error / symptom**: A backend preview kiválasztott ID-ket adott vissza, de az UI nem jelölte ki a sorokat vagy hibás darabszámot mutatott.
- **Root cause**: A preview response és a frontend checkbox state más azonosítót használt (`selectedUserIds` vs. `selectedProfileIds` / `profile.id`).
- **Fix**: A preview kanonikus mezője ismét a `selectedProfileIds`, az UI ezt használja a megjelenített sorok kijelölésére, miközben a backend másodlagosan továbbra is tud `userId`-t kezelni az apply műveletekhez.
- **Prevention**: Tömeges kijelölésnél a preview response, a sor kulcsa, a checkbox checked állapota és a batch action payload ugyanarra a megjelenített rekordazonosítóra épüljön.

### [HIBA-057] Admin bulk delete/activate flow must tolerate profile-only rows without auth-linked user_id
- **Dátum**: 2026-04-11
- **Fájl**: `supabase/functions/admin-bulk-user-actions/index.ts`
- **Error / symptom**: Egyes rekordoknál a preview null user ID-ket adott, és az apply ág auth-függő törlés/aktiválás miatt instabillá vált.
- **Root cause**: A rendszer feltételezte, hogy minden profile rekordhoz kötelezően tartozik használható `user_id`.
- **Fix**: A backend külön kezeli a profile-szintű és auth-szintű feloldást; ha nincs `user_id`, a profile rekord akkor is kezelhető marad profile-ID alapon.
- **Prevention**: Admin batch logikában ne feltételezd, hogy minden historikus/importált profile rekord auth-userrel is össze van kötve.

### [HIBA-058] Catalog seed and preference save should not rely on unverified ON CONFLICT constraints
- **Dátum**: 2026-04-11
- **Fájl**: `src/components/admin/AdminCatalog.tsx`, `src/components/NotificationPreferencesCard.tsx`
- **Error / symptom**: `42P10` hibák jelentek meg `hobby_categories?on_conflict=slug` és hasonló mentéseknél.
- **Root cause**: A kliens olyan `onConflict` mezőkre támaszkodott, amelyekhez a tényleges adatbázisban nem volt garantált unique/exclusion constraint.
- **Fix**: A mentési utak select-then-update/insert mintára váltottak.
- **Prevention**: Ha a constraint drift reális, kliensoldalon ne építs vak `upsert(... onConflict ...)` logikára.

### [HIBA-059] Edge function verify_jwt config drift can keep admin invoke flows in permanent 401 state
- **Dátum**: 2026-04-11
- **Fájl**: `supabase/config.toml`
- **Error / symptom**: `sync-local-places` és `place-search` admin invoke hívások 401-et adtak, miközben az admin UI ezeket háttér- vagy tooling műveletként használta.
- **Root cause**: A function config nem tartalmazta következetesen a várt `verify_jwt = false` beállítást minden érintett functionre.
- **Fix**: A config kiterjesztve lett `sync-local-places` és `place-search` function blokkokkal is.
- **Prevention**: Ha admin tooling session nélküli vagy lazább gateway-auth modellt igényel, a config és a redeploy együtt legyen frissítve; a kódmódosítás önmagában nem elég.
