import type {
  MatchEventType,
  MatchStatus,
  PaymentStatus,
  Position,
  RegistrationStatus,
  TournamentFormat,
  TournamentStatus,
} from "@/lib/database.types";

/**
 * Billing is not part of the product yet: every workspace runs the full
 * platform for free. The columns still exist in Postgres so subscriptions can
 * be layered on later without a migration of live competition data, so new
 * workspaces are created with a generous allowance and an effectively
 * perpetual access date instead of a trial window.
 */
export const WORKSPACE_ACCESS = {
  planTier: "basic",
  maxTournaments: 500,
  validUntil: "2099-12-31T23:59:59.000Z",
} as const;

export const TOURNAMENT_FORMATS: Record<TournamentFormat, string> = {
  LEAGUE: "League (single table)",
  KNOCKOUT: "Knockout cup",
  GROUP_PLUS_KNOCKOUT: "Groups + knockout",
};

export const TOURNAMENT_STATUS_LABEL: Record<TournamentStatus, string> = {
  DRAFT: "Draft",
  REGISTRATION_OPEN: "Registration open",
  ONGOING: "Ongoing",
  COMPLETED: "Completed",
};

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  SCHEDULED: "Scheduled",
  FIRST_HALF: "1st half",
  HALF_TIME: "Half time",
  SECOND_HALF: "2nd half",
  EXTRA_TIME: "Extra time",
  PENALTIES: "Penalties",
  COMPLETED: "Full time",
  POSTPONED: "Postponed",
};

export const REGISTRATION_STATUS_LABEL: Record<RegistrationStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "Unpaid",
  PENDING_VERIFICATION: "Verifying",
  PAID: "Paid",
};

export const POSITION_LABEL: Record<Position, string> = {
  GK: "Goalkeeper",
  DEF: "Defender",
  MID: "Midfielder",
  FWD: "Forward",
};

export const EVENT_LABEL: Record<MatchEventType, string> = {
  GOAL: "Goal",
  OWN_GOAL: "Own goal",
  PENALTY_GOAL: "Penalty scored",
  MISSED_PENALTY: "Penalty missed",
  YELLOW_CARD: "Yellow card",
  SECOND_YELLOW_RED: "Second yellow → red",
  DIRECT_RED: "Red card",
  SUBSTITUTION: "Substitution",
};

export const LIVE_STATUSES: MatchStatus[] = [
  "FIRST_HALF",
  "HALF_TIME",
  "SECOND_HALF",
  "EXTRA_TIME",
  "PENALTIES",
];

export const KIT_COLORS = [
  "#10B981",
  "#2E8B57",
  "#0284C7",
  "#38BDF8",
  "#0F172A",
  "#F8FAFC",
  "#EF4444",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
];

export const PITCH_FORMATIONS = ["4-3-3", "4-4-2", "3-5-2", "4-2-3-1", "5-3-2"] as const;
export type Formation = (typeof PITCH_FORMATIONS)[number];

export const FORMATION_LAYOUTS: Record<
  Formation,
  { position: Position; slot: string; x: number; y: number }[]
> = {
  "4-3-3": [
    { position: "GK", slot: "GK", x: 50, y: 92 },
    { position: "DEF", slot: "LB", x: 16, y: 74 },
    { position: "DEF", slot: "CB", x: 38, y: 76 },
    { position: "DEF", slot: "CB", x: 62, y: 76 },
    { position: "DEF", slot: "RB", x: 84, y: 74 },
    { position: "MID", slot: "CM", x: 28, y: 52 },
    { position: "MID", slot: "CM", x: 50, y: 56 },
    { position: "MID", slot: "CM", x: 72, y: 52 },
    { position: "FWD", slot: "LW", x: 20, y: 26 },
    { position: "FWD", slot: "ST", x: 50, y: 20 },
    { position: "FWD", slot: "RW", x: 80, y: 26 },
  ],
  "4-4-2": [
    { position: "GK", slot: "GK", x: 50, y: 92 },
    { position: "DEF", slot: "LB", x: 16, y: 74 },
    { position: "DEF", slot: "CB", x: 38, y: 76 },
    { position: "DEF", slot: "CB", x: 62, y: 76 },
    { position: "DEF", slot: "RB", x: 84, y: 74 },
    { position: "MID", slot: "LM", x: 16, y: 48 },
    { position: "MID", slot: "CM", x: 38, y: 52 },
    { position: "MID", slot: "CM", x: 62, y: 52 },
    { position: "MID", slot: "RM", x: 84, y: 48 },
    { position: "FWD", slot: "ST", x: 38, y: 22 },
    { position: "FWD", slot: "ST", x: 62, y: 22 },
  ],
  "3-5-2": [
    { position: "GK", slot: "GK", x: 50, y: 92 },
    { position: "DEF", slot: "CB", x: 26, y: 76 },
    { position: "DEF", slot: "CB", x: 50, y: 78 },
    { position: "DEF", slot: "CB", x: 74, y: 76 },
    { position: "MID", slot: "LWB", x: 12, y: 50 },
    { position: "MID", slot: "CM", x: 34, y: 54 },
    { position: "MID", slot: "CM", x: 50, y: 46 },
    { position: "MID", slot: "CM", x: 66, y: 54 },
    { position: "MID", slot: "RWB", x: 88, y: 50 },
    { position: "FWD", slot: "ST", x: 38, y: 22 },
    { position: "FWD", slot: "ST", x: 62, y: 22 },
  ],
  "4-2-3-1": [
    { position: "GK", slot: "GK", x: 50, y: 92 },
    { position: "DEF", slot: "LB", x: 16, y: 74 },
    { position: "DEF", slot: "CB", x: 38, y: 76 },
    { position: "DEF", slot: "CB", x: 62, y: 76 },
    { position: "DEF", slot: "RB", x: 84, y: 74 },
    { position: "MID", slot: "DM", x: 38, y: 60 },
    { position: "MID", slot: "DM", x: 62, y: 60 },
    { position: "MID", slot: "LAM", x: 22, y: 38 },
    { position: "MID", slot: "CAM", x: 50, y: 40 },
    { position: "MID", slot: "RAM", x: 78, y: 38 },
    { position: "FWD", slot: "ST", x: 50, y: 18 },
  ],
  "5-3-2": [
    { position: "GK", slot: "GK", x: 50, y: 92 },
    { position: "DEF", slot: "LWB", x: 10, y: 68 },
    { position: "DEF", slot: "CB", x: 30, y: 76 },
    { position: "DEF", slot: "CB", x: 50, y: 78 },
    { position: "DEF", slot: "CB", x: 70, y: 76 },
    { position: "DEF", slot: "RWB", x: 90, y: 68 },
    { position: "MID", slot: "CM", x: 30, y: 50 },
    { position: "MID", slot: "CM", x: 50, y: 52 },
    { position: "MID", slot: "CM", x: 70, y: 50 },
    { position: "FWD", slot: "ST", x: 38, y: 22 },
    { position: "FWD", slot: "ST", x: 62, y: 22 },
  ],
};

export const OFFICIAL_BRAND = {
  name: "LigaPro",
  tagline: "Tournament operations, from draw to trophy.",
  email: "hello@ligapro.app",
};
