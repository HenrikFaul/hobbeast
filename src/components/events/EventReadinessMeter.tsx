import { Check, Sparkles } from 'lucide-react';
import { computeReadiness, type ReadinessDraft } from '@/features/events/eventReadiness';

/**
 * The live readiness meter for the composer.
 *
 * A ring that fills as the event takes shape, an encouraging headline, the one
 * most-useful next nudge, and a compact checklist. It never blocks — the whole
 * point is that it feels like a hand on the shoulder, not a gate.
 */

const RING = 2 * Math.PI * 26; // circumference for r=26

const LEVEL_COLOR: Record<string, string> = {
  start: 'hsl(var(--muted-foreground))',
  building: '#e0a341',
  good: '#4f9d69',
  great: 'hsl(var(--primary))',
};

export function EventReadinessMeter({ draft }: { draft: ReadinessDraft }) {
  const readiness = computeReadiness(draft);
  const color = LEVEL_COLOR[readiness.level];
  const dash = (readiness.score / 100) * RING;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" aria-hidden="true">
          <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
            <circle cx="32" cy="32" r="26" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
            <circle
              cx="32" cy="32" r="26" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={RING} strokeDashoffset={RING - dash}
              style={{ transition: 'stroke-dashoffset 500ms cubic-bezier(0.22,1,0.36,1), stroke 400ms' }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">
            {readiness.score}
          </span>
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug">{readiness.headline}</p>
          {readiness.nextTip && (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>{readiness.nextTip}</span>
            </p>
          )}
        </div>
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {readiness.items.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5 text-xs">
            <span
              className={`grid h-4 w-4 shrink-0 place-items-center rounded-full transition-colors ${
                item.done ? 'bg-primary text-primary-foreground' : 'border border-border/70 text-transparent'
              }`}
              aria-hidden="true"
            >
              <Check className="h-3 w-3" />
            </span>
            <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>
              {item.label}
              {item.essential && !item.done && <span className="text-primary"> *</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
