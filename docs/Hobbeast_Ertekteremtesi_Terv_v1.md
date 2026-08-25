# Hobbeast értékteremtési terv — a tartalomtól a bevételi platformig

## Kiindulási helyzet (2026-08-25, mért adatok)

| Eszköz | Állapot |
|---|---|
| Programforrások | 354 regisztrálva, 44 termel |
| Aktív programok | 1061 (reggel 62 volt) |
| Jegyvásárlási linkek + árak | begyűjtve, adatbázisban |
| Mérési réteg | consent-alapú termékanalitika él |
| Monetizáció | **0 Ft — nincs bevételi lánc** |

## A központi hiány

A platform ma **tartalmat** gyűjt, de nincs **bevételi lánca**. 1061 program van a
rendszerben jegylinkekkel és árakkal, de semmilyen bizonyíték nincs arra, hogy
bárki átkattint és vásárol. A monetizációs mesterterv 1. pillére (5–8% marketplace
jutalék) **mérés nélkül működésképtelen**: nem lehet jutalékot számlázni olyan
forgalom után, amit nem mérünk.

Egy befektetői vagy felvásárlói átvilágításban pontosan ez az első kérdés:
*"hol keletkezik a bevétel, és mivel bizonyítod?"*

## Értékteremtő fázisok

### 1. fázis — Bevételi attribúciós réteg (EZ A SZÁLLÍTMÁNY)

**Mit épít:** a kimenő jegyvásárlási kattintások mérését és partnerekre bontását.

- `outbound_clicks` tábla: melyik programra, melyik forrásra/partnerre, mikor,
  melyik felületről kattintottak, milyen jegyárral
- `track_outbound_click` RPC: a szerver olvassa ki a program adatait (forrás, ár,
  cél-URL), így a kliens nem hamisíthat attribúciót
- Kattintásrögzítés mindkét kimenő ponton (programkártya + programrészletek)
- `admin_partner_performance` RPC + admin panel: forrásonként aktív programok,
  kattintások, egyedi érdeklődők, becsült jegyérték (GMV) és jutalékpotenciál

**Miért ez ér a legtöbbet:**
- Ez teszi a 354 forrást és 1061 programot **bevételi eszközzé**, nem csak tartalommá
- Ez az első pillér előfeltétele: jutalékot csak mért forgalom után lehet kérni
- Ez az **értékesítési anyag** a helyszíneknek: "ennyi megjelenést és kattintást
  adtunk neked" — enélkül nincs miről tárgyalni
- Ez a **befektetői bizonyíték**: kereslet, konverzió, kiszámítható jutalékalap

### 2. fázis — Partnerportál (következő iteráció)

A helyszínek saját belépéssel lássák a programjaik teljesítményét; ez a
B2B SaaS (2. pillér) belépő terméke. Az 1. fázis adatai adják a tartalmát.

### 3. fázis — Kiemelés / Boost (következő iteráció)

A `promoted_experiences` tábla már létezik, de nincs bekötve értékesítési
folyamatba. Az 1. fázis kattintásadatai adják az árazási alapot (mennyit ér egy
kiemelt hely), ezért ez logikusan a 2. fázis után jön.

## Elhatárolás — mit NEM ígér ez a terv

Konkrét pénzügyi értéknövekedést (pl. „+500 000 USD") felelősen nem lehet
garantálni: a cégérték piaci szorzók, tényleges bevétel és növekedés függvénye.
Amit ez a terv ad, az a **bizonyítható bevételi képesség** — az a képesség,
amelynek hiánya ma minden monetizációs pillért blokkol, és amely nélkül egy
értékelés a platformot tartalomgyűjtőként, nem piactérként árazza.

## Regressziómentesség

Minden elem **additív**: új tábla, új RPC-k, új admin panel, és a meglévő kimenő
gombokhoz csak egy nem blokkoló mérési hívás adódik. Meglévő logikát nem
módosítunk; a kattintás rögzítésének hibája sem akadályozhatja meg a felhasználót
abban, hogy eljusson a jegyvásárlásig.
