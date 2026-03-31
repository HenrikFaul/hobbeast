import { useState, useRef, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Loader2 } from 'lucide-react';
import { HOBBY_CATALOG, type HobbyCategory, type HobbySubcategory, type HobbyActivity } from '@/lib/hobbyCategories';

export interface ActivitySelection {
  categoryId: string;
  subcategoryId: string;
  activityId: string;
  categoryName: string;
  subcategoryName: string;
  activityName: string;
  emoji: string;
  /** TomTom/Geoapify POI search keywords for venue finder */
  venueSearchHint: string;
}

interface FlatActivity {
  category: HobbyCategory;
  subcategory: HobbySubcategory;
  activity: HobbyActivity;
  searchText: string;
}

function buildIndex(): FlatActivity[] {
  const items: FlatActivity[] = [];
  for (const cat of HOBBY_CATALOG) {
    for (const sub of cat.subcategories) {
      for (const act of sub.activities) {
        const searchText = [
          act.name,
          sub.name,
          cat.name,
          ...(act.keywords || []),
        ].join(' ').toLowerCase();
        items.push({ category: cat, subcategory: sub, activity: act, searchText });
      }
    }
  }
  return items;
}

interface ActivityAutocompleteProps {
  onSelect: (selection: ActivitySelection) => void;
  placeholder?: string;
  className?: string;
  /** Currently selected display text */
  value?: string;
}

export function ActivityAutocomplete({ onSelect, placeholder = 'Keress tevékenységet, pl. sakkozás, futás...', className, value }: ActivityAutocompleteProps) {
  const [query, setQuery] = useState(value || '');
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const index = useMemo(() => buildIndex(), []);

  useEffect(() => {
    if (value !== undefined) setQuery(value);
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

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const terms = q.split(/\s+/);
    return index
      .filter(item => terms.every(t => item.searchText.includes(t)))
      .slice(0, 10);
  }, [query, index]);

  const handleSelect = (item: FlatActivity) => {
    const display = `${item.activity.emoji || item.subcategory.emoji || ''} ${item.activity.name}`.trim();
    setQuery(display);
    setShowDropdown(false);

    // Build a venue search hint from the activity context
    const venueHint = [item.activity.name, item.subcategory.name]
      .filter(Boolean)
      .join(' ');

    onSelect({
      categoryId: item.category.id,
      subcategoryId: item.subcategory.id,
      activityId: item.activity.id,
      categoryName: item.category.name,
      subcategoryName: item.subcategory.name,
      activityName: item.activity.name,
      emoji: item.activity.emoji || item.subcategory.emoji || item.category.emoji,
      venueSearchHint: venueHint,
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          className={`pl-9 rounded-xl h-11 ${className || ''}`}
        />
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-xl border bg-popover shadow-lg max-h-60 overflow-y-auto">
          {results.map((r) => (
            <button
              key={`${r.category.id}-${r.subcategory.id}-${r.activity.id}`}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors text-sm border-b last:border-0"
              onClick={() => handleSelect(r)}
            >
              <span className="font-medium text-foreground">
                {r.activity.emoji} {r.activity.name}
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {r.category.emoji} {r.category.name} › {r.subcategory.name}
              </p>
            </button>
          ))}
        </div>
      )}

      {showDropdown && query.trim().length >= 2 && results.length === 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-xl border bg-popover shadow-lg p-4 text-sm text-muted-foreground text-center">
          Nincs találat. Próbáld a kategória-választót lentebb.
        </div>
      )}
    </div>
  );
}
