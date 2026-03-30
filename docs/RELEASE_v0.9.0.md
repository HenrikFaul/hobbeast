# Hobbeast v0.9.0 – Release Notes

**Dátum:** 2026-03-30

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

## 👥 B. InviteM-inspirált organizer funkciók (v0.9.0 frissítés)

### Organizer mode architektúra
- **`useOrganizerMode` context** – Community / Organizer mód váltás, `localStorage` persistencia
- **`OrganizerModeProvider`** – App-szintű provider, automatikus `ownedEventCount` figyelés
- **Navbar integráció** – "Organizer" gomb a navbarban ha van saját esemény, mode badge
- **ProfileMenu integráció** – Mód-váltó menüpont, "Organizer felület" direkt link, eseményszám badge

### Organizer Dashboard (`/organizer`)
Teljes InviteM-inspirált szervezői műszerfal 5 fő tabbal:

#### 1. My Events tab
- Saját események grid nézete (emoji, cím, helyszín, dátum, kategória badge)
- Going / Várólista / Check-in számláló pill-ek
- "Megnyitás" (event detail) és "Kezelés" (attendees tab) gombok

#### 2. Attendees tab
- **Résztvevőkezelés** – Táblázatos nézet: név, város, állapot, csatlakozás dátuma, check-in, invite code
- **Szűrés** – Szöveges keresés (név/invite code) + státusz szűrő dropdown
- **CSV export** – Egy kattintással letölthető résztvevő lista
- **Státusz-váltás** – Promote, Check-in, Undo, Cancel gombok soronként
- **Résztvevő munkaterület** (Sheet drawer) – Állapot, quick actions, szervezői megjegyzés, audit timeline

#### 3. Check-in tab
- Név és invite code szerinti keresés
- Gyors check-in/undo/promote akciók
- Szűrt lista: csak going, checked_in, waitlist státuszú résztvevők

#### 4. Messages tab
- **Üzenetküldés** – Típus (emlékeztető, logisztikai, eseményfrissítés, lemondás, egyedi), célközönség szűrő, tárgy, szöveg, ütemezés
- **Message history** – Kronologikus üzenettörténet típus/audience/delivery_state badge-ekkel

#### 5. Analytics tab
- Join click/intent, Going, Waitlist, Attendance rate metrika kártyák
- Source attribution breakdown (forrás, views, joins, check-in)

### Szervezői service layer (`src/lib/organizer.ts`)
- `getOwnedEvents()` – Saját események lekérése participant statisztikákkal
- `getEventParticipants()` – Szűrhető résztvevő lista profilokkal
- `transitionParticipation()` – Státuszváltás + audit log írás
- `saveOrganizerNote()` – Szervezői megjegyzés mentés + audit
- `getParticipationAudit()` – Résztvevőnkénti audit előzmények
- `getEventMessages()` / `createEventMessage()` – Üzenet CRUD
- `getOrganizerAnalytics()` – Származtatott analytics metrikák
- `getUpcomingJoinedEvents()` – Profil emlékeztető blokk
- `buildAttendeeCsv()` – CSV export builder

### Adatbázis (új táblák)
- `participation_audits` – Résztvevői státuszváltás audit napló (RLS: event owner olvasás/írás)
- `event_messages` – Szervezői üzenetek persistencia (RLS: event owner olvasás/írás)
- `user_reminder_preferences` – Emlékeztető beállítások (RLS: saját felhasználó)
- `event_participants.status_updated_at` – Új mező a státusz változás időbélyegéhez

---

## 📋 C. Profil emlékeztetők

### Megvalósítva
- **UpcomingEventsReminder** komponens a Profile oldalon – Következő 5 közelgő esemény
- Megnyitás és Naptár gombok

---

## ⚠️ Ismert limitációk
- QR kamera alapú check-in scanner nincs (admin felületen történik)
- Üzenetkézbesítés csak persistencia szinten (nincs valós push/email delivery)
- Analytics baseline metrikák (nincs teljes interaction tracking pipeline)
- Permission mátrix ownership-centrikus (nincs multi-organizer role)

---

## 📁 Érintett fájlok

### Új fájlok
- `src/hooks/useOrganizerMode.tsx`
- `src/lib/organizer.ts`
- `src/pages/OrganizerDashboard.tsx` (teljes újraírás)
- `src/components/UpcomingEventsReminder.tsx`
- `src/components/PlaceAutocomplete.tsx`
- `src/lib/placeSearch.ts`
- `supabase/functions/place-search/index.ts`

### Módosított fájlok
- `src/App.tsx` – OrganizerModeProvider + `/organizer` route
- `src/components/Navbar.tsx` – Organizer gomb + mode badge
- `src/components/ProfileMenu.tsx` – Mód-váltó + organizer felület link
- `src/pages/Profile.tsx` – UpcomingEventsReminder integráció
- `src/pages/EventDetail.tsx` – Venue blokk, kapacitás/waitlist logika
- `src/pages/Events.tsx` – Place-search geocoding
- `src/components/CreateEventDialog.tsx` – PlaceAutocomplete integráció
- `src/components/EditEventDialog.tsx` – PlaceAutocomplete integráció
