import { CRITERIA, type MaybeRatings, type Ratings } from "./types";

export function overallOf(r: Ratings): number;
export function overallOf(r: MaybeRatings): number | null;
export function overallOf(r: MaybeRatings): number | null {
  if (CRITERIA.some((c) => r[c.key] == null)) return null;
  const sum = CRITERIA.reduce((acc, c) => acc + (r[c.key] ?? 0), 0);
  return Math.round((sum / CRITERIA.length) * 10) / 10;
}

export function formatScore(n: number | null | undefined): string {
  return n == null ? "—" : n.toFixed(1);
}

/** Tailwind classes for a 1–5 score badge. */
export function scoreTone(n: number): string {
  if (n >= 4) return "bg-emerald-500 text-emerald-950";
  if (n >= 3) return "bg-lime-400 text-lime-950";
  if (n >= 2) return "bg-amber-400 text-amber-950";
  return "bg-rose-500 text-rose-50";
}

/** Raw color for SVG charts, same scale as scoreTone. */
export function scoreColor(n: number): string {
  if (n >= 4) return "#10b981";
  if (n >= 3) return "#a3e635";
  if (n >= 2) return "#fbbf24";
  return "#f43f5e";
}

export function tmdbImage(path: string | null, size: "w92" | "w185" | "w342" | "w500" | "w780" | "w1280" | "original" = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}
