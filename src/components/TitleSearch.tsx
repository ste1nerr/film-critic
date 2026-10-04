"use client";

import { useEffect, useState } from "react";
import { searchTitles } from "@/lib/api";
import type { SearchResult } from "@/lib/types";
import { Poster, Spinner } from "./ui";

/** Debounced TMDB search with poster results. */
export function TitleSearch({
  initialQuery = "",
  onPick,
  footer,
}: {
  initialQuery?: string;
  onPick(result: SearchResult): void;
  footer?: (query: string) => React.ReactNode;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      searchTitles(q, ctrl.signal)
        .then((r) => {
          setResults(r);
          setError(null);
        })
        .catch((e) => !ctrl.signal.aborted && setError(e.message))
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  const shown = query.trim().length < 2 ? [] : results;

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search movies and series…"
          className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 outline-none placeholder:text-muted focus:border-accent"
        />
        {loading && <Spinner className="absolute right-4 top-1/2 -translate-y-1/2 text-muted" />}
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <ul className="space-y-1">
        {shown.map((r) => (
          <li key={`${r.media_type}-${r.tmdb_id}`}>
            <button
              type="button"
              onClick={() => onPick(r)}
              className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-surface-2"
            >
              <Poster path={r.poster_path} alt={r.name} size="w92" className="h-16 w-11 shrink-0 rounded-md text-[0px]" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name}</div>
                <div className="text-xs text-muted">
                  {r.year ?? "—"} · {r.media_type === "tv" ? "Series" : "Movie"}
                  {r.tmdb_rating ? ` · ★ ${r.tmdb_rating}` : ""}
                </div>
                {r.overview && <div className="mt-0.5 line-clamp-1 text-xs text-muted/80">{r.overview}</div>}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {footer?.(query.trim())}
    </div>
  );
}
