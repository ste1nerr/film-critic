"use client";

import { useEffect, useState } from "react";
import { metaOf } from "@/lib/api";
import { useStore } from "@/lib/store";
import { CRITERIA, isRated, type Ratings, type TitleDetails, type TitleInput } from "@/lib/types";
import { Button, Spinner } from "./ui";

interface Entry {
  shikimori_id: number;
  status: "planned" | "watching" | "rewatching" | "completed" | "on_hold" | "dropped";
  score: number;
  episodes: number;
  details: TitleDetails;
}

const NICKNAME_KEY = "fc:shikimori";

const watched = (e: Entry) => (e.status === "completed" || e.status === "rewatching") && e.score > 0;

/**
 * Spreads a 1–10 score over the five criteria so the overall lands at score / 2:
 * 8 → 4 4 4 4 4 (4.0), 7 → 4 4 4 3 3 (3.6), 9 → 5 5 5 4 4 (4.6).
 */
function ratingsOf(score: number): Ratings {
  const total = Math.round(score * 2.5);
  const base = Math.floor(total / CRITERIA.length);
  const extra = total % CRITERIA.length;
  return Object.fromEntries(CRITERIA.map((c, i) => [c.key, Math.min(5, Math.max(1, base + (i < extra ? 1 : 0)))])) as Ratings;
}

export function ShikimoriImport({ onDone }: { onDone(count: number): void }) {
  const { titles, importTitles } = useStore();
  const [nickname, setNickname] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(NICKNAME_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
      if (saved) setNickname(saved);
    } catch {}
  }, []);

  const known = new Map(titles.filter((t) => t.media_type === "anime").map((t) => [t.tmdb_id, t]));
  // Only anime you've watched and scored; the rest stay on Shikimori.
  const fresh = entries?.filter((e) => watched(e) && !known.has(e.shikimori_id)) ?? [];
  // Imported earlier without ratings: give them the Shikimori score now.
  const toRate = entries?.filter((e) => watched(e) && known.get(e.shikimori_id) && !isRated(known.get(e.shikimori_id)!)) ?? [];

  async function load() {
    const nick = nickname.trim();
    if (!nick) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/anime/list?nickname=${encodeURIComponent(nick)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setEntries(data.entries);
      try {
        localStorage.setItem(NICKNAME_KEY, nick);
      } catch {}
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const rows: (TitleInput & { id?: string })[] = [
        ...fresh.map((e) => ({ ...metaOf(e.details), ...ratingsOf(e.score), note: `Shikimori: ${e.score}/10` })),
        ...toRate.map((e) => ({ ...metaOf(e.details), ...ratingsOf(e.score), note: `Shikimori: ${e.score}/10`, id: known.get(e.shikimori_id)!.id })),
      ];
      await importTitles(rows);
      onDone(rows.length);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border p-4">
      <div className="font-medium">Anime list from Shikimori</div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <input
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
            setEntries(null);
          }}
          placeholder="Shikimori nickname"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <Button type="submit" disabled={busy || !nickname.trim()}>
          {busy && !entries ? <Spinner /> : null} Load
        </Button>
      </form>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      {entries && (
        <>
          <p className="text-sm text-muted">
            {entries.filter(watched).length} watched and scored on Shikimori: {fresh.length} new
            {toRate.length ? `, ${toRate.length} already here get their score` : ""}.
          </p>
          <p className="text-sm text-muted">
            Your Shikimori score is spread over the five criteria (8/10 → 4 4 4 4 4, 7/10 → 4 4 4 3 3), so the overall is half of it. Adjust any
            criterion later. Watching, planned and unscored anime aren’t imported.
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={save} disabled={busy || fresh.length + toRate.length === 0}>
              {busy ? "Importing…" : `Import ${fresh.length + toRate.length} anime`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
