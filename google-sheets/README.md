# Google Sheets sync

Two-way sync between the site and one Google spreadsheet with two tabs: `кінокритик` (movies) and `серікритик` (series). Edit a rating in either place and it shows up in the other within a few seconds.

## Setup

1. **Database**: run [`supabase/watchlist.sql`](../supabase/watchlist.sql) in Supabase → SQL Editor (skip it on a fresh install from `schema.sql`).
2. **Script**: open the movies spreadsheet → Extensions → Apps Script, replace `Code.gs` with [`Code.gs`](Code.gs), save.
3. **Script properties** (Project Settings → Script Properties):
   | Property | Value |
   |---|---|
   | `SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` from `.env.local` |
   | `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API keys → `service_role` / secret key |
   | `USER_ID` | Supabase → Authentication → Users → your user's UID |
   | `APP_URL` | the deployed site, e.g. `https://film-critic.vercel.app` |
   | `SERIES_SPREADSHEET_ID` | link to the old series spreadsheet (only for the one-time migration) |
4. **Web app**: Deploy → New deployment → Web app, Execute as **Me**, Who has access **Anyone**.
5. Reload the spreadsheet. In the **Film critic** menu run, in order:
   1. **Налаштувати**: installs the edit trigger and a nightly full sync.
   2. **Перенести старі таблиці**: builds both tabs from the old sheets (kept as `(старе)` backups) and links every row to the site.
   3. **SQL для Supabase**: copy the SQL and run it in Supabase → SQL Editor.

## How rows behave

- A name with no ratings is on the watchlist. Five ratings make it rated. Some but not all five aren't saved yet.
- A new row is matched on TMDB by name. Text in brackets like `(1 season)` moves to the note, and `(1995)` is used as the year.
- Yellow name: not found on TMDB. Red: invalid rating or an error (hover for the note).
- Delete rows through **Film critic → Видалити вибрані рядки**. A row deleted by hand comes back on the next full sync.
- `Overall rating` and the hidden `id` column are managed by the script.

To turn the sync off: `drop trigger titles_notify_google_sheet on public.titles;` in Supabase.
