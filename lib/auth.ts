import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type {
  ProfileRow,
  TenantRow,
  TenantRole,
  TeamRow,
  MatchRow,
  TournamentRow,
} from "@/lib/database.types";

export interface SessionContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  profile: ProfileRow;
}

export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, profile: null as ProfileRow | null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { supabase, user, profile: profile ?? null };
}

export async function requireProfile(nextPath?: string): Promise<SessionContext> {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) {
    const target = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";
    redirect(target);
  }
  return { supabase, profile };
}

export async function requireSuperAdmin(): Promise<SessionContext> {
  const ctx = await requireProfile("/superadmin");
  if (ctx.profile.global_role !== "SUPER_ADMIN") {
    redirect("/portal");
  }
  return ctx;
}

export async function isTenantAdmin(
  supabase: SessionContext["supabase"],
  tenantId: string,
  userId: string,
): Promise<boolean> {
  if (await isSuperAdmin(supabase, userId)) return true;
  const { data } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role === "TOURNAMENT_ADMIN";
}

async function isSuperAdmin(
  supabase: SessionContext["supabase"],
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("global_role")
    .eq("id", userId)
    .maybeSingle();
  return data?.global_role === "SUPER_ADMIN";
}

export interface TenantContext extends SessionContext {
  tenant: TenantRow;
  role: TenantRole;
}

export async function requireTenant(
  slug: string,
  roles: TenantRole[] = ["TOURNAMENT_ADMIN"],
): Promise<TenantContext> {
  const ctx = await requireProfile(`/dashboard/${slug}`);
  const { data: tenant } = await ctx.supabase
    .from("tenants")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!tenant) redirect("/portal");

  const { data: membership } = await ctx.supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", ctx.profile.id)
    .maybeSingle();

  const superAdmin = ctx.profile.global_role === "SUPER_ADMIN";
  if (!superAdmin && (!membership || !roles.includes(membership.role as TenantRole))) {
    redirect("/portal");
  }

  return { ...ctx, tenant, role: (membership?.role as TenantRole) ?? "TOURNAMENT_ADMIN" };
}

export async function requireTournament(
  slug: string,
  tournamentId: string,
): Promise<TenantContext & { tournament: TournamentRow }> {
  const ctx = await requireTenant(slug);
  const { data: tournament } = await ctx.supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .eq("tenant_id", ctx.tenant.id)
    .maybeSingle();

  if (!tournament) redirect(`/dashboard/${slug}/tournaments`);
  return { ...ctx, tournament };
}

export interface TeamContext extends SessionContext {
  team: TeamRow;
  isAdmin: boolean;
}

export async function requireTeamContext(teamId: string): Promise<TeamContext> {
  const ctx = await requireProfile(`/manager/${teamId}`);
  const { data: team } = await ctx.supabase
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .maybeSingle();

  if (!team) redirect("/portal");

  const { data: tournament } = await ctx.supabase
    .from("tournaments")
    .select("tenant_id")
    .eq("id", team.tournament_id)
    .maybeSingle();

  const admin = tournament ? await isTenantAdmin(ctx.supabase, tournament.tenant_id, ctx.profile.id) : false;

  if (team.manager_id !== ctx.profile.id && !admin) {
    redirect("/portal");
  }

  return { ...ctx, team, isAdmin: admin };
}

export async function requireMatchContext(matchId: string): Promise<
  SessionContext & { match: MatchRow; isAdmin: boolean; refereeName: string | null }
> {
  const ctx = await requireProfile(`/referee/match/${matchId}`);
  const { data: match } = await ctx.supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) redirect("/portal");

  const { data: tournament } = await ctx.supabase
    .from("tournaments")
    .select("tenant_id")
    .eq("id", match.tournament_id)
    .maybeSingle();

  const admin = tournament ? await isTenantAdmin(ctx.supabase, tournament.tenant_id, ctx.profile.id) : false;

  if (match.referee_id !== ctx.profile.id && !admin) {
    redirect("/portal");
  }

  const { data: official } = await ctx.supabase
    .from("public_match_officials")
    .select("referee_name")
    .eq("match_id", matchId)
    .maybeSingle();

  return { ...ctx, match, isAdmin: admin, refereeName: official?.referee_name ?? null };
}

/** Chooses the correct landing page for the signed-in user. */
export async function resolveHome(): Promise<string> {
  const ctx = await requireProfile();
  if (ctx.profile.global_role === "SUPER_ADMIN") return "/superadmin";

  const { data: memberships } = await ctx.supabase
    .from("tenant_members")
    .select("role, tenant_id")
    .eq("user_id", ctx.profile.id);

  const rows = memberships ?? [];

  const adminTenantIds = rows
    .filter((member) => member.role === "TOURNAMENT_ADMIN")
    .map((member) => member.tenant_id);

  if (adminTenantIds.length) {
    const { data: tenants } = await ctx.supabase
      .from("tenants")
      .select("slug")
      .in("id", adminTenantIds)
      .order("created_at")
      .limit(1);

    const slug = tenants?.[0]?.slug;
    if (slug) return `/dashboard/${slug}`;
  }

  const manager = rows.find((member) => member.role === "TEAM_MANAGER");
  if (manager) {
    const { data: team } = await ctx.supabase
      .from("teams")
      .select("id")
      .eq("manager_id", ctx.profile.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (team) return `/manager/${team.id}`;
  }

  const referee = rows.find((member) => member.role === "REFEREE");
  if (referee) return "/referee";
  return "/portal";
}
