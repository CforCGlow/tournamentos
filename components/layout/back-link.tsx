import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Consistent, thumb-sized back affordance for every secondary page. Pairs with
 * the sticky headers so phone users never have to reach for the browser chrome.
 */
export function BackLink({
  href,
  label = "Back",
  className,
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "mb-4 inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground",
        className,
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}
