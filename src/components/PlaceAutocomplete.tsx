import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2, SearchX } from 'lucide-react';
import { toast } from 'sonner';
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

const DEBOUNCE_MS = 300;
const SLOW_QUERY_MS = 500;

export function PlaceAutocomplete({
  value,
  onSelect,
  placeholder = 'Keress rá egy helyszínre...',
  className,
  bias,
  activityHint,
}: PlaceAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<NormalizedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
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
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    abortRef.current?.abort();
  }, []);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();

    if (trimmed.length < 2) {
      abortRef.current?.abort();
      setResults([]);
      setShowDropdown(false);
      setLoading(false);
      setOptimizing(false);
      setErrorMessage('');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;

    setLoading(true);
    setErrorMessage('');
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => {
      if (!controller.signal.aborted && requestSeqRef.current === requestSeq) {
        setOptimizing(true);
      }
    }, SLOW_QUERY_MS);

    try {
      const data = await searchPlaces(trimmed, bias, activityHint, undefined, 'venue', {
        signal: controller.signal,
        limit: 12,
        suppressErrors: true,
      });

      if (controller.signal.aborted || requestSeqRef.current !== requestSeq) return;

      setResults(data);
      setShowDropdown(true);
      if (data.length === 0) {
        setErrorMessage('Nincs találat ebben a keresésben. Próbáld másik kulcsszóval vagy általánosabb tevékenységnévvel.');
      }
    } catch (error) {
      if (controller.signal.aborted || requestSeqRef.current !== requestSeq) return;
      console.error('[PlaceAutocomplete] stable search failed', {
        error,
        query: trimmed,
        activityHint,
        bias,
      });
      setResults([]);
      setShowDropdown(true);
      setErrorMessage('A helyszínkeresés most nem válaszolt. Próbáld újra rövidebb vagy másik kulcsszóval.');
      toast.error('Helyszínkeresés sikertelen. A modal nyitva maradt, az adatok nem vesztek el.');
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
  }, [activityHint, bias]);

  const handleChange = useCallback((val: string) => {
    setQuery(val);
    setShowDropdown(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), DEBOUNCE_MS);
  }, [runSearch]);

  const handleSelect = useCallback((place: NormalizedPlace) => {
    const display = [place.name, place.city].filter(Boolean).join(', ');
    setQuery(display);
    setResults([]);
    setShowDropdown(false);
    setErrorMessage('');
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
  }, [onSelect]);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (results.length > 0 || errorMessage) setShowDropdown(true);
          }}
          placeholder={placeholder}
          className={`pl-9 pr-9 rounded-xl h-11 ${className || ''}`}
          aria-busy={loading}
          aria-invalid={Boolean(errorMessage && !loading)}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {optimizing && (
        <p className="mt-1 text-xs text-primary">
          Optimizing query... A címadatbázis lassabban válaszol, a korábbi kereséseket megszakítottuk.
        </p>
      )}

      {showDropdown && (results.length > 0 || errorMessage || loading) && (
        <div className="absolute z-50 w-full mt-1 rounded-xl border bg-popover shadow-lg max-h-72 overflow-y-auto">
          {loading && results.length === 0 && (
            <div className="space-y-2 p-3">
              <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
              <div className="h-3 w-full rounded bg-muted/70 animate-pulse" />
              <div className="h-3 w-4/5 rounded bg-muted/70 animate-pulse" />
            </div>
          )}

          {!loading && results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors text-sm border-b last:border-0 flex items-start gap-2"
              onClick={() => handleSelect(r)}
            >
              <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <span className="block text-foreground leading-snug font-medium truncate">{r.name}</span>
                <p className="text-xs text-muted-foreground truncate">
                  {[r.address, r.city].filter(Boolean).join(' · ')}
                </p>
                {r.categories.length > 0 && (
                  <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                    {r.categories.slice(0, 4).join(' · ')}
                  </p>
                )}
              </div>
            </button>
          ))}

          {!loading && results.length === 0 && errorMessage && (
            <div className="p-4 text-sm text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                <SearchX className="h-4 w-4 text-primary" />
                Nincs megjeleníthető helyszín
              </div>
              <p>{errorMessage}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
