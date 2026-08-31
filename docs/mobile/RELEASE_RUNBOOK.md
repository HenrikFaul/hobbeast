# Hobbeast mobil — kiadási runbook (Play + App Store)

Ez a dokumentum a natív app store-kiadásának végigviteléhez. A kód/build oldal
kész és aláírt; az alábbiak a fiók-/konzol-oldali (emberi) lépések.

## 0. Aláírókulcs — KRITIKUS
- Upload keystore: `android/keystores/hobbeast-upload.jks` (alias `hobbeast-upload`).
- A keystore és a jelszó a `android/keystore.properties`-ben van, **gitignore-olva**.
- **Mentsd el a keystore-t + jelszót** egy jelszókezelőbe és offline backupba. Elvesztése
  esetén csak akkor állítható helyre, ha **Play App Signing** aktív (ajánlott): akkor ez
  csak az *upload* kulcs, a Google őrzi az *app signing* kulcsot.
- A kulcs SHA256 ujjlenyomata (App Links / assetlinks):
  `50:2D:BB:7E:59:3D:A3:38:BD:9E:82:EF:66:DE:A9:55:47:E2:D8:26:D8:DF:08:51:20:E3:0F:32:17:35:75:C8`

## 1. Android App Links véglegesítése
- A `public/.well-known/assetlinks.json` az upload kulcs ujjlenyomatával kész.
- **Play App Signing esetén** a Console → *App integrity* alatt a Google-generált
  *app signing* kulcs SHA256-át is **add hozzá** az `assetlinks.json` tömbhöz, majd
  deployold a webet (`expericentre.com`), különben a linkek nem verifikálnak élesben.

## 2. CI aláírás (időtálló, reprodukálható)
A `.github/workflows/mobile-build.yml` production-aláírással buildel, ha ezek a
GitHub secretek léteznek:
- `ANDROID_KEYSTORE_BASE64` — a `.jks` base64-elve: `base64 -w0 android/keystores/hobbeast-upload.jks`
- `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`hobbeast-upload`), `ANDROID_KEY_PASSWORD`
- Secret nélkül a CI debug-aláírással buildel (nem tölthető Play-re). Egy kapu elbukik,
  ha a release debuggable lenne.

## 3. Play Console — App content
- **Adatvédelmi szabályzat URL:** `https://expericentre.com/legal` (a tartalom kész).
- **Fiók-törlés URL:** az appban a Profil → „Saját adataim" (`DeleteAccountCard`, 14 napos
  türelmi idő + JSON export). Adj meg egy publikus törlési-tájékoztató URL-t is (pl. `/legal`).
- **Data Safety űrlap:** kiindulásnak a benchmark generálta
  `hobbeast-release-dyn_change_ready/play_data_safety.csv` (minden sort ellenőrizz).
  Nincs reklám-azonosító, nincs harmadik feles tracker; a push az App functionality alatt.
- **Target audience / IARC:** felnőtt/általános közösségi app; töltsd ki a korosztályt.
- **Store listing:** cím/leírás/screenshotok egyezzenek az app tényleges viselkedésével
  (GP-80 a mismatchre bukik).

## 4. iOS (felhő-CI, Apple Developer fiók kell)
- `ios/App/App/App.entitlements`: associated domains (`applinks:expericentre.com`) + push
  (`aps-environment`) kész; kösd be a targethez Xcode-ban (Signing & Capabilities).
- `public/.well-known/apple-app-site-association`: cseréld a `TEAMID`-t a valós Apple Team ID-re.
- Tanúsítvány + provisioning a felhő-CI-ben (macOS runner) — lásd a workflow `ios` job.

## 5. Push (remote) élesítése
- **Android:** Firebase projekt → `google-services.json` az `android/app/`-ba (ekkor a
  google-services plugin automatikusan aktiválódik), FCM szerver-kulcs a küldő oldalon.
- **iOS:** APNs kulcs az Apple Developer fiókban.
- A `src/integrations/native/notifications.ts` már regisztrál; a tokent onnan mentsd Supabase-be.

## 6. Benchmark újrafuttatása (a legélesebb próba)
```bash
cd C:/Work/APK-benchmark/app/engine
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
python -m monolith.cli \
  C:/Work/Expericentre/android/app/build/outputs/apk/release/app-release.apk \
  --out <out-base> --format all --spec C:/Work/Expericentre/docs/mobile/hobbeast-app-spec.md \
  --no-llm --device emulator-5554 --crawl-budget 150
```
A Console-teendők (Data Safety, privacy URL, listing) statikus/crawl elemzéssel nem
igazolhatók — ezek a Play Console-beli beküldéssel válnak „done"-ná.
