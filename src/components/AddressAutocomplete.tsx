import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2 } from 'lucide-react';
import { suggestPlaces, searchTextPlaces, getPlace, type AwsSuggestResult } from '@/lib/awsLocation';

export interface AddressSelection {
  displayName: string;
  city: string;
  district: string;
  address: string;
  lat: number;
  lon: number;
}

interface AddressAutocompleteProps {
  value: string;
  onSelect: (selection: AddressSelection) => void;
  placeholder?: string;
  className?: string;
}

export function AddressAutocomplete({ value, onSelect, placeholder = 'Kezdj el gépelni egy címet...', className }: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<AwsSuggestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const requestRef = useRef<AbortController | null>(null);
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
    requestRef.current?.abort();
  }, []);

  const search = async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setShowDropdown(false);
      setLoading(false);
      setErrorText(null);
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setLoading(true);
    setErrorText(null);

    try {
      let data = await suggestPlaces(trimmed, controller.signal);

      if (data.length === 0) {
        data = await searchTextPlaces(trimmed, controller.signal);
      }

      setResults(data);
      setShowDropdown(data.length > 0);
      if (data.length === 0) {
        setErrorText('Nincs találat erre a címre.');
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setResults([]);
        setShowDropdown(false);
        setErrorText((error as Error).message || 'Hiba történt a címkeresés során.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (val: string) => {
    setQuery(val);
    setErrorText(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void search(val);
    }, 400);
  };

  const handleSelect = async (result: AwsSuggestResult) => {
    const label = result.place?.label || result.text;
    setQuery(label);
    setResults([]);
    setShowDropdown(false);
    setErrorText(null);

    let city = result.place?.locality || '';
    let district = result.place?.district || '';
    let address = [result.place?.street, result.place?.addressNumber].filter(Boolean).join(' ').trim();
    let lat = result.place?.position ? result.place.position[1] : 0;
    let lon = result.place?.position ? result.place.position[0] : 0;

    if (result.placeId && (!lat || !lon)) {
      const details = await getPlace(result.placeId);
      if (details) {
        city = city || details.locality || '';
        district = district || details.district || '';
        address = address || [details.street, details.addressNumber].filter(Boolean).join(' ').trim();
        if (details.position) {
          lon = details.position[0];
          lat = details.position[1];
        }
      }
    }

    onSelect({
      displayName: label,
      city,
      district,
      address,
      lat,
      lon,
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
          {results.map((r, i) => (
            <button
              key={`${r.suggestId || i}-${r.text}`}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors text-sm border-b last:border-0 flex items-start gap-2"
              onClick={() => handleSelect(r)}
            >
              <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <span className="text-foreground leading-snug">{r.place?.label || r.text}</span>
            </button>
          ))}
        </div>
      )}

      {errorText && (
        <div className="mt-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorText}
        </div>
      )}
    </div>
  );
}
