-- Run once in Supabase → SQL Editor.

create table if not exists public.titles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null,
  media_type    text not null default 'movie' check (media_type in ('movie', 'tv')),

  -- your ratings, 1–5
  plot          smallint not null check (plot between 1 and 5),
  ending        smallint not null check (ending between 1 and 5),
  acting        smallint not null check (acting between 1 and 5),
  atmosphere    smallint not null check (atmosphere between 1 and 5),
  vibe          smallint not null check (vibe between 1 and 5),
  overall       numeric(2, 1) generated always as
                  (round((plot + ending + acting + atmosphere + vibe)::numeric / 5, 1)) stored,
  note          text,

  -- metadata cached from TMDB / OMDb
  tmdb_id       integer,
  year          smallint,
  poster_path   text,
  backdrop_path text,
  overview      text,
  genres        text[] not null default '{}',
  tmdb_rating   numeric(3, 1),
  imdb_id       text,
  imdb_rating   numeric(3, 1),
  runtime       smallint,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists titles_user_id_idx on public.titles (user_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists titles_touch_updated_at on public.titles;
create trigger titles_touch_updated_at before update on public.titles
  for each row execute function public.touch_updated_at();

-- Every user sees and edits only their own list.
alter table public.titles enable row level security;

drop policy if exists "own titles" on public.titles;
create policy "own titles" on public.titles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Push inserts/updates/deletes to open tabs in real time.
alter publication supabase_realtime add table public.titles;
