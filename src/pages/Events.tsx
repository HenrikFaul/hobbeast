
import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { ArrowRight, CalendarDays, Filter, MapPin, MapPinned, Plus, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { LeaveEventDialog } from "@/components/LeaveEventDialog";
import { toast } from "sonner";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { searchEventbriteEvents } from "@/lib/eventbrite";
import { HOBBY_CATALOG } from "@/lib/hobbyCategories";
import { resolveEventLocationLabel } from "@/lib/eventLocationHelper";
import { getParticipantStatsMap } from '@/lib/eventParticipantStats';
import {
  cancelEventParticipation,
  joinEventAtomic,
  listEventCities,
  listSafeDiscoverableEventsPage,
  listSafeExternalEventsPage,
} from '@/lib/eventOperations';
import {
  rankRecommendations,
  type RecommendationReasonCode,
  type RecommendationSource,
} from '@/lib/recommendationEngine';
import { getDiscoveryBootstrap, setDiscoveryPreference } from '@/lib/discoveryFeedback';
import { trackProductEvent } from '@/lib/productAnalyticsClient';
import { SavedAndAlertsPanel } from '@/components/events/SavedAndAlertsPanel';
import {
  getNativeRecommendationSignals,
  type NativeRecommendationSignal,
} from '@/lib/recommendationSignals';
import { interleavePromotedContent } from '@/lib/promotedContent';
import {
  loadPromotedExperienceRows,
  type PromotedExperienceRow,
} from '@/features/events/promotedDiscovery';

import {
  EVENT_PAGE_SIZE,
  SAMPLE_EVENTS,
  SOURCE_FILTERS,
  buildLocationQuery,
  eventCanonicalIdentity,
  eventMatchesFavorites,
  geocodeLocation,
  getEventCategoryKeys,
  getTodayDateString,
  haversineDistanceKm,
  isExternal,
  hasCompanionPlan,
  isUpcomingEventDate,
  eventMatchesCity,
  eventMatchesDateRange,
  normalizeDateRange,
  normalizeText,
  type CapacityFilter,
  eventMatchesPrice,
  type PriceFilter,
  type DateFilter,
  type EventData,
  type EventRelation,
  type ExternalSupplyRow,
  type LatLng,
  type ProfileLocation,
  type SourceFilter,
} from '@/features/events/discoveryModel';
import { EventDiscoveryCard } from '@/features/events/EventDiscoveryCard';
import { CategoryFilterDialog } from '@/features/events/CategoryFilterDialog';
import { HeroMediaRotator } from '@/features/events/HeroMediaRotator';
import {
  eventMatchesVibeFacets,
  vibeFacetMeta,
  type VibeFacet,
} from '@/features/events/eventFacets';
import {
  loadDiscoveryProfileLocation,
  loadJoinedEventIds,
} from '@/features/events/eventsRepository';

// The create-event form is the single heaviest thing on this route and
// nobody sees it until they press the button, so it is fetched then.
const CreateEventDialog = lazy(() => import("@/components/CreateEventDialog")
  .then((module) => ({ default: module.CreateEventDialog })));

const Events = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSource = searchParams.get('source');
  const requestedMode = searchParams.get('mode');
  const requestedDate = searchParams.get('date');
  const requestedCapacity = searchParams.get('capacity');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(
    requestedSource === 'hobbeast' || requestedSource === 'external' ? requestedSource : 'all',
  );
  const [dateFilter, setDateFilter] = useState<DateFilter>(
    requestedDate === 'today' || requestedDate === 'week' || requestedDate === 'month' || requestedDate === 'custom' ? requestedDate : 'all',
  );
  const [capacityFilter, setCapacityFilter] = useState<CapacityFilter>(
    requestedCapacity === 'available' || requestedCapacity === 'waitlist' ? requestedCapacity : 'all',
  );
  // The from-to range and the city. Both narrow the query at the database, so
  // they are part of what gets fetched, not just of what gets displayed.
  const [dateFrom, setDateFrom] = useState(searchParams.get('from') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('to') || '');
  const [cityFilter, setCityFilter] = useState(searchParams.get('city') || '');
  const [cityOptions, setCityOptions] = useState<Array<{ city: string; events: number }>>([]);
  const [priceFilter, setPriceFilter] = useState<PriceFilter>(() => {
    const requested = searchParams.get('price');
    return requested === 'free' || requested === 'paid' ? requested : 'all';
  });
  const [planningCircleId] = useState(() => searchParams.get('circle'));
  const [showCreate, setShowCreate] = useState(searchParams.get('create') === '1');
  const [dbEvents, setDbEvents] = useState<EventData[]>([]);
  const [eventbriteEvents, setEventbriteEvents] = useState<EventData[]>([]);
  const [externalDbEvents, setExternalDbEvents] = useState<EventData[]>([]);
  const [eventbriteLoading, setEventbriteLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [externalSupplyNotice, setExternalSupplyNotice] = useState<string | null>(null);
  const [nativeOffset, setNativeOffset] = useState(0);
  const [externalOffset, setExternalOffset] = useState(0);
  const [nativeHasMore, setNativeHasMore] = useState(false);
  const [externalHasMore, setExternalHasMore] = useState(false);
  const [eventbritePage, setEventbritePage] = useState(1);
  const [eventbriteHasMore, setEventbriteHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [joinedEventIds, setJoinedEventIds] = useState<Set<string>>(new Set());
  const [leaveTarget, setLeaveTarget] = useState<EventData | null>(null);
  const [profileLocation, setProfileLocation] = useState<ProfileLocation | null>(null);
  const [distanceFilterEnabled, setDistanceFilterEnabled] = useState(searchParams.get('distance') === '1');
  const [distanceKm, setDistanceKm] = useState(() => {
    const parsed = Number(searchParams.get('km'));
    return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 200)) : 50;
  });
  const [distanceFilteredIds, setDistanceFilteredIds] = useState<Set<string> | null>(null);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);

  const [primaryFilter, setPrimaryFilter] = useState<'all' | 'search' | 'personal' | 'categories'>(
    requestedMode === 'search' || requestedMode === 'personal' || requestedMode === 'categories' ? requestedMode : 'all',
  );
  const [showCategoryModal, setShowCategoryModal] = useState(
    () => requestedMode === 'categories'
      && !searchParams.get('cat')
      && !searchParams.get('sub')
      && !searchParams.get('activity'),
  );
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(() => new Set((searchParams.get('cat') || '').split(',').filter(Boolean)));
  const [selectedSubcategoryKeys, setSelectedSubcategoryKeys] = useState<Set<string>>(() => new Set((searchParams.get('sub') || '').split(',').filter(Boolean)));
  const [selectedActivityKeys, setSelectedActivityKeys] = useState<Set<string>>(() => new Set((searchParams.get('activity') || '').split(',').filter(Boolean)));
  const [vibeFacets, setVibeFacets] = useState<Set<VibeFacet>>(
    () => new Set((searchParams.get('vibe') || '').split(',').filter((value): value is VibeFacet =>
      value === 'has_signups' || value === 'seasonal' || value === 'group')),
  );
  const [visibleCount, setVisibleCount] = useState(24);
  const [pendingJoinIds, setPendingJoinIds] = useState<Set<string>>(new Set());
  const [suppressedIdentities, setSuppressedIdentities] = useState<Set<string>>(new Set());
  const [newRecommenderEnabled, setNewRecommenderEnabled] = useState(false);
  const [discoveryBootstrapError, setDiscoveryBootstrapError] = useState<string | null>(null);
  const [nativeRecommendationSignals, setNativeRecommendationSignals] = useState<Map<string, NativeRecommendationSignal>>(new Map());
  const [recommendationSignalsError, setRecommendationSignalsError] = useState<string | null>(null);
  const [promotedExperienceRows, setPromotedExperienceRows] = useState<PromotedExperienceRow[]>([]);
  const [promotedContentError, setPromotedContentError] = useState<string | null>(null);
  const impressedEventIds = useRef<Set<string>>(new Set());

  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set('q', search.trim());
    if (sourceFilter !== 'all') next.set('source', sourceFilter);
    if (primaryFilter !== 'all') next.set('mode', primaryFilter);
    if (dateFilter !== 'all') next.set('date', dateFilter);
    if (capacityFilter !== 'all') next.set('capacity', capacityFilter);
    if (priceFilter !== 'all') next.set('price', priceFilter);
    if (dateFrom) next.set('from', dateFrom);
    if (dateTo) next.set('to', dateTo);
    if (cityFilter) next.set('city', cityFilter);
    if (distanceFilterEnabled) {
      next.set('distance', '1');
      next.set('km', String(distanceKm));
    }
    if (selectedCategoryIds.size) next.set('cat', [...selectedCategoryIds].sort().join(','));
    if (selectedSubcategoryKeys.size) next.set('sub', [...selectedSubcategoryKeys].sort().join(','));
    if (selectedActivityKeys.size) next.set('activity', [...selectedActivityKeys].sort().join(','));
    if (vibeFacets.size) next.set('vibe', [...vibeFacets].sort().join(','));
    if (showCreate && planningCircleId) {
      next.set('circle', planningCircleId);
      next.set('create', '1');
    }
    setSearchParams(next, { replace: true });
  }, [search, sourceFilter, primaryFilter, dateFilter, capacityFilter, priceFilter, distanceFilterEnabled, distanceKm, selectedCategoryIds, selectedSubcategoryKeys, selectedActivityKeys, vibeFacets, dateFrom, dateTo, cityFilter, showCreate, planningCircleId, setSearchParams]);

  useEffect(() => {
    setVisibleCount(24);
  }, [search, sourceFilter, primaryFilter, dateFilter, capacityFilter, priceFilter, distanceFilterEnabled, distanceKm, selectedCategoryIds, selectedSubcategoryKeys, selectedActivityKeys, vibeFacets, dateFrom, dateTo, cityFilter]);

  const toggleSetValue = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  /**
   * What the two date inputs and the city box actually mean for the query.
   * `from` never goes below today: the catalogue holds no past programmes, so
   * asking for them would be a request that can only ever return nothing.
   */
  const queryRange = useMemo(() => {
    const today = getTodayDateString();
    if (dateFilter !== 'custom') return { from: today, to: null as string | null };
    const range = normalizeDateRange(dateFrom || null, dateTo || null);
    return {
      from: range.from && range.from > today ? range.from : today,
      to: range.to,
    };
  }, [dateFilter, dateFrom, dateTo]);

  const queryCity = cityFilter.trim();

  const clearCategorySelections = () => {
    setSelectedCategoryIds(new Set());
    setSelectedSubcategoryKeys(new Set());
    setSelectedActivityKeys(new Set());
  };

  const fetchEvents = async (append = false) => {
    setEventsLoading(true);
    setEventsError(null);
    const today = getTodayDateString();
    try {
      const page = await listSafeDiscoverableEventsPage({
        fromDate: queryRange.from,
        toDate: queryRange.to,
        city: queryCity || null,
        limit: EVENT_PAGE_SIZE,
        offset: append ? nativeOffset : 0,
      });
      const nativeEvents = page.items as unknown as EventData[];
      const statsMap = await getParticipantStatsMap(nativeEvents.map((event) => event.id));
      const mapped = nativeEvents.map((event) => ({
        ...event,
        participant_count: statsMap.get(event.id)?.total || 0,
        source: 'hobbeast' as const,
        source_label: 'Hobbeast',
      }));
      setDbEvents((current) => append
        ? [...new Map([...current, ...mapped].map((event) => [event.id, event])).values()]
        : mapped);
      setNativeOffset(page.nextOffset ?? (append ? nativeOffset : 0));
      setNativeHasMore(page.hasMore);
    } catch (error) {
      console.error('events fetch failed', error);
      setEventsError('A Hobbeast eseményeket most nem sikerült betölteni. Próbáld újra.');
    } finally {
      setEventsLoading(false);
    }
  };

  const fetchExternalDbEvents = async (append = false) => {
    const today = getTodayDateString();
    try {
      const page = await listSafeExternalEventsPage({
        fromDate: queryRange.from,
        toDate: queryRange.to,
        city: queryCity || null,
        limit: EVENT_PAGE_SIZE,
        offset: append ? externalOffset : 0,
      });
      const data = page.items as unknown as ExternalSupplyRow[];
      setExternalSupplyNotice(null);
      const mapped = data.map((e) => ({
        external_event_id: e.id,
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
        tags: [
          ...(e.tags || []),
          e.external_source === 'ticketmaster'
            ? 'Ticketmaster'
            : e.external_source === 'feed'
              ? 'Ellenőrzött programforrás'
              : e.external_source === 'scraper'
                ? 'Programajánló'
                : e.external_source,
        ],
        description: e.description,
        created_by: '',
        participant_count: 0,
        source: 'eventbrite' as const,
        source_label: e.external_source === 'ticketmaster'
          ? 'Ticketmaster'
          : e.external_source === 'feed'
            ? 'Ellenőrzött programforrás'
            : e.external_source === 'scraper'
              ? 'Programajánló'
              : e.external_source,
        eventbrite_url: e.external_url || undefined,
        eventbrite_logo_url: e.image_url,
        source_last_synced_at: e.source_last_synced_at,
        freshness_state: e.freshness_state || 'unknown',
        import_state: e.import_state || 'active',
        canonical_identity: e.canonical_fingerprint || undefined,
        companion_count: e.companion_count ?? 0,
      }));
      setExternalDbEvents((current) => append
        ? [...new Map([...current, ...mapped].map((event) => [event.id, event])).values()]
        : mapped);
      setExternalOffset(page.nextOffset ?? (append ? externalOffset : 0));
      setExternalHasMore(page.hasMore);
    } catch (error) {
      console.error('external supply fetch failed', error);
      setExternalSupplyNotice('A külső programforrás átmenetileg nem érhető el; a Hobbeast események továbbra is használhatók.');
    }
  };

  const fetchEbEvents = async (append = false) => {
    setEventbriteLoading(true);
    try {
      const requestedPage = append ? eventbritePage + 1 : 1;
      const result = await searchEventbriteEvents('Budapest', requestedPage);
      const mapped = (result.events as unknown as EventData[]).map(ev => ({ ...ev, source: 'eventbrite' as const, source_label: 'Eventbrite' }));
      setEventbriteEvents((current) => append
        ? [...new Map([...current, ...mapped].map((event) => [event.id, event])).values()]
        : mapped);
      setEventbritePage(requestedPage);
      setEventbriteHasMore(result.pagination.has_more_items);
    } catch {
      console.warn('Eventbrite live preview not available. Falling back to stored/native supply.');
      setExternalSupplyNotice('Az élő Eventbrite-forrás átmenetileg nem érhető el; tárolt és Hobbeast eseményeket mutatunk.');
    }
    setEventbriteLoading(false);
  };

  const fetchJoined = async () => {
    if (!user) { setJoinedEventIds(new Set()); return; }
    const result = await loadJoinedEventIds(user.id);
    setJoinedEventIds(result.data);
  };

  const fetchProfileLocation = async () => {
    if (!user) { setProfileLocation(null); return; }
    const result = await loadDiscoveryProfileLocation(user.id);
    setProfileLocation(result.data);
  };

  useEffect(() => { fetchEvents(); fetchEbEvents(); fetchExternalDbEvents(); }, []);
  // The range and the city are part of the query, so changing them has to go
  // back to the database rather than re-filtering a page that was fetched for
  // a different question. Debounced because the city box is typed into.
  const initialQueryShape = useRef(`${queryRange.from}|${queryRange.to}|${queryCity}`);
  useEffect(() => {
    const shape = `${queryRange.from}|${queryRange.to}|${queryCity}`;
    if (shape === initialQueryShape.current) return undefined;
    const timer = window.setTimeout(() => {
      initialQueryShape.current = shape;
      setNativeOffset(0);
      setExternalOffset(0);
      void fetchEvents();
      void fetchExternalDbEvents();
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryRange.from, queryRange.to, queryCity]);
  useEffect(() => {
    listEventCities(getTodayDateString()).then(setCityOptions).catch(() => setCityOptions([]));
  }, []);
  useEffect(() => { fetchJoined(); }, [user]);
  useEffect(() => { fetchProfileLocation(); }, [user]);
  useEffect(() => {
    let active = true;
    if (!user) {
      setSuppressedIdentities(new Set());
      setNewRecommenderEnabled(false);
      setDiscoveryBootstrapError(null);
      return () => { active = false; };
    }
    void getDiscoveryBootstrap()
      .then((bootstrap) => {
        if (!active) return;
        setSuppressedIdentities(new Set(
          bootstrap.preferences
            .filter((preference) => preference.preference === 'less_like_this')
            .map((preference) => preference.canonical_identity),
        ));
        setNewRecommenderEnabled(bootstrap.newRecommenderEnabled);
        setDiscoveryBootstrapError(null);
      })
      .catch((error) => {
        console.error('Discovery bootstrap failed', error);
        if (active) {
          setNewRecommenderEnabled(false);
          setDiscoveryBootstrapError('A személyes discovery-beállításokat most nem sikerült betölteni; az alap eseménylista használható.');
        }
      });
    return () => { active = false; };
  }, [user]);

  const allEvents = useMemo(
    () => {
      const deduped = new Map<string, EventData>();
      const candidates = [
        ...dbEvents,
        ...externalDbEvents,
        ...eventbriteEvents,
        ...SAMPLE_EVENTS.filter((sample) => !dbEvents.some((event) => event.title === sample.title)),
      ].filter((event) => isUpcomingEventDate(event.event_date));
      candidates.forEach((event) => {
        const identity = eventCanonicalIdentity(event);
        if (!deduped.has(identity)) deduped.set(identity, { ...event, canonical_identity: identity });
      });
      return [...deduped.values()];
    },
    [dbEvents, eventbriteEvents, externalDbEvents]
  );

  const nativeRecommendationIds = useMemo(
    () => allEvents.filter((event) => !isExternal(event)).map((event) => event.id),
    [allEvents],
  );

  /**
   * The five categories the catalogue actually has the most of, as one-tap
   * shortcuts. Counted from what is loaded rather than from a fixed editorial
   * list, so the shortcuts follow the supply: a quiet month for concerts pushes
   * concerts out of the row on its own.
   *
   * A subcategory is offered instead of its parent when it carries most of that
   * parent's programmes — "Túra" is a more useful tap than "Sport & Mozgás"
   * when nearly everything under the parent is a hike.
   */
  const topCategoryShortcuts = useMemo(() => {
    const categories = new Map<string, number>();
    const subcategories = new Map<string, number>();
    for (const event of allEvents) {
      const keys = getEventCategoryKeys(event.category);
      if (!keys.categoryId) continue;
      categories.set(keys.categoryId, (categories.get(keys.categoryId) || 0) + 1);
      if (keys.subcategoryId) {
        const subKey = `${keys.categoryId}::${keys.subcategoryId}`;
        subcategories.set(subKey, (subcategories.get(subKey) || 0) + 1);
      }
    }

    const shortcuts: Array<{ key: string; kind: 'category' | 'subcategory'; label: string; count: number }> = [];
    for (const [categoryId, count] of categories) {
      const category = HOBBY_CATALOG.find((item) => item.id === categoryId);
      if (!category) continue;
      const dominant = [...subcategories]
        .filter(([key]) => key.startsWith(`${categoryId}::`))
        .sort((a, b) => b[1] - a[1])[0];
      if (dominant && dominant[1] >= count * 0.75 && dominant[1] >= 3) {
        const subcategory = category.subcategories.find((item) => item.id === dominant[0].split('::')[1]);
        if (subcategory) {
          shortcuts.push({ key: dominant[0], kind: 'subcategory', label: subcategory.name, count: dominant[1] });
          continue;
        }
      }
      shortcuts.push({ key: categoryId, kind: 'category', label: category.name, count });
    }
    return shortcuts.sort((a, b) => b.count - a.count).slice(0, 5);
  }, [allEvents]);

  const toggleShortcut = (shortcut: { key: string; kind: 'category' | 'subcategory' }) => {
    setPrimaryFilter('categories');
    setSearch('');
    toggleSetValue(
      shortcut.kind === 'category' ? setSelectedCategoryIds : setSelectedSubcategoryKeys,
      shortcut.key,
    );
  };

  const shortcutActive = (shortcut: { key: string; kind: 'category' | 'subcategory' }) =>
    activePrimaryFilter === 'categories'
    && (shortcut.kind === 'category'
      ? selectedCategoryIds.has(shortcut.key)
      : selectedSubcategoryKeys.has(shortcut.key));

  const toggleVibeFacet = (facet: VibeFacet) => {
    setVibeFacets((previous) => {
      const next = new Set(previous);
      if (next.has(facet)) next.delete(facet);
      else next.add(facet);
      return next;
    });
  };

  useEffect(() => {
    let active = true;
    if (!user || !newRecommenderEnabled || nativeRecommendationIds.length === 0) {
      setNativeRecommendationSignals(new Map());
      setRecommendationSignalsError(null);
      return () => { active = false; };
    }
    void getNativeRecommendationSignals(nativeRecommendationIds)
      .then((signals) => {
        if (!active) return;
        setNativeRecommendationSignals(signals);
        setRecommendationSignalsError(null);
      })
      .catch((error) => {
        console.error('Server-side recommendation signals failed', error);
        if (!active) return;
        setNativeRecommendationSignals(new Map());
        setRecommendationSignalsError('A szerveroldali személyre szabás most nem érhető el; az alap, biztonságos sorrendet mutatjuk.');
      });
    return () => { active = false; };
  }, [user, newRecommenderEnabled, nativeRecommendationIds]);

  useEffect(() => {
    let active = true;
    if (!user || nativeRecommendationIds.length === 0) {
      setPromotedExperienceRows([]);
      setPromotedContentError(null);
      return () => { active = false; };
    }
    void loadPromotedExperienceRows(nativeRecommendationIds)
      .then((rows) => {
        if (!active) return;
        setPromotedExperienceRows(rows);
        setPromotedContentError(null);
      })
      .catch(() => {
        console.warn('[discovery] promoted_content_policy_unavailable', {
          errorCode: 'PROMOTED_CONTENT_POLICY_QUERY_FAILED',
        });
        if (!active) return;
        setPromotedExperienceRows([]);
        setPromotedContentError('A kiemelt tartalom ellenőrzése most nem érhető el; az organikus eseménysorrend változatlan maradt.');
      });
    return () => { active = false; };
  }, [user, nativeRecommendationIds]);

  const favorites = useMemo(() => profileLocation?.hobbies || [], [profileLocation]);
  const selectedCategoryCount = selectedCategoryIds.size + selectedSubcategoryKeys.size + selectedActivityKeys.size;
  const activePrimaryFilter = primaryFilter;

  const recommendationRanking = useMemo(() => newRecommenderEnabled ? rankRecommendations(
    allEvents.map((event) => {
      const serverSignal = isExternal(event) ? null : nativeRecommendationSignals.get(event.id);
      return {
      id: event.id,
      canonicalIdentity: eventCanonicalIdentity(event),
      source: (isExternal(event) ? 'external' : 'native') as RecommendationSource,
      title: event.title,
      category: event.category,
      city: event.location_city,
      startsAt: event.event_date ? `${event.event_date}T${event.event_time || '00:00:00'}` : null,
      beginnerFriendly: (event.tags || []).some((tag) => normalizeText(tag).includes('kezdo')),
      distanceKm: serverSignal?.distanceKm ?? null,
      hostReliability: serverSignal?.hostReliability ?? null,
      freshness: event.freshness_state === 'fresh' ? 1 : event.freshness_state === 'aging' ? 0.55 : event.freshness_state === 'stale' ? 0.1 : 0.5,
      marketplaceExposure: serverSignal?.exposureShare ?? null,
      attendedSimilar: serverSignal?.attendedSimilar ?? false,
      availabilityMatch: serverSignal?.availabilityMatch ?? false,
      serverRankingScore: serverSignal?.rankingScore ?? null,
      serverReasonCodes: serverSignal?.reasonCodes ?? [],
    };
    }),
    {
      explicitInterests: favorites,
      preferredCity: profileLocation?.city,
      maxDistanceKm: distanceFilterEnabled ? distanceKm : null,
      coldStart: favorites.length === 0,
    },
  ) : [], [allEvents, favorites, profileLocation?.city, distanceFilterEnabled, distanceKm, newRecommenderEnabled, nativeRecommendationSignals]);

  const recommendationByIdentity = useMemo(
    () => new Map(recommendationRanking.map((item, index) => [item.candidate.canonicalIdentity, { ...item, index }])),
    [recommendationRanking],
  );

  useEffect(() => {
    let cancelled = false;
    const filterByDistance = async () => {
      if (!distanceFilterEnabled) {
        setDistanceFilteredIds(null);
        setDistanceError(null);
        return;
      }

      // Priority 1: Browser geolocation
      let origin: LatLng | null = null;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 300000 });
          });
          origin = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        } catch {
          // Fallback to profile
        }
      }

      // Fallback: profile location
      if (!origin) {
        origin = profileLocation?.location_lat && profileLocation?.location_lon
          ? { lat: profileLocation.location_lat, lon: profileLocation.location_lon }
          : null;
      }

      if (!origin) {
        setDistanceFilteredIds(null);
        setDistanceError('A távolságszűrőhöz adj meg lokációt a profilodban, vagy engedélyezd a helymeghatározást.');
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
    const today = getTodayDateString();
    const todayDate = new Date(`${today}T00:00:00`);
    const dateLimit = new Date(todayDate);
    dateLimit.setDate(dateLimit.getDate() + (dateFilter === 'week' ? 7 : dateFilter === 'month' ? 30 : 0));

    const rows = allEvents.filter((ev) => {
      const relation: EventRelation =
        user && ev.created_by === user.id ? 'own' :
        joinedEventIds.has(ev.id) ? 'joined' :
        eventMatchesFavorites(ev, favorites) ? 'interest' :
        'default';

      const textMatches = ev.title.toLowerCase().includes(search.toLowerCase()) || (ev.tags || []).some((t) => t.toLowerCase().includes(search.toLowerCase()));
      const matchSource = sourceFilter === 'all'
        || (sourceFilter === 'hobbeast' && (!isExternal(ev) || hasCompanionPlan(ev)))
        || (sourceFilter === 'external' && isExternal(ev));
      const matchDistance = !distanceFilterEnabled || distanceFilteredIds === null || distanceFilteredIds.has(ev.id);
      const eventDate = ev.event_date ? new Date(`${ev.event_date}T00:00:00`) : null;
      // The four presets keep their exact meaning; 'custom' is the new
      // from-to range. The range is also applied at the database, so this is
      // the second pass - it still has to be here for the sample events and
      // for the live Eventbrite preview, which never went through the RPC.
      const matchDate = dateFilter === 'custom'
        ? eventMatchesDateRange(ev, normalizeDateRange(dateFrom || null, dateTo || null))
        : dateFilter === 'all'
          || (dateFilter === 'today' && ev.event_date === today)
          || (eventDate !== null && eventDate >= todayDate && eventDate <= dateLimit);
      const isFull = Boolean(ev.max_attendees && (ev.participant_count || 0) >= ev.max_attendees);
      const matchCapacity = capacityFilter === 'all'
        || (capacityFilter === 'available' && !isFull)
        || (capacityFilter === 'waitlist' && isFull);

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
        activePrimaryFilter === 'personal' ? (newRecommenderEnabled || matchMine) :
        activePrimaryFilter === 'categories' ? matchCategory :
        true;

      return matchPrimary && matchSource && matchDistance && matchDate && matchCapacity
        && eventMatchesCity(ev, cityFilter)
        && eventMatchesPrice(ev, priceFilter)
        && eventMatchesVibeFacets(ev, vibeFacets)
        && !suppressedIdentities.has(eventCanonicalIdentity(ev));
    });
    if (activePrimaryFilter === 'personal') {
      rows.sort((a, b) =>
        (recommendationByIdentity.get(eventCanonicalIdentity(a))?.index ?? Number.MAX_SAFE_INTEGER)
        - (recommendationByIdentity.get(eventCanonicalIdentity(b))?.index ?? Number.MAX_SAFE_INTEGER),
      );
    }
    return rows;
  }, [allEvents, search, sourceFilter, distanceFilterEnabled, distanceFilteredIds, selectedCategoryIds, selectedSubcategoryKeys, selectedActivityKeys, activePrimaryFilter, joinedEventIds, favorites, user, dateFilter, capacityFilter, priceFilter, vibeFacets, dateFrom, dateTo, cityFilter, suppressedIdentities, recommendationByIdentity, newRecommenderEnabled]);

  const discoveryEntries = useMemo(() => {
    const organic = filtered.map((event) => ({ ...event, eventId: event.id }));
    const eventsById = new Map(organic.map((event) => [event.eventId, event]));
    const candidates = promotedExperienceRows.flatMap((row) => {
      const item = eventsById.get(row.eventId);
      if (!item) return [];
      return [{
        item,
        disclosureLabel: row.disclosureLabel,
        policyStatus: 'approved' as const,
        qualityScore: row.qualityScore,
        relevanceScore: row.relevanceScore,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
      }];
    });
    return interleavePromotedContent(organic, candidates, {
      maxPromoted: 1,
      organicBeforeFirst: 3,
      minimumOrganicBetween: 4,
    });
  }, [filtered, promotedExperienceRows]);

  const visibleEntries = discoveryEntries.slice(0, visibleCount);
  const visibleEvents = visibleEntries.map((entry) => entry.item);

  useEffect(() => {
    visibleEvents.forEach((event) => {
      if (impressedEventIds.current.has(event.id)) return;
      impressedEventIds.current.add(event.id);
      void trackProductEvent('event_impression', {
        event_id: event.id,
        category: event.category,
        source: isExternal(event) ? 'external' : 'native',
        surface: activePrimaryFilter === 'personal' ? 'events_personal' : 'events_catalog',
      });
    });
  }, [visibleEvents, activePrimaryFilter]);

  const getLocationString = (ev: EventData) => resolveEventLocationLabel(ev);

  const formatDate = (dateStr: string | null) =>
    dateStr ? new Date(dateStr).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Dátum nélkül';

  const handleJoin = async (eventId: string) => {
    if (!user) { navigate('/auth?redirect=/events'); return; }
    if (eventId.startsWith('sample-')) { toast.info('Ez egy bemutató esemény.'); return; }
    if (pendingJoinIds.has(eventId)) return;
    setPendingJoinIds((current) => new Set(current).add(eventId));
    try {
      const result = await joinEventAtomic(eventId);
      if (result?.replayed) toast.info('Már csatlakoztál ehhez az eseményhez.');
      else if (result?.participation_status === 'waitlist') toast.info('Az esemény betelt; felkerültél a várólistára.');
      else toast.success('Sikeresen csatlakoztál!');
      const joinedEvent = allEvents.find((event) => event.id === eventId);
      void trackProductEvent(result?.participation_status === 'waitlist' ? 'waitlist_joined' : 'event_join', {
        event_id: eventId,
        category: joinedEvent?.category ?? 'unknown',
        source: joinedEvent && isExternal(joinedEvent) ? 'external' : 'native',
        surface: 'events_catalog',
      });
      await Promise.all([fetchEvents(), fetchJoined()]);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'EVENT_OPERATION_FAILED';
      if (code === 'EVENT_FULL_NO_WAITLIST') toast.error('Az esemény betelt és nincs várólista.');
      else if (code === 'USER_SUSPENDED') toast.error('A fiók jelenlegi korlátozása mellett nem lehet eseményhez csatlakozni.');
      else if (code === 'EVENT_ORGANIZER_BLOCKED') toast.error('A tiltási beállítások miatt ehhez az eseményhez nem lehet csatlakozni.');
      else if (code === 'EVENT_NOT_JOINABLE' || code === 'EVENT_ALREADY_STARTED') toast.error('Ehhez az eseményhez már nem lehet csatlakozni.');
      else toast.error('A csatlakozás nem sikerült. Próbáld újra.');
    } finally {
      setPendingJoinIds((current) => {
        const next = new Set(current);
        next.delete(eventId);
        return next;
      });
    }
  };

  const handleLeave = async () => {
    if (!user || !leaveTarget) return;
    try {
      await cancelEventParticipation(leaveTarget.id);
      toast.success('A részvételedet lemondtad. Ha volt várólista, a következő ember automatikusan egyetlen alkalommal előrelép.');
      await Promise.all([fetchEvents(), fetchJoined()]);
    } catch {
      toast.error('A lemondás nem sikerült. Próbáld újra.');
    }
    setLeaveTarget(null);
  };

  const handleLessLikeThis = async (event: EventData) => {
    const identity = eventCanonicalIdentity(event);
    if (!user) {
      navigate('/auth?redirect=/events');
      return;
    }
    setSuppressedIdentities((current) => new Set(current).add(identity));
    try {
      await setDiscoveryPreference({
        canonicalIdentity: identity,
        source: isExternal(event) ? 'external' : 'native',
        preference: 'less_like_this',
      });
      toast.success('Rendben, kevesebb hasonló programot ajánlunk.', {
        action: {
          label: 'Visszavonás',
          onClick: () => {
            void setDiscoveryPreference({
              canonicalIdentity: identity,
              source: isExternal(event) ? 'external' : 'native',
              preference: 'neutral',
            }).then(() => {
              setSuppressedIdentities((current) => {
                const next = new Set(current);
                next.delete(identity);
                return next;
              });
              toast.success('A discovery-beállítást visszavontad.');
            }).catch(() => toast.error('A visszavonást nem sikerült elmenteni.'));
          },
        },
      });
    } catch {
      setSuppressedIdentities((current) => {
        const next = new Set(current);
        next.delete(identity);
        return next;
      });
      toast.error('A discovery-beállítást nem sikerült elmenteni.');
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const requests: Promise<void>[] = [];
      if (nativeHasMore) requests.push(fetchEvents(true));
      if (externalHasMore) requests.push(fetchExternalDbEvents(true));
      if (eventbriteHasMore) requests.push(fetchEbEvents(true));
      if (requests.length > 0) await Promise.all(requests);
      setVisibleCount((count) => count + 24);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <main className="min-h-screen pb-20 pt-28 sm:pt-32">
      <div className="container mx-auto px-4">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative mb-6 overflow-hidden rounded-[2rem] bg-[#183124] px-5 py-9 text-white shadow-[0_28px_80px_-42px_rgba(24,49,36,0.7)] sm:rounded-[2.6rem] sm:px-9 sm:py-12 lg:px-14 lg:py-14"
        >
          <div aria-hidden="true" className="absolute -right-14 -top-20 h-64 w-64 rounded-full border-[42px] border-[#dfff62]/15" />
          <div aria-hidden="true" className="absolute -bottom-24 right-[22%] h-56 w-56 rounded-full bg-[#ff8f72]/15 blur-3xl" />
          <div className="relative grid items-center gap-9 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.62fr)] lg:gap-12">
            <div>
              <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] text-[#dfff62]">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Programok a közeledben
              </span>
              <h1 className="max-w-4xl font-display text-4xl font-extrabold leading-[0.96] tracking-[-0.055em] sm:text-5xl lg:text-[4rem]">
                Események, amikből
                <span className="block text-[#ff8f72]">közös emlék lesz.</span>
              </h1>
              <p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-white/[0.66] sm:text-lg">
                Böngéssz helyi és külső programok között, használd a személyes ajánlásokat,
                vagy szűrj pontosan dátum, férőhely és távolság szerint.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <div className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-black/15 px-4 text-sm font-semibold text-white/[0.78] backdrop-blur-sm">
                  <MapPin size={16} className="text-[#dfff62]" aria-hidden="true" /> Budapest &amp; Wien
                </div>
                {user && (
                  <Button className="rounded-full border-[#dfff62] bg-[#dfff62] px-6 text-[#183124] shadow-none hover:bg-[#e7ff8b]" onClick={() => setShowCreate(true)}>
                    <Plus className="mr-1 h-4 w-4" /> Új esemény létrehozása
                  </Button>
                )}
              </div>
            </div>

            <figure className="relative mx-auto aspect-[4/3] w-full max-w-[26rem]">
              <div aria-hidden="true" className="absolute -inset-2 -rotate-3 rounded-[1.5rem_4rem_2rem_3.25rem] bg-[#ff8f72]" />
              {/* Not one photograph any more: the whole editorial library takes
                  turns here, so the page shows the breadth of the catalogue
                  instead of a single sport. */}
              <HeroMediaRotator className="relative h-full w-full rotate-1 overflow-hidden rounded-[1.5rem_4rem_2rem_3.25rem] shadow-2xl" />
              <figcaption className="absolute -bottom-3 right-2 -rotate-2 rounded-full border-2 border-[#183124] bg-[#dfff62] px-4 py-2 text-sm font-extrabold text-[#183124] shadow-xl">
                mozdulj • kapcsolódj
              </figcaption>
            </figure>
          </div>
        </motion.header>

        <section aria-label="Eseményszűrők" className="mx-auto mb-10 rounded-[2rem] border border-border/75 bg-card/[0.88] p-4 shadow-elevated backdrop-blur-md sm:p-6 lg:p-7">
        <div className="mb-5 flex items-center gap-2 text-sm font-extrabold text-foreground">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dfff62] text-[#183124]"><Filter size={16} aria-hidden="true" /></span>
          Finomhangold a találatokat
        </div>
        {/* Categories first. Most people arrive knowing the KIND of evening
            they want, not its title, so the taxonomy leads and the free-text
            box waits below for the minority who are looking for one thing. */}
        <div className="mb-6 rounded-[1.4rem] border border-primary/10 bg-secondary/40 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-extrabold">Mihez van kedved?</h2>
            <p className="text-xs text-muted-foreground">A katalógus legnépesebb témái — egy koppintás.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {topCategoryShortcuts.map((shortcut) => (
              <Button
                key={shortcut.key}
                size="sm"
                variant={shortcutActive(shortcut) ? 'default' : 'outline'}
                onClick={() => toggleShortcut(shortcut)}
                aria-pressed={shortcutActive(shortcut)}
                className={`rounded-full ${shortcutActive(shortcut) ? 'gradient-primary border-0 text-primary-foreground' : 'bg-card'}`}
              >
                {shortcut.label}
                <span className="ml-1.5 text-xs opacity-70">{shortcut.count}</span>
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="rounded-full bg-card"
              onClick={() => {
                setSearch('');
                setPrimaryFilter('categories');
                setShowCategoryModal(true);
              }}
            >
              Minden kategória{selectedCategoryCount > 0 ? ` (${selectedCategoryCount})` : ''}
            </Button>
          </div>

          <div className="mt-4 border-t border-primary/10 pt-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Milyen legyen?</p>
            <div className="flex flex-wrap gap-2">
              {(['has_signups', 'seasonal', 'group'] as const).map((facet) => {
                const meta = vibeFacetMeta(facet);
                const active = vibeFacets.has(facet);
                return (
                  <Button
                    key={facet}
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    aria-pressed={active}
                    onClick={() => toggleVibeFacet(facet)}
                    className={`rounded-full ${active ? 'border-0 bg-accent text-accent-foreground hover:bg-accent/90' : 'bg-card'}`}
                  >
                    {meta.label}
                  </Button>
                );
              })}
            </div>
            {vibeFacets.size > 0 && (
              <ul className="mt-2.5 space-y-1 text-xs text-muted-foreground">
                {[...vibeFacets].map((facet) => (
                  <li key={facet}>{vibeFacetMeta(facet).blurb}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
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

        <div className="mx-auto mb-4 grid gap-3 sm:grid-cols-2" aria-label="Időpont és férőhely szűrők">
          <label className="text-sm font-medium">
            Időszak
            <select
              className="mt-1.5 h-11 w-full rounded-[0.9rem] border border-input/80 bg-card px-3.5 shadow-[inset_0_1px_0_hsl(var(--card))] focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring/25"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value as DateFilter)}
            >
              <option value="all">Minden közelgő időpont</option>
              <option value="today">Ma</option>
              <option value="week">Következő 7 nap</option>
              <option value="month">Következő 30 nap</option>
              <option value="custom">Adott nap vagy időszak…</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Férőhely
            <select
              className="mt-1.5 h-11 w-full rounded-[0.9rem] border border-input/80 bg-card px-3.5 shadow-[inset_0_1px_0_hsl(var(--card))] focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring/25"
              value={capacityFilter}
              onChange={(event) => setCapacityFilter(event.target.value as CapacityFilter)}
            >
              <option value="all">Minden kapacitás</option>
              <option value="available">Van szabad hely</option>
              <option value="waitlist">Betelt / várólistás</option>
            </select>
          </label>

          <label className="block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Belépő
            <select
              className="mt-1.5 h-11 w-full rounded-[0.9rem] border border-input/80 bg-card px-3.5 shadow-[inset_0_1px_0_hsl(var(--card))] focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring/25"
              value={priceFilter}
              onChange={(event) => setPriceFilter(event.target.value as PriceFilter)}
            >
              <option value="all">Ingyenes és fizetős</option>
              <option value="free">Csak ingyenes</option>
              <option value="paid">Csak jegyes</option>
            </select>
          </label>
        </div>

        {/* The from-to range, shown only when it was asked for, so the common
            case keeps the same three controls it always had. */}
        {dateFilter === 'custom' && (
          <div className="mb-4 rounded-[1.2rem] border border-primary/10 bg-secondary/40 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Ettől
                <Input
                  type="date"
                  value={dateFrom}
                  min={getTodayDateString()}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="mt-1.5 h-11 rounded-[0.9rem] bg-card"
                />
              </label>
              <label className="text-sm font-medium">
                Eddig
                <Input
                  type="date"
                  value={dateTo}
                  min={dateFrom || getTodayDateString()}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="mt-1.5 h-11 rounded-[0.9rem] bg-card"
                />
              </label>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="rounded-full bg-card"
                onClick={() => { const today = getTodayDateString(); setDateFrom(today); setDateTo(today); }}
              >
                Csak ma
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full bg-card"
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                disabled={!dateFrom && !dateTo}
              >
                Dátumok törlése
              </Button>
              <p className="text-xs text-muted-foreground">
                {dateFrom && dateTo && dateFrom === dateTo
                  ? 'Egyetlen napra szűrsz.'
                  : dateFrom && dateTo
                    ? 'A két dátum közötti programok, mindkettőt beleértve.'
                    : dateFrom
                      ? 'Ettől a naptól kezdve minden program.'
                      : dateTo
                        ? 'Mától eddig a napig.'
                        : 'Add meg a kezdő és/vagy a záró napot.'}
              </p>
            </div>
          </div>
        )}

        {/* Location. The distance slider below needs a saved profile location
            and a geocoded address; this one only needs a town name, so it also
            works for someone who has neither. */}
        <div className="mb-5 rounded-[1.2rem] border border-primary/10 bg-secondary/40 p-4">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Helyszín</p>
            {cityFilter && (
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={() => setCityFilter('')}
              >
                Helyszínszűrő törlése
              </button>
            )}
          </div>
          <div className="relative mb-3">
            <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={cityFilter}
              onChange={(event) => setCityFilter(event.target.value)}
              placeholder="Város vagy kerület — pl. Debrecen, XIII."
              aria-label="Helyszín szerinti szűrés"
              className="h-11 rounded-[0.9rem] bg-card pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {cityOptions.slice(0, 8).map((entry) => (
              <Button
                key={entry.city}
                size="sm"
                variant={cityFilter === entry.city ? 'default' : 'outline'}
                aria-pressed={cityFilter === entry.city}
                className={`rounded-full ${cityFilter === entry.city ? 'border-0 bg-accent text-accent-foreground' : 'bg-card'}`}
                onClick={() => setCityFilter(cityFilter === entry.city ? '' : entry.city)}
              >
                {entry.city}<span className="ml-1.5 text-xs opacity-70">{entry.events}</span>
              </Button>
            ))}
          </div>
        </div>

        <div className="mb-5 flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input placeholder="…vagy keress konkrét név szerint" value={search} onChange={(e) => {
                const value = e.target.value;
                setSearch(value);
                if (value.trim()) {
                  setPrimaryFilter('search');
                } else {
                  setPrimaryFilter((prev) => prev === 'search' ? 'all' : prev);
                }
              }} className="h-10 rounded-full bg-background/70 pl-10 text-sm" />
          </div>
          <div className="flex flex-wrap justify-center gap-2 lg:justify-end">
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
              className={activePrimaryFilter === 'personal' ? 'border-0 bg-accent text-accent-foreground hover:bg-accent/90' : ''}
            >
              Nekem
            </Button>

          </div>
        </div>

        {selectedCategoryCount > 0 && activePrimaryFilter === 'categories' && (
          <div className="mb-5 flex flex-wrap justify-center gap-2 lg:justify-start">
            {Array.from(selectedCategoryIds).map((categoryId) => {
              const category = HOBBY_CATALOG.find((item) => item.id === categoryId);
              if (!category) return null;
              return (
                <Badge key={categoryId} variant="outline" className="gap-2 border-primary/15 bg-secondary/75 text-primary">
                  {category.name}
                  <button type="button" aria-label={`${category.name} szűrő eltávolítása`} onClick={() => toggleSetValue(setSelectedCategoryIds, categoryId)}>
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
                <Badge key={key} variant="outline" className="gap-2 border-primary/15 bg-secondary/75 text-primary">
                  {subcategory.name}
                  <button type="button" aria-label={`${subcategory.name} szűrő eltávolítása`} onClick={() => toggleSetValue(setSelectedSubcategoryKeys, key)}>
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
                <Badge key={key} variant="outline" className="gap-2 border-primary/15 bg-secondary/75 text-primary">
                  {activity.name}
                  <button type="button" aria-label={`${activity.name} szűrő eltávolítása`} onClick={() => toggleSetValue(setSelectedActivityKeys, key)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}

        <div className="rounded-[1.4rem] border border-primary/10 bg-[#edf0e7] p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div>
              <h2 className="font-semibold">Távolság alapú szűrés</h2>
              <p className="text-sm text-muted-foreground">
                Először a böngésző helymeghatározásából, majd a profilodban megadott lokáció alapján szűr.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={distanceFilterEnabled}
                onChange={(e) => setDistanceFilterEnabled(e.target.checked)}
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
        </section>

        {eventbriteLoading && (
          <div role="status" aria-live="polite" className="text-center text-sm text-muted-foreground mb-6">Külső események betöltése…</div>
        )}

        {eventsLoading && <div role="status" aria-live="polite" className="mb-6 text-center text-sm text-muted-foreground">Hobbeast események betöltése…</div>}
        {eventsError && (
          <div role="alert" className="mx-auto mb-6 flex max-w-2xl flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <span>{eventsError}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchEvents()}>Újrapróbálom</Button>
          </div>
        )}
        {externalSupplyNotice && <div role="status" className="mx-auto mb-6 max-w-2xl rounded-xl border bg-muted/40 p-3 text-center text-sm text-muted-foreground">{externalSupplyNotice}</div>}
        {activePrimaryFilter === 'personal' && discoveryBootstrapError && (
          <div role="alert" className="mx-auto mb-6 max-w-2xl rounded-xl border border-amber-300 bg-amber-50 p-3 text-center text-sm text-amber-900">
            {discoveryBootstrapError}
          </div>
        )}
        {activePrimaryFilter === 'personal' && recommendationSignalsError && !discoveryBootstrapError && (
          <div role="status" className="mx-auto mb-6 max-w-2xl rounded-xl border border-amber-300 bg-amber-50 p-3 text-center text-sm text-amber-900">
            {recommendationSignalsError}
          </div>
        )}
        {promotedContentError && (
          <div role="status" className="mx-auto mb-6 max-w-2xl rounded-xl border bg-muted/40 p-3 text-center text-sm text-muted-foreground">
            {promotedContentError}
          </div>
        )}

        <SavedAndAlertsPanel authenticated={Boolean(user)} />

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[0.66rem] font-extrabold uppercase tracking-[0.15em] text-primary">Felfedezhető programok</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold">Válassz egy következő élményt</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/events/map">
                <MapPinned className="mr-1 h-4 w-4" aria-hidden="true" /> Térképes nézet
              </Link>
            </Button>
            <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card px-3.5 py-2 text-xs font-semibold text-muted-foreground">
              <CalendarDays size={14} className="text-accent" aria-hidden="true" /> Közelgő események
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {visibleEntries.map((entry, index) => {
            const event = entry.item;
            const relation: EventRelation = user && event.created_by === user.id
              ? 'own'
              : joinedEventIds.has(event.id)
                ? 'joined'
                : eventMatchesFavorites(event, favorites)
                  ? 'interest'
                  : 'default';
            const recommendation = recommendationByIdentity.get(eventCanonicalIdentity(event));
            const recommendationReason = recommendation?.reasons[0] as RecommendationReasonCode | undefined;
            return (
              <EventDiscoveryCard
                key={event.id}
                entry={entry}
                index={index}
                relation={relation}
                recommendationReason={recommendationReason}
                showRecommendationReason={activePrimaryFilter === 'personal'}
                joinPending={pendingJoinIds.has(event.id)}
                onOpen={(selectedEvent) => {
                  if (isExternal(selectedEvent)) sessionStorage.setItem(`event-${selectedEvent.id}`, JSON.stringify(selectedEvent));
                  navigate(`/events/${selectedEvent.id}`);
                }}
                onJoin={(eventId) => void handleJoin(eventId)}
                onLeave={setLeaveTarget}
                onLessLikeThis={(selectedEvent) => void handleLessLikeThis(selectedEvent)}
              />
            );
          })}
        </div>

        {(visibleCount < filtered.length || nativeHasMore || externalHasMore || eventbriteHasMore) && (
          <div className="mt-8 text-center">
            <Button className="rounded-full px-6" variant="outline" onClick={() => void handleLoadMore()} disabled={loadingMore}>
              {loadingMore ? 'További események betöltése…' : <>További események <ArrowRight aria-hidden="true" /></>}
            </Button>
          </div>
        )}

        {filtered.length === 0 && !eventsLoading && !eventsError && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg mb-2">Nincs találat 😔</p>
            <p className="text-sm mb-4">Próbálj más szűrőfeltételeket, vagy jelezd, hogy lenne igény erre a programra.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => {
                setSearch('');
                setDateFilter('all');
                setCapacityFilter('all');
                setSourceFilter('all');
                setPrimaryFilter('all');
              }}>Szűrők törlése</Button>
              <Button onClick={() => user ? setShowCreate(true) : navigate('/auth?redirect=/events')}>Szervezzünk valamit</Button>
            </div>
          </div>
        )}
      </div>

      <CategoryFilterDialog
        open={showCategoryModal}
        selectedCategoryIds={selectedCategoryIds}
        selectedSubcategoryKeys={selectedSubcategoryKeys}
        selectedActivityKeys={selectedActivityKeys}
        onOpenChange={setShowCategoryModal}
        onToggleCategory={(categoryId) => {
          setSearch('');
          setPrimaryFilter('categories');
          toggleSetValue(setSelectedCategoryIds, categoryId);
        }}
        onToggleSubcategory={(subcategoryKey) => {
          setSearch('');
          setPrimaryFilter('categories');
          toggleSetValue(setSelectedSubcategoryKeys, subcategoryKey);
        }}
        onToggleActivity={(activityKey) => {
          setSearch('');
          setPrimaryFilter('categories');
          toggleSetValue(setSelectedActivityKeys, activityKey);
        }}
        onClear={clearCategorySelections}
      />

      {showCreate && (
        <Suspense fallback={null}>
          <CreateEventDialog circleId={planningCircleId || undefined} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchEvents(); }} />
        </Suspense>
      )}
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
