"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createTournamentAction, updateTournamentAction } from "@/app/actions/tournaments";
import { FileUpload } from "@/components/forms/file-upload";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert } from "@/components/ui/alert";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TournamentRow } from "@/lib/database.types";
import type { ActionState } from "@/lib/actions";
import { slugify } from "@/lib/utils";

const TIEBREAKERS = [
  { value: "GD", label: "Goal difference" },
  { value: "GF", label: "Goals scored" },
  { value: "H2H", label: "Head to head" },
  { value: "WINS", label: "Most wins" },
];

export function TournamentForm({
  mode,
  tenantSlug,
  tenantId,
  tournament,
}: {
  mode: "create" | "edit";
  tenantSlug: string;
  tenantId: string;
  tournament?: TournamentRow;
}) {
  const [slug, setSlug] = useState(tournament?.slug ?? "");
  const [autoSlug, setAutoSlug] = useState(mode === "create");
  const [format, setFormat] = useState<TournamentRow["format"]>(
    tournament?.format ?? "LEAGUE",
  );
  const [state, action] = useActionState<ActionState, FormData>(
    mode === "create" ? createTournamentAction : updateTournamentAction,
    null,
  );
  const router = useRouter();

  useEffect(() => {
    if (state?.ok && state.data?.redirect) {
      router.push(state.data.redirect);
      router.refresh();
    }
  }, [router, state]);

  const existingTiebreakers = Array.isArray(tournament?.tiebreaker_order)
    ? (tournament?.tiebreaker_order as string[])
    : ["GD", "GF"];

  const today = new Date().toISOString().slice(0, 10);
  const inSixWeeks = new Date(Date.now() + 42 * 86_400_000).toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="tenant_slug" value={tenantSlug} />
      {tournament ? <input type="hidden" name="tournament_id" value={tournament.id} /> : null}

      {state?.error ? <FormError message={state.error} /> : null}
      {state?.ok && state.message && mode === "edit" ? (
        <Alert tone="success">{state.message}</Alert>
      ) : null}

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="t-name">Tournament name</Label>
            <Input
              id="t-name"
              name="name"
              defaultValue={tournament?.name}
              placeholder="SEU Inter-Department Cup"
              required
              onChange={(event) => {
                if (autoSlug) setSlug(slugify(event.target.value));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-slug">Public URL slug</Label>
            <Input
              id="t-slug"
              name="slug"
              value={slug}
              onChange={(event) => {
                setAutoSlug(false);
                setSlug(slugify(event.target.value));
              }}
              placeholder="seu-inter-department-cup"
              required
            />
            <p className="text-[11px] text-muted-foreground">/{slug || "your-tournament"}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="t-format">Format</Label>
            <Select
              id="t-format"
              name="format"
              value={format}
              onChange={(event) => setFormat(event.target.value as TournamentRow["format"])}
            >
              <option value="LEAGUE">League (single table)</option>
              <option value="KNOCKOUT">Knockout cup</option>
              <option value="GROUP_PLUS_KNOCKOUT">Groups + knockout</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-status">Status</Label>
            <Select id="t-status" name="status" defaultValue={tournament?.status ?? "DRAFT"}>
              <option value="DRAFT">Draft (hidden)</option>
              <option value="REGISTRATION_OPEN">Registration open</option>
              <option value="ONGOING">Ongoing</option>
              <option value="COMPLETED">Completed</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-fee">Entry fee (BDT)</Label>
            <Input
              id="t-fee"
              name="registration_fee"
              type="number"
              min={0}
              step="0.01"
              defaultValue={tournament?.registration_fee ?? 0}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="t-start">Start date</Label>
            <Input
              id="t-start"
              name="start_date"
              type="date"
              defaultValue={tournament?.start_date ?? today}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-end">End date</Label>
            <Input
              id="t-end"
              name="end_date"
              type="date"
              defaultValue={tournament?.end_date ?? inSixWeeks}
              required
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-surface/60 p-4">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Competition rules
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="t-maxteams">Max teams</Label>
            <Input
              id="t-maxteams"
              name="max_teams"
              type="number"
              min={2}
              max={128}
              defaultValue={tournament?.max_teams ?? 16}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-minsquad">Min squad</Label>
            <Input
              id="t-minsquad"
              name="min_squad_size"
              type="number"
              min={1}
              max={40}
              defaultValue={tournament?.min_squad_size ?? 11}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-maxsquad">Max squad</Label>
            <Input
              id="t-maxsquad"
              name="max_squad_size"
              type="number"
              min={1}
              max={40}
              defaultValue={tournament?.max_squad_size ?? 23}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-win">Points / win</Label>
            <Input
              id="t-win"
              name="points_per_win"
              type="number"
              min={0}
              max={10}
              defaultValue={tournament?.points_per_win ?? 3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-draw">Points / draw</Label>
            <Input
              id="t-draw"
              name="points_per_draw"
              type="number"
              min={0}
              max={10}
              defaultValue={tournament?.points_per_draw ?? 1}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-loss">Points / loss</Label>
            <Input
              id="t-loss"
              name="points_per_loss"
              type="number"
              min={0}
              max={10}
              defaultValue={tournament?.points_per_loss ?? 0}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-cards">Yellows → ban</Label>
            <Input
              id="t-cards"
              name="yellow_cards_for_suspension"
              type="number"
              min={1}
              max={10}
              defaultValue={tournament?.yellow_cards_for_suspension ?? 2}
            />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tiebreakers (in order)
          </p>
          <div className="flex flex-wrap gap-3">
            {TIEBREAKERS.map((item) => (
              <label key={item.value} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  name="tiebreakers"
                  value={item.value}
                  defaultChecked={existingTiebreakers.includes(item.value)}
                  className="h-4 w-4 rounded border-input accent-emerald-600"
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FileUpload
          bucket="logos"
          tenantId={tenantId}
          name="banner_url"
          label="Tournament banner"
          defaultValue={tournament?.banner_url}
          publicBucket
          hint="Wide image, 1600×500 recommended."
        />
        <div className="space-y-1.5">
          <Label htmlFor="t-rules">Rules (optional)</Label>
          <Textarea
            id="t-rules"
            name="rules_md"
            defaultValue={tournament?.rules_md ?? ""}
            placeholder={"Squad limits, eligibility, misconduct policy…\n\nWrite in plain language. Line breaks are kept exactly as you type them."}
            rows={7}
            className="min-h-[150px]"
          />
          <p className="text-[11px] text-muted-foreground">
            Plain text is fine — no formatting codes needed. These rules appear on the public
            tournament page.
          </p>
        </div>
      </div>

      <SubmitButton
        size="lg"
        className="w-full sm:w-auto"
        pendingLabel={mode === "create" ? "Creating…" : "Saving…"}
      >
        {mode === "create" ? "Create tournament" : "Save tournament"}
      </SubmitButton>
    </form>
  );
}
