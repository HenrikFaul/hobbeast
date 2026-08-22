import { AlertCircle, Info, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ExternalEventsAdminController } from '../useExternalEventsAdminController';
import { AdminProviderEventList } from './AdminProviderEventList';

interface EventbriteProviderPanelProps {
  model: ExternalEventsAdminController['eventbrite'];
}

export function EventbriteProviderPanel({ model }: EventbriteProviderPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg bg-accent/10 p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div>
          <p className="font-medium">Eventbrite integráció</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Az Eventbrite v3 API keresést és szervezeti eseménylistát támogat. Innen preview-zni és ellenőrizni tudod az Eventbrite kapcsolatot.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={model.keyword}
          onChange={(event) => model.setKeyword(event.target.value)}
          placeholder="Keresés Eventbrite-on..."
          aria-label="Eventbrite keresés"
          onKeyDown={(event) => { if (event.key === 'Enter') void model.search(); }}
        />
        <Button onClick={() => void model.search()} disabled={model.loading}>
          <Search className="mr-1 h-4 w-4" />Keresés
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void model.testToken()} disabled={model.loading}>Token teszt</Button>
        <Button variant="outline" onClick={() => void model.pullOrganization()} disabled={model.loading}>Szervezeti események</Button>
      </div>

      {model.error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4" />{model.error}
        </div>
      )}
      {model.debugInfo && (
        <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-sm" role="status">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span className="text-muted-foreground">{model.debugInfo}</span>
        </div>
      )}
      <AdminProviderEventList events={model.events} mode="loaded" />
    </div>
  );
}
