import Link from "next/link";
import { ArrowLeft, ShieldCheck, Trash2, UserCog, Users } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { PortalShell } from "@/components/layout/portal-shell";
import { SUPERADMIN_NAV } from "@/components/superadmin/superadmin-nav";
import { AddSuperAdminForm } from "@/components/superadmin/add-superadmin-form";
import { removeSuperAdminAction } from "@/app/actions/superadmins";
import { FlashMessage } from "@/components/layout/flash-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, initials } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SuperAdminsPage({
  searchParams,
}: {
  searchParams: Promise<{ flash?: string; error?: string }>;
}) {
  const query = await searchParams;
  const ctx = await requireSuperAdmin();

  const { data: admins } = await ctx.supabase
    .from("profiles")
    .select("id, full_name, email, phone, created_at")
    .eq("global_role", "SUPER_ADMIN")
    .order("created_at");

  const rows = admins ?? [];
  const adminIds = rows.map((admin) => admin.id);

  const { data: memberships } = adminIds.length
    ? await ctx.supabase
        .from("tenant_members")
        .select("user_id, tenant_id, role")
        .in("user_id", adminIds)
        .eq("role", "TOURNAMENT_ADMIN")
    : { data: [] as Array<{ user_id: string; tenant_id: string; role: string }> };

  const workspacesByAdmin = new Map<string, number>();
  for (const membership of memberships ?? []) {
    workspacesByAdmin.set(membership.user_id, (workspacesByAdmin.get(membership.user_id) ?? 0) + 1);
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
      <FlashMessage flash={query.flash} error={query.error} />

      <Link
        href="/superadmin"
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Overview
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <UserCog className="h-3 w-3" /> Platform team
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
            Superadmins
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Superadmins see every client workspace, can step into any console, and edit the public
            home page. Add as many as you need.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/superadmin/tenants">
            <Users className="h-4 w-4" /> Manage clients
          </Link>
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Platform owners
            </CardTitle>
            <Badge variant="neutral">{rows.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="h-5 w-5" />}
                title="No superadmins"
                description="Add at least one platform owner below."
              />
            ) : (
              rows.map((admin) => {
                const isSelf = admin.id === ctx.profile.id;
                const workspaceCount = workspacesByAdmin.get(admin.id) ?? 0;

                return (
                  <div
                    key={admin.id}
                    className="relative flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 font-display text-xs font-semibold text-white">
                        {initials(admin.full_name || admin.email)}
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                          <span className="truncate">{admin.full_name || "Unnamed"}</span>
                          {isSelf ? <Badge variant="neutral">you</Badge> : null}
                          <Badge variant="purple">Superadmin</Badge>
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">{admin.email}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Joined {formatDate(admin.created_at)}
                          {workspaceCount
                            ? ` · tournament admin in ${workspaceCount} workspace${workspaceCount === 1 ? "" : "s"}`
                            : ""}
                        </p>
                      </div>
                    </div>

                    {isSelf ? (
                      <span className="text-[11px] text-muted-foreground">Signed in here</span>
                    ) : (
                      <details>
                        <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </summary>
                        <form
                          action={removeSuperAdminAction}
                          className="absolute right-0 z-10 mt-1 w-60 max-w-[calc(100vw-2rem)] space-y-2 rounded-lg border bg-card p-3 shadow-lg"
                        >
                          <input type="hidden" name="user_id" value={admin.id} />
                          <p className="text-[11px] leading-relaxed text-muted-foreground">
                            Remove platform access for {admin.email}? Their workspace roles stay
                            untouched.
                          </p>
                          <Button type="submit" size="sm" variant="destructive" className="w-full">
                            Remove superadmin
                          </Button>
                        </form>
                      </details>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Add a superadmin</CardTitle>
            </CardHeader>
            <CardContent>
              <AddSuperAdminForm />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tournament admins</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
              <p>
                Tournament admins belong to one client workspace, not the platform. Add them from
                the client page, or let the client invite them from{" "}
                <span className="font-medium text-foreground">Referees &amp; staff</span>.
              </p>
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link href="/superadmin/tenants">Choose a client workspace</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PortalShell>
  );
}
