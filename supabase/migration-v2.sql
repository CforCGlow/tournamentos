-- SEU LigaPro migration v1 -> v2 (roles + one-club-per-manager)
-- Run AFTER schema v1 was applied. Safe to re-run.
-- NOTE: if a manager owns 2+ clubs, the last statement fails.
-- Fix by keeping one club per manager, then re-run.

alter table users add column if not exists role text not null default 'audience';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'users_role_check') then
    alter table users add constraint users_role_check
      check (role in ('admin','manager','player','audience'));
  end if;
end $$;

alter table teams drop constraint if exists teams_name_user_id_key;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'teams_name_key') then
    alter table teams add constraint teams_name_key unique(name);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'teams_one_per_manager') then
    alter table teams add constraint teams_one_per_manager unique(user_id);
  end if;
end $$;
