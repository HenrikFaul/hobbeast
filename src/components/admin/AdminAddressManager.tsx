import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type SyncConfig = {
  enabled: boolean;
  interval_minutes: number;
  radius_meters: number;
  geo_limit: number;
  tomtom_limit: number;
  provider_concurrency: number;
  task_batch_size: number;
};

type MatrixCell = {
  provider: 'geoapify' | 'tomtom';
  country_code: string;
  category_key: string;
  category_label: string;
  selected: boolean;
  status: string;
};

type DiscoveryPayload = {
  ok: boolean;
  matrix: MatrixCell[];
};

const DISCOVERY_QUERY_KEY = ['address-manager', 'discovery'];
const CONFIG_QUERY_KEY = ['address-manager', 'sync-config'];

const defaultSyncConfig: SyncConfig = {
  enabled: true,
  interval_minutes: 15,
  radius_meters: 30000,
  geo_limit: 1000,
  tomtom_limit: 1000,
  provider_concurrency: 2,
  task_batch_size: 5,
};

function cellKey(cell: Pick<MatrixCell, 'provider' | 'country_code' | 'category_key'>) {
  return `${cell.provider}:${cell.country_code}:${cell.category_key}`;
}

function parsePositiveInt(input: string, fallback: number) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return fallback;
  return Math.floor(parsed);
}

async function fetchDiscovery(): Promise<DiscoveryPayload> {
  const { data, error } = await supabase.functions.invoke('address-manager-discovery', { body: { action: 'discover' } });
  if (error) throw error;
  return data as DiscoveryPayload;
}

async function fetchSyncConfig(): Promise<SyncConfig> {
  const { data, error } = await supabase.functions.invoke('sync-local-places', { body: { action: 'get_config' } });
  if (error) throw error;
  return {
    ...defaultSyncConfig,
    ...((data?.config || {}) as Partial<SyncConfig>),
  };
}

export function AdminAddressManager() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftConfig, setDraftConfig] = useState<Record<string, string>>({
    geo_limit: String(defaultSyncConfig.geo_limit),
    tomtom_limit: String(defaultSyncConfig.tomtom_limit),
    radius_meters: String(defaultSyncConfig.radius_meters),
    provider_concurrency: String(defaultSyncConfig.provider_concurrency),
    task_batch_size: String(defaultSyncConfig.task_batch_size),
    interval_minutes: String(defaultSyncConfig.interval_minutes),
  });

  const providerFilter = (searchParams.get('provider') || 'geoapify') as 'geoapify' | 'tomtom';
  const countryFilter = (searchParams.get('countries') || '').split(',').filter(Boolean);
  const categoryFilter = (searchParams.get('categories') || '').split(',').filter(Boolean);

  const discoveryQuery = useQuery({
    queryKey: DISCOVERY_QUERY_KEY,
    queryFn: fetchDiscovery,
    refetchOnWindowFocus: false,
  });

  const configQuery = useQuery({
    queryKey: CONFIG_QUERY_KEY,
    queryFn: fetchSyncConfig,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!configQuery.data) return;
    setDraftConfig({
      geo_limit: String(configQuery.data.geo_limit),
      tomtom_limit: String(configQuery.data.tomtom_limit),
      radius_meters: String(configQuery.data.radius_meters),
      provider_concurrency: String(configQuery.data.provider_concurrency),
      task_batch_size: String(configQuery.data.task_batch_size),
      interval_minutes: String(configQuery.data.interval_minutes),
    });
  }, [configQuery.data]);

  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      const base = configQuery.data || defaultSyncConfig;
      const config: SyncConfig = {
        enabled: base.enabled,
        interval_minutes: parsePositiveInt(draftConfig.interval_minutes, base.interval_minutes),
        radius_meters: parsePositiveInt(draftConfig.radius_meters, base.radius_meters),
        geo_limit: parsePositiveInt(draftConfig.geo_limit, base.geo_limit),
        tomtom_limit: parsePositiveInt(draftConfig.tomtom_limit, base.tomtom_limit),
        provider_concurrency: parsePositiveInt(draftConfig.provider_concurrency, base.provider_concurrency),
        task_batch_size: parsePositiveInt(draftConfig.task_batch_size, base.task_batch_size),
      };

      const { data, error } = await supabase.functions.invoke('sync-local-places', {
        body: { action: 'save_config', config },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY });
      toast.success('Beállítások mentve');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Mentés sikertelen';
      toast.error(message);
    },
  });

  const saveSelectionMutation = useMutation({
    mutationFn: async (updates: Array<{ provider: 'geoapify' | 'tomtom'; country_code: string; category_key: string; selected: boolean }>) => {
      const { data, error } = await supabase.functions.invoke('address-manager-discovery', {
        body: { action: 'save_selection', updates },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DISCOVERY_QUERY_KEY }),
  });

  const matrix = useMemo(() => discoveryQuery.data?.matrix || [], [discoveryQuery.data?.matrix]);

  useEffect(() => {
    if (!matrix.length) return;
    const selectedParam = searchParams.get('selected');
    if (selectedParam) return;

    const selectedKeys = matrix.filter((cell) => cell.selected).map((cell) => cellKey(cell));
    if (!selectedKeys.length) return;

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('selected', selectedKeys.join(','));
      return next;
    }, { replace: true });
  }, [matrix, searchParams, setSearchParams]);

  const selectedKeys = useMemo(() => new Set((searchParams.get('selected') || '').split(',').filter(Boolean)), [searchParams]);

  const providerMatrix = useMemo(
    () => matrix.filter((cell) => cell.provider === providerFilter),
    [matrix, providerFilter],
  );

  const countries = useMemo(
    () => Array.from(new Set(providerMatrix.map((cell) => cell.country_code))).sort(),
    [providerMatrix],
  );

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const cell of providerMatrix) map.set(cell.category_key, cell.category_label);
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'hu'));
  }, [providerMatrix]);

  const visibleMatrix = useMemo(() => {
    return providerMatrix.filter((cell) => {
      const countryOk = countryFilter.length === 0 || countryFilter.includes(cell.country_code);
      const categoryOk = categoryFilter.length === 0 || categoryFilter.includes(cell.category_key);
      return countryOk && categoryOk;
    });
  }, [providerMatrix, countryFilter, categoryFilter]);

  const selectedCount = visibleMatrix.filter((cell) => selectedKeys.has(cellKey(cell))).length;
  const effectiveProviderLimit = providerFilter === 'geoapify'
    ? parsePositiveInt(draftConfig.geo_limit, configQuery.data?.geo_limit || defaultSyncConfig.geo_limit)
    : parsePositiveInt(draftConfig.tomtom_limit, configQuery.data?.tomtom_limit || defaultSyncConfig.tomtom_limit);
  const expectedRows = Math.max(0, selectedCount * effectiveProviderLimit);

  const setFilterArray = (key: 'countries' | 'categories', values: string[]) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (values.length === 0) next.delete(key);
      else next.set(key, values.join(','));
      return next;
    }, { replace: true });
  };

  const setSelectedKeys = (nextSelected: Set<string>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextSelected.size === 0) next.delete('selected');
      else next.set('selected', Array.from(nextSelected).join(','));
      return next;
    }, { replace: true });
  };

  const toggleCell = (cell: MatrixCell, selected: boolean) => {
    const next = new Set(selectedKeys);
    const key = cellKey(cell);
    if (selected) next.add(key);
    else next.delete(key);
    setSelectedKeys(next);
  };

  const selectAllForCountry = (country: string, selected: boolean) => {
    const next = new Set(selectedKeys);
    providerMatrix.filter((cell) => cell.country_code === country).forEach((cell) => {
      const key = cellKey(cell);
      if (selected) next.add(key);
      else next.delete(key);
    });
    setSelectedKeys(next);
  };

  const selectAllForCategory = (categoryKey: string, selected: boolean) => {
    const next = new Set(selectedKeys);
    providerMatrix.filter((cell) => cell.category_key === categoryKey).forEach((cell) => {
      const key = cellKey(cell);
      if (selected) next.add(key);
      else next.delete(key);
    });
    setSelectedKeys(next);
  };

  const persistSelectionToBackend = async () => {
    const updates = matrix.map((cell) => ({
      provider: cell.provider,
      country_code: cell.country_code,
      category_key: cell.category_key,
      selected: selectedKeys.has(cellKey(cell)),
    }));
    await saveSelectionMutation.mutateAsync(updates);
  };

  const runNextChunkMutation = useMutation({
    mutationFn: async () => {
      await persistSelectionToBackend();
      const generator = await supabase.functions.invoke('address-manager-task-generator', { body: {} });
      if (generator.error) throw generator.error;
      if (!generator.data?.generated) return generator.data;

      const worker = await supabase.functions.invoke('address-manager-worker', { body: { task: generator.data.task } });
      if (worker.error) throw worker.error;
      return worker.data;
    },
    onSuccess: (data: { generated?: boolean; written?: number } | undefined) => {
      queryClient.invalidateQueries({ queryKey: DISCOVERY_QUERY_KEY });
      toast.success(data?.generated === false ? 'Nincs futtatható chunk' : `Chunk lefutott (${data?.written ?? 0} rekord)`);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Chunk futtatás sikertelen';
      toast.error(message);
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Címkezelő — Discovery & Mátrix</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(['geoapify', 'tomtom'] as const).map((provider) => (
              <Button
                key={provider}
                variant={providerFilter === provider ? 'default' : 'outline'}
                onClick={() => {
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set('provider', provider);
                    return next;
                  }, { replace: true });
                }}
              >
                {provider}
              </Button>
            ))}
            <Button variant="outline" onClick={() => discoveryQuery.refetch()} disabled={discoveryQuery.isFetching}>Frissítés</Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <div>
              <Label>Geoapify limit</Label>
              <Input type="number" value={draftConfig.geo_limit} onChange={(e) => setDraftConfig((prev) => ({ ...prev, geo_limit: e.target.value }))} />
            </div>
            <div>
              <Label>TomTom limit</Label>
              <Input type="number" value={draftConfig.tomtom_limit} onChange={(e) => setDraftConfig((prev) => ({ ...prev, tomtom_limit: e.target.value }))} />
            </div>
            <div>
              <Label>Radius (m)</Label>
              <Input type="number" value={draftConfig.radius_meters} onChange={(e) => setDraftConfig((prev) => ({ ...prev, radius_meters: e.target.value }))} />
            </div>
            <div>
              <Label>Provider concurrency</Label>
              <Input type="number" value={draftConfig.provider_concurrency} onChange={(e) => setDraftConfig((prev) => ({ ...prev, provider_concurrency: e.target.value }))} />
            </div>
            <div>
              <Label>Task batch size</Label>
              <Input type="number" value={draftConfig.task_batch_size} onChange={(e) => setDraftConfig((prev) => ({ ...prev, task_batch_size: e.target.value }))} />
            </div>
            <div>
              <Label>Interval (perc)</Label>
              <Input type="number" value={draftConfig.interval_minutes} onChange={(e) => setDraftConfig((prev) => ({ ...prev, interval_minutes: e.target.value }))} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button className="gradient-primary text-primary-foreground border-0" onClick={() => saveConfigMutation.mutate()} disabled={saveConfigMutation.isPending}>
              {saveConfigMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Beállítások mentése
            </Button>
            <div className="rounded border px-3 py-2 text-sm">
              Kiválasztott cellák: <strong>{selectedCount}</strong> · Várható rekord/chunk: <strong>{expectedRows}</strong>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
            <div className="space-y-3">
              <p className="text-sm font-medium">Ország szűrő (URL state)</p>
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

              <p className="text-sm font-medium">Kategória szűrő (URL state)</p>
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
                    <th className="p-2 text-left">Aktív</th>
                    <th className="p-2 text-left">Állapot</th>
                    <th className="p-2 text-left">Akciók</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMatrix.map((cell) => (
                    <tr key={cellKey(cell)} className="border-t">
                      <td className="p-2">{cell.country_code}</td>
                      <td className="p-2">{cell.category_label}</td>
                      <td className="p-2">
                        <Checkbox checked={selectedKeys.has(cellKey(cell))} onCheckedChange={(next) => toggleCell(cell, Boolean(next))} />
                      </td>
                      <td className="p-2">{cell.status}</td>
                      <td className="p-2 space-x-2">
                        <Button size="sm" variant="outline" onClick={() => selectAllForCountry(cell.country_code, true)}>Ország mind</Button>
                        <Button size="sm" variant="outline" onClick={() => selectAllForCategory(cell.category_key, true)}>Kategória mind</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => runNextChunkMutation.mutate()} disabled={runNextChunkMutation.isPending}>
              {runNextChunkMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Mentés + következő chunk futtatása
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
