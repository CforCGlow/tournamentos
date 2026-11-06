import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Crown,
  MapPin,
  ShieldAlert,
  Shirt,
  UserCheck,
  Users,
} from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crest } from "@/components/ui/crest";
import { EmptyState } from "@/components/ui/empty-state";
import { MatchStatusBadge } from "@/components/ui/status-badge";
import { POSITION_LABEL } from "@/lib/constants";
import { cn, formatDate, formatTime } from "@/lib/utils";
import type { Position } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const POSITION_TONE: Record<Position, string> = {
  GK: "bg-amber-100 text-amber-800",
  DEF: "bg-sky-100 text-sky-800",
  MID: "bg-emerald-100 text-emerald-800",
  FWD: "bg-rose-100 text-rose-800",
};

export default async function PublicTeamPage({
  params,
}: {
  params: Promise<{ tournamentSlug: string; teamId: string }>;
}) {
  const { tournamentSlug, teamId } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, slug")
    .eq("slug", tournamentSlug)
    .maybeSingle();

  if (!tournament) notFound();

  const { data: team } = await supabase
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .eq("tournament_id", tournament.id)
    .eq("registration_status", "APPROVED")
    .maybeSingle();

  if (!team) notFound();

  const [{ data: players }, { data: fixtures }, { data: standings }, { data: stages }] =
    await Promise.all([
      supabase.from("players").select("*").eq("team_id", team.id).order("jersey_number"),
      supabase
        .from("matches")
        .select("*")
        .eq("tournament_id", tournament.id)
        .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
        .order("kickoff_time"),
      supabase.from("standings").select("*").eq("tournament_id", tournament.id),
      supabase
        .from("stages")
        .select("id, name, stage_type")
        .eq("tournament_id", tournament.id)
        .order("sequence_order"),
    ]);

  const squad = players ?? [];
  const teamFixtures = fixtures ?? [];
  const stageById = new Map((stages ?? []).map((stage) => [stage.id, stage]));
  const stage = team.stage_id ? stageById.get(team.stage_id) ?? null : null;

  const stageTable = (standings ?? [])
    .filter((row) => row.stage_id === team.stage_id)
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goal_difference - a.goal_difference ||
        b.goals_for - a.goals_for,
    );
  const position = stageTable.findIndex((row) => row.team_id === team.id) + 1;
  const record = stageTable.find((row) => row.team_id === team.id) ?? null;

  const opponentIds = Array.from(
    new Set(
      teamFixtures
        .flatMap((match) =>
          match.home_team_id === team.id ? [match.away_team_id] : [match.home_team_id],
        )
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const venueIds = Array.from(
    new Set(teamFixtures.map((match) => match.venue_id).filter((id): id is string => Boolean(id))),
  );

  const [{ data: opponents }, { data: venues }, { data: manager }] = await Promise.all([
    opponentIds.length
      ? supabase
          .from("teams")
          .select("id, name, short_name, logo_url, home_kit_color")
          .in("id", opponentIds)
      : Promise.resolve({ data: [] }),
    venueIds.length
      ? supabase.from("venues").select("id, name").in("id", venueIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("public_profiles")
      .select("full_name")
      .eq("id", team.manager_id)
      .maybeSingle(),
  ]);

  const opponentById = new Map((opponents ?? []).map((opponent) => [opponent.id, opponent]));
  const venueById = new Map((venues ?? []).map((venue) => [venue.id, venue.name]));

  const completed = teamFixtures.filter((match) => match.status === "COMPLETED");
  const upcoming = teamFixtures.filter(
    (match) => match.status === "SCHEDULED" || match.status === "POSTPONED",
  );
  const scored = completed.reduce(
    (sum, match) => sum + (match.home_team_id === team.id ? match.home_score : match.away_score),
    0,
  );
  const conceded = completed.reduce(
    (sum, match) => sum + (match.home_team_id === team.id ? match.away_score : match.home_score),
    0,
  );

  const topScorer = squad.reduce<null | (typeof squad)[number]>((best, player) => {
    if (!best) return player.goals_count > 0 ? player : best;
    return player.goals_count > best.goals_count ? player : best;
  }, null);

  return (
    <div>
      <div
        className="relative overflow-hidden text-white"
        style={{
          background: `linear-gradient(135deg, ${team.home_kit_color} 0%, #0f172a 78%)`,
        }}
      >
        <div className="absolute inset-0 pitch-stripes opacity-20" aria-hidden />
        <div className="container relative py-10">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 mb-4 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <Link href={`/${tournament.slug}/teams`}>
              <ArrowLeft className="h-3.5 w-3.5" /> All teams
            </Link>
          </Button>

          <div className="flex flex-wrap items-end gap-5">
            <div className="rounded-2xl bg-white/10 p-2 backdrop-blur">
              <Crest name={team.name} logoUrl={team.logo_url} color={team.home_kit_color} size="lg" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                {tournament.name}
                {stage ? ` · ${stage.name}` : ""}
              </p>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                {team.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="dark">{team.short_name}</Badge>
                {position > 0 ? (
                  <Badge variant="gold">
                    <Crown className="h-3 w-3" /> {position}
                    {position === 1 ? "st" : position === 2 ? "nd" : position === 3 ? "rd" : "th"}{" "}
                    in table
                  </Badge>
                ) : null}
                <Badge variant="dark">
                  <Users className="h-3 w-3" /> {squad.length} players
                </Badge>
                {squad.some((player) => player.is_suspended) ? (
                  <Badge variant="danger">
                    <ShieldAlert className="h-3 w-3" />
                    {squad.filter((player) => player.is_suspended).length} suspended
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 text-center">
              {[
                { label: "Played", value: record?.played ?? completed.length },
                { label: "Scored", value: scored },
                { label: "Conceded", value: conceded },
                { label: "Points", value: record?.points ?? 0 },
              ].map((cell) => (
                <div key={cell.label} className="rounded-lg bg-white/10 px-3 py-2 backdrop-blur">
                  <p className="font-display text-xl font-bold tabular-nums">{cell.value}</p>
                  <p className="text-[9px] uppercase tracking-wide text-white/60">{cell.label}</p>
                </div>
              ))}
            </div>
          </div>

          {record && record.form.length > 0 ? (
            <div className="mt-5 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
                Recent form
              </span>
              <div className="flex gap-1">
                {record.form.slice(-5).map((entry, index) => (
                  <span
                    key={`${entry}-${index}`}
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold",
                      entry === "W"
                        ? "bg-emerald-400 text-emerald-950"
                        : entry === "L"
                          ? "bg-rose-500 text-white"
                          : "bg-white/30 text-white",
                    )}
                  >
                    {entry}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="container grid gap-5 py-8 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shirt className="h-4 w-4 text-primary" /> Squad
              </CardTitle>
              <Badge variant="neutral">{squad.length} registered</Badge>
            </CardHeader>
            <CardContent className="p-0">
              {squad.length === 0 ? (
                <EmptyState
                  icon={<Users className="h-5 w-5" />}
                  title="Squad list not published"
                  description="The manager has not added players yet."
                  className="m-5"
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="w-12 px-3 py-2.5 text-center">#</th>
                        <th className="px-2 py-2.5">Player</th>
                        <th className="px-2 py-2.5">Position</th>
                        <th className="w-12 px-2 py-2.5 text-center">G</th>
                        <th className="w-12 px-2 py-2.5 text-center">A</th>
                        <th className="w-14 px-2 py-2.5 text-center">Cards</th>
                      </tr>
                    </thead>
                    <tbody>
                      {squad.map((player) => (
                        <tr key={player.id} className="border-b last:border-0">
                          <td className="px-3 py-2.5 text-center">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-slate-900 text-[10px] font-bold text-white">
                              {player.jersey_number}
                            </span>
                          </td>
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">{player.full_name}</span>
                              {player.is_captain ? (
                                <span className="rounded bg-amber-100 px-1 text-[9px] font-bold uppercase text-amber-800">
                                  C
                                </span>
                              ) : null}
                              {player.is_suspended ? (
                                <Badge variant="danger">suspended</Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-2 py-2.5">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                                POSITION_TONE[player.position],
                              )}
                              title={POSITION_LABEL[player.position]}
                            >
                              {player.position}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-center font-semibold tabular-nums">
                            {player.goals_count}
                          </td>
                          <td className="px-2 py-2.5 text-center tabular-nums text-muted-foreground">
                            {player.assists_count}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                              <span className="inline-flex items-center gap-0.5">
                                <span className="h-2.5 w-2 rounded-sm bg-amber-400" />
                                {player.yellow_cards_accumulated}
                              </span>
                              <span className="inline-flex items-center gap-0.5">
                                <span className="h-2.5 w-2 rounded-sm bg-rose-500" />
                                {player.red_cards_accumulated}
                              </span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4 text-secondary" /> Fixtures &amp; results
              </CardTitle>
              <Badge variant="neutral">{teamFixtures.length}</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {teamFixtures.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No fixtures scheduled for this team yet.
                </p>
              ) : (
                teamFixtures.map((match) => {
                  const isHome = match.home_team_id === team.id;
                  const opponentId = isHome ? match.away_team_id : match.home_team_id;
                  const opponent = opponentId ? opponentById.get(opponentId) : null;
                  const venue = match.venue_id ? venueById.get(match.venue_id) : null;
                  const scoreFor = isHome ? match.home_score : match.away_score;
                  const scoreAgainst = isHome ? match.away_score : match.home_score;
                  const outcome =
                    match.status === "COMPLETED"
                      ? scoreFor > scoreAgainst
                        ? "W"
                        : scoreFor < scoreAgainst
                          ? "L"
                          : "D"
                      : null;

                  return (
                    <Link
                      key={match.id}
                      href={`/${tournament.slug}/matches/${match.id}`}
                      className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/40"
                    >
                      <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {isHome ? "Home" : "Away"}
                      </span>
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Crest
                          name={opponent?.name ?? "TBD"}
                          logoUrl={opponent?.logo_url}
                          color={opponent?.home_kit_color ?? "#94A3B8"}
                          size="sm"
                          className="h-6 w-6 rounded text-[9px]"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {opponent?.name ?? "To be decided"}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {formatDate(match.kickoff_time)} · {formatTime(match.kickoff_time)}
                            {venue ? ` · ${venue}` : ""}
                          </p>
                        </div>
                      </div>

                      {outcome ? (
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold text-white",
                            outcome === "W"
                              ? "bg-emerald-500"
                              : outcome === "D"
                                ? "bg-slate-400"
                                : "bg-rose-500",
                          )}
                        >
                          {outcome}
                        </span>
                      ) : null}

                      <span className="rounded bg-slate-900 px-2 py-0.5 font-display text-xs font-bold tabular-nums text-white">
                        {match.status === "SCHEDULED" || match.status === "POSTPONED"
                          ? formatTime(match.kickoff_time)
                          : `${scoreFor}–${scoreAgainst}`}
                      </span>

                      <MatchStatusBadge status={match.status} />
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Club details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              {[
                { label: "Team manager", value: manager?.full_name ?? "Not listed" },
                { label: "Stage", value: stage?.name ?? "Not drawn" },
                { label: "Table position", value: position > 0 ? `#${position}` : "—" },
                {
                  label: "Record",
                  value: record
                    ? `${record.won}W ${record.drawn}D ${record.lost}L`
                    : `${completed.length} played`,
                },
                {
                  label: "Goal difference",
                  value: `${scored - conceded > 0 ? "+" : ""}${scored - conceded}`,
                },
                { label: "Matches remaining", value: upcoming.length },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="max-w-[60%] text-right font-medium">{row.value}</span>
                </div>
              ))}

              <div className="border-t pt-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Kit colours
                </p>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-xs">
                    <span
                      className="h-5 w-5 rounded-full border"
                      style={{ backgroundColor: team.home_kit_color }}
                    />
                    Home
                  </span>
                  <span className="flex items-center gap-1.5 text-xs">
                    <span
                      className="h-5 w-5 rounded-full border"
                      style={{ backgroundColor: team.away_kit_color }}
                    />
                    Away
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {topScorer && topScorer.goals_count > 0 ? (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Crown className="h-4 w-4 text-amber-500" /> Top scorer
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 font-display text-sm font-bold text-white">
                  {topScorer.jersey_number}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{topScorer.full_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {topScorer.goals_count} goals · {topScorer.assists_count} assists
                  </p>
                </div>
                <Badge variant="gold">{topScorer.goals_count}G</Badge>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCheck className="h-4 w-4 text-emerald-600" /> Good to know
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[12px] leading-relaxed text-muted-foreground">
              <p>
                Squad numbers, goals and cards are owned by the referee console — the public
                profile cannot drift from the official record.
              </p>
              <p className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {venueIds.length
                  ? `${venueIds.length} venue${venueIds.length === 1 ? "" : "s"} used this season`
                  : "Venues announced with the fixture list"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
