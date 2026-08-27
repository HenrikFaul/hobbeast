# Hobbeast eseményimportáló (Chrome bővítmény)

Egy **már megnyitott** Facebook-esemény vagy -bejegyzés adatait beolvassa, és
átadja a Hobbeast admin felületének — ott ellenőrzöd és mented.

## Miért így

A Hobbeast gyűjtője nem tudja és nem is fogja lekérni a Facebookot:
kijelentkezve a platform nem ad ki semmit, szerverről a felhasználói fiókkal
lekérni pedig a szabályzatába ütközik. Ez a bővítmény nem kerüli meg ezt —
**a te böngésződben, az általad épp nézett oldalon fut, gombnyomásra**.

**Nem ír az adatbázisba, és nem jelentkeztet be sehova.** Az első változat
e-mail–jelszó párossal lépett be, ami eleve lehetetlen, ha a Hobbeast-fiókod
Google-fiók: nincs jelszó, amit meg lehetne adni. Ráadásul így API-kulcsot
kellett volna a bővítménybe tenni.

Helyette **átadja a szöveget az admin felületnek**, ahol már be vagy
jelentkezve — bárhogy jelentkeztél is be. Így a bővítménynek **nincs kulcsa,
nincs fiókja és nincs saját jogosultsága**.

## Beüzemelés

Nincs mit beállítani. Chrome → `chrome://extensions` → **Fejlesztői mód** be →
**Kicsomagolt bővítmény betöltése** → válaszd a
`browser-extension/hobbeast-importer` mappát.

Ha helyi Hobbeast ellen próbálnád, a [`config.js`](config.js) egyetlen sorát
írd át `http://localhost:8080`-ra.

## Használat

1. Nyiss meg egy Facebook **eseményt** (`/events/…`) vagy **bejegyzést**
   (`/posts/…`).
2. Kattints a bővítmény ikonjára — megmutatja, mit olvasott ki.
3. **Megnyitás a Hobbeastben** → új lapon nyílik az admin **Bejegyzésből**
   fül, kitöltött űrlappal.
4. Ellenőrzöd, és mented.

## Mit látsz, amikor megnyomod

A felugró ablak **mindig mond valamit** — nincs olyan út, ami üres ablakot ad:

| Helyzet | Amit látsz |
| --- | --- |
| Esemény vagy bejegyzés oldal | A kiolvasott szöveg + „Megnyitás a Hobbeastben" |
| Nem Facebook-oldal | „Ez nem Facebook-oldal." + a jelenlegi cím |
| Facebook, de nem esemény/bejegyzés | „Ez nem esemény és nem bejegyzés." |
| Bejegyzés, de nem tölt be a szöveg | „Nem találtam szöveget a bejegyzésben." |
| Átadás után | „Átadva a Hobbeastnek." |
| Bármi hiba | A képernyő megmarad, alatta piros hibaüzenet a részletekkel |

## Mit olvas ki, és milyen sorrendben

A Facebook osztálynevei generáltak és folyamatosan változnak, ezért a bővítmény
**nem azokra támaszkodik**, hanem arra, amit az oldal maga állít magáról —
annyira megbízva benne, amennyire az állítás gépi:

1. **JSON-LD** (`schema.org/Event`) — az oldal gépi olvasásra szánt adatai
2. **OpenGraph** meta tagek — amit minden linkelőnézetnek mond
3. `<h1>`, illetve bejegyzésnél a leghosszabb összefüggő szövegblokk

A kiolvasott szöveget az admin oldal **ugyanazzal a parserrel** dolgozza fel,
amit kézi bemásolásnál is használ — nincs külön logika, ami elcsúszhatna.

Ha a bejegyzésben nincs dátum (mert például hirdetés), **nem talál ki egyet**:
a dátummező üresen marad, és az admin oldal kéri, hogy add meg.

## Hogyan utazik az adat

A szöveg az URL **fragmentjében** (`#import=…`) megy át, amit a böngésző
**soha nem küld el a szervernek** — így nem kerül bele semmilyen kéréslogba.
Az admin oldal beolvassa, majd azonnal kitörli a címsorból, hogy egy frissítés
ne importáljon újra.

## Amit nem csinál

- nem böngészi végig a Facebookot, nem lapoz, nem gyűjt a háttérben,
- nem nyúl más oldalhoz,
- nem ír az adatbázisba, és nem tárol se kulcsot, se munkamenetet.
