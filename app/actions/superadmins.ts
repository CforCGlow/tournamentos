"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
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

const superAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  full_name: z.string().trim().max(80).optional().default(""),
});

function tempPassword(): string {
  return `Liga-${Math.random().toString(36).slice(2, 8)}9`;
}

/**
 * Grants platform-owner access to an existing account, or creates the account
 * first when the address is new. More than one superadmin is expected: the only
 * hard rule is that at least one must always remain (see removeSuperAdminAction).
 */
export async function addSuperAdminAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();

  const parsed = superAdminSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the email address");
  }

  const { email, full_name: fullName } = parsed.data;
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id, full_name, global_role")
    .eq("email", email)
    .maybeSingle();

  if (existing?.global_role === "SUPER_ADMIN") {
    return fail(`${email} is already a superadmin.`);
  }

  let userId = existing?.id ?? null;
  let password: string | null = null;

  if (!userId) {
    password = tempPassword();
    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || email.split("@")[0] },
    });

    if (authError || !created.user) {
      return fail(authError?.message ?? "Could not create the account.");
    }

    userId = created.user.id;
  }

  const { error } = await admin
    .from("profiles")
    .update({ global_role: "SUPER_ADMIN" })
    .eq("id", userId);

  if (error) return fail(explainDbError(error));

  revalidatePath("/superadmin");
  revalidatePath("/superadmin/admins");
  revalidatePath("/superadmin/tenants");

  return succeed(
    password
      ? `${email} is now a superadmin. Share the one-time password below once.`
      : `${email} is now a superadmin.`,
    password
      ? { email, password, note: "Shown once. Ask them to change it after signing in." }
      : { email },
  );
}

export async function removeSuperAdminAction(formData: FormData): Promise<void> {
  const ctx = await requireSuperAdmin();
  const userId = text(formData, "user_id");

  if (!userId) redirectWithError("/superadmin/admins", "Missing account.");
  if (userId === ctx.profile.id) {
    redirectWithError(
      "/superadmin/admins",
      "You cannot remove your own superadmin access. Ask another superadmin to do it.",
    );
  }

  const admin = createAdminClient();

  const [{ data: target }, { count }] = await Promise.all([
    admin.from("profiles").select("id, email, global_role").eq("id", userId).maybeSingle(),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("global_role", "SUPER_ADMIN"),
  ]);

  if (!target || target.global_role !== "SUPER_ADMIN") {
    redirectWithError("/superadmin/admins", "That account is not a superadmin.");
  }

  if ((count ?? 0) <= 1) {
    redirectWithError("/superadmin/admins", "At least one superadmin must stay in place.");
  }

  const { error } = await admin
    .from("profiles")
    .update({ global_role: "USER" })
    .eq("id", userId);

  if (error) redirectWithError("/superadmin/admins", explainDbError(error));

  revalidatePath("/superadmin");
  revalidatePath("/superadmin/admins");
  redirectWithFlash("/superadmin/admins", `${target.email} no longer has platform access.`);
}

/**
 * Superadmins can put a person into any client workspace without signing in as
 * that client. New addresses get an account with a one-time password.
 */
export async function addTenantMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();

  const tenantId = text(formData, "tenant_id");
  if (!tenantId) return fail("Missing workspace.");

  const parsed = inviteMemberSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the member details");
  }

  const admin = createAdminClient();
  const { email, role } = parsed.data;

  const { data: tenant } = await admin
    .from("tenants")
    .select("id, name")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenant) return fail("That workspace no longer exists.");

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

  const { error } = await admin
    .from("tenant_members")
    .upsert(
      { tenant_id: tenantId, user_id: userId, role },
      { onConflict: "tenant_id,user_id" },
    );

  if (error) return fail(explainDbError(error));

  revalidatePath(`/superadmin/tenants/${tenantId}`);
  revalidatePath("/superadmin/tenants");

  return succeed(
    password
      ? `${email} now has access to ${tenant.name}. Share the one-time password below once.`
      : `${email} now has access to ${tenant.name}.`,
    password
      ? { email, password, note: "Shown once. Ask them to change it after signing in." }
      : { email },
  );
}

export async function removeTenantMemberAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();

  const tenantId = text(formData, "tenant_id");
  const memberId = text(formData, "member_id");
  const back = `/superadmin/tenants/${tenantId}`;

  if (!tenantId || !memberId) redirectWithError(back, "Missing member.");

  const admin = createAdminClient();

  const { data: member } = await admin
    .from("tenant_members")
    .select("id, role, user_id")
    .eq("id", memberId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!member) redirectWithError(back, "That member is no longer linked.");

  if (member.role === "TOURNAMENT_ADMIN") {
    const { count } = await admin
      .from("tenant_members")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("role", "TOURNAMENT_ADMIN");

    if ((count ?? 0) <= 1) {
      redirectWithError(
        back,
        "Add another tournament admin first — a workspace cannot be left without one.",
      );
    }
  }

  const { error } = await admin
    .from("tenant_members")
    .delete()
    .eq("id", memberId)
    .eq("tenant_id", tenantId);

  if (error) redirectWithError(back, explainDbError(error));

  revalidatePath(back);
  revalidatePath("/superadmin/tenants");
  redirectWithFlash(back, "Access removed.");
}
