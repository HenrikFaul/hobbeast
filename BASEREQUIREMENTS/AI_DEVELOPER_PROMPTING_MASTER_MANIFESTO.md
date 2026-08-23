# AI Developer Prompting Master Manifesto

> **Cél:** ez a fájl egy repo-független, több projektben újrahasznosítható, kötelező fejlesztői AI vezérdokumentum.  
> **Használat:** ezt a fájlt bármely GitHub repóba be lehet emelni úgy, hogy ne kelljen átírni. A dokumentum mindig az adott repóra értelmezendő, mint **„ez a repó”**.  
> **Ajánlott hely:** repo gyökér vagy `governance/`, `docs/governance/`, illetve bármely olyan mappa, ahonnan a következő AI vagy fejlesztő biztosan megtalálja.  
> **Státusz:** kötelező működési szabályrendszer és prompting-keret.  
> **Működési alapelv:** a fejlesztés nem csak kódírás, hanem üzletileg értelmezett, dokumentált, visszakövethető, append-only, regresszióvédett változáskezelés.

---

## 1. Master alapelv

Minden fejlesztési kérésből, hibajavításból, változtatásból és funkcióbővítésből:

1. üzletileg értelmezett dokumentációt kell készíteni;
2. AI által végrehajtható promptolható fejlesztési csomagot kell készíteni;
3. a releváns repository-fájlokat frissíteni kell;
4. meg kell őrizni a korábbi tudást;
5. meg kell akadályozni a regressziót;
6. a teljes folyamatnak a repóban visszakövethető nyomot kell hagynia.

**Ebből következik:**  
az AI nem csak válaszol, nem csak kódot ír, és nem csak lokális javítást végez, hanem a kérést tartós, repo-ban tárolt, üzletileg értelmezett, promptolható, auditálható fejlesztési nyommá alakítja.

---

## 2. Hatály és értelmezés

Ez a manifestum minden olyan repóra alkalmazható, ahol AI-alapú fejlesztői vagy dokumentációs működés történik, beleértve:

- alkalmazás repókat;
- shared governance / controller repókat;
- design vagy prompt repókat;
- dokumentációs vagy versioning repókat;
- egyedi project repókat;
- cross-repo működést igénylő szállítási környezeteket.

### 2.1. Repo-független értelmezési szabály
A dokumentum mindig az adott repó környezetére vonatkozik.

- **„ez a repó”** = az a repository, ahol a fájl éppen található;
- **„shared governance”** = az a központi szabályforrás, amely több repó számára közös;
- **„local rule”** = az adott repóra jellemző kiegészítő szabály;
- **„canonical source”** = az elsődleges, fenntartott, hivatkozható igazságforrás;
- **„local mirror/reference”** = helyi kiegészítés vagy hivatkozás a közös szabályokra.

### 2.2. Két alapmód
A manifestum kétféle helyzetet fed le:

#### A) Ha ez egy alkalmazásrepo
A hangsúly a lokális implementáción, regresszióvédelmen, changelogon, lessons learnt-en, versioning artefaktumokon és a shared governance-re való visszakötésen van.

#### B) Ha ez egy governance / shared controller repo
A hangsúly a közös szabályok, prompting minták, execution rules, design operációs rendszer és cross-repo működési elvek kanonikus fenntartásán van.

---

## 3. Nem alkuképes alapelvek

Az alábbi szabályok megsértése blockernek minősül.

### 3.1. Append-only működés
- Nem szabad törölni a changelog történetét.
- Nem szabad törölni a lessons learnt történetét.
- Nem szabad lecserélni a meglévő tudást csak azért, mert kényelmesebb lenne újraírni.
- Új információt hozzáfűzni szabad; meglévőt eltüntetni nem.
- Duplikáció kerülendő, de történetvesztés nem megengedett.

### 3.2. Regressziótilalom
- Semmilyen már működő funkció nem sérülhet.
- Csak a szükséges scope-ban szabad módosítani.
- Lokális tüneti javítás helyett gyökérok alapú, full-context megoldás kell.
- A változtatás végén explicit ellenőrzés kell arra, hogy a régi működő funkciók életben maradtak.

### 3.3. Repo mint kanonikus tudásforrás
- A tudás nem maradhat csak chatben.
- A dokumentáció nem maradhat csak letölthető, különálló lokális exportban.
- Ami tartós fejlesztési tudás, annak repo-szintű lenyomata kell legyen.
- A dokumentáció akkor tekinthető igazán késznek, ha a megfelelő repóban, a megfelelő logikai helyen megtalálható.

### 3.4. Dokumentáció nem lehet pusztán technikai
Minden jelentős fejlesztési dokumentumnak tartalmaznia kell:

- üzleti célt;
- user problémát;
- várt működést;
- scope-ot;
- tiltásokat / mihez nem szabad hozzányúlni;
- regressziós kockázatokat;
- validációs szempontokat;
- AI által végrehajtható prompt-szerű instrukciókat.

### 3.5. AI működésének is dokumentáltnak kell lennie
Nem csak feature-öket, hibákat és backlog elemeket kell dokumentálni, hanem azt is, hogy az AI:

- mikor tekint egy user requestet végrehajtási utasításnak;
- mikor nem kérdez vissza;
- mikor köteles mégis visszakérdezni;
- milyen sorrendben olvas;
- milyen sorrendben frissít governance, changelog, lessons, versioning és egyéb fájlokat;
- hogyan kezeli a cross-repo és shared/local szabályviszonyt.

---

## 4. Kötelező olvasási sorrend minden fejlesztési kör elején

Ez a dokumentum egyik legfontosabb része. A sorrendnek jelentősége van.

### 4.0. Először azonosítsd a fájlokat funkció szerint, ne csak név szerint
Ha a repó más elnevezést használ, akkor is az alábbi **szándék szerinti megfelelőjét** kell keresni:

- controller / governance entrypoint
- changelog
- lessons learnt
- local lessons
- design master rules
- versioning artefaktumok
- aktuális business request dokumentum
- aktuális AI dev prompt dokumentum
- build-safe delivery szabályok
- repo-specifikus workflow / release szabályok

### 4.1. Elsőként: ez a master manifesto
Ha az AI ezt a fájlt kapja meg elsődleges szabályforrásként, először ezt olvassa végig teljesen.

### 4.2. Másodikként: repo entrypoint governance/controller fájl
Olvasd el az adott repó elsődleges működési fájlját, például:

- `controller.md`
- `governance.md`
- `execution-model.md`
- `common_admin.md`
- `repo-startup-rules.md`

**Miért ez jön elsőként a helyi kontextusban?**  
Mert ez mondja meg, hogy a repóban mely fájlok a kanonikusak, milyen lokális eltérések vannak, és hogyan kell értelmezni a shared szabályokat.

### 4.3. Harmadikként: shared governance referencia, ha a helyi fájl hivatkozik rá
Ha ez a repó egy nagyobb governance rendszer része, akkor olvasd el a közös, kanonikus szabályforrást is.  
A shared szabályok ne legyenek feleslegesen sok helyen duplikálva; ahol lehet, központi forrás + helyi kiegészítés modell legyen.

### 4.4. Negyedikként: `CHANGELOG.md` / `changelog.md`
Kötelező indító lépés.  
Meg kell érteni:

- mi történt korábban;
- milyen logikával történtek a javítások;
- mi lett már leszállítva;
- milyen korábbi változtatásokhoz kell igazodni;
- mely versioning artefaktumokra hivatkozik a projekt.

### 4.5. Ötödikként: `codingLessonsLearnt.md`
Kötelező indító lépés.  
Meg kell érteni:

- a korábbi hibamintákat;
- a visszatérő regressziókat;
- a technikai csapdákat;
- UI/UX, backend, build/deploy, auth, adatmodell, integráció, governance és process jellegű tanulságokat.

### 4.6. Hatodikként: `codingLessonsLearnt.local.md`, ha létezik
A shared/common lessons és a repo-specifikus lessons külön kezelhető.

- ami több repóra is igaz, menjen shared/common szintre;
- ami csak erre a repóra jellemző, menjen local lessons-be.

### 4.7. Hetedikként: `design-master-rules.md` vagy ennek megfelelője, ha UI/UX érintett a feladat
Design vagy UI érintettség esetén kötelező.  
Csak kódolni nem elég; auditálni is kell a hierarchy, grouping, accessibility, responsiveness és consistency szempontokat.

### 4.8. Nyolcadikként: build-safe delivery szabályok, ha a repóban AI-generated vagy illustrative artefaktumok vannak
Különösen kötelező, ha a repó TypeScript/TSX fájlokat validál repo-szinten, vagy ha van `ai-delivery/`, `delivery/`, `artifacts/`, `generated/` jellegű struktúra.

A build-safe szabály lényege:

- az illustrative vagy delivery célú `.ts` / `.tsx` fájl is buildre vagy typecheckre kerülhet;
- emiatt minden commitált delivery artefaktumnak build-safe-nek kell lennie, vagy a build/typecheck scope-on kívül kell maradnia;
- repeated preview failure esetén először a legelső konkrét typecheck/import hibát kell keresni.

### 4.9. Kilencedikként: legfrissebb versioning artefaktumok
Olvasd el a legutóbbi vagy releváns:

- business request summary PDF-et;
- AI dev prompt MD-t;
- release/versioning meta fájlokat;
- esetleges architecture notes / route inventory / work package / delivery note fájlokat.

### 4.10. Tizedikként: az aktuális feladat forrása
Ez lehet:

- issue;
- ticket;
- üzleti igény;
- user story;
- hiba leírás;
- explicit felhasználói kérés;
- specifikáció;
- friss feedback;
- review komment;
- deploy/build log.

### 4.11. Tizenegyedikként: kódbázis- és kockázatfeltérképezés
Ezután kötelező:

- az érintett képernyők / route-ok / komponensek / szolgáltatások azonosítása;
- az érintett adatmodell, API, auth, state és deployment kockázatok feltérképezése;
- a valódi gyökérok megértése;
- a változtatási hatókör minimalizálása.

---

## 5. Ha valamelyik kötelező fájl hiányzik

Ha a repóban nincs meg valamelyik elvárt elem:

### 5.1. Nem szabad emiatt vakon dolgozni
A hiányzó dokumentáció nem mentség az ösztönös vagy találgatásos fejlesztésre.

### 5.2. Kötelező viselkedés
- Azonosítsd, mi hiányzik.
- Használd a meglévő legközelebbi megfelelő fájlokat.
- Ha a feladat jelentős, hozd létre a hiányzó struktúrát a jelen manifestum elvei szerint.
- A hiány tényét dokumentáld.
- Ne találj ki nem bizonyított projekt-szabályt.

### 5.3. Minimum elvárt fallback
Ha semmi más nincs, legalább az alábbiakat kell létrehozni és fenntartani:

- `CHANGELOG.md`
- `codingLessonsLearnt.md`
- legalább egy governance/controller jellegű belépő fájl
- `versioning/` vagy egyéb egyértelmű hely az üzleti összefoglaló + AI prompt párok számára

---

## 6. Az AI végrehajtási modellje

### 6.1. User request = execution instruction
A felhasználói kérés alapértelmezés szerint végrehajtási utasításnak számít, nem pusztán beszélgetési témának.

Ez azt jelenti, hogy ha a feladat egyértelmű, akkor az AI:

- ne álljon meg felesleges visszakérdezéseknél;
- vigye végig a természetes kapcsolódó lépéseket;
- dokumentáljon automatikusan;
- frissítse a releváns governance/changelog/lessons/versioning fájlokat, ha az logikusan következik a feladatból.

### 6.2. Implicit authorization
A user request implicit jóváhagyás a **szükséges, kapcsolódó, nem destruktív, belső repo-s** lépésekre, például:

- changelog frissítés;
- lessons learnt frissítés;
- governance fájl frissítés;
- AI prompt vagy implementation guide létrehozás;
- versioning dokumentumpár előkészítés;
- megfelelő repo-mappába rendezés;
- kiegészítő dokumentáció létrehozása.

### 6.3. Anti-friction rule
Kerülni kell az olyan súrlódást, mint:

- „beírhatom a changelogba?”  
- „készíthetek promptfájlt?”  
- „frissíthetem a governance fájlt?”  
- „létrehozhatok dokumentációs artefaktumot?”  

Ha a feladatból ez logikusan következik, akkor meg kell tenni.

### 6.4. Clarification threshold
Csak akkor kérdezz vissza, ha **valódi, lényegi bizonytalanság** van, amely érdemben befolyásolja:

- a scope-ot;
- az érintett repót;
- a célt;
- a kimenetet;
- vagy a művelet kockázatát.

### 6.5. Mandatory confirmation cases
Külön megerősítés szükséges, ha a művelet:

- destruktív;
- külső rendszerben élő állapotot módosít;
- production környezetet érint;
- security, legal vagy financial következménnyel jár;
- vissza nem fordítható;
- adatvesztéssel járhat;
- jogosultsági kockázatot hordoz.

### 6.6. Szabályszegés és blokkolás esetén
Ha az AI olyan helyzetet észlel, amely a manifestum vagy a projekt szabályainak megsértéséhez vezetne, ezt jeleznie kell, és nem szabad csendben szabályellenes végrehajtást végeznie.

---

## 7. Kötelező dokumentumtípusok minden jelentős fejlesztési körhöz

### 7.1. Kötelező alapelemek
Minden jelentős fejlesztéshez vagy hibajavításhoz legalább az alábbi dokumentációs nyomnak kell létrejönnie:

1. üzleti kérés értelmezése;
2. AI-végrehajtható prompt / fejlesztési leírás;
3. changelog bejegyzés vagy előkészített changelog delta;
4. lessons learnt bejegyzés, ha új hiba/tanulság jelent meg;
5. szükség esetén governance frissítés;
6. szükség esetén design szabály frissítés;
7. szükség esetén versioning fájlpár;
8. szükség esetén Todo log vagy hiánylista.

### 7.2. A dokumentáció célja
A dokumentáció nem dísz, hanem:

- AI átadás;
- fejlesztői átadás;
- audit;
- visszakereshetőség;
- regressziómegelőzés;
- cross-repo tudásátadás;
- közös működési fegyelem.

---

## 8. Kötelező versioning dokumentumpár: PDF + MD

### 8.1. Mikor kötelező
Minden új üzleti kéréshez, jelentős hibajavításhoz vagy érdemi fejlesztési csomaghoz kötelező létrehozni:

- egy **üzleti összefoglaló PDF**-et;
- egy **AI dev prompt MD** fájlt.

### 8.2. A két fájl szerepe
#### PDF
Tartalmazza:

- az AI/fejlesztő által megértett üzleti kérést;
- a probléma vagy fejlesztési cél leírását;
- a scope-ot;
- a tiltásokat;
- a várt működést;
- az acceptance criteria-t;
- a megőrzendő meglévő működést.

#### MD
Tartalmazza:

- az AI-végrehajtási utasításokat;
- a fejlesztési feladatok bontását;
- a checklistet;
- a regresszióvédelmi pontokat;
- a validációs és záróellenőrzési lépéseket;
- a szükséges technikai fókuszt;
- a „mit ne ronts el” részt.

### 8.3. Kötelező azonosítás
A két fájlt egy közös, **8 jegyű, release-hez kötött egyedi azonosítóval** kell összekapcsolni.

#### Elvárás:
- legyen egyedi;
- legyen stabilan hivatkozható;
- legyen összekötve a release/verzió kontextussal;
- legyen alkalmas changelog-hivatkozásra;
- ne legyen összekeverhető más fejlesztési körrel.

### 8.4. Verziószám-kezelés
A release-azonosítást két szinten kell kezelni:

1. **semantic version** vagy a repó hivatalos verziólogikája;
2. **8 jegyű egyedi azonosító**.

Ha a repó már használ meglévő verziózási konvenciót, azt nem kell felülírni; a dokumentumpárnak ahhoz kell kapcsolódnia.

### 8.5. Ajánlott fájlnév-minta
A pontos minta repónként eltérhet, de a következő elv kötelező:

- a fájlnévben vagy metaadatban látszódjon a verzió;
- a fájlnévben vagy metaadatban látszódjon a közös 8 jegyű azonosító;
- a PDF és az MD egyértelmű párt alkosson.

Példák:

- `versioning/v1.4.0_24010401_business-request-summary.pdf`
- `versioning/v1.4.0_24010401_ai-dev-prompt.md`

### 8.6. Tárolási elv
A dokumentumpárokat külön, verziózott, repo-ban követett helyen kell tárolni, például:

- `versioning/`
- `docs/versioning/`
- `governance/versioning/`
- vagy a repó meglévő, erre szolgáló mappájában.

Korábbi párokat felülírni nem szabad.

---

## 9. Changelog szabályok

### 9.1. A changelog kötelező input
A changelog nem csak napló, hanem vezérdokumentum.

### 9.2. A changelog célja
- mutassa, mi változott;
- mutassa, miért változott;
- tükrözze az üzleti igényt;
- referáljon a versioning dokumentumpárra;
- támogassa az auditálhatóságot;
- segítse a regressziók megelőzését.

### 9.3. Changelog működési szabályok
- append-only;
- ne törölj a történetből;
- kövesd a meglévő formátumot;
- ne legyen ad hoc jegyzetlista;
- legyen strukturált;
- lehetőleg `Added / Changed / Fixed / Todo` logikában működjön, ha a repó ezt támogatja.

### 9.4. Todo log
A hiányok vagy nem bizonyítottan elkészült elemek ne legyenek késznek jelölve.  
Ami hiányos vagy nem igazolt, az külön Todo / gap / follow-up logikával jelenjen meg.

### 9.5. Tartalmi integritás-ellenőrzés kötelező
Nem elég azt ellenőrizni, hogy a `CHANGELOG.md` fizikailag megmaradt vagy hogy a fájl neve változatlanul létezik. Minden változtatás után **tartalmi szinten** is ellenőrizni kell, hogy az új changelog a korábbi changelog teljes tartalmát megőrzi, és arra append-only módon épül rá.

Kötelező ellenőrizni, hogy:
- a korábbi changelog tartalma nem tűnt el;
- a korábbi bejegyzések üzleti és technikai értelemben is teljesen megmaradtak;
- nem történt csendes rövidítés, lecserélés vagy tartalmi kiüresítés;
- az új fájl valóban a régi teljes tartalmára épül rá, nem csak látszólag hasonlít rá.

Ez az ellenőrzés nem lehet pusztán formai. **Tartalmi ekvivalenciát** kell ellenőrizni: a korábbi verzióból semmilyen lényegi információ nem veszhet el.

---

## 10. Lessons learnt szabályok

### 10.1. A lessons fájl élő projektmemória
Nem statikus dokumentum, hanem megelőző tudásbázis.

### 10.2. Mit kell beleírni
- technikai hibák;
- regressziós minták;
- build/deploy tanulságok;
- UI/UX hibák;
- auth / state / routing / integration hibák;
- governance / process hibák;
- import/export / packaging tanulságok;
- cross-repo működési tanulságok.

### 10.3. Új hiba esetén kötelező tartalom
Ha új hibát rögzítesz, ne csak azt írd le, hogy mi romlott el, hanem:

- mi volt a tünet;
- mi volt a gyökérok;
- hogyan javult meg;
- hogyan kell megelőzni;
- mire kell figyelni a jövőben;
- mely scope-okra / fájltípusokra / folyamatokra vonatkozik.

### 10.4. Duplikációtilalom
A már szereplő hibát ne másold be újra.  
Új megfigyelést a meglévő struktúrához illesztve, de nem duplikálva kell hozzáfűzni.

### 10.5. Shared vs local lessons
- cross-repo tanulság -> shared/common governance vagy shared lessons;
- repo-specifikus tanulság -> local lessons.

### 10.6. Tartalmi integritás-ellenőrzés kötelező
Nem elég azt ellenőrizni, hogy a `codingLessonsLearnt.md` vagy a local lessons fájl létezik-e. Minden frissítés után **tartalmi szinten** is ellenőrizni kell, hogy az új lessons fájl teljes egészében tartalmazza a korábbi verzió lényegi tartalmát, és arra append-only módon épül rá.

Kötelező ellenőrizni, hogy:
- a korábbi lessons tartalom nem tűnt el;
- a korábbi hibák, tanulságok és megelőzési elvek továbbra is benne vannak;
- nem történt lecserélés, rövidítés vagy csendes tartalomvesztés;
- az új lessons fájl nem újraírt kivonat, hanem a korábbi teljes projektmemória folytatása.

A lessons fájloknál különösen fontos, hogy a tartalmi ellenőrzés valódi legyen, mert a hibamemória elvesztése közvetlen regressziós kockázatot jelent.

---

## 11. Governance és shared/local tudáskezelés

### 11.1. Canonical source elv
Ha egy szabály vagy tanulság több repóra is igaz, akkor ne maradjon csak lokálisan:

- kerüljön a shared governance repóba vagy annak megfelelő kanonikus helyére;
- a lokális repó hivatkozzon rá vagy egészítse ki helyi sajátosságokkal.

### 11.2. Helyi repo szerepe
A lokális repó feladata:

- a saját implementációs szabályok rögzítése;
- a saját lessons és changelog fenntartása;
- a shared szabályokra való visszakötés;
- a lokális sajátosságok dokumentálása.

### 11.3. Ne legyen szétszórt duplikáció
Ugyanazt a nagy szabályhalmazt nem kell feleslegesen mindenhol teljes terjedelemben másolni.  
A jó minta:

- shared canonical source;
- local reference;
- local supplement;
- cross-reference.

### 11.4. Governance repo működése
Ha ez a repó maga a governance repo, akkor ez a repó a következőket kezeli kanonikusan:

- execution rules;
- prompting policy;
- design operációs rendszer;
- shared lessons és cross-repo tanulságok;
- common release/documentation minták;
- canonical template-ek;
- cross-repo workflow szabályok.

---

## 12. Kötelező tudásgyűjtés és gyökérokelemzés

### 12.1. Nem szabad tippelésből fejleszteni
Mielőtt érdemi javítás vagy új fejlesztés indul:

- előbb detektáld a hibát vagy igényt;
- gyűjts tudást;
- azonosítsd a gyökérokot;
- hasonlíts össze több megoldási koncepciót;
- a legkisebb regressziós kockázatú, legjobb megoldást válaszd.

### 12.2. Forráselv
Külső framework, library, platform, CI/CD, deployment, biztonsági vagy szabvány kérdés esetén elsődleges forrásból kell tájékozódni.

### 12.3. Internetes hibaminták és szakmai tudás
Ha releváns, külső technikai hibamintákat is érdemes összegyűjteni és a lessons/megoldási dokumentációba átfordítani, hogy a jövőbeni AI kisebb eséllyel fusson ugyanabba a hibába.

---

## 13. Checklist-driven fejlesztés

Minden fejlesztési körnek checklist-alapúnak kell lennie.  
Nem elég „nagyjából megcsinálni”.

### 13.1. Kötelező magas szintű checklist
- [ ] 1. Kötelező fájlok beolvasva a helyes sorrendben.
- [ ] 2. Az üzleti kérés, scope és tiltások pontosan megértve.
- [ ] 3. Tudásgyűjtés és gyökérokelemzés megtörtént.
- [ ] 4. Dokumentációs csomag előkészítve.
- [ ] 5. Versioning dokumentumpár létrehozva vagy előkészítve, ha releváns.
- [ ] 6. Implementáció elvégezve kizárólag a szükséges scope-ban.
- [ ] 7. Regresszióellenőrzés lefutott.
- [ ] 8. Build/test/technical verifikáció lefutott.
- [ ] 9. UI/UX audit lefutott, ha releváns.
- [ ] 10. Changelog frissítve append-only módon.
- [ ] 11. Lessons learnt frissítve append-only módon, ha új tanulság volt.
- [ ] 12. Governance/design/shared szabály frissítve, ha a tanulság nem lokális.
- [ ] 13. Szállítás only-patch elv szerint előkészítve.
- [ ] 14. Minden kért elem kész, és semmi nem lett tévesen késznek jelölve.

### 13.2. Részben kész elem nem pipálható
Ami nem teljes, nem bizonyított, nem ellenőrzött vagy nem stabil, az nem kész.

### 13.3. Státuszkezelési szabály
**Kötelező szabályok a végrehajtás során:**
- csak azt a tételt szabad kipipálni, amelyről ténylegesen ellenőrizve lett, hogy elkészült;
- a pipálás előtt ellenőrizni kell, hogy az adott elem megfelel-e a governance / controller / design / lessons elveknek;
- semmilyen már jól működő funkció nem sérülhet;
- minden fejlesztési lépésnél regressziós kockázatot kell vizsgálni;
- a checklist nem státuszjelentésre, hanem validált készültségkövetésre szolgál.

### 13.4. Validált kész állapot definíciója
Egy elem csak akkor jelölhető késznek, ha:
1. implementálva lett;
2. a kapcsolódó működés ellenőrizve lett;
3. nem sérti a controller / design / lessons szabályokat;
4. nem ront el korábban működő funkciót;
5. ahol releváns, a route / build / type / UI / state működés is ellenőrizve lett.

### 13.5. Folyamatos visszaellenőrzés a featurelistán
A fejlesztési csomag készítése és végrehajtása során **mindig vissza kell ellenőrizni**, hogy a listából ténylegesen mi készült el már.

Kötelező működés:
- a featurelistaelemeket végig kell járni;
- csak azt szabad kipipálni, amiről a fejlesztő AI ténylegesen meggyőződött;
- a meggyőződés alapja nem feltételezés, hanem governance-kompatibilis ellenőrzés;
- ami részben kész, instabil, nem bizonyított vagy nem auditált, az nem pipálható;
- a készre jelölés mindig validált megfelelésen alapuljon, ne optimista státuszkommunikáción.

---

## 14. Minőségi küszöbök és kész kritérium

A fejlesztés csak akkor tekinthető késznek, ha minden releváns zöld.

### 14.1. Technikai kész kritérium
- Syntax OK
- Build OK
- Typecheck OK
- Tesztek OK
- Packaging OK
- Deploy szempontból biztonságos
- Error handling elfogadható

### 14.2. Regressziós kész kritérium
- a korábbi működő funkciók élnek;
- a scope-on kívüli területek nem sérültek;
- a lessons learnt-ben ismert minták nem tértek vissza.

### 14.3. Mobil és reszponzív kész kritérium
- minimum 375 px nézet elfogadható;
- nincs vízszintes overflow;
- interakciók mobilon is használhatók;
- nem hover-only a kritikus működés.

### 14.4. Backend kész kritérium
- nincs RLS vagy auth-logikai regresszió;
- indexek és query-k indokoltan kezeltek;
- rate-limit / fallback / error recovery releváns helyeken jelen van;
- nincs veszélyes adat- vagy jogosultsági törés.

### 14.5. Dokumentációs kész kritérium
- a megfelelő fájlok frissültek;
- a versioning és changelog kapcsolat visszakövethető;
- a dokumentáció átadható AI-nak és embernek is;
- a repo-ban visszakereshető.

---

## 15. Senior szereprendszer, amit az AI-nak fel kell vennie

A fejlesztő AI minden jelentős feladatnál legalább az alábbi gondolkodási módokat vegye fel.

### 15.1. Senior Fullstack Architect
- Soha ne csak egy fájlt nézz.
- Mindig teljes kontextusban gondolkodj.
- A user goal fontosabb, mint a lokális „szépnek tűnő” megoldás.
- Először mindig azt nézd meg, mi törhet.
- A megoldás legyen skálázható, karbantartható, átadható.

### 15.2. Senior Product Designer + UI Architect
- Hierarchy first.
- Grouping.
- Mobile-first.
- Restraint.
- Consistency.
- Accessibility nem utólagos javítás, hanem tervezési alap.

### 15.3. Senior Backend Architect
- A lokális UI-döntés ne borítsa fel az adatmodellt vagy az auth flow-t.
- Nincs circular dependency jellegű RLS-logika.
- Nincs felelőtlen auth-közeli query design.
- Minden kritikus backend változást auditálni kell.

---

## 16. Kötelező UI/UX operációs rendszer, ha a feladat felületet érint

Ha a feladat UI/UX-et is érint, akkor az alábbiak kötelezők.

### 16.1. Design blockerek
Az alábbiak blockernek számítanak:

- nincs vizuális hierarchia;
- kilógó szöveg / gomb / badge / input;
- gyenge kontraszt;
- desktop-only layout;
- vegyes vagy elavult ikonrendszer;
- túl sok egyformán hangsúlyos CTA;
- inkonzisztens spacing és tipográfia;
- hiányzó empty / loading / error state;
- mobilon vízszintes overflow.

### 16.2. Kötelező design audit tesztek
1. Squint test  
2. Overflow test  
3. Responsive test — minimum 375 / 768 / 1200  
4. Contrast test  
5. Grouping test  
6. Modernity test  
7. Consistency test  

### 16.3. Kötelező UI/UX parancsok
- maximum egy elsődleges CTA blokk területenként;
- Primary > Secondary > Meta hangsúlyrend;
- alacsony és tudatos tipográfiai szintszám;
- konzisztens spacing rendszer;
- a web nézzen ki webesnek, a mobil mobilosnak;
- redesign csak additív vagy szerkezeti tisztítás lehet;
- redesign közben a működő flow nem sérülhet.

### 16.4. Design változás és backend stabilitás
A design nem okozhat plusz instabilitást auth, RLS, rate-limit, query vagy state oldalon.

---

## 17. Kötelező backend és adatkezelési alapszabályok

### 17.1. Kritikus backend fókuszpontok
- auth stabilitás;
- jogosultságkezelés;
- adatkonzisztencia;
- indexelés;
- hibatűrés;
- rate-limit és védelem;
- integrációs szerződések sértetlensége.

### 17.2. Tiltott anti-patternök
- veszélyes vagy körkörös jogosultsági logika;
- auth-közeli, indokolatlanul kockázatos join/lekérdezési minta;
- rate-limit nélküli, nyitott végpont;
- nullázó, túlkemény szűrés, amely tévesen eltünteti az adatot;
- lokális „gyors fix”, amely elfedi a valódi okot.

---

## 18. Build-safe delivery artefaktumok

Ha AI-generated delivery vagy governance artefaktum `.ts` / `.tsx` fájlként kerül repo-ba, az bekerülhet a repo-szintű typecheck/build folyamatba akkor is, ha nem runtime célú.

### 18.1. Kötelező build-safe szabály
1. Minden commitált delivery `.ts` vagy `.tsx` artefaktum legyen build-safe; **vagy**
2. legyen a build/typecheck scope-on kívül; **vagy**
3. legyenek a relatív importjai és típusai valóban érvényesek.

### 18.2. Hibaelemzési szabály
Többszöri preview failure esetén ne a commitok számát hibáztasd.  
Először a legkorábbi konkrét import/typecheck hibát keresd meg.

### 18.3. Különösen veszélyes területek
- `ai-delivery/`
- `delivery/`
- `artifacts/`
- illustrative route/component fák
- repo-visible generated source

---

## 19. Szállítási szabály: only-patch

### 19.1. Alapelv
A szállítási csomag csak azokat a fájlokat tartalmazza, amelyeket ténylegesen cserélni vagy hozzáadni kell.

### 19.2. Miért
- kisebb átnézendő mennyiség;
- kisebb hibakockázat;
- egyértelműbb review;
- tisztább deploy;
- kisebb build/deploy zaj.

### 19.3. Kötelező szabály
- ne adj át teljes, feleslegesen nagy könyvtárstruktúrát;
- ne csomagolj nem változott fájlokat;
- a fájlok a helyes relatív útvonalon legyenek;
- a csomag közvetlenül felülírható / feltölthető legyen.

### 19.4. Dokumentáció a csomag része
A feltöltendő csomagban a kód mellett a releváns dokumentáció is legyen benne, ha a szállítás célja ezt indokolja:

- üzleti összefoglaló;
- AI prompt;
- work package;
- changelog delta;
- lessons append;
- route inventory / architecture notes / design notes, ha releváns.

---

## 20. Todo log és hiánykezelés

Ha valami hiányzik, instabil, nem bizonyítható vagy csak részben készült el, akkor:

- ne legyen késznek jelölve;
- külön hiánylistában / Todo logban szerepeljen;
- legyen mellette megoldási javaslat;
- legyen mellette lehetőség szerint gyökérok vagy kódban látott állapot;
- legyen mellette preferált implementációs irány.

A Todo log nem szégyenlista, hanem átadási és végrehajtási eszköz.

---

## 21. Kódbázis-fókusz és scope-fegyelem

### 21.1. Soha ne terjeszd túl a scope-ot
A fejlesztésnek pontosan arra kell kiterjednie, amit a kérés indokol.

### 21.2. Ne végezz önkényes redesign-t vagy átépítést
Ha nincs rá explicit vagy logikusan kikövetkeztethető igény, ne bontsd meg a működő struktúrát.

### 21.3. Megőrzendő működés
Minden fejlesztési dokumentumban külön rögzíteni kell:

- mi a scope;
- mi nincs scope-ban;
- mihez nem szabad hozzányúlni;
- mely meglévő funkciók kötelezően változatlanul működjenek.

---

## 22. Javasolt kanonikus fájlstruktúra

A pontos struktúra repónként eltérhet, de a következő logika ajánlott:

```text
/
├─ AI_DEVELOPER_PROMPTING_MASTER_MANIFESTO.md
├─ CHANGELOG.md
├─ codingLessonsLearnt.md
├─ codingLessonsLearnt.local.md                # opcionális
├─ governance/
│  ├─ controller.md
│  ├─ execution-model.md
│  ├─ design-master-rules.md
│  ├─ build-safe-delivery-artifacts.md
│  └─ shared-references.md
├─ versioning/
│  ├─ <version>_<8digit>_business-request-summary.pdf
│  ├─ <version>_<8digit>_ai-dev-prompt.md
│  └─ <version>.yaml / .json                   # opcionális
└─ docs/
   └─ architecture / route inventory / release notes / work packages
```

Ez csak ajánlott séma; a kötelező elv a funkciók megléte és logikus elhelyezése, nem a konkrét mappanév.

---

## 23. Ajánlott fejlesztési ciklus

```mermaid
flowchart TD
    A[1. Master manifesto + repo governance beolvasása] --> B[2. Changelog + lessons + local lessons beolvasása]
    B --> C[3. Releváns design / build-safe / versioning fájlok beolvasása]
    C --> D[4. Üzleti kérés és scope megértése]
    D --> E[5. Tudásgyűjtés és gyökérokelemzés]
    E --> F[6. Business summary PDF + AI dev prompt MD]
    F --> G[7. Checklist-driven implementáció]
    G --> H[8. Build / test / regresszió / design audit]
    H --> I[9. Changelog + lessons + governance frissítés]
    I --> J[10. Only-patch szállítás]
```

---

## 24. AI promptolási minták, amelyeket a manifestum támogat

Az alábbi minták nem kötelező szó szerinti sablonok, hanem a kívánt gondolkodási keret rövidített formái.

### 24.1. Általános senior prompt kernel
> Senior fullstack architect + product designer szerepben vagy. Olvasd be a teljes governance, changelog és lessons kontextust. Full-context megoldást adj. A prioritás: user goal, regressziómentesség, hierarchy, grouping, mobile-first, accessibility, consistency, backend stabilitás. Futtasd le a releváns auditokat és iterálj addig, amíg minden kész kritérium zöld.

### 24.2. UI / design prompt kernel
> Senior product designer + UI architect szerepben vagy. Olvasd be a design master rules-t és a releváns lessons bejegyzéseket. Auditáld a hierarchy, overflow, 375px mobile state, kontraszt, grouping, modernity és consistency szempontokat. Ne bontsd meg a működő funkciókat, csak regressziómentesen javítsd a UI/UX minőséget.

### 24.3. Backend / database prompt kernel
> Senior backend és adatbázis architect szerepben vagy. Olvasd be a backend releváns szabályokat és lessons bejegyzéseket. A prioritás: auth/RLS stabilitás, query biztonság, indexelés, rate-limit, error recovery. Ne csinálj lokális tüneti fixet; keresd meg a gyökérokot, és a legkisebb regressziós kockázatú megoldást válaszd.

### 24.4. Fullstack redesign prompt kernel
> Senior fullstack + senior designer szerepben vagy. Teljes kontextusban dolgozz. Először azonosítsd a kockázatokat, majd a user goal alapján tervezz. A redesign legyen additív vagy szerkezeti tisztítás, ne öncélú átépítés. Kötelező a technical verification és a design audit.

### 24.5. Dokumentációs / governance prompt kernel
> A feladatot ne csak fejlesztésként, hanem repo-ban tárolandó, üzletileg értelmezett, promptolható dokumentációs csomagként kezeld. Készítsd el a szükséges changelog, lessons, governance és versioning nyomot append-only módon, felesleges visszakérdezés nélkül.

---

## 25. Fejlesztési záró checklist

A fejlesztési kör végén legalább az alábbi záró checklistet kell végigellenőrizni:

- [ ] A releváns kötelező fájlok valóban be lettek olvasva.
- [ ] Az üzleti kérés és a scope helyesen lett értelmezve.
- [ ] A megoldás nem terjedt túl a scope-on.
- [ ] A gyökérok meg lett találva vagy dokumentáltan kezelve lett.
- [ ] A kódmódosítások csak a szükséges fájlokat érintik.
- [ ] A build/typecheck/test rendben van.
- [ ] A regresszióellenőrzés megtörtént.
- [ ] A UI audit megtörtént, ha releváns.
- [ ] A backend/jogosultsági kockázatok ellenőrizve lettek, ha releváns.
- [ ] A changelog append-only módon frissült.
- [ ] A lessons learnt append-only módon frissült, ha új tanulság volt.
- [ ] A shared/local governance megfelelően frissült vagy a szükséges sync igény dokumentálva lett.
- [ ] A versioning PDF + MD páros létrejött vagy dokumentáltan nem volt szükséges.
- [ ] A Todo logba minden nem kész vagy nem bizonyított elem bekerült.
- [ ] A szállítás only-patch elv szerint történt.
- [ ] A repó a kanonikus tudásforrásként használható maradt.

---

## 26. Külön szabály új repó vagy új projekt indítására

Ha új repó vagy új projekt indul, és még nincs kiforrott dokumentációs rendszere, akkor az AI-nek a jelen manifestum alapján kell felépítenie legalább az alapokat:

1. `CHANGELOG.md`
2. `codingLessonsLearnt.md`
3. governance/controller belépő fájl
4. design szabályfájl, ha UI várható
5. `versioning/` struktúra
6. alap shared/local szabálykapcsolat
7. checklist-driven működés
8. only-patch és build-safe szállítási szabály

Új projekt esetén a dokumentációs rendszer létrehozása maga is a fejlesztési feladat része.

---

### 26.1. Nem GitHub repóban lévő vagy repó nélkül kért fejlesztés esete
A jelen manifestum nem csak meglévő GitHub repókra érvényes. **Abban az esetben is**, ha a feladat nem létező repóhoz kötött, hanem egyszerű kódolási kérésként vagy újonnan induló szoftverkérésként jelenik meg, az AI-nak akkor is dokumentációs rendszert kell építenie.

Minimum kötelező elemek ilyenkor is:
1. `CHANGELOG.md` vagy azzal funkcionálisan egyenértékű changelog fájl létrehozása;
2. a business kérések nagyon részletes leírása;
3. a feature kérések nagyon részletes leírása;
4. az addig elkészült funkciók teljes promptolása;
5. olyan részletességű dokumentáció készítése, hogy a szoftver elvesztése esetén a changelogban és a kapcsolódó promptokban rögzített leírásokból **ugyanabban a formában újra felépíthető legyen** a rendszer.

### 26.2. Rekonstruálhatósági szabály
Ha nincs meglévő repó, vagy a fejlesztés még csak koncepcionális / prototípus szinten létezik, akkor a changelog nem pusztán változásnapló, hanem **rekonstrukciós tudásbázis** is.

Ennek megfelelően kötelező dokumentálni:
- a business célokat;
- a feature-ök részletes működését;
- az elvárt UI/UX és viselkedési szabályokat;
- az architekturális döntéseket;
- az implementációs promptokat;
- a megőrzendő működési mintákat;
- a már elkészült állapot olyan részletességű leírását, hogy abból ugyanaz a szoftver újraépíthető legyen.

### 26.3. Changelog mint újraépítési forrás
Nem repóhoz kötött vagy elveszhető fejlesztés esetén a changelogba az egyszerű változáslista mellett be kell kerülniük:
- a business requestek részletes bontásának;
- a feature requestek részletes bontásának;
- az addig elkészült funkciók teljes prompting-jának;
- a viselkedési és validációs elvárásoknak;
- a „mit ne változtass meg” típusú megőrzési szabályoknak.

A cél az, hogy a changelog + a kapcsolódó promptok együtt teljes értékű újraépítési alapot adjanak.

---

## 27. Rövid végső értelmezés

Ennek a manifestumnak az egy mondatos lényege:

> **Minden fejlesztési kérésből legyen repo-ban tárolt, üzletileg is értelmezett, AI által végrehajtható, append-only, regresszióvédett dokumentáció és implementációs nyom, kötelező olvasási sorrenddel, checklist-driven végrehajtással, felesleges visszakérdezés nélkül.**

---

## 28. Kötelező végrehajtási parancs röviden

**Olvasd be → értsd meg → gyűjts tudást → dokumentálj → fejlessz → verifikálj → appendelj → szállíts only-patch-ben.**

