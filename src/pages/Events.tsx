import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Calendar, MapPin, Users, Clock, Filter, Plus, ExternalLink, AlertCircle } from "lucide-react";
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
  location_type: string | null;
  max_attendees: number | null;
  image_emoji: string | null;
  tags: string[] | null;
  description: string | null;
  created_by: string;
  participant_count?: number;
  source?: 'hobbeast' | 'eventbrite';
  source_label?: string;
  eventbrite_url?: string;
  eventbrite_logo_url?: string | null;
}

interface Coordinates {
  lat: number;
  lon: number;
}

interface ProfileLocation {
  city: string | null;
  address: string | null;
  preferredRadiusKm: number;
}

const SAMPLE_EVENTS: EventData[] = [
  { id: 'sample-1', title: 'Vasárnapi futóklub a Városligetben', category: 'Sport', event_date: '2026-03-15', event_time: '08:00', location_city: 'Budapest', location_district: null, location_address: 'Városliget', location_free_text: null, location_type: 'address', max_attendees: 40, image_emoji: '🏃', tags: ['Futás', 'Reggeli', 'Kezdő-barát'], description: null, created_by: '', participant_count: 23, source: 'hobbeast', source_label: 'Hobbeast' },
  { id: 'sample-2', title: 'Board Game Night – Társasest', category: 'Társasjátékok', event_date: '2026-03-16', event_time: '18:00', location_city: 'Budapest', location_district: null, location_address: 'Szimpla Kert', location_free_text: null, location_type: 'address', max_attendees: 20, image_emoji: '🎲', tags: ['Társasozás', 'Esti program'], description: null, created_by: '', participant_count: 12, source: 'hobbeast', source_label: 'Hobbeast' },
  { id: 'sample-3', title: 'Akrilfestés workshop kezdőknek', category: 'Kreatív', event_date: '2026-03-18', event_time: '16:00', location_city: 'Budapest', location_district: null, location_address: 'Művész Stúdió', location_free_text: null, location_type: 'address', max_attendees: 12, image_emoji: '🎨', tags: ['Festés', 'Workshop', 'Kezdő'], description: null, created_by: '', participant_count: 8, source: 'hobbeast', source_label: 'Hobbeast' },
  { id: 'sample-4', title: 'Buda Hills túra – tavaszi kirándulás', category: 'Túra', event_date: '2026-03-20', event_time: '09:00', location_city: 'Budapest', location_district: null, location_address: 'Normafa', location_free_text: null, location_type: 'address', max_attendees: 50, image_emoji: '🏔️', tags: ['Kirándulás', 'Természet'], description: null, created_by: '', participant_count: 31, source: 'hobbeast', source_label: 'Hobbeast' },
  { id: 'sample-5', title: 'Akusztikus jam session', category: 'Zene', event_date: '2026-03-22', event_time: '19:30', location_city: 'Wien', location_district: null, location_address: 'Café Prückel', location_free_text: null, location_type: 'address', max_attendees: 15, image_emoji: '🎸', tags: ['Gitár', 'Jam'], description: null, created_by: '', participant_count: 6, source: 'hobbeast', source_label: 'Hobbeast' },
  { id: 'sample-6', title: 'Street Food & Cooking Challenge', category: 'Gasztronómia', event_date: '2026-03-23', event_time: '11:00', location_city: 'Budapest', location_district: null, location_address: 'Bálna', location_free_text: null, location_type: 'address', max_attendees: 30, image_emoji: '👨‍🍳', tags: ['Főzés', 'Verseny'], description: null, created_by: '', participant_count: 18, source: 'hobbeast', source_label: 'Hobbeast' },
];

const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'Minden forrás' },
  { value: 'hobbeast', label: 'Hobbeast' },
  { value: 'external', label: 'Külső programok' },
];

const geocodeCache = new Map<string, Coordinates | null>();

function isExternal(ev: EventData) {
  return ev.source !== undefined && ev.source !== 'hobbeast';
}

function getLocationString(ev: EventData) {
  const parts = [ev.location_city, ev.location_address, ev.location_free_text].filter(Boolean);
  if (ev.location_type === 'online') return 'Online';
  return parts.join(', ') || 'Helyszín nem megadva';
}

async function geocodeLocation(query: string): Promise<Coordinates | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (geocodeCache.has(trimmed)) return geocodeCache.get(trimmed) || null;

  const params = new URLSearchParams({
    q: trimmed,
    format: 'jsonv2',
    limit: '1',
    addressdetails: '0',
    'accept-language': 'hu',
  });

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : null;
    const coords = first ? { lat: parseFloat(first.lat), lon: parseFloat(first.lon) } : null;
    geocodeCache.set(trimmed, coords);
    return coords;
  } catch {
    geocodeCache.set(trimmed, null);
    return null;
  }
}

function haversineKm(a: Coordinates, b: Coordinates) {
  const toRad = (deg: number) => deg * (Math.PI / 180);
  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

const Events = () => {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [dbEvents, setDbEvents] = useState<EventData[]>([]);
  const [eventbriteEvents, setEventbriteEvents] = useState<EventData[]>([]);
  const [eventbriteLoading, setEventbriteLoading] = useState(false);
  const [eventbriteError, setEventbriteError] = useState<string | null>(null);
  const [joinedEventIds, setJoinedEventIds] = useState<Set<string>>(new Set());
  const [leaveTarget, setLeaveTarget] = useState<EventData | null>(null);
  const [profileLocation, setProfileLocation] = useState<ProfileLocation>({ city: null, address: null, preferredRadiusKm: 25 });
  const [distanceFilterKm, setDistanceFilterKm] = useState(25);
  const [distanceFilterEnabled, setDistanceFilterEnabled] = useState(false);
  const [originCoords, setOriginCoords] = useState<Coordinates | null>(null);
  const [eventDistances, setEventDistances] = useState<Record<string, number | null>>({});
  const [distanceLoading, setDistanceLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchEvents = async () => {
    const { data } = await supabase.from('events').select('*, event_participants(count)').eq('is_active', true);
    if (data) {
      setDbEvents(data.map((e: any) => ({
        ...e,
        participant_count: e.event_participants?.[0]?.count || 0,
        source: 'hobbeast' as const,
        source_label: 'Hobbeast',
      })));
    }
  };

  const fetchProfileLocation = async () => {
    if (!user) {
      setProfileLocation({ city: null, address: null, preferredRadiusKm: 25 });
      setDistanceFilterEnabled(false);
      setOriginCoords(null);
      return;
    }

    const { data } = await supabase.from('profiles').select('city,address,preferred_radius_km').eq('user_id', user.id).single();
    const next = {
      city: data?.city || null,
      address: data?.address || null,
      preferredRadiusKm: data?.preferred_radius_km || 25,
    };
    setProfileLocation(next);
    setDistanceFilterKm(next.preferredRadiusKm || 25);
    setDistanceFilterEnabled(Boolean(next.address || next.city));
  };

  const fetchEbEvents = async () => {
    setEventbriteLoading(true);
    setEventbriteError(null);
    try {
      const result = await searchEventbriteEvents('', 1, 'Budapest');
      setEventbriteEvents((result.events as unknown as EventData[]).map(ev => ({
        ...ev,
        source: 'eventbrite' as const,
        source_label: 'Eventbrite',
      })));
      if ((result.events || []).length === 0) {
        setEventbriteError('Az Eventbrite API nem adott vissza eseményeket. Ellenőrizd a Supabase secretet és az edge function logokat.');
      }
    } catch (err) {
      console.log('Eventbrite import not available:', err);
      setEventbriteError(err instanceof Error ? err.message : 'Az Eventbrite import jelenleg nem elérhető.');
    }
    setEventbriteLoading(false);
  };

  const fetchJoined = async () => {
    if (!user) { setJoinedEventIds(new Set()); return; }
    const { data } = await supabase.from('event_participants').select('event_id').eq('user_id', user.id);
    if (data) setJoinedEventIds(new Set(data.map(d => d.event_id)));
  };

  useEffect(() => { fetchEvents(); fetchEbEvents(); }, []);
  useEffect(() => { fetchJoined(); fetchProfileLocation(); }, [user]);

  const allEvents = useMemo(() => [
    ...dbEvents,
    ...SAMPLE_EVENTS.filter(s => !dbEvents.some(d => d.title === s.title)),
    ...eventbriteEvents,
  ], [dbEvents, eventbriteEvents]);

  useEffect(() => {
    const originQuery = profileLocation.address || profileLocation.city;
    let cancelled = false;

    const run = async () => {
      if (!distanceFilterEnabled || !originQuery) {
        setOriginCoords(null);
        setEventDistances({});
        return;
      }

      setDistanceLoading(true);
      const origin = await geocodeLocation(originQuery);
      if (cancelled) return;
      setOriginCoords(origin);

      if (!origin) {
        setEventDistances({});
        setDistanceLoading(false);
        return;
      }

      const entries = await Promise.all(allEvents.map(async (event) => {
        if (event.location_type === 'online') return [event.id, null] as const;
        const query = [event.location_address, event.location_city, event.location_free_text].filter(Boolean).join(', ');
        const coords = await geocodeLocation(query);
        if (!coords) return [event.id, null] as const;
        return [event.id, haversineKm(origin, coords)] as const;
      }));

      if (cancelled) return;
      setEventDistances(Object.fromEntries(entries));
      setDistanceLoading(false);
    };

    void run();
    return () => { cancelled = true; };
  }, [allEvents, profileLocation.address, profileLocation.city, distanceFilterEnabled]);

  const categories = [...new Set(allEvents.map((e) => e.category))];

  const filtered = allEvents.filter((ev) => {
    const matchSearch = ev.title.toLowerCase().includes(search.toLowerCase()) ||
      (ev.tags || []).some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchCategory = !selectedCategory || ev.category === selectedCategory;
    const matchSource =
      sourceFilter === 'all' ||
      (sourceFilter === 'hobbeast' && !isExternal(ev)) ||
      (sourceFilter === 'external' && isExternal(ev));
    const distance = eventDistances[ev.id];
    const matchDistance = !distanceFilterEnabled || ev.location_type === 'online' || distance == null || distance <= distanceFilterKm;
    return matchSearch && matchCategory && matchSource && matchDistance;
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Dátum nélkül';
    const d = new Date(dateStr);
    return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const handleJoin = async (eventId: string) => {
    if (!user) { navigate('/auth?redirect=/events'); return; }
    if (eventId.startsWith('sample-')) { toast.info('Ez egy bemutató esemény.'); return; }
    const { error } = await supabase.from('event_participants').insert({ event_id: eventId, user_id: user.id });
    if (error) {
      if (error.code === '23505') toast.info('Már csatlakoztál ehhez az eseményhez!');
      else toast.error('Hiba a csatlakozáskor.');
    } else {
      toast.success('Sikeresen csatlakoztál!');
      fetchEvents();
      fetchJoined();
    }
  };

  const handleLeave = async () => {
    if (!user || !leaveTarget) return;
    const { error } = await supabase.from('event_participants').delete().eq('event_id', leaveTarget.id).eq('user_id', user.id);
    if (error) {
      toast.error('Hiba a leiratkozáskor.');
    } else {
      toast.success('Sikeresen leiratkoztál az eseményről.');
      fetchEvents();
      fetchJoined();
    }
    setLeaveTarget(null);
  };

  return (
    <main className="pt-24 pb-16 min-h-screen">
      <div className="container mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold font-display mb-3">
            Közelgő <span className="text-gradient">események</span>
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto mb-6">Csatlakozz programokhoz a közeledben, vagy szervezz sajátot!</p>
          {user && (
            <Button className="gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> Új esemény létrehozása
            </Button>
          )}
        </motion.div>

        <div className="flex gap-2 justify-center mb-4 flex-wrap">
          {SOURCE_FILTERS.map((sf) => (
            <Button
              key={sf.value}
              size="sm"
              variant={sourceFilter === sf.value ? "default" : "outline"}
              onClick={() => setSourceFilter(sf.value)}
              className={sourceFilter === sf.value ? "gradient-primary text-primary-foreground border-0" : ""}
            >
              {sf.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4 items-center justify-center">
          <div className="relative w-full sm:w-80">
            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Keress eseményt..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            <Button size="sm" variant={!selectedCategory ? "default" : "outline"} onClick={() => setSelectedCategory(null)}
              className={!selectedCategory ? "gradient-primary text-primary-foreground border-0" : ""}>Mind</Button>
            {categories.map((cat) => (
              <Button key={cat} size="sm" variant={selectedCategory === cat ? "default" : "outline"} onClick={() => setSelectedCategory(cat)}
                className={selectedCategory === cat ? "gradient-primary text-primary-foreground border-0" : ""}>{cat}</Button>
            ))}
          </div>
        </div>

        <div className="mx-auto mb-8 max-w-3xl rounded-2xl border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Távolság alapú szűrés</p>
              <p className="text-sm text-muted-foreground">
                {profileLocation.address || profileLocation.city
                  ? `Kiindulási pont: ${profileLocation.address || profileLocation.city}`
                  : 'A távolságszűréshez adj meg várost vagy címet a profilodban.'}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={distanceFilterEnabled ? 'default' : 'outline'}
              disabled={!profileLocation.address && !profileLocation.city}
              onClick={() => setDistanceFilterEnabled((prev) => !prev)}
              className={distanceFilterEnabled ? 'gradient-primary text-primary-foreground border-0' : ''}
            >
              {distanceFilterEnabled ? 'Távolságszűrés aktív' : 'Távolságszűrés bekapcsolása'}
            </Button>
          </div>
          <div className="mt-4 space-y-2">
            <label className="text-sm text-muted-foreground">
              Max. távolság: <span className="font-semibold text-primary">{distanceFilterKm} km</span>
            </label>
            <input
              type="range"
              min="1"
              max="200"
              value={distanceFilterKm}
              onChange={(e) => setDistanceFilterKm(parseInt(e.target.value))}
              disabled={!distanceFilterEnabled}
              className="w-full accent-primary disabled:opacity-50"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 km</span>
              <span>200 km</span>
            </div>
            {distanceFilterEnabled && distanceLoading && (
              <p className="text-xs text-muted-foreground">Távolságok számítása...</p>
            )}
            {distanceFilterEnabled && !originCoords && !distanceLoading && (
              <p className="text-xs text-destructive">A profilban megadott hely alapján nem sikerült távolságot számolni.</p>
            )}
          </div>
        </div>

        {eventbriteLoading && (
          <div className="text-center text-sm text-muted-foreground mb-6">Eventbrite események betöltése...</div>
        )}

        {eventbriteError && (
          <div className="mx-auto mb-6 flex max-w-3xl items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Eventbrite kapcsolódási probléma</p>
              <p className="text-muted-foreground">{eventbriteError}</p>
              <p className="mt-1 text-xs text-muted-foreground">Supabase secretként állíts be Eventbrite tokent: EVENTBRITE_PRIVATE_TOKEN vagy EVENTBRITE_TOKEN, majd deployold újra az <code>eventbrite-import</code> edge functiont.</p>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((event, i) => {
            const distance = eventDistances[event.id];
            return (
            <motion.div key={event.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className="rounded-xl border bg-card overflow-hidden hover-lift group cursor-pointer">
              <div className="h-32 gradient-warm flex items-center justify-center" onClick={() => {
                if (isExternal(event)) {
                  sessionStorage.setItem(`event-${event.id}`, JSON.stringify(event));
                }
                navigate(`/events/${event.id}`);
              }}>
                <span className="text-5xl">{event.image_emoji || '🎉'}</span>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs">{event.category}</Badge>
                  {event.source_label && event.source_label !== 'Hobbeast' && (
                    <Badge variant="outline" className="text-xs border-accent text-accent-foreground">
                      {event.source_label}
                    </Badge>
                  )}
                  {distanceFilterEnabled && typeof distance === 'number' && (
                    <Badge variant="outline" className="text-xs">{distance.toFixed(1)} km</Badge>
                  )}
                </div>
                <h3 className="font-display font-semibold text-lg mb-3 group-hover:text-primary transition-colors cursor-pointer"
                  onClick={() => {
                    if (isExternal(event)) sessionStorage.setItem(`event-${event.id}`, JSON.stringify(event));
                    navigate(`/events/${event.id}`);
                  }}>{event.title}</h3>
                <div className="space-y-1.5 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} />
                    <span>{formatDate(event.event_date)}</span>
                    {event.event_time && <><Clock size={14} className="ml-2" /><span>{event.event_time}</span></>}
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin size={14} />
                    <span>{getLocationString(event)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users size={14} />
                    <span>{event.participant_count || 0}{event.max_attendees ? `/${event.max_attendees}` : ''} résztvevő</span>
                  </div>
                </div>
                {event.tags && event.tags.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mb-4">
                    {event.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs font-normal">{tag}</Badge>
                    ))}
                  </div>
                )}
                {isExternal(event) && event.eventbrite_url ? (
                  <a href={event.eventbrite_url} target="_blank" rel="noopener noreferrer">
                    <Button className="w-full gradient-primary text-primary-foreground border-0" size="sm">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Megnézem ({event.source_label})
                    </Button>
                  </a>
                ) : joinedEventIds.has(event.id) ? (
                  <Button variant="outline" className="w-full border-destructive text-destructive hover:bg-destructive/10" size="sm"
                    onClick={() => setLeaveTarget(event)}>
                    Leiratkozás
                  </Button>
                ) : (
                  <Button className="w-full gradient-primary text-primary-foreground border-0" size="sm" onClick={() => handleJoin(event.id)}>
                    Csatlakozom
                  </Button>
                )}
              </div>
            </motion.div>
          )})}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg mb-2">Nincs találat 😔</p>
            <p className="text-sm">Próbálj más szűrőfeltételeket!</p>
          </div>
        )}
      </div>

      {showCreate && <CreateEventDialog onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchEvents(); }} />}

      {leaveTarget && (
        <LeaveEventDialog
          eventTitle={leaveTarget.title}
          eventDate={formatDate(leaveTarget.event_date)}
          eventTime={leaveTarget.event_time}
          eventLocation={getLocationString(leaveTarget)}
          onConfirm={handleLeave}
          onCancel={() => setLeaveTarget(null)}
        />
      )}
    </main>
  );
};

export default Events;
