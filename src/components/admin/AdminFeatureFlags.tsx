import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Flag, Loader2, RefreshCw, Save, ShieldOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { createCorrelationId } from '@/lib/observability';
import { toast } from 'sonner';

interface FeatureFlagRow {
  key: string;
  enabled: boolean;
  rollout_percentage: number;
  cohorts: string[];
  eligibility_rule: Record<string, unknown>;
  owner: string;
  expires_at: string;
  description: string;
  updated_at: string;
}

function localDateTime(value: string) {
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function AdminFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlagRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [rollout, setRollout] = useState('0');
  const [cohorts, setCohorts] = useState('');
  const [eligibility, setEligibility] = useState('{}');
  const [owner, setOwner] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [reason, setReason] = useState('');
  const [overrideUserId, setOverrideUserId] = useState('');
  const [overrideEnabled, setOverrideEnabled] = useState(true);
  const [overrideExpiresAt, setOverrideExpiresAt] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('feature_flags')
      .select('key,enabled,rollout_percentage,cohorts,eligibility_rule,owner,expires_at,description,updated_at')
      .order('key');
    if (queryError) {
      setFlags([]);
      setError('A feature flag registry nem olvasható. Ellenőrizd a Prompt 15 migrációt.');
    } else {
      setFlags((data || []) as FeatureFlagRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => flags.find((flag) => flag.key === selectedKey) || null, [flags, selectedKey]);

  const edit = (flag: FeatureFlagRow) => {
    setSelectedKey(flag.key);
    setEnabled(flag.enabled);
    setRollout(String(flag.rollout_percentage));
    setCohorts(flag.cohorts.join(', '));
    setEligibility(JSON.stringify(flag.eligibility_rule || {}, null, 2));
    setOwner(flag.owner);
    setExpiresAt(localDateTime(flag.expires_at));
    setReason('');
    setOverrideExpiresAt(localDateTime(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()));
    setOverrideReason('');
  };

  const save = async (killSwitch = false) => {
    if (!selected) return;
    const percentage = killSwitch ? 0 : Number(rollout);
    let eligibilityRule: Record<string, unknown>;
    try {
      const parsed = JSON.parse(eligibility);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
      eligibilityRule = parsed as Record<string, unknown>;
    } catch {
      toast.error('Az eligibility rule érvényes JSON objektum legyen.');
      return;
    }
    if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100 || owner.trim().length < 3 || !expiresAt || reason.trim().length < 3) {
      toast.error('Adj meg 0–100 rolloutot, ownert, jövőbeli lejáratot és audit indokot.');
      return;
    }

    setSaving(true);
    const { error: mutationError } = await supabase.rpc('admin_set_feature_flag', {
      _flag_key: selected.key,
      _enabled: killSwitch ? false : enabled,
      _rollout_percentage: percentage,
      _cohorts: [...new Set(cohorts.split(',').map((value) => value.trim()).filter(Boolean))],
      _eligibility_rule: eligibilityRule,
      _owner: owner.trim(),
      _expires_at: new Date(expiresAt).toISOString(),
      _reason: reason.trim(),
      _correlation_id: createCorrelationId(),
      _idempotency_key: crypto.randomUUID(),
    });
    setSaving(false);
    if (mutationError) {
      toast.error('A feature flag változás nem menthető. Ellenőrizd az admin jogosultságot és a lejáratot.');
      return;
    }
    toast.success(killSwitch ? 'A kill switch auditáltan kikapcsolta a funkciót.' : 'A rollout beállítás auditáltan frissült.');
    await load();
  };

  const saveOverride = async () => {
    if (!selected || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(overrideUserId.trim())
      || !overrideExpiresAt || overrideReason.trim().length < 3) {
      toast.error('Adj meg érvényes user UUID-t, lejáratot és audit indokot.');
      return;
    }
    setSaving(true);
    const { error: overrideError } = await supabase.rpc('admin_set_feature_flag_override', {
      _flag_key: selected.key,
      _user_id: overrideUserId.trim(),
      _enabled: overrideEnabled,
      _expires_at: new Date(overrideExpiresAt).toISOString(),
      _reason: overrideReason.trim(),
      _correlation_id: createCorrelationId(),
      _idempotency_key: crypto.randomUUID(),
    });
    setSaving(false);
    if (overrideError) {
      toast.error('A felhasználói override nem menthető.');
      return;
    }
    toast.success('Az időkorlátos override auditáltan mentve lett.');
    setOverrideUserId('');
    setOverrideReason('');
  };

  return (
    <section aria-labelledby="feature-flags-heading" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="feature-flags-heading" className="flex items-center gap-2 text-xl font-semibold">
            <Flag className="h-5 w-5 text-primary" aria-hidden="true" /> Feature flag control plane
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Az állapot az aktuális Supabase környezethez kötött. Minden változás reasonnel és idempotens audit rekorddal készül.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Frissítés
        </Button>
      </div>

      {error && <Alert variant="destructive" role="alert"><AlertTriangle className="h-4 w-4" aria-hidden="true" /><AlertTitle>Registry nem elérhető</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

      {loading ? (
        <div className="flex min-h-40 items-center justify-center gap-2 text-muted-foreground" role="status" aria-live="polite">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Feature flag registry betöltése…
        </div>
      ) : !error && flags.length === 0 ? (
        <Card><CardContent className="flex min-h-40 items-center justify-center text-center text-sm text-muted-foreground">Nincs regisztrált feature flag.</CardContent></Card>
      ) : !error && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
          <div className="space-y-2">
            {flags.map((flag) => (
              <button
                key={flag.key}
                type="button"
                onClick={() => edit(flag)}
                aria-pressed={selectedKey === flag.key}
                className={`w-full rounded-xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedKey === flag.key ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-medium">{flag.key}</span>
                  <Badge variant={flag.enabled ? 'default' : 'secondary'}>{flag.enabled ? `${flag.rollout_percentage}%` : 'OFF'}</Badge>
                  {new Date(flag.expires_at) <= new Date() && <Badge variant="destructive">lejárt</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{flag.description}</p>
                <p className="mt-2 text-xs text-muted-foreground">Owner: {flag.owner} · expiry: {new Date(flag.expires_at).toLocaleString('hu-HU')}</p>
              </button>
            ))}
          </div>

          <Card className="h-fit lg:sticky lg:top-24">
            <CardHeader><CardTitle className="text-base">{selected ? selected.key : 'Válassz flaget'}</CardTitle></CardHeader>
            <CardContent>
              {!selected ? <p className="text-sm text-muted-foreground">A registryből válassz szerkesztendő funkciót.</p> : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div><Label htmlFor="flag-enabled">Engedélyezve</Label><p className="text-xs text-muted-foreground">A rollout csak bekapcsolt állapotban értékelhető true-ra.</p></div>
                    <Switch id="flag-enabled" checked={enabled} onCheckedChange={setEnabled} />
                  </div>
                  <div className="space-y-1"><Label htmlFor="flag-rollout">Rollout százalék</Label><Input id="flag-rollout" type="number" min={0} max={100} value={rollout} onChange={(event) => setRollout(event.target.value)} /></div>
                  <div className="space-y-1"><Label htmlFor="flag-cohorts">Cohortok, vesszővel</Label><Input id="flag-cohorts" value={cohorts} onChange={(event) => setCohorts(event.target.value)} placeholder="internal, beta-city" /></div>
                  <div className="space-y-1"><Label htmlFor="flag-owner">Operational owner</Label><Input id="flag-owner" value={owner} onChange={(event) => setOwner(event.target.value.slice(0, 100))} maxLength={100} /></div>
                  <div className="space-y-1"><Label htmlFor="flag-expiry">Kötelező cleanup/expiry</Label><Input id="flag-expiry" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div>
                  <div className="space-y-1"><Label htmlFor="flag-eligibility">Eligibility rule (JSON)</Label><Textarea id="flag-eligibility" value={eligibility} onChange={(event) => setEligibility(event.target.value.slice(0, 4000))} rows={5} maxLength={4000} className="font-mono text-xs" /><p className="text-xs text-muted-foreground">A jelenlegi evaluator a cohortot és az auditált user override-ot támogatja; nem üres, ismeretlen JSON rule fail-closed.</p></div>
                  <div className="space-y-1"><Label htmlFor="flag-reason">Audit indok</Label><Textarea id="flag-reason" value={reason} onChange={(event) => setReason(event.target.value.slice(0, 500))} maxLength={500} placeholder="Miért és milyen exit/rollback feltétellel változik?" /></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button type="button" onClick={() => void save(false)} disabled={saving}><Save className="mr-2 h-4 w-4" aria-hidden="true" /> Mentés</Button>
                    <Button type="button" variant="destructive" onClick={() => void save(true)} disabled={saving || reason.trim().length < 3}><ShieldOff className="mr-2 h-4 w-4" aria-hidden="true" /> Kill switch</Button>
                  </div>
                  <div className="space-y-3 border-t pt-4">
                    <div><p className="text-sm font-medium">Időkorlátos user override</p><p className="text-xs text-muted-foreground">Belső/béta ellenőrzéshez; minden mentés auditált és kötelezően lejár.</p></div>
                    <div className="space-y-1"><Label htmlFor="flag-override-user">User UUID</Label><Input id="flag-override-user" value={overrideUserId} onChange={(event) => setOverrideUserId(event.target.value)} /></div>
                    <div className="flex items-center justify-between rounded-lg border p-3"><Label htmlFor="flag-override-enabled">Override érték</Label><Switch id="flag-override-enabled" checked={overrideEnabled} onCheckedChange={setOverrideEnabled} /></div>
                    <div className="space-y-1"><Label htmlFor="flag-override-expiry">Override lejárat</Label><Input id="flag-override-expiry" type="datetime-local" value={overrideExpiresAt} onChange={(event) => setOverrideExpiresAt(event.target.value)} /></div>
                    <div className="space-y-1"><Label htmlFor="flag-override-reason">Override indok</Label><Textarea id="flag-override-reason" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value.slice(0, 500))} maxLength={500} /></div>
                    <Button type="button" variant="outline" className="w-full" onClick={() => void saveOverride()} disabled={saving}>Override mentése</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
