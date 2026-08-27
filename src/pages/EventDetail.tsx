import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Calendar, MapPin, Users, Clock, ArrowLeft, ExternalLink, Edit2, Tag, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShareMenu } from "@/components/sharing/ShareMenu";
import { LeaveEventDialog } from "@/components/LeaveEventDialog";
import { EditEventDialog } from "@/components/EditEventDialog";
import { MapyTripPlanner } from '@/components/MapyTripPlanner';
import type { TripPlanDraft } from '@/lib/mapy';
import { getEventTripPlan } from '@/lib/tripPlans';
import { getParticipantStats } from '@/lib/eventParticipantStats';
import { SafetyActions } from '@/components/safety/SafetyActions';
import { trackProductEvent } from '@/lib/productAnalyticsClient';
import { trackOutboundClick } from '@/lib/outboundTracking';
import { EventSafetyPanel, type EventSafetySummary } from '@/components/safety/EventSafetyPanel';
import { cancelEventParticipation, getSafeEventDetail, getSafeExternalEvent, joinEventAtomic } from '@/lib/eventOperations';
import { ExternalEventCompanionCard } from '@/components/events/ExternalEventCompanionCard';
import { categoryEmoji, providerLabel } from '@/lib/external-events/normalize';
import type { ExternalEventNormalized } from '@/lib/external-events/types';
import { EventExpectationPanel } from '@/components/events/EventExpectationPanel';
import { PostEventFeedbackCard } from '@/components/events/PostEventFeedbackCard';
import { ArrivalConfidenceCard } from '@/components/events/ArrivalConfidenceCard';
import { EventUpdatesCard } from '@/components/events/EventUpdatesCard';
import { resolveLocationPrecision, type ParticipantLifecycleStatus } from '@/lib/eventLifecycle';
import { ExternalEventSocialIntentCard } from '@/components/events/ExternalEventSocialIntentCard';
import { SaveAndCalendarActions } from '@/components/events/SaveAndCalendarActions';

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

/**
 * An external program rendered on the same page as a Hobbeast event. It stays
 * an external program — nothing is copied into `events` — this only reshapes
 * the row so the existing layout can display it.
 */
function externalEventToDetail(row: Record<string, unknown>, externalEventId: string): EventData {
  const text = (key: string) => (typeof row[key] === 'string' && row[key] ? row[key] as string : null);
  const number = (key: string) => (typeof row[key] === 'number' ? row[key] as number : null);
  return {
    id: externalEventId,
    title: text('title') || 'Program',
    category: text('subcategory') || text('category') || 'Külső program',
    event_date: text('event_date'),
    event_time: text('event_time'),
    location_city: text('location_city'),
    location_district: null,
    location_address: text('location_address'),
    location_free_text: text('location_free_text'),
    location_type: text('location_type'),
    max_attendees: number('max_attendees'),
    image_emoji: categoryEmoji(text('category')),
    tags: Array.isArray(row.tags) ? (row.tags as unknown[]).filter((tag): tag is string => typeof tag === 'string') : null,
    description: text('description'),
    created_by: '',
    location_lat: number('location_lat'),
    location_lon: number('location_lon'),
    external_event_id: externalEventId,
    _location_precision: 'full',
    _exact_location_visible: true,
  };
}

function getEventVisualTone(category: string) {
  const normalized = category.toLocaleLowerCase('hu-HU');
  if (/(sport|fut|túra|terep|természet)/.test(normalized)) return 'from-primary/30 via-primary/10 to-secondary';
  if (/(kreatív|művész|zene|fest)/.test(normalized)) return 'from-accent/30 via-accent/10 to-secondary';
  if (/(gasztro|főz|étel)/.test(normalized)) return 'from-amber-200/80 via-accent/10 to-secondary';
  return 'from-secondary via-primary/[0.09] to-accent/[0.14]';
}

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

      // Not one of our own events? Then the id may belong to an external
      // program. Its map card and any shared link point straight at it, and
      // before this fallback existed both ended on "nem található".
      if (!data) {
        const external = await getSafeExternalEvent(id).catch((error) => {
          console.error('Failed to load external program', error);
          return null;
        });
        if (external) {
          setEvent(externalEventToDetail(external, id));
          setIsExternal(true);
          setExternalUrl(typeof external.external_url === 'string' ? external.external_url : null);
          setExternalSource(providerLabel(
            String(external.external_source || '') as ExternalEventNormalized['external_source'],
          ));
          setParticipantCount(0);
        }
        setLoading(false);
        return;
      }

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
      <main className="flex min-h-screen items-center justify-center px-4 pb-16 pt-28">
        <div role="status" className="flex min-w-64 flex-col items-center rounded-[2rem] border border-border/70 bg-card/90 px-8 py-12 text-center shadow-xl shadow-primary/[0.05]">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          <p className="mt-4 font-display font-semibold">Esemény betöltése</p>
          <p className="mt-1 text-sm text-muted-foreground">Egy pillanat, összekészítjük a részleteket.</p>
        </div>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="min-h-screen px-4 pb-16 pt-28">
        <div className="container mx-auto max-w-xl rounded-[2rem] border border-border/70 bg-card/90 px-6 py-16 text-center shadow-xl shadow-primary/[0.05]">
          <span aria-hidden="true" className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-2xl">🗓️</span>
          <h1 className="font-display text-2xl font-semibold">Az esemény nem található</h1>
          <p className="mx-auto mb-6 mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Lehet, hogy a programot időközben levették, vagy a hivatkozás már nem érvényes.</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => navigate('/events')}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Vissza az eseményekhez
            </Button>
            <Button variant="ghost" className="rounded-full" onClick={() => navigate('/events/map')}>
              <MapPin className="h-4 w-4 mr-2" /> Térképes nézet
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const locationPrecision = getLocationPrecision(event);
  const visualTone = getEventVisualTone(event.category);

  return (
    <main className="relative min-h-screen overflow-hidden pb-20 pt-28 sm:pt-32">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-24 h-80 w-80 rounded-full bg-primary/[0.07] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 top-[30rem] h-96 w-96 rounded-full bg-accent/[0.08] blur-3xl" />
      <div className="container relative mx-auto max-w-5xl px-4 sm:px-6">
        {/* Back button */}
        <Button variant="ghost" size="sm" onClick={() => navigate('/events')} className="mb-5 rounded-full bg-card/60 backdrop-blur-sm">
          <ArrowLeft className="h-4 w-4 mr-1" /> Vissza
        </Button>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Hero */}
          <div className={`relative mb-7 flex h-80 items-center justify-center overflow-hidden rounded-[2.5rem] border border-white/60 bg-gradient-to-br shadow-2xl shadow-primary/10 sm:h-96 ${visualTone}`}>
            <span aria-hidden="true" className="absolute -left-16 -top-20 h-64 w-64 rounded-full border border-white/50 bg-card/15" />
            <span aria-hidden="true" className="absolute -bottom-28 -right-14 h-80 w-80 rounded-full border border-white/50 bg-card/25" />
            <span aria-hidden="true" className="absolute right-[20%] top-10 h-20 w-20 rounded-full bg-card/25 blur-xl" />
            <span aria-hidden="true" className="mb-16 flex h-32 w-32 items-center justify-center rounded-[2.5rem] border border-white/70 bg-card/65 text-7xl shadow-2xl shadow-foreground/10 backdrop-blur-sm sm:h-40 sm:w-40 sm:text-8xl">{event.image_emoji || '🎉'}</span>
            {isExternal && (
              <Badge className="absolute right-5 top-5 rounded-full border border-white/60 bg-card/80 text-foreground shadow-sm backdrop-blur-sm">
                {externalSource}
              </Badge>
            )}

            <div className="absolute inset-x-3 bottom-3 rounded-[1.8rem] border border-white/60 bg-card/80 p-5 shadow-lg backdrop-blur-md sm:inset-x-5 sm:bottom-5 sm:p-7">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full bg-primary/10 text-primary">{event.category}</Badge>
                {event.tags?.slice(0, 3).map(tag => (
                  <Badge key={tag} variant="outline" className="hidden rounded-full bg-card/50 text-xs font-normal sm:inline-flex"><Tag className="mr-1 h-3 w-3" />{tag}</Badge>
                ))}
              </div>
              <h1 className="max-w-4xl font-display text-2xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">{event.title}</h1>
            </div>
          </div>

          {/* Title + badges */}
          {(event.tags?.length || (isOwner && !isSample)) && (
            <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 sm:hidden">
                {event.tags?.map(tag => (
                  <Badge key={tag} variant="outline" className="rounded-full bg-card/60 text-xs"><Tag className="mr-1 h-3 w-3" />{tag}</Badge>
                ))}
              </div>
              {isOwner && !isSample && (
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="flex-shrink-0 rounded-full bg-card/70" onClick={() => navigate(`/organizer?event=${id}`)}>
                    <Settings className="mr-1 h-3.5 w-3.5" /> Szervezés
                  </Button>
                  <Button variant="outline" size="sm" className="flex-shrink-0 rounded-full bg-card/70" onClick={() => setShowEdit(true)}>
                    <Edit2 className="mr-1 h-3.5 w-3.5" /> Szerkesztés
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Info cards */}
          <div className="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="rounded-[1.75rem] border-border/70 bg-card/95 shadow-lg shadow-primary/[0.04]">
              <CardContent className="flex items-start gap-4 p-5 sm:p-6">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Időpont</p>
                  <p className="mt-1 font-medium leading-snug">{formatDate(event.event_date)}</p>
                  {event.event_time && (
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" /> {event.event_time}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] border-border/70 bg-card/95 shadow-lg shadow-primary/[0.04]">
              <CardContent className="flex items-start gap-4 p-5 sm:p-6">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-accent/10">
                  <MapPin className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Helyszín</p>
                  <p className="mt-1 font-medium leading-snug">{getLocationString(event)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] border-border/70 bg-card/95 shadow-lg shadow-primary/[0.04] sm:col-span-2 lg:col-span-1">
              <CardContent className="flex items-start gap-4 p-5 sm:p-6">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-secondary">
                  <Users className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Résztvevők</p>
                  <p className="mt-1 font-medium">
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
            <Card className="mb-7 rounded-[1.75rem] border-border/70 bg-card/95 shadow-lg shadow-primary/[0.04]">
              <CardContent className="flex items-start gap-4 p-5 sm:p-6">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-accent/10">
                  <MapPin className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Helyszín részletei</p>
                  <p className="mt-1 font-medium">{event.place_name}</p>
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
            <Card className="mb-7 rounded-[1.75rem] border-border/70 bg-card/95 shadow-lg shadow-primary/[0.04]">
              <CardContent className="p-6 sm:p-8">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Az élményről</p>
                <p className="whitespace-pre-line text-base leading-7 text-foreground sm:text-lg sm:leading-8">{event.description}</p>
              </CardContent>
            </Card>
          )}

          {!isSample && !isExternal && (
            <div className="mb-7">
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
            <div className="mb-7">
              <MapyTripPlanner value={tripPlan} readOnly />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 rounded-[1.75rem] border border-primary/15 bg-primary/[0.06] p-3 shadow-lg shadow-primary/[0.04] sm:p-4">
            {isExternal && externalUrl ? (
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
                onClick={() => trackOutboundClick(event.external_event_id, 'event_detail')}
              >
                <Button className="h-12 w-full rounded-full border-0 gradient-primary font-semibold text-primary-foreground shadow-glow">
                  <ExternalLink className="h-4 w-4 mr-2" /> Megnézem ({externalSource})
                </Button>
              </a>
            ) : isSample ? (
              <Button className="h-12 flex-1 rounded-full border-0 gradient-primary font-semibold text-primary-foreground shadow-glow" onClick={() => toast.info('Ez egy bemutató esemény.')}>
                Csatlakozom
              </Button>
            ) : participationStatus === 'completed' ? (
              <Button disabled variant="secondary" className="h-12 flex-1 rounded-full font-semibold">
                Esemény teljesítve
              </Button>
            ) : hasJoined ? (
              <Button variant="outline" className="h-12 flex-1 rounded-full border-destructive bg-card font-semibold text-destructive hover:bg-destructive/10"
                onClick={() => setShowLeave(true)}>
                Leiratkozás
              </Button>
            ) : (
              <Button className="h-12 flex-1 rounded-full border-0 gradient-primary font-semibold text-primary-foreground shadow-glow" onClick={handleJoin}>
                Csatlakozom
              </Button>
            )}
            <ShareMenu
              subject={{
                title: event.title,
                when: [formatDate(event.event_date), event.event_time?.slice(0, 5)]
                  .filter(Boolean).join(', ') || null,
                where: event.location_city || event.location_address || null,
              }}
            />
          </div>

          <div className="mt-4">
            <SaveAndCalendarActions
              externalEventId={event.external_event_id ?? null}
              eventId={isExternal ? null : id ?? null}
              authenticated={Boolean(user)}
              onRequestSignIn={() => navigate(`/auth?redirect=/events/${id}`)}
              calendarEvent={{
                id: event.external_event_id ?? id ?? 'program',
                title: event.title,
                eventDate: event.event_date,
                eventTime: event.event_time,
                description: event.description ?? null,
                location: event.location_address || event.location_city || null,
                url: externalUrl || (typeof window !== 'undefined' ? window.location.href : null),
              }}
            />
          </div>

          {isExternal && event.external_event_id && (
            <ExternalEventCompanionCard
              externalEventId={event.external_event_id}
              eventTitle={event.title}
              eventDate={event.event_date}
              eventTime={event.event_time}
              venueHint={event.place_name || event.location_address || event.location_free_text || event.location_city}
              sourceLabel={externalSource}
              authenticated={Boolean(user)}
              onRequestSignIn={() => navigate(`/auth?redirect=/events/${id}`)}
              autoPrompt
              onDecline={() => navigate('/events/map')}
            />
          )}

          {isExternal && event.external_event_id && (
            <ExternalEventSocialIntentCard
              externalEventId={event.external_event_id}
              authenticated={Boolean(user)}
              onRequestSignIn={() => navigate(`/auth?redirect=/events/${id}`)}
            />
          )}

          {/* Renders itself away when there is no news, so an event that has
              had none costs the page nothing. */}
          {!isSample && !isExternal && id && (
            <EventUpdatesCard eventId={id} participating={hasJoined || isOwner} />
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
