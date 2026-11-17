"use client";

import { useEffect, useState } from "react";
import { formatScore, scoreTone } from "@/lib/score";
import { supabase } from "@/lib/supabase";

/**
 * Per-season "watched" marks with an optional 1–5 score. A row in title_seasons = watched;
 * rating null = watched but not scored. Folded until opened or until a season is marked.
 */
export function SeasonRatings({ titleId, count }: { titleId: string; count: number }) {
  // season → score (null = watched, no score); a missing key = not watched.
  const [seasons, setSeasons] = useState<Record<number, number | null>>({});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase
      .from("title_seasons")
      .select("season, rating")
      .eq("title_id", titleId)
      .then(({ data }) => {
        if (!alive || !data?.length) return;
        setSeasons(Object.fromEntries(data.map((r) => [r.season, r.rating])));
        setOpen(true);
      });
    return () => {
      alive = false;
    };
  }, [titleId]);

  /** undefined = unmark watched; null = watched without a score; a number = watched with that score. */
  async function save(season: number, rating: number | null | undefined) {
    if (!supabase) return;
    const previous = seasons;
    setSeasons((s) => {
      const next = { ...s };
      if (rating === undefined) delete next[season];
      else next[season] = rating;
      return next;
    });
    const { error } =
      rating === undefined
        ? await supabase.from("title_seasons").delete().eq("title_id", titleId).eq("season", season)
        : await supabase.from("title_seasons").upsert({ title_id: titleId, season, rating, updated_at: new Date().toISOString() });
    if (error) {
      setSeasons(previous);
      alert(error.message);
    }
  }

  const watched = Object.keys(seasons).length;
  const rated = Object.values(seasons).filter((n): n is number => n != null);
  const avg = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted hover:text-foreground">
        Track seasons (optional)
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between text-xs text-muted">
        <span>
          {watched}/{count} watched · tap + to mark
        </span>
        {avg != null && <span>Avg {formatScore(avg)}</span>}
      </div>
      <div className="space-y-2">
        {Array.from({ length: count }, (_, i) => i + 1).map((season) => {
          const isWatched = season in seasons;
          return (
            <div key={season} className="flex min-h-8 items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void save(season, isWatched ? undefined : null)}
                  aria-pressed={isWatched}
                  aria-label={isWatched ? `Unmark season ${season} as watched` : `Mark season ${season} as watched`}
                  title={isWatched ? "Watched — tap to unmark" : "Mark as watched"}
                  className={`grid h-7 w-7 place-items-center rounded-full text-sm font-semibold transition ${
                    isWatched ? "bg-accent text-black" : "border border-dashed border-border text-muted hover:border-accent hover:text-accent"
                  }`}
                >
                  {isWatched ? "✓" : "+"}
                </button>
                <span className={`text-sm font-medium ${isWatched ? "" : "text-muted"}`}>Season {season}</span>
              </div>
              {isWatched && (
                <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={`Season ${season} score`}>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const active = seasons[season] === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        // Tapping the current score again clears it; the season stays watched.
                        onClick={() => void save(season, active ? null : n)}
                        className={`h-8 w-8 rounded-lg text-sm font-semibold tabular-nums transition ${
                          active ? `${scoreTone(n)} scale-105` : "bg-surface-2 text-muted hover:bg-border hover:text-foreground"
                        }`}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
