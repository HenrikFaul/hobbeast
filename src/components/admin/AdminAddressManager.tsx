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
  id?: string;
  provider: ProviderKey;
  country_code: string;
  category_key: string;
  category_label: string;
  selected: boolean;
  status: string;
  cursor: Record<string, unknown>;
  stats: Record<string, unknown>;
  last_error?: string | null;
  last_run_started_at?: string | null;
  last_run_completed_at?: string | null;
  updated_at?: string | null;
};

type DiscoveryStateResponse = {
  ok: boolean;
  limits: AddressManagerLimits;
  matrix: DiscoveryCell[];
};

type RawVenueRow = {
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
  phone: string | null;
  website: string | null;
  open_now: boolean | null;
  rating: number | null;
  review_count: number | null;
  discovered_at: string;
  updated_at: string;
};

type CatalogResponse = {
  ok: boolean;
  items: RawVenueRow[];
  total: number;
  page: number;
  pageSize: number;
};

const STATE_QUERY_KEY = ['address-manager', 'discovery-state'];
const PAGE_SIZE = 25;

const defaultLimits: AddressManagerLimits = {
  geoapify_limit: 1000,
  tomtom_limit: 1000,
  radius_meters: 30000,
  worker_chunk_size: 5,
  max_parallel_workers: 2,
};

function parsePositiveInt(input: string, fallback: number) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('hu-HU');
}

async function fetchDiscoveryState(): Promise<DiscoveryStateResponse> {
  const { data, error } = await invokeFunctionWithDebug<DiscoveryStateResponse>('address-manager-discovery', {
    body: { action: 'get_state' },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error('A discovery állapot lekérdezése sikertelen.');
  return data;
}

async function fetchCatalog(payload: {
  provider: ProviderKey;
  countries: string[];
  categories: string[];
  search: string;
  page: number;
  pageSize: number;
}): Promise<CatalogResponse> {
  const { data, error } = await invokeFunctionWithDebug<CatalogResponse>('address-manager-discovery', {
    body: {
      action: 'get_catalog',
      provider: payload.provider,
      countries: payload.countries,
      categories: payload.categories,
      search: payload.search,
      page: payload.page,
      pageSize: payload.pageSize,
    },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error('A nyers venue katalógus lekérdezése sikertelen.');
  return data;
}

export function AdminAddressManager() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftLimits, setDraftLimits] = useState<Record<string, string>>({
    geoapify_limit: String(defaultLimits.geoapify_limit),
    tomtom_limit: String(defaultLimits.tomtom_limit),
    radius_meters: String(defaultLimits.radius_meters),
    worker_chunk_size: String(defaultLimits.worker_chunk_size),
    max_parallel_workers: String(defaultLimits.max_parallel_workers),
  });

  const providerFilter = (searchParams.get('provider') || 'geoapify') as ProviderKey;
  const countryFilter = (searchParams.get('countries') || '').split(',').filter(Boolean);
  const categoryFilter = (searchParams.get('categories') || '').split(',').filter(Boolean);
  const searchTerm = searchParams.get('catalogSearch') || '';
  const page = Math.max(1, Number(searchParams.get('catalogPage') || '1'));

  const stateQuery = useQuery({
    queryKey: STATE_QUERY_KEY,
    queryFn: fetchDiscoveryState,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!stateQuery.data?.limits) return;
    setDraftLimits({
      geoapify_limit: String(stateQuery.data.limits.geoapify_limit),
      tomtom_limit: String(stateQuery.data.limits.tomtom_limit),
      radius_meters: String(stateQuery.data.limits.radius_meters),
      worker_chunk_size: String(stateQuery.data.limits.worker_chunk_size),
      max_parallel_workers: String(stateQuery.data.limits.max_parallel_workers),
    });
  }, [stateQuery.data]);

  const matrix = useMemo(
    () => (stateQuery.data?.matrix || []).filter((cell) => cell.provider === providerFilter),
    [stateQuery.data?.matrix, providerFilter],
  );

  const countries = useMemo(
    () => Array.from(new Set(matrix.map((cell) => cell.country_code))).sort(),
    [matrix],
  );

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const cell of matrix) map.set(cell.category_key, cell.category_label);
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'hu'));
  }, [matrix]);

  const visibleMatrix = useMemo(() => {
    return matrix.filter((cell) => {
      const countryOk = countryFilter.length === 0 || countryFilter.includes(cell.country_code);
      const categoryOk = categoryFilter.length === 0 || categoryFilter.includes(cell.category_key);
      return countryOk && categoryOk;
    });
  }, [matrix, countryFilter, categoryFilter]);

  const selectedCount = visibleMatrix.filter((cell) => cell.selected).length;

  const catalogQuery = useQuery({
    queryKey: ['address-manager', 'raw-venues', providerFilter, countryFilter.join(','), categoryFilter.join(','), searchTerm, page],
    queryFn: () => fetchCatalog({
      provider: providerFilter,
      countries: countryFilter,
      categories: categoryFilter,
      search: searchTerm,
      page,
      pageSize: PAGE_SIZE,
    }),
    refetchOnWindowFocus: false,
  });

  const buildLimitsFromDraft = (): AddressManagerLimits => {
    const base = stateQuery.data?.limits || defaultLimits;
    return {
      geoapify_limit: parsePositiveInt(draftLimits.geoapify_limit, base.geoapify_limit),
      tomtom_limit: parsePositiveInt(draftLimits.tomtom_limit, base.tomtom_limit),
      radius_meters: parsePositiveInt(draftLimits.radius_meters, base.radius_meters),
      worker_chunk_size: parsePositiveInt(draftLimits.worker_chunk_size, base.worker_chunk_size),
      max_parallel_workers: parsePositiveInt(draftLimits.max_parallel_workers, base.max_parallel_workers),
    };
  };

  const saveLimitsMutation = useMutation({
    mutationFn: async () => {
      const limits = buildLimitsFromDraft();
      const { data, error } = await invokeFunctionWithDebug<DiscoveryStateResponse>('address-manager-discovery', {
        body: { action: 'save_limits', limits },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error('A limitek mentése sikertelen.');
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(STATE_QUERY_KEY, data);
      toast.success('Address Manager limitek elmentve.');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Mentés sikertelen.');
    },
  });

  const selectionMutation = useMutation({
    mutationFn: async (updates: Array<{ provider: ProviderKey; country_code: string; category_key: string; selected: boolean }>) => {
      const { data, error } = await invokeFunctionWithDebug<DiscoveryStateResponse>('address-manager-discovery', {
        body: { action: 'save_selection', updates },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error('A kijelölés mentése sikertelen.');
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(STATE_QUERY_KEY, data);
      queryClient.invalidateQueries({ queryKey: ['address-manager', 'raw-venues'] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'A kijelölés mentése sikertelen.');
    },
  });

  const runNextMutation = useMutation({
    mutationFn: async () => {
      const limits = buildLimitsFromDraft();
      const saveResponse = await invokeFunctionWithDebug<DiscoveryStateResponse>('address-manager-discovery', {
        body: { action: 'save_limits', limits },
      });
      if (saveResponse.error) throw saveResponse.error;

      const generatorResponse = await invokeFunctionWithDebug<any>('address-manager-task-generator', { body: {} });
      if (generatorResponse.error) throw generatorResponse.error;
      if (!generatorResponse.data?.ok) {
        throw new Error(generatorResponse.data?.error || 'Task generálás sikertelen.');
      }
      if (!generatorResponse.data?.generated) {
        return { generated: false, reason: generatorResponse.data?.reason || 'done' };
      }

      const workerResponse = await invokeFunctionWithDebug<any>('address-manager-worker', {
        body: { task: generatorResponse.data.task },
      });
      if (workerResponse.error) throw workerResponse.error;
      if (!workerResponse.data?.ok) {
        throw new Error(workerResponse.data?.error || 'Worker futás sikertelen.');
      }

      return {
        generated: true,
        written: Number(workerResponse.data?.written || 0),
        task: generatorResponse.data.task,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: STATE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['address-manager', 'raw-venues'] });
      if (!data.generated) {
        const reasonMap: Record<string, string> = {
          done: 'Nincs több kiválasztott vagy futtatható mátrix-cella.',
          no_free_worker_slots: 'Most nincs szabad worker slot.',
        };
        toast.info(reasonMap[data.reason] || `Nem indult új task: ${data.reason}`);
        return;
      }
      toast.success(`Worker lefutott, ${data.written} rekord került a raw_venues táblába.`);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'A worker indítása sikertelen.');
    },
  });

  const setFilterArray = (key: 'countries' | 'categories', values: string[]) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (values.length === 0) next.delete(key);
      else next.set(key, values.join(','));
      next.set('catalogPage', '1');
      return next;
    }, { replace: true });
  };

  const setProvider = (provider: ProviderKey) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('provider', provider);
      next.set('catalogPage', '1');
      return next;
    }, { replace: true });
  };

  const setCatalogSearch = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value.trim()) next.set('catalogSearch', value.trim());
      else next.delete('catalogSearch');
      next.set('catalogPage', '1');
      return next;
    }, { replace: true });
  };

  const setCatalogPage = (nextPage: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('catalogPage', String(Math.max(1, nextPage)));
      return next;
    }, { replace: true });
  };

  const toggleCell = (cell: DiscoveryCell, selected: boolean) => {
    selectionMutation.mutate([
      {
        provider: cell.provider,
        country_code: cell.country_code,
        category_key: cell.category_key,
        selected,
      },
    ]);
  };

  const selectAllForCountry = (country: string, selected: boolean) => {
    const updates = matrix
      .filter((cell) => cell.country_code === country)
      .map((cell) => ({
        provider: cell.provider,
        country_code: cell.country_code,
        category_key: cell.category_key,
        selected,
      }));
    selectionMutation.mutate(updates);
  };

  const selectAllForCategory = (categoryKey: string, selected: boolean) => {
    const updates = matrix
      .filter((cell) => cell.category_key === categoryKey)
      .map((cell) => ({
        provider: cell.provider,
        country_code: cell.country_code,
        category_key: cell.category_key,
        selected,
      }));
    selectionMutation.mutate(updates);
  };

  const totalCatalogPages = Math.max(1, Math.ceil((catalogQuery.data?.total || 0) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Címkezelő — új discovery mátrix + raw_venues katalógus</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(['geoapify', 'tomtom'] as const).map((provider) => (
              <Button
                key={provider}
                variant={providerFilter === provider ? 'default' : 'outline'}
                onClick={() => setProvider(provider)}
              >
                {provider}
              </Button>
            ))}
            <Button variant="outline" onClick={() => {
              queryClient.invalidateQueries({ queryKey: STATE_QUERY_KEY });
              queryClient.invalidateQueries({ queryKey: ['address-manager', 'raw-venues'] });
            }} disabled={stateQuery.isFetching || catalogQuery.isFetching}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Frissítés
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
              <Label>Párhuzamos worker max</Label>
              <Input type="number" value={draftLimits.max_parallel_workers} onChange={(e) => setDraftLimits((prev) => ({ ...prev, max_parallel_workers: e.target.value }))} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button className="gradient-primary text-primary-foreground border-0" onClick={() => saveLimitsMutation.mutate()} disabled={saveLimitsMutation.isPending}>
              {saveLimitsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Limitek mentése
            </Button>
            <Button onClick={() => runNextMutation.mutate()} disabled={runNextMutation.isPending || selectionMutation.isPending}>
              {runNextMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Következő worker futtatása
            </Button>
            <div className="rounded border px-3 py-2 text-sm">
              Kiválasztott látható cellák: <strong>{selectedCount}</strong>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
            <div className="space-y-3">
              <p className="text-sm font-medium">Ország szűrő</p>
              <Button variant="outline" size="sm" onClick={() => setFilterArray('countries', [])}>Minden ország</Button>
              <div className="max-h-60 overflow-auto space-y-2 border rounded p-2">
                {countries.map((country) => {
                  const checked = countryFilter.includes(country);
                  return (
                    <label key={country} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => {
                          const set = new Set(countryFilter);
                          if (next) set.add(country);
                          else set.delete(country);
                          setFilterArray('countries', Array.from(set));
                        }}
                      />
                      {country}
                    </label>
                  );
                })}
              </div>

              <p className="text-sm font-medium">Kategória szűrő</p>
              <Button variant="outline" size="sm" onClick={() => setFilterArray('categories', [])}>Minden kategória</Button>
              <div className="max-h-60 overflow-auto space-y-2 border rounded p-2">
                {categories.map(([key, label]) => {
                  const checked = categoryFilter.includes(key);
                  return (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => {
                          const set = new Set(categoryFilter);
                          if (next) set.add(key);
                          else set.delete(key);
                          setFilterArray('categories', Array.from(set));
                        }}
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="overflow-auto rounded border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="p-2 text-left">Ország</th>
                    <th className="p-2 text-left">Kategória</th>
                    <th className="p-2 text-left">Kiválasztva</th>
                    <th className="p-2 text-left">Állapot</th>
                    <th className="p-2 text-left">Utolsó futás</th>
                    <th className="p-2 text-left">Utolsó stat</th>
                    <th className="p-2 text-left">Akciók</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMatrix.map((cell) => {
                    const fetchedRows = typeof cell.stats?.fetched_rows === 'number' ? cell.stats.fetched_rows : '—';
                    return (
                      <tr key={`${cell.provider}:${cell.country_code}:${cell.category_key}`} className="border-t align-top">
                        <td className="p-2">{cell.country_code}</td>
                        <td className="p-2">{cell.category_label}</td>
                        <td className="p-2">
                          <Checkbox checked={cell.selected} onCheckedChange={(next) => toggleCell(cell, Boolean(next))} />
                        </td>
                        <td className="p-2">
                          <div>{cell.status}</div>
                          {cell.last_error ? <div className="text-xs text-destructive mt-1">{cell.last_error}</div> : null}
                        </td>
                        <td className="p-2">{formatDateTime(cell.last_run_completed_at || cell.last_run_started_at || cell.updated_at)}</td>
                        <td className="p-2">{String(fetchedRows)}</td>
                        <td className="p-2 space-x-2">
                          <Button size="sm" variant="outline" onClick={() => selectAllForCountry(cell.country_code, true)}>Ország mind</Button>
                          <Button size="sm" variant="outline" onClick={() => selectAllForCategory(cell.category_key, true)}>Kategória mind</Button>
                        </td>
                      </tr>
                    );
                  })}
                  {visibleMatrix.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-muted-foreground">Nincs a szűrésnek megfelelő mátrix sor.</td>
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
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="max-w-sm"
              placeholder="Keresés név / cím / város szerint"
              defaultValue={searchTerm}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setCatalogSearch((e.target as HTMLInputElement).value);
              }}
            />
            <Button variant="outline" onClick={() => setCatalogSearch('')}>Keresés törlése</Button>
            <div className="rounded border px-3 py-2 text-sm">
              Összes rekord a szűrésben: <strong>{catalogQuery.data?.total ?? 0}</strong>
            </div>
          </div>

          <div className="overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40">
                  <th className="p-2 text-left">Név</th>
                  <th className="p-2 text-left">Cím</th>
                  <th className="p-2 text-left">Város</th>
                  <th className="p-2 text-left">Ország</th>
                  <th className="p-2 text-left">Kategória</th>
                  <th className="p-2 text-left">Provider</th>
                  <th className="p-2 text-left">Frissítve</th>
                </tr>
              </thead>
              <tbody>
                {catalogQuery.isLoading ? (
                  <tr><td colSpan={7} className="p-4 text-center"><Loader2 className="inline h-4 w-4 animate-spin" /></td></tr>
                ) : (catalogQuery.data?.items || []).length === 0 ? (
                  <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Nincs rekord a raw_venues táblában a jelenlegi szűrésre.</td></tr>
                ) : (
                  (catalogQuery.data?.items || []).map((row) => (
                    <tr key={row.id} className="border-t align-top">
                      <td className="p-2">{row.name || '—'}</td>
                      <td className="p-2">{row.address || '—'}</td>
                      <td className="p-2">{row.city || row.district || '—'}</td>
                      <td className="p-2">{row.country_code || '—'}</td>
                      <td className="p-2">{row.category_key || '—'}</td>
                      <td className="p-2">{row.provider}</td>
                      <td className="p-2">{formatDateTime(row.updated_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              Oldal <strong>{page}</strong> / <strong>{totalCatalogPages}</strong>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page <= 1} onClick={() => setCatalogPage(page - 1)}>Előző</Button>
              <Button variant="outline" disabled={page >= totalCatalogPages} onClick={() => setCatalogPage(page + 1)}>Következő</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
