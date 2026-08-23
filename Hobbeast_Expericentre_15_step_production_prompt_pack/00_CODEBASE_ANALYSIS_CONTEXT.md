
# Kódszintű értelmezési összefoglaló

A prompt pack a feltöltött repository tényleges struktúrájára épül. A vizsgálat során különösen az alábbi tények befolyásolták a sorrendet:

- A termék már nem MVP-váz: consumer, organizer és admin surface egyaránt létezik.
- A forrásban nagy load-bearing modulok vannak; ezért a social feature bővítés előtt regression harness és domain boundary szükséges.
- A `virtual_hubs` és `virtual_hub_members` már léteznek, és AI auto-event generálás is van, tehát ezeket nem újra kell kitalálni, hanem stabilizálni és továbbépíteni.
- A notification rendszer és preference tábla létezik, több notification típussal.
- A waitlist auto-promote és organizer message delivery adatbázis-trigger szinten is megjelent a migration historyban.
- Külső event provider és place/geodata pipeline több komponenssel, Edge Functionnel és migrationnel jelen van.
- A kódban social-notification fogalmakra (`friend_request`) már van előkészítés, de teljes relationship lifecycle nem látszik ugyanolyan kidolgozottsággal, ezért külön Prompt 04 kezeli.
- A korábbi changelog kifejezetten jelzi, hogy `place-search`, notification/community és organizer/admin mély refaktor csak karakterizációs tesztekkel biztonságos.
- A multi-Supabase történet és a régi requirementsben szereplő credential-szerű adatok miatt security/release baseline került az első lépésre.
- A ZIP elemzési környezetében kezdetben nem volt telepített dependency-bináris; a `vite/vitest/eslint not found` nem tekinthető repository buildhibának. A reprodukálható clean install + teljes gate ezért kötelező az első promptban.

A stratégiai cél nem regresszív pivot, hanem a meglévő event/venue/admin infrastruktúra fölé a hiányzó social relationship layer felépítése:
`interest -> activity -> attendance -> encounter -> reconnection -> connection -> circle -> community`.

A 15 promptot egymásra épülő release-határoknak terveztük, nem egyetlen óriási „mindent egyszerre” utasításnak.
