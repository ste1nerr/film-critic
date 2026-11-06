import type { NextRequest } from "next/server";
import { detailsMany, ShikimoriError, userRates } from "@/lib/shikimori";

/** A Shikimori user's anime list with full details for each entry. */
export async function GET(request: NextRequest) {
  const nickname = request.nextUrl.searchParams.get("nickname")?.trim() ?? "";
  if (!nickname) return Response.json({ error: "Expected ?nickname=<shikimori nickname>" }, { status: 400 });
  try {
    const rates = await userRates(nickname);
    const details = new Map((await detailsMany(rates.map((r) => r.shikimori_id))).map((d) => [d.tmdb_id, d]));
    const entries = rates.flatMap((rate) => {
      const d = details.get(rate.shikimori_id);
      return d ? [{ ...rate, details: d }] : [];
    });
    return Response.json({ entries });
  } catch (e) {
    const status = e instanceof ShikimoriError ? e.status : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
