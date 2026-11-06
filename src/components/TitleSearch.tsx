"use client";

import { useEffect, useState } from "react";
import { searchTitles, type Source } from "@/lib/api";
import { TYPE_LABEL, type SearchResult } from "@/lib/types";
import { Poster, Spinner } from "./ui";

const SOURCES: { value: Source; label: string; placeholder: string }[] = [
  { value: "tmdb", label: "Movies & series", placeholder: "Search movies and series…" },
  { value: "anime", label: "Anime", placeholder: "Search anime on Shikimori…" },
];

/** Debounced search with poster results: TMDB for movies and series, Shikimori for anime. */
export function TitleSearch({
  initialQuery = "",
  initialSource = "tmdb",
  onPick,
  footer,
}: {
  initialQuery?: string;
  initialSource?: Source;
  onPick(result: SearchResult): void;
  footer?: (query: string, source: Source) => React.ReactNode;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [source, setSource] = useState(initialSource);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      searchTitles(q, ctrl.signal, source)
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
  }, [query, source]);

  const shown = query.trim().length < 2 ? [] : results;

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl border border-border bg-surface-2/60 p-1 text-sm">
        {SOURCES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => {
              setSource(s.value);
              setResults([]);
            }}
            className={`flex-1 rounded-lg px-3 py-1.5 transition ${source === s.value ? "bg-accent font-semibold text-black" : "text-muted hover:text-foreground"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={SOURCES.find((s) => s.value === source)?.placeholder}
          className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 outline-none placeholder:text-muted focus:border-accent"
        />
        {loading && <Spinner className="absolute right-4 top-1/2 -translate-y-1/2 text-muted" />}
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      {/* Keeps the dialog from resizing on every keystroke while results come and go. */}
      <ul className={`space-y-1 ${query.trim().length >= 2 ? "min-h-72" : ""}`}>
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
                  {r.year ?? "—"} · {TYPE_LABEL[r.media_type]}
                  {r.tmdb_rating ? ` · ★ ${r.tmdb_rating}` : ""}
                </div>
                {r.overview && <div className="mt-0.5 line-clamp-1 text-xs text-muted/80">{r.overview}</div>}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {footer?.(query.trim(), source)}
    </div>
  );
}
