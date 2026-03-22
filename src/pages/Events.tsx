import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Calendar, MapPin, Users, Clock, Filter, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CreateEventDialog } from "@/components/CreateEventDialog";
import { LeaveEventDialog } from "@/components/LeaveEventDialog";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { searchEventbriteEvents } from "@/lib/eventbrite";
import { geocode, isAwsLocationConfigured } from "@/lib/awsLocation";

type SourceFilter = 'all' | 'hobbeast' | 'external';
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
  location_lat?: number | null;
  location_lon?: number | null;
  location_type: string | null;
  max_attendees: number | null;
  image_emoji: string | null;
  tags: string[] | null;
  description: string | null;
  created_by: string;
  participant_count?: number;
  source?: 'hobbeast' | 'eventbrite' | 'ticketmaster' | 'seatgeek' | 'external';
  source_label?: string;
  external_url?: string | null;
  eventbrite_url?: string;
  eventbrite_logo_url?: string | null;
}

type LatLng = { lat: number; lon: number };
interface ProfileLocation {
  city: string | null;
  address: string | null;
  location_lat: number | null;
  location_lon: number | null;
}
const geocodeCache = new Map<string, LatLng | null>();

function buildLocationQuery(ev: EventData) {
  if (ev.location_type === 'online') return null;
  return [ev.location_address, ev.location_city, ev.location_free_text].filter(Boolean).join(', ');
}
function haversineDistanceKm(from: LatLng, to: LatLng) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lon - from.lon);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
async function geocodeLocation(query: string): Promise<LatLng | null> {
  const normalized = query.trim().toLowerCase();
  if (!normalized || !isAwsLocationConfigured()) return null;
  if (geocodeCache.has(normalized)) return geocodeCache.get(normalized) ?? null;
  try {
    const coords = await geocode(query);
    geocodeCache.set(normalized, coords);
    return coords;
  } catch {
    geocodeCache.set(normalized, null);
    return null;
  }
}
const SAMPLE_EVENTS: EventData[] = [
  { id: 'sample-1', title: 'Vasárnapi futóklub a Városligetben', category: 'Sport', event_date: '2026-03-15', event_time: '08:00', location_city: 'Budapest', location_district: null, location_address: 'Városliget', location_free_text: null, location_type: 'address', max_attendees: 40, image_emoji: '🏃', tags: ['Futás', 'Reggeli', 'Kezdő-barát'], description: null, created_by: '', participant_count: 23, source: 'hobbeast', source_label: 'Hobbeast' },
  { id: 'sample-2', title: 'Board Game Night – Társasest', category: 'Társasjátékok', event_date: '2026-03-16', event_time: '18:00', location_city: 'Budapest', location_district: null, location_address: 'Szimpla Kert', location_free_text: null, location_type: 'address', max_attendees: 20, image_emoji: '🎲', tags: ['Társasozás', 'Esti program'], description: null, created_by: '', participant_count: 12, source: 'hobbeast', source_label: 'Hobbeast' },
  { id: 'sample-3', title: 'Akrilfestés workshop kezdőknek', category: 'Kreatív', event_date: '2026-03-18', event_time: '16:00', location_city: 'Budapest', location_district: null, location_address: 'Művész Stúdió', location_free_text: null, location_type: 'address', max_attendees: 12, image_emoji: '🎨', tags: ['Festés', 'Workshop', 'Kezdő'], description: null, created_by: '', participant_count: 8, source: 'hobbeast', source_label: 'Hobbeast' },
  { id: 'sample-4', title: 'Buda Hills túra – tavaszi kirándulás', category: 'Túra', event_date: '2026-03-20', event_time: '09:00', location_city: 'Budapest', location_district: null, location_address: 'Normafa', location_free_text: null, location_type: 'address', max_attendees: 50, image_emoji: '🏔️', tags: ['Kirándulás', 'Természet'], description: null, created_by: '', participant_count: 31, source: 'hobbeast', source_label: 'Hobbeast' },
  { id: 'sample-5', title: 'Akusztikus jam session', category: 'Zene', event_date: '2026-03-22', event_time: '19:30', location_city: 'Wien', location_district: null, location_address: 'Café Prückel', location_free_text: null, location_type: 'address', max_attendees: 15, image_emoji: '🎸', tags: ['Gitár', 'Jam'], description: null, created_by: '', participant_count: 6, source: 'hobbeast', source_label: 'Hobbeast' },
  { id: 'sample-6', title: 'Street Food & Cooking Challenge', category: 'Gasztronómia', event_date: '2026-03-23', event_time: '11:00', location_city: 'Budapest', location_district: null, location_address: 'Bálna', location_free_text: null, location_type: 'address', max_attendees: 30, image_emoji: '👨‍🍳', tags: ['Főzés', 'Verseny'], description: null, created_by: '', participant_count: 18, source: 'hobbeast', source_label: 'Hobbeast' },
];
const SOURCE_FILTERS = [
  { value: 'all' as const, label: 'Minden forrás' },
  { value: 'hobbeast' as const, label: 'Hobbeast' },
  { value: 'external' as const, label: 'Külső programok' },
];
function isExternal(ev: EventData) { return ev.source !== undefined && ev.source !== 'hobbeast'; }
function getExternalSourceLabel(source: string | null | undefined) {
  if (!source) return 'Külső program';
  if (source === 'ticketmaster') return 'Ticketmaster';
  if (source === 'seatgeek') return 'SeatGeek';
  if (source === 'eventbrite') return 'Eventbrite';
  return source.charAt(0).toUpperCase() + source.slice(1);
}

const Events = () => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [dbEvents, setDbEvents] = useState<EventData[]>([]);
  const [eventbriteEvents, setEventbriteEvents] = useState<EventData[]>([]);
  const [externalEvents, setExternalEvents] = useState<EventData[]>([]);
  const [eventbriteLoading, setEventbriteLoading] = useState(false);
  const [joinedEventIds, setJoinedEventIds] = useState<Set<string>>(new Set());
  const [leaveTarget, setLeaveTarget] = useState<EventData | null>(null);
  const [profileLocation, setProfileLocation] = useState<ProfileLocation | null>(null);
  const [distanceFilterEnabled, setDistanceFilterEnabled] = useState(false);
  const [distanceKm, setDistanceKm] = useState(50);
  const [distanceFilteredIds, setDistanceFilteredIds] = useState<Set<string> | null>(null);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchEvents = async () => {
    const { data } = await supabase.from('events').select('*, event_participants(count)').eq('is_active', true);
    if (data) {
      setDbEvents(data.map((e: any) => ({ ...e, participant_count: e.event_participants?.[0]?.count || 0, source: 'hobbeast' as const, source_label: 'Hobbeast' })));
    }
  };
  const fetchEbEvents = async () => {
    setEventbriteLoading(true);
    try {
      const result = await searchEventbriteEvents('Budapest', 1);
      setEventbriteEvents((result.events as unknown as EventData[]).map(ev => ({ ...ev, source: 'eventbrite' as const, source_label: 'Eventbrite' })));
    } catch (err) {
      console.log('Eventbrite import not available:', err);
    }
    setEventbriteLoading(false);
  };

  const fetchExternalEvents = async () => {
    const { data, error } = await (supabase as any)
      .from('external_events')
      .select('*')
      .eq('is_active', true)
      .order('event_date', { ascending: true });

    if (error) {
      console.log('external_events load error:', error);
      return;
    }

    const mapped = ((data ?? []) as any[]).map((ev) => ({
      id: `external-${ev.external_source}-${ev.external_id}`,
      title: ev.title,
      category: ev.category || ev.subcategory || 'Külső program',
      event_date: ev.event_date,
      event_time: ev.event_time,
      location_city: ev.location_city,
      location_district: null,
      location_address: ev.location_address,
      location_free_text: ev.location_free_text,
      location_lat: ev.location_lat,
      location_lon: ev.location_lon,
      location_type: ev.location_type,
      max_attendees: ev.max_attendees,
      image_emoji: null,
      tags: Array.isArray(ev.tags) ? ev.tags : [],
      description: ev.description,
      created_by: '',
      participant_count: 0,
      source: (ev.external_source ?? 'external') as EventData['source'],
      source_label: getExternalSourceLabel(ev.external_source),
      external_url: ev.external_url,
      eventbrite_logo_url: ev.image_url ?? null,
    })) as EventData[];

    setExternalEvents(mapped);
  };
  const fetchJoined = async () => {
    if (!user) { setJoinedEventIds(new Set()); return; }
    const { data } = await supabase.from('event_participants').select('event_id').eq('user_id', user.id);
    if (data) setJoinedEventIds(new Set(data.map(d => d.event_id)));
  };
  const fetchProfileLocation = async () => {
    if (!user) { setProfileLocation(null); return; }
    const { data } = await supabase.from('profiles').select('city,address,location_lat,location_lon').eq('user_id', user.id).maybeSingle();
    setProfileLocation(data ?? null);
  };

  useEffect(() => { fetchEvents(); fetchEbEvents(); fetchExternalEvents(); }, []);
  useEffect(() => { fetchJoined(); }, [user]);
  useEffect(() => { fetchProfileLocation(); }, [user]);

  const allEvents = useMemo(() => [...dbEvents, ...SAMPLE_EVENTS.filter(s => !dbEvents.some(d => d.title === s.title)), ...eventbriteEvents, ...externalEvents], [dbEvents, eventbriteEvents, externalEvents]);
  const categories = useMemo(() => [...new Set(allEvents.map(e => e.category))], [allEvents]);

  useEffect(() => {
    let cancelled = false;
    const filterByDistance = async () => {
      if (!distanceFilterEnabled) {
        setDistanceFilteredIds(null);
        setDistanceError(null);
        return;
      }
      const origin = profileLocation?.location_lat && profileLocation?.location_lon
        ? { lat: profileLocation.location_lat, lon: profileLocation.location_lon }
        : null;

      if (!origin) {
        setDistanceFilteredIds(null);
        setDistanceError('A távolságszűrőhöz előbb ments el egy várost vagy címet a profilodban.');
        return;
      }

      setDistanceLoading(true);
      setDistanceError(null);
      const allowedIds = new Set<string>();
      for (const event of allEvents) {
        if (event.location_type === 'online') { allowedIds.add(event.id); continue; }
        let coords = typeof event.location_lat === 'number' && typeof event.location_lon === 'number' ? { lat: event.location_lat, lon: event.location_lon } : null;
        if (!coords) {
          const query = buildLocationQuery(event);
          if (!query) continue;
          coords = await geocodeLocation(query);
        }
        if (!coords) continue;
        if (haversineDistanceKm(origin, coords) <= distanceKm) allowedIds.add(event.id);
      }
      if (!cancelled) {
        setDistanceFilteredIds(allowedIds);
        setDistanceLoading(false);
      }
    };
    void filterByDistance();
    return () => { cancelled = true }
  }, [allEvents, profileLocation, distanceFilterEnabled, distanceKm]);

  const filtered = useMemo(() => allEvents.filter((ev) => {
    const matchSearch = ev.title.toLowerCase().includes(search.toLowerCase()) || (ev.tags || []).some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchCategory = !selectedCategory || ev.category === selectedCategory;
    const matchSource = sourceFilter === 'all' || (sourceFilter === 'hobbeast' && !isExternal(ev)) || (sourceFilter === 'external' && isExternal(ev));
    const matchDistance = !distanceFilterEnabled || distanceFilteredIds === null || distanceFilteredIds.has(ev.id);
    return matchSearch && matchCategory && matchSource && matchDistance;
  }), [allEvents, search, selectedCategory, sourceFilter, distanceFilterEnabled, distanceFilteredIds]);

  const getLocationString = (ev: EventData) => {
    const parts = [ev.location_city, ev.location_address, ev.location_free_text].filter(Boolean);
    if (ev.location_type === 'online') return 'Online';
    return parts.join(', ') || 'Helyszín nem megadva';
  };
  const formatDate = (dateStr: string | null) => dateStr ? new Date(dateStr).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Dátum nélkül';
  const handleJoin = async (eventId: string) => {
    if (!user) { navigate('/auth?redirect=/events'); return; }
    if (eventId.startsWith('sample-')) { toast.info('Ez egy bemutató esemény.'); return; }
    const { error } = await supabase.from('event_participants').insert({ event_id: eventId, user_id: user.id });
    if (error) {
      if ((error as any).code === '23505') toast.info('Már csatlakoztál ehhez az eseményhez!');
      else toast.error('Hiba a csatlakozáskor.');
    } else { toast.success('Sikeresen csatlakoztál!'); fetchEvents(); fetchJoined(); }
  };
  const handleLeave = async () => {
    if (!user || !leaveTarget) return;
    const { error } = await supabase.from('event_participants').delete().eq('event_id', leaveTarget.id).eq('user_id', user.id);
    if (error) toast.error('Hiba a leiratkozáskor.');
    else { toast.success('Sikeresen leiratkoztál az eseményről.'); fetchEvents(); fetchJoined(); }
    setLeaveTarget(null);
  };

  return (
    <main className="pt-24 pb-16 min-h-screen">
      <div className="container mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold font-display mb-3">Közelgő <span className="text-gradient">események</span></h1>
          <p className="text-muted-foreground max-w-lg mx-auto mb-6">Csatlakozz programokhoz a közeledben, vagy szervezz sajátot!</p>
          {user && <Button className="gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> Új esemény létrehozása</Button>}
        </motion.div>

        <div className="flex gap-2 justify-center mb-4">
          {SOURCE_FILTERS.map((sf) => <Button key={sf.value} size="sm" variant={sourceFilter === sf.value ? 'default' : 'outline'} onClick={() => setSourceFilter(sf.value)} className={sourceFilter === sf.value ? 'gradient-primary text-primary-foreground border-0' : ''}>{sf.label}</Button>)}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6 items-center justify-center">
          <div className="relative w-full sm:w-80">
            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Keress eseményt..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            <Button size="sm" variant={!selectedCategory ? 'default' : 'outline'} onClick={() => setSelectedCategory(null)} className={!selectedCategory ? 'gradient-primary text-primary-foreground border-0' : ''}>Mind</Button>
            {categories.map((cat) => <Button key={cat} size="sm" variant={selectedCategory === cat ? 'default' : 'outline'} onClick={() => setSelectedCategory(cat)} className={selectedCategory === cat ? 'gradient-primary text-primary-foreground border-0' : ''}>{cat}</Button>)}
          </div>
        </div>

        <div className="max-w-3xl mx-auto mb-8 rounded-2xl border bg-card p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div>
              <h2 className="font-semibold">Távolság alapú szűrés</h2>
              <p className="text-sm text-muted-foreground">A profilodban megadott lokáció alapján szűr. Minél pontosabb a profilban mentett cím, annál pontosabban működik.</p>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={distanceFilterEnabled} onChange={(e) => setDistanceFilterEnabled(e.target.checked)} disabled={!profileLocation?.location_lat || !profileLocation?.location_lon} />
              Bekapcsolva
            </label>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm"><span>Max távolság</span><span className="font-semibold text-primary">{distanceKm} km</span></div>
            <input type="range" min="1" max="200" value={distanceKm} onChange={(e) => setDistanceKm(parseInt(e.target.value))} className="w-full accent-primary" disabled={!distanceFilterEnabled} />
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            {distanceLoading ? 'Távolságok számítása folyamatban...' : distanceError ? distanceError : profileLocation?.city ? `Kiindulási lokáció: ${profileLocation.address || profileLocation.city}` : 'A távolságszűréshez ments el lokációt a profilodban.'}
          </div>
        </div>

        {eventbriteLoading && <div className="text-center text-sm text-muted-foreground mb-6">Külső programok betöltése...</div>}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((event, i) => (
            <motion.div key={event.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="rounded-xl border bg-card overflow-hidden hover-lift group cursor-pointer">
              <div className="h-32 gradient-warm flex items-center justify-center" onClick={() => { if (isExternal(event)) sessionStorage.setItem(`event-${event.id}`, JSON.stringify(event)); navigate(`/events/${event.id}`); }}>
                <span className="text-5xl">{event.image_emoji || '🎉'}</span>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="text-xs">{event.category}</Badge>
                  {event.source_label && event.source_label !== 'Hobbeast' && <Badge variant="outline" className="text-xs border-accent text-accent-foreground">{event.source_label}</Badge>}
                </div>
                <h3 className="font-display font-semibold text-lg mb-3 group-hover:text-primary transition-colors cursor-pointer" onClick={() => { if (isExternal(event)) sessionStorage.setItem(`event-${event.id}`, JSON.stringify(event)); navigate(`/events/${event.id}`); }}>{event.title}</h3>
                <div className="space-y-1.5 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-2"><Calendar size={14} /><span>{formatDate(event.event_date)}</span>{event.event_time && <><Clock size={14} className="ml-2" /><span>{event.event_time}</span></>}</div>
                  <div className="flex items-center gap-2"><MapPin size={14} /><span>{getLocationString(event)}</span></div>
                  <div className="flex items-center gap-2"><Users size={14} /><span>{event.participant_count || 0}{event.max_attendees ? `/${event.max_attendees}` : ''} résztvevő</span></div>
                </div>
                {event.tags && event.tags.length > 0 && <div className="flex gap-1.5 flex-wrap mb-4">{event.tags.map((tag) => <Badge key={tag} variant="outline" className="text-xs font-normal">{tag}</Badge>)}</div>}
                {isExternal(event) && (event.external_url || event.eventbrite_url) ? (
                  <a href={event.external_url || event.eventbrite_url} target="_blank" rel="noopener noreferrer"><Button className="w-full gradient-primary text-primary-foreground border-0" size="sm"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Megnézem ({event.source_label})</Button></a>
                ) : joinedEventIds.has(event.id) ? (
                  <Button variant="outline" className="w-full border-destructive text-destructive hover:bg-destructive/10" size="sm" onClick={() => setLeaveTarget(event)}>Leiratkozás</Button>
                ) : (
                  <Button className="w-full gradient-primary text-primary-foreground border-0" size="sm" onClick={() => handleJoin(event.id)}>Csatlakozom</Button>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {filtered.length === 0 && <div className="text-center py-16 text-muted-foreground"><p className="text-lg mb-2">Nincs találat 😔</p><p className="text-sm">Próbálj más szűrőfeltételeket!</p></div>}
      </div>

      {showCreate && <CreateEventDialog onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchEvents(); }} />}
      {leaveTarget && <LeaveEventDialog eventTitle={leaveTarget.title} eventDate={formatDate(leaveTarget.event_date)} eventTime={leaveTarget.event_time} eventLocation={getLocationString(leaveTarget)} onConfirm={handleLeave} onCancel={() => setLeaveTarget(null)} />}
    </main>
  );
};

export default Events;
