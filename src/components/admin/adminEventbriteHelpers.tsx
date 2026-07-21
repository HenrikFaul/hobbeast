import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, ExternalLink } from 'lucide-react';
import type { ExternalEventNormalized } from '@/lib/external-events';
import { mapExternalEventToCardLike } from '@/lib/external-events/normalize';
import { HOBBY_CATALOG } from '@/lib/hobbyCategories';
import type { AddressSearchProvider, DbFacetOption, GeodataTableName } from '@/lib/searchProviderConfig';

// Pure-view sub-component extracted from AdminEventbrite.tsx (Sprint 2.d).
// Behavior is byte-identical to the original inline definition.
export function ExternalEventList({ events }: { events: ExternalEventNormalized[] }) {
  const mapped = useMemo(() => events.map(mapExternalEventToCardLike), [events]);
  if (mapped.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <span className="text-sm font-medium">{mapped.length} esemény előnézete</span>
      </div>
      <div className="max-h-96 overflow-y-auto space-y-2">
        {mapped.map((ev) => (
          <div key={ev.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <span className="text-2xl">{ev.image_emoji || '📅'}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{ev.title}</p>
              <p className="text-xs text-muted-foreground">{ev.event_date || '—'} · {ev.location_city || 'Online'} · {ev.source_label}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{ev.category}</Badge>
              {ev.external_url && (
                <a href={ev.external_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const BASE_PROVIDER_OPTIONS: Array<{ value: AddressSearchProvider; label: string; detail: string }> = [
  { value: 'aws', label: 'AWS Places', detail: 'AWS Location Places provider' },
  { value: 'geoapify_tomtom', label: 'Geoapify+TomTom', detail: 'Live külső provider fallback' },
  { value: 'mapy', label: 'Mapy.cz', detail: 'Mapy cím- és útvonal provider' },
];

export const DB_TEST_COLUMN_OPTIONS = [
  { value: 'id', label: 'ID' },
  { value: 'name', label: 'Név' },
  { value: 'city', label: 'Város' },
  { value: 'district', label: 'Kerület / körzet' },
  { value: 'formatted_address', label: 'Formázott cím' },
  { value: 'lat', label: 'Latitude' },
  { value: 'lon', label: 'Longitude' },
  { value: 'categories', label: 'Kategóriák' },
  { value: 'source_provider', label: 'Forrás provider' },
  { value: 'datasource_name', label: 'Datasource név' },
  { value: 'brand', label: 'Brand' },
  { value: 'operator', label: 'Operator' },
  { value: 'cuisine', label: 'Cuisine' },
  { value: 'phone', label: 'Telefon' },
  { value: 'website', label: 'Weboldal' },
] as const;

export const DEFAULT_DB_TEST_COLUMNS = DB_TEST_COLUMN_OPTIONS.map((column) => column.value);

const CATEGORY_SEGMENT_TRANSLATIONS: Record<string, string> = {
  sport: 'sport',
  fitness: 'fitnesz',
  fitness_club: 'fitnesz klub',
  sports_centre: 'sportközpont',
  stadium: 'stadion',
  leisure: 'szabadidő',
  entertainment: 'szórakozás',
  activity: 'aktivitás',
  tourist_attraction: 'turisztikai látványosság',
  tourism: 'turizmus',
  attraction: 'látványosság',
  sights: 'látnivalók',
  museum: 'múzeum',
  memorial: 'emlékhely',
  park: 'park',
  playground: 'játszótér',
  catering: 'vendéglátás',
  restaurant: 'étterem',
  cafe: 'kávézó',
  pub: 'pub',
  bar: 'bár',
  fast_food: 'gyorsétterem',
  food_court: 'food court',
  bakery: 'pékség',
  coffee_shop: 'kávézó',
  building: 'épület',
  commercial: 'kereskedelmi',
  man_made: 'épített elem',
  historic: 'történelmi',
  landmark: 'nevezetesség',
  education: 'oktatás',
  school: 'iskola',
  library: 'könyvtár',
  community: 'közösségi',
  club: 'klub',
  coworking: 'coworking',
  event_venue: 'rendezvényhelyszín',
  board_game: 'társasjáték',
  games: 'játékok',
};

const CATALOG_TRANSLATION_CANDIDATES = [
  { matcher: /(board|tarsas|társas|game|quiz|kvíz|card|kartya|kártya)/, categoryHu: 'Játék & Gaming', categoryEn: 'Games & Gaming', subcategoryHu: 'Társasjátékok', activityHu: 'Társasjáték', catalogSlug: 'games-gaming/board-games/board-games' },
  { matcher: /(restaurant|cafe|coffee|pub|bar|food|drink|catering|bakery)/, categoryHu: 'Gasztronómia', categoryEn: 'Gastronomy', subcategoryHu: 'Kávézó / Bár / Étterem', activityHu: 'Gasztronómiai találkozó', catalogSlug: 'gastronomy' },
  { matcher: /(sport|fitness|gym|stadium|arena|club)/, categoryHu: 'Sport & Mozgás', categoryEn: 'Sport & Movement', subcategoryHu: 'Edzés / fitnesz', activityHu: 'Edzés', catalogSlug: 'sport' },
  { matcher: /(museum|tourism|sight|attraction|memorial|landmark|historic)/, categoryHu: 'Kultúra & Felfedezés', categoryEn: 'Culture & Discovery', subcategoryHu: 'Városi felfedezés', activityHu: 'Városi séta', catalogSlug: 'culture-discovery' },
  { matcher: /(community|club|event|coworking|social)/, categoryHu: 'Közösség', categoryEn: 'Community', subcategoryHu: 'Közösségi program', activityHu: 'Találkozó', catalogSlug: 'social' },
];

function translateCategoryPath(category: string): { english: string; hungarian: string } {
  const english = category.replace(/[_.]+/g, ' > ');
  const hungarian = category
    .split('.')
    .map((segment) => CATEGORY_SEGMENT_TRANSLATIONS[segment] || segment.replace(/_/g, ' '))
    .join(' > ');
  return { english, hungarian };
}

function normalizeCatalogText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ');
}

const HOBBY_CATALOG_FLAT = HOBBY_CATALOG.flatMap((category) => [
  {
    level: 'category',
    slugPath: category.id,
    hu: category.name,
    en: category.id.replace(/-/g, ' '),
    haystack: normalizeCatalogText(`${category.id} ${category.name}`),
  },
  ...category.subcategories.map((subcategory) => ({
    level: 'subcategory',
    slugPath: `${category.id}/${subcategory.id}`,
    hu: `${category.name} › ${subcategory.name}`,
    en: `${category.id.replace(/-/g, ' ')} > ${subcategory.id.replace(/-/g, ' ')}`,
    haystack: normalizeCatalogText(`${category.id} ${category.name} ${subcategory.id} ${subcategory.name}`),
  })),
  ...category.subcategories.flatMap((subcategory) =>
    subcategory.activities.map((activity) => ({
      level: 'activity',
      slugPath: `${category.id}/${subcategory.id}/${activity.id}`,
      hu: `${category.name} › ${subcategory.name} › ${activity.name}`,
      en: `${category.id.replace(/-/g, ' ')} > ${subcategory.id.replace(/-/g, ' ')} > ${activity.id.replace(/-/g, ' ')}`,
      haystack: normalizeCatalogText(`${category.id} ${category.name} ${subcategory.id} ${subcategory.name} ${activity.id} ${activity.name} ${(activity.keywords || []).join(' ')}`),
    }))
  ),
]);

function resolveCatalogMappingFromCategories(categories: string[]): { categoriesEn: string; categoriesHu: string; localCatalogPathHu: string; localCatalogPathEn: string; localCatalogSlug: string; translationSource: string } {
  const normalizedCategories = categories.filter(Boolean);
  const translated = normalizedCategories.map(translateCategoryPath);
  const categoriesEn = translated.map((item) => item.english).join(' | ') || '—';
  const categoriesHu = translated.map((item) => item.hungarian).join(' | ') || '—';
  const searchable = normalizeCatalogText(`${normalizedCategories.join(' ')} ${categoriesHu} ${categoriesEn}`);

  let matchedCatalog = HOBBY_CATALOG_FLAT.find((item) => searchable.includes(item.haystack));
  if (!matchedCatalog) {
    matchedCatalog = HOBBY_CATALOG_FLAT.find((item) => item.haystack.split(' ').some((token) => token.length >= 4 && searchable.includes(token)));
  }

  if (!matchedCatalog) {
    const fallback = CATALOG_TRANSLATION_CANDIDATES.find((item) => item.matcher.test(searchable));
    if (fallback) {
      return {
        categoriesEn,
        categoriesHu,
        localCatalogPathHu: `${fallback.categoryHu} › ${fallback.subcategoryHu} › ${fallback.activityHu}`,
        localCatalogPathEn: `${fallback.categoryEn} > ${fallback.subcategoryHu} > ${fallback.activityHu}`,
        localCatalogSlug: fallback.catalogSlug,
        translationSource: 'frontend heuristic + local catalog intent',
      };
    }
  }

  if (matchedCatalog) {
    return {
      categoriesEn,
      categoriesHu,
      localCatalogPathHu: matchedCatalog.hu,
      localCatalogPathEn: matchedCatalog.en,
      localCatalogSlug: matchedCatalog.slugPath,
      translationSource: 'frontend hobby catalog match',
    };
  }

  return {
    categoriesEn,
    categoriesHu,
    localCatalogPathHu: '—',
    localCatalogPathEn: '—',
    localCatalogSlug: '—',
    translationSource: 'no confident match',
  };
}

export function enrichMapperRow(row: Record<string, unknown>): Record<string, unknown> {
  const categories = Array.isArray(row.categories)
    ? row.categories.filter((item): item is string => typeof item === 'string')
    : typeof row.categories === 'string'
      ? (row.categories as string).split(',').map((item) => item.trim()).filter(Boolean)
      : [];
  const mapping = resolveCatalogMappingFromCategories(categories);
  return {
    ...row,
    categories_en: mapping.categoriesEn,
    categories_hu: mapping.categoriesHu,
    local_catalog_path_hu: mapping.localCatalogPathHu,
    local_catalog_path_en: mapping.localCatalogPathEn,
    local_catalog_slug: mapping.localCatalogSlug,
    translation_source: mapping.translationSource,
  };
}

export function formatDbCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'igen' : 'nem';
  return String(value);
}

export function matchesColumnFilters(row: Record<string, unknown>, filters: Record<string, string>) {
  return Object.entries(filters).every(([column, filterValue]) => {
    const query = filterValue.trim().toLowerCase();
    if (!query) return true;
    return formatDbCell(row[column]).toLowerCase().includes(query);
  });
}

function getNestedValue(source: any, path: string): unknown {
  return path.split('.').reduce((current, key) => (current && typeof current === 'object' ? current[key] : undefined), source);
}

function valueFromMappedProviderResult(row: any, column: string): unknown {
  const metadata = row?.metadata || {};
  const aliases: Record<string, unknown> = {
    id: row?.id ?? row?.external_id,
    external_id: row?.external_id,
    name: row?.name,
    city: row?.city,
    district: row?.district,
    formatted_address: row?.formatted_address ?? row?.address,
    address: row?.address,
    lat: row?.lat ?? row?.latitude,
    lon: row?.lon ?? row?.longitude,
    latitude: row?.latitude,
    longitude: row?.longitude,
    categories: row?.categories,
    source_provider: metadata?.source_provider ?? row?.source_provider ?? row?.provider,
    datasource_name: metadata?.datasource_name ?? metadata?.source_provider ?? row?.datasource_name,
    brand: metadata?.brand ?? row?.brand,
    operator: metadata?.operator ?? row?.operator,
    cuisine: metadata?.cuisine ?? row?.cuisine,
    phone: row?.phone,
    website: row?.website,
    email: row?.email,
    postal_code: row?.postal_code,
    provider: row?.provider,
  };
  if (column in aliases) return aliases[column];
  return row?.[column] ?? metadata?.[column] ?? getNestedValue(row, column) ?? getNestedValue(metadata, column);
}

export function buildDisplayRowsFromPlaceSearchResult(result: any, selectedColumns: string[]): Record<string, unknown>[] {
  if (Array.isArray(result?.rows) && result.rows.length > 0) {
    return result.rows.map((row: Record<string, unknown>) => {
      const projected: Record<string, unknown> = {};
      selectedColumns.forEach((column) => {
        projected[column] = row[column];
      });
      return projected;
    });
  }

  const mappedResults = Array.isArray(result?.results) ? result.results : [];
  return mappedResults.map((row: any) => {
    const projected: Record<string, unknown> = {};
    selectedColumns.forEach((column) => {
      projected[column] = valueFromMappedProviderResult(row, column);
    });
    return projected;
  });
}

export function resolveTotalCountFromPlaceSearchResult(result: any, displayRows: Record<string, unknown>[]): number | null {
  if (typeof result?.totalCount === 'number') return result.totalCount;
  if (typeof result?.total_count === 'number') return result.total_count;
  if (typeof result?.debug?.total_count === 'number') return result.debug.total_count;
  if (typeof result?.debug?.filtered_candidate_count === 'number') return result.debug.filtered_candidate_count;
  if (typeof result?.debug?.raw_candidate_count === 'number') return result.debug.raw_candidate_count;
  return displayRows.length > 0 ? displayRows.length : null;
}

function normalizeHumanSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function titleCaseFromKey(value: string): string {
  return value
    .replace(/[_.-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function deriveCategoryAliasInfo(categoryValue: string) {
  const segments = categoryValue
    .split('.')
    .flatMap((segment) => segment.split('_'))
    .map((segment) => segment.trim())
    .filter(Boolean);
  const englishParts = segments.map((segment) => titleCaseFromKey(segment));
  const hungarianParts = segments.map((segment) => CATEGORY_SEGMENT_TRANSLATIONS[segment] || titleCaseFromKey(segment));
  const aliases = Array.from(new Set([
    categoryValue,
    categoryValue.replace(/\./g, ' '),
    englishParts.join(' '),
    hungarianParts.join(' '),
    ...englishParts,
    ...hungarianParts,
  ].filter(Boolean)));
  return {
    english: englishParts.join(' > ') || titleCaseFromKey(categoryValue),
    hungarian: hungarianParts.join(' > ') || titleCaseFromKey(categoryValue),
    aliases,
  };
}

export interface RankedCategorySuggestion extends DbFacetOption {
  displayLabel: string;
  confidence: number;
  aliasHu: string;
  aliasEn: string;
}

function levenshteinDistance(a: string, b: string): number {
  const left = normalizeHumanSearch(a);
  const right = normalizeHumanSearch(b);
  const matrix = Array.from({ length: left.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= right.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
  }
  return matrix[left.length][right.length];
}

function expandHungarianCategoryHints(input: string): string[] {
  const normalized = normalizeHumanSearch(input);
  const hints = new Set<string>([normalized]);
  if (/(vendeg|etel|etterem|kaja|gasztro|iszogat|ital)/.test(normalized)) {
    ['catering', 'restaurant', 'cafe', 'bar', 'pub', 'food', 'drink'].forEach((item) => hints.add(item));
  }
  if (/(kave|kavezo|cafe)/.test(normalized)) ['cafe', 'coffee', 'catering'].forEach((item) => hints.add(item));
  if (/(tarsas|jatek|gondolkodas|board)/.test(normalized)) ['game', 'board', 'pub', 'entertainment', 'leisure'].forEach((item) => hints.add(item));
  if (/(sport|edzes|fitness|mozgas)/.test(normalized)) ['sport', 'fitness', 'leisure'].forEach((item) => hints.add(item));
  if (/(zene|koncert|buli|szorakozas)/.test(normalized)) ['music', 'concert', 'entertainment', 'nightclub'].forEach((item) => hints.add(item));
  return Array.from(hints).filter(Boolean);
}

export function rankDiscoveredCategoryMatches(input: string, categories: DbFacetOption[]) {
  const terms = expandHungarianCategoryHints(input);
  if (terms.length === 0) return [] as RankedCategorySuggestion[];
  return categories
    .map((category) => {
      const aliasInfo = deriveCategoryAliasInfo(category.value);
      const normalizedValue = normalizeHumanSearch(category.value);
      const normalizedLabel = normalizeHumanSearch(category.label || category.value);
      const normalizedAliases = aliasInfo.aliases.map((alias) => normalizeHumanSearch(alias)).filter(Boolean);
      let score = 0;
      for (const term of terms) {
        if (!term) continue;
        if (normalizedValue === term || normalizedLabel === term || normalizedAliases.some((alias) => alias === term)) score = Math.max(score, 1);
        if (
          normalizedValue.includes(term) ||
          normalizedLabel.includes(term) ||
          term.includes(normalizedValue) ||
          normalizedAliases.some((alias) => alias.includes(term) || term.includes(alias))
        ) score = Math.max(score, 0.84);
        const distance = Math.min(
          levenshteinDistance(term, normalizedValue),
          levenshteinDistance(term, normalizedLabel),
          ...normalizedAliases.map((alias) => levenshteinDistance(term, alias)),
        );
        const basis = Math.max(term.length, normalizedValue.length, normalizedLabel.length, ...normalizedAliases.map((alias) => alias.length), 1);
        score = Math.max(score, Math.max(0, 1 - distance / basis) * 0.74);
      }
      return {
        ...category,
        displayLabel: `${titleCaseFromKey(category.value)} · ${aliasInfo.hungarian}`,
        aliasHu: aliasInfo.hungarian,
        aliasEn: aliasInfo.english,
        confidence: Number(score.toFixed(2)),
      } satisfies RankedCategorySuggestion;
    })
    .filter((item) => item.confidence >= 0.45)
    .sort((a, b) => b.confidence - a.confidence || b.count - a.count)
    .slice(0, 8);
}

export function resolveMappedCategory(input: string, categories: DbFacetOption[]) {
  const [best] = rankDiscoveredCategoryMatches(input, categories);
  return best && best.confidence >= 0.62 ? best.value : input;
}

export interface DbConfigFormState {
  table: GeodataTableName;
  label: string;
  city: string;
  category: string;
  source: string;
  columns: string[];
  limit: number;
}

export const DEFAULT_DB_FORM: DbConfigFormState = {
  table: 'public.unified_pois',
  label: 'Unified POI',
  city: 'Budapest',
  category: '',
  source: '',
  columns: DEFAULT_DB_TEST_COLUMNS,
  limit: 10,
};
