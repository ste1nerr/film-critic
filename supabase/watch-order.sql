-- Run once in Supabase → SQL Editor: your own order of the watchlist (drag to reorder).
-- Lower goes first; titles without a rank (just added) sit on top until the first drag.
alter table public.titles add column if not exists watch_rank double precision;
