import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** null until the Supabase env vars are set — the UI shows setup steps instead. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
