"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ClipboardCheck, Radio, Trophy } from "lucide-react";
import type { SiteContent } from "@/lib/site-content";

const STAGES = [
  { key: "entries", icon: ClipboardCheck, x: 12 },
  { key: "fixtures", icon: CalendarClock, x: 37.33 },
  { key: "scores", icon: Radio, x: 62.67 },
  { key: "table", icon: Trophy, x: 88 },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

function Football({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="14" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.5" />
      <polygon points="16,9 21,13 19,19 13,19 11,13" fill="#0f172a" />
      <path
        d="M16 9V3M21 13l5-2M19 19l3 5M13 19l-3 5M11 13L6 11"
        stroke="#0f172a"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TournamentLoop({ copy }: { copy: SiteContent["loop"] }) {
  const [step, setStep] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      setStep((current) => (current + 1) % STAGES.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  const active = STAGES[step] ?? STAGES[0];
  const activeCopy = copy[active.key as StageKey];
  const progress = ((active.x - STAGES[0].x) / (88 - STAGES[0].x)) * 76;
  const resetting = active.x === STAGES[0].x;

  return (
    <div className="relative min-w-0">
      <div
        className="absolute -inset-4 animate-[pulse_8s_ease-in-out_infinite] rounded-3xl bg-emerald-400/10 blur-2xl"
        aria-hidden
      />
      <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-slate-950/70 shadow-2xl backdrop-blur">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="pitch-grid absolute inset-0 opacity-[0.22]" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/25" />
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
        </div>

        <div className="relative border-b border-white/10 px-4 py-3 sm:px-5">
          <span className="text-[10px] font-semibold uppercase leading-relaxed tracking-[0.12em] text-white/60">
            {copy.title}
          </span>
        </div>

        <div className="relative h-60 px-3 pb-6 pt-7 sm:h-64 sm:px-6 sm:pb-6 sm:pt-8">
          {STAGES.map((stage, index) => {
            const isActive = index === step;
            const stageCopy = copy[stage.key as StageKey];
            return (
              <div
                key={stage.key}
                className="absolute top-7 flex w-14 -translate-x-1/2 flex-col items-center gap-2 sm:top-8 sm:w-16"
                style={{ left: `${stage.x}%` }}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-500 sm:h-10 sm:w-10 ${
                    isActive
                      ? "border-emerald-300/60 bg-emerald-400 text-emerald-950 shadow-[0_0_24px_rgba(52,211,153,0.45)]"
                      : "border-white/10 bg-white/5 text-white/55"
                  }`}
                >
                  <stage.icon className="h-4 w-4" />
                </span>
                <span
                  className={`text-[9px] font-semibold uppercase leading-tight tracking-[0.1em] transition-colors duration-500 sm:text-[10px] sm:tracking-[0.12em] ${
                    isActive ? "text-emerald-300" : "text-white/40"
                  }`}
                >
                  {stageCopy.label}
                </span>
              </div>
            );
          })}

          <div
            className="absolute left-[12%] right-[12%] top-[62%] h-px bg-white/15"
            aria-hidden
          />
          <div
            className="absolute top-[62%] h-px bg-emerald-400/70 transition-all duration-700 ease-out"
            style={{ left: "12%", width: `${progress}%`, transition: resetting ? "none" : undefined }}
            aria-hidden
          />

          <div
            className="absolute top-[62%] z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 transition-all duration-700 ease-out sm:h-6 sm:w-6"
            style={{ left: `${active.x}%`, transition: resetting ? "none" : undefined }}
            aria-hidden
          >
            {reducedMotion ? null : (
              <span className="absolute inset-0 animate-[ping_2.2s_ease-out_infinite] rounded-full bg-emerald-400/40" />
            )}
            <Football className="relative h-5 w-5 drop-shadow-md sm:h-6 sm:w-6" />
          </div>

          <p className="absolute inset-x-4 bottom-4 text-center text-[11px] leading-relaxed text-white/50 sm:inset-x-6">
            {activeCopy.hint}
          </p>
        </div>
      </div>
    </div>
  );
}
