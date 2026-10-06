-- Google Sheets sync: POSTs every change in titles to the Apps Script web app (google-sheets/Code.gs).
-- The script's menu "Film critic → 3. SQL для Supabase" prints this with {{URL}} filled in.
-- Run once in Supabase → SQL Editor. To turn the sync off: drop trigger titles_notify_google_sheet on public.titles;

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_google_sheet() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := '{{URL}}',
    body := jsonb_build_object(
      'type', tg_op,
      'record', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
      'old_record', case when tg_op = 'INSERT' then null else to_jsonb(old) end
    ),
    timeout_milliseconds := 30000
  );
  return null;
end $$;

drop trigger if exists titles_notify_google_sheet on public.titles;
create trigger titles_notify_google_sheet
  after insert or update or delete on public.titles
  for each row execute function public.notify_google_sheet();
