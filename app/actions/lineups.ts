"use server";

import { revalidatePath } from "next/cache";
import { isTenantAdmin, requireProfile } from "@/lib/auth";
import { redirectWithError, redirectWithFlash, text } from "@/lib/actions";

export async function saveLineupAction(formData: FormData): Promise<void> {
  const matchId = text(formData, "match_id");
  const teamId = text(formData, "team_id");
  const back = `/manager/${teamId}/lineup/${matchId}`;

  const ctx = await requireProfile(back);
  const { supabase } = ctx;

  const { data: match } = await supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) redirectWithError(`/manager/${teamId}`, "Match not found.");

  const { data: team } = await supabase
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .maybeSingle();

  if (!team) redirectWithError("/portal", "Team not found.");

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("tenant_id, slug")
    .eq("id", match.tournament_id)
    .maybeSingle();

  const admin = tournament
    ? await isTenantAdmin(supabase, tournament.tenant_id, ctx.profile.id)
    : false;

  if (team.manager_id !== ctx.profile.id && !admin) {
    redirectWithError(back, "Only this team's manager can submit the lineup.");
  }

  if (match.status !== "SCHEDULED") {
    redirectWithError(back, "Lineups lock the moment the match kicks off.");
  }

  if (match.home_team_id !== teamId && match.away_team_id !== teamId) {
    redirectWithError(back, "This team is not playing in that match.");
  }

  const starters = formData
    .getAll("starting")
    .map(String)
    .filter(Boolean)
    .map((entry) => {
      const [slot, playerId] = entry.split(":");
      return { slot: slot ?? "", playerId: playerId ?? "" };
    })
    .filter((entry) => entry.playerId);

  const substitutes = formData.getAll("substitute").map(String).filter(Boolean);

  if (starters.length !== 11) {
    redirectWithError(back, `Pick exactly 11 starters — you selected ${starters.length}.`);
  }

  const uniqueIds = new Set(starters.map((entry) => entry.playerId));
  if (uniqueIds.size !== starters.length) {
    redirectWithError(back, "A player cannot be picked twice.");
  }

  const { data: players } = await supabase
    .from("players")
    .select("id, full_name, is_suspended, team_id")
    .eq("team_id", teamId);

  const byId = new Map((players ?? []).map((player) => [player.id, player]));

  for (const entry of starters) {
    const player = byId.get(entry.playerId);
    if (!player) redirectWithError(back, "One of the selected players is not in this squad.");
    if (player.is_suspended) {
      redirectWithError(back, `${player.full_name} is suspended and cannot be selected.`);
    }
  }

  for (const id of substitutes) {
    if (!byId.has(id)) redirectWithError(back, "A substitute is not in this squad.");
  }

  await supabase.from("match_lineups").delete().eq("match_id", matchId).eq("team_id", teamId);

  const rows = [
    ...starters.map((entry) => ({
      match_id: matchId,
      team_id: teamId,
      player_id: entry.playerId,
      is_starting: true,
      formation_position: entry.slot,
    })),
    ...substitutes.map((playerId) => ({
      match_id: matchId,
      team_id: teamId,
      player_id: playerId,
      is_starting: false,
      formation_position: null,
    })),
  ];

  const { error } = await supabase.from("match_lineups").insert(rows);
  if (error) redirectWithError(back, error.message);

  if (tournament) {
    revalidatePath(`/${tournament.slug}/matches/${matchId}`);
    revalidatePath(`/referee/match/${matchId}`);
  }
  revalidatePath(back);
  redirectWithFlash(back, "Starting XI and substitutes submitted.");
}

export async function clearLineupAction(formData: FormData): Promise<void> {
  const matchId = text(formData, "match_id");
  const teamId = text(formData, "team_id");
  const back = `/manager/${teamId}/lineup/${matchId}`;
  const ctx = await requireProfile(back);

  const { data: team } = await ctx.supabase
    .from("teams")
    .select("manager_id")
    .eq("id", teamId)
    .maybeSingle();

  if (team?.manager_id !== ctx.profile.id) {
    redirectWithError(back, "Only this team's manager can clear the lineup.");
  }

  const { error } = await ctx.supabase
    .from("match_lineups")
    .delete()
    .eq("match_id", matchId)
    .eq("team_id", teamId);

  if (error) redirectWithError(back, error.message);
  revalidatePath(back);
  redirectWithFlash(back, "Lineup cleared.");
}
