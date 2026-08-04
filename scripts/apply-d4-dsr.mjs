/*
 * Deterministic D4 patch for the DSR module embedded in www/index.html.
 * Only MODULES[id=dsr] is decoded and re-encoded; exact UTF-8 bytes and
 * SHA-256 metadata are regenerated before an atomic replacement.
 *
 * D4 replaces the dishonest completion meter (five of nine section checks were
 * the literal `true`, giving an empty record a 56% floor), reconciles the meter
 * with the submit gate, names what is missing when submit is refused, guards the
 * progress-bar nodes, and marks carried-forward opening values.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(repoDir, 'www', 'index.html');
const runtimeMarker = 'D4-DSR-RUNTIME-2026-08-04';
const cssMarker = 'D4-DSR-CSS-2026-08-04';
const policyTag = '<script src="dsr-completion-policy.js"></script>';

/* Declared after the helper functions below; the injected set and the
   exactly-once verification list are both derived from it so they cannot drift. */
let d4Helpers = [];
let d4HelperNames = [];

/* The DSR payload is CRLF throughout (3,297 pairs). Anchors and injected blocks
   are authored with LF in this file and converted to the payload's own ending so
   the bundle stays internally consistent and the patch stays idempotent. */
function detectEol(source) {
  return source.includes('\r\n') ? '\r\n' : '\n';
}

function toEol(text, eol) {
  return String(text).replace(/\r\n/g, '\n').replace(/\n/g, eol);
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: anchor not found`);
  if (first !== source.lastIndexOf(before)) throw new Error(`${label}: anchor is not unique`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceFunction(source, name, replacement) {
  const eol = detectEol(source);
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  if (start < 0) throw new Error(`${name}: function not found`);
  if (start !== source.lastIndexOf(token)) throw new Error(`${name}: function is not unique`);
  const end = source.indexOf(`${eol}function `, start + token.length);
  if (end < 0) throw new Error(`${name}: next function boundary not found`);
  return source.slice(0, start) + toEol(replacement, eol) + source.slice(end);
}

function functionTokenCount(source, name) {
  return source.split(`function ${name}(`).length - 1;
}

/* ── owned helpers (injected verbatim via Function.prototype.toString) ── */

function dsrD4PolicyApi() {
  /* D4-DSR-RUNTIME-2026-08-04 */
  try {
    return (window.parent && window.parent !== window &&
      window.parent.SaagarDsrCompletionPolicy) ||
      window.SaagarDsrCompletionPolicy || null;
  } catch (error) {
    return null;
  }
}

function dsrD4Context() {
  try {
    return { stockCategories: activeStockCats(), taskList: TASK_LIST };
  } catch (error) {
    return { stockCategories: [], taskList: [] };
  }
}

/* Repeats prefillOpeningFromPrev()'s 7-day lookback so carry provenance is
   derived at render time. Read-only; writes nothing. */
function dsrD4PrevClosingRecord(rec) {
  try {
    if (!rec || rec._noRecord) return null;
    for (let back = 1; back <= 7; back++) {
      const raw = localStorage.getItem(recKey(prevDayStr(rec.date, back), rec.staffName));
      if (!raw) continue;
      const prev = JSON.parse(raw);
      if (!prev || !prev.closing) return null;
      return { date: prevDayStr(rec.date, back), closing: prev.closing };
    }
  } catch (error) {}
  return null;
}

function dsrD4CarriedOpening(rec) {
  try {
    const api = dsrD4PolicyApi();
    if (!api) return {};
    return api.carriedOpeningFields(rec, dsrD4PrevClosingRecord(rec), dsrD4Context().stockCategories);
  } catch (error) {
    return {};
  }
}

/* Owner ruling 2026-08-04: a zero-sale day must be affirmed, not assumed. Mirrors
   the policy's validity check — an array would otherwise pass, since typeof [] is
   'object' and [].at resolves to Array.prototype.at. */
function dsrD4NoSalesAck(rec) {
  const ack = rec && rec.d4NoSales;
  if (!ack || typeof ack !== 'object' || Array.isArray(ack)) return null;
  return (typeof ack.at === 'string' && ack.at.length > 0) ? ack : null;
}

function dsrD4ToggleNoSales() {
  const rec = getRecord();
  if (rec.submitted || isPastView()) return;
  if (Array.isArray(rec.sales) && rec.sales.length) {
    toast('Sales are recorded for today — nothing to confirm', 'err');
    return;
  }
  rec.d4NoSales = dsrD4NoSalesAck(rec)
    ? null
    : { at: nowTime(), by: rec.staffName || '' };
  saveRec(rec);
  renderSales();
  updateProgress();
}

/* Falls back to the honest subset when the policy file is absent: the sections
   that carry real evidence. It never reinstates the hardcoded `true` entries, so
   a missing policy can under-report but never over-report. */
function dsrD4Summary(rec) {
  const api = dsrD4PolicyApi();
  if (api) {
    try { return api.completionSummary(rec, dsrD4Context()); } catch (error) {}
  }
  const ctx = dsrD4Context();
  const cats = ctx.stockCategories || [];
  const tasks = ctx.taskList || [];
  const cleaning = (rec && rec.cleaning) || {};
  const cp1 = cleaning.cp1 || {};
  const cp2 = cleaning.cp2 || {};
  const status = {
    daystart: 'not_applicable', opening: 'incomplete', inout: 'not_applicable',
    sales: 'incomplete', nonpurch: 'not_applicable', tasks: 'incomplete',
    marketing: 'not_applicable', cleaning: 'incomplete', closing: 'incomplete'
  };
  if ((Array.isArray(rec && rec.sales) && rec.sales.length > 0) ||
      dsrD4NoSalesAck(rec) || (rec && rec.submitted)) status.sales = 'complete';
  if (cats.length && cats.every(c => rec && rec.opening && rec.opening[c.id] !== '' &&
    rec.opening[c.id] !== undefined && rec.opening[c.id] !== null)) status.opening = 'complete';
  if (cats.length && cats.every(c => rec && rec.closing && rec.closing[c.id] !== '' &&
    rec.closing[c.id] !== undefined && rec.closing[c.id] !== null)) status.closing = 'complete';
  if (tasks.length && tasks.every(t => taskEntered(rec && rec.tasks && rec.tasks[t.id]))) status.tasks = 'complete';
  if (cp1.done && cp1.photo && cp2.done && cp2.photo) status.cleaning = 'complete';
  const applicable = ['opening', 'sales', 'tasks', 'cleaning', 'closing'];
  const done = applicable.filter(id => status[id] === 'complete').length;
  return { status, done, total: applicable.length,
    percent: applicable.length ? Math.round(done / applicable.length * 100) : 0 };
}

d4Helpers = [
  dsrD4PolicyApi,
  dsrD4Context,
  dsrD4PrevClosingRecord,
  dsrD4CarriedOpening,
  dsrD4NoSalesAck,
  dsrD4ToggleNoSales,
  dsrD4Summary
];
d4HelperNames = d4Helpers.map(fn => fn.name);

/* ── replaced module functions ── */

function updateProgress() {
  const rec = getRecord();
  const summary = dsrD4Summary(rec);
  const status = summary.status || {};
  const tabs = ['daystart','opening','inout','sales','nonpurch','tasks','marketing','cleaning','closing'];
  tabs.forEach(id => {
    const btn = el('stbtn-' + id);
    if (!btn) return;
    btn.classList.toggle('done', status[id] === 'complete');
    btn.classList.toggle('optional', status[id] === 'not_applicable');
  });
  const fill = el('pbar-fill');
  if (fill) fill.style.width = summary.percent + '%';
  const lbl = el('pbar-lbl');
  if (lbl) lbl.textContent = summary.done + ' / ' + summary.total;
  updateStaffMeter(summary.done, summary.total);
}

function getMissingForSubmit(rec) {
  const api = dsrD4PolicyApi();
  if (api) {
    try { return api.missingForSubmit(rec, dsrD4Context()); } catch (error) {}
  }
  const m = [];
  if (!activeStockCats().every(c => rec.opening[c.id] !== '')) m.push('Opening stock — enter counts for all brands');
  if (!(Array.isArray(rec.sales) && rec.sales.length) && !dsrD4NoSalesAck(rec)) m.push('Sales — add the day’s bills, or confirm there were no sales today');
  if (!TASK_LIST.every(t => taskEntered(rec.tasks[t.id]))) m.push('Daily task counts — fill all items');
  if (!rec.cleaning.cp1.done || !rec.cleaning.cp1.photo) m.push('Cleaning Checkpoint 1 — mark done & attach photo');
  if (!rec.cleaning.cp2.done || !rec.cleaning.cp2.photo) m.push('Cleaning Checkpoint 2 — mark done & attach photo');
  if (!activeStockCats().every(c => rec.closing[c.id] !== '')) m.push('Closing stock — enter counts for all brands');
  return m;
}

function submitDay() {
  const rec = getRecord();
  if (rec.submitted || isPastView()) { closeModal(); return; }
  const miss = getMissingForSubmit(rec);
  if (miss.length > 0) {
    el('modal-body').innerHTML = `
    <div class="modal-title">Not ready to submit</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:12px;line-height:1.7">
      ${miss.length} item${miss.length === 1 ? '' : 's'} still need attention:
    </p>
    <ul class="dsr-d4-missing">${miss.map(item => '<li>' + esc(item) + '</li>').join('')}</ul>
    <div style="display:flex;gap:10px;margin-top:18px">
      <button class="btn btn-outline" style="flex:1" onclick="closeModal()">Close</button>
    </div>`;
    openModal();
    return;
  }
  rec.submitted = true; rec.submitTime = nowTime();
  saveRec(rec); closeModal();
  toast('Day report submitted successfully','ok');
  renderClosing(); updateProgress();
}

const d4Css = `
/* ${cssMarker} — sections with no daily obligation read distinctly from both
   completed (green dot) and pending (no dot), so a not-applicable tab is never
   mistaken for unfinished work. */
.tab-btn.optional .tab-dot { display: block; background: var(--muted, #9aa0a6); opacity: .55; }
.dsr-d4-missing { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.8; }
.dsr-d4-missing li { margin-bottom: 2px; }
.dsr-d4-carried {
  display: inline-block; font-size: 10px; font-weight: 600; letter-spacing: .02em;
  color: var(--muted, #9aa0a6); margin-left: 6px; white-space: nowrap;
}
`;

function patchDsr(html) {
  const eol = detectEol(html);
  if (!html.includes(runtimeMarker)) {
    const anchor = '/* ── PROGRESS ── */';
    const helpers = d4Helpers.map(fn => fn.toString()).join('\n');
    html = replaceOnce(html, anchor, toEol(helpers + '\n\n', eol) + anchor, 'D4 owned helpers');
  }

  html = replaceFunction(html, 'updateProgress', updateProgress.toString());
  html = replaceFunction(html, 'getMissingForSubmit', getMissingForSubmit.toString());
  html = replaceFunction(html, 'submitDay', submitDay.toString());

  if (!html.includes(cssMarker)) {
    const styleAt = html.indexOf('</style>');
    if (styleAt < 0) throw new Error('DSR style boundary not found');
    html = html.slice(0, styleAt) + toEol(d4Css + '\n', eol) + html.slice(styleAt);
  }

  /* Carried-forward provenance in the opening-stock grid. The value is unchanged
     and stays editable; only its origin becomes visible. */
  if (!html.includes('const d4Carried =')) {
    html = replaceOnce(
      html,
      toEol('  const rec = getRecord();\n  const locked = rec.submitted || isPastView();\n  el(\'tsec-opening\').innerHTML = `', eol),
      toEol('  const rec = getRecord();\n  const locked = rec.submitted || isPastView();\n  const d4Carried = dsrD4CarriedOpening(rec);\n  el(\'tsec-opening\').innerHTML = `', eol),
      'D4 carried lookup'
    );
    /* Anchored on the opening-stock field block specifically — the closing-stock
       grid renders byte-identical label markup, so the label alone is ambiguous. */
    html = replaceOnce(
      html,
      toEol('              <label class="flbl">${esc(name)} <span class="req">*</span></label>\n' +
        '              <input class="finp" type="number" min="0" placeholder="0"\n' +
        '                value="${esc(rec.opening[c.id])}"', eol),
      toEol('              <label class="flbl">${esc(name)} <span class="req">*</span>' +
        '${d4Carried[c.id] ? `<span class="dsr-d4-carried" title="Carried from the closing count on ${esc(d4Carried[c.id])}">carried ${esc(d4Carried[c.id])}</span>` : \'\'}</label>\n' +
        '              <input class="finp" type="number" min="0" placeholder="0"\n' +
        '                value="${esc(rec.opening[c.id])}"', eol),
      'D4 carried label'
    );
  }

  /* Owner ruling 2026-08-04: replace the "leave this empty" guidance with the
     acknowledgement control. The empty state is the only place a zero-sale day
     is visible, so the affirmation belongs there. */
  if (!html.includes('onclick="dsrD4ToggleNoSales()"')) {
    html = replaceOnce(
      html,
      toEol('          <div class="empty-title">No sales recorded</div>\n' +
        '          <div class="empty-sub">Zero sales today? That\'s fine — leave this empty.</div>', eol),
      toEol('          <div class="empty-title">No sales recorded</div>\n' +
        '          <div class="empty-sub">${dsrD4NoSalesAck(rec)\n' +
        '            ? `Confirmed: no sales today (${esc(dsrD4NoSalesAck(rec).at)}${dsrD4NoSalesAck(rec).by ? \' · \' + esc(dsrD4NoSalesAck(rec).by) : \'\'})`\n' +
        '            : \'A day with no sales must be confirmed before you can submit.\'}</div>\n' +
        '          ${locked ? \'\' : `<button class="btn ${dsrD4NoSalesAck(rec) ? \'btn-outline\' : \'btn-green\'} btn-sm" style="margin-top:10px" onclick="dsrD4ToggleNoSales()">${dsrD4NoSalesAck(rec) ? \'Undo confirmation\' : \'Confirm no sales today\'}</button>`}', eol),
      'D4 no-sales acknowledgement control'
    );
  }

  const required = [
    runtimeMarker,
    cssMarker,
    'dsrD4Summary(rec)',
    'onclick="dsrD4ToggleNoSales()"',
    'A day with no sales must be confirmed before you can submit.',
    'btn.classList.toggle(\'optional\'',
    'class="dsr-d4-missing"',
    'const d4Carried = dsrD4CarriedOpening(rec);',
    'dsr-d4-carried'
  ];
  const missing = required.find(item => !html.includes(item));
  if (missing) throw new Error(`D4 DSR patch missing ${missing}`);

  const invalidHelper = d4HelperNames.find(name => functionTokenCount(html, name) !== 1);
  if (invalidHelper) throw new Error(`D4 helper ${invalidHelper} is not present exactly once`);

  return html;
}

function patchRuntimeTag(index) {
  if (index.includes(policyTag)) return index;
  return replaceOnce(
    index,
    '<script src="qms-policy.js"></script>',
    `${policyTag}\n<script src="qms-policy.js"></script>`,
    'D4 runtime tag'
  );
}

const index = fs.readFileSync(indexPath, 'utf8');
const modulesMatch = index.match(/\bconst\s+MODULES\s*=\s*(\[[\s\S]*?\])\s*;\s*(\r?\n)/);
if (!modulesMatch) throw new Error('MODULES bundle not found');
const modules = JSON.parse(modulesMatch[1]);
const dsr = modules.find(module => module.id === 'dsr');
if (!dsr) throw new Error('DSR module not found');

const before = Buffer.from(dsr.html_b64, 'base64').toString('utf8');
const after = patchDsr(before);
const bytes = Buffer.from(after, 'utf8');
dsr.html_b64 = bytes.toString('base64');
dsr.bytes = bytes.length;
dsr.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

const replacement = `const MODULES = ${JSON.stringify(modules)};${modulesMatch[2]}`;
let updated = index.slice(0, modulesMatch.index) + replacement +
  index.slice(modulesMatch.index + modulesMatch[0].length);
updated = patchRuntimeTag(updated);

const verifyBundle = source => {
  const match = source.match(/\bconst\s+MODULES\s*=\s*(\[[\s\S]*?\])\s*;\s*(?:\r?\n)/);
  if (!match) throw new Error('D4 verification failed: MODULES missing');
  const module = JSON.parse(match[1]).find(item => item.id === 'dsr');
  if (!module) throw new Error('D4 verification failed: DSR missing');
  const verifyBytes = Buffer.from(module.html_b64, 'base64');
  const verifyHtml = verifyBytes.toString('utf8');
  const verifyHash = crypto.createHash('sha256').update(verifyBytes).digest('hex');
  const invalidHelper = d4HelperNames.find(name => functionTokenCount(verifyHtml, name) !== 1);
  if (verifyBytes.length !== module.bytes || verifyHash !== module.sha256 ||
      !verifyHtml.includes(runtimeMarker) ||
      !verifyHtml.includes(cssMarker) ||
      invalidHelper ||
      source.split(policyTag).length - 1 !== 1 ||
      source.indexOf(policyTag) > source.indexOf('const MODULES')) {
    throw new Error('D4 DSR bundle verification failed');
  }
  return { module, bytes: verifyBytes };
};

verifyBundle(updated);
const tempPath = `${indexPath}.d4-${process.pid}.tmp`;
try {
  fs.writeFileSync(tempPath, updated, 'utf8');
  verifyBundle(fs.readFileSync(tempPath, 'utf8'));
  fs.renameSync(tempPath, indexPath);
} finally {
  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
}
const verified = verifyBundle(fs.readFileSync(indexPath, 'utf8'));
process.stdout.write(
  after === before
    ? `D4 DSR already applied (${verified.module.bytes} bytes, ${verified.module.sha256})\n`
    : `D4 DSR applied (${verified.module.bytes} bytes, ${verified.module.sha256})\n`
);
