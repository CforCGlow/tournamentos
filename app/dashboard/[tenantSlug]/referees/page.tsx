import Link from "next/link";
import {
  BadgeCheck,
  CalendarClock,
  Flag,
  KeyRound,
  Mail,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { requireTenant } from "@/lib/auth";
import { removeMemberAction, updateMemberRoleAction } from "@/app/actions/members";
import { FlashMessage } from "@/components/layout/flash-message";
import { BackLink } from "@/components/layout/back-link";
import { InviteMemberForm } from "@/components/dashboard/invite-member-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crest } from "@/components/ui/crest";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate } from "@/lib/utils";
import type { TenantRole } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<TenantRole, string> = {
  TOURNAMENT_ADMIN: "Tournament admin",
  TEAM_MANAGER: "Team manager",
  REFEREE: "Referee",
};

const ROLE_TONE: Record<TenantRole, "purple" | "info" | "success"> = {
  TOURNAMENT_ADMIN: "purple",
  TEAM_MANAGER: "info",
  REFEREE: "success",
};

const ROLE_ORDER: Record<TenantRole, number> = {
  TOURNAMENT_ADMIN: 0,
  REFEREE: 1,
  TEAM_MANAGER: 2,
};

export default async function RefereesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ flash?: string; error?: string }>;
}) {
  const { tenantSlug } = await params;
  const query = await searchParams;
  const ctx = await requireTenant(tenantSlug);

  const { data: members } = await ctx.supabase
    .from("tenant_members")
    .select("*")
    .eq("tenant_id", ctx.tenant.id)
    .order("created_at");

  const memberRows = members ?? [];
  const userIds = memberRows.map((member) => member.user_id);

  const [{ data: profiles }, { data: tournaments }] = await Promise.all([
    userIds.length
      ? ctx.supabase
          .from("profiles")
          .select("id, full_name, email, phone, avatar_url")
          .in("id", userIds)
      : Promise.resolve({ data: [] }),
    ctx.supabase.from("tournaments").select("id, name, slug").eq("tenant_id", ctx.tenant.id),
  ]);

  const tournamentIds = (tournaments ?? []).map((tournament) => tournament.id);

  const [{ data: matches }, { data: teams }] = await Promise.all([
    tournamentIds.length
      ? ctx.supabase
          .from("matches")
          .select("id, tournament_id, referee_id, status, kickoff_time")
          .in("tournament_id", tournamentIds)
      : Promise.resolve({ data: [] }),
    tournamentIds.length
      ? ctx.supabase
          .from("teams")
          .select("id, name, manager_id, tournament_id")
          .in("tournament_id", tournamentIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const tournamentById = new Map((tournaments ?? []).map((tournament) => [tournament.id, tournament]));

  const assignments = new Map<string, { total: number; upcoming: number; unassigned: number }>();
  for (const match of matches ?? []) {
    if (!match.referee_id) continue;
    const current = assignments.get(match.referee_id) ?? { total: 0, upcoming: 0, unassigned: 0 };
    current.total += 1;
    if (match.status === "SCHEDULED") current.upcoming += 1;
    assignments.set(match.referee_id, current);
  }

  const teamsByManager = new Map<string, Array<{ id: string; name: string; tournament: string }>>();
  for (const team of teams ?? []) {
    const list = teamsByManager.get(team.manager_id) ?? [];
    list.push({
      id: team.id,
      name: team.name,
      tournament: tournamentById.get(team.tournament_id)?.name ?? "Tournament",
    });
    teamsByManager.set(team.manager_id, list);
  }

  const sorted = [...memberRows].sort(
    (a, b) =>
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
      (profileById.get(a.user_id)?.full_name ?? "").localeCompare(
        profileById.get(b.user_id)?.full_name ?? "",
      ),
  );

  const referees = sorted.filter((member) => member.role === "REFEREE");
  const admins = sorted.filter((member) => member.role === "TOURNAMENT_ADMIN");
  const managers = sorted.filter((member) => member.role === "TEAM_MANAGER");
  const unassignedFixtures = (matches ?? []).filter(
    (match) => !match.referee_id && match.status === "SCHEDULED",
  );
  const upcomingWeek = (matches ?? []).filter((match) => {
    if (!match.referee_id || match.status !== "SCHEDULED" || !match.kickoff_time) return false;
    const kickoff = new Date(match.kickoff_time).getTime();
    const now = Date.now();
    return kickoff >= now && kickoff <= now + 7 * 24 * 60 * 60 * 1000;
  });

  return (
    <div>
      <FlashMessage flash={query.flash} error={query.error} />
      <BackLink href={`/dashboard/${tenantSlug}`} label="Dashboard overview" />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Access control
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
            Referees &amp; staff
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Everyone here is scoped to {ctx.tenant.name}. Referees only open the matches you
            assign; managers only see their own squad.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/dashboard/${tenantSlug}/tournaments`}>
            <CalendarClock className="h-4 w-4" /> Assign fixtures
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Referees"
          value={referees.length}
          hint={`${upcomingWeek.length} fixtures in the next 7 days`}
          icon={<Flag className="h-5 w-5" />}
        />
        <StatCard
          label="Co-admins"
          value={admins.length}
          hint="Full console access"
          icon={<ShieldCheck className="h-5 w-5" />}
          tone="secondary"
        />
        <StatCard
          label="Team managers"
          value={managers.length}
          hint={`${(teams ?? []).length} teams registered`}
          icon={<Users className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          label="Unassigned fixtures"
          value={unassignedFixtures.length}
          hint="Scheduled without a referee"
          icon={<UserCog className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>People with access</CardTitle>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="purple">{admins.length} admins</Badge>
              <Badge variant="success">{referees.length} referees</Badge>
              <Badge variant="info">{managers.length} managers</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {sorted.length === 0 ? (
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title="Only you so far"
                description="Invite referees before the first matchday and co-admins if you need help running the queue."
              />
            ) : (
              sorted.map((member) => {
                const profile = profileById.get(member.user_id);
                const name = profile?.full_name ?? "Pending profile";
                const isSelf = member.user_id === ctx.profile.id;
                const stats = assignments.get(member.user_id);
                const managed = teamsByManager.get(member.user_id) ?? [];
                const initials = name
                  .split(" ")
                  .map((part) => part[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();

                return (
                  <div
                    key={member.id}
                    className="rounded-lg border p-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 font-display text-xs font-semibold text-white">
                          {initials || "?"}
                        </span>
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                            <span className="truncate">{name}</span>
                            {isSelf ? <Badge variant="neutral">you</Badge> : null}
                            <Badge variant={ROLE_TONE[member.role]}>
                              {ROLE_LABEL[member.role]}
                            </Badge>
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                            <Mail className="h-3 w-3 shrink-0" />
                            {profile?.email ?? "No email on file"}
                            {profile?.phone ? ` · ${profile.phone}` : ""}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {member.role === "REFEREE"
                              ? stats
                                ? `${stats.total} fixtures officiated · ${stats.upcoming} upcoming`
                                : "No fixtures assigned yet"
                              : member.role === "TEAM_MANAGER"
                                ? managed.length
                                  ? managed
                                      .slice(0, 2)
                                      .map((team) => `${team.name} (${team.tournament})`)
                                      .join(" · ")
                                  : "No team linked yet"
                                : `Joined ${formatDate(member.created_at)}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <form
                          action={updateMemberRoleAction}
                          className="flex items-center gap-1.5"
                        >
                          <input type="hidden" name="tenant_slug" value={tenantSlug} />
                          <input type="hidden" name="member_id" value={member.id} />
                          <Select
                            name="role"
                            defaultValue={member.role}
                            className="h-8 w-[9.5rem] text-xs"
                            disabled={isSelf}
                            title={isSelf ? "You cannot change your own role" : "Change role"}
                          >
                            <option value="TOURNAMENT_ADMIN">Admin</option>
                            <option value="REFEREE">Referee</option>
                            <option value="TEAM_MANAGER">Team manager</option>
                          </Select>
                          <Button
                            type="submit"
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={isSelf}
                          >
                            Save
                          </Button>
                        </form>

                        {isSelf ? null : (
                          <details className="relative">
                            <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600">
                              <Trash2 className="h-3.5 w-3.5" />
                            </summary>
                            <form
                              action={removeMemberAction}
                              className="absolute right-0 z-10 mt-1 w-56 space-y-2 rounded-lg border bg-card p-3 shadow-lg"
                            >
                              <input type="hidden" name="tenant_slug" value={tenantSlug} />
                              <input type="hidden" name="member_id" value={member.id} />
                              <p className="text-[11px] text-muted-foreground">
                                Remove {name}&apos;s access to this workspace? Their account stays
                                active elsewhere.
                              </p>
                              <Button
                                type="submit"
                                size="sm"
                                variant="destructive"
                                className="w-full"
                              >
                                Remove access
                              </Button>
                            </form>
                          </details>
                        )}
                      </div>
                    </div>

                    {member.role === "TEAM_MANAGER" && managed.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5 border-t pt-2">
                        {managed.map((team) => (
                          <Link
                            key={team.id}
                            href={`/manager/${team.id}`}
                            className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                          >
                            <Crest name={team.name} size="sm" className="h-4 w-4 rounded text-[7px]" />
                            {team.name}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <CardTitle>Invite by email</CardTitle>
            </CardHeader>
            <CardContent>
              <InviteMemberForm tenantSlug={tenantSlug} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-secondary" />
              <CardTitle>How access works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
              <p>
                Referees only see the fixtures assigned to them, and they are the only people
                who can record goals, cards and the final score. Organisers keep the full
                oversight of every match.
              </p>
              <p>
                <span className="font-semibold text-foreground">Referees</span> get the pitch-side
                console: clock, 3-tap event logging, penalties, MVP and sign-off.
              </p>
              <p>
                <span className="font-semibold text-foreground">Team managers</span> own one squad:
                roster edits until rosters lock, lineup builder with suspension checks, and their
                own payment status.
              </p>
              <p>
                <span className="font-semibold text-foreground">Co-admins</span> share everything
                you can do, including inviting other staff.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
