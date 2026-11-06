"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { formToObject, inviteMemberSchema } from "@/lib/validations";
import {
  explainDbError,
  fail,
  redirectWithError,
  redirectWithFlash,
  succeed,
  text,
  type ActionState,
} from "@/lib/actions";
import { requireTenant } from "@/lib/auth";

function tempPassword(): string {
  return `Ref-${Math.random().toString(36).slice(2, 8)}7`;
}

/** Invite a referee or co-admin by email; creates the auth user if needed. */
export async function inviteMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const slug = text(formData, "tenant_slug");
  const ctx = await requireTenant(slug);

  const parsed = inviteMemberSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the invite details");
  }

  const admin = createAdminClient();
  const { email, role } = parsed.data;

  let userId: string | null = null;
  let password: string | null = null;

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (profile) {
    userId = profile.id;
  } else {
    password = tempPassword();
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: email.split("@")[0] },
    });

    if (error || !created.user) {
      return fail(error?.message ?? "Could not create the account.");
    }
    userId = created.user.id;
  }

  const { error } = await admin.from("tenant_members").upsert(
    { tenant_id: ctx.tenant.id, user_id: userId, role },
    { onConflict: "tenant_id,user_id" },
  );

  if (error) return fail(explainDbError(error));

  revalidatePath(`/dashboard/${slug}/referees`);
  revalidatePath(`/dashboard/${slug}`);

  return succeed(
    password
      ? `${email} added as ${role.replace(/_/g, " ").toLowerCase()}. Share the temporary password once.`
      : `${email} added as ${role.replace(/_/g, " ").toLowerCase()}.`,
    password ? { email, password } : undefined,
  );
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const memberId = text(formData, "member_id");
  const ctx = await requireTenant(slug);

  const { data: member } = await ctx.supabase
    .from("tenant_members")
    .select("user_id, role")
    .eq("id", memberId)
    .eq("tenant_id", ctx.tenant.id)
    .maybeSingle();

  if (member?.user_id === ctx.profile.id) {
    redirectWithError(`/dashboard/${slug}/referees`, "You cannot remove your own access.");
  }

  const { error } = await ctx.supabase
    .from("tenant_members")
    .delete()
    .eq("id", memberId)
    .eq("tenant_id", ctx.tenant.id);

  if (error) redirectWithError(`/dashboard/${slug}/referees`, explainDbError(error));

  revalidatePath(`/dashboard/${slug}/referees`);
  redirectWithFlash(`/dashboard/${slug}/referees`, "Access removed.");
}

export async function updateMemberRoleAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const memberId = text(formData, "member_id");
  const role = text(formData, "role");
  const ctx = await requireTenant(slug);

  if (!["TOURNAMENT_ADMIN", "TEAM_MANAGER", "REFEREE"].includes(role)) {
    redirectWithError(`/dashboard/${slug}/referees`, "Unknown role.");
  }

  const { error } = await ctx.supabase
    .from("tenant_members")
    .update({ role: role as "TOURNAMENT_ADMIN" | "TEAM_MANAGER" | "REFEREE" })
    .eq("id", memberId)
    .eq("tenant_id", ctx.tenant.id);

  if (error) redirectWithError(`/dashboard/${slug}/referees`, explainDbError(error));

  revalidatePath(`/dashboard/${slug}/referees`);
  redirectWithFlash(`/dashboard/${slug}/referees`, "Role updated.");
}

/**
 * Referee accounts are provisioned by a tenant admin (inviteMemberAction).
 * There is deliberately no self-service path: tenant_members inserts are
 * protected by RLS so nobody can grant themselves an operational role.
 */
