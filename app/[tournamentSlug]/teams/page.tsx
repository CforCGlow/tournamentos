import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/layout/back-link";
import { ArrowRight, Shield, Users } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Crest } from "@/components/ui/crest";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PublicTeamsPage({
  params,
}: {
  params: Promise<{ tournamentSlug: string }>;
}) {
  const { tournamentSlug } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, slug, max_teams")
    .eq("slug", tournamentSlug)
    .maybeSingle();

  if (!tournament) notFound();

  const [{ data: teams }, { data: standings }, { data: stages }] = await Promise.all([
    supabase
      .from("teams")
      .select("*")
      .eq("tournament_id", tournament.id)
      .eq("registration_status", "APPROVED")
      .order("name"),
    supabase.from("standings").select("*").eq("tournament_id", tournament.id),
    supabase
      .from("stages")
      .select("id, name, stage_type")
      .eq("tournament_id", tournament.id)
      .order("sequence_order"),
  ]);

  const teamRows = teams ?? [];
  const teamIds = teamRows.map((team) => team.id);
  const stageById = new Map((stages ?? []).map((stage) => [stage.id, stage]));

  const { data: players } = teamIds.length
    ? await supabase.from("players").select("id, team_id, is_suspended").in("team_id", teamIds)
    : { data: [] };

  const squadCount = new Map<string, { total: number; suspended: number }>();
  for (const player of players ?? []) {
    const current = squadCount.get(player.team_id) ?? { total: 0, suspended: 0 };
    current.total += 1;
    if (player.is_suspended) current.suspended += 1;
    squadCount.set(player.team_id, current);
  }

  const standingByTeam = new Map((standings ?? []).map((row) => [row.team_id, row]));

  return (
    <div className="container py-8">
      <BackLink href={`/${tournament.slug}`} label="Back to tournament" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            The clubs
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            Teams &amp; squads
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {teamRows.length} approved entr{teamRows.length === 1 ? "y" : "ies"} out of{" "}
            {tournament.max_teams} places. Tap a club for its full squad and results.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="neutral">
            <Users className="h-3 w-3" /> {teamRows.length} teams
          </Badge>
          <Badge variant="neutral">
            {(players ?? []).length} registered players
          </Badge>
        </div>
      </div>

      {teamRows.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="p-5">
            <EmptyState
              icon={<Shield className="h-5 w-5" />}
              title="No approved teams yet"
              description="Clubs appear here once the organiser verifies their entry and payment."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {teamRows.map((team) => {
            const stage = team.stage_id ? stageById.get(team.stage_id) : null;
            const standing = standingByTeam.get(team.id);
            const squad = squadCount.get(team.id) ?? { total: 0, suspended: 0 };

            return (
              <Link
                key={team.id}
                href={`/${tournament.slug}/teams/${team.id}`}
                className="group flex flex-col rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <Crest
                    name={team.name}
                    logoUrl={team.logo_url}
                    color={team.home_kit_color}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-semibold leading-tight">
                      {team.name}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span
                        className="h-2.5 w-2.5 rounded-full border"
                        style={{ backgroundColor: team.home_kit_color }}
                      />
                      {team.short_name}
                      {stage ? ` · ${stage.name}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {squad.total} players
                      {squad.suspended > 0 ? ` · ${squad.suspended} suspended` : ""}
                    </p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>

                <div className="mt-4 grid grid-cols-5 gap-1 border-t pt-3 text-center">
                  {[
                    { label: "P", value: standing?.played ?? 0 },
                    { label: "W", value: standing?.won ?? 0 },
                    { label: "D", value: standing?.drawn ?? 0 },
                    { label: "L", value: standing?.lost ?? 0 },
                    { label: "Pts", value: standing?.points ?? 0, strong: true },
                  ].map((cell) => (
                    <div key={cell.label}>
                      <p
                        className={cn(
                          "font-display text-sm tabular-nums",
                          cell.strong ? "font-bold text-primary" : "font-semibold",
                        )}
                      >
                        {cell.value}
                      </p>
                      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                        {cell.label}
                      </p>
                    </div>
                  ))}
                </div>

                {standing && standing.form.length > 0 ? (
                  <div className="mt-2 flex items-center justify-between border-t pt-2">
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                      Form
                    </span>
                    <div className="flex gap-1">
                      {standing.form.slice(-5).map((entry, index) => (
                        <span
                          key={`${team.id}-${index}-${entry}`}
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold",
                            entry === "W"
                              ? "bg-emerald-500 text-white"
                              : entry === "L"
                                ? "bg-rose-500 text-white"
                                : "bg-slate-300 text-slate-800",
                          )}
                        >
                          {entry}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
