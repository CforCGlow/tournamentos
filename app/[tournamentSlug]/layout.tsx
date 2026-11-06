import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, CalendarClock, Radio, Trophy } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { PublicNav } from "@/components/public/public-nav";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TOURNAMENT_FORMATS } from "@/lib/constants";
import { formatDate, initials } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function loadTournament(slug: string) {
  const supabase = await createClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!tournament) return null;

  const { data: publicTenant } = await supabase
    .from("public_tenants")
    .select("id, name, slug, logo_url, primary_color")
    .eq("id", tournament.tenant_id)
    .maybeSingle();

  // Members of a suspended workspace can still preview their microsite, but the
  // public view filters suspended workspaces out. Fall back to the tenant row,
  // which member RLS allows.
  const { data: memberTenant } = publicTenant
    ? { data: null }
    : await supabase
        .from("tenants")
        .select("id, name, slug, logo_url, primary_color")
        .eq("id", tournament.tenant_id)
        .maybeSingle();

  const tenant = publicTenant ?? memberTenant;

  return { tournament, tenant };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tournamentSlug: string }>;
}): Promise<Metadata> {
  const { tournamentSlug } = await params;
  const data = await loadTournament(tournamentSlug);

  if (!data) return { title: "Tournament not found" };

  const { tournament, tenant } = data;
  const description = `${TOURNAMENT_FORMATS[tournament.format]} · ${formatDate(
    tournament.start_date,
  )} — ${formatDate(tournament.end_date)} · Live scores, tables and brackets${
    tenant ? ` · ${tenant.name}` : ""
  }.`;

  return {
    title: tournament.name,
    description,
    openGraph: {
      title: tournament.name,
      description,
      type: "website",
      images: tournament.banner_url ? [{ url: tournament.banner_url }] : undefined,
    },
  };
}

export default async function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tournamentSlug: string }>;
}) {
  const { tournamentSlug } = await params;
  const data = await loadTournament(tournamentSlug);

  if (!data) notFound();
  const { tournament, tenant } = data;

  const base = `/${tournament.slug}`;
  const registrationOpen = tournament.status === "REGISTRATION_OPEN";
  const accent = tenant?.primary_color ?? "#10B981";

  return (
    <div className="flex min-h-dvh flex-col bg-surface/40">
      <div className="h-1 w-full" style={{ backgroundColor: accent }} aria-hidden />

      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="container grid h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
          <Link href={base} className="flex min-w-0 items-center gap-3">
            {tenant?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logo_url}
                alt={tenant.name}
                className="h-9 w-9 shrink-0 rounded-lg border bg-white object-contain p-0.5"
              />
            ) : (
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display text-xs font-bold text-white"
                style={{ backgroundColor: accent }}
              >
                {initials(tournament.name)}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate font-display text-sm font-semibold leading-tight">
                {tournament.name}
              </span>
              <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {tenant?.name ?? "Tournament"}
              </span>
            </span>
          </Link>

          <PublicNav base={base} />

          <div className="flex items-center justify-end gap-2">
            <ThemeToggle className="text-muted-foreground" />
            {registrationOpen ? (
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href={`${base}/register`}>
                  <Trophy className="h-4 w-4" /> Register team
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex">
                <Link href={`${base}/matches`}>
                  <Radio className="h-4 w-4" /> Matches
                </Link>
              </Button>
            )}
            <Button asChild size="sm" variant="ghost" className="hidden md:inline-flex">
              <Link href="/">LigaPro</Link>
            </Button>
          </div>
        </div>

        <div className="lg:hidden">
          <PublicNav base={base} variant="mobile" />
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t bg-background">
        <div className="container grid gap-8 py-10 md:grid-cols-[1.5fr_1fr_1fr]">
          <div className="space-y-3">
            <p className="font-display text-base font-semibold">{tournament.name}</p>
            <p className="text-sm text-muted-foreground">
              {TOURNAMENT_FORMATS[tournament.format]} organised by {tenant?.name ?? "LigaPro"}.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="neutral">
                <CalendarClock className="h-3 w-3" />
                {formatDate(tournament.start_date)} — {formatDate(tournament.end_date)}
              </Badge>
              {tournament.status !== "DRAFT" ? (
                <Badge variant="info" className="whitespace-nowrap uppercase tracking-wide">{tournament.status.replace(/_/g, " ")}</Badge>
              ) : null}
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <p className="font-semibold">Competition</p>
            <ul className="space-y-1.5 text-muted-foreground">
              <li>
                <Link className="hover:text-foreground" href={`${base}/matches`}>
                  Fixtures &amp; results
                </Link>
              </li>
              <li>
                <Link className="hover:text-foreground" href={`${base}/table`}>
                  Standings
                </Link>
              </li>
              <li>
                <Link className="hover:text-foreground" href={`${base}/bracket`}>
                  Knockout bracket
                </Link>
              </li>
              <li>
                <Link className="hover:text-foreground" href={`${base}/stats`}>
                  Player stats
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-2 text-sm">
            <p className="font-semibold">Take part</p>
            <ul className="space-y-1.5 text-muted-foreground">
              {registrationOpen ? (
                <li>
                  <Link className="hover:text-foreground" href={`${base}/register`}>
                    Register your team
                  </Link>
                </li>
              ) : null}
              <li>
                <Link className="hover:text-foreground" href={`${base}/teams`}>
                  Team profiles
                </Link>
              </li>
              <li>
                <Link className="hover:text-foreground" href="/login">
                  Manager sign in
                </Link>
              </li>
              <li>
                <Link className="hover:text-foreground" href="/">
                  LigaPro platform
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t">
          <div className="container flex flex-col items-center justify-between gap-2 py-4 text-[11px] text-muted-foreground sm:flex-row">
            <p>
              © {new Date().getFullYear()} {tenant?.name ?? "LigaPro"}. Results are official once
              the referee signs off.
            </p>
            <Link href="/" className="inline-flex items-center gap-1 hover:text-foreground">
              Powered by LigaPro <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
