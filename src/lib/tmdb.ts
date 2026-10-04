import "server-only";
import type { CastMember, MediaType, SearchResult, TitleDetails } from "./types";

const BASE = "https://api.themoviedb.org/3";
const DAY = 60 * 60 * 24;

export class TmdbError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

function language() {
  return process.env.TMDB_LANGUAGE || "en-US";
}

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new TmdbError("TMDB_API_KEY is not set", 503);

  const url = new URL(BASE + path);
  url.searchParams.set("language", language());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  // v4 read access tokens are long JWTs; v3 keys are 32 hex chars.
  const headers: HeadersInit = {};
  if (key.length > 40) headers.Authorization = `Bearer ${key}`;
  else url.searchParams.set("api_key", key);

  const res = await fetch(url, { headers, next: { revalidate: DAY } });
  if (!res.ok) throw new TmdbError(`TMDB responded ${res.status}`, res.status === 404 ? 404 : 502);
  return res.json() as Promise<T>;
}

const yearOf = (date?: string | null) => (date ? Number(date.slice(0, 4)) || null : null);
const rating = (n?: number | null) => (n ? Math.round(n * 10) / 10 : null);

interface RawSearchItem {
  id: number;
  media_type: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  overview?: string;
  vote_average?: number;
  popularity?: number;
}

/** Multi-search movies + TV. A trailing "(2019)" in the query is used to prefer that year. */
export async function search(query: string): Promise<SearchResult[]> {
  const m = query.match(/^(.*?)\s*\((\d{4})\)\s*$/);
  const text = (m ? m[1] : query).trim();
  const wantYear = m ? Number(m[2]) : null;
  if (!text) return [];

  const data = await tmdb<{ results: RawSearchItem[] }>("/search/multi", {
    query: text,
    include_adult: "false",
  });

  const results: SearchResult[] = data.results
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .map((r) => ({
      tmdb_id: r.id,
      media_type: r.media_type as MediaType,
      name: r.title ?? r.name ?? "",
      year: yearOf(r.release_date ?? r.first_air_date),
      poster_path: r.poster_path,
      overview: r.overview || null,
      tmdb_rating: rating(r.vote_average),
    }));

  if (wantYear) results.sort((a, b) => Number(b.year === wantYear) - Number(a.year === wantYear));
  return results.slice(0, 10);
}

interface RawDetails {
  id: number;
  title?: string;
  name?: string;
  tagline?: string;
  status?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: { name: string }[];
  vote_average?: number;
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  created_by?: { name: string }[];
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
  credits?: {
    cast: { name: string; character?: string; profile_path: string | null }[];
    crew: { name: string; job: string }[];
  };
  videos?: { results: { key: string; site: string; type: string; official?: boolean }[] };
}

export async function details(type: MediaType, id: number): Promise<TitleDetails> {
  const lang2 = language().slice(0, 2);
  const d = await tmdb<RawDetails>(`/${type}/${id}`, {
    append_to_response: "credits,videos,external_ids",
    include_video_language: `${lang2},en,null`,
  });

  const imdb_id = d.imdb_id ?? d.external_ids?.imdb_id ?? null;
  const videos = d.videos?.results.filter((v) => v.site === "YouTube") ?? [];
  const trailer =
    videos.find((v) => v.type === "Trailer" && v.official) ??
    videos.find((v) => v.type === "Trailer") ??
    videos.find((v) => v.type === "Teaser");

  const creators =
    type === "movie"
      ? (d.credits?.crew.filter((c) => c.job === "Director").map((c) => c.name) ?? [])
      : (d.created_by?.map((c) => c.name) ?? []);

  const cast: CastMember[] = (d.credits?.cast ?? []).slice(0, 12).map((c) => ({
    name: c.name,
    character: c.character || null,
    profile_path: c.profile_path,
  }));

  return {
    tmdb_id: d.id,
    media_type: type,
    name: d.title ?? d.name ?? "",
    year: yearOf(d.release_date ?? d.first_air_date),
    poster_path: d.poster_path,
    backdrop_path: d.backdrop_path,
    overview: d.overview || null,
    genres: d.genres.map((g) => g.name),
    tmdb_rating: rating(d.vote_average),
    imdb_id,
    imdb_rating: imdb_id ? await imdbRating(imdb_id) : null,
    runtime: d.runtime || d.episode_run_time?.[0] || null,
    tagline: d.tagline || null,
    status: d.status || null,
    creators,
    cast,
    trailer_key: trailer?.key ?? null,
    seasons: d.number_of_seasons ?? null,
    episodes: d.number_of_episodes ?? null,
  };
}

async function imdbRating(imdbId: string): Promise<number | null> {
  const key = process.env.OMDB_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${key}`, {
      next: { revalidate: DAY },
    });
    const data = (await res.json()) as { imdbRating?: string };
    const n = Number(data.imdbRating);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
