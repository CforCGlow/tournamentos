"use client";

import { Plus } from "lucide-react";
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

export function CreateTournamentDialog({
  tenantSlug,
  tenantId,
}: {
  tenantSlug: string;
  tenantId: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New tournament
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a tournament</DialogTitle>
          <DialogDescription>
            Set the format, rules and squad limits. Everything can be edited later until
            fixtures are generated.
          </DialogDescription>
        </DialogHeader>
        <TournamentForm mode="create" tenantSlug={tenantSlug} tenantId={tenantId} />
      </DialogContent>
    </Dialog>
  );
}
