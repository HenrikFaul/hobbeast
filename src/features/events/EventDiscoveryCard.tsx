import { motion } from 'framer-motion';
import { Calendar, Clock, ExternalLink, MapPin, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { resolveEventLocationLabel } from '@/lib/eventLocationHelper';
import {
  RECOMMENDATION_REASON_LABELS,
  type RecommendationReasonCode,
} from '@/lib/recommendationEngine';
import type { RankedDiscoveryItem } from '@/lib/promotedContent';
import {
  isExternal,
  safeExternalUrl,
  type EventData,
  type EventRelation,
} from './discoveryModel';

const OWN_BADGE_CLASS = 'border-purple-200 bg-purple-50 text-purple-700';
const JOINED_BADGE_CLASS = 'border-emerald-200 bg-emerald-50 text-emerald-700';
const INTEREST_BADGE_CLASS = 'border-sky-200 bg-sky-50 text-sky-700';
const OWN_BUTTON_CLASS = 'w-full border-purple-200 bg-purple-100 text-purple-700 hover:bg-purple-100 cursor-default';
const JOINED_BUTTON_CLASS = 'w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50';
const INTEREST_BUTTON_CLASS = 'w-full border-0 bg-sky-600 text-white hover:bg-sky-700';
const DEFAULT_BUTTON_CLASS = 'w-full gradient-primary text-primary-foreground border-0';

export type DiscoveryCardEntry = RankedDiscoveryItem<EventData & { eventId: string }>;

interface EventDiscoveryCardProps {
  entry: DiscoveryCardEntry;
  index: number;
  relation: EventRelation;
  recommendationReason?: RecommendationReasonCode;
  showRecommendationReason: boolean;
  joinPending: boolean;
  onOpen: (event: EventData) => void;
  onJoin: (eventId: string) => void;
  onLeave: (event: EventData) => void;
  onLessLikeThis: (event: EventData) => void;
}

function formatDate(date: string | null) {
  return date
    ? new Date(date).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Dátum nélkül';
}

export function EventDiscoveryCard({
  entry,
  index,
  relation,
  recommendationReason,
  showRecommendationReason,
  joinPending,
  onOpen,
  onJoin,
  onLeave,
  onLessLikeThis,
}: EventDiscoveryCardProps) {
  const event = entry.item;
  const statusBadge = relation === 'own'
    ? { label: 'Saját', className: OWN_BADGE_CLASS }
    : relation === 'joined'
      ? { label: 'Csatlakoztam', className: JOINED_BADGE_CLASS }
      : relation === 'interest'
        ? { label: 'Érdekelhet', className: INTEREST_BADGE_CLASS }
        : null;
  const outboundUrl = safeExternalUrl(event.eventbrite_url);

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="rounded-xl border bg-card overflow-hidden hover-lift group"
    >
      <button
        type="button"
        className="h-32 w-full gradient-warm flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        onClick={() => onOpen(event)}
        aria-label={`${event.title} részleteinek megnyitása`}
      >
        <span aria-hidden="true" className="text-5xl">{event.image_emoji || '🎉'}</span>
      </button>
      <div className="p-5">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Badge variant="secondary" className="text-xs">{event.category}</Badge>
          {entry.isPromoted && entry.disclosureLabel === 'Promoted' && (
            <Badge aria-label="Promoted event" variant="outline" className="text-xs border-violet-300 bg-violet-50 text-violet-800">Promoted</Badge>
          )}
          {event.source_label && event.source_label !== 'Hobbeast' && (
            <Badge variant="outline" className="text-xs border-accent bg-accent/10 text-accent">{event.source_label}</Badge>
          )}
          {statusBadge && (
            <Badge variant="outline" className={`text-xs ${statusBadge.className}`}>{statusBadge.label}</Badge>
          )}
          {event.freshness_state === 'stale' && (
            <Badge variant="outline" className="text-xs border-amber-300 bg-amber-50 text-amber-800">Régebben ellenőrzött külső adat</Badge>
          )}
        </div>

        {showRecommendationReason && recommendationReason && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
            <span title="Miért látom ezt?">{RECOMMENDATION_REASON_LABELS[recommendationReason]}</span>
            <button
              type="button"
              className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2"
              onClick={() => onLessLikeThis(event)}
            >
              Kevésbé ilyet
            </button>
          </div>
        )}

        <h3 className="font-display font-semibold text-lg mb-3 group-hover:text-primary transition-colors">
          <button
            type="button"
            className="cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => onOpen(event)}
          >
            {event.title}
          </button>
        </h3>

        <div className="space-y-1.5 text-sm text-muted-foreground mb-4">
          <div className="flex items-center gap-2">
            <Calendar aria-hidden="true" size={14} />
            <span>{formatDate(event.event_date)}</span>
            {event.event_time && <>
              <Clock aria-hidden="true" size={14} className="ml-2" />
              <span>{event.event_time}</span>
            </>}
          </div>
          <div className="flex items-center gap-2">
            <MapPin aria-hidden="true" size={14} />
            <span>{resolveEventLocationLabel(event)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users aria-hidden="true" size={14} />
            <span>{event.participant_count || 0}{event.max_attendees ? `/${event.max_attendees}` : ''} résztvevő</span>
          </div>
        </div>

        {event.tags && event.tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-4">
            {event.tags.map((tag) => <Badge key={tag} variant="outline" className="text-xs font-normal">{tag}</Badge>)}
          </div>
        )}

        {isExternal(event) ? (
          outboundUrl ? (
            <a href={outboundUrl} target="_blank" rel="noopener noreferrer">
              <Button className={relation === 'interest' ? INTEREST_BUTTON_CLASS : DEFAULT_BUTTON_CLASS} size="sm">
                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 mr-1" /> Megnézem ({event.source_label})
              </Button>
            </a>
          ) : (
            <Button className="w-full" variant="outline" size="sm" disabled>Forráslink ellenőrzés alatt</Button>
          )
        ) : relation === 'own' ? (
          <Button variant="outline" className={OWN_BUTTON_CLASS} size="sm" disabled>Saját</Button>
        ) : relation === 'joined' ? (
          <Button variant="outline" className={JOINED_BUTTON_CLASS} size="sm" onClick={() => onLeave(event)}>Leiratkozás</Button>
        ) : (
          <Button
            className={relation === 'interest' ? INTEREST_BUTTON_CLASS : DEFAULT_BUTTON_CLASS}
            size="sm"
            onClick={() => onJoin(event.id)}
            disabled={joinPending}
          >
            {joinPending ? 'Csatlakozás…' : 'Csatlakozom'}
          </Button>
        )}
      </div>
    </motion.article>
  );
}
