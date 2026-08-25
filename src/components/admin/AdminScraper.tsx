import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ScraperDestination {
  source_id: string;
  publisher_name: string;
  endpoint_url: string;
  city: string | null;
  scrape_enabled: boolean;
  scrape_priority: number;
  last_run_at: string | null;
  last_events: number;
  total_events: number;
}

interface ScraperDaily {
  day: string;
  runs: number;
  sources: number;
  discovered: number;
  inserted: number;
  updated: number;
  duplicates: number;
}

interface ScraperTotals {
  total_scraper_events: number;
  enabled_sources: number;
  registered_sources: number;
  runs_total: number;
  inserted_total: number;
  duplicates_total: number;
}

interface ScraperStats {
  destinations: ScraperDestination[];
  daily: ScraperDaily[];
  totals: ScraperTotals;
}

const numberFormat = new Intl.NumberFormat('hu-HU');

function formatWhen(value: string | null) {
  if (!value) return 'még nem futott';
  try {
    return new Date(value).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return value;
  }
}

export function AdminScraper() {
  const [stats, setStats] = useState<ScraperStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('admin_scraper_stats', { p_days: 14 });
    if (rpcError) {
      setError(rpcError.message);
      setStats(null);
    } else {
      setStats(data as unknown as ScraperStats);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <p className="text-sm text-muted-foreground">Programgyűjtő statisztikák betöltése…</p>;
  if (error) return <p className="text-sm text-destructive">Nem sikerült betölteni: {error}</p>;
  if (!stats) return null;

  const { totals, daily, destinations } = stats;
  const visibleDestinations = showAll ? destinations : destinations.slice(0, 30);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Programgyűjtő</h2>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1 h-4 w-4" /> Frissítés
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Aktív begyűjtött esemény', totals.total_scraper_events],
          ['Engedélyezett forrás', `${totals.enabled_sources} / ${totals.registered_sources}`],
          ['Összes futás', totals.runs_total],
          ['Összes beszúrás · duplikátum-szűrés', `${numberFormat.format(totals.inserted_total)} · ${numberFormat.format(totals.duplicates_total)}`],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{typeof value === 'number' ? numberFormat.format(value) : value}</p></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Napi begyűjtés (14 nap)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {daily.length === 0 ? <p className="text-sm text-muted-foreground">Még nincs futásnapló.</p> : (
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Nap</th><th className="py-2 pr-3">Futások</th><th className="py-2 pr-3">Források</th>
                <th className="py-2 pr-3">Talált</th><th className="py-2 pr-3">Új</th><th className="py-2 pr-3">Frissített</th><th className="py-2">Duplikátum</th>
              </tr></thead>
              <tbody>{daily.map((d) => (
                <tr key={d.day} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{d.day}</td>
                  <td className="py-2 pr-3">{d.runs}</td>
                  <td className="py-2 pr-3">{d.sources}</td>
                  <td className="py-2 pr-3">{d.discovered}</td>
                  <td className="py-2 pr-3 font-semibold text-emerald-600">+{d.inserted}</td>
                  <td className="py-2 pr-3">{d.updated}</td>
                  <td className="py-2">{d.duplicates}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Célok (destinations) · prioritás szerint</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-3">Forrás</th><th className="py-2 pr-3">Város</th><th className="py-2 pr-3">Prio</th>
              <th className="py-2 pr-3">Utolsó futás</th><th className="py-2 pr-3">Utolsó · összes esemény</th><th className="py-2">Állapot</th>
            </tr></thead>
            <tbody>{visibleDestinations.map((d) => (
              <tr key={d.source_id} className="border-b last:border-0">
                <td className="py-2 pr-3">
                  <p className="font-medium">{d.publisher_name}</p>
                  <p className="max-w-[280px] truncate text-xs text-muted-foreground">{d.endpoint_url}</p>
                </td>
                <td className="py-2 pr-3">{d.city || '—'}</td>
                <td className="py-2 pr-3">{d.scrape_priority}</td>
                <td className="py-2 pr-3">{formatWhen(d.last_run_at)}</td>
                <td className="py-2 pr-3">{d.last_events} · {d.total_events}</td>
                <td className="py-2">
                  <Badge variant={d.total_events > 0 ? 'default' : d.last_run_at ? 'secondary' : 'outline'}>
                    {d.total_events > 0 ? 'termel' : d.last_run_at ? 'nincs találat' : 'várakozik'}
                  </Badge>
                </td>
              </tr>
            ))}</tbody>
          </table>
          {destinations.length > 30 && (
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Kevesebb mutatása' : `Mind a ${destinations.length} forrás mutatása`}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminScraper;
