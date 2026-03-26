import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, CheckCircle2, ClipboardList, Download, Megaphone, Users, UserRoundCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizerMode } from '@/hooks/useOrganizerMode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import {
  type OrganizerEventSummary,
  type OrganizerParticipant,
  type ParticipationStatus,
  type MessageAudience,
  type MessageType,
  buildAttendeeCsv,
  createEventMessage,
  getEventMessages,
  getEventParticipants,
  getOrganizerAnalytics,
  getOwnedEvents,
  getParticipationAudit,
  saveOrganizerNote,
  transitionParticipation,
} from '@/lib/organizer';

const PARTICIPATION_FILTERS: Array<{ value: ParticipationStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Összes' },
  { value: 'interested', label: 'Érdeklődik' },
  { value: 'going', label: 'Megy' },
  { value: 'waitlist', label: 'Várólista' },
  { value: 'checked_in', label: 'Bejelentkezett' },
  { value: 'cancelled', label: 'Lemondta' },
  { value: 'no_show', label: 'No-show' },
];

const AUDIENCES: Array<{ value: MessageAudience; label: string }> = [
  { value: 'all', label: 'Összes résztvevő' },
  { value: 'going', label: 'Megerősítettek' },
  { value: 'waitlist', label: 'Várólistások' },
  { value: 'checked_in', label: 'Bejelentkezettek' },
  { value: 'no_show', label: 'No-show' },
];

const MESSAGE_TYPES: Array<{ value: MessageType; label: string }> = [
  { value: 'reminder', label: 'Emlékeztető' },
  { value: 'logistics_update', label: 'Logisztikai frissítés' },
  { value: 'event_update', label: 'Eseményfrissítés' },
  { value: 'cancellation', label: 'Lemondás' },
  { value: 'custom_message', label: 'Egyedi üzenet' },
];

const statusBadgeVariant = (status: ParticipationStatus) => {
  switch (status) {
    case 'going':
      return 'default';
    case 'checked_in':
      return 'secondary';
    case 'waitlist':
      return 'outline';
    case 'cancelled':
    case 'no_show':
      return 'destructive';
    default:
      return 'outline';
  }
};

const statusLabel = (status: ParticipationStatus) => PARTICIPATION_FILTERS.find((item) => item.value === status)?.label ?? status;

export default function OrganizerDashboard() {
  const { user, loading } = useAuth();
  const { canUseOrganizerMode, setMode } = useOrganizerMode();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<OrganizerEventSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [participants, setParticipants] = useState<OrganizerParticipant[]>([]);
  const [participantFilter, setParticipantFilter] = useState<ParticipationStatus | 'all'>('all');
  const [participantSearch, setParticipantSearch] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState<OrganizerParticipant | null>(null);
  const [participantAudit, setParticipantAudit] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [messageType, setMessageType] = useState<MessageType>('reminder');
  const [audienceFilter, setAudienceFilter] = useState<MessageAudience>('going');
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'events');
  const [checkInSearch, setCheckInSearch] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user || !canUseOrganizerMode) return;
    void loadOwnedEvents();
  }, [user, canUseOrganizerMode]);

  useEffect(() => {
    if (!selectedEventId) return;
    void Promise.all([loadParticipants(), loadMessages(), loadAnalytics()]);
  }, [selectedEventId, participantFilter, participantSearch]);

  useEffect(() => {
    if (!selectedParticipant) {
      setParticipantAudit([]);
      return;
    }
    void getParticipationAudit(selectedParticipant.id).then(setParticipantAudit).catch((error) => {
      console.error(error);
      toast.error('Nem sikerült betölteni az audit előzményeket.');
    });
  }, [selectedParticipant]);

  const loadOwnedEvents = async () => {
    if (!user) return;
    try {
      const rows = await getOwnedEvents(user.id);
      setEvents(rows);
      const requested = searchParams.get('eventId');
      const defaultId = requested && rows.some((event) => event.id === requested) ? requested : rows[0]?.id ?? '';
      setSelectedEventId(defaultId);
      if (defaultId) {
        searchParams.set('eventId', defaultId);
        setSearchParams(searchParams, { replace: true });
      }
    } catch (error) {
      console.error(error);
      toast.error('Nem sikerült betölteni a szervezői eseményeket.');
    }
  };

  const loadParticipants = async () => {
    try {
      const rows = await getEventParticipants(selectedEventId, { status: participantFilter, search: participantSearch });
      setParticipants(rows);
    } catch (error) {
      console.error(error);
      toast.error('Nem sikerült betölteni a résztvevőket.');
    }
  };

  const loadMessages = async () => {
    try {
      const rows = await getEventMessages(selectedEventId);
      setMessages(rows);
    } catch (error) {
      console.error(error);
      toast.error('Nem sikerült betölteni az üzenet előzményeket.');
    }
  };

  const loadAnalytics = async () => {
    try {
      const result = await getOrganizerAnalytics(selectedEventId);
      setAnalytics(result);
    } catch (error) {
      console.error(error);
      toast.error('Nem sikerült betölteni az analytics adatokat.');
    }
  };

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const handleTransition = async (participant: OrganizerParticipant, nextStatus: ParticipationStatus) => {
    if (!user) return;
    try {
      await transitionParticipation({
        participantId: participant.id,
        eventId: participant.event_id,
        actorUserId: user.id,
        nextStatus,
        metadata: { from_status: participant.status },
      });
      toast.success('Résztvevői állapot frissítve.');
      await Promise.all([loadParticipants(), loadAnalytics()]);
      if (selectedParticipant?.id === participant.id) {
        setSelectedParticipant({ ...selectedParticipant, status: nextStatus, checked_in_at: nextStatus === 'checked_in' ? new Date().toISOString() : null });
      }
    } catch (error) {
      console.error(error);
      toast.error('Az állapot frissítése nem sikerült.');
    }
  };

  const handleSaveNote = async () => {
    if (!selectedParticipant || !user) return;
    try {
      await saveOrganizerNote({
        participantId: selectedParticipant.id,
        eventId: selectedParticipant.event_id,
        actorUserId: user.id,
        organizerNote: selectedParticipant.organizer_note ?? '',
      });
      toast.success('Szervezői megjegyzés elmentve.');
      await loadParticipants();
      const audit = await getParticipationAudit(selectedParticipant.id);
      setParticipantAudit(audit);
    } catch (error) {
      console.error(error);
      toast.error('Nem sikerült menteni a megjegyzést.');
    }
  };

  const exportCsv = () => {
    const csv = buildAttendeeCsv(participants);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `hobbeast-attendees-${selectedEventId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleSendMessage = async () => {
    if (!user || !selectedEventId || !messageBody.trim()) return;
    try {
      await createEventMessage({
        eventId: selectedEventId,
        actorUserId: user.id,
        messageType,
        audienceFilter,
        subject: messageSubject.trim() || undefined,
        body: messageBody.trim(),
        deliveryState: scheduledFor ? 'scheduled' : 'sent',
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
      });
      toast.success(scheduledFor ? 'Üzenet ütemezve.' : 'Üzenet mentve a history-ba.');
      setMessageSubject('');
      setMessageBody('');
      setScheduledFor('');
      await loadMessages();
    } catch (error) {
      console.error(error);
      toast.error('Az üzenet mentése nem sikerült.');
    }
  };

  const filteredCheckInCandidates = participants.filter((participant) => {
    const search = checkInSearch.trim().toLowerCase();
    const invite = inviteCode.trim().toLowerCase();
    const displayName = participant.profiles?.display_name?.toLowerCase() ?? '';
    const code = participant.invite_code?.toLowerCase() ?? '';
    if (invite) return code.includes(invite);
    if (!search) return ['going', 'checked_in', 'waitlist'].includes(participant.status);
    return displayName.includes(search) || code.includes(search);
  });

  if (!loading && !canUseOrganizerMode) {
    return (
      <main className="pt-24 pb-16 min-h-screen">
        <div className="container mx-auto px-4 max-w-3xl">
          <Card className="rounded-2xl border shadow-card">
            <CardContent className="p-6 space-y-4">
              <h1 className="font-display text-2xl font-bold">Szervezői mód</h1>
              <p className="text-muted-foreground">
                Jelenleg nincs olyan saját eseményed, ami alapján elérhető lenne a szervezői felület.
              </p>
              <Button onClick={() => navigate('/events')}>Vissza az eseményekhez</Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-24 pb-16 min-h-screen">
      <div className="container mx-auto px-4 max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Organizer mode</h1>
            <p className="text-muted-foreground">InviteM ihletésű szervezői eszközök: résztvevők, check-in, kommunikáció és analytics.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setMode('community'); navigate('/events'); }}>Közösségi mód</Button>
            <Button onClick={() => navigate('/events')}>Események</Button>
          </div>
        </div>

        <Card className="rounded-2xl border shadow-card">
          <CardContent className="p-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="w-full md:max-w-sm">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kezelt esemény</Label>
              <Select value={selectedEventId} onValueChange={(value) => {
                setSelectedEventId(value);
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set('eventId', value);
                setSearchParams(nextParams, { replace: true });
              }}>
                <SelectTrigger className="rounded-xl mt-2"><SelectValue placeholder="Válassz eseményt" /></SelectTrigger>
                <SelectContent>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>{event.image_emoji ?? '🎉'} {event.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedEvent && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto">
                <MetricCard icon={<Users className="h-4 w-4" />} label="Összes" value={selectedEvent.participantCount} />
                <MetricCard icon={<UserRoundCheck className="h-4 w-4" />} label="Megerősítettek" value={selectedEvent.goingCount} />
                <MetricCard icon={<ClipboardList className="h-4 w-4" />} label="Várólista" value={selectedEvent.waitlistCount} />
                <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="Check-in" value={selectedEvent.checkedInCount} />
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={(value) => {
          setActiveTab(value);
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set('tab', value);
          setSearchParams(nextParams, { replace: true });
        }}>
          <TabsList className="grid w-full grid-cols-5 rounded-2xl h-auto">
            <TabsTrigger value="events">My events</TabsTrigger>
            <TabsTrigger value="attendees">Attendees</TabsTrigger>
            <TabsTrigger value="checkin">Check-in</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="space-y-4 mt-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {events.map((event) => (
                <Card key={event.id} className="rounded-2xl border shadow-card">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-3xl">{event.image_emoji ?? '🎉'}</p>
                        <h3 className="font-semibold text-lg leading-tight">{event.title}</h3>
                        <p className="text-sm text-muted-foreground">{event.location_city ?? 'Helyszín nélkül'} · {event.event_date ?? 'Dátum nélkül'}</p>
                      </div>
                      <Badge variant="outline">{event.category}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <InfoPill label="Going" value={event.goingCount} />
                      <InfoPill label="Várólista" value={event.waitlistCount} />
                      <InfoPill label="Check-in" value={event.checkedInCount} />
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1" variant="outline" onClick={() => navigate(`/events/${event.id}`)}>Megnyitás</Button>
                      <Button className="flex-1" onClick={() => { setSelectedEventId(event.id); setActiveTab('attendees'); }}>Kezelés</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="attendees" className="mt-4">
            <Card className="rounded-2xl border shadow-card">
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <CardTitle>Résztvevőkezelés</CardTitle>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input value={participantSearch} onChange={(event) => setParticipantSearch(event.target.value)} placeholder="Keresés név / invite code alapján" className="rounded-xl sm:w-64" />
                  <Select value={participantFilter} onValueChange={(value) => setParticipantFilter(value as ParticipationStatus | 'all')}>
                    <SelectTrigger className="rounded-xl sm:w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PARTICIPATION_FILTERS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />CSV export</Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Név</TableHead>
                      <TableHead>Állapot</TableHead>
                      <TableHead>Csatlakozott</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Invite code</TableHead>
                      <TableHead className="text-right">Műveletek</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {participants.map((participant) => (
                      <TableRow key={participant.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{participant.profiles?.display_name ?? participant.user_id.slice(0, 8)}</div>
                            <div className="text-xs text-muted-foreground">{participant.profiles?.city ?? '—'}</div>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant={statusBadgeVariant(participant.status)}>{statusLabel(participant.status)}</Badge></TableCell>
                        <TableCell>{new Date(participant.joined_at).toLocaleString('hu-HU')}</TableCell>
                        <TableCell>{participant.checked_in_at ? new Date(participant.checked_in_at).toLocaleString('hu-HU') : '—'}</TableCell>
                        <TableCell>{participant.invite_code ?? '—'}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2 flex-wrap">
                            {participant.status === 'waitlist' && <Button size="sm" variant="outline" onClick={() => void handleTransition(participant, 'going')}>Promote</Button>}
                            {participant.status === 'going' && <Button size="sm" variant="outline" onClick={() => void handleTransition(participant, 'checked_in')}>Check-in</Button>}
                            {participant.status === 'checked_in' && <Button size="sm" variant="outline" onClick={() => void handleTransition(participant, 'going')}>Undo</Button>}
                            {participant.status !== 'cancelled' && <Button size="sm" variant="outline" onClick={() => void handleTransition(participant, 'cancelled')}>Cancel</Button>}
                            <Button size="sm" onClick={() => setSelectedParticipant(participant)}>Open</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {participants.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nincs találat a kiválasztott szűrőkre.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="checkin" className="mt-4">
            <Card className="rounded-2xl border shadow-card">
              <CardHeader>
                <CardTitle>Check-in admin</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Keresés név szerint</Label>
                    <Input value={checkInSearch} onChange={(event) => setCheckInSearch(event.target.value)} placeholder="John Doe" className="rounded-xl mt-2" />
                  </div>
                  <div>
                    <Label>Invite code</Label>
                    <Input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="ABC123" className="rounded-xl mt-2" />
                  </div>
                </div>
                <div className="space-y-3">
                  {filteredCheckInCandidates.map((participant) => (
                    <div key={participant.id} className="flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-medium">{participant.profiles?.display_name ?? participant.user_id.slice(0, 8)}</div>
                        <div className="text-sm text-muted-foreground">{statusLabel(participant.status)} · invite code: {participant.invite_code ?? 'nincs'}</div>
                      </div>
                      <div className="flex gap-2">
                        {participant.status === 'going' && <Button onClick={() => void handleTransition(participant, 'checked_in')}>Check in</Button>}
                        {participant.status === 'checked_in' && <Button variant="outline" onClick={() => void handleTransition(participant, 'going')}>Undo</Button>}
                        {participant.status === 'waitlist' && <Button variant="outline" onClick={() => void handleTransition(participant, 'going')}>Promote</Button>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="messages" className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="rounded-2xl border shadow-card">
              <CardHeader>
                <CardTitle>Event communications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Típus</Label>
                    <Select value={messageType} onValueChange={(value) => setMessageType(value as MessageType)}>
                      <SelectTrigger className="rounded-xl mt-2"><SelectValue /></SelectTrigger>
                      <SelectContent>{MESSAGE_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Célközönség</Label>
                    <Select value={audienceFilter} onValueChange={(value) => setAudienceFilter(value as MessageAudience)}>
                      <SelectTrigger className="rounded-xl mt-2"><SelectValue /></SelectTrigger>
                      <SelectContent>{AUDIENCES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Tárgy</Label>
                  <Input value={messageSubject} onChange={(event) => setMessageSubject(event.target.value)} className="rounded-xl mt-2" placeholder="Opcionális tárgy" />
                </div>
                <div>
                  <Label>Üzenet</Label>
                  <Textarea value={messageBody} onChange={(event) => setMessageBody(event.target.value)} className="rounded-xl mt-2 min-h-[160px]" placeholder="Írd ide az üzenet tartalmát" />
                </div>
                <div>
                  <Label>Ütemezés (opcionális)</Label>
                  <Input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} className="rounded-xl mt-2" />
                </div>
                <Button onClick={() => void handleSendMessage()}><Megaphone className="h-4 w-4 mr-2" />Küldés / mentés</Button>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border shadow-card">
              <CardHeader>
                <CardTitle>Message history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {messages.map((message) => (
                  <div key={message.id} className="rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{MESSAGE_TYPES.find((item) => item.value === message.message_type)?.label ?? message.message_type}</div>
                      <Badge variant="outline">{message.delivery_state}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">{AUDIENCES.find((item) => item.value === message.audience_filter)?.label ?? message.audience_filter}</div>
                    {message.subject && <div className="mt-2 font-medium">{message.subject}</div>}
                    <p className="text-sm mt-2 whitespace-pre-wrap">{message.body}</p>
                    <div className="text-xs text-muted-foreground mt-3">{new Date(message.created_at).toLocaleString('hu-HU')}</div>
                  </div>
                ))}
                {messages.length === 0 && <p className="text-sm text-muted-foreground">Még nincs kiküldött vagy ütemezett üzenet ehhez az eseményhez.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={<BarChart3 className="h-4 w-4" />} label="Join click / intent" value={analytics?.joinClicks ?? 0} />
              <MetricCard icon={<Users className="h-4 w-4" />} label="Going" value={analytics?.going ?? 0} />
              <MetricCard icon={<ClipboardList className="h-4 w-4" />} label="Waitlist" value={analytics?.waitlist ?? 0} />
              <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="Attendance rate" value={`${Math.round((analytics?.attendanceRate ?? 0) * 100)}%`} />
            </div>
            <Card className="rounded-2xl border shadow-card">
              <CardHeader>
                <CardTitle>Source attribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(analytics?.sourceBreakdown ?? []).map((row: any) => (
                  <div key={row.source} className="flex items-center justify-between rounded-2xl border p-4">
                    <div>
                      <div className="font-medium">{row.source}</div>
                      <div className="text-sm text-muted-foreground">Views: {row.views}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">Joins: {row.joins}</div>
                      <div className="text-sm text-muted-foreground">Check-in: {row.checkedIn}</div>
                    </div>
                  </div>
                ))}
                {!analytics && <p className="text-sm text-muted-foreground">Analytics még nem érhető el ehhez az eseményhez.</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Sheet open={!!selectedParticipant} onOpenChange={(open) => !open && setSelectedParticipant(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedParticipant && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedParticipant.profiles?.display_name ?? selectedParticipant.user_id.slice(0, 8)} – attendee workspace</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                <Card className="rounded-2xl border">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Állapot</div>
                        <Badge variant={statusBadgeVariant(selectedParticipant.status)}>{statusLabel(selectedParticipant.status)}</Badge>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        <div>Csatlakozott: {new Date(selectedParticipant.joined_at).toLocaleString('hu-HU')}</div>
                        <div>Check-in: {selectedParticipant.checked_in_at ? new Date(selectedParticipant.checked_in_at).toLocaleString('hu-HU') : '—'}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border">
                  <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void handleTransition(selectedParticipant, 'going')}>Promote / going</Button>
                    <Button variant="outline" onClick={() => void handleTransition(selectedParticipant, 'checked_in')}>Check-in</Button>
                    <Button variant="outline" onClick={() => void handleTransition(selectedParticipant, 'cancelled')}>Cancel</Button>
                    <Button variant="outline" onClick={() => void handleTransition(selectedParticipant, 'no_show')}>Mark no-show</Button>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border">
                  <CardHeader><CardTitle>Szervezői megjegyzés</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      value={selectedParticipant.organizer_note ?? ''}
                      onChange={(event) => setSelectedParticipant({ ...selectedParticipant, organizer_note: event.target.value })}
                      className="rounded-xl min-h-[120px]"
                    />
                    <Button onClick={() => void handleSaveNote()}>Save note</Button>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border">
                  <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {participantAudit.map((item) => (
                      <div key={item.id} className="rounded-xl border p-3">
                        <div className="font-medium">{item.action}</div>
                        <div className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString('hu-HU')}</div>
                      </div>
                    ))}
                    {participantAudit.length === 0 && <p className="text-sm text-muted-foreground">Még nincs audit előzmény ehhez a résztvevőhöz.</p>}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card className="rounded-2xl border shadow-card">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoPill({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
