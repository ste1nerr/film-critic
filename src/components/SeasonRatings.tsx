"use client";

import { useEffect, useState } from "react";
import { formatScore, scoreTone } from "@/lib/score";
import { supabase } from "@/lib/supabase";

/** Optional 1–5 per season. Folded until opened or until a season has a score; the title's own rating is separate. */
export function SeasonRatings({ titleId, count }: { titleId: string; count: number }) {
  const [scores, setScores] = useState<Record<number, number>>({});
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
        setScores(Object.fromEntries(data.map((r) => [r.season, r.rating])));
        setOpen(true);
      });
    return () => {
      alive = false;
    };
  }, [titleId]);

  async function rate(season: number, n: number) {
    if (!supabase) return;
    const previous = scores;
    // Tapping the current score again clears it.
    const clear = scores[season] === n;
    setScores((s) => {
      const next = { ...s, [season]: n };
      if (clear) delete next[season];
      return next;
    });
    const { error } = clear
      ? await supabase.from("title_seasons").delete().eq("title_id", titleId).eq("season", season)
      : await supabase.from("title_seasons").upsert({ title_id: titleId, season, rating: n, updated_at: new Date().toISOString() });
    if (error) {
      setScores(previous);
      alert(error.message);
    }
  }

  const rated = Object.values(scores);
  const avg = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted hover:text-foreground">
        Rate seasons (optional)
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between text-xs text-muted">
        <span>Tap a score again to clear it</span>
        {avg != null && <span>Avg {formatScore(avg)}</span>}
      </div>
      <div className="space-y-2">
        {Array.from({ length: count }, (_, i) => i + 1).map((season) => (
          <div key={season} className="flex items-center justify-between gap-4">
            <div className="text-sm font-medium">Season {season}</div>
            <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={`Season ${season}`}>
              {[1, 2, 3, 4, 5].map((n) => {
                const active = scores[season] === n;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => void rate(season, n)}
                    className={`h-8 w-8 rounded-lg text-sm font-semibold tabular-nums transition ${
                      active ? `${scoreTone(n)} scale-105` : "bg-surface-2 text-muted hover:bg-border hover:text-foreground"
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
