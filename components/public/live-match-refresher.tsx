"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

/**
 * Keeps server-rendered scoreboards in sync while a tournament is being played.
 * Clock ticks are handled locally; this only refreshes when the underlying
 * match row changes (goal, status, clock start/pause).
 */
export function LiveMatchRefresher({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`tournament-live:${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => {
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => router.refresh(), 900);
        },
      )
      .subscribe();

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [router, tournamentId]);

  return null;
}
