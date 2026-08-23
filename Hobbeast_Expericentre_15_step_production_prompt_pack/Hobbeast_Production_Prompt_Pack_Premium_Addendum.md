# Hobbeast / Expericentre – Premium Production Addendum

## Használati szabály

Ez a dokumentum kizárólag **additív kiegészítés** a meglévő 15 lépcsős production prompt packhez. Nem ír felül, nem rövidít, nem töröl és nem változtat meg semmilyen meglévő követelményt, acceptance criteria-t, migrációs elvet, business semanticát, UI-flow-t vagy korábbi funkciót.

Minden egyes eredeti prompt **végére**, a meglévő tartalom után illeszd be a megfelelő `PROMPT NN – PREMIUM ADDENDUM` fejezetet. A végrehajtó AI-nak ez kötelező, de konfliktus esetén a repository tényleges contractja, a governance és az eredeti prompt explicit nem-regressziós szabályai elsőbbséget élveznek.

A termék prémium iránya:

`interest -> discovery -> safe first attendance -> repeated encounter -> reconnection -> circle -> belonging -> trusted local ecosystem`

A Hobbeast ne a képernyőidőt, végtelen feedet vagy puszta regisztrációkat optimalizálja, hanem a biztonságos, ismétlődő, valós világban megvalósult közös aktivitást. Ez nem egészségügyi termék, nem diagnosztikai rendszer és nem dating-app. Ne inferáljon mentális állapotot, magányt vagy érzékeny személyes attribútumot.

## Közös prémium végrehajtási szabályok

Minden alábbi kiegészítés implementálása előtt és után kötelező:

1. A meglévő behavior, route, API, DB contract, RLS-szabály és UI-state változatlan működésének bizonyítása.
2. Minden új funkció feature flaggel, fokozatos rollouttal vagy egyértelmű visszakapcsolási móddal épüljön, ha kockázatos, hálózati, AI-alapú vagy kétoldalú marketplace-hatása van.
3. Minden új user-facing automatizmus legyen opt-in vagy megfelelő granularitású preference-szel szabályozható; legyen unsubscribe/quiet-hours/notification-frequency modell, ahol releváns.
4. Minden új társas felületnél legyen block, report, consent boundary, rate limit, abuse telemetry és moderation-útvonal.
5. Ne építs implicit személyazonosság-összekapcsolást, pontos helyzetmegosztást, privát kontaktadat-expozíciót vagy kockázatos kapcsolat-ajánlást megfelelő explicit hozzájárulás nélkül.
6. Minden AI-ajánlás legyen magyarázható legalább rövid, nem érzékeny indokkal, például: „közös érdeklődés”, „a kiválasztott környék”, „kezdőbarát esemény”. Ne mondjon olyat, hogy „magányosnak tűnsz” vagy hasonló.
7. Az új adatmodellnél minden enum státusz legyen dokumentált; minden állapotátmenet legyen érvényesítve; retry/cron/webhook feldolgozás legyen idempotens.
8. Új fizetős vagy monetizációs funkció csak entitlement- és audit-biztos szerveren oldali ellenőrzéssel működhet. A kliens kizárólag megjelenítési réteg, nem autoritás.
9. A siker metrikái outcome-központúak legyenek: first attendance, show-up, repeat attendance, recurring circle participation, host reliability, event quality és biztonsági egészség. A puszta engagement ne legyen north-star metric.
10. A végső deliveryben külön szerepeljen: feature flag neve/állapota, adatretenció, RLS/authorization, tesztbizonyíték, rollback és operational owner.

---

# PROMPT 01 – PREMIUM ADDENDUM
## Production baseline, security és release foundation

### Supply-chain és release-integrity

- Vezess be dependency provenance és lockfile-integrity ellenőrzést a kanonikus CI pipeline-ban. A lockfile változása legyen külön review-köteles; új dependency csak indoklással, licenc- és bundle-impact megjegyzéssel kerülhet be.
- Készíts SBOM-generálási lépést a release artifacthoz, valamint dependency-vulnerability triage folyamatot severity, exploitability, reachability és fix-verzió szerint.
- A production build artifact legyen azonosítható commit SHA-val, build timestamp-pel és release-verzióval; a kliensben ne legyen secret vagy érzékeny runtime config.
- Legyen staging környezet/paritáslista: auth redirect URL-ek, feature flags, provider callbackek, CSP, Sentry/telemetry DSN, cronok, storage bucket policy és email templateek külön ellenőrzendők.

### Biztonsági hardening

- Dokumentáld és auditáld a security headers baseline-t: CSP fokozatos bevezetési móddal/report-onlyval, HSTS csak megfelelő domain- és HTTPS-ellenőrzés után, clickjacking elleni védelem, MIME-sniffing tiltás, referrer policy és permissions policy.
- Készíts abuse-resilience mátrixot az auth, RSVP, waitlist, event creation, invite, report, upload, place search és AI endpointok számára: rate-limit kulcs, burst limit, abuse jel, válasz, logolás, false-positive kezelés.
- Vezess be admin break-glass szabályt: ki használhatja, mikor, milyen indokkal, meddig, milyen audit eventtel; ne legyen tartós, láthatatlan superuser megoldás.
- Készíts adatvisszaállítási és incidenskezelési runbookot: backup/restore ownership, RPO/RTO cél, migráció-hiba rollback, provider kiesés, credential exposure, adatvédelmi incidens, értesítési és bizonyítékgyűjtési lépések.

### Acceptance addendum

- A release nem tekinthető production-readynek, ha nincs dokumentált restore rehearsal vagy legalább explicit, időzített restore drill terv és tulajdonos.
- A release validation eredményhez csatold a dependency audit állapotát és a nyitott, elfogadott kockázatokat.

---

# PROMPT 02 – PREMIUM ADDENDUM
## Domain architektúra és biztonságos refaktor

### Domain contract és evolúció

- Hozz létre írásos domain ownership térképet: Identity, Event, Attendance, Social Graph, Circle/Hub, Organizer, Discovery, Notification, External Providers, Moderation, Billing/Entitlement, Admin/Ops. Minden domainhez jelöld a source-of-truth táblákat, public DTO-kat, mutation boundary-kat, webhook/cron függéseket és owner modulokat.
- Legyen explicit anti-corruption layer minden külső providerhez: provider DTO soha ne szivárogjon közvetlenül consumer UI-ba vagy core domainbe; normalizált adapter és provenance mezők szükségesek.
- Új shared type csak egyetlen kanonikus helyen legyen definiálva. Kerüld az azonos, de eltérő local interface-eket; ne kezdj tömeges átnevezésbe karakterizációs teszt nélkül.
- Minden írható domain commandhoz legyen idempotency strategy: idempotency key, dedupe constraint vagy determinisztikus command identifier.

### Refaktor-biztonság

- A nagy komponensek bontása előtt rögzítsd a route contractot, query-key viselkedést, loading/error/empty UI-t, analytics eventeket és keyboard fókuszfolyamot.
- Minden adatbázis evolúcióra alkalmazz expand-contract mintát: előbb additív schema, dual read/write ahol szükséges, backfill megfigyeléssel, majd csak későbbi, külön release-ben esetleges deprecation. Semmilyen meglévő oszlopot vagy API-t ne távolíts el e prompt pack alatt.
- Készíts Architecture Decision Recordot minden nagy döntésről: probléma, alternatívák, döntés, security/privacy következmény, rollback, későbbi felülvizsgálati pont.

### Acceptance addendum

- Domain boundary módosítás csak akkor fogadható el, ha legalább egy régi consumer flow és egy új flow integrációs tesztje lefedi a boundaryt.

---

# PROMPT 03 – PREMIUM ADDENDUM
## Identity, onboarding, profil és privacy

### Friction-aware onboarding

- Vezess be progresszív onboardingot: csak a first-value eléréséhez szükséges minimum kérdés legyen kötelező; érdeklődés, elérhetőség, social preference és profilgazdagítás később, indokolt pillanatban kérhető.
- Legyen „first event confidence” onboarding blokk: kezdőbarát eseménytípus, egyedül érkezés komfortszintje, preferált csoportméret, hozzáférhetőségi igények és kommunikációs preferenciák. Minden ilyen mező opcionális, világos visibility-szinttel és egyszerű törléssel.
- Ne használj érzékeny kategorizálást. A profilban a felhasználó maga határozza meg, mit oszt meg; default legyen a minimális publikus megjelenés.

### Account safety és privacy control

- Adj bejelentkezési session listát, session revoke funkciót, új eszköz értesítést és account activity audit trailt felhasználói szinten, ahol a jelenlegi Auth képességekkel kompatibilis.
- A public profile DTO legyen explicit allowlist: display name/alias, avatar, önkéntes bemutatkozás, kiválasztott érdeklődések és csak kifejezetten publikus mezők. Email, phone, exact address, internal flags, moderation metadata és teljes preference rekord kizárt.
- Implementálj adat-export és account deletion előkészítő flow-t: export scope, deletion grace period, anonymization/tombstone szabály, event/attendance/social record következmény, moderation/legal retention kivétel dokumentálása.
- Helyalapú preference-nél alapértelmezésben környék/város szint legyen, ne pontos koordináta. Pontos találkozási helyet csak esemény-contextben, jogosultság szerint és megfelelő időablakban fedj fel.

### Acceptance addendum

- Írj negatív RLS teszteket: user A ne olvassa user B privát profilmezőit, privacy preference-eit, session/metaadatait vagy nem publikus helyadatait.

---

# PROMPT 04 – PREMIUM ADDENDUM
## Social graph, encounter, reconnection és circles

### Safety-first reconnection

- A social graph alapegysége ne a korlátlan „friend request” legyen, hanem event-contextushoz kötött, kölcsönös, revokálható reconnection. A rendszer egyértelműen mutassa, miért ajánl valakit: közös esemény, közös hub vagy explicit közös aktivitás.
- Vezess be encounter confidence szinteket: `eligible`, `suggested`, `mutual`, `connected`, `blocked`, `expired`. A státuszokhoz explicit átmeneti szabály, RLS és audit kell.
- Ne fedj fel résztvevőlistát olyan felhasználónak, aki erre az adott eseményen nem jogosult. A „kivel találkozhatsz” információt privacy-safe, minimális profilnézet és opt-in szabály korlátozza.
- A reconnect prompt legyen késleltetett és kontextuális: esemény után csak akkor, ha a részvétel/attendance hitelesített vagy mindkét fél számára szabályosan elérhető; soha ne legyen nyomuló vagy ismétlődő spam.

### Circles mint tartós közösségi egység

- A Circle legyen kiscsoportos, ismétlődő aktivitásra optimalizált objektum: purpose, cadence, capacity, host/guardian, membership policy, venue preference, safety rules, lifecycle state és archived state.
- Legyen életciklus: draft -> recruiting -> active -> paused -> archived. A törlés helyett elsődlegesen archive/soft-close, hogy audit és régi hivatkozások megmaradjanak.
- Készíts Circle health dashboardot host/admin számára nem diagnosztikus metrikákkal: új tagok, visszatérési arány, no-show, eseményritmus, report trend, host load. Ne generálj személyre szóló pszichológiai profilt.

### Acceptance addendum

- Teszteld a block hatását végponttól végpontig: discovery, participant views, reconnection prompt, invite, message/notification és admin audit megfelelően viselkedjen.

---

# PROMPT 05 – PREMIUM ADDENDUM
## Virtual Hubs 2.0 és latent community engine

### Hub activation és lifecycle

- A virtual hub ne puszta címke legyen: legyen világos cél, földrajzi/tematikus fókusz, belépési policy, host ownership, tagsági állapot, eseményritmus és inaktivitási stratégia.
- Készíts hub activation funnel-t: discovery -> preview -> join request/instant join -> first activity -> first attendance -> repeat activity. Minden szakaszhoz legyen privacy-safe mérés és host láthatóság.
- Adj „new member welcome path” funkciót: bemutatkozó kártya, következő kezdőbarát alkalom, opcionális buddy/host contact, közösségi szabályok visszaigazolása. Ne legyen kötelező személyes adatmegosztás.
- Inaktív hub ne rombolja a discovery minőségét: jelöld az aktivitás frissességét, adj host reactivation eszközt, és archival policy-t. A régi URL-ek és korábbi eseményhivatkozások maradjanak elérhetők/értelmezhetők.

### Community quality

- Hub ajánlásnál preferáld a relevanciát, a szervező megbízhatóságát, az aktivitás frissességét és a kezdőbarát jelzést a puszta népszerűség felett.
- Biztosíts hub-level moderation queue-t, membership approval opciót és policy acknowledgmentot ott, ahol a host/admin konfiguráció ezt indokolja.

---

# PROMPT 06 – PREMIUM ADDENDUM
## Event lifecycle és participant experience

### First-attendance confidence layer

- Egészítsd ki az eseményoldalt strukturált „Mire számíthatsz?” blokkal: pontos találkozási instrukció, várható csoportméret, kezdőbarát jelzés, aktivitási intenzitás, szükséges felszerelés, hozzáférhetőségi információ, költség/mi tartozik bele, várható befejezés, host azonosítása és lemondási szabály. Az adat hiánya ne legyen kitalált; a hiányzó mezőket host taskként kezeld.
- Legyen opcionális „egyedül érkezem” és „első Hobbeast eseményem” jelzés, kizárólag a hostnak vagy a felhasználó által választott buddy flow-nak láthatóan.
- Készíts időalapú detail visibility szabályt a privát helyszínhez: publikus discoveryn csak megközelítő hely, RSVP után releváns pontosítás, a konfigurált eseményablakban teljes instrukció. Mindig legyen host override és safety exception.

### Attendance integrity

- A RSVP, waitlist, check-in, no-show, cancel és completion állapotmodellhez adj idempotens mutationt, auditot, host override indokot és user-facing visszaigazolást.
- QR/check-in vagy host-confirmed attendance esetén legyen offline/rossz hálózati hibatűrés, késleltetett szinkron és dupla scan elleni védelem.
- Hozz létre post-event minőségi visszajelzést: esemény megfelelt-e a leírásnak, biztonságosnak érezték-e, visszatérnének-e. Ez rövid, opcionális, nem klinikai és nem publikus személyértékelés.

### Acceptance addendum

- Teszteld az összes kritikus időállapotot: esemény előtt, kezdéskor, késésnél, lemondásnál, waitlist promotionnál, esemény után és archiválás után.

---

# PROMPT 07 – PREMIUM ADDENDUM
## Organizer Suite production

### Host operating system

- Hozz létre organizer readiness checklistet: profil/identity, leírás, safety policy, helyszíninformáció, kapacitás, cancellation, check-in, résztvevői kommunikáció és szükséges jogi/adózási információk. A checklist nem blokkolhat meglévő működő organizer flow-t utólag; fokozatos, feature-flagelt vagy új eseményekre vonatkozó enforcement kell.
- Adj esemény-sablonokat ismétlődő formátumokra: séta, túra, társasjáték, workshop, sport, tech meetup, gasztro. A sablon előtölthet, de nem írhat felül manuális értéket.
- Készíts host reliability nézetet: publish-to-attendance, cancellation, no-show, response time, repeat participants, report rate. Ez belső minőségfejlesztő eszköz legyen, ne automatikus büntető rendszer; score magyarázható, vitatható és admin felülvizsgálható.

### Operational scale

- Legyen co-host/crew szerepkör finom jogosultságokkal: check-in, attendee messaging, event edit, finance visibility, moderation. Least privilege és audit kötelező.
- Készíts incident handoff funkciót: host esemény közben gyorsan jelezhet safety/venue/attendance problémát; a rendszer rögzíti a minimális szükséges információt, severityt, owner-t és státuszt.
- Ismétlődő event-sorozatnál legyen exception/skip/reschedule modell; egy occurrence változása ne sértse a többi occurrence vagy meglévő RSVP integritását.

---

# PROMPT 08 – PREMIUM ADDENDUM
## Discovery, recommendation és matching

### Explainable, diversity-aware discovery

- A discovery ranking legyen többcélú és konfigurálható: relevancia, idő/közelség, kezdőbarát jelleg, megbízhatóság, frissesség, user preference, sokszínű felfedezés és marketplace health. Ne optimalizálj kizárólag CTR-re.
- Minden személyre szabott ajánláshoz legyen rövid explanation chip: „a kiválasztott érdeklődésed alapján”, „a közeledben”, „kezdőbarát”, „hasonló programokon vettél részt”. Az explanation ne fedjen fel más user adatot és ne tegyen érzékeny következtetést.
- Adj „miért látom ezt?” és „kevésbé ilyet kérek” kontrollt, amely preference feedbackként, nem büntetésként működik; legyen idempotens, visszavonható és privacy-safe.
- Készíts cold-start útvonalat vendég, új user és ritka érdeklődés esetére: curated kezdőcsomag, helyalapú alapajánlás, explicit választók, host quality és discovery diversity.

### Marketplace és fairness

- Legyen exposure monitoring: a ranking ne zárja ki tartósan a kisebb, új, de jó minőségű hostokat. Használj kontrollált explore/exploit stratégiát feature flaggel és offline értékeléssel.
- Ne jeleníts meg ember-ember matchinget dating-szerű swipe UI-val. A matching tevékenység, esemény vagy Circle köré épüljön.
- Modell- vagy szabályváltozás előtt replay/backtest, shadow mode vagy legalább összehasonlítható offline evaluation szükséges.

---

# PROMPT 09 – PREMIUM ADDENDUM
## External events, places és geo pipeline

### Data provenance és freshness

- Minden external event/place rekordhoz tárold és jelenítsd meg megfelelő belső kontextusban: provider, source URL/identifier, first seen, last verified/synced, freshness, normalization version, dedupe confidence és import state.
- Ne publikálj bizonytalan dedupe eredményt automatikusan canonical merge-ként. Használj review queue-t vagy reversible linkinget; preserve-eld az eredeti provider provenance-t.
- A provider outage, quota, malformed payload, geocode failure és stale feed számára legyen külön state és user-friendly fallback. Ne mutass hamis „naprakész” állapotot.
- Készíts geo precision policy-t: discoveryhez city/neighborhood/approximate radius; privát eseményeknél restricted exact location; analyticshez aggregált geohash/rács; exportnál explicit permission.

### Provider governance

- Providerenként legyen rate-limit, timeout, retry/backoff, circuit breaker, dead-letter/review queue, költségfigyelés és kill switch.
- Ellenőrizd felhasználási feltételek/licenc/kötelező attribution megfelelését; ne importálj vagy tárolj olyan adatot, amelyet a provider szerződése tilt.
- Legyen per-provider contract test fixture és schema drift riasztás. Éles provider adat nélkül reprodukálható mock/fixture tesztet használj.

---

# PROMPT 10 – PREMIUM ADDENDUM
## Notifications, communications és engagement automation

### Respectful communication system

- Alakíts ki central notification preference centert: csatorna (in-app/email/push), kategória, frequency cap, quiet hours, digest, marketing/transactional megkülönböztetés és könnyű opt-out. A kritikus safety/transactional értesítések kivételei legyenek dokumentáltak.
- Vezess be notification ledger/idempotency modellt: template version, recipient, event key, scheduled/send/delivered/failed/suppressed állapot, suppression reason, provider response és retry policy.
- Használj prioritási rendszert: safety/RSVP state change > time-sensitive event reminder > direct host communication > reconnection/community > discovery/marketing. A kevésbé fontos értesítés ne nyomja el a kritikusat.
- Implementálj send-time guardokat: quiet hours, event relevance expiry, user mute/block, duplicate detection, frequency cap, timezone, host cancellation és stale event state.

### Relationship-preserving automation

- A post-event follow-up elsődleges célja a következő releváns, alacsony nyomású lépés legyen: feedback, újra csatlakozás, következő alkalom vagy Circle. Ne használj manipulatív streaket, guilt copyt vagy mesterséges sürgetést.
- Minden automatikus üzenet preview-olható/admin auditálható templateből menjen, verziózva és localization-ready módon.
- Különítsd el az organizer-to-attendee, platform transactional, platform recommendation és admin broadcast csatornákat authorization, branding és unsubscribe szempontból.

---

# PROMPT 11 – PREMIUM ADDENDUM
## AI demand aggregation és automatikus eseménygenerálás

### AI governance és human control

- AI csak javasoljon, ne publikáljon automatikusan olyan eseményt, amelyhez nincs jogosult organizer/host, validált helyszín, kapacitás, safety policy és emberi felelősségvállalás.
- Vezess be draft -> review -> approved -> published workflow-t minden AI-generated eventhez. Jelöld a generált eredetet az admin/organizer felületen, de consumer oldalra csak akkor, ha ez termékileg/etikailag releváns.
- Tárold a modell/provider nevét, prompt template verzióját, input provenance-t, output schema verziót, moderation eredményt, human editet és publish decision auditot. Ne tárolj szükségtelen nyers személyes adatot promptként.
- AI inputban csak aggregált, minimális, k-anonimitási küszöböt elérő demand signal használható. Kis csoport vagy ritka érdeklődés esetén ne generálj olyan insightot, amely visszafejthető egyénekre.

### Quality és cost control

- Legyen structured output schema, server-side validation, policy filter, hallucination/unsafe content guard, language quality check és fallback sablon.
- AI által becsült demandet egyértelműen becslésként kezeld; ne kommunikáld tényként vagy garantált résztvevőszámként.
- Vezess be per-feature budgetet, rate limitet, cachinget, queue-t és kill switch-et. A provider hiba ne blokkolja a core event creation flow-t.
- Mérd külön az AI suggestion acceptance, organizer edit rate, publish rate, actual attendance és report/safety rate mutatókat. A siker ne a generált események száma legyen.

---

# PROMPT 12 – PREMIUM ADDENDUM
## Admin control plane és operations

### Admin mint kontrollált operációs rendszer

- Alakíts ki szerepkör- és capability-mátrixot: support, moderator, content ops, organizer ops, finance ops, security admin, super admin. Minden action minimum jogosultságot, indokot és auditot kérjen.
- Magas kockázatú admin műveleteknél használj two-step confirmationt, reason code-ot, optional four-eyes approvalt és visszavonási/rollback lehetőséget, ahol lehetséges.
- Legyen immutable audit log: actor, role snapshot, action, target type/id, before/after redacted diff, request/correlation ID, timestamp, reason, approval, outcome. PII/secretek ne kerüljenek az audit payloadba.
- Admin keresésnél PII-minimalizálás, result masking és access logging szükséges. Ne legyen korlátlan adatböngészés indok és audit nélkül.

### Operations cockpit

- Készíts egységes operációs inboxot: moderation, provider failures, failed notifications, stalled AI drafts, sync anomalies, high no-show events, payment/entitlement exceptions és data quality review.
- Minden queue itemhez legyen severity, SLA target, assigned owner, state, history, related entities és safe deep link.
- Adj feature flag control plane-t környezetenkénti állapottal, rollout percentage-szel, eligibility rule-lal, expiry date-tel, ownerrel és audit traillel. Flag ne legyen hosszú távú eltemetett technikai adósság: kötelező cleanup dátum.

---

# PROMPT 13 – PREMIUM ADDENDUM
## Trust, safety, moderation és adatvédelem

### Layered trust & safety

- Készíts egyértelmű policy-taxonomiát: harassment, hate, sexual misconduct, fraud/scam, unsafe event, impersonation, underage concern, privacy exposure, spam, prohibited commercial behavior, self-harm emergency routing. A rendszer ne próbáljon klinikai értékelést adni.
- A report flow kérjen minimális, releváns információt; adjon egyértelmű confirmationt, case ID-t ahol helyénvaló, és jelezze a sürgős veszély esetén azonnali helyi vészhelyzeti segítség szükségességét. Ne ígérj azonnali emberi válaszidőt, ha nincs biztosított coverage.
- Legyen case lifecycle: received -> triaged -> investigating -> actioned -> appealed -> closed, valamint evidence retention és access restriction. A reporter és reported user privacy-je külön védendő.
- Készíts graduated enforcement modellt: warning, education, feature restriction, temporary suspension, permanent ban, organizer restriction, content/event takedown. Minden actionhoz policy reason, evidence link, duration, appeal útvonal és audit kell.

### Event safety

- Hozz létre event safety minimumot: nyilvános találkozási pont, host accountability, kapacitás, résztvevői szabályok, venue suitability, emergency/incident contact process. Ne erőltesd ugyanezt minden event formátumra; legyen kockázatalapú konfiguráció.
- Privát lakás, éjszakai, fizikai kontaktussal járó vagy magasabb kockázatú programok esetén legyen külön policy/risk review, de ne diszkriminatív automatikus tiltás.
- A safety score, ha létezik, ne legyen opaque automatikus döntési egyedüli alapja; legyen magyarázat, human review és appeal.

### Privacy engineering

- Tarts data inventoryt: adatmező, cél, jogalap/termékcél, retention, hozzáférés, export/delete viselkedés, downstream processor. Minden új social/AI/analytics mező ehhez legyen hozzáadva.
- Vezess be retention jobokat és törlési bizonyítékot. Soft delete és hard delete különbsége legyen domainenként dokumentált.

---

# PROMPT 14 – PREMIUM ADDENDUM
## Observability, performance, accessibility és quality engineering

### SLO-k és product-critical monitoring

- Definiálj service-level objective-eket a kritikus utakra: landing/discovery betöltés, event detail, RSVP mutation, waitlist promotion, authentication, organizer publish, admin moderation, provider sync és notification dispatch. Jelöld a mérési forrást, célértéket, error budgetet és on-call/owner útvonalat.
- Vezess be correlation ID-t frontend -> Edge Function -> DB/audit -> provider hívás láncon. Logolj strukturáltan, PII redactionnel és samplinggel.
- Minden cron/queue/webhook számára legyen dead-letter vagy retry visibility, lag dashboard, failure alert és operátori replay folyamat.

### Performance és resilience

- Állíts performance budgetet route-onként: JS/CSS, image payload, LCP/INP/CLS, API latency, client error rate. A korábbi landing payload optimalizáció explicit non-regression budget maradjon.
- Implementálj image strategy-t: responsive srcset/modern format/lazy load, layout dimension, upload validation, CDN/cache policy, valamint alt-text szerkesztési lehetőség releváns képeknél.
- Készíts degraded-mode UX-et provider vagy hálózati hiba esetére: utolsó ismert, jelölt adatok; retry; offline-safe user action queue csak ott, ahol az idempotencia biztosított.

### Accessibility és test strategy

- Készíts keyboard-only user journey teszteket a fő flow-kra: auth, event search/filter, event RSVP/cancel, report/block, organizer publish, admin critical action.
- Automatizált a11y audit mellett végezz manuális screen reader spot-checket a dialogok, toastok, form errorok, live updates, mapok és dinamikus listák esetén.
- Vezess be contract testeket RLS/RPC/Edge Function/Provider adapter szinten; Playwright E2E smoke-ot a top revenue/trust/product flows-ra; visual regressiont a design-system kritikus komponenseire.

---

# PROMPT 15 – PREMIUM ADDENDUM
## Monetization, analytics, launch és production cutover

### Monetization that protects trust

- A monetizáció ne rontsa a core társas biztonságot vagy discovery fairness-t. Fizetős kiemelés mindig legyen egyértelműen jelölt, a relevancia alapú organikus találatokat ne rejtse el, és legyen admin policy a promoted content minőségére.
- Entitlement modell legyen szerveroldali, időben érvényesíthető és auditálható: plan, feature, limits, trial, grace period, refund/cancellation, tax/invoice state, provider event, reconciliation status.
- Ha van marketplace fee vagy ticketing, legyen világos consumer ártranszparencia, organizer payout/reconciliation, refund/cancellation policy és pénzügyi exception queue. Ne implementálj pénzmozgást provider-contract és jogi/adózási megfelelés tisztázása nélkül.
- A nem fizető felhasználó core community accessét ne szűkítsd úgy, hogy a safety vagy alapvető kapcsolódási esély sérüljön.

### Privacy-safe analytics

- Készíts event taxonomy-t névkonvencióval, ownership-pel, schema-val, PII tiltással, retentionnel és versioninggel. Ne küldj analyticsbe emailt, telefonszámot, pontos címet, teljes szabad szöveget vagy érzékeny profiladatot.
- A north-star outcome legyen például `verified_or_confirmed_real_world_participation` és a hozzá kapcsolódó repeat/community mutatók; külön kövesd a safety és quality guardrail metricákat.
- A/B teszt csak guardraillel: report rate, cancellation/no-show, notification opt-out, accessibility error, performance, new-user first-value, organizer quality. Kockázatos társas/safety változás nem futtatható felügyelet nélküli, széles experimentként.

### Launch és cutover excellence

- Készíts launch readiness scorecardot: product flows, RLS/security, data migration/backfill, provider quotas, support/macros, moderation coverage, analytics, observability, billing, legal/privacy copy, rollback, status communication.
- Vezess be canary/beta cohortot, feature flag rolloutot és explicit go/no-go döntési táblát. A full launch előtt legyen valós staging rehearsal legalább: signup, profile, discovery, RSVP, cancellation, waitlist, organizer publish, report, notification, admin action, rollback.
- Készíts Day 0 / Day 1 / Week 1 operációs tervet: dashboardok, riasztások, triage ownership, daily review, hotfix policy, incident communication, customer support escalation, feature flag rollback.
- A launch után tarts 2–4 héten belül structured post-launch review-t: várakozás vs adat, regressziók, support/safety jelek, performance, retention/funnel, tech debt, következő iteráció. A dokumentum append-only módon kerüljön a versioning és sprint status rendszerbe.

---

# KÖTELEZŐ MÁSODIK BŐVÍTÉSI KÖR – CROSS-PROMPT PREMIUM HARDENING

Ezt a fejezetet minden eredeti prompt legvégére is add hozzá, az adott prompt-specifikus addendum UTÁN. Célja, hogy az AI a scope elvégzése után még egy additív, prémium minőségi kört fusson, anélkül hogy újraírást vagy regressziót okozna.

## Második kör workflow

1. Olvasd vissza a teljes eredeti promptot és annak addendumát.
2. Készíts `Requirement Coverage Matrix` táblát: eredeti követelmény, addendum követelmény, implementált bizonyíték, teszt, kockázat, rollback, státusz.
3. Keresd meg azokat a hiányokat, amelyek nem funkcióhiányok, hanem production gapek: idempotencia, authorization, RLS, audit, feature flag, error state, empty state, loading state, mobile, accessibility, observability, rate limit, retry, data retention, rollback, documentation.
4. Csak additív, back-compatible módosítást hajts végre. Ne távolíts el kódot, táblát, route-ot, paramétert, UI elemet vagy régi üzleti logikát csak azért, mert van újabb megoldás.
5. Minden második körös változás előtt és után futtasd a releváns teszteket; ha nem futtatható, dokumentáld a blokkolót és ne állíts sikeres validációt.
6. Ellenőrizd, hogy az új funkció nem növeli aránytalanul a landing vagy kritikus route bundle-jét. Használj lazy loadingot vagy szerveroldali boundaryt, ahol indokolt.
7. Ellenőrizd, hogy a feature flag alapértelmezett állapota biztonságos, és a rollback nem igényel kóddeployt, ha a funkció szerver-/config-oldalról kikapcsolható.

## Közös prémium acceptance checklist

- [ ] Nincs meglévő route, API, schema vagy UI-flow eltávolítva.
- [ ] Új migration append-only, RLS-szel, index/constraint indoklással és rollback dokumentációval készült.
- [ ] Új mutation idempotens vagy double-submit ellen védett.
- [ ] Új user-to-user surface block/report/privacy boundaryt kapott.
- [ ] Új admin action least-privilege authorizationt és audit trailt kapott.
- [ ] Új külső hívás timeoutot, normalizált hibát, retry/backoffot, telemetryt és kill switch-et kapott.
- [ ] Minden új UI rendelkezik loading, empty, error, success, mobile, keyboard és alap screen-reader állapottal.
- [ ] A discovery/AI/analytics funkció nem inferál érzékeny személyes állapotot és nem tárol szükségtelen személyes adatot.
- [ ] A notificationok preference-, quiet-hour- és frequency-cap-kompatibilisek.
- [ ] A performance budgetet mérted vagy egyértelműen dokumentáltad, miért nem mérhető a környezetben.
- [ ] A release evidence valódi futtatásból származik; a BLOCKED státuszok pontosan dokumentáltak.
- [ ] CHANGELOG, sprint status, ADR/runbook és versioning output append-only módon frissült.

## Kimeneti formátum-kiegészítés

Az adott prompt meglévő végső delivery formátumán felül kötelezően add meg:

1. **Premium addendum coverage**: a jelen dokumentum adott promptjára vonatkozó minden pont státusza.
2. **Second-pass additions**: az első implementáció után talált és additív módon kezelt production gapek.
3. **Feature flag registry delta**: név, default, célzás, owner, expiry, rollback mód.
4. **Data governance delta**: új adatmező, cél, visibility, retention, export/delete viselkedés.
5. **Trust & safety delta**: block/report/moderation/appeal hatás.
6. **Operational readiness delta**: dashboard, alert, queue, runbook, owner.
7. **Non-regression evidence**: érintett régi flow-k, karakterizációs/E2E/contract tesztek, eredmény vagy konkrét blocker.

---

# Javasolt integrációs sorrend

1. Tartsd meg az eredeti 15 fájlt változatlan tartalommal.
2. A hozzájuk tartozó addendum fejezetet a fájl végére fűzd hozzá.
3. Minden fájl végén fűzd hozzá a `KÖTELEZŐ MÁSODIK BŐVÍTÉSI KÖR` fejezetet is.
4. A README-ben egészítsd ki a használatot azzal, hogy minden lépésnél az eredeti prompt + saját premium addendum + közös második kör együtt kötelező.
5. A végrehajtást továbbra is 01 -> 15 sorrendben végezd; P0/P1 security, data integrity, trust & safety vagy release blocker nem tolható át későbbi lépésbe írásos kivétel és owner nélkül.
