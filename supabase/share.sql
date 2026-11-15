-- Run once in Supabase → SQL Editor. A read-only link to your library that opens without signing in.
-- One link per user; deleting the row turns the old link off, a new row gives a new token.
create table if not exists public.share_links (
  token      text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id    uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.share_links enable row level security;
drop policy if exists "own share link" on public.share_links;
create policy "own share link" on public.share_links
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The only way anonymous visitors read titles: by token, without your notes and user id.
create or replace function public.shared_library(p_token text) returns json
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from share_links where token = p_token) then
    coalesce((
      select json_agg(to_jsonb(t) - 'note' - 'user_id')
      from titles t join share_links s on s.user_id = t.user_id
      where s.token = p_token
    ), '[]'::json)
  end
$$;

revoke all on function public.shared_library(text) from public;
grant execute on function public.shared_library(text) to anon, authenticated;
