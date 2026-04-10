import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import { getParticipantStatsMap } from "@/lib/eventParticipantStats";

interface EventRow {
  id: string;
  title: string;
  category: string;
  event_date: string | null;
  location_city: string | null;
  is_active: boolean;
  created_at: string;
  image_emoji: string | null;
  created_by: string;
  outcome_status?: string | null;
  registrations_count?: number | null;
  cancellations_count?: number | null;
  attended_count?: number | null;
  average_rating?: number | null;
  participant_count?: number;
}

export function AdminEvents() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase
      .from('events')
      .select('id, title, category, event_date, location_city, is_active, created_at, image_emoji, created_by')
      .order('created_at', { ascending: false })
      .then(async ({ data, error }) => {
        if (error) {
          console.error('admin events fetch failed', error);
          setEvents([]);
          setLoading(false);
          return;
        }
        const statsMap = await getParticipantStatsMap((data ?? []).map((row: any) => row.id));
        setEvents(((data as unknown as EventRow[]) || []).map((row) => ({ ...row, participant_count: statsMap.get(row.id)?.total || 0 })));
        setLoading(false);
      });
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" /> Események ({events.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
        ) : events.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nincs esemény az adatbázisban.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Esemény</TableHead>
                  <TableHead>Kategória</TableHead>
                  <TableHead>Dátum</TableHead>
                  <TableHead>Város</TableHead>
                  <TableHead>Létrehozó</TableHead>
                  <TableHead>Jelentkezők</TableHead>
                  <TableHead>Lemondás</TableHead>
                  <TableHead>Részt vett</TableHead>
                  <TableHead>Értékelés</TableHead>
                  <TableHead>Státusz</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium"><span className="mr-1">{e.image_emoji || '🎉'}</span>{e.title}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{e.category}</Badge></TableCell>
                    <TableCell className="text-xs">{e.event_date ? new Date(e.event_date).toLocaleDateString('hu-HU') : '—'}</TableCell>
                    <TableCell>{e.location_city || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.created_by}</TableCell>
                    <TableCell>{e.participant_count || 0}</TableCell>
                    <TableCell>{e.cancellations_count || 0}</TableCell>
                    <TableCell>{e.attended_count || 0}</TableCell>
                    <TableCell>{e.average_rating ? Number(e.average_rating).toFixed(1) : '—'}</TableCell>
                    <TableCell>
                      <Badge variant={e.is_active ? 'default' : 'outline'}>{e.outcome_status || (e.is_active ? 'Aktív' : 'Inaktív')}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
