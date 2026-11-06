import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { createClient } from "@/utils/supabase/server";

export const metadata: Metadata = { title: "Set a new password" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The recovery link establishes a short-lived session in /auth/confirm.
  // Without one there is nothing to update, so send people back to the form
  // that can mint a fresh link.
  if (!user) redirect("/forgot-password");

  return (
    <AuthShell
      title="Set a new password"
      subtitle={`Signed in as ${user.email ?? "your account"}. Choose something you have not used before.`}
      footer={<p>Changing your password signs out other devices on your next visit.</p>}
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
