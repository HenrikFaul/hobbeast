import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, CalendarDays, ExternalLink, Loader2, MapPin, Ticket, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { trackOutboundClick } from '@/lib/outboundTracking';
import { pickEditorialClip } from '@/features/events/EditorialVideoBackdrop';
import { EDITORIAL_VIDEO_BASE } from '@/assets/editorial/videoLibrary';

type MarkerKind = 'county' | 'city' | 'district' | 'venue';

interface MapMarker {
  kind: MarkerKind;
  key: string;
  label: string;
  sublabel: string | null;
  events: number;
  lat: number;
  lon: number;
  county: string | null;
  city: string | null;
  district: string | null;
}

interface CategoryCount { category: string; events: number }

interface MarkerPayload {
  level: string;
  markers: MapMarker[];
  categories: CategoryCount[];
  counties: Array<{ county: string; events: number }>;
  placed_total: number;
  exact_total: number;
  unplaced_total: number;
}

interface MapEvent {
  external_event_id: string;
  title: string;
  event_date: string;
  event_time: string | null;
  category: string | null;
  city: string | null;
  county: string | null;
  district: string | null;
  venue: string | null;
  location_address: string | null;
  placement: string;
  image_url: string | null;
  external_url: string | null;
  price_min: number | null;
  currency: string | null;
  organizer_name: string | null;
  lat: number;
  lon: number;
}

/** Hungary, with a little breathing room. */
const HU_BOUNDS: L.LatLngBoundsExpression = [[45.6, 16.0], [48.7, 23.0]];
function editorialPoster(category: string | null, seed: string) {
  const clip = pickEditorialClip(category, seed);
  return clip ? `${EDITORIAL_VIDEO_BASE}/${clip}.jpg` : '/placeholder.svg';
}

/**
 * Booking's behaviour, applied to programs: the further you zoom in, the more
 * precisely a marker is allowed to claim to know where something happens.
 * County bubbles, then cities (with Budapest broken into its districts), then
 * the venues themselves.
 */
const CITY_ZOOM = 9;
const VENUE_ZOOM = 12;

function levelForZoom(zoom: number, county: string | null, district: string | null): 'county' | 'city' | 'venue' {
  if (district || zoom >= VENUE_ZOOM) return 'venue';
  if (county || zoom >= CITY_ZOOM) return 'city';
  return 'county';
}

const numberFormat = new Intl.NumberFormat('hu-HU');

function formatDate(value: string) {
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
  } catch {
    return value;
  }
}

function prefersDark() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark')
    || window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

/**
 * Marker size scales with the square root of the count: Budapest's 500 programs
 * must not visually crush a town with 7.
 */
function bubbleSize(events: number, max: number) {
  const ratio = max > 0 ? Math.sqrt(events) / Math.sqrt(max) : 0;
  return Math.round(38 + ratio * 34);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char
  ));
}

function markerHtml(label: string, count: number, size: number, selected: boolean, isVenue: boolean) {
  const ring = selected
    ? 'box-shadow:0 0 0 4px hsl(var(--primary)/0.35),0 10px 26px -8px rgba(0,0,0,.5);'
    : 'box-shadow:0 8px 22px -8px rgba(0,0,0,.45);';
  // A venue pin shows its name, not a number — at that zoom the count is
  // almost always 1 and the name is what the reader is looking for.
  // A venue tack is styled inline rather than through a class: it is a handful
  // of declarations used in exactly one place, and the global stylesheet is a
  // budgeted asset.
  const venueShape = isVenue
    ? 'border-radius:999px 999px 999px 4px;transform:rotate(-45deg);background:hsl(var(--primary));'
    : '';
  const face = isVenue
    ? `<span style="display:block;transform:rotate(45deg);font-size:.72rem;font-weight:800;color:hsl(var(--primary-foreground))">${count > 1 ? numberFormat.format(count) : '●'}</span>`
    : `<span class="hb-marker__count">${numberFormat.format(count)}</span>`;
  return `
    <div class="hb-marker" style="width:${size}px;height:${size}px;${venueShape}${ring}">
      ${face}
    </div>
    <span class="hb-marker__label">${escapeHtml(label)}</span>
  `;
}

export function EventsMapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const [payload, setPayload] = useState<MarkerPayload | null>(null);
  const [zoom, setZoom] = useState(7);
  const [category, setCategory] = useState<string | null>(null);
  const [county, setCounty] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [placeKey, setPlaceKey] = useState<string | null>(null);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const level = levelForZoom(zoom, county, district);

  // --- data -----------------------------------------------------------------
  const loadMarkers = useCallback(async () => {
    const { data } = await supabase.rpc('map_markers', {
      p_level: level,
      p_category: category,
      p_county: county,
      p_city: selectedCity,
      p_district: district,
    });
    if (data) setPayload(data as unknown as MarkerPayload);
  }, [level, category, county, selectedCity, district]);

  useEffect(() => { void loadMarkers(); }, [loadMarkers]);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    const { data } = await supabase.rpc('map_events_list', {
      p_county: placeKey || selectedCity || district ? null : county,
      p_city: placeKey || district ? null : selectedCity,
      p_district: placeKey ? null : district,
      p_place_key: placeKey,
      p_category: category,
      p_limit: 60,
    });
    setEvents(Array.isArray(data) ? (data as unknown as MapEvent[]) : []);
    setLoadingEvents(false);
  }, [category, county, selectedCity, district, placeKey]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  // --- map bootstrap --------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
      attributionControl: true,
    }).fitBounds(HU_BOUNDS);

    const dark = prefersDark();
    L.tileLayer(
      dark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 18,
      },
    ).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    map.on('zoomend', () => setZoom(map.getZoom()));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // --- markers --------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || !payload) return;
    layer.clearLayers();

    const markers = payload.markers ?? [];
    const max = markers.reduce((m, point) => Math.max(m, point.events), 0);

    for (const point of markers) {
      // A venue pin says "this exact door", so it stays small and constant; a
      // cluster bubble grows with what it hides.
      const size = point.kind === 'venue' ? 34 : bubbleSize(point.events, max);
      const selected = point.kind === 'venue'
        ? point.key === placeKey
        : point.kind === 'district'
          ? point.district === district
          : point.kind === 'city'
            ? point.city === selectedCity
            : point.county === county;

      const marker = L.marker([point.lat, point.lon], {
        icon: L.divIcon({
          className: `hb-marker-wrap hb-marker-wrap--${point.kind}`,
          html: markerHtml(point.label, point.events, size, selected, point.kind === 'venue'),
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        keyboard: true,
        title: `${point.label}: ${point.events} program`,
      });

      marker.on('click', () => {
        if (point.kind === 'venue') {
          setPlaceKey(point.key);
          setPlaceLabel(point.label);
          map.flyTo([point.lat, point.lon], Math.max(map.getZoom(), 15), { duration: 0.6 });
          return;
        }
        setPlaceKey(null);
        setPlaceLabel(null);
        if (point.kind === 'district') {
          setCounty('Budapest');
          setSelectedCity('Budapest');
          setDistrict(point.district);
          map.flyTo([point.lat, point.lon], Math.max(map.getZoom(), 13), { duration: 0.6 });
          return;
        }
        if (point.kind === 'city') {
          setSelectedCity(point.city);
          setDistrict(null);
          map.flyTo([point.lat, point.lon], Math.max(map.getZoom(), 12), { duration: 0.6 });
          return;
        }
        setCounty(point.county);
        setSelectedCity(null);
        setDistrict(null);
        map.flyTo([point.lat, point.lon], 10, { duration: 0.7 });
      });
      marker.addTo(layer);
    }
  }, [payload, county, selectedCity, district, placeKey]);

  const categories = payload?.categories ?? [];
  const counties = useMemo(
    () => (payload?.counties ?? []).map((c) => c.county).sort((a, b) => a.localeCompare(b, 'hu')),
    [payload],
  );

  const areaLabel = placeLabel
    || (district ? `Budapest ${district}. kerület` : null)
    || selectedCity || county || 'Magyarország';

  const resetArea = () => {
    setCounty(null);
    setSelectedCity(null);
    setDistrict(null);
    setPlaceKey(null);
    setPlaceLabel(null);
    mapRef.current?.flyToBounds(HU_BOUNDS, { duration: 0.7 });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
      {/* Sidebar: filters + results, Booking-style */}
      <aside className="flex max-h-[78vh] flex-col gap-3 overflow-hidden rounded-[1.75rem] border border-border/70 bg-card/95 p-4 shadow-elevated">
        <div>
          <p className="text-[0.66rem] font-extrabold uppercase tracking-[0.15em] text-primary">Térképes kereső</p>
          <h2 className="mt-1 font-display text-xl font-extrabold">
            {areaLabel}
          </h2>
          {payload && (
            <p className="mt-1 text-xs text-muted-foreground">
              {numberFormat.format(payload.placed_total)} program a térképen
              {payload.exact_total > 0 && ` · ${numberFormat.format(payload.exact_total)} pontos helyszínnel`}
              {payload.unplaced_total > 0 && ` · ${numberFormat.format(payload.unplaced_total)} országos vagy helyszín nélküli`}
            </p>
          )}
        </div>

        {(county || selectedCity || district || placeKey) && (
          <Button variant="outline" size="sm" className="w-fit rounded-full" onClick={resetArea}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Vissza az egész országra
          </Button>
        )}

        <div>
          <label className="text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground" htmlFor="map-county">
            Megye
          </label>
          <select
            id="map-county"
            className="mt-1 h-10 w-full rounded-[0.9rem] border border-input/80 bg-card px-3 text-sm focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring/25"
            value={county ?? ''}
            onChange={(event) => {
              const value = event.target.value || null;
              setCounty(value);
              setSelectedCity(null);
              setDistrict(null);
              setPlaceKey(null);
              setPlaceLabel(null);
              if (!value) mapRef.current?.flyToBounds(HU_BOUNDS, { duration: 0.6 });
            }}
          >
            <option value="">Összes megye</option>
            {counties.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        <div>
          <p className="mb-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Kategória</p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button" size="sm"
              variant={category === null ? 'default' : 'outline'}
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => setCategory(null)}
            >
              Mind
            </Button>
            {categories.slice(0, 8).map((item) => (
              <Button
                key={item.category}
                type="button" size="sm"
                variant={category === item.category ? 'default' : 'outline'}
                className="h-7 rounded-full px-3 text-xs"
                onClick={() => setCategory(category === item.category ? null : item.category)}
              >
                {item.category} <span className="ml-1 opacity-70">{item.events}</span>
              </Button>
            ))}
          </div>
        </div>

        <div className="-mx-1 mt-1 flex-1 overflow-y-auto px-1">
          {loadingEvents ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Programok betöltése…
            </p>
          ) : events.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              Válassz egy megyét vagy várost a térképen, hogy lásd az ottani programokat.
            </p>
          ) : (
            <ul className="space-y-2">
              {events.map((event) => (
                <li key={event.external_event_id}>
                  <article className="group overflow-hidden rounded-[1.1rem] border border-border/70 bg-background/60 transition hover:border-primary/30 hover:shadow-lg">
                    <div className="flex gap-3 p-2.5">
                      {/* A program without a photo still gets a thumbnail: the
                          poster frame of its category's editorial clip. */}
                      <img
                        src={event.image_url || editorialPoster(event.category, event.external_event_id)}
                        alt="" width={64} height={64} loading="lazy" decoding="async"
                        className="h-16 w-16 shrink-0 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <Link to={`/events/${event.external_event_id}`} className="block">
                          <h3 className="truncate text-sm font-semibold leading-snug group-hover:text-primary">{event.title}</h3>
                        </Link>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" aria-hidden="true" />{formatDate(event.event_date)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {/* Name the door when we know it, the district when
                                we only know that, the city otherwise. */}
                            {event.venue
                              || (event.district ? `Budapest ${event.district}. ker.` : null)
                              || event.city}
                          </span>
                          {typeof event.price_min === 'number' && event.price_min > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Ticket className="h-3 w-3" aria-hidden="true" />
                              {numberFormat.format(event.price_min)} {event.currency || 'Ft'}
                            </span>
                          )}
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          {event.category && <Badge variant="outline" className="text-[10px]">{event.category}</Badge>}
                          {event.external_url && (
                            <a
                              href={event.external_url}
                              target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                              onClick={() => trackOutboundClick(event.external_event_id, 'event_card')}
                            >
                              <ExternalLink className="h-3 w-3" aria-hidden="true" /> Forrás
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Map */}
      <div className="relative">
        <div
          ref={containerRef}
          className="hb-map h-[78vh] w-full overflow-hidden rounded-[1.75rem] border border-border/70 shadow-elevated"
          role="application"
          aria-label="Programok térképe"
        />
        {selectedCity && (
          <div className="absolute left-4 top-4 z-[500] flex items-center gap-2 rounded-full border border-border/70 bg-card/95 px-3 py-1.5 text-sm shadow-lg backdrop-blur">
            <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span className="font-semibold">{selectedCity}</span>
            <button
              type="button"
              onClick={() => setSelectedCity(null)}
              aria-label="Városszűrő törlése"
              className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
        <p className="absolute bottom-3 right-4 z-[500] rounded-full bg-card/90 px-3 py-1 text-[11px] text-muted-foreground shadow backdrop-blur">
          {zoom >= CITY_ZOOM_THRESHOLD || county ? 'Városok' : 'Megyék'} · nagyíts a részletekért
        </p>
      </div>
    </div>
  );
}

export default EventsMapView;
