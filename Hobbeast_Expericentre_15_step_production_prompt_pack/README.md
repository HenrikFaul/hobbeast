
# Hobbeast / Expericentre – 15 lépcsős production prompt pack

Alap: a feltöltött teljes repository, BASEREQUIREMENTS, versioning/changelog és governance állományok kódszintű áttekintése.

## Megállapított jelenlegi baseline
- package: `hobbeast` v1.7.6
- React 18 / Vite 5 / TypeScript / Tailwind / shadcn / TanStack Query
- Supabase/Postgres/Auth/Edge Functions
- 247 releváns `src`, Edge Function és migration fájl a vizsgált ZIP-ben
- meglévő: event discovery, native+external események, RSVP/waitlist, organizer dashboard, profile/preferences, notifications, virtual hubs, AI auto-event, admin, places/address pipeline
- korábbi governance szerint részben deferred: place-search mély refaktor, notification/community rebuild, organizer/admin mély refaktor, egyes SECURITY DEFINER remediationök, dependency major upgrade-ek

## Használat
A promptokat **sorrendben** futtasd. Egy prompt csak akkor tekinthető lezártnak, ha a saját acceptance gate-jei és a közös regressziós kapuk teljesülnek vagy dokumentált BLOCKED státuszt kapnak. Ne ugorj át P0/P1 blocker felett.

Minden lépés kötelező végrehajtási egysége: az eredeti `NN` prompt teljes tartalma + a `Hobbeast_Production_Prompt_Pack_Premium_Addendum.md` megfelelő `PROMPT NN` fejezete + a közös második bővítési kör. A második kör eredménye requirement coverage matrixban rögzítendő; dokumentált terv önmagában nem számít implementált funkciónak.

## Fájlok
01. **Production baseline, security és release foundation** — `01_production_baseline_security_and_release_foundation.md` — 20,014 karakter
02. **Domain architektúra és biztonságos refaktor** — `02_domain_architecture_and_safe_refactor.md` — 18,996 karakter
03. **Identity, onboarding, profil és privacy** — `03_identity_onboarding_profile_privacy.md` — 18,433 karakter
04. **Social graph: encounter, reconnection és social circle** — `04_social_graph_encounters_reconnections_circles.md` — 18,616 karakter
05. **Virtual Hubs 2.0 és latent community engine** — `05_virtual_hubs_2_and_latent_community_engine.md` — 18,027 karakter
06. **Event lifecycle és participant experience** — `06_event_lifecycle_and_participant_experience.md` — 18,190 karakter
07. **Organizer Suite production** — `07_organizer_suite_production.md` — 18,034 karakter
08. **Discovery, recommendation és matching** — `08_discovery_recommendation_and_matching.md` — 17,768 karakter
09. **External events, places és geo pipeline** — `09_external_events_places_geo_pipeline.md` — 17,699 karakter
10. **Notifications, communications és engagement automation** — `10_notifications_communications_engagement_automation.md` — 17,571 karakter
11. **AI demand aggregation és automatikus eseménygenerálás** — `11_ai_demand_aggregation_and_auto_events.md` — 17,793 karakter
12. **Admin control plane és operations** — `12_admin_control_plane_and_operations.md` — 17,626 karakter
13. **Trust, safety, moderation és adatvédelem** — `13_trust_safety_moderation_and_data_protection.md` — 17,757 karakter
14. **Observability, performance, accessibility és quality engineering** — `14_observability_performance_accessibility_quality.md` — 17,857 karakter
15. **Monetization, analytics, launch és production cutover** — `15_monetization_analytics_launch_and_production_cutover.md` — 18,854 karakter
