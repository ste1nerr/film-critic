-- Moves every title (watchlist included) from one Supabase project to another.
-- The in-app Import can't do this: it skips titles without ratings.

-- ── Step 1. OLD project → SQL Editor. Copy the single cell it returns.
select coalesce(json_agg(t), '[]') from public.titles t;

-- ── Step 2. NEW project → SQL Editor: run schema.sql first; sheets-sync.sql only after this insert,
-- or every moved row gets POSTed to the sheet.
-- Then sign up in the app once so your user exists, put your email and the copied JSON below, run.
insert into public.titles (
  id, user_id, name, media_type, plot, ending, acting, atmosphere, vibe, note,
  tmdb_id, year, poster_path, backdrop_path, overview, genres, tmdb_rating,
  imdb_id, imdb_rating, runtime, created_at, updated_at
)
select
  r.id, (select id from auth.users where email = 'YOUR_EMAIL'), r.name, r.media_type,
  r.plot, r.ending, r.acting, r.atmosphere, r.vibe, r.note,
  r.tmdb_id, r.year, r.poster_path, r.backdrop_path, r.overview, r.genres, r.tmdb_rating,
  r.imdb_id, r.imdb_rating, r.runtime, r.created_at, r.updated_at
from json_populate_recordset(null::public.titles, $json$PASTE_JSON_HERE$json$) r
on conflict (id) do nothing;

-- Check: should match the row count from the old project.
select count(*) from public.titles;
