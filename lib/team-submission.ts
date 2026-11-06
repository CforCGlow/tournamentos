import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Manager team submissions are tiny JSON documents, one per team, stored beside
 * the editable site copy. The clock feature uses the same pattern: the teams
 * table has no draft/submitted state, and this keeps the schema untouched while
 * still letting managers declare a team ready for review.
 */
export const TEAM_SUBMISSION_BUCKET = "site-content";

export type TeamSubmission = {
  submittedAt: string;
  squadSize: number;
  /** Last manager edit after the organiser received the submission. */
  updatedAt?: string;
  /** True while edits wait for the organiser to review them again. */
  changesPending?: boolean;
  /** Last time an organiser approved this submission. */
  reviewedAt?: string;
};

export function teamSubmissionPath(teamId: string): string {
  return `teams/${teamId}/submission.json`;
}

function storageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function readTeamSubmission(teamId: string): Promise<TeamSubmission | null> {
  if (!storageConfigured()) return null;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !key) return null;

  const url = `${base.replace(/\/$/, "")}/storage/v1/object/authenticated/${TEAM_SUBMISSION_BUCKET}/${teamSubmissionPath(teamId)}?v=${Date.now()}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, apikey: key },
      cache: "no-store",
    });

    if (!response.ok) return null;

    const parsed = (await response.json()) as Partial<TeamSubmission>;
    if (!parsed || typeof parsed !== "object" || !parsed.submittedAt) return null;

    return {
      submittedAt: parsed.submittedAt,
      squadSize: Math.max(0, Number(parsed.squadSize) || 0),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
      changesPending: parsed.changesPending === true,
      reviewedAt: typeof parsed.reviewedAt === "string" ? parsed.reviewedAt : undefined,
    };
  } catch {
    return null;
  }
}

/** Per-render memoised read for pages that render the same submission twice. */
export const getTeamSubmission = cache(readTeamSubmission);

export async function getTeamSubmissions(
  teamIds: string[],
): Promise<Map<string, TeamSubmission>> {
  const unique = Array.from(new Set(teamIds.filter(Boolean)));
  const entries = await Promise.all(
    unique.map(async (id) => [id, await readTeamSubmission(id)] as const),
  );

  return new Map(
    entries.filter(
      (entry): entry is readonly [string, TeamSubmission] => Boolean(entry[1]),
    ),
  );
}

export async function saveTeamSubmission(
  teamId: string,
  submission: TeamSubmission,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(TEAM_SUBMISSION_BUCKET)
    .upload(teamSubmissionPath(teamId), JSON.stringify(submission, null, 2), {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    });

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteTeamSubmission(teamId: string): Promise<void> {
  if (!storageConfigured()) return;

  try {
    const admin = createAdminClient();
    await admin.storage.from(TEAM_SUBMISSION_BUCKET).remove([teamSubmissionPath(teamId)]);
  } catch {
    // A missing submission is already the desired state.
  }
}
