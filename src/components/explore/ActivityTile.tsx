import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Heart, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ExploreActivityStats } from '@/hooks/useExploreActivityStats';

interface ActivityTileProps {
  name: string;
  emoji: string;
  subtitle?: string;
  delay?: number;
  stats?: ExploreActivityStats;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onSearch: () => void;
  children?: ReactNode;
}

/** Interactive activity tile: favorite toggle, program search, and live count badges. */
export function ActivityTile({
  name,
  emoji,
  subtitle,
  delay = 0,
  stats,
  isFavorite,
  onToggleFavorite,
  onSearch,
  children,
}: ActivityTileProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="flex flex-col rounded-[1.75rem] border border-border/70 bg-card/95 p-5 shadow-lg shadow-primary/[0.04] transition duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-xl"
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-2xl">{emoji}</span>
          <div className="min-w-0 pt-0.5">
            <h3 className="font-display font-semibold leading-snug">{name}</h3>
            {subtitle && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? `${name} eltávolítása a kedvencekből` : `${name} hozzáadása a kedvencekhez`}
          title={isFavorite ? 'Eltávolítás a kedvencekből' : 'Hozzáadás a kedvencekhez'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/70 text-muted-foreground transition-colors hover:border-red-300 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Heart aria-hidden="true" size={16} className={isFavorite ? 'fill-red-500 text-red-500' : ''} />
        </button>
      </div>

      {children}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/50 pt-4">
        <div className="flex items-center gap-2">
          <span
            title="Közelgő programok száma"
            className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/[0.08] px-2.5 py-1 text-xs font-semibold text-primary"
          >
            <CalendarDays aria-hidden="true" size={12} />
            {stats ? stats.upcoming_events : '–'}
            <span className="sr-only">közelgő program</span>
          </span>
          <span
            title="Ennyi tagot érdekel ez a hobbi"
            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground"
          >
            <Users aria-hidden="true" size={12} />
            {stats ? stats.interested_people : '–'}
            <span className="sr-only">érdeklődő tag</span>
          </span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onSearch} className="rounded-full">
          <Search aria-hidden="true" size={13} className="mr-1" /> Programok
        </Button>
      </div>
    </motion.article>
  );
}

export default ActivityTile;
