import type { ExternalEventsAdminController } from '../useExternalEventsAdminController';
import { AddressProviderConfigPanel } from './AddressProviderConfigPanel';
import { DatabaseProviderConfigPanel } from './DatabaseProviderConfigPanel';
import { DatabaseRunStatusPanel } from './DatabaseRunStatusPanel';
import { ProviderTestPanel } from './ProviderTestPanel';

interface PlacesAdminPanelProps {
  providerConfig: ExternalEventsAdminController['providerConfig'];
  databaseConfig: ExternalEventsAdminController['databaseConfig'];
  runStatus: ExternalEventsAdminController['runStatus'];
  providerTest: ExternalEventsAdminController['providerTest'];
}

export function PlacesAdminPanel({
  providerConfig,
  databaseConfig,
  runStatus,
  providerTest,
}: PlacesAdminPanelProps) {
  return (
    <div className="space-y-5 max-w-full overflow-hidden">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,0.9fr)_minmax(360px,1.1fr)]">
        <AddressProviderConfigPanel model={providerConfig} />
        <DatabaseProviderConfigPanel model={databaseConfig} debug={runStatus.debug} />
      </div>
      <DatabaseRunStatusPanel model={runStatus} />
      <ProviderTestPanel model={providerTest} />
    </div>
  );
}
