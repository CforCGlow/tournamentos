"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck, RefreshCw } from "lucide-react";
import { resendVerificationAction } from "@/app/actions/auth";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/actions";

export function VerifyEmailForm({
  email,
  next,
}: {
  email: string;
  next?: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    resendVerificationAction,
    null,
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border bg-surface/60 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-emerald-700">
          <MailCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-semibold">Check your inbox</p>
          <p className="mt-0.5 break-words text-muted-foreground">
            We sent a verification link to{" "}
            <span className="font-medium text-foreground">{email || "your email address"}</span>.
            Open it to verify the address and sign in automatically.
          </p>
        </div>
      </div>

      <ul className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <li>• The link can take a minute to arrive. Check spam or promotions too.</li>
        <li>• Each link is single-use and expires, so open it as soon as it arrives.</li>
        <li>• You cannot sign in until the address is verified.</li>
      </ul>

      <form action={action} className="space-y-3">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next ?? ""} />

        {email ? null : (
          <div className="space-y-1.5">
            <Label htmlFor="verify-email">Email address</Label>
            <Input
              id="verify-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@organisation.com"
              required
            />
          </div>
        )}

        {state?.ok && state.message ? (
          <Alert tone="success">{state.message}</Alert>
        ) : (
          <FormError message={state?.error} />
        )}

        <SubmitButton variant="outline" className="w-full" pendingLabel="Sending…">
          <RefreshCw className="h-4 w-4" /> Resend verification email
        </SubmitButton>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        Already verified?{" "}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="font-semibold text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
