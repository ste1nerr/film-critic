import Papa from "papaparse";
import * as XLSX from "xlsx";
import { CRITERIA, type CriterionKey, type MediaType, type Ratings, type Title } from "./types";

/** One row read from an imported file, before TMDB matching. */
export interface ParsedRow {
  name: string;
  ratings: Ratings;
  media_type: MediaType | null;
  tmdb_id: number | null;
  note: string | null;
}

const EXPORT_HEADERS = [
  "Name",
  "Type",
  "Year",
  "Plot",
  "Ending",
  "Acting",
  "Atmosphere (camera, music, locations)",
  "Vibe (personally appealing)",
  "Overall rating",
  "TMDB rating",
  "IMDb rating",
  "Genres",
  "Note",
  "TMDB ID",
  "IMDb ID",
];

function toRecords(titles: Title[]) {
  return titles.map((t) => [
    t.name,
    t.media_type === "tv" ? "Series" : "Movie",
    t.year ?? "",
    t.plot ?? "",
    t.ending ?? "",
    t.acting ?? "",
    t.atmosphere ?? "",
    t.vibe ?? "",
    t.overall ?? "",
    t.tmdb_rating ?? "",
    t.imdb_rating ?? "",
    t.genres.join(", "),
    t.note ?? "",
    t.tmdb_id ?? "",
    t.imdb_id ?? "",
  ]);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function exportCsv(titles: Title[]) {
  const csv = Papa.unparse({ fields: EXPORT_HEADERS, data: toRecords(titles) });
  download(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `film-critic-${stamp()}.csv`);
}

export function exportXlsx(titles: Title[]) {
  const sheet = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS, ...toRecords(titles)]);
  sheet["!cols"] = EXPORT_HEADERS.map((h, i) => ({ wch: i === 0 ? 32 : Math.max(10, h.length) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Ratings");
  XLSX.writeFile(book, `film-critic-${stamp()}.xlsx`);
}

/** Reads CSV or Excel into an array of rows (first row = headers). */
async function readGrid(file: File): Promise<string[][]> {
  if (/\.csv$|\.tsv$|\.txt$/i.test(file.name)) {
    const text = await file.text();
    return Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true }).data;
  }
  const book = XLSX.read(await file.arrayBuffer());
  const sheet = book.Sheets[book.SheetNames[0]];
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/** Header keyword → field. Matching is by prefix so "Atmosphere (camera…)" works. */
const COLUMN_ALIASES: Record<string, string[]> = {
  name: ["name", "title", "название", "назва", "фильм", "фільм"],
  type: ["type", "тип"],
  tmdb_id: ["tmdb id", "tmdb_id"],
  note: ["note", "notes", "заметка", "нотатка"],
  plot: ["plot", "сюжет"],
  ending: ["ending", "концовка", "кінцівка"],
  acting: ["acting", "актер", "актор", "игра"],
  atmosphere: ["atmosphere", "атмосфера"],
  vibe: ["vibe", "вайб"],
};

function locateColumns(header: string[]) {
  const cols: Record<string, number> = {};
  header.forEach((h, i) => {
    const text = norm(h);
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (cols[field] === undefined && aliases.some((a) => text.startsWith(a))) cols[field] = i;
    }
  });
  return cols;
}

function clampRating(v: unknown): number | null {
  const n = Math.round(Number(String(v ?? "").replace(",", ".")));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

/** Rows with all five ratings, plus names of rows skipped for missing/invalid ratings. */
export async function parseRatingsFile(file: File): Promise<{ rows: ParsedRow[]; skipped: string[] }> {
  const grid = await readGrid(file);
  if (grid.length < 2) throw new Error("The file has no data rows.");

  const cols = locateColumns(grid[0]);
  const missing = ["name", ...CRITERIA.map((c) => c.key)].filter((k) => cols[k] === undefined);
  if (missing.length) {
    throw new Error(`Couldn't find column(s): ${missing.join(", ")}. Expected headers like the export file.`);
  }

  const rows: ParsedRow[] = [];
  const skipped: string[] = [];
  for (const line of grid.slice(1)) {
    const name = String(line[cols.name] ?? "").trim();
    if (!name) continue;

    const ratings = {} as Ratings;
    let complete = true;
    for (const c of CRITERIA) {
      const v = clampRating(line[cols[c.key as CriterionKey]]);
      if (v == null) complete = false;
      else ratings[c.key] = v;
    }
    if (!complete) {
      skipped.push(name);
      continue;
    }

    const type = norm(cols.type !== undefined ? line[cols.type] : "");
    const tmdbId = cols.tmdb_id !== undefined ? Number(line[cols.tmdb_id]) : NaN;
    rows.push({
      name,
      ratings,
      media_type: /^(tv|series|show|сериал|серіал)/.test(type) ? "tv" : type ? "movie" : null,
      tmdb_id: Number.isInteger(tmdbId) && tmdbId > 0 ? tmdbId : null,
      note: cols.note !== undefined ? String(line[cols.note] ?? "").trim() || null : null,
    });
  }
  return { rows, skipped };
}
