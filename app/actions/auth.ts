"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createEmailClient } from "@/utils/supabase/mailer";
import { formToObject, profileSchema, signInSchema, signUpSchema, type LoginState } from "@/lib/validations";
import { explainDbError, fail, succeed, type ActionState } from "@/lib/actions";
import { safeNextPath } from "@/lib/utils";
import type { Database } from "@/lib/database.types";

type Client = Awaited<ReturnType<typeof createClient>>;

async function landingFor(supabase: Client, userId: string): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("global_role")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.global_role === "SUPER_ADMIN") return "/superadmin";

  const { data: memberships } = await supabase
    .from("tenant_members")
    .select("role, tenant_id")
    .eq("user_id", userId);

  const rows = memberships ?? [];

  // Tenant slugs live in a separate table; PostgREST embeds are not declared on
  // the client types, so resolve the first administered workspace explicitly.
  const adminTenantIds = rows
    .filter((member) => member.role === "TOURNAMENT_ADMIN")
    .map((member) => member.tenant_id);

  if (adminTenantIds.length) {
    const { data: tenants } = await supabase
      .from("tenants")
      .select("slug")
      .in("id", adminTenantIds)
      .order("created_at")
      .limit(1);

    const slug = tenants?.[0]?.slug;
    if (slug) return `/dashboard/${slug}`;
  }

  const { data: team } = await supabase
    .from("teams")
    .select("id")
    .eq("manager_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (team) return `/manager/${team.id}`;
  if (rows.some((member) => member.role === "REFEREE")) return "/referee";
  return "/portal";
}

export async function signInAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = signInSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    if (/email not confirmed|not confirmed/i.test(error?.message ?? "")) {
      return {
        error:
          "Verify your email first. Open the verification link we emailed you, or resend it from the email verification page.",
      };
    }
    return { error: "Invalid email or password." };
  }

  const next = formData.get("next");
  const fallback = await landingFor(supabase, data.user.id);
  redirect(safeNextPath(typeof next === "string" ? next : null, fallback));
}

function verificationMessage(isExisting: boolean): string {
  return isExisting
    ? "This email already has an account. If it is not verified yet, we have sent a fresh verification link."
    : "We sent a verification link to your inbox. Open it to verify your email and finish signing in.";
}

/**
 * Account creation is deliberately split in two:
 *
 * 1. The user is created with `email_confirm: false`, so Supabase will not let
 *    them sign in until the address is proven.
 * 2. Supabase emails a single-use verification link. Opening it marks the
 *    address confirmed and drops the user straight into their workspace.
 *
 * This keeps verification enforced even though the project's mailer normally
 * auto-confirms new accounts.
 */
export async function signUpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check your details");
  }

  const next = safeNextPath(
    typeof formData.get("next") === "string" ? String(formData.get("next")) : null,
    "/portal",
  );
  const origin = await requestOrigin();
  const admin = createAdminClient();

  const created = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: false,
    user_metadata: { full_name: parsed.data.fullName, phone: parsed.data.phone },
  });

  const alreadyExists = Boolean(
    created.error && /already|registered|exists/i.test(created.error.message),
  );
  if (created.error && !alreadyExists) {
    return fail(explainDbError(created.error));
  }

  const supabase = createEmailClient();
  const { error: sendError } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/confirm?type=signup&email=${encodeURIComponent(
        parsed.data.email,
      )}&next=${encodeURIComponent(next)}`,
    },
  });

  if (sendError) {
    if (sendError.status === 429 || /rate limit|too many/i.test(sendError.message)) {
      return fail(
        "This site has hit its email limit for the hour. Try again shortly, or ask the organiser for help.",
      );
    }
    return fail(
      "Your account was created, but the verification email could not be sent. Use “Resend verification email” on the next screen.",
    );
  }

  return succeed(
    verificationMessage(alreadyExists),
    {
      verify: `/register/verify?email=${encodeURIComponent(parsed.data.email)}&next=${encodeURIComponent(next)}`,
    },
  );
}

/** Sends a fresh verification link from the "check your inbox" screen. */
export async function resendVerificationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail("Enter the email address you registered with.");
  }

  const next = safeNextPath(
    typeof formData.get("next") === "string" ? String(formData.get("next")) : null,
    "/portal",
  );
  const origin = await requestOrigin();
  const supabase = createEmailClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/confirm?type=signup&email=${encodeURIComponent(
        email,
      )}&next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    if (error.status === 429 || /rate limit|too many/i.test(error.message)) {
      return fail(
        "This site has hit its email limit for the hour. Try again shortly.",
      );
    }
    return fail(
      error.message.toLowerCase().includes("not found")
        ? "That email is not registered yet. Create an account first."
        : explainDbError(error),
    );
  }

  return succeed("A fresh verification link is on its way. It can take a minute to arrive.");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail("Enter a valid email address.");
  }

  const origin = await requestOrigin();
  // Implicit flow keeps reset links usable when the inbox is opened on a
  // different device from the one that requested the reset.
  const supabase = createEmailClient();

  // Errors are intentionally swallowed: revealing whether an address exists
  // would turn this form into an account-enumeration oracle. Throttling is the
  // exception — staying silent there just leaves people waiting for an email
  // that was never sent.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?type=recovery&email=${encodeURIComponent(
      email,
    )}&next=/reset-password`,
  });

  if (error && (error.status === 429 || /rate limit|too many/i.test(error.message))) {
    return fail(
      "This site has hit its email limit for the hour. Try again shortly, or ask the organiser for a reset link.",
    );
  }

  return succeed("If that email has an account, a reset link is on its way.");
}

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = profileSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check your details");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session expired. Sign in again.");

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.full_name, phone: parsed.data.phone })
    .eq("id", user.id);

  if (error) return fail(explainDbError(error));
  return succeed("Profile updated.");
}

export async function updatePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = formData.get("confirm");

  if (password.length < 8) return fail("Use at least 8 characters.");
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return fail("Include at least one letter and one number.");
  }
  if (typeof confirm === "string" && confirm !== password) {
    return fail("Both passwords must match.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return fail(explainDbError(error));
  return succeed("Password changed.");
}

export type { Database };
