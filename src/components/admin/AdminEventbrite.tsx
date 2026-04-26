import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Search, ExternalLink, AlertCircle, CheckCircle, Info, Database, MapPinned, Save, MapPin, Trash2, PlusCircle } from 'lucide-react';
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
  getProviderDisplayLabel,
  makeDbProviderId,
  type AddressSearchProvider,
  type AddressSearchFunctionGroup,
  type DbSearchTableConfig,
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

interface DbConfigFormState {
  table: GeodataTableName;
  label: string;
  city: string;
  category: string;
  limit: number;
}

const DEFAULT_DB_FORM: DbConfigFormState = {
  table: 'public.unified_pois',
  label: 'Unified POI',
  city: 'Budapest',
  category: '',
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
  const [dbTestResults, setDbTestResults] = useState<NormalizedPlace[]>([]);
  const [dbTestLoading, setDbTestLoading] = useState(false);
  const [dbDebug, setDbDebug] = useState<Record<string, unknown> | null>(null);

  const providerOptions = useMemo(() => {
    const dbOptions = dbConfigs.map((row) => ({
      value: row.provider as AddressSearchProvider,
      label: `${row.provider} · ${row.label}`,
      detail: row.table,
    }));
    return [...BASE_PROVIDER_OPTIONS, ...dbOptions];
  }, [dbConfigs]);

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
      toast.success(`${FUNCTION_GROUP_LABELS[group]} provider elmentve`);
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
      toast.success('Minden provider beállítás elmentve');
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
      toast.success('Adatbázistábla provider konfiguráció elmentve');
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
    setDbTestLoading(true);
    setDbDebug(null);
    setDbTestResults([]);
    try {
      const result = await testDbSearchTableQuery({
        table: dbForm.table,
        label: dbForm.label,
        city: dbForm.city,
        category: dbForm.category,
        limit: dbForm.limit,
      });
      const normalized = ((result.results || []) as any[]).map((row) => ({
        id: `${row.provider}-${row.external_id}`,
        name: row.name,
        address: row.address || row.name,
        city: row.city || '',
        district: row.district || '',
        country: typeof row.metadata?.country === 'string' ? row.metadata.country : 'Hungary',
        postcode: row.postal_code || '',
        lat: typeof row.latitude === 'number' ? row.latitude : 0,
        lon: typeof row.longitude === 'number' ? row.longitude : 0,
        categories: Array.isArray(row.categories) ? row.categories : row.category ? [row.category] : [],
        source: row.provider,
        sourceId: row.external_id,
        confidence: 0.75,
      }));
      setDbTestResults(normalized);
      setDbDebug(result.debug || null);
      toast.success(`${normalized.length} tesztsor lekérve: ${dbForm.table}`);
    } catch (err: any) {
      toast.error(err.message || 'Adatbázistábla teszt hiba');
    } finally {
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

            <TabsContent value="places" className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                <Card>
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

                <Card>
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
                      <label className="space-y-1 text-xs font-medium">
                        Teszt kategória
                        <Input value={dbForm.category} onChange={(e) => setDbForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="Pl. cafe, restaurant, társas" />
                      </label>
                      <label className="space-y-1 text-xs font-medium">
                        Teszt lekérdezési darabszám
                        <Input type="number" min={1} max={80} value={dbForm.limit} onChange={(e) => setDbForm((prev) => ({ ...prev, limit: Math.min(Math.max(Number(e.target.value) || 10, 1), 80) }))} />
                      </label>
                      <div className="flex items-end gap-2">
                        <Button className="flex-1" onClick={handleAddDbConfig} disabled={dbConfigSaving}>
                          <PlusCircle className="mr-1 h-4 w-4" /> Mentés providerként
                        </Button>
                        <Button variant="outline" onClick={handleTestDbTable} disabled={dbTestLoading}>
                          <Search className={`mr-1 h-4 w-4 ${dbTestLoading ? 'animate-spin' : ''}`} /> Teszt
                        </Button>
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
                        <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap">{JSON.stringify(dbDebug, null, 2)}</pre>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>

              {dbTestResults.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4 text-primary" /> Adatbázistábla teszt találatok</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {dbTestResults.map((item) => (
                        <div key={item.id} className="rounded-lg border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{item.name}</p>
                              <p className="text-xs text-muted-foreground">{item.address}</p>
                              <p className="text-xs text-muted-foreground">{[item.city, item.district, item.postcode].filter(Boolean).join(' · ')}</p>
                            </div>
                            <Badge variant="outline">{item.source}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

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
