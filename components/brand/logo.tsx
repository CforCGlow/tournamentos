import Link from "next/link";
import { Trophy } from "lucide-react";
import { getSiteContent, type SiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";

export async function Logo({
  className,
  compact = false,
  href = "/",
  brand,
}: {
  className?: string;
  compact?: boolean;
  href?: string;
  brand?: SiteContent["brand"];
}) {
  // The wordmark is platform copy, so it follows the same editable document as
  // the home page. The fetch is cached, so every logo on a page shares one read.
  const copy = brand ?? (await getSiteContent()).brand;

  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white shadow-sm">
        <Trophy className="h-4.5 w-4.5" strokeWidth={2.2} />
      </span>
      {!compact ? (
        <span className="flex flex-col leading-none">
          <span className="font-display text-lg font-semibold tracking-tight">
            {copy.name}
            <span className="text-primary">{copy.accent}</span>
          </span>
          <span className="hidden text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground min-[380px]:block">
            {copy.tagline}
          </span>
        </span>
      ) : null}
    </Link>
  );
}
