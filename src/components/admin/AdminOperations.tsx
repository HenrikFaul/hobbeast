import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Inbox, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HOBBEAST_BUILD_INFO, buildReleaseLabel } from '@/lib/buildInfo';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { operationSlaState, type OperationState } from '@/lib/adminControlPlane';

interface CapabilityResponse {
  roles: string[];
  capabilities: string[];
}

interface HealthCount {
  available: boolean;
  count: number | null;
}

interface Overview {
  operations: { open: HealthCount; sla_breached: HealthCount };
  notifications: { dead_letter: HealthCount; failed: HealthCount };
  ai_proposals: { stalled: HealthCount; auto_publish_enabled: false };
  moderation: { open: HealthCount };
  financial: { open: HealthCount };
  providers: { available: boolean; items: Array<{ provider: string; circuit_state: string; consecutive_failures: number }> };
  feature_flags: { available: boolean; items: Array<{ key: string; enabled: boolean; rollout_percentage: number; expires_at: string }> };
  runtime: { core_project_host: string | null; build_version: string | null; migration_version_evidence: string };
}

interface OperationItem {
  id: string;
  source_domain: string;
  source_ref: string;
  title: string;
  safe_summary: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  sla_target_at: string;
  state: OperationState;
  assigned_to: string | null;
  safe_deep_link: string;
  first_seen_at: string;
  last_seen_at: string;
  version: number;
}

interface AuditEntry {
  id: string;
  actor_id: string | null;
  role_snapshot: string[];
  capability_key: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  reason: string;
  outcome: string;
  created_at: string;
}

function countLabel(count: HealthCount) {
  if (!count.available) return 'nem elérhető';
  return String(count.count ?? 0);
}

function severityVariant(severity: OperationItem['severity']) {
  return severity === 'critical' || severity === 'high' ? 'destructive' as const : 'secondary' as const;
}

export function AdminOperations() {
  const { user } = useAuth();
  const [capabilityData, setCapabilityData] = useState<CapabilityResponse | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [items, setItems] = useState<OperationItem[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('Napi operációs triage');
  const [auditReason, setAuditReason] = useState('Operációs audit ellenőrzése');

  const capabilities = useMemo(() => new Set(capabilityData?.capabilities || []), [capabilityData]);

  const invoke = useCallback(async <T,>(body: Record<string, unknown>) => {
    const { data, error: invokeError } = await supabase.functions.invoke('admin-control-plane', { body });
    if (invokeError) throw invokeError;
    return data as T;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [caps, health, queue] = await Promise.all([
        invoke<CapabilityResponse>({ action: 'capabilities' }),
        invoke<{ overview: Overview }>({ action: 'overview' }),
        invoke<{ items: OperationItem[] }>({ action: 'list_operations', limit: 100 }),
      ]);
      setCapabilityData(caps);
      setOverview(health.overview);
      setItems(queue.items);
    } catch (loadError) {
      console.error('Admin operations load failed', loadError);
      setError('Az operációs vezérlősík nem tölthető be. A consumer alkalmazás ettől továbbra is használható.');
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => { void load(); }, [load]);

  const refreshSignals = async () => {
    if (reason.trim().length < 3) return toast.error('Adj legalább 3 karakteres operátori indokot.');
    setWorkingId('refresh');
    try {
      await invoke({
        action: 'refresh_operations', reason: reason.trim(), limit: 500,
        idempotency_key: `ops-refresh:${crypto.randomUUID()}`,
      });
      toast.success('Az operációs jelek frissültek.');
      await load();
    } catch (refreshError) {
      console.error('Operations refresh failed', refreshError);
      toast.error('Az operációs frissítés sikertelen.');
    } finally {
      setWorkingId(null);
    }
  };

  const transition = async (item: OperationItem, nextState: OperationState) => {
    if (reason.trim().length < 3) return toast.error('Adj legalább 3 karakteres operátori indokot.');
    setWorkingId(item.id);
    try {
      await invoke({
        action: 'transition_operation', item_id: item.id, expected_version: item.version,
        next_state: nextState, assigned_to: nextState === 'acknowledged' ? user?.id : item.assigned_to,
        reason: reason.trim(), idempotency_key: `ops-transition:${item.id}:${item.version}:${crypto.randomUUID()}`,
      });
      toast.success('Az operációs tétel állapota frissült.');
      await load();
    } catch (transitionError) {
      console.error('Operations transition failed', transitionError);
      toast.error('A tétel időközben változott vagy az átmenet nem engedélyezett.');
    } finally {
      setWorkingId(null);
    }
  };

  const loadAudit = async () => {
    if (auditReason.trim().length < 3) return toast.error('Az audit megtekintéséhez indok szükséges.');
    setWorkingId('audit');
    try {
      const response = await invoke<{ entries: AuditEntry[] }>({ action: 'list_audit', reason: auditReason.trim(), limit: 100 });
      setAuditEntries(response.entries);
    } catch (auditError) {
      console.error('Audit load failed', auditError);
      toast.error('Az auditnapló nem tölthető be.');
    } finally {
      setWorkingId(null);
    }
  };

  if (loading) {
    return <div className="space-y-4" aria-busy="true"><Skeleton className="h-28 w-full" /><Skeleton className="h-72 w-full" /></div>;
  }

  if (error) {
    return (
      <Card role="alert"><CardContent className="py-8 text-center space-y-4">
        <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
        <p>{error}</p><Button variant="outline" onClick={() => void load()}>Újrapróbálás</Button>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="font-display flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Operátori hozzáférés</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">{(capabilityData?.roles || []).map((role) => <Badge key={role}>{role}</Badge>)}</div>
          <p className="text-xs text-muted-foreground">{capabilities.size} capability aktív. Minden új privileged művelet szerveroldali ellenőrzést és auditot kér.</p>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Áttekintés</TabsTrigger>
          <TabsTrigger value="inbox">Operációs inbox</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Nyitott operáció', overview?.operations.open],
              ['SLA túllépés', overview?.operations.sla_breached],
              ['Notification dead letter', overview?.notifications.dead_letter],
              ['Elakadt AI proposal', overview?.ai_proposals.stalled],
              ['Nyitott moderáció', overview?.moderation.open],
              ['Pénzügyi kivétel', overview?.financial.open],
            ].map(([label, value]) => (
              <Card key={String(label)}><CardContent className="pt-5"><p className="text-xs text-muted-foreground">{String(label)}</p><p className="text-2xl font-bold mt-1">{countLabel(value as HealthCount)}</p></CardContent></Card>
            ))}
          </div>
          <Card><CardHeader><CardTitle className="text-base">Provider állapot</CardTitle></CardHeader><CardContent>
            {overview?.providers.available ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{overview.providers.items.map((provider) => (
                <div key={provider.provider} className="rounded-xl border p-3 flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{provider.provider}</span>
                  <Badge variant={provider.circuit_state === 'closed' ? 'secondary' : 'destructive'}>{provider.circuit_state} · {provider.consecutive_failures}</Badge>
                </div>
              ))}</div>
            ) : <p className="text-sm text-muted-foreground">Provider health séma nem elérhető.</p>}
          </CardContent></Card>
          <Card><CardContent className="pt-5 text-xs text-muted-foreground space-y-1">
            <p>Core projekt: <span className="font-mono">{overview?.runtime.core_project_host || 'nem igazolható'}</span></p>
            <p>Client build: {buildReleaseLabel()} · {new Date(HOBBEAST_BUILD_INFO.timestamp).toLocaleString('hu-HU')}</p>
            <p>Edge build verzió: {overview?.runtime.build_version || 'runtime env-ben nincs publikálva'}</p>
            <p>Migration verzió: {overview?.runtime.migration_version_evidence}</p>
            <p>AI automatikus publikálás: <Badge variant="secondary">kikapcsolva</Badge></p>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="inbox" className="space-y-4 mt-4">
          <Card><CardContent className="pt-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2"><Label htmlFor="operations-reason">Operátori indok</Label><Input id="operations-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} /></div>
            <Button variant="outline" onClick={() => void refreshSignals()} disabled={workingId === 'refresh' || !capabilities.has('operations.resolve')}><RefreshCw className="h-4 w-4 mr-2" />Jelek frissítése</Button>
          </CardContent></Card>
          {items.length === 0 ? (
            <Card><CardContent className="py-10 text-center"><Inbox className="h-8 w-8 mx-auto text-muted-foreground mb-2" /><p>Nincs nyitott operációs tétel.</p></CardContent></Card>
          ) : items.map((item) => {
            const sla = operationSlaState(item.sla_target_at, new Date().toISOString());
            return (
              <Card key={item.id}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><div className="flex flex-wrap gap-2 mb-1"><Badge variant={severityVariant(item.severity)}>{item.severity}</Badge><Badge variant="outline">{item.source_domain}</Badge><Badge variant={sla === 'breached' ? 'destructive' : 'secondary'}>{sla}</Badge></div><h3 className="font-semibold">{item.title}</h3><p className="text-sm text-muted-foreground mt-1">{item.safe_summary}</p></div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{new Date(item.sla_target_at).toLocaleString('hu-HU')}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.state === 'open' && <Button size="sm" variant="outline" disabled={workingId === item.id} onClick={() => void transition(item, 'acknowledged')}>Átveszem</Button>}
                    {['open', 'acknowledged', 'blocked'].includes(item.state) && <Button size="sm" variant="outline" disabled={workingId === item.id} onClick={() => void transition(item, 'in_progress')}>Folyamatban</Button>}
                    {['acknowledged', 'in_progress', 'blocked'].includes(item.state) && capabilities.has('operations.resolve') && <Button size="sm" disabled={workingId === item.id} onClick={() => void transition(item, 'resolved')}><CheckCircle2 className="h-4 w-4 mr-1" />Megoldva</Button>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="audit" className="space-y-4 mt-4">
          <Card><CardContent className="pt-5 space-y-3"><Label htmlFor="audit-reason">Hozzáférés indoka</Label><Textarea id="audit-reason" value={auditReason} onChange={(event) => setAuditReason(event.target.value)} maxLength={1000} /><Button onClick={() => void loadAudit()} disabled={workingId === 'audit' || !capabilities.has('audit.view')}>Audit betöltése</Button></CardContent></Card>
          {auditEntries.map((entry) => (
            <Card key={entry.id}><CardContent className="pt-5 text-sm space-y-1"><div className="flex flex-wrap gap-2"><Badge>{entry.outcome}</Badge><Badge variant="outline">{entry.capability_key || 'n/a'}</Badge><span className="font-medium">{entry.action}</span></div><p>{entry.target_type}{entry.target_id ? ` · ${entry.target_id}` : ''}</p><p className="text-muted-foreground">{entry.reason}</p><p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString('hu-HU')} · {entry.role_snapshot.join(', ')}</p></CardContent></Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
