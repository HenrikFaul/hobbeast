import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Calendar, MapPin, Users, Clock, Filter, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
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


interface ProfileLocationState {
  city: string | null;
  address: string | null;
  preferredRadiusKm: number;
}

interface Coords {
  lat: number;
  lon: number;
}

const coordCache = new Map<string, Coords | null>();

function haversineKm(a: Coords, b: Coords) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function geocodeLocation(query: string): Promise<Coords | null> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;
  if (coordCache.has(normalized)) return coordCache.get(normalized) ?? null;

  try {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '1',
      addressdetails: '0',
      'accept-language': 'hu',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : null;
    const coords = first ? { lat: parseFloat(first.lat), lon: parseFloat(first.lon) } : null;
    coordCache.set(normalized, coords);
    return coords;
  } catch {
    coordCache.set(normalized, null);
    return null;
  }
}

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

function isExternal(ev: EventData) {
  return ev.source !== undefined && ev.source !== 'hobbeast';
}

const Events = () => {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [dbEvents, setDbEvents] = useState<EventData[]>([]);
  const [eventbriteEvents, setEventbriteEvents] = useState<EventData[]>([]);
  const [eventbriteLoading, setEventbriteLoading] = useState(false);
  const [joinedEventIds, setJoinedEventIds] = useState<Set<string>>(new Set());
  const [leaveTarget, setLeaveTarget] = useState<EventData | null>(null);
  const [profileLocation, setProfileLocation] = useState<ProfileLocationState | null>(null);
  const [distanceFilterEnabled, setDistanceFilterEnabled] = useState(false);
  const [distanceKm, setDistanceKm] = useState(25);
  const [profileCoords, setProfileCoords] = useState<Coords | null>(null);
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

  const fetchEbEvents = async () => {
    setEventbriteLoading(true);
    try {
      const result = await searchEventbriteEvents('Budapest', 1);
      setEventbriteEvents((result.events as unknown as EventData[]).map(ev => ({
        ...ev,
        source: 'eventbrite' as const,
        source_label: 'Eventbrite',
      })));
    } catch (err) {
      console.log('Eventbrite import not available:', err);
    }
    setEventbriteLoading(false);
  };

  const fetchJoined = async () => {
    if (!user) { setJoinedEventIds(new Set()); return; }
    const { data } = await supabase.from('event_participants').select('event_id').eq('user_id', user.id);
    if (data) setJoinedEventIds(new Set(data.map(d => d.event_id)));
  };

  const fetchProfileLocation = async () => {
    if (!user) {
      setProfileLocation(null);
      setDistanceFilterEnabled(false);
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('city, address, preferred_radius_km')
      .eq('user_id', user.id)
      .single();

    if (data) {
      const nextProfile = {
        city: data.city || null,
        address: data.address || null,
        preferredRadiusKm: data.preferred_radius_km || 25,
      };
      setProfileLocation(nextProfile);
      setDistanceKm(nextProfile.preferredRadiusKm);
      setDistanceFilterEnabled(Boolean(nextProfile.city || nextProfile.address));
    } else {
      setProfileLocation(null);
      setDistanceFilterEnabled(false);
    }
  };

  useEffect(() => { fetchEvents(); fetchEbEvents(); }, []);
  useEffect(() => { fetchJoined(); fetchProfileLocation(); }, [user]);

  const allEvents = useMemo(() => ([
    ...dbEvents,
    ...SAMPLE_EVENTS.filter(s => !dbEvents.some(d => d.title === s.title)),
    ...eventbriteEvents,
  ]), [dbEvents, eventbriteEvents]);

  const categories = [...new Set(allEvents.map((e) => e.category))];

  const locationQuery = useMemo(() => {
    if (!profileLocation) return '';
    return profileLocation.address?.trim() || profileLocation.city?.trim() || '';
  }, [profileLocation]);

  useEffect(() => {
    let cancelled = false;

    const resolveDistances = async () => {
      if (!distanceFilterEnabled || !locationQuery) {
        setProfileCoords(null);
        setEventDistances({});
        return;
      }

      setDistanceLoading(true);
      const baseCoords = await geocodeLocation(locationQuery);
      if (cancelled) return;
      setProfileCoords(baseCoords);

      if (!baseCoords) {
        setEventDistances({});
        setDistanceLoading(false);
        return;
      }

      const entries = await Promise.all(allEvents.map(async (ev) => {
        if (ev.location_type === 'online') return [ev.id, 0] as const;
        const eventQuery = [ev.location_address, ev.location_free_text, ev.location_city].filter(Boolean).join(', ');
        if (!eventQuery) return [ev.id, null] as const;
        const coords = await geocodeLocation(eventQuery);
        if (!coords) return [ev.id, null] as const;
        return [ev.id, Number(haversineKm(baseCoords, coords).toFixed(1))] as const;
      }));

      if (!cancelled) {
        setEventDistances(Object.fromEntries(entries));
        setDistanceLoading(false);
      }
    };

    void resolveDistances();

    return () => {
      cancelled = true;
    };
  }, [allEvents, distanceFilterEnabled, locationQuery]);

  const filtered = allEvents.filter((ev) => {
    const matchSearch = ev.title.toLowerCase().includes(search.toLowerCase()) ||
      (ev.tags || []).some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchCategory = !selectedCategory || ev.category === selectedCategory;
    const matchSource =
      sourceFilter === 'all' ||
      (sourceFilter === 'hobbeast' && !isExternal(ev)) ||
      (sourceFilter === 'external' && isExternal(ev));
    const distanceValue = eventDistances[ev.id];
    const matchDistance = !distanceFilterEnabled || !profileCoords || ev.location_type === 'online'
      ? true
      : typeof distanceValue === 'number' && distanceValue <= distanceKm;
    return matchSearch && matchCategory && matchSource && matchDistance;
  });

  const getLocationString = (ev: EventData) => {
    const parts = [ev.location_city, ev.location_district, ev.location_address, ev.location_free_text].filter(Boolean);
    if (ev.location_type === 'online') return 'Online';
    return parts.join(', ') || 'Helyszín nem megadva';
  };

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

        {/* Source filter */}
        <div className="flex gap-2 justify-center mb-4">
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

        {user && (
          <div className="max-w-3xl mx-auto mb-6 rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Távolság alapú szűrés</h2>
                  <p className="text-sm text-muted-foreground">
                    {profileLocation?.city || profileLocation?.address
                      ? `A profilodban megadott lokáció alapján szűrünk${profileLocation.city ? ` (${profileLocation.city})` : ''}.`
                      : 'A funkcióhoz adj meg legalább egy várost vagy címet a profilodban.'}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={distanceFilterEnabled ? 'default' : 'outline'}
                  onClick={() => setDistanceFilterEnabled((prev) => !prev)}
                  disabled={!profileLocation?.city && !profileLocation?.address}
                  className={distanceFilterEnabled ? 'gradient-primary text-primary-foreground border-0' : ''}
                >
                  {distanceFilterEnabled ? 'Távolságszűrés aktív' : 'Távolságszűrés kikapcsolva'}
                </Button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Max. távolság</span>
                  <span className="font-semibold">{distanceKm} km</span>
                </div>
                <Slider
                  value={[distanceKm]}
                  onValueChange={(value) => setDistanceKm(value[0] ?? 25)}
                  min={1}
                  max={200}
                  step={1}
                  disabled={!distanceFilterEnabled || (!profileLocation?.city && !profileLocation?.address)}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1 km</span>
                  <span>200 km</span>
                </div>
              </div>

              {distanceFilterEnabled && !profileCoords && !distanceLoading && (
                <p className="text-sm text-amber-600">A profilban megadott lokációt nem sikerült beazonosítani. Ellenőrizd a várost vagy a címet a profilodban.</p>
              )}
              {distanceFilterEnabled && distanceLoading && (
                <p className="text-sm text-muted-foreground">Távolságok számítása folyamatban...</p>
              )}
            </div>
          </div>
        )}

        {/* Category & search filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8 items-center justify-center">
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

        {eventbriteLoading && (
          <div className="text-center text-sm text-muted-foreground mb-6">Eventbrite események betöltése...</div>
        )}

        {/* Event cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((event, i) => (
            <motion.div key={event.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className="rounded-xl border bg-card overflow-hidden hover-lift group cursor-pointer">
              <div className="h-32 gradient-warm flex items-center justify-center" onClick={() => {
                // Store external event data in sessionStorage for detail page
                if (isExternal(event)) {
                  sessionStorage.setItem(`event-${event.id}`, JSON.stringify(event));
                }
                navigate(`/events/${event.id}`);
              }}>
                <span className="text-5xl">{event.image_emoji || '🎉'}</span>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="text-xs">{event.category}</Badge>
                  {event.source_label && event.source_label !== 'Hobbeast' && (
                    <Badge variant="outline" className="text-xs border-accent text-accent-foreground">
                      {event.source_label}
                    </Badge>
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
                  {distanceFilterEnabled && typeof eventDistances[event.id] === 'number' && (
                    <div className="flex items-center gap-2">
                      <MapPin size={14} />
                      <span>{event.location_type === 'online' ? 'Online esemény' : `${eventDistances[event.id]} km-re tőled`}</span>
                    </div>
                  )}
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
          ))}
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
