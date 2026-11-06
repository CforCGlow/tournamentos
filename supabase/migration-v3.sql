-- SEU LigaPro migration v3: city -> department on teams
-- Run AFTER v2. Safe to re-run.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'teams' and column_name = 'city')
     and not exists (select 1 from information_schema.columns
             where table_name = 'teams' and column_name = 'department') then
    alter table teams rename column city to department;
  end if;
end $$;
