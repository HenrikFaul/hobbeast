# CHANGELOG

Read this whole file before starting work. Do not remove previously delivered functionality from the codebase. New changes must always be appended with timestamp and context. Never replace the file contents with only the newest change.

## [Unreleased] - 2026-04-02 00:00 UTC

### Added
- Added conditional Mapy trip planner support to the event creation flow for distance-based activity profiles only, with explicit inline expansion through the **„Túratervező használata”** action instead of showing the planner immediately.
- Added normalized place-search architecture around **Geoapify + TomTom** with a dedicated `place-search` edge function, client helper layer, and normalized place persistence fields on events.
- Added `PlaceAutocomplete` integration into create and edit flows so normalized venue data can be saved into event records.
- Added normalized venue rendering on the event detail page from stored place fields.
- Added `ActivityAutocomplete` so free-text activity search can prefill the hobby hierarchy and feed venue-search context.
- Added organizer mode foundations: `OrganizerModeProvider`, navbar/profile entry points, `/organizer` route, attendee management, CSV export, organizer notes, audit history, messaging history, and analytics surface.
- Added organizer-related database support tables and policies: `participation_audits`, `event_messages`, `user_reminder_preferences`, plus owner update policy for `event_participants`.
- Added profile-side upcoming joined-events reminder block.
- Added local `venue_cache` architecture plus `seed-venues` edge function and a `VenueSuggestionsPanel` with list view, map view, detail modal, and venue selection back into event creation.

### Changed
- Changed trip planner behavior from always-visible to activity-relevant and CTA-triggered inline expansion.
- Changed place-search direction from older / mixed location lookup paths toward Geoapify + TomTom normalization through Supabase edge functions.
- Changed venue suggestion behavior after repeated no-result feedback: the flow now prefers local `venue_cache` lookup for activity-based suggestions instead of depending only on live provider suggestion calls.
- Changed organizer access flow by restoring previously removed organizer entry points in the profile/navbar area.
- Changed venue suggestion panel UX to support list/map switching, open-now filtering, and distance-based filtering/sorting when a bias coordinate is available.

### Fixed
- Fixed the earlier regression where organizer menu / organizer entry points disappeared from the profile area.
- Fixed the earlier UX issue where the trip planner surfaced too early instead of appearing only for relevant categories and only after explicit user action.
- Addressed the repeated “no venue suggestions at all” complaint by introducing a cache-backed suggestion path.

### Todo log
- [ ] **Nationwide venue ingestion is still not fully delivered from the requirement perspective.**
  - **Observed in code**: `seed-venues` contains a fixed city list and category batch strategy; this proves a seeded subset, but not “all Hungarian venues / POIs”.
  - **Recommended solution**:
    - expand ingestion from a small city list to a full Hungary coverage strategy (county seats + district centers + tile/grid sweep where needed),
    - paginate provider fetches until exhaustion,
    - persist provider paging / checkpoint state,
    - add dedupe rules by provider + external ID + geo/name fuzzy merge,
    - store `last_seeded_at`, `seed_scope`, and `provider_version` metadata for traceability.

- [ ] **Daily automatic venue cache refresh is not implemented clearly.**
  - **Observed in code**: `seed-venues` exists, but no scheduler / cron orchestration was found that runs it automatically every day.
  - **Recommended solution**:
    - add a scheduled Supabase Edge job / cron trigger,
    - split refresh into idempotent batches to avoid timeouts,
    - refresh changed / stale records first,
    - log run status into a dedicated sync table (`venue_sync_runs`) with counts, duration, and failures.

- [ ] **Place-search contract is inconsistent across client helpers, edge function, and cache tables.**
  - **Observed in code**:
    - `src/lib/placeSearch.ts` sends `action`, `bias`, `activityHint`, and reverse-geocode payloads using `lat` / `lon`,
    - `supabase/functions/place-search/index.ts` currently expects `query`, `category`, `latitude`, `longitude`, `radius_km`, `open_now`, `limit`, `lenient`,
    - one path caches into `places_cache`, while venue suggestions read from `venue_cache`.
  - **Recommended solution**:
    - merge `src/lib/placeSearch.ts` and `src/lib/place-search.ts` into one canonical client,
    - define one request/response contract for autocomplete, geocode, reverse-geocode, and activity-aware lookup,
    - either unify `places_cache` and `venue_cache` into one canonical table or document and implement a strict separation rule,
    - add shared TypeScript DTOs for the edge function body and response.

- [ ] **Activity-aware provider querying is not yet trustworthy end-to-end.**
  - **Observed in code**: the UI passes `activityHint`, but the current edge function does not clearly consume that field in the same contract.
  - **Recommended solution**:
    - convert activity hints into canonical provider query terms on the server side,
    - keep the mapping in one shared module,
    - add fallback expansion (activity → synonyms → category terms),
    - add debug telemetry showing which hint terms were actually used in ranking.

- [ ] **Waitlist auto-promote is not clearly implemented automatically.**
  - **Observed in code**: organizer dashboard has manual “Promote” actions, but the transition layer does not automatically move the next waitlisted user to `going` on cancel / no-show.
  - **Recommended solution**:
    - implement auto-promote in one transactional backend path (preferred: SQL function or edge function),
    - trigger it whenever a `going` attendee becomes `cancelled` or `no_show`,
    - promote the oldest eligible waitlist record,
    - write participation audit rows for both the cancellation and the promotion,
    - optionally create an in-app notification for the promoted participant.

- [ ] **Organizer messaging persists messages, but real delivery is still missing.**
  - **Observed in code**: organizer messages are stored in `event_messages`, but no actual push/email delivery pipeline was found.
  - **Recommended solution**:
    - create a dispatcher edge function that resolves the audience and sends notifications,
    - write in-app rows into the `notifications` table,
    - optionally add email delivery through a provider such as Resend / SMTP,
    - update `delivery_state` from `draft/scheduled` to real sent / failed states,
    - persist per-recipient delivery results for auditability.

- [ ] **Edit-event trip planner behavior is not aligned with the create-event requirement.**
  - **Observed in code**: `CreateEventDialog` gates the trip planner behind `profile.hasDistance` and an explicit CTA, but `EditEventDialog` still renders `MapyTripPlanner` directly.
  - **Recommended solution**:
    - apply the same `profile.hasDistance` + explicit CTA logic in edit mode,
    - keep the planner hidden for non-distance activities,
    - preserve previously saved trip data when the panel is collapsed.

- [ ] **Events list place-aware fallback is not clearly implemented.**
  - **Observed in code**: `EventDetail` renders normalized place fields, but the events list still appears to build location text mainly from legacy `location_*` fields.
  - **Recommended solution**:
    - create one shared `resolveEventLocationLabel()` helper,
    - prefer normalized place fields (`place_name`, `place_city`, `place_address`) when available,
    - fall back to legacy free-text / city fields only when normalized place data is missing.

- [ ] **Distance-based venue suggestions depend on already having bias coordinates.**
  - **Observed in code**: sorting / max-distance filtering in `VenueSuggestionsPanel` only becomes meaningful when `bias` exists.
  - **Recommended solution**:
    - derive bias from the selected city/address automatically,
    - if the user only selected a city, geocode the city before loading suggestions,
    - persist the last successful center to keep list and map ordering stable.

### Checklist
- [x] A túratervező csak releváns, distance-based kategóriáknál jelenik meg a create flow-ban
- [x] A túratervező külön CTA-val, inline módon nyílik le a create flow-ban
- [x] Van Geoapify/TomTom alapú `place-search` edge function
- [x] A create/edit flow tartalmaz normalizált helyszínválasztást
- [x] Az event detail oldalon van normalizált venue blokk
- [x] Van organizer mód és `/organizer` dashboard
- [x] A profile/navbar organizer belépési pontok vissza lettek téve
- [x] Van `venue_cache` tábla és `seed-venues` edge function
- [x] Van „Helyszínjavaslatok mutatása” panel
- [x] Van lista / térkép nézet váltás a venue javaslatoknál
- [x] Van nyitva-most szűrő a venue javaslatoknál
- [x] Van távolság alapú rendezés/szűrés, ha rendelkezésre áll bias koordináta
- [ ] Bizonyítottan teljes Magyarországos venue/POI letöltés megvalósult
- [ ] Bizonyítottan napi automatikus venue cache frissítés megvalósult
- [ ] Az activity-aware place search paraméterezés bizonyítottan végig össze van kötve kliens és edge function között
- [ ] Automatikus waitlist auto-promote bizonyítottan működik
- [ ] Tényleges push/email organizer message delivery megvalósult
- [ ] Az edit flow túratervező viselkedése igazodik a create flow requirementhez
- [ ] Az events lista bizonyítottan place-aware fallbacket használ

### Notes
- This changelog is **requirement-first**: where the DOCX included both user request and developer “done” claims, the requirement was treated as the stronger source.
- Items were marked done only where the repository content clearly supported the delivery at feature level.
- Items were moved into **Todo log** when the codebase showed either a clear gap, a partial implementation, or a contract inconsistency that makes the feature unreliable.
- This file is intended to replace the currently mixed / project-mismatched changelog with a Hobbeast-specific, requirement-based entry.
