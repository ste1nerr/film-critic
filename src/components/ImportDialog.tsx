"use client";

import { useState } from "react";
import { emptyMeta, fetchDetails, mapLimit, metaOf, searchTitles } from "@/lib/api";
import { overallOf } from "@/lib/score";
import { parseRatingsFile, type ParsedRow } from "@/lib/spreadsheet";
import { useStore } from "@/lib/store";
import type { SearchResult, Title, TitleInput } from "@/lib/types";
import { Button, Modal, Poster, ScoreBadge, Spinner } from "./ui";

interface Candidate {
  row: ParsedRow;
  options: SearchResult[];
  /** index into options, or -1 for "no TMDB match" */
  choice: number;
  existing: Title | undefined;
}

type Stage =
  | { kind: "pick" }
  | { kind: "matching"; done: number; total: number }
  | { kind: "review"; candidates: Candidate[]; skipped: string[] }
  | { kind: "saving"; done: number; total: number }
  | { kind: "done"; count: number };

const key = (r: { media_type: string; tmdb_id: number | null }) => `${r.media_type}:${r.tmdb_id}`;

export function ImportDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { titles, importTitles } = useStore();
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (stage.kind === "matching" || stage.kind === "saving") return;
    setStage({ kind: "pick" });
    setError(null);
    onClose();
  }

  function findExisting(row: ParsedRow, match: SearchResult | undefined) {
    if (match) {
      const byId = titles.find((t) => key(t) === key(match));
      if (byId) return byId;
    }
    const name = row.name.toLowerCase();
    return titles.find((t) => t.name.toLowerCase() === name);
  }

  async function onFile(file: File) {
    setError(null);
    try {
      const { rows, skipped } = await parseRatingsFile(file);
      if (!rows.length) throw new Error("No rows with all five ratings were found.");
      setStage({ kind: "matching", done: 0, total: rows.length });

      let done = 0;
      const candidates = await mapLimit(rows, 4, async (row): Promise<Candidate> => {
        let options: SearchResult[] = [];
        try {
          options = await searchTitles(row.name);
          if (row.media_type) {
            // Prefer the type stated in the file, keep the rest as alternatives.
            options.sort((a, b) => Number(b.media_type === row.media_type) - Number(a.media_type === row.media_type));
          }
          if (row.tmdb_id) {
            const exact = options.findIndex((o) => o.tmdb_id === row.tmdb_id);
            if (exact > 0) options.unshift(...options.splice(exact, 1));
          }
        } catch {
          // leave unmatched; the user can still import without TMDB data
        }
        setStage({ kind: "matching", done: ++done, total: rows.length });
        const choice = options.length ? 0 : -1;
        return { row, options, choice, existing: findExisting(row, options[0]) };
      });

      setStage({ kind: "review", candidates, skipped });
    } catch (e) {
      setError((e as Error).message);
      setStage({ kind: "pick" });
    }
  }

  function setChoice(i: number, choice: number) {
    if (stage.kind !== "review") return;
    const candidates = stage.candidates.slice();
    const c = candidates[i];
    candidates[i] = { ...c, choice, existing: findExisting(c.row, c.options[choice]) };
    setStage({ ...stage, candidates });
  }

  async function confirm() {
    if (stage.kind !== "review") return;
    const { candidates } = stage;
    setStage({ kind: "saving", done: 0, total: candidates.length });
    try {
      let done = 0;
      const rows = await mapLimit(candidates, 4, async (c): Promise<TitleInput & { id?: string }> => {
        const match = c.options[c.choice];
        let meta = emptyMeta(c.row.name, c.row.media_type ?? "movie");
        if (match) {
          try {
            meta = metaOf(await fetchDetails(match.media_type, match.tmdb_id));
          } catch {
            meta = { ...meta, tmdb_id: match.tmdb_id, media_type: match.media_type, name: match.name, year: match.year, poster_path: match.poster_path, overview: match.overview, tmdb_rating: match.tmdb_rating };
          }
        }
        setStage({ kind: "saving", done: ++done, total: candidates.length });
        return { ...meta, ...c.row.ratings, note: c.row.note ?? c.existing?.note ?? null, id: c.existing?.id };
      });
      await importTitles(rows);
      setStage({ kind: "done", count: rows.length });
    } catch (e) {
      setError((e as Error).message);
      setStage({ kind: "review", candidates, skipped: [] });
    }
  }

  return (
    <Modal open={open} onClose={close} title="Import ratings" wide>
      {error && <p className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

      {stage.kind === "pick" && (
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-6 py-12 text-center transition hover:border-accent">
            <span className="text-4xl">🎞️</span>
            <span className="font-medium">Choose a CSV or Excel file</span>
            <span className="text-sm text-muted">
              Columns: Name, Plot, Ending, Acting, Atmosphere, Vibe. Type, Note and TMDB ID are optional.
            </span>
            <input
              type="file"
              accept=".csv,.tsv,.xlsx,.xls,.ods"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
          <p className="text-sm text-muted">
            From Google Sheets: <span className="text-foreground">File → Download → Comma-separated values (.csv)</span>.
            Each title is matched on TMDB automatically, and you can review every match before importing.
          </p>
        </div>
      )}

      {(stage.kind === "matching" || stage.kind === "saving") && (
        <div className="flex flex-col items-center gap-4 py-12">
          <Spinner className="size-8 text-accent" />
          <div className="text-sm text-muted">
            {stage.kind === "matching" ? "Finding titles on TMDB" : "Fetching details and saving"} · {stage.done}/{stage.total}
          </div>
          <div className="h-1.5 w-64 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-accent transition-all" style={{ width: `${(stage.done / stage.total) * 100}%` }} />
          </div>
        </div>
      )}

      {stage.kind === "review" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {stage.candidates.length} titles · {stage.candidates.filter((c) => c.existing).length} already in your list will be
            updated. Check the matches, especially remakes and same-name titles.
          </p>
          {stage.skipped.length > 0 && (
            <p className="text-sm text-amber-200">Skipped (missing ratings): {stage.skipped.join(", ")}</p>
          )}
          <ul className="divide-y divide-border rounded-xl border border-border">
            {stage.candidates.map((c, i) => {
              const match = c.options[c.choice];
              return (
                <li key={i} className="flex items-center gap-3 p-2.5">
                  <Poster path={match?.poster_path ?? null} alt="" size="w92" className="h-14 w-10 shrink-0 rounded text-[0px]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{c.row.name}</span>
                      {c.existing ? (
                        <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-300">update</span>
                      ) : (
                        <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-300">new</span>
                      )}
                    </div>
                    <select
                      value={c.choice}
                      onChange={(e) => setChoice(i, Number(e.target.value))}
                      className="mt-1 w-full max-w-sm truncate rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-muted outline-none focus:border-accent"
                    >
                      {c.options.map((o, j) => (
                        <option key={j} value={j}>
                          {o.name} ({o.year ?? "—"}) · {o.media_type === "tv" ? "Series" : "Movie"}
                        </option>
                      ))}
                      <option value={-1}>No TMDB match: keep as plain entry</option>
                    </select>
                  </div>
                  <ScoreBadge value={overallOf(c.row.ratings)} size="sm" />
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setStage({ kind: "pick" })}>Back</Button>
            <Button variant="primary" onClick={confirm}>
              Import {stage.candidates.length} titles
            </Button>
          </div>
        </div>
      )}

      {stage.kind === "done" && (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="text-5xl">🍿</span>
          <div className="text-lg font-semibold">Imported {stage.count} titles</div>
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        </div>
      )}
    </Modal>
  );
}
