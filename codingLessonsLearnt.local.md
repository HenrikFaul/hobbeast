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
