import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/layout/back-link";
import { Crown, GitBranch, Info, Trophy } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Crest } from "@/components/ui/crest";
import { EmptyState } from "@/components/ui/empty-state";
import { MatchStatusBadge } from "@/components/ui/status-badge";
import { cn, formatDate, formatTime } from "@/lib/utils";
import type { MatchRow } from "@/lib/database.types";

export const dynamic = "force-dynamic";

function winnerId(match: MatchRow): string | null {
  if (match.status !== "COMPLETED") return null;
  if (match.home_penalties !== null && match.away_penalties !== null) {
    if (match.home_penalties > match.away_penalties) return match.home_team_id;
    if (match.away_penalties > match.home_penalties) return match.away_team_id;
  }
  if (match.home_score > match.away_score) return match.home_team_id;
  if (match.away_score > match.home_score) return match.away_team_id;
  return null;
}

export default async function PublicBracketPage({
  params,
}: {
  params: Promise<{ tournamentSlug: string }>;
}) {
  const { tournamentSlug } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, slug, format")
    .eq("slug", tournamentSlug)
    .maybeSingle();

  if (!tournament) notFound();

  const [{ data: stages }, { data: matches }, { data: teams }, { data: venues }] = await Promise.all([
    supabase
      .from("stages")
      .select("id, name, stage_type, sequence_order, qualifiers_count")
      .eq("tournament_id", tournament.id)
      .order("sequence_order"),
    supabase
      .from("matches")
      .select("*")
      .eq("tournament_id", tournament.id)
      .order("match_number"),
    supabase
      .from("teams")
      .select("id, name, short_name, logo_url, home_kit_color")
      .eq("tournament_id", tournament.id),
    supabase.from("venues").select("id, name").eq("tournament_id", tournament.id),
  ]);

  const teamById = new Map((teams ?? []).map((team) => [team.id, team]));
  const venueById = new Map((venues ?? []).map((venue) => [venue.id, venue.name]));
  const knockoutStages = (stages ?? []).filter((stage) => stage.stage_type === "KNOCKOUT");
  const knockoutIds = new Set(knockoutStages.map((stage) => stage.id));
  const knockoutMatches = (matches ?? []).filter(
    (match) => knockoutIds.has(match.stage_id),
  );

  const rounds: Array<{ name: string; matches: MatchRow[] }> = [];
  for (const match of knockoutMatches) {
    const existing = rounds.find((round) => round.name === match.round_name);
    if (existing) existing.matches.push(match);
    else rounds.push({ name: match.round_name, matches: [match] });
  }

  for (const stage of knockoutStages) {
    const stageMatches = knockoutMatches.filter((match) => match.stage_id === stage.id);
    const firstRoundName = stageMatches[0]?.round_name;
    if (firstRoundName && !rounds.some((round) => round.name === firstRoundName)) {
      rounds.push({ name: firstRoundName, matches: stageMatches });
    }
  }

  const finalRound = rounds[rounds.length - 1];
  const finalMatch = finalRound?.matches[finalRound.matches.length - 1];
  const championId = finalMatch ? winnerId(finalMatch) : null;
  const champion = championId ? teamById.get(championId) : null;

  return (
    <div className="container py-8">
      <BackLink href={`/${tournament.slug}`} label="Back to tournament" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Road to the final
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            Knockout bracket
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Winners advance automatically as results are signed off. Ties level after extra time
            are settled on penalties.
          </p>
        </div>
        <Badge variant={champion ? "gold" : "neutral"} className="gap-1.5">
          <Trophy className="h-3 w-3" />
          {champion ? `Champions: ${champion.short_name}` : "In progress"}
        </Badge>
      </div>

      {knockoutMatches.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="p-5">
            <EmptyState
              icon={<GitBranch className="h-5 w-5" />}
              title="Bracket not published"
              description={
                tournament.format === "LEAGUE"
                  ? "This is a league competition — the title is decided on the table rather than a knockout bracket."
                  : "The organiser generates the bracket once the group stage is complete. It will appear here with live scores."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 overflow-x-auto pb-2">
          <div className="flex min-w-max items-stretch gap-4">
            {rounds.map((round, roundIndex) => (
              <div key={round.name} className="flex w-[264px] flex-col">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold uppercase tracking-wide">
                    {round.name}
                  </h2>
                  <Badge variant="neutral">{round.matches.length}</Badge>
                </div>

                <div className="flex flex-1 flex-col justify-around gap-3">
                  {round.matches.map((match) => {
                    const home = match.home_team_id ? teamById.get(match.home_team_id) : null;
                    const away = match.away_team_id ? teamById.get(match.away_team_id) : null;
                    const winner = winnerId(match);
                    const venue = match.venue_id ? venueById.get(match.venue_id) : null;
                    const hasPenalties =
                      match.home_penalties !== null && match.away_penalties !== null;

                    return (
                      <Link
                        key={match.id}
                        href={`/${tournament.slug}/matches/${match.id}`}
                        className={cn(
                          "block rounded-lg border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                          roundIndex === rounds.length - 1 && "border-amber-300",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <span>#{match.match_number}</span>
                          <MatchStatusBadge status={match.status} />
                        </div>

                        {[
                          { team: home, score: match.home_score, penalties: match.home_penalties, slot: "Home" },
                          { team: away, score: match.away_score, penalties: match.away_penalties, slot: "Away" },
                        ].map((side, sideIndex) => {
                          const isWinner = Boolean(winner && side.team && winner === side.team.id);
                          return (
                            <div
                              key={`${match.id}-${sideIndex}`}
                              className={cn(
                                "mt-1.5 flex items-center gap-2 rounded px-1 py-0.5",
                                isWinner && "bg-emerald-50",
                              )}
                            >
                              <Crest
                                name={side.team?.name ?? "TBD"}
                                logoUrl={side.team?.logo_url}
                                color={side.team?.home_kit_color ?? "#94A3B8"}
                                size="sm"
                                className="h-5 w-5 rounded text-[8px]"
                              />
                              <span
                                className={cn(
                                  "min-w-0 flex-1 truncate text-xs",
                                  isWinner ? "font-bold" : "font-medium",
                                  !side.team && "text-muted-foreground",
                                )}
                              >
                                {side.team?.name ?? side.slot}
                              </span>
                              <span className="shrink-0 font-display text-xs font-bold tabular-nums">
                                {match.status === "SCHEDULED" || match.status === "POSTPONED"
                                  ? "–"
                                  : side.score}
                                {hasPenalties && side.penalties !== null ? (
                                  <span className="ml-0.5 text-[9px] font-normal text-muted-foreground">
                                    ({side.penalties})
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          );
                        })}

                        <p className="mt-2 truncate border-t pt-1.5 text-[9px] text-muted-foreground">
                          {formatDate(match.kickoff_time)} · {formatTime(match.kickoff_time)}
                          {venue ? ` · ${venue}` : ""}
                        </p>
                      </Link>
                    );
                  })}
                </div>

                {roundIndex < rounds.length - 1 ? (
                  <p className="mt-3 text-center text-[9px] uppercase tracking-wide text-muted-foreground">
                    winners advance →
                  </p>
                ) : null}
              </div>
            ))}

            <div className="flex w-[220px] flex-col">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-amber-700">
                  Champions
                </h2>
                <Crown className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <div className="flex flex-1 items-center">
                <div
                  className={cn(
                    "w-full rounded-xl border-2 p-4 text-center",
                    champion
                      ? "border-amber-300 bg-gradient-to-b from-amber-50 to-card"
                      : "border-dashed",
                  )}
                >
                  {champion ? (
                    <>
                      <Crest
                        name={champion.name}
                        logoUrl={champion.logo_url}
                        color={champion.home_kit_color}
                        size="lg"
                        className="mx-auto"
                      />
                      <p className="mt-2 font-display text-base font-semibold leading-tight">
                        {champion.name}
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        Tournament winners
                      </p>
                    </>
                  ) : (
                    <>
                      <Trophy className="mx-auto h-8 w-8 text-muted-foreground/40" />
                      <p className="mt-2 text-xs text-muted-foreground">
                        The trophy is decided when the final is signed off.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="mt-5 flex items-start gap-2 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        The winner moves into the next round automatically as soon as the referee confirms full
        time, so the bracket is always up to date.
      </p>
    </div>
  );
}
