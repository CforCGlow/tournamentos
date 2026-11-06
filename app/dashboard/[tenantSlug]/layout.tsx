import { requireTenant } from "@/lib/auth";
import { PortalShell } from "@/components/layout/portal-shell";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { readNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export default async function TenantDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await requireTenant(tenantSlug);
  const base = `/dashboard/${tenantSlug}`;
  const notifications = await readNotifications(ctx.tenant.id);

  return (
    <PortalShell
      notifications={
        <NotificationBell
          tenantId={ctx.tenant.id}
          tenantSlug={tenantSlug}
          notifications={notifications}
        />
      }
      nav={[
        { href: base, label: "Overview", icon: "dashboard", exact: true },
        { href: `${base}/tournaments`, label: "Tournaments", icon: "trophy" },
        { href: `${base}/referees`, label: "Referees & staff", icon: "flag" },
      ]}
      brandName={ctx.tenant.name}
      brandSubtitle="Tournament operations"
      userName={ctx.profile.full_name}
      userRole="Tournament admin"
      publicHref="/#tournaments"
    >
      {children}
    </PortalShell>
  );
}
