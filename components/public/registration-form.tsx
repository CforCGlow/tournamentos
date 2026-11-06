"use client";

import { useActionState, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Palette, ShieldCheck, Wallet } from "lucide-react";
import { registerTeamAction } from "@/app/actions/teams";
import { ColorField } from "@/components/forms/color-field";
import { FileUpload } from "@/components/forms/file-upload";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/utils";
import type { ActionState } from "@/lib/actions";
import type { RegistrationField } from "@/lib/tournament-settings";

const HEX = /^#[0-9a-fA-F]{6}$/;

export function RegistrationForm({
  tournamentId,
  tenantId,
  entryFee,
  fields,
  requireId,
  requirePhoto,
}: {
  tournamentId: string;
  tenantId: string;
  entryFee: number;
  fields: RegistrationField[];
  requireId: boolean;
  requirePhoto: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(registerTeamAction, null);
  const [home, setHome] = useState("#10B981");
  const [away, setAway] = useState("#F8FAFC");
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [paymentRef, setPaymentRef] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const nameOk = name.trim().length >= 2;
  const shortOk = /^[A-Za-z0-9]{2,4}$/.test(shortName.trim());
  const colorsOk = HEX.test(home) && HEX.test(away);
  const missingFields = useMemo(
    () =>
      fields
        .filter((field) => field.required)
        .filter((field) => !(values[field.id] ?? "").trim()),
    [fields, values],
  );

  const detailsComplete = nameOk && shortOk && colorsOk && missingFields.length === 0;
  const paymentComplete = entryFee <= 0 || paymentRef.trim().length >= 3;
  const canSubmit = detailsComplete && paymentComplete;

  function explain(): string {
    if (!nameOk) return "Enter the team name (at least 2 characters).";
    if (!shortOk) return "The short code must be 2–4 letters or numbers (for example RIV).";
    if (!colorsOk) return "Choose valid home and away kit colours.";
    if (missingFields.length) {
      return `Add the required information: ${missingFields.map((field) => field.label).join(", ")}.`;
    }
    if (!paymentComplete) return "Add the payment transfer reference.";
    return "";
  }

  return (
    <form
      action={action}
      className="space-y-5"
      onSubmit={(event) => {
        if (!canSubmit) {
          event.preventDefault();
          setLocalError(explain());
          return;
        }
        setLocalError(null);
      }}
    >
      <input type="hidden" name="tournament_id" value={tournamentId} />

      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white">
          1
        </span>
        Team details
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <div className="space-y-1.5">
          <Label htmlFor="team-name">
            Team name <span className="text-rose-600">*</span>
          </Label>
          <Input
            id="team-name"
            name="name"
            placeholder="Riverside United"
            minLength={2}
            maxLength={70}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <p className="text-[11px] text-muted-foreground">
            The full name shown on fixtures, tables and the public site.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="team-short">
            Short code <span className="text-rose-600">*</span>
          </Label>
          <Input
            id="team-short"
            name="short_name"
            placeholder="RIV"
            minLength={2}
            maxLength={4}
            pattern="[A-Za-z0-9]{2,4}"
            className="uppercase"
            value={shortName}
            onChange={(event) => setShortName(event.target.value.toUpperCase())}
            required
          />
          <p className="text-[11px] text-muted-foreground">2–4 characters.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-surface/60 p-3">
          <ColorField
            id="home-kit"
            name="home_kit_color"
            label={
              <>
                <Palette className="h-3.5 w-3.5" /> Home kit <span className="text-rose-600">*</span>
              </>
            }
            value={home}
            onChange={setHome}
            swatches
          />
        </div>

        <div className="rounded-lg border bg-surface/60 p-3">
          <ColorField
            id="away-kit"
            name="away_kit_color"
            label={
              <>
                <Palette className="h-3.5 w-3.5" /> Away kit <span className="text-rose-600">*</span>
              </>
            }
            value={away}
            onChange={setAway}
            swatches
          />
        </div>
      </div>

      <FileUpload
        bucket="logos"
        tenantId={tenantId}
        name="logo_url"
        label="Team crest (optional)"
        hint="Square PNG or JPG, up to 2 MB. You can also add it later from the manager portal."
      />

      {fields.length > 0 ? (
        <div className="space-y-3 rounded-lg border bg-surface/40 p-3">
          <div>
            <p className="text-xs font-semibold">Extra information</p>
            <p className="text-[11px] text-muted-foreground">
              The organiser asks for these details from every entry.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.id} className="space-y-1.5">
                <Label htmlFor={`field-${field.id}`}>
                  {field.label}
                  {field.required ? <span className="text-rose-600"> *</span> : null}
                </Label>
                <Input
                  id={`field-${field.id}`}
                  name={`field_${field.id}`}
                  value={values[field.id] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.id]: event.target.value,
                    }))
                  }
                  maxLength={160}
                  required={field.required}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white">
            2
          </span>
          Payment
          {entryFee > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              {formatMoney(entryFee)}
            </span>
          ) : null}
        </div>

        {detailsComplete ? (
          <div className="space-y-1.5 rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="payment-ref" className="flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5" /> Payment reference
                {entryFee > 0 ? <span className="text-rose-600">*</span> : null}
              </Label>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <Input
              id="payment-ref"
              name="payment_transaction_id"
              placeholder="e.g. MTN-8842-XK"
              maxLength={80}
              value={paymentRef}
              onChange={(event) => setPaymentRef(event.target.value)}
              required={entryFee > 0}
            />
            <p className="text-[11px] text-muted-foreground">
              {entryFee > 0
                ? `Entry fee is ${formatMoney(entryFee)}. Enter the transfer reference now, then upload the proof from your manager portal.`
                : "This tournament has no entry fee, so no reference is needed."}
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-dashed bg-surface/60 px-3 py-3 text-[11px] text-muted-foreground">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Payment unlocks once every team detail above is filled in correctly. That keeps
              incomplete entries out of the organiser&apos;s queue.
            </p>
          </div>
        )}
      </div>

      {state?.error ? <FormError message={state.error} /> : null}
      <FormError message={localError} />

      <SubmitButton className="w-full" size="lg" pendingLabel="Submitting entry…">
        <ShieldCheck className="h-4 w-4" /> Submit registration
      </SubmitButton>

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        This creates your team workspace. Add your squad and coach, then submit the team for
        review from the manager portal.
        {requireId
          ? " ID documents are required for every player."
          : " ID documents are optional for this tournament."}
        {requirePhoto
          ? " Player photos are required."
          : " Player photos are optional."}
      </p>
    </form>
  );
}
