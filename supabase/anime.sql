-- Run once in Supabase → SQL Editor on a database created before anime existed.
-- Anime rows keep the Shikimori id and score in tmdb_id / tmdb_rating.

alter table public.titles drop constraint if exists titles_media_type_check;
alter table public.titles add constraint titles_media_type_check
  check (media_type in ('movie', 'tv', 'anime'));
