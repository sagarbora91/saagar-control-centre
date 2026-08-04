import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const policy = require('../www/dsr-completion-policy.js');
const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(repoDir, 'www', 'index.html');
const patcherPath = path.join(repoDir, 'scripts', 'apply-d4-dsr.mjs');

/* Slices one D4-owned function out of the payload. The payload is CRLF, so the
   next-function boundary is \r\nfunction. */
function ownedFunction(html, name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist in the payload`);
  const end = html.indexOf('\r\nfunction ', start + 1);
  assert.notEqual(end, -1, `${name} must have a following boundary`);
  return html.slice(start, end);
}

function readShell() {
  return fs.readFileSync(indexPath, 'utf8');
}

function dsrPayload(shell) {
  const match = shell.match(/\bconst\s+MODULES\s*=\s*(\[[\s\S]*?\])\s*;\s*(?:\r?\n)/);
  assert.ok(match, 'MODULES bundle present');
  const module = JSON.parse(match[1]).find(item => item.id === 'dsr');
  assert.ok(module, 'DSR module present');
  return { module, html: Buffer.from(module.html_b64, 'base64').toString('utf8') };
}

test('D4 payload metadata matches its own bytes', () => {
  const { module } = dsrPayload(readShell());
  const bytes = Buffer.from(module.html_b64, 'base64');
  assert.equal(bytes.length, module.bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), module.sha256);
});

test('the hardcoded completion floor is gone from updateProgress', () => {
  const { html } = dsrPayload(readShell());
  // The pre-D4 meter opened with `const checks = [` then a bare `true,` — five of
  // nine sections were literal true, giving an empty record 5/9 = 56%.
  assert.doesNotMatch(html, /const checks = \[\r?\n\s+true,/);
  assert.ok(html.includes('dsrD4Summary(rec)'));
});

test('the meter and the submit gate read from one policy', () => {
  const { html } = dsrPayload(readShell());
  assert.ok(html.includes('api.completionSummary(rec, dsrD4Context())'));
  assert.ok(html.includes('api.missingForSubmit(rec, dsrD4Context())'));
});

test('submit refusal renders the missing items instead of a generic toast', () => {
  const { html } = dsrPayload(readShell());
  const start = html.indexOf('function submitDay(');
  const end = html.indexOf('\r\nfunction ', start + 1);
  const body = html.slice(start, end > start ? end : undefined);
  assert.ok(body.includes('class="dsr-d4-missing"'));
  assert.ok(body.includes('miss.map('));
  assert.doesNotMatch(body, /toast\('Complete all sections first'/);
});

test('progress-bar nodes are null-guarded like their staff-meter sibling', () => {
  const { html } = dsrPayload(readShell());
  assert.ok(html.includes("const fill = el('pbar-fill');"));
  assert.ok(html.includes("const lbl = el('pbar-lbl');"));
  // The unguarded pre-D4 dereferences must not survive.
  assert.doesNotMatch(html, /el\('pbar-fill'\)\.style/);
  assert.doesNotMatch(html, /el\('pbar-lbl'\)\.textContent/);
});

test('not-applicable sections get a distinct tab dot, not a completed one', () => {
  const { html } = dsrPayload(readShell());
  assert.ok(html.includes("btn.classList.toggle('optional', status[id] === 'not_applicable')"));
  assert.ok(html.includes("btn.classList.toggle('done', status[id] === 'complete')"));
  assert.ok(html.includes('.tab-btn.optional .tab-dot'));
});

test('carried opening values are marked, and only in the opening grid', () => {
  const { html } = dsrPayload(readShell());
  assert.ok(html.includes('const d4Carried = dsrD4CarriedOpening(rec);'));
  assert.equal(html.split('dsr-d4-carried" title=').length - 1, 1);
  // The closing grid renders identical label markup and must not be touched.
  const closingStart = html.indexOf('function renderClosing(');
  const closingEnd = html.indexOf('\r\nfunction ', closingStart + 1);
  const closing = html.slice(closingStart, closingEnd > closingStart ? closingEnd : undefined);
  assert.ok(!closing.includes('d4Carried'));
});

test('each owned helper is defined exactly once', () => {
  const { html } = dsrPayload(readShell());
  for (const name of ['dsrD4PolicyApi', 'dsrD4Context', 'dsrD4PrevClosingRecord',
    'dsrD4CarriedOpening', 'dsrD4NoSalesAck', 'dsrD4ToggleNoSales', 'dsrD4Summary']) {
    assert.equal(html.split(`function ${name}(`).length - 1, 1, `${name} defined once`);
  }
});

/* Owner ruling 2026-08-04: a zero-sale day must be affirmed, not assumed. */

test('the sales empty state asks for confirmation instead of inviting a blank', () => {
  const { html } = dsrPayload(readShell());
  assert.ok(html.includes('A day with no sales must be confirmed before you can submit.'));
  assert.ok(html.includes('onclick="dsrD4ToggleNoSales()"'));
  // The old guidance actively told staff a blank was fine.
  assert.ok(!html.includes("Zero sales today? That's fine"));
});

test('the acknowledgement toggle refuses when locked or when sales exist', () => {
  const { html } = dsrPayload(readShell());
  const body = ownedFunction(html, 'dsrD4ToggleNoSales');
  assert.ok(body.includes('if (rec.submitted || isPastView()) return;'));
  assert.ok(/rec\.sales\.length[\s\S]*?return;/.test(body), 'guards against existing sales');
  assert.ok(body.includes('saveRec(rec);'), 'an affirmation persists immediately');
  assert.ok(body.includes('updateProgress();'));
});

test('the module acknowledgement check matches the policy, including the array trap', () => {
  const { html } = dsrPayload(readShell());
  const context = { Array, Object, String };
  vm.createContext(context);
  vm.runInContext(`${ownedFunction(html, 'dsrD4NoSalesAck')}\nthis.ack = dsrD4NoSalesAck;`, context);

  for (const shape of [null, undefined, true, 'yes', {}, { by: 'A' }, { at: '' }, [],
    { at: '18:40:00' }, { at: '18:40:00', by: 'Asha' }]) {
    const rec = { sales: [], d4NoSales: shape };
    assert.equal(!!context.ack(rec), policy.noSalesAcknowledged(rec),
      `module and policy disagree on ${JSON.stringify(shape)}`);
  }
  // [] must not pass: typeof [] === 'object' and [].at is Array.prototype.at.
  assert.equal(context.ack({ d4NoSales: [] }), null);
});

test('the policy-absent fallback also requires the acknowledgement', () => {
  const { html } = dsrPayload(readShell());
  const summary = ownedFunction(html, 'dsrD4Summary');
  assert.ok(summary.includes("sales: 'incomplete'"), 'fallback starts sales incomplete');
  assert.ok(summary.includes('dsrD4NoSalesAck(rec)'));
  assert.ok(summary.includes("'opening', 'sales', 'tasks', 'cleaning', 'closing'"));
});

test('the submit gate fallback names the sales requirement', () => {
  const { html } = dsrPayload(readShell());
  const body = ownedFunction(html, 'getMissingForSubmit');
  assert.ok(/Sales — add the day’s bills, or confirm there were no sales today/.test(body));
});

test('the policy script is loaded once, before the MODULES bundle', () => {
  const shell = readShell();
  const tag = '<script src="dsr-completion-policy.js"></script>';
  assert.equal(shell.split(tag).length - 1, 1);
  assert.ok(shell.indexOf(tag) < shell.indexOf('const MODULES'));
  assert.ok(fs.existsSync(path.join(repoDir, 'www', 'dsr-completion-policy.js')));
});

/* The payload is CRLF throughout apart from 22 bare LFs that pre-date D4 (they
   sit inside string literals written by earlier waves — verified against
   `git show main:www/index.html`). Pinning the count means any future patch that
   injects LF-terminated code into this CRLF bundle trips this test. */
const PRE_EXISTING_BARE_LF = 22;

test('D4 injected no mixed line endings into the CRLF payload', () => {
  const { html } = dsrPayload(readShell());
  const crlf = (html.match(/\r\n/g) || []).length;
  const bareLf = (html.match(/(?<!\r)\n/g) || []).length;
  assert.ok(crlf > 3000, `expected CRLF payload, saw ${crlf}`);
  assert.equal(bareLf, PRE_EXISTING_BARE_LF,
    `bare LF count moved from ${PRE_EXISTING_BARE_LF} to ${bareLf}`);

  // The D4-owned regions specifically must be CRLF.
  for (const marker of ['function dsrD4Summary(', 'function updateProgress(', '.tab-btn.optional']) {
    const at = html.indexOf(marker);
    assert.ok(at > -1, `${marker} present`);
    const region = html.slice(at, at + 400);
    assert.equal((region.match(/(?<!\r)\n/g) || []).length, 0, `${marker} region is CRLF`);
  }
});

test('D4 patcher is idempotent over a working copy', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd4-idem-'));
  try {
    const wwwDir = path.join(workDir, 'www');
    const scriptsDir = path.join(workDir, 'scripts');
    fs.mkdirSync(wwwDir, { recursive: true });
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.copyFileSync(indexPath, path.join(wwwDir, 'index.html'));
    fs.copyFileSync(patcherPath, path.join(scriptsDir, 'apply-d4-dsr.mjs'));

    const run = () => {
      execFileSync(process.execPath, [path.join(scriptsDir, 'apply-d4-dsr.mjs')],
        { cwd: workDir, stdio: 'pipe' });
      return fs.readFileSync(path.join(wwwDir, 'index.html'));
    };

    const first = run();
    const second = run();
    assert.ok(first.equals(second), 'second run changed the bundle');

    const third = run();
    assert.ok(second.equals(third), 'third run changed the bundle');
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('the patcher refuses a bundle whose owned helper was removed', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd4-guard-'));
  try {
    const wwwDir = path.join(workDir, 'www');
    const scriptsDir = path.join(workDir, 'scripts');
    fs.mkdirSync(wwwDir, { recursive: true });
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.copyFileSync(patcherPath, path.join(scriptsDir, 'apply-d4-dsr.mjs'));

    // Duplicate an owned helper inside the payload; the exactly-once guard must fire.
    const shell = readShell();
    const match = shell.match(/\bconst\s+MODULES\s*=\s*(\[[\s\S]*?\])\s*;\s*(\r?\n)/);
    const modules = JSON.parse(match[1]);
    const dsr = modules.find(item => item.id === 'dsr');
    const html = Buffer.from(dsr.html_b64, 'base64').toString('utf8');
    const tampered = html + '\r\nfunction dsrD4Context() { return null; }\r\n';
    const bytes = Buffer.from(tampered, 'utf8');
    dsr.html_b64 = bytes.toString('base64');
    dsr.bytes = bytes.length;
    dsr.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const rebuilt = shell.slice(0, match.index) +
      `const MODULES = ${JSON.stringify(modules)};${match[2]}` +
      shell.slice(match.index + match[0].length);
    fs.writeFileSync(path.join(wwwDir, 'index.html'), rebuilt, 'utf8');

    assert.throws(() => {
      execFileSync(process.execPath, [path.join(scriptsDir, 'apply-d4-dsr.mjs')],
        { cwd: workDir, stdio: 'pipe' });
    }, /not present exactly once|is not unique/);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});
