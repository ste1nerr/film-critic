-- Run once in Supabase → SQL Editor, after seasons-criteria.sql.
-- Once any season of a rated title has a score, the title's overall is the average of its season scores;
-- the title's own five criteria still drive the radar and count again when no season is scored.

alter table public.titles add column if not exists seasons_overall numeric(2, 1);

-- overall is generated, so its formula changes by dropping and re-adding it.
alter table public.titles drop column if exists overall;
alter table public.titles
  add column overall numeric(2, 1) generated always as (
    case when num_nulls(plot, ending, acting, atmosphere, vibe) = 0 then
      coalesce(seasons_overall, round((plot + ending + acting + atmosphere + vibe)::numeric / 5, 1))
    end
  ) stored;

create or replace function public.sync_seasons_overall() returns trigger
language plpgsql as $$
declare
  tid uuid := coalesce(new.title_id, old.title_id);
  avg_score numeric(2, 1);
begin
  select round(avg(overall), 1) into avg_score
  from public.title_seasons
  where title_id = tid and overall is not null;

  update public.titles
  set seasons_overall = avg_score
  where id = tid and seasons_overall is distinct from avg_score;
  return null;
end $$;

drop trigger if exists title_seasons_sync_overall on public.title_seasons;
create trigger title_seasons_sync_overall
  after insert or update or delete on public.title_seasons
  for each row execute function public.sync_seasons_overall();

-- Backfill titles whose seasons were scored before this change.
update public.titles t
set seasons_overall = s.avg_score
from (
  select title_id, round(avg(overall), 1) as avg_score
  from public.title_seasons
  where overall is not null
  group by title_id
) s
where s.title_id = t.id;
