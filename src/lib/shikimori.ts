import "server-only";
import { SHIKIMORI_URL as SHIKIMORI, type SearchResult, type TitleDetails } from "./types";

// Anime come from Shikimori. Its id and score are stored in tmdb_id / tmdb_rating so anime rows
// work with the same matching, duplicate checks and crowd comparisons as TMDB titles.

const DAY = 60 * 60 * 24;

export class ShikimoriError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

interface RawAnime {
  id: string;
  name: string;
  russian: string | null;
  english: string | null;
  kind: string | null;
  score: number | null;
  status: string | null;
  episodes: number;
  duration: number | null;
  airedOn: { year: number | null } | null;
  poster: { originalUrl: string; mainUrl: string } | null;
  genres?: { name: string; kind: string }[];
  description?: string | null;
  studios?: { name: string }[];
  screenshots?: { originalUrl: string }[];
  videos?: { url: string; kind: string }[];
  characterRoles?: { rolesEn: string[]; character: { name: string; poster: { mainUrl: string } | null } }[];
}

const BASE_FIELDS = "id name russian english kind score status episodes duration airedOn { year } poster { originalUrl mainUrl }";
const DETAIL_FIELDS = `${BASE_FIELDS} genres { name kind } description studios { name } screenshots { originalUrl } videos { url kind } characterRoles { rolesEn character { name poster { mainUrl } } }`;

async function query<T>(gql: string, revalidate = DAY): Promise<T> {
  const res = await fetch(`${SHIKIMORI}/api/graphql`, {
    method: "POST",
    // Shikimori blocks requests without an application User-Agent.
    headers: { "Content-Type": "application/json", "User-Agent": "kinokrit" },
    body: JSON.stringify({ query: gql }),
    next: { revalidate },
  });
  if (!res.ok) throw new ShikimoriError(`Shikimori responded ${res.status}`, res.status === 429 ? 429 : 502);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!body.data) throw new ShikimoriError(body.errors?.[0]?.message ?? "Shikimori returned no data");
  return body.data;
}

const nameOf = (a: RawAnime) => a.english || a.name;
const rating = (n: number | null) => (n ? Math.round(n * 10) / 10 : null);
// Descriptions carry BBCode like [character=1]Frieren[/character].
const plain = (s?: string | null) => s?.replace(/\[\/?[a-z_]+(=[^\]]*)?\]/gi, "").trim() || null;

function toSearchResult(a: RawAnime): SearchResult {
  return {
    tmdb_id: Number(a.id),
    media_type: "anime",
    name: nameOf(a),
    year: a.airedOn?.year ?? null,
    poster_path: a.poster?.mainUrl ?? null,
    overview: a.russian && a.russian !== nameOf(a) ? a.russian : null,
    tmdb_rating: rating(a.score),
  };
}

function toDetails(a: RawAnime): TitleDetails {
  const youtube = (kind: string) => a.videos?.find((v) => v.kind === kind && /youtu/.test(v.url));
  const trailer = youtube("pv") ?? youtube("cm") ?? youtube("op");
  const trailerKey = trailer?.url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)?.[1] ?? null;
  return {
    ...toSearchResult(a),
    poster_path: a.poster?.originalUrl ?? a.poster?.mainUrl ?? null,
    backdrop_path: a.screenshots?.[0]?.originalUrl ?? null,
    overview: plain(a.description),
    genres: (a.genres ?? []).filter((g) => g.kind === "genre" || g.kind === "theme").map((g) => g.name),
    imdb_id: null,
    imdb_rating: null,
    runtime: a.duration || null,
    tagline: a.russian && a.russian !== nameOf(a) ? a.russian : null,
    status: a.status,
    creators: (a.studios ?? []).map((s) => s.name),
    cast: (a.characterRoles ?? [])
      .filter((r) => r.rolesEn.includes("Main"))
      .slice(0, 12)
      .map((r) => ({ name: r.character.name, character: null, profile_path: r.character.poster?.mainUrl ?? null })),
    trailer_key: trailerKey,
    seasons: null,
    episodes: a.episodes || null,
  };
}

export async function searchAnime(q: string): Promise<SearchResult[]> {
  const data = await query<{ animes: RawAnime[] }>(`{ animes(search: ${JSON.stringify(q)}, limit: 10) { ${BASE_FIELDS} } }`);
  return data.animes.map(toSearchResult);
}

export async function animeDetails(id: number): Promise<TitleDetails> {
  const [a] = await detailsMany([id]);
  if (!a) throw new ShikimoriError("Anime not found on Shikimori", 404);
  return a;
}

/** Up to 50 ids per request, in any order. */
export async function detailsMany(ids: number[]): Promise<TitleDetails[]> {
  const out: TitleDetails[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await query<{ animes: RawAnime[] }>(`{ animes(ids: "${chunk.join(",")}", limit: 50) { ${DETAIL_FIELDS} } }`);
    out.push(...data.animes.map(toDetails));
  }
  return out;
}

export interface ShikimoriRate {
  shikimori_id: number;
  status: "planned" | "watching" | "rewatching" | "completed" | "on_hold" | "dropped";
  score: number;
  episodes: number;
}

/** A user's public anime list. Private lists answer 403. */
export async function userRates(nickname: string): Promise<ShikimoriRate[]> {
  const res = await fetch(`${SHIKIMORI}/api/users/${encodeURIComponent(nickname)}/anime_rates?limit=5000`, {
    headers: { "User-Agent": "kinokrit" },
    cache: "no-store",
  });
  if (res.status === 404) throw new ShikimoriError(`No Shikimori user “${nickname}”`, 404);
  if (res.status === 403) throw new ShikimoriError("This Shikimori list is private", 403);
  if (!res.ok) throw new ShikimoriError(`Shikimori responded ${res.status}`, 502);
  const rates = (await res.json()) as { status: ShikimoriRate["status"]; score: number; episodes: number; anime: { id: number } | null }[];
  return rates
    .filter((r) => r.anime)
    .map((r) => ({ shikimori_id: r.anime!.id, status: r.status, score: r.score, episodes: r.episodes }));
}
