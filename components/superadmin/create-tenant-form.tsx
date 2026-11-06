"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CheckCircle2, Copy, KeyRound } from "lucide-react";
import { createTenantAction } from "@/app/actions/tenants";
import { ColorField } from "@/components/forms/color-field";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/utils";

export function CreateTenantForm() {
  const [state, action] = useActionState(createTenantAction, null);
  const [slug, setSlug] = useState("");
  const [autoSlug, setAutoSlug] = useState(true);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>New client</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Provision a client</DialogTitle>
          <DialogDescription>
            Create the workspace and optionally issue the organiser&apos;s first admin
            account. Workspaces are free and unlimited.
          </DialogDescription>
        </DialogHeader>

        {state?.ok ? (
          <div className="space-y-4">
            <Alert tone="success" title="Client provisioned">
              {state.message}
            </Alert>

            {state.data?.email && state.data?.password ? (
              <div className="space-y-2 rounded-lg border bg-surface p-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" /> One-time credentials
                </p>
                <div className="grid gap-2 text-sm">
                  <p className="flex items-center justify-between gap-2 rounded border bg-card px-3 py-2">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-mono text-xs">{state.data.email}</span>
                  </p>
                  <p className="flex items-center justify-between gap-2 rounded border bg-card px-3 py-2">
                    <span className="text-muted-foreground">Password</span>
                    <span className="font-mono text-xs">{state.data.password}</span>
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  This password is shown once. Share it over a secure channel.
                </p>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              {state.data?.tenantId ? (
                <Button asChild>
                  <Link href={`/superadmin/tenants/${state.data.tenantId}`}>
                    Open workspace <CheckCircle2 className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Client name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Dhaka City League"
                  required
                  onChange={(event) => {
                    if (autoSlug) setSlug(slugify(event.target.value));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slug">Workspace slug</Label>
                <Input
                  id="slug"
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
                  /dashboard/{slug || "your-slug"}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="primary_color">Brand colour</Label>
                <ColorField
                  id="primary_color"
                  name="primary_color"
                  defaultValue="#10B981"
                  hint="Pick a swatch or type a 6-digit hex code."
                />
              </div>
              <p className="flex items-end text-[11px] text-muted-foreground">
                Every workspace runs the full platform for free — unlimited tournaments,
                teams and referees.
              </p>
            </div>

            <div className="rounded-lg border bg-surface p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                First organiser admin (optional)
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="admin_name">Contact name</Label>
                  <Input id="admin_name" name="admin_name" placeholder="Organiser name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin_email">Login email</Label>
                  <Input
                    id="admin_email"
                    name="admin_email"
                    type="email"
                    placeholder="admin@client.com"
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                If the email is new, an account is created with a one-time password.
              </p>
            </div>

            <FormError message={state?.error} />

            <div className="flex justify-end">
              <SubmitButton pendingLabel="Provisioning…">Create client</SubmitButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
