import { useMemo, useState } from 'react';
import { Check, ChevronDown, Globe2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  COUNTRIES,
  countryMeta,
  type CountryCode,
  type CountrySelection,
} from '@/features/events/countryFilter';

export interface CountryCounts {
  [code: string]: number;
}

interface Props {
  selection: CountrySelection;
  onChange: (next: CountrySelection) => void;
  /** Upcoming programme count per country code, for the numbers on the buttons. */
  counts?: CountryCounts;
  /** Shown above the row; the listing and the map word it slightly differently. */
  label?: string;
}

/**
 * Country is the primary geography of every listing.
 *
 * The visitor's own country is always present and selected; every other country
 * sits behind one deliberate "Külföldi programok" step and is multi-select. That
 * ordering is the whole point: a Hungarian visitor should not have to scroll
 * past Praha and Warszawa to find Budapest, which is what the old row of
 * capital-city chips made them do.
 */
export function CountryFilterBar({ selection, onChange, counts = {}, label = 'Ország' }: Props) {
  const [expanded, setExpanded] = useState(selection.foreign.length > 0);

  const home = countryMeta(selection.home);
  const foreignCountries = useMemo(
    () => COUNTRIES.filter((c) => c.code !== selection.home),
    [selection.home],
  );
  const selectedForeign = new Set(selection.foreign);

  const toggleForeign = (code: CountryCode) => {
    const next = new Set(selectedForeign);
    if (next.has(code)) next.delete(code); else next.add(code);
    onChange({ ...selection, foreign: Array.from(next) });
  };

  const foreignTotal = foreignCountries.reduce((sum, c) => sum + (counts[c.code] ?? 0), 0);

  return (
    <div className="mb-5 rounded-[1.2rem] border border-primary/10 bg-secondary/40 p-4">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        {selection.foreign.length > 0 && (
          <button
            type="button"
            className="text-xs font-semibold text-primary hover:underline"
            onClick={() => onChange({ ...selection, foreign: [] })}
          >
            Csak {home?.label ?? selection.home}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* The home country is not a toggle: it is the baseline the listing is
            built on, and turning it off would leave a visitor with an empty
            screen and no obvious way back. Foreign countries ADD to it. */}
        <span
          className="inline-flex items-center gap-1.5 rounded-full border-0 bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-foreground"
          data-testid="country-home"
        >
          <span aria-hidden="true">{home?.flag}</span>
          {home?.label ?? selection.home}
          {counts[selection.home] != null && (
            <span className="ml-0.5 text-xs opacity-70">{counts[selection.home]}</span>
          )}
        </span>

        <Button
          type="button"
          size="sm"
          variant={selection.foreign.length ? 'default' : 'outline'}
          aria-expanded={expanded}
          aria-controls="country-drilldown"
          onClick={() => setExpanded((v) => !v)}
          className={`rounded-full ${selection.foreign.length ? 'border-0 bg-primary text-primary-foreground' : 'bg-card'}`}
          data-testid="country-foreign-toggle"
        >
          <Globe2 size={14} className="mr-1.5" aria-hidden="true" />
          Külföldi programok
          {selection.foreign.length > 0
            ? <span className="ml-1.5 text-xs opacity-80">{selection.foreign.length}</span>
            : foreignTotal > 0 && <span className="ml-1.5 text-xs opacity-70">{foreignTotal}</span>}
          <ChevronDown
            size={14}
            className={`ml-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </Button>

        {/* Which foreign countries are on, visible without opening the drawer. */}
        {!expanded && selection.foreign.map((code) => {
          const meta = countryMeta(code);
          return (
            <span key={code} className="rounded-full bg-card px-2.5 py-1 text-xs text-muted-foreground">
              {meta?.flag} {meta?.label ?? code}
            </span>
          );
        })}
      </div>

      {expanded && (
        <div id="country-drilldown" className="mt-3 rounded-[0.9rem] bg-card/70 p-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Több országot is kiválaszthatsz — a listához hozzáadódnak a hazai programok mellé.
          </p>
          <div className="flex flex-wrap gap-2">
            {foreignCountries.map((c) => {
              const on = selectedForeign.has(c.code);
              const n = counts[c.code];
              return (
                <button
                  key={c.code}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggleForeign(c.code)}
                  disabled={n === 0}
                  title={c.endonym}
                  className={[
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition',
                    on
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:bg-secondary',
                    n === 0 ? 'cursor-not-allowed opacity-40' : '',
                  ].join(' ')}
                  data-testid={`country-option-${c.code}`}
                >
                  {on
                    ? <Check size={14} aria-hidden="true" />
                    : <span aria-hidden="true">{c.flag}</span>}
                  {c.label}
                  {n != null && <span className="text-xs opacity-70">{n}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
