import { RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ExternalEventsAdminController } from '../useExternalEventsAdminController';
import { AdminProviderEventList } from './AdminProviderEventList';

interface TicketmasterProviderPanelProps {
  model: ExternalEventsAdminController['ticketmaster'];
}

export function TicketmasterProviderPanel({ model }: TicketmasterProviderPanelProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          value={model.params.keyword || ''}
          onChange={(event) => model.setParams((current) => ({ ...current, keyword: event.target.value }))}
          placeholder="Kulcsszó / város"
        />
        <Input
          value={model.params.classificationName || ''}
          onChange={(event) => model.setParams((current) => ({ ...current, classificationName: event.target.value }))}
          placeholder="Classification (pl. music, sports)"
        />
        <Input
          value={model.params.countryCode || ''}
          onChange={(event) => model.setParams((current) => ({ ...current, countryCode: event.target.value.toUpperCase() }))}
          placeholder="Országkód (HU)"
        />
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={model.params.source || 'ticketmaster'}
          onChange={(event) => model.setParams((current) => ({ ...current, source: event.target.value }))}
          aria-label="Ticketmaster forrás"
        >
          <option value="ticketmaster">Ticketmaster</option>
          <option value="universe">Universe</option>
          <option value="frontgate">FrontGate</option>
          <option value="tmr">Ticketmaster Resale</option>
        </select>
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
