import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Coins,
  FileText,
  Flag,
  Layers,
  ListOrdered,
  Lock,
  MapPin,
  Pause,
  Play,
  Plus,
  Printer,
  RotateCcw,
  Settings2,
  Shuffle,
  Swords,
  Trash2,
  Trophy,
  Unlock,
  Users,
  Wand2,
} from "lucide-react";
import { requireTournament } from "@/lib/auth";
import { signedUrl } from "@/lib/storage";
import { assessTeamReadiness } from "@/lib/team-readiness";
import { getTeamSubmissions } from "@/lib/team-submission";
import { readTeamProfile } from "@/lib/team-profile";
import { getTournamentSettings, missingRequiredFields } from "@/lib/tournament-settings";
import { PITCH_SIZES, PITCH_SIZE_LABEL, pitchLabel } from "@/lib/pitch";
import { FlashMessage } from "@/components/layout/flash-message";
import { BackLink } from "@/components/layout/back-link";
import { EditTournamentDialog } from "@/components/dashboard/edit-tournament-dialog";
import { RegistrationSettingsForm } from "@/components/dashboard/registration-settings-form";
import {
  approveTeamAction,
  assignRefereeAction,
  clearFixturesAction,
  correctResultAction,
  createStageAction,
  createVenueAction,
  deleteStageAction,
  deleteTournamentAction,
  deleteVenueAction,
  drawGroupsAction,
  generateBracketAction,
  generateGroupFixturesAction,
  generateLeagueFixturesAction,
  rejectTeamAction,
  setRosterLockAction,
  setMatchClockAction,
  setTournamentStatusAction,
  updateMatchMetaAction,
  verifyPaymentAction,
} from "@/app/actions/tournaments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crest } from "@/components/ui/crest";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiveClock } from "@/components/public/live-clock";
import { StatCard } from "@/components/ui/stat-card";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  MatchStatusBadge,
  PaymentBadge,
  RegistrationBadge,
  TournamentStatusBadge,
} from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LIVE_STATUSES,
  TOURNAMENT_FORMATS,
  TOURNAMENT_STATUS_LABEL,
} from "@/lib/constants";
import { getMatchClocks } from "@/lib/match-clock";
import { formatDate, formatMoney, pluralize, toLocalInput } from "@/lib/utils";
import type { MatchRow, TeamRow } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const PITCH_LABEL: Record<string, string> = {
  "11v11": "11 v 11",
  "7v7": "7 v 7",
  "5v5_futsal": "Futsal",
};

export default async function TournamentControlPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; tournamentId: string }>;
  searchParams: Promise<{ flash?: string; error?: string }>;
}) {
  const { tenantSlug, tournamentId } = await params;
  const query = await searchParams;
  const ctx = await requireTournament(tenantSlug, tournamentId);
  const { tournament, supabase, tenant } = ctx;
  const base = `/dashboard/${tenantSlug}/tournaments/${tournamentId}`;

  const [
    { data: stages },
    { data: venues },
    { data: teams },
    { data: matches },
    { data: members },
  ] = await Promise.all([
    supabase.from("stages").select("*").eq("tournament_id", tournamentId).order("sequence_order"),
    supabase.from("venues").select("*").eq("tournament_id", tournamentId).order("name"),
    supabase.from("teams").select("*").eq("tournament_id", tournamentId).order("created_at"),
    supabase.from("matches").select("*").eq("tournament_id", tournamentId).order("kickoff_time"),
    supabase.from("tenant_members").select("*").eq("tenant_id", tenant.id).eq("role", "REFEREE"),
  ]);

  const teamList: TeamRow[] = teams ?? [];
  const matchList: MatchRow[] = matches ?? [];
  const stageList = stages ?? [];
  const matchClocks = await getMatchClocks(
    matchList.filter((match) => LIVE_STATUSES.includes(match.status)).map((match) => match.id),
  );

  const stageIds = stageList.map((stage) => stage.id);
  const teamIds = teamList.map((team) => team.id);

  const [{ data: standings }, { data: players }] = await Promise.all([
    stageIds.length
      ? supabase.from("standings").select("*").in("stage_id", stageIds)
      : Promise.resolve({ data: [] }),
    teamIds.length
      ? supabase.from("players").select("id, team_id, is_suspended").in("team_id", teamIds)
      : Promise.resolve({ data: [] }),
  ]);

  const personIds = Array.from(
    new Set([
      ...teamList.map((team) => team.manager_id),
      ...(members ?? []).map((member) => member.user_id),
    ]),
  );

  const { data: people } = personIds.length
    ? await supabase.from("public_profiles").select("id, full_name").in("id", personIds)
    : { data: [] as Array<{ id: string; full_name: string }> };

  const personById = new Map((people ?? []).map((person) => [person.id, person.full_name]));
  const teamById = new Map(teamList.map((team) => [team.id, team]));

  const squadCount = new Map<string, number>();
  for (const player of players ?? []) {
    squadCount.set(player.team_id, (squadCount.get(player.team_id) ?? 0) + 1);
  }

  const [submissions, settings, profileEntries] = await Promise.all([
    getTeamSubmissions(teamIds),
    getTournamentSettings(tournament.id),
    Promise.all(teamIds.map(async (id) => [id, await readTeamProfile(id)] as const)),
  ]);
  const profileById = new Map(profileEntries);

  const proofUrls = new Map<string, string>();
  for (const team of teamList) {
    if (team.payment_proof_url) {
      const url = await signedUrl("payment-proofs", team.payment_proof_url);
      if (url) proofUrls.set(team.id, url);
    }
  }

  const referees = (members ?? [])
    .map((member) => ({
      id: member.user_id,
      name: personById.get(member.user_id) ?? "Referee",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const pending = teamList.filter((team) => team.registration_status === "PENDING");
  const approved = teamList.filter((team) => team.registration_status === "APPROVED");
  const rejected = teamList.filter((team) => team.registration_status === "REJECTED");
  const unpaid = teamList.filter(
    (team) => team.registration_status !== "REJECTED" && team.payment_status !== "PAID",
  );
  const collected = teamList
    .filter((team) => team.payment_status === "PAID")
    .length * Number(tournament.registration_fee);

  const groupStages = stageList.filter((stage) => stage.stage_type === "GROUP");
  const knockoutStages = stageList.filter((stage) => stage.stage_type === "KNOCKOUT");
  const completed = matchList.filter((match) => match.status === "COMPLETED").length;
  const live = matchList.filter((match) =>
    ["FIRST_HALF", "HALF_TIME", "SECOND_HALF", "EXTRA_TIME", "PENALTIES"].includes(match.status),
  ).length;

  const rounds: Array<{ key: string; label: string; matches: MatchRow[] }> = [];
  const roundIndex = new Map<string, number>();
  for (const match of matchList) {
    const key = `${match.stage_id}:${match.round_name}`;
    const existing = roundIndex.get(key);
    if (existing === undefined) {
      roundIndex.set(key, rounds.length);
      rounds.push({ key, label: match.round_name, matches: [match] });
    } else {
      rounds[existing]?.matches.push(match);
    }
  }

  const standingsByStage = new Map<string, typeof standings>();
  for (const row of standings ?? []) {
    const list = standingsByStage.get(row.stage_id) ?? [];
    list.push(row);
    standingsByStage.set(row.stage_id, list);
  }

  const defaultTab = pending.length
    ? "registrations"
    : matchList.length
      ? "fixtures"
      : "overview";

  const tiebreakers = Array.isArray(tournament.tiebreaker_order)
    ? (tournament.tiebreaker_order as string[])
    : [];

  const setupSteps: Array<{ label: string; detail: string; done: boolean; href?: string }> = [
    {
      label: "Competition details",
      detail: "Name, format, dates and squad limits",
      done: tournament.name.trim().length > 0 && Boolean(tournament.start_date),
    },
    {
      label: "Registration rules",
      detail: "ID, photo and extra field requirements",
      done: settings.fields.length > 0 || settings.requireIdDocument || settings.requirePlayerPhoto,
    },
    {
      label: "Teams entered",
      detail: `${approved.length} approved · ${pending.length} pending`,
      done: approved.length >= 2,
    },
    {
      label: "Stages",
      detail: stageList.length ? `${stageList.length} created` : "Add groups or knockout rounds",
      done: stageList.length > 0,
    },
    {
      label: "Venues",
      detail: (venues ?? []).length ? `${(venues ?? []).length} pitches` : "Add at least one pitch",
      done: (venues ?? []).length > 0,
    },
    {
      label: "Fixtures",
      detail: matchList.length ? `${matchList.length} scheduled` : "Run the draw",
      done: matchList.length > 0,
    },
  ];

  return (
    <div>
      <FlashMessage flash={query.flash} error={query.error} />
      <BackLink href={`/dashboard/${tenantSlug}/tournaments`} label="All tournaments" />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            {TOURNAMENT_FORMATS[tournament.format]}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {tournament.name}
            </h1>
            <TournamentStatusBadge status={tournament.status} />
            {tournament.roster_locked ? (
              <Badge variant="warning">
                <Lock className="h-3 w-3" /> rosters locked
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(tournament.start_date)} — {formatDate(tournament.end_date)} ·{" "}
            {pluralize(approved.length, "team")} · {pluralize(matchList.length, "fixture")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <EditTournamentDialog
            tenantSlug={tenantSlug}
            tenantId={tenant.id}
            tournament={tournament}
          />
          <Button asChild variant="secondary">
            <Link href={`/${tournament.slug}`} target="_blank">
              Public site <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Entry fees collected"
          value={formatMoney(collected)}
          hint={`${unpaid.length} entries still unpaid`}
          icon={<Coins className="h-5 w-5" />}
        />
        <StatCard
          label="Approved teams"
          value={`${approved.length}/${tournament.max_teams}`}
          hint={`${pending.length} pending · ${rejected.length} rejected`}
          icon={<Users className="h-5 w-5" />}
          tone="secondary"
        />
        <StatCard
          label="Fixtures"
          value={matchList.length}
          hint={`${completed} completed · ${live} live`}
          icon={<Swords className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          label="Stages / venues"
          value={`${stageList.length} / ${(venues ?? []).length}`}
          hint={`${groupStages.length} groups · ${knockoutStages.length} knockout`}
          icon={<Layers className="h-5 w-5" />}
        />
      </div>

      <Tabs defaultValue={defaultTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="registrations">
            Registrations
            {pending.length ? (
              <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">
                {pending.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="fixtures">Fixtures &amp; scheduling</TabsTrigger>
          <TabsTrigger value="standings">Tables &amp; bracket</TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------------- */}
        {/* OVERVIEW                                                          */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="overview" className="space-y-5">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Setup checklist
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Follow these steps in order — each one unlocks the next part of the tournament.
                </p>
              </div>
              <Badge variant="neutral">
                {setupSteps.filter((step) => step.done).length} / {setupSteps.length}
              </Badge>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {setupSteps.map((step, index) => (
                  <li
                    key={step.label}
                    className="flex items-start gap-2.5 rounded-lg border bg-surface/50 px-3 py-2.5"
                  >
                    {step.done ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold text-muted-foreground">
                        {index + 1}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">{step.label}</p>
                      <p className="text-[11px] text-muted-foreground">{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Competition rules</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  { label: "Format", value: TOURNAMENT_FORMATS[tournament.format] },
                  { label: "Status", value: TOURNAMENT_STATUS_LABEL[tournament.status] },
                  {
                    label: "Entry fee",
                    value: formatMoney(tournament.registration_fee),
                  },
                  {
                    label: "Squad size",
                    value: `${tournament.min_squad_size}–${tournament.max_squad_size} players`,
                  },
                  {
                    label: "Points",
                    value: `${tournament.points_per_win} win / ${tournament.points_per_draw} draw / ${tournament.points_per_loss} loss`,
                  },
                  {
                    label: "Suspension threshold",
                    value: `${tournament.yellow_cards_for_suspension} yellow cards`,
                  },
                  {
                    label: "Tiebreakers",
                    value: tiebreakers.length ? tiebreakers.join(" → ") : "Goal difference",
                  },
                ].map((row) => (
                  <div key={row.label} className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="text-right font-medium">{row.value}</span>
                  </div>
                ))}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
                  <form action={setTournamentStatusAction} className="flex items-center gap-2">
                    <input type="hidden" name="tenant_slug" value={tenantSlug} />
                    <input type="hidden" name="tournament_id" value={tournament.id} />
                    <Select name="status" defaultValue={tournament.status} className="h-9 w-44">
                      <option value="DRAFT">Draft (hidden)</option>
                      <option value="REGISTRATION_OPEN">Registration open</option>
                      <option value="ONGOING">Ongoing</option>
                      <option value="COMPLETED">Completed</option>
                    </Select>
                    <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">
                      Set status
                    </SubmitButton>
                  </form>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface/60 px-3 py-2.5">
                  <div className="text-xs">
                    <p className="font-semibold">
                      {tournament.roster_locked ? "Rosters are locked" : "Rosters are open"}
                    </p>
                    <p className="text-muted-foreground">
                      Locking stops managers adding or removing players.
                    </p>
                  </div>
                  <form action={setRosterLockAction} className="flex items-center gap-2">
                    <input type="hidden" name="tenant_slug" value={tenantSlug} />
                    <input type="hidden" name="tournament_id" value={tournament.id} />
                    <input type="hidden" name="locked" value={tournament.roster_locked ? "" : "on"} />
                    <SubmitButton
                      size="sm"
                      variant={tournament.roster_locked ? "outline" : "default"}
                      pendingLabel="Saving…"
                    >
                      {tournament.roster_locked ? (
                        <>
                          <Unlock className="h-3.5 w-3.5" /> Unlock
                        </>
                      ) : (
                        <>
                          <Lock className="h-3.5 w-3.5" /> Lock
                        </>
                      )}
                    </SubmitButton>
                  </form>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" /> Stages
                  </CardTitle>
                  <Badge variant="neutral">{stageList.length}</Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="rounded-lg border border-dashed bg-surface/50 px-3 py-2 text-[11px] text-muted-foreground">
                    <p>
                      <strong className="text-foreground">Group stage:</strong> one table per group.
                      Set how many teams qualify for the knockout.
                    </p>
                    <p className="mt-0.5">
                      <strong className="text-foreground">Knockout:</strong> single-elimination
                      rounds generated from the qualifiers.
                    </p>
                  </div>

                  {stageList.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No stages yet. The draw and fixture generators create them
                      automatically, or add one manually below.
                    </p>
                  ) : (
                    stageList.map((stage) => (
                      <div
                        key={stage.id}
                        className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-semibold">
                            {stage.name}
                            <Badge variant={stage.stage_type === "GROUP" ? "info" : "warning"} className="uppercase tracking-wide whitespace-nowrap">
                              {stage.stage_type}
                            </Badge>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {teamList.filter((team) => team.stage_id === stage.id).length} teams
                            {stage.stage_type === "GROUP"
                              ? ` · top ${stage.qualifiers_count} qualify`
                              : ""}
                          </p>
                        </div>
                        <form action={deleteStageAction}>
                          <input type="hidden" name="tenant_slug" value={tenantSlug} />
                          <input type="hidden" name="tournament_id" value={tournament.id} />
                          <input type="hidden" name="stage_id" value={stage.id} />
                          <Button
                            type="submit"
                            size="icon-sm"
                            variant="ghost"
                            title="Delete stage and its fixtures"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                          </Button>
                        </form>
                      </div>
                    ))
                  )}

                  <form
                    action={createStageAction}
                    className="mt-3 grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]"
                  >
                    <input type="hidden" name="tenant_slug" value={tenantSlug} />
                    <input type="hidden" name="tournament_id" value={tournament.id} />
                    <Input
                      name="name"
                      placeholder="Stage name"
                      required
                      className="h-9"
                      title="For example: Group A, Semi-finals"
                    />
                    <Select name="stage_type" defaultValue="GROUP" className="h-9 w-full lg:w-28">
                      <option value="GROUP">Group</option>
                      <option value="KNOCKOUT">Knockout</option>
                    </Select>
                    <Input
                      name="sequence_order"
                      type="number"
                      min={1}
                      max={50}
                      defaultValue={stageList.length + 1}
                      className="h-9 w-full lg:w-20"
                      title="Sequence order"
                    />
                    <Input
                      name="qualifiers_count"
                      type="number"
                      min={0}
                      max={16}
                      defaultValue={2}
                      className="h-9 w-full lg:w-24"
                      title="Teams that qualify from this stage"
                      aria-label="Qualifiers"
                    />
                    <SubmitButton size="sm" pendingLabel="Adding…">
                      <Plus className="h-3.5 w-3.5" /> Add stage
                    </SubmitButton>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-secondary" /> Venues
                  </CardTitle>
                  <Badge variant="neutral">{(venues ?? []).length}</Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="rounded-lg border border-dashed bg-surface/50 px-3 py-2 text-[11px] text-muted-foreground">
                    Pick the exact format played on each pitch — from 5 v 5 up to 11 v 11. Fixture
                    generation rotates kick-off slots across these venues.
                  </p>
                  {(venues ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Add pitches so fixture generation can rotate kick-off slots.
                    </p>
                  ) : (
                    (venues ?? []).map((venue) => (
                      <div
                        key={venue.id}
                        className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{venue.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {settings.venuePitch[venue.id]
                              ? pitchLabel(settings.venuePitch[venue.id])
                              : PITCH_LABEL[venue.pitch_type] ?? venue.pitch_type}
                            {venue.address ? ` · ${venue.address}` : ""}
                          </p>
                        </div>
                        <form action={deleteVenueAction}>
                          <input type="hidden" name="tenant_slug" value={tenantSlug} />
                          <input type="hidden" name="tournament_id" value={tournament.id} />
                          <input type="hidden" name="venue_id" value={venue.id} />
                          <Button type="submit" size="icon-sm" variant="ghost" title="Delete venue">
                            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                          </Button>
                        </form>
                      </div>
                    ))
                  )}

                  <form
                    action={createVenueAction}
                    className="mt-3 grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[1fr_auto_auto]"
                  >
                    <input type="hidden" name="tenant_slug" value={tenantSlug} />
                    <input type="hidden" name="tournament_id" value={tournament.id} />
                    <Input name="name" placeholder="Main pitch" required className="h-9" />
                    <Select name="pitch_type" defaultValue="11v11" className="h-9 w-32">
                      {PITCH_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {PITCH_SIZE_LABEL[size]}
                        </option>
                      ))}
                    </Select>
                    <SubmitButton size="sm" pendingLabel="Adding…">
                      <Plus className="h-3.5 w-3.5" /> Add
                    </SubmitButton>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="border-rose-200">
            <CardHeader>
              <CardTitle className="text-rose-700">Danger zone</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <form action={clearFixturesAction} className="space-y-2">
                <p className="text-sm font-semibold">Rebuild the schedule</p>
                <p className="text-xs text-muted-foreground">
                  Deletes every fixture and result for this tournament. Standings are
                  recalculated to zero automatically.
                </p>
                <div className="flex items-center gap-2">
                  <input type="hidden" name="tenant_slug" value={tenantSlug} />
                  <input type="hidden" name="tournament_id" value={tournament.id} />
                  <Input name="confirm" placeholder="CLEAR" className="h-9 w-28" />
                  <SubmitButton size="sm" variant="outline" pendingLabel="Clearing…">
                    Clear fixtures
                  </SubmitButton>
                </div>
              </form>

              <form action={deleteTournamentAction} className="space-y-2">
                <p className="text-sm font-semibold">Delete the tournament</p>
                <p className="text-xs text-muted-foreground">
                  Removes teams, squads, fixtures, events and standings permanently.
                </p>
                <div className="flex items-center gap-2">
                  <input type="hidden" name="tenant_slug" value={tenantSlug} />
                  <input type="hidden" name="tournament_id" value={tournament.id} />
                  <Input name="confirm" placeholder="DELETE" className="h-9 w-28" />
                  <SubmitButton size="sm" variant="destructive" pendingLabel="Deleting…">
                    Delete
                  </SubmitButton>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* REGISTRATIONS                                                     */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="registrations" className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" /> Registration requirements
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Decide what every entry must provide. Requirements apply to new and existing players,
                and the manager cannot submit until they are met.
              </p>
            </CardHeader>
            <CardContent>
              <RegistrationSettingsForm
                tenantSlug={tenantSlug}
                tournamentId={tournament.id}
                settings={settings}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Registration &amp; payment queue</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Approve a submitted, complete team to make it eligible for the draw. Payment
                  proofs open as short-lived signed links.
                </p>
              </div>
              <div className="flex gap-1.5">
                <Badge variant="warning">{pending.length} pending</Badge>
                <Badge variant="success">{approved.length} approved</Badge>
                <Badge variant="danger">{rejected.length} rejected</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {teamList.length === 0 ? (
                <EmptyState
                  icon={<Users className="h-5 w-5" />}
                  title="No entries yet"
                  description="Share the public registration link so managers can enter their squads."
                  className="m-5"
                  action={
                    <Button asChild size="sm">
                      <Link href={`/${tournament.slug}/register`} target="_blank">
                        Open registration page
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3">Team</th>
                        <th className="px-4 py-3">Manager</th>
                        <th className="px-4 py-3">Squad</th>
                        <th className="px-4 py-3">Payment</th>
                        <th className="px-4 py-3">Registration</th>
                        <th className="px-4 py-3 text-right">Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...pending, ...approved, ...rejected].map((team) => {
                        const proof = proofUrls.get(team.id);
                        const submission = submissions.get(team.id) ?? null;
                        const readiness = assessTeamReadiness({
                          team,
                          squadSize: squadCount.get(team.id) ?? 0,
                          minSquadSize: tournament.min_squad_size,
                          registrationFee: Number(tournament.registration_fee),
                          requireIdDocument: settings.requireIdDocument,
                          requirePlayerPhoto: settings.requirePlayerPhoto,
                          missingFields: missingRequiredFields(
                            settings,
                            profileById.get(team.id)?.fields,
                          ),
                        });
                        const canApprove = Boolean(submission) && readiness.ready;
                        return (
                          <tr key={team.id} className="border-b align-top last:border-0">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <Crest
                                  name={team.name}
                                  logoUrl={team.logo_url}
                                  color={team.home_kit_color}
                                />
                                <div className="min-w-0">
                                  <p className="truncate font-semibold">{team.name}</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {team.short_name}
                                    {team.stage_id
                                      ? ` · ${
                                          stageList.find((stage) => stage.id === team.stage_id)
                                            ?.name ?? "assigned"
                                        }`
                                      : ""}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {personById.get(team.manager_id) ?? "Manager"}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {squadCount.get(team.id) ?? 0} / {tournament.max_squad_size}
                            </td>
                            <td className="px-4 py-3">
                              <div className="space-y-1.5">
                                <PaymentBadge status={team.payment_status} />
                                {team.payment_transaction_id ? (
                                  <p className="font-mono text-[10px] text-muted-foreground">
                                    {team.payment_transaction_id}
                                  </p>
                                ) : null}
                                {proof ? (
                                  <a
                                    href={proof}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block text-[11px] font-semibold text-primary hover:underline"
                                  >
                                    Open proof
                                  </a>
                                ) : team.payment_proof_url ? (
                                  <span className="text-[11px] text-muted-foreground">
                                    Proof stored
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">
                                    No proof uploaded
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                <RegistrationBadge status={team.registration_status} />
                                {team.registration_status !== "APPROVED" ? (
                                  submission ? (
                                    <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                                      Submitted {formatDate(submission.submittedAt)}
                                    </p>
                                  ) : (
                                    <p className="text-[11px] text-muted-foreground">
                                      Awaiting manager submission
                                    </p>
                                  )
                                ) : null}
                                {team.rejection_reason ? (
                                  <p className="max-w-[180px] text-[11px] text-rose-600">
                                    {team.rejection_reason}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col items-end gap-1.5">
                                <Button asChild size="sm" variant="outline">
                                  <Link href={`${base}/teams/${team.id}`}>
                                    Review <ArrowRight className="h-3.5 w-3.5" />
                                  </Link>
                                </Button>

                                {team.payment_status !== "PAID" ? (
                                  <form action={verifyPaymentAction}>
                                    <input type="hidden" name="tenant_slug" value={tenantSlug} />
                                    <input
                                      type="hidden"
                                      name="tournament_id"
                                      value={tournament.id}
                                    />
                                    <input type="hidden" name="team_id" value={team.id} />
                                    <Button type="submit" size="sm" variant="outline">
                                      <Coins className="h-3.5 w-3.5" /> Verify payment
                                    </Button>
                                  </form>
                                ) : null}

                                {team.registration_status !== "APPROVED" ? (
                                  <form action={approveTeamAction}>
                                    <input type="hidden" name="tenant_slug" value={tenantSlug} />
                                    <input
                                      type="hidden"
                                      name="tournament_id"
                                      value={tournament.id}
                                    />
                                    <input type="hidden" name="team_id" value={team.id} />
                                    <Button
                                      type="submit"
                                      size="sm"
                                      disabled={!canApprove}
                                      title={
                                        !submission
                                          ? "Waiting for the manager to submit the team"
                                          : !readiness.ready
                                            ? `Incomplete: ${readiness.missing.join(", ")}`
                                            : undefined
                                      }
                                    >
                                      <ClipboardCheck className="h-3.5 w-3.5" />
                                      {canApprove ? "Approve" : "Awaiting submission"}
                                    </Button>
                                  </form>
                                ) : null}

                                {team.registration_status !== "REJECTED" ? (
                                  <details className="w-[210px]">
                                    <summary className="cursor-pointer list-none text-right text-[11px] font-semibold text-muted-foreground hover:text-rose-600">
                                      Reject…
                                    </summary>
                                    <form action={rejectTeamAction} className="mt-1.5 space-y-1.5">
                                      <input
                                        type="hidden"
                                        name="tenant_slug"
                                        value={tenantSlug}
                                      />
                                      <input
                                        type="hidden"
                                        name="tournament_id"
                                        value={tournament.id}
                                      />
                                      <input type="hidden" name="team_id" value={team.id} />
                                      <Input
                                        name="reason"
                                        placeholder="Reason for rejection"
                                        className="h-8 text-xs"
                                        required
                                      />
                                      <Button
                                        type="submit"
                                        size="sm"
                                        variant="destructive"
                                        className="w-full"
                                      >
                                        Confirm reject
                                      </Button>
                                    </form>
                                  </details>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="space-y-3 p-4 md:hidden">
                {[...pending, ...approved, ...rejected].map((team) => {
                  const proof = proofUrls.get(team.id);
                  const submission = submissions.get(team.id) ?? null;
                  const readiness = assessTeamReadiness({
                    team,
                    squadSize: squadCount.get(team.id) ?? 0,
                    minSquadSize: tournament.min_squad_size,
                    registrationFee: Number(tournament.registration_fee),
                    requireIdDocument: settings.requireIdDocument,
                    requirePlayerPhoto: settings.requirePlayerPhoto,
                    missingFields: missingRequiredFields(settings, profileById.get(team.id)?.fields),
                  });
                  const canApprove = Boolean(submission) && readiness.ready;

                  return (
                    <div key={team.id} className="rounded-xl border bg-card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Crest
                            name={team.name}
                            logoUrl={team.logo_url}
                            color={team.home_kit_color}
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{team.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {team.short_name} · {squadCount.get(team.id) ?? 0} players
                            </p>
                          </div>
                        </div>
                        <RegistrationBadge status={team.registration_status} />
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <PaymentBadge status={team.payment_status} />
                        {submission?.changesPending ? (
                          <Badge variant="warning" className="uppercase tracking-wide whitespace-nowrap">
                            changes pending
                          </Badge>
                        ) : null}
                        {team.payment_transaction_id ? (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {team.payment_transaction_id}
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {submission
                          ? `Submitted ${formatDate(submission.submittedAt)}`
                          : "Awaiting manager submission"}
                        {team.rejection_reason ? ` · ${team.rejection_reason}` : ""}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`${base}/teams/${team.id}`}>
                            Review <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </Button>

                        {team.payment_status !== "PAID" ? (
                          <form action={verifyPaymentAction}>
                            <input type="hidden" name="tenant_slug" value={tenantSlug} />
                            <input type="hidden" name="tournament_id" value={tournament.id} />
                            <input type="hidden" name="team_id" value={team.id} />
                            <Button type="submit" size="sm" variant="outline">
                              <Coins className="h-3.5 w-3.5" /> Payment
                            </Button>
                          </form>
                        ) : null}

                        {team.registration_status !== "APPROVED" ? (
                          <form action={approveTeamAction}>
                            <input type="hidden" name="tenant_slug" value={tenantSlug} />
                            <input type="hidden" name="tournament_id" value={tournament.id} />
                            <input type="hidden" name="team_id" value={team.id} />
                            <Button type="submit" size="sm" disabled={!canApprove}>
                              <ClipboardCheck className="h-3.5 w-3.5" />
                              {canApprove ? "Approve" : "Awaiting"}
                            </Button>
                          </form>
                        ) : null}
                      </div>

                      {proof ? (
                        <a
                          href={proof}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                        >
                          <FileText className="h-3 w-3" /> Open payment proof
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="fixtures" className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" /> Draw &amp; fixture generator
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Round-robin fixtures use the circle method so no team plays twice in the
                same matchday. Brackets are seeded and auto-link winners to the next round.
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {tournament.format === "GROUP_PLUS_KNOCKOUT" ? (
                <form
                  action={drawGroupsAction}
                  className="space-y-2 rounded-lg border bg-surface/50 p-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    1 · Pot draw
                  </p>
                  <Input
                    name="group_count"
                    type="number"
                    min={2}
                    max={16}
                    defaultValue={4}
                    className="h-9"
                  />
                  <input type="hidden" name="tenant_slug" value={tenantSlug} />
                  <input type="hidden" name="tournament_id" value={tournament.id} />
                  <SubmitButton size="sm" variant="outline" className="w-full">
                    <Shuffle className="h-3.5 w-3.5" /> Draw groups
                  </SubmitButton>
                </form>
              ) : null}

              {tournament.format !== "KNOCKOUT" ? (
                <form
                  action={
                    tournament.format === "GROUP_PLUS_KNOCKOUT"
                      ? generateGroupFixturesAction
                      : generateLeagueFixturesAction
                  }
                  className="space-y-2 rounded-lg border bg-surface/50 p-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {tournament.format === "GROUP_PLUS_KNOCKOUT" ? "2 · Group fixtures" : "Fixtures"}
                  </p>
                  {tournament.format === "LEAGUE" ? (
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        name="double_round"
                        className="h-4 w-4 rounded border-input accent-emerald-600"
                      />
                      Home &amp; away double round
                    </label>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Runs every group with two or more teams.
                    </p>
                  )}
                  <input type="hidden" name="tenant_slug" value={tenantSlug} />
                  <input type="hidden" name="tournament_id" value={tournament.id} />
                  <SubmitButton size="sm" className="w-full" pendingLabel="Generating…">
                    <CalendarDays className="h-3.5 w-3.5" /> Generate
                  </SubmitButton>
                </form>
              ) : null}

              <form
                action={generateBracketAction}
                className="space-y-2 rounded-lg border bg-surface/50 p-3"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {tournament.format === "GROUP_PLUS_KNOCKOUT"
                    ? "3 · Knockout bracket"
                    : "Knockout bracket"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {tournament.format === "GROUP_PLUS_KNOCKOUT"
                    ? "Qualifiers come from the group tables. Byes auto-advance."
                    : "Seeds every approved team into a power-of-two bracket."}
                </p>
                <input type="hidden" name="tenant_slug" value={tenantSlug} />
                <input type="hidden" name="tournament_id" value={tournament.id} />
                <SubmitButton size="sm" variant="secondary" className="w-full">
                  <Trophy className="h-3.5 w-3.5" /> Build bracket
                </SubmitButton>
              </form>

              <div className="space-y-2 rounded-lg border bg-surface/50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Referees available
                </p>
                {referees.length === 0 ? (
                  <>
                    <p className="text-[11px] text-muted-foreground">
                      No referees on this tenant yet.
                    </p>
                    <Button asChild size="sm" variant="outline" className="w-full">
                      <Link href={`/dashboard/${tenantSlug}/referees`}>
                        <Flag className="h-3.5 w-3.5" /> Invite a referee
                      </Link>
                    </Button>
                  </>
                ) : (
                  <ul className="space-y-1 text-[11px] text-muted-foreground">
                    {referees.slice(0, 5).map((referee) => (
                      <li key={referee.id} className="truncate">
                        • {referee.name}
                      </li>
                    ))}
                    {referees.length > 5 ? (
                      <li>+{referees.length - 5} more</li>
                    ) : null}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          {matchList.length === 0 ? (
            <EmptyState
              icon={<Swords className="h-5 w-5" />}
              title="No fixtures yet"
              description="Approve teams, then run a generator above. Every fixture appears here with referee assignment and score correction."
            />
          ) : (
            rounds.map((round) => (
              <Card key={round.key}>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <CalendarDays className="h-4 w-4 text-secondary" /> {round.label}
                  </CardTitle>
                  <Badge variant="neutral">{round.matches.length}</Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  {round.matches.map((match) => {
                    const home = match.home_team_id ? teamById.get(match.home_team_id) : null;
                    const away = match.away_team_id ? teamById.get(match.away_team_id) : null;
                    return (
                      <div key={match.id} className="rounded-lg border">
                        <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                          <span className="w-9 shrink-0 font-display text-[11px] font-semibold text-muted-foreground">
                            #{match.match_number}
                          </span>

                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <Crest
                              name={home?.name ?? "TBD"}
                              logoUrl={home?.logo_url}
                              color={home?.home_kit_color ?? "#94A3B8"}
                              size="sm"
                            />
                            <span className="min-w-0 truncate text-sm font-semibold">
                              {home?.name ?? "TBD"}
                            </span>
                          </div>

                          <span className="rounded-md bg-slate-900 px-2.5 py-1 font-display text-sm font-semibold tabular-nums text-white">
                            {match.home_score} – {match.away_score}
                            {match.home_penalties !== null && match.away_penalties !== null ? (
                              <span className="ml-1.5 text-[10px] font-normal text-emerald-300">
                                ({match.home_penalties}–{match.away_penalties})
                              </span>
                            ) : null}
                          </span>

                          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                            <span className="min-w-0 truncate text-right text-sm font-semibold">
                              {away?.name ?? "TBD"}
                            </span>
                            <Crest
                              name={away?.name ?? "TBD"}
                              logoUrl={away?.logo_url}
                              color={away?.home_kit_color ?? "#94A3B8"}
                              size="sm"
                            />
                          </div>

                          <div className="flex w-full items-center gap-2 sm:w-auto">
                            <MatchStatusBadge status={match.status} />
                            {LIVE_STATUSES.includes(match.status) ? (
                              <LiveClock
                                matchId={match.id}
                                initial={matchClocks.get(match.id) ?? null}
                                size="small"
                              />
                            ) : null}
                            <span className="text-[11px] text-muted-foreground">
                              {formatDate(match.kickoff_time, true)}
                            </span>
                            <Button
                              asChild
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                            >
                              <Link
                                href={`/print/match/${match.id}`}
                                target="_blank"
                                title="Printable match sheet"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-3 border-t bg-surface/40 px-3 py-2.5 lg:grid-cols-3">
                          <details className="lg:col-span-3" open={LIVE_STATUSES.includes(match.status)}>
                            <summary className="cursor-pointer list-none text-[11px] font-semibold text-muted-foreground hover:text-foreground">
                              Match clock
                            </summary>
                            <div className="mt-1.5 flex flex-wrap items-end gap-2">
                              <div className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5">
                                <LiveClock
                                  matchId={match.id}
                                  initial={matchClocks.get(match.id) ?? null}
                                  size="small"
                                  showIdle
                                />
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  {match.status.replace(/_/g, " ")}
                                </span>
                              </div>

                              <form action={setMatchClockAction} className="flex flex-wrap items-end gap-1.5">
                                <input type="hidden" name="tenant_slug" value={tenantSlug} />
                                <input type="hidden" name="tournament_id" value={tournament.id} />
                                <input type="hidden" name="match_id" value={match.id} />

                                {match.status === "SCHEDULED" || match.status === "POSTPONED" ? (
                                  <>
                                    <Input
                                      name="start_minute"
                                      type="number"
                                      min={0}
                                      max={130}
                                      placeholder="Min"
                                      className="h-8 w-16 text-xs"
                                      aria-label="Starting minute"
                                    />
                                    <Button type="submit" name="phase" value="FIRST_HALF" size="sm" className="h-8">
                                      <Play className="h-3 w-3" /> Start clock
                                    </Button>
                                  </>
                                ) : null}

                                {match.status === "FIRST_HALF" ? (
                                  <Button type="submit" name="phase" value="HALF_TIME" size="sm" variant="secondary" className="h-8">
                                    <Pause className="h-3 w-3" /> Half time
                                  </Button>
                                ) : null}

                                {match.status === "HALF_TIME" ? (
                                  <Button type="submit" name="phase" value="SECOND_HALF" size="sm" className="h-8">
                                    <Play className="h-3 w-3" /> Start second half
                                  </Button>
                                ) : null}

                                {match.status === "SECOND_HALF" ? (
                                  <Button type="submit" name="phase" value="EXTRA_TIME" size="sm" variant="secondary" className="h-8">
                                    <Play className="h-3 w-3" /> Extra time
                                  </Button>
                                ) : null}

                                {match.status === "EXTRA_TIME" ? (
                                  <Button type="submit" name="phase" value="PENALTIES" size="sm" variant="secondary" className="h-8">
                                    Penalties
                                  </Button>
                                ) : null}

                                {["SECOND_HALF", "EXTRA_TIME", "PENALTIES"].includes(match.status) ? (
                                  <Button type="submit" name="phase" value="COMPLETED" size="sm" variant="outline" className="h-8">
                                    Full time
                                  </Button>
                                ) : null}

                                {match.status !== "SCHEDULED" ? (
                                  <Button type="submit" name="phase" value="RESET" size="sm" variant="ghost" className="h-8">
                                    <RotateCcw className="h-3 w-3" /> Reset
                                  </Button>
                                ) : null}
                              </form>

                              {LIVE_STATUSES.includes(match.status) ? (
                                <form action={setMatchClockAction} className="flex items-end gap-1.5">
                                  <input type="hidden" name="tenant_slug" value={tenantSlug} />
                                  <input type="hidden" name="tournament_id" value={tournament.id} />
                                  <input type="hidden" name="match_id" value={match.id} />
                                  <input type="hidden" name="phase" value="SET_MINUTE" />
                                  <Input
                                    name="minute"
                                    type="number"
                                    min={0}
                                    max={130}
                                    placeholder="Minute"
                                    className="h-8 w-20 text-xs"
                                    aria-label="Set match minute"
                                  />
                                  <Button type="submit" size="sm" variant="outline" className="h-8">
                                    Set minute
                                  </Button>
                                </form>
                              ) : null}
                            </div>
                          </details>

                          <form action={assignRefereeAction} className="flex items-center gap-1.5">
                            <input type="hidden" name="tenant_slug" value={tenantSlug} />
                            <input type="hidden" name="tournament_id" value={tournament.id} />
                            <input type="hidden" name="match_id" value={match.id} />
                            <Select
                              name="referee_id"
                              defaultValue={match.referee_id ?? ""}
                              className="h-8 flex-1 text-xs"
                            >
                              <option value="">Unassigned</option>
                              {referees.map((referee) => (
                                <option key={referee.id} value={referee.id}>
                                  {referee.name}
                                </option>
                              ))}
                            </Select>
                            <Button type="submit" size="sm" variant="outline" className="h-8">
                              <Flag className="h-3 w-3" /> Set
                            </Button>
                          </form>

                          <details className="lg:col-span-1">
                            <summary className="cursor-pointer list-none text-[11px] font-semibold text-muted-foreground hover:text-foreground">
                              Kick-off &amp; venue
                            </summary>
                            <form action={updateMatchMetaAction} className="mt-1.5 space-y-1.5">
                              <input type="hidden" name="tenant_slug" value={tenantSlug} />
                              <input type="hidden" name="tournament_id" value={tournament.id} />
                              <input type="hidden" name="match_id" value={match.id} />
                              <Input
                                name="kickoff_time"
                                type="datetime-local"
                                defaultValue={toLocalInput(match.kickoff_time)}
                                className="h-8 text-xs"
                              />
                              <Select
                                name="venue_id"
                                defaultValue={match.venue_id ?? ""}
                                className="h-8 text-xs"
                              >
                                <option value="">No venue</option>
                                {(venues ?? []).map((venue) => (
                                  <option key={venue.id} value={venue.id}>
                                    {venue.name}
                                  </option>
                                ))}
                              </Select>
                              <Select
                                name="status"
                                defaultValue={
                                  match.status === "POSTPONED" ? "POSTPONED" : "SCHEDULED"
                                }
                                className="h-8 text-xs"
                              >
                                <option value="SCHEDULED">Scheduled</option>
                                <option value="POSTPONED">Postponed</option>
                              </Select>
                              <div className="flex justify-end">
                                <Button type="submit" size="sm" variant="outline" className="h-8">
                                  Save fixture
                                </Button>
                              </div>
                            </form>
                          </details>

                          <details>
                            <summary className="cursor-pointer list-none text-[11px] font-semibold text-muted-foreground hover:text-foreground">
                              Correct result
                            </summary>
                            <form
                              action={correctResultAction}
                              className="mt-1.5 flex flex-wrap items-end gap-1.5"
                            >
                              <input type="hidden" name="tenant_slug" value={tenantSlug} />
                              <input type="hidden" name="tournament_id" value={tournament.id} />
                              <input type="hidden" name="match_id" value={match.id} />
                              <div className="space-y-1">
                                <Label className="text-[9px]">Home</Label>
                                <Input
                                  name="home_score"
                                  type="number"
                                  min={0}
                                  max={99}
                                  defaultValue={match.home_score}
                                  className="h-8 w-14 text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[9px]">Away</Label>
                                <Input
                                  name="away_score"
                                  type="number"
                                  min={0}
                                  max={99}
                                  defaultValue={match.away_score}
                                  className="h-8 w-14 text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[9px]">Pens H</Label>
                                <Input
                                  name="home_penalties"
                                  type="number"
                                  min={0}
                                  max={99}
                                  defaultValue={match.home_penalties ?? ""}
                                  className="h-8 w-14 text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[9px]">Pens A</Label>
                                <Input
                                  name="away_penalties"
                                  type="number"
                                  min={0}
                                  max={99}
                                  defaultValue={match.away_penalties ?? ""}
                                  className="h-8 w-14 text-xs"
                                />
                              </div>
                              <Button type="submit" size="sm" className="h-8">
                                Save
                              </Button>
                            </form>
                          </details>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* TABLES & BRACKET                                                  */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="standings" className="space-y-5">
          {groupStages.length === 0 ? (
            <EmptyState
              icon={<ListOrdered className="h-5 w-5" />}
              title="No group tables"
              description="Group tables appear automatically as soon as teams are drawn into groups and results come in."
            />
          ) : (
            groupStages.map((stage) => {
              const rows = [...(standingsByStage.get(stage.id) ?? [])].sort(
                (a, b) =>
                  b.points - a.points ||
                  b.goal_difference - a.goal_difference ||
                  b.goals_for - a.goals_for,
              );

              return (
                <Card key={stage.id}>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>{stage.name}</CardTitle>
                    <Badge variant="info">top {stage.qualifiers_count} qualify</Badge>
                  </CardHeader>
                  <CardContent className="p-0">
                    {rows.length === 0 ? (
                      <p className="p-5 text-sm text-muted-foreground">
                        No teams assigned to this group yet.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th className="w-8 px-3 py-2">#</th>
                            <th className="px-3 py-2">Team</th>
                            <th className="px-2 py-2 text-center">P</th>
                            <th className="px-2 py-2 text-center">W</th>
                            <th className="px-2 py-2 text-center">D</th>
                            <th className="px-2 py-2 text-center">L</th>
                            <th className="px-2 py-2 text-center">GF</th>
                            <th className="px-2 py-2 text-center">GA</th>
                            <th className="px-2 py-2 text-center">GD</th>
                            <th className="px-2 py-2 text-center font-bold">Pts</th>
                            <th className="px-3 py-2">Form</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, index) => {
                            const team = teamById.get(row.team_id);
                            const qualifying = index < stage.qualifiers_count;
                            return (
                              <tr
                                key={row.id}
                                className={
                                  qualifying
                                    ? "border-l-2 border-l-emerald-500 border-b last:border-b-0"
                                    : "border-b last:border-b-0"
                                }
                              >
                                <td className="px-3 py-2 text-xs text-muted-foreground">
                                  {index + 1}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <Crest
                                      name={team?.name ?? "Team"}
                                      logoUrl={team?.logo_url}
                                      color={team?.home_kit_color ?? "#94A3B8"}
                                      size="sm"
                                    />
                                    <span className="font-medium">
                                      {team?.name ?? "Unknown team"}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-center tabular-nums">{row.played}</td>
                                <td className="px-2 py-2 text-center tabular-nums">{row.won}</td>
                                <td className="px-2 py-2 text-center tabular-nums">{row.drawn}</td>
                                <td className="px-2 py-2 text-center tabular-nums">{row.lost}</td>
                                <td className="px-2 py-2 text-center tabular-nums">
                                  {row.goals_for}
                                </td>
                                <td className="px-2 py-2 text-center tabular-nums">
                                  {row.goals_against}
                                </td>
                                <td className="px-2 py-2 text-center tabular-nums">
                                  {row.goal_difference > 0 ? "+" : ""}
                                  {row.goal_difference}
                                </td>
                                <td className="px-2 py-2 text-center font-bold tabular-nums">
                                  {row.points}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex gap-1">
                                    {(row.form ?? []).slice(0, 5).map((result, formIndex) => (
                                      <span
                                        key={`${row.id}-${formIndex}`}
                                        className={
                                          result === "W"
                                            ? "flex h-4 w-4 items-center justify-center rounded-sm bg-emerald-500 text-[9px] font-bold text-white"
                                            : result === "D"
                                              ? "flex h-4 w-4 items-center justify-center rounded-sm bg-slate-400 text-[9px] font-bold text-white"
                                              : "flex h-4 w-4 items-center justify-center rounded-sm bg-rose-500 text-[9px] font-bold text-white"
                                        }
                                      >
                                        {result}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}

          {knockoutStages.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" /> Knockout bracket
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Array.from(new Set(matchList.map((match) => match.round_name))).map((round) => {
                  const roundMatches = matchList.filter(
                    (match) => match.round_name === round && knockoutStages.some((s) => s.id === match.stage_id),
                  );
                  if (roundMatches.length === 0) return null;
                  return (
                    <div key={round} className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {round}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {roundMatches.map((match) => {
                          const home = match.home_team_id
                            ? teamById.get(match.home_team_id)
                            : null;
                          const away = match.away_team_id
                            ? teamById.get(match.away_team_id)
                            : null;
                          return (
                            <div key={match.id} className="rounded-lg border px-3 py-2 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-semibold">
                                  {home?.short_name ?? "TBD"}
                                </span>
                                <span className="tabular-nums">
                                  {match.home_score}–{match.away_score}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center justify-between gap-2">
                                <span className="truncate font-semibold">
                                  {away?.short_name ?? "TBD"}
                                </span>
                                <MatchStatusBadge status={match.status} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p>
                    No knockout stage yet. Build a bracket from the fixtures tab once the
                    group stage has produced qualifiers.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
