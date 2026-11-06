"use client";

import { useEffect, useState } from "react";
import { metaOf } from "@/lib/api";
import { useStore } from "@/lib/store";
import { NO_RATINGS, type TitleDetails, type TitleInput } from "@/lib/types";
import { Button, Spinner } from "./ui";

interface Entry {
  shikimori_id: number;
  status: "planned" | "watching" | "rewatching" | "completed" | "on_hold" | "dropped";
  score: number;
  episodes: number;
  details: TitleDetails;
}

const NICKNAME_KEY = "fc:shikimori";

/** Shikimori's 1–10 score doesn't map onto the five criteria, so it goes into the note instead. */
function noteOf(e: Entry) {
  const progress = e.episodes ? `, ep ${e.episodes}` : "";
  switch (e.status) {
    case "completed":
    case "rewatching":
      return e.score ? `Shikimori: ${e.score}/10` : "Shikimori: completed";
    case "watching":
      return `Shikimori: watching${progress}`;
    case "on_hold":
      return `Shikimori: on hold${progress}`;
    case "dropped":
      return `Shikimori: dropped${progress}`;
    case "planned":
      return null;
  }
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

  const known = new Set(titles.filter((t) => t.media_type === "anime").map((t) => t.tmdb_id));
  const fresh = entries?.filter((e) => !known.has(e.shikimori_id)) ?? [];

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
      const rows: TitleInput[] = fresh.map((e) => ({ ...metaOf(e.details), ...NO_RATINGS, note: noteOf(e) }));
      await importTitles(rows);
      onDone(rows.length);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const count = (statuses: Entry["status"][]) => fresh.filter((e) => statuses.includes(e.status)).length;

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
            {entries.length} anime on the list, {entries.length - fresh.length} already here. New: {count(["completed", "rewatching"])} watched,{" "}
            {count(["watching", "on_hold", "dropped"])} in progress, {count(["planned"])} planned.
          </p>
          <p className="text-sm text-muted">
            They land on the watchlist with the Shikimori score in the note (“Shikimori: 8/10”). Rate the five criteria when you open them.
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={save} disabled={busy || !fresh.length}>
              {busy ? "Importing…" : `Import ${fresh.length} anime`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
