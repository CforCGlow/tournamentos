import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/utils/supabase/admin";
import type { MatchClockState, MatchClockView } from "@/lib/clock";

/**
 * Live clock snapshots are featherweight JSON documents, one per match.
 *
 * They live beside the editable site copy in the `site-content` bucket rather
 * than in Postgres: the clock is ephemeral broadcast state, and this keeps the
 * tournament schema untouched while still letting every viewer read the same
 * server-anchored clock.
 */
export const MATCH_CLOCK_BUCKET = "site-content";
export const MATCH_CLOCK_FOLDER = "live";

export function matchClockPath(matchId: string): string {
  return `${MATCH_CLOCK_FOLDER}/${matchId}.json`;
}

function storageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Uncached read. Used by the public clock endpoint so every poll sees the
 * latest publish; the authenticated storage endpoint bypasses the CDN copy
 * with a cache-busting query, just like the home-page copy.
 */
export async function readMatchClock(matchId: string): Promise<MatchClockView | null> {
  if (!storageConfigured()) return null;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !key) return null;

  const url = `${base.replace(/\/$/, "")}/storage/v1/object/authenticated/${MATCH_CLOCK_BUCKET}/${matchClockPath(matchId)}?v=${Date.now()}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, apikey: key },
      cache: "no-store",
    });

    if (!response.ok) return null;

    const parsed = (await response.json()) as Partial<MatchClockState>;
    if (!parsed || typeof parsed !== "object" || !parsed.status) return null;

    return {
      status: parsed.status,
      startedAt: parsed.startedAt ?? null,
      elapsedSeconds: Math.max(0, Number(parsed.elapsedSeconds) || 0),
      running: Boolean(parsed.running),
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      serverNow: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Per-render memoised read for server components that use the clock twice. */
export const getMatchClock = cache(readMatchClock);

export async function getMatchClocks(matchIds: string[]): Promise<Map<string, MatchClockView>> {
  const unique = Array.from(new Set(matchIds.filter(Boolean)));
  const entries = await Promise.all(
    unique.map(async (id) => [id, await readMatchClock(id)] as const),
  );

  return new Map(
    entries.filter((entry): entry is readonly [string, MatchClockView] => Boolean(entry[1])),
  );
}

export async function saveMatchClock(
  matchId: string,
  clock: MatchClockState,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(MATCH_CLOCK_BUCKET)
    .upload(matchClockPath(matchId), JSON.stringify(clock, null, 2), {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    });

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteMatchClock(matchId: string): Promise<void> {
  if (!storageConfigured()) return;

  try {
    const admin = createAdminClient();
    await admin.storage.from(MATCH_CLOCK_BUCKET).remove([matchClockPath(matchId)]);
  } catch {
    // A missing snapshot is already the desired state.
  }
}
