"use client";

import { Pencil } from "lucide-react";
import { TournamentForm } from "@/components/dashboard/tournament-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { TournamentRow } from "@/lib/database.types";

export function EditTournamentDialog({
  tenantSlug,
  tenantId,
  tournament,
}: {
  tenantSlug: string;
  tenantId: string;
  tournament: TournamentRow;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil className="h-4 w-4" /> Edit tournament
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tournament settings</DialogTitle>
          <DialogDescription>
            Changing the slug breaks existing public links. Squad limits apply to every
            team immediately.
          </DialogDescription>
        </DialogHeader>
        <TournamentForm
          mode="edit"
          tenantSlug={tenantSlug}
          tenantId={tenantId}
          tournament={tournament}
        />
      </DialogContent>
    </Dialog>
  );
}
