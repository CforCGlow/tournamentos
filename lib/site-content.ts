import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Home page copy lives in a single JSON document in a public storage bucket.
 * Keeping it out of Postgres means the platform schema stays at 12 tables while
 * superadmins can still rewrite every marketing line without a deploy.
 */
export const SITE_CONTENT_BUCKET = "site-content";
export const SITE_CONTENT_FILE = "home.json";

export interface LoopStageCopy {
  label: string;
  hint: string;
}

export interface FeatureCopy {
  title: string;
  body: string;
}

export interface SiteContent {
  brand: {
    name: string;
    accent: string;
    tagline: string;
  };
  hero: {
    badge: string;
    title: string;
    titleAccent: string;
    description: string;
    primaryCta: string;
    secondaryCta: string;
    clientsLabel: string;
    tournamentsLabel: string;
  };
  loop: {
    title: string;
    entries: LoopStageCopy;
    fixtures: LoopStageCopy;
    scores: LoopStageCopy;
    table: LoopStageCopy;
  };
  tournaments: {
    eyebrow: string;
    title: string;
    description: string;
    cta: string;
    emptyTitle: string;
    emptyDescription: string;
    cardCta: string;
  };
  cta: {
    badge: string;
    title: string;
    description: string;
    button: string;
  };
  features: {
    eyebrow: string;
    title: string;
    description: string;
    items: FeatureCopy[];
  };
  footer: {
    tagline: string;
  };
}

export const DEFAULT_SITE_CONTENT: SiteContent = {
  brand: {
    name: "Liga",
    accent: "Pro",
    tagline: "Tournament OS",
  },
  hero: {
    badge: "From registration to the final whistle",
    title: "Run the whole tournament.",
    titleAccent: "Not just the spreadsheet.",
    description:
      "Take entries, verify squads, draw the groups and build every fixture. Referees score from the touchline and your fans follow live scores, tables and brackets from the first matchday to the trophy.",
    primaryCta: "Create your workspace",
    secondaryCta: "Browse tournaments",
    clientsLabel: "Clients served",
    tournamentsLabel: "Tournaments hosted",
  },
  loop: {
    title: "One system for every stage of a football tournament.",
    entries: {
      label: "Entries",
      hint: "Teams enter online and squads are verified.",
    },
    fixtures: {
      label: "Fixtures",
      hint: "The draw, venues and kick-off times are set.",
    },
    scores: {
      label: "Scores",
      hint: "Referees record every goal and card as it happens.",
    },
    table: {
      label: "Table",
      hint: "Standings and brackets update themselves.",
    },
  },
  tournaments: {
    eyebrow: "Public portal",
    title: "Competitions open to the public",
    description:
      "Every tournament publishes its own public page — fixtures, live scores, tables, brackets and player leaderboards.",
    cta: "List your tournament",
    emptyTitle: "No public tournaments yet",
    emptyDescription: "Once an organiser publishes a competition it appears here automatically.",
    cardCta: "Open tournament",
  },
  cta: {
    badge: "Built for every competition",
    title: "From first whistle to final table.",
    description:
      "Launch a competition in minutes. Your teams register themselves, the draw and fixtures are built for you, and the table keeps itself current.",
    button: "Create an account",
  },
  features: {
    eyebrow: "Features",
    title: "Everything football tournament needs",
    description:
      "From the first entry to the final table — one place for organisers, referees, teams and fans.",
    items: [
      {
        title: "Online registrations",
        body: "Teams enter themselves, submit their squads and upload payment proof without a spreadsheet.",
      },
      {
        title: "Entry fee tracking",
        body: "See who has paid, who is pending verification and who still owes — per team, per competition.",
      },
      {
        title: "Fixtures & venues",
        body: "Build matchdays, assign grounds and publish every kick-off the moment the draw is ready.",
      },
      {
        title: "Live match scoring",
        body: "Referees record goals, cards and the clock from the touchline, and fans see it instantly.",
      },
      {
        title: "Tables & brackets",
        body: "League standings and knockout paths recalculate automatically after every result.",
      },
      {
        title: "Public pages & sheets",
        body: "Every tournament gets a public site, plus printable team sheets and match reports.",
      },
    ],
  },
  footer: {
    tagline:
      "Run football competitions end to end — team entry, draws and fixtures, live refereeing and a public site your fans can follow.",
  },
};

const MAX_LENGTH = {
  short: 72,
  medium: 140,
  long: 420,
  body: 220,
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, max);
}

function stage(value: unknown, fallback: LoopStageCopy): LoopStageCopy {
  const source = asRecord(value);
  return {
    label: str(source.label, fallback.label, MAX_LENGTH.short),
    hint: str(source.hint, fallback.hint, MAX_LENGTH.medium),
  };
}

/** Merges whatever is stored with the defaults so a partial file never breaks the page. */
export function mergeSiteContent(raw: unknown): SiteContent {
  const defaults = DEFAULT_SITE_CONTENT;
  const root = asRecord(raw);
  const brand = asRecord(root.brand);
  const hero = asRecord(root.hero);
  const loop = asRecord(root.loop);
  const tournaments = asRecord(root.tournaments);
  const cta = asRecord(root.cta);
  const features = asRecord(root.features);
  const footer = asRecord(root.footer);
  const storedItems = Array.isArray(features.items) ? features.items : [];

  return {
    brand: {
      name: str(brand.name, defaults.brand.name, MAX_LENGTH.short),
      accent: str(brand.accent, defaults.brand.accent, MAX_LENGTH.short),
      tagline: str(brand.tagline, defaults.brand.tagline, MAX_LENGTH.medium),
    },
    hero: {
      badge: str(hero.badge, defaults.hero.badge, MAX_LENGTH.medium),
      title: str(hero.title, defaults.hero.title, MAX_LENGTH.medium),
      titleAccent: str(hero.titleAccent, defaults.hero.titleAccent, MAX_LENGTH.medium),
      description: str(hero.description, defaults.hero.description, MAX_LENGTH.long),
      primaryCta: str(hero.primaryCta, defaults.hero.primaryCta, MAX_LENGTH.short),
      secondaryCta: str(hero.secondaryCta, defaults.hero.secondaryCta, MAX_LENGTH.short),
      clientsLabel: str(hero.clientsLabel, defaults.hero.clientsLabel, MAX_LENGTH.short),
      tournamentsLabel: str(
        hero.tournamentsLabel,
        defaults.hero.tournamentsLabel,
        MAX_LENGTH.short,
      ),
    },
    loop: {
      title: str(loop.title, defaults.loop.title, MAX_LENGTH.medium),
      entries: stage(loop.entries, defaults.loop.entries),
      fixtures: stage(loop.fixtures, defaults.loop.fixtures),
      scores: stage(loop.scores, defaults.loop.scores),
      table: stage(loop.table, defaults.loop.table),
    },
    tournaments: {
      eyebrow: str(tournaments.eyebrow, defaults.tournaments.eyebrow, MAX_LENGTH.short),
      title: str(tournaments.title, defaults.tournaments.title, MAX_LENGTH.medium),
      description: str(
        tournaments.description,
        defaults.tournaments.description,
        MAX_LENGTH.long,
      ),
      cta: str(tournaments.cta, defaults.tournaments.cta, MAX_LENGTH.short),
      emptyTitle: str(tournaments.emptyTitle, defaults.tournaments.emptyTitle, MAX_LENGTH.medium),
      emptyDescription: str(
        tournaments.emptyDescription,
        defaults.tournaments.emptyDescription,
        MAX_LENGTH.long,
      ),
      cardCta: str(tournaments.cardCta, defaults.tournaments.cardCta, MAX_LENGTH.short),
    },
    cta: {
      badge: str(cta.badge, defaults.cta.badge, MAX_LENGTH.medium),
      title: str(cta.title, defaults.cta.title, MAX_LENGTH.medium),
      description: str(cta.description, defaults.cta.description, MAX_LENGTH.long),
      button: str(cta.button, defaults.cta.button, MAX_LENGTH.short),
    },
    features: {
      eyebrow: str(features.eyebrow, defaults.features.eyebrow, MAX_LENGTH.short),
      title: str(features.title, defaults.features.title, MAX_LENGTH.medium),
      description: str(features.description, defaults.features.description, MAX_LENGTH.long),
      items: defaults.features.items.map((fallback, index) => {
        const item = asRecord(storedItems[index]);
        return {
          title: str(item.title, fallback.title, MAX_LENGTH.short),
          body: str(item.body, fallback.body, MAX_LENGTH.body),
        };
      }),
    },
    footer: {
      tagline: str(footer.tagline, defaults.footer.tagline, MAX_LENGTH.long),
    },
  };
}

function storageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Reads the published document with the service role. The authenticated storage
 * endpoint is used on purpose: the public object URL sits behind a CDN that can
 * keep serving the previous copy for a few minutes after a publish.
 *
 * `cache` only memoises the read for the current render, so one page render
 * shares a single download (header logo + page copy) while a publish is visible
 * on the very next request.
 */
const downloadSiteContent = cache(async (): Promise<unknown> => {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !key) {
    throw new Error("Supabase storage credentials are missing.");
  }

  // The cache-busting query is deliberate: storage sits behind a CDN that can
  // hold the previous document for a few seconds after an upload, and the whole
  // point of this read is that a publish is visible straight away.
  const url = `${base.replace(/\/$/, "")}/storage/v1/object/authenticated/${SITE_CONTENT_BUCKET}/${SITE_CONTENT_FILE}?v=${Date.now()}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`The home page copy could not be read (${response.status}).`);
  }

  return (await response.json()) as unknown;
});

/**
 * Read of the published copy. Any failure (missing bucket, offline storage)
 * silently falls back to the shipped defaults so the landing page is never
 * blank.
 */
export async function getSiteContent(): Promise<SiteContent> {
  if (!storageConfigured()) return mergeSiteContent(null);

  try {
    return mergeSiteContent(await downloadSiteContent());
  } catch {
    return mergeSiteContent(null);
  }
}

export async function saveSiteContent(content: SiteContent): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(SITE_CONTENT_BUCKET)
    .upload(SITE_CONTENT_FILE, JSON.stringify(mergeSiteContent(content), null, 2), {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    });

  if (error) {
    throw new Error(error.message);
  }
}
