import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Calendar, MapPin, Users, Clock, ArrowLeft, ExternalLink, Edit2, Share2, Tag, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LeaveEventDialog } from "@/components/LeaveEventDialog";
import { EditEventDialog } from "@/components/EditEventDialog";
import { MapyTripPlanner } from '@/components/MapyTripPlanner';
import type { TripPlanDraft } from '@/lib/mapy';
import { getEventTripPlan } from '@/lib/tripPlans';
import { getParticipantStats } from '@/lib/eventParticipantStats';
import { SafetyActions } from '@/components/safety/SafetyActions';
import { trackProductEvent } from '@/lib/productAnalyticsClient';
import { EventSafetyPanel, type EventSafetySummary } from '@/components/safety/EventSafetyPanel';
import { cancelEventParticipation, getSafeEventDetail, joinEventAtomic } from '@/lib/eventOperations';
import { EventExpectationPanel } from '@/components/events/EventExpectationPanel';
import { PostEventFeedbackCard } from '@/components/events/PostEventFeedbackCard';
import { ArrivalConfidenceCard } from '@/components/events/ArrivalConfidenceCard';
import { resolveLocationPrecision, type ParticipantLifecycleStatus } from '@/lib/eventLifecycle';
import { ExternalEventSocialIntentCard } from '@/components/events/ExternalEventSocialIntentCard';

interface EventData {
  id: string;
  title: string;
  category: string;
  event_date: string | null;
  event_time: string | null;
  location_city: string | null;
  location_district: string | null;
  location_address: string | null;
  location_free_text: string | null;
  location_type: string | null;
  max_attendees: number | null;
  image_emoji: string | null;
  tags: string[] | null;
  description: string | null;
  created_by: string;
  is_active?: boolean;
  created_at?: string;
  waitlist_enabled?: boolean | null;
  location_lat?: number | null;
  location_lon?: number | null;
  place_name?: string | null;
  place_address?: string | null;
  place_city?: string | null;
  place_postcode?: string | null;
  place_country?: string | null;
  place_source?: string | null;
  meeting_instructions?: string | null;
  expected_end_at?: string | null;
  beginner_friendly?: boolean | null;
  activity_intensity?: string | null;
  equipment_required?: string | null;
  accessibility_info?: string | null;
  cost_details?: string | null;
  cancellation_policy?: string | null;
  outcome_status?: string | null;
  completed_at?: string | null;
  visibility_type?: string | null;
  private_location_reveal_hours?: number | null;
  _location_precision?: 'coarse' | 'rsvp_detail' | 'full';
  _exact_location_visible?: boolean;
  external_event_id?: string;
}

const ACTIVE_PARTICIPATION_STATUSES = new Set<ParticipantLifecycleStatus>([
  'going',
  'waitlist',
  'checked_in',
  'completed',
]);

const PARTICIPATION_STATUSES = new Set<ParticipantLifecycleStatus>([
  'invited',
  'interested',
  'going',
  'waitlist',
  'checked_in',
  'completed',
  'cancelled',
  'no_show',
]);

function asParticipantLifecycleStatus(value: string | null | undefined): ParticipantLifecycleStatus | null {
  return value && PARTICIPATION_STATUSES.has(value as ParticipantLifecycleStatus)
    ? value as ParticipantLifecycleStatus
    : null;
}

interface ParticipationLookup {
  status: string;
  arriving_alone: boolean | null;
  first_hobbeast_event: boolean | null;
}

const SAMPLE_EVENTS = [
  { id: 'sample-1', title: 'Vasárnapi futóklub a Városligetben', category: 'Sport', event_date: '2026-03-15', event_time: '08:00', location_city: 'Budapest', location_district: null, location_address: 'Városliget', location_free_text: null, location_type: 'address', max_attendees: 40, image_emoji: '🏃', tags: ['Futás', 'Reggeli', 'Kezdő-barát'], description: 'Csatlakozz a vasárnapi futóklubjunkhoz! Minden szintet szívesen látunk, a Városliget körül futunk 5-10 km-t, utána közös reggeli.', created_by: '', participant_count: 23 },
  { id: 'sample-2', title: 'Board Game Night – Társasest', category: 'Társasjátékok', event_date: '2026-03-16', event_time: '18:00', location_city: 'Budapest', location_district: null, location_address: 'Szimpla Kert', location_free_text: null, location_type: 'address', max_attendees: 20, image_emoji: '🎲', tags: ['Társasozás', 'Esti program'], description: 'Gyere el a heti társasestre! Catan, Ticket to Ride, Dixit és sok más játék vár.', created_by: '', participant_count: 12 },
  { id: 'sample-3', title: 'Akrilfestés workshop kezdőknek', category: 'Kreatív', event_date: '2026-03-18', event_time: '16:00', location_city: 'Budapest', location_district: null, location_address: 'Művész Stúdió', location_free_text: null, location_type: 'address', max_attendees: 12, image_emoji: '🎨', tags: ['Festés', 'Workshop', 'Kezdő'], description: 'Ismerd meg az akrilfestés alapjait egy kellemes délutáni workshopon! Minden anyagot biztosítunk.', created_by: '', participant_count: 8 },
  { id: 'sample-4', title: 'Buda Hills túra – tavaszi kirándulás', category: 'Túra', event_date: '2026-03-20', event_time: '09:00', location_city: 'Budapest', location_district: null, location_address: 'Normafa', location_free_text: null, location_type: 'address', max_attendees: 50, image_emoji: '🏔️', tags: ['Kirándulás', 'Természet'], description: 'Tavaszi túra a Budai-hegyekben! Normafától indulunk, kb. 12 km-es körtúra, közepesen nehéz.', created_by: '', participant_count: 31 },
  { id: 'sample-5', title: 'Akusztikus jam session', category: 'Zene', event_date: '2026-03-22', event_time: '19:30', location_city: 'Wien', location_district: null, location_address: 'Café Prückel', location_free_text: null, location_type: 'address', max_attendees: 15, image_emoji: '🎸', tags: ['Gitár', 'Jam'], description: 'Akusztikus zenélés egy hangulatos bécsi kávézóban. Hozd a hangszered!', created_by: '', participant_count: 6 },
  { id: 'sample-6', title: 'Street Food & Cooking Challenge', category: 'Gasztronómia', event_date: '2026-03-23', event_time: '11:00', location_city: 'Budapest', location_district: null, location_address: 'Bálna', location_free_text: null, location_type: 'address', max_attendees: 30, image_emoji: '👨‍🍳', tags: ['Főzés', 'Verseny'], description: 'Street food stílusú főzőverseny a Bálnában! Csapatban vagy egyénileg, díjak a nyerteseknek.', created_by: '', participant_count: 18 },
];

const EventDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [event, setEvent] = useState<EventData | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [hasJoined, setHasJoined] = useState(false);
  const [participationStatus, setParticipationStatus] = useState<ParticipantLifecycleStatus | null>(null);
  const [arrivalConfidence, setArrivalConfidenceState] = useState({
    arrivingAlone: null as boolean | null,
    firstHobbeastEvent: null as boolean | null,
  });
  const [hostDisplayName, setHostDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLeave, setShowLeave] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [isExternal, setIsExternal] = useState(false);
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const [externalSource, setExternalSource] = useState<string>('');
  const [tripPlan, setTripPlan] = useState<TripPlanDraft | null>(null);
  const [eventSafety, setEventSafety] = useState<EventSafetySummary | null>(null);
  const [eventSafetyLoaded, setEventSafetyLoaded] = useState(false);
  const trackedDetailId = useRef<string | null>(null);

  const handleSafetySummary = useCallback((summary: EventSafetySummary | null) => {
    setEventSafety(summary);
    setEventSafetyLoaded(true);
  }, []);

  useEffect(() => {
    if (!user || !event || !id || isExternal || id.startsWith('sample-') || trackedDetailId.current === id) return;
    trackedDetailId.current = id;
    void trackProductEvent('event_detail', {
      event_id: id,
      category: event.category,
      source: 'native',
      surface: 'event_detail',
    });
  }, [event, id, isExternal, user]);

  useEffect(() => {
    if (!id) return;

    // Check if it's a sample event
    if (id.startsWith('sample-')) {
      const sample = SAMPLE_EVENTS.find(s => s.id === id);
      if (sample) {
        setEvent(sample);
        setParticipantCount(sample.participant_count);
      }
      setLoading(false);
      return;
    }

    // Check if it's an external event (stored in sessionStorage from Events page)
    if (id.startsWith('eb-') || id.startsWith('ext-')) {
      const stored = sessionStorage.getItem(`event-${id}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setEvent(parsed);
          setIsExternal(true);
          setExternalUrl(parsed.eventbrite_url || parsed.external_url || null);
          setExternalSource(parsed.source_label || parsed.external_source || 'Külső');
          setParticipantCount(parsed.participant_count || 0);
        } catch (err) {
          // P0 (v1.7.4): guard against corrupted sessionStorage payloads.
          console.error('Failed to parse external event payload', err);
          sessionStorage.removeItem(`event-${id}`);
        }
      }
      setLoading(false);
      return;
    }

    // Fetch from DB
    const fetchEvent = async () => {
      const data = await getSafeEventDetail(id).catch((error) => {
        console.error('Failed to load safe event detail', error);
        return null;
      }) as EventData | null;
      if (data) {
        setEvent(data);
        const { data: hostProfile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', data.created_by)
          .maybeSingle();
        setHostDisplayName(hostProfile?.display_name?.trim() || null);
        const stats = await getParticipantStats(id);
        setParticipantCount(stats.total);
        try {
          if (data._exact_location_visible !== true) {
            setTripPlan(null);
          } else {
            const loadedTripPlan = await getEventTripPlan(id);
            setTripPlan(loadedTripPlan);
          }
        } catch (tripPlanError) {
          console.error('Failed to load trip plan', tripPlanError);
        }
      }

      // Check if user has joined
      if (user) {
        const { data: participation } = await supabase
          .from('event_participants')
          .select('id,status,arriving_alone,first_hobbeast_event')
          .eq('event_id', id)
          .eq('user_id', user.id)
          .maybeSingle();
        const participationRow = participation as unknown as ParticipationLookup | null;
        const status = asParticipantLifecycleStatus(participationRow?.status);
        setParticipationStatus(status);
        setHasJoined(Boolean(status && ACTIVE_PARTICIPATION_STATUSES.has(status)));
        setArrivalConfidenceState({
          arrivingAlone: participationRow?.arriving_alone ?? null,
          firstHobbeastEvent: participationRow?.first_hobbeast_event ?? null,
        });
      }

      setLoading(false);
    };
    fetchEvent();
  }, [id, user]);

  const handleJoin = async () => {
    if (!user) { navigate('/auth?redirect=/events/' + id); return; }
    if (!id || id.startsWith('sample-')) { toast.info('Ez egy bemutató esemény.'); return; }

    try {
      const participation = await joinEventAtomic(id);
      if (!participation) throw new Error('EVENT_OPERATION_FAILED');
      if (participation.replayed) toast.info('Már csatlakoztál ehhez az eseményhez.');
      else if (participation.participation_status === 'waitlist') toast.info('Az esemény betelt, felkerültél a várólistára!');
      else toast.success('Sikeresen csatlakoztál!');

      setHasJoined(true);
      setParticipationStatus(participation.participation_status);
      setArrivalConfidenceState({ arrivingAlone: null, firstHobbeastEvent: null });
      const refreshedEvent = await getSafeEventDetail(id).catch(() => null) as EventData | null;
      if (refreshedEvent) {
        setEvent(refreshedEvent);
        if (refreshedEvent._exact_location_visible) {
          getEventTripPlan(id).then(setTripPlan).catch((error) => console.error('Failed to refresh trip plan after join', error));
        }
      }
      const stats = await getParticipantStats(id);
      setParticipantCount(stats.total);
      if (!participation.replayed) {
        void trackProductEvent(participation.participation_status === 'waitlist' ? 'waitlist_joined' : 'event_join', {
          event_id: id,
          category: event?.category || 'unknown',
          source: 'native',
          status: participation.participation_status,
        });
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : 'EVENT_OPERATION_FAILED';
      if (code === 'EVENT_FULL_NO_WAITLIST') toast.error('Az esemény betelt és nincs várólista.');
      else if (code === 'EVENT_NOT_JOINABLE' || code === 'EVENT_ALREADY_STARTED') toast.error('Ehhez az eseményhez már nem lehet csatlakozni.');
      else if (code === 'USER_SUSPENDED') toast.error('A fiókodra vonatkozó korlátozás miatt most nem csatlakozhatsz.');
      else if (code === 'EVENT_ORGANIZER_BLOCKED') toast.error('A tiltási beállítások miatt ehhez az eseményhez nem csatlakozhatsz.');
      else toast.error('A csatlakozás nem sikerült. Próbáld újra.');
    }
  };

  const handleLeave = async () => {
    if (!user || !id) return;
    try {
      await cancelEventParticipation(id);
      toast.success('Sikeresen kiléptél az eseményből.');
      setHasJoined(false);
      setParticipationStatus('cancelled');
      setArrivalConfidenceState({ arrivingAlone: null, firstHobbeastEvent: null });
      const refreshedEvent = await getSafeEventDetail(id).catch(() => null) as EventData | null;
      if (refreshedEvent) setEvent(refreshedEvent);
      setTripPlan(null);
      const stats = await getParticipantStats(id);
      setParticipantCount(stats.total);
    } catch {
      toast.error('Hiba a kilépéskor.');
    }
    setShowLeave(false);
  };

  const getLocationPrecision = (ev: EventData) => {
    if (ev._location_precision) return ev._location_precision;
    const eventStart = ev.event_date
      ? new Date(`${ev.event_date}T${ev.event_time || '00:00:00'}`)
      : null;
    const validEventStart = eventStart && !Number.isNaN(eventStart.getTime()) ? eventStart : null;
    const safetyRestricted = !eventSafetyLoaded
      || Boolean(eventSafety && ['participant_only', 'private_exact_after_join'].includes(eventSafety.venue_visibility));
    const isPrivate = (ev.visibility_type !== null && ev.visibility_type !== undefined && ev.visibility_type !== 'public')
      || safetyRestricted;

    return resolveLocationPrecision({
      isPrivate,
      isOrganizer: ev.created_by === user?.id,
      hasActiveRsvp: hasJoined,
      eventStart: validEventStart,
      revealWindowHours: ev.private_location_reveal_hours ?? 24,
    });
  };

  const getLocationString = (ev: EventData) => {
    const precision = getLocationPrecision(ev);
    const parts = precision === 'coarse'
      ? [ev.location_city, ev.location_district, 'Pontos helyszín csatlakozás után']
      : precision === 'rsvp_detail'
        ? [ev.location_city, ev.location_district, ev.place_name, 'Részletes instrukció az esemény közeledtével']
        : [ev.location_city, ev.location_district, ev.location_address, ev.location_free_text];
    if (ev.location_type === 'online') return '🌐 Online esemény';
    return parts.filter(Boolean).join(', ') || 'Helyszín nem megadva';
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Dátum nélkül';
    const d = new Date(dateStr);
    return d.toLocaleDateString('hu-HU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const isOwner = user && event && event.created_by === user.id;
  const isSample = id?.startsWith('sample-');

  if (loading) {
    return (
      <main className="pt-24 pb-16 min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </main>
    );
  }

  if (!event) {
    return (
      <main className="pt-24 pb-16 min-h-screen">
        <div className="container mx-auto px-4 text-center py-20">
          <p className="text-xl text-muted-foreground mb-4">Az esemény nem található 😔</p>
          <Button variant="outline" onClick={() => navigate('/events')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Vissza az eseményekhez
          </Button>
        </div>
      </main>
    );
  }

  const locationPrecision = getLocationPrecision(event);

  return (
    <main className="pt-24 pb-16 min-h-screen">
      <div className="container mx-auto px-4 max-w-3xl">
        {/* Back button */}
        <Button variant="ghost" size="sm" onClick={() => navigate('/events')} className="mb-4 rounded-xl">
          <ArrowLeft className="h-4 w-4 mr-1" /> Vissza
        </Button>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Hero */}
          <div className="rounded-2xl gradient-warm h-48 sm:h-56 flex items-center justify-center mb-6 relative overflow-hidden">
            <span className="text-7xl sm:text-8xl">{event.image_emoji || '🎉'}</span>
            {isExternal && (
              <Badge className="absolute top-4 right-4 bg-accent text-accent-foreground border-0">
                {externalSource}
              </Badge>
            )}
          </div>

          {/* Title + badges */}
          <div className="mb-6">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h1 className="text-2xl sm:text-3xl font-display font-bold leading-tight">{event.title}</h1>
              {isOwner && !isSample && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-xl flex-shrink-0" onClick={() => navigate(`/organizer?event=${id}`)}>
                    <Settings className="h-3.5 w-3.5 mr-1" /> Szervezés
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-xl flex-shrink-0" onClick={() => setShowEdit(true)}>
                    <Edit2 className="h-3.5 w-3.5 mr-1" /> Szerkesztés
                  </Button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{event.category}</Badge>
              {event.tags?.map(tag => (
                <Badge key={tag} variant="outline" className="text-xs"><Tag className="h-3 w-3 mr-1" />{tag}</Badge>
              ))}
            </div>
          </div>

          {/* Info cards */}
          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            <Card className="rounded-xl">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 flex-shrink-0">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Időpont</p>
                  <p className="font-medium">{formatDate(event.event_date)}</p>
                  {event.event_time && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="h-3.5 w-3.5" /> {event.event_time}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-xl">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 flex-shrink-0">
                  <MapPin className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Helyszín</p>
                  <p className="font-medium">{getLocationString(event)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-xl sm:col-span-2">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10 flex-shrink-0">
                  <Users className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Résztvevők</p>
                  <p className="font-medium">
                    {participantCount}{event.max_attendees ? ` / ${event.max_attendees}` : ''} fő
                  </p>
                  {event.max_attendees && participantCount >= event.max_attendees && (
                    <p className="text-xs text-destructive mt-0.5">Az esemény betelt!</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Venue / Place block */}
          {event.place_name && locationPrecision !== 'coarse' && (
            <Card className="rounded-xl mb-6">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 flex-shrink-0">
                  <MapPin className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Helyszín részletei</p>
                  <p className="font-medium">{event.place_name}</p>
                  {event.place_address && locationPrecision === 'full' && <p className="text-sm text-muted-foreground">{event.place_address}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[event.place_city, event.place_postcode, event.place_country].filter(Boolean).join(', ')}
                  </p>
                  {event.place_source && (
                    <Badge variant="outline" className="text-[10px] mt-1">{event.place_source}</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Description */}
          {event.description && (
            <Card className="rounded-xl mb-6">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Leírás</p>
                <p className="text-foreground leading-relaxed whitespace-pre-line">{event.description}</p>
              </CardContent>
            </Card>
          )}

          {!isSample && !isExternal && (
            <div className="mb-6">
              <EventExpectationPanel
                isOrganizer={Boolean(isOwner)}
                data={{
                  meetingInstructions: locationPrecision === 'full' ? event.meeting_instructions : null,
                  maxAttendees: event.max_attendees,
                  beginnerFriendly: event.beginner_friendly,
                  activityIntensity: event.activity_intensity,
                  equipmentRequired: event.equipment_required,
                  accessibilityInfo: event.accessibility_info,
                  costDetails: event.cost_details,
                  expectedEndAt: event.expected_end_at,
                  hostName: hostDisplayName,
                  cancellationPolicy: event.cancellation_policy,
                }}
              />
            </div>
          )}

          {tripPlan && locationPrecision === 'full' && (
            <div className="mb-6">
              <MapyTripPlanner value={tripPlan} readOnly />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {isExternal && externalUrl ? (
              <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button className="w-full h-12 rounded-xl gradient-primary text-primary-foreground border-0 shadow-glow font-semibold">
                  <ExternalLink className="h-4 w-4 mr-2" /> Megnézem ({externalSource})
                </Button>
              </a>
            ) : isSample ? (
              <Button className="flex-1 h-12 rounded-xl gradient-primary text-primary-foreground border-0 shadow-glow font-semibold" onClick={() => toast.info('Ez egy bemutató esemény.')}>
                Csatlakozom
              </Button>
            ) : participationStatus === 'completed' ? (
              <Button disabled variant="secondary" className="flex-1 h-12 rounded-xl font-semibold">
                Esemény teljesítve
              </Button>
            ) : hasJoined ? (
              <Button variant="outline" className="flex-1 h-12 rounded-xl border-destructive text-destructive hover:bg-destructive/10 font-semibold"
                onClick={() => setShowLeave(true)}>
                Leiratkozás
              </Button>
            ) : (
              <Button className="flex-1 h-12 rounded-xl gradient-primary text-primary-foreground border-0 shadow-glow font-semibold" onClick={handleJoin}>
                Csatlakozom
              </Button>
            )}
            <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl" onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              toast.success('Link másolva!');
            }}>
              <Share2 className="h-4 w-4" />
            </Button>
          </div>

          {isExternal && event.external_event_id && (
            <ExternalEventSocialIntentCard
              externalEventId={event.external_event_id}
              authenticated={Boolean(user)}
              onRequestSignIn={() => navigate(`/auth?redirect=/events/${id}`)}
            />
          )}

          {!isOwner && !isSample && !isExternal && hasJoined && participationStatus !== 'completed' && id && (
            <div className="mt-6">
              <ArrivalConfidenceCard
                key={`${id}-${participationStatus}`}
                eventId={id}
                initialArrivingAlone={arrivalConfidence.arrivingAlone}
                initialFirstHobbeastEvent={arrivalConfidence.firstHobbeastEvent}
              />
            </div>
          )}

          {!isOwner && !isSample && id && (
            <SafetyActions
              className="mt-3"
              targetType="event"
              targetRef={id}
              targetUserId={event.created_by || null}
              sourceSurface="event_detail"
            />
          )}

          {!isSample && !isExternal && id && (
            <EventSafetyPanel eventId={id} isOwner={Boolean(isOwner)} onSummary={handleSafetySummary} />
          )}

          {!isOwner && !isSample && !isExternal && participationStatus === 'completed' && id && (
            <div className="mt-6">
              <PostEventFeedbackCard eventId={id} />
            </div>
          )}
        </motion.div>
      </div>

      {/* Leave confirmation dialog */}
      {showLeave && event && (
        <LeaveEventDialog
          eventTitle={event.title}
          eventDate={formatDate(event.event_date)}
          eventTime={event.event_time}
          eventLocation={getLocationString(event)}
          onConfirm={handleLeave}
          onCancel={() => setShowLeave(false)}
        />
      )}

      {/* Edit dialog */}
      {showEdit && event && !isSample && (
        <EditEventDialog
          event={event}
          onClose={() => setShowEdit(false)}
          onUpdated={() => {
            setShowEdit(false);
            // Re-fetch
            if (id) {
              getSafeEventDetail(id)
                .then(async (rawData) => {
                  const data = rawData as EventData | null;
                  if (data) {
                    setEvent(data);
                    const stats = await getParticipantStats(id);
                    setParticipantCount(stats.total);
                    if (data._exact_location_visible) {
                      getEventTripPlan(id)
                        .then((plan) => setTripPlan(plan))
                        .catch((error) => console.error('Failed to refresh trip plan', error));
                    } else {
                      setTripPlan(null);
                    }
                  }
                })
                .catch((error) => console.error('Failed to refresh safe event detail', error));
            }
          }}
        />
      )}
    </main>
  );
};

export default EventDetail;
