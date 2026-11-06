import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  PauseCircle,
  PlayCircle,
  Trash2,
  Users,
} from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { PortalShell } from "@/components/layout/portal-shell";
import { SUPERADMIN_NAV } from "@/components/superadmin/superadmin-nav";
import { TenantSettingsForm } from "@/components/superadmin/tenant-settings-form";
import { AddTenantMemberForm } from "@/components/superadmin/add-tenant-member-form";
import { FlashMessage } from "@/components/layout/flash-message";
import {
  deleteTenantAction,
  setTenantStatusAction,
} from "@/app/actions/tenants";
import { removeTenantMemberAction } from "@/app/actions/superadmins";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/forms/submit-button";
import { TenantStatusBadge } from "@/components/ui/status-badge";
import { formatDate, initials, pluralize } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ flash?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const ctx = await requireSuperAdmin();

  const { data: tenant } = await ctx.supabase
    .from("tenants")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!tenant) notFound();

  const [{ data: tournaments }, { data: members }, { count: teamCount }] = await Promise.all([
    ctx.supabase
      .from("tournaments")
      .select("id, name, slug, status, start_date")
      .eq("tenant_id", id)
      .order("created_at", { ascending: false }),
    ctx.supabase.from("tenant_members").select("*").eq("tenant_id", id),
    ctx.supabase.from("teams").select("id", { count: "exact", head: true }).in(
      "tournament_id",
      (
        await ctx.supabase.from("tournaments").select("id").eq("tenant_id", id)
      ).data?.map((tournament) => tournament.id) ?? ["00000000-0000-0000-0000-000000000000"],
    ),
  ]);

  const memberIds = (members ?? []).map((member) => member.user_id);
  const { data: profiles } = memberIds.length
    ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", memberIds)
    : { data: [] as Array<{ id: string; full_name: string; email: string }> };

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const active = tenant.status !== "suspended";

  return (
    <PortalShell
      nav={SUPERADMIN_NAV}
      brandName="LigaPro Platform"
      brandSubtitle="SuperAdmin"
      userName={ctx.profile.full_name}
      userRole="Platform owner"
      publicHref="/"
    >
      <FlashMessage flash={query.flash} error={query.error} />

      <Link
        href="/superadmin/tenants"
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All clients
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{tenant.name}</h1>
            <TenantStatusBadge status={tenant.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            /{tenant.slug} · joined {formatDate(tenant.created_at)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/dashboard/${tenant.slug}`}>
              Open client console <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>

          <form action={setTenantStatusAction}>
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <input type="hidden" name="status" value={active ? "suspended" : "active"} />
            <Button type="submit" variant={active ? "destructive" : "default"}>
              {active ? (
                <>
                  <PauseCircle className="h-4 w-4" /> Suspend
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4" /> Reactivate
                </>
              )}
            </Button>
          </form>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Workspace & branding</CardTitle>
          </CardHeader>
          <CardContent>
            <TenantSettingsForm tenant={tenant} />
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Account snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                {
                  label: "Tournaments",
                  value: `${tournaments?.length ?? 0}`,
                },
                { label: "Teams", value: `${teamCount ?? 0}` },
                { label: "Members", value: `${members?.length ?? 0}` },
                { label: "Created", value: formatDate(tenant.created_at) },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium">{row.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Team members
              </CardTitle>
              <Badge variant="neutral">{members?.length ?? 0}</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {(members ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No members linked yet.</p>
              ) : (
                (members ?? []).map((member) => {
                  const profile = profileById.get(member.user_id);
                  return (
                    <div
                      key={member.id}
                      className="relative flex items-center gap-2.5 rounded-lg border px-3 py-2"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-[10px] font-bold text-emerald-700">
                        {initials(profile?.full_name ?? "?")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">
                          {profile?.full_name ?? "Unknown"}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {profile?.email}
                        </p>
                      </div>
                      <Badge variant="neutral">
                        {member.role.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                      <details>
                        <summary
                          title="Remove access"
                          className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </summary>
                        <form
                          action={removeTenantMemberAction}
                          className="absolute right-0 z-10 mt-1 w-56 max-w-[calc(100vw-2rem)] space-y-2 rounded-lg border bg-card p-3 shadow-lg"
                        >
                          <input type="hidden" name="tenant_id" value={tenant.id} />
                          <input type="hidden" name="member_id" value={member.id} />
                          <p className="text-[11px] leading-relaxed text-muted-foreground">
                            Remove {profile?.full_name ?? profile?.email ?? "this person"} from{" "}
                            {tenant.name}? Their account stays active elsewhere.
                          </p>
                          <Button type="submit" size="sm" variant="destructive" className="w-full">
                            Remove access
                          </Button>
                        </form>
                      </details>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add to this workspace</CardTitle>
            </CardHeader>
            <CardContent>
              <AddTenantMemberForm tenantId={tenant.id} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Tournaments</CardTitle>
          <Badge variant="neutral">{pluralize(tournaments?.length ?? 0, "tournament")}</Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {(tournaments ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">This client has not created a tournament yet.</p>
          ) : (
            (tournaments ?? []).map((tournament) => (
              <div
                key={tournament.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-semibold">{tournament.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    /{tournament.slug} · starts {formatDate(tournament.start_date)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral" className="shrink-0 whitespace-nowrap uppercase tracking-wide">{tournament.status.replace(/_/g, " ")}</Badge>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/${tournament.slug}`} target="_blank">
                      View public
                    </Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="mt-5 border-rose-200">
        <CardHeader>
          <CardTitle className="text-rose-700">Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end justify-between gap-4">
          <p className="max-w-md text-sm text-muted-foreground">
            Deleting a tenant removes its tournaments, squads, fixtures and results.
            User accounts remain but lose access. This cannot be undone.
          </p>
          <form action={deleteTenantAction} className="flex items-end gap-2">
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase text-muted-foreground">
                Type DELETE
              </label>
              <input
                name="confirm"
                className="h-9 w-32 rounded-md border border-input bg-background px-2 text-sm"
                placeholder="DELETE"
              />
            </div>
            <SubmitButton variant="destructive" pendingLabel="Deleting…">
              <Trash2 className="h-4 w-4" /> Delete tenant
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </PortalShell>
  );
}
