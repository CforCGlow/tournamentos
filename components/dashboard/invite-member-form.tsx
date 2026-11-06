"use client";

import { useActionState, useState } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { inviteMemberAction } from "@/app/actions/members";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert } from "@/components/ui/alert";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/actions";

const ROLE_HINT: Record<string, string> = {
  REFEREE:
    "Referees can only score the matches you assign to them. They cannot edit fixtures, teams or payments.",
  TOURNAMENT_ADMIN:
    "Co-admins get the full console: registrations, fixtures, results and referee management.",
  TEAM_MANAGER:
    "Team managers only see the squad they own — roster edits, lineups and payments.",
};

export function InviteMemberForm({ tenantSlug }: { tenantSlug: string }) {
  const [state, action] = useActionState<ActionState, FormData>(inviteMemberAction, null);
  const [role, setRole] = useState("REFEREE");

  const credentials = state?.ok ? state.data : undefined;
  const password = credentials?.password;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="tenant_slug" value={tenantSlug} />

        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email address</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            placeholder="referee@example.com"
            autoComplete="off"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Access level</Label>
          <Select
            id="invite-role"
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="REFEREE">Referee — matchday console only</option>
            <option value="TOURNAMENT_ADMIN">Tournament admin — full console</option>
            <option value="TEAM_MANAGER">Team manager — squad &amp; lineups</option>
          </Select>
        </div>

        <p className="rounded-md bg-secondary-soft px-3 py-2 text-[11px] text-sky-900">
          {ROLE_HINT[role]}
        </p>

        <FormError message={state?.ok ? null : state?.error} />

        <SubmitButton className="w-full" pendingLabel="Inviting…">
          <UserPlus className="h-4 w-4" /> Send invite
        </SubmitButton>

        <p className="text-[11px] text-muted-foreground">
          New addresses get an account with a temporary password shown once, right here.
        </p>
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
            Share this once over a secure channel — it is not stored anywhere and cannot be
            shown again. The account owner can change it after signing in.
          </p>
        </div>
      ) : state?.ok ? (
        <Alert tone="success">{state.message}</Alert>
      ) : null}
    </div>
  );
}
