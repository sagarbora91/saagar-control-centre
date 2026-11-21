// Service wave 2, governance T15: the owner allowed exactly 15 changes to existing Phase 1 test checks (plan section 5, rows A-1 to A-14, and A-15 =
// svc1-ui-source U10; owner decisions of 2026-11-19). This file stops anybody from changing a Phase 1 test more widely than that.
// Reference = the committed tests of the wave start commit 031841f (read with git, read-only). It skips with a message when git or that commit is missing.
// For each of the ten amended test files: every line that disappears must be one of the lines the row names, and the number of lines removed and added
// stays inside a small limit. Every other committed test, test helper and approval record must be byte-identical to the commit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// GIT = the repo that holds the wave-start commit (read only). NOW = the tree whose tests are judged: the repo, or a scratch copy named by
// SVC2_GOV_ROOT (used only to prove this file fails on a too-wide amendment).
const GIT = path.resolve(here, '..');
const REPO = path.resolve(process.env.SVC2_GOV_ROOT || GIT);
const BASE = '031841f';

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: GIT, encoding: opts.buf ? 'buffer' : 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}
let SKIP = false;
try { git(['cat-file', '-e', BASE + '^{commit}']); } catch (e) { SKIP = 'git or the wave start commit ' + BASE + ' is not available here'; }

// every name of a list, in any order, on one line
const allOf = (names) => new RegExp(names.map((n) => '(?=.*' + n.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + ')').join(''));
const TEN = ['serviceAdvancesHeld', 'serviceBillSummary', 'serviceCreditNote', 'serviceDaySummary', 'serviceReceipt', 'serviceRefundVoucher', 'serviceRevenue',
  'serviceTaxInvoiceV2', 'serviceUnbilledIssues', 'serviceWarrantySheet'].map((n) => "'" + n + "'");
const BILLING7 = ['calc', 'docs', 'money', 'migrate', 'core', 'ui', 'area-ui'].map((n) => "'www/service-billing-" + n + ".js'");
const OLD_NOTICE = 'Money for counter sales is not posted to the Expense ledger in this version. Record the cash in the usual way.';
const NEW_NOTICE = 'Counter sale money is taken as a receipt in Billing and goes to the cash book.';
const lit = (t) => t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// the nine files and what each may lose (old lines, by pattern) and gain (a count, and the text: every added line that is not blank or a
// comment must match one of `added`). One entry per plan row.
const ROWS = [
  { rows: 'A-1, A-2', file: 'tests/svc1-store-primitives.test.mjs', removed: [/Object\.keys\(Store\.SERIES\)\.sort\(\), \[/, /Object\.keys\(Store\.STREAMS\)\.sort\(\), \[/], maxRemoved: 2, maxAdded: 2, added: [/^\s*assert\.deepEqual\(Object\.keys\(Store\.SERIES\)\.sort\(\), \['ADJ', 'CSL', 'GRN', 'ISS', 'OLD', 'OPN', 'RET', 'SAR', 'SCN', 'SCR', 'SRC', 'SRF', 'SV'\]\);\s*$/,
    /^\s*assert\.deepEqual\(Object\.keys\(Store\.STREAMS\)\.sort\(\), \['audit', 'config', 'defective', 'docs', 'invoices', 'labour', 'ledger', 'parts', 'receipts'\]\);\s*$/] },
  { rows: 'A-3', file: 'tests/svc1-gov-capability-register.test.mjs', removed: [/const streamsInStore = Object\.keys\(store\.STREAMS\)\.sort\(\);/], maxRemoved: 1, maxAdded: 3, addedMustNotMatch: [/streamsInReg\s*=/], added: [/^\s*const W2_STREAMS = \[\s*'invoices',\s*'receipts'\s*\];\s*$/, /^\s*const streamsInStore = Object\.keys\(store\.STREAMS\)\.filter\(\(\w+\) => !W2_STREAMS\.includes\(\w+\)\)\.sort\(\);\s*$/] },
  { rows: 'A-4', file: 'tests/svc1-gov-guards.test.mjs', removed: [/INTEGRATOR_MAY_EDIT/], maxRemoved: 1, maxAdded: 3, addedMustNotMatch: [/modules\/expense\/index\.html/], added: [/^const WAVE2_EDITED = Object\.freeze\(\['www\/integration-bridge\.js'\]\);\s*$/, /^\s*if \(INTEGRATOR_MAY_EDIT\.includes\(rel\) \|\| WAVE2_EDITED\.includes\(rel\)\) continue;\s*$/] },
  { rows: 'A-5, A-15', file: 'tests/svc1-ui-source.test.mjs', removed: [/const BLOCK = CSS\.slice\(CSS\.indexOf\(MARK\)\);/, /frag\.rows\.map\(/, /ui\.phrases\(\)/], maxRemoved: 3, maxAdded: 8, added: [/^const BLOCK = CSS\.slice\(CSS\.indexOf\(MARK\), CSS\.indexOf\('\/\* SERVICE-BILLING-2026-11 \*\/'\) === -1 \? undefined : CSS\.indexOf\('\/\* SERVICE-BILLING-2026-11 \*\/'\)\);\s*$/,
    new RegExp("^\\s*const \\w+ = '" + lit(OLD_NOTICE) + "';\\s*$"), new RegExp("^\\s*const \\w+ = '" + lit(NEW_NOTICE) + "';\\s*$"),
    /^\s*assert\.deepEqual\(frag\.rows\.map\(\(r\) => \(r\[0\] === \w+ \? \w+ : r\[0\]\)\)\.sort\(\), JSON\.parse\(JSON\.stringify\(ui\.phrases\(\)\)\)\);\s*$/] },
  { rows: 'A-6', file: 'tests/svc1-gov-page-wiring.test.mjs', removed: [/const allowed = \[/, /removed\.length <= 2/], maxRemoved: 2, maxAdded: 3, added: [/^\s*const allowed = \[\/btn-back-dash'\\\)\\\.style\\\.display\/, \/if \\\(!cur \\\|\\\| svcInvoiceLocked\\\(cur\\\)\\\) return;\/, \/if \\\(!\\\(parseRupee\\\(del\\\.finalAmt\\\) > 0\\\)\\\) \\\{\/\];\s*$/,
    /^\s*assert\.ok\(removed\.length <= 3, '[^']*'\);\s*$/] },
  { rows: 'A-7, A-8, A-10, A-13', file: 'tests/svc1-gov-integration-state.test.mjs', removed: [/assert\.deepEqual\(created, SEVEN/, /\.length, 80, /, /const QUOTE_OK = /, /const allowed = \[\/\^www/], maxRemoved: 4, maxAdded: 10, added: [new RegExp('^\\s*assert\\.deepEqual\\(created, SEVEN\\.map\\(\\(f\\) => f\\.file\\)\\.concat\\(\\[' + BILLING7.map(lit).map((x) => '(?=.*' + x + ')').join('')),
    /^\s*assert\.equal\(\(text\.match\(\/\\n\/g\) \|\| \[\]\)\.length, 81, '[^']*'\);\s*$/,
    /^const QUOTE_OK = new Set\(\['owner decision given in chat, 2026-11-12', 'owner decision given in chat, 2026-11-13', 'owner decision given in chat, 2026-11-18'\]\);\s*$/,
    allOf(['/^www\\/service-billing-[a-z-]+\\.js$/', '/^tests\\/svc2-[a-z0-9-]+\\.test\\.mjs$/', '/^tests\\/lib\\/svc2-[a-z0-9-]+\\.mjs$/', '/^tests\\/fixtures\\/service-wave-2\\//', '/^verification\\/audit\\/approvals\\/SERVICE-WAVE-2-/'])] },
  { rows: 'A-9', file: 'tests/svc1-gov-new-files-rules.test.mjs', removed: [/assert\.deepEqual\(holders\.sort\(\)/], maxRemoved: 1, maxAdded: 2, added: [/^\s*assert\.deepEqual\(holders\.sort\(\), \['www\/index\.html', 'www\/integration-bridge\.js', 'www\/service-stores-store\.js'\]\);\s*$/] },
  { rows: 'A-11', file: 'tests/svc1-ui-screens.test.mjs', removed: [/Money for counter sales is not posted to the Expense ledger in this version/], maxRemoved: 1, maxAdded: 2, added: [/^\s*has\(a\.rootHtml\(\), \/Counter sale money is taken as a receipt in Billing and goes to the cash book(\\\.)?\/\);\s*$/] },
  { rows: 'A-12', file: 'tests/svc1-gov-phrases.test.mjs', removed: [/const known = new Set\(rowsOf\(path\.join\(l10n, 'PHRASES\.json'\)\)/, /for \(const f of fragmentFiles\(\)\) for \(const r of rowsOf\(f\)\) known\.add\(r\[0\]\);/, /const stale = rows\.filter\(/, /const unescaped = /], maxRemoved: 4, maxAdded: 10, added: [new RegExp("^\\s*const RETIRED = \\['" + lit(OLD_NOTICE) + "'\\];\\s*$"), /^\s*if \(RETIRED\.includes\(phrase\)\) return false;\s*$/,
    /^\s*\{?.*service-wave-2.*PHRASES.*known\.add\(r\[0\]\).*$/] },
  { rows: 'A-14', file: 'tests/fix-s02-reports-role.test.mjs', removed: [/assert\.equal\(listed\.length, 25 \+ svc\.length\);/], maxRemoved: 1, maxAdded: 3, added: [allOf(['const svc2 = ['].concat(TEN)), /^\s*assert\.equal\(listed\.length, 25 \+ svc\.length \+ svc2\.length\);\s*$/] }
];

function lines(text) { return text.split('\n'); }
function multiset(arr) { const m = new Map(); for (const l of arr) m.set(l, (m.get(l) || 0) + 1); return m; }
function diffLines(oldText, newText) {
  const a = multiset(lines(oldText));
  const b = multiset(lines(newText));
  const removed = [];
  const added = [];
  for (const [l, n] of a) { const d = n - (b.get(l) || 0); for (let i = 0; i < d; i += 1) removed.push(l); }
  for (const [l, n] of b) { const d = n - (a.get(l) || 0); for (let i = 0; i < d; i += 1) added.push(l); }
  return { removed, added };
}
const baseText = (rel) => git(['show', BASE + ':' + rel]);
const nowText = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

test('T15.1 the table names the ten files of the 15 approved rows, each exists at the wave start and now', { skip: SKIP }, () => {
  assert.equal(ROWS.length, 10);
  const rows = ROWS.flatMap((r) => r.rows.split(', '));
  assert.deepEqual(rows.sort(), ['A-1', 'A-10', 'A-11', 'A-12', 'A-13', 'A-14', 'A-15', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6', 'A-7', 'A-8', 'A-9']);
  for (const r of ROWS) {
    assert.ok(baseText(r.file).length > 100, r.file + ' at the wave start');
    assert.ok(fs.existsSync(path.join(REPO, r.file)), r.file + ' now');
  }
});

for (const r of ROWS) {
  test('T15.2 ' + r.rows + ': ' + r.file + ' differs from the wave-start text only in the lines the row names', { skip: SKIP }, () => {
    const d = diffLines(baseText(r.file), nowText(r.file));
    const stray = d.removed.filter((l) => !r.removed.some((re) => re.test(l)));
    assert.deepEqual(stray, [], 'a line was removed or changed that the approved row does not name');
    const strayAdded = d.added.filter((l) => l.trim() !== '' && !/^\s*\/\//.test(l) && !r.added.some((re) => re.test(l)));
    assert.deepEqual(strayAdded, [], 'an added line is not the text the approved row names (plan section 5)');
    assert.ok(d.removed.length <= r.maxRemoved, d.removed.length + ' lines removed, at most ' + r.maxRemoved + ' are approved');
    assert.ok(d.added.length <= r.maxAdded, d.added.length + ' lines added, at most ' + r.maxAdded + ' are approved');
    for (const re of r.addedMustNotMatch || []) assert.deepEqual(d.added.filter((l) => re.test(l)), [], 'an added line does what the owner did not approve');
    // an approved edit never loosens an assertion into nothing: the number of assert calls cannot fall by more than the lines removed
    const count = (t) => (t.match(/assert\.|has\(|expect\(/g) || []).length;
    assert.ok(count(nowText(r.file)) >= count(baseText(r.file)) - r.maxRemoved, 'the number of assertions fell');
  });
}

// Committed test files the integrator must change by plan section 6, and nothing else:
// - S-6 regenerates the fix-wave undo registry with its tool (its freeze and its owner-approved anchor entry must not move: T15.3b);
// - the commit-time ledger overlay (section 6, after commit 1) replaces the two count tests with the copies measured in the workspace.
const WORKSPACE = process.env.SVC_W2_WORKSPACE || 'E:\\Projects\\Saagar Control Centre Workspace\\service-wave-2';
const INTEGRATOR_FILES = Object.freeze({
  'tests/fixtures/fix-wave/undo-registry.json': 'S-6 registry regeneration (tool)',
  'tests/modular-capability-delta.test.mjs': 'commit-time ledger overlay',
  'tests/phase1-shared-spine.test.mjs': 'commit-time ledger overlay'
});
const OVERLAY_TESTS = ['tests/modular-capability-delta.test.mjs', 'tests/phase1-shared-spine.test.mjs'];
const overlayCopy = (rel) => path.join(WORKSPACE, 'integration', 'ledger-overlay', ...rel.split('/'));

test('T15.3 every other committed test and test helper is byte-identical to the wave start (nothing outside the ten files was weakened)', { skip: SKIP }, () => {
  const amended = new Set(ROWS.map((r) => r.file));
  const listed = git(['ls-tree', '-r', BASE, 'tests', 'verification/audit/approvals']).split('\n').filter(Boolean).map((l) => {
    const m = /^(\d+) blob ([0-9a-f]{40})\t(.+)$/.exec(l);
    return m ? { sha: m[2], file: m[3] } : null;
  }).filter(Boolean);
  assert.ok(listed.length > 380, 'the wave start holds the committed tests');
  const bad = [];
  const existing = listed.filter((x) => !amended.has(x.file) && !Object.prototype.hasOwnProperty.call(INTEGRATOR_FILES, x.file) && fs.existsSync(path.join(REPO, x.file)));
  for (let i = 0; i < existing.length; i += 200) {
    const part = existing.slice(i, i + 200);
    const out = execFileSync('git', ['hash-object', '--no-filters', '--'].concat(part.map((x) => path.join(REPO, x.file))), { cwd: GIT, encoding: 'utf8' }).split('\n').filter(Boolean);
    part.forEach((x, k) => { if (out[k] !== x.sha) bad.push(x.file); });
  }
  assert.deepEqual(bad.slice(0, 20), [], bad.length + ' committed files changed that no approved row covers');
  const gone = listed.filter((x) => !fs.existsSync(path.join(REPO, x.file))).map((x) => x.file);
  assert.deepEqual(gone, [], 'a committed test or approval record was deleted');
});

test('T15.3b the files the integrator must change move only as the plan says: the registry keeps its freeze and anchor entry; an overlay test equals its measured copy', { skip: SKIP }, () => {
  const base = JSON.parse(git(['show', BASE + ':tests/fixtures/fix-wave/undo-registry.json']));
  const now = JSON.parse(fs.readFileSync(path.join(REPO, 'tests/fixtures/fix-wave/undo-registry.json'), 'utf8'));
  assert.deepEqual(now.preWaveFreeze, base.preWaveFreeze, 'the registry freeze never moves');
  assert.deepEqual(now.ownerApprovedAuditAnchorChanges, base.ownerApprovedAuditAnchorChanges, 'the owner-approved anchor entry is kept');
  for (const rel of OVERLAY_TESTS) {
    const nowBuf = fs.readFileSync(path.join(REPO, rel));
    const baseBuf = Buffer.from(git(['show', BASE + ':' + rel], { buf: true }));
    if (nowBuf.equals(baseBuf)) continue;
    assert.ok(fs.existsSync(overlayCopy(rel)), rel + ' changed but the measured overlay copy is not there');
    assert.ok(nowBuf.equals(fs.readFileSync(overlayCopy(rel))), rel + ' changed and is not the measured overlay copy');
  }
});

test('T15.4 the Phase 1 fixtures keep their wave-start bytes (the register and the frozen table are never regenerated or rewritten to fit)', { skip: SKIP }, () => {
  const listed = git(['ls-tree', '-r', BASE, 'tests/fixtures/service-wave-1']).split('\n').filter(Boolean).map((l) => /^(\d+) blob ([0-9a-f]{40})\t(.+)$/.exec(l)).filter(Boolean);
  assert.ok(listed.length >= 2);
  for (const m of listed) {
    const out = execFileSync('git', ['hash-object', '--no-filters', '--', path.join(REPO, m[3])], { cwd: GIT, encoding: 'utf8' }).trim();
    assert.equal(out, m[2], m[3]);
  }
});

test('T15.5 only the fifteen approved rows are open: the Expense page and the analyser are not named by any amended test (option (a) of the double-income fix)', { skip: SKIP }, () => {
  for (const r of ROWS) {
    const d = diffLines(baseText(r.file), nowText(r.file));
    for (const l of d.added) assert.equal(/modules\/expense\/index\.html/.test(l), false, r.file + ': ' + l);
  }
});
