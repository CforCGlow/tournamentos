import * as React from "react";
import { cn, initials } from "@/lib/utils";

export function Crest({
  name,
  logoUrl,
  color = "#10B981",
  size = "md",
  className,
}: {
  name: string;
  logoUrl?: string | null;
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "h-8 w-8 text-[10px]",
    md: "h-10 w-10 text-xs",
    lg: "h-14 w-14 text-base",
  } as const;

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        className={cn("shrink-0 rounded-lg border bg-white object-contain p-0.5", sizes[size], className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-display font-semibold text-white shadow-sm",
        sizes[size],
        className,
      )}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
