"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeamContext } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { formToObject, teamRegistrationSchema } from "@/lib/validations";
import { assessTeamReadiness } from "@/lib/team-readiness";
import { deleteTeamSubmission, readTeamSubmission, saveTeamSubmission } from "@/lib/team-submission";
import { readTeamProfile, saveTeamProfile } from "@/lib/team-profile";
import {
  fieldInputName,
  getTournamentSettings,
  missingRequiredFields,
} from "@/lib/tournament-settings";
import { noteManagerEdit, notifyTeamSubmitted } from "@/lib/team-review";
import {
  explainDbError,
  fail,
  redirectWithError,
  redirectWithFlash,
  text,
  type ActionState,
} from "@/lib/actions";

function customFieldValues(
  formData: FormData,
  fields: Array<{ id: string }>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const value = text(formData, fieldInputName(field.id));
    if (value) values[field.id] = value.slice(0, 160);
  }
  return values;
}

/** Public self-service funnel — atomic RPC creates team + tenant membership. */
export async function registerTeamAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = teamRegistrationSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the team details");
  }

  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, tenant_id, registration_fee, status")
    .eq("id", parsed.data.tournament_id)
    .maybeSingle();

  if (!tournament) return fail("That tournament could not be found.");
  if (tournament.status !== "REGISTRATION_OPEN") {
    return fail("Registration is not open for this tournament right now.");
  }

  const settings = await getTournamentSettings(tournament.id);
  const fields = customFieldValues(formData, settings.fields);
  const missing = missingRequiredFields(settings, fields);
  if (missing.length) {
    return fail(`Add the required information: ${missing.join(", ")}.`);
  }

  if (Number(tournament.registration_fee) > 0 && !parsed.data.payment_transaction_id) {
    return fail(
      "Add the payment transfer reference so the organiser can match your entry fee.",
    );
  }

  const { data, error } = await supabase.rpc("register_team", {
    p_tournament_id: parsed.data.tournament_id,
    p_name: parsed.data.name,
    p_short_name: parsed.data.short_name,
    p_home_kit: parsed.data.home_kit_color,
    p_away_kit: parsed.data.away_kit_color,
    p_logo_url: parsed.data.logo_url,
    p_transaction_id: parsed.data.payment_transaction_id,
    p_proof_url: null,
  });

  if (error) return fail(explainDbError(error));
  if (!data) return fail("Registration failed. Please try again.");

  if (Object.keys(fields).length) {
    await saveTeamProfile(data, {
      coachName: null,
      coachPhone: null,
      coachEmail: null,
      fields,
    }).catch(() => {
      // The entry exists; the manager can re-enter extra details in the portal.
    });
  }

  revalidatePath("/");
  redirect(`/manager/${data}?flash=${encodeURIComponent("Registration received. Build your squad, complete the details and submit the team for review.")}`);
}

export async function updateTeamAction(formData: FormData): Promise<void> {
  const teamId = text(formData, "team_id");
  const { supabase, team } = await requireTeamContext(teamId);
  const back = `/manager/${teamId}`;

  const name = text(formData, "name");
  const shortName = text(formData, "short_name").toUpperCase();
  const home = text(formData, "home_kit_color");
  const away = text(formData, "away_kit_color");
  const submittedProof = text(formData, "payment_proof_url");
  const proofChanged =
    Boolean(submittedProof) && submittedProof !== (team.payment_proof_url ?? "");

  if (name.length < 2) redirectWithError(back, "Team name is too short.");
  if (!/^[A-Za-z0-9]{2,4}$/.test(shortName)) {
    redirectWithError(back, "Short code must be 2–4 letters or numbers.");
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(home) || !/^#[0-9a-fA-F]{6}$/.test(away)) {
    redirectWithError(back, "Choose valid kit colours.");
  }

  const identityChanged =
    name !== team.name ||
    shortName !== team.short_name ||
    home.toUpperCase() !== team.home_kit_color.toUpperCase() ||
    away.toUpperCase() !== team.away_kit_color.toUpperCase();

  const hadSubmission = Boolean(await readTeamSubmission(team.id));

  const { error } = await supabase
    .from("teams")
    .update({
      name,
      short_name: shortName,
      home_kit_color: home,
      away_kit_color: away,
      logo_url: text(formData, "logo_url") || team.logo_url,
      payment_transaction_id: text(formData, "payment_transaction_id") || null,
      // Removing the file clears the stored path (the identity form re-sends
      // the current one); a new file moves an unpaid entry into the queue.
      payment_proof_url: submittedProof || null,
      ...(proofChanged && team.payment_status !== "PAID"
        ? { payment_status: "PENDING_VERIFICATION" as const }
        : {}),
    })
    .eq("id", team.id);

  if (error) redirectWithError(back, explainDbError(error));

  if (identityChanged) {
    const { data: tournament } = await supabase
      .from("tournaments")
      .select("id, tenant_id, slug")
      .eq("id", team.tournament_id)
      .maybeSingle();

    const { data: tenant } = tournament
      ? await supabase
          .from("tenants")
          .select("slug")
          .eq("id", tournament.tenant_id)
          .maybeSingle()
      : { data: null };

    if (tournament && tenant?.slug) {
      await noteManagerEdit({
        teamId: team.id,
        tenantId: tournament.tenant_id,
        tenantSlug: tenant.slug,
        tournamentId: tournament.id,
        teamName: name,
        what: "The team identity or colours changed",
      });
    }
  }

  // A changed identity no longer matches what the organiser last received. Once
  // a submission exists it stays visible, flagged for review, so the organiser
  // can compare and approve the update instead of losing the entry.
  revalidatePath(back);
  redirectWithFlash(
    back,
    identityChanged && hadSubmission
      ? "Team details saved. The organiser has been notified and will review the update."
      : "Team details saved.",
  );
}

/** Coach and any organiser-defined registration fields (student ID, faculty…). */
export async function saveTeamProfileAction(formData: FormData): Promise<void> {
  const teamId = text(formData, "team_id");
  const { supabase, team } = await requireTeamContext(teamId);
  const back = `/manager/${teamId}`;

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, tenant_id")
    .eq("id", team.tournament_id)
    .maybeSingle();

  if (!tournament) redirectWithError(back, "The tournament could not be found.");

  const settings = await getTournamentSettings(tournament.id);
  const fields = customFieldValues(formData, settings.fields);
  const missing = missingRequiredFields(settings, fields);

  if (missing.length) {
    redirectWithError(back, `Fill in ${missing.join(", ")} before saving.`);
  }

  const coachEmail = text(formData, "coach_email");
  if (coachEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(coachEmail)) {
    redirectWithError(back, "Enter a valid coach email address, or leave it blank.");
  }

  try {
    await saveTeamProfile(team.id, {
      coachName: text(formData, "coach_name") || null,
      coachPhone: text(formData, "coach_phone") || null,
      coachEmail: coachEmail || null,
      fields,
    });
  } catch (error) {
    redirectWithError(
      back,
      error instanceof Error
        ? `The details could not be saved: ${error.message}`
        : "The details could not be saved. Please try again.",
    );
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("slug")
    .eq("id", tournament.tenant_id)
    .maybeSingle();

  if (tenant?.slug) {
    await noteManagerEdit({
      teamId: team.id,
      tenantId: tournament.tenant_id,
      tenantSlug: tenant.slug,
      tournamentId: tournament.id,
      teamName: team.name,
      what: "The coach or registration details changed",
    });
  }

  revalidatePath(back);
  redirectWithFlash(back, "Coach and registration details saved.");
}

/** Manager declares a completed squad ready for organiser review. */
export async function submitTeamAction(formData: FormData): Promise<void> {
  const teamId = text(formData, "team_id");
  const { supabase, team } = await requireTeamContext(teamId);
  const back = `/manager/${teamId}`;
  const success = `/manager/${teamId}/submitted`;

  if (team.registration_status === "APPROVED") {
    redirectWithError(back, "This team is already approved.");
  }

  const [{ data: tournament }, { data: players }, { count }] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, name, slug, tenant_id, min_squad_size, registration_fee")
      .eq("id", team.tournament_id)
      .maybeSingle(),
    supabase
      .from("players")
      .select("full_name, photo_url, id_document_url")
      .eq("team_id", team.id),
    supabase
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("team_id", team.id),
  ]);

  if (!tournament) {
    redirectWithError(back, "The tournament could not be found.");
  }

  const [settings, profile, { data: tenant }] = await Promise.all([
    getTournamentSettings(tournament.id),
    readTeamProfile(team.id),
    supabase.from("tenants").select("slug").eq("id", tournament.tenant_id).maybeSingle(),
  ]);

  const readiness = assessTeamReadiness({
    team,
    squadSize: count ?? 0,
    minSquadSize: tournament.min_squad_size,
    registrationFee: Number(tournament.registration_fee),
    players: players ?? [],
    requireIdDocument: settings.requireIdDocument,
    requirePlayerPhoto: settings.requirePlayerPhoto,
    missingFields: missingRequiredFields(settings, profile.fields),
  });

  if (!readiness.ready) {
    redirectWithError(
      back,
      `Finish the checklist before submitting: ${readiness.missing.join(", ")}.`,
    );
  }

  try {
    await saveTeamSubmission(team.id, {
      submittedAt: new Date().toISOString(),
      squadSize: count ?? 0,
      changesPending: false,
    });
  } catch (error) {
    redirectWithError(
      back,
      error instanceof Error
        ? `The submission could not be saved: ${error.message}`
        : "The submission could not be saved. Please try again.",
    );
  }

  if (tenant?.slug) {
    await notifyTeamSubmitted({
      tenantId: tournament.tenant_id,
      tenantSlug: tenant.slug,
      tournamentId: tournament.id,
      teamId: team.id,
      teamName: team.name,
      squadSize: count ?? 0,
    });
  }

  revalidatePath(back);
  revalidatePath(success);
  return redirect(
    `${success}?flash=${encodeURIComponent(
      team.registration_status === "REJECTED"
        ? "Team resubmitted for review."
        : "Team submitted for review.",
    )}`,
  );
}

export async function deleteTeamAction(formData: FormData): Promise<void> {
  const teamId = text(formData, "team_id");
  const { supabase, team } = await requireTeamContext(teamId);

  if (team.registration_status !== "PENDING") {
    redirectWithError(`/manager/${teamId}`, "Only pending entries can be withdrawn.");
  }

  const { error } = await supabase.from("teams").delete().eq("id", teamId);
  if (error) redirectWithError(`/manager/${teamId}`, explainDbError(error));

  await deleteTeamSubmission(teamId);

  revalidatePath("/");
  redirectWithFlash("/portal", "Team entry withdrawn.");
}
