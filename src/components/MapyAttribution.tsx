import { cn } from '@/lib/utils';

interface MapyAttributionProps {
  className?: string;
  compact?: boolean;
}

export function MapyAttribution({ className, compact = false }: MapyAttributionProps) {
  return (
    <div
      className={cn(
        'pointer-events-auto inline-flex items-center gap-2 rounded-full border bg-background/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur',
        compact && 'px-2.5 py-1 text-[10px]',
        className,
      )}
    >
      <span className="font-medium text-foreground">Mapy.com</span>
      <span>adatok és térképcsempék</span>
    </div>
  );
}
