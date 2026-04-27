import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Search, ExternalLink, AlertCircle, CheckCircle, Info, Database, MapPinned, Save, MapPin, Trash2, PlusCircle, TableProperties } from 'lucide-react';
import { searchEventbriteEvents, fetchEventbriteOrganizations, fetchEventbriteEvents, type MappedEventbriteEvent } from '@/lib/eventbrite';
import { previewTicketmasterEvents, syncTicketmasterEvents } from '@/lib/external-events/ticketmaster';
import { previewSeatGeekEvents, syncSeatGeekEvents } from '@/lib/external-events/seatgeek';
import type { ExternalEventNormalized, ExternalEventsSearchResult, TicketmasterSearchParams, SeatGeekSearchParams } from '@/lib/external-events';
import { mapExternalEventToCardLike } from '@/lib/external-events/normalize';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  setAddressSearchProvider,
  getAllFunctionGroupProviders,
  FUNCTION_GROUP_LABELS,
  GEODATA_TABLE_OPTIONS,
  getDbSearchTableConfigs,
  saveDbSearchTableConfigs,
  testDbSearchTableQuery,
  discoverDbSearchTableFacets,
  getProviderDisplayLabel,
  makeDbProviderId,
  type AddressSearchProvider,
  type AddressSearchFunctionGroup,
  type DbSearchTableConfig,
  type DbFacetOption,
  type DbTableFacetDiscoveryResult,
  type GeodataTableName,
} from '@/lib/searchProviderConfig';
import { searchPlaces, type NormalizedPlace } from '@/lib/placeSearch';

function ExternalEventList({ events }: { events: ExternalEventNormalized[] }) {
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

const BASE_PROVIDER_OPTIONS: Array<{ value: AddressSearchProvider; label: string; detail: string }> = [
  { value: 'aws', label: 'AWS Places', detail: 'AWS Location Places provider' },
  { value: 'geoapify_tomtom', label: 'Geoapify+TomTom', detail: 'Live külső provider fallback' },
  { value: 'mapy', label: 'Mapy.cz', detail: 'Mapy cím- és útvonal provider' },
];

const DB_TEST_COLUMN_OPTIONS = [
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

const DEFAULT_DB_TEST_COLUMNS = DB_TEST_COLUMN_OPTIONS.map((column) => column.value);

function formatDbCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'igen' : 'nem';
  return String(value);
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

function buildDisplayRowsFromPlaceSearchResult(result: any, selectedColumns: string[]): Record<string, unknown>[] {
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

function resolveTotalCountFromPlaceSearchResult(result: any, displayRows: Record<string, unknown>[]): number | null {
  if (typeof result?.totalCount === 'number') return result.totalCount;
  if (typeof result?.total_count === 'number') return result.total_count;
  if (typeof result?.debug?.total_count === 'number') return result.debug.total_count;
  if (typeof result?.debug?.filtered_candidate_count === 'number') return result.debug.filtered_candidate_count;
  if (typeof result?.debug?.raw_candidate_count === 'number') return result.debug.raw_candidate_count;
  return displayRows.length > 0 ? displayRows.length : null;
}

function matchesColumnFilter(value: unknown, filter: string): boolean {
  if (!filter.trim()) return true;
  return formatDbCell(value).toLowerCase().includes(filter.trim().toLowerCase());
}

function filterRowsByColumns(rows: Record<string, unknown>[], columns: string[], filters: Record<string, string>) {
  if (rows.length === 0 || columns.length === 0) return rows;
  return rows.filter((row) => columns.every((column) => matchesColumnFilter(row[column], filters[column] || '')));
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

function titleCaseFromKey(value: string): string {
  return value
    .replace(/[_.-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

function rankDiscoveredCategoryMatches(input: string, categories: DbFacetOption[]) {
  const terms = expandHungarianCategoryHints(input);
  if (terms.length === 0) return [];
  return categories
    .map((category) => {
      const normalizedValue = normalizeHumanSearch(category.value);
      const normalizedLabel = normalizeHumanSearch(category.label || category.value);
      let score = 0;
      for (const term of terms) {
        if (!term) continue;
        if (normalizedValue === term || normalizedLabel === term) score = Math.max(score, 1);
        if (normalizedValue.includes(term) || normalizedLabel.includes(term) || term.includes(normalizedValue)) score = Math.max(score, 0.82);
        const distance = Math.min(levenshteinDistance(term, normalizedValue), levenshteinDistance(term, normalizedLabel));
        const basis = Math.max(term.length, normalizedValue.length, normalizedLabel.length, 1);
        score = Math.max(score, Math.max(0, 1 - distance / basis) * 0.72);
      }
      return { ...category, displayLabel: titleCaseFromKey(category.value), confidence: Number(score.toFixed(2)) };
    })
    .filter((item) => item.confidence >= 0.45)
    .sort((a, b) => b.confidence - a.confidence || b.count - a.count)
    .slice(0, 6);
}

function resolveMappedCategory(input: string, categories: DbFacetOption[]) {
  const [best] = rankDiscoveredCategoryMatches(input, categories);
  return best && best.confidence >= 0.62 ? best.value : input;
}

interface DbConfigFormState {
  table: GeodataTableName;
  label: string;
  city: string;
  category: string;
  source: string;
  columns: string[];
  limit: number;
}

const DEFAULT_DB_FORM: DbConfigFormState = {
  table: 'public.unified_pois',
  label: 'Unified POI',
  city: 'Budapest',
  category: '',
  source: '',
  columns: DEFAULT_DB_TEST_COLUMNS,
  limit: 10,
};

export function AdminEventbrite() {
  const [providerTab, setProviderTab] = useState<'eventbrite' | 'ticketmaster' | 'seatgeek' | 'places'>('eventbrite');

  const [keyword, setKeyword] = useState('Budapest');
  const [events, setEvents] = useState<MappedEventbriteEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  const [ticketmasterParams, setTicketmasterParams] = useState<TicketmasterSearchParams>({
    keyword: 'Budapest',
    countryCode: 'HU',
    classificationName: 'music',
    size: 20,
    page: 0,
    source: 'ticketmaster',
  });
  const [ticketmasterPreview, setTicketmasterPreview] = useState<ExternalEventNormalized[]>([]);
  const [ticketmasterLoading, setTicketmasterLoading] = useState(false);
  const [ticketmasterInfo, setTicketmasterInfo] = useState<string | null>(null);

  const [seatgeekParams, setSeatGeekParams] = useState<SeatGeekSearchParams>({
    q: 'Budapest',
    venueCity: 'Budapest',
    taxonomyName: 'sports',
    perPage: 20,
    page: 1,
  });
  const [seatgeekPreview, setSeatGeekPreview] = useState<ExternalEventNormalized[]>([]);
  const [seatgeekLoading, setSeatGeekLoading] = useState(false);
  const [seatgeekInfo, setSeatGeekInfo] = useState<string | null>(null);

  const [functionGroupProviders, setFunctionGroupProviders] = useState<Record<AddressSearchFunctionGroup, AddressSearchProvider>>({
    default: 'aws',
    personal: 'aws',
    venue: 'aws',
    trip_planner: 'aws',
  });
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerSaving, setProviderSaving] = useState(false);
  const [testQuery, setTestQuery] = useState('Budapest társasjáték');
  const [testFunctionGroup, setTestFunctionGroup] = useState<AddressSearchFunctionGroup>('venue');
  const [testResults, setTestResults] = useState<NormalizedPlace[]>([]);
  const [testLoading, setTestLoading] = useState(false);

  const [dbConfigs, setDbConfigs] = useState<DbSearchTableConfig[]>([]);
  const [dbConfigLoading, setDbConfigLoading] = useState(false);
  const [dbConfigSaving, setDbConfigSaving] = useState(false);
  const [dbForm, setDbForm] = useState<DbConfigFormState>(DEFAULT_DB_FORM);
  const [dbTestResults, setDbTestResults] = useState<any[]>([]);
  const [dbTestRows, setDbTestRows] = useState<Record<string, unknown>[]>([]);
  const [dbTestColumns, setDbTestColumns] = useState<string[]>(DEFAULT_DB_TEST_COLUMNS);
  const [dbColumnFilters, setDbColumnFilters] = useState<Record<string, string>>({});
  const [mapperColumns, setMapperColumns] = useState<string[]>(['id', 'name', 'city', 'formatted_address', 'categories', 'source_provider']);
  const [mapperColumnFilters, setMapperColumnFilters] = useState<Record<string, string>>({});
  const [dbTotalCount, setDbTotalCount] = useState<number | null>(null);
  const [dbTestLoading, setDbTestLoading] = useState(false);
  const [dbDebug, setDbDebug] = useState<Record<string, unknown> | null>(null);
  const [dbQueryExecuted, setDbQueryExecuted] = useState(false);
  const [dbQueryError, setDbQueryError] = useState<string | null>(null);
  const [dbDiscovery, setDbDiscovery] = useState<DbTableFacetDiscoveryResult | null>(null);
  const [dbDiscoveryLoading, setDbDiscoveryLoading] = useState(false);
  const [dbDiscoveryError, setDbDiscoveryError] = useState<string | null>(null);
  const [dbSlowQueryNotice, setDbSlowQueryNotice] = useState(false);
  const [dbResponseMs, setDbResponseMs] = useState<number | null>(null);

  const providerOptions = useMemo(() => {
    const dbOptions = dbConfigs.map((row) => ({
      value: row.provider as AddressSearchProvider,
      label: `${row.provider} · ${row.label}`,
      detail: row.table,
    }));
    return [...BASE_PROVIDER_OPTIONS, ...dbOptions];
  }, [dbConfigs]);

  const dbCategorySuggestions = useMemo(() => rankDiscoveredCategoryMatches(dbForm.category, dbDiscovery?.categories || []), [dbForm.category, dbDiscovery]);
  const dbMappedCategory = useMemo(() => resolveMappedCategory(dbForm.category, dbDiscovery?.categories || []), [dbForm.category, dbDiscovery]);
  const filteredDbRows = useMemo(() => filterRowsByColumns(dbTestRows, dbTestColumns, dbColumnFilters), [dbTestRows, dbTestColumns, dbColumnFilters]);
  const filteredMapperRows = useMemo(() => {
    const mapperRows = dbTestResults.map((row) => {
      const projected: Record<string, unknown> = {};
      mapperColumns.forEach((column) => {
        projected[column] = valueFromMappedProviderResult(row, column);
      });
      return projected;
    });
    return filterRowsByColumns(mapperRows, mapperColumns, mapperColumnFilters);
  }, [dbTestResults, mapperColumns, mapperColumnFilters]);

  const loadDbDiscovery = async (table = dbForm.table, label = dbForm.label) => {
    setDbDiscoveryLoading(true);
    setDbDiscoveryError(null);
    try {
      const discovery = await discoverDbSearchTableFacets({ table, label, limit: 5000 });
      setDbDiscovery(discovery);
    } catch (err: any) {
      setDbDiscovery(null);
      setDbDiscoveryError(err.message || 'Nem sikerült betölteni az élő kategória-felderítést.');
    } finally {
      setDbDiscoveryLoading(false);
    }
  };

  const loadProviderState = async () => {
    setProviderLoading(true);
    setDbConfigLoading(true);
    try {
      const [providers, dbConfigResponse] = await Promise.all([
        getAllFunctionGroupProviders(),
        getDbSearchTableConfigs(true),
      ]);
      setFunctionGroupProviders(providers);
      setDbConfigs(dbConfigResponse.tables);
    } finally {
      setProviderLoading(false);
      setDbConfigLoading(false);
    }
  };

  useEffect(() => {
    void loadProviderState();
  }, []);

  useEffect(() => {
    if (providerTab === 'places') void loadDbDiscovery(dbForm.table, dbForm.label);
  }, [providerTab, dbForm.table]);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    setDebugInfo(null);
    try {
      const result = await searchEventbriteEvents(keyword, 1);
      setEvents(result.events);
      if (result.events.length > 0) {
        toast.success(`${result.events.length} esemény betöltve az Eventbrite-ról`);
      } else {
        setDebugInfo('Az Eventbrite API nem adott vissza eseményeket. Ez lehet a keresési kifejezés, az API kulcs jogosultsága, vagy az Eventbrite API korlátozása miatt.');
      }
    } catch (err: any) {
      setError(err.message || 'Hiba az Eventbrite API hívásnál');
      toast.error('Eventbrite hiba');
    }
    setLoading(false);
  };

  const handleTokenTest = async () => {
    setLoading(true);
    setError(null);
    setDebugInfo(null);
    try {
      const { data, error: tokenError } = await supabase.functions.invoke('eventbrite-import', {
        body: { action: 'validate_token' },
      });
      if (tokenError) throw new Error(tokenError.message);
      if (data?.ok) {
        toast.success('Eventbrite token validálva');
        setDebugInfo(`Token rendben. Webhook ID: ${data?.config?.webhook_id || 'nincs beállítva'}`);
      } else {
        setError(`Eventbrite token hiba: ${data?.status || 'ismeretlen'} - ${JSON.stringify(data?.response)}`);
      }
    } catch (err: any) {
      setError(err.message || 'Token teszt hiba');
    }
    setLoading(false);
  };

  const handleOrgPull = async () => {
    setLoading(true);
    setError(null);
    setDebugInfo(null);
    try {
      const orgs = await fetchEventbriteOrganizations();
      if (orgs.organizations?.length > 0) {
        const orgId = orgs.organizations[0].id;
        const result = await fetchEventbriteEvents(orgId, 1);
        setEvents(result.events);
        toast.success(`${result.events.length} szervezeti esemény betöltve`);
      } else {
        setDebugInfo('Nincs szervezet társítva az Eventbrite API kulcshoz. Az Eventbrite v3 API csak szervezeti eseményeket tud listázni. Hozz létre egy szervezetet az Eventbrite dashboardon, vagy használj személyes OAuth tokent.');
      }
    } catch (err: any) {
      setError(err.message || 'Hiba');
    }
    setLoading(false);
  };

  const handleTicketmasterPreview = async () => {
    setTicketmasterLoading(true);
    setTicketmasterInfo(null);
    try {
      const result: ExternalEventsSearchResult = await previewTicketmasterEvents(ticketmasterParams);
      setTicketmasterPreview(result.events);
      setTicketmasterInfo(result.events.length > 0 ? `${result.events.length} Ticketmaster/Universe esemény találat.` : 'A Ticketmaster nem adott vissza találatot erre a kombinációra.');
    } catch (err: any) {
      setTicketmasterInfo(err.message || 'Ticketmaster előnézeti hiba.');
      setTicketmasterPreview([]);
    }
    setTicketmasterLoading(false);
  };

  const handleTicketmasterSync = async () => {
    setTicketmasterLoading(true);
    try {
      const result = await syncTicketmasterEvents({ ...ticketmasterParams, maxPages: 2 });
      toast.success(`${result.synced} Ticketmaster esemény szinkronizálva`);
      await handleTicketmasterPreview();
    } catch (err: any) {
      toast.error(err.message || 'Ticketmaster szinkron hiba');
    }
    setTicketmasterLoading(false);
  };

  const handleSeatGeekPreview = async () => {
    setSeatGeekLoading(true);
    setSeatGeekInfo(null);
    try {
      const result: ExternalEventsSearchResult = await previewSeatGeekEvents(seatgeekParams);
      setSeatGeekPreview(result.events);
      setSeatGeekInfo(result.events.length > 0 ? `${result.events.length} SeatGeek esemény találat.` : 'A SeatGeek nem adott vissza találatot.');
    } catch (err: any) {
      setSeatGeekInfo(err.message || 'SeatGeek előnézeti hiba.');
      setSeatGeekPreview([]);
    }
    setSeatGeekLoading(false);
  };

  const handleSeatGeekSync = async () => {
    setSeatGeekLoading(true);
    try {
      const result = await syncSeatGeekEvents({ ...seatgeekParams, maxPages: 2 });
      toast.success(`${result.synced} SeatGeek esemény szinkronizálva`);
      await handleSeatGeekPreview();
    } catch (err: any) {
      toast.error(err.message || 'SeatGeek szinkron hiba');
    }
    setSeatGeekLoading(false);
  };

  const handleSaveProvider = async (group: AddressSearchFunctionGroup) => {
    setProviderSaving(true);
    try {
      await setAddressSearchProvider(functionGroupProviders[group], group);
      await loadProviderState();
      toast.success(`${FUNCTION_GROUP_LABELS[group]} provider elmentve és visszaellenőrizve`);
    } catch (err: any) {
      toast.error(err.message || 'Nem sikerült menteni a provider beállítást');
    }
    setProviderSaving(false);
  };

  const handleSaveAllProviders = async () => {
    setProviderSaving(true);
    try {
      const groups: AddressSearchFunctionGroup[] = ['default', 'personal', 'venue', 'trip_planner'];
      for (const g of groups) {
        await setAddressSearchProvider(functionGroupProviders[g], g);
      }
      await loadProviderState();
      toast.success('Minden provider beállítás elmentve és visszaellenőrizve');
    } catch (err: any) {
      toast.error(err.message || 'Nem sikerült menteni');
    }
    setProviderSaving(false);
  };

  const handleTestProvider = async () => {
    setTestLoading(true);
    try {
      const provider = functionGroupProviders[testFunctionGroup];
      const results = await searchPlaces(testQuery, undefined, undefined, provider);
      setTestResults(results);
      toast.success(`${results.length} találat (${FUNCTION_GROUP_LABELS[testFunctionGroup]} — ${getProviderDisplayLabel(provider, dbConfigs)})`);
    } catch (err: any) {
      toast.error(err.message || 'Provider tesztelési hiba');
      setTestResults([]);
    }
    setTestLoading(false);
  };

  const persistDbConfigs = async (next: DbSearchTableConfig[]) => {
    setDbConfigSaving(true);
    try {
      const saved = await saveDbSearchTableConfigs(next);
      setDbConfigs(saved.tables);
      await loadProviderState();
      toast.success('Adatbázistábla provider konfiguráció elmentve és visszaellenőrizve');
    } catch (err: any) {
      toast.error(err.message || 'Nem sikerült menteni az adatbázistábla konfigurációt');
    } finally {
      setDbConfigSaving(false);
    }
  };

  const handleAddDbConfig = async () => {
    const id = makeDbProviderId(dbForm.label, dbForm.table);
    const now = new Date().toISOString();
    const nextRow: DbSearchTableConfig = {
      id,
      provider: `db:${id}`,
      label: dbForm.label.trim() || dbForm.table.split('.').pop() || dbForm.table,
      table: dbForm.table,
      enabled: true,
      createdAt: dbConfigs.find((row) => row.id === id)?.createdAt || now,
      updatedAt: now,
    };
    const next = [...dbConfigs.filter((row) => row.id !== id), nextRow];
    await persistDbConfigs(next);
  };

  const handleRemoveDbConfig = async (provider: AddressSearchProvider) => {
    const next = dbConfigs.filter((row) => row.provider !== provider);
    setFunctionGroupProviders((prev) => {
      const patched = { ...prev };
      (Object.keys(patched) as AddressSearchFunctionGroup[]).forEach((group) => {
        if (patched[group] === provider) patched[group] = 'geoapify_tomtom';
      });
      return patched;
    });
    await persistDbConfigs(next);
  };

  const handleEditDbConfig = (row: DbSearchTableConfig) => {
    setDbForm((prev) => ({ ...prev, table: row.table, label: row.label }));
  };

  const handleTestDbTable = async () => {
    setDbQueryExecuted(true);
    setDbQueryError(null);
    setDbDebug(null);
    setDbTestResults([]);
    setDbTestRows([]);
    setDbTotalCount(null);

    if (dbForm.columns.length === 0) {
      const message = 'Válassz ki legalább egy megjelenítendő oszlopot a lekérdezés futtatásához.';
      setDbQueryError(message);
      toast.error(message);
      return;
    }

    setDbTestLoading(true);
    setDbSlowQueryNotice(false);
    const slowTimer = window.setTimeout(() => setDbSlowQueryNotice(true), 500);
    const startedAt = performance.now();
    try {
      const mappedCategory = dbMappedCategory || dbForm.category;
      const result = await testDbSearchTableQuery({
        table: dbForm.table,
        label: dbForm.label,
        city: dbForm.city,
        category: mappedCategory,
        source: dbForm.source,
        columns: dbForm.columns,
        limit: dbForm.limit,
      });
      const mappedRows = (result.results || []) as any[];
      const selectedColumns = result.columns && result.columns.length > 0 ? result.columns : dbForm.columns;
      const returnedRows = buildDisplayRowsFromPlaceSearchResult(result, selectedColumns);
      const totalCount = resolveTotalCountFromPlaceSearchResult(result, returnedRows);
      setDbTestResults(mappedRows);
      setDbTestRows(returnedRows);
      setDbTestColumns(selectedColumns);
      setDbColumnFilters((prev) => Object.fromEntries(selectedColumns.map((column) => [column, prev[column] || ''])));
      const defaultMapperColumns = ['id', 'name', 'city', 'formatted_address', 'categories', 'source_provider'];
      const nextMapperColumns = Array.from(new Set(defaultMapperColumns.filter((column) => selectedColumns.includes(column) || defaultMapperColumns.includes(column))));
      setMapperColumns(nextMapperColumns);
      setMapperColumnFilters((prev) => Object.fromEntries(nextMapperColumns.map((column) => [column, prev[column] || ''])));
      setDbTotalCount(totalCount);
      const responseMs = Math.round(performance.now() - startedAt);
      setDbResponseMs(typeof result.debug?.response_ms === 'number' ? result.debug.response_ms : responseMs);
      setDbDebug({ ...(result.debug || {}), requested_category: dbForm.category, mapped_category: mappedCategory, frontend_response_ms: responseMs });
      const countLabel = typeof totalCount === 'number' ? ` / ${totalCount} találat az adatbázisban` : '';
      toast.success(`${returnedRows.length} sor lekérve: ${dbForm.table}${countLabel}`);
    } catch (err: any) {
      const message = err.message || 'Adatbázistábla lekérdezési hiba';
      setDbQueryError(message);
      toast.error(message);
    } finally {
      window.clearTimeout(slowTimer);
      setDbSlowQueryNotice(false);
      setDbTestLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-lg">
            <RefreshCw className="h-5 w-5 text-primary" /> Külső forrás import és címkereső provider
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={providerTab} onValueChange={(v) => setProviderTab(v as any)} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
              <TabsTrigger value="eventbrite">Eventbrite</TabsTrigger>
              <TabsTrigger value="ticketmaster">Ticketmaster</TabsTrigger>
              <TabsTrigger value="seatgeek">SeatGeek</TabsTrigger>
              <TabsTrigger value="places">Címkereső</TabsTrigger>
            </TabsList>

            <TabsContent value="eventbrite" className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg bg-accent/10 p-3 text-sm">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div>
                  <p className="font-medium">Eventbrite integráció</p>
                  <p className="mt-1 text-xs text-muted-foreground">Az Eventbrite v3 API keresést és szervezeti eseménylistát támogat. Innen preview-zni és ellenőrizni tudod az Eventbrite kapcsolatot.</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Keresés Eventbrite-on..." onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
                <Button onClick={handleSearch} disabled={loading}><Search className="mr-1 h-4 w-4" />Keresés</Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleTokenTest} disabled={loading}>Token teszt</Button>
                <Button variant="outline" onClick={handleOrgPull} disabled={loading}>Szervezeti események</Button>
              </div>

              {error && <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</div>}
              {debugInfo && <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-sm"><Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><span className="text-muted-foreground">{debugInfo}</span></div>}
              {events.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-success" />
                    <span className="text-sm font-medium">{events.length} esemény betöltve</span>
                  </div>
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {events.map((ev) => (
                      <div key={ev.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                        <span className="text-2xl">{ev.image_emoji || '📅'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{ev.title}</p>
                          <p className="text-xs text-muted-foreground">{ev.event_date || '—'} · {ev.location_city || 'Online'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{ev.category}</Badge>
                          {ev.eventbrite_url && (
                            <a href={ev.eventbrite_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="ticketmaster" className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={ticketmasterParams.keyword || ''} onChange={(e) => setTicketmasterParams((prev) => ({ ...prev, keyword: e.target.value }))} placeholder="Kulcsszó / város" />
                <Input value={ticketmasterParams.classificationName || ''} onChange={(e) => setTicketmasterParams((prev) => ({ ...prev, classificationName: e.target.value }))} placeholder="Classification (pl. music, sports)" />
                <Input value={ticketmasterParams.countryCode || ''} onChange={(e) => setTicketmasterParams((prev) => ({ ...prev, countryCode: e.target.value.toUpperCase() }))} placeholder="Országkód (HU)" />
                <select className="h-10 rounded-md border bg-background px-3 text-sm" value={ticketmasterParams.source || 'ticketmaster'} onChange={(e) => setTicketmasterParams((prev) => ({ ...prev, source: e.target.value }))}>
                  <option value="ticketmaster">Ticketmaster</option>
                  <option value="universe">Universe</option>
                  <option value="frontgate">FrontGate</option>
                  <option value="tmr">Ticketmaster Resale</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleTicketmasterPreview} disabled={ticketmasterLoading}><Search className="mr-1 h-4 w-4" />Előnézet</Button>
                <Button variant="outline" onClick={handleTicketmasterSync} disabled={ticketmasterLoading}><RefreshCw className={`mr-1 h-4 w-4 ${ticketmasterLoading ? 'animate-spin' : ''}`} />Import adatbázisba</Button>
              </div>
              {ticketmasterInfo && <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">{ticketmasterInfo}</div>}
              <ExternalEventList events={ticketmasterPreview} />
            </TabsContent>

            <TabsContent value="seatgeek" className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={seatgeekParams.q || ''} onChange={(e) => setSeatGeekParams((prev) => ({ ...prev, q: e.target.value }))} placeholder="Kulcsszó" />
                <Input value={seatgeekParams.venueCity || ''} onChange={(e) => setSeatGeekParams((prev) => ({ ...prev, venueCity: e.target.value }))} placeholder="Város" />
                <Input value={seatgeekParams.taxonomyName || ''} onChange={(e) => setSeatGeekParams((prev) => ({ ...prev, taxonomyName: e.target.value }))} placeholder="Taxonómia (pl. sports, concerts)" />
                <Input value={String(seatgeekParams.perPage || 20)} onChange={(e) => setSeatGeekParams((prev) => ({ ...prev, perPage: Number(e.target.value) || 20 }))} placeholder="Darabszám" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSeatGeekPreview} disabled={seatgeekLoading}><Search className="mr-1 h-4 w-4" />Előnézet</Button>
                <Button variant="outline" onClick={handleSeatGeekSync} disabled={seatgeekLoading}><RefreshCw className={`mr-1 h-4 w-4 ${seatgeekLoading ? 'animate-spin' : ''}`} />Import adatbázisba</Button>
              </div>
              {seatgeekInfo && <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">{seatgeekInfo}</div>}
              <ExternalEventList events={seatgeekPreview} />
            </TabsContent>

            <TabsContent value="places" className="space-y-5 max-w-full overflow-hidden">
              <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,0.9fr)_minmax(360px,1.1fr)]">
                <Card className="min-w-0 overflow-hidden">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><MapPinned className="h-4 w-4 text-primary" /> Címkereső provider — funkció csoportonként</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <p className="text-sm text-muted-foreground">
                      Minden funkcióhoz külön kiválaszthatod, melyik provider szolgálja ki a címkeresést. A korábbi „Lokális katalógus” opció kikerült; helyette a jobb oldali adatbázistábla konfigurátorral létrehozott <code className="rounded bg-muted px-1">db:*</code> providerek választhatók.
                    </p>

                    {(['default', 'personal', 'venue', 'trip_planner'] as AddressSearchFunctionGroup[]).map((group) => (
                      <div key={group} className="rounded-lg border p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">{FUNCTION_GROUP_LABELS[group]}</p>
                          <Badge variant="outline" className="max-w-[220px] truncate">{getProviderDisplayLabel(functionGroupProviders[group], dbConfigs)}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {providerOptions.map((opt) => (
                            <label key={`${group}-${opt.value}`} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-muted/40">
                              <input
                                type="radio"
                                name={`provider-${group}`}
                                className="h-3 w-3"
                                checked={functionGroupProviders[group] === opt.value}
                                onChange={() => setFunctionGroupProviders((prev) => ({ ...prev, [group]: opt.value }))}
                              />
                              <span className="min-w-0">
                                <span className="block font-medium">{opt.label}</span>
                                <span className="block max-w-[220px] truncate text-muted-foreground">{opt.detail}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => handleSaveProvider(group)} disabled={providerSaving || providerLoading}>
                          <Save className="mr-1 h-3 w-3" /> Mentés
                        </Button>
                      </div>
                    ))}

                    <div className="flex flex-wrap gap-2">
                      <Button onClick={handleSaveAllProviders} disabled={providerLoading || providerSaving}>
                        <Save className="mr-1 h-4 w-4" /> Összes mentése
                      </Button>
                      <Button variant="outline" onClick={loadProviderState} disabled={providerLoading || dbConfigLoading}>
                        <RefreshCw className={`mr-1 h-4 w-4 ${providerLoading || dbConfigLoading ? 'animate-spin' : ''}`} /> Frissítés
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="min-w-0 overflow-hidden">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4 text-primary" /> Adatbázistábla kapcsolat</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                      Geodata Supabase projekt: <code className="rounded bg-background px-1">https://buuoyyfzincmbxafvihc.supabase.co</code>. Itt választod ki, mely táblákból jöhetnek venue találatok. A mentett sorok <code className="rounded bg-background px-1">db:</code> prefixű providerként jelennek meg a bal oldali menükben.
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1 text-xs font-medium">
                        Adatbázistábla
                        <select
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm font-normal"
                          value={dbForm.table}
                          onChange={(e) => setDbForm((prev) => ({ ...prev, table: e.target.value as GeodataTableName }))}
                        >
                          {GEODATA_TABLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs font-medium">
                        Megjelenített név
                        <Input value={dbForm.label} onChange={(e) => setDbForm((prev) => ({ ...prev, label: e.target.value }))} placeholder="Pl. Unified POI" />
                      </label>
                      <label className="space-y-1 text-xs font-medium">
                        Teszt város
                        <Input value={dbForm.city} onChange={(e) => setDbForm((prev) => ({ ...prev, city: e.target.value }))} placeholder="Pl. Budapest" />
                      </label>
                      <div className="space-y-1 text-xs font-medium">
                        <div className="flex items-center justify-between gap-2">
                          <span>Teszt kategória</span>
                          <Badge variant="outline" className="gap-1"><Database className="h-3 w-3" /> Live from Database</Badge>
                        </div>
                        <Input
                          value={dbForm.category}
                          onChange={(e) => setDbForm((prev) => ({ ...prev, category: e.target.value }))}
                          placeholder="Pl. Vendéglátás, cafe, restaurant, társas"
                          list="geodata-category-discovery"
                        />
                        <datalist id="geodata-category-discovery">
                          {(dbDiscovery?.categories || []).slice(0, 80).map((category) => (
                            <option key={category.value} value={category.value}>{titleCaseFromKey(category.value)} ({category.count})</option>
                          ))}
                        </datalist>
                        <div className="text-[11px] text-muted-foreground">
                          {dbDiscoveryLoading ? 'Élő kategóriák felderítése...' : dbDiscovery ? `${dbDiscovery.categories.length} kategória · ${dbDiscovery.rowCount ?? dbDiscovery.sampleSize} sor mintázva` : 'A kategóriák az adatbázisból töltődnek.'}
                        </div>
                        {dbForm.category && dbMappedCategory && dbMappedCategory !== dbForm.category ? (
                          <div className="rounded-md border bg-muted/30 p-2 text-[11px]">
                            <span className="font-medium">Erre gondoltál?</span>{' '}
                            <button type="button" className="text-primary underline" onClick={() => setDbForm((prev) => ({ ...prev, category: dbMappedCategory }))}>{titleCaseFromKey(dbMappedCategory)}</button>
                            <span className="text-muted-foreground"> · automatikus semantic mapping a lekérdezéshez</span>
                          </div>
                        ) : null}
                        {dbCategorySuggestions.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {dbCategorySuggestions.map((suggestion) => (
                              <Button key={suggestion.value} type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setDbForm((prev) => ({ ...prev, category: suggestion.value }))}>
                                {titleCaseFromKey(suggestion.value)} · {suggestion.count}
                              </Button>
                            ))}
                          </div>
                        ) : null}
                        {dbDiscoveryError ? <p className="text-[11px] text-destructive">{dbDiscoveryError}</p> : null}
                      </div>
                      <label className="space-y-1 text-xs font-medium">
                        Teszt forrás
                        <Input value={dbForm.source} onChange={(e) => setDbForm((prev) => ({ ...prev, source: e.target.value }))} placeholder="Pl. geoapify, osm, local" list="geodata-source-discovery" />
                        <datalist id="geodata-source-discovery">
                          {(dbDiscovery?.sources || []).map((source) => (
                            <option key={source.value} value={source.value}>{source.value} ({source.count})</option>
                          ))}
                        </datalist>
                      </label>
                      <label className="space-y-1 text-xs font-medium">
                        Teszt lekérdezési darabszám
                        <Input type="number" min={1} max={80} value={dbForm.limit} onChange={(e) => setDbForm((prev) => ({ ...prev, limit: Math.min(Math.max(Number(e.target.value) || 10, 1), 80) }))} />
                      </label>
                      <div className="flex items-end gap-2">
                        <Button className="flex-1" onClick={handleAddDbConfig} disabled={dbConfigSaving}>
                          <PlusCircle className="mr-1 h-4 w-4" /> Mentés providerként
                        </Button>
                        <Button variant="outline" onClick={handleTestDbTable} disabled={dbTestLoading || dbForm.columns.length === 0}>
                          <Search className={`mr-1 h-4 w-4 ${dbTestLoading ? 'animate-spin' : ''}`} /> Lekérdezés
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-lg border bg-muted/10 p-3 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">Tesztben megjelenített oszlopok</p>
                          <p className="text-xs text-muted-foreground">A 15 legfontosabb POI mezőből választhatsz. A nem létező oszlopokat a backend automatikusan kihagyja az adott táblánál.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => setDbForm((prev) => ({ ...prev, columns: DEFAULT_DB_TEST_COLUMNS }))}>Kiválaszt mind</Button>
                          <Button size="sm" variant="outline" onClick={() => setDbForm((prev) => ({ ...prev, columns: [] }))}>Kiválasztások törlése</Button>
                          <Button size="sm" onClick={handleTestDbTable} disabled={dbTestLoading || dbForm.columns.length === 0}>
                            <Search className={`mr-1 h-4 w-4 ${dbTestLoading ? 'animate-spin' : ''}`} /> Lekérdezés futtatása
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {DB_TEST_COLUMN_OPTIONS.map((column) => (
                          <label key={column.value} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-muted/40">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5"
                              checked={dbForm.columns.includes(column.value)}
                              onChange={(e) => setDbForm((prev) => ({
                                ...prev,
                                columns: e.target.checked
                                  ? Array.from(new Set([...prev.columns, column.value]))
                                  : prev.columns.filter((value) => value !== column.value),
                              }))}
                            />
                            <span>{column.label}</span>
                            <code className="ml-auto text-[10px] text-muted-foreground">{column.value}</code>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">

                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Mentett db providerek</p>
                        <Badge variant="secondary">{dbConfigs.length} db</Badge>
                      </div>
                      {dbConfigs.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                          Még nincs mentett adatbázistábla provider. Válassz táblát, adj neki nevet, teszteld, majd mentsd providerként.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {dbConfigs.map((row) => (
                            <div key={row.provider} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{row.label}</p>
                                <p className="truncate text-xs text-muted-foreground"><code>{row.provider}</code> · {row.table}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <Button size="sm" variant="outline" onClick={() => handleEditDbConfig(row)}>Szerkeszt</Button>
                                <Button size="sm" variant="ghost" onClick={() => handleRemoveDbConfig(row.provider)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {dbDebug ? (
                      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">Legutóbbi teszt debug</p>
                        <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(dbDebug, null, 2)}</pre>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>

              <Card className="min-w-0 overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /> Lekérdezés eredménye</span>
                    <Badge variant={dbQueryError ? 'destructive' : 'secondary'}>
                      {dbTestLoading
                        ? 'Lekérdezés folyamatban'
                        : dbQueryError
                          ? 'Hiba'
                          : !dbQueryExecuted
                            ? 'Még nincs futtatva'
                            : dbTotalCount === null
                              ? `${dbTestRows.length} sor`
                              : `${dbTotalCount} találat / ${filteredDbRows.length} megjelenített sor`}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">Tábla: {dbForm.table}</Badge>
                    <Badge variant="outline">Város: {dbForm.city || 'nincs szűrő'}</Badge>
                    <Badge variant="outline">Kategória: {dbForm.category || 'nincs szűrő'}</Badge>
                    <Badge variant="outline">Forrás: {dbForm.source || 'nincs szűrő'}</Badge>
                    <Badge variant="outline">Oszlopok: {dbForm.columns.length}</Badge>
                    {dbResponseMs !== null ? <Badge variant={dbResponseMs > 500 ? 'secondary' : 'outline'}>Válaszidő: {dbResponseMs} ms</Badge> : null}
                    {dbMappedCategory && dbForm.category && dbMappedCategory !== dbForm.category ? <Badge variant="outline">Mapped: {dbMappedCategory}</Badge> : null}
                  </div>

                  {!dbQueryExecuted && !dbTestLoading ? (
                    <div className="flex items-start gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium text-foreground">Itt fognak megjelenni a lekérdezett sorok.</p>
                        <p>Válaszd ki a szűrőket és az oszlopokat, majd kattints a <strong>Lekérdezés futtatása</strong> gombra.</p>
                      </div>
                    </div>
                  ) : null}

                  {dbSlowQueryNotice ? (
                    <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
                      <RefreshCw className="h-4 w-4 animate-spin text-primary" /> Optimizing query... a Supabase válaszideje 500 ms fölött van, fut a lekérdezés.
                    </div>
                  ) : null}

                  {dbTestLoading ? (
                    <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
                      <Search className="h-4 w-4 animate-spin" /> Lekérdezés futtatása...
                    </div>
                  ) : null}

                  {dbQueryError ? (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium">A lekérdezés nem sikerült</p>
                        <p>{dbQueryError}</p>
                      </div>
                    </div>
                  ) : null}

                  {dbQueryExecuted && !dbTestLoading && !dbQueryError && dbTestRows.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      Nincs megjeleníthető sor a megadott szűrőkkel. A tábla {dbDiscovery?.diagnostics?.tableReachable ? 'elérhető' : 'nem ellenőrzött'}, a mintában {dbDiscovery?.diagnostics?.hasAnyRows ? 'van adat' : 'nincs adat'}. {dbForm.category ? `A(z) „${dbForm.category}” kategória mapped értéke: „${dbMappedCategory || dbForm.category}”. Próbáld meg: ${dbDiscovery?.categories?.slice(0, 3).map((item) => titleCaseFromKey(item.value)).join(', ') || 'másik kategória'}.` : 'Próbáld üresen hagyni a kategória vagy forrás szűrőt, vagy növeld a lekérdezési darabszámot.'}
                    </div>
                  ) : null}

                  {dbTestRows.length > 0 ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                        A megjelenített oszlopok most már oszloponként real-time szűrhetők. Gépelés közben azonnal szűkül a lista, így ugyanazt a keresési logikát tudod ellenőrizni, amit az eseménykezelő helyszínkeresőjénél is vársz.
                      </div>
                      {filteredDbRows.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                          A lekérdezés adott vissza sorokat, de az oszlopfejlécek feletti szűrők jelenleg mindet kiszűrik. Töröld vagy módosítsd a fejléc fölötti filtereket.
                        </div>
                      ) : null}
                      <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-lg border">
                        <table className="w-max min-w-full text-xs">
                          <thead className="bg-muted/40 text-muted-foreground">
                            <tr>
                              {dbTestColumns.map((column) => (
                                <th key={column} className="min-w-[180px] whitespace-nowrap px-3 py-2 text-left font-medium">
                                  <div className="space-y-2">
                                    <Input
                                      value={dbColumnFilters[column] || ''}
                                      onChange={(e) => setDbColumnFilters((prev) => ({ ...prev, [column]: e.target.value }))}
                                      placeholder={`${column} szűrés...`}
                                      className="h-8 min-w-[160px] bg-background text-xs"
                                    />
                                    <span className="block text-[11px] font-medium text-foreground">{column}</span>
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredDbRows.map((row, index) => (
                              <tr key={index} className="border-t align-top">
                                {dbTestColumns.map((column) => (
                                  <td key={column} className="max-w-[260px] truncate px-3 py-2" title={formatDbCell(row[column])}>{formatDbCell(row[column])}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {dbQueryExecuted && !dbTestLoading && !dbQueryError ? (
                    <div className="space-y-3 rounded-lg border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="flex items-center gap-2 text-sm font-medium"><TableProperties className="h-4 w-4 text-primary" /> Fordító / mapper nézet</p>
                          <p className="text-xs text-muted-foreground">Ez a place-search mapper normalizált kimenete ugyanarra a lekérdezésre, így a nyers táblás eredmény és a frontend által ténylegesen használt mezők egymás mellett ellenőrizhetők.</p>
                        </div>
                        <Badge variant="outline">{filteredMapperRows.length} megjelenített mapper sor</Badge>
                      </div>

                      {filteredMapperRows.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                          A mapper nézetben nincs megjeleníthető sor. Ennek oka lehet, hogy a backend nem adott normalizált mapper eredményt ehhez a lekérdezéshez, vagy a mapper-szűrők mindent kiszűrtek.
                        </div>
                      ) : (
                        <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-lg border">
                          <table className="w-max min-w-full text-xs">
                            <thead className="bg-muted/40 text-muted-foreground">
                              <tr>
                                {mapperColumns.map((column) => (
                                  <th key={column} className="min-w-[180px] whitespace-nowrap px-3 py-2 text-left font-medium">
                                    <div className="space-y-2">
                                      <Input
                                        value={mapperColumnFilters[column] || ''}
                                        onChange={(e) => setMapperColumnFilters((prev) => ({ ...prev, [column]: e.target.value }))}
                                        placeholder={`${column} szűrés...`}
                                        className="h-8 min-w-[160px] bg-background text-xs"
                                      />
                                      <span className="block text-[11px] font-medium text-foreground">{column}</span>
                                    </div>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {filteredMapperRows.map((row, index) => (
                                <tr key={index} className="border-t align-top">
                                  {mapperColumns.map((column) => (
                                    <td key={column} className="max-w-[260px] truncate px-3 py-2" title={formatDbCell(row[column])}>{formatDbCell(row[column])}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4 text-primary" /> Provider teszt — funkció csoport szerint</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-sm font-medium">Funkció csoport:</span>
                    {(['default', 'personal', 'venue', 'trip_planner'] as AddressSearchFunctionGroup[]).map((g) => (
                      <Button
                        key={g}
                        size="sm"
                        variant={testFunctionGroup === g ? 'default' : 'outline'}
                        onClick={() => setTestFunctionGroup(g)}
                      >
                        {FUNCTION_GROUP_LABELS[g].split(' (')[0]}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Aktív provider ehhez a csoporthoz: <Badge variant="outline">{getProviderDisplayLabel(functionGroupProviders[testFunctionGroup], dbConfigs)}</Badge>
                  </p>
                  <div className="flex gap-2">
                    <Input value={testQuery} onChange={(e) => setTestQuery(e.target.value)} placeholder="Pl. Budapest társasjáték, Szeged kávézó" onKeyDown={(e) => e.key === 'Enter' && handleTestProvider()} />
                    <Button onClick={handleTestProvider} disabled={testLoading}><Search className="mr-1 h-4 w-4" />Teszt</Button>
                  </div>
                  {testResults.length > 0 && (
                    <div className="max-h-80 space-y-2 overflow-y-auto">
                      {testResults.slice(0, 10).map((item) => (
                        <div key={item.id} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-muted-foreground">{item.address}</p>
                              <p className="text-xs text-muted-foreground">{[item.city, item.district, item.postcode].filter(Boolean).join(' · ')}</p>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              <Badge variant="outline">{item.source}</Badge>
                              <p className="mt-1">{item.lat.toFixed(4)}, {item.lon.toFixed(4)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
