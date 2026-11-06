import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/utils/supabase/admin";
import { isPitchSize, type PitchSize } from "@/lib/pitch";

/**
 * Per-tournament registration rules live in a JSON document beside the editable
 * site copy. The schema has no columns for these switches, and keeping them here
 * lets organisers change entry requirements without a deploy or migration.
 */
export const TOURNAMENT_SETTINGS_BUCKET = "site-content";

export type RegistrationField = {
  id: string;
  label: string;
  required: boolean;
};

export type TournamentSettings = {
  requireIdDocument: boolean;
  requirePlayerPhoto: boolean;
  fields: RegistrationField[];
  venuePitch: Record<string, PitchSize>;
};

export const DEFAULT_TOURNAMENT_SETTINGS: TournamentSettings = {
  requireIdDocument: true,
  requirePlayerPhoto: false,
  fields: [],
  venuePitch: {},
};

export function tournamentSettingsPath(tournamentId: string): string {
  return `tournaments/${tournamentId}/settings.json`;
}

function storageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function normaliseField(raw: unknown): RegistrationField | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const label = typeof value.label === "string" ? value.label.trim().slice(0, 60) : "";
  if (label.length < 2) return null;
  const id =
    typeof value.id === "string" && /^[a-z0-9]{2,24}$/.test(value.id)
      ? value.id
      : `field_${Math.random().toString(36).slice(2, 8)}`;
  return { id, label, required: value.required === true };
}

export function normaliseTournamentSettings(raw: unknown): TournamentSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_TOURNAMENT_SETTINGS };
  const source = raw as Record<string, unknown>;

  const fields = Array.isArray(source.fields)
    ? source.fields
        .map(normaliseField)
        .filter((field): field is RegistrationField => Boolean(field))
        .slice(0, 8)
    : [];

  const venuePitch: Record<string, PitchSize> = {};
  if (source.venuePitch && typeof source.venuePitch === "object") {
    for (const [venueId, size] of Object.entries(source.venuePitch as Record<string, unknown>)) {
      if (isPitchSize(size)) venuePitch[venueId] = size;
    }
  }

  return {
    requireIdDocument: source.requireIdDocument !== false,
    requirePlayerPhoto: source.requirePlayerPhoto === true,
    fields,
    venuePitch,
  };
}

export async function readTournamentSettings(
  tournamentId: string,
): Promise<TournamentSettings> {
  if (!storageConfigured()) return { ...DEFAULT_TOURNAMENT_SETTINGS };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(TOURNAMENT_SETTINGS_BUCKET)
      .download(tournamentSettingsPath(tournamentId));

    if (error || !data) return { ...DEFAULT_TOURNAMENT_SETTINGS };

    const parsed = JSON.parse(await data.text()) as unknown;
    return normaliseTournamentSettings(parsed);
  } catch {
    return { ...DEFAULT_TOURNAMENT_SETTINGS };
  }
}

/** Per-request memoisation for pages that read the settings more than once. */
export const getTournamentSettings = cache(readTournamentSettings);

export async function saveTournamentSettings(
  tournamentId: string,
  settings: TournamentSettings,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(TOURNAMENT_SETTINGS_BUCKET)
    .upload(
      tournamentSettingsPath(tournamentId),
      JSON.stringify(normaliseTournamentSettings(settings), null, 2),
      { contentType: "application/json", cacheControl: "0", upsert: true },
    );

  if (error) throw new Error(error.message);
}

export async function setVenuePitchSize(
  tournamentId: string,
  venueId: string,
  size: PitchSize,
): Promise<void> {
  const current = await readTournamentSettings(tournamentId);
  const venuePitch = { ...current.venuePitch, [venueId]: size };
  await saveTournamentSettings(tournamentId, { ...current, venuePitch });
}

export async function removeVenuePitchSize(
  tournamentId: string,
  venueId: string,
): Promise<void> {
  const current = await readTournamentSettings(tournamentId);
  if (!(venueId in current.venuePitch)) return;
  const venuePitch = { ...current.venuePitch };
  delete venuePitch[venueId];
  await saveTournamentSettings(tournamentId, { ...current, venuePitch });
}

export function fieldInputName(fieldId: string): string {
  return `field_${fieldId}`;
}

/** Labels of organiser-defined fields that are required but still blank. */
export function missingRequiredFields(
  settings: TournamentSettings,
  values: Record<string, string> | null | undefined,
): string[] {
  return settings.fields
    .filter((field) => field.required)
    .filter((field) => {
      const value = values?.[field.id];
      return !value || value.trim().length === 0;
    })
    .map((field) => field.label);
}
