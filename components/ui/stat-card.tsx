import * as React from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "primary",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "primary" | "secondary" | "amber" | "rose";
  className?: string;
}) {
  const tones = {
    primary: "bg-primary-soft text-emerald-700",
    secondary: "bg-secondary-soft text-sky-700",
    amber: "bg-amber-100 text-amber-700",
    rose: "bg-rose-100 text-rose-700",
  } as const;

  return (
    <div className={cn("surface-card p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-1.5 font-display text-2xl font-semibold leading-none tracking-tight">
            {value}
          </p>
          {hint ? <p className="mt-2 truncate text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {icon ? (
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}
