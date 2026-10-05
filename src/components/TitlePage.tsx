"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchDetails, metaOf } from "@/lib/api";
import { tmdbImage } from "@/lib/score";
import { useStore } from "@/lib/store";
import type { CriterionKey, Title, TitleDetails } from "@/lib/types";
import { RadarChart } from "./RadarChart";
import { RatingEditor } from "./RatingEditor";
import { TitleSearch } from "./TitleSearch";
import { Button, Modal, Poster, ScoreBadge, Spinner } from "./ui";

export function TitlePage({ id }: { id: string }) {
  const { titles, loading } = useStore();
  const title = titles.find((t) => t.id === id);

  if (!title) {
    return loading ? (
      <div className="grid flex-1 place-items-center">
        <Spinner className="size-8 text-accent" />
      </div>
    ) : (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
        <p className="text-muted">This title isn’t in your library.</p>
        <Link href="/" className="text-accent hover:underline">
          Back to library
        </Link>
      </div>
    );
  }

  // key resets fetched details when switching titles or re-matching
  return <TitleView key={`${title.id}:${title.tmdb_id}`} title={title} />;
}

function TitleView({ title: t }: { title: Title }) {
  const { updateTitle, removeTitle } = useStore();
  const router = useRouter();
  const [details, setDetails] = useState<TitleDetails | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [note, setNote] = useState(t.note ?? "");
  const [rematching, setRematching] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!t.tmdb_id) return;
    const ctrl = new AbortController();
    fetchDetails(t.media_type, t.tmdb_id, ctrl.signal)
      .then(setDetails)
      .catch((e) => !ctrl.signal.aborted && setDetailsError(e.message));
    return () => ctrl.abort();
  }, [t.media_type, t.tmdb_id]);

  const fail = (e: unknown) => alert((e as Error).message);

  async function refreshMeta(type = t.media_type, tmdbId = t.tmdb_id) {
    if (!tmdbId) return;
    setBusy(true);
    try {
      await updateTitle(t.id, metaOf(await fetchDetails(type, tmdbId)));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete “${t.name}” from your library?`)) return;
    try {
      await removeTitle(t.id);
      router.push("/");
    } catch (e) {
      fail(e);
    }
  }

  const backdrop = tmdbImage(t.backdrop_path, "original");
  const meta = [
    t.year,
    t.media_type === "tv" ? "Series" : "Movie",
    t.runtime ? `${t.runtime} min${t.media_type === "tv" ? " / ep" : ""}` : null,
    details?.seasons ? `${details.seasons} season${details.seasons > 1 ? "s" : ""}` : null,
  ].filter(Boolean);

  return (
    <div className="min-w-0 flex-1">
      {/* Backdrop hero */}
      <div className="relative overflow-hidden">
        {backdrop && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={backdrop} alt="" className="absolute inset-0 size-full object-cover object-top opacity-35" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-8 pt-8 sm:flex-row sm:items-end sm:pt-24">
          <Poster
            path={t.poster_path}
            alt={t.name}
            size="w500"
            className="aspect-[2/3] w-36 shrink-0 rounded-2xl border border-border shadow-2xl shadow-black/60 sm:w-44 lg:w-56"
          />
          {/* Scores sit under the info until there's room for a third column. */}
          <div className="flex min-w-0 flex-1 flex-col gap-6 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <h1 className="break-words font-display text-5xl leading-none tracking-wide sm:text-6xl lg:text-7xl">{t.name}</h1>
              {details?.tagline && <p className="mt-2 italic text-muted">“{details.tagline}”</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                {meta.map((m, i) => (
                  <span key={i}>{m}</span>
                ))}
              </div>
              {t.genres.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {t.genres.map((g) => (
                    <span key={g} className="rounded-full border border-border bg-surface/70 px-2.5 py-0.5 text-xs">
                      {g}
                    </span>
                  ))}
                </div>
              )}
              {details && details.creators.length > 0 && (
                <p className="mt-3 text-sm text-muted">
                  {t.media_type === "tv" ? "Created by" : "Directed by"}{" "}
                  <span className="text-foreground">{details.creators.join(", ")}</span>
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-start gap-5">
              <CrowdScore label="IMDb" value={t.imdb_rating} />
              <CrowdScore label="TMDB" value={t.tmdb_rating} />
              <div className="flex flex-col items-center">
                <div className="flex h-16 items-center">
                  <ScoreBadge value={t.overall} size="lg" />
                </div>
                <div className="mt-1 text-xs uppercase tracking-wider text-muted">You</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* minmax(0,…) keeps the wide cast strip from stretching the column and the page. */}
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 px-4 pb-12 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {t.overview && (
            <Section title="Overview">
              <p className="leading-relaxed text-foreground/90">{t.overview}</p>
            </Section>
          )}

          {details?.trailer_key && (
            <Section title="Trailer">
              <div className="aspect-video overflow-hidden rounded-xl border border-border">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${details.trailer_key}`}
                  title={`${t.name} trailer`}
                  allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  className="size-full"
                />
              </div>
            </Section>
          )}

          {details && details.cast.length > 0 && (
            <Section title="Cast">
              <div className="scrollbar-none -mx-1 flex snap-x gap-3 overflow-x-auto overscroll-x-contain px-1 pb-1">
                {details.cast.map((c) => (
                  <div key={c.name + c.character} className="w-24 shrink-0 snap-start">
                    <Poster path={c.profile_path} alt={c.name} size="w185" className="aspect-[2/3] w-full rounded-lg text-[10px]" />
                    <div className="mt-1.5 truncate text-xs font-medium">{c.name}</div>
                    {c.character && <div className="truncate text-[11px] text-muted">{c.character}</div>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {!t.tmdb_id && (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
              Not linked to TMDB, so there’s no poster or description.{" "}
              <button className="text-accent hover:underline" onClick={() => setRematching(true)}>
                Find it on TMDB
              </button>
            </p>
          )}
          {detailsError && <p className="text-sm text-rose-300">Couldn’t load details: {detailsError}</p>}
        </div>

        <aside className="min-w-0 space-y-6">
          <Section title="Your ratings">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex justify-center">
                <RadarChart ratings={t} />
              </div>
              <RatingEditor
                value={t}
                onChange={(k: CriterionKey, n) => updateTitle(t.id, { [k]: n } as Partial<Title>).catch(fail)}
              />
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => note !== (t.note ?? "") && updateTitle(t.id, { note: note.trim() || null }).catch(fail)}
                placeholder="Your notes…"
                rows={3}
                className="mt-4 w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
              />
            </div>
          </Section>

          <div className="flex flex-wrap gap-2">
            {t.tmdb_id && (
              <Button onClick={() => refreshMeta()} disabled={busy}>
                {busy ? <Spinner /> : "↻"} Refresh info
              </Button>
            )}
            <Button onClick={() => setRematching(true)}>Change match</Button>
            {t.tmdb_id && (
              <a
                href={`https://www.themoviedb.org/${t.media_type}/${t.tmdb_id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-lg border border-border px-3.5 py-2 text-sm text-muted hover:text-foreground"
              >
                TMDB ↗
              </a>
            )}
            {t.imdb_id && (
              <a
                href={`https://www.imdb.com/title/${t.imdb_id}/`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-lg border border-border px-3.5 py-2 text-sm text-muted hover:text-foreground"
              >
                IMDb ↗
              </a>
            )}
            <Button variant="danger" onClick={remove} className="ml-auto">
              Delete
            </Button>
          </div>
        </aside>
      </div>

      <Modal open={rematching} onClose={() => setRematching(false)} title="Match on TMDB">
        <TitleSearch
          initialQuery={t.name}
          onPick={(r) => {
            setRematching(false);
            refreshMeta(r.media_type, r.tmdb_id);
          }}
        />
      </Modal>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-2xl tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

function CrowdScore({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <div className="flex flex-col items-center">
      {/* Same height as the lg ScoreBadge so values and labels line up across columns. */}
      <div className="flex h-16 items-center font-display text-4xl leading-none tabular-nums">{value.toFixed(1)}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-muted">{label} /10</div>
    </div>
  );
}
