import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export function SiteFooter({ tagline, brandName }: { tagline?: string; brandName?: string }) {
  return (
    <footer className="border-t bg-surface">
      <div className="container grid gap-8 py-12 sm:grid-cols-2 md:grid-cols-4">
        <div className="space-y-3 sm:col-span-2">
          <Logo />
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {tagline ??
              "Run football competitions end to end — team entry, draws and fixtures, live refereeing and a public site your fans can follow."}
          </p>
        </div>

        <div className="space-y-3 text-sm">
          <p className="font-semibold">Product</p>
          <ul className="space-y-2 text-muted-foreground">
            <li>
              <Link className="hover:text-foreground" href="/#features">
                Features
              </Link>
            </li>
            <li>
              <Link className="hover:text-foreground" href="/#tournaments">
                Live tournaments
              </Link>
            </li>
            <li>
              <Link className="hover:text-foreground" href="/register">
                Create a workspace
              </Link>
            </li>
          </ul>
        </div>

        <div className="space-y-3 text-sm">
          <p className="font-semibold">Account</p>
          <ul className="space-y-2 text-muted-foreground">
            <li>
              <Link className="hover:text-foreground" href="/login">
                Sign in
              </Link>
            </li>
            <li>
              <Link className="hover:text-foreground" href="/register">
                Create an account
              </Link>
            </li>
            <li>
              <Link className="hover:text-foreground" href="/portal">
                My workspace
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t">
        <div className="container flex flex-col items-center justify-between gap-2 py-5 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} {brandName ?? "LigaPro"}. All rights reserved.</p>
          <p>Tournament operations, from draw to trophy.</p>
        </div>
      </div>
    </footer>
  );
}
