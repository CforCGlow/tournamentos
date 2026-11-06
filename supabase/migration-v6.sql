-- SEU LigaPro migration v6: one jersey number per squad
-- Run AFTER v5. Safe to re-run.
-- If it fails with "duplicate key", find clashes first and renumber:
--   select team_id, jersey_no, count(*) from players
--   group by team_id, jersey_no having count(*) > 1;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'players_team_id_jersey_no_key') then
    alter table players add constraint players_team_id_jersey_no_key unique(team_id, jersey_no);
  end if;
end $$;
