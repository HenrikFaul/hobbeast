import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  stats?: ReactNode;
  align?: "left" | "center";
  compact?: boolean;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  stats,
  align = "left",
  compact = false,
  className,
}: PageHeaderProps) {
  const centered = align === "center";

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/80 p-6 shadow-card backdrop-blur sm:p-8 lg:p-10",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.16),transparent_35%),radial-gradient(circle_at_bottom_left,hsl(var(--accent)/0.12),transparent_30%)]" />
      <div className="relative flex flex-col gap-6">
        {eyebrow && (
          <div className={cn("flex", centered && "justify-center")}>
            <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
              {eyebrow}
            </span>
          </div>
        )}

        <div className={cn("space-y-3", centered && "text-center")}>
          <h1
            className={cn(
              "font-display font-bold tracking-tight text-3xl sm:text-4xl lg:text-5xl",
              compact && "text-2xl sm:text-3xl lg:text-4xl",
            )}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className={cn(
                "max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base",
                centered && "mx-auto",
              )}
            >
              {subtitle}
            </p>
          )}
        </div>

        {(actions || stats) && (
          <div
            className={cn(
              "flex flex-col gap-4",
              centered ? "items-center" : "lg:flex-row lg:items-end lg:justify-between",
            )}
          >
            {actions}
            {stats}
          </div>
        )}
      </div>
    </section>
  );
}
