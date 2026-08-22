import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Scale, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { createCorrelationId } from '@/lib/observability';
import { SAFETY_REASON_LABELS, type SafetyReasonCode } from '@/lib/trustSafety';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

type CaseStatus = 'received' | 'triaged' | 'investigating' | 'actioned' | 'appealed' | 'closed';
type Severity = 'low' | 'medium' | 'high' | 'critical';

interface ModerationQueueCase {
  id: string;
  report_id: string;
  status: CaseStatus;
  severity: Severity;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
  report: {
    context_type: string;
    target_ref: string;
    reported_user_id: string | null;
    category: SafetyReasonCode;
    details: string | null;
    source_surface: string;
  } | null;
  notes: Array<{
    id: string;
    note: string;
    evidence_refs: string[];
    created_at: string;
  }>;
  actions: Array<{
    id: string;
    action_type: string;
    policy_reason: string;
    evidence_refs: string[];
    starts_at: string;
    expires_at: string | null;
    appeals: Array<{
      id: string;
      statement: string;
      status: 'received' | 'reviewing' | 'upheld' | 'modified' | 'overturned';
      resolution_note: string | null;
      submitted_at: string;
      resolved_at: string | null;
    }>;
  }>;
}

const NEXT_STATUS: Record<CaseStatus, readonly CaseStatus[]> = {
  received: ['triaged', 'closed'],
  triaged: ['investigating', 'actioned', 'closed'],
  investigating: ['actioned', 'closed'],
  actioned: ['appealed', 'closed'],
  appealed: ['investigating', 'actioned', 'closed'],
  closed: [],
};

const severityVariant: Record<Severity, 'secondary' | 'outline' | 'default' | 'destructive'> = {
  low: 'secondary',
  medium: 'outline',
  high: 'default',
  critical: 'destructive',
};

async function invokeModeration(body: Record<string, unknown>) {
  const correlationId = createCorrelationId();
  return supabase.functions.invoke('trust-safety', {
    body,
    headers: {
      'X-Correlation-ID': correlationId,
      'Idempotency-Key': createCorrelationId(),
    },
  });
}

export function AdminModeration() {
  const { user } = useAuth();
  const [cases, setCases] = useState<ModerationQueueCase[]>([]);
  const [statusFilter, setStatusFilter] = useState('open');
  const [reviewerRole, setReviewerRole] = useState<'admin' | 'moderator' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<CaseStatus | ''>('');
  const [note, setNote] = useState('');
  const [actionType, setActionType] = useState('warning');
  const [policyReason, setPolicyReason] = useState('');
  const [evidenceRefs, setEvidenceRefs] = useState('');
  const [durationDays, setDurationDays] = useState('7');
  const [permanentConfirmed, setPermanentConfirmed] = useState(false);
  const [appealResolutionNote, setAppealResolutionNote] = useState('');
  const [mutating, setMutating] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    const requestedStatus = statusFilter === 'open' ? 'all' : statusFilter;
    const { data, error: invokeError } = await invokeModeration({ action: 'admin_queue', status: requestedStatus });
    if (invokeError || !data?.ok) {
      setError('A moderációs sor most nem tölthető be. Ellenőrizd az Edge Function és a migráció állapotát.');
      setCases([]);
    } else {
      const loaded = (data.cases || []) as ModerationQueueCase[];
      setCases(statusFilter === 'open' ? loaded.filter((item) => item.status !== 'closed') : loaded);
      setReviewerRole(data.reviewerRole === 'admin' ? 'admin' : 'moderator');
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const selected = useMemo(() => cases.find((item) => item.id === selectedId) || null, [cases, selectedId]);

  const resetEditor = (caseId: string) => {
    setSelectedId(caseId);
    setNextStatus('');
    setNote('');
    setActionType('warning');
    setPolicyReason('');
    setEvidenceRefs('');
    setDurationDays('7');
    setPermanentConfirmed(false);
    setAppealResolutionNote('');
  };

  const claimCase = async () => {
    if (!selected) return;
    setMutating(true);
    const { data, error: invokeError } = await invokeModeration({ action: 'claim_case', caseId: selected.id });
    setMutating(false);
    if (invokeError || !data?.ok) {
      toast.error('Az ügy hozzárendelése sikertelen.');
      return;
    }
    toast.success('Az ügy auditáltan hozzád lett rendelve.');
    await loadQueue();
  };

  const transitionCase = async () => {
    if (!selected || !nextStatus) return;
    setMutating(true);
    const { data, error: invokeError } = await invokeModeration({
      action: 'transition_case',
      caseId: selected.id,
      nextStatus,
      note: note.trim() || null,
    });
    setMutating(false);
    if (invokeError || !data?.ok) {
      toast.error('A státuszváltás sikertelen.');
      return;
    }
    toast.success('A moderációs ügy státusza frissült és auditálva lett.');
    await loadQueue();
  };

  const applyAction = async () => {
    if (!selected || policyReason.trim().length < 3) return;
    if (actionType === 'permanent_ban' && (!permanentConfirmed || reviewerRole !== 'admin')) return;
    const needsDuration = actionType === 'temporary_suspension' || actionType === 'feature_restriction';
    const parsedDuration = needsDuration ? Number(durationDays) : null;
    if (needsDuration && (!Number.isInteger(parsedDuration) || Number(parsedDuration) < 1 || Number(parsedDuration) > 365)) {
      toast.error('Az időtartam 1 és 365 nap közötti egész szám legyen.');
      return;
    }
    setMutating(true);
    const { data, error: invokeError } = await invokeModeration({
      action: 'apply_action',
      caseId: selected.id,
      actionType,
      policyReason: policyReason.trim(),
      durationDays: parsedDuration,
      evidenceRefs: [...new Set(evidenceRefs.split(/[\r\n,]+/).map((value) => value.trim()).filter(Boolean))].slice(0, 20),
      featureKey: actionType === 'feature_restriction' ? 'community_interaction' : null,
    });
    setMutating(false);
    if (invokeError || !data?.ok) {
      toast.error('Az intézkedés nem alkalmazható. Ellenőrizd a jogosultságot és az ügy állapotát.');
      return;
    }
    toast.success('Az intézkedés auditáltan rögzítve lett.');
    await loadQueue();
  };

  const openAppeal = selected?.actions.flatMap((action) => action.appeals)
    .find((appeal) => appeal.status === 'received' || appeal.status === 'reviewing') || null;

  const resolveAppeal = async (resolution: 'upheld' | 'modified' | 'overturned') => {
    if (!openAppeal || appealResolutionNote.trim().length < 3) return;
    setMutating(true);
    const { data, error: invokeError } = await invokeModeration({
      action: 'resolve_appeal',
      appealId: openAppeal.id,
      resolution,
      resolutionNote: appealResolutionNote.trim(),
    });
    setMutating(false);
    if (invokeError || !data?.ok) {
      toast.error('A fellebbezés döntése nem rögzíthető.');
      return;
    }
    toast.success('A fellebbezési döntés és az enforcement változása auditálva lett.');
    setAppealResolutionNote('');
    await loadQueue();
  };

  return (
    <section aria-labelledby="moderation-heading" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="moderation-heading" className="flex items-center gap-2 text-xl font-semibold">
            <ShieldAlert className="h-5 w-5 text-primary" aria-hidden="true" /> Moderációs ügyek
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Reporter-private queue. Automatizált jel csak review-t indíthat; végleges tiltást kizárólag admin adhat.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44" aria-label="Moderációs státusz szűrő">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Nyitott ügyek</SelectItem>
              <SelectItem value="received">Beérkezett</SelectItem>
              <SelectItem value="triaged">Triázsolt</SelectItem>
              <SelectItem value="investigating">Vizsgálat alatt</SelectItem>
              <SelectItem value="actioned">Intézkedve</SelectItem>
              <SelectItem value="appealed">Fellebbezett</SelectItem>
              <SelectItem value="closed">Lezárt</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="icon" onClick={() => void loadQueue()} disabled={loading} aria-label="Lista frissítése">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Moderáció nem elérhető</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div role="status" aria-live="polite" className="flex min-h-40 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Moderációs sor betöltése…
        </div>
      ) : !error && cases.length === 0 ? (
        <Card><CardContent className="flex min-h-40 flex-col items-center justify-center text-center">
          <CheckCircle2 className="mb-2 h-8 w-8 text-primary" aria-hidden="true" />
          <p className="font-medium">Nincs ügy ebben a nézetben.</p>
          <p className="text-sm text-muted-foreground">Ez nem bizonyít moderációs coverage-et, csak az aktuális queue állapotát.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <div className="space-y-3">
            {cases.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => resetEditor(item.id)}
                className={`w-full rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId === item.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                aria-pressed={selectedId === item.id}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={severityVariant[item.severity]}>{item.severity}</Badge>
                  <Badge variant="outline">{item.status}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString('hu-HU')}</span>
                </div>
                <p className="mt-2 font-medium">
                  {item.report ? SAFETY_REASON_LABELS[item.report.category] || item.report.category : 'Hiányzó report adat'}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.report?.details || 'Nincs opcionális leírás.'}</p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">Case {item.id}</p>
              </button>
            ))}
          </div>

          <Card className="h-fit lg:sticky lg:top-24">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Scale className="h-4 w-4" aria-hidden="true" /> Ügykezelés</CardTitle></CardHeader>
            <CardContent>
              {!selected ? (
                <p className="text-sm text-muted-foreground">Válassz egy ügyet a részletek és auditált műveletek megnyitásához.</p>
              ) : (
                <div className="space-y-5">
                  <div className="rounded-lg bg-muted/50 p-3 text-sm">
                    <p><strong>Cél:</strong> {selected.report?.context_type} / {selected.report?.target_ref}</p>
                    <p><strong>Forrás:</strong> {selected.report?.source_surface}</p>
                    <p><strong>Felelős:</strong> {selected.assignee_id ? (selected.assignee_id === user?.id ? 'Te' : selected.assignee_id) : 'Nincs kiosztva'}</p>
                    <p className="mt-2 whitespace-pre-wrap">{selected.report?.details || 'Nincs leírás.'}</p>
                  </div>

                  {selected.assignee_id !== user?.id && (
                    <Button type="button" variant="outline" className="w-full" onClick={() => void claimCase()} disabled={mutating}>
                      Ügy magamhoz vétele
                    </Button>
                  )}

                  {(selected.actions.length > 0 || selected.notes.length > 0) && (
                    <div className="space-y-3 rounded-lg border p-3 text-sm">
                      <p className="font-medium">Auditált előzmények</p>
                      {selected.actions.map((action) => (
                        <div key={action.id} className="border-l-2 border-primary/40 pl-3">
                          <p><strong>{action.action_type}</strong> – {action.policy_reason}</p>
                          {action.evidence_refs.length > 0 && <p className="mt-1 break-all text-xs text-muted-foreground">Evidence: {action.evidence_refs.join(', ')}</p>}
                          {action.appeals.map((appeal) => (
                            <div key={appeal.id} className="mt-2 rounded bg-muted/60 p-2">
                              <p><strong>Fellebbezés ({appeal.status}):</strong> {appeal.statement}</p>
                              {appeal.resolution_note && <p className="mt-1 text-xs">Döntés: {appeal.resolution_note}</p>}
                            </div>
                          ))}
                        </div>
                      ))}
                      {selected.notes.map((caseNote) => <p key={caseNote.id} className="border-l-2 pl-3 text-muted-foreground">{caseNote.note}</p>)}
                    </div>
                  )}

                  {NEXT_STATUS[selected.status].length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="moderation-next-status">Következő státusz</Label>
                      <Select value={nextStatus} onValueChange={(value) => setNextStatus(value as CaseStatus)}>
                        <SelectTrigger id="moderation-next-status"><SelectValue placeholder="Válassz átmenetet" /></SelectTrigger>
                        <SelectContent>{NEXT_STATUS[selected.status].map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
                      </Select>
                      <Textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 2000))} maxLength={2000} placeholder="Belső megjegyzés (opcionális)" />
                      <Button type="button" variant="outline" className="w-full" onClick={() => void transitionCase()} disabled={!nextStatus || mutating}>
                        Státusz frissítése
                      </Button>
                    </div>
                  )}

                  <div className="space-y-2 border-t pt-4">
                    <Label htmlFor="moderation-action">Intézkedés</Label>
                    <Select value={actionType} onValueChange={(value) => { setActionType(value); setPermanentConfirmed(false); }}>
                      <SelectTrigger id="moderation-action"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="warning">Figyelmeztetés</SelectItem>
                        <SelectItem value="education">Tájékoztatás</SelectItem>
                        <SelectItem value="feature_restriction">Funkciókorlátozás</SelectItem>
                        <SelectItem value="temporary_suspension">Ideiglenes felfüggesztés</SelectItem>
                        <SelectItem value="organizer_restriction">Szervezői korlátozás</SelectItem>
                        <SelectItem value="content_takedown">Tartalom eltávolítása</SelectItem>
                        <SelectItem value="event_takedown">Esemény eltávolítása</SelectItem>
                        {reviewerRole === 'admin' && <SelectItem value="permanent_ban">Végleges tiltás</SelectItem>}
                      </SelectContent>
                    </Select>
                    <Textarea value={policyReason} onChange={(event) => setPolicyReason(event.target.value.slice(0, 1000))} maxLength={1000} placeholder="Kötelező policy indok" />
                    <div className="space-y-1">
                      <Label htmlFor="moderation-evidence">Evidence hivatkozások</Label>
                      <Textarea
                        id="moderation-evidence"
                        value={evidenceRefs}
                        onChange={(event) => setEvidenceRefs(event.target.value.slice(0, 4000))}
                        maxLength={4000}
                        placeholder="Privát, jogosultságvédett hivatkozás soronként (opcionális)"
                      />
                      <p className="text-xs text-muted-foreground">Publikus URL-t vagy érzékeny adatot ne illessz be. Fájlcsatolás csak jóváhagyott privát storage-policy után engedhető.</p>
                    </div>
                    {(actionType === 'temporary_suspension' || actionType === 'feature_restriction') && (
                      <div className="space-y-1">
                        <Label htmlFor="moderation-duration">Időtartam napokban</Label>
                        <Input id="moderation-duration" type="number" min={1} max={365} value={durationDays} onChange={(event) => setDurationDays(event.target.value)} />
                      </div>
                    )}
                    {actionType === 'permanent_ban' && (
                      <label className="flex items-start gap-2 rounded-lg border border-destructive/40 p-3 text-sm">
                        <Checkbox checked={permanentConfirmed} onCheckedChange={(value) => setPermanentConfirmed(value === true)} className="mt-0.5" />
                        <span>Adminisztrátorként megerősítem, hogy az evidenciát és a fellebbezési utat ellenőriztem.</span>
                      </label>
                    )}
                    <Button
                      type="button"
                      className="w-full"
                      onClick={() => void applyAction()}
                      disabled={mutating || policyReason.trim().length < 3 || (actionType === 'permanent_ban' && !permanentConfirmed)}
                    >
                      {mutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                      Auditált intézkedés alkalmazása
                    </Button>
                  </div>

                  {openAppeal && (
                    <div className="space-y-2 border-t pt-4">
                      <Label htmlFor="appeal-resolution-note">Fellebbezési döntés indoka</Label>
                      <p className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">{openAppeal.statement}</p>
                      <Textarea
                        id="appeal-resolution-note"
                        value={appealResolutionNote}
                        onChange={(event) => setAppealResolutionNote(event.target.value.slice(0, 2000))}
                        maxLength={2000}
                        placeholder="Kötelező auditált döntési indok"
                      />
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Button type="button" variant="outline" onClick={() => void resolveAppeal('upheld')} disabled={mutating || appealResolutionNote.trim().length < 3}>Fenntartás</Button>
                        <Button type="button" variant="outline" onClick={() => void resolveAppeal('modified')} disabled={mutating || appealResolutionNote.trim().length < 3}>Módosítás</Button>
                        <Button type="button" variant="destructive" onClick={() => void resolveAppeal('overturned')} disabled={mutating || appealResolutionNote.trim().length < 3}>Visszavonás</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
