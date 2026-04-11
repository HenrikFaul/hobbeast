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

---

## [1.4.8] — 2026-04-08
### Added
- **Event Templates**: Users can save event configurations as templates and reuse them when creating new events. Templates store category, description, location, tags, and other settings.
- **Mass User Generator** (Admin): Admin tool to generate up to 1000 simulated users with realistic Hungarian/European names, geographical distribution across Hungary and neighboring countries, and random hobbies from the system taxonomy. Users are editable before creation. Backend batch insert via `mass-create-users` edge function.
- **Proximity-based venue sorting**: Venue suggestions now use Browser Geolocation API as Priority 1 source, with profile location as fallback.

### Fixed
- **Map Layer Z-index**: Fixed stacking context issue in the Create Event flow where the Leaflet map layer would obscure selected location data. Applied `isolation: isolate` and proper z-index containment.

### Improved
- **Distance filter**: Events distance filter now uses browser geolocation first, with profile location fallback. Removed the requirement of having a profile location set to enable the filter.
- **Admin panel**: Mass user generator merged into Felhasználók tab. Removed separate Generátor tab.

---

## [1.4.9] — 2026-04-09
### Added
- **Virtual Hubs (Admin)**: Invisible interest-based communities auto-generated from user hobbies and cities. Admin-only visibility in Felhasználók tab with refresh/recalculate function.
- **Favorite category event notifications**: Database trigger automatically notifies users when a new event is created matching their favorite activity categories (if notification preference enabled).

### Fixed
- **Invalid API key**: Fixed `supabase/config.toml` project_id pointing to wrong Supabase project, causing authentication failures across the entire app.

### Improved
- **Security**: Enabled leaked password protection (HIBP check) for signup.


## [1.5.2] — 2026-04-10
### Fixed
- **Mass user generator profile persistence**: Removed fragile `upsert(..., { onConflict })` dependency from `mass-create-users`; profile enrichment now uses safe select-then-update/insert flow, eliminating `no unique or exclusion constraint matching the ON CONFLICT specification` runtime errors.
- **Admin bulk selection stability**: Switched batch-selection UI state from `user_id`-based selection to `profile.id`-based selection so filtered multi-select count, partial deselect, and single-row deselect no longer collapse into shared state glitches.
- **Organizer mode owned event count**: Replaced `HEAD + count exact` query with safe `select('id')` length-based count to avoid admin-side `events ... 500` failures during mode detection.
- **Notification/admin hook resilience**: `has_role`, notifications, and notification preferences now fail softly with logging instead of destabilizing the whole admin page.
- **Common Admin startup noise**: Initial hidden-panel status polling no longer raises a user-facing generic edge-function toast on background failure.

### Added
- **Admin bulk user actions edge function**: Added `admin-bulk-user-actions` for preview/apply flows covering filtered selection, activate/deactivate, and delete operations.
- **Schema hardening migration**: Added v1.5.2 migration to ensure `profiles.user_origin`, `profiles.is_active`, and unique indexes required by admin/user flows remain present.

### Versioning artifacts
- `versioning/15041003_v1.5.2_business_request_summary.pdf`
- `versioning/15041003_v1.5.2_ai_dev_prompts.md`


## [1.5.4] — 2026-04-11
### Fixed
- **Admin bulk selection highlight mismatch**: Bulk preview and UI row selection were re-aligned so the preview response now carries `selectedProfileIds`, and the Felhasználók table highlights rows using the same profile-row identifier.
- **Admin bulk apply compatibility**: `admin-bulk-user-actions` now accepts both `profileIds` and `userIds`, resolves profiles safely, and handles profile-only records without collapsing the whole batch flow.
- **Real-user preview null-selection bug**: Preview no longer emits unusable null-only selections for profile rows; the response keeps `selectedProfileIds` canonical and surfaces `selectedUserIds` only as secondary data.
- **Catalog sync 42P10 errors**: Removed fragile `upsert(... onConflict: slug)` writes from hobby catalog sync in favor of select-then-update/insert logic, eliminating repeated `there is no unique or exclusion constraint matching the ON CONFLICT specification` failures.
- **Notification preferences persistence hardening**: Preference save no longer depends on `onConflict: user_id`; it now uses safe select-then-update/insert logic.
- **Edge function auth config coverage**: `sync-local-places` and `place-search` were added to `supabase/config.toml` with `verify_jwt = false`, so admin-side invoke calls can be redeployed consistently with the intended gateway behavior.
- **Dialog accessibility warnings**: Added missing dialog title/description coverage for command palette and admin dialogs to reduce recurring `aria-describedby` / Description warnings.

### Improved
- **Admin user bulk UX**: Selection count, per-row checkbox state, visible-all toggle, and preview feedback now all use the same row identity logic, reducing desync between backend preview and UI state.
- **Validation / delivery evidence**: The repo was revalidated with a successful production build after the patch set.

### Versioning artifacts
- `versioning/15041106_v1.5.4_business_request_summary.md`
- `versioning/15041106_v1.5.4_business_request_summary.pdf`
- `versioning/15041106_v1.5.4_ai_dev_prompts.md`

## [1.5.5] — 2026-04-11
### Fixed
- **Bulk preview / UI selection parity**: The bulk selection modal now treats the “no filters / all” case as a local full-selection of all loaded profiles, and preview mapping now resolves backend IDs against both `profiles.id` and `profiles.user_id` before applying checkbox state.
- **Bulk preview response hardening**: `admin-bulk-user-actions` now filters null IDs out of preview payloads and returns both canonical `selectedProfileIds` and secondary `selectedUserIds`, plus `selectedRows` for safer debugging.
- **Open-owned-event filter compatibility**: The admin bulk preview function now checks both `events.organizer_id` and `events.created_by`, reducing schema-drift issues in owner-based filtering.
- **Event creation required-field protection**: Create Event now visually marks required fields, highlights missing required inputs, and keeps the submit button disabled until the mandatory fields are filled.
- **Event datetime compatibility write path**: Event creation now writes `start_time` and `end_time` compatibility fields in addition to `event_date` / `event_time`, and guarantees non-null `place_categories` payloads.
- **Event edit consistency**: Event editing now follows the same required-field and `start_time` compatibility logic, reducing create/edit drift.
- **Database compatibility migration**: Added a migration that backfills `start_time`, normalizes `place_categories`, syncs `organizer_id`, and installs a compatibility trigger for future writes.

### Versioning artifacts
- `versioning/15041107_v1.5.5_business_request_summary.md`
- `versioning/15041107_v1.5.5_business_request_summary.pdf`
- `versioning/15041107_v1.5.5_ai_dev_prompts.md`
