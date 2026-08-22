import { MapPin, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ADDRESS_SEARCH_GROUPS } from '../domain';
import { FUNCTION_GROUP_LABELS } from '@/lib/searchProviderConfig';
import type { ExternalEventsAdminController } from '../useExternalEventsAdminController';

interface ProviderTestPanelProps {
  model: ExternalEventsAdminController['providerTest'];
}

export function ProviderTestPanel({ model }: ProviderTestPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-primary" /> Provider teszt — funkció csoport szerint
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-medium">Funkció csoport:</span>
          {ADDRESS_SEARCH_GROUPS.map((group) => (
            <Button
              key={group}
              size="sm"
              variant={model.functionGroup === group ? 'default' : 'outline'}
              onClick={() => model.setFunctionGroup(group)}
            >
              {FUNCTION_GROUP_LABELS[group].split(' (')[0]}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Aktív provider ehhez a csoporthoz:</span>
          <Badge variant="outline">{model.activeProviderLabel}</Badge>
        </div>
        <div className="flex gap-2">
          <Input
            value={model.query}
            onChange={(event) => model.setQuery(event.target.value)}
            placeholder="Pl. Budapest társasjáték, Szeged kávézó"
            onKeyDown={(event) => { if (event.key === 'Enter') void model.run(); }}
          />
          <Button onClick={() => void model.run()} disabled={model.loading}>
            <Search className="mr-1 h-4 w-4" />Teszt
          </Button>
        </div>
        {model.results.length > 0 && (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {model.results.slice(0, 10).map((item) => (
              <div key={item.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.address}</p>
                    <p className="text-xs text-muted-foreground">{[item.city, item.district, item.postcode].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <Badge variant="outline">{item.source}</Badge>
                    <p className="mt-1">{item.lat.toFixed(4)}, {item.lon.toFixed(4)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
