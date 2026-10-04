import type { MediaType, SearchResult, TitleDetails, TitleMeta } from "./types";

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function searchTitles(q: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const data = await getJson<{ results: SearchResult[] }>(
    `/api/tmdb/search?q=${encodeURIComponent(q)}`,
    signal,
  );
  return data.results;
}

export function fetchDetails(type: MediaType, id: number, signal?: AbortSignal) {
  return getJson<TitleDetails>(`/api/tmdb/details?type=${type}&id=${id}`, signal);
}

/** Just the fields cached on a title row. */
export function metaOf(d: TitleDetails): TitleMeta {
  return {
    tmdb_id: d.tmdb_id,
    media_type: d.media_type,
    name: d.name,
    year: d.year,
    poster_path: d.poster_path,
    backdrop_path: d.backdrop_path,
    overview: d.overview,
    genres: d.genres,
    tmdb_rating: d.tmdb_rating,
    imdb_id: d.imdb_id,
    imdb_rating: d.imdb_rating,
    runtime: d.runtime,
  };
}

export function emptyMeta(name: string, media_type: MediaType = "movie"): TitleMeta {
  return {
    tmdb_id: null,
    media_type,
    name,
    year: null,
    poster_path: null,
    backdrop_path: null,
    overview: null,
    genres: [],
    tmdb_rating: null,
    imdb_id: null,
    imdb_rating: null,
    runtime: null,
  };
}

/** Run `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>) {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
