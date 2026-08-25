import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, CalendarDays, ExternalLink, Loader2, MapPin, Ticket, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { trackOutboundClick } from '@/lib/outboundTracking';

interface CountyCluster { county: string; events: number; lat: number; lon: number }
interface CityCluster { city: string; county: string; events: number; lat: number; lon: number }
interface CategoryCount { category: string; events: number }

interface ClusterPayload {
  counties: CountyCluster[];
  cities: CityCluster[];
  categories: CategoryCount[];
  placed_total: number;
  unplaced_total: number;
}

interface MapEvent {
  external_event_id: string;
  title: string;
  event_date: string;
  event_time: string | null;
  category: string | null;
  city: string;
  county: string;
  location_address: string | null;
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
const CITY_ZOOM_THRESHOLD = 9;

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

function markerHtml(label: string, count: number, size: number, selected: boolean) {
  const ring = selected ? 'box-shadow:0 0 0 4px hsl(var(--primary)/0.35),0 10px 26px -8px rgba(0,0,0,.5);' : 'box-shadow:0 8px 22px -8px rgba(0,0,0,.45);';
  return `
    <div class="hb-marker" style="width:${size}px;height:${size}px;${ring}">
      <span class="hb-marker__count">${numberFormat.format(count)}</span>
    </div>
    <span class="hb-marker__label">${label}</span>
  `;
}

export function EventsMapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const [clusters, setClusters] = useState<ClusterPayload | null>(null);
  const [zoom, setZoom] = useState(7);
  const [category, setCategory] = useState<string | null>(null);
  const [county, setCounty] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // --- data -----------------------------------------------------------------
  const loadClusters = useCallback(async () => {
    const { data } = await supabase.rpc('map_event_clusters', {
      p_category: category,
      p_county: county,
    });
    if (data) setClusters(data as unknown as ClusterPayload);
  }, [category, county]);

  useEffect(() => { void loadClusters(); }, [loadClusters]);

  const loadEvents = useCallback(async (city: string | null) => {
    setLoadingEvents(true);
    const { data } = await supabase.rpc('map_events_at', {
      p_city: city,
      p_county: city ? null : county,
      p_category: category,
      p_limit: 60,
    });
    setEvents(Array.isArray(data) ? (data as unknown as MapEvent[]) : []);
    setLoadingEvents(false);
  }, [category, county]);

  useEffect(() => { void loadEvents(selectedCity); }, [loadEvents, selectedCity]);

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
    if (!map || !layer || !clusters) return;
    layer.clearLayers();

    const showCities = zoom >= CITY_ZOOM_THRESHOLD || Boolean(county);
    const points: Array<{ key: string; label: string; events: number; lat: number; lon: number; city?: string; countyName: string }> =
      showCities
        ? clusters.cities.map((c) => ({ key: `city:${c.city}`, label: c.city, events: c.events, lat: c.lat, lon: c.lon, city: c.city, countyName: c.county }))
        : clusters.counties.map((c) => ({ key: `county:${c.county}`, label: c.county, events: c.events, lat: c.lat, lon: c.lon, countyName: c.county }));

    const max = points.reduce((m, p) => Math.max(m, p.events), 0);

    for (const point of points) {
      const size = bubbleSize(point.events, max);
      const selected = point.city ? point.city === selectedCity : point.countyName === county;
      const marker = L.marker([point.lat, point.lon], {
        icon: L.divIcon({
          className: 'hb-marker-wrap',
          html: markerHtml(point.label, point.events, size, selected),
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        keyboard: true,
        title: `${point.label}: ${point.events} program`,
      });

      marker.on('click', () => {
        if (point.city) {
          setSelectedCity(point.city);
          map.flyTo([point.lat, point.lon], Math.max(map.getZoom(), 11), { duration: 0.6 });
        } else {
          setCounty(point.countyName);
          setSelectedCity(null);
          map.flyTo([point.lat, point.lon], 10, { duration: 0.7 });
        }
      });
      marker.addTo(layer);
    }
  }, [clusters, zoom, county, selectedCity]);

  const categories = clusters?.categories ?? [];
  const counties = useMemo(
    () => (clusters?.counties ?? []).map((c) => c.county).sort((a, b) => a.localeCompare(b, 'hu')),
    [clusters],
  );

  const resetArea = () => {
    setCounty(null);
    setSelectedCity(null);
    mapRef.current?.flyToBounds(HU_BOUNDS, { duration: 0.7 });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
      {/* Sidebar: filters + results, Booking-style */}
      <aside className="flex max-h-[78vh] flex-col gap-3 overflow-hidden rounded-[1.75rem] border border-border/70 bg-card/95 p-4 shadow-elevated">
        <div>
          <p className="text-[0.66rem] font-extrabold uppercase tracking-[0.15em] text-primary">Térképes kereső</p>
          <h2 className="mt-1 font-display text-xl font-extrabold">
            {selectedCity || county || 'Magyarország'}
          </h2>
          {clusters && (
            <p className="mt-1 text-xs text-muted-foreground">
              {numberFormat.format(clusters.placed_total)} program a térképen
              {clusters.unplaced_total > 0 && ` · ${numberFormat.format(clusters.unplaced_total)} országos vagy helyszín nélküli`}
            </p>
          )}
        </div>

        {(county || selectedCity) && (
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
                      {event.image_url && (
                        <img
                          src={event.image_url} alt="" width={64} height={64} loading="lazy" decoding="async"
                          className="h-16 w-16 shrink-0 rounded-xl object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <Link to={`/events/${event.external_event_id}`} className="block">
                          <h3 className="truncate text-sm font-semibold leading-snug group-hover:text-primary">{event.title}</h3>
                        </Link>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" aria-hidden="true" />{formatDate(event.event_date)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" aria-hidden="true" />{event.city}
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
