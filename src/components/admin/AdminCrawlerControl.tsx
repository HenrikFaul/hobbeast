import { useCallback, useEffect, useState } from 'react';
import { Loader2, Play, RefreshCw, Save, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  arrayToLines,
  getCrawlConfig,
  linesToArray,
  listCrawlRuns,
  runCrawlNow,
  updateCrawlConfig,
  type CrawlConfig,
  type CrawlRun,
} from '@/features/admin/crawlControl';

/**
 * The operator's crawler control room.
 *
 * The crawl used to be governed by hardcoded worker flags; this puts every knob
 * on screen and live-editable — depth, page budget, per-host cap, politeness
 * delay, which countries to seed from, strict mode, the exclude lists — so the
 * operator can turn the budget up to 100, watch a run, and pull it back to 50
 * without touching code. Nothing about the country is baked in.
 *
 * It stays a control panel, not a wall of switches: the numbers sit in one
 * compact grid, the lists fold below, and the run history reads at a glance.
 */

interface NumberFieldProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function NumberField({ label, hint, value, min, max, onChange }: NumberFieldProps) {
  return (
    <div>
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, next)));
        }}
        className="mt-1"
      />
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

function runTone(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'succeeded') return 'default';
  if (status === 'failed') return 'destructive';
  return 'secondary';
}

export function AdminCrawlerControl() {
  const [config, setConfig] = useState<CrawlConfig | null>(null);
  const [runs, setRuns] = useState<CrawlRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  // The list fields are edited as text and parsed on save.
  const [countries, setCountries] = useState('');
  const [excludePrefixes, setExcludePrefixes] = useState('');
  const [excludeSubstrings, setExcludeSubstrings] = useState('');
  const [allowedHosts, setAllowedHosts] = useState('');
  const [extraSeeds, setExtraSeeds] = useState('');

  const hydrate = useCallback((next: CrawlConfig) => {
    setConfig(next);
    setCountries(next.allowed_countries.join(', '));
    setExcludePrefixes(arrayToLines(next.exclude_url_prefixes));
    setExcludeSubstrings(arrayToLines(next.exclude_substrings));
    setAllowedHosts(arrayToLines(next.extra_allowed_hosts));
    setExtraSeeds(arrayToLines(next.extra_seeds));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [cfg, history] = await Promise.all([getCrawlConfig(), listCrawlRuns(15)]);
    if (cfg) hydrate(cfg);
    setRuns(history);
    setLoading(false);
  }, [hydrate]);

  useEffect(() => { void load(); }, [load]);

  const patch = (fields: Partial<CrawlConfig>) => setConfig((current) => (current ? { ...current, ...fields } : current));

  const save = async () => {
    if (!config) return;
    setSaving(true);
    const result = await updateCrawlConfig({
      ...config,
      allowed_countries: countries.split(/[,\s]+/).map((c) => c.trim().toUpperCase()).filter(Boolean),
      exclude_url_prefixes: linesToArray(excludePrefixes),
      exclude_substrings: linesToArray(excludeSubstrings),
      extra_allowed_hosts: linesToArray(allowedHosts),
      extra_seeds: linesToArray(extraSeeds),
    });
    setSaving(false);
    if (result.ok === false) {
      toast.error(result.message);
      return;
    }
    hydrate(result.config);
    toast.success('Crawler beállítások mentve.');
  };

  const startNow = async () => {
    setDispatching(true);
    const result = await runCrawlNow(config?.max_pages_per_run);
    setDispatching(false);
    if (result.ok === false) {
      toast.error(result.message);
      return;
    }
    toast.success('Crawl elindítva — az eredmény pár perc múlva jelenik meg a futásoknál.');
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Beállítások betöltése…
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          A crawler beállításai nem érhetők el. Ehhez providers.manage jogosultság kell.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="h-5 w-5 text-primary" aria-hidden="true" /> Forrásfelderítő crawler
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          A crawler a bizonyított forrásokból indulva új programoldalakat keres. Minden
          korlátot itt állítasz — semmi nincs kódba égetve, az országokat is te választod.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-3">
          <label className="flex cursor-pointer items-center gap-3">
            <Switch checked={config.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
            <span>
              <span className="block text-sm font-medium">Ütemezett futás</span>
              <span className="block text-xs text-muted-foreground">
                Ha be van kapcsolva, a gyűjtéssel együtt fut. Kikapcsolva csak kézzel indítható.
              </span>
            </span>
          </label>
          <Button variant="outline" size="sm" disabled={dispatching} onClick={() => void startNow()}>
            {dispatching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
            Crawl indítása most
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="Mélység" hint="Hány ugrás a seedtől (0–6)" value={config.max_depth} min={0} max={6} onChange={(v) => patch({ max_depth: v })} />
          <NumberField label="Oldal / futás" hint="Összes letöltött oldal felső határa" value={config.max_pages_per_run} min={1} max={5000} onChange={(v) => patch({ max_pages_per_run: v })} />
          <NumberField label="Oldal / host" hint="Egy oldalról legfeljebb ennyi" value={config.per_host_cap} min={1} max={500} onChange={(v) => patch({ per_host_cap: v })} />
          <NumberField label="Késleltetés (ms)" hint="Két lekérés között, hostonként" value={config.delay_ms} min={0} max={60000} onChange={(v) => patch({ delay_ms: v })} />
          <NumberField label="Auto-felvétel pontszám" hint="Efölött magától a gyűjtőbe kerül (101 = soha)" value={config.auto_promote_min_score} min={0} max={101} onChange={(v) => patch({ auto_promote_min_score: v })} />
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Országok</Label>
            <Input
              value={countries}
              onChange={(event) => setCountries(event.target.value)}
              placeholder="HU, AT, SK, CZ"
              className="mt-1"
            />
            <p className="mt-0.5 text-[11px] text-muted-foreground/80">Mely országok forrásaiból induljon</p>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 p-3">
          <Switch checked={config.strict_mode} onCheckedChange={(v) => patch({ strict_mode: v })} />
          <span>
            <span className="block text-sm font-medium">Szigorú mód</span>
            <span className="block text-xs text-muted-foreground">
              Csak a seed hostokon és az alább engedélyezetteken mozog; minden más kifelé mutató linket kihagy.
            </span>
          </span>
        </label>

        <details className="rounded-xl border border-border/60 p-3">
          <summary className="cursor-pointer text-sm font-medium">Szűrők és extra seedek</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Kizárt URL-előtagok (soronként)</Label>
              <Textarea value={excludePrefixes} onChange={(e) => setExcludePrefixes(e.target.value)} rows={4} className="mt-1 font-mono text-xs" placeholder="https://example.hu/shop" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Kizárt szövegrészek (soronként)</Label>
              <Textarea value={excludeSubstrings} onChange={(e) => setExcludeSubstrings(e.target.value)} rows={4} className="mt-1 font-mono text-xs" placeholder="/kosar&#10;utm_" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Extra engedélyezett hostok (szigorú mód)</Label>
              <Textarea value={allowedHosts} onChange={(e) => setAllowedHosts(e.target.value)} rows={4} className="mt-1 font-mono text-xs" placeholder="partneroldal.hu" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Extra seed URL-ek (soronként)</Label>
              <Textarea value={extraSeeds} onChange={(e) => setExtraSeeds(e.target.value)} rows={4} className="mt-1 font-mono text-xs" placeholder="https://programturizmus.hu/" />
            </div>
          </div>
        </details>

        <div className="flex items-center gap-2">
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Beállítások mentése
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-4 w-4" /> Frissítés
          </Button>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Legutóbbi futások</h3>
          {runs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/70 p-4 text-center text-sm text-muted-foreground">
              Még nem futott a crawler. Indítsd el, vagy kapcsold be az ütemezett futást.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {runs.map((run) => (
                <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs">
                  <span className="flex items-center gap-2">
                    <Badge variant={runTone(run.status)} className="rounded-full">{run.status}</Badge>
                    <span className="text-muted-foreground">{new Date(run.started_at).toLocaleString('hu-HU')}</span>
                    <span className="text-muted-foreground/70">· {run.trigger}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {run.pages_fetched} oldal
                    {run.pages_not_modified > 0 && ` · ${run.pages_not_modified} változatlan`}
                    {' · '}{run.candidates_found} jelölt
                    {run.auto_promoted > 0 && ` · ${run.auto_promoted} felvéve`}
                    {run.near_duplicates_skipped > 0 && ` · ${run.near_duplicates_skipped} dup`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default AdminCrawlerControl;
