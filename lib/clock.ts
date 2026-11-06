import type { MatchStatus } from "@/lib/database.types";

/**
 * Shared match-clock model.
 *
 * The clock is stored as an anchor (`startedAt`) plus the seconds accumulated
 * before the current running segment. Keeping it in plain seconds means the
 * same state can be rendered on the server, ticked in the browser, and resumed
 * from any device without trusting a client clock.
 *
 * This module is deliberately free of server-only imports so the public clock
 * component can use the same maths as the actions and API routes.
 */
export interface MatchClockState {
  status: MatchStatus;
  startedAt: string | null;
  elapsedSeconds: number;
  running: boolean;
  updatedAt: string;
}

export interface MatchClockView extends MatchClockState {
  /** Server time at the moment the state was read, used to correct device clock drift. */
  serverNow: string;
}

const MAX_SECONDS = 130 * 60;

/** Minute a period starts from when the clock is not available yet. */
export const PERIOD_BASE_MINUTE: Partial<Record<MatchStatus, number>> = {
  FIRST_HALF: 0,
  HALF_TIME: 45,
  SECOND_HALF: 45,
  EXTRA_TIME: 90,
  PENALTIES: 120,
  COMPLETED: 90,
};

const PERIOD_BASE_SECONDS: Partial<Record<MatchStatus, number>> = {
  FIRST_HALF: 0,
  HALF_TIME: 45 * 60,
  SECOND_HALF: 45 * 60,
  EXTRA_TIME: 90 * 60,
  PENALTIES: 120 * 60,
};

export function clockTotalSeconds(
  clock: Pick<MatchClockState, "startedAt" | "elapsedSeconds" | "running">,
  now = Date.now(),
): number {
  const accumulated = Math.max(0, Number(clock.elapsedSeconds) || 0);

  if (!clock.running || !clock.startedAt) {
    return Math.min(MAX_SECONDS, accumulated);
  }

  const started = new Date(clock.startedAt).getTime();
  if (Number.isNaN(started)) return Math.min(MAX_SECONDS, accumulated);

  const runningFor = Math.max(0, (now - started) / 1000);
  return Math.min(MAX_SECONDS, accumulated + runningFor);
}

export function clockMinute(
  clock: Pick<MatchClockState, "startedAt" | "elapsedSeconds" | "running">,
  now = Date.now(),
): number {
  return Math.min(130, Math.floor(clockTotalSeconds(clock, now) / 60));
}

/** `34:07` — seconds included so spectators can see the clock moving. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.min(MAX_SECONDS, Math.max(0, Math.floor(totalSeconds)));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** `34'` — compact form for fixture cards. */
export function formatMatchMinute(totalSeconds: number): string {
  return `${Math.min(130, Math.floor(Math.max(0, totalSeconds) / 60))}'`;
}

/**
 * Clock values that follow a match status change.
 *
 * Starting a period anchors the clock to now. Pausing freezes the accumulated
 * seconds. Moving to a later period catches the clock up to that period's
 * minimum (45', 90', 120') so a late "start second half" click never rewinds it.
 */
export function clockForStatus(
  current: MatchClockState | null,
  status: MatchStatus,
  now = new Date(),
): MatchClockState {
  const timestamp = now.toISOString();
  const total = current ? clockTotalSeconds(current, now.getTime()) : 0;
  const base = PERIOD_BASE_SECONDS[status] ?? 0;

  if (status === "FIRST_HALF") {
    return {
      status,
      startedAt: timestamp,
      elapsedSeconds: 0,
      running: true,
      updatedAt: timestamp,
    };
  }

  if (status === "HALF_TIME" || status === "COMPLETED") {
    return {
      status,
      startedAt: null,
      elapsedSeconds: total,
      running: false,
      updatedAt: timestamp,
    };
  }

  if (
    status === "SECOND_HALF" ||
    status === "EXTRA_TIME" ||
    status === "PENALTIES"
  ) {
    return {
      status,
      startedAt: timestamp,
      elapsedSeconds: Math.max(total, base),
      running: true,
      updatedAt: timestamp,
    };
  }

  return {
    status,
    startedAt: null,
    elapsedSeconds: 0,
    running: false,
    updatedAt: timestamp,
  };
}

/** Set the clock to a specific match minute, keeping it running if it was. */
export function clockForMinute(
  current: MatchClockState | null,
  status: MatchStatus,
  minute: number,
  now = new Date(),
): MatchClockState {
  const timestamp = now.toISOString();
  const clamped = Math.min(130, Math.max(0, Math.floor(minute)));
  const running = Boolean(current?.running);

  return {
    status,
    startedAt: running ? timestamp : null,
    elapsedSeconds: clamped * 60,
    running,
    updatedAt: timestamp,
  };
}
