import { cn } from "@/lib/utils";

interface HobbeastMarkProps {
  className?: string;
  title?: string;
}

/**
 * A compact, code-native Hobbeast mark: two people leaning into the same
 * shared activity. It avoids the white bitmap box while keeping the warm
 * coral character of the original identity.
 */
export const HobbeastMark = ({ className, title }: HobbeastMarkProps) => (
  <svg
    viewBox="0 0 48 48"
    className={cn("shrink-0", className)}
    role={title ? "img" : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    <rect width="48" height="48" rx="16" fill="hsl(var(--primary))" />
    <circle cx="16" cy="15.5" r="4.5" fill="hsl(var(--primary-foreground))" />
    <circle cx="32" cy="15.5" r="4.5" fill="hsl(var(--accent))" />
    <path
      d="M8.5 35c.7-7.6 3.2-12.1 7.5-12.1 4.6 0 7.3 4.7 8 12.1"
      fill="none"
      stroke="hsl(var(--primary-foreground))"
      strokeWidth="5"
      strokeLinecap="round"
    />
    <path
      d="M24 35c.7-7.4 3.3-12.1 8-12.1 4.3 0 6.8 4.5 7.5 12.1"
      fill="none"
      stroke="hsl(var(--accent))"
      strokeWidth="5"
      strokeLinecap="round"
    />
    <path
      d="M20.5 29.5c1.2-1.1 2.3-1.6 3.5-1.6s2.3.5 3.5 1.6"
      fill="none"
      stroke="hsl(var(--primary-foreground))"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

