"use client";

import { useActionState, useState } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { addTenantMemberAction } from "@/app/actions/superadmins";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert } from "@/components/ui/alert";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/actions";

const ROLE_HINT: Record<string, string> = {
  TOURNAMENT_ADMIN:
    "Full console: tournaments, registrations, fixtures, results, payments and staff invites.",
  REFEREE: "Only the fixtures you assign to them, with the pitch-side scoring console.",
  TEAM_MANAGER: "One squad: roster edits, lineups and their own entry payment status.",
};

export function AddTenantMemberForm({ tenantId }: { tenantId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(addTenantMemberAction, null);
  const [role, setRole] = useState("TOURNAMENT_ADMIN");

  const credentials = state?.ok ? state.data : undefined;
  const password = credentials?.password;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <input type="hidden" name="tenant_id" value={tenantId} />

        <div className="space-y-1.5">
          <Label htmlFor="member-email">Email address</Label>
          <Input
            id="member-email"
            name="email"
            type="email"
            placeholder="admin@example.com"
            autoComplete="off"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="member-role">Access level</Label>
          <Select
            id="member-role"
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="TOURNAMENT_ADMIN">Tournament admin</option>
            <option value="REFEREE">Referee</option>
            <option value="TEAM_MANAGER">Team manager</option>
          </Select>
        </div>

        <p className="rounded-md bg-secondary-soft px-3 py-2 text-[11px] leading-relaxed text-sky-900">
          {ROLE_HINT[role]}
        </p>

        <FormError message={state?.ok ? null : state?.error} />

        <SubmitButton className="w-full" pendingLabel="Adding…">
          <UserPlus className="h-4 w-4" /> Add to workspace
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
        </div>
      ) : state?.ok ? (
        <Alert tone="success">{state.message}</Alert>
      ) : null}
    </div>
  );
}
