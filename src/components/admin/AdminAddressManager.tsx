import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
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

const DEFAULT_LIMITS: AddressManagerLimits = {
  geoapify_limit: 1000,
  tomtom_limit: 1000,
  radius_meters: 30000,
  worker_chunk_size: 5,
  max_parallel_workers: 2,
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
  });

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
          <CardTitle>Címkezelő — új provider-alapú nyers venue katalógus</CardTitle>
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
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <Label>Geoapify limit</Label>
              <Input type="number" value={draftLimits.geoapify_limit} onChange={(e) => setDraftLimits((prev) => ({ ...prev, geoapify_limit: e.target.value }))} />
            </div>
            <div>
              <Label>TomTom limit</Label>
              <Input type="number" value={draftLimits.tomtom_limit} onChange={(e) => setDraftLimits((prev) => ({ ...prev, tomtom_limit: e.target.value }))} />
            </div>
            <div>
              <Label>Radius (m)</Label>
              <Input type="number" value={draftLimits.radius_meters} onChange={(e) => setDraftLimits((prev) => ({ ...prev, radius_meters: e.target.value }))} />
            </div>
            <div>
              <Label>Worker chunk size</Label>
              <Input type="number" value={draftLimits.worker_chunk_size} onChange={(e) => setDraftLimits((prev) => ({ ...prev, worker_chunk_size: e.target.value }))} />
            </div>
            <div>
              <Label>Max parallel workers</Label>
              <Input type="number" value={draftLimits.max_parallel_workers} onChange={(e) => setDraftLimits((prev) => ({ ...prev, max_parallel_workers: e.target.value }))} />
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
              Kiválasztott cellák: <strong>{selectedCount}</strong> · várható rekord/chunk: <strong>{expectedRows}</strong>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border p-3 text-sm">Összes raw venue: <strong>{discoveryQuery.data?.summary.totalRawVenues ?? 0}</strong></div>
            <div className="rounded border p-3 text-sm">Kijelölt mátrixcellák: <strong>{discoveryQuery.data?.summary.totalSelectedCells ?? 0}</strong></div>
            <div className="rounded border p-3 text-sm">Befejezett cellák: <strong>{discoveryQuery.data?.summary.totalCompletedCells ?? 0}</strong></div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">Ország szűrő</p>
                <Button size="sm" variant="outline" onClick={() => setCountryFilters([])}>Minden ország</Button>
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
                <Button size="sm" variant="outline" onClick={() => setCategoryFilters([])}>Minden kategória</Button>
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
                        <div>{cell.status}</div>
                        {cell.last_error ? <div className="mt-1 text-xs text-destructive">{cell.last_error}</div> : null}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        <div>fetched_rows: {Number(cell.stats?.fetched_rows || 0)}</div>
                        <div>tile: {Number(cell.stats?.tile_index || 0)} / {Number(cell.stats?.total_tiles || 0)}</div>
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
            Ez a lista már az új provider-alapú backend tábla tartalmát mutatja: <strong>public.raw_venues</strong>.
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
