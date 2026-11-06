import { z } from "zod";
import { PITCH_SIZES } from "@/lib/pitch";

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour, e.g. #10B981");

const slugField = z
  .string()
  .min(3, "At least 3 characters")
  .max(50, "At most 50 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and single hyphens only");

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => (value ? value : null));

const checkbox = z.preprocess(
  (value) => value === "on" || value === "true" || value === true,
  z.boolean(),
);

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(80),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    phone: z
      .string()
      .trim()
      .max(30)
      .optional()
      .transform((value) => (value ? value : null)),
    password: z
      .string()
      .min(8, "At least 8 characters")
      .regex(/[A-Za-z]/, "Include at least one letter")
      .regex(/[0-9]/, "Include at least one number"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const tenantSchema = z.object({
  name: z.string().trim().min(2, "Client name is required").max(80),
  slug: slugField,
  primary_color: hexColor.default("#10B981"),
  logo_url: optionalText,
});

export const tenantUpdateSchema = tenantSchema.partial();

/** Self-serve workspace creation from the portal. */
export const workspaceSchema = tenantSchema.pick({
  name: true,
  slug: true,
  primary_color: true,
});

const tournamentBase = z.object({
  name: z.string().trim().min(3, "Tournament name is required").max(90),
    slug: slugField,
    format: z.enum(["LEAGUE", "KNOCKOUT", "GROUP_PLUS_KNOCKOUT"]),
    status: z.enum(["DRAFT", "REGISTRATION_OPEN", "ONGOING", "COMPLETED"]).default("DRAFT"),
    start_date: z.string().min(10, "Choose a start date"),
    end_date: z.string().min(10, "Choose an end date"),
    registration_fee: z.coerce.number().min(0).max(1_000_000),
    max_teams: z.coerce.number().int().min(2).max(128),
    min_squad_size: z.coerce.number().int().min(1).max(40),
    max_squad_size: z.coerce.number().int().min(1).max(40),
    points_per_win: z.coerce.number().int().min(0).max(10),
    points_per_draw: z.coerce.number().int().min(0).max(10),
    points_per_loss: z.coerce.number().int().min(0).max(10),
    yellow_cards_for_suspension: z.coerce.number().int().min(1).max(10),
    tiebreakers: z
      .array(z.enum(["GD", "GF", "H2H", "WINS"]))
      .min(1, "Pick at least one tiebreaker"),
    rules_md: optionalText,
    banner_url: optionalText,
});

export const tournamentSchema = tournamentBase
  .refine((data) => new Date(data.end_date) >= new Date(data.start_date), {
    message: "End date must be on or after the start date",
    path: ["end_date"],
  })
  .refine((data) => data.min_squad_size <= data.max_squad_size, {
    message: "Minimum squad size cannot exceed the maximum",
    path: ["max_squad_size"],
  });

export const tournamentUpdateSchema = tournamentBase.partial();

export const stageSchema = z.object({
  name: z.string().trim().min(2, "Stage name is required").max(60),
  stage_type: z.enum(["GROUP", "KNOCKOUT"]),
  sequence_order: z.coerce.number().int().min(1).max(50),
  qualifiers_count: z.coerce.number().int().min(0).max(64),
});

export const venueSchema = z.object({
  name: z.string().trim().min(2, "Venue name is required").max(80),
  address: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value ? value : null)),
  pitch_type: z.enum(PITCH_SIZES),
  map_url: optionalText,
});

export const teamRegistrationSchema = z.object({
  tournament_id: z.string().uuid(),
  name: z.string().trim().min(2, "Team name is required").max(70),
  short_name: z
    .string()
    .trim()
    .min(2, "Use 2–4 characters")
    .max(4, "Use 2–4 characters")
    .regex(/^[A-Za-z0-9]+$/, "Letters and numbers only"),
  home_kit_color: hexColor,
  away_kit_color: hexColor,
  payment_transaction_id: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((value) => (value ? value : null)),
  logo_url: optionalText,
});

export const playerSchema = z.object({
  full_name: z.string().trim().min(2, "Player name is required").max(80),
  jersey_number: z.coerce
    .number()
    .int("Whole numbers only")
    .min(1, "Jersey numbers start at 1")
    .max(99, "Jersey numbers end at 99"),
  position: z.enum(["GK", "DEF", "MID", "FWD"]),
  date_of_birth: z
    .string()
    .optional()
    .transform((value) => (value ? value : null)),
  photo_url: optionalText,
  id_document_url: optionalText,
  is_captain: checkbox.default(false),
});

const optionalScore = z
  .preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.coerce.number().int().min(0).max(99).nullable().optional(),
  )
  .transform((value) => value ?? null);

export const resultSchema = z
  .object({
    home_score: z.coerce.number().int().min(0).max(99),
    away_score: z.coerce.number().int().min(0).max(99),
    home_penalties: optionalScore,
    away_penalties: optionalScore,
  })
  .refine(
    (data) => (data.home_penalties === null) === (data.away_penalties === null),
    {
      message: "Enter both penalty scores, or leave both blank",
      path: ["away_penalties"],
    },
  )
  .refine(
    (data) =>
      data.home_score !== data.away_score ||
      data.home_penalties === null ||
      data.home_penalties !== data.away_penalties,
    { message: "A drawn knockout tie needs a different penalty score", path: ["away_penalties"] },
  );

export const matchEventSchema = z.object({
  match_id: z.string().uuid(),
  team_id: z.string().uuid(),
  player_id: z.string().uuid().nullable().optional(),
  secondary_player_id: z.string().uuid().nullable().optional(),
  event_type: z.enum([
    "GOAL",
    "OWN_GOAL",
    "PENALTY_GOAL",
    "MISSED_PENALTY",
    "YELLOW_CARD",
    "SECOND_YELLOW_RED",
    "DIRECT_RED",
    "SUBSTITUTION",
  ]),
  minute: z.coerce.number().int().min(0).max(130),
  extra_minute: z.coerce.number().int().min(1).max(30).optional().nullable(),
});

export const lineupEntrySchema = z.object({
  match_id: z.string().uuid(),
  team_id: z.string().uuid(),
  starting: z.array(z.string().uuid()).max(11, "A starting XI has 11 players"),
  substitutes: z.array(z.string().uuid()).max(12),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: z.enum(["TOURNAMENT_ADMIN", "TEAM_MANAGER", "REFEREE"]),
});

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Your name is required").max(80),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((value) => (value ? value : null)),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type TenantInput = z.infer<typeof tenantSchema>;
export type TournamentInput = z.infer<typeof tournamentSchema>;
export type TeamRegistrationInput = z.infer<typeof teamRegistrationSchema>;
export type PlayerInput = z.infer<typeof playerSchema>;
export type ResultInput = z.infer<typeof resultSchema>;
export type MatchEventInput = z.infer<typeof matchEventSchema>;
export type LoginState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

/** Turns FormData into a plain record (checkboxes excluded from `entries`). */
export function formToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.endsWith("[]")) {
      const clean = key.slice(0, -2);
      const current = (result[clean] as unknown[]) ?? [];
      current.push(value);
      result[clean] = current;
    } else if (key in result) {
      const current = result[key];
      result[key] = Array.isArray(current) ? [...current, value] : [current, value];
    } else {
      result[key] = value;
    }
  }
  return result;
}
