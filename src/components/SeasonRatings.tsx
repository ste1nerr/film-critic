"use client";

import { useEffect, useState } from "react";
import { formatScore } from "@/lib/score";
import { supabase } from "@/lib/supabase";
import { CRITERIA, NO_RATINGS, type CriterionKey, type MaybeRatings } from "@/lib/types";
import { RatingEditor } from "./RatingEditor";
import { ScoreBadge } from "./ui";

/** Average of the criteria that are set, like the overall column in title_seasons; null while none is. */
function seasonScore(r: MaybeRatings): number | null {
  const set = CRITERIA.map((c) => r[c.key]).filter((n): n is number => n != null);
  return set.length ? Math.round((set.reduce((a, b) => a + b, 0) / set.length) * 10) / 10 : null;
}

/**
 * Per-season "watched" marks, each scored on the same five criteria as the title. A row in
 * title_seasons = watched; any criterion may stay empty. Folded until opened or until a season is marked.
 */
export function SeasonRatings({
  titleId,
  count,
  onAverage,
}: {
  titleId: string;
  count: number;
  /** The scored seasons' average (null when none is scored), the way the database trigger keeps it on the title. */
  onAverage(avg: number | null): void;
}) {
  // season → its criteria; a missing key = not watched.
  const [seasons, setSeasons] = useState<Record<number, MaybeRatings>>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase
      .from("title_seasons")
      .select("season, plot, ending, acting, atmosphere, vibe")
      .eq("title_id", titleId)
      .then(({ data }) => {
        if (!alive) return;
        setLoaded(true);
        if (!data?.length) return;
        setSeasons(Object.fromEntries(data.map(({ season, ...r }) => [season, { ...NO_RATINGS, ...r }])));
        setOpen(true);
      });
    return () => {
      alive = false;
    };
  }, [titleId]);

  async function write(season: number, run: () => PromiseLike<{ error: { message: string } | null }>, next: Record<number, MaybeRatings>) {
    const previous = seasons;
    setSeasons(next);
    const { error } = await run();
    if (error) {
      setSeasons(previous);
      alert(error.message);
    }
  }

  function toggleWatched(season: number) {
    if (!supabase) return;
    const db = supabase;
    if (season in seasons) {
      const next = { ...seasons };
      delete next[season];
      if (editing === season) setEditing(null);
      void write(season, () => db.from("title_seasons").delete().eq("title_id", titleId).eq("season", season), next);
    } else {
      setEditing(season);
      void write(season, () => db.from("title_seasons").upsert({ title_id: titleId, season, updated_at: new Date().toISOString() }), { ...seasons, [season]: NO_RATINGS });
    }
  }

  function rate(season: number, key: CriterionKey, n: number) {
    if (!supabase) return;
    const db = supabase;
    // Tapping the current score again clears it; the season stays watched.
    const value = seasons[season]?.[key] === n ? null : n;
    void write(
      season,
      () => db.from("title_seasons").upsert({ title_id: titleId, season, [key]: value, updated_at: new Date().toISOString() }),
      { ...seasons, [season]: { ...(seasons[season] ?? NO_RATINGS), [key]: value } },
    );
  }

  const watched = Object.keys(seasons).length;
  const scores = Object.values(seasons).map(seasonScore).filter((n): n is number => n != null);
  const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

  // Until the rows arrive the empty state would read as "no scored seasons" and wipe the title's value.
  useEffect(() => {
    if (loaded) onAverage(avg);
  }, [loaded, avg, onAverage]);

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
      <div className="divide-y divide-border/60">
        {Array.from({ length: count }, (_, i) => i + 1).map((season) => {
          const r = seasons[season];
          const score = r ? seasonScore(r) : null;
          const expanded = !!r && editing === season;
          return (
            <div key={season} className="py-2 first:pt-0 last:pb-0">
              <div className="flex min-h-8 items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleWatched(season)}
                  aria-pressed={!!r}
                  aria-label={r ? `Unmark season ${season} as watched` : `Mark season ${season} as watched`}
                  title={r ? "Watched — tap to unmark" : "Mark as watched"}
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold transition ${
                    r ? "bg-accent text-black" : "border border-dashed border-border text-muted hover:border-accent hover:text-accent"
                  }`}
                >
                  {r ? "✓" : "+"}
                </button>
                {r ? (
                  <button
                    type="button"
                    onClick={() => setEditing(expanded ? null : season)}
                    aria-expanded={expanded}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-1 py-0.5 text-left hover:bg-surface-2"
                  >
                    <span className="text-sm font-medium">Season {season}</span>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {score != null ? <ScoreBadge value={score} size="sm" /> : <span>Rate</span>}
                      <span aria-hidden className={`transition ${expanded ? "rotate-180" : ""}`}>
                        ▾
                      </span>
                    </span>
                  </button>
                ) : (
                  <span className="px-1 text-sm font-medium text-muted">Season {season}</span>
                )}
              </div>
              {expanded && (
                <div className="mt-3 pl-9">
                  <RatingEditor value={r} onChange={(k, n) => rate(season, k, n)} />
                  <p className="mt-2 text-xs text-muted">Tap a score again to clear it. Unrated criteria don’t count toward the season score.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
