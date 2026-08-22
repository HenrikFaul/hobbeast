import { RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ExternalEventsAdminController } from '../useExternalEventsAdminController';
import { AdminProviderEventList } from './AdminProviderEventList';

interface SeatGeekProviderPanelProps {
  model: ExternalEventsAdminController['seatGeek'];
}

export function SeatGeekProviderPanel({ model }: SeatGeekProviderPanelProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          value={model.params.q || ''}
          onChange={(event) => model.setParams((current) => ({ ...current, q: event.target.value }))}
          placeholder="Kulcsszó"
        />
        <Input
          value={model.params.venueCity || ''}
          onChange={(event) => model.setParams((current) => ({ ...current, venueCity: event.target.value }))}
          placeholder="Város"
        />
        <Input
          value={model.params.taxonomyName || ''}
          onChange={(event) => model.setParams((current) => ({ ...current, taxonomyName: event.target.value }))}
          placeholder="Taxonómia (pl. sports, concerts)"
        />
        <Input
          value={String(model.params.perPage || 20)}
          onChange={(event) => model.setParams((current) => ({ ...current, perPage: Number(event.target.value) || 20 }))}
          placeholder="Darabszám"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void model.preview()} disabled={model.loading}>
          <Search className="mr-1 h-4 w-4" />Előnézet
        </Button>
        <Button variant="outline" onClick={() => void model.sync()} disabled={model.loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${model.loading ? 'animate-spin' : ''}`} />Import adatbázisba
        </Button>
      </div>
      {model.runState.message && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground" role="status">
          {model.runState.message}
        </div>
      )}
      <AdminProviderEventList events={model.events} mode="preview" />
    </div>
  );
}
