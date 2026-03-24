Mapy.cz túratervező integráció - útvonaltervezés, szintprofil, eseményhez csatolás
- API key: MAPY_CZ_API_KEY secret-ben tárolva
- Edge function: supabase/functions/mapy-routing/index.ts (route + elevation proxy)
- Client lib: src/lib/mapyCz.ts (planRoute, getElevation, calculateAscentDescent)
- DB: hike_routes tábla (event_id FK, waypoints, geometry, elevation_profile, distance/duration/ascent/descent)
- UI: HikePlanner component + ElevationChart, CreateEventDialog-ba integrálva
- Route types: foot_hiking, foot_fast, bike_mountain, bike_road, car_fast, car_short
- Mapy.cz API base: https://api.mapy.cz/v1/
- Routing endpoint: /routing/route?start=lon,lat&end=lon,lat&routeType=...&format=geojson
- Elevation endpoint: POST /elevation with {coordinates: [{lon, lat}]}
