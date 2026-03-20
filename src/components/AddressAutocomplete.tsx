import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2 } from 'lucide-react';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address: {
    road?: string;
    pedestrian?: string;
    footway?: string;
    house_number?: string;
    suburb?: string;
    neighbourhood?: string;
    quarter?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    city_district?: string;
    district?: string;
    borough?: string;
  };
}

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
  onInputChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function buildAddressParts(result: NominatimResult) {
  const addr = result.address || {};
  const city = addr.city || addr.town || addr.village || addr.municipality || '';
  const district = addr.city_district || addr.district || addr.borough || addr.suburb || addr.neighbourhood || addr.quarter || '';
  const street = addr.road || addr.pedestrian || addr.footway || '';
  const address = [street, addr.house_number].filter(Boolean).join(' ').trim();

  return { city, district, address };
}

export function AddressAutocomplete({ value, onSelect, onInputChange, placeholder = 'Kezdj el gépelni egy címet...', className }: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
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
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: trimmed,
        format: 'jsonv2',
        addressdetails: '1',
        limit: '6',
        'accept-language': 'hu',
        countrycodes: 'hu',
      });

      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      if (!res.ok) throw new Error(`Nominatim search failed: ${res.status}`);
      const data: NominatimResult[] = await res.json();
      setResults(data);
      setShowDropdown(data.length > 0);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setResults([]);
        setShowDropdown(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (val: string) => {
    setQuery(val);
    onInputChange?.(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void search(val);
    }, 400);
  };

  const handleSelect = (result: NominatimResult) => {
    const parts = buildAddressParts(result);
    setQuery(result.display_name);
    setResults([]);
    setShowDropdown(false);
    onSelect({
      displayName: result.display_name,
      city: parts.city,
      district: parts.district,
      address: parts.address,
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
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
              key={`${r.place_id}-${r.lat}-${r.lon}`}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors text-sm border-b last:border-0 flex items-start gap-2"
              onClick={() => handleSelect(r)}
            >
              <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <span className="text-foreground leading-snug">{r.display_name}</span>
            </button>
          ))}
          <p className="text-[10px] text-muted-foreground text-center py-1.5">
            © OpenStreetMap contributors
          </p>
        </div>
      )}
    </div>
  );
}
