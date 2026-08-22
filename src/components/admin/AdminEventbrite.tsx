import { RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EventbriteProviderPanel } from '@/features/external-events/admin/components/EventbriteProviderPanel';
import { PlacesAdminPanel } from '@/features/external-events/admin/components/PlacesAdminPanel';
import { SeatGeekProviderPanel } from '@/features/external-events/admin/components/SeatGeekProviderPanel';
import { TicketmasterProviderPanel } from '@/features/external-events/admin/components/TicketmasterProviderPanel';
import { useExternalEventsAdminController } from '@/features/external-events/admin/useExternalEventsAdminController';

export function AdminEventbrite() {
  const controller = useExternalEventsAdminController();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-lg">
            <RefreshCw className="h-5 w-5 text-primary" /> Külső forrás import és címkereső provider
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs
            value={controller.navigation.providerTab}
            onValueChange={controller.navigation.selectProviderTab}
            className="space-y-4"
          >
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
              <TabsTrigger value="eventbrite">Eventbrite</TabsTrigger>
              <TabsTrigger value="ticketmaster">Ticketmaster</TabsTrigger>
              <TabsTrigger value="seatgeek">SeatGeek</TabsTrigger>
              <TabsTrigger value="places">Címkereső</TabsTrigger>
            </TabsList>
            <TabsContent value="eventbrite">
              <EventbriteProviderPanel model={controller.eventbrite} />
            </TabsContent>
            <TabsContent value="ticketmaster">
              <TicketmasterProviderPanel model={controller.ticketmaster} />
            </TabsContent>
            <TabsContent value="seatgeek">
              <SeatGeekProviderPanel model={controller.seatGeek} />
            </TabsContent>
            <TabsContent value="places">
              <PlacesAdminPanel
                providerConfig={controller.providerConfig}
                databaseConfig={controller.databaseConfig}
                runStatus={controller.runStatus}
                providerTest={controller.providerTest}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
