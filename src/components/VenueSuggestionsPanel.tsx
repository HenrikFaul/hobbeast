import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Star, Phone, Globe, Clock, ChevronRight, Loader2, X, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';

export interface VenueSelection {
  displayName: string;
  city: string;
  district: string;
  address: string;
  lat: number;
  lon: number;
  placeId: string;
  source: string;
  categories: string[];
}

interface CachedVenue {
  id: string;
  provider: string;
  external_id: string;
  name: string;
  category: string | null;
  tags: string[];
  address: string | null;
  city: string | null;
  lat: number;
  lon: number;
  phone: string | null;
  website: string | null;
  rating: number | null;
  image_url: string | null;
  opening_hours_text: string[] | null;
  details: Record<string, unknown>;
}

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
    if (lower.includes(keyword)) {
      tags.forEach(t => matchedTags.add(t));
    }
  }

  // Fallback: broad entertainment/cafe search
  if (matchedTags.size === 0) {
    return ['entertainment', 'cafe', 'community'];
  }

  return Array.from(matchedTags);
}

interface VenueSuggestionsPanelProps {
  activityHint: string;
  bias?: { lat: number; lon: number };
  onSelectVenue: (venue: VenueSelection) => void;
}

export function VenueSuggestionsPanel({ activityHint, bias, onSelectVenue }: VenueSuggestionsPanelProps) {
  const [venues, setVenues] = useState<CachedVenue[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<CachedVenue | null>(null);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const tags = getTagsForHint(activityHint);

      // Query venue_cache table by overlapping tags
      const { data, error } = await supabase
        .from('venue_cache' as any)
        .select('*')
        .overlaps('tags', tags)
        .limit(10);

      if (error) {
        console.error('venue_cache query error:', error);
        setVenues([]);
      } else {
        const rows = (data || []) as unknown as CachedVenue[];

        // Sort by distance if bias is available
        if (bias) {
          rows.sort((a, b) => {
            const distA = Math.hypot(a.lat - bias.lat, a.lon - bias.lon);
            const distB = Math.hypot(b.lat - bias.lat, b.lon - bias.lon);
            return distA - distB;
          });
        }

        setVenues(rows.slice(0, 10));
      }
      setLoaded(true);
    } catch {
      setVenues([]);
      setLoaded(true);
    }
    setLoading(false);
  };

  const handleUseVenue = (venue: CachedVenue) => {
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
  };

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
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Keresés...
          </>
        ) : (
          <>
            <MapPin className="h-4 w-4 mr-2" />
            Helyszínjavaslatok mutatása
          </>
        )}
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Javasolt helyszínek ({venues.length})
        </p>
        <Button type="button" variant="ghost" size="sm" className="text-xs rounded-xl h-7" onClick={() => { setLoaded(false); setVenues([]); setSelectedVenue(null); }}>
          Bezárás
        </Button>
      </div>

      {venues.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nem találtunk javasolt helyszínt ehhez a tevékenységhez. Futtasd a venue seed funkciót az adatok betöltéséhez.
        </p>
      ) : (
        <div className="rounded-xl border bg-popover max-h-[280px] overflow-y-auto divide-y">
          {venues.map((v) => (
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
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Venue detail modal */}
      <AnimatePresence>
        {selectedVenue && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 backdrop-blur-sm p-4" onClick={() => setSelectedVenue(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border bg-card p-6 shadow-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-lg leading-tight">{selectedVenue.name}</h4>
                    <p className="text-sm text-muted-foreground">{selectedVenue.city}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => setSelectedVenue(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4">
                {/* Address */}
                {selectedVenue.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <p className="text-sm">{selectedVenue.address}</p>
                  </div>
                )}

                {/* Phone */}
                {selectedVenue.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <a href={`tel:${selectedVenue.phone}`} className="text-sm text-primary hover:underline">{selectedVenue.phone}</a>
                  </div>
                )}

                {/* Website */}
                {selectedVenue.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <a href={selectedVenue.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                      Weboldal <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}

                {/* Opening hours */}
                {selectedVenue.opening_hours_text && selectedVenue.opening_hours_text.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="text-sm space-y-0.5">
                      {selectedVenue.opening_hours_text.map((h, i) => (
                        <p key={i} className="text-muted-foreground">{h}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rating */}
                {selectedVenue.rating != null && selectedVenue.rating > 0 && (
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    <span className="text-sm font-medium">{selectedVenue.rating.toFixed(1)} / 5</span>
                  </div>
                )}

                {/* Tags */}
                {selectedVenue.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedVenue.tags.slice(0, 6).map((tag, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Source badge */}
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">
                  Forrás: {selectedVenue.provider === 'tomtom' ? 'TomTom' : 'Geoapify'}
                </p>

                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    className="flex-1 rounded-xl h-10 font-semibold"
                    onClick={() => {
                      handleUseVenue(selectedVenue);
                      setSelectedVenue(null);
                    }}
                  >
                    <MapPin className="h-4 w-4 mr-2" />
                    Helyszínnek kiválasztom
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
