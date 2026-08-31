# Hobbeast / Expericentre — Natív mobilalkalmazás terv (Android + iOS)

> Státusz: **aktív fejlesztés alatt** · Készült: 2026-08-28 · Megközelítés: **Capacitor 7**
> Cél: a Google Play-ről (`.aab`/`.apk`) és az Apple App Store-ból (`.ipa`) letölthető,
> **valódi natív alkalmazások**, amelyek a meglévő webalkalmazással **azonos designt és
> funkciókat** adnak, **ugyanabból a Supabase backendből és adatból** táplálkozva,
> **minimális újraírással**.

---

## 1. Miért Capacitor (döntés + indoklás)

A projekt kész, működő React 18 + Vite 6 + TypeScript webalkalmazás. A felhasználói
elvárás: natív, boltból letölthető app, a webbel megegyező design/funkció, azonos
backend, minimális újraírás.

| Szempont | Capacitor (választott) | React Native / Expo | Csak PWA |
|---|---|---|---|
| Boltból letölthető (Play/App Store) | ✅ `.aab`/`.apk` + `.ipa` | ✅ | ❌ nincs bolti jelenlét |
| Újraírás mértéke | **Minimális** (a meglévő kód héjba csomagolva) | **Teljes párhuzamos újraírás** | Nincs |
| Design/funkció egyezés a webbel | **Garantált** (ugyanaz a kód) | Külön kell újraépíteni + karbantartani | Garantált |
| Közös backend/adat (Supabase) | ✅ ugyanaz a kliens, beégetett projekt-ref | ✅ (de új adatréteget kell írni) | ✅ |
| Natív API-k (push, kamera, geo, deep link) | ✅ plugin-rendszeren át | ✅ | Korlátozott (főleg iOS) |
| Karbantartás | **Egy kódbázis** | Kettő | Egy |

**Következtetés:** csak a Capacitor elégíti ki egyszerre az összes feltételt
(bolti natív app + minimális újraírás + web-egyezés + közös backend). A React Native
sértené a „minimális újraírás" és „web-egyezés" feltételt; a PWA a „boltból letölthető"
feltételt. A governance „legkisebb regressziós kockázat" szabálya is a Capacitort
támogatja: a meglévő, működő webes funkciók érintetlenül maradnak.

> Megjegyzés az őszinteség kedvéért: a Capacitor a felületet natív **WebView**-ben
> jeleníti meg egy natív projekt-héjon belül. Ez a bevett, boltok által elfogadott mód
> egy React web-app natív appként való kiadására. A pixelre azonos web-egyezés és a
> minimális újraírás követelménye ezt teszi az egyetlen helyes választássá; a
> „widget-szintű" natív UI (React Native) ezekkel a feltételekkel összeegyeztethetetlen.

---

## 2. Architektúra

```
┌─────────────────────────────────────────────┐
│  Egy közös web-kódbázis (src/, Vite build)   │
│  React 18 · Tailwind · shadcn/ui · Supabase  │
└───────────────┬─────────────────────────────┘
                │  vite build → dist/
        ┌───────┴───────────┬───────────────────┐
        ▼                   ▼                   ▼
   Web (Vercel/       Android natív        iOS natív
   Lovable)           projekt (android/)   projekt (ios/)
                      Capacitor WebView    Capacitor WebView
                      → .aab / .apk        → .ipa
```

- **Egy forrás, három kimenet.** A `dist/` a `npx cap sync` során bekerül a natív
  projektekbe. A web változatlanul deployolható.
- **Backend:** a Vite build a `client.ts` transzformációval **beégeti** a
  `bqdvqmpwccsxumzijspj` Supabase projekt URL-jét és publishable kulcsát, így a natív
  app ugyanazt az adatot és Edge Function-öket használja, mint a web.
- **Nincs `base` path gond:** a Vite alap `base: "/"` a Capacitor helyi origójával
  (`https://localhost` / `capacitor://`) kompatibilis.

### Azonosítók

| Mező | Érték |
|---|---|
| appId (bundle id) | `com.expericentre.hobbeast` *(még módosítható az első store-beadásig)* |
| appName | `Hobbeast` |
| webDir | `dist` |
| Android compileSdk / targetSdk | 35 (helyben telepítve) |
| Min. Android | 6.0 (API 23) — Capacitor 7 alapértelmezett |
| Min. iOS | 14.0 — Capacitor 7 alapértelmezett |

---

## 3. Mérföldkövek

### M0 — Alapozás (KÉSZ / folyamatban)
- [x] Környezetfelmérés: Node 24, JDK 21/17, Android SDK 35, Android Studio, adb ✓
- [x] Capacitor 7 telepítése (`core`, `cli`, `android`, `ios`)
- [ ] `capacitor.config.ts` (appId, appName, webDir, dev live-reload)
- [ ] Natív projektek generálása: `npx cap add android`, `npx cap add ios`
- [ ] Web build + `npx cap sync`

### M1 — Android (helyi build-bizonyíték)
- [ ] Debug APK fordítása helyben: `gradlew assembleDebug` → futtatható artifact
- [ ] App-ikon és splash generálása a `hobbeast-mark.svg` alapból (`@capacitor/assets`)
- [ ] Alap natív gate-ek: indulás, offline állapot, vissza-gomb, státuszsáv/safe-area
- [ ] Supabase auth (Google OAuth) redirect natív sémán — deep link whitelist

### M2 — iOS scaffold + felhő-CI (Windowson nincs helyi iOS build)
- [ ] `ios/` projekt generálva és konfigurálva
- [ ] GitHub Actions macOS runner: `.ipa` build (aláírás store-fiók megléte után gate-elve)

### M3 — Store-kiadás előkészítés
- [ ] Aláírt `release` Android AAB (keystore) + Play Console adatlap
- [ ] iOS aláírás (Apple Developer fiók) + App Store Connect adatlap
- [ ] Adatvédelmi nyilatkozat, jogosultság-magyarázatok, screenshot-készlet
- [ ] Verzió/CHANGELOG/versioning artefaktok szinkron

### M4 — Natív finomítás (opcionális, iteratív)
- [ ] Push értesítések (FCM/APNs) a meglévő notifikációs réteghez kötve
- [ ] Mély-linkek (expericentre.com → app), univerzális linkek
- [ ] Natív megosztás, kamera (profilkép), geolokáció engedélykezelés

---

## 4. iOS stratégia (Windows-korlát)

Windowson nincs Xcode → iOS-t **nem lehet helyben fordítani/aláírni**. Megoldás:
felhős macOS CI (GitHub Actions `macos-latest` runner). A pipeline `npm ci` →
`vite build` → `npx cap sync ios` → `xcodebuild` lépésekkel `.ipa`-t állít elő.
Az **aláírás** és a store-feltöltés külön gate, amely az Apple Developer fiók és a
tanúsítványok meglétekor aktiválható; addig **aláíratlan** artifact készül, egyértelműen
megjelölve (a build-skill szabálya szerint).

---

## 5. Kockázatok és kezelésük

| Kockázat | Kezelés |
|---|---|
| A natív mappák felduzzasztják a repót | `android/`, `ios/` a `.gitignore`-ban a generált részekre; a konfig verziózva |
| Supabase OAuth redirect natív sémán nem működik | Deep link whitelist + `@capacitor/browser`/`app` kezelés az M1-ben tesztelve |
| Lockfile-drift (bun vs npm) | npm-mel telepítünk; a `package-lock.json` frissül, bun.lock érintetlen marad |
| „dev build = kész app" tévhit | Csak fordított `.apk`/`.aab`/`.ipa` számít bizonyítéknak (build-skill gate) |
| Meglévő webes funkció sérül | A web-kódbázis nem változik; a Capacitor csak új build-célt ad hozzá |

---

## 6. Bizonyíték-szerződés (build-skill szerint)

- **Observed/Proven:** helyi Android APK fordítás kimenete + fájl, `cap doctor`, build log.
- **Inferred:** iOS működés a közös kódból (a `.ipa` CI-ben készül).
- **Blocked:** iOS helyi build (nincs Mac) → felhő-CI-vel oldva; store-aláírás fiókfüggő.

Minden kiadási állítás csak a ténylegesen előállított artifacttel igazolt.
