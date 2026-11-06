import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  GitBranch,
  Globe2,
  Radio,
  Sparkles,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { getSession } from "@/lib/auth";
import { getSiteContent } from "@/lib/site-content";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { TournamentLoop } from "@/components/public/tournament-loop";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TournamentStatusBadge } from "@/components/ui/status-badge";
import { TOURNAMENT_FORMATS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FEATURE_ICONS: LucideIcon[] = [
  ClipboardCheck,
  Wallet,
  CalendarClock,
  Radio,
  GitBranch,
  Globe2,
];

export default async function LandingPage() {
  const supabase = await createClient();
  const [{ profile }, content] = await Promise.all([getSession(), getSiteContent()]);

  // Signed-in operators should never be pushed back through sign-up: the CTA
  // follows their role instead of always pointing at /register.
  const isSuperAdmin = profile?.global_role === "SUPER_ADMIN";
  const ctaHref = isSuperAdmin ? "/superadmin/tenants" : profile ? "/portal" : "/register";
  const ctaLabel = isSuperAdmin
    ? "Create a workspace"
    : profile
      ? "Open your workspace"
      : content.hero.primaryCta;
  const organiserLabel = isSuperAdmin
    ? "Create a workspace"
    : profile
      ? "Manage competitions"
      : content.tournaments.cta;

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*")
    .neq("status", "DRAFT")
    .order("start_date", { ascending: true })
    .limit(6);

  const list = tournaments ?? [];
  const tournamentIds = list.map((tournament) => tournament.id);
  const tenantIds = Array.from(new Set(list.map((tournament) => tournament.tenant_id)));

  const [
    { data: tenants },
    { data: teams },
    { count: workspaceCount },
    { count: tournamentCount },
  ] = await Promise.all([
    tenantIds.length
      ? supabase
          .from("public_tenants")
          .select("id, name, logo_url, primary_color")
          .in("id", tenantIds)
      : Promise.resolve({ data: [] as const }),
    tournamentIds.length
      ? supabase
          .from("teams")
          .select("id, tournament_id, short_name, registration_status")
          .in("tournament_id", tournamentIds)
      : Promise.resolve({ data: [] as const }),
    supabase.from("public_tenants").select("id", { count: "exact", head: true }),
    supabase.from("tournaments").select("id", { count: "exact", head: true }).neq("status", "DRAFT"),
  ]);

  const tenantById = new Map((tenants ?? []).map((tenant) => [tenant.id, tenant]));
  const teamCount = new Map<string, number>();
  for (const team of teams ?? []) {
    if (team.registration_status !== "APPROVED") continue;
    teamCount.set(team.tournament_id, (teamCount.get(team.tournament_id) ?? 0) + 1);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="hero-mesh relative overflow-hidden text-white">
          <div className="absolute inset-0 pitch-grid opacity-[0.18]" aria-hidden />
          <div className="container relative py-12 sm:py-16 lg:py-24">
            <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center xl:gap-12">
              <div className="min-w-0 space-y-6 sm:space-y-7">
                <Badge
                  variant="live"
                  className="max-w-full gap-1.5 whitespace-normal bg-white/10 text-left text-emerald-200 ring-1 ring-emerald-400/30"
                >
                  <Sparkles className="h-3 w-3 shrink-0" />
                  <span className="min-w-0">{content.hero.badge}</span>
                </Badge>

                <h1 className="text-balance font-display text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl lg:text-5xl xl:text-6xl">
                  {content.hero.title}
                  <span className="mt-1 block text-emerald-300">{content.hero.titleAccent}</span>
                </h1>

                <p className="max-w-xl text-sm leading-relaxed text-white/75 sm:text-base lg:text-lg">
                  {content.hero.description}
                </p>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <Button
                    asChild
                    size="lg"
                    className="w-full bg-emerald-400 text-emerald-950 hover:bg-emerald-300 sm:w-auto"
                  >
                    <Link href={ctaHref}>
                      {ctaLabel}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="w-full border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:w-auto"
                  >
                    <Link href="#tournaments">
                      <Globe2 className="h-4 w-4" />
                      {content.hero.secondaryCta}
                    </Link>
                  </Button>
                </div>

                <dl className="grid max-w-sm grid-cols-2 gap-4 border-t border-white/10 pt-6">
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase leading-relaxed tracking-[0.18em] text-white/50">
                      {content.hero.clientsLabel}
                    </dt>
                    <dd className="font-display text-2xl font-semibold">{workspaceCount ?? 0}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase leading-relaxed tracking-[0.18em] text-white/50">
                      {content.hero.tournamentsLabel}
                    </dt>
                    <dd className="font-display text-2xl font-semibold">{tournamentCount ?? 0}</dd>
                  </div>
                </dl>
              </div>

              <TournamentLoop copy={content.loop} />
            </div>
          </div>
        </section>

        {/* Tournaments */}
        <section id="tournaments" className="container scroll-mt-20 py-14 sm:py-16">
          <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                {content.tournaments.eyebrow}
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                {content.tournaments.title}
              </h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                {content.tournaments.description}
              </p>
            </div>
            <Button asChild variant="outline" className="w-full shrink-0 sm:w-auto">
              <Link href={ctaHref}>
                {organiserLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          {list.length === 0 ? (
            <EmptyState
              icon={<Trophy className="h-5 w-5" />}
              title={content.tournaments.emptyTitle}
              description={content.tournaments.emptyDescription}
              action={
                <Button asChild size="sm">
                  <Link href={ctaHref}>
                    {isSuperAdmin
                      ? "Create the first workspace"
                      : profile
                        ? "Open your workspace"
                        : "Create the first one"}
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((tournament) => {
                const tenant = tenantById.get(tournament.tenant_id);
                return (
                  <Link key={tournament.id} href={`/${tournament.slug}`} className="group min-w-0">
                    <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
                      <div
                        className="h-1.5 w-full"
                        style={{ backgroundColor: tenant?.primary_color ?? "#10B981" }}
                      />
                      <CardContent className="space-y-4 p-4 sm:p-5">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {tenant?.name ?? "Organiser"}
                          </p>
                          <div className="mt-1 flex items-start justify-between gap-3">
                            <h3 className="min-w-0 font-display text-lg font-semibold leading-tight group-hover:text-primary">
                              {tournament.name}
                            </h3>
                            <TournamentStatusBadge status={tournament.status} />
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="neutral">
                            {TOURNAMENT_FORMATS[tournament.format]}
                          </Badge>
                          <Badge variant="info">
                            {teamCount.get(tournament.id) ?? 0}/{tournament.max_teams} teams
                          </Badge>
                        </div>

                        <div className="space-y-1.5 text-xs text-muted-foreground">
                          <p className="flex items-center gap-2">
                            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                            <span className="min-w-0">
                              {formatDate(tournament.start_date)} — {formatDate(tournament.end_date)}
                            </span>
                          </p>
                          <p className="flex items-center gap-2">
                            <Wallet className="h-3.5 w-3.5 shrink-0" />
                            Entry {formatMoney(tournament.registration_fee)}
                          </p>
                        </div>

                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                          {content.tournaments.cardCta}
                          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-t bg-surface/50 py-14 sm:py-16">
          <div className="container">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                {content.features.eyebrow}
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                {content.features.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {content.features.description}
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 lg:grid-cols-3">
              {content.features.items.map((item, index) => {
                const Icon = FEATURE_ICONS[index] ?? Trophy;
                return (
                  <div
                    key={`${index}-${item.title}`}
                    className="rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/30 sm:p-5"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-emerald-700">
                      <Icon className="h-5 w-5" />
                    </span>
                    <p className="mt-4 text-sm font-semibold">{item.title}</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {item.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="container py-14 sm:py-16">
          <div className="overflow-hidden rounded-2xl bg-slate-950 text-white">
            <div className="relative grid gap-6 p-6 sm:p-10 lg:grid-cols-[1.4fr_1fr] lg:items-center lg:gap-8 lg:p-12">
              <div className="absolute inset-0 pitch-stripes opacity-40" aria-hidden />
              <div className="relative min-w-0 space-y-3">
                <Badge
                  variant="dark"
                  className="max-w-full gap-1.5 whitespace-normal border-emerald-500/40 text-left text-emerald-300"
                >
                  <Sparkles className="h-3 w-3 shrink-0" /> <span>{content.cta.badge}</span>
                </Badge>
                <h2 className="text-balance font-display text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
                  {content.cta.title}
                </h2>
                <p className="max-w-xl text-sm leading-relaxed text-white/70">
                  {content.cta.description}
                </p>
              </div>
              <div className="relative flex flex-col gap-3 sm:flex-row lg:justify-end">
                <Button
                  asChild
                  size="lg"
                  className="w-full bg-emerald-400 text-emerald-950 hover:bg-emerald-300 sm:w-auto"
                >
                  <Link href={ctaHref}>
                    {profile ? "Open your workspace" : content.cta.button}
                  </Link>
                </Button>
                {profile ? null : (
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="w-full border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white sm:w-auto"
                  >
                    <Link href="/login">Sign in</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter
        tagline={content.footer.tagline}
        brandName={`${content.brand.name}${content.brand.accent}`}
      />
    </div>
  );
}
