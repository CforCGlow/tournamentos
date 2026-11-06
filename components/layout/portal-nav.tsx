"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Flag,
  LayoutDashboard,
  ListChecks,
  Radio,
  Settings,
  ShieldCheck,
  Trophy,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard,
  trophy: Trophy,
  users: Users,
  calendar: CalendarDays,
  clipboard: ClipboardList,
  card: CreditCard,
  flag: Flag,
  chart: BarChart3,
  radio: Radio,
  shield: ShieldCheck,
  settings: Settings,
  wallet: Wallet,
  activity: Activity,
  userCog: UserCog,
  list: ListChecks,
} as const;

export type NavIcon = keyof typeof ICONS;

export interface PortalNavItem {
  href: string;
  label: string;
  icon: NavIcon;
  exact?: boolean;
  badge?: string | number;
}

export function PortalNav({ items }: { items: PortalNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-emerald-400/15 text-emerald-200"
                : "text-slate-400 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                active ? "text-emerald-300" : "text-slate-500 group-hover:text-slate-300",
              )}
            />
            <span className="truncate">{item.label}</span>
            {item.badge !== undefined ? (
              <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
