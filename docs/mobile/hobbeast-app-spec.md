# Hobbeast (Expericentre) — mobil app viselkedési spec

Ez a dokumentum az MONOLITH `--spec` pontról-pontra ellenőrzéséhez készült: mit
csinál a Hobbeast natív app, és miért annyi jogosultságot/képességet használ,
amennyit.

## Termék
- **Package / bundle id:** `com.expericentre.hobbeast`
- **Név:** Hobbeast — közösségi élmény-platform (események, hobbik, klubok).
- **Technológia:** Capacitor 7 natív héj a meglévő React/Vite web-app fölött; a UI,
  a funkciók és a backend megegyeznek a webbel.
- **Backend:** Supabase (`bqdvqmpwccsxumzijspj`) — Auth, Postgres (RLS), Storage,
  Edge Functions. A kliens a build során beégetett publishable kulccsal csatlakozik.

## Fő felhasználói folyamatok (a webbel azonos)
1. Kezdőoldal / élmény-felfedezés város és hobbi szerint.
2. Események böngészése, térképes nézet, esemény-részletek, RSVP/várólista.
3. Esemény létrehozása szervezőként.
4. Profil és preferenciák; publikus tagprofilok.
5. Klubok és szervezeti oldalak.
6. Bejelentkezés/regisztráció (e-mail + Google OAuth).

## Jogosultságok és indoklásuk
- `INTERNET` — kötelező: a Supabase backend és a betöltött tartalom.
- `POST_NOTIFICATIONS` (Android 13+) — helyi esemény-emlékeztetők és (később) push
  értesítések. A hozzájárulást futásidőben kérjük, csak amikor releváns.
- Nincs deklarált helymeghatározás/kamera/mikrofon/kontakt jogosultság ebben a
  kiadásban; ha később bekerül, futásidejű kéréssel és indoklással.

## Deep linkek
- **Android App Links:** `https://expericentre.com/*` és `https://www.expericentre.com/*`
  (`autoVerify=true`), az útvonalak a SPA routerébe irányulnak
  (`/events/:id`, `/klubok/:slug`, `/szervezet/:slug`, `/members/:id`, stb.).
- **Custom scheme:** `com.expericentre.hobbeast://` — OAuth-visszairányítás és
  értesítés-koppintás tartaléka.
- **iOS Universal Links:** `applinks:expericentre.com` (AASA a `/.well-known/`-ben).

## Értesítések
- **Helyi értesítések** (`@capacitor/local-notifications`): esemény-emlékeztetők,
  külső szolgáltatás nélkül működnek.
- **Push (remote):** `@capacitor/push-notifications` bekötve; a tényleges kézbesítés
  FCM (`google-services.json`) / APNs konfigurációt igényel — ez külön, fiókfüggő gate.

## Adatvédelem / megfelelés
- Nem gyűjt reklám-azonosítót, nincs harmadik feles tracker SDK.
- A hitelesítési token a platform biztonságos tárában (WebView storage / Keychain).
- A jogi/adatvédelmi tartalom a `/legal` útvonalon érhető el (a webbel közös).

## Aláírás / kiadás
- Android: upload keystore-ral aláírt `release` AAB a Play Consolehoz (Play App
  Signing ajánlott). Debug buildek a debug-kulccsal aláírva teszteléshez.
- iOS: Apple Developer tanúsítvány + provisioning (felhő-CI macOS runner).
