"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function PublicNav({
  base,
  variant = "desktop",
}: {
  base: string;
  variant?: "desktop" | "mobile";
}) {
  const pathname = usePathname();

  const items = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/matches`, label: "Matches" },
    { href: `${base}/table`, label: "Table" },
    { href: `${base}/bracket`, label: "Bracket" },
    { href: `${base}/stats`, label: "Stats" },
    { href: `${base}/teams`, label: "Teams" },
  ];

  if (variant === "mobile") {
    return (
      <div className="scrollbar-none flex gap-1 overflow-x-auto px-4 pb-2">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "border-primary bg-primary-soft text-emerald-800"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <nav className="hidden items-center gap-1 lg:flex">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary-soft text-emerald-900"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
