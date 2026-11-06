"use client";

import { useActionState } from "react";
import { updateTenantAction } from "@/app/actions/tenants";
import { ColorField } from "@/components/forms/color-field";
import { FileUpload } from "@/components/forms/file-upload";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TenantRow } from "@/lib/database.types";

export function TenantSettingsForm({ tenant }: { tenant: TenantRow }) {
  const [state, action] = useActionState(updateTenantAction, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenant.id} />
      <input type="hidden" name="slug" value={tenant.slug} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="settings-name">Client name</Label>
          <Input id="settings-name" name="name" defaultValue={tenant.name} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="settings-slug">Workspace slug</Label>
          <Input id="settings-slug" value={`/dashboard/${tenant.slug}`} disabled />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="settings-colour">Brand colour</Label>
          <ColorField
            id="settings-colour"
            name="primary_color"
            defaultValue={tenant.primary_color}
            hint="Pick a swatch or type a 6-digit hex code."
          />
        </div>
        <p className="flex items-end text-[11px] text-muted-foreground">
          Workspaces are free and unlimited. Use Suspend on the overview to take one
          offline.
        </p>
      </div>

      <FileUpload
        bucket="logos"
        tenantId={tenant.id}
        name="logo_url"
        label="Client logo"
        defaultValue={tenant.logo_url}
        publicBucket
        hint="PNG/JPG/SVG up to 2MB. Shown on the public microsite."
      />

      <FormError message={state?.error} />
      {state?.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
    </form>
  );
}
