-- Run once in Supabase → SQL Editor, after seasons.sql.
-- A row now means "season watched"; the score is optional (the 1–5 check still applies when set).
alter table public.title_seasons alter column rating drop not null;
