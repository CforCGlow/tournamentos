"use client";

import { useActionState } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { addSuperAdminAction } from "@/app/actions/superadmins";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/actions";

export function AddSuperAdminForm() {
  const [state, action] = useActionState<ActionState, FormData>(addSuperAdminAction, null);
  const credentials = state?.ok ? state.data : undefined;
  const password = credentials?.password;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="superadmin-email">Email address</Label>
          <Input
            id="superadmin-email"
            name="email"
            type="email"
            placeholder="name@example.com"
            autoComplete="off"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="superadmin-name">Full name (optional)</Label>
          <Input
            id="superadmin-name"
            name="full_name"
            placeholder="Used on their account"
            autoComplete="off"
          />
        </div>

        <p className="rounded-md bg-secondary-soft px-3 py-2 text-[11px] leading-relaxed text-sky-900">
          Superadmins manage every workspace, every client console and the public home page. Only
          add people you trust with the whole platform.
        </p>

        <FormError message={state?.ok ? null : state?.error} />

        <SubmitButton className="w-full" pendingLabel="Granting access…">
          <UserPlus className="h-4 w-4" /> Add superadmin
        </SubmitButton>
      </form>

      {password && credentials ? (
        <div className="space-y-2 rounded-lg border bg-surface p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5" /> One-time credentials
          </p>
          <div className="space-y-2 text-sm">
            <p className="flex items-center justify-between gap-2 rounded border bg-card px-3 py-2">
              <span className="text-muted-foreground">Email</span>
              <span className="truncate font-mono text-xs">{credentials.email}</span>
            </p>
            <p className="flex items-center justify-between gap-2 rounded border bg-card px-3 py-2">
              <span className="text-muted-foreground">Password</span>
              <span className="font-mono text-xs">{password}</span>
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Share this once over a secure channel — it is not stored and cannot be shown again.
          </p>
        </div>
      ) : state?.ok ? (
        <Alert tone="success">{state.message}</Alert>
      ) : null}
    </div>
  );
}
