import { Calendar, MapPin, Users } from 'lucide-react';

/**
 * The "no surprise publish" preview (§7.4).
 *
 * The event card exactly as attendees will meet it, rebuilt on every keystroke,
 * so the organizer sees what they are making instead of imagining it. What is
 * missing shows as a gentle placeholder rather than a blank — the card always
 * looks like a card, which is what makes it feel real.
 */

export interface LivePreviewDraft {
  title: string;
  emoji: string;
  category: string;
  dateLabel: string | null;
  timeLabel: string | null;
  locationLabel: string | null;
  description: string;
  maxAttendees: string;
  tags: string[];
}

function Line({ icon, value, placeholder }: { icon: React.ReactNode; value: string | null; placeholder: string }) {
  return (
    <p className={`flex items-center gap-2 text-sm ${value ? 'text-foreground' : 'text-muted-foreground/60'}`}>
      <span className="text-primary" aria-hidden="true">{icon}</span>
      {value || placeholder}
    </p>
  );
}

export function EventLivePreview({ draft }: { draft: LivePreviewDraft }) {
  const when = [draft.dateLabel, draft.timeLabel].filter(Boolean).join(', ') || null;

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Így fogják látni
      </p>
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <div className="relative flex h-28 items-center justify-center bg-gradient-to-br from-primary/15 via-secondary/40 to-primary/5">
          <span className="text-5xl" aria-hidden="true">{draft.emoji || '✨'}</span>
          {draft.category && (
            <span className="absolute left-3 top-3 rounded-full bg-card/90 px-2.5 py-0.5 text-xs font-medium shadow-sm">
              {draft.category}
            </span>
          )}
        </div>

        <div className="space-y-2 p-4">
          <h4 className={`font-display text-lg font-bold leading-tight ${draft.title ? '' : 'text-muted-foreground/50'}`}>
            {draft.title || 'Az esemény címe'}
          </h4>

          <Line icon={<Calendar className="h-4 w-4" />} value={when} placeholder="Időpont" />
          <Line icon={<MapPin className="h-4 w-4" />} value={draft.locationLabel} placeholder="Helyszín" />
          {draft.maxAttendees && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4 text-primary" aria-hidden="true" /> Max. {draft.maxAttendees} fő
            </p>
          )}

          {draft.description && (
            <p className="line-clamp-3 pt-1 text-sm text-muted-foreground">{draft.description}</p>
          )}

          {draft.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {draft.tags.slice(0, 5).map((tag) => (
                <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
