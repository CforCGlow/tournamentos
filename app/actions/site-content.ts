"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import {
  DEFAULT_SITE_CONTENT,
  getSiteContent,
  mergeSiteContent,
  saveSiteContent,
  type SiteContent,
} from "@/lib/site-content";
import { fail, succeed, text, type ActionState } from "@/lib/actions";

/**
 * Rewrites the published home page copy. Superadmins only — the document is
 * platform-wide, so tenant admins never reach this action.
 */
export async function saveSiteContentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();

  const reset = text(formData, "intent") === "reset";
  const current = reset ? DEFAULT_SITE_CONTENT : await getSiteContent();
  const fallback = mergeSiteContent(current);

  // "Reset" ignores the posted fields and republishes the shipped wording.
  const values = reset ? new FormData() : formData;
  const read = (key: string, value: string) => {
    const submitted = text(values, key);
    return submitted.length ? submitted : value;
  };

  const next: SiteContent = {
    brand: {
      name: read("brand.name", fallback.brand.name),
      accent: read("brand.accent", fallback.brand.accent),
      tagline: read("brand.tagline", fallback.brand.tagline),
    },
    hero: {
      badge: read("hero.badge", fallback.hero.badge),
      title: read("hero.title", fallback.hero.title),
      titleAccent: read("hero.titleAccent", fallback.hero.titleAccent),
      description: read("hero.description", fallback.hero.description),
      primaryCta: read("hero.primaryCta", fallback.hero.primaryCta),
      secondaryCta: read("hero.secondaryCta", fallback.hero.secondaryCta),
      clientsLabel: read("hero.clientsLabel", fallback.hero.clientsLabel),
      tournamentsLabel: read("hero.tournamentsLabel",
        fallback.hero.tournamentsLabel,
      ),
    },
    loop: {
      title: read("loop.title", fallback.loop.title),
      entries: {
        label: read("loop.entries.label", fallback.loop.entries.label),
        hint: read("loop.entries.hint", fallback.loop.entries.hint),
      },
      fixtures: {
        label: read("loop.fixtures.label", fallback.loop.fixtures.label),
        hint: read("loop.fixtures.hint", fallback.loop.fixtures.hint),
      },
      scores: {
        label: read("loop.scores.label", fallback.loop.scores.label),
        hint: read("loop.scores.hint", fallback.loop.scores.hint),
      },
      table: {
        label: read("loop.table.label", fallback.loop.table.label),
        hint: read("loop.table.hint", fallback.loop.table.hint),
      },
    },
    tournaments: {
      eyebrow: read("tournaments.eyebrow", fallback.tournaments.eyebrow),
      title: read("tournaments.title", fallback.tournaments.title),
      description: read("tournaments.description", fallback.tournaments.description),
      cta: read("tournaments.cta", fallback.tournaments.cta),
      emptyTitle: read("tournaments.emptyTitle", fallback.tournaments.emptyTitle),
      emptyDescription: read("tournaments.emptyDescription",
        fallback.tournaments.emptyDescription,
      ),
      cardCta: read("tournaments.cardCta", fallback.tournaments.cardCta),
    },
    cta: {
      badge: read("cta.badge", fallback.cta.badge),
      title: read("cta.title", fallback.cta.title),
      description: read("cta.description", fallback.cta.description),
      button: read("cta.button", fallback.cta.button),
    },
    features: {
      eyebrow: read("features.eyebrow", fallback.features.eyebrow),
      title: read("features.title", fallback.features.title),
      description: read("features.description", fallback.features.description),
      items: fallback.features.items.map((item, index) => ({
        title: read(`features.${index}.title`, item.title),
        body: read(`features.${index}.body`, item.body),
      })),
    },
    footer: {
      tagline: read("footer.tagline", fallback.footer.tagline),
    },
  };

  try {
    await saveSiteContent(next);
  } catch (error) {
    return fail(
      error instanceof Error
        ? `Could not save the copy: ${error.message}`
        : "Could not save the copy. Please try again.",
    );
  }

  // The wordmark and tagline live in the shared layout, so every page under it
  // has to drop its cached render — not just the home page. Copy itself is read
  // per request, so the next render already sees the new document.
  revalidatePath("/", "layout");

  return succeed(
    reset ? "Home page copy reset to the default wording." : "Home page copy published.",
  );
}
