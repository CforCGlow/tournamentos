import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Coins,
  FileText,
  IdCard,
  Lock,
  MailCheck,
  Plus,
  Printer,
  Send,
  Shirt,
  ShieldAlert,
  Trash2,
  Trophy,
  UserCheck,
  UserRound,
  Users,
} from "lucide-react";
import { requireTeamContext } from "@/lib/auth";
import { signedUrl } from "@/lib/storage";
import { deletePlayerAction, clearSuspensionAction, verifyPlayerAction } from "@/app/actions/players";
import {
  deleteTeamAction,
  saveTeamProfileAction,
  submitTeamAction,
  updateTeamAction,
} from "@/app/actions/teams";
import { FlashMessage } from "@/components/layout/flash-message";
import { BackLink } from "@/components/layout/back-link";
import { ColorField } from "@/components/forms/color-field";
import { PlayerDialog } from "@/components/dashboard/player-dialog";
import { FileUpload } from "@/components/forms/file-upload";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crest } from "@/components/ui/crest";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/ui/stat-card";
import { MatchStatusBadge, PaymentBadge, RegistrationBadge } from "@/components/ui/status-badge";
import { POSITION_LABEL } from "@/lib/constants";
import { getTeamSubmission } from "@/lib/team-submission";
import {
  fieldInputName,
  getTournamentSettings,
  missingRequiredFields,
} from "@/lib/tournament-settings";
import { readTeamProfile } from "@/lib/team-profile";
import { assessTeamReadiness } from "@/lib/team-readiness";
import { formatDate, formatMoney, formatTime, pluralize } from "@/lib/utils";
import type { Position } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const POSITION_TONE: Record<Position, string> = {
  GK: "bg-amber-100 text-amber-800",
  DEF: "bg-sky-100 text-sky-800",
  MID: "bg-emerald-100 text-emerald-800",
  FWD: "bg-rose-100 text-rose-800",
};

function ageFrom(dateOfBirth: string | null): string {
  if (!dateOfBirth) return "—";
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return "—";
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const monthDiff = now.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) age -= 1;
  return `${age} yrs`;
}

export default async function ManagerTeamPage({
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

  const { data: tournament } = await ctx.supabase
    .from("tournaments")
    .select("*")
    .eq("id", team.tournament_id)
    .maybeSingle();

  const [{ data: players }, { data: teams }, { data: fixtures }, { data: lineups }] =
    await Promise.all([
      ctx.supabase.from("players").select("*").eq("team_id", teamId).order("jersey_number"),
      ctx.supabase
        .from("teams")
        .select("id, name, short_name, logo_url, home_kit_color")
        .eq("tournament_id", team.tournament_id),
      ctx.supabase
        .from("matches")
        .select("*")
        .eq("tournament_id", team.tournament_id)
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .order("kickoff_time"),
      ctx.supabase.from("match_lineups").select("match_id, is_starting, player_id").eq("team_id", teamId),
    ]);

  const squad = players ?? [];
  const teamById = new Map((teams ?? []).map((entry) => [entry.id, entry]));
  const teamFixtures = fixtures ?? [];

  const lineupByMatch = new Map<string, { starters: number; subs: number }>();
  for (const row of lineups ?? []) {
    const current = lineupByMatch.get(row.match_id) ?? { starters: 0, subs: 0 };
    if (row.is_starting) current.starters += 1;
    else current.subs += 1;
    lineupByMatch.set(row.match_id, current);
  }

  const { data: stage } = team.stage_id
    ? await ctx.supabase
        .from("stages")
        .select("name")
        .eq("id", team.stage_id)
        .maybeSingle()
    : { data: null };

  const venueIds = Array.from(
    new Set(teamFixtures.map((match) => match.venue_id).filter((id): id is string => Boolean(id))),
  );
  const { data: venues } = venueIds.length
    ? await ctx.supabase.from("venues").select("id, name").in("id", venueIds)
    : { data: [] };
  const venueById = new Map((venues ?? []).map((venue) => [venue.id, venue.name]));

  const proofUrl = team.payment_proof_url
    ? await signedUrl("payment-proofs", team.payment_proof_url)
    : null;

  const suspended = squad.filter((player) => player.is_suspended);
  const verified = squad.filter((player) => player.is_verified);
  const nextFixture = teamFixtures.find(
    (match) => match.status === "SCHEDULED" && new Date(match.kickoff_time) >= new Date(),
  );

  const maxSquad = tournament?.max_squad_size ?? 23;
  const minSquad = tournament?.min_squad_size ?? 11;
  const squadProgress = Math.round((squad.length / maxSquad) * 100);
  const rosterLocked = Boolean(tournament?.roster_locked);
  const numbers = new Set(squad.map((player) => player.jersey_number));
  let suggested = 1;
  while (numbers.has(suggested) && suggested < 99) suggested += 1;

  const submission = await getTeamSubmission(team.id);
  const [settings, profile] = await Promise.all([
    getTournamentSettings(team.tournament_id),
    readTeamProfile(team.id),
  ]);
  const missingFields = missingRequiredFields(settings, profile.fields);
  const readiness = assessTeamReadiness({
    team,
    squadSize: squad.length,
    minSquadSize: minSquad,
    registrationFee: Number(tournament?.registration_fee ?? 0),
    players: squad,
    requireIdDocument: settings.requireIdDocument,
    requirePlayerPhoto: settings.requirePlayerPhoto,
    missingFields,
  });
  // Payment is the last step: it only opens once every registration detail is
  // correct, which keeps half-finished entries out of the organiser's queue.
  const detailsReady = readiness.checks
    .filter((check) => check.key !== "payment")
    .every((check) => check.ok);

  const opponentOf = (homeTeamId: string | null, awayTeamId: string | null) => {
    const opponentId = homeTeamId === teamId ? awayTeamId : homeTeamId;
    return opponentId ? teamById.get(opponentId) : null;
  };

  return (
    <div>
      <FlashMessage flash={query.flash} error={query.error} />
      <BackLink href="/portal" label="All my teams" />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <Crest
            name={team.name}
            logoUrl={team.logo_url}
            color={team.home_kit_color}
            size="lg"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              {tournament?.name ?? "Tournament"}
              {stage?.name ? ` · ${stage.name}` : ""}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight">{team.name}</h1>
              <Badge variant="outline">{team.short_name}</Badge>
              <RegistrationBadge status={team.registration_status} />
              <PaymentBadge status={team.payment_status} />
              {rosterLocked ? (
                <Badge variant="warning">
                  <Lock className="h-3 w-3" /> rosters locked
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {pluralize(squad.length, "player")} · {verified.length} verified ·{" "}
              {suspended.length} suspended
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tournament ? (
            <Button asChild variant="outline">
              <Link href={`/${tournament.slug}/teams/${team.id}`} target="_blank">
                Public profile <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href={`/print/team/${team.id}`} target="_blank">
              <Printer className="h-4 w-4" /> Squad sheet
            </Link>
          </Button>
          <PlayerDialog
            teamId={team.id}
            tenantId={tournament?.tenant_id ?? ""}
            disabled={rosterLocked || squad.length >= maxSquad}
            suggestNumber={suggested}
            requireId={settings.requireIdDocument}
            requirePhoto={settings.requirePlayerPhoto}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Squad registered"
          value={`${squad.length} / ${maxSquad}`}
          hint={
            squad.length < minSquad
              ? `${minSquad - squad.length} more needed for the minimum`
              : "Minimum squad size met"
          }
          icon={<Users className="h-5 w-5" />}
          tone={squad.length < minSquad ? "amber" : "primary"}
        />
        <StatCard
          label="Entry fee"
          value={formatMoney(tournament?.registration_fee ?? 0)}
          hint={
            team.payment_status === "PAID"
              ? "Settled"
              : team.payment_status === "PENDING_VERIFICATION"
                ? "Awaiting verification"
                : "Outstanding"
          }
          icon={<Coins className="h-5 w-5" />}
          tone={team.payment_status === "PAID" ? "primary" : "rose"}
        />
        <StatCard
          label="Next fixture"
          value={
            nextFixture ? opponentOf(nextFixture.home_team_id, nextFixture.away_team_id)?.short_name ?? "TBD" : "—"
          }
          hint={
            nextFixture
              ? `${formatDate(nextFixture.kickoff_time, true)} · ${nextFixture.round_name}`
              : "No scheduled fixtures"
          }
          icon={<CalendarDays className="h-5 w-5" />}
          tone="secondary"
        />
        <StatCard
          label="Unavailable"
          value={suspended.length}
          hint={`${squad.filter((player) => player.yellow_cards_accumulated > 0).length} carrying yellows`}
          icon={<ShieldAlert className="h-5 w-5" />}
          tone={suspended.length ? "rose" : "primary"}
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shirt className="h-4 w-4 text-primary" /> Squad
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {rosterLocked
                    ? "The organiser locked rosters at kickoff — ask them to unlock before editing."
                    : `Minimum ${minSquad} players, maximum ${maxSquad}. Suspended players cannot be picked in a lineup.`}
                </p>
              </div>
              <div className="w-40">
                <Progress
                  value={squadProgress}
                  tone={squad.length < minSquad ? "warning" : "primary"}
                />
                <p className="mt-1 text-right text-[10px] text-muted-foreground">
                  {squad.length} of {maxSquad}
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {squad.length === 0 ? (
                <EmptyState
                  icon={<Users className="h-5 w-5" />}
                  title="No players yet"
                  description="Add your squad now — jersey numbers must be unique and every ID document is verified by the organiser."
                  className="m-5"
                  action={
                    <PlayerDialog
                      teamId={team.id}
                      tenantId={tournament?.tenant_id ?? ""}
                      disabled={rosterLocked}
                      suggestNumber={suggested}
                      requireId={settings.requireIdDocument}
                      requirePhoto={settings.requirePlayerPhoto}
                    />
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="w-14 px-4 py-3 text-center">#</th>
                        <th className="px-3 py-3">Player</th>
                        <th className="px-3 py-3">Position</th>
                        <th className="px-3 py-3">Age</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {squad.map((player) => (
                        <tr key={player.id} className="border-b align-middle last:border-0">
                          <td className="px-4 py-2.5 text-center">
                            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-slate-900 px-1 font-display text-[11px] font-semibold text-white">
                              {player.jersey_number}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              {player.photo_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={player.photo_url}
                                  alt={player.full_name}
                                  className="h-8 w-8 rounded-full border object-cover"
                                />
                              ) : (
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">
                                  {player.full_name
                                    .split(" ")
                                    .map((part) => part[0])
                                    .filter(Boolean)
                                    .slice(0, 2)
                                    .join("")
                                    .toUpperCase()}
                                </span>
                              )}
                              <div className="min-w-0">
                                <p className="flex items-center gap-1.5 truncate font-semibold">
                                  {player.full_name}
                                  {player.is_captain ? (
                                    <span className="rounded bg-amber-100 px-1 text-[9px] font-bold uppercase text-amber-800">
                                      C
                                    </span>
                                  ) : null}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {player.goals_count} goals · {player.assists_count} assists ·{" "}
                                  {player.yellow_cards_accumulated}Y
                                  {player.red_cards_accumulated ? ` ${player.red_cards_accumulated}R` : ""}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${POSITION_TONE[player.position]}`}
                            >
                              {player.position}
                            </span>
                            <span className="ml-1.5 hidden text-[11px] text-muted-foreground sm:inline">
                              {POSITION_LABEL[player.position]}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                            {ageFrom(player.date_of_birth)}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {player.is_suspended ? (
                                <Badge variant="danger">suspended</Badge>
                              ) : null}
                              {player.is_verified ? (
                                <Badge variant="success">verified</Badge>
                              ) : player.id_document_url ? (
                                <Badge variant="warning">ID pending</Badge>
                              ) : (
                                <Badge variant="neutral">no ID</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              <PlayerDialog
                                teamId={team.id}
                                tenantId={tournament?.tenant_id ?? ""}
                                player={player}
                                disabled={rosterLocked}
                                requireId={settings.requireIdDocument}
                                requirePhoto={settings.requirePlayerPhoto}
                              />

                              {ctx.isAdmin ? (
                                <>
                                  <form action={verifyPlayerAction}>
                                    <input type="hidden" name="team_id" value={team.id} />
                                    <input type="hidden" name="player_id" value={player.id} />
                                    <input
                                      type="hidden"
                                      name="verified"
                                      value={player.is_verified ? "false" : "true"}
                                    />
                                    <Button
                                      type="submit"
                                      size="icon-sm"
                                      variant="ghost"
                                      title={
                                        player.is_verified ? "Remove verification" : "Verify player"
                                      }
                                    >
                                      <UserCheck
                                        className={`h-3.5 w-3.5 ${
                                          player.is_verified ? "text-emerald-600" : "text-muted-foreground"
                                        }`}
                                      />
                                    </Button>
                                  </form>
                                  {player.is_suspended ? (
                                    <form action={clearSuspensionAction}>
                                      <input type="hidden" name="team_id" value={team.id} />
                                      <input type="hidden" name="player_id" value={player.id} />
                                      <Button
                                        type="submit"
                                        size="icon-sm"
                                        variant="ghost"
                                        title="Clear suspension"
                                      >
                                        <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                                      </Button>
                                    </form>
                                  ) : null}
                                </>
                              ) : null}

                              <details className="relative">
                                <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </summary>
                                <form
                                  action={deletePlayerAction}
                                  className="absolute right-0 z-10 mt-1 w-52 space-y-2 rounded-lg border bg-card p-3 shadow-lg"
                                >
                                  <input type="hidden" name="team_id" value={team.id} />
                                  <input type="hidden" name="player_id" value={player.id} />
                                  <p className="text-[11px] text-muted-foreground">
                                    Remove {player.full_name} from the squad? Results and events
                                    already recorded keep their history.
                                  </p>
                                  <Button
                                    type="submit"
                                    size="sm"
                                    variant="destructive"
                                    className="w-full"
                                  >
                                    Remove player
                                  </Button>
                                </form>
                              </details>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {squad.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3">
                  <p className="text-[11px] text-muted-foreground">
                    {squad.length >= maxSquad
                      ? `Squad full — ${maxSquad} of ${maxSquad} players registered.`
                      : "Just added a player? Add the next one right here."}
                  </p>
                  <PlayerDialog
                    teamId={team.id}
                    tenantId={tournament?.tenant_id ?? ""}
                    disabled={rosterLocked || squad.length >= maxSquad}
                    suggestNumber={suggested}
                    requireId={settings.requireIdDocument}
                    requirePhoto={settings.requirePlayerPhoto}
                    label="Add another player"
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-secondary" /> Fixtures
              </CardTitle>
              <Badge variant="neutral">{teamFixtures.length}</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {teamFixtures.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Fixtures appear here as soon as the organiser runs the draw.
                </p>
              ) : (
                teamFixtures.map((match) => {
                  const opponent = opponentOf(match.home_team_id, match.away_team_id);
                  const isHome = match.home_team_id === teamId;
                  const lineup = lineupByMatch.get(match.id);
                  const scheduled = match.status === "SCHEDULED";
                  const scoreFor = isHome ? match.home_score : match.away_score;
                  const scoreAgainst = isHome ? match.away_score : match.home_score;
                  const outcome =
                    match.status === "COMPLETED"
                      ? scoreFor > scoreAgainst
                        ? "W"
                        : scoreFor < scoreAgainst
                          ? "L"
                          : "D"
                      : null;

                  return (
                    <div
                      key={match.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5"
                    >
                      <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {isHome ? "Home" : "Away"}
                      </span>
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Crest
                          name={opponent?.name ?? "TBD"}
                          logoUrl={opponent?.logo_url}
                          color={opponent?.home_kit_color ?? "#94A3B8"}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {opponent?.name ?? "TBD"}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {formatDate(match.kickoff_time)} ·{" "}
                            {formatTime(match.kickoff_time)}
                            {match.venue_id && venueById.get(match.venue_id)
                              ? ` · ${venueById.get(match.venue_id)}`
                              : ""}
                          </p>
                        </div>
                      </div>

                      {outcome ? (
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white ${
                            outcome === "W"
                              ? "bg-emerald-500"
                              : outcome === "D"
                                ? "bg-slate-400"
                                : "bg-rose-500"
                          }`}
                        >
                          {outcome}
                        </span>
                      ) : null}

                      <span className="rounded-md bg-slate-900 px-2 py-1 font-display text-xs font-semibold tabular-nums text-white">
                        {scoreFor} – {scoreAgainst}
                        {match.home_penalties !== null && match.away_penalties !== null
                          ? ` (${isHome ? match.home_penalties : match.away_penalties}–${
                              isHome ? match.away_penalties : match.home_penalties
                            })`
                          : ""}
                      </span>

                      <MatchStatusBadge status={match.status} />

                      {scheduled ? (
                        <Button asChild size="sm" variant={lineup ? "outline" : "default"}>
                          <Link href={`/manager/${teamId}/lineup/${match.id}`}>
                            <ClipboardCheck className="h-3.5 w-3.5" />
                            {lineup ? `${lineup.starters}/11 set` : "Set lineup"}
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className={team.registration_status === "APPROVED" ? "border-emerald-200" : undefined}>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" /> Team submission
              </CardTitle>
              {team.registration_status === "APPROVED" ? (
                <Badge variant="success">approved</Badge>
              ) : submission?.changesPending ? (
                <Badge variant="warning" className="uppercase tracking-wide whitespace-nowrap">
                  changes pending
                </Badge>
              ) : submission ? (
                <Badge variant="success">submitted</Badge>
              ) : (
                <Badge variant="warning">not submitted</Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {submission ? (
                <p className="rounded-md border bg-surface/60 px-3 py-2 text-[11px] text-muted-foreground">
                  Submitted {formatDate(submission.submittedAt, true)} with{" "}
                  {pluralize(submission.squadSize, "player")}.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Finish the checklist, then submit the team so the organiser can review it.
                </p>
              )}

              {submission?.changesPending ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                  Your latest changes are waiting for the organiser to review and approve.
                </p>
              ) : null}

              <ul className="space-y-2.5">
                {readiness.checks.map((check) => (
                  <li key={check.key} className="flex items-start gap-2">
                    {check.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">{check.label}</p>
                      <p className="text-[11px] text-muted-foreground">{check.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>

              {team.registration_status === "REJECTED" && team.rejection_reason ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 dark:bg-rose-950/30">
                  Rejected: {team.rejection_reason}
                </p>
              ) : null}

              {team.registration_status === "APPROVED" ? (
                <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  Approved by the organiser. No further submission is needed.
                </p>
              ) : (
                <form action={submitTeamAction} className="space-y-1.5">
                  <input type="hidden" name="team_id" value={team.id} />
                  <SubmitButton
                    size="sm"
                    className="w-full"
                    disabled={!readiness.ready}
                    pendingLabel={submission ? "Resubmitting…" : "Submitting…"}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {submission ? "Resubmit for review" : "Submit team for review"}
                  </SubmitButton>
                  {!readiness.ready ? (
                    <p className="text-center text-[11px] text-muted-foreground">
                      Complete every item above to submit.
                    </p>
                  ) : null}
                </form>
              )}

              {submission ? (
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={`/manager/${teamId}/submitted`}>
                    View submission status <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-primary" /> Entry payment
              </CardTitle>
              <PaymentBadge status={team.payment_status} />
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Amount due</span>
                <span className="font-display text-lg font-semibold">
                  {formatMoney(tournament?.registration_fee ?? 0)}
                </span>
              </div>

              {team.payment_transaction_id ? (
                <p className="rounded-md border bg-surface/60 px-3 py-2 font-mono text-[11px]">
                  Ref: {team.payment_transaction_id}
                </p>
              ) : null}

              {proofUrl ? (
                <a
                  href={proofUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  <FileText className="h-3.5 w-3.5" /> Open uploaded proof
                </a>
              ) : null}

              {team.payment_status === "PAID" ? (
                <p className="flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
                  <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Payment verified by the organiser. Nothing else to do.
                </p>
              ) : detailsReady ? (
                <form action={updateTeamAction} className="space-y-3 border-t pt-3">
                  <input type="hidden" name="team_id" value={team.id} />
                  <input type="hidden" name="name" value={team.name} />
                  <input type="hidden" name="short_name" value={team.short_name} />
                  <input type="hidden" name="home_kit_color" value={team.home_kit_color} />
                  <input type="hidden" name="away_kit_color" value={team.away_kit_color} />
                  <input type="hidden" name="logo_url" value={team.logo_url ?? ""} />

                  <div className="space-y-1.5">
                    <Label htmlFor="payment-ref" className="text-[11px]">
                      Transfer reference
                    </Label>
                    <Input
                      id="payment-ref"
                      name="payment_transaction_id"
                      defaultValue={team.payment_transaction_id ?? ""}
                      placeholder="e.g. MTN-8842-XK"
                      className="h-9 text-xs"
                    />
                  </div>
                  <FileUpload
                    bucket="payment-proofs"
                    tenantId={tournament?.tenant_id ?? ""}
                    name="payment_proof_url"
                    label="Payment proof"
                    accept="image/*,application/pdf"
                    defaultValue={team.payment_proof_url}
                    publicBucket={false}
                    preview={false}
                    hint="Screenshot or PDF. Uploading marks the entry as awaiting verification."
                  />
                  <SubmitButton size="sm" className="w-full" pendingLabel="Saving…">
                    Submit payment proof
                  </SubmitButton>
                </form>
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-dashed bg-surface/60 px-3 py-2.5 text-[11px] text-muted-foreground">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p>
                    Payment opens once the team details, squad and any required information are
                    complete. Finish the checklist under “Team submission” first.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" /> Entry
              </CardTitle>
              <RegistrationBadge status={team.registration_status} />
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                { label: "Tournament", value: tournament?.name ?? "—" },
                { label: "Group / stage", value: stage?.name ?? "Not drawn yet" },
                { label: "Registered", value: formatDate(team.created_at) },
                { label: "Kick-off", value: formatDate(tournament?.start_date) },
                { label: "Rosters", value: rosterLocked ? "Locked" : "Open" },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="max-w-[60%] text-right font-medium">{row.value}</span>
                </div>
              ))}

              {team.registration_status === "PENDING" ? (
                <details className="mt-3 border-t pt-3">
                  <summary className="cursor-pointer list-none text-[11px] font-semibold text-muted-foreground hover:text-rose-600">
                    Withdraw this entry…
                  </summary>
                  <form action={deleteTeamAction} className="mt-2 space-y-2">
                    <input type="hidden" name="team_id" value={team.id} />
                    <p className="text-[11px] text-muted-foreground">
                      Withdrawing deletes the entry and squad. Only pending entries can be
                      withdrawn.
                    </p>
                    <Button type="submit" size="sm" variant="destructive" className="w-full">
                      Withdraw entry
                    </Button>
                  </form>
                </details>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-secondary" /> Coach & registration details
              </CardTitle>
              {missingFields.length ? <Badge variant="warning" className="uppercase tracking-wide whitespace-nowrap">needs details</Badge> : null}
            </CardHeader>
            <CardContent>
              <form action={saveTeamProfileAction} className="space-y-3">
                <input type="hidden" name="team_id" value={team.id} />

                <div className="space-y-1.5">
                  <Label htmlFor="coach-name" className="text-[11px]">
                    Coach name
                  </Label>
                  <Input
                    id="coach-name"
                    name="coach_name"
                    defaultValue={profile.coachName ?? ""}
                    placeholder="Coach full name"
                    className="h-9 text-sm"
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="coach-phone" className="text-[11px]">
                      Coach phone
                    </Label>
                    <Input
                      id="coach-phone"
                      name="coach_phone"
                      defaultValue={profile.coachPhone ?? ""}
                      placeholder="+880 1XXX XXXXXX"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="coach-email" className="text-[11px]">
                      Coach email
                    </Label>
                    <Input
                      id="coach-email"
                      name="coach_email"
                      type="email"
                      defaultValue={profile.coachEmail ?? ""}
                      placeholder="coach@example.com"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                {settings.fields.length > 0 ? (
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Extra information
                    </p>
                    {settings.fields.map((field) => (
                      <div key={field.id} className="space-y-1.5">
                        <Label htmlFor={`prop-${field.id}`} className="text-[11px]">
                          {field.label}
                          {field.required ? <span className="text-rose-600"> *</span> : null}
                        </Label>
                        <Input
                          id={`prop-${field.id}`}
                          name={fieldInputName(field.id)}
                          defaultValue={profile.fields[field.id] ?? ""}
                          maxLength={160}
                          required={field.required}
                          className="h-9 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                <SubmitButton size="sm" variant="outline" className="w-full" pendingLabel="Saving…">
                  Save coach & registration details
                </SubmitButton>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <IdCard className="h-4 w-4 text-secondary" /> Team identity
            </CardHeader>
            <CardContent>
              <form action={updateTeamAction} className="space-y-3">
                <input type="hidden" name="team_id" value={team.id} />
                <input type="hidden" name="payment_transaction_id" value={team.payment_transaction_id ?? ""} />
                <input type="hidden" name="payment_proof_url" value={team.payment_proof_url ?? ""} />

                <div className="space-y-1.5">
                  <Label htmlFor="team-name" className="text-[11px]">
                    Team name
                  </Label>
                  <Input
                    id="team-name"
                    name="name"
                    defaultValue={team.name}
                    className="h-9 text-sm"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="team-short" className="text-[11px]">
                    Short code
                  </Label>
                  <Input
                    id="team-short"
                    name="short_name"
                    defaultValue={team.short_name}
                    maxLength={4}
                    className="h-9 text-sm uppercase"
                    required
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <ColorField
                    id="team-home"
                    name="home_kit_color"
                    label="Home kit"
                    defaultValue={team.home_kit_color}
                    compact
                  />
                  <ColorField
                    id="team-away"
                    name="away_kit_color"
                    label="Away kit"
                    defaultValue={team.away_kit_color}
                    compact
                  />
                </div>

                <FileUpload
                  bucket="logos"
                  tenantId={tournament?.tenant_id ?? ""}
                  name="logo_url"
                  label="Team crest"
                  defaultValue={team.logo_url}
                  hint="Square PNG works best."
                />

                <SubmitButton size="sm" variant="outline" className="w-full" pendingLabel="Saving…">
                  Save team identity
                </SubmitButton>
              </form>
            </CardContent>
          </Card>

          {suspended.length > 0 ? (
            <Card className="border-rose-200">
              <CardHeader className="flex-row items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <CardTitle className="text-rose-700">Suspensions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {suspended.map((player) => (
                  <div key={player.id} className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">
                      #{player.jersey_number} {player.full_name}
                    </span>
                    <Badge variant="danger">
                      {player.red_cards_accumulated
                        ? "red card"
                        : `${player.yellow_cards_accumulated} yellows`}
                    </Badge>
                  </div>
                ))}
                <p className="pt-1 text-[11px] text-muted-foreground">
                  Suspensions clear automatically once the ban is served. Only the organiser can
                  waive one.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Jersey numbers must be unique, and suspensions from accumulated cards are applied
              automatically — the team sheet and the public tables always agree.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
