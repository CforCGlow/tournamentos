import Link from "next/link";
import { ArrowUpRight, LogOut } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { Logo } from "@/components/brand/logo";
import { PortalNav, type PortalNavItem } from "@/components/layout/portal-nav";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/utils";

export function PortalShell({
  nav,
  brandName,
  brandSubtitle,
  userName,
  userRole,
  publicHref,
  children,
  banner,
  notifications,
}: {
  nav: PortalNavItem[];
  brandName: string;
  brandSubtitle: string;
  userName: string;
  userRole: string;
  publicHref?: string;
  children: React.ReactNode;
  banner?: React.ReactNode;
  notifications?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-surface/50 lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden border-r border-slate-900 bg-slate-950 text-white lg:flex lg:min-h-dvh lg:flex-col">
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <Logo className="[&_span]:text-white" />
          {notifications}
        </div>

        <div className="mx-4 mb-4 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3">
          <p className="truncate text-sm font-semibold">{brandName}</p>
          <p className="truncate text-[11px] uppercase tracking-wider text-slate-400">
            {brandSubtitle}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          <PortalNav items={nav} />
        </div>

        <div className="border-t border-white/10 p-3">
          {publicHref ? (
            <Link
              href={publicHref}
              className="mb-2 flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-white"
            >
              Public site
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}

          <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.04] px-3 py-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/20 text-[11px] font-bold text-emerald-200">
              {initials(userName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{userName}</p>
              <p className="truncate text-[10px] uppercase tracking-wider text-slate-400">
                {userRole}
              </p>
            </div>
            <ThemeToggle className="text-slate-400 hover:bg-white/10 hover:text-white" />
            <form action={signOutAction}>
              <button
                type="submit"
                title="Sign out"
                aria-label="Sign out"
                className="rounded p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Logo compact />
            <div className="flex items-center gap-2">
              {notifications}
              <Badge variant="neutral">{userRole}</Badge>
              <ThemeToggle className="text-muted-foreground" />
              <form action={signOutAction}>
                <Button type="submit" variant="ghost" size="icon-sm" title="Sign out" aria-label="Sign out">
                  <LogOut className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
          <div className="overflow-x-auto pb-2 scrollbar-none">
            <div className="flex gap-1 px-3">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </header>

        {banner}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
