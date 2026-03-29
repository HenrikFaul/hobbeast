import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, MapPin, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface UpcomingEvent {
  id: string;
  title: string;
  event_date: string | null;
  event_time: string | null;
  location_city: string | null;
  image_emoji: string | null;
}

export function UpcomingEventsReminder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data: participations } = await supabase
        .from('event_participants')
        .select('event_id')
        .eq('user_id', user.id)
        .in('status', ['going', 'waitlist']);

      if (!participations?.length) { setLoading(false); return; }

      const eventIds = participations.map(p => p.event_id);
      const { data: evts } = await supabase
        .from('events')
        .select('id, title, event_date, event_time, location_city, image_emoji')
        .in('id', eventIds)
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .limit(5);

      setEvents(evts || []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  if (loading || events.length === 0) return null;

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2.5 font-display text-base">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Calendar className="h-5 w-5 text-primary" />
          </div>
          Közelgő eseményeid
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {events.map(ev => (
          <button
            key={ev.id}
            onClick={() => navigate(`/events/${ev.id}`)}
            className="w-full text-left flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors group"
          >
            <span className="text-2xl">{ev.image_emoji || '🎉'}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{ev.title}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {ev.event_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(ev.event_date).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                {ev.event_time && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {ev.event_time}
                  </span>
                )}
                {ev.location_city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {ev.location_city}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
          </button>
        ))}
        <Button variant="ghost" size="sm" className="w-full text-xs rounded-xl" onClick={() => navigate('/events')}>
          Összes esemény megtekintése
        </Button>
      </CardContent>
    </Card>
  );
}
