# 13. Trust, safety, moderation és adatvédelem


# KÖTELEZŐ VÉGREHAJTÁSI KERET – OLVASD EL MIELŐTT KÓDHOZ NYÚLSZ

Te egy senior/staff szintű full-stack product engineer + software architect + QA/security/release engineer szerepében dolgozol a Hobbeast / Expericentre kódbázison. Ez nem greenfield feladat és nem újraírás. A repository-ban sok hónapnyi működő funkció, migráció, admin workflow, Supabase-integráció, Edge Function, külső provider-integráció és regresszióvédelmi tapasztalat van. A feladat első számú szabálya:

**SEMMILYEN MÁR MŰKÖDŐ FUNKCIÓT NEM RONTHATSZ EL.**

A repository saját governance szabályai kötelezőek. Mielőtt implementálsz, olvasd el legalább:
- `README.md`
- `CHANGELOG.md`
- `codingLessonsLearnt.md`
- `codingLessonsLearnt.local.md`
- `.governance/controller.md`
- `.governance/codingLessonsLearnt.md`
- `.governance/agent_execution_rules_full.md`
- `.governance/ui_ux_rules.md`
- `.governance/versioning-guidelines.md`
- `docs/SPRINT_STATUS.md`
- `docs/MULTI_SUPABASE_CONTRACT.md`
- `docs/SECURITY_DEFINER_AUDIT.md`
- `docs/DEP_UPGRADE_PLAN.md`
- `docs/TESTING.md`
- `docs/BUILD.md`
- `docs/SECRETS_ROTATION.md`
- `RELEASE_PROCESS.md`
- a releváns `versioning/*_ai_dev_prompts.md` és `*_business_request_summary.*` fájlokat
- `BASEREQUIREMENTS/baserequests1.txt`
- `BASEREQUIREMENTS/baserequests2.txt`
- a releváns BASEREQUIREMENTS képeket/dokumentumokat, ha a vizuális vagy üzleti viselkedéshez szükségesek.

## Jelenlegi technikai valóság, amit nem szabad figyelmen kívül hagyni

A jelenlegi package meta alapján a projekt neve `hobbeast`, verziója `1.7.6`. A frontend React 18 + Vite 5 + TypeScript + Tailwind/shadcn, TanStack Query, React Router, Zod és react-hook-form. Backend: Supabase/Postgres/Auth/Storage/Edge Functions. A forrásban route-level lazy loading és manual chunking már létezik. A README szerint a landing kezdeti JS payload korábban ~1.35 MB-ról ~136 KB-ra csökkent, ezért ezt a teljesítményjavulást meg kell őrizni.

A repository jelenleg több nagy, load-bearing fájlt tartalmaz, többek között:
- `supabase/functions/place-search/index.ts` ~1455 LOC
- `src/components/admin/AdminEventbrite.tsx` ~982 LOC
- `src/pages/Events.tsx` ~921 LOC
- `src/components/admin/AdminUsers.tsx` ~811 LOC
- `src/components/CreateEventDialog.tsx` ~628 LOC
- `src/pages/OrganizerDashboard.tsx` ~627 LOC
- `src/components/MapyTripPlanner.tsx` ~597 LOC
- `supabase/functions/sync-local-places/batchRunner.ts` ~541 LOC
- `src/pages/EventDetail.tsx` ~418 LOC
- `src/components/admin/AdminCatalog.tsx` ~417 LOC
- `src/lib/placeSearch.ts` ~408 LOC

A `docs/SPRINT_STATUS.md` szerint az `AdminEventbrite` per-provider szétbontása, az Organizer/Admin mély refaktor, a notification/community rebuild és a `place-search` mély refaktor korábban kifejezetten azért lett deferred, mert karakterizációs tesztek nélkül regresszióveszélyes. Ezt a döntést ne írd felül vakon. Ha ebben a promptban ilyen területhez kell nyúlni, először lockold a jelenlegi viselkedést karakterizációs/integrációs tesztekkel, utána refaktorálj kis lépésekben.

A repository-ban több Supabase-kontextus történelmileg keveredett. A kód/dokumentáció tartalmaz target-project és external/geodata projekt fogalmakat. **Soha ne találj ki projekt-azonosítót, URL-t vagy service-role kulcsot.** A `docs/MULTI_SUPABASE_CONTRACT.md`, `src/lib/supabaseProjects.ts`, `src/integrations/supabase/client.ts`, `supabase/functions/shared/targetProject.ts` és az aktuális env-konfiguráció a forrásigazság. Ha eltérés van a régi baserequirements szövegek és a jelenlegi contract között, a jelenlegi contract + tényleges kód az irányadó, de dokumentáld az eltérést.

A régi requirement fájlokban előfordulhatnak történelmileg bemásolt API kulcsok vagy credential-szerű adatok. Ezeket:
- ne másold ki,
- ne logold,
- ne commitold,
- ne tedd prompt outputba,
- ne használd fallbackként.
Ha bármelyik még aktív lehet, jelöld rotálandóként a `docs/SECRETS_ROTATION.md` folyamat szerint. A rotáció provider-konzolban végzett operátori művelet, ezért ha nincs hozzá jogosultságod, ne imitáld sikeresnek.

## Termék-identitás – ezt tartsd középen

A Hobbeast nem generic event aggregator, nem zenei app és nem pusztán organizer SaaS. A README szerint community-first platform: emberek valós közös élmények körül találkoznak – túrázás, tenisz, kutyaséta, koncertek, társasjáték, meetup stb. A platform jelenleg event discoveryt, RSVP/waitlistet, eseménylétrehozást, profil/preference rendszert, virtual hubokat, organizer dashboardot, admin konzolt és külső event/geo provider integrációt tartalmaz.

A production irány központi tézise:
**shared interest -> real-world activity -> repeated encounter -> relationship -> circle -> community -> belonging.**

A jelenlegi rendszer sok helyen `User -> Event -> RSVP -> Attend -> Done` logikánál megáll. A következő fejlesztéseknek – ahol a prompt scope-ja ezt indokolja – úgy kell továbbépíteniük, hogy az esemény a valódi kapcsolódás katalizátora legyen, ne a termék végpontja. A Hobbeast sikere ne kizárólag feed impression, screen time vagy event count legyen. Későbbi mérésre alkalmas fő product outcome-ok:
- real-world participations,
- completed encounters,
- repeat encounters,
- recurring social circles,
- organizer reliability,
- community activity,
- meaningful connection proxy-k,
- offline activity generated.

Ez nem jogosít fel arra, hogy egészségügyi diagnózist, „magányszintet” vagy mentális betegséget inferálj. Social-health metrikákat csak önkéntes, privacy-preserving és nem diagnosztikus formában tervezz.

## Nem-regressziós végrehajtási protokoll

Minden kódmódosítás előtt:
1. Készíts impact mapet: mely route, komponens, hook, tábla, RPC, Edge Function, trigger, RLS policy, provider és teszt érintett.
2. Írd le a jelenlegi viselkedést és annak bizonyítékát.
3. Ha load-bearing vagy korábban deferred területhez nyúlsz, előbb készíts karakterizációs tesztet.
4. DB változtatás csak új, append-only migrationben történhet. Régi migrációt ne írj át.
5. RLS legyen explicit. Új public-schema tábla RLS nélkül nem fogadható el.
6. SECURITY DEFINER funkcióhoz explicit authorization guard, search_path, grant/revoke és audit szükséges.
7. Service-role adat ne kerüljön browser bundle-be.
8. Külső provider hívásnál timeout, abort, error normalization, rate-limit/backoff, telemetry és graceful degradation kell.
9. Ne törj meg régi URL-eket/route-okat; szükség esetén back-compat redirect.
10. Ne változtass meglévő business semantics-en „refaktor” címén.
11. Ne vezess be `as any` castokat azért, hogy a build zöld legyen. A meglévő szükséges castokat fokozatosan váltsd típusos adapterre.
12. A UI-ban ne legyen silent failure. User-facing hiba legyen érthető, admin/dev telemetry pedig technikai.
13. Minden mutation idempotenciáját és double-submit viselkedését vizsgáld.
14. Mobil + desktop + keyboard + basic screen-reader útvonal legyen támogatott.
15. A változtatás legyen rollbackolható.

## Kötelező minőségi kapuk

A repository állapotától és elérhető eszközöktől függően futtasd:
- reprodukálható dependency install a lockfile-ból (`npm ci` vagy a repo kanonikus megfelelője),
- `tsc --noEmit`,
- `npm test`,
- `npm run lint`,
- `npm run build`,
- `npm run release:validate`,
- releváns Playwright smoke/E2E,
- Edge Function/Deno tesztek, ha az érintett domainhez létrehozod a harnesst,
- migration dry-run / local Supabase validation, ha az infrastruktúra rendelkezésre áll.

Ha valamelyik nem futtatható környezeti ok miatt, ezt NE nevezd sikernek. Írd le:
- pontos parancs,
- pontos blocker,
- mely bizonyíték hiányzik,
- hogyan kell CI-ben/operátornál lefuttatni.

A ZIP elemzésekor a dependency binárisok kezdetben nem voltak telepítve; önmagában a `vite/vitest/eslint not found` tehát nem termékhiba, hanem környezeti baseline-hiány. Production release előtt viszont reprodukálható tiszta installból minden gate-nek futnia kell.

## Verziózás és dokumentáció

Minden prompt végrehajtása során:
- append-only módon frissítsd `CHANGELOG.md`-t;
- a repository `versioning/` szabályai szerint hozz létre az adott release-hez AI dev prompt / business request summary párt, ha ezt a governance előírja;
- frissítsd `docs/SPRINT_STATUS.md` vagy az új production roadmap státuszfájlt;
- új tanulságot `codingLessonsLearnt.local.md`-be appendelj;
- package version csak a repo release szabálya szerint változzon;
- ne töröld a történelmi verziófájlokat;
- dokumentáld a migration ID-kat, feature flag-eket, rollbacket és release evidence-et.

## Adatmodell és privacy alapelvek

A társas funkciók személyes és viselkedési adatokat érintenek. Kötelező:
- data minimization;
- explicit visibility és consent;
- block/report határ minden user-user felületnél;
- helyadatnál pontos koordináta csak akkor jelenjen meg másnak, ha erre a funkció ténylegesen jogosít és a user beleegyezett;
- public profilhoz külön publikus DTO/view használata; ne add át a teljes `profiles` rekordot;
- email/phone/private address ne szivárogjon;
- user deletion esetén az új social-domain rekordok törlési/anonymizálási viselkedése legyen definiálva;
- audit és moderation eseményeknek legyen retention policy-ja;
- simulated/generated usereket mindenhol egyértelműen különítsd el a valódi userektől.

## UI/UX alapelvek

Tartsd meg a Hobbeast jelenlegi energikus, community-forward arculatát. Ne alakítsd corporate admin dashboarddá a consumer felületet. Production minőség:
- konzisztens spacing/typography;
- skeleton/loading/empty/error/success állapot;
- mobil-first reszponzivitás;
- focus-visible;
- WCAG-kompatibilis kontraszt;
- touch target;
- nincs layout shift;
- nincs fölösleges modal nesting;
- destructive action confirm;
- user mindig tudja: mit csinált, mi történt, mi a következő lépés.

A social funkciók ne legyenek dating-app jellegűek. A „kivel csinálnál újra valamit?” mechanika activity/reconnection, nem romantikus matching.

## Végső delivery formátum az adott lépésben

A végrehajtás végén adj:
1. rövid root-cause/current-state összefoglalót;
2. módosított fájlok listáját;
3. DB/migration változásokat;
4. security/RLS változásokat;
5. user-facing funkciókat;
6. admin/automation változásokat;
7. teszteket és eredményeket;
8. build/lint/typecheck/release-validation eredményt;
9. regresszióellenőrzési checklistet;
10. ismert maradék kockázatokat;
11. rollback tervet;
12. changelog/versioning dokumentációt;
13. production evidence-et, amit ténylegesen ellenőriztél.

Ne állítsd, hogy deployoltál, migráltál, secretet rotáltál vagy külső providerben változtattál, ha ezt ténylegesen nem tetted meg és nem láttad a sikeres bizonyítékot.


# AZ ADOTT LÉPÉS SPECIÁLIS FELADATA


## CÉL

Valós találkozásokat szervező platform production launchja trust & safety nélkül nem kész. Építs minimum viable, de valóban működő safety rendszert, nem díszoldalt.

### Kötelező funkciók

1. Block:
   - user-user;
   - kétirányú discoverability kizárás;
   - matching/reconnection/circle/notifications kizárás;
   - közös event organizer-szükséghelyzetet privacy-safe módon kezeld.

2. Report:
   - user;
   - event;
   - organizer;
   - message/content;
   - reason taxonomy + free text opcionális;
   - attachment csak ha storage/policy kész;
   - reporter privacy.

3. Moderation queue:
   - status;
   - severity;
   - assignee;
   - evidence refs;
   - action;
   - appeal/note;
   - audit.

4. Enforcement:
   - warning;
   - content/event removal;
   - temporary suspension;
   - permanent ban csak explicit admin;
   - organizer restriction;
   - automated threshold csak review trigger, ne automatikus végleges büntetés.

5. Event safety:
   - public/private venue disclosure;
   - organizer contact rules;
   - emergency claimet ne tegyen a platform, ha nincs szolgáltatás;
   - prohibited content policy hook;
   - cancellation/report flow.

6. Privacy:
   - exact location minimization;
   - public profile view;
   - export/delete;
   - retention;
   - audit retention;
   - consent records;
   - analytics pseudonymization;
   - external providers adatmegosztás dokumentálása.

7. Legal/product blockers:
   A kód/requirements nem támaszt alá kész age-policy, minors-policy, ToS/privacy legal text vagy emergency process meglétét. Ezeket ne találj ki jogi tanácsként. Hozz létre explicit launch blockers checklistet, hogy jogi/üzemeltetői döntés szükséges.

### Acceptance

Blocked user nem szivárog recommendationben. Report RLS védi reportert. Moderator action auditált. Consumer UI-ban könnyen elérhető report/block, de nem agresszív.



# RÉSZLETES IMPLEMENTÁCIÓS ÉS ELLENŐRZÉSI APPENDIX

## A. Kötelező discovery lépések

Az első commit előtt készíts belső inventoryt. Ne indulj el név alapján feltételezve, hogy egy komponens mit csinál. Használj kódkeresést az alábbiakra: az érintett tábla összes `.from()` használata, RPC-k, Edge Function invoke-ok, notification type-ok, route-ok, query key-k, migrationok, generált Supabase type-ok, admin capabilityk és tesztek. Nézd meg a git történetet/versioning dokumentációt is, mert több mai furcsaság tudatos back-compat döntés lehet.

Minden új DB fogalomnál válaszolj implementáció előtt:
- Van már ugyanez más néven?
- Van legacy migration, amely részlegesen implementálja?
- Használja admin vagy Edge Function?
- Milyen delete semantics kell?
- Milyen unique constraint kell?
- Milyen index kell?
- Milyen RLS policy kell SELECT/INSERT/UPDATE/DELETE-re?
- Kell realtime?
- Kell audit?
- Kell generated-user exclusion?
- Kell external source provenance?

## B. Migration szabály

Új migration:
- timestampelt és append-only;
- transaction ahol lehetséges;
- `IF EXISTS`/`IF NOT EXISTS` csak ott, ahol nem maszkol hibát;
- destructive változás kétfázisú;
- backfill külön mérhető lépés;
- új NOT NULL előtt backfill/default;
- új enum helyett mérlegeld check constraint/domain table használatát a repo mintája szerint;
- index concurrent opció csak ha az adott Supabase/Postgres migration környezet támogatja;
- rollback SQL vagy legalább explicit rollback strategy dokumentálva.

RLS tesztpersona:
- anonymous;
- normal authenticated user A;
- user B;
- organizer of event X;
- unrelated organizer;
- admin;
- service role.
Minden új user-user adatnál teszteld, hogy user A nem olvashatja user B privát rekordját.

## C. API/Edge contract

Minden új/átalakított Edge Function:
- input schema validation;
- auth extraction;
- authorization;
- request id;
- body size limit;
- explicit action enum;
- typed success/error;
- status code;
- CORS a repo mintája szerint;
- timeout;
- no secret echo;
- idempotency ahol mutation;
- provider abort;
- structured error code.

Ne adj vissza raw provider response-t browsernek, ha normalized DTO elég.

## D. React/TanStack szabályok

- query key factory domainenként;
- abort signal támogatás;
- mutation után célzott invalidation;
- ne invalidálj minden queryt;
- form schema Zoddal ott, ahol már ez a stack;
- server error -> field/global mapping;
- loading skeleton;
- stale state;
- retry policy mutationnél óvatos;
- component unmount után state update ne;
- expensive list memo/virtualization csak mérés alapján;
- route-level chunkinget ne bontsd vissza.

## E. Social domain invariánsok

- RSVP önmagában nem encounter.
- Encounter csak tényleges attendance/check-in/completion után.
- Reconnection választás privát.
- Mutual reconnection idempotens.
- Block minden recommendation és social notification fölött prioritást élvez.
- Circle membership explicit.
- Virtual hub system segmentation nem automatikusan public community.
- Generated user nem valódi social proof.
- AI nem generálhat keresletet adatok nélkül.
- External event ownership nem egyenlő Hobbeast organizer ownershippel.

## F. Admin invariánsok

- browser oldali `isAdmin` csak UX, nem security boundary;
- privileged mutation server-side authorization;
- bulk action preview;
- job id;
- progress;
- audit;
- partial failure;
- no secret display;
- no unrestricted raw SQL;
- impersonation, ha van/lesz, explicit banner + audit + külön permission; ne építsd be mellékesen.

## G. UX edge case mátrix

Minden releváns user flow-nál teszteld:
- nincs adat;
- egy adat;
- sok adat;
- lassú hálózat;
- request fail;
- retry;
- session lejár;
- duplakatt;
- mobil 360px;
- tablet;
- desktop;
- keyboard only;
- hosszú magyar szöveg;
- ékezet;
- külföldi város;
- null avatar;
- deleted event;
- full event;
- waitlist;
- blocked participant;
- generated test data.

## H. Release evidence

A végső válaszban ne csak azt írd „tests passed”. Add meg:
- command;
- exit code;
- test count;
- build output summary;
- bundle delta a fő route-okra;
- migration list;
- manual smoke steps;
- screenshot/Playwright evidence, ha elérhető;
- staging URL csak ha ténylegesen van és ellenőrizted;
- production deploy csak explicit jogosultsággal.

## I. Regressziós checklist – minden lépés után

Legalább:
- landing;
- navbar;
- auth login/signup/reset;
- profile load/save;
- Explore;
- Events list/filter;
- native EventDetail;
- external EventDetail;
- create event;
- edit event;
- join;
- cancel;
- waitlist;
- organizer load;
- participant update;
- check-in;
- organizer message;
- notifications;
- admin auth;
- admin users;
- hubs;
- auto events;
- external import;
- place search;
- address autocomplete;
- venue suggestion;
- Mapy trip planner;
- account deletion;
- release validate.

Ha az adott körben valamelyik nem érintett, legalább smoke szinten ellenőrizd; ha environment miatt nem lehet, jelöld NOT VERIFIED-nek.


PREMIUM ADDENDUM
Trust, safety, moderation és adatvédelem
Layered trust & safety
Készíts egyértelmű policy-taxonomiát: harassment, hate, sexual misconduct, fraud/scam, unsafe event, impersonation, underage concern, privacy exposure, spam, prohibited commercial behavior, self-harm emergency routing. A rendszer ne próbáljon klinikai értékelést adni.

A report flow kérjen minimális, releváns információt; adjon egyértelmű confirmationt, case ID-t ahol helyénvaló, és jelezze a sürgős veszély esetén azonnali helyi vészhelyzeti segítség szükségességét. Ne ígérj azonnali emberi válaszidőt, ha nincs biztosított coverage.

Legyen case lifecycle: received -> triaged -> investigating -> actioned -> appealed -> closed, valamint evidence retention és access restriction. A reporter és reported user privacy-je külön védendő.

Készíts graduated enforcement modellt: warning, education, feature restriction, temporary suspension, permanent ban, organizer restriction, content/event takedown. Minden actionhoz policy reason, evidence link, duration, appeal útvonal és audit kell.

Event safety
Hozz létre event safety minimumot: nyilvános találkozási pont, host accountability, kapacitás, résztvevői szabályok, venue suitability, emergency/incident contact process. Ne erőltesd ugyanezt minden event formátumra; legyen kockázatalapú konfiguráció.

Privát lakás, éjszakai, fizikai kontaktussal járó vagy magasabb kockázatú programok esetén legyen külön policy/risk review, de ne diszkriminatív automatikus tiltás.

A safety score, ha létezik, ne legyen opaque automatikus döntési egyedüli alapja; legyen magyarázat, human review és appeal.

Privacy engineering
Tarts data inventoryt: adatmező, cél, jogalap/termékcél, retention, hozzáférés, export/delete viselkedés, downstream processor. Minden új social/AI/analytics mező ehhez legyen hozzáadva.

Vezess be retention jobokat és törlési bizonyítékot. Soft delete és hard delete különbsége legyen domainenként dokumentált.

# AZ ADOTT LÉPÉS ZÁRÁSA

A végén állj meg és készíts tényszerű release reportot. Ne kezdd automatikusan a következő prompt scope-ját ugyanabban a release-ben, ha ez összemossa a rollback-határokat. A következő prompt csak a jelenlegi lépés zöld vagy explicit feltételesen elfogadott baseline-jára épüljön.

Második kör workflow
Olvasd vissza a teljes eredeti promptot és annak addendumát.

Készíts Requirement Coverage Matrix táblát: eredeti követelmény, addendum követelmény, implementált bizonyíték, teszt, kockázat, rollback, státusz.

Keresd meg azokat a hiányokat, amelyek nem funkcióhiányok, hanem production gapek: idempotencia, authorization, RLS, audit, feature flag, error state, empty state, loading state, mobile, accessibility, observability, rate limit, retry, data retention, rollback, documentation.

Csak additív, back-compatible módosítást hajts végre. Ne távolíts el kódot, táblát, route-ot, paramétert, UI elemet vagy régi üzleti logikát csak azért, mert van újabb megoldás.

Minden második körös változás előtt és után futtasd a releváns teszteket; ha nem futtatható, dokumentáld a blokkolót és ne állíts sikeres validációt.

Ellenőrizd, hogy az új funkció nem növeli aránytalanul a landing vagy kritikus route bundle-jét. Használj lazy loadingot vagy szerveroldali boundaryt, ahol indokolt.

Ellenőrizd, hogy a feature flag alapértelmezett állapota biztonságos, és a rollback nem igényel kóddeployt, ha a funkció szerver-/config-oldalról kikapcsolható.

prémium acceptance checklist
Nincs meglévő route, API, schema vagy UI-flow eltávolítva.

Új migration append-only, RLS-szel, index/constraint indoklással és rollback dokumentációval készült.

Új mutation idempotens vagy double-submit ellen védett.

Új user-to-user surface block/report/privacy boundaryt kapott.

Új admin action least-privilege authorizationt és audit trailt kapott.

Új külső hívás timeoutot, normalizált hibát, retry/backoffot, telemetryt és kill switch-et kapott.

Minden új UI rendelkezik loading, empty, error, success, mobile, keyboard és alap screen-reader állapottal.

A discovery/AI/analytics funkció nem inferál érzékeny személyes állapotot és nem tárol szükségtelen személyes adatot.

A notificationok preference-, quiet-hour- és frequency-cap-kompatibilisek.

A performance budgetet mérted vagy egyértelműen dokumentáltad, miért nem mérhető a környezetben.

A release evidence valódi futtatásból származik; a BLOCKED státuszok pontosan dokumentáltak.

CHANGELOG, sprint status, ADR/runbook és versioning output append-only módon frissült.