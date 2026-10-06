/**
 * Two-way sync between the Film Critic database (Supabase) and this spreadsheet.
 *
 * Sheet → site: an installable onEdit trigger pushes the edited row to Supabase.
 * Site → sheet: a Postgres trigger POSTs every insert/update/delete to doPost (deployed as a web app).
 *
 * Tabs: "кінокритик" holds movies, "серікритик" holds series. One row per title,
 * with the database id in a hidden last column. A row with a name and no ratings is
 * on the watchlist; a row with some but not all five ratings isn't saved until it's complete.
 *
 * Setup steps are in google-sheets/README.md.
 */

const MOVIES = 'кінокритик';
const SERIES = 'серікритик';
const TAB_TYPE = { [MOVIES]: 'movie', [SERIES]: 'tv' };

const CRITERIA = ['plot', 'ending', 'acting', 'atmosphere', 'vibe'];
const COL = { name: 1, plot: 2, ending: 3, acting: 4, atmosphere: 5, vibe: 6, overall: 7, note: 8, year: 9, id: 10 };
const WIDTH = 10;
const HEADERS = [
  'Name',
  'Plot',
  'Ending',
  'Acting',
  'Atmosphere (camera work, locations, music)',
  'Vibe (personally appealing)',
  'Overall rating',
  'Note',
  'Year',
  'id',
];
// A1, not R1C1: R1C1 references don't parse in some spreadsheet locales.
const overallFormula = (row) => '=IF(COUNT(B' + row + ':F' + row + ')=5,ROUND(AVERAGE(B' + row + ':F' + row + '),1),"")';
const COLORS = {
  header: '#fff2cc',
  overallHeader: '#a4c2f4',
  name: '#d9ead3',
  ratings: '#d9d9d9',
  overall: '#dbe5f1',
  notFound: '#fff2cc',
  error: '#f4cccc',
};

// ---------- menu & setup ----------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Film critic')
    .addItem('1. Налаштувати', 'setup')
    .addItem('2. Перенести старі таблиці (один раз)', 'migrateOldSheets')
    .addItem('3. SQL для Supabase', 'showSupabaseSql')
    .addSeparator()
    .addItem('Видалити вибрані рядки', 'deleteSelectedRows')
    .addItem('Повна синхронізація з сайтом', 'fullSyncFromMenu')
    .addToUi();
}

function setup() {
  config();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('WEBHOOK_SECRET')) props.setProperty('WEBHOOK_SECRET', Utilities.getUuid());

  const ss = SpreadsheetApp.getActive();
  const triggers = ScriptApp.getProjectTriggers();
  const has = (fn) => triggers.some((t) => t.getHandlerFunction() === fn);
  if (!has('onEditInstalled')) ScriptApp.newTrigger('onEditInstalled').forSpreadsheet(ss).onEdit().create();
  // Safety net for webhooks that never arrived (Supabase paused, Google hiccup).
  if (!has('fullSync')) ScriptApp.newTrigger('fullSync').timeBased().everyDays(1).atHour(4).create();

  SpreadsheetApp.getUi().alert('Готово. Тригери встановлені.');
}

function config() {
  const p = PropertiesService.getScriptProperties().getProperties();
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'USER_ID', 'APP_URL']) {
    if (!p[key]) throw new Error('Не задано Script property ' + key + ' (Project Settings → Script Properties)');
  }
  return p;
}

// ---------- sheet → database ----------

function onEditInstalled(e) {
  const sheet = e.range.getSheet();
  if (!TAB_TYPE[sheet.getName()]) return;

  // Only name, ratings and note are pushed; overall, year and id come from the database.
  const c1 = e.range.getColumn();
  const c2 = e.range.getLastColumn();
  const touchesData = c1 <= COL.vibe || (c1 <= COL.note && c2 >= COL.note);
  const first = Math.max(2, e.range.getRow());
  const last = e.range.getLastRow();
  if (!touchesData || last < first) return;

  withLock(() => {
    for (let row = first; row <= last; row++) {
      try {
        syncRow(sheet, row);
      } catch (err) {
        mark(sheet, row, 'error', String(err.message).slice(0, 500));
      }
    }
  });
}

function syncRow(sheet, row) {
  const r = readRow(sheet, row);
  if (!r.name) return;
  ensureOverallFormula(sheet, row);

  if (r.bad) return mark(sheet, row, 'error', 'Оцінка має бути цілим числом від 1 до 5. Порожньо = хочу подивитись.');
  if (r.filled > 0 && r.filled < 5) return mark(sheet, row, 'ok', 'Постав усі 5 оцінок, тоді збережеться на сайті.');

  if (r.id) {
    const patch = Object.assign({ name: r.name, note: r.note }, r.ratings);
    const rec = supabase('patch', 'titles?id=eq.' + r.id + '&user_id=eq.' + config().USER_ID, patch)[0];
    if (!rec) return mark(sheet, row, 'error', 'Цього запису вже нема на сайті. Видали рядок через меню Film critic.');
    remember(rec);
    return mark(sheet, row, 'ok');
  }
  createFromRow(sheet, row, r);
}

/**
 * Inserts a new title from a row. `meta` is the TMDB match if the caller already looked it up
 * (null = looked up, nothing found); undefined means look it up here.
 */
function createFromRow(sheet, row, r, meta) {
  const type = TAB_TYPE[sheet.getName()];
  const parts = splitName(r.name);
  const year = r.year || parts.year;
  if (meta === undefined) {
    try {
      meta = findOnTmdb(parts.base, type, year);
    } catch (err) {
      console.warn(err);
      meta = null;
    }
  }

  const record = Object.assign(meta || emptyMeta(parts.base, type, year), r.ratings, {
    note: joinNote(parts.extra, r.note),
    user_id: config().USER_ID,
  });
  const created = supabase('post', 'titles', record)[0];
  remember(created);
  // Ratings stay as typed: the user may already be filling in the next one.
  writeMeta(sheet, row, created);
  ensureOverallFormula(sheet, row);
  mark(sheet, row, meta ? 'ok' : 'notFound', meta ? '' : 'Не знайдено в TMDB, тому без постера. Виправ назву або знайди фільм на сайті (Find it on TMDB).');
  return created;
}

function deleteSelectedRows() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  if (!TAB_TYPE[sheet.getName()]) return ui.alert('Відкрий вкладку «' + MOVIES + '» або «' + SERIES + '».');
  const range = sheet.getActiveRange();
  const first = Math.max(2, range.getRow());
  const last = range.getLastRow();
  if (last < first) return;

  const count = last - first + 1;
  if (ui.alert('Видалити ' + count + ' рядк(и) з таблиці і з сайту?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  withLock(() => {
    for (let row = last; row >= first; row--) {
      const id = String(sheet.getRange(row, COL.id).getValue()).trim();
      if (id) supabase('delete', 'titles?id=eq.' + id + '&user_id=eq.' + config().USER_ID);
      sheet.deleteRow(row);
    }
  });
}

// ---------- database → sheet ----------

function doPost(e) {
  const c = config();
  if (!c.WEBHOOK_SECRET || e.parameter.secret !== c.WEBHOOK_SECRET) return reply('forbidden');

  const body = JSON.parse(e.postData.contents);
  const rec = body.record || body.old_record;
  if (!rec || rec.user_id !== c.USER_ID) return reply('ignored');

  withLock(() => {
    let found = locate(rec.id);
    if (body.type === 'DELETE') {
      if (found) found.sheet.deleteRow(found.row);
      return;
    }
    // Our own writes echo back here; skip them and anything older than what the sheet has.
    if (isStale(rec)) return;
    remember(rec);

    const target = tabFor(rec.media_type);
    if (found && found.sheet.getName() !== target.getName()) {
      found.sheet.deleteRow(found.row);
      found = null;
    }
    writeRecord(target, found ? found.row : appendRow(target), rec);
  });
  return reply('ok');
}

function fullSyncFromMenu() {
  fullSync();
  SpreadsheetApp.getActive().toast('Синхронізовано з сайтом');
}

/** Makes both tabs match the database. Rows without an id are pushed as new titles. */
function fullSync() {
  withLock(() => {
    const records = fetchTitles();
    const byId = new Map(records.map((r) => [r.id, r]));
    const linked = tabs().some((sheet) => readAll(sheet).some((r) => r.id));
    // An empty answer with linked rows means a wrong USER_ID or key, not an empty library.
    if (!records.length && linked) throw new Error('Supabase повернув 0 записів. Перевір USER_ID і ключ.');

    const seen = new Set();
    for (const sheet of tabs()) {
      for (let row = lastUsedRow(sheet); row >= 2; row--) {
        const r = readRow(sheet, row);
        if (r.id) {
          const rec = byId.get(r.id);
          if (!rec || tabFor(rec.media_type).getName() !== sheet.getName()) {
            sheet.deleteRow(row); // deleted on the site, or moved to the other tab below
            continue;
          }
          seen.add(r.id);
          remember(rec);
          writeRecord(sheet, row, rec);
        } else if (r.name) {
          try {
            syncRow(sheet, row);
          } catch (err) {
            mark(sheet, row, 'error', String(err.message).slice(0, 500));
          }
        }
      }
    }
    for (const rec of records) {
      if (seen.has(rec.id)) continue;
      const sheet = tabFor(rec.media_type);
      remember(rec);
      writeRecord(sheet, appendRow(sheet), rec);
    }
  });
}

// ---------- one-time migration ----------

/**
 * Builds the two tabs from the old sheets: the first tab of this file (movies) and the first
 * tab of the series file (SERIES_SPREADSHEET_ID). Old tabs are kept as "(старе)" backups.
 * Then links every row to the database: by name, then TMDB id, then identical ratings.
 * Safe to re-run after a failure: it reuses the backup and rebuilds tabs that aren't linked yet.
 */
function migrateOldSheets() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const linked = tabs().some((sheet) => readAll(sheet).some((r) => r.id));
  if (linked) return ui.alert('Вже перенесено. Для оновлення використовуй «Повна синхронізація».');

  const seriesRef = PropertiesService.getScriptProperties().getProperty('SERIES_SPREADSHEET_ID');
  if (!seriesRef) return ui.alert('Додай Script property SERIES_SPREADSHEET_ID: посилання на файл серікритик.');
  const seriesId = (seriesRef.match(/\/d\/([^/]+)/) || [null, seriesRef])[1].trim();

  // Leftovers of an earlier run that stopped halfway. MOVIES/SERIES only count as leftovers
  // once the backup exists; before that, MOVIES may be the original tab itself.
  const resumed = !!ss.getSheetByName(MOVIES + ' (старе)');
  const leftovers = [MOVIES + ' (нове)', SERIES + ' (нове)'].concat(resumed ? [MOVIES, SERIES] : []);
  for (const name of leftovers) {
    const sheet = ss.getSheetByName(name);
    if (sheet) ss.deleteSheet(sheet);
  }

  const movieSource = ss.getSheetByName(MOVIES + ' (старе)') || ss.getSheets()[0];
  const seriesSource = SpreadsheetApp.openById(seriesId).getSheets()[0];
  const movieRows = readOldSheet(movieSource);
  const seriesRows = readOldSheet(seriesSource);

  // Build under temporary names first, so a failure here leaves the old tabs untouched.
  const movies = createTab(ss, MOVIES + ' (нове)', 0);
  const series = createTab(ss, SERIES + ' (нове)', 1);
  fillTab(movies, movieRows);
  fillTab(series, seriesRows);

  if (movieSource.getName() !== MOVIES + ' (старе)') movieSource.setName(MOVIES + ' (старе)');
  if (!ss.getSheetByName(SERIES + ' (старе)')) seriesSource.copyTo(ss).setName(SERIES + ' (старе)');
  movies.setName(MOVIES);
  series.setName(SERIES);
  SpreadsheetApp.flush();

  linkWithDatabase();
  ui.alert(
    'Перенесено: фільмів ' + movieRows.length + ', серіалів ' + seriesRows.length + '.\n\n' +
      'Жовті назви не знайдені в TMDB. Старі вкладки «(старе)» можна видалити, коли все перевіриш.',
  );
}

/** Reads name + ratings, tolerating 2-row merged blocks and 0 as "not rated". */
function readOldSheet(sheet) {
  const values = sheet.getDataRange().getValues();
  let start = values.findIndex((v) => /^\s*(name|назва|название)/i.test(String(v[0])));
  start = start === -1 ? 1 : start + 1;

  const rows = [];
  let current = null;
  for (const v of values.slice(start)) {
    const name = String(v[0]).trim();
    if (name) {
      current = { name, ratings: {} };
      CRITERIA.forEach((k) => (current.ratings[k] = null));
      rows.push(current);
    }
    if (!current) continue;
    CRITERIA.forEach((k, i) => {
      const n = parseRating(v[1 + i]);
      if (current.ratings[k] == null && typeof n === 'number') current.ratings[k] = n;
    });
  }
  return rows;
}

function fillTab(sheet, rows) {
  if (!rows.length) return;
  const values = rows.map((r) => [r.name].concat(CRITERIA.map((k) => blank(r.ratings[k]))));
  sheet.getRange(2, 1, rows.length, 6).setValues(values);
  sheet.getRange(2, COL.overall, rows.length).setFormulas(rows.map((_, i) => [overallFormula(i + 2)]));
}

function linkWithDatabase() {
  const free = new Map(fetchTitles().map((r) => [r.id, r]));
  const take = (rec) => {
    free.delete(rec.id);
    return rec;
  };
  const pending = [];
  for (const sheet of tabs()) {
    readAll(sheet).forEach((r, i) => r.name && !r.id && pending.push({ sheet, row: i + 2, r, type: TAB_TYPE[sheet.getName()] }));
  }

  // 1. Same name (ignoring "(1 season)" and punctuation).
  for (const x of pending) {
    const base = norm(splitName(x.r.name).base);
    const rec = [...free.values()].find((t) => norm(t.name) === base);
    if (rec) x.match = take(rec);
  }
  // 2. Same TMDB title.
  for (const x of pending.filter((x) => !x.match)) {
    const parts = splitName(x.r.name);
    try {
      x.meta = findOnTmdb(parts.base, x.type, x.r.year || parts.year);
    } catch (err) {
      console.warn(err);
      x.meta = null;
    }
    const rec = x.meta && [...free.values()].find((t) => t.tmdb_id === x.meta.tmdb_id && t.media_type === x.meta.media_type);
    if (rec) x.match = take(rec);
  }
  // 3. Exactly one unmatched title of the same type with identical ratings ("clan soprano" → "The Sopranos").
  for (const x of pending.filter((x) => !x.match && x.r.filled === 5)) {
    const same = [...free.values()].filter((t) => t.media_type === x.type && CRITERIA.every((k) => t[k] === x.r.ratings[k]));
    if (same.length === 1) x.match = take(same[0]);
  }

  for (const x of pending) {
    withLock(() => {
      if (x.match) {
        // id first, so the webhook for the patch below finds the row.
        x.sheet.getRange(x.row, COL.id).setValue(x.match.id);
        const patch = {};
        const note = joinNote(splitName(x.r.name).extra, x.match.note);
        if (note !== x.match.note) patch.note = note;
        // The sheet was the source of truth until now.
        if (x.r.filled === 5) CRITERIA.forEach((k) => x.r.ratings[k] !== x.match[k] && (patch[k] = x.r.ratings[k]));
        const rec = Object.keys(patch).length ? supabase('patch', 'titles?id=eq.' + x.match.id, patch)[0] : x.match;
        remember(rec);
        writeRecord(x.sheet, x.row, rec);
        mark(x.sheet, x.row, 'ok');
      } else if (x.r.filled === 0 || x.r.filled === 5) {
        try {
          createFromRow(x.sheet, x.row, x.r, x.meta);
        } catch (err) {
          mark(x.sheet, x.row, 'error', String(err.message).slice(0, 500));
        }
      }
    });
  }

  // Titles that are on the site but weren't in the old sheets.
  withLock(() => {
    for (const rec of free.values()) {
      const sheet = tabFor(rec.media_type);
      remember(rec);
      writeRecord(sheet, appendRow(sheet), rec);
    }
  });
}

function createTab(ss, name, index) {
  const sheet = ss.insertSheet(name, index);
  const rows = sheet.getMaxRows() - 1;

  sheet.getRange(1, 1, sheet.getMaxRows(), WIDTH).setFontFamily('Montserrat').setVerticalAlignment('middle');
  sheet
    .getRange(1, 1, 1, WIDTH)
    .setValues([HEADERS])
    .setBackground(COLORS.header)
    .setFontWeight('bold')
    .setFontStyle('italic')
    .setFontSize(12)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('bottom')
    .setWrap(true);
  sheet.getRange(1, COL.overall).setBackground(COLORS.overallHeader);
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 64);

  sheet.getRange(2, COL.name, rows).setBackground(COLORS.name).setFontWeight('bold').setHorizontalAlignment('center').setWrap(true);
  sheet.getRange(2, COL.plot, rows, 5).setBackground(COLORS.ratings).setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(2, COL.overall, rows).setBackground(COLORS.overall).setFontWeight('bold').setHorizontalAlignment('right').setNumberFormat('0.0');
  sheet.getRange(2, COL.note, rows).setWrap(true);
  sheet.getRange(2, COL.year, rows).setHorizontalAlignment('center').setNumberFormat('0');

  const rule = SpreadsheetApp.newDataValidation()
    // A formula rule breaks in locales that use ";" as the argument separator.
    // Fractions get through here but syncRow rejects them.
    .requireNumberBetween(0, 5)
    .setAllowInvalid(false)
    .setHelpText('Ціле число від 1 до 5. Порожньо = хочу подивитись.')
    .build();
  sheet.getRange(2, COL.plot, rows, 5).setDataValidation(rule);

  [[COL.name, 320], [COL.plot, 110], [COL.ending, 110], [COL.acting, 110], [COL.atmosphere, 220], [COL.vibe, 220], [COL.overall, 150], [COL.note, 240], [COL.year, 70]].forEach(
    ([col, width]) => sheet.setColumnWidth(col, width),
  );
  sheet.hideColumns(COL.id);
  sheet.getRange(2, COL.overall, rows).protect().setWarningOnly(true).setDescription('Рахується автоматично');
  sheet.getRange(1, COL.id, sheet.getMaxRows()).protect().setWarningOnly(true).setDescription('Зв’язок із сайтом, не чіпати');
  return sheet;
}

function showSupabaseSql() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('WEBHOOK_SECRET')) props.setProperty('WEBHOOK_SECRET', Utilities.getUuid());
  const secret = props.getProperty('WEBHOOK_SECRET');
  const url = ScriptApp.getService().getUrl() || '';

  const html = HtmlService.createHtmlOutput(
    '<div style="font:13px sans-serif">' +
      '<p>1. Встав URL з <b>Deploy → Manage deployments</b> (закінчується на <code>/exec</code>):</p>' +
      '<input id="url" style="width:100%;padding:6px" value="' + url.replace(/"/g, '') + '">' +
      '<p>2. Скопіюй SQL і виконай у <b>Supabase → SQL Editor → Run</b>:</p>' +
      '<textarea id="sql" style="width:100%;height:300px;font:12px monospace" readonly></textarea>' +
      '</div>' +
      '<script>' +
      'const tpl=' + JSON.stringify(SQL_TEMPLATE) + ';' +
      'const secret=' + JSON.stringify(secret) + ';' +
      'const url=document.getElementById("url"),sql=document.getElementById("sql");' +
      'function render(){sql.value=tpl.replace("{{URL}}",url.value.trim()+"?secret="+secret)}' +
      'url.oninput=render;render();sql.onfocus=()=>sql.select();' +
      '</script>',
  )
    .setWidth(720)
    .setHeight(480);
  SpreadsheetApp.getUi().showModalDialog(html, 'SQL для Supabase');
}

// Same as supabase/sheets-sync.sql.
const SQL_TEMPLATE = `create extension if not exists pg_net with schema extensions;

create or replace function public.notify_google_sheet() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := '{{URL}}',
    body := jsonb_build_object(
      'type', tg_op,
      'record', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
      'old_record', case when tg_op = 'INSERT' then null else to_jsonb(old) end
    ),
    timeout_milliseconds := 30000
  );
  return null;
end $$;

drop trigger if exists titles_notify_google_sheet on public.titles;
create trigger titles_notify_google_sheet
  after insert or update or delete on public.titles
  for each row execute function public.notify_google_sheet();
`;

// ---------- sheet helpers ----------

function tabs() {
  const ss = SpreadsheetApp.getActive();
  return [MOVIES, SERIES].map((n) => ss.getSheetByName(n)).filter(Boolean);
}

function tabFor(mediaType) {
  const name = mediaType === 'tv' ? SERIES : MOVIES;
  const sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw new Error('Нема вкладки «' + name + '». Запусти «Перенести старі таблиці».');
  return sheet;
}

function parseRating(raw) {
  if (raw === '' || raw === null) return null;
  const n = Number(String(raw).replace(',', '.'));
  if (n === 0) return null;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 'bad';
}

function toRow(v) {
  const ratings = {};
  let bad = false;
  CRITERIA.forEach((k) => {
    const n = parseRating(v[COL[k] - 1]);
    bad = bad || n === 'bad';
    ratings[k] = n === 'bad' ? null : n;
  });
  return {
    name: String(v[COL.name - 1]).trim(),
    ratings,
    filled: CRITERIA.filter((k) => ratings[k] != null).length,
    bad,
    note: String(v[COL.note - 1]).trim() || null,
    year: Number(v[COL.year - 1]) || null,
    id: String(v[COL.id - 1]).trim() || null,
  };
}

function readRow(sheet, row) {
  return toRow(sheet.getRange(row, 1, 1, WIDTH).getValues()[0]);
}

/** Rows 2..last, index 0 = row 2. */
function readAll(sheet) {
  const last = lastUsedRow(sheet);
  return last < 2 ? [] : sheet.getRange(2, 1, last - 1, WIDTH).getValues().map(toRow);
}

function lastUsedRow(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return 1;
  const cols = sheet.getRange(1, 1, last, WIDTH).getValues();
  for (let i = cols.length - 1; i >= 1; i--) {
    if (cols[i][COL.name - 1] !== '' || cols[i][COL.id - 1] !== '') return i + 1;
  }
  return 1;
}

function appendRow(sheet) {
  const row = lastUsedRow(sheet) + 1;
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 50);
  return row;
}

function locate(id) {
  for (const sheet of tabs()) {
    const last = sheet.getLastRow();
    if (last < 2) continue;
    const i = sheet.getRange(2, COL.id, last - 1).getValues().findIndex((v) => v[0] === id);
    if (i !== -1) return { sheet, row: i + 2 };
  }
  return null;
}

/** Name, note, year, id; ratings only when the title has them (a watchlist row may be mid-typing). */
function writeRecord(sheet, row, rec) {
  writeMeta(sheet, row, rec);
  if (rec.overall != null) sheet.getRange(row, COL.plot, 1, 5).setValues([CRITERIA.map((k) => blank(rec[k]))]);
  ensureOverallFormula(sheet, row);
}

function writeMeta(sheet, row, rec) {
  sheet.getRange(row, COL.name).setValue(rec.name);
  sheet.getRange(row, COL.note, 1, 3).setValues([[blank(rec.note), blank(rec.year), rec.id]]);
}

function ensureOverallFormula(sheet, row) {
  const cell = sheet.getRange(row, COL.overall);
  // Rows move when others are deleted, so compare rather than just check for presence.
  const formula = overallFormula(row);
  if (cell.getFormula() !== formula) cell.setFormula(formula);
}

function mark(sheet, row, state, message) {
  const color = { ok: COLORS.name, notFound: COLORS.notFound, error: COLORS.error }[state];
  sheet.getRange(row, COL.name).setBackground(color).setNote(message || '');
}

// ---------- data helpers ----------

/** "Prison Break (5/6) seasons" → base "Prison Break", extra "5/6 seasons". "Heat (1995)" → year 1995. */
function splitName(raw) {
  const m = String(raw).match(/^(.*?)\s*\(([^)]*)\)\s*(.*)$/);
  if (!m || !m[1].trim()) return { base: String(raw).trim(), extra: '', year: null };
  const inside = m[2].trim();
  const after = m[3].trim();
  if (/^\d{4}$/.test(inside) && !after) return { base: m[1].trim(), extra: '', year: Number(inside) };
  return { base: m[1].trim(), extra: [inside, after].filter(Boolean).join(' '), year: null };
}

function joinNote(extra, note) {
  if (!extra) return note || null;
  if (note && note.toLowerCase().includes(extra.toLowerCase())) return note;
  return note ? extra + ' · ' + note : extra;
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function blank(v) {
  return v === null || v === undefined ? '' : v;
}

function emptyMeta(name, type, year) {
  return {
    tmdb_id: null,
    media_type: type,
    name,
    year: year || null,
    poster_path: null,
    backdrop_path: null,
    overview: null,
    genres: [],
    tmdb_rating: null,
    imdb_id: null,
    imdb_rating: null,
    runtime: null,
  };
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

function reply(text) {
  return ContentService.createTextOutput(text);
}

/** Last updated_at the sheet has seen per title, so webhook echoes of our own writes are skipped. */
function remember(rec) {
  if (rec && rec.updated_at) CacheService.getScriptCache().put('u:' + rec.id, rec.updated_at, 21600);
}

function isStale(rec) {
  const seen = CacheService.getScriptCache().get('u:' + rec.id);
  return !!seen && Date.parse(rec.updated_at) <= Date.parse(seen);
}

// ---------- remote APIs ----------

function supabase(method, path, body) {
  const c = config();
  // Pasted keys sometimes pick up spaces or line breaks.
  const key = c.SUPABASE_SERVICE_KEY.replace(/\s+/g, '');
  const headers = { apikey: key, Prefer: 'return=representation' };
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys don't.
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
  const options = { method, headers, contentType: 'application/json', muteHttpExceptions: true };
  if (body !== undefined) options.payload = JSON.stringify(body);

  const res = UrlFetchApp.fetch(c.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/' + path, options);
  const text = res.getContentText();
  if (res.getResponseCode() >= 300) throw new Error('Supabase ' + res.getResponseCode() + ': ' + text);
  return text ? JSON.parse(text) : null;
}

function fetchTitles() {
  return supabase('get', 'titles?select=*&order=created_at&user_id=eq.' + config().USER_ID);
}

/** TMDB lookups go through the deployed site, so the TMDB key stays on the server. */
function app(path) {
  const res = UrlFetchApp.fetch(config().APP_URL.replace(/\/+$/, '') + path, { muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) throw new Error('TMDB lookup failed (' + res.getResponseCode() + ')');
  return JSON.parse(res.getContentText());
}

function findOnTmdb(name, type, year) {
  const q = year ? name + ' (' + year + ')' : name;
  const results = app('/api/tmdb/search?q=' + encodeURIComponent(q)).results.filter((r) => r.media_type === type);
  const hit = (year && results.find((r) => r.year === year)) || results[0];
  if (!hit) return null;
  const d = app('/api/tmdb/details?type=' + type + '&id=' + hit.tmdb_id);
  return {
    tmdb_id: d.tmdb_id,
    media_type: d.media_type,
    name: d.name,
    year: d.year,
    poster_path: d.poster_path,
    backdrop_path: d.backdrop_path,
    overview: d.overview,
    genres: d.genres,
    tmdb_rating: d.tmdb_rating,
    imdb_id: d.imdb_id,
    imdb_rating: d.imdb_rating,
    runtime: d.runtime,
  };
}
