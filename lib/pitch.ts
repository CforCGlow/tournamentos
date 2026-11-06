import type { PitchType } from "@/lib/database.types";

/**
 * Pitches are stored on `venues.pitch_type`, whose check constraint only allows
 * three legacy values. The full range is kept in the per-tournament settings
 * document and mapped onto the closest allowed database value so organisers can
 * use 5v5 through 11v11 without a schema migration.
 */
export const PITCH_SIZES = [
  "5v5",
  "6v6",
  "7v7",
  "8v8",
  "9v9",
  "10v10",
  "11v11",
] as const;

export type PitchSize = (typeof PITCH_SIZES)[number];

export const PITCH_SIZE_LABEL: Record<PitchSize, string> = {
  "5v5": "5 v 5",
  "6v6": "6 v 6",
  "7v7": "7 v 7",
  "8v8": "8 v 8",
  "9v9": "9 v 9",
  "10v10": "10 v 10",
  "11v11": "11 v 11",
};

const PITCH_SIZE_DB: Record<PitchSize, PitchType> = {
  "5v5": "5v5_futsal",
  "6v6": "5v5_futsal",
  "7v7": "7v7",
  "8v8": "7v7",
  "9v9": "11v11",
  "10v10": "11v11",
  "11v11": "11v11",
};

export function isPitchSize(value: unknown): value is PitchSize {
  return typeof value === "string" && (PITCH_SIZES as readonly string[]).includes(value);
}

export function pitchDbValue(size: PitchSize): PitchType {
  return PITCH_SIZE_DB[size];
}

export function pitchLabel(size: string | null | undefined): string {
  return isPitchSize(size) ? PITCH_SIZE_LABEL[size] : "11 v 11";
}
