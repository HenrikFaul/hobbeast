import { CheckCircle, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { AdminExternalEventDto } from '../domain';

interface AdminProviderEventListProps {
  events: readonly AdminExternalEventDto[];
  mode: 'loaded' | 'preview';
}

export function AdminProviderEventList({ events, mode }: AdminProviderEventListProps) {
  if (events.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-success" />
        <span className="text-sm font-medium">
          {events.length} esemény {mode === 'preview' ? 'előnézete' : 'betöltve'}
        </span>
      </div>
      <div className="max-h-96 overflow-y-auto space-y-2">
        {events.map((event) => (
          <div key={event.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <span className="text-2xl" aria-hidden="true">{event.imageEmoji}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{event.title}</p>
              <p className="text-xs text-muted-foreground">
                {event.eventDate || '—'} · {event.city || 'Online'}{mode === 'preview' ? ` · ${event.sourceLabel}` : ''}
              </p>
              {mode === 'preview' && (
                <p className="text-xs text-muted-foreground">
                  {event.freshnessState === 'unknown'
                    ? 'Frissesség nem igazolt'
                    : `Frissesség: ${event.freshnessState}`} · {event.normalizationVersion}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{event.category}</Badge>
              {event.externalUrl && (
                <a
                  href={event.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${event.title} megnyitása külső oldalon`}
                >
                  <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
