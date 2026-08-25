import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Bookmark, CalendarPlus, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { downloadIcs } from '@/lib/calendarExport';

interface SavedRow {
  saved_id: string;
  external_event_id: string | null;
  event_id: string | null;
  title: string;
  event_date: string;
  event_time: string | null;
  location_city: string | null;
  location_address: string | null;
  image_url: string | null;
  external_url: string | null;
  category: string | null;
}

interface AlertRow {
  external_event_id: string;
  title: string;
  event_date: string;
  event_time: string | null;
  location_city: string | null;
  external_url: string | null;
  matched_hobby: string;
}

function formatDate(value: string) {
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
  } catch {
    return value;
  }
}

/**
 * Two panels that give a signed-in member a reason to return:
 * saved programs (Meetup/Eventbrite "Save") and new programs matching the
 * hobbies they follow (the Bandsintown "track" model applied to hobbies).
 */
export function SavedAndAlertsPanel({ authenticated }: { authenticated: boolean }) {
  const [saved, setSaved] = useState<SavedRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!authenticated) { setLoading(false); return; }
    setLoading(true);
    const [savedResult, alertResult] = await Promise.all([
      supabase.rpc('list_saved_events'),
      supabase.rpc('list_hobby_alerts', { p_limit: 6 }),
    ]);
    if (Array.isArray(savedResult.data)) setSaved(savedResult.data as unknown as SavedRow[]);
    if (Array.isArray(alertResult.data)) setAlerts(alertResult.data as unknown as AlertRow[]);
    setLoading(false);
  }, [authenticated]);

  useEffect(() => { void load(); }, [load]);

  const unsave = async (row: SavedRow) => {
    const { error } = await supabase.rpc('toggle_saved_event', {
      p_external_event_id: row.external_event_id,
      p_event_id: row.external_event_id ? null : row.event_id,
    });
    if (!error) setSaved((prev) => prev.filter((r) => r.saved_id !== row.saved_id));
  };

  if (!authenticated || loading) return null;
  if (saved.length === 0 && alerts.length === 0) return null;

  return (
    <div className="mb-8 grid gap-4 lg:grid-cols-2">
      {saved.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bookmark className="h-4 w-4 text-primary" aria-hidden="true" /> Mentett programjaid ({saved.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {saved.slice(0, 5).map((row) => (
              <div key={row.saved_id} className="flex items-center justify-between gap-2 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(row.event_date)}{row.location_city ? ` · ${row.location_city}` : ''}
                  </p>
                </div>
                <span className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost" size="sm" className="h-8 px-2"
                    aria-label={`${row.title} hozzáadása a naptárhoz`}
                    onClick={() => downloadIcs({
                      id: row.external_event_id || row.event_id || row.saved_id,
                      title: row.title,
                      eventDate: row.event_date,
                      eventTime: row.event_time,
                      location: row.location_address || row.location_city,
                      url: row.external_url,
                    })}
                  >
                    <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground"
                    aria-label={`${row.title} eltávolítása a mentettek közül`}
                    onClick={() => void unsave(row)}
                  >
                    ✕
                  </Button>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {alerts.length > 0 && (
        <Card className="rounded-2xl border-primary/25">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bell className="h-4 w-4 text-primary" aria-hidden="true" /> Új programok a hobbijaidhoz
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((row) => (
              <div key={row.external_event_id} className="flex items-center justify-between gap-2 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.title}</p>
                  <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {formatDate(row.event_date)}{row.location_city ? ` · ${row.location_city}` : ''}
                    <Badge variant="outline" className="text-[10px]">{row.matched_hobby}</Badge>
                  </p>
                </div>
                <Button asChild variant="ghost" size="sm" className="h-8 shrink-0 px-2">
                  <Link to={`/events?q=${encodeURIComponent(row.title.slice(0, 40))}&mode=search`} aria-label={`${row.title} megnyitása`}>
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default SavedAndAlertsPanel;
