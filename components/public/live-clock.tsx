"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { LIVE_STATUSES } from "@/lib/constants";
import {
  clockTotalSeconds,
  formatClock,
  formatMatchMinute,
  type MatchClockView,
} from "@/lib/clock";
import { cn } from "@/lib/utils";

/**
 * Server-anchored, self-ticking match clock.
 *
 * The server supplies the anchor and its own `serverNow`; the browser corrects
 * for device clock drift and ticks locally every second. A light poll picks up
 * starts, pauses and corrections started from another device.
 */
export function LiveClock({
  matchId,
  initial = null,
  variant = "clock",
  size = "default",
  showIdle = false,
  className,
}: {
  matchId: string;
  initial?: MatchClockView | null;
  variant?: "clock" | "minute";
  size?: "default" | "large" | "small";
  showIdle?: boolean;
  className?: string;
}) {
  const [clock, setClock] = useState<MatchClockView | null>(initial);
  // Start from the server timestamp so server render and hydration agree; the
  // interval switches to the local clock once mounted.
  const [now, setNow] = useState(() =>
    initial ? new Date(initial.serverNow).getTime() : Date.now(),
  );
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!initial) return;
    setClock(initial);
    setOffset(new Date(initial.serverNow).getTime() - Date.now());
  }, [initial, initial?.updatedAt, initial?.serverNow]);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const response = await fetch(`/api/matches/${matchId}/clock`, {
          cache: "no-store",
        });
        if (!alive) return;
        if (!response.ok) {
          setClock(null);
          return;
        }

        const payload = (await response.json()) as {
          clock: MatchClockView | null;
          serverNow?: string;
        };

        setClock(payload.clock ?? null);
        if (payload.serverNow) {
          setOffset(new Date(payload.serverNow).getTime() - Date.now());
        }
      } catch {
        // Keep the last known clock while the network is unavailable.
      }
    }

    void load();
    const timer = window.setInterval(load, 8000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [matchId]);

  const visible = clock && LIVE_STATUSES.includes(clock.status);
  const seconds = visible ? clockTotalSeconds(clock, now + offset) : 0;
  const label =
    variant === "minute" ? formatMatchMinute(seconds) : formatClock(seconds);

  const display = useMemo(() => {
    if (!visible && !showIdle) return null;
    return {
      label: visible ? label : variant === "minute" ? "0'" : "00:00",
      paused: visible ? clock.status === "HALF_TIME" : false,
      running: Boolean(visible && clock.running),
    };
  }, [visible, showIdle, label, variant, clock?.status, clock?.running]);

  if (!display) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-semibold tabular-nums",
        size === "large" && "text-lg",
        size === "small" && "text-[11px]",
        size === "default" && "text-sm",
        !visible && "text-muted-foreground",
        display.paused && "text-amber-600",
        className,
      )}
    >
      <Clock
        className={cn(
          "shrink-0",
          size === "large" ? "h-4 w-4" : size === "small" ? "h-3 w-3" : "h-3.5 w-3.5",
        )}
      />
      {display.label}
      {display.paused ? <span className="text-[9px] tracking-wide">HT</span> : null}
      {display.running ? <span className="live-dot" /> : null}
    </span>
  );
}
