import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2 } from 'lucide-react';
import { searchPlaces, type NormalizedPlace } from '@/lib/placeSearch';

export interface PlaceSelection {
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

interface PlaceAutocompleteProps {
  value: string;
  onSelect: (selection: PlaceSelection) => void;
  placeholder?: string;
  className?: string;
  bias?: { lat: number; lon: number };
  /** Activity hint passed to provider for POI-aware search */
  activityHint?: string;
}

export function PlaceAutocomplete({ value, onSelect, placeholder = 'Keress rá egy helyszínre...', className, bias }: PlaceAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<NormalizedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

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

  const doSearch = async (q: string) => {
    if (q.trim().length < 3) {
      setResults([]);
      setShowDropdown(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await searchPlaces(q, bias);
      setResults(data);
      setShowDropdown(data.length > 0);
    } catch {
      setResults([]);
      setShowDropdown(false);
    }
    setLoading(false);
  };

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 400);
  };

  const handleSelect = (place: NormalizedPlace) => {
    const display = [place.name, place.city].filter(Boolean).join(', ');
    setQuery(display);
    setResults([]);
    setShowDropdown(false);
    onSelect({
      displayName: display,
      city: place.city,
      district: place.district,
      address: place.address || place.name,
      lat: place.lat,
      lon: place.lon,
      placeId: place.id,
      source: place.source,
      categories: place.categories,
    });
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
        <div className="absolute z-50 w-full mt-1 rounded-xl border bg-popover shadow-lg max-h-60 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors text-sm border-b last:border-0 flex items-start gap-2"
              onClick={() => handleSelect(r)}
            >
              <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-foreground leading-snug font-medium">{r.name}</span>
                {r.city && <span className="text-muted-foreground text-xs ml-1">({r.city})</span>}
                <p className="text-xs text-muted-foreground">{r.address}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
