import { notFound } from "next/navigation";
import { requireMatchContext } from "@/lib/auth";
import { Crest } from "@/components/ui/crest";
import { EVENT_LABEL, MATCH_STATUS_LABEL, POSITION_LABEL } from "@/lib/constants";
import { formatDate, formatTime } from "@/lib/utils";
import type { MatchEventRow, PlayerRow } from "@/lib/database.types";

export const dynamic = "force-dynamic";

interface SheetPlayer {
  player: PlayerRow;
  slot: string | null;
  starting: boolean;
}

function SheetTable({
  players,
  title,
  emptyLabel,
}: {
  players: SheetPlayer[];
  title: string;
  emptyLabel: string;
}) {
  return (
    <div className="print-break">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {title}
      </p>
      {players.length === 0 ? (
        <p className="rounded border border-dashed px-3 py-3 text-[11px] text-slate-500">
          {emptyLabel}
        </p>
      ) : (
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-y bg-slate-100 text-left text-[9px] uppercase tracking-wide text-slate-600">
              <th className="w-8 px-2 py-1 text-center">#</th>
              <th className="px-2 py-1">Player</th>
              <th className="w-10 px-1 py-1">Pos</th>
              <th className="w-14 px-1 py-1">Slot</th>
              <th className="w-14 px-1 py-1 text-center">ID</th>
              <th className="w-24 px-2 py-1">Signature</th>
            </tr>
          </thead>
          <tbody>
            {players.map(({ player, slot }) => (
              <tr key={player.id} className="border-b">
                <td className="px-2 py-1 text-center font-semibold tabular-nums">
                  {player.jersey_number}
                </td>
                <td className="px-2 py-1">
                  {player.full_name}
                  {player.is_captain ? (
                    <span className="ml-1 rounded border border-slate-400 px-1 text-[8px] font-bold">
                      C
                    </span>
                  ) : null}
                  {player.is_suspended ? (
                    <span className="ml-1 text-[8px] font-bold uppercase text-rose-600">
                      suspended
                    </span>
                  ) : null}
                </td>
                <td className="px-1 py-1 text-[10px] text-slate-600">
                  {POSITION_LABEL[player.position]}
                </td>
                <td className="px-1 py-1 text-[10px] text-slate-600">{slot ?? "—"}</td>
                <td className="px-1 py-1 text-center text-[9px] text-slate-600">
                  {player.is_verified ? "OK" : player.id_document_url ? "Sent" : "—"}
                </td>
                <td className="px-2 py-1">
                  <span className="block h-4 border-b border-dotted border-slate-300" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default async function MatchSheetPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const ctx = await requireMatchContext(matchId);
  const { match } = ctx;

  const teamIds = [match.home_team_id, match.away_team_id].filter(
    (id): id is string => Boolean(id),
  );

  const [{ data: tournament }, { data: teams }, { data: venue }, { data: stage }, { data: lineups }, { data: players }, { data: events }] =
    await Promise.all([
      ctx.supabase
        .from("tournaments")
        .select("id, name, tenant_id, slug")
        .eq("id", match.tournament_id)
        .maybeSingle(),
      teamIds.length
        ? ctx.supabase
            .from("teams")
            .select("id, name, short_name, logo_url, home_kit_color, away_kit_color, manager_id")
            .in("id", teamIds)
        : Promise.resolve({ data: [] }),
      match.venue_id
        ? ctx.supabase.from("venues").select("name, address").eq("id", match.venue_id).maybeSingle()
        : Promise.resolve({ data: null }),
      ctx.supabase.from("stages").select("name").eq("id", match.stage_id).maybeSingle(),
      ctx.supabase.from("match_lineups").select("*").eq("match_id", match.id),
      teamIds.length
        ? ctx.supabase.from("players").select("*").in("team_id", teamIds).order("jersey_number")
        : Promise.resolve({ data: [] }),
      ctx.supabase.from("match_events").select("*").eq("match_id", match.id).order("minute"),
    ]);

  if (!tournament) notFound();

  const { data: tenant } = await ctx.supabase
    .from("tenants")
    .select("name")
    .eq("id", tournament.tenant_id)
    .maybeSingle();

  const teamRows = teams ?? [];
  const squad = players ?? [];
  const lineupRows = lineups ?? [];
  const eventRows = events ?? [];

  const home = match.home_team_id
    ? teamRows.find((team) => team.id === match.home_team_id) ?? null
    : null;
  const away = match.away_team_id
    ? teamRows.find((team) => team.id === match.away_team_id) ?? null
    : null;

  function sheetPlayers(teamId: string | null): { starting: SheetPlayer[]; bench: SheetPlayer[] } {
    if (!teamId) return { starting: [], bench: [] };
    const teamLineup = lineupRows.filter((row) => row.team_id === teamId);
    const built = teamLineup
      .map((row) => {
        const player = squad.find((entry) => entry.id === row.player_id);
        if (!player) return null;
        return { player, slot: row.formation_position, starting: row.is_starting };
      })
      .filter((entry): entry is SheetPlayer => Boolean(entry));

    return {
      starting: built.filter((entry) => entry.starting),
      bench: built.filter((entry) => !entry.starting),
    };
  }

  const homeSheet = sheetPlayers(match.home_team_id);
  const awaySheet = sheetPlayers(match.away_team_id);
  const eventPlayerIds = Array.from(
    new Set(
      eventRows
        .flatMap((event) => [event.player_id, event.secondary_player_id])
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const eventNames = new Map(
    squad.filter((player) => eventPlayerIds.includes(player.id)).map((player) => [player.id, player.full_name]),
  );
  const mvpName = match.mvp_player_id ? eventNames.get(match.mvp_player_id) ?? null : null;

  function eventLabel(event: MatchEventRow): string {
    const player = event.player_id ? eventNames.get(event.player_id) : null;
    const secondary = event.secondary_player_id
      ? eventNames.get(event.secondary_player_id)
      : null;
    const detail =
      event.event_type === "SUBSTITUTION"
        ? `${player ?? "—"} → ${secondary ?? "—"}`
        : player ?? "—";
    return `${EVENT_LABEL[event.event_type]} · ${detail}`;
  }

  return (
    <article className="space-y-5 text-slate-900">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-slate-900 pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {tenant?.name ?? "LigaPro"} · official match sheet
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold leading-tight">
            {tournament.name}
          </h1>
          <p className="mt-0.5 text-[12px] text-slate-600">
            {stage?.name ?? match.round_name} · {match.round_name} · match #{match.match_number}
          </p>
        </div>
        <div className="text-right text-[11px]">
          <p className="rounded border border-slate-300 px-2 py-1 font-semibold uppercase tracking-wide">
            {MATCH_STATUS_LABEL[match.status]}
          </p>
          <p className="mt-1 text-slate-600">{formatDate(match.kickoff_time)}</p>
          <p className="text-slate-600">Kick-off {formatTime(match.kickoff_time)}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 border-b pb-3 text-[11px] sm:grid-cols-4">
        {[
          { label: "Venue", value: venue ? `${venue.name}${venue.address ? `, ${venue.address}` : ""}` : "To be confirmed" },
          { label: "Referee", value: ctx.refereeName ?? "To be appointed" },
          { label: "Home team", value: home?.name ?? "TBD" },
          { label: "Away team", value: away?.name ?? "TBD" },
        ].map((item) => (
          <div key={item.label}>
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
              {item.label}
            </p>
            <p className="mt-0.5 font-medium leading-snug">{item.value}</p>
          </div>
        ))}
      </section>

      {match.status !== "SCHEDULED" && match.status !== "POSTPONED" ? (
        <section className="print-break rounded-lg border-2 border-slate-900 px-4 py-3">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="flex items-center gap-2">
              <Crest
                name={home?.name ?? "TBD"}
                logoUrl={home?.logo_url}
                color={home?.home_kit_color ?? "#94A3B8"}
                size="sm"
              />
              <div>
                <p className="text-sm font-bold leading-tight">{home?.name ?? "TBD"}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">
                  {home?.short_name ?? "Home"}
                </p>
              </div>
            </div>
            <div className="text-center">
              <p className="font-display text-3xl font-bold tabular-nums">
                {match.home_score} – {match.away_score}
              </p>
              {match.home_penalties !== null && match.away_penalties !== null ? (
                <p className="text-[10px] font-semibold text-slate-600">
                  penalties {match.home_penalties}–{match.away_penalties}
                </p>
              ) : null}
              <p className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">
                {MATCH_STATUS_LABEL[match.status]}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 text-right">
              <div>
                <p className="text-sm font-bold leading-tight">{away?.name ?? "TBD"}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">
                  {away?.short_name ?? "Away"}
                </p>
              </div>
              <Crest
                name={away?.name ?? "TBD"}
                logoUrl={away?.logo_url}
                color={away?.home_kit_color ?? "#94A3B8"}
                size="sm"
              />
            </div>
          </div>
          {mvpName ? (
            <p className="mt-2 border-t pt-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              Player of the match: {mvpName}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center gap-2 border-b pb-1.5">
            <Crest
              name={home?.name ?? "TBD"}
              logoUrl={home?.logo_url}
              color={home?.home_kit_color ?? "#94A3B8"}
              size="sm"
            />
            <div>
              <p className="text-sm font-bold leading-tight">{home?.name ?? "Home team TBD"}</p>
              <p className="text-[9px] uppercase tracking-wide text-slate-500">
                Home · kit {home?.home_kit_color ?? "—"}
              </p>
            </div>
          </div>
          <SheetTable
            title="Starting XI"
            players={homeSheet.starting}
            emptyLabel="No lineup submitted for this team."
          />
          <SheetTable
            title="Substitutes"
            players={homeSheet.bench}
            emptyLabel="No substitutes named."
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 border-b pb-1.5">
            <Crest
              name={away?.name ?? "TBD"}
              logoUrl={away?.logo_url}
              color={away?.home_kit_color ?? "#94A3B8"}
              size="sm"
            />
            <div>
              <p className="text-sm font-bold leading-tight">{away?.name ?? "Away team TBD"}</p>
              <p className="text-[9px] uppercase tracking-wide text-slate-500">
                Away · kit {away?.away_kit_color ?? "—"}
              </p>
            </div>
          </div>
          <SheetTable
            title="Starting XI"
            players={awaySheet.starting}
            emptyLabel="No lineup submitted for this team."
          />
          <SheetTable
            title="Substitutes"
            players={awaySheet.bench}
            emptyLabel="No substitutes named."
          />
        </section>
      </div>

      {eventRows.length > 0 ? (
        <section className="print-break">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Match events
          </p>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-y bg-slate-100 text-left text-[9px] uppercase tracking-wide text-slate-600">
                <th className="w-12 px-2 py-1">Min</th>
                <th className="w-16 px-2 py-1">Team</th>
                <th className="px-2 py-1">Event</th>
              </tr>
            </thead>
            <tbody>
              {eventRows.map((event) => (
                <tr key={event.id} className="border-b">
                  <td className="px-2 py-1 tabular-nums">
                    {event.minute}
                    {event.extra_minute ? `+${event.extra_minute}` : ""}&apos;
                  </td>
                  <td className="px-2 py-1 text-[10px] uppercase text-slate-600">
                    {event.team_id === match.home_team_id
                      ? home?.short_name ?? "Home"
                      : away?.short_name ?? "Away"}
                  </td>
                  <td className="px-2 py-1">{eventLabel(event)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="print-break grid grid-cols-2 gap-6 border-t-2 border-slate-900 pt-4 sm:grid-cols-3">
        {[
          "Referee signature",
          "Home captain signature",
          "Away captain signature",
        ].map((label) => (
          <div key={label}>
            <span className="block h-10 border-b border-slate-400" />
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {label}
            </p>
          </div>
        ))}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-[9px] uppercase tracking-wide text-slate-400">
        <span>Generated by LigaPro · {formatDate(new Date().toISOString(), true)}</span>
        <span>Match ID {match.id.slice(0, 8)}</span>
      </footer>
    </article>
  );
}
