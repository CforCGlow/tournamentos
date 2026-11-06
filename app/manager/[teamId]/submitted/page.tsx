import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  MailCheck,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { requireTeamContext } from "@/lib/auth";
import { BackLink } from "@/components/layout/back-link";
import { FlashMessage } from "@/components/layout/flash-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crest } from "@/components/ui/crest";
import { getTeamSubmission } from "@/lib/team-submission";
import { RegistrationBadge } from "@/components/ui/status-badge";
import { formatDate, pluralize } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TeamSubmittedPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ flash?: string; error?: string }>;
}) {
  const { teamId } = await params;
  const query = await searchParams;
  const ctx = await requireTeamContext(teamId);
  const { team } = ctx;

  const [{ data: tournament }, submission] = await Promise.all([
    ctx.supabase
      .from("tournaments")
      .select("id, name, slug, tenant_id")
      .eq("id", team.tournament_id)
      .maybeSingle(),
    getTeamSubmission(team.id),
  ]);

  const { count } = await ctx.supabase
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("team_id", team.id);

  const approved = team.registration_status === "APPROVED";
  const changesPending = Boolean(submission?.changesPending) && !approved;

  return (
    <div className="mx-auto max-w-3xl">
      <FlashMessage flash={query.flash} error={query.error} />
      <BackLink href={`/manager/${team.id}`} label="Back to my team" />

      <Card className="overflow-hidden">
        <div className="border-b bg-gradient-to-br from-emerald-50 via-surface to-sky-50 p-6 dark:from-emerald-950/40 dark:via-surface dark:to-sky-950/30">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
              <MailCheck className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
                Team submitted for review
              </p>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {approved ? "Your team is approved" : "The organiser has your entry"}
              </h1>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Crest
              name={team.name}
              logoUrl={team.logo_url}
              color={team.home_kit_color}
              size="md"
            />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {team.name}
                <Badge variant="outline">{team.short_name}</Badge>
                <RegistrationBadge status={team.registration_status} />
                {changesPending ? <Badge variant="warning" className="uppercase tracking-wide whitespace-nowrap">changes pending</Badge> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {tournament?.name ?? "Tournament"} ·{" "}
                {pluralize(count ?? submission?.squadSize ?? 0, "player")}
              </p>
            </div>
          </div>
        </div>

        <CardContent className="space-y-5 p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-surface/60 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" /> Submitted
              </p>
              <p className="mt-1 text-sm font-medium">
                {submission?.submittedAt
                  ? formatDate(submission.submittedAt, true)
                  : "Just now"}
              </p>
            </div>
            <div className="rounded-lg border bg-surface/60 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Squad
              </p>
              <p className="mt-1 text-sm font-medium">
                {pluralize(count ?? submission?.squadSize ?? 0, "player")} registered
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold">What happens next</p>
            <ol className="mt-2 space-y-2.5">
              {[
                {
                  title: "The organiser reviews your entry",
                  body: "Team details, squad, coach and payment proof are checked together.",
                },
                {
                  title: "You get an approval or a rejection",
                  body: "Rejections include a reason. You can fix the issue and resubmit from your team page.",
                },
                {
                  title: "Approved teams join the draw",
                  body: "Fixtures, lineups and the public team profile unlock once the organiser approves.",
                },
              ].map((step, index) => (
                <li key={step.title} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{step.title}</p>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {team.registration_status === "REJECTED" && team.rejection_reason ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">
              <strong>Rejected:</strong> {team.rejection_reason}. Update the team and resubmit when
              ready.
            </p>
          ) : null}

          {approved ? (
            <p className="flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
              Approved by the organiser. Nothing else is needed — check your fixtures for the first
              match.
            </p>
          ) : (
            <p className="flex items-start gap-2 rounded-md border bg-surface/60 px-3 py-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              {changesPending
                ? "You can keep editing. Every change is flagged for the organiser until they approve the team again."
                : "You can still edit your team while it waits. Edits are sent to the organiser for approval."}
            </p>
          )}

          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
            <Button asChild className="w-full sm:w-auto">
              <Link href={`/manager/${team.id}`}>
                Back to my team <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            {tournament ? (
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href={`/${tournament.slug}`}>
                  <Trophy className="h-4 w-4" /> View tournament
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="ghost" className="w-full sm:w-auto">
              <Link href="/portal">
                <CheckCircle2 className="h-4 w-4" /> All my teams
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
