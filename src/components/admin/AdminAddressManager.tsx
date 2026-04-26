import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Wand2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { invokeFunctionWithDebug } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ProviderKey = 'geoapify' | 'tomtom';

type AddressManagerLimits = {
  geoapify_limit: number;
  tomtom_limit: number;
  radius_meters: number;
  worker_chunk_size: number;
  max_parallel_workers: number;
  worker_time_budget_ms: number;
  worker_max_pages_per_tile: number;
};

type DiscoveryCell = {
  id: string;
  provider: ProviderKey;
  country_code: string;
  category_key: string;
  category_label: string;
  selected: boolean;
  status: string;
  cursor: Record<string, unknown>;
  stats: Record<string, unknown>;
  last_error: string | null;
  updated_at: string;
};

type Summary = {
  totalRawVenues: number;
  totalSelectedCells: number;
  totalCompletedCells: number;
  totalRunningCells?: number;
  totalErroredCells?: number;
};

type VenueRow = {
  id: string;
  provider: ProviderKey;
  provider_venue_id: string;
  country_code: string | null;
  category_key: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  discovered_at: string;
  updated_at: string;
};

type DiscoveryResponse = {
  ok: boolean;
  limits: AddressManagerLimits;
  matrix: DiscoveryCell[];
  summary: Summary;
  error?: string;
};

type VenueListResponse = {
  ok: boolean;
  rows: VenueRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: Summary;
  error?: string;
};

type SelfTestResponse = {
  ok: boolean;
  providerResults: Array<{
    provider: ProviderKey;
    ok: boolean;
    status: number | null;
    sampleCount: number;
    error?: string;
    endpoint: string;
  }>;
  env: { hasGeoapifyKey: boolean; hasTomTomKey: boolean; hasServiceRole: boolean };
  pageCaps: { geoapify: number; tomtom: number };
  error?: string;
};

const DEFAULT_LIMITS: AddressManagerLimits = {
  geoapify_limit: 1000,
  tomtom_limit: 1000,
  radius_meters: 30000,
  worker_chunk_size: 5,
  max_parallel_workers: 2,
  worker_time_budget_ms: 35_000,
  worker_max_pages_per_tile: 20,
};

const DISCOVERY_QUERY_KEY = ['address-manager', 'discovery'];

function parseCsvParam(searchParams: URLSearchParams, key: string) {
  return (searchParams.get(key) || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function setCsvParam(searchParams: URLSearchParams, key: string, values: string[]) {
  if (values.length === 0) searchParams.delete(key);
  else searchParams.set(key, values.join(','));
}

function parsePositiveInt(input: string, fallback: number) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

async function fetchDiscoveryState(): Promise<DiscoveryResponse> {
  const { data, error } = await invokeFunctionWithDebug<DiscoveryResponse>('address-manager-discovery', {
    body: { action: 'bootstrap' },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'Address Manager state load failed');
  return data;
}

async function fetchVenues(params: {
  provider: ProviderKey | 'all';
  countries: string[];
  categories: string[];
  page: number;
  pageSize: number;
}): Promise<VenueListResponse> {
  const { data, error } = await invokeFunctionWithDebug<VenueListResponse>('address-manager-discovery', {
    body: {
      action: 'list_venues',
      provider: params.provider,
      countries: params.countries,
      categories: params.categories,
      page: params.page,
      pageSize: params.pageSize,
    },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'Venue list load failed');
  return data;
}

export function AdminAddressManager() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftLimits, setDraftLimits] = useState<Record<keyof AddressManagerLimits, string>>({
    geoapify_limit: String(DEFAULT_LIMITS.geoapify_limit),
    tomtom_limit: String(DEFAULT_LIMITS.tomtom_limit),
    radius_meters: String(DEFAULT_LIMITS.radius_meters),
    worker_chunk_size: String(DEFAULT_LIMITS.worker_chunk_size),
    max_parallel_workers: String(DEFAULT_LIMITS.max_parallel_workers),
    worker_time_budget_ms: String(DEFAULT_LIMITS.worker_time_budget_ms),
    worker_max_pages_per_tile: String(DEFAULT_LIMITS.worker_max_pages_per_tile),
  });
  const [selfTest, setSelfTest] = useState<SelfTestResponse | null>(null);

  const provider = (searchParams.get('provider') || 'geoapify') as ProviderKey;
  const countries = parseCsvParam(searchParams, 'countries');
  const categories = parseCsvParam(searchParams, 'categories');
  const venuePage = Math.max(1, Number(searchParams.get('venuePage') || 1));

  const discoveryQuery = useQuery({
    queryKey: DISCOVERY_QUERY_KEY,
    queryFn: fetchDiscoveryState,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!discoveryQuery.data?.limits) return;
    const limits = discoveryQuery.data.limits;
    setDraftLimits({
      geoapify_limit: String(limits.geoapify_limit),
      tomtom_limit: String(limits.tomtom_limit),
      radius_meters: String(limits.radius_meters),
      worker_chunk_size: String(limits.worker_chunk_size),
      max_parallel_workers: String(limits.max_parallel_workers),
      worker_time_budget_ms: String(limits.worker_time_budget_ms ?? DEFAULT_LIMITS.worker_time_budget_ms),
      worker_max_pages_per_tile: String(limits.worker_max_pages_per_tile ?? DEFAULT_LIMITS.worker_max_pages_per_tile),
    });
  }, [discoveryQuery.data?.limits]);

  const venueQuery = useQuery({
    queryKey: ['address-manager', 'venues', provider, countries.join(','), categories.join(','), venuePage],
    queryFn: () => fetchVenues({ provider, countries, categories, page: venuePage, pageSize: 25 }),
    refetchOnWindowFocus: false,
  });

  const matrix = useMemo(
    () => (discoveryQuery.data?.matrix || []).filter((cell) => cell.provider === provider),
    [discoveryQuery.data?.matrix, provider],
  );

  const countryOptions = useMemo(
    () => Array.from(new Set(matrix.map((cell) => cell.country_code))).sort(),
    [matrix],
  );

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    matrix.forEach((cell) => map.set(cell.category_key, cell.category_label));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'hu'));
  }, [matrix]);

  const filteredMatrix = useMemo(
    () => matrix.filter((cell) => {
      const countryOk = countries.length === 0 || countries.includes(cell.country_code);
      const categoryOk = categories.length === 0 || categories.includes(cell.category_key);
      return countryOk && categoryOk;
    }),
    [matrix, countries, categories],
  );

  const selectedCount = filteredMatrix.filter((cell) => cell.selected).length;
  const expectedRows = filteredMatrix.reduce((acc, cell) => {
    if (!cell.selected) return acc;
    const cellLimit = provider === 'geoapify'
      ? parsePositiveInt(draftLimits.geoapify_limit, discoveryQuery.data?.limits.geoapify_limit || DEFAULT_LIMITS.geoapify_limit)
      : parsePositiveInt(draftLimits.tomtom_limit, discoveryQuery.data?.limits.tomtom_limit || DEFAULT_LIMITS.tomtom_limit);
    return acc + cellLimit;
  }, 0);

  const updateUrl = (mutator: (next: URLSearchParams) => void) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      mutator(next);
      return next;
    }, { replace: true });
  };

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: DISCOVERY_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ['address-manager', 'venues'] }),
    ]);
  };

  const saveLimitsMutation = useMutation({
    mutationFn: async () => {
      const payload: AddressManagerLimits = {
        geoapify_limit: parsePositiveInt(draftLimits.geoapify_limit, discoveryQuery.data?.limits.geoapify_limit || DEFAULT_LIMITS.geoapify_limit),
        tomtom_limit: parsePositiveInt(draftLimits.tomtom_limit, discoveryQuery.data?.limits.tomtom_limit || DEFAULT_LIMITS.tomtom_limit),
        radius_meters: parsePositiveInt(draftLimits.radius_meters, discoveryQuery.data?.limits.radius_meters || DEFAULT_LIMITS.radius_meters),
        worker_chunk_size: parsePositiveInt(draftLimits.worker_chunk_size, discoveryQuery.data?.limits.worker_chunk_size || DEFAULT_LIMITS.worker_chunk_size),
        max_parallel_workers: parsePositiveInt(draftLimits.max_parallel_workers, discoveryQuery.data?.limits.max_parallel_workers || DEFAULT_LIMITS.max_parallel_workers),
        worker_time_budget_ms: parsePositiveInt(draftLimits.worker_time_budget_ms, discoveryQuery.data?.limits.worker_time_budget_ms || DEFAULT_LIMITS.worker_time_budget_ms),
        worker_max_pages_per_tile: parsePositiveInt(draftLimits.worker_max_pages_per_tile, discoveryQuery.data?.limits.worker_max_pages_per_tile || DEFAULT_LIMITS.worker_max_pages_per_tile),
      };

      const { data, error } = await invokeFunctionWithDebug<DiscoveryResponse>('address-manager-discovery', {
        body: { action: 'save_limits', limits: payload },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Limit save failed');
      return data;
    },
    onSuccess: async () => {
      toast.success('Address Manager limitek mentve');
      await refreshAll();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Mentés sikertelen');
    },
  });

  const selectionMutation = useMutation({
    mutationFn: async (updates: Array<{ provider: ProviderKey; country_code: string; category_key: string; selected: boolean }>) => {
      const { data, error } = await invokeFunctionWithDebug<DiscoveryResponse>('address-manager-discovery', {
        body: { action: 'save_selection', updates },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Selection save failed');
      return data;
    },
    onSuccess: async () => {
      await refreshAll();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Kijelölés mentése sikertelen');
    },
  });

  const runChunkMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeFunctionWithDebug<{
        ok: boolean;
        totalWritten: number;
        processedSteps: number;
        steps?: unknown[];
        error?: string;
      }>('address-manager-discovery', {
        body: {
          action: 'run_chunk',
          iterations: parsePositiveInt(draftLimits.worker_chunk_size, discoveryQuery.data?.limits.worker_chunk_size || DEFAULT_LIMITS.worker_chunk_size),
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Chunk run failed');
      return data;
    },
    onSuccess: async (data) => {
      toast.success(`Chunk lefutott · lépések: ${data.processedSteps} · írt sorok: ${data.totalWritten}`);
      await refreshAll();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Chunk futtatás sikertelen');
    },
  });

  const selfTestMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeFunctionWithDebug<SelfTestResponse>('address-manager-discovery', {
        body: { action: 'self_test' },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Self-test failed');
      return data;
    },
    onSuccess: (data) => {
      setSelfTest(data);
      const list = Array.isArray(data?.providerResults) ? data.providerResults : [];
      if (list.length === 0) {
        toast.message('A backend nem küldött providerResults mezőt — valószínűleg a régi address-manager-discovery fut. Telepítsd újra a Supabase functionöket.');
        return;
      }
      const ok = list.every((p) => p.ok);
      if (ok) toast.success('Mindkét provider elérhető');
      else toast.error('Legalább egy provider hibát adott — lásd a tesztpanelt');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Provider self-test sikertelen');
    },
  });

  const resetCellsMutation = useMutation({
    mutationFn: async (params: { onlyCompleted: boolean }) => {
      const { data, error } = await invokeFunctionWithDebug<DiscoveryResponse>('address-manager-discovery', {
        body: {
          action: 'reset_cells',
          provider,
          countries,
          categories,
          onlyCompleted: params.onlyCompleted,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Reset failed');
      return data;
    },
    onSuccess: async () => {
      toast.success('Cellák visszaállítva (pending)');
      await refreshAll();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Visszaállítás sikertelen');
    },
  });

  const setCountryFilters = (values: string[]) => {
    updateUrl((next) => {
      setCsvParam(next, 'countries', values);
      next.set('venuePage', '1');
    });
  };

  const setCategoryFilters = (values: string[]) => {
    updateUrl((next) => {
      setCsvParam(next, 'categories', values);
      next.set('venuePage', '1');
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Címkezelő — provider-alapú nyers venue katalógus</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {(['geoapify', 'tomtom'] as const).map((value) => (
              <Button
                key={value}
                variant={provider === value ? 'default' : 'outline'}
                onClick={() => updateUrl((next) => {
                  next.set('provider', value);
                  next.set('venuePage', '1');
                })}
              >
                {value}
              </Button>
            ))}
            <Button variant="outline" onClick={() => refreshAll()} disabled={discoveryQuery.isFetching || venueQuery.isFetching}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Frissítés
            </Button>
            <Button variant="outline" onClick={async () => {
              try {
                const { data } = await invokeFunctionWithDebug<any>('address-manager-discovery', { body: { action: 'health' } });
                toast.message(`Health: SUPABASE_URL=${data?.env?.hasSupabaseUrl ? 'OK' : 'NO'} · service_role=${data?.env?.hasServiceRole ? 'OK' : 'NO'} · geoapify=${data?.env?.hasGeoapifyKey ? 'OK' : 'NO'} · tomtom=${data?.env?.hasTomTomKey ? 'OK' : 'NO'}`);
              } catch (e) {
                toast.error('Health endpoint elérhetetlen — a function még mindig 503-mal jön. Lásd Supabase Dashboard › Functions › Logs.');
              }
            }}>
              Health (zero-DB)
            </Button>
            <Button variant="outline" onClick={() => selfTestMutation.mutate()} disabled={selfTestMutation.isPending}>
              {selfTestMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              Provider self-test
            </Button>
            <Button variant="outline" onClick={() => resetCellsMutation.mutate({ onlyCompleted: true })} disabled={resetCellsMutation.isPending}>
              {resetCellsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Befejezett cellák újraindítása
            </Button>
          </div>

          {selfTest ? (
            <div className="rounded border p-3 text-sm space-y-2">
              <div className="font-medium">Provider self-test eredmény</div>
              {selfTest.env ? (
                <div className="text-xs text-muted-foreground">
                  Service role: {selfTest.env.hasServiceRole ? 'OK' : 'HIÁNYZIK'} · Geoapify key: {selfTest.env.hasGeoapifyKey ? 'OK' : 'HIÁNYZIK'} · TomTom key: {selfTest.env.hasTomTomKey ? 'OK' : 'HIÁNYZIK'}
                </div>
              ) : (
                <div className="text-xs text-amber-700">
                  A backend nem küldött <code>env</code> mezőt — valószínűleg a régi address-manager-discovery edge function fut. Telepítsd újra (<code>supabase functions deploy address-manager-discovery</code>).
                </div>
              )}
              {selfTest.pageCaps ? (
                <div className="text-xs text-muted-foreground">
                  Provider page caps — Geoapify: {selfTest.pageCaps.geoapify} / TomTom: {selfTest.pageCaps.tomtom}
                </div>
              ) : null}
              {(selfTest.providerResults || []).map((r) => (
                <div key={r.provider} className="flex items-start gap-2">
                  {r.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" /> : <XCircle className="h-4 w-4 mt-0.5 text-destructive" />}
                  <div>
                    <div><strong>{r.provider}</strong> — HTTP {r.status ?? 'n/a'} — {r.sampleCount} mintarekord</div>
                    {r.error ? <div className="text-xs text-destructive break-all">{r.error}</div> : null}
                  </div>
                </div>
              ))}
              {!selfTest.providerResults || selfTest.providerResults.length === 0 ? (
                <div className="text-xs text-amber-700">
                  A backend nem küldött <code>providerResults</code> mezőt — telepítsd újra a Supabase functionöket.
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label>Geoapify limit / tile (max 500/oldal)</Label>
              <Input type="number" value={draftLimits.geoapify_limit} onChange={(e) => setDraftLimits((prev) => ({ ...prev, geoapify_limit: e.target.value }))} />
            </div>
            <div>
              <Label>TomTom limit / tile (max 100/oldal)</Label>
              <Input type="number" value={draftLimits.tomtom_limit} onChange={(e) => setDraftLimits((prev) => ({ ...prev, tomtom_limit: e.target.value }))} />
            </div>
            <div>
              <Label>Radius (m)</Label>
              <Input type="number" value={draftLimits.radius_meters} onChange={(e) => setDraftLimits((prev) => ({ ...prev, radius_meters: e.target.value }))} />
            </div>
            <div>
              <Label>Worker chunk (cellák / kattintás)</Label>
              <Input type="number" value={draftLimits.worker_chunk_size} onChange={(e) => setDraftLimits((prev) => ({ ...prev, worker_chunk_size: e.target.value }))} />
            </div>
            <div>
              <Label>Max párhuzamos worker</Label>
              <Input type="number" value={draftLimits.max_parallel_workers} onChange={(e) => setDraftLimits((prev) => ({ ...prev, max_parallel_workers: e.target.value }))} />
            </div>
            <div>
              <Label>Worker time budget (ms)</Label>
              <Input type="number" value={draftLimits.worker_time_budget_ms} onChange={(e) => setDraftLimits((prev) => ({ ...prev, worker_time_budget_ms: e.target.value }))} />
            </div>
            <div>
              <Label>Max oldal / tile</Label>
              <Input type="number" value={draftLimits.worker_max_pages_per_tile} onChange={(e) => setDraftLimits((prev) => ({ ...prev, worker_max_pages_per_tile: e.target.value }))} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button className="gradient-primary text-primary-foreground border-0" onClick={() => saveLimitsMutation.mutate()} disabled={saveLimitsMutation.isPending}>
              {saveLimitsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Beállítások mentése
            </Button>
            <Button onClick={() => runChunkMutation.mutate()} disabled={runChunkMutation.isPending || discoveryQuery.isLoading}>
              {runChunkMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Kijelölt chunk futtatása
            </Button>
            <div className="rounded border px-3 py-2 text-sm">
              Kiválasztott cellák: <strong>{selectedCount}</strong> · várható rekord/cella: <strong>{expectedRows}</strong>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded border p-3 text-sm">Összes raw venue: <strong>{discoveryQuery.data?.summary.totalRawVenues ?? 0}</strong></div>
            <div className="rounded border p-3 text-sm">Kijelölt cellák: <strong>{discoveryQuery.data?.summary.totalSelectedCells ?? 0}</strong></div>
            <div className="rounded border p-3 text-sm">Befejezett: <strong>{discoveryQuery.data?.summary.totalCompletedCells ?? 0}</strong></div>
            <div className="rounded border p-3 text-sm">Fut: <strong>{discoveryQuery.data?.summary.totalRunningCells ?? 0}</strong></div>
            <div className="rounded border p-3 text-sm">Hibás: <strong className="text-destructive">{discoveryQuery.data?.summary.totalErroredCells ?? 0}</strong></div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">Ország szűrő</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setCountryFilters([])}>Minden ország</Button>
                  <Button size="sm" variant="outline" onClick={() => setCountryFilters(countryOptions)}>Mind kijelöl</Button>
                </div>
                <div className="mt-2 max-h-52 overflow-auto rounded border p-2 space-y-2">
                  {countryOptions.map((country) => {
                    const checked = countries.includes(country);
                    return (
                      <label key={country} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) => {
                            const set = new Set(countries);
                            if (next) set.add(country);
                            else set.delete(country);
                            setCountryFilters(Array.from(set));
                          }}
                        />
                        {country}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Kategória szűrő</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setCategoryFilters([])}>Minden kategória</Button>
                  <Button size="sm" variant="outline" onClick={() => setCategoryFilters(categoryOptions.map(([k]) => k))}>Mind kijelöl</Button>
                </div>
                <div className="mt-2 max-h-52 overflow-auto rounded border p-2 space-y-2">
                  {categoryOptions.map(([key, label]) => {
                    const checked = categories.includes(key);
                    return (
                      <label key={key} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) => {
                            const set = new Set(categories);
                            if (next) set.add(key);
                            else set.delete(key);
                            setCategoryFilters(Array.from(set));
                          }}
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="overflow-auto rounded border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="p-2 text-left">Ország</th>
                    <th className="p-2 text-left">Kategória</th>
                    <th className="p-2 text-left">Kijelölt</th>
                    <th className="p-2 text-left">Státusz</th>
                    <th className="p-2 text-left">Statisztika</th>
                    <th className="p-2 text-left">Akció</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMatrix.map((cell) => (
                    <tr key={`${cell.provider}:${cell.country_code}:${cell.category_key}`} className="border-t align-top">
                      <td className="p-2">{cell.country_code}</td>
                      <td className="p-2">{cell.category_label}</td>
                      <td className="p-2">
                        <Checkbox
                          checked={cell.selected}
                          onCheckedChange={(next) => selectionMutation.mutate([
                            {
                              provider: cell.provider,
                              country_code: cell.country_code,
                              category_key: cell.category_key,
                              selected: Boolean(next),
                            },
                          ])}
                        />
                      </td>
                      <td className="p-2">
                        <div className={cell.status === 'error' ? 'text-destructive font-medium' : ''}>{cell.status}</div>
                        {cell.last_error ? (
                          <div className="mt-1 flex items-start gap-1 text-xs text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span className="break-all">{cell.last_error}</span>
                          </div>
                        ) : null}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        <div>fetched_rows: {Number((cell.stats || {}).fetched_rows || 0)}</div>
                        <div>tile: {Number((cell.stats || {}).tile_index || 0)} / {Number((cell.stats || {}).total_tiles || 0)}</div>
                        {(cell.stats || {}).last_chunk_written !== undefined ? (
                          <div>last chunk: +{Number((cell.stats || {}).last_chunk_written || 0)} ({Number((cell.stats || {}).last_chunk_tiles || 0)} tile)</div>
                        ) : null}
                      </td>
                      <td className="p-2 space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => selectionMutation.mutate(
                            filteredMatrix
                              .filter((item) => item.country_code === cell.country_code)
                              .map((item) => ({
                                provider: item.provider,
                                country_code: item.country_code,
                                category_key: item.category_key,
                                selected: true,
                              })),
                          )}
                        >
                          Ország mind
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => selectionMutation.mutate(
                            filteredMatrix
                              .filter((item) => item.category_key === cell.category_key)
                              .map((item) => ({
                                provider: item.provider,
                                country_code: item.country_code,
                                category_key: item.category_key,
                                selected: true,
                              })),
                          )}
                        >
                          Kategória mind
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filteredMatrix.length === 0 ? (
                    <tr>
                      <td className="p-4 text-center text-muted-foreground" colSpan={6}>Nincs a szűrésnek megfelelő mátrixcella.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>raw_venues tartalom</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Az új provider-alapú backend tábla tartalma: <strong>public.raw_venues</strong>.
          </div>

          <div className="overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40">
                  <th className="p-2 text-left">Provider</th>
                  <th className="p-2 text-left">Ország</th>
                  <th className="p-2 text-left">Kategória</th>
                  <th className="p-2 text-left">Név</th>
                  <th className="p-2 text-left">Cím</th>
                  <th className="p-2 text-left">Koordináta</th>
                  <th className="p-2 text-left">Web</th>
                  <th className="p-2 text-left">Felfedezve</th>
                </tr>
              </thead>
              <tbody>
                {(venueQuery.data?.rows || []).map((row) => (
                  <tr key={row.id} className="border-t align-top">
                    <td className="p-2">{row.provider}</td>
                    <td className="p-2">{row.country_code || '-'}</td>
                    <td className="p-2">{row.category_key || '-'}</td>
                    <td className="p-2">{row.name || '-'}</td>
                    <td className="p-2">{row.address || [row.city, row.district, row.postal_code].filter(Boolean).join(', ') || '-'}</td>
                    <td className="p-2">{row.latitude && row.longitude ? `${row.latitude}, ${row.longitude}` : '-'}</td>
                    <td className="p-2">{row.website ? <a className="underline" href={row.website} target="_blank" rel="noreferrer">megnyitás</a> : '-'}</td>
                    <td className="p-2">{row.discovered_at ? new Date(row.discovered_at).toLocaleString('hu-HU') : '-'}</td>
                  </tr>
                ))}
                {venueQuery.isLoading ? (
                  <tr>
                    <td className="p-4 text-center" colSpan={8}><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td>
                  </tr>
                ) : null}
                {!venueQuery.isLoading && (venueQuery.data?.rows || []).length === 0 ? (
                  <tr>
                    <td className="p-4 text-center text-muted-foreground" colSpan={8}>Nincs még raw_venues rekord a jelenlegi szűrőkhöz.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">Összes sor a szűrőhöz: <strong>{venueQuery.data?.total ?? 0}</strong></div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={venuePage <= 1} onClick={() => updateUrl((next) => next.set('venuePage', String(Math.max(1, venuePage - 1))))}>Előző</Button>
              <Button variant="outline" size="sm" onClick={() => updateUrl((next) => next.set('venuePage', String(venuePage + 1)))}>Következő</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
