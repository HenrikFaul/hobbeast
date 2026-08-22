import { AlertCircle, Database, Info, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatDbCell, titleCaseFromKey } from '../domain';
import type { ExternalEventsAdminController } from '../useExternalEventsAdminController';

interface DatabaseRunStatusPanelProps {
  model: ExternalEventsAdminController['runStatus'];
}

export function DatabaseRunStatusPanel({ model }: DatabaseRunStatusPanelProps) {
  const statusLabel = model.loading
    ? 'Lekérdezés folyamatban'
    : model.error
      ? 'Hiba'
      : !model.executed
        ? 'Még nincs futtatva'
        : model.totalCount === null
          ? `${model.rows.length} sor`
          : `${model.totalCount} találat / ${model.filteredRows.length} látható sor / ${model.rows.length} sor lekérve`;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /> Lekérdezés eredménye</span>
          <Badge variant={model.error ? 'destructive' : 'secondary'}>{statusLabel}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">Tábla: {model.form.table}</Badge>
          <Badge variant="outline">Város: {model.form.city || 'nincs szűrő'}</Badge>
          <Badge variant="outline">Kategória: {model.form.category || 'nincs szűrő'}</Badge>
          <Badge variant="outline">Forrás: {model.form.source || 'nincs szűrő'}</Badge>
          <Badge variant="outline">Oszlopok: {model.form.columns.length}</Badge>
          <Badge variant="outline">Geodata projekt: buuoyyfzincmbxafvihc</Badge>
          {model.responseMs !== null && (
            <Badge variant={model.responseMs > 500 ? 'secondary' : 'outline'}>Válaszidő: {model.responseMs} ms</Badge>
          )}
          {model.mappedCategory && model.form.category && model.mappedCategory !== model.form.category && (
            <Badge variant="outline">Mapped: {model.mappedCategory}</Badge>
          )}
        </div>

        {!model.executed && !model.loading && (
          <div className="flex items-start gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium text-foreground">Itt fognak megjelenni a lekérdezett sorok.</p>
              <p>Válaszd ki a szűrőket és az oszlopokat, majd kattints a <strong>Lekérdezés futtatása</strong> gombra.</p>
            </div>
          </div>
        )}

        {model.slow && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm" role="status">
            <RefreshCw className="h-4 w-4 animate-spin text-primary" /> Optimizing query... a Supabase válaszideje 500 ms fölött van, fut a lekérdezés.
          </div>
        )}

        {model.loading && (
          <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground" role="status">
            <Search className="h-4 w-4 animate-spin" /> Lekérdezés futtatása...
          </div>
        )}

        {model.error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">A lekérdezés nem sikerült</p>
              <p>{model.error}</p>
            </div>
          </div>
        )}

        {model.executed && !model.loading && !model.error && model.rows.length === 0 && (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Nincs megjeleníthető sor a megadott szűrőkkel. A tábla {model.discovery?.diagnostics?.tableReachable ? 'elérhető' : 'nem ellenőrzött'}, a mintában {model.discovery?.diagnostics?.hasAnyRows ? 'van adat' : 'nincs adat'}.{' '}
            {model.form.category
              ? `A(z) „${model.form.category}” kategória mapped értéke: „${model.mappedCategory || model.form.category}”. Próbáld meg: ${model.discovery?.categories?.slice(0, 3).map((item) => titleCaseFromKey(item.value)).join(', ') || 'másik kategória'}.`
              : 'Próbáld üresen hagyni a kategória vagy forrás szűrőt, vagy növeld a lekérdezési darabszámot.'}
          </div>
        )}

        {model.rows.length > 0 && (
          <DbResultTable
            columns={model.columns}
            rows={model.filteredRows}
            filters={model.filters}
            updateFilter={model.updateFilter}
          />
        )}

        {model.mapperRows.length > 0 && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                <span className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /> Fordító / mapper nézet</span>
                <Badge variant="secondary">{model.filteredMapperRows.length} megjelenített mapper sor</Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Ez a place-search mapper normalizált kimenete ugyanarra a lekérdezésre, így a nyers táblás eredmény és a frontend által ténylegesen használt mezők egymás mellett ellenőrizhetők.
              </p>
              <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                <p><strong>Most látható mezők:</strong> provider kategóriák eredeti angol kulcsai (<code>categories_en</code>), magyar fordításuk (<code>categories_hu</code>) és a Hobbeast katalógushoz becsült lokális megfeleltetés (<code>local_catalog_path_hu</code>, <code>local_catalog_slug</code>).</p>
                <p className="mt-1"><strong>Forrás:</strong> ez a nézet jelenleg frontend-oldali fordító réteg. A tartós Supabase mapper tábla ehhez a körhöz a Geodata projektben lett előkészítve SQL fájlban: <code>public.provider_category_mapper</code>.</p>
              </div>
            </CardHeader>
            <CardContent>
              <DbResultTable
                columns={model.mapperColumns}
                rows={model.filteredMapperRows}
                filters={model.mapperFilters}
                updateFilter={model.updateMapperFilter}
                mapper
              />
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}

function DbResultTable({
  columns,
  rows,
  filters,
  updateFilter,
  mapper = false,
}: {
  columns: readonly string[];
  rows: readonly Record<string, unknown>[];
  filters: Readonly<Record<string, string>>;
  updateFilter: (column: string, value: string) => void;
  mapper?: boolean;
}) {
  return (
    <div className={mapper ? '' : 'space-y-3'}>
      <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-lg border">
        <table className="w-max min-w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap px-3 py-2 text-left font-medium">{column}</th>
              ))}
            </tr>
            <tr className="border-t bg-background">
              {columns.map((column) => (
                <th key={`${column}-${mapper ? 'mapper-' : ''}filter`} className="px-2 py-2">
                  <Input
                    value={filters[column] || ''}
                    onChange={(event) => updateFilter(column, event.target.value)}
                    placeholder={`${column}${mapper ? ' mapper' : ''} szűrés...`}
                    aria-label={`${column}${mapper ? ' mapper' : ''} oszlopszűrés`}
                    className={`h-8 ${mapper ? 'min-w-[180px]' : 'min-w-[150px]'} text-xs`}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t align-top">
                {columns.map((column) => (
                  <td
                    key={column}
                    className={`truncate px-3 py-2 ${mapper ? 'max-w-[280px]' : 'max-w-[260px]'}`}
                    title={formatDbCell(row[column])}
                  >
                    {formatDbCell(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!mapper && <p className="text-[11px] text-muted-foreground">A szűrés az oszlopfejlécek alatt realtime történik, csak a frontend táblanézetet szűri.</p>}
    </div>
  );
}
