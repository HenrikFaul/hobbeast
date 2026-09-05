import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Play, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AdminScraperSchedules } from '@/components/admin/AdminScraperSchedules';
import { AdminSourceSubmissions } from '@/components/admin/AdminSourceSubmissions';
import { SourceInspector } from '@/features/sources/SourceInspector';
import { AdminSourceDiscovery } from '@/components/admin/AdminSourceDiscovery';
import { AdminCrawlerControl } from '@/components/admin/AdminCrawlerControl';
import { AdminEmailSources } from '@/components/admin/AdminEmailSources';
import { ScraperSourcesTable } from '@/components/admin/ScraperSourcesTable';
import type { ScraperDestination } from '@/components/admin/scraperSources';

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
  active_events: number;
  expired_events: number;
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

interface ProgressRun {
  source_id: string;
  publisher_name: string;
  run_started_at: string;
  discovered: number;
  inserted: number;
  updated: number;
  duplicates: number;
  skipped: number;
  status: string;
  http_status: number | null;
}

const numberFormat = new Intl.NumberFormat('hu-HU');

export function AdminScraper() {
  const [stats, setStats] = useState<ScraperStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dispatching, setDispatching] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressRun[]>([]);
  const pollTimer = useRef<number | null>(null);
  // Bumped after a source is added or approved so the dependent panels reload.
  const [sourcesVersion, setSourcesVersion] = useState(0);

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

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const pollProgress = useCallback(async (since: string) => {
    const { data } = await supabase.functions.invoke('scraper-control', {
      body: { action: 'status', since },
    });
    if (Array.isArray(data?.runs)) setProgress(data.runs as ProgressRun[]);
  }, []);

  const startRun = async (ids: string[]) => {
    setDispatching(true);
    const { data, error: invokeError } = await supabase.functions.invoke('scraper-control', {
      body: { action: 'run', source_ids: ids },
    });
    setDispatching(false);
    if (invokeError || !data?.dispatched) {
      toast.error('A begyűjtést nem sikerült elindítani.');
      return;
    }
    const startedAt = String(data.started_at || new Date().toISOString());
    setRunStartedAt(startedAt);
    setProgress([]);
    toast.success(ids.length
      ? `Begyűjtés elindítva ${ids.length} kijelölt forrásra.`
      : 'Begyűjtés elindítva (automatikus forrásválasztás).');
    stopPolling();
    pollTimer.current = window.setInterval(() => { void pollProgress(startedAt); }, 10000);
    // A futás legfeljebb ~50 percig tarthat; utána a figyelés leáll magától.
    window.setTimeout(() => { stopPolling(); void load(); }, 55 * 60 * 1000);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Programgyűjtő statisztikák betöltése…</p>;
  if (error) return <p className="text-sm text-destructive">Nem sikerült betölteni: {error}</p>;
  if (!stats) return null;

  const { totals, daily, destinations } = stats;
  const progressTotals = progress.reduce(
    (acc, r) => ({
      discovered: acc.discovered + (r.discovered || 0),
      inserted: acc.inserted + (r.inserted || 0),
      duplicates: acc.duplicates + (r.duplicates || 0),
      sources: acc.sources + 1,
    }),
    { discovered: 0, inserted: 0, duplicates: 0, sources: 0 },
  );

  /** Select or clear a whole set at once — used by the table's filtered "select all". */
  const selectMany = (ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Programgyűjtő</h2>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1 h-4 w-4" /> Frissítés
        </Button>
      </div>

      <AdminCrawlerControl />

      <AdminEmailSources />

      <AdminSourceDiscovery />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Aktív program (mai naptól)', totals.active_events],
          ['Lejárt program', totals.expired_events],
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

      <Card className="border-primary/25">
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>Kézi begyűjtés</span>
            <span className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelected(new Set(destinations.map((d) => d.source_id)))}>
                Összes kijelölése
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                Kijelölés törlése
              </Button>
              <Button size="sm" disabled={dispatching} onClick={() => void startRun([...selected])}>
                {dispatching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
                {selected.size ? `Kijelöltek begyűjtése (${selected.size})` : 'Begyűjtés indítása'}
              </Button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Kijelölés nélkül az automatikus forgó (a legrégebben futott 40 forrás) indul. A futás a felhőben zajlik;
            az eredmények forrásonként, menet közben jelennek meg alább.
          </p>
          {runStartedAt && (
            <div className="rounded-xl border border-border/70 bg-card/60 p-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                {pollTimer.current !== null && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                Folyamat: {progressTotals.sources} forrás kész · {numberFormat.format(progressTotals.discovered)} találat
                → {numberFormat.format(progressTotals.inserted)} importálva
                ({numberFormat.format(progressTotals.duplicates)} duplikátum kiszűrve)
              </p>
              {progress.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <tbody>{progress.map((r) => (
                      <tr key={`${r.source_id}:${r.run_started_at}`} className="border-b border-border/40 last:border-0">
                        <td className="py-1 pr-2 font-medium">{r.publisher_name}</td>
                        <td className="py-1 pr-2">{r.discovered} talált</td>
                        <td className="py-1 pr-2 text-emerald-600">+{r.inserted} importált</td>
                        <td className="py-1 pr-2">{r.duplicates} dupla</td>
                        <td className="py-1">
                          <Badge variant={r.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px]">{r.status}</Badge>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              {progress.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  A felhő-futás indul (telepítés ~1-2 perc), az első forrás-eredmények hamarosan érkeznek…
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <SourceInspector mode="admin" onSaved={() => { setSourcesVersion((v) => v + 1); void load(); }} />

      <AdminSourceSubmissions refreshToken={sourcesVersion} />

      <AdminScraperSchedules selectedSourceIds={[...selected]} />

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
          <CardTitle className="text-sm">Források (destinations) · prioritás szerint</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <ScraperSourcesTable
            destinations={destinations}
            selected={selected}
            onToggle={toggleSelected}
            onSelectMany={selectMany}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminScraper;
