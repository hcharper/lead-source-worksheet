/**
 * Lead Source Worksheet — the Google Sheet behind the page.
 *
 * Two tabs, created on first use:
 *   take     our first pass, one row per channel / source / tag. Edit it here, in the sheet;
 *            the page picks changes up within 30 seconds.
 *   reviews  one row per (reviewer, row) — the page upserts; nothing is ever deleted.
 *
 * Every request must carry TOKEN, a Script Property (Project Settings → Script properties).
 * The token is derived from the page password by the build, so this file holds no secret
 * and is safe in a public repo.
 */
const TAKE_COLS = ['id', 'kind', 'name', 'channel', 'def', 'goesTo', 'note', 'order', 'was', 'action'];
const REV_COLS = ['reviewer', 'name_display', 'row', 'v', 'name', 'channel', 'note', 'at'];

function doGet(e) {
  if (!authorised_(e.parameter.token)) return out_({ error: 'This page’s password no longer matches the sheet.' });
  return out_({ take: rows_(sheet_('take', TAKE_COLS)), reviews: rows_(sheet_('reviews', REV_COLS)) });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ error: 'Unreadable request.' }); }
  if (!authorised_(body.token)) return out_({ error: 'This page’s password no longer matches the sheet.' });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (body.action === 'answer') return out_(answer_(body));
    if (body.action === 'seed') return out_(seed_(body.rows));
    return out_({ error: 'Unknown action.' });
  } finally {
    lock.releaseLock();
  }
}

function answer_(b) {
  const sh = sheet_('reviews', REV_COLS);
  const reviewer = clean_(b.reviewer, 40).toLowerCase();
  const row = clean_(b.row, 80);
  if (!reviewer || !row) return { error: 'Missing reviewer or row.' };
  const values = [reviewer, clean_(b.name_display, 40), row, clean_(b.v, 10), clean_(b.name, 200),
                  clean_(b.channel, 80), clean_(b.note, 2000), new Date().toISOString()];
  const last = sh.getLastRow();
  if (last > 1) {
    const keys = sh.getRange(2, 1, last - 1, 3).getValues();
    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === reviewer && String(keys[i][2]) === row) {
        sh.getRange(i + 2, 1, 1, REV_COLS.length).setValues([values]);
        return { ok: true };
      }
    }
  }
  sh.appendRow(values);
  return { ok: true };
}

/** Loads our first pass, once. Refuses if the take tab already has rows. */
function seed_(rows) {
  const sh = sheet_('take', TAKE_COLS);
  if (sh.getLastRow() > 1) return { ok: true, skipped: true };
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) return { error: 'Bad seed.' };
  const values = rows.map(r => TAKE_COLS.map(c => c === 'order' ? Number(r[c]) || 0 : clean_(r[c], 2000)));
  sh.getRange(2, 1, values.length, TAKE_COLS.length).setValues(values);
  return { ok: true };
}

function authorised_(token) {
  const want = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return !!want && typeof token === 'string' && token === want;
}

function sheet_(name, cols) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function rows_(sh) {
  const values = sh.getDataRange().getValues();
  const head = values.shift() || [];
  return values
    .filter(r => r.some(c => c !== ''))
    .map(r => Object.fromEntries(head.map((h, i) => [h, r[i] instanceof Date ? r[i].toISOString() : r[i]])));
}

/** Strings only, capped, and never a formula — a leading = + - @ would be evaluated by Sheets. */
function clean_(v, max) {
  let s = String(v == null ? '' : v).slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
