
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Calendar, MapPin, Users, Clock, Filter, Plus, ExternalLink, ChevronDown, ChevronRight, X } from "lucide-react";
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
import { HOBBY_CATALOG } from "@/lib/hobbyCategories";

type SourceFilter = 'all' | 'hobbeast' | 'external';
type LatLng = { lat: number; lon: number };
type EventRelation = 'own' | 'joined' | 'interest' | 'default';

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
  source?: 'hobbeast' | 'eventbrite';
  source_label?: string;
  eventbrite_url?: string;
  eventbrite_logo_url?: string | null;
}

interface ProfileLocation {
  city: string | null;
  address: string | null;
  location_lat: number | null;
  location_lon: number | null;
  hobbies: string[] | null;
}

const SOURCE_FILTERS = [
  { value: 'all' as const, label: 'Minden forrás' },
  { value: 'hobbeast' as const, label: 'Hobbeast' },
  { value: 'external' as const, label: 'Külső programok' },
];

const geocodeCache = new Map<string, LatLng | null>();

function isExternal(ev: EventData) {
  return ev.source !== undefined && ev.source !== 'hobbeast';
}

function buildLocationQuery(ev: EventData) {
  if (ev.location_type === 'online') return null;
  return [ev.location_address, ev.location_city, ev.location_free_text].filter(Boolean).join(', ');
}

function normalizeText(value: string | null | undefined) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
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

const CATEGORY_NAME_MAP = HOBBY_CATALOG.map((category) => ({
  categoryId: category.id,
  categoryName: category.name,
  categoryNameNormalized: normalizeText(category.name),
  subcategories: category.subcategories.map((subcategory) => ({
    subcategoryId: subcategory.id,
    subcategoryName: subcategory.name,
    subcategoryNameNormalized: normalizeText(subcategory.name),
    activities: subcategory.activities.map((activity) => ({
      activityId: activity.id,
      activityName: activity.name,
      activityNameNormalized: normalizeText(activity.name),
    })),
  })),
}));

function splitCategoryParts(category: string) {
  return category
    .split(/[›>]/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function matchesNormalizedPart(eventPart: string, catalogPart: string) {
  return eventPart === catalogPart || eventPart.includes(catalogPart) || catalogPart.includes(eventPart);
}

function getEventCategoryKeys(category: string) {
  const [first, second, third] = splitCategoryParts(category).map(normalizeText);
  let categoryId: string | null = null;
  let subcategoryId: string | null = null;
  let activityId: string | null = null;

  const categoryMatch = CATEGORY_NAME_MAP.find((item) => matchesNormalizedPart(first, item.categoryNameNormalized));
  if (categoryMatch) {
    categoryId = categoryMatch.categoryId;
    if (second) {
      const subcategoryMatch = categoryMatch.subcategories.find((item) => matchesNormalizedPart(second, item.subcategoryNameNormalized));
      if (subcategoryMatch) {
        subcategoryId = subcategoryMatch.subcategoryId;
        if (third) {
          const activityMatch = subcategoryMatch.activities.find((item) => matchesNormalizedPart(third, item.activityNameNormalized));
          if (activityMatch) activityId = activityMatch.activityId;
        }
      }
    }
  }

  return { categoryId, subcategoryId, activityId };
}

function eventMatchesFavorites(event: EventData, favorites: string[]) {
  if (!favorites.length) return false;
  const haystack = normalizeText([event.title, event.category, ...(event.tags || [])].join(' '));
  return favorites.some((favorite) => haystack.includes(normalizeText(favorite)));
}

const OWN_BADGE_CLASS = "border-purple-200 bg-purple-50 text-purple-700";
const JOINED_BADGE_CLASS = "border-emerald-200 bg-emerald-50 text-emerald-700";
const INTEREST_BADGE_CLASS = "border-sky-200 bg-sky-50 text-sky-700";

const OWN_BUTTON_CLASS = "w-full border-purple-200 bg-purple-100 text-purple-700 hover:bg-purple-100 cursor-default";
const JOINED_BUTTON_CLASS = "w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50";
const INTEREST_BUTTON_CLASS = "w-full border-0 bg-sky-600 text-white hover:bg-sky-700";
const DEFAULT_BUTTON_CLASS = "w-full gradient-primary text-primary-foreground border-0";

const Events = () => {
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [dbEvents, setDbEvents] = useState<EventData[]>([]);
  const [eventbriteEvents, setEventbriteEvents] = useState<EventData[]>([]);
  const [externalDbEvents, setExternalDbEvents] = useState<EventData[]>([]);
  const [eventbriteLoading, setEventbriteLoading] = useState(false);
  const [joinedEventIds, setJoinedEventIds] = useState<Set<string>>(new Set());
  const [leaveTarget, setLeaveTarget] = useState<EventData | null>(null);
  const [profileLocation, setProfileLocation] = useState<ProfileLocation | null>(null);
  const [distanceFilterEnabled, setDistanceFilterEnabled] = useState(false);
  const [distanceKm, setDistanceKm] = useState(50);
  const [distanceFilteredIds, setDistanceFilteredIds] = useState<Set<string> | null>(null);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);

  const [primaryFilter, setPrimaryFilter] = useState<'all' | 'search' | 'personal' | 'categories'>('all');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [selectedSubcategoryKeys, setSelectedSubcategoryKeys] = useState<Set<string>>(new Set());
  const [selectedActivityKeys, setSelectedActivityKeys] = useState<Set<string>>(new Set());

  const { user } = useAuth();
  const navigate = useNavigate();

  const toggleSetValue = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const clearCategorySelections = () => {
    setSelectedCategoryIds(new Set());
    setSelectedSubcategoryKeys(new Set());
    setSelectedActivityKeys(new Set());
  };

  const fetchEvents = async () => {
    const { data } = await supabase.from('events').select('*, event_participants(count)').eq('is_active', true);
    if (data) {
      setDbEvents(data.map((e: any) => ({ ...e, participant_count: e.event_participants?.[0]?.count || 0, source: 'hobbeast' as const, source_label: 'Hobbeast' })));
    }
  };

  const fetchExternalDbEvents = async () => {
    const { data } = await supabase.from('external_events').select('*').eq('is_active', true);
    if (data) {
      setExternalDbEvents(data.map((e: any) => ({
        id: `ext-${e.external_source}-${e.external_id}`,
        title: e.title,
        category: e.subcategory || e.category || 'Külső esemény',
        event_date: e.event_date,
        event_time: e.event_time,
        location_city: e.location_city,
        location_district: null,
        location_address: e.location_address,
        location_free_text: e.location_free_text,
        location_lat: e.location_lat,
        location_lon: e.location_lon,
        location_type: e.location_type,
        max_attendees: e.max_attendees,
        image_emoji: e.image_url ? null : '🎫',
        tags: [...(e.tags || []), e.external_source === 'ticketmaster' ? 'Ticketmaster' : e.external_source],
        description: e.description,
        created_by: '',
        participant_count: 0,
        source: 'eventbrite' as const,
        source_label: e.external_source === 'ticketmaster' ? 'Ticketmaster' : e.external_source,
        eventbrite_url: e.external_url,
        eventbrite_logo_url: e.image_url,
      })));
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

  const fetchJoined = async () => {
    if (!user) { setJoinedEventIds(new Set()); return; }
    const { data } = await supabase.from('event_participants').select('event_id').eq('user_id', user.id);
    if (data) setJoinedEventIds(new Set(data.map(d => d.event_id)));
  };

  const fetchProfileLocation = async () => {
    if (!user) { setProfileLocation(null); return; }
    const { data } = await supabase.from('profiles').select('city,address,location_lat,location_lon,hobbies').eq('user_id', user.id).maybeSingle();
    setProfileLocation(data ?? null);
  };

  useEffect(() => { fetchEvents(); fetchEbEvents(); fetchExternalDbEvents(); }, []);
  useEffect(() => { fetchJoined(); }, [user]);
  useEffect(() => { fetchProfileLocation(); }, [user]);

  const allEvents = useMemo(
    () => [...dbEvents, ...SAMPLE_EVENTS.filter(s => !dbEvents.some(d => d.title === s.title)), ...eventbriteEvents, ...externalDbEvents],
    [dbEvents, eventbriteEvents, externalDbEvents]
  );

  const favorites = useMemo(() => profileLocation?.hobbies || [], [profileLocation]);
  const selectedCategoryCount = selectedCategoryIds.size + selectedSubcategoryKeys.size + selectedActivityKeys.size;
  const activePrimaryFilter = primaryFilter;

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
        let coords = typeof event.location_lat === 'number' && typeof event.location_lon === 'number'
          ? { lat: event.location_lat, lon: event.location_lon }
          : null;
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
    return () => { cancelled = true; };
  }, [allEvents, profileLocation, distanceFilterEnabled, distanceKm]);

  const filtered = useMemo(() => {
    return allEvents.filter((ev) => {
      const relation: EventRelation =
        user && ev.created_by === user.id ? 'own' :
        joinedEventIds.has(ev.id) ? 'joined' :
        eventMatchesFavorites(ev, favorites) ? 'interest' :
        'default';

      const textMatches = ev.title.toLowerCase().includes(search.toLowerCase()) || (ev.tags || []).some((t) => t.toLowerCase().includes(search.toLowerCase()));
      const matchSource = sourceFilter === 'all' || (sourceFilter === 'hobbeast' && !isExternal(ev)) || (sourceFilter === 'external' && isExternal(ev));
      const matchDistance = !distanceFilterEnabled || distanceFilteredIds === null || distanceFilteredIds.has(ev.id);

      const hasCategorySelections = selectedCategoryIds.size > 0 || selectedSubcategoryKeys.size > 0 || selectedActivityKeys.size > 0;
      let matchCategory = true;
      if (hasCategorySelections) {
        const keys = getEventCategoryKeys(ev.category);
        const subKey = keys.categoryId && keys.subcategoryId ? `${keys.categoryId}::${keys.subcategoryId}` : null;
        const activityKey = keys.categoryId && keys.subcategoryId && keys.activityId ? `${keys.categoryId}::${keys.subcategoryId}::${keys.activityId}` : null;

        matchCategory =
          (keys.categoryId ? selectedCategoryIds.has(keys.categoryId) : false) ||
          (subKey ? selectedSubcategoryKeys.has(subKey) : false) ||
          (activityKey ? selectedActivityKeys.has(activityKey) : false);
      }

      const matchMine = relation === 'own' || relation === 'joined' || relation === 'interest';
      const matchPrimary =
        activePrimaryFilter === 'search' ? textMatches :
        activePrimaryFilter === 'personal' ? matchMine :
        activePrimaryFilter === 'categories' ? matchCategory :
        true;

      return matchPrimary && matchSource && matchDistance;
    });
  }, [allEvents, search, sourceFilter, distanceFilterEnabled, distanceFilteredIds, selectedCategoryIds, selectedSubcategoryKeys, selectedActivityKeys, primaryFilter, joinedEventIds, favorites, user]);

  const getLocationString = (ev: EventData) => {
    const parts = [ev.location_city, ev.location_address, ev.location_free_text].filter(Boolean);
    if (ev.location_type === 'online') return 'Online';
    return parts.join(', ') || 'Helyszín nem megadva';
  };

  const formatDate = (dateStr: string | null) =>
    dateStr ? new Date(dateStr).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Dátum nélkül';

  const handleJoin = async (eventId: string) => {
    if (!user) { navigate('/auth?redirect=/events'); return; }
    if (eventId.startsWith('sample-')) { toast.info('Ez egy bemutató esemény.'); return; }
    const { error } = await supabase.from('event_participants').insert({ event_id: eventId, user_id: user.id });
    if (error) {
      if ((error as any).code === '23505') toast.info('Már csatlakoztál ehhez az eseményhez!');
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
    if (error) toast.error('Hiba a leiratkozáskor.');
    else {
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
          <p className="text-muted-foreground max-w-lg mx-auto mb-6">
            Csatlakozz programokhoz a közeledben, vagy szervezz sajátot!
          </p>
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
              variant={sourceFilter === sf.value ? 'default' : 'outline'}
              onClick={() => setSourceFilter(sf.value)}
              className={sourceFilter === sf.value ? 'gradient-primary text-primary-foreground border-0' : ''}
            >
              {sf.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-3 mb-4 items-center justify-center">
          <div className="relative w-full lg:w-80">
            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Keress eseményt..." value={search} onChange={(e) => {
                const value = e.target.value;
                setSearch(value);
                if (value.trim()) {
                  setPrimaryFilter('search');
                } else {
                  setPrimaryFilter((prev) => prev === 'search' ? 'all' : prev);
                }
              }} className="pl-9" />
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            <Button
              size="sm"
              variant={activePrimaryFilter === 'all' ? 'default' : 'outline'}
              onClick={() => {
                setSearch('');
                setPrimaryFilter('all');
              }}
              className={activePrimaryFilter === 'all' ? 'gradient-primary text-primary-foreground border-0' : ''}
            >
              Mind
            </Button>

            <Button
              size="sm"
              variant={activePrimaryFilter === 'personal' ? 'default' : 'outline'}
              onClick={() => {
                setSearch('');
                setPrimaryFilter('personal');
              }}
              className={activePrimaryFilter === 'personal' ? 'border-0 bg-sky-600 text-white hover:bg-sky-700' : ''}
            >
              Nekem
            </Button>

            <Button
              size="sm"
              variant={activePrimaryFilter === 'categories' ? 'default' : 'outline'}
              onClick={() => {
                setSearch('');
                setPrimaryFilter('categories');
                setShowCategoryModal(true);
              }}
              className={activePrimaryFilter === 'categories' ? 'border-0 bg-emerald-600 text-white hover:bg-emerald-700' : ''}
            >
              Kategóriák{selectedCategoryCount > 0 ? ` (${selectedCategoryCount})` : ''}
            </Button>
          </div>
        </div>

        {selectedCategoryCount > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {Array.from(selectedCategoryIds).map((categoryId) => {
              const category = HOBBY_CATALOG.find((item) => item.id === categoryId);
              if (!category) return null;
              return (
                <Badge key={categoryId} variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 gap-2">
                  {category.name}
                  <button type="button" onClick={() => toggleSetValue(setSelectedCategoryIds, categoryId)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
            {Array.from(selectedSubcategoryKeys).map((key) => {
              const [categoryId, subcategoryId] = key.split('::');
              const category = HOBBY_CATALOG.find((item) => item.id === categoryId);
              const subcategory = category?.subcategories.find((item) => item.id === subcategoryId);
              if (!subcategory) return null;
              return (
                <Badge key={key} variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 gap-2">
                  {subcategory.name}
                  <button type="button" onClick={() => toggleSetValue(setSelectedSubcategoryKeys, key)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
            {Array.from(selectedActivityKeys).map((key) => {
              const [categoryId, subcategoryId, activityId] = key.split('::');
              const category = HOBBY_CATALOG.find((item) => item.id === categoryId);
              const subcategory = category?.subcategories.find((item) => item.id === subcategoryId);
              const activity = subcategory?.activities.find((item) => item.id === activityId);
              if (!activity) return null;
              return (
                <Badge key={key} variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 gap-2">
                  {activity.name}
                  <button type="button" onClick={() => toggleSetValue(setSelectedActivityKeys, key)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}

        <div className="max-w-3xl mx-auto mb-8 rounded-2xl border bg-card p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div>
              <h2 className="font-semibold">Távolság alapú szűrés</h2>
              <p className="text-sm text-muted-foreground">
                A profilodban megadott lokáció alapján szűr. Minél pontosabb a profilban mentett cím, annál pontosabban működik.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={distanceFilterEnabled}
                onChange={(e) => setDistanceFilterEnabled(e.target.checked)}
                disabled={!profileLocation?.location_lat || !profileLocation?.location_lon}
              />
              Bekapcsolva
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Max távolság</span>
              <span className="font-semibold text-primary">{distanceKm} km</span>
            </div>
            <input
              type="range"
              min="1"
              max="200"
              value={distanceKm}
              onChange={(e) => setDistanceKm(parseInt(e.target.value))}
              className="w-full accent-primary"
              disabled={!distanceFilterEnabled}
            />
          </div>

          <div className="mt-3 text-sm text-muted-foreground">
            {distanceLoading
              ? 'Távolságok számítása folyamatban...'
              : distanceError
              ? distanceError
              : profileLocation?.city
              ? `Kiindulási lokáció: ${profileLocation.address || profileLocation.city}`
              : 'A távolságszűréshez ments el lokációt a profilodban.'}
          </div>
        </div>

        {eventbriteLoading && (
          <div className="text-center text-sm text-muted-foreground mb-6">Eventbrite események betöltése...</div>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((event, i) => {
            const relation: EventRelation =
              user && event.created_by === user.id ? 'own' :
              joinedEventIds.has(event.id) ? 'joined' :
              eventMatchesFavorites(event, favorites) ? 'interest' :
              'default';

            const statusBadge =
              relation === 'own' ? { label: 'Saját', className: OWN_BADGE_CLASS } :
              relation === 'joined' ? { label: 'Csatlakoztam', className: JOINED_BADGE_CLASS } :
              relation === 'interest' ? { label: 'Érdekelhet', className: INTEREST_BADGE_CLASS } :
              null;

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="rounded-xl border bg-card overflow-hidden hover-lift group cursor-pointer"
              >
                <div
                  className="h-32 gradient-warm flex items-center justify-center"
                  onClick={() => {
                    if (isExternal(event)) sessionStorage.setItem(`event-${event.id}`, JSON.stringify(event));
                    navigate(`/events/${event.id}`);
                  }}
                >
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
                    {statusBadge && (
                      <Badge variant="outline" className={`text-xs ${statusBadge.className}`}>
                        {statusBadge.label}
                      </Badge>
                    )}
                  </div>

                  <h3
                    className="font-display font-semibold text-lg mb-3 group-hover:text-primary transition-colors cursor-pointer"
                    onClick={() => {
                      if (isExternal(event)) sessionStorage.setItem(`event-${event.id}`, JSON.stringify(event));
                      navigate(`/events/${event.id}`);
                    }}
                  >
                    {event.title}
                  </h3>

                  <div className="space-y-1.5 text-sm text-muted-foreground mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} />
                      <span>{formatDate(event.event_date)}</span>
                      {event.event_time && <>
                        <Clock size={14} className="ml-2" />
                        <span>{event.event_time}</span>
                      </>}
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
                      <Button className={relation === 'interest' ? INTEREST_BUTTON_CLASS : DEFAULT_BUTTON_CLASS} size="sm">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> Megnézem ({event.source_label})
                      </Button>
                    </a>
                  ) : relation === 'own' ? (
                    <Button variant="outline" className={OWN_BUTTON_CLASS} size="sm" disabled>
                      Saját
                    </Button>
                  ) : relation === 'joined' ? (
                    <Button variant="outline" className={JOINED_BUTTON_CLASS} size="sm" onClick={() => setLeaveTarget(event)}>
                      Leiratkozás
                    </Button>
                  ) : (
                    <Button
                      className={relation === 'interest' ? INTEREST_BUTTON_CLASS : DEFAULT_BUTTON_CLASS}
                      size="sm"
                      onClick={() => handleJoin(event.id)}
                    >
                      Csatlakozom
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg mb-2">Nincs találat 😔</p>
            <p className="text-sm">Próbálj más szűrőfeltételeket!</p>
          </div>
        )}
      </div>

      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-5xl max-h-[85vh] overflow-y-auto rounded-2xl border bg-card shadow-2xl">
            <div className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90 px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-display font-bold">Kategóriák</h2>
                  <p className="text-sm text-muted-foreground">
                    Választhatsz fő kategóriát, alkategóriát vagy konkrét tevékenységet is.
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowCategoryModal(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-4 flex justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    clearCategorySelections();
                    setExpandedCategories(new Set());
                    setExpandedSubcategories(new Set());
                  }}
                >
                  Kijelölések törlése
                </Button>
                <Button className="gradient-primary text-primary-foreground border-0" onClick={() => setShowCategoryModal(false)}>
                  Kész
                </Button>
              </div>
            </div>

            <div className="space-y-4 p-6">
              {HOBBY_CATALOG.map((category) => {
                const categorySelected = selectedCategoryIds.has(category.id);
                const categoryExpanded = expandedCategories.has(category.id);

                return (
                  <div key={category.id} className="rounded-2xl border p-4 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('');
                          setPrimaryFilter('categories');
                          toggleSetValue(setSelectedCategoryIds, category.id);
                          toggleSetValue(setExpandedCategories, category.id);
                        }}
                        className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                          categorySelected
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : 'border-border bg-background hover:bg-muted/50'
                        }`}
                      >
                        {category.emoji} {category.name}
                      </button>

                      <Button variant="ghost" size="sm" onClick={() => toggleSetValue(setExpandedCategories, category.id)}>
                        {categoryExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    </div>

                    {categoryExpanded && (
                      <div className="space-y-3 pl-2">
                        {category.subcategories.map((subcategory) => {
                          const subKey = `${category.id}::${subcategory.id}`;
                          const subSelected = selectedSubcategoryKeys.has(subKey);
                          const subExpanded = expandedSubcategories.has(subKey);

                          return (
                            <div key={subKey} className="rounded-xl border border-dashed p-3">
                              <div className="flex items-center justify-between gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSearch('');
                                    setPrimaryFilter('categories');
                                    toggleSetValue(setSelectedSubcategoryKeys, subKey);
                                    toggleSetValue(setExpandedSubcategories, subKey);
                                  }}
                                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                                    subSelected
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                      : 'border-border bg-background hover:bg-muted/50'
                                  }`}
                                >
                                  {subcategory.emoji} {subcategory.name}
                                </button>

                                <Button variant="ghost" size="sm" onClick={() => toggleSetValue(setExpandedSubcategories, subKey)}>
                                  {subExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </Button>
                              </div>

                              {subExpanded && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                  {subcategory.activities.map((activity) => {
                                    const activityKey = `${category.id}::${subcategory.id}::${activity.id}`;
                                    const activitySelected = selectedActivityKeys.has(activityKey);
                                    return (
                                      <button
                                        key={activityKey}
                                        type="button"
                                        onClick={() => { setSearch(''); setPrimaryFilter('categories'); toggleSetValue(setSelectedActivityKeys, activityKey); }}
                                        className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
                                          activitySelected
                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                            : 'border-border bg-background hover:bg-muted/50'
                                        }`}
                                      >
                                        {activity.emoji} {activity.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      )}

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
