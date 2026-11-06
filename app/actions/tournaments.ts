"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant, requireTournament } from "@/lib/auth";
import {
  bool,
  explainDbError,
  fail,
  optionalText,
  redirectWithError,
  redirectWithFlash,
  succeed,
  text,
  type ActionState,
} from "@/lib/actions";
import {
  formToObject,
  resultSchema,
  stageSchema,
  tournamentSchema,
  venueSchema,
} from "@/lib/validations";
import { buildKnockoutBracket, generateRoundRobin, potDraw } from "@/lib/fixtures";
import { clamp } from "@/lib/utils";
import { clockForMinute, clockForStatus } from "@/lib/clock";
import { readMatchClock, saveMatchClock } from "@/lib/match-clock";
import { assessTeamReadiness } from "@/lib/team-readiness";
import { deleteTeamSubmission, readTeamSubmission } from "@/lib/team-submission";
import {
  getTournamentSettings,
  missingRequiredFields,
  normaliseTournamentSettings,
  removeVenuePitchSize,
  saveTournamentSettings,
  setVenuePitchSize,
  type RegistrationField,
  type TournamentSettings,
} from "@/lib/tournament-settings";
import { readTeamProfile } from "@/lib/team-profile";
import { markSubmissionReviewed } from "@/lib/team-review";
import { LIVE_STATUSES } from "@/lib/constants";
import { isPitchSize, pitchDbValue } from "@/lib/pitch";
import type { MatchStatus } from "@/lib/database.types";

function tournamentUrl(slug: string, tournamentId: string): string {
  return `/dashboard/${slug}/tournaments/${tournamentId}`;
}

function startOfTournament(startDate: string | null): Date {
  const date = startDate ? new Date(`${startDate}T15:00:00`) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

/* -------------------------------------------------------------------------- */
/* Tournament CRUD                                                            */
/* -------------------------------------------------------------------------- */

export async function createTournamentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const slug = text(formData, "tenant_slug");
  const ctx = await requireTenant(slug);
  const back = `/dashboard/${slug}/tournaments`;

  const raw = formToObject(formData);
  raw.tiebreakers = formData.getAll("tiebreakers").map(String);
  const parsed = tournamentSchema.safeParse(raw);

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the tournament details");
  }

  const data = parsed.data;
  const { data: tournament, error } = await ctx.supabase
    .from("tournaments")
    .insert({
      tenant_id: ctx.tenant.id,
      name: data.name,
      slug: data.slug,
      format: data.format,
      status: data.status,
      start_date: data.start_date,
      end_date: data.end_date,
      registration_fee: data.registration_fee,
      max_teams: data.max_teams,
      min_squad_size: data.min_squad_size,
      max_squad_size: data.max_squad_size,
      points_per_win: data.points_per_win,
      points_per_draw: data.points_per_draw,
      points_per_loss: data.points_per_loss,
      yellow_cards_for_suspension: data.yellow_cards_for_suspension,
      tiebreaker_order: data.tiebreakers,
      rules_md: data.rules_md,
      banner_url: data.banner_url,
    })
    .select("id")
    .single();

  if (error || !tournament) {
    return fail(explainDbError(error));
  }

  revalidatePath(back);
  revalidatePath("/superadmin");
  revalidatePath(`/${data.slug}`);
  return succeed("Tournament created. Add your registration rules next.", {
    redirect: tournamentUrl(slug, tournament.id),
  });
}

export async function updateTournamentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  const raw = formToObject(formData);
  raw.tiebreakers = formData.getAll("tiebreakers").map(String);
  const parsed = tournamentSchema.safeParse(raw);

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the tournament details");
  }

  const data = parsed.data;
  const { error } = await ctx.supabase
    .from("tournaments")
    .update({
      name: data.name,
      slug: data.slug,
      format: data.format,
      status: data.status,
      start_date: data.start_date,
      end_date: data.end_date,
      registration_fee: data.registration_fee,
      max_teams: data.max_teams,
      min_squad_size: data.min_squad_size,
      max_squad_size: data.max_squad_size,
      points_per_win: data.points_per_win,
      points_per_draw: data.points_per_draw,
      points_per_loss: data.points_per_loss,
      yellow_cards_for_suspension: data.yellow_cards_for_suspension,
      tiebreaker_order: data.tiebreakers,
      rules_md: data.rules_md,
      banner_url: data.banner_url,
    })
    .eq("id", tournamentId);

  if (error) return fail(explainDbError(error));

  revalidatePath(back);
  revalidatePath(`/${ctx.tournament.slug}`);
  return succeed("Tournament settings saved.", { redirect: back });
}

function parseFieldsJson(raw: string): RegistrationField[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const value = entry as Record<string, unknown>;
        const label = typeof value.label === "string" ? value.label.trim().slice(0, 60) : "";
        if (label.length < 2) return null;
        const id =
          typeof value.id === "string" && /^[a-z0-9]{2,24}$/.test(value.id)
            ? value.id
            : `field_${Math.random().toString(36).slice(2, 8)}`;
        return { id, label, required: value.required === true } satisfies RegistrationField;
      })
      .filter((field): field is RegistrationField => Boolean(field))
      .slice(0, 8);
  } catch {
    return [];
  }
}

/**
 * Saves the registration requirements organisers can switch on per tournament:
 * ID documents, player photos and any custom fields (student ID, faculty, …).
 */
export async function saveRegistrationSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  const current = await getTournamentSettings(tournamentId);
  const next: TournamentSettings = {
    ...current,
    requireIdDocument: bool(formData, "require_id_document"),
    requirePlayerPhoto: bool(formData, "require_player_photo"),
    fields: parseFieldsJson(text(formData, "fields_json")),
  };

  try {
    await saveTournamentSettings(tournamentId, normaliseTournamentSettings(next));
  } catch (error) {
    return fail(
      error instanceof Error
        ? `The requirements could not be saved: ${error.message}`
        : "The requirements could not be saved. Please try again.",
    );
  }

  revalidatePath(back);
  return succeed(
    next.fields.length
      ? "Registration requirements saved. Managers now see these fields on the entry form."
      : "Registration requirements saved.",
  );
}

export async function setTournamentStatusAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const status = text(formData, "status");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  if (!["DRAFT", "REGISTRATION_OPEN", "ONGOING", "COMPLETED"].includes(status)) {
    redirectWithError(back, "Unknown tournament status.");
  }

  const { error } = await ctx.supabase
    .from("tournaments")
    .update({ status: status as "DRAFT" | "REGISTRATION_OPEN" | "ONGOING" | "COMPLETED" })
    .eq("id", tournamentId);

  if (error) redirectWithError(back, explainDbError(error));

  revalidatePath(back);
  revalidatePath(`/${ctx.tournament.slug}`);
  redirectWithFlash(back, `Tournament is now ${status.replace(/_/g, " ").toLowerCase()}.`);
}

export async function deleteTournamentAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const ctx = await requireTournament(slug, tournamentId);
  const back = `/dashboard/${slug}/tournaments`;

  if (text(formData, "confirm") !== "DELETE") {
    redirectWithError(
      tournamentUrl(slug, tournamentId),
      "Type DELETE to confirm removing this tournament.",
    );
  }

  const { error } = await ctx.supabase.from("tournaments").delete().eq("id", tournamentId);
  if (error) redirectWithError(back, explainDbError(error));

  revalidatePath(back);
  redirectWithFlash(back, "Tournament deleted.");
}

/* -------------------------------------------------------------------------- */
/* Stages & venues                                                            */
/* -------------------------------------------------------------------------- */

export async function createStageAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  const parsed = stageSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    redirectWithError(back, parsed.error.issues[0]?.message ?? "Check the stage details");
  }

  const { error } = await ctx.supabase.from("stages").insert({
    tournament_id: tournamentId,
    name: parsed.data.name,
    stage_type: parsed.data.stage_type,
    sequence_order: parsed.data.sequence_order,
    qualifiers_count: parsed.data.qualifiers_count,
  });

  if (error) redirectWithError(back, explainDbError(error));
  revalidatePath(back);
  redirectWithFlash(back, "Stage added.");
}

export async function deleteStageAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const stageId = text(formData, "stage_id");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  const { error } = await ctx.supabase
    .from("stages")
    .delete()
    .eq("id", stageId)
    .eq("tournament_id", tournamentId);

  if (error) redirectWithError(back, explainDbError(error));
  revalidatePath(back);
  redirectWithFlash(back, "Stage removed.");
}

export async function createVenueAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  const parsed = venueSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    redirectWithError(back, parsed.error.issues[0]?.message ?? "Check the venue details");
  }

  // The database constraint only permits three legacy pitch values, so save the
  // exact 5v5–11v11 size in the settings document and map the column to the
  // nearest allowed value.
  const size = isPitchSize(parsed.data.pitch_type) ? parsed.data.pitch_type : "11v11";

  const { data: venue, error } = await ctx.supabase
    .from("venues")
    .insert({
      tournament_id: tournamentId,
      name: parsed.data.name,
      address: parsed.data.address,
      pitch_type: pitchDbValue(size),
      map_url: parsed.data.map_url,
    })
    .select("id")
    .single();

  if (error || !venue) redirectWithError(back, explainDbError(error));

  await setVenuePitchSize(tournamentId, venue.id, size).catch(() => {
    // The venue exists; the exact size can be set again from the venue list.
  });

  revalidatePath(back);
  redirectWithFlash(back, "Venue added.");
}

export async function deleteVenueAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const venueId = text(formData, "venue_id");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  const { error } = await ctx.supabase
    .from("venues")
    .delete()
    .eq("id", venueId)
    .eq("tournament_id", tournamentId);

  if (error) redirectWithError(back, explainDbError(error));

  await removeVenuePitchSize(tournamentId, venueId).catch(() => {
    // Deleting the venue is authoritative; a stale size key is harmless.
  });

  revalidatePath(back);
  redirectWithFlash(back, "Venue removed.");
}

/* -------------------------------------------------------------------------- */
/* Draw & scheduling engines                                                  */
/* -------------------------------------------------------------------------- */

export async function drawGroupsAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  if (ctx.tournament.format !== "GROUP_PLUS_KNOCKOUT") {
    redirectWithError(back, "The group draw is only available for the Groups + Knockout format.");
  }

  const groupCount = clamp(Number(text(formData, "group_count") || 4), 2, 16);

  const { data: teams } = await ctx.supabase
    .from("teams")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("registration_status", "APPROVED");

  if (!teams || teams.length < groupCount * 2) {
    redirectWithError(
      back,
      `Approve at least ${groupCount * 2} teams before drawing ${groupCount} groups.`,
    );
  }

  const { data: stages } = await ctx.supabase
    .from("stages")
    .select("id, stage_type")
    .eq("tournament_id", tournamentId);

  const groupStageIds = (stages ?? [])
    .filter((stage) => stage.stage_type === "GROUP")
    .map((stage) => stage.id);

  if (groupStageIds.length > 0) {
    const { count } = await ctx.supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .in("stage_id", groupStageIds);

    if ((count ?? 0) > 0) {
      redirectWithError(back, "Clear the existing fixtures before running a new group draw.");
    }

    await ctx.supabase.from("stages").delete().in("id", groupStageIds);
  }

  const groups = potDraw(
    teams.map((team) => team.id),
    groupCount,
  );

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (!group) continue;

    const { data: stage, error } = await ctx.supabase
      .from("stages")
      .insert({
        tournament_id: tournamentId,
        name: group.name,
        stage_type: "GROUP",
        sequence_order: index + 1,
        qualifiers_count: 2,
      })
      .select("id")
      .single();

    if (error || !stage) redirectWithError(back, explainDbError(error));

    if (group.teamIds.length > 0) {
      await ctx.supabase
        .from("teams")
        .update({ stage_id: stage.id })
        .in("id", group.teamIds);
    }
  }

  revalidatePath(back);
  redirectWithFlash(
    back,
    `Drew ${teams.length} teams into ${groups.length} groups. Generate the group fixtures next.`,
  );
}

export async function generateLeagueFixturesAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  const { count: existing } = await ctx.supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId);

  if ((existing ?? 0) > 0) {
    redirectWithError(back, "Fixtures already exist. Clear them before regenerating.");
  }

  const { data: teams } = await ctx.supabase
    .from("teams")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("registration_status", "APPROVED");

  if (!teams || teams.length < 2) {
    redirectWithError(back, "Approve at least two teams first.");
  }

  const { data: venues } = await ctx.supabase
    .from("venues")
    .select("id")
    .eq("tournament_id", tournamentId)
    .order("name");

  let { data: stage } = await ctx.supabase
    .from("stages")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("stage_type", "GROUP")
    .order("sequence_order")
    .limit(1)
    .maybeSingle();

  if (!stage) {
    const { data: created, error } = await ctx.supabase
      .from("stages")
      .insert({
        tournament_id: tournamentId,
        name: ctx.tournament.format === "LEAGUE" ? "League" : "Group A",
        stage_type: "GROUP",
        sequence_order: 1,
        qualifiers_count: 2,
      })
      .select("id")
      .single();

    if (error || !created) redirectWithError(back, explainDbError(error));
    stage = created;
  }

  if (!stage) redirectWithError(back, "Could not create the league stage.");

  const venueIds = (venues ?? []).map((venue) => venue.id);
  const fixtures = generateRoundRobin(
    teams.map((team) => team.id),
    {
      startDate: startOfTournament(ctx.tournament.start_date),
      doubleRound: bool(formData, "double_round"),
      venueCount: venueIds.length,
      kickoffHour: 15,
      intervalDays: 7,
      matchdayLabel: "Matchday",
      firstMatchNumber: 1,
    },
  );

  const { error } = await ctx.supabase.from("matches").insert(
    fixtures.map((fixture) => ({
      tournament_id: tournamentId,
      stage_id: stage!.id,
      venue_id: venueIds.length > 0 ? venueIds[fixture.venueIndex % venueIds.length] ?? null : null,
      match_number: fixture.matchNumber,
      round_name: fixture.roundName,
      home_team_id: fixture.homeTeamId,
      away_team_id: fixture.awayTeamId,
      kickoff_time: fixture.kickoffTime,
      status: "SCHEDULED" as const,
    })),
  );

  if (error) redirectWithError(back, explainDbError(error));

  revalidatePath(back);
  redirectWithFlash(
    back,
    `Generated ${fixtures.length} fixtures — every team plays once per matchday with no collisions.`,
  );
}

export async function generateGroupFixturesAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  const { data: stages } = await ctx.supabase
    .from("stages")
    .select("id, name, stage_type")
    .eq("tournament_id", tournamentId)
    .eq("stage_type", "GROUP")
    .order("sequence_order");

  if (!stages || stages.length === 0) {
    redirectWithError(back, "Run the group draw first.");
  }

  const { data: teams } = await ctx.supabase
    .from("teams")
    .select("id, stage_id")
    .eq("tournament_id", tournamentId)
    .eq("registration_status", "APPROVED");

  const { data: venues } = await ctx.supabase
    .from("venues")
    .select("id")
    .eq("tournament_id", tournamentId)
    .order("name");

  const venueIds = (venues ?? []).map((venue) => venue.id);

  const { data: lastMatch } = await ctx.supabase
    .from("matches")
    .select("match_number")
    .eq("tournament_id", tournamentId)
    .order("match_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextNumber = (lastMatch?.match_number ?? 0) + 1;
  let inserted = 0;
  let unassigned = 0;

  for (const stage of stages) {
    const stageTeams = (teams ?? []).filter((team) => team.stage_id === stage.id);
    if (stageTeams.length < 2) {
      unassigned += 1;
      continue;
    }

    const { count } = await ctx.supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("stage_id", stage.id);

    if ((count ?? 0) > 0) continue;

    const fixtures = generateRoundRobin(
      stageTeams.map((team) => team.id),
      {
        startDate: startOfTournament(ctx.tournament.start_date),
        venueCount: venueIds.length,
        kickoffHour: 15,
        intervalDays: 7,
        matchdayLabel: stage.name,
        firstMatchNumber: nextNumber,
      },
    );
    nextNumber += fixtures.length;

    const { error } = await ctx.supabase.from("matches").insert(
      fixtures.map((fixture) => ({
        tournament_id: tournamentId,
        stage_id: stage.id,
        venue_id:
          venueIds.length > 0 ? venueIds[fixture.venueIndex % venueIds.length] ?? null : null,
        match_number: fixture.matchNumber,
        round_name: fixture.roundName,
        home_team_id: fixture.homeTeamId,
        away_team_id: fixture.awayTeamId,
        kickoff_time: fixture.kickoffTime,
        status: "SCHEDULED" as const,
      })),
    );

    if (error) redirectWithError(back, explainDbError(error));
    inserted += fixtures.length;
  }

  if (inserted === 0) {
    redirectWithError(
      back,
      unassigned > 0
        ? "Some groups have fewer than two teams. Re-run the draw with more approved teams."
        : "Every group already has fixtures.",
    );
  }

  revalidatePath(back);
  redirectWithFlash(back, `Generated ${inserted} group fixtures.`);
}

export async function generateBracketAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  const { data: approved } = await ctx.supabase
    .from("teams")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("registration_status", "APPROVED");

  if (!approved || approved.length < 2) {
    redirectWithError(back, "Approve at least two teams first.");
  }

  const { data: stages } = await ctx.supabase
    .from("stages")
    .select("id, name, stage_type, sequence_order, qualifiers_count")
    .eq("tournament_id", tournamentId)
    .order("sequence_order");

  const groupStages = (stages ?? []).filter((stage) => stage.stage_type === "GROUP");
  const knockoutStages = (stages ?? []).filter((stage) => stage.stage_type === "KNOCKOUT");

  const qualifiers: string[] = [];

  if (ctx.tournament.format === "GROUP_PLUS_KNOCKOUT" && groupStages.length > 0) {
    for (const stage of groupStages) {
      const { data: rows } = await ctx.supabase
        .from("standings")
        .select("*")
        .eq("stage_id", stage.id);

      const sorted = (rows ?? []).sort(
        (a, b) =>
          b.points - a.points ||
          b.goal_difference - a.goal_difference ||
          b.goals_for - a.goals_for,
      );

      qualifiers.push(
        ...sorted.slice(0, stage.qualifiers_count).map((row) => row.team_id),
      );
    }
  }

  if (qualifiers.length < 2) {
    qualifiers.push(...approved.map((team) => team.id));
  }

  if (knockoutStages.length > 0) {
    const { count } = await ctx.supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .in("stage_id", knockoutStages.map((stage) => stage.id));

    if ((count ?? 0) > 0) {
      redirectWithError(back, "The knockout bracket already exists. Clear fixtures to rebuild it.");
    }
  }

  let stageId = knockoutStages[0]?.id;

  if (!stageId) {
    const { data: stage, error } = await ctx.supabase
      .from("stages")
      .insert({
        tournament_id: tournamentId,
        name: "Knockout",
        stage_type: "KNOCKOUT",
        sequence_order: (stages?.length ?? 0) + 1,
        qualifiers_count: 1,
      })
      .select("id")
      .single();

    if (error || !stage) redirectWithError(back, explainDbError(error));
    stageId = stage.id;
  }

  const { data: lastMatch } = await ctx.supabase
    .from("matches")
    .select("match_number")
    .eq("tournament_id", tournamentId)
    .order("match_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: venues } = await ctx.supabase
    .from("venues")
    .select("id")
    .eq("tournament_id", tournamentId)
    .order("name");

  const venueIds = (venues ?? []).map((venue) => venue.id);

  const nodes = buildKnockoutBracket(qualifiers, {
    startDate: startOfTournament(ctx.tournament.start_date),
    intervalDays: 3,
    firstMatchNumber: (lastMatch?.match_number ?? 0) + 1,
    venueCount: venueIds.length,
  });

  if (nodes.length === 0) redirectWithError(back, "Not enough qualifiers to build a bracket.");

  const keyToId = new Map<string, string>();

  // Insert from the final backwards so every next_match_id already exists.
  const descending = [...nodes].sort((a, b) => b.round - a.round);

  for (const node of descending) {
    const { data: match, error } = await ctx.supabase
      .from("matches")
      .insert({
        tournament_id: tournamentId,
        stage_id: stageId,
        venue_id:
          venueIds.length > 0 ? venueIds[node.venueIndex % venueIds.length] ?? null : null,
        match_number: node.matchNumber,
        round_name: node.roundName,
        home_team_id: node.homeTeamId,
        away_team_id: node.awayTeamId,
        kickoff_time: node.kickoffTime,
        status: "SCHEDULED" as const,
      })
      .select("id")
      .single();

    if (error || !match) redirectWithError(back, explainDbError(error));
    keyToId.set(node.key, match.id);
  }

  for (const node of nodes) {
    const matchId = keyToId.get(node.key);
    if (!matchId || !node.nextKey) continue;
    const nextId = keyToId.get(node.nextKey);
    if (!nextId) continue;

    await ctx.supabase
      .from("matches")
      .update({ next_match_id: nextId, next_match_slot: node.nextSlot })
      .eq("id", matchId);
  }

  // Byes: a lone team walks into the next round immediately.
  for (const node of nodes) {
    if (!node.nextKey) continue;
    const onlyTeam = node.homeTeamId ?? node.awayTeamId;
    const otherTeam = node.homeTeamId ? node.awayTeamId : node.homeTeamId;
    if (!onlyTeam || otherTeam) continue;

    const nextId = keyToId.get(node.nextKey);
    if (!nextId) continue;

    await ctx.supabase
      .from("matches")
      .update(node.nextSlot === "HOME" ? { home_team_id: onlyTeam } : { away_team_id: onlyTeam })
      .eq("id", nextId);
  }

  revalidatePath(back);
  redirectWithFlash(
    back,
    `Knockout bracket built with ${nodes.length} matches. Winners advance automatically.`,
  );
}

export async function clearFixturesAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  if (text(formData, "confirm") !== "CLEAR") {
    redirectWithError(back, "Type CLEAR to confirm deleting every fixture and result.");
  }

  const { error } = await ctx.supabase
    .from("matches")
    .delete()
    .eq("tournament_id", tournamentId);

  if (error) redirectWithError(back, explainDbError(error));

  revalidatePath(back);
  redirectWithFlash(back, "All fixtures cleared. Standings were recalculated automatically.");
}

/* -------------------------------------------------------------------------- */
/* Registration queue                                                         */
/* -------------------------------------------------------------------------- */

export async function approveTeamAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const teamId = text(formData, "team_id");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  const { count } = await ctx.supabase
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .eq("registration_status", "APPROVED");

  if ((count ?? 0) >= ctx.tournament.max_teams) {
    redirectWithError(back, `This tournament is full (${ctx.tournament.max_teams} teams).`);
  }

  const { data: teamRow } = await ctx.supabase
    .from("teams")
    .select(
      "id, name, short_name, home_kit_color, away_kit_color, payment_transaction_id, payment_proof_url",
    )
    .eq("id", teamId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (!teamRow) redirectWithError(back, "That team could not be found.");

  const submission = await readTeamSubmission(teamId);
  if (!submission) {
    redirectWithError(back, "The manager has not submitted this team for review yet.");
  }

  const { count: squadSize } = await ctx.supabase
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);

  const [{ data: players }, settings, profile] = await Promise.all([
    ctx.supabase
      .from("players")
      .select("full_name, photo_url, id_document_url")
      .eq("team_id", teamId),
    getTournamentSettings(tournamentId),
    readTeamProfile(teamId),
  ]);

  const readiness = assessTeamReadiness({
    team: teamRow,
    squadSize: squadSize ?? 0,
    minSquadSize: ctx.tournament.min_squad_size,
    registrationFee: Number(ctx.tournament.registration_fee),
    players: players ?? [],
    requireIdDocument: settings.requireIdDocument,
    requirePlayerPhoto: settings.requirePlayerPhoto,
    missingFields: missingRequiredFields(settings, profile.fields),
  });

  if (!readiness.ready) {
    redirectWithError(
      back,
      `This team is not complete: ${readiness.missing.join(", ")}. Ask the manager to finish and resubmit.`,
    );
  }

  const { error } = await ctx.supabase
    .from("teams")
    .update({ registration_status: "APPROVED", rejection_reason: null })
    .eq("id", teamId)
    .eq("tournament_id", tournamentId);

  if (error) redirectWithError(back, explainDbError(error));

  await markSubmissionReviewed(teamId);

  revalidatePath(back);
  redirectWithFlash(back, "Team approved.");
}

export async function rejectTeamAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const teamId = text(formData, "team_id");
  const reason = text(formData, "reason");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  if (reason.length < 3) {
    redirectWithError(back, "Give a short rejection reason so the manager can fix it.");
  }

  const { error } = await ctx.supabase
    .from("teams")
    .update({ registration_status: "REJECTED", rejection_reason: reason })
    .eq("id", teamId)
    .eq("tournament_id", tournamentId);

  if (error) redirectWithError(back, explainDbError(error));

  // A rejected entry must be corrected and resubmitted before it can be
  // approved again, so drop the previous submission marker.
  await deleteTeamSubmission(teamId);

  revalidatePath(back);
  redirectWithFlash(back, "Team rejected with a reason.");
}

export async function verifyPaymentAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const teamId = text(formData, "team_id");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  const { error } = await ctx.supabase
    .from("teams")
    .update({ payment_status: "PAID" })
    .eq("id", teamId)
    .eq("tournament_id", tournamentId);

  if (error) redirectWithError(back, explainDbError(error));

  revalidatePath(back);
  redirectWithFlash(back, "Payment verified.");
}

export async function setRosterLockAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const locked = bool(formData, "locked");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  const { error } = await ctx.supabase
    .from("tournaments")
    .update({ roster_locked: locked })
    .eq("id", tournamentId);

  if (error) redirectWithError(back, explainDbError(error));

  revalidatePath(back);
  redirectWithFlash(
    back,
    locked ? "Rosters locked for kickoff." : "Rosters unlocked — managers can edit again.",
  );
}

export async function assignRefereeAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const matchId = text(formData, "match_id");
  const refereeId = text(formData, "referee_id");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  if (refereeId) {
    const { data: member } = await ctx.supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", ctx.tenant.id)
      .eq("user_id", refereeId)
      .maybeSingle();

    if (member?.role !== "REFEREE") {
      redirectWithError(back, "Pick a referee who belongs to this tenant.");
    }
  }

  const { error } = await ctx.supabase
    .from("matches")
    .update({ referee_id: refereeId || null })
    .eq("id", matchId)
    .eq("tournament_id", tournamentId);

  if (error) redirectWithError(back, explainDbError(error));

  revalidatePath(back);
  redirectWithFlash(back, refereeId ? "Referee assigned." : "Referee unassigned.");
}

export async function correctResultAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const matchId = text(formData, "match_id");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  const parsed = resultSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    redirectWithError(back, parsed.error.issues[0]?.message ?? "Check the score");
  }

  const { error } = await ctx.supabase
    .from("matches")
    .update({
      home_score: parsed.data.home_score,
      away_score: parsed.data.away_score,
      home_penalties: parsed.data.home_penalties ?? null,
      away_penalties: parsed.data.away_penalties ?? null,
      status: "COMPLETED",
    })
    .eq("id", matchId)
    .eq("tournament_id", tournamentId);

  if (error) redirectWithError(back, explainDbError(error));

  const currentClock = await readMatchClock(matchId);
  await saveMatchClock(
    matchId,
    clockForStatus(currentClock, "COMPLETED"),
  ).catch(() => {
    // The result is authoritative; a clock write issue must not block it.
  });

  revalidatePath(back);
  revalidatePath(`/${ctx.tournament.slug}`);
  redirectWithFlash(back, "Result saved. Standings and brackets recalculated.");
}

export async function updateMatchMetaAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const matchId = text(formData, "match_id");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  const kickoff = text(formData, "kickoff_time");
  const venueId = optionalText(formData, "venue_id");
  const status = text(formData, "status");

  // The fixture form also edits venue and kick-off, so it only owns the status
  // while the match has not kicked off. Otherwise saving a venue would quietly
  // reset a running match back to scheduled.
  const { data: existing } = await ctx.supabase
    .from("matches")
    .select("status")
    .eq("id", matchId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  const maySetStatus =
    !existing || existing.status === "SCHEDULED" || existing.status === "POSTPONED";
  const nextStatus =
    maySetStatus && (status === "SCHEDULED" || status === "POSTPONED")
      ? (status as "SCHEDULED" | "POSTPONED")
      : null;

  const { error } = await ctx.supabase
    .from("matches")
    .update({
      kickoff_time: kickoff ? new Date(kickoff).toISOString() : undefined,
      venue_id: venueId,
      ...(nextStatus ? { status: nextStatus } : {}),
    })
    .eq("id", matchId)
    .eq("tournament_id", tournamentId);

  if (error) redirectWithError(back, explainDbError(error));

  if (nextStatus) {
    await saveMatchClock(matchId, clockForStatus(null, nextStatus)).catch(() => {
      // Editing a fixture must not fail because the clock could not be reset.
    });
  }

  revalidatePath(back);
  redirectWithFlash(back, "Fixture updated.");
}

const CLOCK_PHASES = [
  "FIRST_HALF",
  "HALF_TIME",
  "SECOND_HALF",
  "EXTRA_TIME",
  "PENALTIES",
  "COMPLETED",
] as const;

type ClockPhase = (typeof CLOCK_PHASES)[number];

const CLOCK_FLASH: Record<ClockPhase, string> = {
  FIRST_HALF: "Clock started.",
  HALF_TIME: "Half time. Clock paused.",
  SECOND_HALF: "Second half started. Clock running.",
  EXTRA_TIME: "Extra time started. Clock running.",
  PENALTIES: "Penalty shootout. Clock running.",
  COMPLETED: "Full time. Clock stopped.",
};

function revalidateClockPaths(
  tenantSlug: string,
  publicSlug: string,
  tournamentId: string,
  matchId: string,
) {
  revalidatePath(tournamentUrl(tenantSlug, tournamentId));
  revalidatePath(`/${publicSlug}`);
  revalidatePath(`/${publicSlug}/matches`);
  revalidatePath(`/${publicSlug}/matches/${matchId}`);
  revalidatePath(`/referee/match/${matchId}`);
}

/**
 * Organiser control for the live match clock.
 *
 * The clock runs from a server timestamp, so starting it here is immediately
 * visible to every public page and to the referee console. Status changes made
 * here also update the fixture, which keeps the scoreboard and clock in sync.
 */
export async function setMatchClockAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const tournamentId = text(formData, "tournament_id");
  const matchId = text(formData, "match_id");
  const phase = text(formData, "phase");
  const ctx = await requireTournament(slug, tournamentId);
  const back = tournamentUrl(slug, tournamentId);

  const { data: match } = await ctx.supabase
    .from("matches")
    .select("id, status, stage_id, home_score, away_score, home_penalties, away_penalties")
    .eq("id", matchId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (!match) redirectWithError(back, "Fixture not found.");

  if (match.status === "COMPLETED") {
    redirectWithError(back, "This match is already signed off.");
  }

  const prior = await readMatchClock(matchId);
  const usable = prior && prior.status === match.status ? prior : null;

  if (phase === "SET_MINUTE") {
    if (!LIVE_STATUSES.includes(match.status)) {
      redirectWithError(back, "Start the match before adjusting its clock.");
    }

    const minute = Number(text(formData, "minute"));
    if (!Number.isInteger(minute) || minute < 0 || minute > 130) {
      redirectWithError(back, "Match minute must be a whole number between 0 and 130.");
    }

    await saveMatchClock(
      matchId,
      clockForMinute(usable, match.status as MatchStatus, minute),
    ).catch(() => {
      redirectWithError(back, "The clock could not be updated. Try again.");
    });

    revalidateClockPaths(slug, ctx.tournament.slug, tournamentId, matchId);
    redirectWithFlash(back, `Clock set to ${minute}'.`);
  }

  if (phase === "RESET") {
    const { error } = await ctx.supabase
      .from("matches")
      .update({ status: "SCHEDULED" })
      .eq("id", matchId)
      .eq("tournament_id", tournamentId);

    if (error) redirectWithError(back, explainDbError(error));

    await saveMatchClock(matchId, clockForStatus(null, "SCHEDULED")).catch(() => {
      // The status is already back to scheduled; treat the clock as reset.
    });

    revalidateClockPaths(slug, ctx.tournament.slug, tournamentId, matchId);
    redirectWithFlash(back, "Match reset to scheduled.");
  }

  if (!CLOCK_PHASES.includes(phase as ClockPhase)) {
    redirectWithError(back, "Unknown clock action.");
  }

  const next = phase as ClockPhase;

  if (next === "COMPLETED") {
    const { data: stage } = await ctx.supabase
      .from("stages")
      .select("stage_type")
      .eq("id", match.stage_id)
      .maybeSingle();

    const level = match.home_score === match.away_score;
    const hasShootout =
      match.home_penalties !== null && match.away_penalties !== null;

    if (stage?.stage_type === "KNOCKOUT" && level && !hasShootout) {
      redirectWithError(
        back,
        "Level knockout tie: record the penalty shootout before full time.",
      );
    }
  }

  const updated = clockForStatus(usable, next);

  if (next === "FIRST_HALF" && !LIVE_STATUSES.includes(match.status)) {
    const startMinute = Number(text(formData, "start_minute") || "0");
    if (Number.isInteger(startMinute) && startMinute > 0 && startMinute <= 130) {
      updated.elapsedSeconds = startMinute * 60;
    }
  }

  const { error } = await ctx.supabase
    .from("matches")
    .update({ status: next })
    .eq("id", matchId)
    .eq("tournament_id", tournamentId);

  if (error) redirectWithError(back, explainDbError(error));

  await saveMatchClock(matchId, updated).catch(() => {
    // The fixture is updated; the clock will catch up on the next transition.
  });

  revalidateClockPaths(slug, ctx.tournament.slug, tournamentId, matchId);
  redirectWithFlash(back, CLOCK_FLASH[next]);
}
