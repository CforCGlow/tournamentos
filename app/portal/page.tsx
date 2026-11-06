import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { requireProfile, resolveHome } from "@/lib/auth";
import { Logo } from "@/components/brand/logo";
import { CreateWorkspaceForm } from "@/components/portal/create-workspace-form";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const target = await resolveHome();
  if (target !== "/portal") redirect(target);

  const { profile } = await requireProfile();

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="border-b bg-background">
        <div className="container flex h-16 items-center justify-between">
          <Logo />
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to site
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-sm">
          <div className="space-y-2 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-emerald-700">
              <Trophy className="h-5 w-5" />
            </span>
            <h1 className="font-display text-2xl font-semibold">Create your workspace</h1>
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{profile.email}</span>.
              Set up a competition workspace — free, unlimited and ready in seconds.
            </p>
          </div>

          <CreateWorkspaceForm />

          <p className="text-center text-xs text-muted-foreground">
            Just here to enter a team?{" "}
            <Link href="/#tournaments" className="font-semibold text-primary hover:underline">
              Browse tournaments
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
