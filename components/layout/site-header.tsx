import Link from "next/link";
import { LogIn, LayoutDashboard } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { getSession } from "@/lib/auth";
import { signOutAction } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";

export async function SiteHeader() {
  const { profile } = await getSession();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container flex h-16 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4 lg:gap-8">
          <Logo className="shrink-0" />
          <nav className="hidden items-center gap-5 text-sm font-medium text-muted-foreground sm:flex lg:gap-6">
            <Link className="transition-colors hover:text-foreground" href="/#tournaments">
              Tournaments
            </Link>
            <Link className="transition-colors hover:text-foreground" href="/#features">
              Features
            </Link>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle className="text-muted-foreground" />
          {profile ? (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
                <Link href="/portal">
                  <LayoutDashboard className="h-4 w-4" />
                  Workspace
                </Link>
              </Button>
              <form action={signOutAction}>
                <Button type="submit" variant="outline" size="sm">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="px-2 sm:px-3">
                <Link href="/login" aria-label="Sign in">
                  <LogIn className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign in</span>
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
