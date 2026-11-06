import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  ClipboardList,
  Info,
  Lock,
  LogIn,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { getSession } from "@/lib/auth";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { RegistrationForm } from "@/components/public/registration-form";
import { BackLink } from "@/components/layout/back-link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/ui/stat-card";
import { TOURNAMENT_FORMATS } from "@/lib/constants";
import { formatDate, formatMoney, pluralize } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    icon: <ClipboardList className="h-4 w-4" />,
    title: "Submit the entry",
    body: "Team name, short code, kit colours and your transfer reference. Takes about two minutes.",
  },
  {
    icon: <Wallet className="h-4 w-4" />,
    title: "Upload the payment proof",
    body: "From your manager portal, attach the bank or mobile-money receipt so the organiser can verify.",
  },
  {
    icon: <Users className="h-4 w-4" />,
    title: "Build the squad",
    body: "Add players with jersey numbers and the documents this tournament requires, then submit the team for review. Rosters freeze when the first match kicks off.",
  },
  {
    icon: <BadgeCheck className="h-4 w-4" />,
    title: "Get approved & play",
    body: "Once the organiser approves the submitted team, your squad appears in the draw and the public site.",
  },
];

export default async function PublicRegisterPage({
  params,
}: {
  params: Promise<{ tournamentSlug: string }>;
}) {
  const { tournamentSlug } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("slug", tournamentSlug)
    .maybeSingle();

  if (!tournament) notFound();

  const base = `/${tournament.slug}`;
  const [{ count: approvedCount }, { count: pendingCount }, { data: tenant }, session] =
    await Promise.all([
      supabase
        .from("teams")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournament.id)
        .eq("registration_status", "APPROVED"),
      supabase
        .from("teams")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournament.id)
        .eq("registration_status", "PENDING"),
      supabase
        .from("public_tenants")
        .select("id, name, primary_color")
        .eq("id", tournament.tenant_id)
        .maybeSingle(),
      getSession(),
    ]);

  const approved = approvedCount ?? 0;
  const pending = pendingCount ?? 0;
  const slotsLeft = Math.max(0, tournament.max_teams - approved);
  const open = tournament.status === "REGISTRATION_OPEN" && slotsLeft > 0;
  const nextPath = `${base}/register`;
  const signedIn = Boolean(session.user && session.profile);
  const fill = Math.round((approved / Math.max(1, tournament.max_teams)) * 100);
  const settings = await getTournamentSettings(tournament.id);

  return (
    <div className="container py-8">
      <BackLink href={base} label="Back to tournament" />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <Badge variant={open ? "success" : "neutral"} className="whitespace-nowrap uppercase tracking-wide">
            {open ? (
              <>
                <ShieldCheck className="h-3 w-3" /> Entry open
              </>
            ) : (
              <>
                <Lock className="h-3 w-3" /> Entry closed
              </>
            )}
          </Badge>

          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Register your team
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            {tournament.name} · {TOURNAMENT_FORMATS[tournament.format]} ·{" "}
            {formatDate(tournament.start_date)} — {formatDate(tournament.end_date)}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Entry fee"
              value={formatMoney(tournament.registration_fee)}
              hint="Per team, one-off"
              icon={<Wallet className="h-5 w-5" />}
            />
            <StatCard
              label="Places left"
              value={`${slotsLeft} / ${tournament.max_teams}`}
              hint={`${approved} approved · ${pending} pending`}
              icon={<Trophy className="h-5 w-5" />}
              tone={slotsLeft <= 3 ? "rose" : "secondary"}
            />
            <StatCard
              label="Squad size"
              value={`${tournament.min_squad_size}–${tournament.max_squad_size}`}
              hint="Players per roster"
              icon={<Users className="h-5 w-5" />}
              tone="amber"
            />
          </div>

          <Card className="mt-6">
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Entry form</CardTitle>
              <Badge variant="outline">{pluralize(pending, "entry", "entries")} awaiting review</Badge>
            </CardHeader>
            <CardContent>
              {!open ? (
                <Alert tone="warning" title="Registration is closed">
                  {slotsLeft === 0
                    ? "Every place in this competition has been taken. Follow the matches page for the draw and live scores."
                    : "The organiser is not accepting new entries right now. Follow the tournament for fixtures and results."}
                </Alert>
              ) : signedIn ? (
                <RegistrationForm
                  tournamentId={tournament.id}
                  tenantId={tournament.tenant_id}
                  entryFee={tournament.registration_fee}
                  fields={settings.fields}
                  requireId={settings.requireIdDocument}
                  requirePhoto={settings.requirePlayerPhoto}
                />
              ) : (
                <div className="space-y-4 py-2">
                  <div className="flex items-start gap-3 rounded-lg border bg-surface/60 p-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-emerald-700">
                      <LogIn className="h-4 w-4" />
                    </span>
                    <div className="text-sm">
                      <p className="font-semibold">Sign in to enter a team</p>
                      <p className="mt-0.5 text-muted-foreground">
                        Entries are tied to your account so you can manage the squad, upload the
                        payment proof and set lineups.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="lg">
                      <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>
                        <LogIn className="h-4 w-4" /> Sign in
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline">
                      <Link href={`/register?next=${encodeURIComponent(nextPath)}`}>
                        Create an account <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    You can create an account with an email address and a password, then come
                    straight back here to submit the entry.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">How entry works</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {STEPS.map((step, index) => (
                <div key={step.title} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-semibold">
                      {step.icon} {step.title}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {step.body}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Competition snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Places filled</span>
                  <span className="tabular-nums">
                    {approved} of {tournament.max_teams}
                  </span>
                </div>
                <Progress value={fill} tone={slotsLeft === 0 ? "danger" : "primary"} />
              </div>

              {[
                { label: "Organiser", value: tenant?.name ?? "LigaPro" },
                { label: "Format", value: TOURNAMENT_FORMATS[tournament.format] },
                {
                  label: "Matchdays",
                  value: `${formatDate(tournament.start_date)} → ${formatDate(tournament.end_date)}`,
                },
                { label: "Squad size", value: `${tournament.min_squad_size}–${tournament.max_squad_size} players` },
                {
                  label: "Rosters",
                  value: tournament.roster_locked ? "Locked" : "Editable until kickoff",
                },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="max-w-[58%] text-right font-medium">{row.value}</span>
                </div>
              ))}

              <div className="flex flex-wrap gap-1.5 border-t pt-3">
                <Badge variant="info" className="whitespace-nowrap uppercase tracking-wide">
                  <CalendarClock className="h-3 w-3" />
                  {tournament.status === "REGISTRATION_OPEN" ? "Accepting entries" : "Entries closed"}
                </Badge>
                {tournament.roster_locked ? (
                  <Badge variant="warning" className="whitespace-nowrap uppercase tracking-wide">
                    <Lock className="h-3 w-3" /> Rosters locked
                  </Badge>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Before you start</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[12px] leading-relaxed text-muted-foreground">
              <p className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Have your payment reference ready — the organiser matches it against the transfer.
              </p>
              <p className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Jersey numbers must be unique. Two players cannot share a shirt in the same squad.
              </p>
              <p className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Each player needs an ID document before the organiser can verify eligibility.
              </p>
              <p className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Suspended players are blocked automatically from any lineup.
              </p>
            </CardContent>
          </Card>

          <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-[11px] text-sky-900">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Need to change an entry? The manager portal lets you edit the team name, colours and
              crest until the organiser approves it.
            </p>
          </div>

          <Button asChild variant="outline" className="w-full">
            <Link href={`${base}/matches`}>
              Browse the fixtures <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
