-- Run once in Supabase → SQL Editor on a database created before the watchlist existed.
-- A title with no ratings (all five null) is on the watchlist.

alter table public.titles
  alter column plot       drop not null,
  alter column ending     drop not null,
  alter column acting     drop not null,
  alter column atmosphere drop not null,
  alter column vibe       drop not null;

alter table public.titles drop constraint if exists titles_ratings_all_or_none;
alter table public.titles add constraint titles_ratings_all_or_none check (
  num_nulls(plot, ending, acting, atmosphere, vibe) in (0, 5)
);
