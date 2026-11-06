import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/layout/back-link";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Filter,
  MapPin,
  Radio,
  Swords,
} from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Crest } from "@/components/ui/crest";
import { EmptyState } from "@/components/ui/empty-state";
import { MatchStatusBadge } from "@/components/ui/status-badge";
import { LiveClock } from "@/components/public/live-clock";
import { LiveMatchRefresher } from "@/components/public/live-match-refresher";
import { LIVE_STATUSES } from "@/lib/constants";
import { getMatchClocks } from "@/lib/match-clock";
import { cn, formatDate, formatTime } from "@/lib/utils";
import type { MatchRow } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type FilterKey = "all" | "live" | "upcoming" | "results";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All fixtures" },
  { key: "live", label: "Live" },
  { key: "upcoming", label: "Upcoming" },
  { key: "results", label: "Results" },
];

function matchesFilter(match: MatchRow, filter: FilterKey): boolean {
  switch (filter) {
    case "live":
      return LIVE_STATUSES.includes(match.status);
    case "upcoming":
      return match.status === "SCHEDULED" || match.status === "POSTPONED";
    case "results":
      return match.status === "COMPLETED";
    default:
      return true;
  }
}

export default async function PublicMatchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tournamentSlug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { tournamentSlug } = await params;
  const query = await searchParams;
  const filter: FilterKey = FILTERS.some((entry) => entry.key === query.status)
    ? (query.status as FilterKey)
    : "all";

  const supabase = await createClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, slug, status")
    .eq("slug", tournamentSlug)
    .maybeSingle();

  if (!tournament) notFound();

  const base = `/${tournament.slug}`;

  const [{ data: matches }, { data: teams }, { data: venues }, { data: stages }] = await Promise.all([
    supabase
      .from("matches")
      .select("*")
      .eq("tournament_id", tournament.id)
      .order("kickoff_time"),
    supabase
      .from("teams")
      .select("id, name, short_name, logo_url, home_kit_color")
      .eq("tournament_id", tournament.id)
      .eq("registration_status", "APPROVED"),
    supabase.from("venues").select("id, name").eq("tournament_id", tournament.id),
    supabase
      .from("stages")
      .select("id, name, stage_type, sequence_order")
      .eq("tournament_id", tournament.id)
      .order("sequence_order"),
  ]);

  const teamById = new Map((teams ?? []).map((team) => [team.id, team]));
  const venueById = new Map((venues ?? []).map((venue) => [venue.id, venue.name]));
  const stageById = new Map((stages ?? []).map((stage) => [stage.id, stage]));

  const fixtures = matches ?? [];
  const liveCount = fixtures.filter((match) => LIVE_STATUSES.includes(match.status)).length;
  const playedCount = fixtures.filter((match) => match.status === "COMPLETED").length;
  const clocks = await getMatchClocks(
    fixtures.filter((match) => LIVE_STATUSES.includes(match.status)).map((match) => match.id),
  );

  const filtered = fixtures.filter((match) => matchesFilter(match, filter));

  const byRound = new Map<string, MatchRow[]>();
  for (const match of filtered) {
    const stageName = match.stage_id ? stageById.get(match.stage_id)?.name : null;
    const key = stageName ? `${stageName} · ${match.round_name}` : match.round_name;
    const list = byRound.get(key) ?? [];
    list.push(match);
    byRound.set(key, list);
  }

  return (
    <div className="container py-8">
      <BackLink href={base} label="Back to tournament" />
      <LiveMatchRefresher tournamentId={tournament.id} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Fixtures &amp; results
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            Every match, every minute
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {fixtures.length} fixtures scheduled across {byRound.size} round
            {byRound.size === 1 ? "" : "s"}. Scores update live while the referee is on the
            pitch.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {liveCount > 0 ? (
            <Badge variant="live" className="gap-1.5">
              <span className="live-dot" /> {liveCount} live
            </Badge>
          ) : null}
          <Badge variant="neutral">
            <CheckCircle2 className="h-3 w-3" /> {playedCount} played
          </Badge>
          <Badge variant="neutral">
            <CalendarDays className="h-3 w-3" /> {fixtures.length} total
          </Badge>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filter
        </span>
        {FILTERS.map((entry) => (
          <Link
            key={entry.key}
            href={entry.key === "all" ? `${base}/matches` : `${base}/matches?status=${entry.key}`}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              filter === entry.key
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-border text-muted-foreground hover:border-slate-400 hover:text-foreground",
            )}
          >
            {entry.label}
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="p-5">
            <EmptyState
              icon={<Swords className="h-5 w-5" />}
              title="Nothing to show here"
              description={
                fixtures.length === 0
                  ? "The draw has not been published yet. Fixtures and kick-off times appear here as soon as the organiser generates them."
                  : "No fixtures match this filter yet."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 space-y-8">
          {Array.from(byRound.entries()).map(([round, roundMatches]) => (
            <section key={round}>
              <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
                {round}
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {roundMatches.length}
                </span>
              </h2>

              <div className="grid gap-3 lg:grid-cols-2">
                {roundMatches.map((match) => {
                  const home = match.home_team_id ? teamById.get(match.home_team_id) : null;
                  const away = match.away_team_id ? teamById.get(match.away_team_id) : null;
                  const venue = match.venue_id ? venueById.get(match.venue_id) : null;
                  const isLive = LIVE_STATUSES.includes(match.status);
                  const completed = match.status === "COMPLETED";
                  const hasPenalties =
                    match.home_penalties !== null && match.away_penalties !== null;

                  return (
                    <Link
                      key={match.id}
                      href={`${base}/matches/${match.id}`}
                      className={cn(
                        "group flex flex-col rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md",
                        isLive && "border-emerald-400 bg-emerald-50/40",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {formatDate(match.kickoff_time)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(match.kickoff_time)}
                          </span>
                          {venue ? (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {venue}
                            </span>
                          ) : null}
                        </p>
                        <MatchStatusBadge status={match.status} />
                      </div>

                      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Crest
                            name={home?.name ?? "TBD"}
                            logoUrl={home?.logo_url}
                            color={home?.home_kit_color ?? "#94A3B8"}
                            size="sm"
                          />
                          <span className="min-w-0 truncate text-sm font-semibold">
                            {home?.name ?? "TBD"}
                          </span>
                        </div>

                        <div className="text-center">
                          {match.status === "SCHEDULED" || match.status === "POSTPONED" ? (
                            <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                              {formatTime(match.kickoff_time)}
                            </span>
                          ) : (
                            <>
                              <span
                                className={cn(
                                  "rounded px-2.5 py-1 font-display text-base font-bold tabular-nums text-white",
                                  isLive ? "bg-emerald-600" : "bg-slate-900",
                                )}
                              >
                                {match.home_score}–{match.away_score}
                              </span>
                              {hasPenalties ? (
                                <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
                                  pens {match.home_penalties}–{match.away_penalties}
                                </p>
                              ) : null}
                            </>
                          )}
                          {isLive ? (
                            <div className="mt-1 flex justify-center">
                              <LiveClock
                                matchId={match.id}
                                initial={clocks.get(match.id) ?? null}
                                variant="minute"
                                size="small"
                              />
                            </div>
                          ) : null}
                        </div>

                        <div className="flex min-w-0 items-center justify-end gap-2">
                          <span className="min-w-0 truncate text-right text-sm font-semibold">
                            {away?.name ?? "TBD"}
                          </span>
                          <Crest
                            name={away?.name ?? "TBD"}
                            logoUrl={away?.logo_url}
                            color={away?.home_kit_color ?? "#94A3B8"}
                            size="sm"
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t pt-2 text-[10px] text-muted-foreground">
                        <span>
                          {match.round_name} · match {match.match_number}
                        </span>
                        <span className="flex items-center gap-1 font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                          {isLive ? (
                            <>
                              <Radio className="h-3 w-3" /> live centre
                            </>
                          ) : completed ? (
                            "match report"
                          ) : (
                            "match centre"
                          )}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
