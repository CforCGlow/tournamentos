"use client";

import { useActionState, useState } from "react";
import { createWorkspaceAction } from "@/app/actions/tenants";
import { ColorField } from "@/components/forms/color-field";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/utils";

export function CreateWorkspaceForm() {
  const [state, action] = useActionState(createWorkspaceAction, null);
  const [slug, setSlug] = useState("");
  const [autoSlug, setAutoSlug] = useState(true);

  return (
    <form action={action} className="space-y-4 text-left">
      <div className="space-y-1.5">
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input
          id="workspace-name"
          name="name"
          placeholder="Dhaka City League"
          required
          onChange={(event) => {
            if (autoSlug) setSlug(slugify(event.target.value));
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="workspace-slug">Public address</Label>
        <Input
          id="workspace-slug"
          name="slug"
          value={slug}
          placeholder="dhaka-city-league"
          required
          onChange={(event) => {
            setAutoSlug(false);
            setSlug(slugify(event.target.value));
          }}
        />
        <p className="text-[11px] text-muted-foreground">
          Your console lives at /dashboard/{slug || "your-slug"}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="workspace-colour">Brand colour</Label>
        <ColorField
          id="workspace-colour"
          name="primary_color"
          defaultValue="#10B981"
          hint="Pick a swatch or type a 6-digit hex code."
        />
      </div>

      <FormError message={state?.error} />

      <SubmitButton pendingLabel="Creating workspace…" className="w-full">
        Create workspace
      </SubmitButton>
    </form>
  );
}
