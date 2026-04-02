import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2, List, Map, Clock, SlidersHorizontal } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AnimatePresence } from 'framer-motion';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { VenueDetailModal } from '@/components/venue/VenueDetailModal';
import { VenueMapView } from '@/components/venue/VenueMapView';
import { haversineKm, isLikelyOpenNow } from '@/components/venue/venueUtils';
import type { CachedVenue, VenueSelection } from '@/components/venue/types';

export type { VenueSelection };

// Map activity hints to venue_cache tags
const HINT_TAG_MAP: Record<string, string[]> = {
  'társas': ['board_game', 'tabletop', 'cafe', 'entertainment'],
  'társasjáték': ['board_game', 'tabletop', 'cafe', 'entertainment'],
  'sakk': ['board_game', 'tabletop', 'cafe'],
  'szabadulószoba': ['escape_room', 'entertainment'],
  'tánc': ['dance', 'dance_studio'],
  'fejszedobálás': ['axe_throwing', 'entertainment'],
  'futás': ['park', 'outdoor', 'sport'],
  'kerékpár': ['park', 'outdoor', 'sport'],
  'bicikli': ['park', 'outdoor', 'sport'],
  'úszás': ['swimming', 'pool', 'sport'],
  'tenisz': ['tennis', 'sport'],
  'mászás': ['climbing', 'boulder', 'sport'],
  'boulder': ['climbing', 'boulder', 'sport'],
  'fitnesz': ['fitness', 'gym', 'sport'],
  'jóga': ['yoga', 'wellness', 'fitness'],
  'box': ['martial_arts', 'dojo', 'sport'],
  'küzdősport': ['martial_arts', 'dojo', 'sport'],
  'zene': ['music', 'concert', 'venue'],
  'koncert': ['music', 'concert', 'venue'],
  'bowling': ['bowling', 'entertainment'],
  'mozi': ['cinema', 'entertainment'],
  'múzeum': ['museum', 'culture'],
  'színház': ['theater', 'culture'],
  'festés': ['workshop', 'creative', 'art'],
  'kézműves': ['workshop', 'creative', 'art'],
  'főzés': ['restaurant', 'dining', 'gastro'],
  'bor': ['wine', 'beer', 'tasting'],
  'sör': ['wine', 'beer', 'tasting'],
  'gaming': ['gaming', 'esport', 'internet_cafe'],
  'labda': ['ball', 'sport', 'stadium'],
  'foci': ['ball', 'sport', 'stadium'],
  'kosár': ['ball', 'sport', 'stadium'],
  'horgolás': ['workshop', 'creative', 'art'],
  'kötés': ['workshop', 'creative', 'art'],
};

function getTagsForHint(hint: string): string[] {
  const lower = hint.toLowerCase();
  const matchedTags = new Set<string>();
  for (const [keyword, tags] of Object.entries(HINT_TAG_MAP)) {
    if (lower.includes(keyword)) tags.forEach(t => matchedTags.add(t));
  }
  if (matchedTags.size === 0) return ['entertainment', 'cafe', 'community'];
  return Array.from(matchedTags);
}

interface VenueSuggestionsPanelProps {
  activityHint: string;
  bias?: { lat: number; lon: number };
  cityName?: string;
  onSelectVenue: (venue: VenueSelection) => void;
}

export function VenueSuggestionsPanel({ activityHint, bias, onSelectVenue }: VenueSuggestionsPanelProps) {
  const [rawVenues, setRawVenues] = useState<CachedVenue[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<CachedVenue | null>(null);

  // Filters
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [maxDistanceKm, setMaxDistanceKm] = useState(50);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [showFilters, setShowFilters] = useState(false);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const tags = getTagsForHint(activityHint);
      const { data, error } = await supabase
        .from('venue_cache')
        .select('*')
        .overlaps('tags', tags)
        .limit(50);

      if (error) {
        console.error('venue_cache query error:', error);
        setRawVenues([]);
      } else {
        const rows = (data || []) as unknown as CachedVenue[];
        // Compute distances
        rows.forEach((v) => {
          if (bias) v.distanceKm = haversineKm(bias.lat, bias.lon, v.lat, v.lon);
        });
        setRawVenues(rows);
      }
      setLoaded(true);
    } catch {
      setRawVenues([]);
      setLoaded(true);
    }
    setLoading(false);
  };

  // Filter + sort
  const filteredVenues = useMemo(() => {
    let list = [...rawVenues];

    if (openNowOnly) {
      list = list.filter(v => isLikelyOpenNow(v.opening_hours_text));
    }

    if (bias) {
      list = list.filter(v => (v.distanceKm ?? Infinity) <= maxDistanceKm);
      list.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }

    return list;
  }, [rawVenues, openNowOnly, maxDistanceKm, bias]);

  const handleUseVenue = useCallback((venue: CachedVenue) => {
    onSelectVenue({
      displayName: [venue.name, venue.city].filter(Boolean).join(', '),
      city: venue.city || '',
      district: '',
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
          {/* View toggle */}
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

          {/* Filter toggle */}
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
            onClick={() => { setLoaded(false); setRawVenues([]); setSelectedVenue(null); }}
          >
            Bezárás
          </Button>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
          {/* Open now toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Csak nyitva lévők
            </Label>
            <Switch checked={openNowOnly} onCheckedChange={setOpenNowOnly} />
          </div>

          {/* Distance slider */}
          {bias && (
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
        </div>
      )}

      {/* Content */}
      {filteredVenues.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nem találtunk helyszínt a szűrési feltételeknek megfelelően.
        </p>
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
          bias={bias}
          onSelectVenue={handleMapSelect}
        />
      )}

      {/* Venue detail modal */}
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
