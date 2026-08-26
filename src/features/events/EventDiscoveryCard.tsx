import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Calendar, Clock, ExternalLink, MapPin, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EditorialVideoBackdrop } from '@/features/events/EditorialVideoBackdrop';
import { Button } from '@/components/ui/button';
import { resolveEventLocationLabel } from '@/lib/eventLocationHelper';
import { trackOutboundClick } from '@/lib/outboundTracking';
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
import { eventSeason, groupActivityReason } from './eventFacets';

const OWN_BADGE_CLASS = 'border-accent/25 bg-accent/15 text-foreground';
const JOINED_BADGE_CLASS = 'border-primary/25 bg-primary/10 text-primary';
const INTEREST_BADGE_CLASS = 'border-primary/15 bg-secondary text-secondary-foreground';
const OWN_BUTTON_CLASS = 'w-full cursor-default border-accent/20 bg-accent/10 text-foreground hover:bg-accent/10';
const JOINED_BUTTON_CLASS = 'w-full border-primary/25 bg-card text-primary hover:bg-primary/5';
const INTEREST_BUTTON_CLASS = 'w-full border-accent bg-accent text-accent-foreground hover:bg-accent/90';
const DEFAULT_BUTTON_CLASS = 'w-full border-primary bg-primary text-primary-foreground';

function getVisualTone(category: string) {
  const normalized = category.toLocaleLowerCase('hu-HU');
  if (/(sport|fut|túra|terep|természet)/.test(normalized)) return 'from-[#cde96b] via-[#dfff62] to-[#edf0e7]';
  if (/(kreatív|művész|zene|fest)/.test(normalized)) return 'from-[#ff8f72] via-[#ffc0af] to-[#fff1e9]';
  if (/(gasztro|főz|étel)/.test(normalized)) return 'from-[#f5d46f] via-[#ffe5a1] to-[#fff6d8]';
  return 'from-[#c9b7ff] via-[#ddd3ff] to-[#f2eeff]';
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

function formatDateTile(date: string | null) {
  if (!date) return { day: '—', month: 'HAMAROSAN' };
  const value = new Date(date);
  return {
    day: value.toLocaleDateString('hu-HU', { day: '2-digit' }),
    month: value.toLocaleDateString('hu-HU', { month: 'short' }).replace('.', '').toUpperCase(),
  };
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
  const [imageFailed, setImageFailed] = useState(false);
  const reduceMotion = useReducedMotion();
  const event = entry.item;
  // The same two rules the "közösségi" and "szezonális" filters use, shown on
  // the card so the result of a filter never looks arbitrary.
  const groupReason = groupActivityReason(event);
  const seasonLabel = eventSeason(event)?.label ?? null;
  const statusBadge = relation === 'own'
    ? { label: 'Saját', className: OWN_BADGE_CLASS }
    : relation === 'joined'
      ? { label: 'Csatlakoztam', className: JOINED_BADGE_CLASS }
      : relation === 'interest'
        ? { label: 'Érdekelhet', className: INTEREST_BADGE_CLASS }
        : null;
  const outboundUrl = safeExternalUrl(event.eventbrite_url);
  const visualImageUrl = safeExternalUrl(event.eventbrite_logo_url);
  const visualTone = getVisualTone(event.category);
  const dateTile = formatDateTile(event.event_date);

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={reduceMotion ? undefined : { y: -5 }}
      transition={{ duration: 0.42, delay: Math.min(index * 0.04, 0.28) }}
      className="group flex h-full flex-col overflow-hidden rounded-[1.8rem] border border-foreground/[0.08] bg-card shadow-[0_20px_55px_-38px_rgba(24,49,36,0.52)]"
    >
      <button
        type="button"
        className={`relative flex h-52 w-full items-center justify-center overflow-hidden bg-gradient-to-br ${visualTone} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-7px] focus-visible:outline-[#183124] focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[#dfff62] sm:h-56`}
        onClick={() => onOpen(event)}
        aria-label={`${event.title} részleteinek megnyitása`}
      >
        {visualImageUrl && !imageFailed ? (
          <img
            src={visualImageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
          />
        ) : (
          <>
            {/* No photo arrived with this program, so the category's own footage
                carries the card instead of a flat gradient. */}
            <EditorialVideoBackdrop
              category={event.category}
              seed={event.eventId ?? event.id ?? event.title}
              className="absolute inset-0 h-full w-full"
            />
            <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/25" />
            <span aria-hidden="true" className="relative flex h-20 w-20 rotate-[-3deg] items-center justify-center rounded-[1.5rem] border border-white/60 bg-card/[0.78] text-5xl shadow-xl shadow-foreground/10 backdrop-blur-sm transition-transform duration-300 group-hover:rotate-0 group-hover:scale-105">
              {event.image_emoji || '🎉'}
            </span>
          </>
        )}
        {visualImageUrl && !imageFailed && <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />}

        <span className="absolute left-4 top-4 flex h-[3.65rem] w-[3.65rem] flex-col items-center justify-center rounded-[1.1rem] bg-[#fffdf7] text-[#183124] shadow-lg" aria-hidden="true">
          <span className="font-display text-xl font-extrabold leading-none">{dateTile.day}</span>
          <span className="mt-0.5 text-[0.56rem] font-extrabold tracking-[0.12em]">{dateTile.month}</span>
        </span>
        <span className="absolute bottom-4 left-4 rounded-full border border-white/[0.55] bg-[#fffdf7]/90 px-3 py-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.13em] text-[#183124] backdrop-blur-sm">
          {event.category}
        </span>
        <span className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#183124] text-white shadow-lg transition-transform duration-300 group-hover:rotate-6 group-hover:scale-105" aria-hidden="true">
          <ArrowUpRight size={17} />
        </span>
      </button>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {entry.isPromoted && entry.disclosureLabel === 'Promoted' && (
            <Badge aria-label="Promoted event" variant="outline" className="rounded-full border-violet-300 bg-violet-50 text-xs text-violet-800">Promoted</Badge>
          )}
          {event.source_label && event.source_label !== 'Hobbeast' && (
            <Badge variant="outline" className="rounded-full border-accent/25 bg-accent/10 text-xs text-foreground">{event.source_label}</Badge>
          )}
          {statusBadge && (
            <Badge variant="outline" className={`rounded-full text-xs ${statusBadge.className}`}>{statusBadge.label}</Badge>
          )}
          {groupReason && (
            <Badge
              variant="outline"
              className="rounded-full border-accent/30 bg-accent/10 text-xs text-foreground"
              title={groupReason}
            >
              Csapatos program
            </Badge>
          )}
          {seasonLabel && (
            <Badge
              variant="outline"
              className="rounded-full border-amber-300 bg-amber-50 text-xs text-amber-900"
              title={`Idénybeli program: ${seasonLabel}`}
            >
              {seasonLabel}
            </Badge>
          )}
          {typeof event.companion_count === 'number' && event.companion_count > 0 && (
            <Badge
              variant="outline"
              className="rounded-full border-primary/30 bg-primary/10 text-xs text-primary"
              title="Külső program, amelyre hobbeastos tagok közösen szerveződtek"
            >
              Közös látogatás · {event.companion_count} fő
            </Badge>
          )}
          {event.freshness_state === 'stale' && (
            <Badge variant="outline" className="rounded-full border-amber-300 bg-amber-50 text-xs text-amber-800">Régebben ellenőrzött külső adat</Badge>
          )}
        </div>

        {showRecommendationReason && recommendationReason && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-primary/10 bg-secondary/70 px-3.5 py-2.5 text-xs text-primary">
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

        <h3 className="mb-4 font-display text-xl font-extrabold leading-[1.08] tracking-[-0.03em] transition-colors group-hover:text-primary sm:text-[1.45rem]">
          <button
            type="button"
            className="cursor-pointer rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => onOpen(event)}
          >
            {event.title}
          </button>
        </h3>

        <div className="mb-5 space-y-2.5 text-sm font-medium text-muted-foreground">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/[0.07] text-primary"><Calendar aria-hidden="true" size={13} /></span>
            <span>{formatDate(event.event_date)}</span>
            {event.event_time && <>
              <Clock aria-hidden="true" size={14} className="ml-1 text-primary" />
              <span>{event.event_time}</span>
            </>}
          </div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/[0.12] text-accent"><MapPin aria-hidden="true" size={13} /></span>
            <span>{resolveEventLocationLabel(event)}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><Users aria-hidden="true" size={13} /></span>
            <span>{event.participant_count || 0}{event.max_attendees ? `/${event.max_attendees}` : ''} résztvevő</span>
          </div>
        </div>

        {event.tags && event.tags.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-1.5">
            {event.tags.map((tag) => <Badge key={tag} variant="outline" className="rounded-full bg-background/55 text-xs font-normal">{tag}</Badge>)}
          </div>
        )}

        <div className="mt-auto border-t border-border/60 pt-4">
          {isExternal(event) ? (
            outboundUrl ? (
              <Button asChild className={`${relation === 'interest' ? INTEREST_BUTTON_CLASS : DEFAULT_BUTTON_CLASS} rounded-full`} size="sm">
                <a
                  href={outboundUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackOutboundClick(event.external_event_id, 'event_card')}
                >
                  <ExternalLink aria-hidden="true" className="mr-1 h-3.5 w-3.5" /> Megnézem ({event.source_label})
                </a>
              </Button>
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
