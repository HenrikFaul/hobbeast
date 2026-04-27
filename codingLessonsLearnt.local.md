# codingLessonsLearnt.local

Ide appendelődnek az adott repo saját új tanulságai.
A collector eszköz innen olvassa vissza a governance central repóba.
SOHA ne töröld a meglévő tartalmat — csak hozzáadni szabad.

---

## ➕ APPEND — 2026-04-03 common_admin drift

### [HIBA-051] Shared admin capability drift across repos
- **Dátum**: 2026-04-03 (v1.4.3)
- **Fájl**: `src/components/admin/*`, governance `common_admin/*`
- **Hibaüzenet**: Az egyik app adminja tud valamit, a másik nem — ugyanaz a capability más helyre kerül és elveszik a közös modell.
- **Gyökérok**: Nem volt közös, kanonikus common_admin modell, ezért az admin képességek apponként elsodródtak.
- **Javítás**: A common_admin capability-k governance kanonikus forrásra lettek kötve, és a Hobbeast admin új Common Admin tabot kapott inventory + version réteggel. Az Import funkciók megmaradtak a meglévő tabban.
- **Megelőzés**: MINDEN shared admin változtatásnál először a governance `common_admin/` fájljait kell frissíteni, és csak utána szabad az app-specifikus implementációt módosítani.

---

## ➕ APPEND — 2026-04-26 Geodata db provider replacement

### [HIBA-057] Sikertelen lokális címtábla pipeline után ne tartsuk életben a régi provider opciót
- **Dátum**: 2026-04-26 (v1.6.5)
- **Fájl**: `src/components/admin/AdminEventbrite.tsx`, `src/lib/searchProviderConfig.ts`, `supabase/functions/place-search/index.ts`, `supabase/config.toml`
- **Hibaüzenet / tünet**: A lokális címtábla batch/scheduler flow többszöri javítás után sem adott megbízható venue-adatforrást, miközben az admin UI továbbra is választható providerként mutatta.
- **Gyökérok**: A lokális katalógus külön adatbetöltési pipeline-ra épült, amely túl sok edge-function állapotot, cursor-kezelést és batch-fázist igényelt egy egyszerű venue lookup problémához.
- **Javítás**: A lokális katalógus UI és edge function deploy útvonal kivezetésre került; helyette konfigurálható Geodata Supabase táblákból generált `db:*` provider opciók kerültek be.
- **Megelőzés**: Ha egy adatforrás már eleve rendelkezésre áll Supabase táblákban, először read-only/configurált lookup providert építs, ne újraimportáló batch pipeline-t.

### [HIBA-058] Runtime provider enum/check constraint nem lehet túl szűk dinamikus provider azonosítóknál
- **Dátum**: 2026-04-26 (v1.6.5)
- **Fájl**: `supabase/migrations/20260426203000_geodata_db_address_providers.sql`
- **Hibaüzenet / tünet**: A dinamikus `db:<provider-id>` címkereső provider nem menthető, ha az `app_runtime_config.provider` check constraint csak fix provider neveket enged.
- **Gyökérok**: Korábbi migrációk statikus provider-listára építettek, miközben az új üzleti igény konfigurátorból generált provider azonosítókat kér.
- **Javítás**: A provider check constraint `provider like 'db:%'` feltétellel bővült, a régi lokális provider beállítások pedig `geoapify_tomtom` fallbackre állnak.
- **Megelőzés**: Dinamikus admin konfigurációknál a DB constraint legyen explicit, de engedje a kontrollált prefix-alapú névtereket.

---

## ➕ APPEND — 2026-04-26 deploy conflict-marker hotfix

### [HIBA-059] Merge conflict marker nem maradhat deployolható forrásfájlban
- **Dátum**: 2026-04-26 (v1.6.6)
- **Fájl**: `src/lib/placeSearch.ts`, `src/components/admin/CommonAdminPanel.tsx`, `src/lib/commonAdminMetadata.ts`, `src/components/admin/AdminEventbrite.tsx`, `src/lib/searchProviderConfig.ts`, `supabase/config.toml`, `supabase/functions/place-search/index.ts`
- **Hibaüzenet / tünet**: Vercel build: `[vite:esbuild] Transform failed ... Unexpected "<<"` a `src/lib/placeSearch.ts` fájlban.
- **Gyökérok**: A merge során Git conflict marker (`<<<<<<<`, `=======`, `>>>>>>>`) maradt több forrásfájlban. A Vite/esbuild már az első `<<<<<<< HEAD` sornál megállt, de a repo további konfliktusos fájlokat is tartalmazott.
- **Javítás**: Minden érintett deploy-facing fájl tiszta, konfliktusmentes verzióra lett cserélve; a Geodata db provider ág maradt meg, a régi lokális címtábla ág pedig nem került vissza.
- **Megelőzés**: Minden deploy előtt kötelező futtatni: `grep -RInE '^(<<<<<<<|=======|>>>>>>>)' . --exclude-dir=node_modules --exclude-dir=.git --exclude='*.patch'`. Ha találat van, a deploy tilos.


---

## ➕ APPEND — 2026-04-27 Geodata provider persistence verification

### [HIBA-060] Admin UI nem mondhat sikert, ha a runtime config nem maradt meg visszaolvasáskor
- **Dátum**: 2026-04-27 (v1.6.8)
- **Fájl**: `supabase/functions/place-search/index.ts`, `src/lib/searchProviderConfig.ts`, `src/components/admin/AdminEventbrite.tsx`
- **Hibaüzenet / tünet**: A Címkereső admin felület néha sikeres mentést jelzett, de oldalfrissítés után a `db:*` provider eltűnt, a Postman `get_all_provider_configs` pedig továbbra is `geoapify_tomtom` / `aws` értékeket mutatott.
- **Gyökérok**: A mentési útvonal optimistán hitt a write válaszban, de nem olvasta vissza kötelezően az `app_runtime_config` sort. Így a frontend átmenetileg mutathatott olyan DB providert, amely ténylegesen nem volt tartósan elmentve.
- **Javítás**: Minden `save_db_table_config` és `save_provider_config` után backend oldali read-after-write verification fut. A frontend a mentés után újratölti a provider állapotot, és csak visszaellenőrzött mentés után jelez sikert.
- **Megelőzés**: Runtime konfiguráció mentésnél a siker definíciója nem az, hogy a write request lefutott, hanem az, hogy ugyanaz az érték visszaolvasható a konfigurációs store-ból.

### [HIBA-061] Több Supabase projekt párhuzamos használatánál kötelező explicit project-ref ellenőrzés
- **Dátum**: 2026-04-27 (v1.6.8)
- **Fájl**: `.env`, `src/integrations/supabase/client.ts`
- **Hibaüzenet / tünet**: A Geodata direkt REST hívás működött, a Hobbeast Edge Function is működött, mégis a UI és Postman állapotok eltértek.
- **Gyökérok**: A repo snapshotban a nem-VITE Supabase URL a Hobbeast projektre (`dsymdijzydaehntlmfzl`) mutatott, de a frontend `VITE_SUPABASE_URL` egy másik projektre (`olzvughcoqnfkdpvbwjy`). Ez könnyen olyan hatást kelt, mintha a mentés elveszne, miközben másik projektet olvasunk vissza.
- **Javítás**: A frontend kliens explicit console hibát ír, ha nem a kanonikus Hobbeast project-refre mutat.
- **Megelőzés**: Multi-project integrációnál a frontend mindig a saját app projektjét hívja; külső adatforrás projekt csak Edge Function secreten keresztül használható.
