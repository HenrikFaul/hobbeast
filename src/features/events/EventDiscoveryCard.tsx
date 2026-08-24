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

const OWN_BADGE_CLASS = 'border-accent/25 bg-accent/10 text-foreground';
const JOINED_BADGE_CLASS = 'border-primary/25 bg-primary/10 text-primary';
const INTEREST_BADGE_CLASS = 'border-primary/15 bg-secondary text-secondary-foreground';
const OWN_BUTTON_CLASS = 'w-full cursor-default border-accent/20 bg-accent/10 text-foreground hover:bg-accent/10';
const JOINED_BUTTON_CLASS = 'w-full border-primary/25 bg-card text-primary hover:bg-primary/5';
const INTEREST_BUTTON_CLASS = 'w-full border-0 bg-accent text-accent-foreground hover:bg-accent/90';
const DEFAULT_BUTTON_CLASS = 'w-full border-0 gradient-primary text-primary-foreground';

function getVisualTone(category: string) {
  const normalized = category.toLocaleLowerCase('hu-HU');
  if (/(sport|fut|túra|terep|természet)/.test(normalized)) return 'from-primary/25 via-primary/10 to-secondary';
  if (/(kreatív|művész|zene|fest)/.test(normalized)) return 'from-accent/25 via-accent/10 to-secondary';
  if (/(gasztro|főz|étel)/.test(normalized)) return 'from-amber-200/70 via-accent/10 to-secondary';
  return 'from-secondary via-primary/[0.08] to-accent/[0.12]';
}

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
  const visualTone = getVisualTone(event.category);

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="group flex h-full flex-col overflow-hidden rounded-[2rem] border border-border/70 bg-card/95 shadow-lg shadow-primary/[0.05] transition-shadow hover:shadow-xl"
    >
      <button
        type="button"
        className={`relative flex h-44 w-full items-center justify-center overflow-hidden bg-gradient-to-br ${visualTone} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary`}
        onClick={() => onOpen(event)}
        aria-label={`${event.title} részleteinek megnyitása`}
      >
        <span aria-hidden="true" className="absolute -left-8 -top-10 h-32 w-32 rounded-full border border-white/40 bg-card/20" />
        <span aria-hidden="true" className="absolute -bottom-12 -right-6 h-40 w-40 rounded-full border border-white/50 bg-card/30" />
        <span aria-hidden="true" className="relative flex h-24 w-24 items-center justify-center rounded-[2rem] border border-white/60 bg-card/70 text-6xl shadow-xl shadow-foreground/10 backdrop-blur-sm transition-transform duration-300 group-hover:scale-105">{event.image_emoji || '🎉'}</span>
        <span aria-hidden="true" className="absolute bottom-4 left-5 rounded-full border border-white/60 bg-card/75 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground backdrop-blur-sm">{event.category}</span>
      </button>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-full bg-secondary/80 text-xs">{event.category}</Badge>
          {entry.isPromoted && entry.disclosureLabel === 'Promoted' && (
            <Badge aria-label="Promoted event" variant="outline" className="rounded-full border-violet-300 bg-violet-50 text-xs text-violet-800">Promoted</Badge>
          )}
          {event.source_label && event.source_label !== 'Hobbeast' && (
            <Badge variant="outline" className="rounded-full border-accent/25 bg-accent/10 text-xs text-foreground">{event.source_label}</Badge>
          )}
          {statusBadge && (
            <Badge variant="outline" className={`rounded-full text-xs ${statusBadge.className}`}>{statusBadge.label}</Badge>
          )}
          {event.freshness_state === 'stale' && (
            <Badge variant="outline" className="rounded-full border-amber-300 bg-amber-50 text-xs text-amber-800">Régebben ellenőrzött külső adat</Badge>
          )}
        </div>

        {showRecommendationReason && recommendationReason && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-primary/10 bg-primary/[0.06] px-3.5 py-2.5 text-xs text-primary">
            <span title="Miért látom ezt?">{RECOMMENDATION_REASON_LABELS[recommendationReason]}</span>
            <button
              type="button"
              className="rounded-md font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => onLessLikeThis(event)}
            >
              Kevésbé ilyet
            </button>
          </div>
        )}

        <h3 className="mb-4 font-display text-xl font-semibold leading-snug transition-colors group-hover:text-primary">
          <button
            type="button"
            className="cursor-pointer rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => onOpen(event)}
          >
            {event.title}
          </button>
        </h3>

        <div className="mb-5 space-y-2.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/[0.07] text-primary"><Calendar aria-hidden="true" size={13} /></span>
            <span>{formatDate(event.event_date)}</span>
            {event.event_time && <>
              <Clock aria-hidden="true" size={14} className="ml-1 text-primary" />
              <span>{event.event_time}</span>
            </>}
          </div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/[0.09] text-accent"><MapPin aria-hidden="true" size={13} /></span>
            <span>{resolveEventLocationLabel(event)}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><Users aria-hidden="true" size={13} /></span>
            <span>{event.participant_count || 0}{event.max_attendees ? `/${event.max_attendees}` : ''} résztvevő</span>
          </div>
        </div>

        {event.tags && event.tags.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-1.5">
            {event.tags.map((tag) => <Badge key={tag} variant="outline" className="rounded-full bg-background/50 text-xs font-normal">{tag}</Badge>)}
          </div>
        )}

        <div className="mt-auto border-t border-border/60 pt-4">
          {isExternal(event) ? (
            outboundUrl ? (
              <a href={outboundUrl} target="_blank" rel="noopener noreferrer" className="block">
                <Button className={`${relation === 'interest' ? INTEREST_BUTTON_CLASS : DEFAULT_BUTTON_CLASS} rounded-full`} size="sm">
                  <ExternalLink aria-hidden="true" className="mr-1 h-3.5 w-3.5" /> Megnézem ({event.source_label})
                </Button>
              </a>
            ) : (
              <Button className="w-full rounded-full" variant="outline" size="sm" disabled>Forráslink ellenőrzés alatt</Button>
            )
          ) : relation === 'own' ? (
            <Button variant="outline" className={`${OWN_BUTTON_CLASS} rounded-full`} size="sm" disabled>Saját</Button>
          ) : relation === 'joined' ? (
            <Button variant="outline" className={`${JOINED_BUTTON_CLASS} rounded-full`} size="sm" onClick={() => onLeave(event)}>Leiratkozás</Button>
          ) : (
            <Button
              className={`${relation === 'interest' ? INTEREST_BUTTON_CLASS : DEFAULT_BUTTON_CLASS} rounded-full`}
              size="sm"
              onClick={() => onJoin(event.id)}
              disabled={joinPending}
            >
              {joinPending ? 'Csatlakozás…' : 'Csatlakozom'}
            </Button>
          )}
        </div>
      </div>
    </motion.article>
  );
}
