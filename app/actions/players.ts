"use server";

import { revalidatePath } from "next/cache";
import { requireTeamContext } from "@/lib/auth";
import { formToObject, playerSchema } from "@/lib/validations";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { noteManagerEdit } from "@/lib/team-review";
import {
  explainDbError,
  redirectWithError,
  redirectWithFlash,
  text,
} from "@/lib/actions";

async function teamLimits(teamId: string) {
  const ctx = await requireTeamContext(teamId);

  const [{ data: tournament }, { count }, settings] = await Promise.all([
    ctx.supabase
      .from("tournaments")
      .select("id, name, slug, tenant_id, roster_locked, min_squad_size, max_squad_size")
      .eq("id", ctx.team.tournament_id)
      .maybeSingle(),
    ctx.supabase
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId),
    getTournamentSettings(ctx.team.tournament_id),
  ]);

  const { data: tenant } = tournament
    ? await ctx.supabase
        .from("tenants")
        .select("slug")
        .eq("id", tournament.tenant_id)
        .maybeSingle()
    : { data: null };

  return {
    ...ctx,
    tournament,
    tenantSlug: tenant?.slug ?? null,
    settings,
    squadSize: count ?? 0,
  };
}

function documentError(
  settings: { requirePlayerPhoto: boolean; requireIdDocument: boolean },
  photo: string | null,
  idDocument: string | null,
): string | null {
  if (settings.requirePlayerPhoto && !photo) {
    return "This tournament requires a photo for every player. Upload one before saving.";
  }
  if (settings.requireIdDocument && !idDocument) {
    return "This tournament requires an ID document for every player. Upload one before saving.";
  }
  return null;
}

async function notifyEdit(
  ctx: Awaited<ReturnType<typeof teamLimits>>,
  what: string,
): Promise<void> {
  if (ctx.isAdmin || !ctx.tournament || !ctx.tenantSlug) return;
  await noteManagerEdit({
    teamId: ctx.team.id,
    tenantId: ctx.tournament.tenant_id,
    tenantSlug: ctx.tenantSlug,
    tournamentId: ctx.tournament.id,
    teamName: ctx.team.name,
    what,
  });
}

export async function addPlayerAction(formData: FormData): Promise<void> {
  const teamId = text(formData, "team_id");
  const ctx = await teamLimits(teamId);
  const back = `/manager/${teamId}`;

  if (ctx.tournament?.roster_locked) {
    redirectWithError(back, "The squad is locked for kickoff. Ask the organiser to unlock it.");
  }

  if ((ctx.squadSize ?? 0) >= (ctx.tournament?.max_squad_size ?? 23)) {
    redirectWithError(
      back,
      `Squad limit reached (${ctx.tournament?.max_squad_size ?? 23} players).`,
    );
  }

  const parsed = playerSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    redirectWithError(back, parsed.error.issues[0]?.message ?? "Check the player details");
  }

  const data = parsed.data;

  const missingDocument = documentError(ctx.settings, data.photo_url, data.id_document_url);
  if (missingDocument) redirectWithError(back, missingDocument);

  const { data: clash } = await ctx.supabase
    .from("players")
    .select("id, full_name")
    .eq("team_id", teamId)
    .eq("jersey_number", data.jersey_number)
    .maybeSingle();

  if (clash) {
    redirectWithError(
      back,
      `Jersey #${data.jersey_number} already belongs to ${clash.full_name}.`,
    );
  }

  if (data.is_captain) {
    await ctx.supabase.from("players").update({ is_captain: false }).eq("team_id", teamId);
  }

  const { error } = await ctx.supabase.from("players").insert({
    team_id: teamId,
    full_name: data.full_name,
    jersey_number: data.jersey_number,
    position: data.position,
    date_of_birth: data.date_of_birth,
    photo_url: data.photo_url,
    id_document_url: data.id_document_url,
    is_captain: data.is_captain,
  });

  if (error) redirectWithError(back, explainDbError(error));

  await notifyEdit(ctx, `${data.full_name} was added to the squad`);

  revalidatePath(back);
  redirectWithFlash(back, `${data.full_name} added to the squad.`);
}

export async function updatePlayerAction(formData: FormData): Promise<void> {
  const teamId = text(formData, "team_id");
  const playerId = text(formData, "player_id");
  const ctx = await teamLimits(teamId);
  const back = `/manager/${teamId}`;

  if (ctx.tournament?.roster_locked) {
    redirectWithError(back, "The squad is locked for kickoff. Ask the organiser to unlock it.");
  }

  const { data: player } = await ctx.supabase
    .from("players")
    .select("id, team_id, photo_url, id_document_url")
    .eq("id", playerId)
    .maybeSingle();

  if (!player || player.team_id !== teamId) {
    redirectWithError(back, "Player not found in this squad.");
  }

  const parsed = playerSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    redirectWithError(back, parsed.error.issues[0]?.message ?? "Check the player details");
  }

  const data = parsed.data;
  const photo = data.photo_url ?? player.photo_url;
  const idDocument = data.id_document_url ?? player.id_document_url;

  const missingDocument = documentError(ctx.settings, photo, idDocument);
  if (missingDocument) redirectWithError(back, missingDocument);

  const { data: clash } = await ctx.supabase
    .from("players")
    .select("id")
    .eq("team_id", teamId)
    .eq("jersey_number", data.jersey_number)
    .neq("id", playerId)
    .maybeSingle();

  if (clash) {
    redirectWithError(back, `Jersey #${data.jersey_number} is already taken in this squad.`);
  }

  if (data.is_captain) {
    await ctx.supabase
      .from("players")
      .update({ is_captain: false })
      .eq("team_id", teamId)
      .neq("id", playerId);
  }

  const { error } = await ctx.supabase
    .from("players")
    .update({
      full_name: data.full_name,
      jersey_number: data.jersey_number,
      position: data.position,
      date_of_birth: data.date_of_birth,
      photo_url: photo,
      id_document_url: idDocument,
      is_captain: data.is_captain,
    })
    .eq("id", playerId);

  if (error) redirectWithError(back, explainDbError(error));

  await notifyEdit(ctx, `${data.full_name}'s player details changed`);

  revalidatePath(back);
  redirectWithFlash(back, "Player updated.");
}

export async function deletePlayerAction(formData: FormData): Promise<void> {
  const teamId = text(formData, "team_id");
  const playerId = text(formData, "player_id");
  const ctx = await teamLimits(teamId);
  const back = `/manager/${teamId}`;

  if (ctx.tournament?.roster_locked) {
    redirectWithError(back, "The squad is locked for kickoff. Ask the organiser to unlock it.");
  }

  const { data: player } = await ctx.supabase
    .from("players")
    .select("full_name")
    .eq("id", playerId)
    .eq("team_id", teamId)
    .maybeSingle();

  const { error } = await ctx.supabase
    .from("players")
    .delete()
    .eq("id", playerId)
    .eq("team_id", teamId);

  if (error) redirectWithError(back, explainDbError(error));

  await notifyEdit(ctx, `${player?.full_name ?? "A player"} was removed from the squad`);

  revalidatePath(back);
  redirectWithFlash(back, "Player removed from the squad.");
}

export async function verifyPlayerAction(formData: FormData): Promise<void> {
  const teamId = text(formData, "team_id");
  const playerId = text(formData, "player_id");
  const verified = text(formData, "verified") === "true";
  const ctx = await requireTeamContext(teamId);
  const back = `/manager/${teamId}`;

  if (!ctx.isAdmin) {
    redirectWithError(back, "Only the tournament organiser can verify identity documents.");
  }

  const { error } = await ctx.supabase
    .from("players")
    .update({ is_verified: verified })
    .eq("id", playerId)
    .eq("team_id", teamId);

  if (error) redirectWithError(back, explainDbError(error));

  revalidatePath(back);
  redirectWithFlash(back, verified ? "Player verified." : "Verification removed.");
}

export async function clearSuspensionAction(formData: FormData): Promise<void> {
  const teamId = text(formData, "team_id");
  const playerId = text(formData, "player_id");
  const ctx = await requireTeamContext(teamId);
  const back = `/manager/${teamId}`;

  if (!ctx.isAdmin) {
    redirectWithError(back, "Only the organiser can clear a suspension.");
  }

  const { error } = await ctx.supabase
    .from("players")
    .update({
      is_suspended: false,
      yellow_cards_accumulated: 0,
      red_cards_accumulated: 0,
    })
    .eq("id", playerId)
    .eq("team_id", teamId);

  if (error) redirectWithError(back, explainDbError(error));

  revalidatePath(back);
  redirectWithFlash(back, "Suspension served — the player is available again.");
}
