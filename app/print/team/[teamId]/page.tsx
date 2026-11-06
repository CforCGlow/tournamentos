import { notFound } from "next/navigation";
import { requireTeamContext } from "@/lib/auth";
import { Crest } from "@/components/ui/crest";
import { POSITION_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TeamSheetPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const ctx = await requireTeamContext(teamId);
  const { team } = ctx;

  const [{ data: tournament }, { data: stage }, { data: players }] = await Promise.all([
    ctx.supabase
      .from("tournaments")
      .select("id, name, slug, tenant_id, min_squad_size, max_squad_size, roster_locked")
      .eq("id", team.tournament_id)
      .maybeSingle(),
    team.stage_id
      ? ctx.supabase.from("stages").select("name").eq("id", team.stage_id).maybeSingle()
      : Promise.resolve({ data: null }),
    ctx.supabase.from("players").select("*").eq("team_id", team.id).order("jersey_number"),
  ]);

  if (!tournament) notFound();

  const [{ data: tenant }, { data: manager }] = await Promise.all([
    ctx.supabase.from("tenants").select("name").eq("id", tournament.tenant_id).maybeSingle(),
    ctx.supabase
      .from("public_profiles")
      .select("full_name")
      .eq("id", team.manager_id)
      .maybeSingle(),
  ]);

  const squad = players ?? [];
  const suspended = squad.filter((player) => player.is_suspended);
  const verified = squad.filter((player) => player.is_verified);

  return (
    <article className="space-y-5 text-slate-900">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-slate-900 pb-3">
        <div className="flex items-start gap-3">
          <Crest name={team.name} logoUrl={team.logo_url} color={team.home_kit_color} size="lg" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {tenant?.name ?? "LigaPro"} · squad registration sheet
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold leading-tight">{team.name}</h1>
            <p className="mt-0.5 text-[12px] text-slate-600">
              {tournament.name}
              {stage?.name ? ` · ${stage.name}` : ""} · code {team.short_name}
            </p>
          </div>
        </div>
        <div className="text-right text-[11px] text-slate-600">
          <p className="rounded border border-slate-300 px-2 py-1 font-semibold uppercase tracking-wide text-slate-900">
            {team.registration_status}
          </p>
          <p className="mt-1">Registered {formatDate(team.created_at)}</p>
          <p>Rosters {tournament.roster_locked ? "locked" : "open"}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 border-b pb-3 text-[11px] sm:grid-cols-4">
        {[
          { label: "Team manager", value: manager?.full_name ?? ctx.profile.full_name },
          { label: "Squad size", value: `${squad.length} of ${tournament.max_squad_size}` },
          { label: "ID verified", value: `${verified.length} of ${squad.length}` },
          { label: "Suspended", value: String(suspended.length) },
        ].map((item) => (
          <div key={item.label}>
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
              {item.label}
            </p>
            <p className="mt-0.5 font-medium leading-snug">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap items-center gap-4 border-b pb-3 text-[10px] uppercase tracking-wide text-slate-600">
        <span className="flex items-center gap-1.5">
          Home kit
          <span
            className="inline-block h-4 w-4 rounded-full border border-slate-300"
            style={{ backgroundColor: team.home_kit_color }}
          />
          {team.home_kit_color}
        </span>
        <span className="flex items-center gap-1.5">
          Away kit
          <span
            className="inline-block h-4 w-4 rounded-full border border-slate-300"
            style={{ backgroundColor: team.away_kit_color }}
          />
          {team.away_kit_color}
        </span>
        <span>Minimum squad {tournament.min_squad_size}</span>
        {squad.length < tournament.min_squad_size ? (
          <span className="font-bold text-rose-600">
            {tournament.min_squad_size - squad.length} short of the minimum
          </span>
        ) : null}
      </section>

      <section>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Registered players
        </p>
        {squad.length === 0 ? (
          <p className="rounded border border-dashed px-3 py-6 text-center text-[11px] text-slate-500">
            No players registered yet.
          </p>
        ) : (
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-y bg-slate-100 text-left text-[9px] uppercase tracking-wide text-slate-600">
                <th className="w-8 px-2 py-1 text-center">#</th>
                <th className="px-2 py-1">Player name</th>
                <th className="w-16 px-1 py-1">Position</th>
                <th className="w-20 px-1 py-1">Date of birth</th>
                <th className="w-16 px-1 py-1 text-center">ID check</th>
                <th className="w-20 px-1 py-1 text-center">Eligibility</th>
                <th className="w-28 px-2 py-1">Signature</th>
              </tr>
            </thead>
            <tbody>
              {squad.map((player) => (
                <tr key={player.id} className="border-b">
                  <td className="px-2 py-1 text-center font-semibold tabular-nums">
                    {player.jersey_number}
                  </td>
                  <td className="px-2 py-1">
                    {player.full_name}
                    {player.is_captain ? (
                      <span className="ml-1 rounded border border-slate-400 px-1 text-[8px] font-bold">
                        CAPTAIN
                      </span>
                    ) : null}
                  </td>
                  <td className="px-1 py-1 text-[10px] text-slate-600">
                    {POSITION_LABEL[player.position]}
                  </td>
                  <td className="px-1 py-1 text-[10px] tabular-nums text-slate-600">
                    {player.date_of_birth ? formatDate(player.date_of_birth) : "—"}
                  </td>
                  <td className="px-1 py-1 text-center text-[10px] text-slate-600">
                    {player.is_verified ? "Verified" : player.id_document_url ? "Submitted" : "—"}
                  </td>
                  <td className="px-1 py-1 text-center text-[9px] font-semibold uppercase">
                    {player.is_suspended ? (
                      <span className="text-rose-600">Suspended</span>
                    ) : (
                      <span className="text-emerald-700">Eligible</span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <span className="block h-4 border-b border-dotted border-slate-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {suspended.length > 0 ? (
        <section className="print-break rounded border border-rose-300 bg-rose-50 px-3 py-2 text-[10px] text-rose-900">
          <p className="font-bold uppercase tracking-wide">Outstanding suspensions</p>
          <ul className="mt-1 space-y-0.5">
            {suspended.map((player) => (
              <li key={player.id}>
                #{player.jersey_number} {player.full_name} —{" "}
                {player.red_cards_accumulated
                  ? "red card"
                  : `${player.yellow_cards_accumulated} yellow cards`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="print-break grid grid-cols-2 gap-6 border-t-2 border-slate-900 pt-4 sm:grid-cols-3">
        {["Team manager signature", "Organiser signature", "Date"].map((label) => (
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
        <span>Team ID {team.id.slice(0, 8)}</span>
      </footer>
    </article>
  );
}
