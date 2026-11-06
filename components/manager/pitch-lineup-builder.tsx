"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Sparkles, UserPlus, X } from "lucide-react";
import { saveLineupAction } from "@/app/actions/lineups";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { FORMATION_LAYOUTS, PITCH_FORMATIONS, type Formation } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Position } from "@/lib/database.types";

export interface SquadPlayer {
  id: string;
  full_name: string;
  jersey_number: number;
  position: Position;
  is_suspended: boolean;
  is_captain: boolean;
  photo_url: string | null;
}

const BENCH = -1;

const POSITION_COLOR: Record<Position, string> = {
  GK: "bg-amber-500",
  DEF: "bg-sky-600",
  MID: "bg-emerald-600",
  FWD: "bg-rose-500",
};

const POSITION_ORDER: Record<Position, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

export function PitchLineupBuilder({
  teamId,
  matchId,
  squad,
  initialFormation,
  initialAssignments,
  initialBench,
  locked,
}: {
  teamId: string;
  matchId: string;
  squad: SquadPlayer[];
  initialFormation: Formation;
  initialAssignments: Array<string | null>;
  initialBench: string[];
  locked: boolean;
}) {
  const [formation, setFormation] = useState<Formation>(initialFormation);
  const [assignments, setAssignments] = useState<Array<string | null>>(initialAssignments);
  const [bench, setBench] = useState<string[]>(initialBench);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const layout = FORMATION_LAYOUTS[formation];
  const playerById = useMemo(() => new Map(squad.map((player) => [player.id, player])), [squad]);
  const usedIds = new Set([...assignments.filter((id): id is string => Boolean(id)), ...bench]);
  const starterCount = assignments.slice(0, layout.length).filter(Boolean).length;

  const pickable = squad
    .filter((player) => !usedIds.has(player.id))
    .filter((player) => {
      const needle = query.trim().toLowerCase();
      if (!needle) return true;
      return (
        player.full_name.toLowerCase().includes(needle) ||
        String(player.jersey_number) === needle
      );
    })
    .sort(
      (a, b) =>
        POSITION_ORDER[a.position] - POSITION_ORDER[b.position] ||
        a.jersey_number - b.jersey_number,
    );

  function changeFormation(next: Formation) {
    const carried = layout
      .map((_, index) => assignments[index])
      .filter((id): id is string => Boolean(id));
    const nextLayout = FORMATION_LAYOUTS[next];
    const nextAssignments: Array<string | null> = nextLayout.map((_, index) => carried[index] ?? null);
    setFormation(next);
    setAssignments(nextAssignments);
    setActiveSlot(null);
  }

  function assign(playerId: string) {
    if (activeSlot === null) return;

    if (activeSlot === BENCH) {
      if (!bench.includes(playerId) && bench.length < 12) setBench([...bench, playerId]);
      setActiveSlot(null);
      setQuery("");
      return;
    }

    const next = assignments.map((id) => (id === playerId ? null : id));
    next[activeSlot] = playerId;
    setAssignments(next);
    setBench(bench.filter((id) => id !== playerId));
    setActiveSlot(null);
    setQuery("");
  }

  function clearSlot(index: number) {
    const next = [...assignments];
    next[index] = null;
    setAssignments(next);
  }

  function autoFill() {
    const next = [...assignments];
    const taken = new Set([...next.filter((id): id is string => Boolean(id)), ...bench]);
    const available = squad
      .filter((player) => !player.is_suspended)
      .sort((a, b) => a.jersey_number - b.jersey_number);

    layout.forEach((slot, index) => {
      if (next[index]) return;
      const candidate =
        available.find((player) => !taken.has(player.id) && player.position === slot.position) ??
        available.find((player) => !taken.has(player.id));
      if (candidate) {
        next[index] = candidate.id;
        taken.add(candidate.id);
      }
    });
    setAssignments(next);
  }

  const activePlayerId = activeSlot !== null && activeSlot >= 0 ? assignments[activeSlot] : null;

  return (
    <form action={saveLineupAction} className="space-y-5">
      <input type="hidden" name="match_id" value={matchId} />
      <input type="hidden" name="team_id" value={teamId} />
      {layout.map((slot, index) => {
        const playerId = assignments[index];
        if (!playerId) return null;
        return <input key={`${slot.slot}-${index}`} type="hidden" name="starting" value={`${slot.slot}:${playerId}`} />;
      })}
      {bench.map((playerId) => (
        <input key={playerId} type="hidden" name="substitute" value={playerId} />
      ))}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-40 space-y-1.5">
          <label
            htmlFor="formation"
            className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Formation
          </label>
          <Select
            id="formation"
            value={formation}
            onChange={(event) => changeFormation(event.target.value as Formation)}
            disabled={locked}
            className="h-9"
          >
            {PITCH_FORMATIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={starterCount === 11 ? "success" : "warning"}>
            {starterCount} / 11 starters
          </Badge>
          <Badge variant="info">{bench.length} / 12 subs</Badge>
          <Button type="button" size="sm" variant="outline" onClick={autoFill} disabled={locked}>
            <Sparkles className="h-3.5 w-3.5" /> Auto-fill
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div
          className="relative mx-auto w-full max-w-md overflow-hidden rounded-2xl border-4 border-white/70 shadow-lg"
          style={{
            aspectRatio: "3 / 4",
            background:
              "repeating-linear-gradient(0deg, #15803d 0px, #15803d 34px, #16a34a 34px, #16a34a 68px)",
          }}
        >
          <div className="pointer-events-none absolute inset-3 rounded-sm border-2 border-white/60" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/60" />
          <div className="pointer-events-none absolute left-1/2 top-3 h-[12%] w-[52%] -translate-x-1/2 border-2 border-t-0 border-white/60" />
          <div className="pointer-events-none absolute bottom-3 left-1/2 h-[12%] w-[52%] -translate-x-1/2 border-2 border-b-0 border-white/60" />

          {layout.map((slot, index) => {
            const playerId = assignments[index];
            const player = playerId ? playerById.get(playerId) : undefined;
            const isActive = activeSlot === index;

            return (
              <div
                key={`${slot.slot}-${index}`}
                className="absolute flex w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
                style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (locked) return;
                    setActiveSlot(isActive ? null : index);
                    setQuery("");
                  }}
                  disabled={locked}
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-full border-2 font-display text-xs font-bold shadow-md transition-transform",
                    player
                      ? "border-white text-white"
                      : "border-dashed border-white/80 bg-emerald-900/50 text-white/80",
                    isActive && "scale-110 ring-2 ring-white ring-offset-2 ring-offset-emerald-700",
                  )}
                  style={player ? { backgroundColor: POSITION_COLOR[player.position] } : undefined}
                  aria-label={`${slot.slot}: ${player ? player.full_name : "empty"}`}
                >
                  {player ? player.jersey_number : "+"}
                </button>
                <span className="max-w-[4.5rem] truncate rounded bg-slate-900/70 px-1 text-[9px] font-semibold text-white">
                  {player ? player.full_name.split(" ").slice(-1)[0] : slot.slot}
                </span>
              </div>
            );
          })}
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border bg-surface/60 p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {activeSlot === BENCH
                  ? "Pick a substitute"
                  : activeSlot !== null
                    ? `Pick a player for ${layout[activeSlot]?.slot ?? "this slot"}`
                    : "Tap a position to pick a player"}
              </p>
              {activeSlot !== null ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => {
                    setActiveSlot(null);
                    setQuery("");
                  }}
                  title="Close picker"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>

            {activeSlot !== null ? (
              <div className="mt-2 space-y-2">
                <Input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name or number"
                  className="h-8 text-xs"
                />
                {activeSlot >= 0 && activePlayerId ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      clearSlot(activeSlot);
                      setActiveSlot(null);
                    }}
                  >
                    <X className="h-3.5 w-3.5" /> Remove from XI
                  </Button>
                ) : null}
                <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                  {pickable.length === 0 ? (
                    <p className="py-4 text-center text-[11px] text-muted-foreground">
                      Every eligible player is already on the sheet.
                    </p>
                  ) : (
                    pickable.map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => assign(player.id)}
                        disabled={player.is_suspended}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                          player.is_suspended
                            ? "cursor-not-allowed border-rose-200 bg-rose-50 text-rose-700"
                            : "hover:border-primary hover:bg-primary-soft/40",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white",
                            POSITION_COLOR[player.position],
                          )}
                        >
                          {player.jersey_number}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {player.full_name}
                          {player.is_captain ? " (C)" : ""}
                        </span>
                        {player.is_suspended ? (
                          <Badge variant="danger">suspended</Badge>
                        ) : (
                          <Badge variant="neutral">{player.position}</Badge>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Suspended players are listed but cannot be selected. Jersey numbers come straight
                from the squad sheet.
              </p>
            )}
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Substitutes
              </p>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={() => {
                  setActiveSlot(activeSlot === BENCH ? null : BENCH);
                  setQuery("");
                }}
                disabled={locked || bench.length >= 12}
                title="Add a substitute"
              >
                <UserPlus className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="mt-2 space-y-1">
              {bench.length === 0 ? (
                <p className="py-2 text-[11px] text-muted-foreground">
                  No substitutes named yet — up to 12 allowed.
                </p>
              ) : (
                bench.map((playerId) => {
                  const player = playerById.get(playerId);
                  if (!player) return null;
                  return (
                    <div
                      key={playerId}
                      className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white",
                          POSITION_COLOR[player.position],
                        )}
                      >
                        {player.jersey_number}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{player.full_name}</span>
                      <button
                        type="button"
                        onClick={() => setBench(bench.filter((id) => id !== playerId))}
                        disabled={locked}
                        className="rounded p-0.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                        title="Remove substitute"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {starterCount !== 11 ? (
        <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Pick exactly 11 starters before submitting. {11 - starterCount} slot
          {11 - starterCount === 1 ? "" : "s"} still open.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Lineups freeze at kickoff. Suspended players are blocked by the server as well.
        </p>
        <SubmitButton
          pendingLabel="Submitting…"
          disabled={locked || starterCount !== 11}
          className="min-w-40"
        >
          Submit lineup
        </SubmitButton>
      </div>
    </form>
  );
}
