import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardList, Users, UserRoundCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizerMode } from '@/hooks/useOrganizerMode';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  completeEventAtomic,
  createOrganizerIncidentHandoff,
  saveOrganizerReadinessAssessment,
} from '@/lib/eventOperations';
import {
  flushOrganizerCheckIns,
  queueOrganizerCheckIn,
  readQueuedCheckIns,
} from '@/lib/organizerCheckInQueue';
import {
  calculateHostReliability,
  validateBulkParticipantTransition,
} from '@/lib/organizerProduction';
import { buildOrganizerReadinessChecklist } from '@/lib/eventLifecycle';
import { trackProductEvent } from '@/lib/productAnalyticsClient';
import { OrganizerAiProposalInbox } from '@/components/organizer/OrganizerAiProposalInbox';
import {
  filterOrganizerCheckInCandidates,
  getParticipationStatusLabel,
  MetricCard,
  ORGANIZER_DASHBOARD_TABS,
  OrganizerAnalyticsTab,
  OrganizerAttendeesTab,
  OrganizerCheckInTab,
  OrganizerCrewTab,
  OrganizerEventsTab,
  OrganizerMessagesTab,
  OrganizerParticipantDetailSheet,
  OrganizerSettingsTab,
  OrganizerSourcesTab,
  selectOwnedOrganizerEventId,
  type OrganizerIncidentSeverity,
  type OrganizerIncidentType,
} from '@/features/organizer/dashboard';
import {
  type OrganizerEventSummary,
  type OrganizerParticipant,
  type OrganizerMessage,
  type OrganizerAnalytics,
  type ParticipationAuditEntry,
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
  const [participantAudit, setParticipantAudit] = useState<ParticipationAuditEntry[]>([]);
  const [messages, setMessages] = useState<OrganizerMessage[]>([]);
  const [analytics, setAnalytics] = useState<OrganizerAnalytics | null>(null);
  const [messageType, setMessageType] = useState<MessageType>('reminder');
  const [audienceFilter, setAudienceFilter] = useState<MessageAudience>('going');
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'events');
  const [checkInSearch, setCheckInSearch] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [transitioningIds, setTransitioningIds] = useState<Set<string>>(new Set());
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<ParticipationStatus>('cancelled');
  const [bulkPending, setBulkPending] = useState(false);
  const [queuedCheckInIds, setQueuedCheckInIds] = useState<Set<string>>(
    () => new Set(readQueuedCheckIns().map((item) => item.participationId)),
  );
  const [completionPending, setCompletionPending] = useState(false);
  const [readinessPending, setReadinessPending] = useState(false);
  const [incidentPending, setIncidentPending] = useState(false);
  const [messagePending, setMessagePending] = useState(false);
  const [legalTaxReady, setLegalTaxReady] = useState(false);
  const [incidentType, setIncidentType] = useState<OrganizerIncidentType>('safety');
  const [incidentSeverity, setIncidentSeverity] = useState<OrganizerIncidentSeverity>('medium');
  const [incidentSummary, setIncidentSummary] = useState('');

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

  useEffect(() => {
    const flushPendingCheckIns = () => {
      void flushOrganizerCheckIns()
        .then(({ sent, sentParticipationIds }) => {
          if (sent === 0) return;
          setQueuedCheckInIds((current) => {
            const next = new Set(current);
            sentParticipationIds.forEach((id) => next.delete(id));
            return next;
          });
          toast.success(`${sent} offline check-in szinkronizálva.`);
        })
        .catch((error) => {
          console.error('Offline check-in queue flush failed', error);
        });
    };

    window.addEventListener('online', flushPendingCheckIns);
    if (navigator.onLine) flushPendingCheckIns();
    return () => window.removeEventListener('online', flushPendingCheckIns);
  }, []);

  const loadOwnedEvents = async () => {
    if (!user) return;
    try {
      const rows = await getOwnedEvents(user.id);
      setEvents(rows);
      const requested = searchParams.get('eventId');
      const defaultId = selectOwnedOrganizerEventId(rows, requested);
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

  const readinessItems = useMemo(() => buildOrganizerReadinessChecklist({
    title: selectedEvent?.title,
    description: selectedEvent?.description,
    locationCity: selectedEvent?.location_city,
    meetingInstructions: selectedEvent?.meeting_instructions,
    maxAttendees: selectedEvent?.max_attendees,
    cancellationPolicy: selectedEvent?.cancellation_policy,
    hostIdentityReady: Boolean(user?.email_confirmed_at),
    checkInMethod: 'invite_code_or_manual',
    safetyPolicy: selectedEvent?.host_responsibility_accepted_at ? 'host_responsibility_accepted' : null,
    accessibilityInfo: selectedEvent?.accessibility_info,
    participantCommunicationReady: messages.length > 0,
    legalTaxReady,
  }), [selectedEvent, user?.email_confirmed_at, messages.length, legalTaxReady]);

  const reliability = useMemo(() => calculateHostReliability({
    publishedEvents: events.filter((event) => event.outcome_status !== 'draft').length,
    completedEvents: events.filter((event) => ['completed', 'held'].includes(event.outcome_status ?? '')).length,
    cancelledEvents: events.filter((event) => event.outcome_status === 'cancelled').length,
    expectedAttendees: (analytics?.going ?? 0) + (analytics?.checkedIn ?? 0) + (analytics?.completed ?? 0) + (analytics?.noShow ?? 0),
    attendedParticipants: (analytics?.checkedIn ?? 0) + (analytics?.completed ?? 0),
    noShowParticipants: analytics?.noShow ?? 0,
    repeatParticipants: null,
    reportCount: null,
  }), [events, analytics]);

  const handleTransition = async (participant: OrganizerParticipant, nextStatus: ParticipationStatus) => {
    if (!user) return;
    setTransitioningIds((current) => new Set(current).add(participant.id));
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
      const errorCode = error instanceof Error ? error.message : 'EVENT_OPERATION_FAILED';
      const canQueueOfflineCheckIn = nextStatus === 'checked_in'
        && (!navigator.onLine || errorCode === 'EVENT_OPERATION_FAILED');
      if (canQueueOfflineCheckIn) {
        queueOrganizerCheckIn(participant.id);
        setQueuedCheckInIds((current) => new Set(current).add(participant.id));
        toast.info('A check-in offline sorba került, és kapcsolatkor automatikusan szinkronizálódik.');
      } else {
        toast.error('Az állapot frissítése nem sikerült.');
      }
    } finally {
      setTransitioningIds((current) => {
        const next = new Set(current);
        next.delete(participant.id);
        return next;
      });
      if (nextStatus === 'checked_in' || nextStatus === 'completed') {
        void trackProductEvent(nextStatus, {
          event_id: participant.event_id, source: 'organizer', surface: 'organizer_dashboard', status: nextStatus,
        });
        if (nextStatus === 'completed') {
          void trackProductEvent('verified_or_confirmed_real_world_participation', {
            event_id: participant.event_id, source: 'organizer', surface: 'organizer_dashboard', status: 'completed',
          });
        }
      }
    }
  };

  const handleCompleteEvent = async () => {
    if (!selectedEvent || completionPending) return;
    const confirmed = window.confirm(
      'Biztosan lezárod az eseményt? A check-in résztvevők teljesített, a meg nem érkezett going résztvevők no-show állapotot kapnak.',
    );
    if (!confirmed) return;
    setCompletionPending(true);
    try {
      const result = await completeEventAtomic(selectedEvent.id, 'organizer_dashboard_manual_completion');
      void trackProductEvent('organizer_event_completed', {
        event_id: selectedEvent.id, source: 'organizer', surface: 'organizer_dashboard', status: 'completed',
        count_bucket: String(result.completion?.completed_participants ?? 0),
      });
      toast.success(`Esemény lezárva: ${result.completion?.completed_participants ?? 0} teljesített részvétel.`);
      await loadOwnedEvents();
    } catch (error) {
      console.error(error);
      toast.error('Az esemény lezárása nem sikerült. Ellenőrizd az időpontot és a jogosultságot.');
    } finally {
      setCompletionPending(false);
    }
  };

  const handleBulkTransition = async () => {
    if (!user || bulkPending) return;
    const selected = participants.filter((participant) => selectedParticipantIds.has(participant.id));
    if (selected.length === 0) {
      toast.info('Előbb válassz legalább egy résztvevőt.');
      return;
    }
    const decision = validateBulkParticipantTransition(selected.map((participant) => participant.status), bulkStatus);
    if (!decision.allowed) {
      toast.error(`Nem biztonságos tömeges átmenet innen: ${decision.invalidStatuses.join(', ')}.`);
      return;
    }
    if (!window.confirm(`${selected.length} résztvevő állapotát módosítod erre: ${getParticipationStatusLabel(bulkStatus)}. Folytatod?`)) return;

    setBulkPending(true);
    selected.forEach((participant) => setTransitioningIds((current) => new Set(current).add(participant.id)));
    const results = await Promise.allSettled(selected.map((participant) => transitionParticipation({
      participantId: participant.id,
      eventId: participant.event_id,
      actorUserId: user.id,
      nextStatus: bulkStatus,
      metadata: { from_status: participant.status, bulk: true },
    })));
    const succeeded = results.filter((result) => result.status === 'fulfilled').length;
    const failed = results.length - succeeded;
    if (succeeded > 0 && bulkStatus === 'completed' && selectedEventId) {
      void trackProductEvent('completed', {
        event_id: selectedEventId, source: 'organizer_bulk', surface: 'organizer_dashboard',
        status: 'completed', count_bucket: String(succeeded),
      });
      void trackProductEvent('verified_or_confirmed_real_world_participation', {
        event_id: selectedEventId, source: 'organizer_bulk', surface: 'organizer_dashboard',
        status: 'completed', count_bucket: String(succeeded),
      });
    }
    setTransitioningIds((current) => {
      const next = new Set(current);
      selected.forEach((participant) => next.delete(participant.id));
      return next;
    });
    setBulkPending(false);
    setSelectedParticipantIds(new Set());
    if (failed > 0) toast.error(`Részleges eredmény: ${succeeded} sikeres, ${failed} sikertelen.`);
    else toast.success(`${succeeded} résztvevő állapota frissítve.`);
    await Promise.all([loadParticipants(), loadAnalytics()]);
  };

  const handleSaveReadiness = async () => {
    if (!selectedEvent || readinessPending) return;
    setReadinessPending(true);
    try {
      const checklist = readinessItems.reduce<Record<string, boolean>>((result, item) => {
        result[item.key] = item.complete;
        return result;
      }, {});
      await saveOrganizerReadinessAssessment(selectedEvent.id, checklist);
      toast.success('A readiness pillanatkép elmentve. A checklist jelenleg tanácsadó jellegű.');
    } catch (error) {
      console.error(error);
      toast.error('A readiness checklist mentése nem sikerült.');
    } finally {
      setReadinessPending(false);
    }
  };

  const handleIncidentHandoff = async () => {
    if (!selectedEvent || incidentPending || incidentSummary.trim().length < 3) return;
    setIncidentPending(true);
    try {
      await createOrganizerIncidentHandoff({
        eventId: selectedEvent.id,
        incidentType,
        severity: incidentSeverity,
        summary: incidentSummary.trim(),
      });
      setIncidentSummary('');
      toast.success('Az incident handoff rögzítve; az operátori nyomkövetés megkezdhető.');
    } catch (error) {
      console.error(error);
      toast.error('Az incident handoff rögzítése nem sikerült.');
    } finally {
      setIncidentPending(false);
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
    if (!user || !selectedEventId || !messageBody.trim() || messagePending) return;
    if (audienceFilter === 'selected' && selectedParticipantIds.size === 0) {
      toast.error('A kijelölt célközönséghez válassz legalább egy résztvevőt az Attendees fülön.');
      return;
    }
    setMessagePending(true);
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
        selectedParticipationIds: audienceFilter === 'selected' ? [...selectedParticipantIds] : [],
      });
      toast.success(scheduledFor ? 'Üzenet ütemezve.' : 'Üzenet mentve a history-ba.');
      setMessageSubject('');
      setMessageBody('');
      setScheduledFor('');
      await loadMessages();
    } catch (error) {
      console.error(error);
      toast.error('Az üzenet mentése nem sikerült.');
    } finally {
      setMessagePending(false);
    }
  };

  const filteredCheckInCandidates = filterOrganizerCheckInCandidates(participants, checkInSearch, inviteCode);

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
                setSelectedParticipantIds(new Set());
                setLegalTaxReady(false);
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
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl sm:grid-cols-4 lg:grid-cols-8">
            {ORGANIZER_DASHBOARD_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>

          <OrganizerEventsTab
            events={events}
            selectedEventId={selectedEventId}
            completionPending={completionPending}
            onOpenEvent={(eventId) => navigate(`/events/${eventId}`)}
            onManageEvent={(eventId) => { setSelectedEventId(eventId); setActiveTab('attendees'); }}
            onCompleteEvent={() => void handleCompleteEvent()}
          />

          <OrganizerAttendeesTab
            participants={participants}
            participantSearch={participantSearch}
            participantFilter={participantFilter}
            selectedParticipantIds={selectedParticipantIds}
            bulkStatus={bulkStatus}
            bulkPending={bulkPending}
            queuedCheckInIds={queuedCheckInIds}
            transitioningIds={transitioningIds}
            onParticipantSearchChange={setParticipantSearch}
            onParticipantFilterChange={setParticipantFilter}
            onSelectedParticipantIdsChange={setSelectedParticipantIds}
            onBulkStatusChange={setBulkStatus}
            onExportCsv={exportCsv}
            onBulkTransition={() => void handleBulkTransition()}
            onTransition={(participant, nextStatus) => void handleTransition(participant, nextStatus)}
            onOpenParticipant={setSelectedParticipant}
          />

          <OrganizerCheckInTab
            candidates={filteredCheckInCandidates}
            checkInSearch={checkInSearch}
            inviteCode={inviteCode}
            queuedCheckInIds={queuedCheckInIds}
            transitioningIds={transitioningIds}
            onCheckInSearchChange={setCheckInSearch}
            onInviteCodeChange={setInviteCode}
            onTransition={(participant, nextStatus) => void handleTransition(participant, nextStatus)}
          />

          <OrganizerMessagesTab
            messageType={messageType}
            audienceFilter={audienceFilter}
            messageSubject={messageSubject}
            messageBody={messageBody}
            scheduledFor={scheduledFor}
            selectedParticipantCount={selectedParticipantIds.size}
            messagePending={messagePending}
            messages={messages}
            onMessageTypeChange={setMessageType}
            onAudienceFilterChange={setAudienceFilter}
            onMessageSubjectChange={setMessageSubject}
            onMessageBodyChange={setMessageBody}
            onScheduledForChange={setScheduledFor}
            onSendMessage={() => void handleSendMessage()}
          />

          <OrganizerCrewTab
            eventId={selectedEvent?.id ?? null}
            eventTitle={selectedEvent?.title ?? null}
            canManage={Boolean(selectedEvent)}
          />

          <OrganizerAnalyticsTab analytics={analytics} />

          <OrganizerSourcesTab />

          <OrganizerSettingsTab
            selectedEventId={selectedEvent?.id ?? null}
            readinessItems={readinessItems}
            legalTaxReady={legalTaxReady}
            readinessPending={readinessPending}
            reliability={reliability}
            incidentType={incidentType}
            incidentSeverity={incidentSeverity}
            incidentSummary={incidentSummary}
            incidentPending={incidentPending}
            onLegalTaxReadyChange={setLegalTaxReady}
            onSaveReadiness={() => void handleSaveReadiness()}
            onIncidentTypeChange={setIncidentType}
            onIncidentSeverityChange={setIncidentSeverity}
            onIncidentSummaryChange={setIncidentSummary}
            onIncidentHandoff={() => void handleIncidentHandoff()}
            onOperationsChanged={loadOwnedEvents}
          />
        </Tabs>
        <div className="mt-6"><OrganizerAiProposalInbox /></div>
      </div>

      <OrganizerParticipantDetailSheet
        participant={selectedParticipant}
        participantAudit={participantAudit}
        transitioningIds={transitioningIds}
        onClose={() => setSelectedParticipant(null)}
        onParticipantChange={setSelectedParticipant}
        onTransition={(participant, nextStatus) => void handleTransition(participant, nextStatus)}
        onSaveNote={() => void handleSaveNote()}
      />
    </main>
  );
}


