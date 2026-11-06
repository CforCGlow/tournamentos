import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const points = [
  "One workspace per organiser, isolated at the database level",
  "Automated draws, round-robin fixtures and knockout brackets",
  "Pitch-side referee console that works on a phone in sunlight",
  "Live public microsite with blinking scores and auto tables",
];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-slate-950 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 pitch-stripes opacity-60" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-sky-500/10" aria-hidden />

        <div className="relative p-10">
          <Logo className="[&_span]:text-white" href="/" />
        </div>

        <div className="relative max-w-md space-y-6 px-10">
          <h2 className="font-display text-3xl font-semibold leading-tight">
            The matchday control room for serious organisers.
          </h2>
          <ul className="space-y-3">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm text-white/70">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative p-10 text-xs text-white/40">
          <p>© {new Date().getFullYear()} LigaPro. Tournament operations, from draw to trophy.</p>
        </div>
      </aside>

      <main className="flex flex-col bg-background">
        <div className="flex items-center justify-between p-6 lg:justify-end">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle className="text-muted-foreground" />
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to site
            </Link>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-14">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-1.5">
              <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            {children}
            <div className="text-sm text-muted-foreground">{footer}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
