import { useEffect, useMemo, useRef, useState } from 'react';
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
  setAddressSearchProvider,
  getAllFunctionGroupProviders,
  FUNCTION_GROUP_LABELS,
  type AddressSearchProvider,
  type AddressSearchFunctionGroup,
} from '@/lib/searchProviderConfig';
import { searchPlaces, type NormalizedPlace } from '@/lib/placeSearch';
import { cn } from '@/lib/utils';

interface LocalSyncLogEntry {
  id: number;
  created_at: string;
  level: string;
  event: string;
  message: string;
  details?: Record<string, unknown> | null;
}

interface LocalCatalogStatus {
  totalRows: number;
  state: {
    status?: string;
    rows_written?: number;
    provider_counts?: Record<string, number>;
    last_run_started_at?: string | null;
    last_run_completed_at?: string | null;
    last_error?: string | null;
    cursor?: number;
    task_count?: number;
    updated_at?: string | null;
  } | null;
  providerCounts: Record<string, number>;
  preview: Array<{ provider: string; name: string; city: string | null; category_group: string; synced_at: string }>;
  logs: LocalSyncLogEntry[];
}

interface LocalSyncSettings {
  enabled: boolean;
  interval_minutes: number;
  task_batch_size: number;
  provider_concurrency: number;
  radius_meters: number;
  geo_limit: number;
  tomtom_limit: number;
}

interface LocalCatalogRowBuffer {
  provider: 'geoapify' | 'tomtom';
  external_id: string;
  name: string;
  category_group: string;
  categories: string[];
  address: string | null;
  city: string | null;
  district: string | null;
  postal_code: string | null;
  country_code: string;
  latitude: number | null;
  longitude: number | null;
  open_now: boolean | null;
  rating: number | null;
  review_count: number | null;
  image_url: string | null;
  phone: string | null;
  website: string | null;
  opening_hours_text: string[];
  metadata: Record<string, unknown>;
  synced_at: string;
}

interface LocalSyncTaskDescriptor {
  taskIndex: number;
  totalTasks: number;
  center: {
    city: string;
    lat: number;
    lon: number;
  };
  group: {
    key: string;
    geo: string;
    tomtom: string;
  };
}

const DEFAULT_LOCAL_SYNC_SETTINGS: LocalSyncSettings = {
  enabled: false,
  interval_minutes: 15,
  task_batch_size: 2,
  provider_concurrency: 2,
  radius_meters: 16000,
  geo_limit: 60,
  tomtom_limit: 50,
};

const LOCAL_CATALOG_ACTIVE_WINDOW_MS = 45_000;

function isCatalogStateActivelyRunning(state: LocalCatalogStatus['state']) {
  if (!state) return false;

  const status = state.status || 'idle';
  const cursor = Number(state.cursor || 0);
  const taskCount = Number(state.task_count || 0);
  const isRunningStatus = status === 'running' || (status === 'partial' && taskCount > 0 && cursor < taskCount) || status === 'queued';

  if (!isRunningStatus) return false;

  const updatedAt = state.updated_at || state.last_run_completed_at || state.last_run_started_at;
  if (!updatedAt) return status === 'queued';

  const updatedAtMs = new Date(updatedAt).getTime();
  if (Number.isNaN(updatedAtMs)) return false;

  return Date.now() - updatedAtMs <= LOCAL_CATALOG_ACTIVE_WINDOW_MS;
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
  const [catalogPolling, setCatalogPolling] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState<LocalCatalogStatus | null>(null);
  const continuousBatchingRef = useRef(false);
  const [syncSettingsLoading, setSyncSettingsLoading] = useState(false);
  const [syncSettingsSaving, setSyncSettingsSaving] = useState(false);
  const [syncSettings, setSyncSettings] = useState<LocalSyncSettings>(DEFAULT_LOCAL_SYNC_SETTINGS);
  const [manualTask, setManualTask] = useState<LocalSyncTaskDescriptor | null>(null);
  const [geoapifyPhaseRows, setGeoapifyPhaseRows] = useState<LocalCatalogRowBuffer[]>([]);
  const [tomtomPhaseRows, setTomtomPhaseRows] = useState<LocalCatalogRowBuffer[]>([]);
  const [huFilteredPhaseRows, setHuFilteredPhaseRows] = useState<LocalCatalogRowBuffer[]>([]);
  const [dedupedPhaseRows, setDedupedPhaseRows] = useState<LocalCatalogRowBuffer[]>([]);
  const [manualPhaseFailures, setManualPhaseFailures] = useState<string[]>([]);
  const [manualPhaseLoading, setManualPhaseLoading] = useState<string | null>(null);
  const [phaseErrors, setPhaseErrors] = useState<Record<string, string>>({});

  const setPhaseError = (key: string, message: string) => {
    setPhaseErrors((prev) => ({ ...prev, [key]: message }));
  };
  const clearPhaseError = (key: string) => {
    setPhaseErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  async function loadSyncSettings() {
    setSyncSettingsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-local-places', {
        body: { action: 'get_config' },
      });

      if (error) throw error;

      setSyncSettings({
        ...DEFAULT_LOCAL_SYNC_SETTINGS,
        ...(((data as { config?: Partial<LocalSyncSettings> } | null)?.config) || {}),
      });
    } catch (err: any) {
      toast.error(err.message || 'Nem sikerült betölteni a lokális sync beállításokat');
    } finally {
      setSyncSettingsLoading(false);
    }
  }

  async function refreshCatalogStatus(options?: { silent?: boolean; allowPollingStart?: boolean }) {
    const silent = options?.silent === true;
    const allowPollingStart = options?.allowPollingStart === true;
    if (!silent) setCatalogLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('sync-local-places', { body: { action: 'status' } });
      if (error) throw error;
      const typed = data as LocalCatalogStatus;
      setCatalogStatus(typed);

      if (allowPollingStart && isCatalogStateActivelyRunning(typed?.state)) {
        setCatalogPolling(true);
      }

      return typed;
    } catch (err: any) {
      if (!silent) toast.error(err.message || 'Nem sikerült lekérni a lokális címtábla állapotát');
      return null;
    } finally {
      if (!silent) setCatalogLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      setProviderLoading(true);
      try {
        const providers = await getAllFunctionGroupProviders();
        setFunctionGroupProviders(providers);
      } finally {
        setProviderLoading(false);
      }
      await loadSyncSettings();
      await refreshCatalogStatus();
    })();
  }, []);

  useEffect(() => {
    if (!catalogPolling) return;

    const interval = setInterval(async () => {
      const latest = await refreshCatalogStatus({ silent: true });
      const state = latest?.state;
      if (!state) return;

      if (isCatalogStateActivelyRunning(state)) return;

      if (continuousBatchingRef.current) {
        const cursor = Number(state.cursor || 0);
        const taskCount = Number(state.task_count || 0);

        if (cursor < taskCount) {
          try {
            const { data, error } = await supabase.functions.invoke('sync-local-places', {
              body: { action: 'enqueue', reset: false },
            });
            if (error) throw error;
            if ((data as { error?: string } | null)?.error) throw new Error((data as { error?: string }).error);
            const hasMore = (data as { hasMore?: boolean } | null)?.hasMore ?? false;
            if (!hasMore) {
              continuousBatchingRef.current = false;
              setCatalogPolling(false);
              toast.success('Lokális szinkron teljesen kész!');
            }
          } catch {
            continuousBatchingRef.current = false;
            setCatalogPolling(false);
          }
        } else {
          continuousBatchingRef.current = false;
          setCatalogPolling(false);
          toast.success('Lokális szinkron teljesen kész!');
        }
      } else {
        setCatalogPolling(false);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [catalogPolling]);

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

  const handleSaveLocalSyncSettings = async () => {
    setSyncSettingsSaving(true);
    try {
      const { error: saveError } = await supabase.functions.invoke('sync-local-places', {
        body: {
          action: 'save_config',
          config: syncSettings,
        },
      });

      if (saveError) throw saveError;

      if (syncSettings.enabled) {
        const { error: scheduleError } = await supabase.functions.invoke('sync-local-places', {
          body: {
            action: 'schedule',
            interval_minutes: syncSettings.interval_minutes,
          },
        });
        if (scheduleError) throw scheduleError;
      } else {
        const { error: unscheduleError } = await supabase.functions.invoke('sync-local-places', {
          body: {
            action: 'unschedule',
          },
        });
        if (unscheduleError) throw unscheduleError;
      }

      toast.success('Lokális sync beállítások elmentve');
      await loadSyncSettings();
      await refreshCatalogStatus();
    } catch (err: any) {
      toast.error(err.message || 'Nem sikerült menteni a lokális sync beállításokat');
    } finally {
      setSyncSettingsSaving(false);
    }
  };

  const handleReloadLocalCatalog = async (reset = false) => {
    setCatalogLoading(true);
    continuousBatchingRef.current = false;
    try {
      const { data, error } = await supabase.functions.invoke('sync-local-places', {
        body: {
          action: 'enqueue',
          reset,
        },
      });

      if (error) throw error;
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error?: string }).error);

      const d = data as { requestId?: number | string; hasMore?: boolean } | null;

      if (reset && d?.hasMore) {
        continuousBatchingRef.current = true;
        toast.success('Teljes újratöltés elindult – folyamatban...');
      } else {
        toast.success(`Lokális batch elindítva (request_id: ${d?.requestId ?? 'n/a'})`);
      }

      setCatalogPolling(true);
      setTimeout(() => {
        void refreshCatalogStatus({ silent: true });
      }, 800);
    } catch (err: any) {
      continuousBatchingRef.current = false;
      setCatalogPolling(false);
      toast.error(err.message || 'Nem sikerült elindítani a lokális batch szinkront');
    } finally {
      setCatalogLoading(false);
    }
  };

  const clearManualPipelineBuffers = () => {
    setManualTask(null);
    setGeoapifyPhaseRows([]);
    setTomtomPhaseRows([]);
    setHuFilteredPhaseRows([]);
    setDedupedPhaseRows([]);
    setManualPhaseFailures([]);
  };

  const appendManualFailures = (failures?: string[]) => {
    if (!Array.isArray(failures) || failures.length === 0) return;
    setManualPhaseFailures((prev) => Array.from(new Set([...prev, ...failures.filter(Boolean)])));
  };

  const handleResetCatalogPhase = async () => {
    setManualPhaseLoading('reset_catalog');
    clearPhaseError('reset_catalog');
    continuousBatchingRef.current = false;
    setCatalogPolling(false);
    try {
      const { data, error } = await supabase.functions.invoke('sync-local-places', {
        body: { action: 'reset_catalog' },
      });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error?: string }).error);

      clearManualPipelineBuffers();
      toast.success('Lokális katalógus reset kész');
      await refreshCatalogStatus({ silent: true });
    } catch (err: any) {
      const msg = err?.message || 'Nem sikerült resetelni a lokális katalógust';
      setPhaseError('reset_catalog', msg);
      toast.error(msg);
    } finally {
      setManualPhaseLoading(null);
    }
  };

  const handleStartManualRunPhase = async () => {
    setManualPhaseLoading('start_manual_run');
    clearPhaseError('start_manual_run');
    try {
      const { data, error } = await supabase.functions.invoke('sync-local-places', {
        body: { action: 'start_manual_run', reset: false },
      });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error?: string }).error);

      toast.success('Manuális futás aktiválva (state = running)');
      await refreshCatalogStatus({ silent: true });
    } catch (err: any) {
      const msg = err?.message || 'Nem sikerült futóra állítani a manuális pipeline-t';
      setPhaseError('start_manual_run', msg);
      toast.error(msg);
    } finally {
      setManualPhaseLoading(null);
    }
  };

  const handlePrepareNextTaskPhase = async () => {
    setManualPhaseLoading('prepare_next_task');
    try {
      const { data, error } = await supabase.functions.invoke('sync-local-places', {
        body: { action: 'prepare_next_task' },
      });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error?: string }).error);

      const typed = data as { task?: LocalSyncTaskDescriptor | null };
      setManualTask(typed.task || null);
      setGeoapifyPhaseRows([]);
      setTomtomPhaseRows([]);
      setHuFilteredPhaseRows([]);
      setDedupedPhaseRows([]);
      setManualPhaseFailures([]);

      if (typed.task) {
        toast.success(`Task előkészítve: ${typed.task.center.city} / ${typed.task.group.key}`);
      } else {
        toast.success('Nincs több előkészíthető task');
      }

      await refreshCatalogStatus({ silent: true });
    } catch (err: any) {
      toast.error(err.message || 'Nem sikerült előkészíteni a következő taskot');
    } finally {
      setManualPhaseLoading(null);
    }
  };

  const handleFetchProviderPhase = async (provider: 'geoapify' | 'tomtom') => {
    if (!manualTask) {
      toast.error('Előbb készítsd elő a következő taskot');
      return;
    }

    const action = provider === 'geoapify' ? 'fetch_geoapify_rows' : 'fetch_tomtom_rows';
    setManualPhaseLoading(action);
    try {
      const { data, error } = await supabase.functions.invoke('sync-local-places', {
        body: {
          action,
          task_index: manualTask.taskIndex,
        },
      });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error?: string }).error);

      const typed = data as {
        task?: LocalSyncTaskDescriptor | null;
        rows?: LocalCatalogRowBuffer[];
        partialFailures?: string[];
      };

      if (typed.task) {
        setManualTask(typed.task);
      }

      if (provider === 'geoapify') {
        setGeoapifyPhaseRows(typed.rows || []);
      } else {
        setTomtomPhaseRows(typed.rows || []);
      }

      appendManualFailures(typed.partialFailures);
      toast.success(`${provider === 'geoapify' ? 'Geoapify' : 'TomTom'} fetch kész: ${(typed.rows || []).length} sor`);
      await refreshCatalogStatus({ silent: true });
    } catch (err: any) {
      toast.error(err.message || `${provider} fetch hiba`);
    } finally {
      setManualPhaseLoading(null);
    }
  };

  const handleHuFilterPhase = async () => {
    const rawRows = [...geoapifyPhaseRows, ...tomtomPhaseRows];
    if (rawRows.length === 0) {
      toast.error('Nincs szűrhető sor. Előbb tölts le legalább egy providerből adatot.');
      return;
    }

    setManualPhaseLoading('filter_hu_rows');
    try {
      const { data, error } = await supabase.functions.invoke('sync-local-places', {
        body: {
          action: 'filter_hu_rows',
          rows: rawRows,
        },
      });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error?: string }).error);

      const typed = data as { rows?: LocalCatalogRowBuffer[]; afterCount?: number };
      setHuFilteredPhaseRows(typed.rows || []);
      setDedupedPhaseRows([]);
      toast.success(`HU szűrés kész: ${typed.afterCount ?? (typed.rows || []).length} sor maradt`);
      await refreshCatalogStatus({ silent: true });
    } catch (err: any) {
      toast.error(err.message || 'Nem sikerült a HU szűrés');
    } finally {
      setManualPhaseLoading(null);
    }
  };

  const handleDedupePhase = async () => {
    if (huFilteredPhaseRows.length === 0) {
      toast.error('Előbb futtasd le a HU szűrést');
      return;
    }

    setManualPhaseLoading('dedupe_rows');
    try {
      const { data, error } = await supabase.functions.invoke('sync-local-places', {
        body: {
          action: 'dedupe_rows',
          rows: huFilteredPhaseRows,
        },
      });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error?: string }).error);

      const typed = data as { rows?: LocalCatalogRowBuffer[]; afterCount?: number };
      setDedupedPhaseRows(typed.rows || []);
      toast.success(`Deduplikálás kész: ${typed.afterCount ?? (typed.rows || []).length} sor maradt`);
      await refreshCatalogStatus({ silent: true });
    } catch (err: any) {
      toast.error(err.message || 'Nem sikerült a deduplikálás');
    } finally {
      setManualPhaseLoading(null);
    }
  };

  const handleWritePhase = async () => {
    if (!manualTask) {
      toast.error('Előbb készítsd elő a következő taskot');
      return;
    }

    const writableRows = dedupedPhaseRows.length > 0 ? dedupedPhaseRows : huFilteredPhaseRows;
    if (writableRows.length === 0) {
      toast.error('Nincs beírható sor. Előbb futtasd le a fetch + HU szűrés + dedupe lépéseket.');
      return;
    }

    setManualPhaseLoading('write_rows');
    try {
      const { data, error } = await supabase.functions.invoke('sync-local-places', {
        body: {
          action: 'write_rows',
          rows: writableRows,
          advance_cursor_by: 1,
          partial_failures: manualPhaseFailures,
        },
      });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error?: string }).error);

      const typed = data as { rowsWrittenThisRun?: number; hasMore?: boolean };
      const written = typed.rowsWrittenThisRun ?? writableRows.length;
      clearManualPipelineBuffers();
      toast.success(`Katalógus írás kész: ${written} sor, cursor +1`);
      await refreshCatalogStatus({ silent: true });

      if (typed.hasMore) {
        toast.message('Jöhet a következő task előkészítése');
      }
    } catch (err: any) {
      toast.error(err.message || 'Nem sikerült a katalógus írás');
    } finally {
      setManualPhaseLoading(null);
    }
  };

  const logs = catalogStatus?.logs || [];

  const formatLogTimestamp = (value?: string | null) => {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString('hu-HU');
  };

  const getLogBadgeClasses = (level?: string) => {
    switch ((level || 'info').toLowerCase()) {
      case 'error':
        return 'border-red-200 bg-red-50 text-red-700';
      case 'warn':
      case 'warning':
        return 'border-amber-200 bg-amber-50 text-amber-700';
      case 'success':
        return 'border-emerald-200 bg-emerald-50 text-emerald-700';
      default:
        return 'border-slate-200 bg-slate-50 text-slate-700';
    }
  };

  const phaseRawRows = useMemo(() => [...geoapifyPhaseRows, ...tomtomPhaseRows], [geoapifyPhaseRows, tomtomPhaseRows]);
  const phasePreviewRows = dedupedPhaseRows.length > 0
    ? dedupedPhaseRows
    : huFilteredPhaseRows.length > 0
      ? huFilteredPhaseRows
      : phaseRawRows;

  const syncProgressText = (() => {
    const cursor = Number(catalogStatus?.state?.cursor || 0);
    const taskCount = Number(catalogStatus?.state?.task_count || 0);
    if (!taskCount) return 'Nincs aktív batch-folyamat';
    return `${cursor}/${taskCount} feldolgozott feladat`;
  })();

  type PhaseStatus = 'idle' | 'running' | 'success' | 'failed';

  const phaseStatus = (key: string, ready: boolean, hasOutput: boolean): PhaseStatus => {
    if (manualPhaseLoading === key) return 'running';
    if (hasOutput) return 'success';
    if (!ready) return 'idle';
    return 'idle';
  };

  const manualPhaseActions: Array<{
    key: string;
    step: number;
    title: string;
    description: string;
    icon: typeof Database;
    accent: 'destructive' | 'primary' | 'neutral';
    disabled: boolean;
    isLoading: boolean;
    onClick: () => void;
    status: PhaseStatus;
    counter: string | null;
  }> = [
    {
      key: 'reset_catalog',
      step: 1,
      title: 'Katalógus reset',
      description: 'Törli a local places táblát és nullázza a futási állapotot.',
      icon: Database,
      accent: 'destructive',
      disabled: Boolean(manualPhaseLoading),
      isLoading: manualPhaseLoading === 'reset_catalog',
      onClick: handleResetCatalogPhase,
      status: manualPhaseLoading === 'reset_catalog' ? 'running' : 'idle',
      counter: catalogStatus?.totalRows != null ? `katalógus: ${catalogStatus.totalRows} sor` : null,
    },
    {
      key: 'start_manual_run',
      step: 2,
      title: 'State = running',
      description: 'Elindítja a manuális futást és running státuszra állítja a batch-et.',
      icon: RefreshCw,
      accent: 'neutral',
      disabled: Boolean(manualPhaseLoading),
      isLoading: manualPhaseLoading === 'start_manual_run',
      onClick: handleStartManualRunPhase,
      status: manualPhaseLoading === 'start_manual_run'
        ? 'running'
        : (catalogStatus?.state?.status === 'running' ? 'success' : 'idle'),
      counter: catalogStatus?.state?.status ? `state: ${catalogStatus.state.status}` : null,
    },
    {
      key: 'prepare_next_task',
      step: 3,
      title: 'Következő task',
      description: 'Előkészíti a következő város + kategória feladatot a provider fetchhez.',
      icon: Layers,
      accent: 'neutral',
      disabled: Boolean(manualPhaseLoading),
      isLoading: manualPhaseLoading === 'prepare_next_task',
      onClick: handlePrepareNextTaskPhase,
      status: phaseStatus('prepare_next_task', true, Boolean(manualTask)),
      counter: manualTask ? `${manualTask.center.city} · ${manualTask.group.key}` : null,
    },
    {
      key: 'fetch_geoapify_rows',
      step: 4,
      title: 'Geoapify fetch',
      description: 'Lekéri a nyers Geoapify venue listát az aktuális taskhoz.',
      icon: MapPinned,
      accent: 'neutral',
      disabled: Boolean(manualPhaseLoading) || !manualTask,
      isLoading: manualPhaseLoading === 'fetch_geoapify_rows',
      onClick: () => handleFetchProviderPhase('geoapify'),
      status: phaseStatus('fetch_geoapify_rows', Boolean(manualTask), geoapifyPhaseRows.length > 0),
      counter: `${geoapifyPhaseRows.length} sor`,
    },
    {
      key: 'fetch_tomtom_rows',
      step: 5,
      title: 'TomTom fetch',
      description: 'Lekéri a nyers TomTom venue listát ugyanahhoz a taskhoz.',
      icon: MapPin,
      accent: 'neutral',
      disabled: Boolean(manualPhaseLoading) || !manualTask,
      isLoading: manualPhaseLoading === 'fetch_tomtom_rows',
      onClick: () => handleFetchProviderPhase('tomtom'),
      status: phaseStatus('fetch_tomtom_rows', Boolean(manualTask), tomtomPhaseRows.length > 0),
      counter: `${tomtomPhaseRows.length} sor`,
    },
    {
      key: 'filter_hu_rows',
      step: 6,
      title: 'HU szűrés',
      description: 'Kiszűri a nem magyar rekordokat a két provider összevont bufferéből.',
      icon: Layers,
      accent: 'neutral',
      disabled: Boolean(manualPhaseLoading) || phaseRawRows.length === 0,
      isLoading: manualPhaseLoading === 'filter_hu_rows',
      onClick: handleHuFilterPhase,
      status: phaseStatus('filter_hu_rows', phaseRawRows.length > 0, huFilteredPhaseRows.length > 0),
      counter: `${huFilteredPhaseRows.length} / ${phaseRawRows.length} sor`,
    },
    {
      key: 'dedupe_rows',
      step: 7,
      title: 'Deduplikálás',
      description: 'Összevonja az egymásnak megfelelő venue rekordokat és eltávolítja a duplikációt.',
      icon: Layers,
      accent: 'neutral',
      disabled: Boolean(manualPhaseLoading) || huFilteredPhaseRows.length === 0,
      isLoading: manualPhaseLoading === 'dedupe_rows',
      onClick: handleDedupePhase,
      status: phaseStatus('dedupe_rows', huFilteredPhaseRows.length > 0, dedupedPhaseRows.length > 0),
      counter: `${dedupedPhaseRows.length} / ${huFilteredPhaseRows.length} sor`,
    },
    {
      key: 'write_rows',
      step: 8,
      title: 'DB írás + cursor',
      description: '100–250 körüli csomagban beírja a rekordokat és lépteti a cursort.',
      icon: Database,
      accent: 'primary',
      disabled: Boolean(manualPhaseLoading) || huFilteredPhaseRows.length === 0 || !manualTask,
      isLoading: manualPhaseLoading === 'write_rows',
      onClick: handleWritePhase,
      status: manualPhaseLoading === 'write_rows' ? 'running' : 'idle',
      counter: dedupedPhaseRows.length > 0
        ? `${dedupedPhaseRows.length} sor készen`
        : huFilteredPhaseRows.length > 0
          ? `${huFilteredPhaseRows.length} sor készen`
          : null,
    },
  ];

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
                            { value: 'mapy' as AddressSearchProvider, label: 'Mapy.cz' },
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
                    <div className="space-y-3 rounded-lg border p-3">
                      <p className="text-sm font-medium">Automatikus batch beállítások</p>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={syncSettings.enabled}
                          onChange={(e) => setSyncSettings((prev) => ({ ...prev, enabled: e.target.checked }))}
                        />
                        Automatikus batch futtatás bekapcsolva
                      </label>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="mb-1 text-xs text-muted-foreground">Percenkénti ütemezés</div>
                          <Input
                            type="number"
                            min={1}
                            max={60}
                            value={syncSettings.interval_minutes}
                            onChange={(e) => setSyncSettings((prev) => ({ ...prev, interval_minutes: Number(e.target.value) || 15 }))}
                          />
                        </div>

                        <div>
                          <div className="mb-1 text-xs text-muted-foreground">Task batch size</div>
                          <Input
                            type="number"
                            min={1}
                            max={20}
                            value={syncSettings.task_batch_size}
                            onChange={(e) => setSyncSettings((prev) => ({ ...prev, task_batch_size: Number(e.target.value) || 2 }))}
                          />
                        </div>

                        <div>
                          <div className="mb-1 text-xs text-muted-foreground">Provider concurrency</div>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={syncSettings.provider_concurrency}
                            onChange={(e) => setSyncSettings((prev) => ({ ...prev, provider_concurrency: Number(e.target.value) || 2 }))}
                          />
                        </div>

                        <div>
                          <div className="mb-1 text-xs text-muted-foreground">Sugár (méter)</div>
                          <Input
                            type="number"
                            min={1000}
                            max={50000}
                            value={syncSettings.radius_meters}
                            onChange={(e) => setSyncSettings((prev) => ({ ...prev, radius_meters: Number(e.target.value) || 16000 }))}
                          />
                        </div>

                        <div>
                          <div className="mb-1 text-xs text-muted-foreground">Geoapify limit</div>
                          <Input
                            type="number"
                            min={1}
                            max={200}
                            value={syncSettings.geo_limit}
                            onChange={(e) => setSyncSettings((prev) => ({ ...prev, geo_limit: Number(e.target.value) || 60 }))}
                          />
                        </div>

                        <div>
                          <div className="mb-1 text-xs text-muted-foreground">TomTom limit</div>
                          <Input
                            type="number"
                            min={1}
                            max={200}
                            value={syncSettings.tomtom_limit}
                            onChange={(e) => setSyncSettings((prev) => ({ ...prev, tomtom_limit: Number(e.target.value) || 50 }))}
                          />
                        </div>
                      </div>

                      <Button variant="outline" onClick={handleSaveLocalSyncSettings} disabled={syncSettingsLoading || syncSettingsSaving}>
                        <Save className="mr-1 h-4 w-4" />
                        Lokális sync beállítások mentése
                      </Button>
                    </div>

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

                    <div className="rounded-lg border p-3 text-xs text-muted-foreground space-y-1">
                      <p>Progressz: {syncProgressText}</p>
                      <p>Utolsó start: {catalogStatus?.state?.last_run_started_at || '—'}</p>
                      <p>Utolsó befejezés: {catalogStatus?.state?.last_run_completed_at || '—'}</p>
                      {catalogStatus?.state?.last_error && <p className="text-destructive">Utolsó hiba: {catalogStatus.state.last_error}</p>}
                    </div>

                    <div className="space-y-4 rounded-xl border border-border/70 bg-background/40 p-4 md:p-5">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">Fázis-alapú manuális pipeline</p>
                            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">Debugolható lépések</Badge>
                          </div>
                          <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
                            A local places töltés külön admin lépésekre bontva: reset → state running → task → provider fetch → HU szűrés → dedupe → DB írás + cursor update.
                          </p>
                        </div>
                        {manualTask ? (
                          <Badge variant="outline" className="self-start whitespace-nowrap px-3 py-1">Task #{manualTask.taskIndex + 1} / {manualTask.totalTasks}</Badge>
                        ) : (
                          <Badge variant="secondary" className="self-start px-3 py-1">Nincs előkészített task</Badge>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-border/60 bg-background/70 p-4">
                          <div className="text-xs text-muted-foreground">Geoapify raw sor</div>
                          <div className="mt-2 text-2xl font-semibold">{geoapifyPhaseRows.length}</div>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/70 p-4">
                          <div className="text-xs text-muted-foreground">TomTom raw sor</div>
                          <div className="mt-2 text-2xl font-semibold">{tomtomPhaseRows.length}</div>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/70 p-4">
                          <div className="text-xs text-muted-foreground">HU szűrt sor</div>
                          <div className="mt-2 text-2xl font-semibold">{huFilteredPhaseRows.length}</div>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/70 p-4">
                          <div className="text-xs text-muted-foreground">Deduplikált sor</div>
                          <div className="mt-2 text-2xl font-semibold">{dedupedPhaseRows.length}</div>
                        </div>
                      </div>

                      {manualTask ? (
                        <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 text-sm md:grid-cols-3">
                          <div>
                            <div className="text-xs text-muted-foreground">Aktív task város</div>
                            <div className="mt-1 font-medium text-foreground">{manualTask.center.city}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Kategória group</div>
                            <div className="mt-1 font-medium text-foreground">{manualTask.group.key}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Koordináta</div>
                            <div className="mt-1 font-medium text-foreground">{manualTask.center.lat}, {manualTask.center.lon}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                          Először készíts elő egy taskot, utána futtasd a provider fetch lépéseket és a tisztító fázisokat.
                        </div>
                      )}

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">Manuális fázisgombok</p>
                          {manualPhaseLoading ? (
                            <Badge variant="secondary">Fut: {manualPhaseLoading}</Badge>
                          ) : (
                            <Badge variant="outline">Készen áll</Badge>
                          )}
                        </div>

                        <ol className="space-y-2">
                          {manualPhaseActions.map((action) => {
                            const Icon = action.icon;
                            const accentRing = action.accent === 'destructive'
                              ? 'border-destructive/40 bg-destructive/5'
                              : action.accent === 'primary'
                                ? 'border-primary/40 bg-primary/5'
                                : 'border-border/70 bg-background/70';
                            const iconTone = action.accent === 'destructive'
                              ? 'border-destructive/40 bg-destructive/15 text-destructive'
                              : action.accent === 'primary'
                                ? 'border-primary/40 bg-primary/15 text-primary'
                                : 'border-border/60 bg-muted/40 text-foreground';

                            const statusBadge = (() => {
                              if (action.status === 'running') {
                                return (
                                  <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary whitespace-nowrap">
                                    Fut…
                                  </Badge>
                                );
                              }
                              if (action.status === 'success') {
                                return (
                                  <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                                    Kész
                                  </Badge>
                                );
                              }
                              if (action.status === 'failed') {
                                return (
                                  <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive whitespace-nowrap">
                                    Hiba
                                  </Badge>
                                );
                              }
                              if (action.disabled) {
                                return (
                                  <Badge variant="outline" className="border-border/60 bg-muted/40 text-muted-foreground whitespace-nowrap">
                                    Vár
                                  </Badge>
                                );
                              }
                              return (
                                <Badge variant="outline" className="border-border/60 bg-background text-foreground whitespace-nowrap">
                                  Készen áll
                                </Badge>
                              );
                            })();

                            return (
                              <li
                                key={action.key}
                                className={cn(
                                  'flex flex-col gap-3 rounded-xl border p-3 transition-colors sm:flex-row sm:items-center',
                                  accentRing,
                                )}
                              >
                                <div className="flex min-w-0 flex-1 items-start gap-3">
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background text-xs font-semibold text-muted-foreground">
                                    {action.step}
                                  </div>
                                  <div className={cn(
                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
                                    iconTone,
                                  )}>
                                    <Icon className={cn('h-4 w-4', action.isLoading && 'animate-spin')} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold leading-5 text-foreground">{action.title}</p>
                                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{action.description}</p>
                                    {action.counter ? (
                                      <p className="mt-1 text-[11px] font-medium text-muted-foreground">{action.counter}</p>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 sm:shrink-0">
                                  {statusBadge}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={action.accent === 'destructive' ? 'destructive' : action.accent === 'primary' ? 'default' : 'outline'}
                                    onClick={action.onClick}
                                    disabled={action.disabled}
                                    className="whitespace-nowrap"
                                  >
                                    {action.isLoading ? (
                                      <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
                                    ) : null}
                                    Futtatás
                                  </Button>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      </div>

                      {manualPhaseFailures.length > 0 ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                          <p className="font-medium">Részleges provider hibák</p>
                          <ul className="mt-2 list-disc space-y-1 pl-4">
                            {manualPhaseFailures.map((failure, index) => (
                              <li key={`${failure}-${index}`}>{failure}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">Fázis puffer előnézet</p>
                          <Badge variant="secondary">{phasePreviewRows.length} sor</Badge>
                        </div>

                        {phasePreviewRows.length === 0 ? (
                          <p className="rounded-xl border border-dashed border-border/60 bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
                            Még nincs pufferelt sor. Készíts elő egy taskot, futtasd a provider fetch lépéseket, majd a HU szűrést és a deduplikálást.
                          </p>
                        ) : (
                          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border/60 bg-muted/20 p-2">
                            {phasePreviewRows.slice(0, 8).map((row, index) => (
                              <div key={`${row.provider}-${row.external_id}-${index}`} className="rounded-lg border border-border/60 bg-background p-3 text-sm">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate font-medium">{row.name}</p>
                                    <p className="text-xs text-muted-foreground">{[row.city, row.category_group, row.country_code].filter(Boolean).join(' · ')}</p>
                                  </div>
                                  <Badge variant="outline">{row.provider}</Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 rounded-xl border border-border/60 bg-background/30 p-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Kompatibilitási batch vezérlők</p>
                        <p className="text-xs text-muted-foreground">
                          A korábbi egygombos flow megmaradt regresszióvédelem miatt. Debughoz a fenti fázisgombokat használd, gyors futtatáshoz ezt a blokkot.
                        </p>
                      </div>

                      <div className="grid gap-2 md:grid-cols-3">
                        <Button variant="outline" onClick={() => refreshCatalogStatus()} disabled={catalogLoading} className="w-full justify-start">
                          <RefreshCw className={`mr-1 h-4 w-4 ${catalogLoading ? 'animate-spin' : ''}`} />
                          Állapot frissítése
                        </Button>

                        <Button onClick={() => handleReloadLocalCatalog(false)} disabled={catalogLoading} className="w-full justify-start">
                          <Database className="mr-1 h-4 w-4" />
                          Következő batch indítása
                        </Button>

                        <Button variant="destructive" onClick={() => handleReloadLocalCatalog(true)} disabled={catalogLoading} className="w-full justify-start">
                          <Database className="mr-1 h-4 w-4" />
                          Teljes újratöltés
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">Provider szerinti rekordok</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(catalogStatus?.providerCounts || {}).map(([provider, count]) => (
                          <Badge key={provider} variant="secondary">{provider}: {count}</Badge>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Szinkron napló</p>
                        <div className="flex items-center gap-2">
                          {catalogPolling ? <Badge variant="outline">live polling</Badge> : null}
                          <Badge variant="secondary">{logs.length} sor</Badge>
                        </div>
                      </div>

                      <div className="max-h-80 overflow-y-auto rounded-lg border bg-muted/20 p-2">
                        {logs.length === 0 ? (
                          <p className="px-2 py-4 text-sm text-muted-foreground">Még nincs naplóbejegyzés. Indíts batch-et vagy frissíts állapotot.</p>
                        ) : (
                          <div className="space-y-2">
                            {logs.map((row) => (
                              <div key={row.id} className="rounded-md border bg-background p-3">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className={getLogBadgeClasses(row.level)}>
                                      {row.level || 'info'}
                                    </Badge>
                                    <span className="text-sm font-medium">{row.event}</span>
                                  </div>
                                  <span className="text-xs text-muted-foreground">{formatLogTimestamp(row.created_at)}</span>
                                </div>

                                <p className="text-sm">{row.message}</p>

                                {row.details && Object.keys(row.details).length > 0 ? (
                                  <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-[11px] text-muted-foreground">
{JSON.stringify(row.details, null, 2)}
                                  </pre>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
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
