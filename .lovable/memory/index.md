# Memory: index.md
Updated: now

# Project Memory

## Core
- App uses Hungarian UI. Brand: "Hobbeast – Minden ami élmény".
- Typography: Space Grotesk (headings), DM Sans (body).
- Primary colors: Coral-orange (hsl 16 85% 58%) & Turquoise (hsl 172 60% 40%). Use `card-premium`.
- Target Supabase is `dsymdijzydaehntlmfzl`. Overridden via plugin in `vite.config.ts`.
- Edge functions MUST use `resolveInternalSupabaseUrl` and `getSupabaseAdmin` to prevent config errors.
- Admin queries MUST omit `outcome_status`, `registrations_count`, `cancellations_count`, `attended_count`, `average_rating`, `user_origin`, `is_active` (missing in target DB).
- Google OAuth fails in Lovable preview; test auth on published site only.
- **`supabase--read_query` ONLY hits Lovable Cloud (olzvugh) DB. For dsym DB use curl REST with `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` against `https://dsymdijzydaehntlmfzl.supabase.co/rest/v1/...`.**

## Memories
- [dsym DB Access](mem://architecture/dsym-db-access) — How to query dsym tables via REST (read_query won't work)
- [Event Management](mem://features/events/management) — UI rules for filters, lists, and external event badges
- [Location Search](mem://features/location/places) — Feature-group based providers and local catalog sync
- [Organizer Dashboard](mem://features/organizer/dashboard) — Structure and logic of the organizer dashboard tabs and triggers
- [Mapy.cz Integration](mem://features/hike-planner/mapy-cz) — Embedded hike planner for outdoor categories
- [External Events Sync](mem://features/sync/external-events) — 2-hour cron job sync for external providers
- [Notification System](mem://features/notifications/system) — Real-time triggers for favorite categories and invites
- [Navigation Layout](mem://ui/navigation-layout) — Settings placement on profile page
- [Profile Reminders](mem://features/profile/reminders) — Upcoming events section logic
- [Activity Autocomplete](mem://features/events/activity-search) — Free-text search that auto-fills hierarchy and location context
- [Project Overview](mem://project/overview) — High-level platform purpose and founders
- [Admin Constraints](mem://admin/management) — Critical schema missing fields and role checks
- [External Event Details](mem://features/events/external-details) — Loading external event details from sessionStorage
- [Responsive Layout](mem://style/responsive-layout) — Breakpoints, bottom-sheets, and grid rules
- [Design System](mem://style/design-system) — Glassmorphism, card-premium class, and visual rules
- [Event Templates](mem://features/events/templates) — Reusable configurations for organizers
- [Location Proximity](mem://features/location/proximity) — Geolocation API and profile fallback for distance sorting
- [Supabase Config](mem://project/configuration) — Dual config for Lovable and target DB
- [Virtual Hubs](mem://features/communities/virtual-hubs) — Invisible communities by hobby and city
- [Map Stacking](mem://ui/map-stacking) — isolation: isolate for Leaflet maps
- [Edge Functions Config](mem://architecture/edge-functions) — Required helper functions for Supabase initialization
- [Auth Limitations](mem://project/auth-preview-limitations) — Google OAuth iframe restrictions in preview
