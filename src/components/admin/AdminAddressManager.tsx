import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type Limits = {
  geoapify_limit: number;
  tomtom_limit: number;
  radius_meters: number;
  worker_chunk_size: number;
  max_parallel_workers: number;
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
  limits: Limits;
  matrix: MatrixCell[];
};

const QUERY_KEY = ['address-manager', 'discovery'];

async function fetchDiscovery(): Promise<DiscoveryPayload> {
  const { data, error } = await supabase.functions.invoke('address-manager-discovery', { body: { action: 'discover' } });
  if (error) throw error;
  return data as DiscoveryPayload;
}

export function AdminAddressManager() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const providerFilter = (searchParams.get('provider') || 'geoapify') as 'geoapify' | 'tomtom';
  const countryFilter = (searchParams.get('countries') || '').split(',').filter(Boolean);
  const categoryFilter = (searchParams.get('categories') || '').split(',').filter(Boolean);

  const discoveryQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchDiscovery,
    refetchOnWindowFocus: false,
  });

  const saveLimitsMutation = useMutation({
    mutationFn: async (limits: Partial<Limits>) => {
      const { data, error } = await supabase.functions.invoke('address-manager-discovery', {
        body: { action: 'save_limits', limits },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const saveSelectionMutation = useMutation({
    mutationFn: async (updates: Array<{ provider: 'geoapify' | 'tomtom'; country_code: string; category_key: string; selected: boolean }>) => {
      const { data, error } = await supabase.functions.invoke('address-manager-discovery', {
        body: { action: 'save_selection', updates },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const runNextChunkMutation = useMutation({
    mutationFn: async () => {
      const generator = await supabase.functions.invoke('address-manager-task-generator', { body: {} });
      if (generator.error) throw generator.error;
      if (!generator.data?.generated) return generator.data;

      const worker = await supabase.functions.invoke('address-manager-worker', { body: { task: generator.data.task } });
      if (worker.error) throw worker.error;
      return worker.data;
    },
    onSuccess: (data: { generated?: boolean; written?: number } | undefined) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(data?.generated === false ? 'Nincs futtatható chunk' : `Chunk lefutott (${data?.written ?? 0} rekord)`);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Chunk futtatás sikertelen';
      toast.error(message);
    },
  });

  const matrix = useMemo(() => discoveryQuery.data?.matrix || [], [discoveryQuery.data?.matrix]);
  const limits = discoveryQuery.data?.limits;

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

  const selectedCount = visibleMatrix.filter((cell) => cell.selected).length;
  const expectedRows = Math.max(0, selectedCount * ((providerFilter === 'geoapify' ? limits?.geoapify_limit : limits?.tomtom_limit) || 0));

  const setFilterArray = (key: 'countries' | 'categories', values: string[]) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (values.length === 0) next.delete(key);
      else next.set(key, values.join(','));
      return next;
    }, { replace: true });
  };

  const toggleCell = (cell: MatrixCell, selected: boolean) => {
    saveSelectionMutation.mutate([{ provider: cell.provider, country_code: cell.country_code, category_key: cell.category_key, selected }]);
  };

  const selectAllForCountry = (country: string, selected: boolean) => {
    const updates = providerMatrix
      .filter((cell) => cell.country_code === country)
      .map((cell) => ({ provider: cell.provider, country_code: cell.country_code, category_key: cell.category_key, selected }));
    saveSelectionMutation.mutate(updates);
  };

  const selectAllForCategory = (categoryKey: string, selected: boolean) => {
    const updates = providerMatrix
      .filter((cell) => cell.category_key === categoryKey)
      .map((cell) => ({ provider: cell.provider, country_code: cell.country_code, category_key: cell.category_key, selected }));
    saveSelectionMutation.mutate(updates);
  };

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

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label>Geoapify limit</Label>
              <Input
                type="number"
                value={limits?.geoapify_limit ?? 0}
                onChange={(e) => saveLimitsMutation.mutate({ geoapify_limit: Number(e.target.value || 0) })}
              />
            </div>
            <div>
              <Label>TomTom limit</Label>
              <Input
                type="number"
                value={limits?.tomtom_limit ?? 0}
                onChange={(e) => saveLimitsMutation.mutate({ tomtom_limit: Number(e.target.value || 0) })}
              />
            </div>
            <div>
              <Label>Radius (m)</Label>
              <Input
                type="number"
                value={limits?.radius_meters ?? 0}
                onChange={(e) => saveLimitsMutation.mutate({ radius_meters: Number(e.target.value || 0) })}
              />
            </div>
            <div>
              <Label>Worker chunk</Label>
              <Input
                type="number"
                value={limits?.worker_chunk_size ?? 0}
                onChange={(e) => saveLimitsMutation.mutate({ worker_chunk_size: Number(e.target.value || 0) })}
              />
            </div>
            <div>
              <Label>Párhuzamos worker</Label>
              <Input
                type="number"
                value={limits?.max_parallel_workers ?? 0}
                onChange={(e) => saveLimitsMutation.mutate({ max_parallel_workers: Number(e.target.value || 0) })}
              />
            </div>
          </div>

          <div className="rounded border p-3 text-sm">
            Kiválasztott cellák: <strong>{selectedCount}</strong> · Várható rekord/chunk: <strong>{expectedRows}</strong>
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
                    <tr key={`${cell.provider}:${cell.country_code}:${cell.category_key}`} className="border-t">
                      <td className="p-2">{cell.country_code}</td>
                      <td className="p-2">{cell.category_label}</td>
                      <td className="p-2">
                        <Checkbox checked={cell.selected} onCheckedChange={(next) => toggleCell(cell, Boolean(next))} />
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
              Mentés + következő chunk futtatása
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
