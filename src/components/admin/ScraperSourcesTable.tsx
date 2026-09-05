import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Filter, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

/**
 * The scraper source registry table: sortable on every column, and filterable
 * on every column by whatever that column actually holds — a multi-select of
 * the distinct values for the categorical ones (country, method, categories,
 * access, frontier progress, state), a free-text match for the source itself,
 * and range-free ordering for the numeric and date ones. Filters combine with AND across
 * columns and OR inside a column, which is what a "show me only these" pick
 * means in practice.
 *
 * The header checkbox selects exactly the rows that survive the current filter,
 * so an operator can narrow to, say, the Polish ticketing sources and hand that
 * set straight to a collection run.
 */

import {
  STRATEGY_LABELS,
  applyQuery,
  countryLabel,
  distinctValues,
  statusOf,
  type ScraperDestination,
  type SortDir,
  type SortKey,
} from '@/components/admin/scraperSources';

function ColumnFilter({ label, values, chosen, onChange, format }: {
  label: string;
  values: string[];
  chosen: Set<string>;
  onChange: (next: Set<string>) => void;
  format?: (v: string) => string;
}) {
  const active = chosen.size > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label} szűrése`}
          className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded ${active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
        >
          <Filter className="h-3 w-3" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold">{label}</span>
          {active && (
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={() => onChange(new Set())}>
              <X className="mr-0.5 h-3 w-3" /> töröl
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-56">
          <ul className="space-y-0.5 pr-2">
            {values.length === 0 && <li className="px-1 py-2 text-xs text-muted-foreground">Nincs érték.</li>}
            {values.map((v) => (
              <li key={v}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted">
                  <Checkbox
                    checked={chosen.has(v)}
                    onCheckedChange={() => {
                      const next = new Set(chosen);
                      if (next.has(v)) next.delete(v); else next.add(v);
                      onChange(next);
                    }}
                  />
                  <span className="truncate">{format ? format(v) : v}</span>
                </label>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function SortButton({ label, active, dir, onClick }: {
  label: string; active: boolean; dir: SortDir; onClick: () => void;
}) {
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Rendezés: ${label}`}
      className={`inline-flex items-center gap-1 rounded px-0.5 hover:text-foreground ${active ? 'text-foreground' : ''}`}
    >
      {label}
      <Icon className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

export function ScraperSourcesTable({ destinations, selected, onToggle, onSelectMany }: {
  destinations: ScraperDestination[];
  selected: Set<string>;
  onToggle: (sourceId: string) => void;
  onSelectMany: (sourceIds: string[], on: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  const [showAll, setShowAll] = useState(false);

  const setColumnFilter = (key: SortKey, next: Set<string>) =>
    setFilters((current) => {
      const copy = { ...current };
      if (next.size === 0) delete copy[key]; else copy[key] = next;
      return copy;
    });

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current?.key === key
        ? (current.dir === 'asc' ? { key, dir: 'desc' } : null)
        : { key, dir: 'asc' });

  const rows = useMemo(() => applyQuery(destinations, query, filters, sort), [destinations, query, filters, sort]);
  const visible = showAll ? rows : rows.slice(0, 30);
  const filterCount = Object.values(filters).reduce((n, s) => n + s.size, 0) + (query.trim() ? 1 : 0);
  const allVisibleSelected = visible.length > 0 && visible.every((d) => selected.has(d.source_id));

  const head = (key: SortKey, label: string, filterable = true, format?: (v: string) => string) => (
    <th className="py-2 pr-3 align-bottom">
      <span className="inline-flex items-center">
        <SortButton label={label} active={sort?.key === key} dir={sort?.key === key ? sort.dir : 'asc'} onClick={() => toggleSort(key)} />
        {filterable && (
          <ColumnFilter
            label={label}
            values={distinctValues(destinations, key)}
            chosen={filters[key] ?? new Set()}
            onChange={(next) => setColumnFilter(key, next)}
            format={format}
          />
        )}
      </span>
    </th>
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Keresés név, URL vagy város szerint…"
          className="h-8 max-w-xs text-sm"
          aria-label="Források keresése"
        />
        <span className="text-xs text-muted-foreground">
          {rows.length} / {destinations.length} forrás
        </span>
        {filterCount > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setFilters({}); setQuery(''); }}>
            <X className="mr-1 h-3 w-3" /> Szűrők törlése
          </Button>
        )}
        {rows.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onSelectMany(rows.map((d) => d.source_id), !allVisibleSelected)}
          >
            {allVisibleSelected ? 'Kijelölés levétele' : `Mind a ${rows.length} kijelölése`}
          </Button>
        )}
      </div>

      <table className="w-full min-w-[1200px] text-sm">
        <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
          <th className="py-2 pr-2 w-8">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={() => onSelectMany(visible.map((d) => d.source_id), !allVisibleSelected)}
              aria-label="Látható források kijelölése"
            />
          </th>
          {head('publisher_name', 'Forrás', false)}
          {head('country_code', 'Ország', true, countryLabel)}
          {head('scrape_strategy', 'Módszer', true, (v) => STRATEGY_LABELS[v] ?? v)}
          {head('categories', 'Kategóriák')}
          {head('access', 'Hozzáférés')}
          {head('last_run_at', 'Utolsó futás')}
          {head('total_events', 'Utolsó · összes', false)}
          {head('frontier', 'Frontier')}
          {head('active_events', 'Aktív / Lejárt', false)}
          {head('status', 'Állapot')}
        </tr></thead>
        <tbody>{visible.map((d) => (
          <tr key={d.source_id} className="border-b last:border-0">
            <td className="py-2 pr-2">
              <Checkbox
                checked={selected.has(d.source_id)}
                onCheckedChange={() => onToggle(d.source_id)}
                aria-label={`${d.publisher_name} kijelölése begyűjtésre`}
              />
            </td>
            <td className="py-2 pr-3">
              <p className="font-medium">{d.publisher_name}</p>
              <p className="max-w-[240px] truncate text-xs text-muted-foreground">{d.endpoint_url}</p>
              {d.scrape_note && (
                <p className="max-w-[280px] text-xs italic text-amber-700 dark:text-amber-500" title={d.scrape_note}>
                  {d.scrape_note.length > 70 ? `${d.scrape_note.slice(0, 70)}…` : d.scrape_note}
                </p>
              )}
            </td>
            <td className="py-2 pr-3 whitespace-nowrap text-xs">{countryLabel(d.country_code)}</td>
            <td className="py-2 pr-3">
              <Badge variant={d.scrape_strategy === 'render' || !d.scrape_strategy ? 'outline' : 'secondary'} className="text-[10px]">
                {STRATEGY_LABELS[d.scrape_strategy || 'render'] || d.scrape_strategy}
              </Badge>
            </td>
            <td className="py-2 pr-3">
              <span className="flex max-w-[160px] flex-wrap gap-1">
                {(d.categories || []).slice(0, 2).map((c) => (
                  <Badge key={c} variant="outline" className="text-[10px] font-normal">{c}</Badge>
                ))}
                {(d.categories || []).length > 2 && (
                  <Badge variant="outline" className="text-[10px] font-normal" title={(d.categories || []).join(', ')}>
                    +{(d.categories || []).length - 2}
                  </Badge>
                )}
                {!(d.categories || []).length && <span className="text-xs text-muted-foreground">—</span>}
              </span>
            </td>
            <td className="py-2 pr-3 text-xs">{d.access}</td>
            <td className="py-2 pr-3">{formatWhen(d.last_run_at)}</td>
            <td className="py-2 pr-3">{d.last_events} · {d.total_events}</td>
            <td className="py-2 pr-3 whitespace-nowrap">{frontierCell(d)}</td>
            <td className="py-2 pr-3">
              <span className="font-semibold text-emerald-600">{d.active_events}</span>
              {' / '}
              <span className="text-muted-foreground">{d.expired_events}</span>
            </td>
            <td className="py-2">
              <Badge variant={d.active_events > 0 ? 'default' : d.last_run_at ? 'secondary' : 'outline'}>
                {statusOf(d)}
              </Badge>
            </td>
          </tr>
        ))}</tbody>
      </table>

      {rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nincs a szűrésnek megfelelő forrás.
        </p>
      )}

      {rows.length > 30 && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Kevesebb mutatása' : `Mind a ${rows.length} forrás mutatása`}
        </Button>
      )}
    </>
  );
}

function formatWhen(value: string | null) {
  if (!value) return 'még nem futott';
  try {
    return new Date(value).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return value;
  }
}

/**
 * The frontier column: `done/total` URLs of the source's persistent queue, a
 * muted error count when there is one, and a dash while the stats carry no
 * frontier at all (the source never ran with it on). A render helper, not a
 * component, so the file stays single-export.
 */
function frontierCell(d: ScraperDestination) {
  if (d.frontier_done == null && d.frontier_pending == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const done = d.frontier_done ?? 0;
  const pending = d.frontier_pending ?? 0;
  const errors = d.frontier_error ?? 0;
  const title = `${done} lekérve, ${pending} hátra, ${errors} hiba · ${d.frontier_events ?? 0} esemény a frontierből`;
  return (
    <span title={title}>
      {`${done}/${done + pending}`}
      {errors > 0 && <span className="ml-1 text-xs text-muted-foreground">(err {errors})</span>}
    </span>
  );
}

export default ScraperSourcesTable;
