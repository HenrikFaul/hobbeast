import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  cancelOrganizerEvent,
  getOrganizerConfiguration,
  manageOrganizerCrew,
  manageOrganizerSeries,
  manageOrganizerSeriesOccurrence,
  publishOrganizerEvent,
  rescheduleOrganizerEvent,
  type OrganizerConfiguration,
} from '@/lib/eventOperations';
import { trackProductEvent } from '@/lib/productAnalyticsClient';

const EMPTY_CONFIG: OrganizerConfiguration = { crew: [], series: [], occurrences: [] };

export function OrganizerOperationsPanel({ eventId, onChanged }: { eventId: string | null; onChanged: () => Promise<void> }) {
  const [config, setConfig] = useState<OrganizerConfiguration>(EMPTY_CONFIG);
  const [working, setWorking] = useState(false);
  const [crewUserId, setCrewUserId] = useState('');
  const [crewReason, setCrewReason] = useState('Szervezői csapattag beállítása');
  const [capabilities, setCapabilities] = useState({ checkIn: true, message: false, edit: false, finance: false, moderate: false });
  const [lifecycleReason, setLifecycleReason] = useState('Szervezői művelet');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [seriesTitle, setSeriesTitle] = useState('');
  const [recurrenceRule, setRecurrenceRule] = useState('FREQ=WEEKLY;INTERVAL=1');
  const [seriesReason, setSeriesReason] = useState('Szervezői sorozat karbantartása');
  const [occurrenceStart, setOccurrenceStart] = useState('');
  const [occurrenceState, setOccurrenceState] = useState<'scheduled' | 'skipped' | 'rescheduled' | 'cancelled'>('scheduled');

  const load = useCallback(async () => {
    if (!eventId) { setConfig(EMPTY_CONFIG); return; }
    try { setConfig(await getOrganizerConfiguration(eventId)); }
    catch (error) { console.error(error); toast.error('A crew és sorozat beállítások nem tölthetők be.'); }
  }, [eventId]);
  useEffect(() => { void load(); }, [load]);

  const mutate = async (operation: () => Promise<unknown>, success: string) => {
    if (working) return;
    setWorking(true);
    try { await operation(); toast.success(success); await Promise.all([load(), onChanged()]); }
    catch (error) { console.error(error); toast.error('A műveletet a jogosultsági vagy integritási kapu blokkolta.'); }
    finally { setWorking(false); }
  };

  if (!eventId) return <Card><CardContent className="py-8 text-center text-muted-foreground">Válassz eseményt a crew, életciklus és sorozat kezeléséhez.</CardContent></Card>;

  return (
    <div className="space-y-4 lg:col-span-2">
      <Card><CardHeader><CardTitle>Esemény-életciklus (auditált)</CardTitle></CardHeader><CardContent className="space-y-3">
        <Input value={lifecycleReason} onChange={(event) => setLifecycleReason(event.target.value)} maxLength={500} placeholder="Kötelező indok" />
        <div className="grid gap-3 sm:grid-cols-2"><div><Label>Új kezdés</Label><Input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></div><div><Label>Új befejezés</Label><Input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} /></div></div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={working || lifecycleReason.trim().length < 3} onClick={() => void mutate(async () => {
            await publishOrganizerEvent(eventId, lifecycleReason.trim());
            void trackProductEvent('organizer_event_created', { event_id: eventId, source: 'organizer', surface: 'organizer_dashboard', status: 'published' });
          }, 'Az esemény publikálási kapuja lefutott.')}>Publikálás</Button>
          <Button variant="outline" disabled={working || !startAt || !endAt || lifecycleReason.trim().length < 3} onClick={() => void mutate(() => rescheduleOrganizerEvent({ eventId, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(), reason: lifecycleReason.trim() }), 'Az esemény időpontja auditáltan módosult.')}>Átütemezés</Button>
          <Button variant="destructive" disabled={working || lifecycleReason.trim().length < 3} onClick={() => {
            if (window.confirm('Biztosan lemondod az eseményt? A résztvevők kritikus értesítést kapnak.')) void mutate(() => cancelOrganizerEvent(eventId, lifecycleReason.trim()), 'Az esemény lemondása auditáltan megtörtént.');
          }}>Lemondás</Button>
        </div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Crew szerepkörök</CardTitle></CardHeader><CardContent className="space-y-3">
        <Input value={crewUserId} onChange={(event) => setCrewUserId(event.target.value)} placeholder="Valódi felhasználó UUID" />
        <Input value={crewReason} onChange={(event) => setCrewReason(event.target.value)} maxLength={500} placeholder="Audit indok" />
        <div className="flex flex-wrap gap-4 text-sm">
          {([['checkIn', 'Check-in'], ['message', 'Üzenet'], ['edit', 'Szerkesztés'], ['finance', 'Pénzügy'], ['moderate', 'Moderáció']] as const).map(([key, label]) => <Label key={key} className="flex items-center gap-2"><Checkbox checked={capabilities[key]} onCheckedChange={(checked) => setCapabilities((current) => ({ ...current, [key]: checked === true }))} />{label}</Label>)}
        </div>
        <Button disabled={working || crewUserId.trim().length < 30 || crewReason.trim().length < 3} onClick={() => void mutate(() => manageOrganizerCrew({ eventId, userId: crewUserId.trim(), action: 'upsert', reason: crewReason.trim(), canCheckIn: capabilities.checkIn, canMessageAttendees: capabilities.message, canEditEvent: capabilities.edit, canViewFinance: capabilities.finance, canModerate: capabilities.moderate }), 'Crew jogosultság mentve.')}>Crew hozzáadása / frissítése</Button>
        <div className="space-y-2">{config.crew.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"><div><code className="text-xs">{member.user_id}</code><div className="mt-1 flex flex-wrap gap-1">{member.can_check_in && <Badge variant="outline">check-in</Badge>}{member.can_message_attendees && <Badge variant="outline">message</Badge>}{member.can_edit_event && <Badge variant="outline">edit</Badge>}{member.can_view_finance && <Badge variant="outline">finance</Badge>}{member.can_moderate && <Badge variant="outline">moderate</Badge>}</div></div><Button size="sm" variant="destructive" disabled={working} onClick={() => void mutate(() => manageOrganizerCrew({ eventId, userId: member.user_id, action: 'remove', reason: 'Crew hozzáférés visszavonása' }), 'Crew hozzáférés visszavonva.')}>Eltávolítás</Button></div>)}</div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Ismétlődő eseménysorozatok</CardTitle></CardHeader><CardContent className="space-y-3">
        <Input value={seriesTitle} onChange={(event) => setSeriesTitle(event.target.value)} maxLength={160} placeholder="Sorozat címe" />
        <Input value={recurrenceRule} onChange={(event) => setRecurrenceRule(event.target.value)} maxLength={500} placeholder="RFC 5545 RRULE" />
        <Input value={seriesReason} onChange={(event) => setSeriesReason(event.target.value)} maxLength={500} placeholder="Audit indok" />
        <div className="flex gap-2"><Button disabled={working || seriesTitle.trim().length < 1 || seriesReason.trim().length < 3} onClick={() => void mutate(() => manageOrganizerSeries({ action: seriesId ? 'update' : 'create', seriesId, title: seriesTitle.trim(), recurrenceRule: recurrenceRule.trim(), timezone: 'Europe/Budapest', reason: seriesReason.trim() }), seriesId ? 'Sorozat frissítve.' : 'Sorozat létrehozva.')}>{seriesId ? 'Sorozat frissítése' : 'Sorozat létrehozása'}</Button>{seriesId && <Button variant="ghost" onClick={() => { setSeriesId(null); setSeriesTitle(''); }}>Új sorozat</Button>}</div>
        {config.series.map((series) => <div key={series.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"><button type="button" className="text-left" onClick={() => { setSeriesId(series.id); setSeriesTitle(series.title); setRecurrenceRule(series.recurrence_rule); }}><strong>{series.title}</strong><div className="text-xs text-muted-foreground">{series.recurrence_rule} · {series.timezone}</div></button><div className="flex gap-2"><Badge variant={series.is_active ? 'secondary' : 'outline'}>{series.is_active ? 'aktív' : 'inaktív'}</Badge>{series.is_active && <Button size="sm" variant="outline" disabled={working} onClick={() => void mutate(() => manageOrganizerSeries({ action: 'deactivate', seriesId: series.id, reason: 'Sorozat lezárása' }), 'Sorozat deaktiválva.')}>Lezárás</Button>}</div></div>)}
        {config.series.length > 0 && <div className="space-y-3 rounded-xl border p-3"><Label>Előfordulás / kivétel</Label><Select value={seriesId || ''} onValueChange={setSeriesId}><SelectTrigger><SelectValue placeholder="Sorozat" /></SelectTrigger><SelectContent>{config.series.filter((item) => item.is_active).map((item) => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent></Select><Input type="datetime-local" value={occurrenceStart} onChange={(event) => setOccurrenceStart(event.target.value)} /><Select value={occurrenceState} onValueChange={(value) => setOccurrenceState(value as typeof occurrenceState)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="scheduled">Ütemezett</SelectItem><SelectItem value="rescheduled">Átütemezett</SelectItem><SelectItem value="skipped">Kihagyott</SelectItem><SelectItem value="cancelled">Lemondott</SelectItem></SelectContent></Select><Button disabled={working || !seriesId || !occurrenceStart} onClick={() => void mutate(() => manageOrganizerSeriesOccurrence({ seriesId: seriesId!, eventId, originalStart: new Date(occurrenceStart).toISOString(), occurrenceStart: new Date(occurrenceStart).toISOString(), state: occurrenceState, reason: seriesReason.trim() }), 'Sorozat-előfordulás mentve.')}>Előfordulás mentése</Button></div>}
      </CardContent></Card>
    </div>
  );
}
