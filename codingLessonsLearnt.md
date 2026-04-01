# codingLessonsLearnt.md — ÖSSZEVONT GOVERNANCE ÉS LESSONS LEARNT TUDÁSBÁZIS

## ⚠️ UTASÍTÁSOK (MINDIG OLVASD EL ELŐSZÖR!)

**KÖTELEZŐ MUNKAFOLYAMAT — Minden fejlesztés előtt:**
1. Nyisd meg és olvasd végig ezt a fájlt MIELŐTT bármit kódolnál.
2. Ellenőrizd, hogy az új kódod nem tartalmaz-e az itt felsorolt hibamintákat.
3. Ha új hibát találsz vagy javítasz, AZONNAL appendeld a megfelelő kategóriába.
4. SOHA ne töröld a meglévő tartalmat — csak hozzáadni szabad.
5. SOHA ne hozz létre új fájlt ugyanezzel a céllal — mindig ebbe a fájlba írd.
6. A fejlesztési kérés mindig együtt értendő ezzel a teljes governance és lessons learnt szabálykészlettel.

**Struktúra minden hiba bejegyzésnél:**
```md
### [HIBA-XXX] Rövid cím
- **Dátum**: Mikor fordult elő
- **Fájl**: Melyik fájlban volt / melyik logikai komponenshez tartozik
- **Hibaüzenet**: Pontos TypeScript/build/runtime/API error
- **Gyökérok**: Miért történt
- **Javítás**: Hogyan lett megoldva
- **Megelőzés**: Hogyan kerüld el a jövőben
```

**Megjegyzés az összevont tudásbázishoz:**
- A duplikált tanulságok csak egyszer szerepelnek.
- A több alkalmazásból származó, de azonos hibaminták összevonva kerültek be.
- Az alkalmazásfüggetlen külső API / integrációs hibák is bekerültek általános mintaként.
- Az AI-ok számára ez a fájl nem passzív referencia, hanem kötelező működési protokoll.

---

# LEGFONTOSABB: SEMMILYEN MÁR JÓL MŰKÖDŐ FUNKCIÓT NEM SZABAD ELRONTANI

A fejlesztés elsődleges célja minden esetben az, hogy az új igény teljesüljön úgy, hogy közben egyetlen korábban jól működő funkció, belépési pont, üzleti szabály, képernyőfolyamat vagy admin/customer útvonal se sérüljön.

---

# AI FEJLESZTÉSI ÖNELLENŐRZŐ PROTOKOLL — MINDEN FEJLESZTÉSNÉL KÖTELEZŐEN ALKALMAZANDÓ

Ezt a fájlt minden fejlesztési kör ELEJÉN teljes egészében olvasd el. A fájlban szereplő összes korábbi HIBA-XXX bejegyzést, megelőzési szabályt, checklistet és governance előírást kötelezően alkalmazd az aktuális feladatra. A cél nem csak az, hogy a korábbi hibák ne ismétlődjenek meg, hanem az is, hogy minden újonnan felismert hiba javítása után az új tanulság AZONNAL hozzá legyen fűzve ehhez a fájlhoz új bejegyzésként.

## KÖTELEZŐ ALAPELVEK

1. MINDEN új fejlesztés előtt olvasd végig ezt a teljes fájlt.
2. A korábban dokumentált hibákat SOHA ne kövesd el újra.
3. Ha új hibát észlelsz, ne csak javítsd meg, hanem dokumentáld is új HIBA-XXX bejegyzésként.
4. A meglévő tartalmat SOHA ne töröld vagy írd át romboló módon; csak hozzáfűzni szabad.
5. A fejlesztési kérés mindig együtt értendő ezzel a fájllal; vagyis az aktuális feladatot ennek a teljes szabálykészletnek megfelelően kell megoldani.
6. MINDEN fejlesztési körben kötelező plusz feladat a célzott kutatómunka: meg kell keresni az adott probléma, technológia, pattern vagy UX/termékdöntés legfrissebb és leghasznosabb iparági tanulságait, majd ezekből a fájl jövőbeni hatékonyságát javító új governance-elemeket kell levezetni.
7. Ha a kutatómunka új, gyakorlati értékű szabályt, ellenőrzési mintát vagy hibamegelőzési elvet talál, azt a fejlesztés végén kötelezően vissza kell tanulni ebbe a fájlba, duplikáció nélkül.

## SZEREP ÉS MŰKÖDÉSI MÓD

A fájlt beolvasó AI minden fejlesztés során egyszerre a következő szerepek szerint köteles működni:
- profi, perfekcionista senior full-stack fejlesztő;
- tesztelőmérnök és regresszióvadász;
- tapasztalt üzleti elemző;
- senior product owner;
- rendszertervező, aki a teljes repository és architektúra konzisztenciáját védi.

Az aktuális feladat megoldásakor mindig vedd figyelembe:
- a már meglévő kódbázist,
- a repository teljes fálszerkezetét,
- az érintett fájlok közötti összefüggéseket,
- a korábban dokumentált hibákat,
- az aktuális fejlesztési leírást,
- az üzleti értéket,
- a felhasználói hasznosságot,
- a felhasználói élmény súrlódásának minimalizálását,
- az iparági kutatásokból levonható bevált gyakorlatokat.

Soha ne csak lokálisan optimalizálj egy fájlt; mindig full-context kompatibilis, üzletileg értelmes és felhasználóbarát megoldást adj.

## KÖTELEZŐ FEJLESZTÉSI MENET

1. Először olvasd el ezt a fájlt teljesen.
2. Ezután olvasd el a `changelog.md` fájlt, ha létezik.
3. Elemezd az aktuális fejlesztési feladatot.
4. Azonosítsd, mely korábbi HIBA-XXX pontok relevánsak az adott feladathoz.
5. Szedd össze az összes szükséges tudást elsődlegesen hivatalos dokumentációból, megbízható technikai forrásokból és releváns iparági kutatásból.
6. Vizsgáld meg, hogy a módosítás milyen más fájlokat, típusokat, importokat, route-okat, komponenseket, adatmodelleket, migrációkat, auth-flow-kat, UI-elemeket, configokat és buildeket érinthet.
7. Detektáld a valós gyökérokot, ne csak a tünetet kezeld.
8. Hasonlíts össze legalább 2 lehetséges megoldási koncepciót, és a leghatékonyabb, legstabilabb, legkisebb regressziós kockázatú megoldást válaszd.
9. Csak ezután készíts implementációt.
10. Az implementáció után KÖTELEZŐEN futtasd le az összes elérhető ellenőrzést és tesztet.
11. Ha bármilyen hiba, inkonzisztencia, hiányosság vagy gyanús pont marad, javítsd tovább.
12. Addig iterálj, amíg a kód a teljes kontextusban helyes, konzisztens, jó minőségű és üzletileg is indokolt nem lesz.
13. A kör végén külön értékeld, hogy a fejlesztés során végzett kutatómunka alapján hogyan lehetne ezt a governance fájlt még hatékonyabbá tenni.

## KÖTELEZŐ VERIFIKÁCIÓS HURKOK

A kódot soha nem szabad első próbálkozásra véglegesnek tekinteni. Minden fejlesztés végén kötelezően futtasd le az alábbi ellenőrzési hurkokat.

### 1. Szintaxis ellenőrzés
- Ellenőrizd, hogy nincs szintaktikai hiba, félbehagyott blokk, hibás zárójel, lezáratlan JSX, rossz import vagy parser error.
- Ha teljes build nem futtatható, legalább parser/syntax szintű ellenőrzést akkor is kötelező végezni.

### 2. Teljességi ellenőrzés
- Ellenőrizd, hogy a feladat minden része valóban implementálva lett-e.
- Ne maradjon félkész logika, TODO, placeholder, csonka komponens vagy be nem kötött funkció.
- Ellenőrizd, hogy minden új hivatkozás mögött valóban létező fájl, export, route, függvény, dependency és konfiguráció áll.

### 3. Típuskezelési ellenőrzés
- Ellenőrizd a TypeScript típushelyességet.
- Hasonlítsd össze az interface-eket, type-okat és DTO-kat a valós adatmodellekkel és SQL oszlopokkal.
- Vizsgáld meg az összes új property-t, optional mezőt, uniont, genericet, Supabase eredményt és relációt.
- Ahol a projekt szabályai alapján indokolt, ott használj megfelelő castot vagy regenerált típust, de csak tudatosan.

### 4. Repo-kompatibilitási ellenőrzés
- Ellenőrizd, hogy az új kód kompatibilis-e a repository meglévő fájljaival.
- Vizsgáld meg az importláncokat, komponens-használatot, route-konvenciókat, layout-hierarchiát, shared utilokat, context providereket, stílusokat és adatlekéréseket.
- Ne hozz létre olyan változtatást, ami egy másik fájlban rejtett törést okoz.

### 5. Funkcionális ellenőrzés
- Ellenőrizd, hogy a kód logikailag is helyes-e, nem csak fordul-e.
- Vizsgáld edge case-ekkel, hibás inputtal, null/undefined állapotokkal, üres adatokkal, auth-határesetekkel és fallback szcenáriókkal.
- Ellenőrizd, hogy a korábban jól működő funkciók nem sérültek-e.

### 6. Minőségi ellenőrzés
- Ellenőrizd a kód olvashatóságát, konzisztenciáját, redundanciáit, naminget, felelősségi köröket és a túlkomplikáltságot.
- A megoldás legyen egyszerűbb, stabilabb és jobban karbantartható, ne csak működő.

### 7. Üzleti érték ellenőrzés
- Ellenőrizd, hogy a megoldás valóban növeli-e a fejlesztett termék üzleti értékét, használhatóságát és célhoz kötött hasznosságát.
- Vizsgáld meg, hogy van-e egyszerűbb, gyorsabban értéket termelő, kisebb súrlódású alternatíva.
- Alkalmazd a 80/20 szemléletet: azonosítsd, melyik megoldási rész adja a felhasználói és üzleti érték nagy részét.

### 8. UX ellenőrzés
- Ellenőrizd, hogy a felhasználó számára a flow világos, rövid és súrlódásmentes marad-e.
- Vizsgáld meg, nem tűnt-e el fontos entry point, CTA, navigációs útvonal vagy visszajelzés.
- A technikailag működő, de UX-ben félrevezető vagy nehezen felfedezhető megoldás nem elfogadható.

### 9. Kutatási és fejlődési ellenőrzés
- Ellenőrizd, hogy történt-e célzott kutatómunka az adott technológiai, architekturális, tesztelési, UX vagy product kérdésben.
- Vizsgáld meg, találtál-e olyan új, gyakorlati szabályt vagy mintát, amely javítaná a jövőbeni fejlesztések minőségét.
- Ha igen, dokumentáld ezt a governance fájlban külön, tömören és duplikáció nélkül.

## KÖTELEZŐ JAVÍTÁSI SZABÁLY

Ha bármelyik ellenőrzési pont hibát talál:
1. Ne állj meg.
2. Javítsd ki a hibát.
3. Futtasd újra az összes releváns ellenőrzést.
4. Ismételd ezt addig, amíg:
   - nincs szintaktikai hiba,
   - nincs nyilvánvaló teljességi hiány,
   - nincs típushiba,
   - nincs repo-inkonzisztencia,
   - nincs ismert lessons learnt sértés,
   - nincs nyilvánvaló funkcionális vagy UX-hiba,
   - és a megoldás a teljes kontextusban helyesnek nem tűnik.

## KÖTELEZŐ HIBATANULÁSI SZABÁLY

Ha a fejlesztés során új típusú hiba, új hibaminta vagy új visszatérő probléma derül ki:
1. Azonosítsd a gyökérokot.
2. Javítsd meg.
3. Dokumentáld új HIBA-XXX bejegyzésként ebben a fájlban.
4. A bejegyzés tartalmazza:
   - dátum,
   - érintett fájl,
   - pontos hibaüzenet,
   - gyökérok,
   - javítás,
   - megelőzés.
5. Az új szabályt a jövőbeni fejlesztéseknél automatikusan alkalmazd.
6. Ha a hiba mögött általánosítható governance tanulság is van, azt külön szabályként is emeld be a megfelelő protokoll vagy checklist szakaszba.

## KÖTELEZŐ KUTATÁSI SZABÁLY

Minden fejlesztési körben az AI-nak kötelező külön kutatási munkát végeznie az alábbi célból:
- technikai hibamegelőzés javítása,
- jobb tesztelési stratégia azonosítása,
- regressziócsökkentő módszerek gyűjtése,
- UX és product döntések optimalizálása,
- a governance fájl további fejlesztése.

A kutatás során előnyben részesítendők:
- hivatalos dokumentációk,
- gyártói best practice anyagok,
- megbízható mérnöki blogok,
- fórumokon megosztott, sokszor visszaigazolt gyakorlati lessons learnt minták,
- minőségi iparági kutatások.

A kutatás nem öncélú: minden fejlesztési kör végén értékelni kell, hogy a talált új tudásból mi emelhető be ebbe a fájlba úgy, hogy az a jövőbeni AI-fejlesztések minőségét vagy hatékonyságát érdemben javítsa.

## KÖTELEZŐ MENTÁLIS CHECKLIST MINDEN FEJLESZTÉSNÉL

- Elolvastam a teljes `codingLessonsLearnt.md` fájlt?
- Elolvastam a `changelog.md` fájlt?
- Figyelembe vettem az összes releváns korábbi hibát?
- Megtörtént a szükséges forráskutatás és dokumentációellenőrzés?
- Azonosítottam a valós gyökérokot?
- Összehasonlítottam legalább 2 megoldási koncepciót?
- A legkisebb regressziós kockázatú megoldást választottam?
- A módosítás teljes repository-kontextusban is helyes?
- Futtattam szintaxis ellenőrzést?
- Futtattam teljességi ellenőrzést?
- Futtattam típuskezelési ellenőrzést?
- Ellenőriztem a fájlok közötti teljes megfelelést?
- Ellenőriztem az importokat, route-okat, típusokat, adatmodelleket és UI-kapcsolatokat?
- Futtattam funkcionális, minőségi, üzleti és UX ellenőrzést?
- Biztos, hogy nem rontottam el korábban jól működő funkciót?
- Találtam új hibát vagy új tanulságot, amit hozzá kell fűzni ehhez a fájlhoz?
- Az aktuális kutatómunka alapján van új governance-javítás, amit be kell emelni?
- Csak akkor tekintem késznek a feladatot, ha a teljes kontextusban stabil és konzisztens.

## KÖTELEZŐ VÉGSŐ SZABÁLY

MINDEN fejlesztésnél az a cél, hogy:
- a meglévő lessons learnt tudás teljesen érvényesüljön,
- az új kód szintaktikailag helyes legyen,
- teljes legyen,
- típushelyes legyen,
- a repository összes releváns fájljával kompatibilis legyen,
- a korábbi működő funkciók sértetlenek maradjanak,
- a megoldás üzletileg indokolt és felhasználóbarát legyen,
- és minden újonnan felismert hiba vagy hasznos kutatási tanulság visszatanulásra kerüljön ebbe a fájlba.

A fejlesztés csak akkor tekinthető befejezettnek, ha ez a teljes ellenőrzési, javítási és kutatási ciklus sikeresen lezárult.

---

# AI PARANCSNYELVŰ FEJLESZTÉSI ÉS VERIFICATION LOOP PROTOKOLL

## CÉL
Minden fejlesztési körben a cél:
- a meglévő, jól működő funkciók maradéktalan megőrzése,
- az aktuális feladat teljes és helyes megoldása,
- a teljes repository-kontextussal kompatibilis implementáció készítése,
- a korábban dokumentált hibák ismételt elkövetésének megakadályozása,
- az újonnan felfedezett hibák azonnali visszatanulása ebbe a fájlba,
- és a folyamatos kutatómunka alapján ennek a fájlnak a további fejlesztése.

## KÖTELEZŐ ALAPMŰVELET MINDEN FEJLESZTÉS ELŐTT
1. OLVASD EL a teljes `codingLessonsLearnt.md` fájlt.
2. OLVASD EL a teljes `changelog.md` fájlt, ha létezik.
3. GYŰJTSD ÖSSZE a feladathoz szükséges tudást megbízható forrásokból és a meglévő repository-ból.
4. VÉGEZZ célzott kutatómunkát, amellyel a feladat technikai, üzleti, tesztelési és UX-oldala javítható.
5. AZONOSÍTSD a releváns korábbi HIBA-XXX pontokat.
6. MÉRD FEL a változtatás teljes hatását: érintett fájlok, importok, route-ok, komponensek, típusok, adatmodellek, auth-flow-k, stílusok, migrációk, configok, buildek, tesztek.
7. CSAK EZUTÁN kezdj implementálni.

## MŰKÖDÉSI ELV
- SOHA ne lokális fájl-szinten gondolkodj.
- MINDIG full repository contextben dolgozz.
- MINDIG azt feltételezd, hogy egy kis módosítás is okozhat rejtett regressziót más fájlokban.
- SOHA ne tekints késznek egy megoldást addig, amíg a teljes ellenőrzési ciklus le nem futott.
- A valószínűleg jó nem elfogadható. Csak az ellenőrzött, konzisztens, repo-kompatibilis megoldás elfogadható.
- A technikailag működő, de alacsony üzleti értékű vagy feleslegesen súrlódásos UX megoldás nem elég jó.

## KÖTELEZŐ FEJLESZTÉSI CIKLUS
1. ÉRTELMEZD pontosan a feladatot.
2. KERESD MEG a valós gyökérokot, ne csak a tünetet javítsd.
3. VÁZOLJ fel legalább 2 lehetséges megoldási koncepciót.
4. VÁLASZD a legkisebb regressziós kockázatú, legegyszerűbb, legstabilabb, legnagyobb üzleti értéket adó megoldást.
5. IMPLEMENTÁLD checklist-alapon.
6. FUTTASD LE a kötelező verification loopot.
7. HA hibát találsz, javítsd.
8. FUTTASD ÚJRA a verification loopot.
9. ÉRTÉKELD a kutatás eredményeit, és ami általánosítható, írd vissza ebbe a fájlba.
10. ADDIG ismételd, amíg a kód a teljes kontextusban stabil, helyes és konzisztens nem lesz.

## KÖTELEZŐ VERIFICATION LOOP

### 1. Szintaxis-ellenőrzés
- Ellenőrizd, hogy nincs parser error, szintaktikai hiba, hibás zárójel, lezáratlan blokk, hibás JSX, hiányzó import vagy törött export.
- Ha teljes build nem futtatható, minimum syntax/parser szintű ellenőrzést akkor is KÖTELEZŐ futtatni.

### 2. Teljesség-ellenőrzés
- Ellenőrizd, hogy a feladat összes része implementálva lett-e.
- Ne maradjon TODO, placeholder, félbehagyott logika, üres handler, be nem kötött state, hiányzó UI-ág vagy hiányzó backend-összekötés.
- Ellenőrizd, hogy minden új hivatkozás mögött valóban létező fájl, export, függvény, route, dependency és konfiguráció áll.

### 3. Típuskezelési ellenőrzés
- Ellenőrizd a TypeScript és típushelyességet.
- Hasonlítsd össze az interface-eket, type-okat, DTO-kat és query-eredményeket a valós adatmodellekkel.
- SQL / Supabase / API alapú projektnél ellenőrizd, hogy az új kód mezői megfelelnek-e az adatforrások valós struktúrájának.
- Ellenőrizd az optional mezőket, null/undefined eseteket, unionokat, genericeket és castokat.

### 4. Teljes repository-kompatibilitási ellenőrzés
- Ellenőrizd a módosított és kapcsolódó fájlokat együtt.
- Vizsgáld meg az importláncokat, layout-hierarchiát, route-konvenciókat, shared utilokat, provider használatot, style-öröklést, auth-flow-kat, adatlekéréseket és build-konvenciókat.
- Az új kódnak illeszkednie kell a meglévő kódbázis szerkezetéhez, namingjéhez, szabályaihoz és függőségeihez.

### 5. Funkcionális ellenőrzés
- Ellenőrizd, hogy a logika valóban azt csinálja-e, amit a feladat megkövetel.
- Vizsgáld edge case-ekkel, hibás inputokkal, üres adatokkal, auth-határesetekkel, fallback állapotokkal és regressziós kockázatokkal.
- Ellenőrizd, hogy a korábban jól működő funkciók nem sérültek-e.

### 6. Minőségi ellenőrzés
- Ellenőrizd az olvashatóságot, konzisztenciát, redundanciát, túlkomplikáltságot, naminget, felelősségi köröket és karbantarthatóságot.
- Törekedj a legegyszerűbb, legstabilabb és legkisebb regressziós kockázatú megoldásra.

### 7. Product és UX ellenőrzés
- Vizsgáld meg, hogy a felhasználó számára az új megoldás ténylegesen jobb-e.
- Ellenőrizd, hogy nem nőtt-e feleslegesen a lépésszám, a döntési teher vagy a hibalehetőség.
- Ha van egyszerűbb és nagyobb értéket adó út, azt részesítsd előnyben.

### 8. Kutatási fejlődési ellenőrzés
- Zárás előtt mindig tedd fel a kérdést: mit tanultunk ebből a körből, amit a governance fájlba is be kell emelni?
- Dokumentáld a valóban hasznos, általánosítható új szabályokat.

## KÖTELEZŐ JAVÍTÁSI SZABÁLY
Ha a verification loop bármely pontján hiba, hiányosság, inkonzisztencia vagy gyanús működés található:
1. NE állj meg.
2. JAVÍTSD a hibát.
3. FUTTASD ÚJRA az összes releváns ellenőrzést.
4. ISMÉTELD a ciklust addig, amíg:
   - nincs szintaktikai hiba,
   - nincs típushiba,
   - nincs teljességi hiány,
   - nincs repo-kompatibilitási törés,
   - nincs nyilvánvaló funkcionális hiba,
   - nincs visszatérő lessons-learned sértés.

## KÖTELEZŐ LESSONS-LEARNED VISSZATANULÁS
Ha új típusú hiba, új hibaminta vagy új visszatérő probléma derül ki:
1. AZONOSÍTSD a gyökérokot.
2. JAVÍTSD meg.
3. APPENDELD azonnal ebbe a fájlba új `HIBA-XXX` bejegyzésként.
4. A bejegyzés kötelező mezői:
   - Dátum
   - Fájl
   - Hibaüzenet
   - Gyökérok
   - Javítás
   - Megelőzés
5. A frissen dokumentált szabályt minden későbbi fejlesztésnél automatikusan alkalmazd.

## KÖTELEZŐ MENTÁLIS CHECKLIST
- Beolvastam a teljes `codingLessonsLearnt.md` fájlt?
- Beolvastam a `changelog.md` fájlt?
- Azonosítottam a releváns korábbi hibamintákat?
- Megvan a valós gyökérok?
- Összehasonlítottam legalább 2 megoldási koncepciót?
- A legkisebb regressziós kockázatú megoldást választottam?
- Ellenőriztem a teljes repository-ra gyakorolt hatást?
- Futtattam szintaxis-ellenőrzést?
- Futtattam teljesség-ellenőrzést?
- Futtattam típuskezelési ellenőrzést?
- Futtattam teljes repo-kompatibilitási ellenőrzést?
- Futtattam funkcionális ellenőrzést?
- Futtattam minőségi ellenőrzést?
- Futtattam product és UX ellenőrzést?
- Biztos, hogy nem rontottam el korábban jól működő funkciót?
- Találtam új tanulságot, amit hozzá kell fűzni ehhez a fájlhoz?
- Végeztem olyan kutatást, amelyből új governance szabály származhat?

## VÉGSŐ SZABÁLY
A fejlesztés CSAK akkor tekinthető késznek, ha:
- a feladat teljes,
- a megoldás helyes,
- a meglévő működő funkciók sértetlenek,
- a teljes repo-kontextusban kompatibilis,
- a verification loop minden releváns pontja sikeresen lefutott,
- és minden új tanulság dokumentálva lett ebben a fájlban.

---

## HÍBA-FORUM: KÖZÖSSÉGI LESSONS LEARNT (Reddit / StackOverflow / fórumok)

### [HIBA-FORUM-001] Context First szabály
- **Dátum**: 2026-04-02
- **Fájl**: Minden prompt / teljes fejlesztési folyamat
- **Hibaüzenet**: Context First failure; az AI kontextus nélkül rossz architektúrát vagy félrecsúszott megoldást generál.
- **Gyökérok**: A feladat megoldása a releváns fájlok, architektúra és folyamatok előzetes beolvasása nélkül indul.
- **Javítás**: Minden prompt elején kötelező: 1. olvasd el a releváns fájlokat és governance-et; 2. azonosítsd az architektúrát, adatfolyamatokat, komponenskapcsolatokat; 3. csak ezután értelmezd a feladatot.
- **Megelőzés**: MINDEN fejlesztési kör elején explicit Context First lépés kötelező.

### [HIBA-FORUM-002] Rubber Duck AI
- **Dátum**: 2026-04-02
- **Fájl**: Minden komplex logika
- **Hibaüzenet**: Implicit feltételezések miatt törékeny vagy rosszul indokolt logika.
- **Gyökérok**: A megoldás mögötti logika nincs explicit végiggondolva és verbalizálva.
- **Javítás**: A komplex megoldásokat meg kell tudni magyarázni egyszerűen, mintha junior fejlesztőnek mondanád: miért van ott az adott változó, miért az a logika, mi történik edge case-ben.
- **Megelőzés**: Minden összetett logika előtt vagy után kötelező Rubber Duck magyarázatot végezni.

### [HIBA-FORUM-003] Devil's Advocate ellenőrzés
- **Dátum**: 2026-04-02
- **Fájl**: Minden szállítás előtti review
- **Hibaüzenet**: Önbizalmi torzítás; a megoldás túl korán késznek tűnik.
- **Gyökérok**: A fejlesztő nem keresi meg tudatosan a saját megoldásának gyenge pontjait.
- **Javítás**: Szállítás előtt vedd fel a legkritikusabb reviewer szerepét, találj legalább 5 támadási pontot vagy kritikát, és mindegyikre adj jobb alternatívát vagy védelmet.
- **Megelőzés**: Minden szállítás előtt kötelező Devil's Advocate önreview.

### [HIBA-FORUM-004] Import Hell Detector
- **Dátum**: 2026-04-02
- **Fájl**: Új importok és shared logika
- **Hibaüzenet**: Duplikáció, széteső shared logika, párhuzamos utilok.
- **Gyökérok**: Új import vagy util készül anélkül, hogy a meglévő hasonló implementációk fel lennének térképezve.
- **Javítás**: Új import vagy helper előtt mindig ellenőrizd, van-e már hasonló utils-ban vagy a repo más részén.
- **Megelőzés**: Soha ne hozz létre új shared logikát meglévő megoldások áttekintése nélkül.

### [HIBA-FORUM-005] 80/20 Rule
- **Dátum**: 2026-04-02
- **Fájl**: Komplex feature-ök, product döntések
- **Hibaüzenet**: Túlbonyolított feature alacsony tényleges értékkel.
- **Gyökérok**: A fejlesztés nem különíti el a legnagyobb üzleti és felhasználói értéket adó részeket a kevésbé fontosaktól.
- **Javítás**: Azonosítsd, melyik 20% adja a várható érték 80%-át, és priorizáld azt.
- **Megelőzés**: Minden összetett feature-nél kötelező 80/20 értékelemzés.

---

## 🔴 KATEGÓRIA 1: TypeScript / React / komponens szerződés hibák

### [HIBA-001] Hiányzó property az interface-ből
- **Dátum**: 2026-03-30 (v1.1.0)
- **Fájl**: `src/app/admin/menu/templates/page.tsx:157`
- **Hibaüzenet**: `Type error: Property 'item_sort' does not exist on type 'TemplateItem'.`
- **Gyökérok**: A `TemplateItem` interface-ben nem volt definiálva az `item_sort` property, miközben a kód hivatkozott rá (`sort_order: item.item_sort`). Az interface-t kézzel írtam, és kifelejtettem egy mezőt amit az SQL tábla tartalmaz.
- **Javítás**: Hozzáadtam `item_sort: number` a `TemplateItem` interface-hez.
- **Megelőzés**: MINDIG hasonlítsd össze az interface mezőket az SQL tábla oszlopaival. Ha az SQL-ben van `item_sort`, az interface-ben is kell lennie. Checklist: minden SQL oszlop = egy interface property.

### [HIBA-002] Supabase FK reláció típusozás — `.table.number` hiba
- **Dátum**: 2026-03-30 (v1.2.0)
- **Fájl**: `src/app/admin/reports/page.tsx:61`
- **Hibaüzenet**: `Type error: Property 'number' does not exist on type '{ number: any; }[]'.`
- **Gyökérok**: Supabase `.select('table:tables(number)')` esetén a TypeScript a relációt tömbként típusozza, nem objektumként.
- **Javítás**: A `.map()` callback-ben `(o: any)` típust használtam.
- **Megelőzés**: MINDIG használj `(item: any)` cast-ot vagy `useState<any[]>([])` megoldást Supabase FK relációs select iterálásakor, amíg a típusrendszer nem kezelhető tisztán.

### [HIBA-003] Supabase FK — új oszlopok nem ismertek a TS típusokban
- **Dátum**: 2026-03-30 (v1.2.0)
- **Fájl**: `src/app/admin/reports/page.tsx:137`
- **Hibaüzenet**: Potenciális — `total_orders`, `total_spent` nem létezik a `profiles` Supabase típusban.
- **Gyökérok**: ALTER TABLE után a generált TS típusok nem frissülnek automatikusan.
- **Javítás**: `(c: any)` cast a `.map()` callback-ben.
- **Megelőzés**: Új SQL oszlop után a select eredményeket kezeld `(row: any)` casttal, amíg a típusok újra nem generálódnak.

### [HIBA-038] AppShell prop contractot nem szabad megsérteni
- **Dátum**: 2026-03-31
- **Fájl**: AppShell használó oldalak (`automation`, `releases`)
- **Hibaüzenet**: `Property 'projectName' does not exist on type ...`
- **Gyökérok**: Az `AppShell` csak `children` és opcionális `projectId` propot fogad, mégis `projectName` prop került átadásra.
- **Javítás**: A hibás `projectName` propot el kell távolítani, és csak `projectId` maradjon átadva.
- **Megelőzés**: Komponens használat előtt mindig ellenőrizni kell az aktuális prop típust, különösen hotfix közben.

---

## 🟡 KATEGÓRIA 2: SQL / RLS / Adatbázis hibák

### [HIBA-004] SQL szintaxis hiba — RLS policy zárójelezés
- **Dátum**: 2026-03-29 (v1.0.0)
- **Fájl**: `supabase/migrations/001_initial_schema.sql:47`
- **Hibaüzenet**: `syntax error at or near "or" LINE 47: ) or is_active = true;`
- **Gyökérok**: Az RLS policy USING() zárójelén kívül volt logikai feltétel.
- **Javítás**: Az egész policy helyes zárójelezéssel lett újraírva.
- **Megelőzés**: RLS policy írásakor MINDEN feltétel a `USING(...)` belsejében legyen.

### [HIBA-005] RLS policy circular dependency — profil olvasás blokkolva
- **Dátum**: 2026-03-29 (v1.0.1)
- **Fájl**: Profiles RLS policies
- **Hibaüzenet**: Profil lekérdezés sikertelen admin felhasználóknál.
- **Gyökérok**: A profiles SELECT policy JOIN-t tartalmazott másik RLS-védett táblára.
- **Javítás**: Egyszerű, auth alapú policy.
- **Megelőzés**: SOHA ne legyen RLS SELECT policy-ban JOIN más RLS-védett táblára.

### [HIBA-006] Profil email NULL — role update 0 rows
- **Dátum**: 2026-03-29 (v1.0.1)
- **Fájl**: profiles / auth trigger
- **Hibaüzenet**: `UPDATE ... WHERE email = ...` → 0 rows affected.
- **Gyökérok**: A trigger nem másolta át az emailt a profiles táblába.
- **Javítás**: JOIN-os update az `auth.users` táblával.
- **Megelőzés**: A `handle_new_user()` trigger mindig töltse át az emailt.

### [HIBA-007] Supabase FK constraint név — törékeny hivatkozás
- **Dátum**: 2026-03-30 (v1.1.0)
- **Fájl**: `src/app/siteadmin/venues/page.tsx`
- **Hibaüzenet**: Potenciális — constraint név nem létezik.
- **Gyökérok**: Explicit FK constraint név használata a select relációban.
- **Javítás**: Constraint név nélküli relációs select.
- **Megelőzés**: SOHA ne használj explicit FK constraint nevet a Supabase `.select()` relációkban.

---

## 🟠 KATEGÓRIA 3: Auth / Redirect / Session hibák

### [HIBA-008] Auth redirect loop — 4 helyen konkurens redirect
- **Dátum**: 2026-03-29 (v1.0.0 → v1.0.1)
- **Fájl**: `middleware.ts`, `page.tsx`, `customer/page.tsx`, `admin/layout.tsx`
- **Hibaüzenet**: Végtelen loading / átirányítási loop.
- **Gyökérok**: Több helyen volt konkurens routing logika.
- **Javítás**: Egyetlen auth döntési pont client oldalon; middleware csak cookie-frissítés.
- **Megelőzés**: Routing döntés kizárólag egy helyen történjen. Middleware soha ne redirecteljen.

### [HIBA-009] getSession() vs getUser() — elavult session
- **Dátum**: 2026-03-29
- **Fájl**: auth ellenőrzési flow-k
- **Hibaüzenet**: Elavult session állapot miatti hibás jogosultsági döntés.
- **Gyökérok**: `getSession()` cache-ből dolgozik.
- **Javítás**: Kritikus auth ellenőrzésnél `getUser()` használata.
- **Megelőzés**: Auth checknél MINDIG `getUser()` a megbízható módszer.

### [HIBA-014] Venue JOIN a profil lekérdezésben blokkolja az auth-ot
- **Dátum**: 2026-03-30 (v1.2.0)
- **Fájl**: `src/app/admin/layout.tsx`
- **Hibaüzenet**: Téves hozzáférésmegtagadás admin felhasználónál.
- **Gyökérok**: Auth-kritikus query FK JOIN-t tartalmazott.
- **Javítás**: Profiles és venues lekérdezések szétválasztása.
- **Megelőzés**: SOHA ne legyen FK JOIN auth-kritikus lekérdezésben.

---

## 🔵 KATEGÓRIA 4: Build / Import / Kompatibilitás hibák

### [HIBA-010] Next.js fájlnév konvenció — `page.tsx` kötelező
- **Dátum**: 2026-03-29
- **Fájl**: route fájlok
- **Hibaüzenet**: Az oldal/routing nem épül be megfelelően.
- **Gyökérok**: A route fájl neve eltért a Next.js App Router konvenciótól.
- **Javítás**: Visszanevezés `page.tsx` / `layout.tsx` formára.
- **Megelőzés**: A route fájlok mindig a framework pontos konvenciója szerint készüljenek.

### [HIBA-011] Lucide React ikon import — nem létező ikon név
- **Dátum**: Általános
- **Fájl**: ikon importok
- **Hibaüzenet**: Import/build hiba nem létező ikon miatt.
- **Gyökérok**: Nem valid ikon neve került importálásra.
- **Javítás**: Biztosan létező ikonra csere.
- **Megelőzés**: Lucide ikonokat mindig a hivatalos listáról importáld.

### [HIBA-015] Lucide React redesign patch — `House` ikon build hibát okozott
- **Dátum**: 2026-03-30 (v1.2.1)
- **Fájl**: `src/app/customer/page.tsx:15`
- **Hibaüzenet**: Nem exportált ikon importja build hibát okozott.
- **Gyökérok**: Bizonytalan ikon használata redesign patch-ben.
- **Javítás**: Biztosan elérhető ikonra csere.
- **Megelőzés**: Új UI patch előtt ellenőrizni kell az összes `lucide-react` importot.

### [HIBA-015B] Patch-only csomagból kimaradt új supporting fájlak
- **Dátum**: 2026-03-30 (v1.2.1)
- **Fájl**: patch csomag / supporting importok
- **Hibaüzenet**: Build/import hiba, mert új supporting fájl kimaradt a csomagból.
- **Gyökérok**: A patch-only csomagolás nem tartalmazta az új importok célfájljait.
- **Javítás**: A patch lista kiegészítése minden új supporting fájllal.
- **Megelőzés**: Patch készítés előtt minden új import célfájlját és csomagba kerülését ellenőrizni kell.

### [HIBA-016] Design patch buildbiztonság — csak syntax-ellenőrzött fájl csomagolható
- **Dátum**: 2026-03-30 (v1.3.0)
- **Fájl**: összes új / módosított `.tsx` fájl
- **Hibaüzenet**: Potenciális parser vagy import hiba redesign közben.
- **Gyökérok**: Nagy redesign alatt sok módosítás történik egyszerre.
- **Javítás**: A módosított TS/TSX fájlak legalább parser szintű ellenőrzése.
- **Megelőzés**: MINDIG legyen build-safety lépés minden módosított fájlra.

### [HIBA-017] Új adatbázis tábla / migráció még nincs fent — UI ne omoljon össze
- **Dátum**: 2026-03-30 (v1.3.0)
- **Fájl**: új social / place / config feature lekérdezések
- **Hibaüzenet**: Opcionális feature új migráció hiánya esetén hibát dobhat.
- **Gyökérok**: A frontend hamarabb kikerülhet, mint a migráció.
- **Javítás**: Null-safe és fallbackes betöltés.
- **Megelőzés**: Új opcionális feature-tábla soha ne legyen auth-kritikus vagy page-blocking.

---

## 🟢 KATEGÓRIA 5: CSS / UI / UX hibák

### [HIBA-012] Admin `.input` class hiányzik
- **Dátum**: 2026-03-30 (v1.1.0)
- **Fájl**: `globals.css`
- **Hibaüzenet**: Az admin inputok nem a várt stílussal jelennek meg.
- **Gyökérok**: Használt custom class nem volt definiálva.
- **Javítás**: `.input` class hozzáadása.
- **Megelőzés**: Egyedi CSS class használata előtt mindig ellenőrizd, hogy definiálva van-e.

### [HIBA-013] Admin sidebar mobil nézet — nem jelenik meg
- **Dátum**: 2026-03-30
- **Fájl**: admin sidebar CSS
- **Hibaüzenet**: Mobilon a sidebar nem jelenik meg.
- **Gyökérok**: `display:none` felülírta a JS class alapú megjelenítést.
- **Javítás**: CSS override `!important` használattal.
- **Megelőzés**: Ha CSS-ből `display:none`, a JS class önmagában nem elég.

### [HIBA-030] Belső komponensdefiníció a page komponensen belül → input fókuszvesztés
- **Dátum**: 2026-03-31 (v1.3.6)
- **Fájl**: `src/app/page.tsx`, `src/app/customer/page.tsx`
- **Hibaüzenet**: Input fókusz elveszik minden billentyűleütésnél.
- **Gyökérok**: A belső komponensek minden state-frissítéskor új komponens-típusként jöttek létre.
- **Javítás**: A remountoló belső komponensek megszüntetése vagy top-levelre emelése.
- **Megelőzés**: SOHA ne definiálj stateful inputokat tartalmazó React komponenst egy page komponens törzsében JSX komponensként használva.

### [HIBA-031] Redesign regresszió — működő menüpontok és entry pointok eltűntek
- **Dátum**: 2026-03-31 (v1.3.6)
- **Fájl**: `src/app/customer/page.tsx`, `src/app/admin/layout.tsx`
- **Hibaüzenet**: Fontos menük, CTA-k vagy entry pointok eltűntek.
- **Gyökérok**: A redesign a meglévő funkciók teljes regressziós ellenőrzése nélkül történt.
- **Javítás**: A fontos entry pointok és navigációs struktúrák visszaállítása.
- **Megelőzés**: MINDIG legyen regressziós checklist a látható entry pointokra is, nem csak a háttérlogikára.

### [HIBA-032] Select dropdown opciók láthatatlanok sötét témában
- **Dátum**: 2026-03-31 (v1.3.6)
- **Fájl**: `src/app/customer/page.tsx`
- **Hibaüzenet**: A lenyíló opciók olvashatatlanok.
- **Gyökérok**: Az `<option>` elemek explicit stílusa hiányzott dark theme-ben.
- **Javítás**: Explicit háttér- és színszínezés az option elemekre.
- **Megelőzés**: Sötét témás `<select>` esetén mindig külön ellenőrizni kell az `<option>` elemek láthatóságát is.

### [HIBA-033] Discover auto-refresh + no-result toast → toast spam és félrevezető üres állapot
- **Dátum**: 2026-03-31 (v1.3.6)
- **Fájl**: `src/app/customer/page.tsx`
- **Hibaüzenet**: Többször feljövő, zajos "nincs találat" toast.
- **Gyökérok**: Az automatikus keresési flow és a no-result toast ugyanabba a flow-ba került.
- **Javítás**: Az automatikus no-result toast megszüntetése, passzív empty state használata.
- **Megelőzés**: Automatikusan futó search/filter flow-ban SOHA ne legyen toast-szintű no-result üzenet.

---

## 🟣 KATEGÓRIA 6: Külső Places / Search / Geometria / Rate limit / API-integráció hibák

### [HIBA-034] Geoapify Places API v2 — `text` paraméter csendben figyelmen kívül van hagyva
- **Dátum**: 2026-04-01 (v1.3.9)
- **Fájl**: `supabase/functions/place-search/index.ts`
- **Hibaüzenet**: Venue névkeresés nem ad találatot, bár a kérés sikeres.
- **Gyökérok**: A Places API v2 a `name` paramétert használja, nem a `text`-et.
- **Javítás**: `text` helyett `name` használata, és külön függvény a keresési módokra.
- **Megelőzés**: MINDIG a megfelelő endpoint dokumentációját ellenőrizd; a geocoding és places API paraméterei nem ugyanazok.

### [HIBA-035] TomTom poiSearch — text + category kombinálása nullázza a találatokat
- **Dátum**: 2026-04-01 (v1.3.9)
- **Fájl**: `supabase/functions/place-search/index.ts`
- **Hibaüzenet**: 0 találat, bár a területen vannak releváns helyek.
- **Gyökérok**: A szabad szöveges query és a kategória kulcsszó rosszul lett összekeverve ugyanabban a poiSearch URL-ben.
- **Javítás**: Külön fuzzy/name és külön nearby/category keresési ág.
- **Megelőzés**: SOHA ne kombináld a szabad szöveget és kategória keresést egyetlen TomTom poiSearch kérésben.

### [HIBA-036] Hard `textMatchesQuery` végszűrő — nullázza a provider találatokat
- **Dátum**: 2026-04-01 (v1.3.9)
- **Fájl**: `supabase/functions/place-search/index.ts`
- **Hibaüzenet**: A keresés 0 találatot ad vissza, miközben a provider eredményt adott.
- **Gyökérok**: Túl agresszív utólagos hard filter a merge utáni listán.
- **Javítás**: Score-alapú relevancia és fallback logika.
- **Megelőzés**: SOHA ne használj olyan végszűrőt, ami lenullázhat egy már érvényes provider találatlistát.

### [HIBA-037] `open_now` filter — túl szigorú feltétel
- **Dátum**: 2026-04-01 (v1.3.9)
- **Fájl**: `supabase/functions/place-search/index.ts`
- **Hibaüzenet**: Nyitva szűrésnél a lista teljesen kiürül.
- **Gyökérok**: Az ismeretlen állapotú venue-k is kizáródtak.
- **Javítás**: `!== false` logika alkalmazása.
- **Megelőzés**: Ismeretlen / `null` állapotokat ne kezeld túl szigorúan szűrésnél.

### [HIBA-039] Geoapify Places API — hiányzó `categories` paraméter
- **Dátum**: 2026-04-01
- **Fájl**: Places / POI keresési integrációk
- **Hibaüzenet**: API-hiba vagy üres találatlista.
- **Gyökérok**: A `v2/places` végpontnál kötelező legalább egy valid kategória.
- **Javítás**: A query builder mindig biztosítson legalább egy támogatott kategóriát.
- **Megelőzés**: Places API hívás előtt mindig validáld a `categories` jelenlétét.

### [HIBA-040] Geoapify `filter` / `bias` / koordináta sorrend hiba
- **Dátum**: 2026-04-01
- **Fájl**: geometriakezelő réteg
- **Hibaüzenet**: Távoli, irreleváns találatok vagy üres eredmény.
- **Gyökérok**: Hibás `lon,lat` sorrend vagy rossz stratégia.
- **Javítás**: Egységes geometria-helper.
- **Megelőzés**: Kézzel ne interpolálj koordinátás stringeket több helyen.

### [HIBA-041] TomTom Search API — `lat/lon` csere és érvénytelen `radius`
- **Dátum**: 2026-04-01
- **Fájl**: TomTom keresési integrációk
- **Hibaüzenet**: `400 Bad Request`, irreleváns találatok vagy hibás földrajzi középpont.
- **Gyökérok**: Felcserélt koordináták vagy érvénytelen sugár.
- **Javítás**: Numerikus inputvalidáció és normalizálás.
- **Megelőzés**: MINDIG validáld a lat/lon és radius értékeket.

### [HIBA-042] TomTom bbox vs. point-radius zavar
- **Dátum**: 2026-04-01
- **Fájl**: TomTom keresési integrációk
- **Hibaüzenet**: A találatok nem a várt régióból érkeznek.
- **Gyökérok**: Több geometriai stratégia keverése egy kérésben.
- **Javítás**: Egy kérésben csak egy geometriai stratégia használata.
- **Megelőzés**: SOHA ne keverd ugyanabban a kérésben a bbox és point-radius logikát.

### [HIBA-043] TomTom rate limit / kvóta — nincs throttling vagy backoff
- **Dátum**: 2026-04-01
- **Fájl**: provider orchestration
- **Hibaüzenet**: `403 Over the limit` vagy `429 Too Many Requests`.
- **Gyökérok**: Hiányzó QPS-limit, backoff vagy retry stratégia.
- **Javítás**: Queue, concurrency limit, exponential backoff.
- **Megelőzés**: MINDIG legyen provider-szintű throttle és retry policy.

### [HIBA-044] Geoapify rate limit — túl sok párhuzamos kérés
- **Dátum**: 2026-04-01
- **Fájl**: provider orchestration / autocomplete / place search
- **Hibaüzenet**: Instabil válaszidő vagy rate-limit jellegű viselkedés.
- **Gyökérok**: Túl sok párhuzamos kérés semaphore nélkül.
- **Javítás**: Concurrency limit, debounce, cache.
- **Megelőzés**: MINDIG legyen concurrency cap a Geoapify hívások körül.

### [HIBA-045] Geoapify kategória-hierarchia rossz lekérdezése
- **Dátum**: 2026-04-01
- **Fájl**: category mapper / query builder
- **Hibaüzenet**: Üres találatok látszólag helyes kategóriákkal.
- **Gyökérok**: Nem létező vagy rossz kategórianevek.
- **Javítás**: Whitelist-alapú kategóriamapper.
- **Megelőzés**: SOHA ne engedj át validáció nélkül AI által generált Geoapify kategóriát.

### [HIBA-046] TomTom `categorySet` / `classifications` / `language` félreértelmezése
- **Dátum**: 2026-04-01
- **Fájl**: TomTom kategóriakezelés
- **Hibaüzenet**: Üres vagy irreleváns kategóriás találatok.
- **Gyökérok**: Nem támogatott kategóriakódok vagy paraméterek.
- **Javítás**: TomTom-specifikus validáció.
- **Megelőzés**: MINDIG provider-specifikus validációval engedd át a kategória- és language-paramétereket.

### [HIBA-047] Geoapify autocomplete / geocoder végpont és API-kulcs mismatch
- **Dátum**: 2026-04-01
- **Fájl**: autocomplete / geocoder integráció
- **Hibaüzenet**: `401`, `403` vagy csendes 0 találat.
- **Gyökérok**: Rossz endpoint, hibás kulcs vagy frontend-backend contract mismatch.
- **Javítás**: Endpoint-konstansok és request/response contract egységesítése.
- **Megelőzés**: Frontend és backend ugyanarra az endpoint- és paraméterkészletre építsen.

### [HIBA-048] TomTom fuzzy / typeahead keresés — bias nem ugyanaz, mint földrajzi szűrés
- **Dátum**: 2026-04-01
- **Fájl**: TomTom typeahead / fuzzy flow
- **Hibaüzenet**: A felhasználó távoli POI-kat lát lokális keresés helyett.
- **Gyökérok**: A bias csak rangsorol, nem szűr.
- **Javítás**: Valódi térbeli szűrés és biasolt keresés külön kezelése.
- **Megelőzés**: MINDIG külön kezeld a biasolt és a szűrt keresést.

### [HIBA-049] TomTom kategória + brand túl szigorú kombinálása
- **Dátum**: 2026-04-01
- **Fájl**: kategória- és brand-szűrő logika
- **Hibaüzenet**: 0 találat egyébként releváns régióban.
- **Gyökérok**: Túl agresszív provider-oldali első szűkítés.
- **Javítás**: Kétlépcsős, szélesebb első szűrés.
- **Megelőzés**: SOHA ne szűkíts első körben túl agresszíven provider oldalon.

### [HIBA-050] Geoapify ↔ TomTom kategóriamapping primitív string-regex alapján
- **Dátum**: 2026-04-01
- **Fájl**: cross-provider category mapper
- **Hibaüzenet**: Hibás vagy nem létező kategóriapárok.
- **Gyökérok**: String-hasonlóság alapú mapping explicit tábla helyett.
- **Javítás**: Kézzel karbantartott explicit mapping-tábla.
- **Megelőzés**: SOHA ne építs cross-provider kategóriamappinget puszta string-hasonlóság alapján.

---

## 📋 ELLENŐRZŐ LISTA (Minden commit vagy szállítás előtt)

- [ ] `codingLessonsLearnt.md` beolvasva
- [ ] `changelog.md` beolvasva, ha létezik
- [ ] szükséges forráskutatás / dokumentációellenőrzés megtörtént
- [ ] gyökérok detektálva
- [ ] legalább 2 megoldási koncepció kiértékelve
- [ ] a legkisebb regressziós kockázatú megoldás kiválasztva
- [ ] korábbi működő funkciók megléte double-checkelve
- [ ] új regresszió nem maradt bent
- [ ] auth-kritikus lekérdezésben nincs FK JOIN
- [ ] minden interface/type property megegyezik az SQL tábla oszlopaival
- [ ] Supabase `.select()` FK relációknál van tudatos cast vagy regenerált típus
- [ ] nincs explicit FK constraint név a Supabase select-ben
- [ ] nincs middleware-ben redirect
- [ ] auth check `getUser()`-t használ, nem `getSession()`-t
- [ ] fájlnevek megfelelnek a framework konvencióknak (`page.tsx`, `layout.tsx`)
- [ ] egyedi CSS class-ok definiálva vannak
- [ ] Lucide ikonok validak
- [ ] minden új import célfájlja létezik és átadási csomagban is benne van, ha szükséges
- [ ] parser/syntax ellenőrzés lefutott a módosított TS/TSX fájlakon
- [ ] RLS policy-kban nincs cross-table JOIN más RLS-védett táblára
- [ ] új SQL oszlopok esetén a kód típuskezelése tudatos
- [ ] Places / Search API hívásnál a provider-specifikus paraméterek validak
- [ ] `lat/lon` sorrend, `radius`, `bbox`, `bias`, `filter` stratégia explicit ellenőrizve
- [ ] van throttling / retry / concurrency limit a külső kereső API-k körül
- [ ] nincs olyan hard filter, ami lenullázhatja a provider által visszaadott listát
- [ ] az ismeretlen / `null` állapotokat nem kezeli túl szigorúan a szűrés
- [ ] Context First lefutott
- [ ] Rubber Duck magyarázat megtörtént
- [ ] Devil's Advocate önreview lefutott
- [ ] Import Hell ellenőrizve
- [ ] 80/20 értékelemzés megtörtént
- [ ] product és UX szempontból is valid a megoldás
- [ ] a kör végén megtörtént a governance-fejlesztő kutatási review
- [ ] ha volt új tanulság, az appendelve lett ebbe a fájlba

---

*Utoljára frissítve: 2026-04-02 — összevont governance + lessons learnt + AI kutatási protokoll*
*Ez egy FOLYAMATOSAN BŐVÜLŐ fájl. Új hibákat és hasznos governance tanulságokat MINDIG appendelj, SOHA ne törölj!*
