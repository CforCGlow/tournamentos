"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updatePasswordAction } from "@/app/actions/auth";
import { FormError } from "@/components/forms/form-error";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/actions";

export function ResetPasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(
    updatePasswordAction,
    null,
  );

  if (state?.ok) {
    return (
      <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-5 text-sm">
        <p className="font-semibold text-primary">{state.message}</p>
        <p className="text-muted-foreground">
          Your password has been changed and you are already signed in.
        </p>
        <Link
          href="/portal"
          className="inline-flex text-sm font-semibold text-primary hover:underline"
        >
          Continue to your workspace →
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          placeholder="••••••••"
          minLength={8}
          required
        />
        <p className="text-[11px] text-muted-foreground">
          At least 8 characters, with a letter and a number.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">Repeat password</Label>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          placeholder="••••••••"
          minLength={8}
          required
        />
      </div>

      <FormError message={state?.error} />

      <SubmitButton className="w-full" size="lg" pendingLabel="Saving…">
        Set new password
      </SubmitButton>
    </form>
  );
}
