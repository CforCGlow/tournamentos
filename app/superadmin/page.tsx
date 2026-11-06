import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { PortalShell } from "@/components/layout/portal-shell";
import { SUPERADMIN_NAV } from "@/components/superadmin/superadmin-nav";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { TenantStatusBadge } from "@/components/ui/status-badge";
import {
  ArrowRight,
  Building2,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";

export const dynamic = "force-dynamic";

const FORMAT_LABELS = {
  LEAGUE: "League",
  KNOCKOUT: "Knockout cup",
  GROUP_PLUS_KNOCKOUT: "Groups + knockout",
} as const;

const FORMAT_TONES = {
  LEAGUE: "h-full bg-primary",
  KNOCKOUT: "h-full bg-secondary",
  GROUP_PLUS_KNOCKOUT: "h-full bg-slate-800",
} as const;

export default async function SuperAdminPage() {
  const ctx = await requireSuperAdmin();
  const supabase = ctx.supabase;

  const [
    { data: tenants },
    { data: tournaments },
    { count: teamCount },
    { count: playerCount },
  ] = await Promise.all([
    supabase.from("tenants").select("*").order("created_at", { ascending: false }),
    supabase
      .from("tournaments")
      .select("id, name, slug, format, status, tenant_id, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("teams").select("id", { count: "exact", head: true }),
    supabase.from("players").select("id", { count: "exact", head: true }),
  ]);

  const workspaces = tenants ?? [];
  const competitions = tournaments ?? [];
  const active = workspaces.filter((tenant) => tenant.status === "active");
  const suspended = workspaces.filter((tenant) => tenant.status === "suspended");
  const ongoing = competitions.filter((tournament) => tournament.status === "ONGOING");

  const competitionsByTenant = new Map<string, number>();
  for (const tournament of competitions) {
    competitionsByTenant.set(
      tournament.tenant_id,
      (competitionsByTenant.get(tournament.tenant_id) ?? 0) + 1,
    );
  }

  return (
    <PortalShell
      nav={SUPERADMIN_NAV}
      brandName="LigaPro Platform"
      brandSubtitle="SuperAdmin"
      userName={ctx.profile.full_name}
      userRole="Platform owner"
      publicHref="/"
    >
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          Platform control
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
          Good to see you, {ctx.profile.full_name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Workspaces, competitions and platform health in one view.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Workspaces"
          value={workspaces.length}
          hint={`${active.length} active · ${suspended.length} suspended`}
          icon={<Building2 className="h-5 w-5" />}
        />
        <StatCard
          label="Tournaments"
          value={competitions.length}
          hint={`${ongoing.length} ongoing right now`}
          icon={<Trophy className="h-5 w-5" />}
          tone="secondary"
        />
        <StatCard
          label="Teams"
          value={teamCount ?? 0}
          hint="Across every workspace"
          icon={<Users className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          label="Players"
          value={playerCount ?? 0}
          hint="Registered in squads"
          icon={<UserRound className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card className="min-w-0">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Workspaces
            </CardTitle>
            <Button asChild size="sm" variant="ghost">
              <Link href="/superadmin/tenants">
                All clients <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {workspaces.length === 0 ? (
              <EmptyState
                icon={<Building2 className="h-5 w-5" />}
                title="No workspaces yet"
                description="Organisers can create their own workspace, or you can provision one from the clients page."
                className="py-8"
              />
            ) : (
              workspaces.slice(0, 6).map((tenant) => (
                <Link
                  key={tenant.id}
                  href={`/superadmin/tenants/${tenant.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{tenant.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      /{tenant.slug} · {competitionsByTenant.get(tenant.id) ?? 0} tournaments ·
                      joined {formatDate(tenant.created_at)}
                    </p>
                  </div>
                  <TenantStatusBadge status={tenant.status} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Competition mix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(Object.keys(FORMAT_LABELS) as Array<keyof typeof FORMAT_LABELS>).map((format) => {
              const count = competitions.filter((t) => t.format === format).length;
              const width = competitions.length
                ? Math.round((count / competitions.length) * 100)
                : 0;
              return (
                <div key={format} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{FORMAT_LABELS[format]}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={FORMAT_TONES[format]} style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
            <p className="pt-1 text-[11px] text-muted-foreground">
              {competitions.length} competitions across every format the platform supports.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Newest tournaments</CardTitle>
            <Badge variant="neutral">{competitions.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {competitions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No tournaments created yet.
              </p>
            ) : (
              competitions.slice(0, 5).map((tournament) => {
                const tenant = workspaces.find((item) => item.id === tournament.tenant_id);
                return (
                  <div
                    key={tournament.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{tournament.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {tenant?.name ?? "Unknown workspace"} ·{" "}
                        {FORMAT_LABELS[tournament.format]}
                      </p>
                    </div>
                    <Badge variant="neutral" className="shrink-0 whitespace-nowrap uppercase tracking-wide">{tournament.status.replace(/_/g, " ")}</Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Platform health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              { label: "Workspaces online", value: `${active.length} of ${workspaces.length}` },
              { label: "Competitions ongoing", value: `${ongoing.length}` },
              {
                label: "Registration open",
                value: `${competitions.filter((row) => row.status === "REGISTRATION_OPEN").length}`,
              },
              { label: "Suspended workspaces", value: `${suspended.length}` },
              { label: "Teams registered", value: `${teamCount ?? 0}` },
              { label: "Players registered", value: `${playerCount ?? 0}` },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="flex items-center gap-2 font-medium">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      row.label === "Suspended workspaces" && suspended.length > 0
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                  />
                  {row.value}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
