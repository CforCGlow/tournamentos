import Link from "next/link";
import { CalendarX2, ShieldAlert } from "lucide-react";
import { createAdminClient } from "@/utils/supabase/admin";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export const dynamic = "force-dynamic";

export default async function SuspendedPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const { tenant: slug } = await searchParams;
  let name = "this workspace";

  if (slug) {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("tenants")
        .select("name")
        .eq("slug", slug)
        .maybeSingle();
      if (data?.name) name = data.name;
    } catch {
      // Public page must render even without service credentials.
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-surface px-6 py-16">
      <Logo />

      <div className="w-full max-w-lg space-y-5 rounded-xl border bg-card p-8 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <ShieldAlert className="h-6 w-6" />
        </span>

        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold">Workspace unavailable</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{name}</span> has been paused by
            the platform owner, so the organiser console is locked. Public results return as
            soon as it is reactivated.
          </p>
        </div>

        <div className="rounded-lg border border-dashed bg-surface px-4 py-3 text-left text-xs text-muted-foreground">
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <CalendarX2 className="h-3.5 w-3.5" /> What happens next
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Your fixtures, squads and results are safe — nothing is deleted.</li>
            <li>Once the platform owner reactivates the workspace, access returns instantly.</li>
            <li>Contact the LigaPro support desk if you need it restored sooner.</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild variant="outline">
            <Link href="/">Back to LigaPro</Link>
          </Button>
          <Button asChild>
            <Link href="/portal">Check my account</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
