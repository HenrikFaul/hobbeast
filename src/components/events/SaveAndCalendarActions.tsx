import { useCallback, useEffect, useState } from 'react';
import { Bookmark, BookmarkCheck, CalendarPlus, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { buildGoogleCalendarUrl, downloadIcs, type CalendarEventInput } from '@/lib/calendarExport';

interface SaveAndCalendarActionsProps {
  /** External (aggregated) program id, when the program comes from a partner. */
  externalEventId?: string | null;
  /** Internal Hobbeast event id. */
  eventId?: string | null;
  calendarEvent: CalendarEventInput;
  authenticated: boolean;
  onRequestSignIn: () => void;
}

/**
 * "Save" and "Add to calendar" — the two actions every comparable platform
 * (Meetup, Eventbrite, Luma, Dice) puts on an event page. Saving gives the
 * member a reason to come back; the calendar entry is what turns interest into
 * actual attendance.
 */
export function SaveAndCalendarActions({
  externalEventId,
  eventId,
  calendarEvent,
  authenticated,
  onRequestSignIn,
}: SaveAndCalendarActionsProps) {
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const googleUrl = buildGoogleCalendarUrl(calendarEvent);

  const loadSavedState = useCallback(async () => {
    if (!authenticated || (!externalEventId && !eventId)) return;
    const { data } = await supabase.rpc('list_saved_events');
    if (!Array.isArray(data)) return;
    const rows = data as Array<{ external_event_id: string | null; event_id: string | null }>;
    setSaved(rows.some((row) =>
      (externalEventId && row.external_event_id === externalEventId)
      || (eventId && row.event_id === eventId)));
  }, [authenticated, externalEventId, eventId]);

  useEffect(() => { void loadSavedState(); }, [loadSavedState]);

  const toggleSave = async () => {
    if (!authenticated) {
      onRequestSignIn();
      return;
    }
    if (pending) return;
    setPending(true);
    const { data, error } = await supabase.rpc('toggle_saved_event', {
      p_external_event_id: externalEventId ?? null,
      p_event_id: externalEventId ? null : (eventId ?? null),
    });
    setPending(false);
    if (error) {
      toast.error('A mentést nem sikerült elvégezni.');
      return;
    }
    const isSaved = data === true;
    setSaved(isSaved);
    toast.success(isSaved ? 'Elmentve a programjaid közé.' : 'Eltávolítva a mentettek közül.');
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant={saved ? 'default' : 'outline'}
        size="sm"
        className="rounded-full"
        disabled={pending}
        aria-pressed={saved}
        onClick={() => void toggleSave()}
      >
        {saved
          ? <><BookmarkCheck className="mr-1 h-4 w-4" aria-hidden="true" /> Elmentve</>
          : <><Bookmark className="mr-1 h-4 w-4" aria-hidden="true" /> Mentés</>}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full"
        onClick={() => {
          if (!downloadIcs(calendarEvent)) toast.error('Ehhez a programhoz nincs pontos időpont.');
        }}
      >
        <Download className="mr-1 h-4 w-4" aria-hidden="true" /> Naptárba (.ics)
      </Button>

      {googleUrl && (
        <Button asChild type="button" variant="outline" size="sm" className="rounded-full">
          <a href={googleUrl} target="_blank" rel="noopener noreferrer">
            <CalendarPlus className="mr-1 h-4 w-4" aria-hidden="true" /> Google Naptár
          </a>
        </Button>
      )}
    </div>
  );
}

export default SaveAndCalendarActions;
