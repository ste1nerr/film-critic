-- Run once in Supabase → SQL Editor, after seasons.sql and seasons-watched.sql.
-- Seasons are scored on the same five criteria as titles. A row = season watched; any criterion may be left empty.
alter table public.title_seasons
  add column if not exists plot       smallint check (plot between 1 and 5),
  add column if not exists ending     smallint check (ending between 1 and 5),
  add column if not exists acting     smallint check (acting between 1 and 5),
  add column if not exists atmosphere smallint check (atmosphere between 1 and 5),
  add column if not exists vibe       smallint check (vibe between 1 and 5);

-- A single score given before this change counts for every criterion.
update public.title_seasons
set plot = rating, ending = rating, acting = rating, atmosphere = rating, vibe = rating
where rating is not null and num_nonnulls(plot, ending, acting, atmosphere, vibe) = 0;

-- Average of the criteria that are set; null while none is.
alter table public.title_seasons
  add column if not exists overall numeric(2, 1) generated always as (
    round(
      (coalesce(plot, 0) + coalesce(ending, 0) + coalesce(acting, 0) + coalesce(atmosphere, 0) + coalesce(vibe, 0))::numeric
        / nullif(num_nonnulls(plot, ending, acting, atmosphere, vibe), 0),
      1
    )
  ) stored;

comment on column public.title_seasons.rating is 'Legacy single score, copied into the criteria; no longer written.';
