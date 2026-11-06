import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireTeamContext } from "@/lib/auth";
import { PortalShell } from "@/components/layout/portal-shell";

export const dynamic = "force-dynamic";

export default async function ManagerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const ctx = await requireTeamContext(teamId);

  const { data: tournament } = await ctx.supabase
    .from("tournaments")
    .select("id, name, slug")
    .eq("id", ctx.team.tournament_id)
    .maybeSingle();

  const { data: fixtures } = await ctx.supabase
    .from("matches")
    .select("id, kickoff_time, status, home_team_id, away_team_id")
    .eq("tournament_id", ctx.team.tournament_id)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order("kickoff_time");

  const teamFixtures = fixtures ?? [];
  const nextMatch =
    teamFixtures.find(
      (match) => match.status === "SCHEDULED" && new Date(match.kickoff_time) >= new Date(),
    ) ?? teamFixtures.find((match) => match.status === "SCHEDULED");

  const base = `/manager/${teamId}`;
  const nav = [
    { href: base, label: "Team & squad", icon: "users" as const, exact: true },
    ...(nextMatch
      ? [
          {
            href: `${base}/lineup/${nextMatch.id}`,
            label: "Next lineup",
            icon: "clipboard" as const,
          },
        ]
      : []),
  ];

  const banner =
    ctx.team.registration_status === "REJECTED" ? (
      <div className="border-b bg-rose-50 px-4 py-2.5 text-rose-900 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <AlertTriangle className="h-4 w-4" />
          Entry rejected{ctx.team.rejection_reason ? `: ${ctx.team.rejection_reason}` : "."}{" "}
          Fix the squad or payment details below, then resubmit the team for review.
        </div>
      </div>
    ) : ctx.team.registration_status === "PENDING" ? (
      <div className="border-b bg-amber-50 px-4 py-2.5 text-amber-900 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <AlertTriangle className="h-4 w-4" />
          Entry started. Build the squad and complete the details, then submit the team for
          review so nothing delays kickoff.
          {tournament ? (
            <Link
              href={`/${tournament.slug}/register`}
              className="font-semibold underline underline-offset-2"
            >
              Registration page
            </Link>
          ) : null}
        </div>
      </div>
    ) : ctx.team.payment_status !== "PAID" ? (
      <div className="border-b bg-sky-50 px-4 py-2.5 text-sky-900 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <AlertTriangle className="h-4 w-4" />
          Entry approved — payment is still outstanding. Upload the transfer proof from the
          payment card.
        </div>
      </div>
    ) : undefined;

  return (
    <PortalShell
      nav={nav}
      brandName={ctx.team.name}
      brandSubtitle={tournament?.name ?? "Tournament entry"}
      userName={ctx.profile.full_name}
      userRole={ctx.isAdmin ? "Organiser view" : "Team manager"}
      publicHref={tournament ? `/${tournament.slug}` : undefined}
      banner={banner}
    >
      {children}
    </PortalShell>
  );
}
