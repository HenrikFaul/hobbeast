import { useEffect, useState } from 'react';
import { CalendarClock, Megaphone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getMyEventUpdates,
  relativeTime,
  type EventUpdate,
} from '@/features/events/eventUpdates';

/**
 * Official updates, for the people who joined.
 *
 * Deliberately quiet: when there is nothing to say the card does not render at
 * all, so an event that has had no news adds nothing to the page. The point is
 * that a change reaches the person who is planning their Saturday around it —
 * not that every event carries an empty box.
 */

interface EventUpdatesCardProps {
  eventId: string | null;
  /** Only somebody holding a place has updates; the RPC enforces this too. */
  participating: boolean;
}

export function EventUpdatesCard({ eventId, participating }: EventUpdatesCardProps) {
  const [updates, setUpdates] = useState<EventUpdate[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!eventId || !participating) {
      setUpdates([]);
      setLoaded(true);
      return () => { cancelled = true; };
    }
    void getMyEventUpdates(eventId).then((rows) => {
      if (!cancelled) {
        setUpdates(rows);
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, [eventId, participating]);

  // Nothing to say, so nothing on screen.
  if (!loaded || updates.length === 0) return null;

  return (
    <Card className="mt-4 border-primary/20 bg-secondary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-5 w-5 text-primary" aria-hidden="true" />
          Frissítések
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {updates.map((update) => (
            <li key={`${update.kind}-${update.id}`} className="flex gap-3">
              <span
                className="mt-0.5 shrink-0 rounded-full bg-card p-1.5"
                aria-hidden="true"
              >
                {update.kind === 'change'
                  ? <CalendarClock className="h-4 w-4 text-primary" />
                  : <Megaphone className="h-4 w-4 text-primary" />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug">{update.headline}</p>
                {update.body && (
                  <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">
                    {update.body}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {relativeTime(update.occurred_at)}
                  {update.kind === 'change' && ' · a szervező módosította'}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
