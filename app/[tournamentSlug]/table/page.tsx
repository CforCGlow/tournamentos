import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/layout/back-link";
import { Info, Medal, Trophy } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crest } from "@/components/ui/crest";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { StandingRow } from "@/lib/database.types";

export const dynamic = "force-dynamic";

function formTone(entry: string): string {
  if (entry === "W") return "bg-emerald-500 text-white";
  if (entry === "L") return "bg-rose-500 text-white";
  return "bg-slate-300 text-slate-800";
}

function sortRows(rows: StandingRow[]): StandingRow[] {
  return [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.goal_difference - a.goal_difference ||
      b.goals_for - a.goals_for ||
      a.goals_against - b.goals_against,
  );
}

export default async function PublicTablePage({
  params,
}: {
  params: Promise<{ tournamentSlug: string }>;
}) {
  const { tournamentSlug } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, slug, format")
    .eq("slug", tournamentSlug)
    .maybeSingle();

  if (!tournament) notFound();

  const [{ data: stages }, { data: standings }, { data: teams }] = await Promise.all([
    supabase
      .from("stages")
      .select("id, name, stage_type, sequence_order, qualifiers_count")
      .eq("tournament_id", tournament.id)
      .order("sequence_order"),
    supabase
      .from("standings")
      .select("*")
      .eq("tournament_id", tournament.id),
    supabase
      .from("teams")
      .select("id, name, short_name, logo_url, home_kit_color")
      .eq("tournament_id", tournament.id)
      .eq("registration_status", "APPROVED"),
  ]);

  const teamById = new Map((teams ?? []).map((team) => [team.id, team]));
  const rows = standings ?? [];

  const groupStages = (stages ?? []).filter((stage) => stage.stage_type === "GROUP");
  const tables = groupStages.length
    ? groupStages.map((stage) => ({
        stage,
        rows: sortRows(rows.filter((row) => row.stage_id === stage.id)),
      }))
    : (stages ?? []).map((stage) => ({
        stage,
        rows: sortRows(rows.filter((row) => row.stage_id === stage.id)),
      }));

  const populated = tables.filter((table) => table.rows.length > 0);
  const totalPlayed = rows.reduce((sum, row) => sum + row.played, 0) / 2;
  const totalGoals = rows.reduce((sum, row) => sum + row.goals_for, 0) / 2;

  return (
    <div className="container py-8">
      <BackLink href={`/${tournament.slug}`} label="Back to tournament" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Standings
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            League tables
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Every table is recalculated the moment a referee signs off a result — wins, goals and
            disciplinary deductions included.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="neutral">
            <Trophy className="h-3 w-3" /> {Math.round(totalPlayed)} played
          </Badge>
          <Badge variant="neutral">{Math.round(totalGoals)} goals</Badge>
          <Badge variant="neutral">{populated.length} tables</Badge>
        </div>
      </div>

      {populated.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="p-5">
            <EmptyState
              icon={<Medal className="h-5 w-5" />}
              title="No table yet"
              description="Standings appear once teams are drawn into a group and the first results are recorded."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 space-y-6">
          {populated.map((table) => (
            <Card key={table.stage.id}>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Medal className="h-4 w-4 text-amber-500" /> {table.stage.name}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="neutral">{table.rows.length} teams</Badge>
                  {table.stage.stage_type === "GROUP" && table.stage.qualifiers_count > 0 ? (
                    <Badge variant="success">
                      top {table.stage.qualifiers_count} qualify
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="w-10 px-3 py-2.5 text-center">#</th>
                        <th className="px-2 py-2.5">Team</th>
                        <th className="w-10 px-1.5 py-2.5 text-center">P</th>
                        <th className="w-10 px-1.5 py-2.5 text-center">W</th>
                        <th className="w-10 px-1.5 py-2.5 text-center">D</th>
                        <th className="w-10 px-1.5 py-2.5 text-center">L</th>
                        <th className="w-12 px-1.5 py-2.5 text-center">GF</th>
                        <th className="w-12 px-1.5 py-2.5 text-center">GA</th>
                        <th className="w-12 px-1.5 py-2.5 text-center">GD</th>
                        <th className="w-12 px-2 py-2.5 text-center font-bold">Pts</th>
                        <th className="px-3 py-2.5 text-center">Form</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, index) => {
                        const team = teamById.get(row.team_id);
                        const qualifies =
                          table.stage.stage_type === "GROUP" &&
                          table.stage.qualifiers_count > 0 &&
                          index < table.stage.qualifiers_count;

                        return (
                          <tr
                            key={row.id}
                            className={cn(
                              "border-b last:border-0 transition-colors hover:bg-muted/40",
                              qualifies && "bg-emerald-50/40",
                            )}
                          >
                            <td className="px-3 py-2.5 text-center">
                              <span
                                className={cn(
                                  "inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold",
                                  qualifies
                                    ? "bg-emerald-600 text-white"
                                    : "bg-muted text-muted-foreground",
                                )}
                              >
                                {index + 1}
                              </span>
                            </td>
                            <td className="px-2 py-2.5">
                              <Link
                                href={`/${tournament.slug}/teams/${row.team_id}`}
                                className="flex min-w-0 items-center gap-2 hover:underline"
                              >
                                <Crest
                                  name={team?.name ?? "Team"}
                                  logoUrl={team?.logo_url}
                                  color={team?.home_kit_color ?? "#94A3B8"}
                                  size="sm"
                                  className="h-6 w-6 rounded text-[9px]"
                                />
                                <span className="truncate font-semibold">
                                  {team?.name ?? "Unknown team"}
                                </span>
                                <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:inline">
                                  {team?.short_name}
                                </span>
                              </Link>
                            </td>
                            <td className="px-1.5 py-2.5 text-center tabular-nums">{row.played}</td>
                            <td className="px-1.5 py-2.5 text-center tabular-nums">{row.won}</td>
                            <td className="px-1.5 py-2.5 text-center tabular-nums">{row.drawn}</td>
                            <td className="px-1.5 py-2.5 text-center tabular-nums">{row.lost}</td>
                            <td className="px-1.5 py-2.5 text-center tabular-nums text-muted-foreground">
                              {row.goals_for}
                            </td>
                            <td className="px-1.5 py-2.5 text-center tabular-nums text-muted-foreground">
                              {row.goals_against}
                            </td>
                            <td className="px-1.5 py-2.5 text-center tabular-nums">
                              {row.goal_difference > 0 ? "+" : ""}
                              {row.goal_difference}
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <span className="font-display text-sm font-bold tabular-nums">
                                {row.points}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center justify-center gap-1">
                                {row.form.length === 0 ? (
                                  <span className="text-[10px] text-muted-foreground">—</span>
                                ) : (
                                  row.form.slice(-5).map((entry, formIndex) => (
                                    <span
                                      key={`${row.id}-${formIndex}-${entry}`}
                                      title={
                                        entry === "W"
                                          ? "Win"
                                          : entry === "L"
                                            ? "Loss"
                                            : "Draw"
                                      }
                                      className={cn(
                                        "flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold",
                                        formTone(entry),
                                      )}
                                    >
                                      {entry}
                                    </span>
                                  ))
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {table.stage.stage_type === "GROUP" && table.stage.qualifiers_count > 0 ? (
                  <p className="flex items-center gap-1.5 border-t px-4 py-2 text-[10px] text-muted-foreground">
                    <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />
                    Qualification places for the knockout stage
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-5 flex items-start gap-2 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Points are three for a win, one for a draw. Ties are broken by goal difference, then goals
        scored, then head-to-head.
      </p>
    </div>
  );
}
