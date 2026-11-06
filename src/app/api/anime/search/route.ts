import type { NextRequest } from "next/server";
import { searchAnime, ShikimoriError } from "@/lib/shikimori";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json({ results: [] });
  try {
    return Response.json({ results: await searchAnime(q) });
  } catch (e) {
    const status = e instanceof ShikimoriError ? e.status : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
