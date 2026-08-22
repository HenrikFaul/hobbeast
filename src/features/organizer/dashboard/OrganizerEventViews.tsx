import { BarChart3, CheckCircle2, ClipboardList, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import type { OrganizerAnalytics, OrganizerEventSummary } from '@/lib/organizer';
import { InfoPill, MetricCard } from './OrganizerStatCards';

interface OrganizerEventsTabProps {
  events: OrganizerEventSummary[];
  selectedEventId: string;
  completionPending: boolean;
  onOpenEvent: (eventId: string) => void;
  onManageEvent: (eventId: string) => void;
  onCompleteEvent: () => void;
}

export function OrganizerEventsTab({
  events,
  selectedEventId,
  completionPending,
  onOpenEvent,
  onManageEvent,
  onCompleteEvent,
}: OrganizerEventsTabProps) {
  return (
    <TabsContent value="events" className="space-y-4 mt-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {events.map((event) => (
          <Card key={event.id} className="rounded-2xl border shadow-card">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-3xl">{event.image_emoji ?? '🎉'}</p>
                  <h3 className="font-semibold text-lg leading-tight">{event.title}</h3>
                  <p className="text-sm text-muted-foreground">{event.location_city ?? 'Helyszín nélkül'} · {event.event_date ?? 'Dátum nélkül'}</p>
                </div>
                <Badge variant="outline">{event.category}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <InfoPill label="Going" value={event.goingCount} />
                <InfoPill label="Várólista" value={event.waitlistCount} />
                <InfoPill label="Check-in" value={event.checkedInCount} />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" variant="outline" onClick={() => onOpenEvent(event.id)}>Megnyitás</Button>
                <Button className="flex-1" onClick={() => onManageEvent(event.id)}>Kezelés</Button>
              </div>
              {selectedEventId === event.id && event.event_date && event.event_date <= new Date().toISOString().slice(0, 10) && (
                <Button variant="outline" className="w-full" disabled={completionPending} onClick={onCompleteEvent}>
                  {completionPending ? 'Lezárás folyamatban…' : 'Esemény lezárása és attendance véglegesítése'}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </TabsContent>
  );
}

export function OrganizerAnalyticsTab({ analytics }: { analytics: OrganizerAnalytics | null }) {
  return (
    <TabsContent value="analytics" className="mt-4 space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<BarChart3 className="h-4 w-4" />} label="Join click / intent" value={analytics?.joinClicks ?? 0} />
        <MetricCard icon={<Users className="h-4 w-4" />} label="Going" value={analytics?.going ?? 0} />
        <MetricCard icon={<ClipboardList className="h-4 w-4" />} label="Waitlist" value={analytics?.waitlist ?? 0} />
        <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="Attendance rate" value={`${Math.round((analytics?.attendanceRate ?? 0) * 100)}%`} />
      </div>
      <Card className="rounded-2xl border shadow-card">
        <CardHeader>
          <CardTitle>Source attribution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(analytics?.sourceBreakdown ?? []).map((row) => (
            <div key={row.source} className="flex items-center justify-between rounded-2xl border p-4">
              <div>
                <div className="font-medium">{row.source}</div>
                <div className="text-sm text-muted-foreground">Views: {row.views}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">Joins: {row.joins}</div>
                <div className="text-sm text-muted-foreground">Check-in: {row.checkedIn}</div>
              </div>
            </div>
          ))}
          {!analytics && <p className="text-sm text-muted-foreground">Analytics még nem érhető el ehhez az eseményhez.</p>}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

