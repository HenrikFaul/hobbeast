import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { invokeFunctionWithDebug } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
};

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

const EUROPE_COUNTRIES = ['AT', 'DE', 'ES', 'FR', 'HU', 'IT', 'NL', 'PL'];
const CATEGORIES = [
  { key: 'restaurant', label: 'Étterem' },
  { key: 'cafe', label: 'Kávézó' },
  { key: 'bar', label: 'Bár/Pub' },
  { key: 'museum', label: 'Múzeum' },
  { key: 'supermarket', label: 'Szupermarket' },
];

function buildMatrix(provider: 'geoapify' | 'tomtom') {
  const rows: MatrixCell[] = [];
  for (const country of EUROPE_COUNTRIES) {
    for (const category of CATEGORIES) {
      rows.push({
        provider,
        country_code: country,
        category_key: category.key,
        category_label: category.label,
      });
    }
  }
  return rows;
}

function cellKey(cell: Pick<MatrixCell, 'provider' | 'country_code' | 'category_key'>) {
  return `${cell.provider}:${cell.country_code}:${cell.category_key}`;
}

function parsePositiveInt(input: string, fallback: number) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return fallback;
  return Math.floor(parsed);
}

async function fetchSyncConfig(): Promise<SyncConfig> {
  const { data, error } = await invokeFunctionWithDebug('sync-local-places', { body: { action: 'get_config' } });
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

  const buildConfigFromDraft = (): SyncConfig => {
    const base = configQuery.data || defaultSyncConfig;
    return {
      enabled: base.enabled,
      interval_minutes: parsePositiveInt(draftConfig.interval_minutes, base.interval_minutes),
      radius_meters: parsePositiveInt(draftConfig.radius_meters, base.radius_meters),
      geo_limit: parsePositiveInt(draftConfig.geo_limit, base.geo_limit),
      tomtom_limit: parsePositiveInt(draftConfig.tomtom_limit, base.tomtom_limit),
      provider_concurrency: parsePositiveInt(draftConfig.provider_concurrency, base.provider_concurrency),
      task_batch_size: parsePositiveInt(draftConfig.task_batch_size, base.task_batch_size),
    };
  };

  const persistConfig = async () => {
    const config = buildConfigFromDraft();
    const response = await invokeFunctionWithDebug('sync-local-places', {
      body: { action: 'save_config', config },
    });
    if (response.error) throw response.error;
    return response.data;
  };

  const saveConfigMutation = useMutation({
    mutationFn: persistConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY });
      toast.success('Beállítások mentve');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Mentés sikertelen';
      toast.error(message);
    },
  });

  const matrix = useMemo(() => buildMatrix(providerFilter), [providerFilter]);

  const selectedKeys = useMemo(
    () => new Set((searchParams.get('selected') || '').split(',').filter(Boolean)),
    [searchParams],
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
    matrix.filter((cell) => cell.country_code === country).forEach((cell) => {
      const key = cellKey(cell);
      if (selected) next.add(key);
      else next.delete(key);
    });
    setSelectedKeys(next);
  };

  const selectAllForCategory = (categoryKey: string, selected: boolean) => {
    const next = new Set(selectedKeys);
    matrix.filter((cell) => cell.category_key === categoryKey).forEach((cell) => {
      const key = cellKey(cell);
      if (selected) next.add(key);
      else next.delete(key);
    });
    setSelectedKeys(next);
  };

  const runNextChunkMutation = useMutation({
    mutationFn: async () => {
      await persistConfig();
      const response = await invokeFunctionWithDebug('sync-local-places', {
        body: { action: 'enqueue', reset: false },
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY });
      toast.success('Batch futtatás kérés elküldve a sync-local-places funkciónak.');
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
            <Button variant="outline" onClick={() => configQuery.refetch()} disabled={configQuery.isFetching}>
              Konfig frissítés
            </Button>
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
                  {visibleMatrix.map((cell) => {
                    const active = selectedKeys.has(cellKey(cell));
                    return (
                      <tr key={cellKey(cell)} className="border-t">
                        <td className="p-2">{cell.country_code}</td>
                        <td className="p-2">{cell.category_label}</td>
                        <td className="p-2">
                          <Checkbox checked={active} onCheckedChange={(next) => toggleCell(cell, Boolean(next))} />
                        </td>
                        <td className="p-2">{active ? 'kiválasztva' : 'inaktív'}</td>
                        <td className="p-2 space-x-2">
                          <Button size="sm" variant="outline" onClick={() => selectAllForCountry(cell.country_code, true)}>Ország mind</Button>
                          <Button size="sm" variant="outline" onClick={() => selectAllForCategory(cell.category_key, true)}>Kategória mind</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => runNextChunkMutation.mutate()} disabled={runNextChunkMutation.isPending}>
              {runNextChunkMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Mentés + sync-local-places enqueue
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
