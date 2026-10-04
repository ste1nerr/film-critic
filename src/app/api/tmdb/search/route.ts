import type { NextRequest } from "next/server";
import { search, TmdbError } from "@/lib/tmdb";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json({ results: [] });
  try {
    return Response.json({ results: await search(q) });
  } catch (e) {
    const status = e instanceof TmdbError ? e.status : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
