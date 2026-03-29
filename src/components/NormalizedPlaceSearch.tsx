import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { searchNormalizedPlaces } from '@/lib/places/client';
import type { NormalizedPlaceSummary } from '@/lib/places/types';

interface NormalizedPlaceSearchProps {
  label?: string;
  placeholder?: string;
  value?: NormalizedPlaceSummary | null;
  onSelect: (item: NormalizedPlaceSummary) => void;
  featurePath?: 'event_create' | 'event_edit' | 'event_detail' | 'venue_search' | 'details';
  latitude?: number;
  longitude?: number;
  disabled?: boolean;
}

function formatPlace(item: NormalizedPlaceSummary) {
  return [item.address, item.city, item.country].filter(Boolean).join(', ');
}

export function NormalizedPlaceSearch({
  label = 'Hely keresése',
  placeholder = 'Keress helyet, venue-t vagy címet…',
  value,
  onSelect,
  featurePath = 'event_create',
  latitude,
  longitude,
  disabled,
}: NormalizedPlaceSearchProps) {
  const [query, setQuery] = useState(value?.name || '');
  const [items, setItems] = useState<NormalizedPlaceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value?.name || '');
  }, [value?.id, value?.name]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const search = async (nextQuery: string) => {
    if (nextQuery.trim().length < 2) {
      setItems([]);
      setOpen(false);
      setErrorText(null);
      return;
    }

    setLoading(true);
    setErrorText(null);
    try {
      const response = await searchNormalizedPlaces({
        query: nextQuery.trim(),
        latitude,
        longitude,
        featurePath,
        preferDetails: featurePath === 'details',
      });
      setItems(response.items);
      setOpen(response.items.length > 0);
      if (response.items.length === 0) {
        setErrorText('Nem találtunk megfelelő helyet erre a keresésre.');
      }
    } catch (error) {
      setItems([]);
      setOpen(false);
      setErrorText((error as Error).message || 'A helykeresés sikertelen volt.');
    } finally {
      setLoading(false);
    }
  };

  const resultCount = useMemo(() => items.length, [items]);

  return (
    <div ref={rootRef} className="relative space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
              void search(next);
            }, 350);
          }}
          onFocus={() => items.length > 0 && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="h-11 rounded-xl pl-9 pr-9"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {value && !open && (
        <div className="rounded-xl border bg-primary/5 px-3 py-2 text-sm">
          <div className="font-medium text-foreground">{value.name}</div>
          <div className="mt-1 text-muted-foreground">{formatPlace(value)}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {value.categories.map((category) => <Badge key={category} variant="secondary">{category}</Badge>)}
            <Badge variant="outline">{value.source}</Badge>
          </div>
        </div>
      )}

      {open && resultCount > 0 && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-2xl border bg-popover shadow-xl">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-start gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/40"
              onClick={() => {
                onSelect(item);
                setQuery(item.name);
                setOpen(false);
              }}
            >
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground">{item.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{formatPlace(item)}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.categories.slice(0, 3).map((category) => <Badge key={category} variant="secondary">{category}</Badge>)}
                  <Badge variant="outline">{item.source}</Badge>
                  {item.diagnostics?.fallbackUsed && <Badge variant="outline">fallback</Badge>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {errorText && <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{errorText}</div>}
      {value && !disabled && (
        <Button type="button" variant="ghost" size="sm" className="rounded-xl px-0 text-xs" onClick={() => { setQuery(''); setItems([]); setOpen(false); }}>
          Új keresés
        </Button>
      )}
    </div>
  );
}
