# LEGFONTOSABB: SEMMILYEN MÁR JÓL MŰKÖDŐ FUNKCIÓT NEM SZABAD ELRONTANI.

### [HIBA-051] Shared admin capability drift
- **Dátum**: 2026-04-03
- **Fájl**: `src/pages/Admin.tsx`, `src/components/admin/*`, governance `common_admin/*`
- **Hibaüzenet**: Az egyik app adminja tud valamit, a másik nem, vagy ugyanaz a capability más helyre kerül és elveszik a közös modell.
- **Gyökérok**: Nem volt közös, kanonikus common_admin modell, ezért az admin képességek apponként elsodródtak.
- **Javítás**: A common_admin capability-k governance kanonikus forrásra lettek kötve, és a Hobbeast admin új külön Common Admin tabot kapott inventory + version réteggel.
- **Megelőzés**: MINDEN shared admin változtatásnál először a governance `common_admin/` fájljait kell frissíteni, és csak utána szabad az app-specifikus implementációt módosítani.
