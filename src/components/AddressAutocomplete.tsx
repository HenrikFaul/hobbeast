import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2 } from 'lucide-react';
import { getPlace, searchTextPlaces, suggestPlaces, type AwsSuggestResult } from '@/lib/awsLocation';
import { getAddressSearchProvider } from '@/lib/searchProviderConfig';
import { searchPlaces, type NormalizedPlace } from '@/lib/placeSearch';

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

type AddressResult = {
  key: string;
  label: string;
  city: string;
  district: string;
  address: string;
  lat: number;
  lon: number;
  placeId?: string;
};

function buildQueryVariants(input: string): string[] {
  const q = input.trim().replace(/\s+/g, ' ');
  if (!q) return [];

  const variants = new Set<string>();
  variants.add(q);

  const hasStreetType = /\b(utca|u\.|út|útja|tér|tere|körút|krt\.|sétány|park|fasor|rakpart)\b/i.test(q);
  if (!hasStreetType) {
    variants.add(`${q} utca`);
    variants.add(`${q} út`);
    variants.add(`${q} tér`);
    variants.add(`${q} körút`);
  }

  const parts = q.split(' ');
  if (parts.length >= 2) {
    const reversed = [...parts].reverse().join(' ');
    variants.add(reversed);
    if (!hasStreetType) variants.add(`${reversed} utca`);
  }

  return Array.from(variants);
}

function mapAwsResult(item: AwsSuggestResult, index: number): AddressResult {
  return {
    key: `${item.placeId || 'aws'}-${index}`,
    label: item.place?.label || item.text || '',
    city: item.place?.locality || '',
    district: item.place?.district || '',
    address: [item.place?.street, item.place?.addressNumber].filter(Boolean).join(' ').trim() || item.place?.label || item.text || '',
    lat: item.place?.position?.[1] || 0,
    lon: item.place?.position?.[0] || 0,
    placeId: item.placeId,
  };
}

function mapNormalizedPlace(item: NormalizedPlace, index: number): AddressResult {
  return {
    key: `${item.source}-${item.sourceId}-${index}`,
    label: [item.name, item.city].filter(Boolean).join(', ') || item.address || item.name,
    city: item.city || '',
    district: item.district || '',
    address: item.address || item.name,
    lat: item.lat || 0,
    lon: item.lon || 0,
  };
}

export function AddressAutocomplete({ value, onSelect, placeholder = 'Kezdj el gépelni egy címet...', className }: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<AddressResult[]>([]);
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
      const provider = await getAddressSearchProvider('personal');
      let data: AddressResult[] = [];

      if (provider === 'aws') {
        const variants = buildQueryVariants(trimmed);
        let awsData: AwsSuggestResult[] = [];

        for (const variant of variants) {
          awsData = await suggestPlaces(variant, controller.signal);
          if (awsData.length > 0) break;

          awsData = await searchTextPlaces(variant, controller.signal);
          if (awsData.length > 0) break;
        }

        data = awsData.map(mapAwsResult);
      } else {
        const remote = await searchPlaces(trimmed, undefined, undefined, provider);
        data = remote.map(mapNormalizedPlace);
      }

      setResults(data);
      setShowDropdown(data.length > 0);
      if (data.length === 0) {
        setErrorText('Nincs találat erre a címre. Próbáld pontosabban: pl. utca / út / tér megadásával.');
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

  const handleSelect = async (result: AddressResult) => {
    setQuery(result.label);
    setResults([]);
    setShowDropdown(false);
    setErrorText(null);

    let finalResult = result;
    if (result.placeId && (!result.lat || !result.lon)) {
      const details = await getPlace(result.placeId).catch(() => null);
      if (details?.position) {
        finalResult = {
          ...result,
          city: result.city || details.locality || '',
          district: result.district || details.district || '',
          address: result.address || [details.street, details.addressNumber].filter(Boolean).join(' ').trim() || details.label || '',
          lat: details.position[1],
          lon: details.position[0],
        };
      }
    }

    onSelect({
      displayName: finalResult.label,
      city: finalResult.city,
      district: finalResult.district,
      address: finalResult.address,
      lat: finalResult.lat,
      lon: finalResult.lon,
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
              key={r.key}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors text-sm border-b last:border-0 flex items-start gap-2"
              onClick={() => handleSelect(r)}
            >
              <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-foreground leading-snug">{r.label}</span>
                {(r.city || r.district) && (
                  <p className="text-xs text-muted-foreground">{[r.city, r.district].filter(Boolean).join(' · ')}</p>
                )}
              </div>
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
