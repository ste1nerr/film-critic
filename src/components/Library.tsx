"use client";

import { closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { scoreTone, tmdbImage } from "@/lib/score";
import { useStore } from "@/lib/store";
import { CRITERIA, isRated, TYPE_LABEL, type CriterionKey, type MediaType, type RatedTitle, type Title } from "@/lib/types";
import { Poster, ScoreBadge, Spinner } from "./ui";

type View = "grid" | "table";
type Shelf = "rated" | "watchlist";

const TYPES: { value: MediaType; label: string }[] = [
  { value: "movie", label: "Movies" },
  { value: "tv", label: "Series" },
  { value: "anime", label: "Anime" },
];
const ALL_TYPES = TYPES.map((t) => t.value).join(",");
type Sort = "mine" | "overall-desc" | "overall-asc" | "name" | "year" | "added" | "vs-crowd";

const SORTS: { value: Sort; label: string; watchlistOnly?: boolean }[] = [
  { value: "mine", label: "My order", watchlistOnly: true },
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
  return crowd == null || t.overall == null ? null : t.overall * 2 - crowd;
}

function sortTitles(list: Title[], sort: Sort) {
  const copy = list.slice();
  const score = (t: Title) => t.overall ?? 0;
  const by = {
    // Unranked (just added) titles go on top, newest first.
    mine: (a: Title, b: Title) => (a.watch_rank ?? -Infinity) - (b.watch_rank ?? -Infinity) || b.created_at.localeCompare(a.created_at),
    "overall-desc": (a: Title, b: Title) => score(b) - score(a) || a.name.localeCompare(b.name),
    "overall-asc": (a: Title, b: Title) => score(a) - score(b) || a.name.localeCompare(b.name),
    name: (a: Title, b: Title) => a.name.localeCompare(b.name),
    year: (a: Title, b: Title) => (b.year ?? 0) - (a.year ?? 0),
    added: (a: Title, b: Title) => b.created_at.localeCompare(a.created_at),
    "vs-crowd": (a: Title, b: Title) => (crowdGap(b) ?? -99) - (crowdGap(a) ?? -99),
  }[sort];
  return copy.sort(by);
}

/** Read on first render, so the saved shelf and view don't flash in after the default one. */
function usePersisted<T extends string>(key: string, initial: T) {
  // The library only renders client-side, after sign-in, so localStorage is available here.
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T | null) ?? initial;
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, v);
    } catch {}
  };
  return [value, set] as const;
}

/**
 * Unrated anime that came in bulk from an old Shikimori import stay on Shikimori's own lists, so they don't fill up
 * the watchlist. A day with more than 10 of them is such an import; anime added by hand or from the bot is shown.
 */
function watchlistFilter(titles: Title[]) {
  const perDay = new Map<string, number>();
  for (const t of titles) if (!isRated(t) && t.media_type === "anime") perDay.set(t.created_at.slice(0, 10), (perDay.get(t.created_at.slice(0, 10)) ?? 0) + 1);
  return (t: Title) => !isRated(t) && (t.media_type !== "anime" || (perDay.get(t.created_at.slice(0, 10)) ?? 0) <= 10);
}

/**
 * Moves one title next to another within the whole watchlist (filters may hide some of it).
 * Once every title has a rank only the moved one changes; before that the whole list is numbered once.
 */
function reorder(list: Title[], activeId: string, overId: string): { id: string; rank: number }[] {
  const from = list.findIndex((t) => t.id === activeId);
  const to = list.findIndex((t) => t.id === overId);
  if (from < 0 || to < 0 || from === to) return [];
  const next = arrayMove(list, from, to);
  if (list.some((t) => t.watch_rank == null)) {
    return next.flatMap((t, i) => (t.watch_rank === i + 1 ? [] : [{ id: t.id, rank: i + 1 }]));
  }
  const prev = next[to - 1]?.watch_rank;
  const after = next[to + 1]?.watch_rank;
  const rank = prev == null ? after! - 1 : after == null ? prev + 1 : (prev + after) / 2;
  return [{ id: activeId, rank }];
}

type Handle = Pick<ReturnType<typeof useSortable>, "attributes" | "listeners" | "setActivatorNodeRef">;

/** Set inside the drag-to-reorder list, so the card shows its handle. */
const DragHandleProps = createContext<Handle | null>(null);

function Sortable({ id, children, as: Tag = "div" }: { id: string; children: ReactNode; as?: "div" | "tr" }) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = useMemo(() => ({ attributes, listeners, setActivatorNodeRef }), [attributes, listeners, setActivatorNodeRef]);
  return (
    <DragHandleProps.Provider value={handle}>
      <Tag ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={isDragging ? "group relative z-20 opacity-80" : "group"}>
        {children}
      </Tag>
    </DragHandleProps.Provider>
  );
}

function DragHandle({ className = "" }: { className?: string }) {
  const handle = useContext(DragHandleProps);
  if (!handle) return null;
  const { attributes, listeners, setActivatorNodeRef } = handle;
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label="Drag to reorder"
      // Without touch-action the phone scrolls the page instead of dragging.
      className={`grid size-8 cursor-grab touch-none place-items-center rounded-lg active:cursor-grabbing ${className}`}
    >
      ⠿
    </button>
  );
}

export function Library() {
  const { titles, loading, error, updateTitle } = useStore();
  const [view, setView] = usePersisted<View>("fc:view", "grid");
  const [sort, setSort] = usePersisted<Sort>("fc:sort", "overall-desc");
  const [shelf, setShelf] = usePersisted<Shelf>("fc:shelf", "rated");
  // Each type is switched on or off on its own, e.g. movies + series without anime.
  const [typeList, setTypeList] = usePersisted<string>("fc:types", ALL_TYPES);
  const types = useMemo(() => {
    const picked = TYPES.map((x) => x.value).filter((x) => typeList.split(",").includes(x));
    return new Set(picked.length ? picked : TYPES.map((x) => x.value));
  }, [typeList]);
  const toggleType = (t: MediaType) => {
    const next = TYPES.map((x) => x.value).filter((x) => (x === t ? !types.has(x) : types.has(x)));
    // Switching off the last one would show nothing, so it brings all of them back instead.
    setTypeList(next.length ? next.join(",") : ALL_TYPES);
  };
  const [genre, setGenre] = useState("");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtered = types.size < TYPES.length || !!genre;

  const genres = useMemo(() => [...new Set(titles.flatMap((t) => t.genres))].sort(), [titles]);
  const rated = useMemo(() => titles.filter(isRated), [titles]);
  // The hero follows the type and genre filters, but not the name search, so it doesn't flicker while typing.
  const heroTitles = useMemo(() => rated.filter((t) => types.has(t.media_type) && (!genre || t.genres.includes(genre))), [rated, types, genre]);
  const onWatchlist = useMemo(() => watchlistFilter(titles), [titles]);
  const watchCount = titles.filter(onWatchlist).length;

  // Score sorts mean nothing on the watchlist, and "My order" means nothing on the rated shelf.
  const shownSort: Sort = shelf === "watchlist" ? (sort.startsWith("overall") ? "added" : sort) : sort === "mine" ? "overall-desc" : sort;
  const dragging = shelf === "watchlist" && shownSort === "mine";
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const watchlist = sortTitles(titles.filter(onWatchlist), "mine");
    for (const r of reorder(watchlist, String(active.id), String(over.id))) {
      updateTitle(r.id, { watch_rank: r.rank }).catch((e) => alert(e.message));
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortTitles(
      titles.filter(
        (t) =>
          (shelf === "rated" ? isRated(t) : onWatchlist(t)) &&
          types.has(t.media_type) &&
          (!genre || t.genres.includes(genre)) &&
          (!q || t.name.toLowerCase().includes(q)),
      ),
      shownSort,
    );
  }, [titles, onWatchlist, shelf, types, genre, query, shownSort]);

  if (loading && !titles.length) {
    return (
      <div className="grid flex-1 place-items-center">
        <Spinner className="size-8 text-accent" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6">
      <Hero titles={heroTitles} types={types} />

      {error && <p className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

      <div className="mb-5 flex flex-wrap items-stretch gap-2">
        <Segmented<Shelf>
          className="basis-full sm:basis-auto"
          value={shelf}
          onChange={setShelf}
          options={[
            { value: "rated", label: `Rated · ${rated.length}` },
            { value: "watchlist", label: `Watchlist · ${watchCount}` },
          ]}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name…"
          className="min-w-0 flex-1 rounded-lg sm:basis-48 border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        {/* On phones the rest of the controls fold behind this button; from sm up they sit inline. */}
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          className={`relative shrink-0 rounded-lg border px-3 py-2 text-sm sm:hidden ${filtersOpen ? "border-accent text-foreground" : "border-border text-muted"} bg-surface`}
        >
          Filters
          {filtered && <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-accent" />}
        </button>
        <div className={`${filtersOpen ? "flex" : "hidden"} basis-full flex-wrap gap-2 sm:contents`}>
          <div className="flex basis-full gap-1 rounded-lg border border-border bg-surface p-0.5 sm:basis-auto" role="group" aria-label="Types">
            {TYPES.map((o) => {
              const on = types.has(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleType(o.value)}
                  className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition ${on ? "bg-surface-2 text-foreground" : "text-muted line-through decoration-muted/60 hover:text-foreground"}`}
                >
                  <span className={`mr-1.5 inline-block w-3 ${on ? "text-accent" : "opacity-0"}`}>✓</span>
                  {o.label}
                </button>
              );
            })}
          </div>
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
            value={shownSort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="min-w-0 flex-1 basis-36 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent sm:flex-none sm:basis-auto"
          >
            {SORTS.filter((s) => (shelf === "watchlist" ? !s.value.startsWith("overall") : !s.watchlistOnly)).map((s) => (
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
            className="basis-full sm:basis-auto"
          />
        </div>
      </div>

      {!titles.length ? (
        <Empty />
      ) : !visible.length ? (
        <p className="py-16 text-center text-muted">
          {shelf === "watchlist" && !watchCount
            ? "Your watchlist is empty. Add a title and choose “Want to watch”."
            : shelf === "rated" && !rated.length
              ? "Nothing rated yet."
              : "Nothing matches these filters."}
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={dragging ? visible.map((t) => t.id) : []} strategy={view === "grid" ? rectSortingStrategy : verticalListSortingStrategy}>
            {view === "grid" ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {visible.map((t) =>
                  dragging ? (
                    <Sortable key={t.id} id={t.id}>
                      <PosterCard title={t} />
                    </Sortable>
                  ) : (
                    <PosterCard key={t.id} title={t} />
                  ),
                )}
              </div>
            ) : (
              <TitleTable titles={visible} sortable={dragging} />
            )}
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = "",
}: {
  value: T;
  onChange(v: T): void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div className={`flex flex-1 rounded-lg border border-border bg-surface p-0.5 sm:flex-none ${className}`}>
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

function Hero({ titles, types }: { titles: RatedTitle[]; types: Set<MediaType> }) {
  const top = useMemo(() => titles.reduce<RatedTitle | null>((best, t) => (!best || t.overall > best.overall ? t : best), null), [titles]);
  if (!titles.length || !top) return null;

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
          <div className="mt-1 line-clamp-2 break-words font-display text-4xl leading-none tracking-wide sm:text-6xl">{top.name}</div>
          <div className="mt-2 text-sm text-muted">
            {top.year ?? ""} {top.genres.slice(0, 3).join(" · ")}
          </div>
        </div>
        <div className="flex shrink-0 gap-5 sm:gap-6 sm:text-right">
          <Stat label="Titles" value={String(titles.length)} />
          {/* Always all three, dimmed when filtered out, so the banner keeps its size while filters change. */}
          {TYPES.map((x) => (
            <div key={x.value} className={types.has(x.value) ? "" : "opacity-35"}>
              <Stat label={x.label} value={String(titles.filter((t) => t.media_type === x.value).length)} />
            </div>
          ))}
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
        {/* Inside the link, so a tap on the handle must not open the title. */}
        <div className="absolute left-2 top-2" onClick={(e) => e.preventDefault()}>
          <DragHandle className="bg-black/60 text-white/90 backdrop-blur" />
        </div>
        {isRated(t) ? (
          <>
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
          </>
        ) : (
          <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black via-black/90 to-transparent p-3 pt-8 text-center text-xs font-medium text-white transition duration-300 group-hover:translate-y-0">
            Rate it →
          </div>
        )}
      </div>
      <div className="mt-2 truncate text-sm font-medium" title={t.name}>
        {t.name}
      </div>
      <div className="text-xs text-muted">
        {t.year ?? "—"} · {TYPE_LABEL[t.media_type]}
      </div>
    </Link>
  );
}

function TitleTable({ titles, sortable }: { titles: Title[]; sortable: boolean }) {
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
            <th className="px-3 py-3 text-center font-medium" title="IMDb / TMDB, or Shikimori for anime">
              Crowd
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {titles.map((t) => {
            const cells = (
              <>
              {/* Title stays pinned while the ratings scroll sideways on narrow screens. */}
              <td className="sticky left-0 z-10 bg-background px-3 py-2 group-hover:bg-surface">
                <div className="flex items-center gap-2">
                <DragHandle className="shrink-0 bg-surface-2 text-muted" />
                <Link href={`/title/${t.id}`} className="flex max-w-40 items-center gap-3 hover:text-accent sm:max-w-64">
                  <Poster path={t.poster_path} alt="" size="w92" className="h-12 w-8 shrink-0 rounded text-[0px]" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.name}</div>
                    <div className="text-xs text-muted">
                      {t.year ?? "—"} · {TYPE_LABEL[t.media_type]}
                    </div>
                  </div>
                </Link>
                </div>
              </td>
              {isRated(t) ? (
                <>
                  {CRITERIA.map((c) => (
                    <td key={c.key} className="px-2 py-2 text-center">
                      <RatingCell value={t[c.key]} onChange={(n) => updateTitle(t.id, { [c.key]: n } as Record<CriterionKey, number>).catch((e) => alert(e.message))} label={`${t.name} ${c.label}`} />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center">
                    <ScoreBadge value={t.overall} size="sm" />
                  </td>
                </>
              ) : (
                // All five are set at once on the title page; a partial set isn't allowed.
                <td colSpan={CRITERIA.length + 1} className="px-3 py-2 text-center">
                  <Link href={`/title/${t.id}`} className="text-accent hover:underline">
                    Rate it →
                  </Link>
                </td>
              )}
              <td className="px-3 py-2 text-center tabular-nums text-muted">
                {t.media_type === "anime" ? (t.tmdb_rating ?? "—") : `${t.imdb_rating ?? "—"} / ${t.tmdb_rating ?? "—"}`}
              </td>
              </>
            );
            return sortable ? (
              <Sortable key={t.id} id={t.id} as="tr">
                {cells}
              </Sortable>
            ) : (
              <tr key={t.id} className="group hover:bg-surface/60">
                {cells}
              </tr>
            );
          })}
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
