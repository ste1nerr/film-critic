"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatScore, scoreTone, tmdbImage } from "@/lib/score";
import { useStore } from "@/lib/store";
import { CRITERIA, type CriterionKey, type Title } from "@/lib/types";
import { Poster, ScoreBadge, Spinner } from "./ui";

type View = "grid" | "table";
type TypeFilter = "all" | "movie" | "tv";
type Sort = "overall-desc" | "overall-asc" | "name" | "year" | "added" | "vs-crowd";

const SORTS: { value: Sort; label: string }[] = [
  { value: "overall-desc", label: "Best first" },
  { value: "overall-asc", label: "Worst first" },
  { value: "added", label: "Recently added" },
  { value: "year", label: "Newest release" },
  { value: "name", label: "Name" },
  { value: "vs-crowd", label: "I liked more than the crowd" },
];

/** Your 1–5 overall vs the crowd's 0–10, both on a 10-point scale. */
export function crowdGap(t: Title) {
  const crowd = t.imdb_rating ?? t.tmdb_rating;
  return crowd == null ? null : t.overall * 2 - crowd;
}

function sortTitles(list: Title[], sort: Sort) {
  const copy = list.slice();
  const by = {
    "overall-desc": (a: Title, b: Title) => b.overall - a.overall || a.name.localeCompare(b.name),
    "overall-asc": (a: Title, b: Title) => a.overall - b.overall || a.name.localeCompare(b.name),
    name: (a: Title, b: Title) => a.name.localeCompare(b.name),
    year: (a: Title, b: Title) => (b.year ?? 0) - (a.year ?? 0),
    added: (a: Title, b: Title) => b.created_at.localeCompare(a.created_at),
    "vs-crowd": (a: Title, b: Title) => (crowdGap(b) ?? -99) - (crowdGap(a) ?? -99),
  }[sort];
  return copy.sort(by);
}

function usePersisted<T extends string>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
      if (saved) setValue(saved as T);
    } catch {}
  }, [key]);
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, v);
    } catch {}
  };
  return [value, set] as const;
}

export function Library() {
  const { titles, loading, error } = useStore();
  const [view, setView] = usePersisted<View>("fc:view", "grid");
  const [sort, setSort] = usePersisted<Sort>("fc:sort", "overall-desc");
  const [type, setType] = useState<TypeFilter>("all");
  const [genre, setGenre] = useState("");
  const [query, setQuery] = useState("");

  const genres = useMemo(() => [...new Set(titles.flatMap((t) => t.genres))].sort(), [titles]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortTitles(
      titles.filter(
        (t) =>
          (type === "all" || t.media_type === type) &&
          (!genre || t.genres.includes(genre)) &&
          (!q || t.name.toLowerCase().includes(q)),
      ),
      sort,
    );
  }, [titles, type, genre, query, sort]);

  if (loading && !titles.length) {
    return (
      <div className="grid flex-1 place-items-center">
        <Spinner className="size-8 text-accent" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6">
      <Hero titles={titles} />

      {error && <p className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

      <div className="mb-5 flex flex-wrap items-stretch gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name…"
          className="min-w-0 flex-1 basis-full rounded-lg sm:basis-48 border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <Segmented<TypeFilter>
          value={type}
          onChange={setType}
          options={[
            { value: "all", label: "All" },
            { value: "movie", label: "Movies" },
            { value: "tv", label: "Series" },
          ]}
        />
        <select
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          className="min-w-0 flex-1 basis-36 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent sm:flex-none sm:basis-auto"
        >
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="min-w-0 flex-1 basis-36 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent sm:flex-none sm:basis-auto"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: "grid", label: "▦ Grid" },
            { value: "table", label: "☰ Table" },
          ]}
        />
      </div>

      {!titles.length ? (
        <Empty />
      ) : !visible.length ? (
        <p className="py-16 text-center text-muted">Nothing matches these filters.</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {visible.map((t) => (
            <PosterCard key={t.id} title={t} />
          ))}
        </div>
      ) : (
        <TitleTable titles={visible} />
      )}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange(v: T): void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-1 rounded-lg border border-border bg-surface p-0.5 sm:flex-none">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition ${value === o.value ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Hero({ titles }: { titles: Title[] }) {
  const top = useMemo(() => titles.reduce<Title | null>((best, t) => (!best || t.overall > best.overall ? t : best), null), [titles]);
  if (!titles.length || !top) return null;

  const avg = titles.reduce((s, t) => s + t.overall, 0) / titles.length;
  const series = titles.filter((t) => t.media_type === "tv").length;
  const backdrop = tmdbImage(top.backdrop_path, "w1280");

  return (
    <Link
      href={`/title/${top.id}`}
      className="group relative mb-6 block overflow-hidden rounded-2xl border border-border bg-surface"
    >
      {backdrop && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={backdrop} alt="" className="absolute inset-0 size-full object-cover opacity-40 transition duration-700 group-hover:scale-105" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
      <div className="relative flex flex-col gap-6 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-widest text-accent">Your top pick</div>
          <div className="mt-1 break-words font-display text-4xl leading-none tracking-wide sm:text-6xl">{top.name}</div>
          <div className="mt-2 text-sm text-muted">
            {top.year ?? ""} {top.genres.slice(0, 3).join(" · ")}
          </div>
        </div>
        <div className="flex shrink-0 gap-6 sm:text-right">
          <Stat label="Titles" value={String(titles.length)} />
          <Stat label="Series" value={String(series)} />
          <Stat label="Avg score" value={formatScore(avg)} />
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-display text-4xl leading-none tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

function PosterCard({ title: t }: { title: Title }) {
  return (
    <Link href={`/title/${t.id}`} className="group block">
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-border bg-surface shadow-lg shadow-black/40 transition duration-300 group-hover:-translate-y-1 group-hover:border-accent/60">
        <Poster path={t.poster_path} alt={t.name} className="size-full" />
        <div className="absolute right-2 top-2">
          <ScoreBadge value={t.overall} />
        </div>
        <div className="absolute inset-x-0 bottom-0 translate-y-full space-y-1.5 bg-gradient-to-t from-black via-black/90 to-transparent p-3 pt-8 transition duration-300 group-hover:translate-y-0">
          {CRITERIA.map((c) => (
            <div key={c.key} className="flex items-center gap-2 text-[11px]">
              <span className="w-14 shrink-0 truncate text-white/70 sm:w-16">{c.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                <div className={`h-full rounded-full ${scoreTone(t[c.key])}`} style={{ width: `${t[c.key] * 20}%` }} />
              </div>
              <span className="w-3 shrink-0 text-right tabular-nums text-white">{t[c.key]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 truncate text-sm font-medium" title={t.name}>
        {t.name}
      </div>
      <div className="text-xs text-muted">
        {t.year ?? "—"} · {t.media_type === "tv" ? "Series" : "Movie"}
      </div>
    </Link>
  );
}

function TitleTable({ titles }: { titles: Title[] }) {
  const { updateTitle } = useStore();
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="sticky left-0 z-10 bg-surface px-3 py-3 font-medium">Title</th>
            {CRITERIA.map((c) => (
              <th key={c.key} className="px-2 py-3 text-center font-medium" title={"hint" in c ? c.hint : undefined}>
                {c.label}
              </th>
            ))}
            <th className="px-3 py-3 text-center font-medium">Overall</th>
            <th className="px-3 py-3 text-center font-medium">IMDb / TMDB</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {titles.map((t) => (
            <tr key={t.id} className="group hover:bg-surface/60">
              {/* Title stays pinned while the ratings scroll sideways on narrow screens. */}
              <td className="sticky left-0 z-10 bg-background px-3 py-2 group-hover:bg-surface">
                <Link href={`/title/${t.id}`} className="flex max-w-40 items-center gap-3 hover:text-accent sm:max-w-64">
                  <Poster path={t.poster_path} alt="" size="w92" className="h-12 w-8 shrink-0 rounded text-[0px]" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.name}</div>
                    <div className="text-xs text-muted">
                      {t.year ?? "—"} · {t.media_type === "tv" ? "Series" : "Movie"}
                    </div>
                  </div>
                </Link>
              </td>
              {CRITERIA.map((c) => (
                <td key={c.key} className="px-2 py-2 text-center">
                  <RatingCell value={t[c.key]} onChange={(n) => updateTitle(t.id, { [c.key]: n } as Record<CriterionKey, number>).catch((e) => alert(e.message))} label={`${t.name} ${c.label}`} />
                </td>
              ))}
              <td className="px-3 py-2 text-center">
                <ScoreBadge value={t.overall} size="sm" />
              </td>
              <td className="px-3 py-2 text-center tabular-nums text-muted">
                {t.imdb_rating ?? "—"} / {t.tmdb_rating ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RatingCell({ value, onChange, label }: { value: number; onChange(n: number): void; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`cursor-pointer appearance-none rounded-md px-2.5 py-1 text-center font-semibold tabular-nums outline-none ${scoreTone(value)}`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={n} className="bg-surface text-foreground">
          {n}
        </option>
      ))}
    </select>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-20 text-center">
      <span className="text-5xl">🎬</span>
      <div className="text-lg font-semibold">Your library is empty</div>
      <p className="max-w-sm text-sm text-muted">
        Add your first title with <span className="text-accent">+ Add</span>, or import your spreadsheet with{" "}
        <span className="text-foreground">Import</span>.
      </p>
    </div>
  );
}
