-- Run once in Supabase → SQL Editor. Optional per-season scores for series; the title's own rating is not affected.
create table if not exists public.title_seasons (
  title_id   uuid not null references public.titles (id) on delete cascade,
  season     smallint not null check (season > 0),
  rating     smallint not null check (rating between 1 and 5),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (title_id, season)
);

alter table public.title_seasons enable row level security;
drop policy if exists "own seasons" on public.title_seasons;
create policy "own seasons" on public.title_seasons
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
