import { useState, useEffect } from "react";
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
  const [loading, setLoading] = useState(true);
  const [showLeave, setShowLeave] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [isExternal, setIsExternal] = useState(false);
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const [externalSource, setExternalSource] = useState<string>('');
  const [tripPlan, setTripPlan] = useState<TripPlanDraft | null>(null);

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
        const parsed = JSON.parse(stored);
        setEvent(parsed);
        setIsExternal(true);
        setExternalUrl(parsed.eventbrite_url || parsed.external_url || null);
        setExternalSource(parsed.source_label || parsed.external_source || 'Külső');
        setParticipantCount(parsed.participant_count || 0);
      }
      setLoading(false);
      return;
    }

    // Fetch from DB
    const fetchEvent = async () => {
      const { data } = await supabase
        .from('events')
.select('*')
        .eq('id', id)
        .single();
      if (data) {
        setEvent(data);
        const stats = await getParticipantStats(id);
        setParticipantCount(stats.total);
        try {
          const loadedTripPlan = await getEventTripPlan(id);
          setTripPlan(loadedTripPlan);
        } catch (tripPlanError) {
          console.error('Failed to load trip plan', tripPlanError);
        }
      }

      // Check if user has joined
      if (user) {
        const { data: participation } = await supabase
          .from('event_participants')
          .select('id')
          .eq('event_id', id)
          .eq('user_id', user.id)
          .maybeSingle();
        setHasJoined(!!participation);
      }

      setLoading(false);
    };
    fetchEvent();
  }, [id, user]);

  const handleJoin = async () => {
    if (!user) { navigate('/auth?redirect=/events/' + id); return; }
    if (!id || id.startsWith('sample-')) { toast.info('Ez egy bemutató esemény.'); return; }

    // Check capacity - is event full?
    const isFull = event?.max_attendees && participantCount >= event.max_attendees;
    const joinStatus = isFull && event?.waitlist_enabled ? 'waitlist' : 'going';

    if (isFull && !event?.waitlist_enabled) {
      toast.error('Az esemény betelt és nincs várólista.');
      return;
    }

    const { error } = await supabase.from('event_participants').insert({
      event_id: id,
      user_id: user.id,
      status: joinStatus,
    });
    if (error) {
      if (error.code === '23505') toast.info('Már csatlakoztál!');
      else toast.error('Hiba a csatlakozáskor.');
    } else {
      if (joinStatus === 'waitlist') {
        toast.info('Az esemény betelt, felkerültél a várólistára!');
      } else {
        toast.success('Sikeresen csatlakoztál!');
      }
      setHasJoined(true);
      setParticipantCount(p => p + 1);
    }
  };

  const handleLeave = async () => {
    if (!user || !id) return;
    const { error } = await supabase.from('event_participants').delete().eq('event_id', id).eq('user_id', user.id);
    if (error) {
      toast.error('Hiba a kilépéskor.');
    } else {
      toast.success('Sikeresen kiléptél az eseményből.');
      setHasJoined(false);
      setParticipantCount(p => Math.max(0, p - 1));
    }
    setShowLeave(false);
  };

  const getLocationString = (ev: EventData) => {
    const parts = [ev.location_city, ev.location_district, ev.location_address, ev.location_free_text].filter(Boolean);
    if (ev.location_type === 'online') return '🌐 Online esemény';
    return parts.join(', ') || 'Helyszín nem megadva';
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
                  <Button variant="outline" size="sm" className="rounded-xl flex-shrink-0" onClick={() => navigate(`/events/${id}/organize`)}>
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
          {(event as any).place_name && (
            <Card className="rounded-xl mb-6">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 flex-shrink-0">
                  <MapPin className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Helyszín részletei</p>
                  <p className="font-medium">{(event as any).place_name}</p>
                  {(event as any).place_address && <p className="text-sm text-muted-foreground">{(event as any).place_address}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[(event as any).place_city, (event as any).place_postcode, (event as any).place_country].filter(Boolean).join(', ')}
                  </p>
                  {(event as any).place_source && (
                    <Badge variant="outline" className="text-[10px] mt-1">{(event as any).place_source}</Badge>
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

          {tripPlan && (
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
              supabase.from('events').select('*').eq('id', id).single()
                .then(async ({ data }) => {
                  if (data) {
                    setEvent(data);
                    const stats = await getParticipantStats(id);
                    setParticipantCount(stats.total);
                    getEventTripPlan(id)
                      .then((plan) => setTripPlan(plan))
                      .catch((error) => console.error('Failed to refresh trip plan', error));
                  }
                });
            }
          }}
        />
      )}
    </main>
  );
};

export default EventDetail;
