import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email on your LigaPro account and we will send a secure link."
      footer={
        <p>
          Links expire after one hour. If nothing arrives, check spam or ask your
          tournament organiser to re-send it.
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
