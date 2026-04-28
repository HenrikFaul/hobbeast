import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoJSON as LeafletGeoJSON, LayerGroup, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPin, Route, Trash2, ExternalLink, Mountain, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { MapyAttribution } from '@/components/MapyAttribution';
import {
  enrichMapyElevation,
  extractLineCoordinates,
  getMapyAttributionText,
  getMapyTileUrl,
  isMapyConfigured,
  planMapyRoute,
  reverseGeocodeMapyPoint,
  suggestMapyLocations,
  type MapyRouteType,
  type MapySuggestion,
  type TripPlanDraft,
  type TripPlanPoint,
} from '@/lib/mapy';
import { searchPlaces } from '@/lib/placeSearch';
import { getAddressSearchProvider } from '@/lib/searchProviderConfig';
import { cn } from '@/lib/utils';

interface MapyTripPlannerProps {
  value?: TripPlanDraft | null;
  onChange?: (plan: TripPlanDraft | null) => void;
  readOnly?: boolean;
  className?: string;
}

const ROUTE_TYPES: Array<{ value: MapyRouteType; label: string }> = [
  { value: 'foot_hiking', label: 'Túra / gyalog (turista)' },
  { value: 'foot_fast', label: 'Gyalog (gyors)' },
  { value: 'bike_road', label: 'Kerékpár (országúti)' },
  { value: 'bike_mountain', label: 'Kerékpár (hegyi)' },
  { value: 'car_fast', label: 'Autó (gyors)' },
  { value: 'car_short', label: 'Autó (rövid)' },
];

function pointToText(point?: TripPlanPoint | null) {
  if (!point) return 'Nincs kiválasztva';
  if (point.location && !point.label.includes(point.location)) {
    return `${point.label} — ${point.location}`;
  }
  return point.label;
}

function formatMeters(lengthM?: number | null) {
  if (!lengthM) return '—';
  if (lengthM < 1000) return `${Math.round(lengthM)} m`;
  return `${(lengthM / 1000).toFixed(1)} km`;
}

function formatDuration(durationS?: number | null) {
  if (!durationS) return '—';
  const hours = Math.floor(durationS / 3600);
  const minutes = Math.round((durationS % 3600) / 60);
  if (hours > 0) return `${hours} ó ${minutes} p`;
  return `${minutes} p`;
}

function isValidTripPoint(point: Pick<TripPlanPoint, 'lat' | 'lon'> | null | undefined) {
  if (!point) return false;
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return false;
  if (Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return false;
  if (Math.abs(point.lat) < 0.000001 && Math.abs(point.lon) < 0.000001) return false;
  return true;
}

function MapySearchInput({
  label,
  value,
  onSelect,
  disabled,
}: {
  label: string;
  value: TripPlanPoint | null;
  onSelect: (point: TripPlanPoint | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(pointToText(value) === 'Nincs kiválasztva' ? '' : pointToText(value));
  const [results, setResults] = useState<MapySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const preserveTypedQueryRef = useRef(false);
  const justSelectedRef = useRef(false);

  useEffect(() => {
    if (preserveTypedQueryRef.current && !value) {
      preserveTypedQueryRef.current = false;
      return;
    }

    const text = pointToText(value) === 'Nincs kiválasztva' ? '' : pointToText(value);
    justSelectedRef.current = true;
    setQuery(text);
  }, [value]);

  useEffect(() => {
    if (disabled) return;
    // Skip search if a selection was just made (query changed because of selection, not typing)
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    if (!query.trim() || query.trim().length < 3) {
      setResults([]);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    const handle = window.setTimeout(async () => {
      try {
        setLoading(true);
        const provider = await getAddressSearchProvider('trip_planner');
        let items: MapySuggestion[];
        if (provider === 'mapy' || !provider) {
          items = await suggestMapyLocations(query);
        } else {
          const places = await searchPlaces(query, undefined, undefined, provider, 'trip_planner');
          items = places.map((p) => ({
            id: p.sourceId || p.id,
            label: p.name,
            lat: p.lat,
            lon: p.lon,
            type: 'poi' as const,
            providerId: p.sourceId,
            location: p.city || null,
            region: p.district || null,
            country: p.country || null,
            bbox: null,
          }));
        }
        const validItems = items.filter((item) => isValidTripPoint(item));
        setResults(validItems);
        setOpen(validItems.length > 0);
        setActiveIndex(validItems.length > 0 ? 0 : -1);
      } catch {
        setResults([]);
        setOpen(false);
        setActiveIndex(-1);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(handle);
  }, [query, disabled]);

  const selectResult = (result: MapySuggestion | null) => {
    preserveTypedQueryRef.current = false;
    justSelectedRef.current = true;
    if (result && !isValidTripPoint(result)) {
      toast.error('Ehhez a találathoz nem érkezett használható koordináta. Válassz másik címet.');
      setResults((current) => current.filter((item) => item.id !== result.id));
      setOpen(true);
      setActiveIndex(-1);
      return;
    }
    onSelect(result);
    setQuery(result ? pointToText(result) : '');
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          value={query}
          disabled={disabled}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);

            const selectedText = value ? pointToText(value) : '';
            if (value && nextQuery.trim() !== selectedText) {
              preserveTypedQueryRef.current = true;
              onSelect(null);
              setResults([]);
              setOpen(false);
              setActiveIndex(-1);
            }

            if (!nextQuery.trim()) {
              setResults([]);
              selectResult(null);
            }
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={(event) => {
            if (!open || results.length === 0) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((current) => (current + 1) % results.length);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
            } else if (event.key === 'Enter' && activeIndex >= 0) {
              event.preventDefault();
              selectResult(results[activeIndex] ?? null);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder="Keress címre vagy POI-ra..."
          className="rounded-xl h-11 pr-10"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        {open && results.length > 0 && !disabled && (
          <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border bg-popover shadow-lg">
            {results.map((result, index) => (
              <button
                key={result.id}
                type="button"
                className={cn(
                  'flex w-full items-start gap-2 border-b px-3 py-3 text-left text-sm last:border-0 hover:bg-muted/50',
                  index === activeIndex && 'bg-muted/60',
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectResult(result)}
              >
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <div>
                  <div className="font-medium">{result.label}</div>
                  {result.location && <div className="text-xs text-muted-foreground">{result.location}</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function MapyTripPlanner({ value, onChange, readOnly = false, className }: MapyTripPlannerProps) {
  const [routeType, setRouteType] = useState<MapyRouteType>(value?.routeType ?? 'foot_hiking');
  const [start, setStart] = useState<TripPlanPoint | null>(value?.start ?? null);
  const [end, setEnd] = useState<TripPlanPoint | null>(value?.end ?? null);
  const [waypoints, setWaypoints] = useState<TripPlanPoint[]>(value?.waypoints ?? []);
  const [clickedCandidate, setClickedCandidate] = useState<TripPlanPoint | null>(null);
  const [routePlan, setRoutePlan] = useState<TripPlanDraft | null>(value ?? null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [loadingElevation, setLoadingElevation] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const routeLayerRef = useRef<LeafletGeoJSON | null>(null);
  const mapModuleRef = useRef<typeof import('leaflet') | null>(null);
  const isConfigured = isMapyConfigured();

  useEffect(() => {
    setRouteType(value?.routeType ?? 'foot_hiking');
    setStart(value?.start ?? null);
    setEnd(value?.end ?? null);
    setWaypoints(value?.waypoints ?? []);
    setRoutePlan(value ?? null);
  }, [value]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !isConfigured) return;

    let active = true;
    void (async () => {
      const L = await import('leaflet');
      if (!active || !mapContainerRef.current) return;
      mapModuleRef.current = L;

      const map = L.map(mapContainerRef.current, {
        center: [47.4979, 19.0402],
        zoom: 12,
      });

      L.tileLayer(getMapyTileUrl('outdoor'), {
        attribution: getMapyAttributionText(),
        maxZoom: 18,
      }).addTo(map);

      markerLayerRef.current = L.layerGroup().addTo(map);
      map.on('click', async (event) => {
        if (readOnly) return;
        const candidate = await reverseGeocodeMapyPoint(event.latlng.lat, event.latlng.lng).catch(() => null);
        setClickedCandidate(
          candidate ?? {
            label: `${event.latlng.lat.toFixed(5)}, ${event.latlng.lng.toFixed(5)}`,
            lat: event.latlng.lat,
            lon: event.latlng.lng,
            type: 'coordinate',
          },
        );
      });

      mapRef.current = map;
      requestAnimationFrame(() => map.invalidateSize());
    })();

    return () => {
      active = false;
      routeLayerRef.current?.remove();
      markerLayerRef.current?.clearLayers();
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      routeLayerRef.current = null;
    };
  }, [isConfigured, readOnly]);

  useEffect(() => {
    if (!mapRef.current) return;
    const timer = window.setTimeout(() => mapRef.current?.invalidateSize(), 120);
    return () => window.clearTimeout(timer);
  }, [readOnly, routePlan, clickedCandidate, start, end, waypoints.length]);

  const markerPoints = useMemo(
    () => [
      start ? { point: start, role: 'start' as const } : null,
      ...waypoints.map((point) => ({ point, role: 'waypoint' as const })),
      end ? { point: end, role: 'end' as const } : null,
      clickedCandidate ? { point: clickedCandidate, role: 'candidate' as const } : null,
    ].filter(Boolean) as Array<{ point: TripPlanPoint; role: 'start' | 'waypoint' | 'end' | 'candidate' }>,
    [clickedCandidate, end, start, waypoints],
  );

  useEffect(() => {
    const L = mapModuleRef.current;
    const map = mapRef.current;
    const layer = markerLayerRef.current;
    if (!L || !map || !layer) return;

    layer.clearLayers();
    markerPoints.forEach(({ point, role }) => {
      const color = role === 'start' ? '#16a34a' : role === 'end' ? '#dc2626' : role === 'candidate' ? '#f59e0b' : '#2563eb';
      const marker = L.circleMarker([point.lat, point.lon], {
        radius: role === 'candidate' ? 7 : 8,
        color,
        fillColor: color,
        fillOpacity: role === 'candidate' ? 0.35 : 0.9,
        weight: 2,
      });
      marker.bindTooltip(point.label, { direction: 'top' });
      marker.addTo(layer);
    });

    if (!routePlan?.geometry && markerPoints.length > 0) {
      const group = L.featureGroup(layer.getLayers());
      map.fitBounds(group.getBounds().pad(0.25), { maxZoom: 14 });
    }
  }, [markerPoints, routePlan?.geometry]);

  useEffect(() => {
    const L = mapModuleRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    routeLayerRef.current?.remove();
    routeLayerRef.current = null;
    if (!routePlan?.geometry) return;

    try {
      routeLayerRef.current = L.geoJSON(routePlan.geometry as any, {
        style: { color: '#2563eb', weight: 4, opacity: 0.85 },
      }).addTo(map);
      const bounds = routeLayerRef.current.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.2));
    } catch {
      const coords = extractLineCoordinates(routePlan.geometry);
      if (coords.length > 1) {
        const polyline = L.polyline(coords.map(([lon, lat]) => [lat, lon] as [number, number]), {
          color: '#2563eb',
          weight: 4,
          opacity: 0.85,
        }).addTo(map);
        routeLayerRef.current = polyline as unknown as LeafletGeoJSON;
        map.fitBounds(polyline.getBounds().pad(0.2));
      }
    }
  }, [routePlan?.geometry]);

  useEffect(() => {
    if (readOnly) return;
    onChange?.(routePlan);
  }, [onChange, readOnly, routePlan]);

  const calculateRoute = async () => {
    if (!start || !end) return;
    setLoadingRoute(true);
    try {
      const planned = await planMapyRoute({ routeType, start, end, waypoints });
      setRoutePlan(planned);
    } finally {
      setLoadingRoute(false);
    }
  };

  const handleEnrichElevation = async () => {
    if (!routePlan) return;
    setLoadingElevation(true);
    try {
      const enriched = await enrichMapyElevation(routePlan);
      if (enriched.elevationProfile && enriched.elevationProfile.length > 0) {
        toast.success('Szintprofil sikeresen betöltve!');
      } else {
        toast.warning('Nem sikerült szintprofil adatokat lekérni az útvonalhoz.');
      }
      setRoutePlan(enriched);
    } catch (err) {
      console.error('Elevation enrichment error:', err);
      toast.error(`Szintprofil dúsítás sikertelen: ${err instanceof Error ? err.message : 'Ismeretlen hiba'}`);
    } finally {
      setLoadingElevation(false);
    }
  };

  const clearPlanner = () => {
    setStart(null);
    setEnd(null);
    setWaypoints([]);
    setClickedCandidate(null);
    setRoutePlan(null);
    onChange?.(null);
  };

  const assignCandidate = (role: 'start' | 'end' | 'waypoint') => {
    if (!clickedCandidate) return;
    if (role === 'start') setStart(clickedCandidate);
    if (role === 'end') setEnd(clickedCandidate);
    if (role === 'waypoint') setWaypoints((current) => [...current, clickedCandidate]);
    setClickedCandidate(null);
    setRoutePlan(null);
  };

  const copyExternalLink = async () => {
    if (!routePlan?.externalUrl) return;
    try {
      await navigator.clipboard.writeText(routePlan.externalUrl);
      toast.success('A Mapy útvonal linkje a vágólapra került.');
    } catch {
      toast.error('A link másolása nem sikerült.');
    }
  };

  if (!isConfigured) {
    return (
      <Card className={cn('rounded-2xl border-dashed', className)}>
        <CardContent className="space-y-3 p-4 text-sm text-muted-foreground">
          <div className="font-medium text-foreground">Mapy útvonaltervező</div>
          <p>A funkcióhoz állítsd be a <code>VITE_MAPY_API_KEY</code> környezeti változót.</p>
          {value && (
            <div className="space-y-2 rounded-xl border bg-muted/30 p-3 text-foreground">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{ROUTE_TYPES.find((item) => item.value === value.routeType)?.label ?? value.routeType}</Badge>
                <Badge variant="outline">{formatMeters(value.lengthM)}</Badge>
                <Badge variant="outline">{formatDuration(value.durationS)}</Badge>
              </div>
              <div className="text-sm">{pointToText(value.start)} → {pointToText(value.end)}</div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('rounded-2xl border-primary/10', className)}>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Route className="h-4 w-4 text-primary" /> Mapy útvonalterv
            </div>
            <p className="text-xs text-muted-foreground">
              Kereséssel vagy a térképre kattintva add meg a pontokat. A kattintott pont lehet kezdőpont, végpont vagy köztes pont.
            </p>
          </div>
          {!readOnly && (
            <Button type="button" variant="ghost" size="sm" onClick={clearPlanner} className="rounded-xl">
              <Trash2 className="mr-2 h-4 w-4" /> Törlés
            </Button>
          )}
        </div>

        <div className="relative z-[1000] grid gap-3 md:grid-cols-2">
          <MapySearchInput label="Kezdőpont" value={start} onSelect={(point) => { setStart(point); setRoutePlan(null); }} disabled={readOnly} />
          <MapySearchInput label="Végpont" value={end} onSelect={(point) => { setEnd(point); setRoutePlan(null); }} disabled={readOnly} />
        </div>

        {!readOnly && (
          <div className="grid gap-3 md:grid-cols-[1fr,auto] md:items-end">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Útvonaltípus</Label>
              <Select value={routeType} onValueChange={(next) => { setRouteType(next as MapyRouteType); setRoutePlan(null); }}>
                <SelectTrigger className="rounded-xl h-11"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  {ROUTE_TYPES.map((item) => (
                    <SelectItem key={item.value} value={item.value} className="rounded-lg">{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={calculateRoute} className="rounded-xl h-11" disabled={!start || !end || loadingRoute}>
              {loadingRoute ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Route className="mr-2 h-4 w-4" />} Útvonal számítása
            </Button>
          </div>
        )}

        <div className="relative rounded-2xl border bg-muted/20">
          <div ref={mapContainerRef} className="h-[360px] w-full rounded-2xl" />
          <MapyAttribution className="absolute bottom-3 left-3 z-10" compact />
        </div>

        {clickedCandidate && !readOnly && (
          <div className="rounded-2xl border border-warning/30 bg-warning/5 p-3 text-sm">
            <div className="mb-2 font-medium text-foreground">Kijelölt pont: {clickedCandidate.label}</div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" className="rounded-xl" onClick={() => assignCandidate('start')}>Kezdőpont</Button>
              <Button type="button" size="sm" variant="secondary" className="rounded-xl" onClick={() => assignCandidate('end')}>Végpont</Button>
              <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => assignCandidate('waypoint')}>Köztes pont</Button>
              <Button type="button" size="sm" variant="ghost" className="rounded-xl" onClick={() => setClickedCandidate(null)}>Mégse</Button>
            </div>
          </div>
        )}

        {waypoints.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Köztes pontok</Label>
            <div className="space-y-2">
              {waypoints.map((point, index) => (
                <div key={`${point.lat}-${point.lon}-${index}`} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                  <span>{index + 1}. {pointToText(point)}</span>
                  {!readOnly && (
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => { setWaypoints((current) => current.filter((_, currentIndex) => currentIndex !== index)); setRoutePlan(null); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {routePlan && (
          <div className="space-y-3 rounded-2xl border bg-primary/5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{ROUTE_TYPES.find((item) => item.value === routePlan.routeType)?.label ?? routePlan.routeType}</Badge>
              <Badge variant="outline">{formatMeters(routePlan.lengthM)}</Badge>
              <Badge variant="outline">{formatDuration(routePlan.durationS)}</Badge>
              {routePlan.elevationSummary && (
                <Badge variant="outline"><Mountain className="mr-1 h-3.5 w-3.5" /> +{routePlan.elevationSummary.ascentM} / -{routePlan.elevationSummary.descentM} m</Badge>
              )}
            </div>

            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={handleEnrichElevation} disabled={loadingElevation}>
                  {loadingElevation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mountain className="mr-2 h-4 w-4" />} Szintprofil dúsítása
                </Button>
                {routePlan.externalUrl && (
                  <>
                    <a href={routePlan.externalUrl} target="_blank" rel="noopener noreferrer">
                      <Button type="button" variant="outline" size="sm" className="rounded-xl">
                        <ExternalLink className="mr-2 h-4 w-4" /> Megnyitás Mapy.com-on
                      </Button>
                    </a>
                    <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={copyExternalLink}>
                      <Copy className="mr-2 h-4 w-4" /> Link másolása
                    </Button>
                  </>
                )}
              </div>
            )}

            {routePlan.warnings && routePlan.warnings.length > 0 && (
              <div className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
                {routePlan.warnings.join(' • ')}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
