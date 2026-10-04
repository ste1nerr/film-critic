import type { NextRequest } from "next/server";
import { details, TmdbError } from "@/lib/tmdb";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const type = params.get("type");
  const id = Number(params.get("id"));
  if ((type !== "movie" && type !== "tv") || !Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Expected ?type=movie|tv&id=<tmdb id>" }, { status: 400 });
  }
  try {
    return Response.json(await details(type, id));
  } catch (e) {
    const status = e instanceof TmdbError ? e.status : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
