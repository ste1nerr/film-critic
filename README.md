# Film Critic

Rate movies and series on five criteria (plot, ending, acting, atmosphere, vibe). Posters, descriptions, trailers and cast come from TMDB. Ratings sync live across devices, and you can import or export CSV/Excel.

Stack: Next.js 16 · Supabase (Postgres, auth, realtime) · TMDB API · optional OMDb for IMDb ratings. Every service has a free tier that covers this.

## Setup

1. **Supabase**: create a project at [supabase.com](https://supabase.com), then open SQL Editor and run [`supabase/schema.sql`](supabase/schema.sql).
   To sign in without confirming your email: Authentication → Sign In / Providers → Email → turn off "Confirm email".
2. **TMDB**: create an account at [themoviedb.org](https://www.themoviedb.org), then go to Settings → API and request a key (choose "Developer", personal use).
3. **OMDb** (optional, adds IMDb ratings): get a free key at [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx).
4. Copy the env file and fill it in:
   ```bash
   cp .env.example .env.local
   ```
5. Start it:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000, create an account, and use **Import** to load your spreadsheet. From Google Sheets, export it with File → Download → CSV.

## Deploy (Vercel)

Push to GitHub, import the repo on [vercel.com](https://vercel.com), and add the same env vars from `.env.local`.

Supabase pauses free projects after 7 days without activity. Resume one from the dashboard; your data stays.
