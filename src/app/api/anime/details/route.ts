import type { NextRequest } from "next/server";
import { animeDetails, ShikimoriError } from "@/lib/shikimori";

export async function GET(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Expected ?id=<shikimori id>" }, { status: 400 });
  }
  try {
    return Response.json(await animeDetails(id));
  } catch (e) {
    const status = e instanceof ShikimoriError ? e.status : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
