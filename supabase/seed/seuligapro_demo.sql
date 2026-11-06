-- ---------------------------------------------------------------------------
-- Demo data: SEU LigaPro
--   * one tenant (seuligapro) owned by the platform admin
--   * SEU LigaPro 2026  — a league that is already being played (4 of 10 games done)
--   * SEU LigaPro Cup 2027 — a knockout cup with registration open
--   * five clubs with crests, 25 players, 10 fixtures, 13 match events
--
-- Safe to re-run: inserts are guarded by ON CONFLICT DO NOTHING and the event
-- block starts by clearing the events it is about to recreate.
-- Delete everything with: delete from public.tenants where slug = 'seuligapro';
--
-- Crests live in the public `logos` bucket under
--   <tenant_id>/logos/seed-<club>.svg
-- Upload them before running the team block (see the note at the bottom).
-- ---------------------------------------------------------------------------

-- Tenant -------------------------------------------------------------------
insert into public.tenants (id, name, slug, primary_color, plan_tier, status, valid_until, max_tournaments)
values ('11111111-1111-4111-8111-111111111111', 'SEU LigaPro', 'seuligapro', '#10B981', 'basic', 'active', '2099-12-31T23:59:59Z', 500)
on conflict (slug) do nothing;

-- Owner membership (the super admin also gets organiser access) --------------
insert into public.tenant_members (tenant_id, user_id, role)
select '11111111-1111-4111-8111-111111111111', p.id, 'TOURNAMENT_ADMIN'
from public.profiles p
where p.email = 'kazimakeebonik@gmail.com'
on conflict (tenant_id, user_id) do nothing;

-- League tournament ---------------------------------------------------------
insert into public.tournaments (
  id, tenant_id, name, slug, format, status, start_date, end_date,
  registration_fee, max_teams, min_squad_size, max_squad_size, roster_locked,
  rules_md
)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'SEU LigaPro 2026', 'seu-ligapro-2026', 'LEAGUE', 'ONGOING',
  date '2026-10-20', date '2026-12-15',
  2400, 8, 5, 18, false,
  'League format: single round robin. Three points for a win, one for a draw. Top side lifts the trophy.'
)
on conflict (slug) do nothing;

insert into public.stages (id, tournament_id, name, stage_type, sequence_order, qualifiers_count)
values ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222',
        'League', 'GROUP', 1, 0)
on conflict (tournament_id, name) do nothing;

insert into public.venues (id, tournament_id, name, address, pitch_type)
values ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222',
        'Dbox Sports Arena', 'Southeast University, Tejgaon, Dhaka', '11v11')
on conflict do nothing;

-- Cup tournament (registration open — exercises the public entry funnel) -----
insert into public.tournaments (
  id, tenant_id, name, slug, format, status, start_date, end_date,
  registration_fee, max_teams, min_squad_size, max_squad_size, roster_locked,
  rules_md
)
values (
  '22222222-2222-4222-8222-222222222223',
  '11111111-1111-4111-8111-111111111111',
  'SEU LigaPro Cup 2027', 'seu-ligapro-cup-2027', 'KNOCKOUT', 'REGISTRATION_OPEN',
  date '2027-01-10', date '2027-02-20',
  2400, 16, 5, 18, false,
  'Straight knockout cup. Extra time and penalties decide any tie. Registration closes once 16 clubs have entered or on 31 December 2026.'
)
on conflict (slug) do nothing;

insert into public.stages (id, tournament_id, name, stage_type, sequence_order, qualifiers_count)
values ('33333333-3333-4333-8333-333333333334', '22222222-2222-4222-8222-222222222223',
        'Knockout', 'KNOCKOUT', 1, 0)
on conflict (tournament_id, name) do nothing;

insert into public.venues (id, tournament_id, name, address, pitch_type)
values ('44444444-4444-4444-8444-444444444445', '22222222-2222-4222-8222-222222222223',
        'Dbox Sports Arena', 'Southeast University, Tejgaon, Dhaka', '11v11')
on conflict do nothing;

-- Clubs --------------------------------------------------------------------
insert into public.teams (
  id, tournament_id, stage_id, manager_id, name, short_name,
  home_kit_color, away_kit_color, registration_status, payment_status, logo_url
)
select v.id::uuid, '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
       p.id, v.name, v.short_name, v.home_kit, '#0F172A', 'APPROVED', 'PAID',
       'https://fyhseiqylzsesvguunqf.supabase.co/storage/v1/object/public/logos/'
         || '11111111-1111-4111-8111-111111111111/logos/seed-' || v.crest || '.svg'
from public.profiles p
cross join (values
  ('5a000001-0000-4000-8000-000000000001', 'BBA Banger',       'BBA', '#F59E0B', 'bba-banger'),
  ('5a000001-0000-4000-8000-000000000002', 'CSE Null Pointer', 'CSE', '#0284C7', 'cse-null-pointer'),
  ('5a000001-0000-4000-8000-000000000003', 'English Eagles',   'ENG', '#059669', 'english-eagles'),
  ('5a000001-0000-4000-8000-000000000004', 'Law Legends',      'LAW', '#7C3AED', 'law-legends'),
  ('5a000001-0000-4000-8000-000000000005', 'EEE Titans',       'EEE', '#DC2626', 'eee-titans')
) as v(id, name, short_name, home_kit, crest)
where p.email = 'kazimakeebonik@gmail.com'
on conflict (tournament_id, name) do nothing;

-- Squads (five per club keeps the seed small but real) ----------------------
insert into public.players (id, team_id, full_name, jersey_number, position, is_captain)
values
  ('6b000001-0000-4000-8000-000000000001', '5a000001-0000-4000-8000-000000000001', 'Rakib Hasan',      1,  'GK',  true),
  ('6b000001-0000-4000-8000-000000000002', '5a000001-0000-4000-8000-000000000001', 'Tanvir Ahmed',     4,  'DEF', false),
  ('6b000001-0000-4000-8000-000000000003', '5a000001-0000-4000-8000-000000000001', 'Sabbir Rahman',    8,  'MID', false),
  ('6b000001-0000-4000-8000-000000000004', '5a000001-0000-4000-8000-000000000001', 'Nayeem Islam',     9,  'FWD', false),
  ('6b000001-0000-4000-8000-000000000005', '5a000001-0000-4000-8000-000000000001', 'Arif Chowdhury',   11, 'FWD', false),

  ('6b000002-0000-4000-8000-000000000001', '5a000001-0000-4000-8000-000000000002', 'Hasibul Karim',    1,  'GK',  false),
  ('6b000002-0000-4000-8000-000000000002', '5a000001-0000-4000-8000-000000000002', 'Mehedi Hasan',     5,  'DEF', true),
  ('6b000002-0000-4000-8000-000000000003', '5a000001-0000-4000-8000-000000000002', 'Fahim Shahriar',   7,  'MID', false),
  ('6b000002-0000-4000-8000-000000000004', '5a000001-0000-4000-8000-000000000002', 'Rifat Mahmud',     10, 'MID', false),
  ('6b000002-0000-4000-8000-000000000005', '5a000001-0000-4000-8000-000000000002', 'Imran Kabir',      17, 'FWD', false),

  ('6b000003-0000-4000-8000-000000000001', '5a000001-0000-4000-8000-000000000003', 'Shahriar Alam',    1,  'GK',  false),
  ('6b000003-0000-4000-8000-000000000002', '5a000001-0000-4000-8000-000000000003', 'Adnan Sami',       3,  'DEF', false),
  ('6b000003-0000-4000-8000-000000000003', '5a000001-0000-4000-8000-000000000003', 'Zubair Hossain',   6,  'MID', true),
  ('6b000003-0000-4000-8000-000000000004', '5a000001-0000-4000-8000-000000000003', 'Tahmid Noor',      8,  'MID', false),
  ('6b000003-0000-4000-8000-000000000005', '5a000001-0000-4000-8000-000000000003', 'Sakib Al Hasan',   9,  'FWD', false),

  ('6b000004-0000-4000-8000-000000000001', '5a000001-0000-4000-8000-000000000004', 'Rashed Khan',      1,  'GK',  false),
  ('6b000004-0000-4000-8000-000000000002', '5a000001-0000-4000-8000-000000000004', 'Nafis Iqbal',      2,  'DEF', true),
  ('6b000004-0000-4000-8000-000000000003', '5a000001-0000-4000-8000-000000000004', 'Arafat Hossain',   7,  'MID', false),
  ('6b000004-0000-4000-8000-000000000004', '5a000001-0000-4000-8000-000000000004', 'Jubayer Rahman',   10, 'MID', false),
  ('6b000004-0000-4000-8000-000000000005', '5a000001-0000-4000-8000-000000000004', 'Siam Ahmed',       14, 'FWD', false),

  ('6b000005-0000-4000-8000-000000000001', '5a000001-0000-4000-8000-000000000005', 'Foysal Mahmud',    1,  'GK',  false),
  ('6b000005-0000-4000-8000-000000000002', '5a000001-0000-4000-8000-000000000005', 'Tanim Chowdhury',  4,  'DEF', false),
  ('6b000005-0000-4000-8000-000000000003', '5a000001-0000-4000-8000-000000000005', 'Mizanur Rahman',   6,  'MID', true),
  ('6b000005-0000-4000-8000-000000000004', '5a000001-0000-4000-8000-000000000005', 'Sohel Rana',       11, 'MID', false),
  ('6b000005-0000-4000-8000-000000000005', '5a000001-0000-4000-8000-000000000005', 'Rony Talukdar',    18, 'FWD', false)
on conflict (team_id, jersey_number) do nothing;

-- Fixtures: single round robin, circle method ---------------------------------
insert into public.matches (
  id, tournament_id, stage_id, venue_id, match_number, round_name,
  home_team_id, away_team_id, kickoff_time, status, home_score, away_score
)
values
  ('7c000001-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', 1,  'Matchday 1', '5a000001-0000-4000-8000-000000000001', '5a000001-0000-4000-8000-000000000002', '2026-10-20 16:00+06', 'SCHEDULED', 0, 0),
  ('7c000001-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', 2,  'Matchday 1', '5a000001-0000-4000-8000-000000000003', '5a000001-0000-4000-8000-000000000004', '2026-10-20 18:00+06', 'SCHEDULED', 0, 0),
  ('7c000001-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', 3,  'Matchday 2', '5a000001-0000-4000-8000-000000000001', '5a000001-0000-4000-8000-000000000003', '2026-10-24 16:00+06', 'SCHEDULED', 0, 0),
  ('7c000001-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', 4,  'Matchday 2', '5a000001-0000-4000-8000-000000000002', '5a000001-0000-4000-8000-000000000005', '2026-10-24 18:00+06', 'SCHEDULED', 0, 0),
  ('7c000001-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', 5,  'Matchday 3', '5a000001-0000-4000-8000-000000000001', '5a000001-0000-4000-8000-000000000004', '2026-11-02 16:00+06', 'SCHEDULED', 0, 0),
  ('7c000001-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', 6,  'Matchday 3', '5a000001-0000-4000-8000-000000000003', '5a000001-0000-4000-8000-000000000005', '2026-11-02 18:00+06', 'SCHEDULED', 0, 0),
  ('7c000001-0000-4000-8000-000000000007', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', 7,  'Matchday 4', '5a000001-0000-4000-8000-000000000001', '5a000001-0000-4000-8000-000000000005', '2026-11-06 16:00+06', 'SCHEDULED', 0, 0),
  ('7c000001-0000-4000-8000-000000000008', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', 8,  'Matchday 4', '5a000001-0000-4000-8000-000000000002', '5a000001-0000-4000-8000-000000000004', '2026-11-06 18:00+06', 'SCHEDULED', 0, 0),
  ('7c000001-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', 9,  'Matchday 5', '5a000001-0000-4000-8000-000000000002', '5a000001-0000-4000-8000-000000000003', '2026-11-10 17:00+06', 'SCHEDULED', 0, 0),
  ('7c000001-0000-4000-8000-000000000010', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', 10, 'Matchday 5', '5a000001-0000-4000-8000-000000000004', '5a000001-0000-4000-8000-000000000005', '2026-11-10 19:00+06', 'SCHEDULED', 0, 0)
on conflict (tournament_id, match_number) do nothing;

-- Results -------------------------------------------------------------------
-- The scoreboard columns are never written directly for played games. Each
-- fixture is put "in play", the goals and cards are logged, and the trigger
-- rebuilds home_score / away_score, the standings and every player's career
-- totals. This is exactly the path the referee console takes.
delete from public.match_events
where match_id in ('7c000001-0000-4000-8000-000000000001', '7c000001-0000-4000-8000-000000000002',
                   '7c000001-0000-4000-8000-000000000003', '7c000001-0000-4000-8000-000000000004');

update public.matches
   set status = 'SECOND_HALF', home_score = 0, away_score = 0
 where id in ('7c000001-0000-4000-8000-000000000001', '7c000001-0000-4000-8000-000000000002',
              '7c000001-0000-4000-8000-000000000003', '7c000001-0000-4000-8000-000000000004');

insert into public.match_events (match_id, team_id, player_id, secondary_player_id, event_type, minute)
values
  -- Matchday 1: BBA Banger 2-1 CSE Null Pointer
  ('7c000001-0000-4000-8000-000000000001', '5a000001-0000-4000-8000-000000000001', '6b000001-0000-4000-8000-000000000004', '6b000001-0000-4000-8000-000000000003', 'GOAL', 23),
  ('7c000001-0000-4000-8000-000000000001', '5a000001-0000-4000-8000-000000000002', '6b000002-0000-4000-8000-000000000005', null, 'GOAL', 41),
  ('7c000001-0000-4000-8000-000000000001', '5a000001-0000-4000-8000-000000000002', '6b000002-0000-4000-8000-000000000002', null, 'YELLOW_CARD', 55),
  ('7c000001-0000-4000-8000-000000000001', '5a000001-0000-4000-8000-000000000001', '6b000001-0000-4000-8000-000000000005', '6b000001-0000-4000-8000-000000000004', 'GOAL', 67),
  -- Matchday 1: English Eagles 0-0 Law Legends
  ('7c000001-0000-4000-8000-000000000002', '5a000001-0000-4000-8000-000000000003', '6b000003-0000-4000-8000-000000000002', null, 'YELLOW_CARD', 34),
  ('7c000001-0000-4000-8000-000000000002', '5a000001-0000-4000-8000-000000000004', '6b000004-0000-4000-8000-000000000003', null, 'YELLOW_CARD', 72),
  -- Matchday 2: BBA Banger 1-0 English Eagles
  ('7c000001-0000-4000-8000-000000000003', '5a000001-0000-4000-8000-000000000001', '6b000001-0000-4000-8000-000000000003', '6b000001-0000-4000-8000-000000000005', 'GOAL', 58),
  ('7c000001-0000-4000-8000-000000000003', '5a000001-0000-4000-8000-000000000003', '6b000003-0000-4000-8000-000000000003', null, 'YELLOW_CARD', 66),
  -- Matchday 2: CSE Null Pointer 3-1 EEE Titans
  ('7c000001-0000-4000-8000-000000000004', '5a000001-0000-4000-8000-000000000002', '6b000002-0000-4000-8000-000000000004', null, 'GOAL', 12),
  ('7c000001-0000-4000-8000-000000000004', '5a000001-0000-4000-8000-000000000005', '6b000005-0000-4000-8000-000000000005', null, 'GOAL', 29),
  ('7c000001-0000-4000-8000-000000000004', '5a000001-0000-4000-8000-000000000005', '6b000005-0000-4000-8000-000000000003', null, 'YELLOW_CARD', 50),
  ('7c000001-0000-4000-8000-000000000004', '5a000001-0000-4000-8000-000000000002', '6b000002-0000-4000-8000-000000000005', '6b000002-0000-4000-8000-000000000004', 'GOAL', 63),
  ('7c000001-0000-4000-8000-000000000004', '5a000001-0000-4000-8000-000000000002', '6b000002-0000-4000-8000-000000000004', null, 'PENALTY_GOAL', 84);

update public.matches
   set status = 'COMPLETED'
 where id in ('7c000001-0000-4000-8000-000000000001', '7c000001-0000-4000-8000-000000000002',
              '7c000001-0000-4000-8000-000000000003', '7c000001-0000-4000-8000-000000000004');

-- ---------------------------------------------------------------------------
-- Crests
-- The five club badges are SVG files in `supabase/seed/crests/`. Upload each
-- one to storage (service role, so the public-read policy does not matter):
--
--   curl -X POST \
--     "$SUPABASE_URL/storage/v1/object/logos/11111111-1111-4111-8111-111111111111/logos/seed-bba-banger.svg" \
--     -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
--     -H "Content-Type: image/svg+xml" \
--     -H "x-upsert: true" \
--     --data-binary @supabase/seed/crests/bba-banger.svg
--
-- Or simply open /portal as the organiser and use the crest field on each team —
-- the upload widget writes to the same bucket and the same column.
-- ---------------------------------------------------------------------------
