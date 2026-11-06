import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * The teams table has no coach or extra-registration columns. A small JSON
 * document per team keeps the coach and any organiser-defined entry fields
 * (student ID, faculty, etc.) without touching the database schema.
 */
export const TEAM_PROFILE_BUCKET = "site-content";

export type TeamProfile = {
  coachName: string | null;
  coachPhone: string | null;
  coachEmail: string | null;
  fields: Record<string, string>;
  updatedAt: string | null;
};

export const EMPTY_TEAM_PROFILE: TeamProfile = {
  coachName: null,
  coachPhone: null,
  coachEmail: null,
  fields: {},
  updatedAt: null,
};

export function teamProfilePath(teamId: string): string {
  return `teams/${teamId}/profile.json`;
}

function clean(value: unknown, max = 120): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length ? trimmed : null;
}

function storageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function readTeamProfile(teamId: string): Promise<TeamProfile> {
  if (!storageConfigured()) return { ...EMPTY_TEAM_PROFILE };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(TEAM_PROFILE_BUCKET)
      .download(teamProfilePath(teamId));

    if (error || !data) return { ...EMPTY_TEAM_PROFILE };

    const parsed = JSON.parse(await data.text()) as Record<string, unknown>;
    const fields: Record<string, string> = {};
    if (parsed.fields && typeof parsed.fields === "object") {
      for (const [key, value] of Object.entries(parsed.fields as Record<string, unknown>)) {
        if (!/^[a-z0-9]{2,24}$/.test(key)) continue;
        const text = clean(value, 160);
        if (text) fields[key] = text;
      }
    }

    return {
      coachName: clean(parsed.coachName),
      coachPhone: clean(parsed.coachPhone, 40),
      coachEmail: clean(parsed.coachEmail),
      fields,
      updatedAt: clean(parsed.updatedAt, 40),
    };
  } catch {
    return { ...EMPTY_TEAM_PROFILE };
  }
}

export async function saveTeamProfile(
  teamId: string,
  profile: Omit<TeamProfile, "updatedAt">,
): Promise<void> {
  const admin = createAdminClient();
  const payload: TeamProfile = {
    coachName: clean(profile.coachName),
    coachPhone: clean(profile.coachPhone, 40),
    coachEmail: clean(profile.coachEmail),
    fields: profile.fields,
    updatedAt: new Date().toISOString(),
  };

  const { error } = await admin.storage
    .from(TEAM_PROFILE_BUCKET)
    .upload(teamProfilePath(teamId), JSON.stringify(payload, null, 2), {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    });

  if (error) throw new Error(error.message);
}
