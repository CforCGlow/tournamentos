import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/layout/back-link";
import { BarChart3, Flame, Handshake, ShieldAlert, Star, Trophy } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crest } from "@/components/ui/crest";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";
import type { PlayerRow } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export default async function PublicStatsPage({
  params,
}: {
  params: Promise<{ tournamentSlug: string }>;
}) {
  const { tournamentSlug } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, slug, yellow_cards_for_suspension")
    .eq("slug", tournamentSlug)
    .maybeSingle();

  if (!tournament) notFound();

  const [{ data: teams }, { data: matches }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, short_name, logo_url, home_kit_color")
      .eq("tournament_id", tournament.id)
      .eq("registration_status", "APPROVED"),
    supabase.from("matches").select("*").eq("tournament_id", tournament.id),
  ]);

  const teamRows = teams ?? [];
  const teamById = new Map(teamRows.map((team) => [team.id, team]));
  const teamIds = teamRows.map((team) => team.id);
  const fixtures = matches ?? [];

  const { data: players } = teamIds.length
    ? await supabase
        .from("players")
        .select("*")
        .in("team_id", teamIds)
        .order("goals_count", { ascending: false })
    : { data: [] };

  const squad: PlayerRow[] = players ?? [];
  const completed = fixtures.filter((match) => match.status === "COMPLETED");
  const goals = completed.reduce((sum, match) => sum + match.home_score + match.away_score, 0);
  const cards = squad.reduce(
    (sum, player) => sum + player.yellow_cards_accumulated + player.red_cards_accumulated,
    0,
  );

  const mvpCounts = new Map<string, number>();
  for (const match of completed) {
    if (!match.mvp_player_id) continue;
    mvpCounts.set(match.mvp_player_id, (mvpCounts.get(match.mvp_player_id) ?? 0) + 1);
  }

  const scorerBoard = squad
    .filter((player) => player.goals_count > 0)
    .sort(
      (a, b) =>
        b.goals_count - a.goals_count ||
        b.assists_count - a.assists_count ||
        a.jersey_number - b.jersey_number,
    )
    .slice(0, 12);

  const assistBoard = squad
    .filter((player) => player.assists_count > 0)
    .sort(
      (a, b) =>
        b.assists_count - a.assists_count ||
        b.goals_count - a.goals_count ||
        a.jersey_number - b.jersey_number,
    )
    .slice(0, 12);

  const disciplineBoard = [...squad]
    .filter((player) => player.yellow_cards_accumulated + player.red_cards_accumulated > 0)
    .sort(
      (a, b) =>
        b.red_cards_accumulated - a.red_cards_accumulated ||
        b.yellow_cards_accumulated - a.yellow_cards_accumulated,
    )
    .slice(0, 10);

  const mvpBoard = [...mvpCounts.entries()]
    .map(([playerId, count]) => ({
      player: squad.find((player) => player.id === playerId) ?? null,
      count,
    }))
    .filter((entry): entry is { player: PlayerRow; count: number } => Boolean(entry.player))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  function labelFor(player: PlayerRow): string {
    return teamById.get(player.team_id)?.short_name ?? "Team";
  }

  return (
    <div className="container py-8">
      <BackLink href={`/${tournament.slug}`} label="Back to tournament" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Player statistics
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            The numbers behind the noise
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Goals, assists, cards and player-of-the-match awards, straight from the referee
            console.
          </p>
        </div>
        <Badge variant="neutral">{squad.length} players tracked</Badge>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Goals scored"
          value={goals}
          hint={`${completed.length} matches completed`}
          icon={<Flame className="h-5 w-5" />}
        />
        <StatCard
          label="Goals per match"
          value={completed.length ? (goals / completed.length).toFixed(2) : "0.00"}
          hint="Across all signed-off fixtures"
          icon={<BarChart3 className="h-5 w-5" />}
          tone="secondary"
        />
        <StatCard
          label="Cards shown"
          value={cards}
          hint={`${squad.filter((player) => player.is_suspended).length} players suspended`}
          icon={<ShieldAlert className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          label="MVPs awarded"
          value={Array.from(mvpCounts.values()).reduce((sum, count) => sum + count, 0)}
          hint={`${mvpCounts.size} different players`}
          icon={<Star className="h-5 w-5" />}
          tone="rose"
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-amber-500" /> Golden boot
            </CardTitle>
            <Badge variant="neutral">top {scorerBoard.length}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {scorerBoard.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                Goals appear here as soon as the referee logs them.
              </p>
            ) : (
              <div className="divide-y">
                {scorerBoard.map((player, index) => {
                  const team = teamById.get(player.team_id);
                  return (
                    <Link
                      key={player.id}
                      href={`/${tournament.slug}/teams/${player.team_id}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                          index === 0
                            ? "bg-amber-400 text-amber-950"
                            : index === 1
                              ? "bg-slate-300 text-slate-800"
                              : index === 2
                                ? "bg-orange-300 text-orange-950"
                                : "bg-muted text-muted-foreground",
                        )}
                      >
                        {index + 1}
                      </span>
                      <Crest
                        name={team?.name ?? "Team"}
                        logoUrl={team?.logo_url}
                        color={team?.home_kit_color ?? "#94A3B8"}
                        size="sm"
                        className="h-6 w-6 rounded text-[9px]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{player.full_name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {labelFor(player)} · #{player.jersey_number} · {player.position}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-base font-bold tabular-nums">
                          {player.goals_count}
                        </p>
                        <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                          goals
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Handshake className="h-4 w-4 text-secondary" /> Assists
              </CardTitle>
              <Badge variant="neutral">{assistBoard.length}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              {assistBoard.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No assists recorded yet.
                </p>
              ) : (
                <div className="divide-y">
                  {assistBoard.slice(0, 8).map((player, index) => (
                    <div key={player.id} className="flex items-center gap-2.5 px-4 py-2">
                      <span className="w-4 text-center text-[10px] font-semibold text-muted-foreground">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{player.full_name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {labelFor(player)} · #{player.jersey_number}
                        </p>
                      </div>
                      <span className="font-display text-sm font-bold tabular-nums">
                        {player.assists_count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Star className="h-4 w-4 text-amber-500" /> Players of the match
              </CardTitle>
              <Badge variant="neutral">{mvpBoard.length}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              {mvpBoard.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                  MVPs are chosen by the referee at full time.
                </p>
              ) : (
                <div className="divide-y">
                  {mvpBoard.map((entry, index) => {
                    const team = teamById.get(entry.player.team_id);
                    return (
                      <div key={entry.player.id} className="flex items-center gap-2.5 px-4 py-2">
                        <span className="w-4 text-center text-[10px] font-semibold text-muted-foreground">
                          {index + 1}
                        </span>
                        <Crest
                          name={team?.name ?? "Team"}
                          logoUrl={team?.logo_url}
                          color={team?.home_kit_color ?? "#94A3B8"}
                          size="sm"
                          className="h-5 w-5 rounded text-[8px]"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold">
                            {entry.player.full_name}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {team?.short_name ?? "Team"}
                          </p>
                        </div>
                        <span className="font-display text-sm font-bold tabular-nums">
                          ×{entry.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-rose-500" /> Discipline
          </CardTitle>
          <span className="text-[11px] text-muted-foreground">
            {tournament.yellow_cards_for_suspension} yellow cards or a red card triggers an
            automatic ban
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {disciplineBoard.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              A clean tournament so far — no cards recorded.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5">Player</th>
                    <th className="px-3 py-2.5">Team</th>
                    <th className="w-16 px-3 py-2.5 text-center">Yellow</th>
                    <th className="w-16 px-3 py-2.5 text-center">Red</th>
                    <th className="w-24 px-4 py-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {disciplineBoard.map((player) => (
                    <tr key={player.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="font-semibold">{player.full_name}</span>
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          #{player.jersey_number}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {labelFor(player)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">
                          <span className="h-2 w-1.5 rounded-sm bg-amber-500" />
                          {player.yellow_cards_accumulated}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-800">
                          <span className="h-2 w-1.5 rounded-sm bg-rose-500" />
                          {player.red_cards_accumulated}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {player.is_suspended ? (
                          <Badge variant="danger">suspended</Badge>
                        ) : (
                          <Badge variant="neutral">available</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
