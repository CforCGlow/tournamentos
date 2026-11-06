import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { PortalShell } from "@/components/layout/portal-shell";
import { SUPERADMIN_NAV } from "@/components/superadmin/superadmin-nav";
import { CreateTenantForm } from "@/components/superadmin/create-tenant-form";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { TenantStatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/utils";
import { Building2, Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const ctx = await requireSuperAdmin();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = params.status ?? "";

  let query = ctx.supabase.from("tenants").select("*").order("created_at", { ascending: false });
  if (q) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
  if (status) query = query.eq("status", status as "active" | "suspended" | "trial");

  const { data: tenants } = await query;
  const { data: tournaments } = await ctx.supabase
    .from("tournaments")
    .select("id, tenant_id, status");

  const tournamentCount = new Map<string, number>();
  for (const tournament of tournaments ?? []) {
    tournamentCount.set(
      tournament.tenant_id,
      (tournamentCount.get(tournament.tenant_id) ?? 0) + 1,
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
      <BackLink href="/superadmin" label="Platform overview" />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Tenancy
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
            Clients
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Provision, suspend and support every organiser workspace.
          </p>
        </div>
        <CreateTenantForm />
      </div>

      <Card>
        <CardContent className="p-4">
          <form className="flex flex-wrap items-center gap-2" method="get">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={q}
                placeholder="Search name or slug…"
                className="pl-9"
              />
            </div>
            <select
              name="status"
              defaultValue={status}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
            <Button type="submit" variant="secondary">
              Filter
            </Button>
            {q || status ? (
              <Button asChild variant="ghost">
                <Link href="/superadmin/tenants">Reset</Link>
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <div className="mt-5">
        {(tenants ?? []).length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title="No clients match"
            description="Adjust the filters or provision a new organiser workspace."
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Tournaments</th>
                      <th className="px-4 py-3">Joined</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {(tenants ?? []).map((tenant) => {
                      return (
                        <tr key={tenant.id} className="border-b last:border-0">
                          <td className="px-4 py-3">
                            <Link
                              href={`/superadmin/tenants/${tenant.id}`}
                              className="font-semibold hover:text-primary"
                            >
                              {tenant.name}
                            </Link>
                            <p className="text-[11px] text-muted-foreground">/{tenant.slug}</p>
                          </td>
                          <td className="px-4 py-3">
                            <TenantStatusBadge status={tenant.status} />
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {tournamentCount.get(tenant.id) ?? 0}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-muted-foreground">
                              {formatDate(tenant.created_at)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/superadmin/tenants/${tenant.id}`}>Manage</Link>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PortalShell>
  );
}
