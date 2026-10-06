"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { emptyMeta, fetchDetails, metaOf } from "@/lib/api";
import { overallOf } from "@/lib/score";
import { useStore } from "@/lib/store";
import { NO_RATINGS, type MediaType, type MaybeRatings, type Ratings, type SearchResult } from "@/lib/types";
import { RatingEditor } from "./RatingEditor";
import { TitleSearch } from "./TitleSearch";
import { Button, Modal, Poster, ScoreBadge } from "./ui";

const DEFAULT_RATINGS: Ratings = { plot: 3, ending: 3, acting: 3, atmosphere: 3, vibe: 3 };

type Pick = { kind: "tmdb"; result: SearchResult } | { kind: "manual"; name: string; media_type: MediaType };

export function AddTitleDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { addTitle, titles } = useStore();
  const router = useRouter();
  const [pick, setPick] = useState<Pick | null>(null);
  const [ratings, setRatings] = useState<Ratings>(DEFAULT_RATINGS);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setPick(null);
    setRatings(DEFAULT_RATINGS);
    setNote("");
    setError(null);
    onClose();
  }

  const duplicate =
    pick?.kind === "tmdb"
      ? titles.find((t) => t.tmdb_id === pick.result.tmdb_id && t.media_type === pick.result.media_type)
      : undefined;

  /** NO_RATINGS puts the title on the watchlist. */
  async function save(scores: MaybeRatings) {
    if (!pick) return;
    setSaving(true);
    setError(null);
    try {
      const meta =
        pick.kind === "tmdb"
          ? metaOf(await fetchDetails(pick.result.media_type, pick.result.tmdb_id))
          : emptyMeta(pick.name, pick.media_type);
      const row = await addTitle({ ...meta, ...scores, note: note.trim() || null });
      close();
      router.push(`/title/${row.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const name = pick?.kind === "tmdb" ? pick.result.name : pick?.name;

  return (
    <Modal open={open} onClose={close} title={pick ? "Rate it" : "Add a title"}>
      {!pick ? (
        <TitleSearch
          onPick={(result) => setPick({ kind: "tmdb", result })}
          footer={(q) =>
            q && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3 text-sm text-muted [overflow-wrap:anywhere]">
                Not on TMDB? Add “{q}” as
                <button className="text-accent hover:underline" onClick={() => setPick({ kind: "manual", name: q, media_type: "movie" })}>
                  movie
                </button>
                or
                <button className="text-accent hover:underline" onClick={() => setPick({ kind: "manual", name: q, media_type: "tv" })}>
                  series
                </button>
              </div>
            )
          }
        />
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3 sm:gap-4">
            <Poster
              path={pick.kind === "tmdb" ? pick.result.poster_path : null}
              alt={name ?? ""}
              size="w185"
              className="h-24 w-16 shrink-0 rounded-lg text-xs sm:h-28 sm:w-[75px]"
            />
            <div className="min-w-0 flex-1">
              <div className="break-words text-lg font-semibold leading-tight">{name}</div>
              {pick.kind === "tmdb" && (
                <div className="text-sm text-muted">
                  {pick.result.year ?? "—"} · {pick.result.media_type === "tv" ? "Series" : "Movie"}
                </div>
              )}
              <button className="mt-1 text-xs text-accent hover:underline" onClick={() => setPick(null)}>
                Change
              </button>
            </div>
            <div className="shrink-0 sm:hidden">
              <ScoreBadge value={overallOf(ratings)} />
            </div>
            <div className="hidden shrink-0 sm:block">
              <ScoreBadge value={overallOf(ratings)} size="lg" />
            </div>
          </div>

          {duplicate && (
            <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
              Already in your list{duplicate.overall != null ? ` with ${duplicate.overall.toFixed(1)}` : ", on the watchlist"}. Saving adds a second entry.
            </p>
          )}

          <RatingEditor value={ratings} onChange={(k, n) => setRatings((r) => ({ ...r, [k]: n }))} />

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
          />

          {error && <p className="text-sm text-rose-300">{error}</p>}

          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={close}>Cancel</Button>
            <Button onClick={() => save(NO_RATINGS)} disabled={saving}>
              Want to watch
            </Button>
            <Button variant="primary" onClick={() => save(ratings)} disabled={saving}>
              {saving ? "Saving…" : "Save rating"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
