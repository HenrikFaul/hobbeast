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
