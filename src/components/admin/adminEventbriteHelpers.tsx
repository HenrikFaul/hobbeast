import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, ExternalLink } from 'lucide-react';
import type { ExternalEventNormalized } from '@/lib/external-events';
import { mapExternalEventToCardLike } from '@/lib/external-events/normalize';

// Legacy compatibility view. Domain helpers live in
// src/features/external-events/admin/databaseDomain.ts.
export function ExternalEventList({ events }: { events: ExternalEventNormalized[] }) {
  const mapped = useMemo(() => events.map(mapExternalEventToCardLike), [events]);
  if (mapped.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <span className="text-sm font-medium">{mapped.length} esemény előnézete</span>
      </div>
      <div className="max-h-96 overflow-y-auto space-y-2">
        {mapped.map((event) => (
          <div key={event.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <span className="text-2xl">{event.image_emoji || '📅'}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{event.title}</p>
              <p className="text-xs text-muted-foreground">{event.event_date || '—'} · {event.location_city || 'Online'} · {event.source_label}</p>
              <p className="text-xs text-muted-foreground">{event.freshness_state === 'unknown' ? 'Frissesség nem igazolt' : `Frissesség: ${event.freshness_state}`} · {event.normalization_version}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{event.category}</Badge>
              {event.external_url && (
                <a href={event.external_url} target="_blank" rel="noopener noreferrer">
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
