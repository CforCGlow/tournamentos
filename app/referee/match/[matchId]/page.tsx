import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Flag,
  Info,
  MapPin,
  Printer,
  Radio,
  UserCog,
} from "lucide-react";
import { requireMatchContext } from "@/lib/auth";
import { FlashMessage } from "@/components/layout/flash-message";
import {
  LiveConsole,
  type ConsoleEvent,
  type ConsolePlayer,
  type ConsoleTeam,
} from "@/components/referee/live-console";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MatchStatusBadge } from "@/components/ui/status-badge";
import { getMatchClock } from "@/lib/match-clock";
import { formatDate, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const EMPTY_TEAM: ConsoleTeam = {
  id: "00000000-0000-0000-0000-000000000000",
  name: "TBD",
  short_name: "TBD",
  home_kit_color: "#94A3B8",
};

export default async function MatchConsolePage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ flash?: string; error?: string }>;
}) {
  const { matchId } = await params;
  const query = await searchParams;
  const ctx = await requireMatchContext(matchId);
  const { match } = ctx;

  const teamIds = [match.home_team_id, match.away_team_id].filter(
    (id): id is string => Boolean(id),
  );

  const [tournamentResult, stageResult, teamsResult, playersResult, lineupsResult, eventsResult] =
    await Promise.all([
      ctx.supabase
        .from("tournaments")
        .select("id, name, slug")
        .eq("id", match.tournament_id)
        .maybeSingle(),
      ctx.supabase.from("stages").select("stage_type").eq("id", match.stage_id).maybeSingle(),
      teamIds.length
        ? ctx.supabase
            .from("teams")
            .select("id, name, short_name, logo_url, home_kit_color")
            .in("id", teamIds)
        : Promise.resolve({ data: [] }),
      teamIds.length
        ? ctx.supabase
            .from("players")
            .select("id, team_id, full_name, jersey_number, position, photo_url")
            .in("team_id", teamIds)
            .order("jersey_number")
        : Promise.resolve({ data: [] }),
      ctx.supabase
        .from("match_lineups")
        .select("player_id, team_id, is_starting")
        .eq("match_id", matchId),
      ctx.supabase
        .from("match_events")
        .select("*")
        .eq("match_id", matchId)
        .order("minute"),
    ]);

  const tournament = tournamentResult.data;
  const stageType = stageResult.data?.stage_type ?? null;
  const teams = teamsResult.data ?? [];
  const squad = playersResult.data ?? [];
  const lineupRows = lineupsResult.data ?? [];
  const rawEvents = eventsResult.data ?? [];

  const venueResult = match.venue_id
    ? await ctx.supabase.from("venues").select("name, address").eq("id", match.venue_id).maybeSingle()
    : { data: null };
  const venue = venueResult.data;

  const teamById = new Map(teams.map((team) => [team.id, team]));
  const startingIds = new Set(
    lineupRows.filter((row) => row.is_starting).map((row) => row.player_id),
  );
  const benchIds = new Set(
    lineupRows.filter((row) => !row.is_starting).map((row) => row.player_id),
  );

  const consolePlayers: ConsolePlayer[] = squad.map((player) => ({
    id: player.id,
    team_id: player.team_id,
    full_name: player.full_name,
    jersey_number: player.jersey_number,
    position: player.position,
    is_starting: startingIds.has(player.id),
    is_bench: benchIds.has(player.id),
  }));

  const eventPlayerIds = Array.from(
    new Set(
      rawEvents
        .flatMap((event) => [event.player_id, event.secondary_player_id])
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const { data: eventPlayers } = eventPlayerIds.length
    ? await ctx.supabase
        .from("players")
        .select("id, full_name")
        .in("id", eventPlayerIds)
    : { data: [] };
  const eventPlayerById = new Map((eventPlayers ?? []).map((player) => [player.id, player.full_name]));

  const consoleEvents: ConsoleEvent[] = rawEvents.map((event) => ({
    id: event.id,
    team_id: event.team_id,
    player_id: event.player_id,
    player_name: event.player_id ? eventPlayerById.get(event.player_id) ?? null : null,
    secondary_name: event.secondary_player_id
      ? eventPlayerById.get(event.secondary_player_id) ?? null
      : null,
    event_type: event.event_type,
    minute: event.minute,
    extra_minute: event.extra_minute,
  }));

  const homeTeam: ConsoleTeam =
    (match.home_team_id ? teamById.get(match.home_team_id) : null) ?? EMPTY_TEAM;
  const awayTeam: ConsoleTeam =
    (match.away_team_id ? teamById.get(match.away_team_id) : null) ?? EMPTY_TEAM;

  const canScore = match.referee_id === ctx.profile.id || ctx.isAdmin;
  const homeLineup = lineupRows.filter((row) => row.team_id === match.home_team_id);
  const awayLineup = lineupRows.filter((row) => row.team_id === match.away_team_id);

  const clock = await getMatchClock(match.id);
  const initialClock = clock && clock.status === match.status ? clock : null;

  return (
    <div>
      <FlashMessage flash={query.flash} error={query.error} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/referee">
            <ArrowLeft className="h-3.5 w-3.5" /> My matches
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-1.5">
          {ctx.isAdmin && match.referee_id !== ctx.profile.id ? (
            <Badge variant="purple">
              <UserCog className="h-3 w-3" /> organiser view
            </Badge>
          ) : (
            <Badge variant="neutral">
              <Flag className="h-3 w-3" /> {ctx.refereeName ?? "match official"}
            </Badge>
          )}
          <MatchStatusBadge status={match.status} />
          <Button asChild size="sm" variant="outline" className="h-7 gap-1 px-2">
            <Link href={`/print/match/${match.id}`} target="_blank">
              <Printer className="h-3.5 w-3.5" /> Sheet
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          {tournament?.name ?? "Tournament"} · {match.round_name} · #{match.match_number}
        </p>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-2xl font-semibold tracking-tight">
          {homeTeam.name} <span className="text-muted-foreground">vs</span> {awayTeam.name}
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
          {tournament ? (
            <Link
              href={`/${tournament.slug}/matches/${match.id}`}
              className="font-semibold text-primary hover:underline"
            >
              Public match centre
            </Link>
          ) : null}
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <div>
          <LiveConsole
            matchId={match.id}
            status={match.status}
            home={homeTeam}
            away={awayTeam}
            homeScore={match.home_score}
            awayScore={match.away_score}
            homePenalties={match.home_penalties}
            awayPenalties={match.away_penalties}
            stageType={stageType}
            players={consolePlayers}
            events={consoleEvents}
            mvpPlayerId={match.mvp_player_id}
            initialClock={initialClock}
            canScore={canScore}
            canManage={canScore}
          />

          <p className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The clock is controlled by the organiser and shared with every public page. Add
            stoppage time before logging an event. Every event immediately updates the score,
            player stats and the public live ticker.
          </p>
        </div>

        <div className="space-y-5">
          {[
            { team: homeTeam, label: "Home", rows: homeLineup },
            { team: awayTeam, label: "Away", rows: awayLineup },
          ].map((side) => {
            const starters = consolePlayers
              .filter((player) => player.team_id === side.team.id && player.is_starting)
              .sort((a, b) => a.jersey_number - b.jersey_number);
            const bench = consolePlayers
              .filter((player) => player.team_id === side.team.id && player.is_bench)
              .sort((a, b) => a.jersey_number - b.jersey_number);

            return (
              <Card key={side.label}>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ClipboardList className="h-4 w-4 text-secondary" /> {side.team.short_name}{" "}
                    lineup
                  </CardTitle>
                  <Badge variant={starters.length === 11 ? "success" : "warning"}>
                    {starters.length}/11
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {side.rows.length === 0 ? (
                    <p className="text-muted-foreground">
                      No lineup submitted. Log events without a player or ask the manager to name
                      the XI.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                        {starters.map((player) => (
                          <div key={player.id} className="flex items-center gap-1.5">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-900 text-[9px] font-bold text-white">
                              {player.jersey_number}
                            </span>
                            <span className="truncate">{player.full_name}</span>
                          </div>
                        ))}
                      </div>
                      {bench.length > 0 ? (
                        <div className="border-t pt-2">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Substitutes
                          </p>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                            {bench.map((player) => (
                              <div key={player.id} className="flex items-center gap-1.5">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-200 text-[9px] font-bold text-slate-700">
                                  {player.jersey_number}
                                </span>
                                <span className="truncate text-muted-foreground">
                                  {player.full_name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}

          <Card>
            <CardContent className="flex items-start gap-2.5 p-4 text-[11px] text-muted-foreground">
              <Radio className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p>
                Everything is stored instantly — if the connection drops, reload this page and
                the timeline, score and clock pick up where you left off.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
