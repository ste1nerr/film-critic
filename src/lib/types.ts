export type MediaType = "movie" | "tv";

export const CRITERIA = [
  { key: "plot", label: "Plot" },
  { key: "ending", label: "Ending" },
  { key: "acting", label: "Acting" },
  { key: "atmosphere", label: "Atmosphere", hint: "camera, music, locations" },
  { key: "vibe", label: "Vibe", hint: "personally appealing" },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]["key"];
export type Ratings = Record<CriterionKey, number>;

/** Everything we cache from TMDB/OMDb on a title row. */
export interface TitleMeta {
  tmdb_id: number | null;
  media_type: MediaType;
  name: string;
  year: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  genres: string[];
  tmdb_rating: number | null;
  imdb_id: string | null;
  imdb_rating: number | null;
  runtime: number | null;
}

export interface Title extends TitleMeta, Ratings {
  id: string;
  user_id: string;
  overall: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type TitleInput = TitleMeta & Ratings & { note?: string | null };

export interface SearchResult {
  tmdb_id: number;
  media_type: MediaType;
  name: string;
  year: number | null;
  poster_path: string | null;
  overview: string | null;
  tmdb_rating: number | null;
}

export interface CastMember {
  name: string;
  character: string | null;
  profile_path: string | null;
}

export interface TitleDetails extends TitleMeta {
  tagline: string | null;
  status: string | null;
  creators: string[];
  cast: CastMember[];
  trailer_key: string | null;
  seasons: number | null;
  episodes: number | null;
}
