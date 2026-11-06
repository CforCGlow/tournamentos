import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CircleDot,
  Flame,
  GitBranch,
  MapPin,
  Medal,
  Radio,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crest } from "@/components/ui/crest";
import { EmptyState } from "@/components/ui/empty-state";
import { MatchStatusBadge, TournamentStatusBadge } from "@/components/ui/status-badge";
import { LiveClock } from "@/components/public/live-clock";
import { LiveMatchRefresher } from "@/components/public/live-match-refresher";
import { EVENT_LABEL, LIVE_STATUSES, MATCH_STATUS_LABEL, TOURNAMENT_FORMATS } from "@/lib/constants";
import { getMatchClock } from "@/lib/match-clock";
import { formatDate, formatMoney, formatTime, pluralize } from "@/lib/utils";
import type { MatchEventType, TeamRow } from "@/lib/database.types";

export const dynamic = "force-dynamic";

function eventTone(type: MatchEventType): string {
  if (type === "GOAL" || type === "PENALTY_GOAL" || type === "OWN_GOAL") return "bg-emerald-400";
  if (type === "YELLOW_CARD" || type === "SECOND_YELLOW_RED" || type === "DIRECT_RED") {
    return "bg-amber-400";
  }
  return "bg-sky-400";
}

export default async function TournamentHomePage({
  params,
}: {
  params: Promise<{ tournamentSlug: string }>;
}) {
  const { tournamentSlug } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("slug", tournamentSlug)
    .maybeSingle();

  if (!tournament) notFound();

  const base = `/${tournament.slug}`;

  const [{ data: teams }, { data: matches }, { data: tenant }] = await Promise.all([
    supabase
      .from("teams")
      .select("*")
      .eq("tournament_id", tournament.id)
      .eq("registration_status", "APPROVED")
      .order("name"),
    supabase.from("matches").select("*").eq("tournament_id", tournament.id),
    supabase
      .from("public_tenants")
      .select("id, name, primary_color")
      .eq("id", tournament.tenant_id)
      .maybeSingle(),
  ]);

  const approvedTeams: TeamRow[] = teams ?? [];
  const teamById = new Map(approvedTeams.map((team) => [team.id, team]));
  const fixtures = matches ?? [];

  const teamIds = approvedTeams.map((team) => team.id);

  const [{ data: players }, { data: stages }] = await Promise.all([
    teamIds.length
      ? supabase
          .from("players")
          .select("id, team_id, full_name, goals_count, assists_count, jersey_number, position")
          .in("team_id", teamIds)
          .order("goals_count", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] }),
    supabase
      .from("stages")
      .select("id, name, stage_type, sequence_order, qualifiers_count")
      .eq("tournament_id", tournament.id)
      .order("sequence_order"),
  ]);

  const stageList = stages ?? [];
  const groupStage = stageList.find((stage) => stage.stage_type === "GROUP");

  const { data: standings } = groupStage
    ? await supabase
        .from("standings")
        .select("*")
        .eq("stage_id", groupStage.id)
        .order("points", { ascending: false })
        .order("goal_difference", { ascending: false })
        .limit(6)
    : { data: [] };

  const live = fixtures.filter((match) => LIVE_STATUSES.includes(match.status));
  const completedCount = fixtures.filter((match) => match.status === "COMPLETED").length;
  const completed = fixtures
    .filter((match) => match.status === "COMPLETED")
    .sort((a, b) => new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime())
    .slice(0, 4);
  const upcoming = fixtures
    .filter((match) => match.status === "SCHEDULED")
    .sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())
    .slice(0, 4);

  const goals = fixtures
    .filter((match) => match.status === "COMPLETED")
    .reduce((sum, match) => sum + match.home_score + match.away_score, 0);
  const scored = (players ?? []).filter((player) => player.goals_count > 0);

  const featured = live[0] ?? upcoming[0] ?? completed[0] ?? null;
  const featuredIsLive = featured ? LIVE_STATUSES.includes(featured.status) : false;
  const featuredHome = featured?.home_team_id ? teamById.get(featured.home_team_id) : null;
  const featuredAway = featured?.away_team_id ? teamById.get(featured.away_team_id) : null;

  let featuredVenue: string | null = null;
  let featuredEvents: {
    id: string;
    minute: number;
    event_type: MatchEventType;
    label: string;
    player_name: string | null;
    team_short: string | null;
  }[] = [];

  if (featured) {
    const [{ data: venueRow }, { data: eventRows }] = await Promise.all([
      featured.venue_id
        ? supabase.from("venues").select("name").eq("id", featured.venue_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("match_events")
        .select("id, minute, event_type, player_id, team_id")
        .eq("match_id", featured.id)
        .order("minute", { ascending: false })
        .limit(3),
    ]);

    featuredVenue = venueRow?.name ?? null;

    const rows = eventRows ?? [];
    const playerIds = Array.from(
      new Set(rows.map((row) => row.player_id).filter(Boolean) as string[]),
    );
    const { data: eventPlayers } = playerIds.length
      ? await supabase.from("players").select("id, full_name").in("id", playerIds)
      : { data: [] as { id: string; full_name: string }[] };
    const nameById = new Map((eventPlayers ?? []).map((player) => [player.id, player.full_name]));
    const shortById = new Map(
      [featuredHome, featuredAway]
        .filter(Boolean)
        .map((team) => [team!.id, team!.short_name as string]),
    );

    featuredEvents = rows.map((row) => ({
      id: row.id,
      minute: row.minute,
      event_type: row.event_type,
      label: EVENT_LABEL[row.event_type],
      player_name: row.player_id ? (nameById.get(row.player_id) ?? null) : null,
      team_short: shortById.get(row.team_id) ?? null,
    }));
  }

  const hasBracket = tournament.format !== "LEAGUE";

  const featuredClock =
    featured && featuredIsLive ? await getMatchClock(featured.id) : null;

  return (
    <div>
      <LiveMatchRefresher tournamentId={tournament.id} />
      {/* Hero */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        {tournament.banner_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tournament.banner_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/40" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 pitch-stripes opacity-30" aria-hidden />
            <div
              className="absolute -right-20 -top-24 h-72 w-72 rounded-full opacity-20 blur-3xl"
              style={{ backgroundColor: tenant?.primary_color ?? "#10B981" }}
              aria-hidden
            />
          </>
        )}

        <div className="container relative py-12 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <TournamentStatusBadge status={tournament.status} />
                <Badge variant="dark">{TOURNAMENT_FORMATS[tournament.format]}</Badge>
                {live.length ? (
                  <Badge variant="live" className="gap-1.5">
                    <span className="live-dot" /> {live.length} live
                  </Badge>
                ) : null}
              </div>

              <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
                {tournament.name}
              </h1>

              <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/70">
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="h-4 w-4" />
                  {formatDate(tournament.start_date)} — {formatDate(tournament.end_date)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  {approvedTeams.length} teams
                </span>
                <span className="flex items-center gap-1.5">
                  <Wallet className="h-4 w-4" />
                  Entry {formatMoney(tournament.registration_fee)}
                </span>
                {tenant ? <span>Organised by {tenant.name}</span> : null}
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  size="lg"
                  className="bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
                >
                  <Link href={`${base}/matches`}>
                    <Radio className="h-4 w-4" /> Follow the action
                  </Link>
                </Button>
                {tournament.status === "REGISTRATION_OPEN" ? (
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  >
                    <Link href={`${base}/register`}>
                      <Trophy className="h-4 w-4" /> Register your team
                    </Link>
                  </Button>
                ) : (
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  >
                    <Link href={`${base}/table`}>
                      <Medal className="h-4 w-4" /> View the table
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 rounded-3xl bg-emerald-400/10 blur-2xl" aria-hidden />
              <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-slate-950/60 shadow-xl backdrop-blur">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
                  <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
                    <Radio className="h-3.5 w-3.5 text-emerald-300" />
                    {featuredIsLive
                      ? "Live match"
                      : featured?.status === "COMPLETED"
                        ? "Latest result"
                        : featured
                          ? "Next up"
                          : "Match centre"}
                  </span>
                  {featuredIsLive ? (
                    <Badge variant="live" className="gap-1.5">
                      <span className="live-dot" /> LIVE
                    </Badge>
                  ) : featured ? (
                    <Badge variant="dark" className="whitespace-nowrap uppercase tracking-wide">{MATCH_STATUS_LABEL[featured.status]}</Badge>
                  ) : (
                    <Badge variant="dark">Fixtures pending</Badge>
                  )}
                </div>

                {featured ? (
                  <div className="space-y-5 p-5">
                    <p className="truncate text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
                      {featured.round_name}
                    </p>

                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-1 flex-col items-center gap-2 text-center">
                        <Crest
                          name={featuredHome?.name ?? "To be decided"}
                          logoUrl={featuredHome?.logo_url}
                          color={featuredHome?.home_kit_color ?? "#475569"}
                          size="lg"
                        />
                        <span className="line-clamp-1 text-sm font-semibold">
                          {featuredHome?.short_name ?? "TBD"}
                        </span>
                      </div>

                      <div className="shrink-0 text-center">
                        {featured.status === "SCHEDULED" ? (
                          <>
                            <p className="font-display text-4xl font-semibold tabular-nums">
                              {formatTime(featured.kickoff_time)}
                            </p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                              {formatDate(featured.kickoff_time)}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-display text-5xl font-semibold tabular-nums">
                              {featured.home_score}
                              <span className="mx-2 text-white/30">–</span>
                              {featured.away_score}
                            </p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                              {featuredIsLive ? MATCH_STATUS_LABEL[featured.status] : "Full time"}
                            </p>
                            <div className="mt-1 flex justify-center">
                              <LiveClock
                                matchId={featured.id}
                                initial={featuredClock}
                                variant="minute"
                                className="text-emerald-300"
                              />
                            </div>
                            {featured.home_penalties !== null &&
                            featured.away_penalties !== null ? (
                              <p className="mt-0.5 text-[10px] text-white/45">
                                {featured.home_penalties}–{featured.away_penalties} on penalties
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col items-center gap-2 text-center">
                        <Crest
                          name={featuredAway?.name ?? "To be decided"}
                          logoUrl={featuredAway?.logo_url}
                          color={featuredAway?.home_kit_color ?? "#0284C7"}
                          size="lg"
                        />
                        <span className="line-clamp-1 text-sm font-semibold">
                          {featuredAway?.short_name ?? "TBD"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {featuredEvents.length === 0 ? (
                        <p className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3 text-center text-xs text-white/50">
                          {featured.status === "SCHEDULED"
                            ? "Line-ups and the timeline appear once the referee starts the match."
                            : "No match events were recorded for this fixture."}
                        </p>
                      ) : (
                        featuredEvents.map((event) => (
                          <div
                            key={event.id}
                            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2"
                          >
                            <span className="w-8 shrink-0 font-display text-xs font-semibold text-white/60">
                              {event.minute}&apos;
                            </span>
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${eventTone(event.event_type)}`}
                            />
                            <span className="min-w-0 truncate text-xs text-white/70">
                              {event.label}
                              {event.player_name ? ` — ${event.player_name}` : ""}
                            </span>
                            {event.team_short ? (
                              <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-white/35">
                                {event.team_short}
                              </span>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-[11px] text-white/45">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <MapPin className="h-3 w-3 shrink-0 text-emerald-300" />
                        <span className="truncate">
                          {featuredVenue ?? "Venue to be confirmed"}
                        </span>
                      </span>
                      <Link
                        href={`${base}/matches/${featured.id}`}
                        className="flex shrink-0 items-center gap-1 font-semibold text-emerald-300 hover:text-emerald-200"
                      >
                        Match centre
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 p-8 text-center">
                    <Trophy className="mx-auto h-8 w-8 text-white/30" />
                    <p className="font-display text-lg font-semibold">Fixtures are on the way</p>
                    <p className="text-xs leading-relaxed text-white/50">
                      The draw has not been published yet. Once it is, the next match will be
                      shown here.
                    </p>
                    <Link
                      href={`${base}/matches`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:text-emerald-200"
                    >
                      Go to fixtures <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section shortcuts */}
      <div className="container mt-6">
        <div className={`grid grid-cols-2 gap-3 ${hasBracket ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
          {[
            {
              href: `${base}/matches`,
              label: "Fixtures",
              hint: `${fixtures.length} matches`,
              icon: CalendarClock,
            },
            {
              href: `${base}/table`,
              label: "Table",
              hint: hasBracket ? "Standings" : "League standings",
              icon: Medal,
            },
            hasBracket
              ? {
                  href: `${base}/bracket`,
                  label: "Bracket",
                  hint: "Knockout path",
                  icon: GitBranch,
                }
              : null,
            {
              href: `${base}/teams`,
              label: "Teams",
              hint: `${approvedTeams.length} squads`,
              icon: Users,
            },
            {
              href: `${base}/stats`,
              label: "Stats",
              hint: "Scorers & cards",
              icon: BarChart3,
            },
          ]
            .filter(Boolean)
            .map((item) => {
              const link = item!;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-emerald-700">
                    <link.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold group-hover:text-primary">
                      {link.label}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {link.hint}
                    </span>
                  </span>
                </Link>
              );
            })}
        </div>
      </div>

      <div className="container mt-6 grid items-start gap-5 pb-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3 p-5 pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CircleDot className="h-4 w-4 shrink-0 text-primary" /> Latest results
                </CardTitle>
                <Button asChild size="sm" variant="ghost" className="shrink-0">
                  <Link href={`${base}/matches?status=COMPLETED`}>
                    All <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 p-5 pt-0">
                {completed.length === 0 ? (
                  <p className="flex h-40 items-center justify-center px-4 text-center text-xs text-muted-foreground">
                    No results yet — the first whistle is still to come.
                  </p>
                ) : (
                  completed.map((match) => {
                    const home = match.home_team_id ? teamById.get(match.home_team_id) : null;
                    const away = match.away_team_id ? teamById.get(match.away_team_id) : null;
                    return (
                      <Link
                        key={match.id}
                        href={`${base}/matches/${match.id}`}
                        title={`${home?.name ?? "TBD"} vs ${away?.name ?? "TBD"} · ${match.round_name}`}
                        className="flex h-9 items-center gap-2 rounded-md border px-2.5 text-xs transition-colors hover:bg-muted/60"
                      >
                        <span className="min-w-0 flex-1 truncate text-right font-medium">
                          {home?.short_name ?? "TBD"}
                        </span>
                        <span className="shrink-0 rounded bg-slate-900 px-1.5 py-0.5 font-display font-semibold tabular-nums text-white">
                          {match.home_score}–{match.away_score}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {away?.short_name ?? "TBD"}
                        </span>
                        <span className="hidden w-16 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground sm:block">
                          {formatDate(match.kickoff_time)}
                        </span>
                      </Link>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3 p-5 pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CalendarClock className="h-4 w-4 shrink-0 text-secondary" /> Coming up
                </CardTitle>
                <Button asChild size="sm" variant="ghost" className="shrink-0">
                  <Link href={`${base}/matches?status=SCHEDULED`}>
                    All <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 p-5 pt-0">
                {upcoming.length === 0 ? (
                  <p className="flex h-40 items-center justify-center px-4 text-center text-xs text-muted-foreground">
                    No scheduled fixtures.
                  </p>
                ) : (
                  upcoming.map((match) => {
                    const home = match.home_team_id ? teamById.get(match.home_team_id) : null;
                    const away = match.away_team_id ? teamById.get(match.away_team_id) : null;
                    return (
                      <Link
                        key={match.id}
                        href={`${base}/matches/${match.id}`}
                        title={`${home?.name ?? "TBD"} vs ${away?.name ?? "TBD"} · ${match.round_name}`}
                        className="flex h-9 items-center gap-2 rounded-md border px-2.5 text-xs transition-colors hover:bg-muted/60"
                      >
                        <span className="min-w-0 flex-1 truncate text-right font-medium">
                          {home?.short_name ?? "TBD"}
                        </span>
                        <span className="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-display font-semibold tabular-nums">
                          {formatTime(match.kickoff_time)}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {away?.short_name ?? "TBD"}
                        </span>
                        <span className="hidden w-16 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground sm:block">
                          {formatDate(match.kickoff_time)}
                        </span>
                      </Link>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {groupStage ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3 p-5 pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Medal className="h-4 w-4 shrink-0 text-amber-500" /> {groupStage.name}
                </CardTitle>
                <Button asChild size="sm" variant="ghost" className="shrink-0">
                  <Link href={`${base}/table`}>
                    Full table <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full min-w-[26rem] text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="w-7 px-2 py-2">#</th>
                      <th className="px-2 py-2">Team</th>
                      <th className="px-1.5 py-2 text-center">P</th>
                      <th className="px-1.5 py-2 text-center">GD</th>
                      <th className="px-2 py-2 text-center font-bold">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(standings ?? []).map((row, index) => {
                      const team = teamById.get(row.team_id);
                      return (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="px-2 py-2 text-muted-foreground">{index + 1}</td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <Crest
                                name={team?.name ?? "Team"}
                                logoUrl={team?.logo_url}
                                color={team?.home_kit_color ?? "#94A3B8"}
                                size="sm"
                                className="h-5 w-5 rounded text-[8px]"
                              />
                              <span className="truncate font-medium">
                                {team?.name ?? "Unknown team"}
                              </span>
                            </div>
                          </td>
                          <td className="px-1.5 py-2 text-center tabular-nums">{row.played}</td>
                          <td className="px-1.5 py-2 text-center tabular-nums">
                            {row.goal_difference > 0 ? "+" : ""}
                            {row.goal_difference}
                          </td>
                          <td className="px-2 py-2 text-center font-bold tabular-nums">
                            {row.points}
                          </td>
                        </tr>
                      );
                    })}
                    {(standings ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                          The table fills up as results are signed off.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 p-5 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Flame className="h-4 w-4 shrink-0 text-rose-500" /> Golden boot
              </CardTitle>
              <Button asChild size="sm" variant="ghost" className="shrink-0">
                <Link href={`${base}/stats`}>
                  Stats <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2.5 p-5 pt-0">
              {scored.length === 0 ? (
                <p className="flex h-40 items-center justify-center px-4 text-center text-xs text-muted-foreground">
                  Goals appear here once the referee logs them.
                </p>
              ) : (
                scored.slice(0, 6).map((player, index) => {
                  const team = teamById.get(player.team_id);
                  return (
                    <div key={player.id} className="flex items-center gap-2.5">
                      <span className="w-4 shrink-0 text-center font-display text-[11px] font-bold text-muted-foreground">
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
                        <p className="truncate text-xs font-semibold">{player.full_name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {team?.short_name ?? "Team"} · #{player.jersey_number}
                        </p>
                      </div>
                      <div className="w-10 shrink-0 text-right">
                        <p className="font-display text-sm font-bold tabular-nums">
                          {player.goals_count}
                        </p>
                        <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                          goals
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm">At a glance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5 pt-0 text-sm">
              {[
                { label: "Teams", value: approvedTeams.length },
                { label: "Fixtures", value: fixtures.length },
                { label: "Played", value: completedCount },
                { label: "Goals scored", value: goals },
                { label: "Live now", value: live.length },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-display font-semibold tabular-nums">{row.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {tournament.status === "REGISTRATION_OPEN" ? (
            <Card
              className="border-primary/40 bg-primary-soft/40"
              style={{ borderColor: tenant?.primary_color ?? undefined }}
            >
              <CardContent className="space-y-3 p-5">
                <Badge variant="success">
                  <ShieldCheck className="h-3 w-3" /> Entry open
                </Badge>
                <p className="font-display text-lg font-semibold leading-tight">
                  {tournament.max_teams - approvedTeams.length} slots left
                </p>
                <p className="text-xs text-muted-foreground">
                  {pluralize(tournament.min_squad_size, "player")} minimum squad · entry{" "}
                  {formatMoney(tournament.registration_fee)}.
                </p>
                <Button asChild className="w-full">
                  <Link href={`${base}/register`}>
                    Register a team <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {approvedTeams.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="No teams yet"
              description="Once entries are approved they appear here and in the draw."
            />
          ) : null}
        </div>
      </div>

      {tournament.rules_md?.trim() ? (
        <div className="container pb-10">
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Rules &amp; eligibility</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                {tournament.rules_md}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {fixtures.length > 0 ? (
        <div className="container pb-10">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-5 py-4">
            <div className="flex min-w-0 items-center gap-2.5 text-xs text-muted-foreground">
              <MatchStatusBadge status={live.length ? "FIRST_HALF" : "SCHEDULED"} />
              <span>
                {live.length
                  ? "Scores update live as the referee records them."
                  : "Every fixture has its own match centre with lineups and the timeline."}
              </span>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={`${base}/table`}>
                Standings <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
