import { MapPinned, RefreshCw, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FUNCTION_GROUP_LABELS,
  getProviderDisplayLabel,
  type AddressSearchFunctionGroup,
} from '@/lib/searchProviderConfig';
import { ADDRESS_SEARCH_GROUPS } from '../domain';
import type { ExternalEventsAdminController } from '../useExternalEventsAdminController';

interface AddressProviderConfigPanelProps {
  model: ExternalEventsAdminController['providerConfig'];
}

export function AddressProviderConfigPanel({ model }: AddressProviderConfigPanelProps) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPinned className="h-4 w-4 text-primary" /> Címkereső provider — funkció csoportonként
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Minden funkcióhoz külön kiválaszthatod, melyik provider szolgálja ki a címkeresést. A korábbi „Lokális katalógus” opció kikerült; helyette a jobb oldali adatbázistábla konfigurátorral létrehozott <code className="rounded bg-muted px-1">db:*</code> providerek választhatók.
        </p>

        {ADDRESS_SEARCH_GROUPS.map((group) => (
          <ProviderGroupCard key={group} group={group} model={model} />
        ))}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void model.saveAllProviders()} disabled={model.loading || model.saving}>
            <Save className="mr-1 h-4 w-4" /> Összes mentése
          </Button>
          <Button variant="outline" onClick={() => void model.reload()} disabled={model.loading || model.dbLoading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${model.loading || model.dbLoading ? 'animate-spin' : ''}`} /> Frissítés
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderGroupCard({
  group,
  model,
}: {
  group: AddressSearchFunctionGroup;
  model: ExternalEventsAdminController['providerConfig'];
}) {
  return (
    <fieldset className="rounded-lg border p-4 space-y-3">
      <legend className="sr-only">{FUNCTION_GROUP_LABELS[group]} provider</legend>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{FUNCTION_GROUP_LABELS[group]}</p>
        <Badge variant="outline" className="max-w-[220px] truncate">
          {getProviderDisplayLabel(model.providers[group], model.dbConfigs)}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {model.providerOptions.map((option) => (
          <label key={`${group}-${option.value}`} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-muted/40">
            <input
              type="radio"
              name={`provider-${group}`}
              className="h-3 w-3"
              checked={model.providers[group] === option.value}
              onChange={() => model.updateProvider(group, option.value)}
            />
            <span className="min-w-0">
              <span className="block font-medium">{option.label}</span>
              <span className="block max-w-[220px] truncate text-muted-foreground">{option.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={() => void model.saveProvider(group)} disabled={model.saving || model.loading}>
        <Save className="mr-1 h-3 w-3" /> Mentés
      </Button>
    </fieldset>
  );
}
