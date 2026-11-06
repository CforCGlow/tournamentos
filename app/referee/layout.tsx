import { requireProfile } from "@/lib/auth";
import { PortalShell } from "@/components/layout/portal-shell";

export const dynamic = "force-dynamic";

export default async function RefereeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireProfile("/referee");

  return (
    <PortalShell
      nav={[{ href: "/referee", label: "My matches", icon: "flag", exact: true }]}
      brandName="Referee console"
      brandSubtitle="Pitch-side scoring"
      userName={ctx.profile.full_name}
      userRole="Match official"
      publicHref="/"
    >
      {children}
    </PortalShell>
  );
}
