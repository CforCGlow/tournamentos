import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck2,
  ClipboardList,
  Plus,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { requireTenant } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { TournamentStatusBadge } from "@/components/ui/status-badge";
import { FlashMessage } from "@/components/layout/flash-message";
import { formatDate, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardOverview({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ flash?: string; error?: string }>;
}) {
  const { tenantSlug } = await params;
  const query = await searchParams;
  const ctx = await requireTenant(tenantSlug);
  const base = `/dashboard/${tenantSlug}`;

  const { data: tournaments } = await ctx.supabase
    .from("tournaments")
    .select("*")
    .eq("tenant_id", ctx.tenant.id)
    .order("created_at", { ascending: false });

  const ids = (tournaments ?? []).map((tournament) => tournament.id);
  const safeIds = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];

  const [{ data: teams }, { data: matches }] = await Promise.all([
    ctx.supabase.from("teams").select("*").in("tournament_id", safeIds),
    ctx.supabase
      .from("matches")
      .select("*")
      .in("tournament_id", safeIds)
      .order("kickoff_time")
      .limit(80),
  ]);

  const pending = (teams ?? []).filter((team) => team.registration_status === "PENDING");
  const approved = (teams ?? []).filter((team) => team.registration_status === "APPROVED");
  const paid = (teams ?? []).filter((team) => team.payment_status === "PAID");
  const revenue = (tournaments ?? []).reduce((sum, tournament) => {
    const count = paid.filter((team) => team.tournament_id === tournament.id).length;
    return sum + count * Number(tournament.registration_fee);
  }, 0);

  const upcoming = (matches ?? [])
    .filter((match) => match.status === "SCHEDULED")
    .slice(0, 5);

  const tournamentById = new Map((tournaments ?? []).map((t) => [t.id, t]));
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));

  return (
    <div>
      <FlashMessage flash={query.flash} error={query.error} />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Organiser workspace
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
            {ctx.tenant.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tournaments?.length ?? 0} tournaments · {teams?.length ?? 0} teams ·{" "}
            {approved.length} approved
          </p>
        </div>
        <Button asChild>
          <Link href={`${base}/tournaments`}>
            <Plus className="h-4 w-4" /> New tournament
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tournaments"
          value={tournaments?.length ?? 0}
          hint={`${(tournaments ?? []).filter((t) => t.status === "ONGOING").length} ongoing`}
          icon={<Trophy className="h-5 w-5" />}
        />
        <StatCard
          label="Teams"
          value={teams?.length ?? 0}
          hint={`${approved.length} approved · ${pending.length} pending`}
          icon={<Users className="h-5 w-5" />}
          tone="secondary"
        />
        <StatCard
          label="Fixtures"
          value={matches?.length ?? 0}
          hint={`${(matches ?? []).filter((m) => m.status === "COMPLETED").length} completed`}
          icon={<CalendarCheck2 className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          label="Entry fees collected"
          value={formatMoney(revenue)}
          hint={`${paid.length} paid entries`}
          icon={<Wallet className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Registration queue</CardTitle>
            <Badge variant={pending.length ? "warning" : "neutral"}>
              {pending.length} pending
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.length === 0 ? (
              <EmptyState
                icon={<ClipboardList className="h-5 w-5" />}
                title="Queue is clear"
                description="New team applications and payment proofs appear here for approval."
                className="py-8"
              />
            ) : (
              pending.slice(0, 5).map((team) => {
                const tournament = tournamentById.get(team.tournament_id);
                return (
                  <Link
                    key={team.id}
                    href={`${base}/tournaments/${team.tournament_id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{team.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {tournament?.name ?? "Tournament"} ·{" "}
                        {team.payment_status.replace(/_/g, " ").toLowerCase()}
                      </p>
                    </div>
                    <Badge variant="warning">review</Badge>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Next fixtures</CardTitle>
            <Button asChild size="sm" variant="ghost">
              <Link href={`${base}/tournaments`}>
                All <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No scheduled fixtures yet — generate them from a tournament.
              </p>
            ) : (
              upcoming.map((match) => {
                const home = match.home_team_id ? teamById.get(match.home_team_id) : null;
                const away = match.away_team_id ? teamById.get(match.away_team_id) : null;
                return (
                  <Link
                    key={match.id}
                    href={`${base}/tournaments/${match.tournament_id}`}
                    className="block rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/60"
                  >
                    <p className="text-sm font-semibold">
                      {home?.short_name ?? "TBD"} <span className="text-muted-foreground">vs</span>{" "}
                      {away?.short_name ?? "TBD"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(match.kickoff_time, true)} · {match.round_name}
                    </p>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Your tournaments</CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link href={`${base}/tournaments`}>Manage all</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {(tournaments ?? []).length === 0 ? (
            <EmptyState
              icon={<Trophy className="h-5 w-5" />}
              title="No tournaments yet"
              description="Create your first competition, open registration and invite teams."
              action={
                <Button asChild size="sm">
                  <Link href={`${base}/tournaments`}>Create tournament</Link>
                </Button>
              }
            />
          ) : (
            (tournaments ?? []).slice(0, 5).map((tournament) => {
              const count = (teams ?? []).filter(
                (team) => team.tournament_id === tournament.id,
              ).length;
              return (
                <Link
                  key={tournament.id}
                  href={`${base}/tournaments/${tournament.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3 transition-colors hover:bg-muted/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{tournament.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {count}/{tournament.max_teams} teams · starts{" "}
                      {formatDate(tournament.start_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <TournamentStatusBadge status={tournament.status} />
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
