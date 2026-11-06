import type { PlayerRow, TeamRow } from "@/lib/database.types";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export type ReadinessCheck = {
  key: "identity" | "squad" | "payment" | "documents" | "fields";
  label: string;
  ok: boolean;
  detail: string;
};

export type TeamReadiness = {
  ready: boolean;
  checks: ReadinessCheck[];
  missing: string[];
};

type ReadinessTeam = Pick<
  TeamRow,
  | "name"
  | "short_name"
  | "home_kit_color"
  | "away_kit_color"
  | "payment_transaction_id"
  | "payment_proof_url"
>;

type ReadinessPlayer = Pick<PlayerRow, "full_name" | "photo_url" | "id_document_url">;

/**
 * The single definition of "ready to submit". Used by the manager checklist,
 * the submit action and the organiser approval guard so all three agree.
 */
export function assessTeamReadiness({
  team,
  squadSize,
  minSquadSize,
  registrationFee,
  players,
  requireIdDocument = false,
  requirePlayerPhoto = false,
  missingFields = [],
}: {
  team: ReadinessTeam;
  squadSize: number;
  minSquadSize: number;
  registrationFee: number;
  players?: ReadinessPlayer[];
  requireIdDocument?: boolean;
  requirePlayerPhoto?: boolean;
  missingFields?: string[];
}): TeamReadiness {
  const requiredSquad = Math.max(1, minSquadSize);

  const identityOk =
    team.name.trim().length >= 2 &&
    /^[A-Za-z0-9]{2,4}$/.test(team.short_name) &&
    HEX_COLOR.test(team.home_kit_color) &&
    HEX_COLOR.test(team.away_kit_color);

  const squadOk = squadSize >= requiredSquad;
  const feeRequired = registrationFee > 0;
  const paymentOk =
    !feeRequired || Boolean(team.payment_transaction_id || team.payment_proof_url);

  const checks: ReadinessCheck[] = [
    {
      key: "identity",
      label: "Team identity",
      ok: identityOk,
      detail: identityOk
        ? "Name, short code and both kit colours are set."
        : "Add the team name, short code and both kit colours.",
    },
    {
      key: "squad",
      label: "Minimum squad",
      ok: squadOk,
      detail: squadOk
        ? `${squadSize} players registered. Minimum is ${requiredSquad}.`
        : `${squadSize} of ${requiredSquad} players registered.`,
    },
  ];

  if (requireIdDocument || requirePlayerPhoto) {
    const roster = players ?? [];
    const missingIds = requireIdDocument
      ? roster.filter((player) => !player.id_document_url)
      : [];
    const missingPhotos = requirePlayerPhoto
      ? roster.filter((player) => !player.photo_url)
      : [];
    const documentsOk = missingIds.length === 0 && missingPhotos.length === 0;

    const parts: string[] = [];
    if (missingIds.length) {
      parts.push(
        `${missingIds.length} player${missingIds.length === 1 ? "" : "s"} without an ID`,
      );
    }
    if (missingPhotos.length) {
      parts.push(
        `${missingPhotos.length} player${missingPhotos.length === 1 ? "" : "s"} without a photo`,
      );
    }

    checks.push({
      key: "documents",
      label: "Player documents",
      ok: documentsOk,
      detail: documentsOk
        ? "Every player has the documents this tournament requires."
        : `Upload the documents for ${parts.join(" and ")}.`,
    });
  }

  if (missingFields.length > 0) {
    checks.push({
      key: "fields",
      label: "Registration information",
      ok: false,
      detail: `Add ${missingFields.join(", ")}.`,
    });
  }

  checks.push({
    key: "payment",
    label: "Entry payment details",
    ok: paymentOk,
    detail: paymentOk
      ? feeRequired
        ? "A payment reference or proof is attached."
        : "There is no entry fee for this tournament."
      : "Add a payment reference or upload the proof.",
  });

  const missing = checks
    .filter((check) => !check.ok)
    .map((check) => check.label.toLowerCase());

  return {
    ready: missing.length === 0,
    checks,
    missing,
  };
}
