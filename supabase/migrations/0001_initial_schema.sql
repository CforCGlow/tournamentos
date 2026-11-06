-- =============================================================================
-- SEU LigaPro SaaS — 0001_initial_schema.sql
-- Multi-tenant football tournament & league management platform.
-- Run in Supabase Dashboard -> SQL Editor (or `supabase db push`).
--
-- Contents
--   1. Extensions & enums-by-check
--   2. 12 core tables
--   3. Indexes
--   4. Auth / RBAC helper functions (SECURITY DEFINER)
--   5. Business triggers
--        fn_recalculate_group_standings()  -> via fn_recalc_stage()
--        fn_advance_knockout_winner()
--        fn_process_match_event()
--   6. Row Level Security policies (5 user tiers)
--   7. Storage buckets + object policies
--   8. Public views + self-service registration RPC
-- =============================================================================

create extension if not exists "pgcrypto" with schema extensions;

-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- tenants: one row per paying client (tournament organiser / licensee)
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  slug          text        not null unique,
  logo_url      text,
  primary_color text        not null default '#10B981',
  plan_tier     text        not null default 'basic'
                            check (plan_tier in ('basic', 'pro', 'enterprise')),
  status        text        not null default 'active'
                            check (status in ('active', 'suspended', 'trial')),
  -- Billing is not enabled yet: workspaces are free, so new rows default to a
  -- practically perpetual access date instead of a 30-day trial.
  valid_until   timestamptz not null default '2099-12-31T23:59:59Z',
  max_tournaments int       not null default 500 check (max_tournaments >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint tenants_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$')
);

-- ---------------------------------------------------------------------------
-- profiles: 1:1 with auth.users (global role is platform-level only)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text        not null default '',
  email       text        not null,
  phone       text,
  avatar_url  text,
  global_role text        not null default 'USER'
                          check (global_role in ('SUPER_ADMIN', 'USER')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tenant_members: RBAC within a tenant
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_members (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null check (role in ('TOURNAMENT_ADMIN', 'TEAM_MANAGER', 'REFEREE')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

-- ---------------------------------------------------------------------------
-- tournaments
-- ---------------------------------------------------------------------------
create table if not exists public.tournaments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  name         text not null,
  slug         text not null unique,
  banner_url   text,
  format       text not null default 'LEAGUE'
               check (format in ('LEAGUE', 'KNOCKOUT', 'GROUP_PLUS_KNOCKOUT')),
  status       text not null default 'DRAFT'
               check (status in ('DRAFT', 'REGISTRATION_OPEN', 'ONGOING', 'COMPLETED')),
  start_date   date,
  end_date     date,
  registration_fee numeric(10, 2) not null default 0 check (registration_fee >= 0),
  max_teams    int not null default 16 check (max_teams between 2 and 128),
  min_squad_size int not null default 11 check (min_squad_size >= 1),
  max_squad_size int not null default 23 check (max_squad_size >= 1),
  roster_locked boolean not null default false,
  points_per_win  int not null default 3 check (points_per_win >= 0),
  points_per_draw int not null default 1 check (points_per_draw >= 0),
  points_per_loss int not null default 0 check (points_per_loss >= 0),
  yellow_cards_for_suspension int not null default 2 check (yellow_cards_for_suspension >= 1),
  tiebreaker_order jsonb not null default '["GD", "GF", "H2H"]'::jsonb,
  rules_md     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint tournaments_squad_range check (min_squad_size <= max_squad_size),
  constraint tournaments_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$')
);

-- ---------------------------------------------------------------------------
-- stages: groups and knockout rounds
-- ---------------------------------------------------------------------------
create table if not exists public.stages (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references public.tournaments (id) on delete cascade,
  name            text not null,
  stage_type      text not null check (stage_type in ('GROUP', 'KNOCKOUT')),
  sequence_order  int  not null default 1,
  qualifiers_count int not null default 2 check (qualifiers_count between 0 and 64),
  created_at      timestamptz not null default now(),
  unique (tournament_id, name)
);

-- ---------------------------------------------------------------------------
-- venues
-- ---------------------------------------------------------------------------
create table if not exists public.venues (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name          text not null,
  address       text,
  pitch_type    text not null default '11v11'
                check (pitch_type in ('11v11', '7v7', '5v5_futsal')),
  map_url       text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------
create table if not exists public.teams (
  id                 uuid primary key default gen_random_uuid(),
  tournament_id      uuid not null references public.tournaments (id) on delete cascade,
  stage_id           uuid references public.stages (id) on delete set null,
  manager_id         uuid not null references public.profiles (id) on delete cascade,
  name               text not null,
  short_name         varchar(4) not null,
  logo_url           text,
  home_kit_color     text not null default '#10B981',
  away_kit_color     text not null default '#0F172A',
  registration_status text not null default 'PENDING'
                      check (registration_status in ('PENDING', 'APPROVED', 'REJECTED')),
  payment_status     text not null default 'UNPAID'
                     check (payment_status in ('UNPAID', 'PENDING_VERIFICATION', 'PAID')),
  payment_transaction_id text,
  payment_proof_url  text,
  rejection_reason   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tournament_id, name),
  unique (tournament_id, short_name)
);

-- ---------------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams (id) on delete cascade,
  full_name     text not null,
  jersey_number int  not null check (jersey_number between 1 and 99),
  position      text not null default 'MID' check (position in ('GK', 'DEF', 'MID', 'FWD')),
  date_of_birth date,
  photo_url     text,
  id_document_url text,
  is_captain    boolean not null default false,
  is_verified   boolean not null default false,
  goals_count   int not null default 0 check (goals_count >= 0),
  assists_count int not null default 0 check (assists_count >= 0),
  yellow_cards_accumulated int not null default 0 check (yellow_cards_accumulated >= 0),
  red_cards_accumulated    int not null default 0 check (red_cards_accumulated >= 0),
  is_suspended  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (team_id, jersey_number)
);

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  stage_id       uuid not null references public.stages (id) on delete cascade,
  venue_id       uuid references public.venues (id) on delete set null,
  referee_id     uuid references public.profiles (id) on delete set null,
  match_number   int not null,
  round_name     varchar(60) not null default 'Matchday 1',
  home_team_id   uuid references public.teams (id) on delete set null,
  away_team_id   uuid references public.teams (id) on delete set null,
  kickoff_time   timestamptz not null,
  status         text not null default 'SCHEDULED'
                 check (status in ('SCHEDULED', 'FIRST_HALF', 'HALF_TIME', 'SECOND_HALF',
                                   'EXTRA_TIME', 'PENALTIES', 'COMPLETED', 'POSTPONED')),
  home_score     int not null default 0 check (home_score between 0 and 99),
  away_score     int not null default 0 check (away_score between 0 and 99),
  home_penalties int check (home_penalties between 0 and 99),
  away_penalties int check (away_penalties between 0 and 99),
  next_match_id  uuid references public.matches (id) on delete set null,
  next_match_slot text check (next_match_slot in ('HOME', 'AWAY')),
  mvp_player_id  uuid references public.players (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tournament_id, match_number),
  constraint matches_distinct_teams check (home_team_id is distinct from away_team_id),
  constraint matches_slot_pair check ((next_match_id is null) = (next_match_slot is null))
);

-- ---------------------------------------------------------------------------
-- match_lineups
-- ---------------------------------------------------------------------------
create table if not exists public.match_lineups (
  id                 uuid primary key default gen_random_uuid(),
  match_id           uuid not null references public.matches (id) on delete cascade,
  team_id            uuid not null references public.teams (id) on delete cascade,
  player_id          uuid not null references public.players (id) on delete cascade,
  is_starting        boolean not null default false,
  formation_position varchar(12),
  created_at         timestamptz not null default now(),
  unique (match_id, player_id)
);

-- ---------------------------------------------------------------------------
-- match_events
-- ---------------------------------------------------------------------------
create table if not exists public.match_events (
  id                  uuid primary key default gen_random_uuid(),
  match_id            uuid not null references public.matches (id) on delete cascade,
  team_id             uuid not null references public.teams (id) on delete cascade,
  player_id           uuid references public.players (id) on delete set null,
  secondary_player_id uuid references public.players (id) on delete set null,
  event_type          text not null check (event_type in (
                        'GOAL', 'OWN_GOAL', 'PENALTY_GOAL', 'MISSED_PENALTY',
                        'YELLOW_CARD', 'SECOND_YELLOW_RED', 'DIRECT_RED', 'SUBSTITUTION')),
  minute              int not null check (minute between 0 and 130),
  extra_minute        int check (extra_minute between 1 and 30),
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- standings (materialised by trigger; goal difference is generated)
-- ---------------------------------------------------------------------------
create table if not exists public.standings (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references public.tournaments (id) on delete cascade,
  stage_id         uuid not null references public.stages (id) on delete cascade,
  team_id          uuid not null references public.teams (id) on delete cascade,
  played           int not null default 0,
  won              int not null default 0,
  drawn            int not null default 0,
  lost             int not null default 0,
  goals_for        int not null default 0,
  goals_against    int not null default 0,
  goal_difference  int generated always as (goals_for - goals_against) stored,
  points           int not null default 0,
  form             text[] not null default '{}',
  updated_at       timestamptz not null default now(),
  unique (stage_id, team_id)
);

-- =============================================================================
-- 2. INDEXES
-- =============================================================================
create index if not exists idx_tenant_members_user        on public.tenant_members (user_id);
create index if not exists idx_tenant_members_tenant      on public.tenant_members (tenant_id);
create index if not exists idx_tournaments_tenant         on public.tournaments (tenant_id);
create index if not exists idx_tournaments_status         on public.tournaments (status);
create index if not exists idx_stages_tournament          on public.stages (tournament_id, sequence_order);
create index if not exists idx_venues_tournament          on public.venues (tournament_id);
create index if not exists idx_teams_tournament           on public.teams (tournament_id);
create index if not exists idx_teams_stage                on public.teams (stage_id);
create index if not exists idx_teams_manager              on public.teams (manager_id);
create index if not exists idx_players_team               on public.players (team_id);
create index if not exists idx_matches_tournament         on public.matches (tournament_id, kickoff_time);
create index if not exists idx_matches_stage              on public.matches (stage_id);
create index if not exists idx_matches_referee            on public.matches (referee_id);
create index if not exists idx_matches_status             on public.matches (status);
create index if not exists idx_lineups_match              on public.match_lineups (match_id);
create index if not exists idx_events_match               on public.match_events (match_id, minute);
create index if not exists idx_events_player              on public.match_events (player_id);
create index if not exists idx_standings_stage            on public.standings (stage_id, points desc, goal_difference desc);

-- =============================================================================
-- 3. HELPER FUNCTIONS (all SECURITY DEFINER so RLS never recurses)
-- =============================================================================

create or replace function public.fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.safe_uuid(p_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.global_role = 'SUPER_ADMIN'
  );
$$;

create or replace function public.my_global_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.global_role from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.tenant_role(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select tm.role from public.tenant_members tm
  where tm.tenant_id = p_tenant_id and tm.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_tenant_id is not null and (
    public.is_super_admin()
    or exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = p_tenant_id and tm.user_id = auth.uid()
    )
  );
$$;

create or replace function public.has_tenant_role(p_tenant_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_tenant_id is not null and (
    public.is_super_admin()
    or exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = p_tenant_id
        and tm.user_id = auth.uid()
        and tm.role = any (p_roles)
    )
  );
$$;

create or replace function public.is_tenant_admin(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_tenant_role(p_tenant_id, array['TOURNAMENT_ADMIN']);
$$;

create or replace function public.tenant_is_public(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.tenants t
    where t.id = p_tenant_id
      and t.status in ('active', 'trial')
      and (t.valid_until is null or t.valid_until > now())
  );
$$;

create or replace function public.tournament_visible(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = p_tournament_id
      and (
        (t.status <> 'DRAFT' and public.tenant_is_public(t.tenant_id))
        or public.is_tenant_member(t.tenant_id)
      )
  );
$$;

create or replace function public.tournament_tenant_id(p_tournament_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.tenant_id from public.tournaments t where t.id = p_tournament_id;
$$;

create or replace function public.team_tenant_id(p_team_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.tenant_id
  from public.teams tm
  join public.tournaments t on t.id = tm.tournament_id
  where tm.id = p_team_id;
$$;

create or replace function public.match_tenant_id(p_match_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.tenant_id
  from public.matches m
  join public.tournaments t on t.id = m.tournament_id
  where m.id = p_match_id;
$$;

create or replace function public.can_view_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.teams tm
    where tm.id = p_team_id
      and (
        tm.manager_id = auth.uid()
        or public.is_tenant_member(public.team_tenant_id(tm.id))
        or (tm.registration_status = 'APPROVED' and public.tournament_visible(tm.tournament_id))
      )
  );
$$;

create or replace function public.can_manage_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.teams tm
    where tm.id = p_team_id
      and (tm.manager_id = auth.uid() or public.is_tenant_admin(public.team_tenant_id(tm.id)))
  );
$$;

create or replace function public.can_score_match(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match_id
      and (m.referee_id = auth.uid() or public.is_tenant_admin(public.match_tenant_id(m.id)))
  );
$$;

create or replace function public.shares_tenant_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenant_members me
    join public.tenant_members other on other.tenant_id = me.tenant_id
    where me.user_id = auth.uid() and other.user_id = p_user_id
  );
$$;

grant execute on function public.safe_uuid(text) to anon, authenticated;
grant execute on function public.is_super_admin() to anon, authenticated;
grant execute on function public.my_global_role() to anon, authenticated;
grant execute on function public.tenant_role(uuid) to anon, authenticated;
grant execute on function public.is_tenant_member(uuid) to anon, authenticated;
grant execute on function public.has_tenant_role(uuid, text[]) to anon, authenticated;
grant execute on function public.is_tenant_admin(uuid) to anon, authenticated;
grant execute on function public.tenant_is_public(uuid) to anon, authenticated;
grant execute on function public.tournament_visible(uuid) to anon, authenticated;
grant execute on function public.tournament_tenant_id(uuid) to anon, authenticated;
grant execute on function public.team_tenant_id(uuid) to anon, authenticated;
grant execute on function public.match_tenant_id(uuid) to anon, authenticated;
grant execute on function public.can_view_team(uuid) to anon, authenticated;
grant execute on function public.can_manage_team(uuid) to anon, authenticated;
grant execute on function public.can_score_match(uuid) to anon, authenticated;
grant execute on function public.shares_tenant_with(uuid) to anon, authenticated;

-- =============================================================================
-- 4. BUSINESS TRIGGERS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 4.1 Standings recalculation (idempotent, self-healing)
-- ---------------------------------------------------------------------------
create or replace function public.fn_recalc_stage(p_stage_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tournament_id uuid;
  v_stage_type    text;
  v_win  int := 3;
  v_draw int := 1;
  v_loss int := 0;
begin
  if p_stage_id is null then
    return;
  end if;

  select s.tournament_id, s.stage_type
    into v_tournament_id, v_stage_type
  from public.stages s
  where s.id = p_stage_id;

  if v_tournament_id is null or v_stage_type is distinct from 'GROUP' then
    return;
  end if;

  select t.points_per_win, t.points_per_draw, t.points_per_loss
    into v_win, v_draw, v_loss
  from public.tournaments t
  where t.id = v_tournament_id;

  -- Make sure every team assigned to the group has a standings row.
  insert into public.standings (tournament_id, stage_id, team_id)
  select v_tournament_id, p_stage_id, tm.id
  from public.teams tm
  where tm.stage_id = p_stage_id
  on conflict (stage_id, team_id) do nothing;

  -- Full rebuild from COMPLETED matches: an edited historic score can never
  -- leave the table stale.
  update public.standings st
  set played        = agg.played,
      won           = agg.won,
      drawn         = agg.drawn,
      lost          = agg.lost,
      goals_for     = agg.gf,
      goals_against = agg.ga,
      points        = agg.won * coalesce(v_win, 3)
                    + agg.drawn * coalesce(v_draw, 1)
                    + agg.lost * coalesce(v_loss, 0),
      updated_at    = now()
  from (
    select
      tm.id as team_id,
      count(m.id) as played,
      count(m.id) filter (
        where (m.home_team_id = tm.id and m.home_score > m.away_score)
           or (m.away_team_id = tm.id and m.away_score > m.home_score)
      ) as won,
      count(m.id) filter (where m.home_score = m.away_score) as drawn,
      count(m.id) filter (
        where (m.home_team_id = tm.id and m.home_score < m.away_score)
           or (m.away_team_id = tm.id and m.away_score < m.home_score)
      ) as lost,
      coalesce(sum(case when m.home_team_id = tm.id then m.home_score else m.away_score end), 0) as gf,
      coalesce(sum(case when m.home_team_id = tm.id then m.away_score else m.home_score end), 0) as ga
    from public.teams tm
    left join public.matches m
      on m.stage_id = p_stage_id
     and m.status = 'COMPLETED'
     and (m.home_team_id = tm.id or m.away_team_id = tm.id)
    where tm.stage_id = p_stage_id
    group by tm.id
  ) agg
  where st.stage_id = p_stage_id
    and st.team_id = agg.team_id;

  -- Last five results, most recent first.
  update public.standings st
  set form = coalesce((
    select array_agg(x.result order by x.kickoff_time desc)
    from (
      select
        case
          when (m.home_team_id = st.team_id and m.home_score > m.away_score)
            or (m.away_team_id = st.team_id and m.away_score > m.home_score) then 'W'
          when m.home_score = m.away_score then 'D'
          else 'L'
        end as result,
        m.kickoff_time
      from public.matches m
      where m.stage_id = p_stage_id
        and m.status = 'COMPLETED'
        and (m.home_team_id = st.team_id or m.away_team_id = st.team_id)
      order by m.kickoff_time desc
      limit 5
    ) x
  ), '{}'::text[])
  where st.stage_id = p_stage_id;
end;
$$;

create or replace function public.fn_matches_standings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.fn_recalc_stage(old.stage_id);
    return old;
  end if;

  perform public.fn_recalc_stage(new.stage_id);
  if tg_op = 'UPDATE' and old.stage_id is distinct from new.stage_id then
    perform public.fn_recalc_stage(old.stage_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_matches_standings on public.matches;
create trigger trg_matches_standings
after insert or delete or update of
  status, home_score, away_score, home_team_id, away_team_id, stage_id
on public.matches
for each row execute function public.fn_matches_standings();

-- Teams joining/leaving a group must appear in the table immediately.
create or replace function public.fn_teams_standings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.stage_id is not null then
      perform public.fn_recalc_stage(old.stage_id);
    end if;
    return old;
  end if;

  if new.stage_id is not null then
    perform public.fn_recalc_stage(new.stage_id);
  end if;
  if tg_op = 'UPDATE' and old.stage_id is distinct from new.stage_id and old.stage_id is not null then
    perform public.fn_recalc_stage(old.stage_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_teams_standings on public.teams;
create trigger trg_teams_standings
after insert or delete or update of stage_id
on public.teams
for each row execute function public.fn_teams_standings();

-- ---------------------------------------------------------------------------
-- 4.2 Knockout progression: winner fills the linked next-match slot
-- ---------------------------------------------------------------------------
create or replace function public.fn_advance_knockout_winner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_winner uuid;
begin
  if new.next_match_id is null or new.status <> 'COMPLETED' then
    return new;
  end if;

  if new.home_score > new.away_score then
    v_winner := new.home_team_id;
  elsif new.away_score > new.home_score then
    v_winner := new.away_team_id;
  elsif coalesce(new.home_penalties, -1) > coalesce(new.away_penalties, -1) then
    v_winner := new.home_team_id;
  elsif coalesce(new.away_penalties, -1) > coalesce(new.home_penalties, -1) then
    v_winner := new.away_team_id;
  else
    return new; -- draw with no shootout yet: leave the bracket untouched
  end if;

  if v_winner is null then
    return new;
  end if;

  if new.next_match_slot = 'HOME' then
    update public.matches
       set home_team_id = v_winner
     where id = new.next_match_id
       and home_team_id is distinct from v_winner;
  elsif new.next_match_slot = 'AWAY' then
    update public.matches
       set away_team_id = v_winner
     where id = new.next_match_id
       and away_team_id is distinct from v_winner;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_matches_knockout on public.matches;
create trigger trg_matches_knockout
after update of status, home_score, away_score, home_penalties, away_penalties
on public.matches
for each row
when (new.status = 'COMPLETED')
execute function public.fn_advance_knockout_winner();

-- ---------------------------------------------------------------------------
-- 4.3 Live match events: scoreboard + career stats + suspensions
-- ---------------------------------------------------------------------------
create or replace function public.fn_process_match_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match         public.matches%rowtype;
  v_event         public.match_events%rowtype;
  v_sign          int := 1;
  v_scoring_team  uuid;
  v_threshold     int := 2;
  v_yellows       int := 0;
  v_reds          int := 0;
begin
  if tg_op = 'DELETE' then
    v_event := old;
    v_sign := -1;
  else
    v_event := new;
  end if;

  select * into v_match from public.matches where id = v_event.match_id;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- A signed-off match is immutable. Events may only be logged while the match
  -- is actually running, so a direct API call cannot rewrite a result.
  if v_match.status = 'COMPLETED' then
    raise exception 'This match is already signed off';
  end if;

  if tg_op <> 'DELETE'
     and v_match.status not in ('FIRST_HALF', 'HALF_TIME', 'SECOND_HALF', 'EXTRA_TIME', 'PENALTIES') then
    raise exception 'Start the match before logging events';
  end if;

  -- Integrity: the event must involve one of the two teams, and the player
  -- must belong to the team recorded on the event.
  if tg_op <> 'DELETE' then
    if v_event.team_id is distinct from v_match.home_team_id
       and v_event.team_id is distinct from v_match.away_team_id then
      raise exception 'Event team % does not play in match %', v_event.team_id, v_match.id;
    end if;
    if v_event.player_id is not null and not exists (
      select 1 from public.players p
      where p.id = v_event.player_id and p.team_id = v_event.team_id
    ) then
      raise exception 'Player % does not belong to the selected team', v_event.player_id;
    end if;
  end if;

  -- ---- Scoreboard --------------------------------------------------------
  if v_event.event_type in ('GOAL', 'PENALTY_GOAL', 'OWN_GOAL') then
    v_scoring_team := v_event.team_id;
    if v_event.event_type = 'OWN_GOAL' then
      v_scoring_team := case
        when v_event.team_id = v_match.home_team_id then v_match.away_team_id
        else v_match.home_team_id
      end;
    end if;

    if v_scoring_team = v_match.home_team_id then
      update public.matches
         set home_score = greatest(0, home_score + v_sign)
       where id = v_match.id;
    elsif v_scoring_team = v_match.away_team_id then
      update public.matches
         set away_score = greatest(0, away_score + v_sign)
       where id = v_match.id;
    end if;
  end if;

  -- ---- Career stats ------------------------------------------------------
  if v_event.player_id is not null then
    if v_event.event_type in ('GOAL', 'PENALTY_GOAL') then
      update public.players
         set goals_count = greatest(0, goals_count + v_sign)
       where id = v_event.player_id;

      if v_event.secondary_player_id is not null then
        update public.players
           set assists_count = greatest(0, assists_count + v_sign)
         where id = v_event.secondary_player_id;
      end if;
    elsif v_event.event_type = 'YELLOW_CARD' then
      update public.players
         set yellow_cards_accumulated = greatest(0, yellow_cards_accumulated + v_sign)
       where id = v_event.player_id;
    elsif v_event.event_type in ('DIRECT_RED', 'SECOND_YELLOW_RED') then
      update public.players
         set red_cards_accumulated = greatest(0, red_cards_accumulated + v_sign)
       where id = v_event.player_id;
    end if;

    select t.yellow_cards_for_suspension
      into v_threshold
    from public.matches m
    join public.tournaments t on t.id = m.tournament_id
    where m.id = v_match.id;

    select p.yellow_cards_accumulated, p.red_cards_accumulated
      into v_yellows, v_reds
    from public.players p
    where p.id = v_event.player_id;

    if v_reds > 0 or v_yellows >= coalesce(v_threshold, 2) then
      update public.players set is_suspended = true where id = v_event.player_id;
    elsif tg_op = 'DELETE'
      and v_event.event_type in ('YELLOW_CARD', 'DIRECT_RED', 'SECOND_YELLOW_RED') then
      -- Undoing a card in the console immediately clears the suspension.
      update public.players set is_suspended = false where id = v_event.player_id;
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_match_events on public.match_events;
create trigger trg_match_events
after insert or delete on public.match_events
for each row execute function public.fn_process_match_event();

-- ---------------------------------------------------------------------------
-- 4.4 Guards: managers cannot self-approve; referees cannot restructure
-- ---------------------------------------------------------------------------
create or replace function public.fn_guard_team_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Internal trigger writes (standings upkeep, bracket progression) are trusted.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if public.is_tenant_admin(public.team_tenant_id(new.id)) then
    return new;
  end if;

  if new.registration_status is distinct from old.registration_status
     or new.rejection_reason is distinct from old.rejection_reason
     or new.stage_id is distinct from old.stage_id
     or new.tournament_id is distinct from old.tournament_id
     or new.manager_id is distinct from old.manager_id then
    raise exception 'Only tournament administrators can change registration or stage assignment';
  end if;

  -- A manager may submit a payment reference/proof, which moves the entry into
  -- the verification queue. Confirming payment stays with the organiser.
  if new.payment_status is distinct from old.payment_status
     and not (
       new.payment_status = 'PENDING_VERIFICATION'
       and old.payment_status in ('UNPAID', 'PENDING_VERIFICATION')
       and new.payment_proof_url is not null
     ) then
    raise exception 'Only tournament administrators can confirm payment';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_teams_guard on public.teams;
create trigger trg_teams_guard
before update on public.teams
for each row execute function public.fn_guard_team_update();

create or replace function public.fn_guard_match_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Bracket progression updates the *next* match from inside a trigger on this
  -- table. That write is system-owned, not a referee edit.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if public.is_tenant_admin(public.match_tenant_id(new.id)) then
    return new;
  end if;

  -- Referees may drive the match state, score, penalties and MVP — nothing structural.
  if new.tournament_id is distinct from old.tournament_id
     or new.stage_id is distinct from old.stage_id
     or new.home_team_id is distinct from old.home_team_id
     or new.away_team_id is distinct from old.away_team_id
     or new.referee_id is distinct from old.referee_id
     or new.match_number is distinct from old.match_number
     or new.round_name is distinct from old.round_name
     or new.kickoff_time is distinct from old.kickoff_time
     or new.venue_id is distinct from old.venue_id
     or new.next_match_id is distinct from old.next_match_id
     or new.next_match_slot is distinct from old.next_match_slot then
    raise exception 'Referees may only update match status, score, penalties and MVP';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_matches_guard on public.matches;
create trigger trg_matches_guard
before update on public.matches
for each row execute function public.fn_guard_match_update();

-- Players: managers own identity fields (name, shirt, position, photo, docs,
-- captaincy). Eligibility flags and career statistics belong to the referee
-- console and the organiser — never to a direct API call from a manager.
create or replace function public.fn_guard_player_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Official updates arrive through fn_process_match_event / admin actions.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if public.is_tenant_admin(public.team_tenant_id(new.team_id)) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_verified := false;
    new.is_suspended := false;
    new.goals_count := 0;
    new.assists_count := 0;
    new.yellow_cards_accumulated := 0;
    new.red_cards_accumulated := 0;
    return new;
  end if;

  if new.team_id is distinct from old.team_id
     or new.is_verified is distinct from old.is_verified
     or new.is_suspended is distinct from old.is_suspended
     or new.goals_count is distinct from old.goals_count
     or new.assists_count is distinct from old.assists_count
     or new.yellow_cards_accumulated is distinct from old.yellow_cards_accumulated
     or new.red_cards_accumulated is distinct from old.red_cards_accumulated then
    raise exception 'Only match officials and tournament administrators can change eligibility or statistics';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_players_guard on public.players;
create trigger trg_players_guard
before insert or update on public.players
for each row execute function public.fn_guard_player_write();

-- Lineups: the team must be in the match, the player must be in that team and
-- suspended players are rejected even if the API is called directly.
create or replace function public.fn_guard_lineup_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match  public.matches%rowtype;
  v_player public.players%rowtype;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  select * into v_match from public.matches where id = new.match_id;
  if not found then
    raise exception 'Match not found';
  end if;

  if new.team_id is distinct from v_match.home_team_id
     and new.team_id is distinct from v_match.away_team_id then
    raise exception 'That team is not playing in this match';
  end if;

  select * into v_player from public.players where id = new.player_id;
  if not found or v_player.team_id is distinct from new.team_id then
    raise exception 'The selected player does not belong to that team';
  end if;

  if public.is_tenant_admin(public.team_tenant_id(new.team_id)) then
    return new;
  end if;

  if v_match.status <> 'SCHEDULED' then
    raise exception 'Lineups are locked once the match kicks off';
  end if;

  if v_player.is_suspended then
    raise exception '% is suspended and cannot be named in a lineup', v_player.full_name;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lineups_guard on public.match_lineups;
create trigger trg_lineups_guard
before insert or update on public.match_lineups
for each row execute function public.fn_guard_lineup_write();

-- ---------------------------------------------------------------------------
-- 4.5 updated_at maintenance
-- ---------------------------------------------------------------------------
drop trigger if exists trg_tenants_updated on public.tenants;
create trigger trg_tenants_updated before update on public.tenants
for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_tournaments_updated on public.tournaments;
create trigger trg_tournaments_updated before update on public.tournaments
for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_teams_updated on public.teams;
create trigger trg_teams_updated before update on public.teams
for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_players_updated on public.players;
create trigger trg_players_updated before update on public.players
for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_matches_updated on public.matches;
create trigger trg_matches_updated before update on public.matches
for each row execute function public.fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4.6 Auth -> profile mirror
-- ---------------------------------------------------------------------------
create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, email, phone, avatar_url, global_role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    'USER'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = case when public.profiles.full_name = '' then excluded.full_name else public.profiles.full_name end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.fn_handle_new_user();

create or replace function public.fn_handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.fn_handle_user_email_change();

-- =============================================================================
-- 5. ROW LEVEL SECURITY
-- =============================================================================
alter table public.tenants        enable row level security;
alter table public.profiles       enable row level security;
alter table public.tenant_members enable row level security;
alter table public.tournaments    enable row level security;
alter table public.stages         enable row level security;
alter table public.venues         enable row level security;
alter table public.teams          enable row level security;
alter table public.players        enable row level security;
alter table public.matches        enable row level security;
alter table public.match_lineups  enable row level security;
alter table public.match_events   enable row level security;
alter table public.standings      enable row level security;

-- ---- tenants --------------------------------------------------------------
-- Tenant rows hold commercial data (contact email, internal notes).
-- Only platform owners and members of that tenant may read them. Public branding
-- is exposed through the public_tenants view defined in section 7.
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
for select to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_member(id)
);

drop policy if exists tenants_write on public.tenants;
create policy tenants_write on public.tenants
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

-- ---- profiles -------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.is_super_admin()
  or public.shares_tenant_with(id)
);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
for update to authenticated
using (id = auth.uid() or public.is_super_admin())
with check (id = auth.uid() or public.is_super_admin());

-- Column-level protection: nobody can promote themselves via the API.
revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;

-- ---- tenant_members -------------------------------------------------------
drop policy if exists tenant_members_select on public.tenant_members;
create policy tenant_members_select on public.tenant_members
for select to authenticated
using (
  user_id = auth.uid()
  or public.is_super_admin()
  or public.is_tenant_admin(tenant_id)
  or public.shares_tenant_with(user_id)
);

drop policy if exists tenant_members_insert on public.tenant_members;
create policy tenant_members_insert on public.tenant_members
for insert to authenticated
with check (public.is_tenant_admin(tenant_id));

drop policy if exists tenant_members_update on public.tenant_members;
create policy tenant_members_update on public.tenant_members
for update to authenticated
using (public.is_tenant_admin(tenant_id))
with check (public.is_tenant_admin(tenant_id));

drop policy if exists tenant_members_delete on public.tenant_members;
create policy tenant_members_delete on public.tenant_members
for delete to authenticated
using (public.is_tenant_admin(tenant_id));

-- ---- tournaments ----------------------------------------------------------
drop policy if exists tournaments_select on public.tournaments;
create policy tournaments_select on public.tournaments
for select to anon, authenticated
using (
  public.is_tenant_member(tenant_id)
  or (status <> 'DRAFT' and public.tenant_is_public(tenant_id))
);

drop policy if exists tournaments_insert on public.tournaments;
create policy tournaments_insert on public.tournaments
for insert to authenticated
with check (public.is_tenant_admin(tenant_id));

drop policy if exists tournaments_update on public.tournaments;
create policy tournaments_update on public.tournaments
for update to authenticated
using (public.is_tenant_admin(tenant_id))
with check (public.is_tenant_admin(tenant_id));

drop policy if exists tournaments_delete on public.tournaments;
create policy tournaments_delete on public.tournaments
for delete to authenticated
using (public.is_tenant_admin(tenant_id));

-- ---- stages ---------------------------------------------------------------
drop policy if exists stages_select on public.stages;
create policy stages_select on public.stages
for select to anon, authenticated
using (public.tournament_visible(tournament_id) or public.is_tenant_member(public.tournament_tenant_id(tournament_id)));

drop policy if exists stages_write on public.stages;
create policy stages_write on public.stages
for all to authenticated
using (public.is_tenant_admin(public.tournament_tenant_id(tournament_id)))
with check (public.is_tenant_admin(public.tournament_tenant_id(tournament_id)));

-- ---- venues ---------------------------------------------------------------
drop policy if exists venues_select on public.venues;
create policy venues_select on public.venues
for select to anon, authenticated
using (public.tournament_visible(tournament_id) or public.is_tenant_member(public.tournament_tenant_id(tournament_id)));

drop policy if exists venues_write on public.venues;
create policy venues_write on public.venues
for all to authenticated
using (public.is_tenant_admin(public.tournament_tenant_id(tournament_id)))
with check (public.is_tenant_admin(public.tournament_tenant_id(tournament_id)));

-- ---- teams ----------------------------------------------------------------
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
for select to anon, authenticated
using (
  manager_id = auth.uid()
  or public.is_tenant_member(public.team_tenant_id(id))
  or (registration_status = 'APPROVED' and public.tournament_visible(tournament_id))
);

drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams
for insert to authenticated
with check (
  public.is_tenant_admin(public.tournament_tenant_id(tournament_id))
  or (
    manager_id = auth.uid()
    and registration_status = 'PENDING'
    and payment_status in ('UNPAID', 'PENDING_VERIFICATION')
  )
);

drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams
for update to authenticated
using (
  manager_id = auth.uid()
  or public.is_tenant_admin(public.team_tenant_id(id))
)
with check (
  manager_id = auth.uid()
  or public.is_tenant_admin(public.team_tenant_id(id))
);

drop policy if exists teams_delete on public.teams;
create policy teams_delete on public.teams
for delete to authenticated
using (
  public.is_tenant_admin(public.team_tenant_id(id))
  or (manager_id = auth.uid() and registration_status = 'PENDING')
);

-- ---- players --------------------------------------------------------------
drop policy if exists players_select on public.players;
create policy players_select on public.players
for select to anon, authenticated
using (public.can_view_team(team_id));

drop policy if exists players_insert on public.players;
create policy players_insert on public.players
for insert to authenticated
with check (public.can_manage_team(team_id));

drop policy if exists players_update on public.players;
create policy players_update on public.players
for update to authenticated
using (public.can_manage_team(team_id))
with check (public.can_manage_team(team_id));

drop policy if exists players_delete on public.players;
create policy players_delete on public.players
for delete to authenticated
using (public.can_manage_team(team_id));

-- ---- matches --------------------------------------------------------------
drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches
for select to anon, authenticated
using (
  public.tournament_visible(tournament_id)
  or public.is_tenant_member(public.tournament_tenant_id(tournament_id))
);

drop policy if exists matches_insert on public.matches;
create policy matches_insert on public.matches
for insert to authenticated
with check (public.is_tenant_admin(public.tournament_tenant_id(tournament_id)));

drop policy if exists matches_update on public.matches;
create policy matches_update on public.matches
for update to authenticated
using (
  public.is_tenant_admin(public.match_tenant_id(id))
  or referee_id = auth.uid()
)
with check (
  public.is_tenant_admin(public.match_tenant_id(id))
  or referee_id = auth.uid()
);

drop policy if exists matches_delete on public.matches;
create policy matches_delete on public.matches
for delete to authenticated
using (public.is_tenant_admin(public.match_tenant_id(id)));

-- ---- match_lineups --------------------------------------------------------
drop policy if exists lineups_select on public.match_lineups;
create policy lineups_select on public.match_lineups
for select to anon, authenticated
using (
  exists (
    select 1 from public.matches m
    where m.id = match_id and public.tournament_visible(m.tournament_id)
  )
  or public.is_tenant_member(public.match_tenant_id(match_id))
);

drop policy if exists lineups_write on public.match_lineups;
create policy lineups_write on public.match_lineups
for all to authenticated
using (public.can_score_match(match_id) or public.can_manage_team(team_id))
with check (public.can_score_match(match_id) or public.can_manage_team(team_id));

-- ---- match_events ---------------------------------------------------------
drop policy if exists events_select on public.match_events;
create policy events_select on public.match_events
for select to anon, authenticated
using (
  exists (
    select 1 from public.matches m
    where m.id = match_id and public.tournament_visible(m.tournament_id)
  )
  or public.is_tenant_member(public.match_tenant_id(match_id))
);

drop policy if exists events_insert on public.match_events;
create policy events_insert on public.match_events
for insert to authenticated
with check (public.can_score_match(match_id));

drop policy if exists events_delete on public.match_events;
create policy events_delete on public.match_events
for delete to authenticated
using (public.can_score_match(match_id));

-- ---- standings (written only by SECURITY DEFINER triggers) ----------------
drop policy if exists standings_select on public.standings;
create policy standings_select on public.standings
for select to anon, authenticated
using (
  public.tournament_visible(tournament_id)
  or public.is_tenant_member(public.tournament_tenant_id(tournament_id))
);

-- =============================================================================
-- 6. STORAGE
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('logos',          'logos',          true,  2097152, array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('player-photos',  'player-photos',  true,  2097152, array['image/png','image/jpeg','image/webp']),
  ('id-documents',   'id-documents',   false, 5242880, array['image/png','image/jpeg','image/webp','application/pdf']),
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public asset read" on storage.objects;
create policy "public asset read" on storage.objects
for select to anon, authenticated
using (bucket_id in ('logos', 'player-photos'));

drop policy if exists "tenant member upload" on storage.objects;
create policy "tenant member upload" on storage.objects
for insert to authenticated
with check (
  bucket_id in ('logos', 'player-photos', 'id-documents', 'payment-proofs')
  and public.is_tenant_member(public.safe_uuid((storage.foldername(name))[1]))
);

-- Logos are public brand assets: a signed-in entrant can upload a crest while
-- submitting a team entry, before the registration RPC creates their tenant
-- membership (which is what the tenant-scoped policy above requires).
drop policy if exists "logo upload for entrants" on storage.objects;
create policy "logo upload for entrants" on storage.objects
for insert to authenticated
with check (bucket_id = 'logos');

drop policy if exists "tenant member update" on storage.objects;
create policy "tenant member update" on storage.objects
for update to authenticated
using (
  bucket_id in ('logos', 'player-photos', 'id-documents', 'payment-proofs')
  and public.is_tenant_member(public.safe_uuid((storage.foldername(name))[1]))
);

drop policy if exists "tenant admin delete" on storage.objects;
create policy "tenant admin delete" on storage.objects
for delete to authenticated
using (
  bucket_id in ('logos', 'player-photos', 'id-documents', 'payment-proofs')
  and (
    public.is_super_admin()
    or public.is_tenant_admin(public.safe_uuid((storage.foldername(name))[1]))
  )
);

-- =============================================================================
-- 7. PUBLIC VIEWS + SELF-SERVICE REGISTRATION RPC
-- =============================================================================

-- Safe public identity columns (never exposes email/phone).
create or replace view public.public_profiles
with (security_invoker = false)
as
select id, full_name, avatar_url
from public.profiles;

grant select on public.public_profiles to anon, authenticated;

-- Branding for the public microsite and marketing directory. Deliberately omits
-- contact details and internal notes, which stay behind tenant RLS.
create or replace view public.public_tenants
with (security_invoker = false)
as
select id, name, slug, logo_url, primary_color
from public.tenants
where status in ('active', 'trial')
  and (valid_until is null or valid_until > now());

grant select on public.public_tenants to anon, authenticated;

-- The public fan portal needs the referee's name for published fixtures only;
-- drafts and suspended workspaces stay invisible.
create or replace view public.public_match_officials
with (security_invoker = false)
as
select m.id as match_id, p.full_name as referee_name
from public.matches m
left join public.profiles p on p.id = m.referee_id
where public.tournament_visible(m.tournament_id);

grant select on public.public_match_officials to anon, authenticated;

-- Atomic team registration: creates the team AND the manager's tenant
-- membership in one transaction. Runs as definer so a brand-new user cannot
-- be blocked by the tenant_members insert policy (admins still control
-- approval of the team itself).
create or replace function public.register_team(
  p_tournament_id uuid,
  p_name          text,
  p_short_name    text,
  p_home_kit      text default '#10B981',
  p_away_kit      text default '#0F172A',
  p_logo_url      text default null,
  p_transaction_id text default null,
  p_proof_url     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_status    text;
  v_team_id   uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to register a team';
  end if;

  select t.tenant_id, t.status into v_tenant_id, v_status
  from public.tournaments t
  where t.id = p_tournament_id;

  if v_tenant_id is null then
    raise exception 'Tournament not found';
  end if;
  if v_status <> 'REGISTRATION_OPEN' then
    raise exception 'Registration is not open for this tournament';
  end if;
  if not public.tenant_is_public(v_tenant_id) then
    raise exception 'This organiser account is not active';
  end if;
  if exists (
    select 1 from public.teams tm
    where tm.tournament_id = p_tournament_id and lower(tm.name) = lower(trim(p_name))
  ) then
    raise exception 'A team with that name is already registered';
  end if;

  insert into public.teams (
    tournament_id, manager_id, name, short_name, home_kit_color, away_kit_color,
    logo_url, registration_status, payment_status, payment_transaction_id, payment_proof_url
  ) values (
    p_tournament_id, auth.uid(), trim(p_name), upper(trim(p_short_name)),
    coalesce(p_home_kit, '#10B981'), coalesce(p_away_kit, '#0F172A'),
    p_logo_url, 'PENDING',
    case when coalesce(trim(p_transaction_id), '') = '' then 'UNPAID' else 'PENDING_VERIFICATION' end,
    nullif(trim(p_transaction_id), ''), p_proof_url
  )
  returning id into v_team_id;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_tenant_id, auth.uid(), 'TEAM_MANAGER')
  on conflict (tenant_id, user_id) do nothing;

  return v_team_id;
end;
$$;

grant execute on function public.register_team(uuid, text, text, text, text, text, text, text) to authenticated;

-- =============================================================================
-- 8. REALTIME
-- =============================================================================
-- The public microsite subscribes to score, event and table changes. Supabase
-- creates the `supabase_realtime` publication; add the tables when it exists so
-- the migration also runs on a plain Postgres instance.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.matches;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.match_events;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.standings;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- Deletes must carry the full old row so clients can identify the affected match.
alter table public.matches replica identity full;
alter table public.match_events replica identity full;

-- =============================================================================
-- DONE. Next: create your first account in /register, then promote it:
--   update public.profiles set global_role = 'SUPER_ADMIN'
--   where email = 'you@example.com';
-- =============================================================================
