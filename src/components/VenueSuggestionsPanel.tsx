import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Star, Phone, Globe, Clock, ChevronRight, Loader2, X, ExternalLink } from 'lucide-react';
import { searchPlaces, type NormalizedPlace } from '@/lib/placeSearch';
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

interface VenueDetail {
  name: string;
  address: string;
  city: string;
  phone?: string;
  website?: string;
  openingHours?: string[];
  categories: string[];
  rating?: number;
  lat: number;
  lon: number;
  source: string;
  sourceId: string;
  raw?: Record<string, unknown>;
}

interface VenueSuggestionsPanelProps {
  activityHint: string;
  bias?: { lat: number; lon: number };
  onSelectVenue: (venue: VenueSelection) => void;
}

export function VenueSuggestionsPanel({ activityHint, bias, onSelectVenue }: VenueSuggestionsPanelProps) {
  const [venues, setVenues] = useState<NormalizedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<NormalizedPlace | null>(null);
  const [venueDetail, setVenueDetail] = useState<VenueDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const results = await searchPlaces(activityHint, bias, activityHint);
      setVenues(results.slice(0, 10));
      setLoaded(true);
    } catch {
      setVenues([]);
      setLoaded(true);
    }
    setLoading(false);
  };

  const fetchDetail = async (venue: NormalizedPlace) => {
    setSelectedVenue(venue);
    setDetailLoading(true);
    setVenueDetail(null);
    try {
      const { data } = await supabase.functions.invoke('place-search', {
        body: { action: 'details', sourceId: venue.sourceId, source: venue.source, lat: venue.lat, lon: venue.lon },
      });
      if (data?.detail) {
        setVenueDetail(data.detail);
      } else {
        // Fallback: use what we already have
        setVenueDetail({
          name: venue.name,
          address: venue.address,
          city: venue.city,
          categories: venue.categories,
          lat: venue.lat,
          lon: venue.lon,
          source: venue.source,
          sourceId: venue.sourceId,
        });
      }
    } catch {
      setVenueDetail({
        name: venue.name,
        address: venue.address,
        city: venue.city,
        categories: venue.categories,
        lat: venue.lat,
        lon: venue.lon,
        source: venue.source,
        sourceId: venue.sourceId,
      });
    }
    setDetailLoading(false);
  };

  const handleUseVenue = (venue: NormalizedPlace) => {
    onSelectVenue({
      displayName: [venue.name, venue.city].filter(Boolean).join(', '),
      city: venue.city,
      district: venue.district,
      address: venue.address || venue.name,
      lat: venue.lat,
      lon: venue.lon,
      placeId: venue.id,
      source: venue.source,
      categories: venue.categories,
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
          Nem találtunk javasolt helyszínt ehhez a tevékenységhez.
        </p>
      ) : (
        <div className="rounded-xl border bg-popover max-h-[280px] overflow-y-auto divide-y">
          {venues.map((v) => (
            <button
              key={v.id}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
              onClick={() => fetchDetail(v)}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                <MapPin className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{v.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[v.address, v.city].filter(Boolean).join(', ')}
                </p>
                {v.categories.length > 0 && (
                  <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
                    {v.categories.slice(0, 3).join(' · ')}
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

              {detailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">Részletek betöltése...</span>
                </div>
              ) : venueDetail ? (
                <div className="space-y-4">
                  {/* Address */}
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <p className="text-sm">{[venueDetail.address, venueDetail.city].filter(Boolean).join(', ')}</p>
                  </div>

                  {/* Phone */}
                  {venueDetail.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <a href={`tel:${venueDetail.phone}`} className="text-sm text-primary hover:underline">{venueDetail.phone}</a>
                    </div>
                  )}

                  {/* Website */}
                  {venueDetail.website && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <a href={venueDetail.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                        Weboldal <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}

                  {/* Opening hours */}
                  {venueDetail.openingHours && venueDetail.openingHours.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="text-sm space-y-0.5">
                        {venueDetail.openingHours.map((h, i) => (
                          <p key={i} className="text-muted-foreground">{h}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rating */}
                  {venueDetail.rating != null && venueDetail.rating > 0 && (
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-amber-500 flex-shrink-0" />
                      <span className="text-sm font-medium">{venueDetail.rating.toFixed(1)} / 5</span>
                    </div>
                  )}

                  {/* Categories */}
                  {venueDetail.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {venueDetail.categories.slice(0, 6).map((cat, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Source badge */}
                  <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">
                    Forrás: {venueDetail.source === 'tomtom' ? 'TomTom' : 'Geoapify'}
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
              ) : null}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
