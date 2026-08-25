import { cn } from "@/lib/utils";

interface HobbeastMarkProps {
  className?: string;
  title?: string;
}

/**
 * A compact, code-native Hobbeast mark: a three-person community held by
 * one continuous shared arc. The crowd silhouette keeps the warm original
 * palette while avoiding the two-person/dating reading of the former mark.
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
    <circle cx="13.5" cy="17" r="3.75" fill="hsl(var(--primary-foreground))" />
    <circle cx="24" cy="13.5" r="4.25" fill="hsl(var(--primary-glow))" />
    <circle cx="34.5" cy="17" r="3.75" fill="hsl(var(--accent))" />
    <path
      d="M7.5 34c.7-6.8 2.7-10.8 6-10.8 3.7 0 5.8 4.1 6.4 10.8"
      fill="none"
      stroke="hsl(var(--primary-foreground))"
      strokeWidth="4.5"
      strokeLinecap="round"
    />
    <path
      d="M16.6 34c.7-8.5 3.2-13.4 7.4-13.4s6.7 4.9 7.4 13.4"
      fill="none"
      stroke="hsl(var(--primary-glow))"
      strokeWidth="4.75"
      strokeLinecap="round"
    />
    <path
      d="M28.1 34c.6-6.7 2.7-10.8 6.4-10.8 3.3 0 5.3 4 6 10.8"
      fill="none"
      stroke="hsl(var(--accent))"
      strokeWidth="4.5"
      strokeLinecap="round"
    />
    <path
      d="M8.5 35.5c3.8 4.2 8.9 6.3 15.5 6.3s11.7-2.1 15.5-6.3"
      fill="none"
      stroke="hsl(var(--primary-foreground))"
      strokeWidth="2.25"
      strokeLinecap="round"
    />
  </svg>
);
