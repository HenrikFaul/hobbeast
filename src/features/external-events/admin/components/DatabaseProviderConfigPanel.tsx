import { Database, PlusCircle, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DB_TEST_COLUMN_OPTIONS, DEFAULT_DB_TEST_COLUMNS, titleCaseFromKey } from '../domain';
import { GEODATA_TABLE_OPTIONS, type GeodataTableName } from '@/lib/searchProviderConfig';
import type { ExternalEventsAdminController } from '../useExternalEventsAdminController';

interface DatabaseProviderConfigPanelProps {
  model: ExternalEventsAdminController['databaseConfig'];
  debug: Record<string, unknown> | null;
}

export function DatabaseProviderConfigPanel({ model, debug }: DatabaseProviderConfigPanelProps) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-primary" /> Adatbázistábla kapcsolat
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
          Geodata Supabase projekt: <code className="rounded bg-background px-1">https://buuoyyfzincmbxafvihc.supabase.co</code>. Itt választod ki, mely táblákból jöhetnek venue találatok. A mentett sorok <code className="rounded bg-background px-1">db:</code> prefixű providerként jelennek meg a bal oldali menükben.
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs font-medium">
            Adatbázistábla
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm font-normal"
              value={model.form.table}
              onChange={(event) => model.setForm((current) => ({ ...current, table: event.target.value as GeodataTableName }))}
            >
              {GEODATA_TABLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium">
            Megjelenített név
            <Input
              value={model.form.label}
              onChange={(event) => model.setForm((current) => ({ ...current, label: event.target.value }))}
              placeholder="Pl. Unified POI"
            />
          </label>
          <label className="space-y-1 text-xs font-medium">
            Teszt város
            <Input
              value={model.form.city}
              onChange={(event) => model.setForm((current) => ({ ...current, city: event.target.value }))}
              placeholder="Pl. Budapest"
            />
          </label>
          <div className="space-y-1 text-xs font-medium">
            <div className="flex items-center justify-between gap-2">
              <span>Teszt kategória</span>
              <Badge variant="outline" className="gap-1"><Database className="h-3 w-3" /> Live from Database</Badge>
            </div>
            <Input
              value={model.form.category}
              onChange={(event) => model.setForm((current) => ({ ...current, category: event.target.value }))}
              placeholder="Pl. Vendéglátás, cafe, restaurant, társas"
              list="geodata-category-discovery"
            />
            <datalist id="geodata-category-discovery">
              {model.categoryAliases.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.value} · {category.hungarian} ({category.count})
                </option>
              ))}
            </datalist>
            <div className="text-[11px] text-muted-foreground" role="status">
              {model.discoveryLoading
                ? 'Élő kategóriák felderítése...'
                : model.discovery
                  ? `${model.discovery.categories.length} kategória · ${model.discovery.rowCount ?? model.discovery.sampleSize} sor mintázva`
                  : 'A kategóriák az adatbázisból töltődnek, és magyar aliasokkal együtt ajánljuk őket.'}
            </div>
            {model.form.category && model.mappedCategory && model.mappedCategory !== model.form.category ? (
              <div className="rounded-md border bg-muted/30 p-2 text-[11px]">
                <span className="font-medium">Erre gondoltál?</span>{' '}
                <button
                  type="button"
                  className="text-primary underline"
                  onClick={() => model.setForm((current) => ({ ...current, category: model.mappedCategory }))}
                >
                  {titleCaseFromKey(model.mappedCategory)}
                </button>
                <span className="text-muted-foreground"> · automatikus semantic mapping a lekérdezéshez, HU/EN aliasokkal</span>
              </div>
            ) : null}
            {model.categorySuggestions.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {model.categorySuggestions.map((suggestion) => (
                  <Button
                    key={suggestion.value}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => model.setForm((current) => ({ ...current, category: suggestion.value }))}
                  >
                    {suggestion.displayLabel} · {suggestion.count}
                  </Button>
                ))}
              </div>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              Lokális Hobbeast katalógustábla: <code>public.places_local_catalog</code>. A tartós provider ↔ Hobbeast mapper tábla a Geodata projektben: <code>public.provider_category_mapper</code>.
            </p>
            {model.discoveryError ? <p className="text-[11px] text-destructive" role="alert">{model.discoveryError}</p> : null}
          </div>
          <label className="space-y-1 text-xs font-medium">
            Teszt forrás
            <Input
              value={model.form.source}
              onChange={(event) => model.setForm((current) => ({ ...current, source: event.target.value }))}
              placeholder="Pl. geoapify, osm, local"
              list="geodata-source-discovery"
            />
            <datalist id="geodata-source-discovery">
              {(model.discovery?.sources || []).map((source) => (
                <option key={source.value} value={source.value}>{source.value} ({source.count})</option>
              ))}
            </datalist>
          </label>
          <label className="space-y-1 text-xs font-medium">
            Teszt lekérdezési darabszám
            <Input
              type="number"
              min={1}
              max={80}
              value={model.form.limit}
              onChange={(event) => model.setForm((current) => ({
                ...current,
                limit: Math.min(Math.max(Number(event.target.value) || 10, 1), 80),
              }))}
            />
          </label>
          <div className="flex items-end gap-2">
            <Button className="flex-1" onClick={() => void model.addConfig()} disabled={model.saving}>
              <PlusCircle className="mr-1 h-4 w-4" /> Mentés providerként
            </Button>
            <Button variant="outline" onClick={() => void model.runQuery()} disabled={model.queryLoading || model.form.columns.length === 0}>
              <Search className={`mr-1 h-4 w-4 ${model.queryLoading ? 'animate-spin' : ''}`} /> Lekérdezés
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/10 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Tesztben megjelenített oszlopok</p>
              <p className="text-xs text-muted-foreground">A 15 legfontosabb POI mezőből választhatsz. A nem létező oszlopokat a backend automatikusan kihagyja az adott táblánál.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={model.selectAllColumns}>Kiválaszt mind</Button>
              <Button size="sm" variant="outline" onClick={model.clearColumns}>Kiválasztások törlése</Button>
              <Button size="sm" onClick={() => void model.runQuery()} disabled={model.queryLoading || model.form.columns.length === 0}>
                <Search className={`mr-1 h-4 w-4 ${model.queryLoading ? 'animate-spin' : ''}`} /> Lekérdezés futtatása
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {DB_TEST_COLUMN_OPTIONS.map((column) => (
              <label key={column.value} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-muted/40">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  checked={model.form.columns.includes(column.value)}
                  onChange={(event) => model.toggleColumn(column.value, event.target.checked)}
                />
                <span>{column.label}</span>
                <code className="ml-auto text-[10px] text-muted-foreground">{column.value}</code>
              </label>
            ))}
          </div>
          <p className="sr-only">Alapértelmezett oszlopok száma: {DEFAULT_DB_TEST_COLUMNS.length}</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Mentett db providerek</p>
            <Badge variant="secondary">{model.configs.length} db</Badge>
          </div>
          {model.configs.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Még nincs mentett adatbázistábla provider. Válassz táblát, adj neki nevet, teszteld, majd mentsd providerként.
            </div>
          ) : (
            <div className="space-y-2">
              {model.configs.map((row) => (
                <div key={row.provider} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.label}</p>
                    <p className="truncate text-xs text-muted-foreground"><code>{row.provider}</code> · {row.table}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => model.editConfig(row)}>Szerkeszt</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void model.removeConfig(row.provider)}
                      aria-label={`${row.label} provider törlése`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {debug ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Legutóbbi teszt debug</p>
            <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(debug, null, 2)}</pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
