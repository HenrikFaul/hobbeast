# Hobbeast v0.9.0 – Release Notes

**Dátum:** 2026-03-29

---

## 🗺️ A. Geoapify / TomTom Places architektúra

### Megvalósítva
- **Normalizált place-search edge function** – Geoapify (primary) + TomTom (fallback/enrichment) provider orchestrator
- **Merge / dedup / ranking** – Haversine-alapú duplikáció-szűrés, confidence-alapú rendezés, max 8 eredmény
- **24 órás cache** – `places_cache` tábla, edge function szintű cache lookup és upsert
- **PlaceAutocomplete komponens** – Debounced keresés (400ms), dropdown UI, MapPin ikonok
- **Normalizált venue mentés** – Create és Edit event flow-ban `place_name`, `place_address`, `place_city`, `place_lat`, `place_lon`, `place_source`, `place_categories` mezők kitöltése
- **Venue blokk az Event Detail oldalon** – Helyszín részletek megjelenítése forrás badge-dzsel
- **Távolság-alapú szűrés** – Events listában `geocodePlace()` hívás a place-search edge function-ön keresztül (AWS Location lecserélve)
- **API kulcsok biztonságos kezelése** – `GEOAPIFY_API_KEY` és `TOMTOM_API_KEY` runtime secret-ként, edge function-ön keresztül érhetők el

### Tesztelt
- ✅ Edge function end-to-end: `Budapest Normafa` → 7 találat (2 Geoapify + 5 TomTom)
- ✅ Provider failover: ha Geoapify nem ad találatot, TomTom átveszi
- ✅ Cache: azonos keresés újrahívása cached eredményt ad

---

## 👥 B. InviteM-inspirált organizer funkciók

### Megvalósítva
- **Organizer Dashboard** (`/events/:id/organize`) – Teljes szervezői műszerfal
- **Résztvevő-menedzsment** – Keresés, szűrés státusz szerint, CSV export
- **Státuszkezelés állapotgéppel:**
  - `going` → `checked_in`, `cancelled`, `no_show`
  - `waitlist` → `going`, `cancelled`
  - `checked_in` → `no_show`
  - `cancelled` → `going`, `waitlist`
  - `no_show` → (végállapot)
- **Capacity / waitlist-aware join logika** – Telt eseménynél automatikus várólistára helyezés
- **Waitlist auto-promote** – Lemondás/no-show esetén a legrégebben várólistán lévő automatikusan `going` státuszba lép
- **Attendee drawer** – Szervezői jegyzet per résztvevő, audit timeline a drawer-ben
- **Organizer üzenetküldés** – Tárgy, szöveg, közönségszűrő (mindenki/going/waitlist), history persistence
- **Organizer audit napló** – Minden státuszváltás, jegyzet módosítás, üzenetküldés naplózva
- **Owner quick actions** – Event Detail oldalon „Szervezés" gomb a dashboard-ra

### Profil
- **Közelgő események blokk** – Profile oldal jobb sávjában jelenik meg az 5 legközelebbi joined/waitlist esemény

---

## 🔧 Technikai részletek

### Edge Functions
| Funkció | Leírás |
|---------|--------|
| `place-search` | Geoapify + TomTom orchestrator, cache, merge/rank |

### Adatbázis
| Tábla | Változás |
|-------|---------|
| `places_cache` | Cache tábla `cache_key` UNIQUE constraint-tel |
| `events` | `place_*` mezők (name, address, city, lat, lon, source, categories) |
| `event_participants` | `status`, `checked_in_at`, `organizer_note` mezők |
| `organizer_audit_log` | Teljes audit log tábla |
| `organizer_messages` | Üzenet persistence tábla |

### Biztonság
- Geoapify/TomTom API kulcsok kizárólag edge function-ből elérhetők (nem kliens oldalról)
- RLS policies a `places_cache`, `event_participants`, `organizer_audit_log`, `organizer_messages` táblákon

---

## 📋 Ismert limitációk / Következő lépések
- Organizer üzenetek jelenleg csak mentésre kerülnek (push/email küldés nincs)
- Reminder blokk statikus adatból dolgozik (scheduled reminder workflow nincs)
- Place kategória mapping (canonical taxonomy) alapszinten működik, finomhangolás szükséges
