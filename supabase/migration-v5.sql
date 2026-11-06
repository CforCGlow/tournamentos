-- SEU LigaPro migration v5: match_no on matches
-- Run AFTER v4. Safe to re-run.
alter table matches add column if not exists match_no int;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'matches_match_no_key') then
    alter table matches add constraint matches_match_no_key unique(match_no);
  end if;
end $$;
