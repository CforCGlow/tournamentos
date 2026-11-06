"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile, requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  formToObject,
  tenantSchema,
  tenantUpdateSchema,
  workspaceSchema,
} from "@/lib/validations";
import { WORKSPACE_ACCESS } from "@/lib/constants";
import {
  explainDbError,
  fail,
  succeed,
  type ActionState,
} from "@/lib/actions";

function tempPassword(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `Liga-${random}9`;
}

/**
 * Provisions a tenant and, optionally, the client's first TOURNAMENT_ADMIN.
 * Returns a one-time temporary password when a new auth user is created.
 */
export async function createTenantAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();

  const parsed = tenantSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the tenant details");
  }

  const admin = createAdminClient();
  const data = parsed.data;

  const { data: existing } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", data.slug)
    .maybeSingle();

  if (existing) return fail("That slug is already in use.");

  const { data: tenant, error } = await admin
    .from("tenants")
    .insert({
      name: data.name,
      slug: data.slug,
      plan_tier: WORKSPACE_ACCESS.planTier,
      status: "active",
      valid_until: WORKSPACE_ACCESS.validUntil,
      max_tournaments: WORKSPACE_ACCESS.maxTournaments,
      primary_color: data.primary_color,
      logo_url: data.logo_url,
    })
    .select("id, slug")
    .single();

  if (error || !tenant) return fail(explainDbError(error));

  const adminEmail = String(formData.get("admin_email") ?? "").trim().toLowerCase();
  const adminName = String(formData.get("admin_name") ?? "").trim();
  let credentials: Record<string, string> | undefined;

  if (adminEmail) {
    let userId: string | null = null;

    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", adminEmail)
      .maybeSingle();

    if (profile) {
      userId = profile.id;
    } else {
      const password = tempPassword();
      const { data: created, error: authError } = await admin.auth.admin.createUser({
        email: adminEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: adminName || adminEmail.split("@")[0] },
      });

      if (authError || !created.user) {
        return succeed(
          `Workspace “${data.name}” created, but the admin account could not be created: ${authError?.message ?? "unknown error"}.`,
          { tenantId: tenant.id, slug: tenant.slug },
        );
      }

      userId = created.user.id;
      credentials = {
        email: adminEmail,
        password,
        note: "Share this one-time password securely. It will not be shown again.",
      };
    }

    const { error: memberError } = await admin.from("tenant_members").insert({
      tenant_id: tenant.id,
      user_id: userId,
      role: "TOURNAMENT_ADMIN",
    });

    if (memberError) {
      return succeed(
        `Workspace created, but the admin could not be linked: ${explainDbError(memberError)}`,
        { tenantId: tenant.id, slug: tenant.slug },
      );
    }
  }

  revalidatePath("/superadmin");
  revalidatePath("/superadmin/tenants");

  return succeed(
    credentials
      ? `Workspace “${data.name}” is live and the client admin account was created.`
      : `Workspace “${data.name}” is live.`,
    {
      tenantId: tenant.id,
      slug: tenant.slug,
      ...(credentials ?? {}),
    },
  );
}

const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "auth",
  "dashboard",
  "forgot-password",
  "login",
  "manager",
  "portal",
  "referee",
  "register",
  "reset-password",
  "superadmin",
  "suspended",
]);

/**
 * Creates a workspace for the signed-in user and makes them its first
 * TOURNAMENT_ADMIN. Workspaces are free, so signing up leads straight into a
 * working console instead of waiting for an owner to provision one.
 */
export async function createWorkspaceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireProfile("/portal");

  const parsed = workspaceSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the workspace details");
  }

  const data = parsed.data;
  if (RESERVED_SLUGS.has(data.slug)) {
    return fail("That workspace address is reserved. Choose another.");
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", data.slug)
    .maybeSingle();

  if (existing) return fail("That workspace address is already taken.");

  const { data: tenant, error } = await admin
    .from("tenants")
    .insert({
      name: data.name,
      slug: data.slug,
      plan_tier: WORKSPACE_ACCESS.planTier,
      status: "active",
      valid_until: WORKSPACE_ACCESS.validUntil,
      max_tournaments: WORKSPACE_ACCESS.maxTournaments,
      primary_color: data.primary_color,
    })
    .select("id, slug")
    .single();

  if (error || !tenant) return fail(explainDbError(error));

  const { error: memberError } = await admin.from("tenant_members").insert({
    tenant_id: tenant.id,
    user_id: ctx.profile.id,
    role: "TOURNAMENT_ADMIN",
  });

  if (memberError) {
    await admin.from("tenants").delete().eq("id", tenant.id);
    return fail(explainDbError(memberError));
  }

  revalidatePath("/portal");
  revalidatePath("/superadmin");
  revalidatePath("/superadmin/tenants");
  redirect(`/dashboard/${tenant.slug}`);
}

export async function updateTenantAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();

  const id = String(formData.get("tenant_id") ?? "");
  if (!id) return fail("Missing tenant.");

  const parsed = tenantUpdateSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the tenant details");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("tenants").update(parsed.data).eq("id", id);

  if (error) return fail(explainDbError(error));

  revalidatePath("/superadmin");
  revalidatePath("/superadmin/tenants");
  revalidatePath(`/superadmin/tenants/${id}`);
  return succeed("Workspace updated.");
}

export async function setTenantStatusAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("tenant_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["active", "suspended"].includes(status)) {
    redirect("/superadmin/tenants");
  }

  const admin = createAdminClient();
  await admin
    .from("tenants")
    .update({ status: status as "active" | "suspended" })
    .eq("id", id);

  revalidatePath("/superadmin");
  revalidatePath("/superadmin/tenants");
  revalidatePath(`/superadmin/tenants/${id}`);
  redirect(`/superadmin/tenants/${id}?flash=${encodeURIComponent(`Workspace marked ${status}.`)}`);
}

export async function deleteTenantAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("tenant_id") ?? "");
  const confirmation = String(formData.get("confirm") ?? "").trim();
  if (!id) redirect("/superadmin/tenants");
  if (confirmation !== "DELETE") {
    redirect(
      `/superadmin/tenants/${id}?error=${encodeURIComponent("Type DELETE to confirm removal.")}`,
    );
  }

  const admin = createAdminClient();
  await admin.from("tenants").delete().eq("id", id);

  revalidatePath("/superadmin");
  revalidatePath("/superadmin/tenants");
  redirect("/superadmin/tenants?flash=Tenant+deleted");
}
