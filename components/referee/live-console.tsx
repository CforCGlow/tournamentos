"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  CircleDot,
  Clock,
  Radio,
  Shield,
  Square,
  Star,
  Trash2,
  Trophy,
} from "lucide-react";
import {
  deleteEventAction,
  recordEventAction,
  setMatchStateAction,
  setMvpAction,
  setPenaltiesAction,
} from "@/app/actions/matches";
import { FormError } from "@/components/forms/form-error";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EVENT_LABEL, LIVE_STATUSES } from "@/lib/constants";
import { clockTotalSeconds, formatClock, type MatchClockView } from "@/lib/clock";
import type { MatchEventType, MatchStatus, StageType } from "@/lib/database.types";
import type { ActionState } from "@/lib/actions";

export interface ConsoleTeam {
  id: string;
  name: string;
  short_name: string;
  home_kit_color: string;
}

export interface ConsolePlayer {
  id: string;
  team_id: string;
  full_name: string;
  jersey_number: number;
  position: "GK" | "DEF" | "MID" | "FWD";
  is_starting: boolean;
  is_bench: boolean;
}

export interface ConsoleEvent {
  id: string;
  team_id: string;
  player_id: string | null;
  player_name: string | null;
  secondary_name: string | null;
  event_type: MatchEventType;
  minute: number;
  extra_minute: number | null;
}

const BASE_MINUTE: Partial<Record<MatchStatus, number>> = {
  FIRST_HALF: 0,
  HALF_TIME: 45,
  SECOND_HALF: 45,
  EXTRA_TIME: 90,
  PENALTIES: 120,
};

const EVENT_GROUPS: Array<{
  type: MatchEventType;
  label: string;
  hint: string;
  tone: string;
}> = [
  { type: "GOAL", label: "Goal", hint: "Open play", tone: "bg-emerald-600" },
  { type: "PENALTY_GOAL", label: "Penalty scored", hint: "From the spot", tone: "bg-emerald-700" },
  { type: "OWN_GOAL", label: "Own goal", hint: "Against their own net", tone: "bg-rose-600" },
  { type: "MISSED_PENALTY", label: "Penalty missed", hint: "Wide or saved", tone: "bg-slate-500" },
  { type: "YELLOW_CARD", label: "Yellow card", hint: "Caution", tone: "bg-amber-500" },
  { type: "SECOND_YELLOW_RED", label: "Second yellow", hint: "Yellow → red", tone: "bg-orange-600" },
  { type: "DIRECT_RED", label: "Red card", hint: "Straight dismissal", tone: "bg-rose-700" },
  { type: "SUBSTITUTION", label: "Substitution", hint: "Off then on", tone: "bg-sky-600" },
];

const EVENT_STYLE: Record<MatchEventType, { icon: React.ReactNode; tone: string }> = {
  GOAL: { icon: <CircleDot className="h-3.5 w-3.5" />, tone: "bg-emerald-100 text-emerald-800" },
  OWN_GOAL: { icon: <CircleDot className="h-3.5 w-3.5" />, tone: "bg-rose-100 text-rose-800" },
  PENALTY_GOAL: { icon: <CircleDot className="h-3.5 w-3.5" />, tone: "bg-emerald-100 text-emerald-800" },
  MISSED_PENALTY: { icon: <CircleDot className="h-3.5 w-3.5" />, tone: "bg-slate-100 text-slate-700" },
  YELLOW_CARD: { icon: <Square className="h-3.5 w-3.5" />, tone: "bg-amber-100 text-amber-800" },
  SECOND_YELLOW_RED: { icon: <Square className="h-3.5 w-3.5" />, tone: "bg-orange-100 text-orange-800" },
  DIRECT_RED: { icon: <Square className="h-3.5 w-3.5" />, tone: "bg-rose-100 text-rose-800" },
  SUBSTITUTION: { icon: <ArrowLeftRight className="h-3.5 w-3.5" />, tone: "bg-sky-100 text-sky-800" },
};

type Step = "team" | "event" | "player" | "assist" | "sub-on";

export function LiveConsole({
  matchId,
  status,
  home,
  away,
  homeScore,
  awayScore,
  homePenalties,
  awayPenalties,
  stageType,
  players,
  events,
  mvpPlayerId,
  initialClock = null,
  canScore,
  canManage,
}: {
  matchId: string;
  status: MatchStatus;
  home: ConsoleTeam;
  away: ConsoleTeam;
  homeScore: number;
  awayScore: number;
  homePenalties: number | null;
  awayPenalties: number | null;
  stageType: StageType | null;
  players: ConsolePlayer[];
  events: ConsoleEvent[];
  mvpPlayerId: string | null;
  initialClock?: MatchClockView | null;
  canScore: boolean;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(recordEventAction, null);

  const live = LIVE_STATUSES.includes(status);
  const finished = status === "COMPLETED";
  const base = BASE_MINUTE[status] ?? 0;

  const activeClock = initialClock && initialClock.status === status ? initialClock : null;
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() =>
    activeClock ? new Date(activeClock.serverNow).getTime() : Date.now(),
  );
  const [extraMinute, setExtraMinute] = useState("");

  useEffect(() => {
    if (!activeClock) return;
    setOffset(new Date(activeClock.serverNow).getTime() - Date.now());
  }, [activeClock?.serverNow, activeClock?.updatedAt]);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);

  // The organiser owns the clock. The console reads the same snapshot, so a
  // goal is always stamped with the minute spectators can see.
  const totalSeconds = activeClock ? clockTotalSeconds(activeClock, now + offset) : 0;
  const minute = live || finished
    ? Math.min(130, Math.max(0, Math.floor(totalSeconds / 60) || base))
    : 0;

  const [step, setStep] = useState<Step>("team");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [eventType, setEventType] = useState<MatchEventType | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [subOnId, setSubOnId] = useState<string | null>(null);

  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const teamById = useMemo(() => new Map([home, away].map((team) => [team.id, team])), [home, away]);

  const teamPlayers = useMemo(() => {
    if (!teamId) return [];
    return players
      .filter((player) => player.team_id === teamId)
      .sort((a, b) => {
        if (a.is_starting !== b.is_starting) return a.is_starting ? -1 : 1;
        return a.jersey_number - b.jersey_number;
      });
  }, [players, teamId]);

  const benchPlayers = teamPlayers.filter((player) => player.is_bench && player.id !== playerId);

  function resetWizard() {
    setStep("team");
    setTeamId(null);
    setEventType(null);
    setPlayerId(null);
    setSubOnId(null);
  }

  function send(immediate?: {
    player?: string | null;
    secondary?: string | null;
  }) {
    if (!teamId || !eventType) return;

    const formData = new FormData();
    formData.set("match_id", matchId);
    formData.set("team_id", teamId);
    formData.set("event_type", eventType);
    formData.set("minute", String(minute));
    if (extraMinute.trim()) formData.set("extra_minute", extraMinute.trim());

    const scorer = immediate !== undefined ? (immediate.player ?? null) : (playerId ?? subOnId);
    if (scorer) formData.set("player_id", scorer);
    if (immediate?.secondary) formData.set("secondary_player_id", immediate.secondary);

    action(formData);
    setExtraMinute("");
    resetWizard();
  }

  function pickTeam(id: string) {
    setTeamId(id);
    setStep("event");
  }

  function pickEvent(type: MatchEventType) {
    setEventType(type);
    setStep("player");
  }

  function pickPlayer(id: string) {
    setPlayerId(id);
    if (eventType === "GOAL" || eventType === "PENALTY_GOAL") {
      setStep("assist");
      return;
    }
    if (eventType === "SUBSTITUTION") {
      setStep("sub-on");
      return;
    }
    send({ player: id });
  }

  const sortedEvents = [...events].sort(
    (a, b) => b.minute - a.minute || (b.extra_minute ?? 0) - (a.extra_minute ?? 0),
  );

  return (
    <div className="space-y-5">
      {/* Scoreboard ------------------------------------------------------- */}
      <div className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <Trophy className="h-3.5 w-3.5" />
            {stageType === "KNOCKOUT" ? "Knockout tie" : "Group / league match"}
          </div>
          <div className="flex items-center gap-1.5">
            {live ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold">
                <span className="live-dot" /> LIVE
              </span>
            ) : (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                {status.replace(/_/g, " ")}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-5 sm:gap-4">
          <div className="min-w-0 text-center sm:text-right">
            <p className="truncate font-display text-base font-semibold sm:text-lg">{home.name}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">{home.short_name}</p>
          </div>

          <div className="text-center">
            <p className="font-display text-4xl font-bold tabular-nums tracking-tight">
              {homeScore} <span className="text-slate-500">–</span> {awayScore}
            </p>
            {homePenalties !== null && awayPenalties !== null ? (
              <p className="mt-0.5 text-[11px] font-semibold text-emerald-300">
                pens {homePenalties}–{awayPenalties}
              </p>
            ) : null}
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-emerald-300">
              {live || finished ? formatClock(totalSeconds) : "--"}
            </p>
          </div>

          <div className="min-w-0 text-center sm:text-left">
            <p className="truncate font-display text-base font-semibold sm:text-lg">{away.name}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">{away.short_name}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 px-4 py-3">
          {live || finished ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums text-slate-300">
              <Clock className="h-3.5 w-3.5" />
              {minute}&apos;
              {extraMinute ? ` +${extraMinute}` : ""}
              <span className="text-[10px] font-normal uppercase tracking-wide text-slate-500">
                official time
              </span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Clock controls --------------------------------------------------- */}
      {canScore && !finished ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <p className="mr-auto text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Match state
          </p>

          {status === "SCHEDULED" ? (
            <form action={setMatchStateAction}>
              <input type="hidden" name="match_id" value={matchId} />
              <input type="hidden" name="status" value="FIRST_HALF" />
              <Button type="submit" size="sm">
                <Radio className="h-3.5 w-3.5" /> Start first half
              </Button>
            </form>
          ) : null}

          {status === "FIRST_HALF" ? (
            <form action={setMatchStateAction}>
              <input type="hidden" name="match_id" value={matchId} />
              <input type="hidden" name="status" value="HALF_TIME" />
              <Button type="submit" size="sm" variant="secondary">
                Half time
              </Button>
            </form>
          ) : null}

          {status === "HALF_TIME" ? (
            <form action={setMatchStateAction}>
              <input type="hidden" name="match_id" value={matchId} />
              <input type="hidden" name="status" value="SECOND_HALF" />
              <Button type="submit" size="sm">
                Start second half
              </Button>
            </form>
          ) : null}

          {status === "SECOND_HALF" && stageType === "KNOCKOUT" ? (
            <form action={setMatchStateAction}>
              <input type="hidden" name="match_id" value={matchId} />
              <input type="hidden" name="status" value="EXTRA_TIME" />
              <Button type="submit" size="sm" variant="secondary">
                Extra time
              </Button>
            </form>
          ) : null}

          {status === "EXTRA_TIME" ? (
            <form action={setMatchStateAction}>
              <input type="hidden" name="match_id" value={matchId} />
              <input type="hidden" name="status" value="PENALTIES" />
              <Button type="submit" size="sm" variant="secondary">
                Penalty shootout
              </Button>
            </form>
          ) : null}

          {status === "POSTPONED" ? (
            <form action={setMatchStateAction}>
              <input type="hidden" name="match_id" value={matchId} />
              <input type="hidden" name="status" value="FIRST_HALF" />
              <Button type="submit" size="sm">
                Kick off
              </Button>
            </form>
          ) : null}

          {["SECOND_HALF", "EXTRA_TIME", "PENALTIES"].includes(status) ? (
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">
                Sign off result…
              </summary>
              <form
                action={setMatchStateAction}
                className="absolute right-0 z-20 mt-1 w-64 space-y-2 rounded-lg border bg-card p-3 text-foreground shadow-xl"
              >
                <input type="hidden" name="match_id" value={matchId} />
                <input type="hidden" name="status" value="COMPLETED" />
                <p className="text-[11px] text-muted-foreground">
                  Full time locks the match, applies suspensions and advances the bracket. Cards
                  can no longer be edited.
                </p>
                <Button type="submit" size="sm" className="w-full">
                  Confirm full time
                </Button>
              </form>
            </details>
          ) : null}
        </div>
      ) : null}

      {finished ? (
        <Alert tone="success" title="Match signed off">
          The result is final and the public tables have been updated. Ask the organiser for a
          correction if something is wrong.
        </Alert>
      ) : null}

      {/* Event logger ----------------------------------------------------- */}
      {canScore && live ? (
        <div className="rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <p className="text-sm font-semibold">
              {step === "team"
                ? "1 · Which team?"
                : step === "event"
                  ? "2 · What happened?"
                  : step === "player"
                    ? "3 · Which player?"
                    : step === "assist"
                      ? "Assist (optional)"
                      : "Who came on?"}
            </p>
            <div className="flex items-center gap-1.5">
              <Badge variant="neutral">{minute}&apos;</Badge>
              {step !== "team" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (step === "event") setStep("team");
                    else if (step === "player") setStep("event");
                    else if (step === "assist" || step === "sub-on") setStep("player");
                    setPlayerId(null);
                    setSubOnId(null);
                  }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
              ) : null}
            </div>
          </div>

          <div className="p-4">
            <FormError message={state && !state.ok ? state.error : null} />
            {state?.ok && state.message ? (
              <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-900">
                {state.message}
              </p>
            ) : null}

            {step === "team" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[home, away].map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => pickTeam(team.id)}
                    className="flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-6 font-display text-base font-semibold transition-colors hover:border-primary hover:bg-primary-soft/40"
                  >
                    <span
                      className="h-4 w-4 rounded-full border"
                      style={{ backgroundColor: team.home_kit_color }}
                    />
                    {team.short_name}
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {team.name}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {step === "event" ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {EVENT_GROUPS.map((group) => (
                  <button
                    key={group.type}
                    type="button"
                    onClick={() => pickEvent(group.type)}
                    className="flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors hover:border-primary hover:bg-primary-soft/30"
                  >
                    <span className={cn("mb-1 h-1.5 w-8 rounded-full", group.tone)} />
                    <span className="text-xs font-semibold">{group.label}</span>
                    <span className="text-[10px] text-muted-foreground">{group.hint}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {step === "player" || step === "sub-on" ? (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  {step === "sub-on"
                    ? "Tap the player coming on. The player going off is already selected."
                    : eventType === "OWN_GOAL"
                      ? "Tap the player who put it into their own net."
                      : "Tap the player involved. Use “No player” for team events."}
                </p>
                <div className="grid max-h-72 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                  {(step === "sub-on" ? benchPlayers : teamPlayers).map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => {
                        if (step === "sub-on") {
                          setSubOnId(player.id);
                          send({ player: playerId, secondary: player.id });
                        } else {
                          pickPlayer(player.id);
                        }
                      }}
                      className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:border-primary hover:bg-primary-soft/30"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-900 text-[10px] font-bold text-white">
                        {player.jersey_number}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{player.full_name}</span>
                      <span className="text-[9px] font-semibold uppercase text-muted-foreground">
                        {player.position}
                      </span>
                      {player.is_bench ? <Badge variant="neutral">sub</Badge> : null}
                    </button>
                  ))}
                  {step === "sub-on" && benchPlayers.length === 0 ? (
                    <p className="py-4 text-center text-[11px] text-muted-foreground sm:col-span-2">
                      No substitutes listed for this team. Log the substitution without a player or
                      ask the manager to submit a bench.
                    </p>
                  ) : null}
                </div>

                {step === "player" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => send({ player: null })}
                  >
                    No player / team event
                  </Button>
                ) : null}
              </div>
            ) : null}

            {step === "assist" ? (
              <div className="space-y-2">
                <div className="grid max-h-72 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                  {teamPlayers
                    .filter((player) => player.id !== playerId)
                    .map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => send({ player: playerId, secondary: player.id })}
                        className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:border-primary hover:bg-primary-soft/30"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-900 text-[10px] font-bold text-white">
                          {player.jersey_number}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{player.full_name}</span>
                      </button>
                    ))}
                </div>
                <Button type="button" size="sm" onClick={() => send({ player: playerId })}>
                  No assist — log the goal
                </Button>
              </div>
            ) : null}

            <div className="mt-3 flex items-center gap-2 border-t pt-3">
              <label
                htmlFor="extra-minute"
                className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Stoppage
              </label>
              <Input
                id="extra-minute"
                inputMode="numeric"
                value={extraMinute}
                onChange={(event) => setExtraMinute(event.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                placeholder="+3"
                className="h-8 w-16 text-xs"
              />
              <span className="text-[11px] text-muted-foreground">
                Optional — added to the minute on the scoreboard.
              </span>
              {pending ? <span className="ml-auto text-[11px] text-muted-foreground">Saving…</span> : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Events feed ------------------------------------------------------ */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Match timeline</p>
          <Badge variant="neutral">{events.length}</Badge>
        </div>
        <div className="divide-y">
          {sortedEvents.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No events logged yet.
            </p>
          ) : (
            sortedEvents.map((event) => {
              const style = EVENT_STYLE[event.event_type];
              const team = teamById.get(event.team_id);
              const player = event.player_id ? playerById.get(event.player_id) : null;

              return (
                <div key={event.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-10 shrink-0 text-right font-display text-xs font-semibold tabular-nums text-muted-foreground">
                    {event.minute}&apos;{event.extra_minute ? `+${event.extra_minute}` : ""}
                  </span>
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      style.tone,
                    )}
                  >
                    {style.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">
                      {EVENT_LABEL[event.event_type]}
                      {player ? ` · #${player.jersey_number} ${player.full_name}` : ""}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {team?.short_name ?? "Team"}
                      {event.secondary_name
                        ? event.event_type === "SUBSTITUTION"
                          ? ` · off, ${event.secondary_name} on`
                          : ` · assist ${event.secondary_name}`
                        : ""}
                    </p>
                  </div>
                  {canScore && !finished ? (
                    <form action={deleteEventAction}>
                      <input type="hidden" name="match_id" value={matchId} />
                      <input type="hidden" name="event_id" value={event.id} />
                      <Button
                        type="submit"
                        size="icon-sm"
                        variant="ghost"
                        title="Undo this event"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      </Button>
                    </form>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Penalties + MVP --------------------------------------------------- */}
      {canManage ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Shield className="h-4 w-4 text-secondary" /> Penalty shootout
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Only for knockout ties level after extra time. Recording a shootout moves the match
              to the penalties state.
            </p>
            <form action={setPenaltiesAction} className="mt-3 space-y-2">
              <input type="hidden" name="match_id" value={matchId} />
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {home.short_name}
                  </p>
                  <Input
                    name="home_penalties"
                    type="number"
                    min={0}
                    max={30}
                    defaultValue={homePenalties ?? ""}
                    className="h-9 text-center font-display text-base font-semibold"
                  />
                </div>
                <span className="pb-2 text-xs text-muted-foreground">–</span>
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {away.short_name}
                  </p>
                  <Input
                    name="away_penalties"
                    type="number"
                    min={0}
                    max={30}
                    defaultValue={awayPenalties ?? ""}
                    className="h-9 text-center font-display text-base font-semibold"
                  />
                </div>
              </div>
              <Button type="submit" size="sm" variant="outline" className="w-full" disabled={finished}>
                Save shootout
              </Button>
            </form>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Star className="h-4 w-4 text-amber-500" /> Player of the match
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Shown on the public match centre and the player profile.
            </p>
            <form action={setMvpAction} className="mt-3 space-y-2">
              <input type="hidden" name="match_id" value={matchId} />
              <select
                name="mvp_player_id"
                defaultValue={mvpPlayerId ?? ""}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">No MVP selected</option>
                <optgroup label={home.name}>
                  {players
                    .filter((player) => player.team_id === home.id)
                    .sort((a, b) => a.jersey_number - b.jersey_number)
                    .map((player) => (
                      <option key={player.id} value={player.id}>
                        #{player.jersey_number} {player.full_name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label={away.name}>
                  {players
                    .filter((player) => player.team_id === away.id)
                    .sort((a, b) => a.jersey_number - b.jersey_number)
                    .map((player) => (
                      <option key={player.id} value={player.id}>
                        #{player.jersey_number} {player.full_name}
                      </option>
                    ))}
                </optgroup>
              </select>
              <Button type="submit" size="sm" variant="outline" className="w-full">
                Save MVP
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
