import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sparkles, Eye, Settings2, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { AdminAiEventProposals } from './AdminAiEventProposals';

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
  hubs: Array<{
    hobby: string;
    city: string | null;
    members: number;
    real_members: number;
    simulated_members: number;
    unknown_origin_members: number;
    qualification_reasons: string[];
  }>;
  config: AutoEventConfig;
}

export function AdminAutoEvents() {
  const [config, setConfig] = useState<AutoEventConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);

  const [minMembers, setMinMembers] = useState(5);
  const [maxDistanceKm, setMaxDistanceKm] = useState(30);
  const [frequencyDays, setFrequencyDays] = useState(7);
  const [maxEventsPerRun, setMaxEventsPerRun] = useState(10);

  const applyConfig = useCallback((cfg: AutoEventConfig) => {
    setConfig(cfg);
    setMinMembers(cfg.min_members);
    setMaxDistanceKm(cfg.max_distance_km);
    setFrequencyDays(cfg.frequency_days);
    setMaxEventsPerRun(cfg.max_events_per_run);
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-hub-events', {
        body: { action: 'get_config' },
      });
      if (error) throw error;
      const cfg = data?.config as AutoEventConfig | undefined;
      if (!cfg) throw new Error('A konfiguráció nem érkezett meg az admin végpontról.');
      applyConfig(cfg);
    } catch (err) {
      console.error('Failed to load auto-event config:', err);
      toast.error('Nem sikerült betölteni az automatikus eseménygeneráló konfigurációt.');
    }
    setLoading(false);
  }, [applyConfig]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('generate-hub-events', {
        body: {
          action: 'save_config',
          config: {
            enabled: false,
          min_members: minMembers,
          max_distance_km: maxDistanceKm,
          frequency_days: frequencyDays,
          max_events_per_run: maxEventsPerRun,
          },
        },
      });
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
      const { data, error } = await supabase.functions.invoke('generate-hub-events', {
        body: { action: 'preview' },
      });
      if (error) throw error;
      setPreview(data as PreviewData);
    } catch (err) {
      toast.error(`Előnézet sikertelen: ${err instanceof Error ? err.message : 'Hiba'}`);
    }
    setPreviewing(false);
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
    <div className="space-y-6">
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
              <Label htmlFor="auto-event-enabled" className="text-sm">Aktiválás blokkolva</Label>
              <Switch id="auto-event-enabled" checked={false} disabled />
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
              <p className="text-xs text-muted-foreground">Hány valódi (nem generált) érdeklődő kell legalább egy hubban az eseménygeneráláshoz.</p>
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
            <Button disabled className="rounded-xl gap-2" title="Tartós idempotencia és szerveroldali job lock szükséges">
              <AlertTriangle className="h-4 w-4" /> Eseményírás blokkolva
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
                    <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-xs">{h.real_members} valódi</Badge>
                      {h.simulated_members > 0 && (
                        <Badge variant="secondary" className="text-xs">{h.simulated_members} generált kizárva</Badge>
                      )}
                      <span className="font-medium">{h.hobby}</span>
                      <span className="text-muted-foreground">— {h.city || 'Ismeretlen város'}</span>
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
            <Clock className="h-4 w-4 text-primary" /> Automatikus ütemezés — nincs hitelesítve
          </div>
          <p className="text-xs text-muted-foreground">
            A konfiguráció megőrződik, de a repóban nincs bizonyított, szerveroldali aláírással és replay-védelemmel ellátott scheduler.
            Hitelesített admin jelenleg csak előnézetet indíthat; eseményírás nem engedélyezett.
          </p>
          <Badge variant="secondary">HOLD — preview only</Badge>
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
    <AdminAiEventProposals />
    </div>
  );
}
