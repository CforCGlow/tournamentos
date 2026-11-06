"use client";

import { Pencil, Plus } from "lucide-react";
import { addPlayerAction, updatePlayerAction } from "@/app/actions/players";
import { FileUpload } from "@/components/forms/file-upload";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlayerRow } from "@/lib/database.types";

export function PlayerDialog({
  teamId,
  tenantId,
  player,
  disabled = false,
  suggestNumber,
  requirePhoto = false,
  requireId = false,
  label,
}: {
  teamId: string;
  tenantId: string;
  player?: PlayerRow;
  disabled?: boolean;
  suggestNumber?: number;
  requirePhoto?: boolean;
  requireId?: boolean;
  label?: string;
}) {
  const editing = Boolean(player);

  return (
    <Dialog>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="icon-sm" title="Edit player" disabled={disabled}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" disabled={disabled}>
            <Plus className="h-4 w-4" /> {label ?? "Add player"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${player?.full_name}` : "Add a player"}</DialogTitle>
          <DialogDescription>
            Name, jersey number and position are required. Jersey numbers must be unique inside
            the squad. The captain&apos;s armband moves automatically when you assign it to
            someone new.
          </DialogDescription>
        </DialogHeader>

        <form action={editing ? updatePlayerAction : addPlayerAction} className="space-y-4">
          <input type="hidden" name="team_id" value={teamId} />
          {player ? <input type="hidden" name="player_id" value={player.id} /> : null}

          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">
            All three fields marked with an asterisk are required before the player can join the
            squad.
          </p>

          <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
            <div className="space-y-1.5">
              <Label htmlFor={`player-name-${player?.id ?? "new"}`}>
                Full name <span className="text-rose-600">*</span>
              </Label>
              <Input
                id={`player-name-${player?.id ?? "new"}`}
                name="full_name"
                defaultValue={player?.full_name}
                placeholder="Hamza Chowdhury"
                minLength={2}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`player-number-${player?.id ?? "new"}`}>
                Number <span className="text-rose-600">*</span>
              </Label>
              <Input
                id={`player-number-${player?.id ?? "new"}`}
                name="jersey_number"
                type="number"
                min={1}
                max={99}
                defaultValue={player?.jersey_number ?? suggestNumber ?? ""}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`player-position-${player?.id ?? "new"}`}>
                Position <span className="text-rose-600">*</span>
              </Label>
              <Select
                id={`player-position-${player?.id ?? "new"}`}
                name="position"
                defaultValue={player?.position ?? "MID"}
                required
              >
                <option value="GK">Goalkeeper</option>
                <option value="DEF">Defender</option>
                <option value="MID">Midfielder</option>
                <option value="FWD">Forward</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`player-dob-${player?.id ?? "new"}`}>Date of birth</Label>
              <Input
                id={`player-dob-${player?.id ?? "new"}`}
                name="date_of_birth"
                type="date"
                defaultValue={player?.date_of_birth ?? ""}
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 rounded-md border bg-surface/60 px-3 py-2 text-sm">
            <input
              type="checkbox"
              name="is_captain"
              defaultChecked={player?.is_captain ?? false}
              className="h-4 w-4 rounded border-input accent-emerald-600"
            />
            Team captain
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FileUpload
                bucket="player-photos"
                tenantId={tenantId}
                name="photo_url"
                label={requirePhoto ? "Player photo *" : "Player photo (optional)"}
                defaultValue={player?.photo_url ?? null}
                required={requirePhoto}
                hint={
                  requirePhoto
                    ? "Required by this tournament — square headshot."
                    : "Square headshot, optional."
                }
              />
            </div>
            <div className="space-y-1.5">
              <FileUpload
                bucket="id-documents"
                tenantId={tenantId}
                name="id_document_url"
                label={requireId ? "ID document *" : "ID document (optional)"}
                accept="image/*,application/pdf"
                defaultValue={player?.id_document_url ?? null}
                publicBucket={false}
                preview={false}
                required={requireId}
                hint={
                  requireId
                    ? "Required by this tournament — private, organisers verify it."
                    : "Private — organisers verify eligibility."
                }
              />
            </div>
          </div>

          <SubmitButton className="w-full" pendingLabel="Saving…">
            {editing ? "Save player" : "Add to squad"}
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
