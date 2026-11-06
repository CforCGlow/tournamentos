import Link from "next/link";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { markNotificationsReadAction } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import type { OrganiserNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";

function TimeAgo({ value }: { value: string }) {
  try {
    return <>{formatDistanceToNowStrict(new Date(value), { addSuffix: true })}</>;
  } catch {
    return <>recently</>;
  }
}

export function NotificationBell({
  tenantId,
  tenantSlug,
  notifications,
  className,
}: {
  tenantId: string;
  tenantSlug: string;
  notifications: OrganiserNotification[];
  className?: string;
}) {
  const unread = notifications.filter((item) => !item.read);
  const Icon = unread.length ? BellRing : Bell;

  return (
    <details className={cn("group relative", className)}>
      <summary
        className="relative flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden"
        title={unread.length ? `${unread.length} new notifications` : "Notifications"}
        aria-label={unread.length ? `${unread.length} new notifications` : "Notifications"}
      >
        <Icon className="h-4 w-4" />
        {unread.length ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        ) : null}
      </summary>

      <div className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-card shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notifications
          </p>
          {unread.length ? (
            <form action={markNotificationsReadAction}>
              <input type="hidden" name="tenant_slug" value={tenantSlug} />
              <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-[11px]">
                <CheckCheck className="h-3.5 w-3.5" /> Mark read
              </Button>
            </form>
          ) : null}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Team submissions and manager edits will appear here.
            </p>
          ) : (
            <ul className="divide-y">
              {notifications.slice(0, 12).map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href || `/dashboard/${tenantSlug}`}
                    className={cn(
                      "block px-3 py-2.5 transition-colors hover:bg-muted/60",
                      item.read ? "opacity-70" : "bg-primary-soft/30",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold leading-snug">{item.title}</p>
                      {!item.read ? (
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                      ) : null}
                    </div>
                    {item.body ? (
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                        {item.body}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/80">
                      <TimeAgo value={item.createdAt} />
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}
