# Live faceted typeahead / inline facet browser pattern

## Rövid név
A most látott megoldás legpontosabb neve:

**Live faceted typeahead with result counts**

Magyarul jól használható rá ez a név is:

**élő facettált kereső + inline értékböngésző**

UI / UX mintaként ezek a rokon megnevezések is helyesek:
- faceted search
- faceted autocomplete
- typeahead facet picker
- inline filter value explorer
- searchable suggestion list with counts

A te felületeden ez konkrétan azt csinálja, hogy egy mező fókuszba kerülésekor vagy gépelés közben **az aktuális adathalmazból** megmutatja a releváns kategóriaértékeket, és melléjük teszi a **darabszámot** is. Ettől nem vakon keresel, hanem azonnal látod, hogy az adott pillanatban mi létezik a szűkített halmazban.

---

## Miért ennyire erős ez a minta
A minta ereje abból jön, hogy egyszerre ad:

1. **felfedezhetőséget** — látod, milyen értékek vannak egyáltalán,
2. **visszajelzést** — rögtön látod a darabszámot,
3. **biztonságot** — nem kell pontosan emlékezned a canonical stringre,
4. **taníthatóságot** — a rendszer megmutatja, milyen adatnyelvet vár,
5. **validálhatóságot** — operátorként ellenőrizni tudod, hogy tényleg abból dolgozik-e a backend, amiből kell,
6. **sebességet** — kevesebb sikertelen próbálkozás kell.

Ezért működik különösen jól admin, import, mapper, taxonomy, kategória- és címellenőrző felületeken.

---

## A minta lényege
A pattern nem egyszerű dropdown.

Ez a működési lánca:

1. van egy **forrásadathalmazod**,
2. abból kinyered az adott mező lehetséges értékeit,
3. ezeket **aggregálod**,
4. minden érték mellé odateszed a **számosságot**,
5. a felhasználó elkezd írni,
6. a lista **valós időben szűkül**,
7. a kiválasztott érték visszahat a többi szűrőre és a találati listára.

Ha ezt jól csinálod, akkor a keresőmező egyszerre lesz:
- input,
- navigációs eszköz,
- adatmagyarázó felület,
- diagnosztikai panel.

---

## Az általad szeretett konkrét viselkedés neve
A képen látható konkrét UX elem legpontosabban:

**counted suggestion panel**

vagy

**facet value suggestion overlay**

A lényege:
- nem csak találatot ad,
- hanem a **lehetséges értékek listáját** mutatja,
- a jelenlegi kontextusban,
- darabszámmal.

Például:
- `tourism.sights (402)`
- `leisure (175)`
- `catering (143)`

Ez azt jelenti, hogy a felhasználó nem pusztán egy stringet ír be, hanem **interaktívan böngészi a domain taxonómiát**.

---

## Mikor érdemes ezt használni
Ez a minta különösen jó ezekre:

### 1. Kategória- és taxonómia keresés
Amikor az értékek nem emberbarát slugok, hanem ilyenek:
- `tourism.sights.memorial`
- `catering.restaurant.fish`
- `leisure.park`

### 2. Fordítótáblák
Amikor ugyanahhoz a fogalomhoz több reprezentáció van:
- provider category EN
- magyar címke
- local catalog slug
- local catalog path HU

### 3. Import / admin diagnosztika
Amikor gyorsan kell ellenőrizni, hogy:
- az adat bejött-e,
- melyik provider mit ad,
- milyen számossággal,
- melyik szűrő mivel metszi a többit.

### 4. Nagy listás belső admin eszközök
Például:
- város,
- kerület,
- provider,
- státusz,
- szerződéstípus,
- üzleti szegmens,
- user role,
- hub kategória,
- AWS / TomTom / Geoapify / local cím-azonosítók.

---

## A technikai architektúra
A mintát 4 rétegben érdemes kezelni.

## 1. Forrásréteg
Ez a tényleges rekordhalmaz.

Példák:
- `public.unified_pois`
- `public.provider_category_mapper`
- `public.places_local_catalog`
- `public.aws_local_address_mapper`
- `virtual_hubs`
- `profiles`

A szabály:
- mindig legyen egy **kanonikus rekordhalmaz**, amiből dolgozol,
- ne a UI-ban találd ki az értékeket,
- hanem a tényleges adatból vezesd le őket.

---

## 2. Normalizáló réteg
Mielőtt listázod a facet értékeket, normalizálni kell.

Példák:
- trim,
- lower-case indexelés,
- null és üres string kezelés,
- alias mezők összefésülése,
- HU / EN / slug külön kezelése,
- tömbös kategória mezők felbontása,
- hierarchikus path mezők kezelése.

Itt dől el, hogy ugyanaz a fogalom egy vagy több facet-értékként jelenik-e meg.

---

## 3. Aggregáló réteg
Ez adja a varázslatot.

Ahelyett, hogy sima sorokat mutatsz, ezt számolod:

- distinct értékek,
- hozzájuk tartozó darabszám,
- opcionálisan top-N sorrend,
- opcionálisan relevancia szerinti sorrend.

Példa logika:

```ts
const buckets = new Map<string, number>();
for (const row of filteredRows) {
  const value = normalizeFacetValue(row.categories_en);
  if (!value) continue;
  buckets.set(value, (buckets.get(value) || 0) + 1);
}

const suggestions = Array.from(buckets.entries())
  .map(([value, count]) => ({ value, count }))
  .sort((a, b) => b.count - a.count);
```

Ha a mező tömb:

```ts
for (const category of row.categories_en ?? []) {
  const value = normalizeFacetValue(category);
  if (!value) continue;
  buckets.set(value, (buckets.get(value) || 0) + 1);
}
```

---

## 4. Interakciós réteg
Itt jön az, amitől nagyon szerethető lesz.

A jó működés:
- fókuszra megnyílik,
- gépelésre szűkül,
- egérrel és billentyűzettel is vezérelhető,
- Enterrel kiválasztható,
- Escape-pel bezárható,
- kattintással betölti a kiválasztott szűrőt,
- a háttér találati lista rögtön frissül.

Ez már nem egyszerű select, hanem **discoverable operator UI**.

---

## Két fontos altípus

## A) Client-side faceted overlay
Ezt akkor használd, ha a már letöltött adathalmazon dolgozol.

Előnye:
- nagyon gyors,
- egyszerű,
- kevés backend terhelés,
- tökéletes admin preview-ra.

Hátránya:
- csak az éppen betöltött halmazon működik,
- nagyon nagy datasetnél memóriás lehet.

Ez jó olyan képernyőkre, mint a mostani admin diagnosztika.

## B) Server-side faceted search
Ezt akkor használd, ha:
- milliós adathalmazod van,
- sok párhuzamos szűrő van,
- a faceteknek a teljes adatbázist kell tükrözniük,
- jogosultság / tenant / provider / ország szerinti szeletelés van.

Ilyenkor SQL vagy Edge Function adja vissza:
- a szűrt találatokat,
- és külön a facet bucketeket.

Példa payload:

```json
{
  "rows": [...],
  "facets": {
    "categories_en": [
      { "value": "tourism", "count": 464 },
      { "value": "tourism.sights", "count": 402 }
    ],
    "city": [
      { "value": "Budapest", "count": 15807 }
    ]
  }
}
```

---

## A legjobb gyakorlati minta nálad
A te use-case-edhez ez az ajánlott minta:

### Hybrid faceted search
- a nagy rekordlista jönhet backendről,
- a currently visible preview listán client-side szűrés mehet,
- a facet suggestion lista pedig vagy client-side, vagy aggregált backendből,
- a kategóriafordításnál a mapper tábla aliasai is beleszólhatnak.

Ez különösen jó, ha ugyanarra a fogalomra több beviteli forma él:
- `vendéglátás`
- `catering`
- `restaurant`
- `cafe`
- `társas`
- `board game`
- `local_catalog_slug`

---

## Miért működik jól a magyar-angol kevert keresésre
A te rendszeredben a jó minta nem az, hogy egyetlen canonical mezőre vársz pontos egyezést.

Hanem az, hogy van egy **search vocabulary expansion layer**.

Ez azt jelenti, hogy ugyanazt a fogalmat több alias reprezentálja:
- provider category EN
- provider category path
- HU név
- local catalog HU path
- local catalog slug
- opcionálisan kézi synonymák

Példa:

```ts
{
  provider_category_en: "catering.restaurant.fish",
  provider_category_hu: "vendéglátás > étterem > halétterem",
  local_catalog_slug: "etterem-hal",
  local_catalog_path_hu: "Vendéglátás > Étterem > Halétterem",
  aliases: ["halétterem", "fish restaurant", "restaurant fish", "vendéglátás"]
}
```

A suggestion overlay ilyenkor nem csak string-lista, hanem **operátori szótárfelület**.

---

## Ajánlott implementációs szerkezet Reactben

## 1. UI state
```ts
const [query, setQuery] = useState('');
const [isOpen, setIsOpen] = useState(false);
const [activeIndex, setActiveIndex] = useState(-1);
```

## 2. Source rows
```ts
const rows = useMemo(() => rawRows, [rawRows]);
```

## 3. Current filtered rows
```ts
const filteredRows = useMemo(() => {
  return rows.filter((row) => applyAllFilters(row, filters));
}, [rows, filters]);
```

## 4. Facet bucket generation
```ts
const categorySuggestions = useMemo(() => {
  const buckets = new Map<string, number>();
  for (const row of filteredRows) {
    for (const value of extractCategoryAliases(row)) {
      const normalized = normalizeForSearch(value);
      if (!normalized) continue;
      buckets.set(normalized, (buckets.get(normalized) || 0) + 1);
    }
  }

  return Array.from(buckets.entries())
    .map(([value, count]) => ({ value, count }))
    .filter((item) => item.value.includes(normalizeForSearch(query)))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);
}, [filteredRows, query]);
```

## 5. Overlay render
```tsx
{isOpen && categorySuggestions.length > 0 && (
  <div className="absolute z-30 w-full rounded-xl border bg-popover shadow-lg">
    {categorySuggestions.map((item) => (
      <button key={item.value} onClick={() => applyFacet(item.value)}>
        <span>{item.value}</span>
        <span>({item.count})</span>
      </button>
    ))}
  </div>
)}
```

---

## Mi kell hozzá backend oldalon
Ha ezt nem csak preview-ra, hanem nagy adathalmazra akarod skálázni, akkor a backendnek tudnia kell:

1. **canonical search fields**
2. **alias / mapper layer**
3. **facet aggregations**
4. **count + distinct + limit**
5. **input normalization**
6. **language-aware matching**

Supabase / Postgres oldalról ezeket érdemes használni:
- `ILIKE`
- `unaccent()` ha van
- `lower()`
- `jsonb` alias mezők
- distinct aggregációk
- materialized helper viewk, ha a facet túl drága
- trigram index (`pg_trgm`) a fuzzy prefix / contains jellegű keresésre

---

## Ajánlott adatmodell ehhez
Ha ugyanazt a mintát több helyen akarod használni, jó egy általános mapper szerkezet.

Például:

```sql
create table public.search_term_mapper (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  canonical_key text not null,
  display_label_hu text,
  display_label_en text,
  slug text,
  aliases text[] default '{}',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

`domain` lehet például:
- `provider_category`
- `address_component`
- `virtual_hub_hobby`
- `city`
- `district`
- `local_catalog`

Így ugyanaz a komponens újrahasználható több helyen.

---

## Billentyűzet és UX részletek
Ettől lesz igazán profi.

Kötelező elemek:
- ArrowDown / ArrowUp
- Enter
- Escape
- blur kezelés
- click-outside kezelés
- focus restore
- scroll-into-view az aktív elemre
- debounce
- stale response védelem

Ha ezt kihagyod, a komponens technikailag működik, de operátori eszköznek gyenge lesz.

---

## Mire figyelj, hogy ne legyen regresszió

### 1. Az overlay nem írhatja felül a tényleges eredménytáblát
A suggestion panel csak segít, nem helyettesít.

### 2. A typed query ne vesszen el
Fókuszvesztés vagy kiválasztás után is kontrollált legyen.

### 3. Null / empty értékek ne kerüljenek be bucketként
Különben lesz `— (1245)` típusú zaj.

### 4. A counts mindig a jelenlegi scope-ra értendők legyenek
Különben a user félreérti a darabszámokat.

### 5. Alias expansion ne okozzon duplikált bucketeket
Ugyanaz a fogalom ne jelenjen meg háromszor külön.

### 6. Nagy listán limitálni kell
Top 30–50 bőven elég.

---

## A pattern gyakorlati újrahasznosítása nálad
Ezt a mintát simán újra tudod használni itt:

1. import / címkereső kategóriamezők
2. provider szűrők
3. város / kerület szűrők
4. local catalog megfeleltetés
5. virtual hub hobbi mező
6. taglista szűrés
7. AWS ↔ local address mapper admin
8. eseményhelyszín kereső diagnosztikai nézet
9. organizer oldali admin lookupok

---

## Ajánlott komponensnév a kódban
Ha ezt standardizálni akarod, jó nevek:

- `FacetTypeahead`
- `CountedSuggestionInput`
- `FacetSuggestionOverlay`
- `InlineFacetExplorer`
- `SearchableFacetPicker`

Az általad dicsért UX-re szerintem ez a legjobb belső név:

**`FacetTypeahead`**

mert rövid, technikailag pontos, és újrahasználható.

---

## Javasolt komponens API

```ts
interface FacetOption {
  value: string;
  label: string;
  count: number;
  meta?: string;
}

interface FacetTypeaheadProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (option: FacetOption) => void;
  options: FacetOption[];
  placeholder?: string;
  emptyLabel?: string;
  loading?: boolean;
}
```

Ha ezt egyszer jól megírod, nagyon sok admin felületen újra felhasználható lesz.

---

## Egy mondatos összefoglaló
A megoldás neve:

**Live faceted typeahead with counted suggestions**

és azért ennyire jó, mert a keresőmezőt egyszerre alakítja át:
- gyors inputtá,
- adatböngészővé,
- diagnosztikai eszközzé,
- és operátori döntéstámogató felületté.

