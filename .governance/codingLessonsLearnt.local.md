# Local coding lessons learnt

## 2026-08-24 — v1.9.6 visual redesign

- For a mature product-wide reskin, remapping stable compatibility classes and shared
  primitives gives broad coverage with lower regression risk than renaming every old
  `tech-grid`/`chrome-panel` consumer.
- A token-only colour swap is not enough when the visual problem is compositional.
  Recompose the highest-traffic surfaces while keeping data and action handlers intact.
- Tailwind custom opacity values must use bracket syntax (for example
  `bg-card/[0.78]`); unsupported forms such as `bg-card/78` silently produce no CSS.
- Screenshot review must include the first mobile viewport. A desktop split hero can
  hide the human image below the fold unless the mobile layout is intentionally
  reordered.
- Custom modals need the same baseline guarantees as Radix dialogs: mobile gutters,
  labelled close controls, bounded inner scrolling and background-scroll cleanup.
- Offline UI QA should record expected provider/config errors separately from visual
  regressions; it is local proof, never hosted or production proof.
- Re-read `HEAD`, `origin/main` and the worktree immediately before committing. If a
  concurrent process has already committed and published the owned slice, never
  duplicate or amend that shared history; append a factual closure commit instead.

## 2026-09-05 — v1.70.0 i18n, külföldi térképpontok, klub-országszűrő

- **Az i18n forrásnyelve legyen a termék jelenlegi nyelve, ne az angol.** A `hu`
  katalógusba karakterre pontosan az került, ami eddig be volt drótozva, a
  fallback pedig `választott → forrás → kulcs`. Így a migráció a meglévő
  felhasználók számára láthatatlan, és egy hiányzó fordítás sem tud üres
  feliratot vagy nyers kulcsot kirakni. Angol forrásnyelv esetén az első nap
  minden magyar szöveg megváltozott volna — az már regresszió.
- **A `useI18n()` működjön a provideren kívül is.** Egy izoláltan renderelt
  komponens (unit teszt, preview) különben a hiányzó kontextuson hasal el, és a
  hiba a komponensről szól, nem a hiányzó providerről.
- **Bedrótozott szöveg ellen racsni kell, nem globális tiltás.** 355 fájlban
  ~1769 magyar literál van; egy mindenre kiterjedő szabály az első futáskor
  elbukna, és két napon belül kikapcsolnák. A `scripts/check-i18n-hardcoded-copy.mjs`
  csak a MIGRATED listán szereplő fájlokat nézi, és az a lista csak nőhet.
- **`flyTo`/`flyToBounds` némán nem csinál semmit, ha a rAF nem fut le.** Háttérbe
  tett fülön vagy `prefers-reduced-motion` mellett a Leaflet animációja soha nem
  indul el, és nincs hiba: érvényes bounds, élő térkép, a középpont és a zoom
  bitre azonos marad. Ahol a kameramozgásnak GARANTÁLTAN meg kell történnie,
  `fitBounds(..., { animate: false })` a helyes hívás. Csempekoordinátán mérj,
  ne a hívás visszatérési értékén.
- **`translate()` ELŐTT `lower()`, sosem fordítva.** A `translate()` kisbetűs
  forráskészletet kap, ezért a `lower()` utáni futtatás az egyetlen sorrend, ami
  az ékezetes NAGYBETŰKET is lehajtogatja. A fordított sorrend a `Warszawa`,
  `Praha`, `Wien` példákon jól viselkedik (ékezet nélkül kezdődnek), ezért a
  mérés zöldet mutat — a hibát csak `Österreichweit`-tel vagy `ČR`-rel lehet
  kimérni. Ékezet-hajtogatást MINDIG nagybetűs, ékezetes bemenettel tesztelj.
- **Az élő ACL elsodródhat a repótól.** A `fold_city_label`/`canonical_city`
  fájlban revoke-olt volt, élesben mégis `anon=X` állt. Kiadás előtt olvasd ki a
  `pg_proc.proacl`-t a ténylegesen érintett függvényekre, ne csak a migrációs
  fájlt hidd el.
- **Új nyilvános RPC-nél is kell explicit REVOKE + GRANT pár.** A revoke-nak
  nevesítenie kell az `anon`-t (a Supabase közvetlenül neki ad EXECUTE-ot
  létrehozáskor), és a `security:audit` racsni akkor is elbukik, ha a függvény
  szándékosan publikus — ez a szándék kimondását kényszeríti ki.
- **Meglévő RPC bővítésekor a régi aláírást el kell DOBNI.** A PostgREST a
  paraméterek NEVE alapján old fel túlterhelést; két, azonos névhalmazt elfogadó
  változat futásidejű „could not choose the best candidate function" hibát ad,
  amit egyetlen teszt sem fog ki.
- **Nyitott, nem ebben a kiadásban javított megfigyelés:** a Supabase
  alapértelmezett jogosultságai miatt az `anon` szerepnek projektszinten
  TRUNCATE joga van a `public` séma tábláin (megnézve: `external_events`,
  `clubs`, `geo_places`, `hu_settlements`, `city_aliases`, `city_coordinates` —
  mind egyforma). A TRUNCATE **nem esik RLS alá**. Ma nem elérhető, mert a
  PostgREST nem ad ki TRUNCATE-et és az anon nem tud nyers kapcsolatot nyitni,
  de ez egyetlen réteg. Külön, minden táblát érintő kiadásba való.
- **Egy shell-szintű bővítést shell-szintű megtakarításból fizess ki, ne a plafon
  megemeléséből.** A v1.70.0 i18n kerete +2462 gzip bájt volt, és nem
  kiszervezhető (az első festés előtt kell). A költségvetés jegyzete viszont
  v1.53.0 óta nevesítette a nyerő lépést: a `NativeBootstrap` lusta betöltése
  −4934 gzip bájtot hozott, így a shell a bővítéssel EGYÜTT kisebb lett. Mérd meg
  az alternatívát, mielőtt plafont emelsz.
- **Platformvizsgálathoz ne importáld a `@capacitor/core`-t.** Épp az az import
  húzza be a futtatókörnyezetet a webes csomagba. A `win.androidBridge` /
  `win.webkit.messageHandlers.bridge` olvasása **ugyanaz a vizsgálat**, amit a
  `getPlatformId(win)` végez — de a helyettesítést TESZTELD a valódi csomaggal
  szemben, mert egy néma eltérés a natív appon a splash képernyőn ragadást
  jelentené, amit itt nem lehet kimérni.
- **A `window.Capacitor` NEM a natív híd jele** — azt maga a `@capacitor/core`
  hozza létre `initCapacitorGlobal`-lal importkor, tehát weben is létezik.
- **A böngészőpanel elrejtve throttle-öl**: a `find`/`get_page_text` időtúllépést
  ad, a kattintáskoordináták elcsúsznak a skálázott panelen, és a konzol/hálózat
  puffer elavult marad. Ilyenkor a `@playwright/test` közvetlen futtatása a
  buildelt `dist` ellen ad valódi bizonyítékot — a repo gyökeréből futtasd, mert
  a scratchpadból nem látszik a `node_modules`.
