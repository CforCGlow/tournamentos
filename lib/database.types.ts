export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TenantPlan = "basic" | "pro" | "enterprise";
export type TenantStatus = "active" | "suspended" | "trial";
export type TenantRole = "TOURNAMENT_ADMIN" | "TEAM_MANAGER" | "REFEREE";
export type GlobalRole = "SUPER_ADMIN" | "USER";
export type TournamentFormat = "LEAGUE" | "KNOCKOUT" | "GROUP_PLUS_KNOCKOUT";
export type TournamentStatus = "DRAFT" | "REGISTRATION_OPEN" | "ONGOING" | "COMPLETED";
export type StageType = "GROUP" | "KNOCKOUT";
export type PitchType = "11v11" | "7v7" | "5v5_futsal";
export type RegistrationStatus = "PENDING" | "APPROVED" | "REJECTED";
export type PaymentStatus = "UNPAID" | "PENDING_VERIFICATION" | "PAID";
export type Position = "GK" | "DEF" | "MID" | "FWD";
export type MatchStatus =
  | "SCHEDULED"
  | "FIRST_HALF"
  | "HALF_TIME"
  | "SECOND_HALF"
  | "EXTRA_TIME"
  | "PENALTIES"
  | "COMPLETED"
  | "POSTPONED";
export type MatchEventType =
  | "GOAL"
  | "OWN_GOAL"
  | "PENALTY_GOAL"
  | "MISSED_PENALTY"
  | "YELLOW_CARD"
  | "SECOND_YELLOW_RED"
  | "DIRECT_RED"
  | "SUBSTITUTION";

export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  plan_tier: TenantPlan;
  status: TenantStatus;
  valid_until: string;
  max_tournaments: number;
  created_at: string;
  updated_at: string;
}

export type ProfileRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  global_role: GlobalRole;
  created_at: string;
  updated_at: string;
}

export type TenantMemberRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  created_at: string;
}

export type TournamentRow = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  banner_url: string | null;
  format: TournamentFormat;
  status: TournamentStatus;
  start_date: string | null;
  end_date: string | null;
  registration_fee: number;
  max_teams: number;
  min_squad_size: number;
  max_squad_size: number;
  roster_locked: boolean;
  points_per_win: number;
  points_per_draw: number;
  points_per_loss: number;
  yellow_cards_for_suspension: number;
  tiebreaker_order: Json;
  rules_md: string | null;
  created_at: string;
  updated_at: string;
}

export type StageRow = {
  id: string;
  tournament_id: string;
  name: string;
  stage_type: StageType;
  sequence_order: number;
  qualifiers_count: number;
  created_at: string;
}

export type VenueRow = {
  id: string;
  tournament_id: string;
  name: string;
  address: string | null;
  pitch_type: PitchType;
  map_url: string | null;
  created_at: string;
}

export type TeamRow = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  manager_id: string;
  name: string;
  short_name: string;
  logo_url: string | null;
  home_kit_color: string;
  away_kit_color: string;
  registration_status: RegistrationStatus;
  payment_status: PaymentStatus;
  payment_transaction_id: string | null;
  payment_proof_url: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type PlayerRow = {
  id: string;
  team_id: string;
  full_name: string;
  jersey_number: number;
  position: Position;
  date_of_birth: string | null;
  photo_url: string | null;
  id_document_url: string | null;
  is_captain: boolean;
  is_verified: boolean;
  goals_count: number;
  assists_count: number;
  yellow_cards_accumulated: number;
  red_cards_accumulated: number;
  is_suspended: boolean;
  created_at: string;
  updated_at: string;
}

export type MatchRow = {
  id: string;
  tournament_id: string;
  stage_id: string;
  venue_id: string | null;
  referee_id: string | null;
  match_number: number;
  round_name: string;
  home_team_id: string | null;
  away_team_id: string | null;
  kickoff_time: string;
  status: MatchStatus;
  home_score: number;
  away_score: number;
  home_penalties: number | null;
  away_penalties: number | null;
  next_match_id: string | null;
  next_match_slot: "HOME" | "AWAY" | null;
  mvp_player_id: string | null;
  created_at: string;
  updated_at: string;
}

export type MatchLineupRow = {
  id: string;
  match_id: string;
  team_id: string;
  player_id: string;
  is_starting: boolean;
  formation_position: string | null;
  created_at: string;
}

export type MatchEventRow = {
  id: string;
  match_id: string;
  team_id: string;
  player_id: string | null;
  secondary_player_id: string | null;
  event_type: MatchEventType;
  minute: number;
  extra_minute: number | null;
  created_at: string;
}

export type StandingRow = {
  id: string;
  tournament_id: string;
  stage_id: string;
  team_id: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  form: string[];
  updated_at: string;
}

type InsertOf<T, Optional extends keyof T> = Omit<T, Optional> &
  Partial<Pick<T, Optional>>;

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: TenantRow;
        Insert: InsertOf<TenantRow, "id" | "logo_url" | "primary_color" | "plan_tier" | "status" | "valid_until" | "max_tournaments" | "created_at" | "updated_at">;
        Update: Partial<TenantRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: InsertOf<ProfileRow, "full_name" | "phone" | "avatar_url" | "global_role" | "created_at" | "updated_at">;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      tenant_members: {
        Row: TenantMemberRow;
        Insert: InsertOf<TenantMemberRow, "id" | "created_at">;
        Update: Partial<TenantMemberRow>;
        Relationships: [];
      };
      tournaments: {
        Row: TournamentRow;
        Insert: InsertOf<
          TournamentRow,
          | "id"
          | "banner_url"
          | "format"
          | "status"
          | "start_date"
          | "end_date"
          | "registration_fee"
          | "max_teams"
          | "min_squad_size"
          | "max_squad_size"
          | "roster_locked"
          | "points_per_win"
          | "points_per_draw"
          | "points_per_loss"
          | "yellow_cards_for_suspension"
          | "tiebreaker_order"
          | "rules_md"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<TournamentRow>;
        Relationships: [];
      };
      stages: {
        Row: StageRow;
        Insert: InsertOf<StageRow, "id" | "sequence_order" | "qualifiers_count" | "created_at">;
        Update: Partial<StageRow>;
        Relationships: [];
      };
      venues: {
        Row: VenueRow;
        Insert: InsertOf<VenueRow, "id" | "address" | "pitch_type" | "map_url" | "created_at">;
        Update: Partial<VenueRow>;
        Relationships: [];
      };
      teams: {
        Row: TeamRow;
        Insert: InsertOf<
          TeamRow,
          | "id"
          | "stage_id"
          | "logo_url"
          | "home_kit_color"
          | "away_kit_color"
          | "registration_status"
          | "payment_status"
          | "payment_transaction_id"
          | "payment_proof_url"
          | "rejection_reason"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<TeamRow>;
        Relationships: [];
      };
      players: {
        Row: PlayerRow;
        Insert: InsertOf<
          PlayerRow,
          | "id"
          | "date_of_birth"
          | "photo_url"
          | "id_document_url"
          | "is_captain"
          | "is_verified"
          | "goals_count"
          | "assists_count"
          | "yellow_cards_accumulated"
          | "red_cards_accumulated"
          | "is_suspended"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<PlayerRow>;
        Relationships: [];
      };
      matches: {
        Row: MatchRow;
        Insert: InsertOf<
          MatchRow,
          | "id"
          | "venue_id"
          | "referee_id"
          | "round_name"
          | "home_team_id"
          | "away_team_id"
          | "status"
          | "home_score"
          | "away_score"
          | "home_penalties"
          | "away_penalties"
          | "next_match_id"
          | "next_match_slot"
          | "mvp_player_id"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<MatchRow>;
        Relationships: [];
      };
      match_lineups: {
        Row: MatchLineupRow;
        Insert: InsertOf<MatchLineupRow, "id" | "is_starting" | "formation_position" | "created_at">;
        Update: Partial<MatchLineupRow>;
        Relationships: [];
      };
      match_events: {
        Row: MatchEventRow;
        Insert: InsertOf<MatchEventRow, "id" | "player_id" | "secondary_player_id" | "extra_minute" | "created_at">;
        Update: Partial<MatchEventRow>;
        Relationships: [];
      };
      standings: {
        Row: StandingRow;
        Insert: InsertOf<StandingRow, "id" | "played" | "won" | "drawn" | "lost" | "goals_for" | "goals_against" | "points" | "form" | "updated_at">;
        Update: Partial<StandingRow>;
        Relationships: [];
      };
    };
    Views: {
      public_tenants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          primary_color: string;
        };
        Relationships: [];
      };
      public_profiles: {
        Row: { id: string; full_name: string; avatar_url: string | null };
        Relationships: [];
      };
      public_match_officials: {
        Row: { match_id: string; referee_name: string | null };
        Relationships: [];
      };
    };
    Functions: {
      register_team: {
        Args: {
          p_tournament_id: string;
          p_name: string;
          p_short_name: string;
          p_home_kit?: string;
          p_away_kit?: string;
          p_logo_url?: string | null;
          p_transaction_id?: string | null;
          p_proof_url?: string | null;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
