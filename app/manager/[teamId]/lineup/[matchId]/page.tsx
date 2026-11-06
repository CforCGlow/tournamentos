import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ClipboardCheck,
  Lock,
  MapPin,
  Swords,
  Trash2,
  UserX,
} from "lucide-react";
import { requireTeamContext } from "@/lib/auth";
import { clearLineupAction } from "@/app/actions/lineups";
import { FlashMessage } from "@/components/layout/flash-message";
import { PitchLineupBuilder, type SquadPlayer } from "@/components/manager/pitch-lineup-builder";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crest } from "@/components/ui/crest";
import { EmptyState } from "@/components/ui/empty-state";
import { MatchStatusBadge } from "@/components/ui/status-badge";
import { FORMATION_LAYOUTS, PITCH_FORMATIONS, type Formation } from "@/lib/constants";
import { formatDate, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DEFAULT_FORMATION: Formation = "4-3-3";

function detectFormation(labels: string[]): Formation {
  const sorted = [...labels].sort().join("|");
  for (const formation of PITCH_FORMATIONS) {
    const layout = FORMATION_LAYOUTS[formation].map((slot) => slot.slot);
    if (layout.length !== labels.length) continue;
    if ([...layout].sort().join("|") === sorted) return formation;
  }
  return DEFAULT_FORMATION;
}

export default async function LineupPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string; matchId: string }>;
  searchParams: Promise<{ flash?: string; error?: string }>;
}) {
  const { teamId, matchId } = await params;
  const query = await searchParams;
  const ctx = await requireTeamContext(teamId);
  const { team } = ctx;

  const { data: match } = await ctx.supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) redirect(`/manager/${teamId}?error=${encodeURIComponent("Match not found.")}`);
  if (match.home_team_id !== teamId && match.away_team_id !== teamId) {
    redirect(
      `/manager/${teamId}?error=${encodeURIComponent("This team is not playing in that match.")}`,
    );
  }

  const [tournamentResult, squadResult, lineupResult] = await Promise.all([
    ctx.supabase.from("tournaments").select("*").eq("id", match.tournament_id).maybeSingle(),
    ctx.supabase.from("players").select("*").eq("team_id", teamId).order("jersey_number"),
    ctx.supabase.from("match_lineups").select("*").eq("match_id", matchId).eq("team_id", teamId),
  ]);

  const tournament = tournamentResult.data;
  const squad = squadResult.data ?? [];
  const lineupRows = lineupResult.data ?? [];

  const opponentId =
    match.home_team_id === teamId ? match.away_team_id : match.home_team_id;

  const [opponentResult, venueResult] = await Promise.all([
    opponentId
      ? ctx.supabase
          .from("teams")
          .select("id, name, short_name, logo_url, home_kit_color")
          .eq("id", opponentId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    match.venue_id
      ? ctx.supabase.from("venues").select("id, name, address").eq("id", match.venue_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const opponent = opponentResult.data;
  const venue = venueResult.data;

  const starters = lineupRows.filter((row) => row.is_starting);
  const benchRows = lineupRows.filter((row) => !row.is_starting);
  const formation = starters.length
    ? detectFormation(starters.map((row) => row.formation_position ?? ""))
    : DEFAULT_FORMATION;

  const usedRows = new Set<number>();
  const assignments: Array<string | null> = FORMATION_LAYOUTS[formation].map((slot) => {
    const index = starters.findIndex(
      (row, rowIndex) => !usedRows.has(rowIndex) && row.formation_position === slot.slot,
    );
    if (index >= 0) {
      usedRows.add(index);
      return starters[index]?.player_id ?? null;
    }
    return null;
  });

  // Recovered rows without a recognised slot label fall back to squad order.
  const unplaced = starters
    .map((row, index) => ({ row, index }))
    .filter((entry) => !usedRows.has(entry.index));
  for (const entry of unplaced) {
    const emptyIndex = assignments.findIndex((value) => value === null);
    if (emptyIndex === -1) break;
    assignments[emptyIndex] = entry.row.player_id;
  }

  const squadPlayers: SquadPlayer[] = squad.map((player) => ({
    id: player.id,
    full_name: player.full_name,
    jersey_number: player.jersey_number,
    position: player.position,
    is_suspended: player.is_suspended,
    is_captain: player.is_captain,
    photo_url: player.photo_url,
  }));

  const isHome = match.home_team_id === teamId;
  const suspended = squad.filter((player) => player.is_suspended);
  const unavailableWithoutId = squad.filter(
    (player) => !player.id_document_url && !player.is_verified,
  );
  const lineupSaved = lineupRows.length > 0;
  const locked = match.status !== "SCHEDULED";

  return (
    <div>
      <FlashMessage flash={query.flash} error={query.error} />

      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`/manager/${teamId}`}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to squad
        </Link>
      </Button>

      <Card className="mb-5">
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <Crest
            name={team.name}
            logoUrl={team.logo_url}
            color={team.home_kit_color}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {tournament?.name ?? "Tournament"} · {match.round_name} ·{" "}
              {isHome ? "home" : "away"}
              {lineupSaved ? (
                <Badge variant="success">
                  <ClipboardCheck className="h-3 w-3" /> lineup saved
                </Badge>
              ) : (
                <Badge variant="warning">lineup not submitted</Badge>
              )}
              {locked ? (
                <Badge variant="neutral">
                  <Lock className="h-3 w-3" /> locked
                </Badge>
              ) : null}
            </p>
            <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-xl font-semibold tracking-tight">
              {team.name}
              <Swords className="h-4 w-4 text-muted-foreground" />
              {opponent?.name ?? "TBD"}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatDate(match.kickoff_time)} · {formatTime(match.kickoff_time)}
              </span>
              {venue ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {venue.name}
                  {venue.address ? ` · ${venue.address}` : ""}
                </span>
              ) : null}
              <MatchStatusBadge status={match.status} />
            </p>
          </div>

          {lineupSaved && !locked ? (
            <form action={clearLineupAction}>
              <input type="hidden" name="team_id" value={teamId} />
              <input type="hidden" name="match_id" value={match.id} />
              <Button type="submit" size="sm" variant="outline">
                <Trash2 className="h-3.5 w-3.5" /> Clear lineup
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {locked ? (
        <Alert tone="warning" title="Lineup locked" className="mb-5">
          The match is {match.status === "COMPLETED" ? "finished" : "underway"}, so the submitted
          sheet can no longer be edited. Contact the organiser if a correction is needed.
        </Alert>
      ) : null}

      {suspended.length > 0 ? (
        <Alert tone="error" title="Unavailable players" className="mb-5">
          <span className="flex flex-wrap gap-1.5">
            {suspended.map((player) => (
              <span key={player.id} className="inline-flex items-center gap-1">
                <UserX className="h-3 w-3" />#{player.jersey_number} {player.full_name}
              </span>
            ))}
          </span>
          <span className="mt-1 block">
            These players picked up a suspension after their last cards and cannot be selected
            until it is served.
          </span>
        </Alert>
      ) : null}

      {squad.length < 11 ? (
        <Card>
          <CardContent className="p-5">
            <EmptyState
              icon={<AlertTriangle className="h-5 w-5" />}
              title="Not enough players"
              description={`You need at least 11 players to name a starting XI. The squad currently has ${squad.length}.`}
              action={
                <Button asChild size="sm">
                  <Link href={`/manager/${teamId}`}>Build the squad</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Starting XI &amp; substitutes</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Tap a shirt to pick a player. Only players from your registered squad are
                available.
              </p>
            </div>
            {unavailableWithoutId.length > 0 ? (
              <Badge variant="warning">
                {unavailableWithoutId.length} player
                {unavailableWithoutId.length === 1 ? "" : "s"} without ID
              </Badge>
            ) : null}
          </CardHeader>
          <CardContent>
            <PitchLineupBuilder
              teamId={teamId}
              matchId={match.id}
              squad={squadPlayers}
              initialFormation={formation}
              initialAssignments={assignments}
              initialBench={benchRows.map((row) => row.player_id)}
              locked={locked}
            />
          </CardContent>
        </Card>
      )}

      <p className="mt-4 text-[11px] text-muted-foreground">
        Submitting replaces your previous sheet for this fixture. {benchRows.length > 0
          ? `${benchRows.length} substitute${benchRows.length === 1 ? "" : "s"} saved.`
          : "No substitutes saved yet."}
      </p>
    </div>
  );
}
