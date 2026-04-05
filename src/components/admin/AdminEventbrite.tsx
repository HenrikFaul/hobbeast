import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Search, ExternalLink, AlertCircle, CheckCircle, Info, Database, MapPinned, Save, MapPin, Layers } from 'lucide-react';
import { searchEventbriteEvents, fetchEventbriteOrganizations, fetchEventbriteEvents, type MappedEventbriteEvent } from '@/lib/eventbrite';
import { previewTicketmasterEvents, syncTicketmasterEvents } from '@/lib/external-events/ticketmaster';
import { previewSeatGeekEvents, syncSeatGeekEvents } from '@/lib/external-events/seatgeek';
import type { ExternalEventNormalized, ExternalEventsSearchResult, TicketmasterSearchParams, SeatGeekSearchParams } from '@/lib/external-events';
import { mapExternalEventToCardLike } from '@/lib/external-events/normalize';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  getAddressSearchProvider,
  setAddressSearchProvider,
  getAllFunctionGroupProviders,
  FUNCTION_GROUP_LABELS,
  type AddressSearchProvider,
  type AddressSearchFunctionGroup,
} from '@/lib/searchProviderConfig';
import { searchPlaces, type NormalizedPlace } from '@/lib/placeSearch';

interface LocalCatalogStatus {
  totalRows: number;
  state: {
    status?: string;
    rows_written?: number;
    provider_counts?: Record<string, number>;
    last_run_started_at?: string | null;
    last_run_completed_at?: string | null;
    last_error?: string | null;
  } | null;
  providerCounts: Record<string, number>;
  preview: Array<{ provider: string; name: string; city: string | null; category_group: string; synced_at: string }>;
}

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
  const [testFunctionGroup, setTestFunctionGroup] = useState<AddressSearchFunctionGroup>('default');
  const [testResults, setTestResults] = useState<NormalizedPlace[]>([]);
  const [testLoading, setTestLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState<LocalCatalogStatus | null>(null);

  useEffect(() => {
    void (async () => {
      setProviderLoading(true);
      try {
        const providers = await getAllFunctionGroupProviders();
        setFunctionGroupProviders(providers);
      } finally {
        setProviderLoading(false);
      }
      await refreshCatalogStatus();
    })();
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
      const { data, error } = await supabase.functions.invoke('eventbrite-import', {
        body: { action: 'validate_token' },
      });
      if (error) throw new Error(error.message);
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

  const refreshCatalogStatus = async () => {
    setCatalogLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-local-places', { body: { action: 'status' } });
      if (error) throw error;
      setCatalogStatus(data as LocalCatalogStatus);
    } catch (err: any) {
      toast.error(err.message || 'Nem sikerült lekérni a lokális címtábla állapotát');
    }
    setCatalogLoading(false);
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
      toast.success(`${results.length} találat (${FUNCTION_GROUP_LABELS[testFunctionGroup]} — ${provider})`);
    } catch (err: any) {
      toast.error(err.message || 'Provider tesztelési hiba');
      setTestResults([]);
    }
    setTestLoading(false);
  };

  const handleReloadLocalCatalog = async () => {
    setCatalogLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-local-places', { body: { action: 'sync', reset: true } });
      if (error) throw error;
      toast.success(`Lokális címtábla újratöltve. ${data?.rowsWritten || 0} rekord.`);
      setCatalogStatus((data?.status as LocalCatalogStatus) || null);
      await refreshCatalogStatus();
    } catch (err: any) {
      toast.error(err.message || 'Nem sikerült újratölteni a lokális címtáblát');
    }
    setCatalogLoading(false);
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
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Keresés (pl. Budapest, sakk, túra)..." value={keyword} onChange={(e) => setKeyword(e.target.value)} className="pl-9" onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
                </div>
                <Button onClick={handleSearch} disabled={loading}><Search className="mr-1 h-4 w-4" />Keresés</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleTokenTest} disabled={loading}><CheckCircle className="mr-1 h-4 w-4" />Token teszt</Button>
                <Button variant="outline" size="sm" onClick={handleOrgPull} disabled={loading}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Szervezeti események</Button>
              </div>
              {error && <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
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
                          <p className="text-xs text-muted-foreground">
                            {ev.event_date || '—'} · {ev.location_city || 'Online'}
                          </p>
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
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><MapPinned className="h-4 w-4 text-primary" /> Címkereső provider — funkció csoportonként</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <p className="text-sm text-muted-foreground">Minden funkcióhoz külön kiválaszthatod, melyik provider szolgálja ki a címkeresést. Ha egy funkciónál nincs beállítva, az „Alapértelmezett" provider lesz használva.</p>

                    {(['default', 'personal', 'venue', 'trip_planner'] as AddressSearchFunctionGroup[]).map((group) => (
                      <div key={group} className="rounded-lg border p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{FUNCTION_GROUP_LABELS[group]}</p>
                          <Badge variant="outline">{functionGroupProviders[group]}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {([
                            { value: 'aws' as AddressSearchProvider, label: 'AWS Places' },
                            { value: 'geoapify_tomtom' as AddressSearchProvider, label: 'Geoapify+TomTom' },
                            { value: 'local_catalog' as AddressSearchProvider, label: 'Lokális katalógus' },
                          ]).map((opt) => (
                            <label key={opt.value} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs">
                              <input
                                type="radio"
                                name={`provider-${group}`}
                                className="h-3 w-3"
                                checked={functionGroupProviders[group] === opt.value}
                                onChange={() => setFunctionGroupProviders((prev) => ({ ...prev, [group]: opt.value }))}
                              />
                              {opt.label}
                            </label>
                          ))}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => handleSaveProvider(group)} disabled={providerSaving}>
                          <Save className="mr-1 h-3 w-3" /> Mentés
                        </Button>
                      </div>
                    ))}

                    <Button onClick={handleSaveAllProviders} disabled={providerLoading || providerSaving}>
                      <Save className="mr-1 h-4 w-4" /> Összes mentése
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4 text-primary" /> Lokális címtábla</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Összes rekord</div>
                        <div className="text-2xl font-semibold">{catalogStatus?.totalRows ?? 0}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Állapot</div>
                        <div className="text-lg font-semibold">{catalogStatus?.state?.status || 'ismeretlen'}</div>
                      </div>
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>Utolsó start: {catalogStatus?.state?.last_run_started_at || '—'}</p>
                      <p>Utolsó befejezés: {catalogStatus?.state?.last_run_completed_at || '—'}</p>
                      {catalogStatus?.state?.last_error && <p className="text-destructive">Utolsó hiba: {catalogStatus.state.last_error}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={refreshCatalogStatus} disabled={catalogLoading}><RefreshCw className={`mr-1 h-4 w-4 ${catalogLoading ? 'animate-spin' : ''}`} />Állapot frissítése</Button>
                      <Button onClick={handleReloadLocalCatalog} disabled={catalogLoading}><Database className="mr-1 h-4 w-4" />Lokális adatok újratöltése</Button>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Provider szerinti rekordok</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(catalogStatus?.providerCounts || {}).map(([provider, count]) => (
                          <Badge key={provider} variant="secondary">{provider}: {count}</Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

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
                    Aktív provider ehhez a csoporthoz: <Badge variant="outline">{functionGroupProviders[testFunctionGroup]}</Badge>
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
                            <div>
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
                  {catalogStatus?.preview?.length ? (
                    <div className="space-y-2">
                      <p className="flex items-center gap-2 text-sm font-medium"><Layers className="h-4 w-4 text-primary" /> Lokális tábla legfrissebb rekordjai</p>
                      <div className="max-h-72 space-y-2 overflow-y-auto">
                        {catalogStatus.preview.map((row, index) => (
                          <div key={`${row.provider}-${row.name}-${index}`} className="rounded-lg border p-3 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="font-medium">{row.name}</p>
                                <p className="text-xs text-muted-foreground">{[row.city, row.category_group].filter(Boolean).join(' · ')}</p>
                              </div>
                              <Badge variant="outline">{row.provider}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
