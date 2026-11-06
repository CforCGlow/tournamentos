import { readTeamSubmission, saveTeamSubmission } from "@/lib/team-submission";
import { addNotification } from "@/lib/notifications";

export function reviewHref(
  tenantSlug: string,
  tournamentId: string,
  teamId: string,
): string {
  return `/dashboard/${tenantSlug}/tournaments/${tournamentId}/teams/${teamId}`;
}

/** Organiser alert raised the moment a manager submits a team. */
export async function notifyTeamSubmitted({
  tenantId,
  tenantSlug,
  tournamentId,
  teamId,
  teamName,
  squadSize,
}: {
  tenantId: string;
  tenantSlug: string;
  tournamentId: string;
  teamId: string;
  teamName: string;
  squadSize: number;
}): Promise<void> {
  await addNotification(tenantId, {
    kind: "TEAM_SUBMITTED",
    title: `${teamName} submitted for review`,
    body: `${squadSize} player${squadSize === 1 ? "" : "s"} ready. Open the submission to approve or reject it.`,
    href: reviewHref(tenantSlug, tournamentId, teamId),
  });
}

/**
 * Called after any manager edit. Once an organiser has received a submission,
 * later changes stay visible but are marked as awaiting approval and raise a
 * fresh notification. Before the first submission there is nothing to review.
 */
export async function noteManagerEdit({
  teamId,
  tenantId,
  tenantSlug,
  tournamentId,
  teamName,
  what,
}: {
  teamId: string;
  tenantId: string;
  tenantSlug: string;
  tournamentId: string;
  teamName: string;
  what: string;
}): Promise<void> {
  const submission = await readTeamSubmission(teamId);
  if (!submission) return;

  const now = new Date().toISOString();
  try {
    await saveTeamSubmission(teamId, {
      ...submission,
      changesPending: true,
      updatedAt: now,
    });
  } catch {
    // The edit itself already succeeded; a review flag failure must not undo it.
    return;
  }

  await addNotification(tenantId, {
    kind: "TEAM_UPDATED",
    title: `${teamName} updated its entry`,
    body: `${what}. Review the change and approve the team again.`,
    href: reviewHref(tenantSlug, tournamentId, teamId),
  });
}

/** Marks the organiser's decision so the manager card stops asking for review. */
export async function markSubmissionReviewed(teamId: string): Promise<void> {
  const submission = await readTeamSubmission(teamId);
  if (!submission) return;

  try {
    await saveTeamSubmission(teamId, {
      ...submission,
      changesPending: false,
      reviewedAt: new Date().toISOString(),
    });
  } catch {
    // Approval already landed in the teams table; the flag is cosmetic.
  }
}
