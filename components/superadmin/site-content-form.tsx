"use client";

import { useActionState } from "react";
import { Save, RotateCcw } from "lucide-react";
import { saveSiteContentAction } from "@/app/actions/site-content";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/actions";
import type { SiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";

function Field({
  name,
  label,
  value,
  hint,
  rows,
  maxLength,
  className,
}: {
  name: string;
  label: string;
  value: string;
  hint?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
}) {
  const id = `content-${name.replace(/[^a-z0-9]+/gi, "-")}`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-semibold">
        {label}
      </Label>
      {rows ? (
        <Textarea
          id={id}
          name={name}
          defaultValue={value}
          rows={rows}
          maxLength={maxLength}
          className="text-[13px] leading-relaxed"
        />
      ) : (
        <Input id={id} name={name} defaultValue={value} maxLength={maxLength} />
      )}
      {hint ? <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function SiteContentForm({ content }: { content: SiteContent }) {
  const [state, action] = useActionState<ActionState, FormData>(saveSiteContentAction, null);

  return (
    <form action={action} className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Publish the wording visitors see</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Numbers, tournaments and tables stay live — only the copy below is edited.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SubmitButton name="intent" value="reset" variant="outline" pendingLabel="Resetting…">
            <RotateCcw className="h-4 w-4" /> Reset to defaults
          </SubmitButton>
          <SubmitButton name="intent" value="save" pendingLabel="Publishing…">
            <Save className="h-4 w-4" /> Publish changes
          </SubmitButton>
        </div>
      </div>

      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}
      <FormError message={state?.ok ? null : state?.error} />

      <Section
        title="Logo"
        description="The wordmark in the header, footer and every console. The second word keeps the green highlight."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            name="brand.name"
            label="Wordmark"
            value={content.brand.name}
            maxLength={40}
            hint="Shown in dark text."
          />
          <Field
            name="brand.accent"
            label="Highlighted part"
            value={content.brand.accent}
            maxLength={40}
            hint="Shown in the brand colour."
          />
          <Field
            name="brand.tagline"
            label="Tagline"
            value={content.brand.tagline}
            maxLength={72}
            hint="The small uppercase line underneath."
          />
        </div>
      </Section>

      <Section
        title="Hero"
        description="The first screen on the home page: badge, headline, description, buttons and the two counters."
      >
        <Field name="hero.badge" label="Small badge" value={content.hero.badge} maxLength={140} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="hero.title" label="Headline" value={content.hero.title} maxLength={140} />
          <Field
            name="hero.titleAccent"
            label="Headline highlight"
            value={content.hero.titleAccent}
            maxLength={140}
            hint="Shown on the second line in green."
          />
        </div>
        <Field
          name="hero.description"
          label="Description"
          value={content.hero.description}
          rows={3}
          maxLength={420}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="hero.primaryCta"
            label="Primary button"
            value={content.hero.primaryCta}
            maxLength={72}
            hint="Used for visitors who are not signed in."
          />
          <Field
            name="hero.secondaryCta"
            label="Secondary button"
            value={content.hero.secondaryCta}
            maxLength={72}
          />
          <Field
            name="hero.clientsLabel"
            label="First counter label"
            value={content.hero.clientsLabel}
            maxLength={72}
          />
          <Field
            name="hero.tournamentsLabel"
            label="Second counter label"
            value={content.hero.tournamentsLabel}
            maxLength={72}
          />
        </div>
      </Section>

      <Section
        title="Tournament flow card"
        description="The animated card beside the hero. The four stages move in order, so keep each label short."
      >
        <Field name="loop.title" label="Card title" value={content.loop.title} maxLength={140} />
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["entries", "Stage 1"],
              ["fixtures", "Stage 2"],
              ["scores", "Stage 3"],
              ["table", "Stage 4"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-3 rounded-lg border bg-surface/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {label}
              </p>
              <Field
                name={`loop.${key}.label`}
                label="Label"
                value={content.loop[key].label}
                maxLength={72}
              />
              <Field
                name={`loop.${key}.hint`}
                label="Caption"
                value={content.loop[key].hint}
                rows={2}
                maxLength={140}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Public tournaments"
        description="The section that lists competitions anyone can open."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="tournaments.eyebrow"
            label="Eyebrow"
            value={content.tournaments.eyebrow}
            maxLength={72}
          />
          <Field
            name="tournaments.cta"
            label="Section button"
            value={content.tournaments.cta}
            maxLength={72}
          />
        </div>
        <Field
          name="tournaments.title"
          label="Heading"
          value={content.tournaments.title}
          maxLength={140}
        />
        <Field
          name="tournaments.description"
          label="Description"
          value={content.tournaments.description}
          rows={3}
          maxLength={420}
        />
        <Field
          name="tournaments.cardCta"
          label="Card link text"
          value={content.tournaments.cardCta}
          maxLength={72}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="tournaments.emptyTitle"
            label="Empty state heading"
            value={content.tournaments.emptyTitle}
            maxLength={140}
          />
          <Field
            name="tournaments.emptyDescription"
            label="Empty state description"
            value={content.tournaments.emptyDescription}
            rows={2}
            maxLength={420}
          />
        </div>
      </Section>

      <Section
        title="Closing call to action"
        description="The dark panel that sits last on the page, directly above the footer."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="cta.badge" label="Badge" value={content.cta.badge} maxLength={140} />
          <Field name="cta.button" label="Button" value={content.cta.button} maxLength={72} />
        </div>
        <Field name="cta.title" label="Heading" value={content.cta.title} maxLength={140} />
        <Field
          name="cta.description"
          label="Description"
          value={content.cta.description}
          rows={3}
          maxLength={420}
        />
      </Section>

      <Section
        title="Features"
        description="The final section before the closing panel. Six cards, each with a title and a short description."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="features.eyebrow"
            label="Eyebrow"
            value={content.features.eyebrow}
            maxLength={72}
          />
          <Field
            name="features.title"
            label="Heading"
            value={content.features.title}
            maxLength={140}
          />
        </div>
        <Field
          name="features.description"
          label="Description"
          value={content.features.description}
          rows={2}
          maxLength={420}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {content.features.items.map((item, index) => (
            <div key={index} className="space-y-3 rounded-lg border bg-surface/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Card {index + 1}
              </p>
              <Field
                name={`features.${index}.title`}
                label="Title"
                value={item.title}
                maxLength={72}
              />
              <Field
                name={`features.${index}.body`}
                label="Description"
                value={item.body}
                rows={2}
                maxLength={220}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Footer"
        description="The short description under the LigaPro mark at the bottom of the home page."
      >
        <Field
          name="footer.tagline"
          label="Footer description"
          value={content.footer.tagline}
          rows={3}
          maxLength={420}
        />
      </Section>

      <div className="flex flex-col gap-2 border-t pt-5 sm:flex-row sm:justify-end">
        <SubmitButton name="intent" value="reset" variant="outline" pendingLabel="Resetting…">
          <RotateCcw className="h-4 w-4" /> Reset to defaults
        </SubmitButton>
        <SubmitButton name="intent" value="save" pendingLabel="Publishing…">
          <Save className="h-4 w-4" /> Publish changes
        </SubmitButton>
      </div>
    </form>
  );
}
