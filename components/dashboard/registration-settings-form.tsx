"use client";

import { useActionState, useState } from "react";
import { IdCard, ImageIcon, Plus, Save, Trash2 } from "lucide-react";
import { saveRegistrationSettingsAction } from "@/app/actions/tournaments";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/actions";
import type { RegistrationField, TournamentSettings } from "@/lib/tournament-settings";

function newFieldId(): string {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function RegistrationSettingsForm({
  tenantSlug,
  tournamentId,
  settings,
}: {
  tenantSlug: string;
  tournamentId: string;
  settings: TournamentSettings;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    saveRegistrationSettingsAction,
    null,
  );
  const [fields, setFields] = useState<RegistrationField[]>(settings.fields);
  const [label, setLabel] = useState("");
  const [required, setRequired] = useState(true);

  function addField() {
    const clean = label.trim();
    if (clean.length < 2 || fields.length >= 8) return;
    setFields((current) => [
      ...current,
      { id: newFieldId(), label: clean.slice(0, 60), required },
    ]);
    setLabel("");
    setRequired(true);
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenant_slug" value={tenantSlug} />
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="fields_json" value={JSON.stringify(fields)} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-surface/60 p-3">
          <input
            type="checkbox"
            name="require_id_document"
            defaultChecked={settings.requireIdDocument}
            className="mt-0.5 h-4 w-4 rounded border-input accent-emerald-600"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <IdCard className="h-3.5 w-3.5 text-primary" /> ID document required
            </span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
              Every player must upload an ID before the team can be submitted.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-surface/60 p-3">
          <input
            type="checkbox"
            name="require_player_photo"
            defaultChecked={settings.requirePlayerPhoto}
            className="mt-0.5 h-4 w-4 rounded border-input accent-emerald-600"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <ImageIcon className="h-3.5 w-3.5 text-secondary" /> Player photo required
            </span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
              Every player needs a headshot for the squad sheet and public profile.
            </span>
          </span>
        </label>
      </div>

      <div className="rounded-lg border bg-surface/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold">Extra registration fields</p>
            <p className="text-[11px] text-muted-foreground">
              Collect things like student ID, faculty or date of birth. Leave this empty and
              managers see no extra fields.
            </p>
          </div>
          <span className="rounded-full border bg-card px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {fields.length} / 8
          </span>
        </div>

        {fields.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {fields.map((field) => (
              <li
                key={field.id}
                className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{field.label}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {field.required ? "Required" : "Optional"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  title={`Remove ${field.label}`}
                  onClick={() =>
                    setFields((current) => current.filter((item) => item.id !== field.id))
                  }
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-md border border-dashed px-3 py-3 text-center text-[11px] text-muted-foreground">
            No extra fields yet.
          </p>
        )}

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <div className="space-y-1">
            <Label htmlFor="extra-field-label" className="text-[11px]">
              Field label
            </Label>
            <Input
              id="extra-field-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addField();
                }
              }}
              placeholder="Student ID number"
              maxLength={60}
              className="h-9 text-sm"
              disabled={fields.length >= 8}
            />
          </div>
          <label className="flex items-end gap-2 pb-2 text-[11px] font-medium">
            <input
              type="checkbox"
              checked={required}
              onChange={(event) => setRequired(event.target.checked)}
              className="h-4 w-4 rounded border-input accent-emerald-600"
            />
            Required
          </label>
          <Button
            type="button"
            variant="outline"
            className="h-9 self-end"
            onClick={addField}
            disabled={label.trim().length < 2 || fields.length >= 8}
          >
            <Plus className="h-3.5 w-3.5" /> Add field
          </Button>
        </div>
      </div>

      {state?.ok && state.message ? (
        <Alert tone="success">{state.message}</Alert>
      ) : (
        <FormError message={state?.error} />
      )}

      <SubmitButton className="w-full sm:w-auto" pendingLabel="Saving requirements…">
        <Save className="h-4 w-4" /> Save registration requirements
      </SubmitButton>
    </form>
  );
}
