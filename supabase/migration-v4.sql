-- SEU LigaPro migration v4: batch + student_id on players
-- Run AFTER v2/v3. Safe to re-run.
alter table players add column if not exists batch varchar(20) not null default '';
alter table players add column if not exists student_id text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'players_student_id_key') then
    alter table players add constraint players_student_id_key unique(student_id);
  end if;
end $$;
