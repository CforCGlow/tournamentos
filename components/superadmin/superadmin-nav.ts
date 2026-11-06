import type { PortalNavItem } from "@/components/layout/portal-nav";

export const SUPERADMIN_NAV: PortalNavItem[] = [
  { href: "/superadmin", label: "Overview", icon: "dashboard", exact: true },
  { href: "/superadmin/tenants", label: "Clients", icon: "shield" },
  { href: "/superadmin/content", label: "Home page", icon: "settings" },
  { href: "/superadmin/admins", label: "Platform team", icon: "userCog" },
];
