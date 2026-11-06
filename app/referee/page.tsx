import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Flag,
  MapPin,
  PlayCircle,
  Radio,
  Swords,
  Timer,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Crest } from "@/components/ui/crest";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { MatchStatusBadge } from "@/components/ui/status-badge";
import { LIVE_STATUSES } from "@/lib/constants";
import { formatDate, formatTime, pluralize } from "@/lib/utils";
import type { MatchRow } from "@/lib/database.types";

export const dynamic = "force-dynamic";

function isToday(iso: string): boolean {
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export default async function RefereeHomePage() {
  const ctx = await requireProfile("/referee");

  const { data: matches } = await ctx.supabase
    .from("matches")
    .select("*")
    .eq("referee_id", ctx.profile.id)
    .order("kickoff_time");

  const matchList: MatchRow[] = matches ?? [];
  const tournamentIds = Array.from(new Set(matchList.map((match) => match.tournament_id)));
  const teamIds = Array.from(
    new Set(
      matchList.flatMap((match) =>
        [match.home_team_id, match.away_team_id].filter((id): id is string => Boolean(id)),
      ),
    ),
  );
  const venueIds = Array.from(
    new Set(matchList.map((match) => match.venue_id).filter((id): id is string => Boolean(id))),
  );

  const [{ data: tournaments }, { data: teams }, { data: venues }] = await Promise.all([
    tournamentIds.length
      ? ctx.supabase.from("tournaments").select("id, name, slug").in("id", tournamentIds)
      : Promise.resolve({ data: [] }),
    teamIds.length
      ? ctx.supabase
          .from("teams")
          .select("id, name, short_name, logo_url, home_kit_color")
          .in("id", teamIds)
      : Promise.resolve({ data: [] }),
    venueIds.length
      ? ctx.supabase.from("venues").select("id, name").in("id", venueIds)
      : Promise.resolve({ data: [] }),
  ]);

  const tournamentById = new Map((tournaments ?? []).map((t) => [t.id, t]));
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
  const venueById = new Map((venues ?? []).map((v) => [v.id, v.name]));

  const live = matchList.filter((match) => LIVE_STATUSES.includes(match.status));
  const scheduled = matchList
    .filter((match) => match.status === "SCHEDULED" || match.status === "POSTPONED")
    .sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());
  const completed = matchList
    .filter((match) => match.status === "COMPLETED")
    .sort((a, b) => new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime());

  const today = scheduled.filter((match) => isToday(match.kickoff_time));
  const next = scheduled[0];

  function renderMatch(match: MatchRow, tone: "live" | "upcoming" | "done") {
    const home = match.home_team_id ? teamById.get(match.home_team_id) : null;
    const away = match.away_team_id ? teamById.get(match.away_team_id) : null;
    const tournament = tournamentById.get(match.tournament_id);
    const venue = match.venue_id ? venueById.get(match.venue_id) : null;

    return (
      <div
        key={match.id}
        className={
          tone === "live"
            ? "rounded-xl border-2 border-emerald-400 bg-emerald-50/60 p-4"
            : "rounded-xl border p-4 transition-colors hover:bg-muted/40"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {tournament?.name ?? "Tournament"} · {match.round_name} · #{match.match_number}
          </p>
          <div className="flex items-center gap-1.5">
            {isToday(match.kickoff_time) ? <Badge variant="info">today</Badge> : null}
            <MatchStatusBadge status={match.status} />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Crest
              name={home?.name ?? "TBD"}
              logoUrl={home?.logo_url}
              color={home?.home_kit_color ?? "#94A3B8"}
              size="sm"
            />
            <span className="min-w-0 truncate text-sm font-semibold">{home?.name ?? "TBD"}</span>
          </div>

          <span
            className={
              tone === "live"
                ? "rounded-md bg-emerald-600 px-3 py-1.5 font-display text-lg font-bold tabular-nums text-white"
                : "rounded-md bg-slate-900 px-3 py-1 font-display text-base font-semibold tabular-nums text-white"
            }
          >
            {match.home_score} – {match.away_score}
            {match.home_penalties !== null && match.away_penalties !== null ? (
              <span className="ml-1.5 text-[10px] font-normal text-emerald-200">
                ({match.home_penalties}–{match.away_penalties})
              </span>
            ) : null}
          </span>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
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

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDate(match.kickoff_time)} · {formatTime(match.kickoff_time)}
            </span>
            {venue ? (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {venue}
              </span>
            ) : null}
          </div>

          <Button
            asChild
            size="sm"
            variant={tone === "live" ? "default" : tone === "done" ? "outline" : "secondary"}
          >
            <Link href={`/referee/match/${match.id}`}>
              {tone === "live" ? (
                <>
                  <Radio className="h-3.5 w-3.5" /> Resume console
                </>
              ) : tone === "done" ? (
                <>
                  Review <ArrowRight className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  <PlayCircle className="h-3.5 w-3.5" /> Open match
                </>
              )}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Matchday
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
            Hello, {ctx.profile.full_name.split(" ")[0]}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {live.length
              ? "A match is live — resume the console to keep the clock and events in sync."
              : today.length
                ? `${pluralize(today.length, "fixture")} today. Tap a match to start the clock.`
                : "Your assigned fixtures appear here. The organiser sets the referee on each match."}
          </p>
        </div>
        <Badge variant={live.length ? "live" : "neutral"} className="gap-1.5 px-3 py-1 text-xs">
          {live.length ? <span className="live-dot" /> : <Flag className="h-3.5 w-3.5" />}
          {live.length ? "LIVE" : "No match in play"}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Live now"
          value={live.length}
          hint={live.length ? "Clock running" : "Nothing in play"}
          icon={<Radio className="h-5 w-5" />}
          tone={live.length ? "rose" : "primary"}
        />
        <StatCard
          label="Upcoming"
          value={scheduled.length}
          hint={`${today.length} today`}
          icon={<CalendarDays className="h-5 w-5" />}
          tone="secondary"
        />
        <StatCard
          label="Signed off"
          value={completed.length}
          hint="Full-time results submitted"
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          label="Next kick-off"
          value={next ? formatTime(next.kickoff_time) : "—"}
          hint={
            next
              ? `${formatDate(next.kickoff_time, true)} · ${
                  teamById.get(next.home_team_id ?? "")?.short_name ?? "TBD"
                } vs ${teamById.get(next.away_team_id ?? "")?.short_name ?? "TBD"}`
              : "No fixture assigned"
          }
          icon={<Timer className="h-5 w-5" />}
        />
      </div>

      {matchList.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="p-5">
            <EmptyState
              icon={<Swords className="h-5 w-5" />}
              title="No fixtures assigned yet"
              description="The tournament organiser assigns referees from the fixtures tab. Once you are on a match it shows up here with its own console."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 space-y-6">
          {live.length > 0 ? (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Radio className="h-4 w-4 text-emerald-600" /> In play
              </h2>
              <div className="space-y-3">{live.map((match) => renderMatch(match, "live"))}</div>
            </section>
          ) : null}

          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Clock className="h-4 w-4 text-secondary" /> Upcoming
            </h2>
            {scheduled.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No scheduled fixtures left on your list.
              </p>
            ) : (
              <div className="space-y-3">
                {scheduled.map((match) => renderMatch(match, "upcoming"))}
              </div>
            )}
          </section>

          {completed.length > 0 ? (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Completed
              </h2>
              <div className="space-y-3">
                {completed.slice(0, 12).map((match) => renderMatch(match, "done"))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
