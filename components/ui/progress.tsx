import * as React from "react";
import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  tone = "primary",
}: {
  value: number;
  className?: string;
  tone?: "primary" | "secondary" | "warning" | "danger";
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const tones: Record<string, string> = {
    primary: "bg-primary",
    secondary: "bg-secondary",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
  };
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-500", tones[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
