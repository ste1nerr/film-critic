"use client";

import Link from "next/link";
import { useMemo } from "react";
import { formatScore } from "@/lib/score";
import { useStore } from "@/lib/store";
import { CRITERIA, isRated, type RatedTitle } from "@/lib/types";
import { crowdGap } from "./Library";
import { Poster, ScoreBadge } from "./ui";

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function Stats() {
  const all = useStore().titles;
  const titles = useMemo(() => all.filter(isRated), [all]);

  const data = useMemo(() => {
    const criteria = CRITERIA.map((c) => ({ label: c.label, value: avg(titles.map((t) => t[c.key])) }));

    const buckets = [1, 2, 3, 4, 5].map((b) => ({
      label: b === 5 ? "5" : `${b}–${b}.9`,
      value: titles.filter((t) => Math.min(Math.floor(t.overall), 5) === b).length,
    }));

    const byGenre = new Map<string, number[]>();
    for (const t of titles) for (const g of t.genres) byGenre.set(g, [...(byGenre.get(g) ?? []), t.overall]);
    const genres = [...byGenre]
      .filter(([, xs]) => xs.length >= 2)
      .map(([label, xs]) => ({ label: `${label} (${xs.length})`, value: avg(xs) }))
      .sort((a, b) => b.value - a.value);

    const withGap = titles
      .map((t) => ({ t, gap: crowdGap(t) }))
      .filter((x): x is { t: RatedTitle; gap: number } => x.gap != null);
    const loved = withGap.filter((x) => x.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 5);
    const disliked = withGap.filter((x) => x.gap < 0).sort((a, b) => a.gap - b.gap).slice(0, 5);

    const top = titles.slice().sort((a, b) => b.overall - a.overall).slice(0, 10);
    return { criteria, buckets, genres, loved, disliked, top };
  }, [titles]);

  if (!titles.length) {
    return <p className="py-20 text-center text-muted">Add a few titles to see your stats.</p>;
  }

  const strictest = data.criteria.reduce((a, b) => (b.value < a.value ? b : a));

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:py-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Titles rated" value={String(titles.length)} />
        <Tile label="Average score" value={formatScore(avg(titles.map((t) => t.overall)))} />
        <Tile label="Rated 4+" value={String(titles.filter((t) => t.overall >= 4).length)} />
        <Tile label="Strictest on" value={strictest.label} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title="Average by criterion">
          <Bars items={data.criteria} max={5} format={(v) => v.toFixed(1)} />
        </Card>
        <Card title="Score distribution">
          <Histogram items={data.buckets} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title="Average by genre">
          {data.genres.length ? (
            <Bars items={data.genres} max={5} format={(v) => v.toFixed(1)} />
          ) : (
            <p className="text-sm text-muted">Genres appear once titles are matched on TMDB.</p>
          )}
        </Card>
        <Card title="Top 10">
          <ol className="space-y-2">
            {data.top.map((t, i) => (
              <li key={t.id}>
                <Link href={`/title/${t.id}`} className="flex items-center gap-3 rounded-lg p-1 hover:bg-surface-2">
                  <span className="w-6 shrink-0 text-right font-display text-xl text-muted">{i + 1}</span>
                  <Poster path={t.poster_path} alt="" size="w92" className="h-10 w-7 shrink-0 rounded text-[0px]" />
                  <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                  <ScoreBadge value={t.overall} size="sm" />
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title="You liked more than the crowd">
          <GapList items={data.loved} />
        </Card>
        <Card title="The crowd liked more than you">
          <GapList items={data.disliked} />
        </Card>
      </div>
      <p className="text-xs text-muted">
        Crowd comparison uses IMDb (or TMDB) out of 10 against your overall × 2.
      </p>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-surface p-3 sm:p-4">
      <div className="font-display text-3xl leading-none tracking-wide [overflow-wrap:anywhere] sm:text-4xl">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="mb-4 font-display text-2xl tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

/** Horizontal bars, single series, value labelled at the end. */
function Bars({ items, max, format }: { items: { label: string; value: number }[]; max: number; format(v: number): string }) {
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.label} className="group flex items-center gap-3 text-sm" title={`${it.label}: ${format(it.value)}`}>
          <span className="w-24 shrink-0 truncate text-muted sm:w-32 group-hover:text-foreground">{it.label}</span>
          <div className="h-2.5 flex-1 rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-all group-hover:brightness-125"
              style={{ width: `${(it.value / max) * 100}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right tabular-nums">{format(it.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Vertical bars for count per overall-score bucket. */
function Histogram({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex h-48 items-end gap-2 border-b border-border sm:gap-3">
      {items.map((it) => (
        <div key={it.label} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${it.label}: ${it.value} titles`}>
          <span className="text-xs tabular-nums text-muted group-hover:text-foreground">{it.value || ""}</span>
          <div
            className="w-full max-w-14 rounded-t bg-accent transition-all group-hover:brightness-125"
            style={{ height: `${(it.value / max) * 85}%` }}
          />
          <span className="whitespace-nowrap pb-1 pt-1 text-[11px] text-muted">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function GapList({ items }: { items: { t: RatedTitle; gap: number }[] }) {
  if (!items.length) return <p className="text-sm text-muted">Nothing here yet.</p>;
  return (
    <ul className="space-y-2">
      {items.map(({ t, gap }) => (
        <li key={t.id}>
          <Link href={`/title/${t.id}`} className="flex items-center gap-3 rounded-lg p-1 text-sm hover:bg-surface-2">
            <Poster path={t.poster_path} alt="" size="w92" className="h-10 w-7 shrink-0 rounded text-[0px]" />
            <span className="min-w-0 flex-1 truncate">{t.name}</span>
            <span className="hidden shrink-0 tabular-nums text-muted min-[400px]:inline">
              {(t.overall * 2).toFixed(1)} vs {(t.imdb_rating ?? t.tmdb_rating)?.toFixed(1)}
            </span>
            <span className={`w-12 shrink-0 text-right font-semibold tabular-nums ${gap > 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {gap > 0 ? "+" : ""}
              {gap.toFixed(1)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
