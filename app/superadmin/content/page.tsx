import Link from "next/link";
import { ExternalLink, Sparkles } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { PortalShell } from "@/components/layout/portal-shell";
import { SUPERADMIN_NAV } from "@/components/superadmin/superadmin-nav";
import { SiteContentForm } from "@/components/superadmin/site-content-form";
import { BackLink } from "@/components/layout/back-link";
import { getSiteContent } from "@/lib/site-content";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * Cheap fingerprint of the published document. It is used as a React key so the
 * editor remounts with the stored values after a reset — the fields are
 * uncontrolled, so a re-render alone would keep whatever the admin typed.
 */
function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return hash.toString(36);
}

export default async function SiteContentPage() {
  const ctx = await requireSuperAdmin();
  const content = await getSiteContent();
  const siteHost = (process.env.NEXT_PUBLIC_SITE_URL ?? "your public site").replace(
    /^https?:\/\//,
    "",
  );

  return (
    <PortalShell
      nav={SUPERADMIN_NAV}
      brandName="LigaPro Platform"
      brandSubtitle="SuperAdmin"
      userName={ctx.profile.full_name}
      userRole="Platform owner"
      publicHref="/"
    >
      <BackLink href="/superadmin" label="Platform overview" />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <Sparkles className="h-3 w-3" /> Home page
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
            Landing page copy
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every line of the public home page, editable in place. Changes appear on {siteHost} as
            soon as you publish.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/" target="_blank">
            Preview home page <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <SiteContentForm key={fingerprint(content)} content={content} />
    </PortalShell>
  );
}
