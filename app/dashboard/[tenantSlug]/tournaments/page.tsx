import Link from "next/link";
import { ArrowUpRight, CalendarClock, Trophy, Users } from "lucide-react";
import { requireTenant } from "@/lib/auth";
import { FlashMessage } from "@/components/layout/flash-message";
import { BackLink } from "@/components/layout/back-link";
import { CreateTournamentDialog } from "@/components/dashboard/create-tournament-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TournamentStatusBadge } from "@/components/ui/status-badge";
import { TOURNAMENT_FORMATS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TournamentsPage({
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
  const { data: teams } = ids.length
    ? await ctx.supabase.from("teams").select("id, tournament_id, registration_status").in("tournament_id", ids)
    : { data: [] as Array<{ id: string; tournament_id: string; registration_status: string }> };

  const teamCount = new Map<string, number>();
  for (const team of teams ?? []) {
    if (team.registration_status === "APPROVED") {
      teamCount.set(team.tournament_id, (teamCount.get(team.tournament_id) ?? 0) + 1);
    }
  }

  const used = tournaments?.length ?? 0;

  return (
    <div>
      <FlashMessage flash={query.flash} error={query.error} />
      <BackLink href={base} label="Dashboard overview" />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Competitions
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
            Tournaments
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {used === 0
              ? "Create your first competition to get started."
              : `${used} ${used === 1 ? "competition" : "competitions"} in this workspace.`}
          </p>
        </div>
        <CreateTournamentDialog tenantSlug={tenantSlug} tenantId={ctx.tenant.id} />
      </div>

      {(tournaments ?? []).length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-5 w-5" />}
          title="No tournaments yet"
          description="Create a league, a knockout cup, or a groups-plus-knockout competition."
          action={
            <CreateTournamentDialog tenantSlug={tenantSlug} tenantId={ctx.tenant.id} />
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(tournaments ?? []).map((tournament) => (
            <Card key={tournament.id} className="flex h-full flex-col">
              <CardContent className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-semibold leading-tight">
                      {tournament.name}
                    </h2>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      /{tournament.slug}
                    </p>
                  </div>
                  <TournamentStatusBadge status={tournament.status} />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="neutral">{TOURNAMENT_FORMATS[tournament.format]}</Badge>
                  <Badge variant="info">
                    {teamCount.get(tournament.id) ?? 0}/{tournament.max_teams} teams
                  </Badge>
                  {tournament.roster_locked ? (
                    <Badge variant="warning">rosters locked</Badge>
                  ) : null}
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {formatDate(tournament.start_date)} — {formatDate(tournament.end_date)}
                  </p>
                  <p className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    Squad {tournament.min_squad_size}–{tournament.max_squad_size}
                  </p>
                  <p className="flex items-center gap-2">
                    <Trophy className="h-3.5 w-3.5" />
                    Entry {formatMoney(tournament.registration_fee)}
                  </p>
                </div>

                <div className="mt-auto flex items-center gap-2">
                  <Button asChild size="sm" className="flex-1">
                    <Link href={`${base}/tournaments/${tournament.id}`}>Control centre</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/${tournament.slug}`} target="_blank">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
