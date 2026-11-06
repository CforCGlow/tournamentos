"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  CalendarDays,
  CircleDot,
  Flag,
  MapPin,
  Radio,
  Square,
  Star,
  Trophy,
  Users,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crest } from "@/components/ui/crest";
import { MatchStatusBadge } from "@/components/ui/status-badge";
import { LiveClock } from "@/components/public/live-clock";
import { EVENT_LABEL, LIVE_STATUSES, MATCH_STATUS_LABEL } from "@/lib/constants";
import { cn, formatDate, formatTime } from "@/lib/utils";
import type { MatchClockView } from "@/lib/clock";
import type { MatchEventRow, MatchRow } from "@/lib/database.types";

export interface CentreTeam {
  id: string;
  name: string;
  short_name: string;
  logo_url: string | null;
  home_kit_color: string;
}

export interface CentrePlayer {
  id: string;
  team_id: string;
  full_name: string;
  jersey_number: number;
  position: "GK" | "DEF" | "MID" | "FWD";
  is_starting: boolean;
  is_bench: boolean;
  photo_url: string | null;
}

interface CentreData {
  match: MatchRow;
  events: MatchEventRow[];
  names: Record<string, string>;
}

const EVENT_ICON: Record<MatchEventRow["event_type"], React.ReactNode> = {
  GOAL: <CircleDot className="h-3.5 w-3.5" />,
  OWN_GOAL: <CircleDot className="h-3.5 w-3.5" />,
  PENALTY_GOAL: <CircleDot className="h-3.5 w-3.5" />,
  MISSED_PENALTY: <CircleDot className="h-3.5 w-3.5" />,
  YELLOW_CARD: <Square className="h-3.5 w-3.5" />,
  SECOND_YELLOW_RED: <Square className="h-3.5 w-3.5" />,
  DIRECT_RED: <Square className="h-3.5 w-3.5" />,
  SUBSTITUTION: <ArrowLeftRight className="h-3.5 w-3.5" />,
};

const EVENT_TONE: Record<MatchEventRow["event_type"], string> = {
  GOAL: "bg-emerald-100 text-emerald-700",
  OWN_GOAL: "bg-rose-100 text-rose-700",
  PENALTY_GOAL: "bg-emerald-100 text-emerald-700",
  MISSED_PENALTY: "bg-slate-100 text-slate-600",
  YELLOW_CARD: "bg-amber-100 text-amber-700",
  SECOND_YELLOW_RED: "bg-orange-100 text-orange-700",
  DIRECT_RED: "bg-rose-100 text-rose-700",
  SUBSTITUTION: "bg-sky-100 text-sky-700",
};

export function MatchCentre({
  initialMatch,
  initialEvents,
  initialClock = null,
  names,
  home,
  away,
  players,
  refereeName,
  venueName,
  stageName,
}: {
  initialMatch: MatchRow;
  initialEvents: MatchEventRow[];
  initialClock?: MatchClockView | null;
  names: Record<string, string>;
  home: CentreTeam | null;
  away: CentreTeam | null;
  players: CentrePlayer[];
  refereeName: string | null;
  venueName: string | null;
  stageName: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["match-centre", initialMatch.id] as const, [initialMatch.id]);

  const { data, isFetching } = useQuery<CentreData>({
    queryKey,
    queryFn: async () => {
      const [{ data: match }, { data: events }] = await Promise.all([
        supabase.from("matches").select("*").eq("id", initialMatch.id).maybeSingle(),
        supabase
          .from("match_events")
          .select("*")
          .eq("match_id", initialMatch.id)
          .order("minute"),
      ]);

      const ids = Array.from(
        new Set(
          (events ?? [])
            .flatMap((event) => [event.player_id, event.secondary_player_id])
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const { data: eventPlayers } = ids.length
        ? await supabase.from("players").select("id, full_name").in("id", ids)
        : { data: [] };

      const resolved = { ...names };
      for (const player of eventPlayers ?? []) {
        resolved[player.id] = player.full_name;
      }

      return {
        match: match ?? initialMatch,
        events: events ?? [],
        names: resolved,
      };
    },
    initialData: { match: initialMatch, events: initialEvents, names },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`centre:${initialMatch.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `id=eq.${initialMatch.id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_events",
          filter: `match_id=eq.${initialMatch.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, queryClient, queryKey, initialMatch.id]);

  const match = data.match;
  const events = data.events;
  const live = LIVE_STATUSES.includes(match.status);
  const finished = match.status === "COMPLETED";
  const started = live || finished;
  const hasPenalties = match.home_penalties !== null && match.away_penalties !== null;
  const homeName = home?.name ?? "TBD";
  const awayName = away?.name ?? "TBD";

  const mvpName = match.mvp_player_id ? data.names[match.mvp_player_id] ?? null : null;

  const timeline = [...events].sort(
    (a, b) => a.minute - b.minute || (a.extra_minute ?? 0) - (b.extra_minute ?? 0),
  );

  function playerLabel(id: string | null): string | null {
    if (!id) return null;
    const player = players.find((entry) => entry.id === id);
    if (player) return `#${player.jersey_number} ${player.full_name}`;
    return data.names[id] ?? null;
  }

  function goalEventsFor(teamId: string | null | undefined): MatchEventRow[] {
    if (!teamId) return [];
    const opponentId = teamId === match.home_team_id ? match.away_team_id : match.home_team_id;
    return timeline.filter(
      (event) =>
        (event.team_id === teamId &&
          (event.event_type === "GOAL" || event.event_type === "PENALTY_GOAL")) ||
        (Boolean(opponentId) &&
          event.team_id === opponentId &&
          event.event_type === "OWN_GOAL"),
    );
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-950 px-4 py-2.5 text-white">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
            {live ? (
              <>
                <span className="live-dot" /> Live
              </>
            ) : (
              <>
                <Trophy className="h-3.5 w-3.5" /> {stageName ?? match.round_name}
              </>
            )}
          </span>
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-white/60">
            <Radio className={cn("h-3 w-3", isFetching && "animate-pulse")} />
            {isFetching ? "syncing…" : "auto-updating"}
          </span>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-6 sm:gap-6 sm:px-6">
          <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
            <Crest
              name={homeName}
              logoUrl={home?.logo_url}
              color={home?.home_kit_color ?? "#94A3B8"}
              size="lg"
            />
            <div className="min-w-0">
              <p className="truncate font-display text-base font-semibold leading-tight sm:text-lg">
                {homeName}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {home?.short_name ?? "Home"}
              </p>
            </div>
          </div>

          <div className="text-center">
            <p className="font-display text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">
              {started ? (
                <>
                  {match.home_score} <span className="text-muted-foreground">–</span>{" "}
                  {match.away_score}
                </>
              ) : (
                <span className="text-xl font-semibold text-muted-foreground">
                  {formatTime(match.kickoff_time)}
                </span>
              )}
            </p>
            {hasPenalties ? (
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                penalties {match.home_penalties}–{match.away_penalties}
              </p>
            ) : null}
            <div className="mt-2 flex items-center justify-center gap-1.5">
              <MatchStatusBadge status={match.status} />
            </div>
            <div className="mt-1.5 flex justify-center">
              <LiveClock
                matchId={match.id}
                initial={initialClock}
                className="text-emerald-600"
              />
            </div>
            {finished ? (
              <p className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                result confirmed
              </p>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row-reverse sm:text-right">
            <Crest
              name={awayName}
              logoUrl={away?.logo_url}
              color={away?.home_kit_color ?? "#94A3B8"}
              size="lg"
            />
            <div className="min-w-0">
              <p className="truncate font-display text-base font-semibold leading-tight sm:text-lg">
                {awayName}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {away?.short_name ?? "Away"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 border-t bg-surface/50 px-4 py-2.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDate(match.kickoff_time, true)}
          </span>
          {venueName ? (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> {venueName}
            </span>
          ) : null}
          {refereeName ? (
            <span className="flex items-center gap-1.5">
              <Flag className="h-3.5 w-3.5" /> {refereeName}
            </span>
          ) : null}
          {mvpName ? (
            <span className="flex items-center gap-1.5 font-semibold text-amber-700">
              <Star className="h-3.5 w-3.5" /> MVP {mvpName}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CircleDot className="h-4 w-4 text-primary" /> Match timeline
            </CardTitle>
            <Badge variant={live ? "live" : "neutral"} className="shrink-0 whitespace-nowrap uppercase tracking-wide">{MATCH_STATUS_LABEL[match.status]}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {timeline.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {started
                  ? "No events recorded yet in this match."
                  : "The timeline fills up once the referee starts logging events."}
              </p>
            ) : (
              <div className="divide-y">
                {timeline.map((event) => {
                  const isHome = event.team_id === match.home_team_id;
                  const scorer = playerLabel(event.player_id);
                  const secondary = playerLabel(event.secondary_player_id);

                  return (
                    <div
                      key={event.id}
                      className={cn(
                        "flex items-start gap-3 px-4 py-2.5",
                        isHome ? "bg-emerald-50/20" : "bg-sky-50/20",
                      )}
                    >
                      <span className="w-9 shrink-0 pt-0.5 text-right font-display text-xs font-semibold tabular-nums text-muted-foreground">
                        {event.minute}&apos;{event.extra_minute ? `+${event.extra_minute}` : ""}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                          EVENT_TONE[event.event_type],
                        )}
                      >
                        {EVENT_ICON[event.event_type]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">
                          {EVENT_LABEL[event.event_type]}
                          {scorer ? ` · ${scorer}` : ""}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {isHome ? home?.short_name ?? "Home" : away?.short_name ?? "Away"}
                          {secondary
                            ? event.event_type === "SUBSTITUTION"
                              ? ` · ${scorer ?? "Off"} off, ${secondary} on`
                              : ` · assist ${secondary}`
                            : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {isHome ? "H" : "A"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Match facts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs">
              {[
                { label: "Round", value: match.round_name },
                { label: "Stage", value: stageName ?? "—" },
                { label: "Match number", value: `#${match.match_number}` },
                { label: "Venue", value: venueName ?? "To be confirmed" },
                { label: "Referee", value: refereeName ?? "To be appointed" },
                {
                  label: "Kick-off",
                  value: `${formatDate(match.kickoff_time)} · ${formatTime(match.kickoff_time)}`,
                },
                { label: "MVP", value: mvpName ?? "Not announced" },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="max-w-[60%] text-right font-medium">{row.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-secondary" /> Goalscorers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {[
                { team: home, label: "Home", goals: goalEventsFor(match.home_team_id) },
                { team: away, label: "Away", goals: goalEventsFor(match.away_team_id) },
              ].map((side) => (
                <div key={side.team?.id ?? side.label} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{side.team?.name ?? "TBD"}</span>
                    <span className="font-display text-sm font-bold tabular-nums">
                      {side.goals.length}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {side.goals.map((event) => (
                      <p
                        key={event.id}
                        className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                      >
                        <span className="truncate">
                          {playerLabel(event.player_id) ?? "Unknown scorer"}
                        </span>
                        <span className="tabular-nums">
                          {event.minute}&apos;
                          {event.event_type === "PENALTY_GOAL" ? " (pen)" : ""}
                          {event.event_type === "OWN_GOAL" ? " (og)" : ""}
                        </span>
                      </p>
                    ))}
                    {side.goals.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">No goals yet.</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {[
          { team: home, label: "Home" },
          { team: away, label: "Away" },
        ].map((side) => {
          const starters = players
            .filter((player) => player.team_id === side.team?.id && player.is_starting)
            .sort((a, b) => a.jersey_number - b.jersey_number);
          const bench = players
            .filter((player) => player.team_id === side.team?.id && player.is_bench)
            .sort((a, b) => a.jersey_number - b.jersey_number);

          return (
            <Card key={side.label}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="truncate text-sm">{side.team?.name ?? "TBD"}</CardTitle>
                <Badge variant={starters.length === 11 ? "success" : "neutral"}>
                  {starters.length}/11
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {starters.length === 0 && bench.length === 0 ? (
                  <p className="text-muted-foreground">
                    The lineup has not been submitted for this match.
                  </p>
                ) : (
                  <>
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Starting XI
                      </p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {starters.map((player) => (
                          <div key={player.id} className="flex min-w-0 items-center gap-1.5">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-900 text-[9px] font-bold text-white">
                              {player.jersey_number}
                            </span>
                            <span className="truncate">{player.full_name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {bench.length > 0 ? (
                      <div className="border-t pt-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Substitutes
                        </p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                          {bench.map((player) => (
                            <div key={player.id} className="flex min-w-0 items-center gap-1.5">
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
      </div>
    </div>
  );
}
