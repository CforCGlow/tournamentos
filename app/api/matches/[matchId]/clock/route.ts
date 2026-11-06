import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { readMatchClock } from "@/lib/match-clock";

export const dynamic = "force-dynamic";

/**
 * Public snapshot of a match clock.
 *
 * RLS on `matches` decides visibility first: a draft tournament, or a match in
 * one, returns 404 even though the clock document itself is read with the
 * service role.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const supabase = await createClient();

  const { data: match } = await supabase
    .from("matches")
    .select("id, status")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) {
    return NextResponse.json(
      { clock: null, status: null, serverNow: new Date().toISOString() },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const clock = await readMatchClock(matchId);

  return NextResponse.json(
    {
      // A snapshot from a previous status must not resurrect an old clock.
      clock: clock && clock.status === match.status ? clock : null,
      status: match.status,
      serverNow: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
