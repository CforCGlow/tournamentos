"use server";

import { revalidatePath } from "next/cache";
import { isTenantAdmin, requireProfile } from "@/lib/auth";
import { formToObject, matchEventSchema } from "@/lib/validations";
import {
  explainDbError,
  fail,
  redirectWithError,
  redirectWithFlash,
  succeed,
  text,
  type ActionState,
} from "@/lib/actions";
import { EVENT_LABEL } from "@/lib/constants";
import { clockForStatus } from "@/lib/clock";
import { readMatchClock, saveMatchClock } from "@/lib/match-clock";
import type { MatchRow, MatchStatus, TournamentRow } from "@/lib/database.types";

async function matchContext(matchId: string): Promise<{
  supabase: Awaited<ReturnType<typeof requireProfile>>["supabase"];
  profileId: string;
  match: MatchRow;
  tournament: Pick<TournamentRow, "id" | "slug" | "tenant_id" | "format">;
}> {
  const ctx = await requireProfile(`/referee/match/${matchId}`);
  const { data: match } = await ctx.supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) redirectWithError("/portal", "Match not found.");

  const { data: tournament } = await ctx.supabase
    .from("tournaments")
    .select("id, slug, tenant_id, format")
    .eq("id", match.tournament_id)
    .maybeSingle();

  if (!tournament) redirectWithError("/portal", "Tournament not found.");

  const admin = await isTenantAdmin(ctx.supabase, tournament.tenant_id, ctx.profile.id);

  if (match.referee_id !== ctx.profile.id && !admin) {
    redirectWithError("/portal", "You are not assigned to this match.");
  }

  return {
    supabase: ctx.supabase,
    profileId: ctx.profile.id,
    match,
    tournament,
  };
}

function refreshMatch(match: MatchRow, slug: string) {
  revalidatePath(`/referee/match/${match.id}`);
  revalidatePath(`/${slug}`);
  revalidatePath(`/${slug}/matches`);
  revalidatePath(`/${slug}/matches/${match.id}`);
}

/**
 * Every status change also writes the public clock snapshot. The clock is
 * anchored server-side, so a phone that goes to sleep or a spectator opening
 * the page later still sees the correct minute.
 */
async function writeClock(matchId: string, priorStatus: MatchStatus, nextStatus: MatchStatus) {
  const current = await readMatchClock(matchId);
  const usable = current && current.status === priorStatus ? current : null;
  await saveMatchClock(matchId, clockForStatus(usable, nextStatus)).catch(() => {
    // A clock failure must never block the result itself.
  });
}

export async function recordEventAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = matchEventSchema.safeParse(formToObject(formData));

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the event details");
  }

  const data = parsed.data;
  const ctx = await matchContext(data.match_id);

  if (ctx.match.status === "COMPLETED") {
    return fail("This match is already full time.");
  }

  if (ctx.match.status === "SCHEDULED") {
    return fail("Start the match before logging events.");
  }

  if (
    data.team_id !== ctx.match.home_team_id &&
    data.team_id !== ctx.match.away_team_id
  ) {
    return fail("That team is not playing in this match.");
  }

  if (data.player_id) {
    const { data: player } = await ctx.supabase
      .from("players")
      .select("id, team_id")
      .eq("id", data.player_id)
      .maybeSingle();

    if (!player || player.team_id !== data.team_id) {
      return fail("The selected player does not belong to that team.");
    }
  }

  const { error } = await ctx.supabase.from("match_events").insert({
    match_id: data.match_id,
    team_id: data.team_id,
    player_id: data.player_id ?? null,
    secondary_player_id: data.secondary_player_id ?? null,
    event_type: data.event_type,
    minute: data.minute,
    extra_minute: data.extra_minute ?? null,
  });

  if (error) return fail(explainDbError(error));

  refreshMatch(ctx.match, ctx.tournament.slug);

  return succeed(
    `${EVENT_LABEL[data.event_type]} logged at ${data.minute}'${data.extra_minute ? `+${data.extra_minute}` : ""}.`,
  );
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  const matchId = text(formData, "match_id");
  const eventId = text(formData, "event_id");
  const ctx = await matchContext(matchId);

  if (ctx.match.status === "COMPLETED") {
    redirectWithError(`/referee/match/${matchId}`, "Full-time matches are locked for corrections.");
  }

  const { data: event } = await ctx.supabase
    .from("match_events")
    .select("id, match_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event || event.match_id !== matchId) {
    redirectWithError(`/referee/match/${matchId}`, "Event not found.");
  }

  const { error } = await ctx.supabase.from("match_events").delete().eq("id", eventId);
  if (error) redirectWithError(`/referee/match/${matchId}`, explainDbError(error));

  refreshMatch(ctx.match, ctx.tournament.slug);
  redirectWithFlash(`/referee/match/${matchId}`, "Event removed — score and stats rolled back.");
}

const VALID_STATES = [
  "SCHEDULED",
  "FIRST_HALF",
  "HALF_TIME",
  "SECOND_HALF",
  "EXTRA_TIME",
  "PENALTIES",
  "COMPLETED",
  "POSTPONED",
] as const;

export async function setMatchStateAction(formData: FormData): Promise<void> {
  const matchId = text(formData, "match_id");
  const next = text(formData, "status");
  const back = `/referee/match/${matchId}`;
  const ctx = await matchContext(matchId);

  if (!VALID_STATES.includes(next as (typeof VALID_STATES)[number])) {
    redirectWithError(back, "Unknown match state.");
  }

  if (ctx.match.status === "COMPLETED") {
    redirectWithError(back, "This match is already signed off.");
  }

  if (next === "COMPLETED") {
    const { data: stage } = await ctx.supabase
      .from("stages")
      .select("stage_type")
      .eq("id", ctx.match.stage_id)
      .maybeSingle();

    const level = ctx.match.home_score === ctx.match.away_score;
    const hasShootout =
      ctx.match.home_penalties !== null && ctx.match.away_penalties !== null;

    if (stage?.stage_type === "KNOCKOUT" && level && !hasShootout) {
      redirectWithError(
        back,
        "Level knockout tie: record the penalty shootout before full time.",
      );
    }
  }

  const { error } = await ctx.supabase
    .from("matches")
    .update({ status: next as (typeof VALID_STATES)[number] })
    .eq("id", matchId);

  if (error) redirectWithError(back, explainDbError(error));

  await writeClock(matchId, ctx.match.status, next as MatchStatus);

  refreshMatch(ctx.match, ctx.tournament.slug);
  redirectWithFlash(back, `Match state: ${next.replace(/_/g, " ").toLowerCase()}.`);
}

export async function setPenaltiesAction(formData: FormData): Promise<void> {
  const matchId = text(formData, "match_id");
  const back = `/referee/match/${matchId}`;
  const ctx = await matchContext(matchId);

  const home = Number(text(formData, "home_penalties"));
  const away = Number(text(formData, "away_penalties"));

  if (
    !Number.isInteger(home) ||
    !Number.isInteger(away) ||
    home < 0 ||
    away < 0 ||
    home > 30 ||
    away > 30
  ) {
    redirectWithError(back, "Penalty scores must be whole numbers between 0 and 30.");
  }

  if (home === away) {
    redirectWithError(back, "A shootout cannot end level — sudden death continues.");
  }

  const { error } = await ctx.supabase
    .from("matches")
    .update({ home_penalties: home, away_penalties: away, status: "PENALTIES" })
    .eq("id", matchId);

  if (error) redirectWithError(back, explainDbError(error));

  if (ctx.match.status !== "PENALTIES") {
    await writeClock(matchId, ctx.match.status, "PENALTIES");
  }

  refreshMatch(ctx.match, ctx.tournament.slug);
  redirectWithFlash(back, `Shootout recorded: ${home}-${away}.`);
}

export async function setMvpAction(formData: FormData): Promise<void> {
  const matchId = text(formData, "match_id");
  const playerId = text(formData, "mvp_player_id");
  const back = `/referee/match/${matchId}`;
  const ctx = await matchContext(matchId);

  if (playerId) {
    const { data: player } = await ctx.supabase
      .from("players")
      .select("id, team_id")
      .eq("id", playerId)
      .maybeSingle();

    if (
      !player ||
      (player.team_id !== ctx.match.home_team_id && player.team_id !== ctx.match.away_team_id)
    ) {
      redirectWithError(back, "Pick an MVP from the two teams on the pitch.");
    }
  }

  const { error } = await ctx.supabase
    .from("matches")
    .update({ mvp_player_id: playerId || null })
    .eq("id", matchId);

  if (error) redirectWithError(back, explainDbError(error));

  refreshMatch(ctx.match, ctx.tournament.slug);
  redirectWithFlash(back, "MVP saved.");
}
