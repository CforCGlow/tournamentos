import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Swords } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { MatchCentre, type CentrePlayer, type CentreTeam } from "@/components/public/match-centre";
import { Button } from "@/components/ui/button";
import { getMatchClock } from "@/lib/match-clock";

export const dynamic = "force-dynamic";

export default async function PublicMatchPage({
  params,
}: {
  params: Promise<{ tournamentSlug: string; matchId: string }>;
}) {
  const { tournamentSlug, matchId } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, slug")
    .eq("slug", tournamentSlug)
    .maybeSingle();

  if (!tournament) notFound();

  const { data: match } = await supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .eq("tournament_id", tournament.id)
    .maybeSingle();

  if (!match) notFound();

  const base = `/${tournament.slug}`;
  const teamIds = [match.home_team_id, match.away_team_id].filter(
    (id): id is string => Boolean(id),
  );

  const [
    { data: teams },
    { data: lineups },
    { data: events },
    { data: venue },
    { data: stage },
    { data: officials },
  ] = await Promise.all([
    teamIds.length
      ? supabase
          .from("teams")
          .select("id, name, short_name, logo_url, home_kit_color")
          .in("id", teamIds)
      : Promise.resolve({ data: [] }),
    supabase.from("match_lineups").select("*").eq("match_id", match.id),
    supabase.from("match_events").select("*").eq("match_id", match.id).order("minute"),
    match.venue_id
      ? supabase.from("venues").select("name").eq("id", match.venue_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("stages").select("name").eq("id", match.stage_id).maybeSingle(),
    supabase
      .from("public_match_officials")
      .select("referee_name")
      .eq("match_id", match.id)
      .maybeSingle(),
  ]);

  const eventRows = events ?? [];
  const lineupRows = lineups ?? [];
  const teamRows = teams ?? [];

  const eventPlayerIds = Array.from(
    new Set(
      eventRows
        .flatMap((event) => [event.player_id, event.secondary_player_id])
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const [{ data: squad }, { data: eventPlayers }] = await Promise.all([
    teamIds.length
      ? supabase
          .from("players")
          .select("id, team_id, full_name, jersey_number, position, photo_url")
          .in("team_id", teamIds)
          .order("jersey_number")
      : Promise.resolve({ data: [] }),
    eventPlayerIds.length
      ? supabase.from("players").select("id, full_name").in("id", eventPlayerIds)
      : Promise.resolve({ data: [] }),
  ]);

  const names: Record<string, string> = {};
  for (const player of eventPlayers ?? []) {
    names[player.id] = player.full_name;
  }

  const starters = new Set(
    lineupRows.filter((row) => row.is_starting).map((row) => row.player_id),
  );
  const bench = new Set(lineupRows.filter((row) => !row.is_starting).map((row) => row.player_id));

  const players: CentrePlayer[] = (squad ?? []).map((player) => ({
    id: player.id,
    team_id: player.team_id,
    full_name: player.full_name,
    jersey_number: player.jersey_number,
    position: player.position,
    is_starting: starters.has(player.id),
    is_bench: bench.has(player.id),
    photo_url: player.photo_url,
  }));

  const toCentreTeam = (teamId: string | null): CentreTeam | null => {
    if (!teamId) return null;
    const team = teamRows.find((entry) => entry.id === teamId);
    if (!team) return null;
    return {
      id: team.id,
      name: team.name,
      short_name: team.short_name,
      logo_url: team.logo_url,
      home_kit_color: team.home_kit_color,
    };
  };

  const clock = await getMatchClock(match.id);
  const initialClock = clock && clock.status === match.status ? clock : null;

  return (
    <div className="container py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`${base}/matches`}>
            <ArrowLeft className="h-3.5 w-3.5" /> All matches
          </Link>
        </Button>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Swords className="h-3.5 w-3.5" />
          {tournament.name} · {match.round_name}
        </p>
      </div>

      <MatchCentre
        initialMatch={match}
        initialEvents={eventRows}
        initialClock={initialClock}
        names={names}
        home={toCentreTeam(match.home_team_id)}
        away={toCentreTeam(match.away_team_id)}
        players={players}
        refereeName={officials?.referee_name ?? null}
        venueName={venue?.name ?? null}
        stageName={stage?.name ?? null}
      />
    </div>
  );
}
