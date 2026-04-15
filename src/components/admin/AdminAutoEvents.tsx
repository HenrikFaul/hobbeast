import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sparkles, Eye, Zap, Settings2, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface AutoEventConfig {
  id: string;
  enabled: boolean;
  min_members: number;
  max_distance_km: number;
  frequency_days: number;
  max_events_per_run: number;
  categories_filter: string[] | null;
  last_run_at: string | null;
  last_run_result: {
    generated?: number;
    errors?: number;
    error_details?: string[];
    event_ids?: string[];
  } | null;
}

interface PreviewData {
  qualifying_hubs: number;
  hubs: Array<{ hobby: string; city: string; members: number }>;
  config: AutoEventConfig;
}

export function AdminAutoEvents() {
  const [config, setConfig] = useState<AutoEventConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);

  const [minMembers, setMinMembers] = useState(5);
  const [maxDistanceKm, setMaxDistanceKm] = useState(30);
  const [frequencyDays, setFrequencyDays] = useState(7);
  const [maxEventsPerRun, setMaxEventsPerRun] = useState(10);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    void loadConfig();
  }, []);

  const applyConfig = (cfg: AutoEventConfig) => {
    setConfig(cfg);
    setMinMembers(cfg.min_members);
    setMaxDistanceKm(cfg.max_distance_km);
    setFrequencyDays(cfg.frequency_days);
    setMaxEventsPerRun(cfg.max_events_per_run);
    setEnabled(cfg.enabled);
  };

  const ensureConfig = async () => {
    const { data, error } = await supabase
      .from('auto_event_config')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data as AutoEventConfig;

    const { data: inserted, error: insertError } = await supabase
      .from('auto_event_config')
      .insert({
        enabled: false,
        min_members: 5,
        max_distance_km: 30,
        frequency_days: 7,
        max_events_per_run: 10,
        categories_filter: null,
      })
      .select('*')
      .single();

    if (insertError) throw insertError;
    return inserted as AutoEventConfig;
  };

  const loadConfig = async () => {
    setLoading(true);
    try {
      const cfg = await ensureConfig();
      applyConfig(cfg);
    } catch (err) {
      console.error('Failed to load auto-event config:', err);
      toast.error('Nem sikerült betölteni az automatikus eseménygeneráló konfigurációt.');
    }
    setLoading(false);
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const cfg = config ?? (await ensureConfig());
      const { error } = await supabase
        .from('auto_event_config')
        .update({
          enabled,
          min_members: minMembers,
          max_distance_km: maxDistanceKm,
          frequency_days: frequencyDays,
          max_events_per_run: maxEventsPerRun,
        })
        .eq('id', cfg.id);
      if (error) throw error;
      toast.success('Konfiguráció mentve!');
      await loadConfig();
    } catch (err) {
      toast.error(`Mentés sikertelen: ${err instanceof Error ? err.message : 'Hiba'}`);
    }
    setSaving(false);
  };

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const cfg = config ?? (await ensureConfig());
      const { data, error } = await supabase
        .from('virtual_hubs')
        .select('id, hobby_category, city, member_count, created_at')
        .gte('member_count', cfg.min_members)
        .order('member_count', { ascending: false })
        .limit(Math.max(cfg.max_events_per_run * 2, 20));
      if (error) throw error;

      const hubs = (data || []) as Array<{ hobby_category: string; city: string | null; member_count: number }>;
      setPreview({
        qualifying_hubs: hubs.length,
        hubs: hubs.slice(0, 20).map((h) => ({
          hobby: h.hobby_category,
          city: h.city || 'Országos',
          members: h.member_count,
        })),
        config: cfg,
      });
    } catch (err) {
      toast.error(`Előnézet sikertelen: ${err instanceof Error ? err.message : 'Hiba'}`);
    }
    setPreviewing(false);
  };

  const runGeneration = async () => {
    setGenerating(true);
    try {
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-hub-events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'generate' }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Ismeretlen hiba történt.');
      }

      if (result.generated) {
        toast.success(`${result.generated} esemény sikeresen generálva!`);
      }
      if (result.errors) {
        toast.warning(`${result.errors} hiba történt a generálás során.`);
      }
      await loadConfig();
      setPreview(null);
    } catch (err) {
      toast.error(`Generálás sikertelen: ${err instanceof Error ? err.message : 'Hiba'}`);
    }
    setGenerating(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> AI Automatikus Eseménygeneráló
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          A virtuális hubók alapján az AI automatikusan eseményjavaslatokat generál azokra a tevékenységekre,
          ahol elegendő érdeklődő található egy adott területen. A társas jellegű hobbikat priorizálja.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Config Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Beállítások</span>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="auto-event-enabled" className="text-sm">Aktív</Label>
              <Switch id="auto-event-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs">Minimum tagszám (hub)</Label>
              <Input
                type="number"
                min={2}
                max={100}
                value={minMembers}
                onChange={(e) => setMinMembers(Number(e.target.value))}
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">Hány érdeklődő kell legalább egy hubban az eseménygeneráláshoz.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Max távolság (km)</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={maxDistanceKm}
                onChange={(e) => setMaxDistanceKm(Number(e.target.value))}
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">A tagok maximális távolsága a hub városától.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Gyakoriság (napban)</Label>
              <Input
                type="number"
                min={1}
                max={90}
                value={frequencyDays}
                onChange={(e) => setFrequencyDays(Number(e.target.value))}
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">Milyen gyakran fusson le az automatikus generálás.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Max események / futás</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={maxEventsPerRun}
                onChange={(e) => setMaxEventsPerRun(Number(e.target.value))}
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">Egyszerre maximum ennyi eseményt generáljon.</p>
            </div>
          </div>

          <Button onClick={saveConfig} disabled={saving} className="rounded-xl">
            {saving ? 'Mentés...' : 'Beállítások mentése'}
          </Button>
        </div>

        <Separator />

        {/* Actions */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={runPreview} disabled={previewing} className="rounded-xl gap-2">
              <Eye className="h-4 w-4" /> {previewing ? 'Betöltés...' : 'Előnézet: mely hubokra generálna'}
            </Button>
            <Button onClick={runGeneration} disabled={generating} className="rounded-xl gap-2 bg-gradient-to-r from-primary to-primary/80">
              <Zap className="h-4 w-4" /> {generating ? 'Generálás folyamatban...' : 'Események generálása most'}
            </Button>
          </div>

          {/* Preview Results */}
          {preview && (
            <div className="rounded-2xl border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{preview.qualifying_hubs} megfelelő hub</Badge>
              </div>
              {preview.hubs.length > 0 ? (
                <div className="space-y-1">
                  {preview.hubs.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-xs">{h.members} fő</Badge>
                      <span className="font-medium">{h.hobby}</span>
                      <span className="text-muted-foreground">— {h.city || 'Országos'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nincs megfelelő hub a jelenlegi beállításokkal.</p>
              )}
            </div>
          )}
        </div>

        {/* Cron Info */}
        <div className="rounded-xl border bg-muted/10 p-3 text-sm space-y-1">
          <div className="flex items-center gap-2 font-medium">
            <Clock className="h-4 w-4 text-primary" /> Automatikus ütemezés
          </div>
          <p className="text-xs text-muted-foreground">
            A rendszer minden nap 8:00-kor (UTC) automatikusan futtatja a generálást, ha az „Aktív" kapcsoló be van kapcsolva.
            A generálás csak akkor történik meg, ha vannak megfelelő hubók a beállított feltételek szerint.
          </p>
          <Badge variant={enabled ? 'default' : 'secondary'}>
            {enabled ? '✅ Ütemezés aktív' : '⏸ Ütemezés szüneteltetve'}
          </Badge>
        </div>

        <Separator />

        {/* Last Run Info */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4 text-muted-foreground" /> Utolsó futás
          </div>
          {config?.last_run_at ? (
            <div className="space-y-2 rounded-xl border bg-muted/10 p-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{new Date(config.last_run_at).toLocaleString('hu-HU')}</Badge>
                {config.last_run_result?.generated !== undefined && (
                  <Badge variant="secondary">{config.last_run_result.generated} esemény generálva</Badge>
                )}
                {(config.last_run_result?.errors ?? 0) > 0 && (
                  <Badge variant="destructive">{config.last_run_result!.errors} hiba</Badge>
                )}
              </div>
              {config.last_run_result?.error_details && config.last_run_result.error_details.length > 0 && (
                <div className="text-xs text-destructive space-y-1">
                  <div className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Hibák:</div>
                  {config.last_run_result.error_details.map((e, i) => <div key={i}>• {e}</div>)}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Még nem futott le az automatikus generálás.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
