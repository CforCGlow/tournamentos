import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Coins,
  FileText,
  IdCard,
  Mail,
  Phone,
  Send,
  ShieldAlert,
  UserRound,
  Users,
} from "lucide-react";
import { requireTournament } from "@/lib/auth";
import { signedUrl } from "@/lib/storage";
import { approveTeamAction, rejectTeamAction, verifyPaymentAction } from "@/app/actions/tournaments";
import { BackLink } from "@/components/layout/back-link";
import { FlashMessage } from "@/components/layout/flash-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crest } from "@/components/ui/crest";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaymentBadge, RegistrationBadge } from "@/components/ui/status-badge";
import { assessTeamReadiness } from "@/lib/team-readiness";
import { getTeamSubmission } from "@/lib/team-submission";
import { getTournamentSettings, missingRequiredFields } from "@/lib/tournament-settings";
import { readTeamProfile } from "@/lib/team-profile";
import { POSITION_LABEL } from "@/lib/constants";
import { formatDate, formatMoney, pluralize } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OrganiserTeamReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; tournamentId: string; teamId: string }>;
  searchParams: Promise<{ flash?: string; error?: string }>;
}) {
  const { tenantSlug, tournamentId, teamId } = await params;
  const query = await searchParams;
  const ctx = await requireTournament(tenantSlug, tournamentId);
  const { tournament, supabase } = ctx;

  const { data: team } = await supabase
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .eq("tournament_id", tournament.id)
    .maybeSingle();

  if (!team) notFound();

  const [{ data: players }, settings, profile, submission, { data: manager }] = await Promise.all([
    supabase
      .from("players")
      .select("*")
      .eq("team_id", team.id)
      .order("jersey_number"),
    getTournamentSettings(tournament.id),
    readTeamProfile(team.id),
    getTeamSubmission(team.id),
    supabase.from("public_profiles").select("full_name").eq("id", team.manager_id).maybeSingle(),
  ]);

  const squad = players ?? [];
  const missingFields = missingRequiredFields(settings, profile.fields);
  const readiness = assessTeamReadiness({
    team,
    squadSize: squad.length,
    minSquadSize: tournament.min_squad_size,
    registrationFee: Number(tournament.registration_fee),
    players: squad,
    requireIdDocument: settings.requireIdDocument,
    requirePlayerPhoto: settings.requirePlayerPhoto,
    missingFields,
  });
  const canApprove = Boolean(submission) && readiness.ready;

  const proofUrl = team.payment_proof_url
    ? await signedUrl("payment-proofs", team.payment_proof_url)
    : null;

  const idUrls = new Map<string, string>();
  for (const player of squad) {
    if (player.id_document_url) {
      const url = await signedUrl("id-documents", player.id_document_url);
      if (url) idUrls.set(player.id, url);
    }
  }

  const back = `/dashboard/${tenantSlug}/tournaments/${tournament.id}`;

  return (
    <div>
      <FlashMessage flash={query.flash} error={query.error} />
      <BackLink href={back} label="Back to tournament" />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Crest name={team.name} logoUrl={team.logo_url} color={team.home_kit_color} size="lg" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              Team submission
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight">{team.name}</h1>
              <Badge variant="outline">{team.short_name}</Badge>
              <RegistrationBadge status={team.registration_status} />
              <PaymentBadge status={team.payment_status} />
              {submission?.changesPending ? (
                <Badge variant="warning" className="uppercase tracking-wide whitespace-nowrap">
                  changes pending
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {manager?.full_name ?? "Manager"} · {pluralize(squad.length, "player")} ·{" "}
              {submission
                ? `submitted ${formatDate(submission.submittedAt, true)}`
                : "not submitted yet"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/${tournament.slug}/teams/${team.id}`} target="_blank">
              Public profile <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Submitted squad
              </CardTitle>
              <Badge variant="neutral">
                {squad.length} / {tournament.max_squad_size}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {squad.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No players have been added yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="w-14 px-4 py-3 text-center">#</th>
                        <th className="px-3 py-3">Player</th>
                        <th className="px-3 py-3">Position</th>
                        <th className="px-3 py-3">Documents</th>
                        <th className="px-4 py-3">Season</th>
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
                                  {player.date_of_birth
                                    ? formatDate(player.date_of_birth)
                                    : "No date of birth"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">
                              {POSITION_LABEL[player.position]}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {player.photo_url ? (
                                <Badge variant="success">photo</Badge>
                              ) : settings.requirePlayerPhoto ? (
                                <Badge variant="danger">no photo</Badge>
                              ) : (
                                <Badge variant="neutral">no photo</Badge>
                              )}
                              {player.is_verified ? (
                                <Badge variant="success">ID verified</Badge>
                              ) : player.id_document_url ? (
                                <Badge variant="warning">ID pending</Badge>
                              ) : settings.requireIdDocument ? (
                                <Badge variant="danger">no ID</Badge>
                              ) : (
                                <Badge variant="neutral">no ID</Badge>
                              )}
                            </div>
                            {idUrls.get(player.id) ? (
                              <a
                                href={idUrls.get(player.id)}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                              >
                                <IdCard className="h-3 w-3" /> Open ID
                              </a>
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5 text-[11px] text-muted-foreground">
                            {player.goals_count}G · {player.assists_count}A ·{" "}
                            {player.yellow_cards_accumulated}Y
                            {player.red_cards_accumulated ? ` · ${player.red_cards_accumulated}R` : ""}
                            {player.is_suspended ? (
                              <span className="mt-1 flex items-center gap-1 font-semibold text-rose-600">
                                <ShieldAlert className="h-3 w-3" /> suspended
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <UserRound className="h-4 w-4 text-secondary" /> Coach & registration information
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-surface/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Coach
                  </p>
                  <p className="mt-1 font-medium">{profile.coachName ?? "Not provided"}</p>
                  {profile.coachPhone ? (
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Phone className="h-3 w-3" /> {profile.coachPhone}
                    </p>
                  ) : null}
                  {profile.coachEmail ? (
                    <p className="mt-1 flex items-center gap-1.5 break-all text-[11px] text-muted-foreground">
                      <Mail className="h-3 w-3" /> {profile.coachEmail}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-lg border bg-surface/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Entry details
                  </p>
                  {settings.fields.length === 0 ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      This tournament asks for no extra fields.
                    </p>
                  ) : (
                    <ul className="mt-1 space-y-1.5">
                      {settings.fields.map((field) => (
                        <li key={field.id} className="flex items-start justify-between gap-3">
                          <span className="text-[11px] text-muted-foreground">{field.label}</span>
                          <span className="max-w-[60%] break-words text-right text-[11px] font-medium">
                            {profile.fields[field.id] ?? "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-surface/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Kit colours
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-4 w-4 rounded border"
                        style={{ backgroundColor: team.home_kit_color }}
                      />
                      Home {team.home_kit_color.toUpperCase()}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-4 w-4 rounded border"
                        style={{ backgroundColor: team.away_kit_color }}
                      />
                      Away {team.away_kit_color.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border bg-surface/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Registered
                  </p>
                  <p className="mt-1 text-[11px]">
                    {formatDate(team.created_at, true)} · {formatMoney(tournament.registration_fee)}{" "}
                    entry fee
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" /> Review
              </CardTitle>
              {team.registration_status === "APPROVED" ? (
                <Badge variant="success">approved</Badge>
              ) : submission ? (
                <Badge variant="success">submitted</Badge>
              ) : (
                <Badge variant="warning">not submitted</Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
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

              {!submission ? (
                <p className="rounded-md border border-dashed bg-surface/60 px-3 py-2 text-[11px] text-muted-foreground">
                  The manager has not submitted this team yet. Approval unlocks after they submit.
                </p>
              ) : null}

              {team.registration_status !== "APPROVED" ? (
                <form action={approveTeamAction} className="space-y-2">
                  <input type="hidden" name="tenant_slug" value={tenantSlug} />
                  <input type="hidden" name="tournament_id" value={tournament.id} />
                  <input type="hidden" name="team_id" value={team.id} />
                  <SubmitButton
                    className="w-full"
                    disabled={!canApprove}
                    pendingLabel="Approving…"
                  >
                    <BadgeCheck className="h-4 w-4" /> Approve team
                  </SubmitButton>
                  {!canApprove ? (
                    <p className="text-center text-[11px] text-muted-foreground">
                      {!submission
                        ? "Waiting for the manager submission."
                        : `Incomplete: ${readiness.missing.join(", ")}.`}
                    </p>
                  ) : null}
                </form>
              ) : (
                <p className="flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  This team is approved and appears in the draw.
                </p>
              )}

              {team.registration_status !== "REJECTED" ? (
                <details className="border-t pt-3">
                  <summary className="cursor-pointer list-none text-[11px] font-semibold text-muted-foreground hover:text-rose-600">
                    Reject this submission…
                  </summary>
                  <form action={rejectTeamAction} className="mt-2 space-y-2">
                    <input type="hidden" name="tenant_slug" value={tenantSlug} />
                    <input type="hidden" name="tournament_id" value={tournament.id} />
                    <input type="hidden" name="team_id" value={team.id} />
                    <Label htmlFor="reject-reason" className="text-[11px]">
                      Reason shown to the manager <span className="text-rose-600">*</span>
                    </Label>
                    <Input
                      id="reject-reason"
                      name="reason"
                      placeholder="e.g. Missing student ID for two players"
                      className="h-9 text-xs"
                      required
                    />
                    <Button type="submit" size="sm" variant="destructive" className="w-full">
                      Confirm rejection
                    </Button>
                  </form>
                </details>
              ) : team.rejection_reason ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">
                  Rejected: {team.rejection_reason}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-primary" /> Payment
              </CardTitle>
              <PaymentBadge status={team.payment_status} />
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Entry fee</span>
                <span className="font-display text-lg font-semibold">
                  {formatMoney(tournament.registration_fee)}
                </span>
              </div>

              {team.payment_transaction_id ? (
                <p className="rounded-md border bg-surface/60 px-3 py-2 font-mono text-[11px]">
                  Ref: {team.payment_transaction_id}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">No transfer reference provided.</p>
              )}

              {proofUrl ? (
                <a
                  href={proofUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  <FileText className="h-3.5 w-3.5" /> Open payment proof
                </a>
              ) : (
                <p className="text-[11px] text-muted-foreground">No proof uploaded.</p>
              )}

              {team.payment_status !== "PAID" ? (
                <form action={verifyPaymentAction}>
                  <input type="hidden" name="tenant_slug" value={tenantSlug} />
                  <input type="hidden" name="tournament_id" value={tournament.id} />
                  <input type="hidden" name="team_id" value={team.id} />
                  <SubmitButton size="sm" variant="outline" className="w-full" pendingLabel="Saving…">
                    <Coins className="h-3.5 w-3.5" /> Mark payment verified
                  </SubmitButton>
                </form>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Send className="h-4 w-4 text-secondary" /> Manager edits
            </CardHeader>
            <CardContent className="space-y-2 text-[11px] text-muted-foreground">
              <p>
                The manager can still edit this team. Every change raises a notification and marks
                the entry as awaiting review until you approve it again.
              </p>
              {submission?.reviewedAt ? (
                <p>Last reviewed {formatDate(submission.reviewedAt, true)}.</p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
