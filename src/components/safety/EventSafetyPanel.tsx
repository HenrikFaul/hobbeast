import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { createCorrelationId } from '@/lib/observability';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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

export interface EventSafetySummary {
  venue_visibility: 'public_meeting_point' | 'participant_only' | 'private_exact_after_join' | 'online';
  host_accountability_ack: boolean;
  capacity_ack: boolean;
  participant_rules: string | null;
  venue_suitability_note?: string | null;
  risk_flags: string[];
  review_status: 'not_required' | 'review_required' | 'in_review' | 'approved' | 'changes_required';
}

interface EventSafetyPanelProps {
  eventId: string;
  isOwner: boolean;
  onSummary?: (summary: EventSafetySummary | null) => void;
}

const RISK_OPTIONS = [
  ['private_home', 'Privát lakás'],
  ['night', 'Éjszakai program'],
  ['physical_contact', 'Fizikai kontaktussal jár'],
  ['remote_location', 'Távoli / nehezen elérhető hely'],
  ['other', 'Egyéb emelt kockázat'],
] as const;

async function invoke(body: Record<string, unknown>) {
  const idempotencyKey = createCorrelationId();
  return supabase.functions.invoke('trust-safety', {
    body,
    headers: { 'X-Correlation-ID': createCorrelationId(), 'Idempotency-Key': idempotencyKey },
  });
}

export function EventSafetyPanel({ eventId, isOwner, onSummary }: EventSafetyPanelProps) {
  const [summary, setSummary] = useState<EventSafetySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [venueVisibility, setVenueVisibility] = useState<EventSafetySummary['venue_visibility']>('participant_only');
  const [hostAck, setHostAck] = useState(false);
  const [capacityAck, setCapacityAck] = useState(false);
  const [rules, setRules] = useState('');
  const [venueNote, setVenueNote] = useState('');
  const [riskFlags, setRiskFlags] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await invoke({ action: isOwner ? 'get_event_safety' : 'event_safety_summary', eventId });
    const loaded = !error && data?.ok && data.safety ? data.safety as EventSafetySummary : null;
    setSummary(loaded);
    onSummary?.(loaded);
    if (loaded) {
      setVenueVisibility(loaded.venue_visibility);
      setHostAck(loaded.host_accountability_ack);
      setCapacityAck(loaded.capacity_ack);
      setRules(loaded.participant_rules || '');
      setVenueNote(loaded.venue_suitability_note || '');
      setRiskFlags(loaded.risk_flags || []);
    }
    setLoading(false);
  }, [eventId, isOwner, onSummary]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleRisk = (risk: string, checked: boolean) => {
    setRiskFlags((current) => checked ? [...new Set([...current, risk])] : current.filter((item) => item !== risk));
  };

  const save = async () => {
    if (!hostAck || !capacityAck || rules.trim().length < 3) {
      toast.error('Erősítsd meg a host- és kapacitásfelelősséget, és adj résztvevői szabályokat.');
      return;
    }
    setSaving(true);
    const { data, error } = await invoke({
      action: 'save_event_safety',
      eventId,
      venueVisibility,
      hostAccountabilityAck: hostAck,
      capacityAck,
      participantRules: rules.trim(),
      venueSuitabilityNote: venueNote.trim(),
      riskFlags,
    });
    setSaving(false);
    if (error || !data?.ok) {
      toast.error('A safety minimumot nem sikerült menteni.');
      return;
    }
    const saved = data.safety as EventSafetySummary;
    setSummary(saved);
    onSummary?.(saved);
    setEditing(false);
    toast.success(saved.review_status === 'review_required'
      ? 'Mentve; az esemény külön safety review-t igényel.'
      : 'Az esemény safety minimuma mentve.');
  };

  if (loading) {
    return <div role="status" aria-live="polite" className="mb-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Safety adatok betöltése…</div>;
  }

  if (!isOwner && !summary) return null;

  return (
    <Card className="mb-6 rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" /> Eseménybiztonsági minimum
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!editing && summary ? (
          <>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Helyszín megosztása</dt><dd className="font-medium">{summary.venue_visibility}</dd></div>
              <div><dt className="text-muted-foreground">Review</dt><dd className="font-medium">{summary.review_status}</dd></div>
              <div><dt className="text-muted-foreground">Host felelősség</dt><dd>{summary.host_accountability_ack ? 'Megerősítve' : 'Hiányzik'}</dd></div>
              <div><dt className="text-muted-foreground">Kapacitás</dt><dd>{summary.capacity_ack ? 'Megerősítve' : 'Hiányzik'}</dd></div>
            </dl>
            {summary.participant_rules && <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Résztvevői szabályok</p><p className="mt-1 whitespace-pre-wrap text-sm">{summary.participant_rules}</p></div>}
            {summary.review_status === 'review_required' && (
              <Alert><AlertTriangle className="h-4 w-4" aria-hidden="true" /><AlertTitle>Emberi review szükséges</AlertTitle><AlertDescription>A kockázati jelző nem automatikus tiltás vagy safety score; operátori döntés szükséges.</AlertDescription></Alert>
            )}
            {isOwner && <Button type="button" variant="outline" onClick={() => setEditing(true)}>Safety adatok szerkesztése</Button>}
          </>
        ) : isOwner ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="event-safety-visibility">Helyszín láthatósága</Label>
              <Select value={venueVisibility} onValueChange={(value) => setVenueVisibility(value as EventSafetySummary['venue_visibility'])}>
                <SelectTrigger id="event-safety-visibility"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public_meeting_point">Nyilvános találkozási pont</SelectItem>
                  <SelectItem value="participant_only">Csak résztvevőknek</SelectItem>
                  <SelectItem value="private_exact_after_join">Pontos cím csatlakozás után</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label htmlFor="event-participant-rules">Résztvevői szabályok</Label><Textarea id="event-participant-rules" value={rules} onChange={(event) => setRules(event.target.value.slice(0, 2000))} maxLength={2000} rows={4} /></div>
            <div className="space-y-2"><Label htmlFor="event-venue-note">Helyszín alkalmassága (opcionális)</Label><Textarea id="event-venue-note" value={venueNote} onChange={(event) => setVenueNote(event.target.value.slice(0, 1000))} maxLength={1000} rows={2} /></div>
            <fieldset className="space-y-2"><legend className="text-sm font-medium">Kockázati review-jelzők</legend>{RISK_OPTIONS.map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm"><Checkbox checked={riskFlags.includes(value)} onCheckedChange={(checked) => toggleRisk(value, checked === true)} /> {label}</label>)}</fieldset>
            <label className="flex items-start gap-2 rounded-lg border p-3 text-sm"><Checkbox checked={hostAck} onCheckedChange={(checked) => setHostAck(checked === true)} className="mt-0.5" /><span>Hostként vállalom az esemény és az incidens-átadás alapvető felelősségét.</span></label>
            <label className="flex items-start gap-2 rounded-lg border p-3 text-sm"><Checkbox checked={capacityAck} onCheckedChange={(checked) => setCapacityAck(checked === true)} className="mt-0.5" /><span>Ellenőriztem a kapacitást és a helyszín alkalmasságát.</span></label>
            <p className="text-xs text-muted-foreground">Közvetlen veszélyben a helyi segélyhívót kell hívni; a Hobbeast nem sürgősségi szolgáltatás.</p>
            <div className="flex gap-2"><Button type="button" onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Mentés</Button>{summary && <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={saving}>Mégse</Button>}</div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
