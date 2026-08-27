# Hobbeast eseményimportáló (Chrome bővítmény)

Egy **már megnyitott** Facebook-esemény adatait olvassa be, megmutatja
ellenőrzésre, és a te fiókoddal küldi be a Hobbeast katalógusába.

## Miért így

A Hobbeast gyűjtője nem tudja és nem is fogja lekérni a Facebookot:
kijelentkezve a platform nem ad ki semmit, szerverről a felhasználói fiókkal
lekérni pedig a szabályzatába ütközik. Ez a bővítmény nem kerüli meg ezt —
**a te böngésződben, a te által épp nézett oldalon fut, gombnyomásra**, és
semmit nem küld be a jóváhagyásod nélkül.

Amit betart:

- csak akkor fut le, ha megnyomod a bővítmény gombját (`activeTab`),
- csak Facebook **esemény** oldalon (`/events/…`),
- semmit nem ír automatikusan: a felugró ablakban javíthatsz, mielőtt mented,
- nem tárol jelszót, csak a bejelentkezési munkamenetet,
- a mentés a saját fiókoddal megy, és az adatbázis ellenőrzi a
  `providers.manage` jogosultságodat — a bővítménynek nincs saját jogosultsága.

## Beüzemelés

1. Másold le a beállításokat:

```bash
cp browser-extension/hobbeast-importer/config.example.js browser-extension/hobbeast-importer/config.js
```

2. Írd bele a `SUPABASE_URL` és `SUPABASE_PUBLISHABLE_KEY` értékeket (ugyanazok,
   amiket a webalkalmazás is használ — a `.env` `VITE_SUPABASE_URL` és
   `VITE_SUPABASE_PUBLISHABLE_KEY` sora).

3. Chrome → `chrome://extensions` → **Fejlesztői mód** be → **Kicsomagolt bővítmény
   betöltése** → válaszd a `browser-extension/hobbeast-importer` mappát.

4. Első használatkor jelentkezz be a Hobbeast-fiókoddal a felugró ablakban.

## Használat

Nyiss meg egy Facebook-esemény oldalt → kattints a bővítmény ikonjára →
ellenőrizd az adatokat → **Mentés a Hobbeastbe**.

## Mit olvas ki, és milyen sorrendben

A Facebook osztálynevei generáltak és folyamatosan változnak, ezért a
bővítmény **nem azokra támaszkodik**, hanem arra, amit az oldal maga állít
magáról — annyira megbízva benne, amennyire az állítás gépi:

1. **JSON-LD** (`schema.org/Event`) — az oldal gépi olvasásra szánt adatai
2. **OpenGraph** meta tagek — amit minden linkelőnézetnek mond
3. `<h1>` és a látható dátumsor — végső esetben

A felugró ablak megírja, melyikből dolgozott, és ha a dátum csak látható
szövegből jött, külön szól, hogy nézd át.

## Amit nem csinál

- nem böngészi végig a Facebookot, nem lapoz, nem gyűjt hátérben,
- nem nyúl más oldalhoz,
- nem küld be semmit magától.
