# Hobbeast / Expericentre – Ultimate Event Engine
## Additív, nem-regresszív ultra-prémium termék- és implementációs prompt

# 0. Kötelező első szabály: semmit nem vehetsz el

Ez a feladat nem greenfield újraírás, nem design reset és nem meglévő funkciók lecserélése. A Hobbeast/Expericentre meglévő event creation, event discovery, RSVP/waitlist, organizer dashboard, notifications, profile/preference, virtual hub, admin, külső provider és place/geodata képességei **load-bearing product capabilities**.

**SEMMILYEN MÁR MŰKÖDŐ FUNKCIÓT, ROUTE-OT, API-CONTRACTOT, ADATOT, MIGRÁCIÓT, RLS-SZABÁLYT, UI-ÁLLAPOTOT, BUSINESS SEMANTICÁT VAGY KORÁBBI KÖVETELMÉNYT NEM TÖRHETSZ EL, NEM TÖRÖLHETSZ ÉS NEM GYENGÍTHETSZ.**

Ez a dokumentum a felhasználó által megadott Ultimate Event Engine tervet kizárólag **kibővíti**. Az eredeti terv minden pontja kötelező marad. Konfliktus esetén:

1. a tényleges kódbázis és annak dokumentált, működő contractja;
2. a repository governance, security és release szabályai;
3. az eredeti requirementek;
4. ez az additív bővítés

sorrendben érvényesek.

Minden implementáció előtt kötelező:

- impact map: érintett route, komponens, hook, query, tábla, RPC, trigger, Edge Function, cron, provider, webhook, RLS policy, analytics event és teszt;
- jelenlegi működés karakterizációs tesztje vagy bizonyítéka;
- append-only database migration;
- explicit RLS és authorization;
- idempotens mutation stratégia;
- feature flag, ha új AI, automatikus kommunikáció, ranking, pénzügyi, integrációs vagy magas kockázatú social funkció épül;
- loading, empty, error, success, offline/degraded állapot;
- mobile, desktop, keyboard és alap screen-reader útvonal;
- rollback terv és megfigyelhetőség.

# 1. Északi csillag: a Hobbeast ne eseménylistát adjon, hanem megvalósult élményt

A termék core loopja:

`szándék -> releváns lehetőség -> biztonságos első belépés -> egyszerű RSVP -> biztos megjelenés -> jó helyszíni élmény -> ismétlődés -> közösség`

A north-star metric ne a screen time, feed impression, puszta RSVP vagy letöltés legyen, hanem:

\[
\text{Verified / confirmed meaningful real-world participations}
\]

Ezt egészítsd ki minőségi guardrailekkel:

- first-event completion rate;
- RSVP-to-show-up conversion;
- waitlist-to-attendance conversion;
- 30/60/90 napos ismételt részvétel;
- recurring event/circle participation;
- organizer reliability;
- event quality és „megfelelt a leírásnak” arány;
- report/block/safety incidence rate;
- notification opt-out és spam jellegű negatív visszajelzések;
- participant és organizer task completion time;
- admin support burden / resolution time;
- B2B API integration time-to-first-successful-event.

Ne készíts mentális egészségre, magányra vagy érzékeny személyes tulajdonságokra vonatkozó inferenciát. A termék nem diagnosztizál és nem címkéz felhasználókat.

# 2. Résztvevői élmény: a zajmentes, személyes Event Copilot

## 2.1. Multi-dimenziós élménygráf

Az eredeti preference-alapú discovery mellé additív módon építs `Experience Preference Graph` réteget. Ne írj felül régi preferenciát, hanem normalizált, visszavonható és felhasználó által szerkeszthető jelzésekkel egészítsd ki.

A relevancia lehetséges dimenziói:

- érdeklődés és alkategória;
- aktivitás intenzitása/terhelése;
- kezdőbarát, haladó vagy vegyes szint;
- egyedül érkezés komfortja;
- ideális csoportméret és hangulat;
- időablak, napok, spontán vs előre tervezett;
- távolság és utazási idő;
- hozzáférhetőségi jelzések;
- költségkeret és ingyenes/fizetős preferencia;
- nyelv;
- beltéri/kültéri, időjárásérzékenység;
- társas forma: 1:1 nem támogatott defaultként; kis csoport, nyílt közösségi esemény, workshop, szervezett Circle;
- korábbi explicit mentés, RSVP, részvétel, elrejtés és szándékjelzés.

Kizárólag explicit vagy privacy-safe viselkedési jeleket használj. A felhasználó bármikor lássa, szerkeszthesse, szüneteltesse vagy törölhesse a preferenciáit.

## 2.2. Explainable discovery, nem fekete doboz

Minden kiemelt személyre szabott ajánlás kapjon rövid indok-chipet:

- „A kiválasztott érdeklődésed alapján”
- „Közel van hozzád”
- „Kezdőbarát”
- „Illeszkedik a szabad idősávodhoz”
- „Korábban mentett hasonló programjaid alapján”
- „A következő alkalom egy aktív körből”

Legyen `Miért látom ezt?`, `Több ilyet`, `Kevesebb ilyet`, `Nem érdekel` és `Ne ajánld ezt a szervezőt/kategóriát` kontroll. Ezek ne csendes, visszafordíthatatlan büntetések legyenek; legyenek idempotensek, auditálhatók és szerkeszthetők.

A ranking ne kizárólag CTR-t optimalizáljon. Tegyen súlyt a relevanciára, időpontra, távolságra, kezdőbarát információ teljességére, szervezői megbízhatóságra, frissességre, minőségre, sokszínű felfedezésre és marketplace fairnessre. Az új, de jó minőségű szervezőket ne zárja ki végleg a rendszer.

## 2.3. Smart-Ping 2.0: releváns, elmagyarázható, tiszteletteljes

Az eredeti Smart-Ping gondolatot tartsd meg, de ne használj nem magyarázható „90% eséllyel igent mondana” ígéretet vagy pontszámot user-facing kommunikációban. Helyette `high-confidence relevance` belső küszöb és emberi nyelvű indok legyen.

Notification decision engine szabályai:

- csak explicit notification preference és engedélyezett csatorna alapján;
- kategória, távolság, időpont, elérhetőség és relevancia szerint;
- timezone-aware;
- quiet hours és frequency cap;
- duplikáció- és stale-event guard;
- ha a felhasználó már RSVP-zett, mentette, elrejtette vagy letiltotta a szervezőt, az állapotot tisztelje;
- kritikus eseményváltozás elsőbbséget élvez a marketing/discovery pinggel szemben;
- weather/traffic információ csak ellenőrzött providerből, timestamp-pel és graceful degradationnel;
- egyértelmű `Miért kaptam ezt?` és gyors beállítási lehetőség;
- legyen digest opció, például „heti programjaim” vagy „péntek esti ötletek”, a folyamatos push helyett.

A `Smart-Ping` ne szorongást, FOMO-t vagy bűntudatot generáló szöveget használjon. Nincs streak, nincs „már megint kihagysz valamit”, nincs mesterséges scarcity, kivéve ha a kapacitás tényleg korlátozott és ez transzparensen jelezhető.

## 2.4. Intent-first keresés

A kereső ne csak kulcsszavakat kezeljen. Additív `intent` belépők:

- „Ma este valami nyugodt”
- „Egyedül mennék, kezdőbarát legyen”
- „3–6 emberes társasjáték”
- „Kutyával jönnék”
- „Budapest környékén túráznék vasárnap”
- „90 perces AI/builders meetup”
- „Esős időre beltéri program”

Az intent parser lehet szabályalapú + opcionális AI-segített, de mindig mutassa meg és szerkeszthető filterekké alakítsa az értelmezést. Hibás értelmezés esetén ne indítson visszafordíthatatlan actiont.

# 3. Eseményoldal: az „első alkalommal is tudom, mire számítsak” standard

## 3.1. Event Confidence Card

Minden event detail oldalon additív, strukturált `Mire számíthatsz?` kártya legyen. A szervező nem kitalált adatot ad, hanem szerkeszthető mezőket tölt ki:

- kinek ajánlott / szükséges előképzettség;
- kezdőbarát jelzés;
- tényleges várható csoportméret vagy biztonságos tartomány;
- intenzitás, időtartam és tempó;
- szükséges felszerelés/öltözet;
- akadálymentesség és releváns korlátok;
- költség és az árban foglalt elemek;
- találkozási pont és érkezési instrukció;
- mikor jelenik meg a pontos helyszín, ha privát esemény;
- host/crew azonosítása és kapcsolatfelvétel szabálya;
- nyelv;
- lemondás, várólista és időjárási terv;
- mire számíthatsz az első 10 percben;
- az esemény befejezése és hazajutási/utolsó közlekedési megjegyzés, ahol releváns.

A hiányzó adatot ne generáld AI-val tényként. Ha egy fontos mező nincs meg, jelenjen meg szervezői readiness feladatként és user-facing módon őszintén: „A szervező még nem adott meg információt.”

## 3.2. Egyedül érkezés és első alkalom

Adj opcionális jelzéseket:

- `Első Hobbeast eseményem`
- `Egyedül érkezem`
- `Szívesen csatlakoznék érkezési buddyhoz`
- `Kérek rövid host köszöntést`

Ezek alapértelmezésben ne legyenek publikusak. A felhasználó határozza meg, hogy csak host, kijelölt crew vagy consentelt buddy-flow láthatja-e. Bármikor visszavonhatók.

A szervező számára legyen `First-timer support queue`: rövid, nem tolakodó checklist, például érkezési információ ellenőrzése, welcome message, név szerint fogadás, és opcionális buddy csoport. Ne legyen kötelező személyes kapcsolatfelvétel a résztvevő akarata nélkül.

## 3.3. Esemény előtti „Mission Control” résztvevői nézet

A résztvevő az esemény előtt kapjon egy idővonalat:

1. most: RSVP / kérdés / felkészülés;
2. T−24 óra: helyszín, felszerelés, időjárás, lemondási lehetőség;
3. T−2 óra: indulási emlékeztető és érkezési pont;
4. helyszínen: check-in és host/crew információ;
5. utána: feedback, fotó/összefoglaló csak megfelelő hozzájárulással, következő releváns lehetőség.

Minden lépés csatorna- és preference-kontroll alatt legyen; nem kérünk mindenkitől azonos értesítési mennyiséget.

# 4. One-Tap RSVP, de production-grade állapotgéppel

Az eredeti one-tap részvételi élmény kötelező. Mögötte legyen robusztus állapotmodell:

`not_going -> interested -> RSVP_pending -> confirmed -> waitlisted -> promoted -> cancelled -> checked_in -> attended -> no_show -> completed`

A tényleges meglévő állapotokat ne nevezd át vagy töröld; adapterrel/back-compatible mappinggel egészítsd ki. Minden átmenethez legyen:

- szerveroldali authorization;
- kapacitás és időállapot validáció;
- idempotency key vagy egyedi constraint;
- optimista UI csak rollbackolható formában;
- double-submit védelem;
- audit trail;
- felhasználó számára világos siker/hiba üzenet;
- query invalidation és offline/degraded stratégia;
- analytics event, PII nélkül.

A megerősített RSVP után ne kényszeríts azonnal chatre. A felhasználó döntse el, hogy csak infócsatornát követ, kérdést tesz fel, vagy belép egy megfelelően moderált eseménybeszélgetésbe.

# 5. Kommunikáció: az eseménynek legyen egyetlen igazságforrása

## 5.1. Dynamic Info Channel

Az eredeti dinamikus infócsatorna maradjon meg, és bővüljön `Event Operations Feed` modellé:

- pinned `official update`;
- változáskategória: helyszín, időpont, időjárás, felszerelés, kapacitás, biztonság, lemondás, általános;
- célzás: minden RSVP, csak confirmed, csak waitlist, csak checked-in, csak crew;
- sürgősségi prioritás;
- read receipt aggregált formában;
- edit history és `last updated` timestamp;
- linkelt event field change; például a helyszín szerkesztése automatikusan a változásösszefoglalóra mutat;
- user acknowledgment csak valódi, kritikus változásnál;
- visszavonás/correction történet, ne legyen titokban átírva a fontos információ;
- moderáció, rate limit és abuse guard.

Ne küldj „szűrés nélkül” minden változást minden csatornán. Legyen prioritás és preference-aware delivery: kritikus, időérzékeny változás mehet in-app + push/email fallback szabály szerint; alacsony prioritású update maradjon feedben/digestben.

## 5.2. Eseménykommunikációs módok

Különítsd el:

- **Official updates:** csak organizer/crew, auditált, elsődleges információ.
- **Q&A:** résztvevő kérdezhet, host/crew válaszol; kereshető és moderálható.
- **Participant chat:** opcionális, jól látható szabályokkal, block/reporttal, üzenetlimittel és host moderációval.
- **Arrival buddy thread:** opcionális, időben korlátozott, csak explicit consenttel.
- **Post-event reconnection:** opt-in, tevékenységhez kötött, nem dating-szerű, block szabályt teljesen tisztelő flow.

A rendszerben ne legyen olyan helyzet, ahol privát email vagy telefonszám azért válik láthatóvá, mert valaki RSVP-zett.

# 6. Szavazások és közös döntések: gyors, átlátható, nem manipulálható

## 6.1. Poll Composer

Az eredeti beépített szavazás funkciót bővítsd:

- dátum/idő, helyszín, aktivitástípus, árkategória, útvonal, menü/igény, ismétlődési ritmus és szabad szöveges opció;
- single-choice, multiple-choice, ranked-choice és availability grid;
- deadline, quorum, capacity, opcionális jogosult voter csoport;
- publikus vagy anonim eredmény beállítás;
- észrevétel/indok megadása opcionálisan;
- szerkesztési és lezárási audit;
- host override, de kötelező indoklással, ha az automatikus győztes opciótól eltér;
- időzóna- és naptárkompatibilis dátumkezelés;
- eredmény után one-tap `Create Event From Winning Option`.

## 6.2. Automatikus győztes rögzítés – csak feltételekkel

Az eredeti automatikus rögzítés marad, de csak előre meghatározott szabály mellett: világos lezárási idő, tie-breaker, minimum részvétel, admin/host override és értesítés. Ha nincs quorum vagy döntetlen van, a rendszer ne hamis bizonyossággal publikáljon; kínáljon fel gyors runoff/host döntést.

## 6.3. Poll-to-event varázslat

A szavazás lezárása után a winning option automatikusan előtöltse az esemény wizardot, de a szervező a publikálás előtt mindig validáljon:

- helyszín elérhetősége;
- kapacitás;
- időpont;
- költség;
- lemondási politika;
- safety/readiness mezők;
- szervezői felelősség.

# 7. 1 perces eseménylétrehozás: a „progressive disclosure” csodája

## 7.1. Kétsebességes Event Composer

A szervezőnek két belépési mód:

### Quick Create

Egy természetes nyelvű mondatból vagy minimális mezőből indul:

> „Holnapután 17-kor laza, kb. 10 km-es Normafa-túra kutyásoknak, kezdők is jöhetnek.”

A rendszer előtölti a javasolt adatokat, **de nem állít hamis tényeket**. Javaslatként külön jelölje:

- cím;
- rövid és részletes leírás;
- kategória/tagek;
- dátum/idő/időtartam;
- helyszínjelölt;
- csoportméret és kapaszkodó kapacitás;
- „mire számíthatsz” mezők;
- felszerelés;
- kültéri időjárás-terv;
- célközönség és kezdőbarát státusz;
- reminder terv;
- image javaslat és alt text draft.

### Pro Create

Haladó szervezőknek teljes struktúrált composer: event series, tickets, capacity, crew, check-in, automations, integrations, privacy, safety, custom fields, API/webhook bindingek és brand settings.

A Quick Create ne rejtsen el kritikus biztonsági/kapacitási döntést. A rendszer progresszív disclosure-ben kérdezzen rá arra, ami az adott eseménytípushoz szükséges.

## 7.2. AI Event Copilot: javasol, nem dönt helyetted

Az AI működése:

- structured output schema;
- minden mezőhöz confidence/provenance flag belső használatra;
- tény és javaslat megkülönböztetése;
- szervezői edit és preview kötelező publikálás előtt;
- policy, safety és content validation;
- nem generál hallucinált helyszínnyitvatartást, árakat, útvonalbiztonságot, időjárást, engedélyt vagy kapacitást;
- nincs automatikus publikálás felelős organizer nélkül;
- prompt/input minimization, személyes adatok nyers átadása nélkül;
- provider/model/prompt template/output schema version audit;
- cost cap, rate-limit, cache, queue és kill switch;
- provider hiba esetén a manual composer teljesen működjön.

Adj `Make it clearer`, `Make it more welcoming`, `Shorten`, `Add practical details`, `Translate`, `Create beginner version`, `Generate checklist` akciókat, de minden output szerkeszthető draft legyen.

## 7.3. Event Readiness Score – nem büntetés, hanem élő segítség

A szervező látson `Event Readiness` ellenőrzőlistát, ne homályos pontszámot. Például:

- időpont és időzóna rendben;
- helyszín és érkezés tisztázva;
- kapacitás és várólista szabály kész;
- költség transzparens;
- célcsoport/kezdő szint tisztázott;
- felszerelés és időjárási terv megadva;
- safety/house rules elkészítve;
- cancellation és refund policy megadva, ha releváns;
- host/crew elérhetőség és check-in terv;
- kommunikációs és emlékeztető terv;
- image/alt text/licenc ellenőrzése;
- preview mobilon/desktopon.

A meglévő flow-kat ne blokkolja retroaktívan. Először soft warning, új eventeknél fokozatos enablement és feature flag; a kockázatos eseménytípusoknál legyen külön policy-alapú kötelezőség.

## 7.4. „No surprise publish” preview

Publikálás előtt a szervező kapjon több nézetes preview-t:

- discovery card;
- event detail desktop;
- event detail mobile;
- RSVP confirmation;
- reminder preview;
- notification preview;
- keresőben megjelenő filter/tags;
- privát helyszín visibility timeline;
- külső embed/partner API representation, ha releváns.

Ezzel az organizer ugyanazt látja, amit a résztvevő látni fog.

# 8. Sorozatok, sablonok és „egy eseményből működő közösség”

## 8.1. Recurring Event Studio

A rendszer kezeljen sorozatokat úgy, hogy az egyedi alkalmak külön életciklust kaphassanak:

- sorozat template;
- ismétlődési szabály;
- kivétel/skip/holiday;
- egyedi alkalom szerkesztése;
- reschedule;
- kapacitás és waitlist per occurrence;
- attendance history;
- participant notification delta;
- idősoros organizer insight;
- archiválás a múltbeli linkek és audit megőrzésével.

Egyetlen alkalom módosítása soha ne írja felül kontroll nélkül a teljes sorozatot vagy meglévő RSVP-ket.

## 8.2. Templates és playbooks

Adj kategória-specifikus templateket:

- túra / outdoor;
- sport és edzés;
- társasjáték;
- kreatív workshop;
- tech/AI meetup;
- gasztro;
- kutyás program;
- kulturális program;
- konferencia/üzleti rendezvény;
- önkormányzati/közösségi program.

A template előtölt, de nem ír felül manuális értéket. Minden templateben legyen releváns safety, accessibility, checklist, poll, reminder és check-in default.

## 8.3. Post-event continuation engine

Az esemény után ne „Done” legyen a termék vége. Opcionális, preference-aware flow:

- rövid feedback: „megfelelt a leírásnak?”, „visszamennél?”, „mi legyen jobb legközelebb?”;
- next occurrence RSVP vagy érdeklődés;
- Circle/hub ajánlás;
- host által jóváhagyott recap;
- résztvevő által explicit kapcsolatfelvétel/reconnection;
- „szeretnétek ebből rendszeres kört?” jelzés a host számára aggregált igényként;
- no-show esetén empatikus, nem büntető follow-up és egy egyszerű lemondási flow jövőre.

Ne publikálj személyes feedbacket automatikusan. Ne építs nyilvános személyértékelést vagy társas reputációs kasztrendszert.

# 9. No-show csökkentés és várólista: intelligens, méltányos, auditálható

## 9.1. Attendance Confidence, nem rejtett büntetőpont

A rendszer használhat event-szintű, nem megbélyegző megerősítő lépéseket:

- `Még jössz?` check;
- egykattintásos `Igen`, `Nem tudok menni`, `Késni fogok`;
- feltételes emlékeztetők azoknak, akik nem reagáltak;
- időjárás/forgalom vagy helyszínváltozás esetén frissített action card;
- könnyű lemondás, hogy a hely gyorsan felszabaduljon.

Ne hozz létre rejtett, felhasználót büntető no-show score-t. Ha a kapacitáskritikus eseményekhez megbízhatósági mechanika kell, az legyen transzparens, esemény- és policy-specifikus, fellebbezhető és ne diszkrimináljon egészségi, fogyatékossági vagy hozzáférési helyzet alapján.

## 9.2. Waitlist orchestration

Az eredeti intelligens várólista mellett:

- configurable offer window;
- timezone-aware expiry;
- one-tap accept/decline;
- automatikus következő jogosult kiválasztás;
- fairness rule – például join order vagy előre közölt prioritás;
- per-event host override indoklással;
- capacity race condition védelem;
- idempotens promotion;
- promotion/cancellation audit;
- participant számára egyértelmű státusz;
- waitlist estimate csak ha megbízhatóan számítható, különben ne ígérj helyet;
- ha valaki promóciót elfogad, a naptár/értesítés automatikusan frissüljön.

## 9.3. Reminder orchestration

Az eredeti 24 órás és 2 órás emlékeztető default maradjon, de legyen konfigurálható és preference-aware. A reminder lehet:

- RSVP confirmation;
- T−7 nap egy nagyobb eseménynél;
- T−24 óra praktikus felkészülés;
- T−2 óra indulási/meeting point;
- sürgős változás;
- waitlist offer;
- post-event feedback;
- következő alkalom.

Minden kommunikációban legyen dedupe, frequency cap, quiet hours, unsubscribe/preference center, delivery state és fallback. A reminder szöveg legyen konkrét, kontextusos és cselekvést támogató, de soha ne legyen manipulatív.

# 10. Check-in és helyszíni eseményüzemeltetés

## 10.1. QR Check-in 2.0

Az eredeti QR beléptetésen felül:

- host/crew role és least-privilege permission;
- időablakos, forgó vagy aláírt QR token, megfelelő fenyegetésmodell mellett;
- offline-toleráns scan queue, későbbi idempotens sync;
- duplikált scan UX: világos jelzés, nem duplán ír attendance-t;
- manual lookup és manual check-in megfelelő jogosultsággal/audittal;
- check-in csak minimális személyes adatot mutasson;
- hostnak gyors „late”, „cancelled”, „walk-in” kezelési lehetőség, policy szerint;
- export csak szerepkör, consent és retention szabály mellett;
- scan hiba, kamera permission, rossz hálózat és lejárt token kezelése.

## 10.2. Live Event Console

Nagyobb vagy összetettebb eseményeknek adj élő organizer nézetet:

- confirmed / checked-in / late / waitlisted összesítés;
- crew kommunikáció;
- official update küldése;
- incident handoff;
- helyszíni kapacitás;
- check-in hiba queue;
- emergency/safety escalation megfelelő jogosultsággal;
- csak az esemény időablakában elérhető, auditált eszközök.

Ez ne váljon túlterhelt enterprise dashboarddá kis szervezőknek: a Quick Create eseményhez továbbra is legyen egyszerű mobilos host nézet.

# 11. Organizer Command Center: kevesebb admin, több valódi szervezés

## 11.1. Unified organizer inbox

Egyetlen prioritásos inboxban jelenjen meg:

- új RSVP-k és waitlist állapot;
- megválaszolatlan Q&A;
- közelgő event readiness hiányok;
- kritikus update acknowledgement;
- crew feladatok;
- check-in anomália;
- no-show/cancellation trend;
- report/moderation státusz jogosultság szerint;
- provider/integration hibák;
- payout/billing/entitlement kivételek csak megfelelő B2B szerepkörnek;
- AI draft review;
- performance/feedback insight.

Minden queue elemhez priority, owner, deadline, deep link, status, history és resolution kell.

## 11.2. Organizer copilot, nem automatikus káosz

A szervezői Copilot javasolhat:

- hiányzó fontos információkat;
- jobb cím/leírás/gyakorlati instrukció;
- hasonló korábbi esemény sablont;
- optimális reminder tervet;
- időpontszavazást;
- várólista beállítást;
- accessibility és safety checklistet;
- post-event follow-up draftot;
- B2B export/API mapet.

Minden javaslat legyen magyarázott, szerkeszthető és kézi jóváhagyásra váró. Ne küldj üzenetet, ne publikálj eseményt és ne módosíts kapaszkodó üzleti szabályt explicit organizer action nélkül.

## 11.3. Quality insights, nem vanity dashboard

Mutasd a szervezőnek:

- discovery -> RSVP;
- RSVP -> check-in;
- check-in -> repeat attendance;
- cancellation lead time;
- waitlist fill rate;
- event description completeness;
- feedback témák aggregálva;
- event megfelelt a leírásnak arány;
- host response time;
- reminder effectiveness;
- recurring series health;
- source/provider channel teljesítmény B2B integrációknál.

Ne mutass érzékeny, személyszintű társas/pszichológiai scoringot. Ne hozz létre automatikus negatív szervezői szankciót kizárólag modellpontszám alapján.

# 12. B2B: Developer Experience, amely tényleg „10 perc alatt működik”

## 12.1. API first, de a meglévő contract érintetlen

Ne írd át a meglévő internal API-kat vagy provider integrationöket. Hozz létre versionált, public B2B API boundaryt:

- REST API, jól dokumentált erőforrásokkal;
- GraphQL csak akkor, ha valós use case, authorization modell és üzemeltetési kapacitás indokolja; ne legyen marketing checkbox;
- OpenAPI 3.1 spec mint forrásigazság;
- géppel generálható SDK-k és kézzel írt quickstartok;
- stabil resource ID, pagination, filtering, sorting, cursor strategy;
- egyértelmű error taxonomy és machine-readable error code;
- rate-limit header és quota visibility;
- idempotency key minden side-effecting `POST`/`PATCH`/`DELETE` mintánál;
- tenant-scoped authorization és least privilege API scope;
- API versioning/deprecation policy;
- sandbox/test mode valódi tesztadatokkal és elválasztott credentiallel;
- API changelog, status page, migration guide;
- correlation/request ID minden válaszban.

## 12.2. Az első 10 perc developer journey

A Developer Portal landingje ne „dokumentációs fal” legyen. Legyen egy konkrét quickstart:

1. sandbox workspace létrehozása;
2. scoped API key;
3. egy `POST /events` példa idempotency key-jel;
4. event listázása;
5. RSVP vagy attendee lekérése megfelelő scope-pal;
6. webhook endpoint regisztrálása;
7. teszt `event.published` vagy `attendance.checked_in` esemény küldése;
8. endpoint delivery log és replay;
9. embeddable widget snippet;
10. production credential / go-live checklist.

Adj működő cURL, Node.js/TypeScript, Python, PHP példát. A példák ne használjanak éles secrettet, hamis működési állítást vagy nem létező endpointot.

## 12.3. Webhooks: at-least-once, aláírt, replayelhető

A webhookoknál kötelező:

- event envelope: `id`, `type`, `created_at`, `api_version`, `data`, opcionális `actor`, `tenant_id`, `request_id`;
- schema version per eseménytípus;
- HMAC-SHA256 aláírás a raw body + timestamp alapján;
- timestamp tolerance és replay protection;
- delivery ID;
- at-least-once szemantika dokumentálva;
- retry exponential backoff + jitter;
- dead-letter queue;
- per endpoint delivery log, response code, latency, attempt count;
- teszt event;
- event/time-range alapú manual replay;
- endpoint secret rotation;
- ordering garancia csak akkor kommunikálható, ha tényleg létezik; egyébként out-of-order eseményre fel kell készíteni a klienst;
- partneroldali idempotency guidance és példa;
- gyors ACK, aszinkron feldolgozás ajánlása.

A webhook architektúrában queue-first feldolgozás, idempotencia, retry, dead-letter és replay alapvető production minta. [web:243][web:244]

## 12.4. Embeddable Widget Platform

Az eredeti beágyazható widgetek bővítése:

- Event List, Event Detail, RSVP, Calendar, Availability/Poll, Check-in, Venue Schedule widget;
- theme token, dark/light mód, locale, timezone, responsive container;
- accessibility és keyboard support;
- CSP-friendly embed stratégia;
- iframe és web component opció csak valódi támogatási tervvel;
- host domain allowlist;
- widget version pinning és upgrade policy;
- consent/analytics isolation;
- loading/fallback/error state;
- host page teljesítménybudget;
- widget telemetry opt-in és privacy-safe;
- partner branding, de a Hobbeast trust/safety és event state integritása megmarad.

## 12.5. Integrációs katalógus

A partnernek ne kelljen mindent fejlesztenie. Legyen dokumentált connector stratégia:

- CRM;
- ticketing;
- email/push;
- naptár;
- POS/QR;
- marketing automation;
- BI/data warehouse;
- map/venue;
- community/platform partner;
- önkormányzati/cultural institution data feed.

Minden connectornál legyen ownership, data map, consent, token scope, sync direction, retry, conflict resolution, rate limit, audit és disconnect/delete flow.

# 13. Adatmodell és rendszertervezési minimum

## 13.1. Új additív domain objektumok – csak ha a tényleges schema hiányolja

A tényleges kódbázis alapján, append-only migrációval és explicit RLS-szel mérlegeld:

- `event_series` / `event_occurrences`;
- `event_readiness_checks`;
- `event_poll` / `event_poll_options` / `event_poll_votes`;
- `event_official_updates` / acknowledgements;
- `event_questions` / answers;
- `event_checkins`;
- `event_crews` / role assignments;
- `event_automation_rules` / `notification_ledger`;
- `event_feedback` – minimum adat, private by default;
- `event_reconnection_consents`;
- `organizer_templates`;
- `api_clients`, `api_scopes`, `api_keys` – secret only hashed;
- `webhook_endpoints`, `webhook_deliveries`, `webhook_dead_letters`;
- `idempotency_records`;
- `feature_flags` / rollout audit;
- `integration_connections` / sync jobs;
- `operational_incidents`.

Ne hozz létre olyan táblát, amely meglévő kanonikus adatot duplikál. Először készíts source-of-truth térképet és adaptert. Minden új táblán RLS kötelező, a public profil/event DTO pedig explicit allowlist legyen.

## 13.2. Data retention és privacy

- minimális adatgyűjtés;
- privát helyszín és résztvevői adatok time-bound visibility;
- chat, check-in, feedback, poll, audit és webhook log retention policy;
- GDPR export/delete utak;
- legal/safety retention kivételek dokumentálva;
- PII ne kerüljön analytics, logs, webhook test console vagy AI promptba szükségtelenül;
- hostnak csak az eseményhez szükséges résztvevői információ legyen látható;
- admin search legyen auditált és maszkos, ahol lehetséges.

# 14. Trust & Safety: a prémium élmény alapja

A „minden nagyon egyszerű” soha nem jelentheti azt, hogy a rendszer könnyű terep zaklatásnak, csalásnak, doxxingnak, spamnek vagy veszélyes eseménynek.

Kötelező:

- block/report minden user-user, host-user és chat felületen;
- explicit event rules és host responsibility;
- event/contextual report kategóriák;
- moderation case lifecycle és appeal;
- spam/rate limit/abuse detection;
- event publish risk review csak policy-alapú, magyarázható, emberi felülvizsgálható;
- a privát lakás, éjszakai, fizikai kontaktussal járó vagy kapacitáskritikus eseményekhez kockázat-alapú plusz readiness;
- no fake identities, fake attendance vagy hamis social proof;
- user által generált kép/komment/moderációs út;
- safety incident gyors host-to-admin handoff;
- minden admin action auditált, least-privilege és indokolt.

# 15. Premium UI/UX rendszer

## 15.1. Élményelvek

- **Immediate clarity:** az első képernyőn mindenki tudja, hol van, mi a következő lépés és miért érdemes megtenni.
- **Progressive disclosure:** a kezdő user gyorsan halad, az expert organizer soha nem érzi korlátozottnak magát.
- **One primary action:** képernyőnként egy domináns, kontextusos CTA; másodlagos lehetőségek nem vesznek el.
- **Trust before conversion:** ár, kapacitás, host, időpont, helyszín, szabályok, privacy és lemondás ne legyen elrejtve.
- **No dead ends:** üres találatnál mentett keresés, időpontszavazás, közeli alternatíva, érdeklődésjelzés vagy event request legyen.
- **Delight through utility:** a „wow” a súrlódás eltűnéséből jön, nem animációtúladagolásból.
- **Calm design:** nincs agresszív piros badge, végtelen értesítés vagy feed-nyomás.
- **Accessibility as quality:** olvasható tipográfia, kontraszt, focus states, touch targets, motion preference, form errorok és live regionök.

## 15.2. Empty, loading, error, success states

Minden új felülethez kötelező:

- skeleton, nem ugráló layout;
- keresési üres állapot konkrét, hasznos következő akcióval;
- hibaüzenet egyszerű nyelven + retry + technikai correlation ID rejtett/segítségben;
- sikerállapotban mi történt és mi jön ezután;
- lassú hálózat, provider failure, offline check-in és stale data kezelése;
- destructive action confirm;
- undo, ahol biztonságosan lehetséges;
- mobilon egykezes elérés és fontos actionök nagy touch targettel.

# 16. Mérhetőség, minőség, release

## 16.1. Product analytics – privacy-safe

Készíts egységes event taxonomy-t legalább ezekre:

- discovery impression, detail view, filter applied, search intent parsed;
- save, interested, RSVP started/confirmed/cancelled, waitlist joined/promoted/accepted;
- first-timer flow, buddy opt-in;
- event update viewed/acknowledged;
- poll created/voted/closed/event-created;
- organizer draft started, AI assist accepted/edited/rejected, published;
- check-in success/failure/manual/offline-sync;
- feedback submitted;
- reminder scheduled/sent/delivered/opened/actioned/suppressed;
- API request, webhook delivery/retry/DLQ/replay;
- widget load/error/action;
- report/block/moderation outcome aggregate;
- feature flag exposure.

Soha ne küldj analyticsbe nyers emailt, telefont, pontos lakcímet, privát chatet, teljes szabad szöveget vagy érzékeny következtetést.

## 16.2. SLO és monitoring

Definiáld és monitorozd:

- event create draft save és publish sikerarány;
- RSVP p95 latency/sikerarány;
- waitlist promotion késleltetés;
- notification dispatch és delivery failure;
- check-in throughput és error;
- discovery API latency;
- external provider sync freshness és error;
- AI generation latency/cost/failure;
- webhook delivery success/retry/DLQ;
- widget performance;
- client errors;
- key route Web Vitals.

Használj correlation ID-t frontendtől Edge Functionön át provider hívásig. PII-t redaktálj. Minden cron/queue esetén legyen lag, retry, dead-letter és replay láthatóság.

## 16.3. Kötelező tesztcsomag

- unit teszt állapotátmenetekre, ranking/filtering, poll winner/tie, reminder guard, idempotency;
- RLS negatív teszt résztvevő/host/crew/admin/B2B tenant szerepekkel;
- contract teszt Edge Function, OpenAPI, webhook payload és provider adapterhez;
- E2E: create -> publish -> discover -> RSVP -> reminder -> cancel -> waitlist promote -> check-in -> feedback -> recurrence;
- E2E: poll -> decision -> event draft -> publish;
- E2E: block/report hatása discoveryre, chatre, reconnectre, notificationre;
- E2E: API create + idempotent replay + webhook test/retry/replay;
- accessibility smoke: keyboard, dialog focus, form errors, live updates, mobile;
- performance/bundle non-regression, külön landing budget védelemmel;
- chaos/degraded tests legalább provider timeout, duplicate webhook, queue retry, offline check-in és concurrent capacity race condition esetére.

# 17. Feature-flagelt rollout és második innovációs kör

## 17.1. Ajánlott rollout sorrend

1. Event detail confidence és pre-event mission control.
2. RSVP/waitlist/notification state-machine hardening.
3. Dynamic official update feed és poll-to-event.
4. Quick Create + manual Composer quality fejlesztés.
5. AI Copilot shadow mode, majd organizer opt-in.
6. Check-in 2.0 és organizer inbox.
7. Recurring Event Studio + templates.
8. Discovery explanation és intent-first search.
9. B2B API sandbox, OpenAPI és webhook beta.
10. Widgets és connector catalog.
11. Outcome analytics, quality dashboard, controlled recommendation rollout.

Ne ugorj át P0/P1 security, RLS, data integrity vagy production blocker felett. Minden nagy lépéshez canary cohort, metrika és rollback trigger kell.

## 17.2. Kötelező második bővítési kör

Az első implementációs kör befejezése után olvasd vissza ezt a teljes promptot és a releváns meglévő promptokat. Készíts `Ultimate Event Engine Coverage Matrix` táblát:

| Követelmény | Meglévő implementáció | Új additív elem | Tesztbizonyíték | Flag | Kockázat | Rollback | Státusz |
|---|---|---|---|---|---|---|---|

Ezután azonosítsd és kizárólag additív módon pótold a kimaradt prémium production gapeket:

- authorization/RLS;
- idempotencia és concurrency;
- privacy/data minimization;
- error és degraded mode;
- user/host/admin communication;
- mobile/a11y;
- observability;
- cost/rate limiting;
- feature flag expiry/owner;
- documentation/SDK;
- rollback/incident runbook;
- legacy-flow regression evidence.

# 18. Végső kötelező delivery

A munka végén add át:

1. Current state és root-cause/impact összegzés.
2. A megőrzött meglévő funkciók, route-ok és contractok listája.
3. Módosított és új fájlok listája, szerepükkel.
4. Új migrationök, indexek, constraintök, RLS és rollback terv.
5. Event lifecycle state-machine és kompatibilitási mapping.
6. Résztvevői UX fejlesztések.
7. Szervezői UX és automatizációk.
8. Communication, poll, waitlist, check-in és safety változások.
9. AI governance, provider, költség és fallback megoldások.
10. API, webhook, SDK, sandbox és widget specifikáció.
11. Admin/ops, queue, alert, runbook és ownership delta.
12. Analytics taxonomy és privacy review.
13. Tesztek, parancsok és tényleges eredmények; ami BLOCKED, annál pontos ok és futtatási instrukció.
14. Build/lint/typecheck/release validation evidence.
15. Feature flag registry: név, default, cohort, owner, expiry, rollback.
16. Known risks, elfogadott tradeoffok és következő lépések.
17. `Ultimate Event Engine Coverage Matrix` és a második additív hardening kör eredménye.
18. Changelog, versioning, ADR és Sprint Status append-only frissítése.

**Nem állíthatod, hogy deployoltál, migráltál, secretet rotáltál, külső providert konfiguráltál vagy productionben teszteltél, ha nincs közvetlen, ellenőrizhető bizonyítékod rá.**

---

# 19. ULTRA-INNOVATIVE AMPLIFICATION V2 — az eseményszervezés új alapélménye

Ez a fejezet a teljes 0–18. fejezet **additív, második erősítési rétege**. Semmit nem töröl, nem gyengít és nem ír felül a korábbi követelményekből. A cél nem egy még hosszabb funkciólista, hanem egyetlen koherens élményrendszer, amelyben a Hobbeast/Expericentre:

- a kezdő szervezőnek szinte magától értetődő;
- a visszatérő közösségi hostnak villámgyors;
- a professzionális szervezőnek és B2B integrátornak mély, automatizálható és auditálható;
- a résztvevőnek pedig nem adminisztráció, hanem biztonságos, örömteli út egy valódi közös élményhez.

Az élményígéret:

> **„Mondd el, milyen közös élményt szeretnél. A rendszer segít jól megszervezni, mindenkit képben tartani, a helyszínen végigvinni és közösséggé folytatni — anélkül, hogy elvenné tőled az irányítást.”**

Kötelező termékérzet:

- az első 5 másodpercben érthető legyen, hol tart a felhasználó és mi az egyetlen legjobb következő lépés;
- az egyszerű esemény létrehozása ne projektmenedzsmentnek, hanem egy jó gondolat természetes kibontásának érződjön;
- a rendszer a komplexitást nyelje el, ne a felhasználóra tolja;
- minden automatizmus legyen előnézhető, magyarázható, felülírható és biztonságosan visszavonható, ahol ez domain szempontból lehetséges;
- a professzionális mélység ne nehezítse a hétköznapi használatot;
- a „wow” soha ne animációból vagy AI-szövegből önmagában jöjjön, hanem abból, hogy a rendszer időben észreveszi a következő valódi problémát és egyértelmű megoldást kínál.

# 20. Kötelező előkészítő termék- és regresszióbiztonsági fázis

Implementáció előtt készíts bizonyíték-alapú `As-Is Event Capability Map` dokumentumot. Ne indulj ki abból, hogy a promptban megnevezett képesség hiányzik. Ellenőrizd a jelenlegi route-okat, komponenseket, service-eket, RPC-ket, migrationöket, edge functionöket, feature flageket, teszteket és dokumentációt.

A térkép legalább ezt különítse el:

- **BIZONYÍTOTTAN MŰKÖDIK** — közvetlen kód- és tesztbizonyítékkal;
- **RÉSZBEN LÉTEZIK** — megvan az alap, de az élmény vagy contract hiányos;
- **LÉTEZIK, DE NINCS BEKÖTVE** — adatmodell vagy service megvan, UI/útvonal nem használja;
- **BIZONYTALAN** — runtime vagy külső környezet nélkül nem igazolható;
- **VALÓDI GAP** — nincs meglévő, biztonságosan bővíthető megoldás.

Különösen őrizd meg és bővítsd a meglévő event create/edit/detail, organizer dashboard, template, readiness, crew role, event series, participant lifecycle, waitlist, notification, check-in, external-event ingestion/companion, Circle/Hub és audit képességeket. Ne hozz létre második source of truth táblát vagy párhuzamos flow-t csak azért, mert új elnevezést kapott egy koncepció.

Kódolás előtt készíts három rövid megoldási alternatívát minden nagyobb vertikális szelethez:

1. meglévő flow additív bővítése;
2. kompatibilis orchestration/facade réteg;
3. strukturális csere.

Alapértelmezésben az 1. vagy 2. megoldást válaszd. A 3. csak bizonyított, dokumentált akadály esetén megengedett, migrációs és rollback tervvel. Az elemzési fázis nem jogosít fel nagy újratervezésre.

# 21. Mérhető „proof of magic” és UX-budget

Ne elégedj meg azzal, hogy a funkció elérhető. Minden fő journeyhez legyen feladat-sikerességi és mentális terhelési cél.

Minimum benchmark journeyk:

| Persona | Feladat | Célélmény |
|---|---|---|
| Első szervező | Egyszerű, ingyenes találkozó publikálása | medián legfeljebb 60 másodperc, kritikus hiány nélkül |
| Visszatérő host | Korábbi eseményből új alkalom | medián legfeljebb 30 másodperc, csak a változásokat kelljen ellenőrizni |
| Közösségi szervező | Dátumszavazásból esemény | ne kelljen újra begépelni a már megadott adatokat vagy újra RSVP-zni feleslegesen |
| Profi szervező | Több szereplős esemény előkészítése | felelősök, határidők, jóváhagyások és kockázatok egyetlen állapotképen |
| Résztvevő | „Mikor, hova, mit vigyek, mi változott?” | egyetlen mobil event pass nézetből megválaszolható |
| Beengedő személyzet | Érkezők kezelése gyenge hálózaton | minimális lépés, egyértelmű duplikált/érvénytelen státusz, offline-safe működés |
| B2B fejlesztő | Első esemény létrehozása sandboxban | működő quickstart legfeljebb 10 perc alatt, CI-ben is futtatható |

Minden journey mérje legalább:

- task completion rate;
- time-to-first-correct-publish;
- javítás nélkül sikeres publikálás aránya;
- elhagyási pont és visszatérés utáni helyreállítás;
- kritikus hiba és félreérthető döntési pont;
- billentyűzetes, képernyőolvasós és mobil használhatóság;
- megtévesztő vagy felesleges lépések száma;
- esemény után a szervező és résztvevő által érzékelt kontroll, biztonság és öröm.

Az itt megadott időcélok release benchmarkok, nem manipulálható vanity metricák: a szükséges jogi, biztonsági, hozzáférhetőségi vagy fizetési lépéseket tilos elrejteni azért, hogy jobb szám szülessen.

# 22. Event Blueprint Engine — kontextusérzékeny létrehozás wizard-fal nélkül

Az esemény létrehozása egy adaptív `Event Blueprint` köré szerveződjön. A felhasználó indulhasson:

- üres lapról;
- egyetlen természetes nyelvű mondatból;
- korábbi saját eseményből;
- sablonból;
- dátumszavazás eredményéből;
- engedélyezett URL-, RSS-, ICS-, JSON-LD- vagy HTML-forrásból;
- külső esemény companionból;
- social-post extension/manual handoffból;
- strukturált API/CSV importból;
- beillesztett leírásból vagy dokumentumból, ha annak feldolgozása biztonságosan támogatott.

A Blueprint ne statikus mezőlista legyen, hanem `event_type + audience + scale + location_mode + risk_profile + recurrence + commercial_model` alapján felépített constraint graph. Csak azt kérdezze meg, ami az adott eseményhez szükséges, és folyamatosan mutassa:

- **Mi van már kész?**
- **Mi hiányzik a publikáláshoz?**
- **Mi ajánlott, de kihagyható?**
- **Mi jelent kockázatot vagy résztvevői bizonytalanságot?**
- **Mi változott a forráshoz/sablonhoz/előző alkalomhoz képest?**

Az AI és az automatikus inference minden mezőnél adjon provenance-t: `user_entered`, `template`, `previous_event`, `imported_source`, `derived`, `ai_suggested`, `system_default`. Az AI-javaslat soha ne tűnjön felhasználó által jóváhagyott ténynek. Bizonytalan dátumot, címet, árat, kapacitást, korhatárt, hozzáférhetőségi információt vagy lemondási szabályt nem publikálhat automatikusan.

A Quick és Pro mód ugyanazt a domaint és mentett draftot használja. A módváltás nem veszthet adatot, és nem hozhat létre konkurens create flow-t. A nagy képernyős és mobil elrendezés más lehet, a mentális modell nem.

# 23. Universal Event Intake — „hozd, amid már megvan”

Az import ne egyszerű másolás legyen, hanem biztonságos normalizálási és egyeztetési élmény:

1. forrás felismerése és jogosultság/provenance rögzítése;
2. mezők kinyerése confidence értékkel;
3. lehetséges duplikátumok és már létező owned/external események felderítése;
4. oldalsó diff: forrásérték, jelenlegi érték, javasolt érték;
5. kritikus mezők emberi megerősítése;
6. import snapshot és audit trail;
7. későbbi változásoknál új diff, nem csendes felülírás.

Kemény határok:

- tiltott vagy robots/policy szempontból nem engedélyezett scrapinget ne vezess be;
- social platformról csak a meglévő, engedélyezett manual/extension handoff mintát bővítsd;
- külső companion adat nem válhat csendben canonical owned eventté;
- kurált szervezői adatot automatizmus nem írhat felül;
- a forrás megszűnése stale állapotot és felülvizsgálatot okozzon, ne automatikus adatvesztést.

# 24. Event Truth Ledger és Change Impact Simulator

Az eseménynek legyen egyértelmű, verziózott igazságforrása. A szervező minden érdemi mentés előtt lássa, ha a módosítás hatása túlmutat egy szövegmezőn.

A `Change Impact Simulator` kritikus változásnál mutassa meg:

- hány és milyen státuszú résztvevőt érint;
- mely occurrence-ökre vonatkozik: csak ez, ez és a jövő, vagy a teljes series;
- mely kommunikációs csatornák és locale-ok kapnának frissítést;
- változik-e QR, check-in window, kapacitás, waitlist, jegy, fizetés, refund, helyszínhozzáférés, naptárbejegyzés, widget, API vagy webhook payload;
- szükséges-e új elfogadás, acknowledgment vagy host approval;
- van-e ütközés crew-tag, külső integráció vagy másik szervező párhuzamos szerkesztésével.

Kötelező konfliktusvédelem:

- verziószám/ETag és feltételes módosítás;
- elveszett frissítés megakadályozása (`If-Match` vagy azzal egyenértékű domain contract);
- ütközéskor emberileg érthető háromutas diff: „amit te kezdtél szerkeszteni / ami közben megváltozott / javasolt egyesítés”;
- automatikus mezőszintű merge csak bizonyítottan konfliktusmentes esetben;
- biztonságos draft branch és audit;
- tartalmi rollback csak olyan mezőkre, amelyeknél ez nem sért attendance-, payment-, privacy- vagy compliance invariánst.

Minden résztvevő számára elérhető legyen a „Mi változott, mióta jelentkeztem?” összefoglaló. A rendszer ne küldjön öt külön értesítést öt apró szerkesztésről: támogatott legyen a változások ésszerű összecsomagolása, kivéve az azonnali biztonsági vagy időkritikus módosítást.

# 25. Collaborative Production Workspace — közös szervezés konfliktus nélkül

A meglévő crew-role és readiness alapokra építs professzionális, de progresszíven felfedett közös munkateret:

- owner, co-host, program, venue, communication, finance, safety, accessibility, check-in és read-only szerepkörök;
- eseményszintű és szükség esetén occurrence-szintű hatáskör;
- check-in-only least-privilege hozzáférés érzékeny résztvevői adatok teljes megnyitása nélkül;
- feladat, felelős, határidő, státusz, függőség és approval gate;
- megjegyzés, mention és döntésnapló, de ne építs párhuzamos általános chatrendszert;
- jelenlétjelzés és szerkesztési konfliktusjelzés;
- T-30 / T-14 / T-7 / T-1 / day-of / post-event adaptív runway;
- automatikusan javasolt feladatok az event blueprint és readiness gapek alapján;
- „csak kivételek” nézet a rendben haladó tételek helyett.

Egy kávézós társasjáték-est hostja továbbra se lásson vállalati projektmenedzsmentet. A workspace mélysége az esemény kockázata, mérete és a szervező választása szerint nyíljon meg.

# 26. Command Center és Universal Action Layer

Legyen konzisztens, gyors műveleti réteg asztali és mobil használatra:

- esemény, résztvevő, crew-tag, feladat, üzenet, poll és beállítás keresése;
- kontextusfüggő „mit szeretnél most elintézni?” parancsok;
- billentyűzetes command palette és mobil action sheet;
- többes művelet előtt pontos scope- és hatáselőnézet;
- biztonságosan visszavonható műveleteknél undo;
- destruktív, pénzügyi, privacy- vagy tömeges kommunikációs műveletnél explicit megerősítés;
- természetes nyelvű kérésből legfeljebb draft/javaslat készülhet, nem rejtett végrehajtás.

Példák:

- „Írj azoknak, akik még nem válaszoltak az ételallergiára.”
- „Mutasd a holnapi eseményeket, ahol nincs check-in felelős.”
- „Másold a múlt havi klubestet, de legyen 20 fő és egy órával korábban.”
- „Melyik változás miatt kell újra értesítenem a résztvevőket?”

A rendszer minden esetben mutassa a feloldott intentet, a célsokaságot, a módosuló objektumokat és a végrehajtás előtti preview-t.

# 27. Participant Event Pass — egyetlen személyes igazságforrás a résztvevőnek

Minden RSVP után keletkezzen egy mobil-first, személyre szabott event pass, amely nem pusztán QR-kód. Egy helyen tartalmazza az adott résztvevő számára releváns, jogosultsággal megtekinthető információt:

- aktuális dátum, időzóna, helyszín vagy online belépési mód;
- útvonal, találkozási pont és frissességi bélyeg;
- mit vigyen, hogyan készüljön, dress code vagy felszerelés;
- accessibility és special-needs visszajelzés státusza;
- időjárási vagy közlekedési figyelmeztetés csak megbízható, timestampelt forrásból;
- QR/check-in státusz, jegy- vagy részvételi állapot;
- host által jóváhagyott hivatalos frissítések;
- „mi változott?” és szükséges acknowledgment;
- buddy/érkezési opció, ha a privacy és safety szabályok engedik;
- lemondás, waitlist, transfer vagy segítségkérés egyértelmű következő lépése.

A pass minimális day-of csomagja legyen offline elérhető, de érzékeny cím, belépési kód vagy résztvevői adat csak a szükséges időablakban és jogosultsággal cache-elhető. Az offline állapot, utolsó frissítés és esetleges eltérés legyen látható.

Támogasd a szabványos naptár- és — ahol platform/provider oldalon valóban lehetséges — wallet-integrációt úgy, hogy az occurrence- és cancellation szemantika ne sérüljön.

# 28. Communication Studio — megfelelő információ, megfelelő embernek, megfelelő időben

A kommunikáció ne csatornánként külön adminisztráció legyen. A host egyszer fogalmazza meg a hivatalos tartalmat; a rendszer a résztvevő preferenciája, locale-ja, státusza, urgenciája és quiet-hour szabályai alapján készítsen csatornaspecifikus delivery tervet.

Kötelező preview:

- célcsoport lekérdezésének emberi nyelvű és technikai definíciója;
- várható címzettszám és anonimizált bontás státusz szerint;
- kizárt/suppressed címzettek száma és oka;
- csatorna, tervezett idő, locale és fallback;
- kritikus vagy advisory besorolás indoklása;
- változat- és jóváhagyási állapot;
- rate-limit, költség- és provider-degraded hatás;
- tesztküldés és saját előnézet.

Az üzeneteknek legyen verziózott official-update identitása, deduplikációs kulcsa, delivery auditja és szükség esetén acknowledgmentje. A chatből vagy AI-összefoglalóból származó állítás nem válhat hivatalos információvá host approval nélkül.

Az automatizációs szabályok legyenek esemény-idővonalhoz és résztvevői állapothoz köthetők, például:

- RSVP után személyre szabott felkészülési összefoglaló;
- waitlist előrelépésnél időablakos megerősítés;
- hiányzó kötelező válasznál udvarias emlékeztető;
- kritikus helyszín/idő változásnál azonnali frissítés;
- no-show után nem büntető, empatikus következő lépés;
- esemény után köszönet, releváns feedback és közösségi folytatás.

Kerüld a notification fatigue-et: kevesebb, magasabb értékű, összecsomagolt és a felhasználó által kontrollálható értesítés legyen az alap.

# 29. Decision OS — a szavazás eredménye váljon valódi műveletté

A poll ne különálló widget legyen. Minden döntés rendelkezzen:

- döntési kérdéssel és kontextussal;
- tulajdonossal;
- válaszadói körrel;
- határidővel és time zone-nal;
- opciókkal, azok következményeivel és szükség esetén kapacitásával;
- döntési szabállyal: host dönt, többség, minimum részvétel, ranked choice vagy availability optimum;
- privacy beállítással;
- döntés utáni konkrét művelettel;
- auditálható lezárással és eredményközléssel.

A Find-a-Time/availability poll lezárásakor a győztes időpont az engedélyezett szabály szerint frissítse vagy hozza létre az occurrence-et, vigye tovább a már ismert résztvevői intentet, és világosan kérje csak azt az új megerősítést, amely valóban szükséges. Ne keletkezzen dupla RSVP, elveszett válasz vagy láthatatlan időzóna-eltolás.

# 30. Live Operations — kivételközpontú day-of irányítás

A helyszíni konzol célja nem az összes adat megmutatása, hanem az azonnal intézendő kivételek felismerése:

- több bejárat, több eszköz és eltérő check-in jogosultság;
- standard és gyors scan mód;
- ticket type/occurrence/window korlátozás;
- duplikált, túl korai, túl késői, visszavont vagy másik alkalomra szóló belépés egyértelmű kezelése;
- manuális keresés és indokolt override audittal;
- offline queue, eszközállapot, utolsó sync és conflict resolution;
- kapacitás, walk-in, waitlist release és no-show állapot;
- run-of-show, felelősök és kritikus kontaktút;
- incident indítás, handoff, kommunikációs sablon és lezárás;
- esemény utáni attendance reconciliation.

Ajtónál ne jelenjen meg szükségtelen profil-, egészségügyi vagy közösségi adat. A check-in személyzet csak a feladatához minimálisan szükséges információt kapja.

# 31. B2B/API „time-to-first-value” — a legkönnyebben integrálható event platform

A B2B élmény ugyanazokat a domain invariánsokat használja, mint a UI. Ne legyen „gyorsabb, de veszélyesebb” admin API.

Kötelező developer experience:

- tenant/workspace modell és dokumentált izoláció;
- sandbox és production környezet egyértelmű szétválasztása;
- rövid életű/scoped credential, OAuth ahol indokolt, secret nélküli böngészős integráció;
- idempotency key minden újrapróbálható state-changing művelethez;
- ETag/`If-Match` vagy egyenértékű optimistic concurrency;
- bulk és async job API stabil job state-machine-nel, progresszel, részhibával és retry contracttal;
- cursor/delta sync és törlés/cancellation/tombstone szemantika;
- OpenAPI contract, generálható typed SDK, példák, fixture-ek és Postman/CLI quickstart;
- webhook subscription, replay protection, signature rotation, delivery log, debugger, retry/backoff, dead-letter és manual replay;
- CloudEvents-kompatibilis envelope mérlegelése a vendorsemleges interoperabilitásért;
- API versioning, deprecation window és géppel olvasható changelog;
- rate-limit header, quota visibility és determinisztikus hiba-taxonomia;
- locale, timezone, recurrence, money és accessibility mezők teljes contractja;
- signed widget/embed és CSP/CORS biztonsági minta;
- ICS/CSV fallback ott, ahol egy teljes API-integráció aránytalan lenne.

Készíts egy CI-ben futó `10-minute integration` canary-t: workspace létrehozás, draft event, publish readiness, publikálás, participant/RSVP, official update, webhook fogadás, occurrence change, cancellation és audit visszaolvasás. A canary csak sandbox/mocked környezetet használhat, amíg nincs kifejezett production engedély.

# 32. Accessibility, nyelv és kognitív egyszerűség mint domainkövetelmény

Az accessibility nem utólagos CSS-javítás. A Blueprint, Event Pass, poll, check-in, comms preview és B2B dokumentáció is feleljen meg legalább a WCAG 2.2 AA releváns követelményeinek.

Kötelező:

- teljes billentyűzetes út és jól látható, nem kitakart fókusz;
- megfelelő célméret, nem csak színnel közölt státusz;
- screen reader announcement async mentésnél, validációnál, konfliktusnál és check-innél;
- reduced-motion támogatás;
- érthető hiba: mi történt, mi maradt meg, mit tehet most a felhasználó;
- egyszerű nyelvi mód és professzionális részletek külön rétegben;
- teljes i18n az UI-copy, template, notification, event content, API enum label és forrásmegjelölés számára;
- időzóna és locale mindig látható ott, ahol félreértés lehet;
- a host ne ígérhessen akadálymentességet strukturált állapot és felelős nélkül;
- event accessibility request kezelése adatminimalizált, jogosultságkezelt és auditált legyen.

# 33. Anti-feature szabályok — amitől nem lesz jobb a termék

Tilos:

- minden új ötlethez új dashboardot, tabot, modalt vagy source of truth táblát létrehozni;
- a felhasználót teljes domainmodellel vagy egyszerre minden mezővel terhelni;
- AI által csendben publikálni, üzenetet küldeni, időpontot eldönteni, résztvevőt kizárni vagy pénzügyi műveletet végrehajtani;
- engagement érdekében sürgetést, bűntudatot, manipulatív social proofot vagy notification spamet használni;
- safety, accessibility, privacy vagy alapvető információ hozzáférését fizetős csomag mögé zárni;
- host chatet hivatalos eseményinformációként kezelni;
- pollt létrehozni döntési tulajdonos és következő művelet nélkül;
- egyszerű szervezőre enterprise workflow-t kényszeríteni;
- professionális szervező elől elrejteni az auditot, scope-ot, konfliktust vagy delivery eredményt;
- külső adatot frissességi/provenance jelzés nélkül tényként kezelni;
- sérülékeny web scrape-re építeni olyan esetben, ahol szabványos vagy engedélyezett feed/API/handoff elérhető;
- API-secretet frontend bundle-be, kliensoldali logba vagy URL-be tenni;
- „sikeres” UI-t mutatni akkor, amikor a háttérművelet csak queue-ba került vagy részlegesen hibázott;
- vizuális látványossággal elfedni a bizonytalan, hiányos vagy veszélyes állapotot.

# 34. Vertikális, regresszióbiztos megvalósítási sorrend

Ne építs hónapokig láthatatlan infrastruktúrát, majd egyszerre új felületet. Vékony, végig használható és visszagörgethető vertikális szeletekben haladj:

## Slice A — Contract és karakterizálás

- as-is capability map;
- lifecycle/state-machine és source-of-truth térkép;
- legacy flow characterization tesztek;
- UX benchmark baseline;
- feature flag, audit és rollback keret.

## Slice B — Blueprint és draftbiztonság

- adaptív create flow a meglévő create/edit contractokra építve;
- autosave, recovery, provenance és readiness;
- previous/template/import diff;
- Quick ↔ Pro veszteségmentes váltás.

## Slice C — Truth Ledger, változás és kommunikáció

- verzió/optimistic concurrency;
- change impact preview;
- series scope;
- official update + audience/delivery preview;
- participant „mi változott?” nézet.

## Slice D — Participant Pass és day-of

- személyes event pass;
- offline-safe minimális csomag;
- check-in exceptions és least privilege;
- attendance reconciliation.

## Slice E — Közös szervezés és döntések

- crew workspace/runway;
- task/approval/decision log;
- poll-to-operation;
- command/action layer.

## Slice F — B2B sandbox és automation

- OpenAPI, idempotency, conditional writes;
- webhook debugger és replay;
- async/bulk/delta sync;
- SDK/CLI/fixture és 10 perces canary.

Minden slice előtt és után ugyanazokat a legacy és új journey canary-kat futtasd. A következő slice nem indulhat úgy, hogy az előző meglévő flow-t regresszióztatta vagy megmagyarázatlan adateltérést hagyott.

# 35. Kötelező új artifactok és döntési bizonyítékok

A 18. fejezet delivery listáján felül add át:

1. `As-Is Event Capability Map` bizonyítékokkal és gap státuszokkal.
2. `Experience Contract` persona-, journey-, idő- és sikerességi benchmarkokkal.
3. `Event Blueprint Schema` constraint-, provenance- és readiness contracttal.
4. `Event Truth Ledger ADR` versioning-, merge-, audit- és rollback döntésekkel.
5. `Change Impact Matrix` mezőváltozás → érintett személy → csatorna → acknowledgment → külső contract leképezéssel.
6. `Participant Event Pass Contract` online/offline, privacy és expiry szabályokkal.
7. `Communication Decision Matrix` urgency, audience, preference, quiet-hour, locale és fallback szabályokkal.
8. `Poll-to-Operation State Machine` duplikált RSVP és időzóna-regresszió elleni invariánsokkal.
9. `Live Ops Exception Catalogue` feloldási útvonalakkal és least-privilege szerepekkel.
10. `B2B Golden Path` futtatható sandbox quickstarttal és webhook-debug evidence-szel.
11. `UX Validation Report` valódi feladatalapú tesztekkel, nem csak screenshotokkal.
12. `No-Regression Ledger` minden érintett régi flow előtte/utána bizonyítékával.

Minden artifactnál legyen owner, source-of-truth, utolsó ellenőrzési idő, bizonyítékszint és lejáró feltételezés. A dokumentáció nem helyettesíti a működő implementációt, a unit teszt nem helyettesíti a böngészős bizonyítékot, a lokális build nem helyettesíti a production validációt.

# 36. Végső minőségi kapu — „eddig ez hogy nem létezett?”

A fejlesztés csak akkor nevezhető sikeresnek, ha az alábbi állítások mind bizonyíthatók:

- egy kezdő felhasználó segítség nélkül létre tud hozni egy helyes egyszerű eseményt;
- egy profi szervező ugyanazon rendszerben eléri a szükséges mélységet adatvesztés és workaround nélkül;
- a résztvevő egy helyen megérti a következő teendőjét és az összes fontos változást;
- a rendszer megakadályozza vagy emberileg feloldhatóvá teszi a párhuzamos szerkesztési ütközést;
- a host küldés előtt pontosan látja, kit, mikor, milyen csatornán és miért ér el;
- a poll eredménye újraadatbevitel nélkül valódi, auditált eseményműveletté válik;
- a day-of flow hálózati zavarban is biztonságosan degradálódik;
- egy integrátor dokumentáció alapján, támogatói beavatkozás nélkül végig tudja vinni a golden pathot;
- a meglévő event-, participant-, organizer-, notification-, Circle/Hub- és external-event működés nem regressziózott;
- nincs olyan sikerállítás, amelyet csak mock, statikus ellenőrzés vagy feltételezés támaszt alá.

Az utolsó design review kérdései:

1. Mi az a komplexitás, amit most ténylegesen levettünk a felhasználó válláról?
2. Mi az az információ, amit a rendszer a megfelelő pillanatban hozott elő?
3. Melyik hiba vagy félreértés vált lehetetlenné vagy könnyen javíthatóvá?
4. Melyik meglévő képességet használtuk újra ahelyett, hogy párhuzamosat építettünk volna?
5. Mi bizonyítja, hogy a kezdőnek egyszerűbb, a profinak pedig erősebb lett?
6. Mi az, amit tudatosan nem építettünk meg, mert nem növelte a valódi közös élmény esélyét?

**A végső mérce nem a funkciók száma. A végső mérce az, hogy a szervező magabiztosnak, a résztvevő felkészültnek és várt vendégnek, az integrátor pedig partnernek érezze magát — miközben a rendszer a háttérben pontos, biztonságos, auditálható és elképesztően egyszerű marad.**
