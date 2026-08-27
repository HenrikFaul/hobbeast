# As-Is Event Capability Map

**Készült:** 2026-08-27 · **Slice A** (Ultimate Event Engine §20, §34)
**Módszer:** kódbázis- és élő adatbázis-bizonyíték. Nem feltételezés.

---

## Miért ez az első lépés

Az Ultimate Event Engine prompt §20-a kimondja: *„Ne indulj ki abból, hogy a
promptban megnevezett képesség hiányzik."* Ez a felmérés megmutatja, miért:

**A platform lényegesen többet tud, mint amennyit a terv feltételez.** A
javasolt „új" képességek nagy részének megvan az adatmodellje, sok esetben a
service rétege is. A valódi hiány máshol van, mint ahol a terv keresi.

Konkrét szám: **77 különböző RPC-t hív az alkalmazás**, és az eseményekhez
kapcsolódó táblákból **72** létezik.

---

## 1. BIZONYÍTOTTAN MŰKÖDIK

Közvetlen kód- és tesztbizonyítékkal.

| Képesség | Bizonyíték |
| --- | --- |
| Résztvevő-életciklus állapotgép | [`src/lib/eventLifecycle.ts`](../src/lib/eventLifecycle.ts) — 8 státusz, aktoronkénti jogosultság; 11 + **14 új** karakterizációs teszt |
| RSVP / join döntés | `decideEventJoin()` — idempotens, kapacitás, waitlist-fallback; minden ág tesztelt |
| Waitlist | `event_participants.status = 'waitlist'`, 6 lib-modul köti be (`eventOperations`, `organizer`, `notificationPlatform`, …) |
| Check-in | `check_in_audit` tábla + [`OrganizerOperationsPanel.tsx`](../src/components/organizer/OrganizerOperationsPanel.tsx) + dashboard contract tesztek |
| Esemény-sorozatok | `event_series`, `event_series_occurrences`, `event_series_audit_events` + [`src/lib/eventOperations.ts`](../src/lib/eventOperations.ts) |
| Sablonok | `event_templates` (16 oszlop) + [`src/features/organizer/eventTemplates.ts`](../src/features/organizer/eventTemplates.ts) |
| Organizer readiness | `organizer_readiness_assessments` + `buildOrganizerReadinessChecklist()` |
| Értesítések | `notifications` (32 oszlop), `notification_preferences` (21), `notification_delivery_attempts`, digest batch/item, sablonok |
| Külső esemény-begyűjtés | 361 forrás, `external_event_feed_*` (runs, items, raw payloads, evidence), cron dispatch |
| Circle / Hub | `social_circles`, `virtual_hubs` (32 oszlop), moderáció, reconciliation, aktivációs események |
| Audit | 9 külön audit tábla (admin, organizer, safety, entitlement, participation, feature flag, social graph, hub admin, event operation) |
| Analitika | `event_analytics` (28 oszlop) + breakdowns, `product_analytics_events` |

---

## 2. RÉSZBEN LÉTEZIK

Megvan az alap, de az élmény vagy a contract hiányos.

| Képesség | Mi van | Mi hiányzik |
| --- | --- | --- |
| Eseménykommunikáció | `event_messages` (16 oszlop), `event_message_recipients`, `src/lib/organizer.ts` | Nincs „Dynamic Info Channel" felület; a címzettválasztás és a kézbesítés-előnézet (§5.1, §28) nincs bekötve |
| Post-event | `post_event_feedback` (12 oszlop) | Nincs continuation engine (§8.3) — a visszajelzésből nem lesz következő alkalom |
| Esemény-verziózás | `event_operation_audits` (12 oszlop) rögzíti a műveleteket | Nincs optimistic concurrency és nincs change-impact preview (§24) — a Truth Ledger alapja megvan, a contract nem |
| AI javaslat | `ai_event_proposals` (55 oszlop!), jobs, runs, audit, candidate cache | Ez a **külső** esemény-generálásra épült, nem a szervezői Event Copilotra (§7.2) |

---

## 3. LÉTEZIK, DE NINCS BEKÖTVE

Adatmodell megvan, UI/útvonal nem használja. **Ez a legolcsóbb érték a
következő slice-okban.**

Élő sorszámok a produkciós adatbázisból (2026-08-27):

| Képesség | Oszlop | Sor | Bizonyíték |
| --- | --- | --- | --- |
| **Crew-szerepek** | 11 | **0** | `event_crew_roles` létezik — de a `src/`-ben **kizárólag** a generált `types.ts` említi. Nincs service, nincs UI, nincs teszt. §25 (Collaborative Production Workspace) alapja készen áll. |
| Esemény-találkozások | 11 | **0** | `event_encounters` — nincs bekötve; a §2.1 élménygráf egyik bemenete lehetne |
| Trip plans | 27 | **0** | `event_trip_plans` — nagy tábla, nincs UI-hivatkozás |
| Safety profilok | 11 | — | `event_safety_profiles` + `public_event_safety` nézet — a §14 Trust & Safety alapja |

Összehasonlításul, ami **tényleg használatban van**: `event_templates` → 4 sor.
A fenti négy tábla mind **üres**, vagyis nem „félig használt", hanem soha nem
kapott forgalmat. Bekötésük nem bont el semmit.

---

## 4. BIZONYTALAN

Runtime vagy külső környezet nélkül nem igazolható.

- **Értesítés-kézbesítés valós csatornákon** — a `notification_delivery_attempts`
  tábla létezik, de hogy ténylegesen kimegy-e e-mail/push, csak élesben dől el.
- **Cron-futások megbízhatósága** — `external_event_feed_cron_dispatches` létezik;
  a tényleges ütemezés a Supabase oldalán van, kód alapján nem bizonyítható.
- **248 forrás nulla eseménnyel** — a gyűjtő fut, de ezek a források általános
  módban dolgoznak JS-es oldalakon. Nem hiba, hanem hiányzó egyedi szabály.

---

## 5. VALÓDI GAP

Nincs meglévő, biztonságosan bővíthető megoldás.

| Terv | Miért gap |
| --- | --- |
| **B2B API / webhook / widget** (§12, §31) | Nincs publikus API-felület, nincs OpenAPI, nincs webhook-infrastruktúra, nincs idempotency-key kezelés. Zöldmezős. |
| **Participant Event Pass** (§27) | Nincs személyes, offline-biztos csomag. A `saved_events` és a `notifications` nem ez. |
| **Poll / Decision OS** (§6, §29) | **Nulla poll/vote/ballot tábla** az egész sémában (lekérdezéssel ellenőrizve). A `circle_suggestions` közelít, de nem szavazás. Zöldmezős. |
| **QR check-in 2.0** (§10.1) | `check_in_audit` van, QR-token életciklus nincs. |
| **Live Event Console** (§10.2, §30) | Nincs day-of, kivételközpontú nézet. |
| **Universal Event Intake** (§23) | Részben megvan: a bővítmény + `socialPostParser` ezt a rést tölti, de csak Facebookra. |

---

## Ajánlott sorrend — a bizonyíték alapján

A §34 slice-sorrendjét ez a felmérés **egy ponton módosítja**: a Slice E-ben
tervezett crew workspace adatmodellje **már létezik és üresen áll**, miközben a
Slice C Truth Ledgerhez új concurrency-contract kell. A legjobb érték/kockázat
arány:

1. **Slice A** *(ez a dokumentum + karakterizáció)* — ✅ kész
2. **Crew-szerepek bekötése** — meglévő tábla, nincs migráció, azonnali érték
3. **Slice C (Truth Ledger)** — `event_operation_audits`-re épül, additív
4. **Slice B (Blueprint)** — a meglévő create/edit contractra
5. **Slice D (Pass, day-of)** — új, de önálló
6. **Slice F (B2B)** — teljesen zöldmezős, utoljára

---

## Amit ez a dokumentum nem állít

Nem mondja meg, hogy a jelenlegi viselkedés **helyes**. Azt rögzíti, hogy mi a
jelenlegi viselkedés — hogy egy későbbi slice szándékos változtatása látható
diff legyen, ne néma regresszió.

Egy példa, amit a karakterizáció menet közben derített ki: a `cancelled` és a
`no_show` státusz **visszafordítható** — de kizárólag szervező által. Csak a
`completed` végleges. Ez termékdöntés, nem hiba; aki ezen változtat, tudja meg,
hogy változtat.
