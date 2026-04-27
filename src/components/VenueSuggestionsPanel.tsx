import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2, List, Map, Clock, SlidersHorizontal, SearchX } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { VenueDetailModal } from '@/components/venue/VenueDetailModal';
import { VenueMapView } from '@/components/venue/VenueMapView';
import { haversineKm, isLikelyOpenNow } from '@/components/venue/venueUtils';
import { searchPlaces, type NormalizedPlace } from '@/lib/placeSearch';
import type { CachedVenue, VenueSelection } from '@/components/venue/types';

export type { VenueSelection };

interface VenueSuggestionsPanelProps {
  activityHint: string;
  bias?: { lat: number; lon: number };
  cityName?: string;
  onSelectVenue: (venue: VenueSelection) => void;
}

const SLOW_QUERY_MS = 500;

function normalizedPlaceToCachedVenue(place: NormalizedPlace): CachedVenue {
  return {
    id: place.id,
    provider: place.source,
    external_id: place.sourceId,
    name: place.name,
    category: place.categories[0] || null,
    tags: place.categories,
    address: place.address,
    city: place.city,
    lat: place.lat,
    lon: place.lon,
    phone: null,
    website: null,
    rating: null,
    image_url: null,
    opening_hours_text: null,
    details: {
      district: place.district,
      postcode: place.postcode,
      country: place.country,
      confidence: place.confidence,
    },
  };
}

function buildVenueQuery(activityHint: string, cityName?: string) {
  const hint = activityHint.trim();
  if (hint.length >= 2) return hint;
  return cityName?.trim() || 'venue';
}

export function VenueSuggestionsPanel({ activityHint, bias, cityName, onSelectVenue }: VenueSuggestionsPanelProps) {
  const [rawVenues, setRawVenues] = useState<CachedVenue[]>([]);
  const [effectiveBias, setEffectiveBias] = useState(bias);
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<CachedVenue | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  // Filters
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [maxDistanceKm, setMaxDistanceKm] = useState(50);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');

  useEffect(() => () => {
    abortRef.current?.abort();
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
  }, []);

  const fetchSuggestions = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;

    setLoading(true);
    setOptimizing(false);
    setErrorMessage('');

    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => {
      if (!controller.signal.aborted && requestSeqRef.current === requestSeq) {
        setOptimizing(true);
      }
    }, SLOW_QUERY_MS);

    try {
      let useBias = bias;
      if (!useBias && navigator.geolocation) {
        setGeoStatus('requesting');
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 300000 });
          });
          if (controller.signal.aborted) return;
          useBias = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          setEffectiveBias(useBias);
          setGeoStatus('granted');
        } catch {
          setGeoStatus('denied');
        }
      }

      const query = buildVenueQuery(activityHint, cityName);
      const places = await searchPlaces(query, useBias, activityHint, undefined, 'venue', {
        signal: controller.signal,
        limit: 24,
        category: activityHint,
        suppressErrors: true,
      });

      if (controller.signal.aborted || requestSeqRef.current !== requestSeq) return;

      const rows = places.map(normalizedPlaceToCachedVenue);
      const biasToUse = useBias || effectiveBias;
      rows.forEach((v) => {
        if (biasToUse && Number.isFinite(v.lat) && Number.isFinite(v.lon)) {
          v.distanceKm = haversineKm(biasToUse.lat, biasToUse.lon, v.lat, v.lon);
        }
      });

      setRawVenues(rows);
      setLoaded(true);
      if (rows.length === 0) {
        setErrorMessage('Nem találtunk helyszínt ehhez a tevékenységhez. Próbálj általánosabb kulcsszót vagy másik kategóriát.');
      }
    } catch (error) {
      if (controller.signal.aborted || requestSeqRef.current !== requestSeq) return;
      console.error('[VenueSuggestionsPanel] venue suggestion fetch failed', {
        error,
        activityHint,
        cityName,
        bias,
      });
      setRawVenues([]);
      setLoaded(true);
      setErrorMessage('A helyszínjavaslatok betöltése sikertelen. Hálózati vagy adatbázis-konzisztencia probléma lehet.');
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setLoading(false);
        setOptimizing(false);
      }
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
    }
  }, [activityHint, bias, cityName, effectiveBias]);

  // Filter + sort
  const filteredVenues = useMemo(() => {
    let list = [...rawVenues];

    if (openNowOnly) {
      list = list.filter(v => isLikelyOpenNow(v.opening_hours_text));
    }

    const biasToUse = bias || effectiveBias;
    if (biasToUse) {
      list = list.filter(v => (v.distanceKm ?? Infinity) <= maxDistanceKm);
      list.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }

    return list;
  }, [rawVenues, openNowOnly, maxDistanceKm, bias, effectiveBias]);

  const handleUseVenue = useCallback((venue: CachedVenue) => {
    onSelectVenue({
      displayName: [venue.name, venue.city].filter(Boolean).join(', '),
      city: venue.city || '',
      district: typeof venue.details?.district === 'string' ? venue.details.district : '',
      address: venue.address || venue.name,
      lat: venue.lat,
      lon: venue.lon,
      placeId: venue.external_id,
      source: venue.provider,
      categories: venue.tags,
    });
  }, [onSelectVenue]);

  const handleMapSelect = useCallback((venue: CachedVenue) => {
    setSelectedVenue(venue);
  }, []);

  if (!loaded) {
    return (
      <div className="space-y-2">
        <Button
          type="button"
          variant="default"
          className="rounded-xl h-10 font-semibold"
          onClick={fetchSuggestions}
          disabled={loading}
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Keresés...</>
          ) : (
            <><MapPin className="h-4 w-4 mr-2" />Helyszínjavaslatok mutatása</>
          )}
        </Button>
        {optimizing && (
          <p className="text-xs text-primary">Optimizing query... A helyszínadatbázis lassabban válaszol.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Helyszínek ({filteredVenues.length})
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 w-7 p-0 rounded-lg"
            onClick={() => setViewMode('list')}
            title="Lista nézet"
          >
            <List className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant={viewMode === 'map' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 w-7 p-0 rounded-lg"
            onClick={() => setViewMode('map')}
            title="Térkép nézet"
          >
            <Map className="h-3.5 w-3.5" />
          </Button>

          <Button
            type="button"
            variant={showFilters ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2 rounded-lg text-xs gap-1"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs rounded-xl h-7"
            onClick={() => { abortRef.current?.abort(); setLoaded(false); setRawVenues([]); setSelectedVenue(null); setErrorMessage(''); }}
          >
            Bezárás
          </Button>
        </div>
      </div>

      {optimizing && (
        <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
          Optimizing query... A korábbi kérések megszakítva, az aktuális keresés fut.
        </p>
      )}

      {showFilters && (
        <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Csak nyitva lévők
            </Label>
            <Switch checked={openNowOnly} onCheckedChange={setOpenNowOnly} />
          </div>

          {(bias || effectiveBias) && (
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Max távolság
                </span>
                <span className="font-mono text-muted-foreground">{maxDistanceKm} km</span>
              </Label>
              <Slider
                min={1}
                max={100}
                step={1}
                value={[maxDistanceKm]}
                onValueChange={([v]) => setMaxDistanceKm(v)}
                className="w-full"
              />
            </div>
          )}

          {geoStatus === 'denied' && (
            <p className="text-xs text-muted-foreground">
              A böngésző nem adott pozíciót, ezért város/tevékenység alapján keresünk.
            </p>
          )}
        </div>
      )}

      {filteredVenues.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
            <SearchX className="h-4 w-4 text-primary" />
            Nincs találat
          </div>
          <p>{errorMessage || 'Nem találtunk helyszínt a szűrési feltételeknek megfelelően.'}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3 rounded-xl" onClick={fetchSuggestions}>
            Újrapróbálás
          </Button>
        </div>
      ) : viewMode === 'list' ? (
        <div className="rounded-xl border bg-popover max-h-[280px] overflow-y-auto divide-y">
          {filteredVenues.map((v) => (
            <button
              key={v.id}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
              onClick={() => setSelectedVenue(v)}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                <MapPin className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{v.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[v.address, v.city].filter(Boolean).join(', ')}
                </p>
                {v.tags.length > 0 && (
                  <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
                    {v.tags.slice(0, 3).join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                {v.distanceKm != null && (
                  <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                    {v.distanceKm < 1 ? `${Math.round(v.distanceKm * 1000)} m` : `${v.distanceKm.toFixed(1)} km`}
                  </span>
                )}
                {v.rating != null && v.rating > 0 && (
                  <span className="text-[10px] text-amber-600">★ {v.rating.toFixed(1)}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <VenueMapView
          venues={filteredVenues}
          bias={bias || effectiveBias}
          onSelectVenue={handleMapSelect}
        />
      )}

      <AnimatePresence>
        {selectedVenue && (
          <VenueDetailModal
            venue={selectedVenue}
            onClose={() => setSelectedVenue(null)}
            onSelect={handleUseVenue}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
