# Pubapp — Canonical Changelog (consolidation draft)

## Purpose
This file is a **single future append target** for release history in `HenrikFaul/pubapp`.

It is based on the current repository state, with the intent that future development rounds should append here instead of maintaining fragmented release-history notes.

## Recommended rule from now on
- Keep **one** canonical changelog file only.
- Use **append-only** updates.
- Never replace prior release history.
- Keep versioning references inside each new release block.
- If temporary append-snippet files are created during delivery, merge them into the canonical changelog immediately and do not continue parallel changelog streams.

---

## [1.0.0] — 2026-03-28
### First release
- Guest side: venue finder, QR ordering, order tracking, pub quiz, games
- Admin panel: service, orders, menu, stock, statistics, configurator, help
- Supabase auth + RLS
- Realtime order handling
- PWA manifest

---

## [1.0.1] — 2026-03-29
### Fixes
- Auth redirect loop fixed
- RLS policy fixed for profile reads
- Role assignment fixed with auth.users join
- Email field sync fixed in user/profile flow

---

## [1.1.0] — 2026-03-30
### New features
- Site Admin panel introduced
- Menu / drink templates introduced
- Venue admin UI improvements
- Activity log and template related DB additions

### UI/UX
- Sidebar improvements
- Badge / card / button consistency
- Mobile-first responsive polish

---

## [1.3.6] — 2026-03-31
### Regression fixes
- Input focus-loss fixed
- Venue finder stabilized
- Select dropdown readability fixed
- Active check-in logic restored

### Restored previously working features
- Games menu restored
- Friends / shared lists moved under Profile
- Loyalty-point emphasis restored
- Personalized offers restored
- Admin Menu entry restored
- Digital menu access preserved

---

## [1.4.0] — 2026-04-01
### Hungary local-first venue catalog
- Local venue catalog introduced
- Local search RPC introduced
- Sync-state table introduced
- Batch sync edge function introduced
- Scheduled sync helper introduced

### Venue finder direction change
- Local-first search became the preferred direction
- Provider fallback no longer fully dictates result visibility

### Documentation/process
- Versioning pair required
- Changelog and lessons must be read before development
- Root-cause-first and lowest-regression-risk delivery enforced

---

## [1.4.2] — 2026-04-03
### Common Admin baseline
- Common Admin baseline introduced in Pubapp
- Integration / hosting inventory concept introduced
- App version / deployment snapshot concept introduced
- Changelog-based delivered-features snapshot introduced
- Local catalog operational status concept introduced

### Important note
This release must remain append-only. No previous changelog content may be removed.

---

## Canonical changelog operating model
From the current repo state, the recommended future process is:

1. Keep `changelog.md` as the only canonical changelog.
2. Merge any temporary append snippets into it immediately.
3. Append new release blocks only.
4. Reference the matching `versioning/<id>_...pdf` and `versioning/<id>_...md` pair in each new block.
5. Never introduce a second long-lived changelog stream.

---

## Recommended next step in the repo
After review, rename or replace the active root changelog with this canonical structure only if done together with:
- a commit preserving the full prior history
- explicit append-only governance wording
- no deletion of historic entries

---

## [1.4.4] — 2026-04-07
### Hungary local-first venue catalog stabilization
- `sync-local-places` edge function országos HU tile alapú lefedést kapott Geoapify + TomTom forrásokkal.
- A sync pipeline deduplikálást és részleges hibák visszajelzését adja (`partial` státusz + hiba minták).
- `place-search` local-first merge módra állt: lokális katalógus + Geoapify + TomTom közös rangsorolt lista.
- A lokális találatok pontozási prioritást kaptak, így kereséskor elsődlegesek maradnak.

### Scheduling és admin modellezés
- Új SQL helper migráció készült napi sync ütemezéshez (`schedule_daily_local_places_sync`, `unschedule_daily_local_places_sync`).
- A common admin integráció inventory machine-readable `category` mezőt használ, és ebből történik a stabil csoportosítás.

### Versioning artifacts
- `versioning/14040710_v1.4.4_business_request_summary.md`
- `versioning/14040710_v1.4.4_business_request_summary.pdf`
- `versioning/14040710_v1.4.4_ai_dev_prompts.md`
- `versioning/14040710_v1.4.4_final_coder_prompt.md`
