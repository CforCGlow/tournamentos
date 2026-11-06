# LigaPro

Multi-tenant B2B SaaS for football tournament and league operations. One deployment runs many
independent competitions: licensing and tenant provisioning for the platform owner, a full organiser
console, team registration and squad management, a pitch-side referee console, and a public
competition microsite with live scores.

Built with Next.js 15 (App Router, Server Components, Server Actions), TypeScript in strict mode,
Supabase (Postgres + Auth + Storage + Realtime + RLS), Tailwind CSS, shadcn-style primitives,
TanStack Query, React Hook Form/Zod and Lucide icons.

---

## Feature map

| Portal | Route | What it does |
| --- | --- | --- |
| Platform owner | `/superadmin` | KPI dashboard, workspace CRUD, suspension and reinstatement |
| Tournament admin | `/dashboard/[tenantSlug]` | Tournaments, stages, venues, entry/payment verification, pot draw, fixture generation, knockout bracket, referee assignment, score correction, printable sheets |
| Team manager | `/manager/[teamId]` | Entry payment proof, checklist-gated team submission, squad builder with unique shirt numbers and ID documents, fixture list, pitch lineup builder that blocks suspended players |
| Referee | `/referee` | Assigned fixtures, three-tap event logger, running clock, penalties, MVP, sign-off |
| Public | `/[tournamentSlug]` | Live ticker, fixtures/results, tables, bracket, player stats, team profiles, self-service entry |

Other routes: `/` marketing + live competition directory, `/login`, `/register`, `/portal` (role
router and self-serve workspace creation), `/suspended` (workspace paused).

### Domain rules enforced in the database

* **Multi-tenancy** — every tenant-owned row carries `tenant_id`; RLS helpers resolve membership
  (`is_tenant_member`, `is_tenant_admin`, `has_tenant_role`) and there is no cross-tenant read path.
* **Standings** — `fn_recalculate_group_standings` owns `standings`; wins/draws/losses, goals,
  goal difference, points and form are derived whenever a result is signed off. Never write the
  table directly.
* **Bracket** — `fn_advance_knockout_winner` writes the winner into `next_match_id` /
  `next_match_slot` when a knockout tie finishes, including penalty shootouts.
* **Live events** — `fn_process_match_event` is the single writer for the scoreboard, player
  career totals (goals, assists, cards), automatic suspensions and match status. Events are
  validated against the two teams in the match.
* **Registration** — `register_team(...)` is an atomic RPC: it creates the team, sets the payment
  state from the transaction reference and grants the caller `TEAM_MANAGER` on the tenant. The
  manager then completes the identity, minimum squad and payment details and submits the team for
  review; organisers can approve only submitted, complete entries.
* **Rosters** — `tournaments.roster_locked` stops player edits; lineups are frozen once a match
  leaves `SCHEDULED`.
* **Integrity guards** — managers can submit a payment proof but never confirm payment,
  self-approve an entry or edit career statistics; referees can drive status/scores/penalties/MVP
  but cannot reschedule or restructure a fixture. A signed-off match rejects further events, and
  lineups reject suspended players even when the API is called directly.

---

## Getting started

### 1. Requirements

* Node.js 20+ (tested on Node 26) and npm 10+.
* A Supabase project (cloud or self-hosted) with the `pgcrypto` extension available.
* A Supabase **service role** key for tenant provisioning and staff invitations.

### 2. Install

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local`:

```ini
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # server-only, never exposed to the browser
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

> The service-role key is used only inside server-only modules (`utils/supabase/admin.ts`) for
> privileged provisioning: creating tenants, inviting staff, and signing private file URLs.

### 3. Apply the schema

The complete schema is one idempotent migration:

```
supabase/migrations/0001_initial_schema.sql
```

Either push it with the Supabase CLI:

```bash
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```

…or paste the file into **SQL Editor → New query → Run**. It creates:

* **12 tables** — `tenants`, `profiles`, `tenant_members`, `tournaments`, `stages`, `venues`,
  `teams`, `players`, `matches`, `match_lineups`, `match_events`, `standings`.
* RLS helper functions, policies per table, column-level protection on `profiles`.
* `public_profiles`, `public_match_officials` and `public_tenants` views for the fan portal
  (tenant commercial fields stay behind RLS).
* **4 storage buckets** — `logos` and `player-photos` public; `id-documents` and
  `payment-proofs` private.
* The `register_team()` RPC and the three trigger functions listed above.
* Realtime publication entries for `matches`, `match_events` and `standings`.

If the SQL editor reports that the realtime publication does not exist, run
`alter publication supabase_realtime add table public.matches;` etc. after enabling Realtime in the
dashboard (the migration guards this automatically on hosted Supabase).

### 4. Auth settings

In **Authentication → Providers**, keep Email enabled. For local testing, disable
“Confirm email” so a new account can sign in immediately. The staff invite flow creates auth users
with a one-time temporary password shown in the organiser UI; the owner changes it after first
sign-in.

### 5. Create the first platform owner

1. Sign up at `/register`.
2. Promote that account in the SQL editor:

```sql
update public.profiles
set global_role = 'SUPER_ADMIN'
where email = 'you@example.com';
```

3. Sign out and back in. `/superadmin` is now available.

### 6. Provision a competition workspace

As the platform owner:

1. Create a **tenant** at `/superadmin/tenants` (name, slug, brand colour). The service-role
   client creates the row; tenant admins cannot write `tenants` themselves. Workspaces are free
   and unlimited — organisers can also create their own from `/portal` after signing up.
2. Open the workspace and invite a **tournament admin** or referee from
   `/dashboard/[slug]/referees`. Share the one-time password securely.
3. The organiser creates a tournament, stages and venues, opens registration and shares the public
   microsite link `/[tournamentSlug]`.

### 7. Run

```bash
npm run dev     # http://localhost:3000
npm run build   # production build
npm run start   # serve the production build
npm run typecheck
```

---

## End-to-end walkthrough

1. **Organiser** creates a tournament with `REGISTRATION_OPEN` status and a public slug.
2. **Managers** open `/[slug]/register`, sign in or create an account, submit the entry and upload
   the transfer receipt from the manager portal.
3. **Managers** complete the team identity, add the minimum squad and press **Submit team for
   review**. The organiser verifies payment and approves the submitted entry in the tournament
   control centre; the approval guard refuses incomplete or unsubmitted teams.
4. **Draw** — group stage: run the pot draw (seeded or random) or assign teams to groups manually.
   League/group fixtures use the circle-method round robin; knockout fixtures use the bracket
   linker seeded from group qualifiers or all approved teams.
5. **Referee assignment** — pick an official per fixture, set kick-off and venue.
6. **Managers** build squads (unique numbers, optional ID documents) and submit a starting XI from
   the pitch builder. Suspended players are blocked client- and server-side.
7. **Referee** opens `/referee`, starts the half, logs goals/cards/subs in three taps, records a
   shootout if needed, names an MVP and signs off. The public ticker, tables, bracket and stat pages
   update immediately.
8. **Anyone** can browse fixtures, tables, brackets, stats and team profiles, and print an official
   match sheet or squad registration sheet.

Printable sheets live at `/print/match/[matchId]` and `/print/team/[teamId]`; links appear in the
organiser fixture list, referee console and manager portal.

---

## Project layout

```
app/
  [tournamentSlug]/        public microsite (overview, matches, match centre, table, bracket,
                           stats, teams, register)
  dashboard/[tenantSlug]/  organiser console (overview, tournaments, referees/staff)
  manager/[teamId]/        team workspace (squad, payments, lineups)
  referee/                 referee fixture list and live console
  superadmin/              platform owner console
  print/                   printable match and squad sheets
  actions/                 Server Actions grouped by domain
components/
  ui/                      shadcn-style primitives
  forms/                   uploads, submit buttons, field errors
  layout/                  portal shell/nav, public header/footer
  dashboard|manager|referee|public|print/
lib/
  database.types.ts        generated-shape database types + domain unions
  auth.ts                  session guards (profile/tenant/tournament/team/match)
  validations.ts           Zod schemas shared by forms and actions
  fixtures.ts              round robin, pot draw, knockout builder
  constants.ts             plans, labels, formations, kit palette
  storage.ts               signed URLs for private buckets
supabase/migrations/       complete schema
```

---

## Implementation notes

* **No PostgREST embeds.** The typed client does not declare relationships, so queries fetch rows
  separately and stitch them with `Map`s. `lib/auth.ts` and `app/actions/auth.ts` resolve tenant
  slugs and team ids explicitly for this reason.
* **Server Actions + redirects.** Mutations redirect with `?flash=` / `?error=`; only forms that need
  inline validation state use `useActionState`.
* **Private files.** `id-documents` and `payment-proofs` store object paths. Pages exchange them for
  short-lived signed URLs via the service-role client.
* **Colour fields.** Every colour picker pairs a native swatch with a hex text input. The text input
  carries the form name, so brands and kits accept a typed `#RRGGBB` code as well as a pick.
* **Team submissions.** A manager submission is a small JSON document per team in the
  `site-content` bucket. This keeps `teams.registration_status` untouched while letting the manager
  declare the squad complete and the organiser enforce the same readiness checklist before approval.
* **Shared match clock.** Organisers start, pause and correct the clock from the fixture list; the
  clock state is stored as a small JSON document per match in the `site-content` bucket so no schema
  migration is needed. Public pages and the referee console read the same server-anchored snapshot,
  tick locally, and poll for starts, pauses and corrections. Scores and events stay authoritative in
  Postgres.
* **Workspace suspension.** Suspended tenants remain readable to members but writes are blocked by
  RLS; the UI shows the suspension banner and `/suspended` explains the state. There is no billing
  or licence expiry in the product yet — every workspace runs free with a perpetual access date.
* **SuperAdmin view-as.** Opening `/dashboard/[slug]` as a platform owner gives organiser-level
  rights through the auth helpers; it does not swap sessions.
* **Currency** is BDT (Bangladeshi taka, shown as ৳) and all dates render in the competition timezone (`Asia/Dhaka` by default,
  overridable with `NEXT_PUBLIC_TIME_ZONE`).

## Deployment (Vercel)

1. Push the repository and import it into Vercel.
2. Add the four environment variables from `.env.example` (production values).
3. Deploy. `npm run build` is the build command; no extra configuration is required.
4. Add the production domain to Supabase **Authentication → URL Configuration** (Site URL and
   redirect allow-list), and set `NEXT_PUBLIC_SITE_URL` to the same origin.
5. Run the migration against the production database and promote the owner account.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Queries typed as `never` | `@supabase/ssr` must stay ≥ 0.12 (older releases import removed paths). Do not downgrade. |
| Live pages do not update | Realtime is not enabled for the tables. Apply §8 of the migration and check `replica identity full` on `matches` / `match_events`. |
| `new row violates row-level security policy` on tenant creation | Tenant writes are service-role only; provision from `/superadmin/tenants`. |
| Organiser cannot see a team | The entry is still `PENDING`/`REJECTED`; approve it first. |
| Referee sees no fixtures | An admin must assign them on each match; the console lists matches where `referee_id = auth.uid()`. |
| “Registration closed” on the microsite | Tournament status is not `REGISTRATION_OPEN`, or `max_teams` has been reached. |
| Managers cannot add players | Rosters are locked by the organiser, or the squad is at `max_squad_size`. |
| Storage upload fails during registration | Apply the `logo upload for entrants` policy from the migration — entrants upload a crest before the registration RPC creates their membership. |

---

© LigaPro. Built as a production-ready reference implementation; no sample data or placeholder
screens are included.
