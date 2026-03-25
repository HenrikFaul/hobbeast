import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MapPin, Loader2 } from 'lucide-react';
import { loadPlaceDetails, searchPlaces } from '@/lib/places/orchestrator';
import type { CanonicalPlaceCategory, NormalizedPlaceDetails, NormalizedPlaceSummary, PlaceDiagnostics, PlaceProviderSource, SourceIds } from '@/lib/places/types';

export interface AddressSelection {
  displayName: string;
  name?: string;
  city: string;
  district: string;
  address: string;
  lat: number;
  lon: number;
  categories?: CanonicalPlaceCategory[];
  source?: PlaceProviderSource;
  sourceIds?: SourceIds;
  diagnostics?: PlaceDiagnostics;
  details?: NormalizedPlaceDetails | null;
}

interface AddressAutocompleteProps {
  value: string;
  onSelect: (selection: AddressSelection) => void;
  placeholder?: string;
  className?: string;
  searchMode?: 'mixed' | 'address' | 'venue';
}

function selectionFromPlace(place: NormalizedPlaceSummary, details: NormalizedPlaceDetails | null): AddressSelection {
  return {
    displayName: place.formattedAddress || [place.name, place.address, place.city].filter(Boolean).join(', '),
    name: place.name,
    city: place.city || '',
    district: place.district || '',
    address: place.address || place.name,
    lat: place.lat,
    lon: place.lon,
    categories: place.categories,
    source: place.source,
    sourceIds: place.sourceIds,
    diagnostics: place.diagnostics,
    details,
  };
}

function compactLocation(place: NormalizedPlaceSummary) {
  return [place.address, place.city, place.country].filter(Boolean).join(', ');
}

function categoryLabel(category: CanonicalPlaceCategory) {
  const labels: Record<CanonicalPlaceCategory, string> = {
    food_restaurant: 'Étterem',
    cafe: 'Kávézó',
    bar_nightlife: 'Bár / Esti hely',
    entertainment: 'Szórakozás',
    hobby_games: 'Hobbi / Játék',
    culture: 'Kultúra',
    sports: 'Sport',
    park_outdoor: 'Kültéri hely',
    shopping: 'Bolt',
    tourism: 'Látnivaló',
    generic_poi: 'Helyszín',
    unknown: 'Ismeretlen',
  };
  return labels[category] || 'Helyszín';
}

export function AddressAutocomplete({ value, onSelect, placeholder = 'Kezdj el gépelni egy helyet vagy címet...', className, searchMode = 'mixed' }: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<NormalizedPlaceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const latestQueryRef = useRef('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const search = async (q: string) => {
    const trimmed = q.trim();
    latestQueryRef.current = trimmed;
    if (trimmed.length < 2) {
      setResults([]);
      setShowDropdown(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await searchPlaces(trimmed, { limit: 6, mode: searchMode });
      if (latestQueryRef.current !== trimmed) return;
      setResults(data);
      setShowDropdown(data.length > 0);
    } catch {
      setResults([]);
      setShowDropdown(false);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void search(val);
    }, 350);
  };

  const handleSelect = async (result: NormalizedPlaceSummary) => {
    setQuery(result.formattedAddress || compactLocation(result) || result.name);
    setResults([]);
    setShowDropdown(false);

    let details: NormalizedPlaceDetails | null = null;
    if (searchMode !== 'address') {
      try {
        details = await loadPlaceDetails(result);
      } catch {
        details = null;
      }
    }

    onSelect(selectionFromPlace(result, details));
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          className={`pl-9 pr-9 rounded-xl h-11 ${className || ''}`}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-xl border bg-popover shadow-lg max-h-72 overflow-y-auto">
          {results.map((r, index) => {
            const firstCategory = r.categories[0] ?? 'unknown';
            return (
              <button
                key={`${r.source}-${r.sourceIds.geoapify ?? ''}-${r.sourceIds.tomtom ?? ''}-${r.lat}-${r.lon}-${index}`}
                type="button"
                className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors text-sm border-b last:border-0 flex items-start gap-3"
                onClick={() => void handleSelect(r)}
              >
                <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-foreground font-medium leading-snug">{r.name}</span>
                    <Badge variant="outline" className="text-[10px] rounded-md px-1.5 py-0">
                      {categoryLabel(firstCategory)}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground leading-snug truncate">{compactLocation(r) || r.formattedAddress || r.name}</p>
                </div>
              </button>
            );
          })}
          <p className="text-[10px] text-muted-foreground text-center py-1.5">
            Helyadatok: Geoapify elsődleges keresés, TomTom kiegészítés/fallback amikor szükséges.
          </p>
        </div>
      )}
    </div>
  );
}
