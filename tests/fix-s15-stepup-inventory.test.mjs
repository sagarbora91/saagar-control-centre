// tests/fix-s15-stepup-inventory.test.mjs
// S15 role model, rule (c): every privileged module action is re-checked through the Owner PIN keypad.
// This is a SOURCE test over the real module files. It is the one place that lists which actions must be gated,
// so a future edit that removes a gate (or a new delete-everything action added without one) turns red.
// It is expected to FAIL until the module groups S05, S06, S07, S08, S10 have merged their fixes (integration step).
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.S15_REPO_ROOT || fileURLToPath(new URL('..', import.meta.url));
const read = (id) => fs.readFileSync(`${ROOT}/www/modules/${id}/index.html`, 'utf8');

// ---- function-body extractor: brace matching that skips strings, template text, comments and regex literals ----
function bodyOf(src, name) {
  const m = new RegExp(String.raw`(?:async\s+)?function\s+${name}\s*\(`).exec(src);
  if (!m) return null;
  const open = src.indexOf('{', m.index + m[0].length);
  let depth = 0, state = 'code', esc = false, cls = false, prev = '';
  for (let i = open; i < src.length; i++) {
    const ch = src[i], nx = src[i + 1];
    if (state === 'line') { if (ch === '\n') state = 'code'; continue; }
    if (state === 'block') { if (ch === '*' && nx === '/') { state = 'code'; i++; } continue; }
    if (state === 's' || state === 'd' || state === 't') {
      if (esc) { esc = false; continue; } if (ch === '\\') { esc = true; continue; }
      if ((state === 's' && ch === "'") || (state === 'd' && ch === '"') || (state === 't' && ch === '`')) state = 'code';
      continue;
    }
    if (state === 're') { if (esc) { esc = false; continue; } if (ch === '\\') { esc = true; continue; } if (ch === '[') cls = true; if (ch === ']') cls = false; if (ch === '/' && !cls) state = 'code'; continue; }
    if (ch === '/' && nx === '/') { state = 'line'; i++; continue; }
    if (ch === '/' && nx === '*') { state = 'block'; i++; continue; }
    if (ch === "'") { state = 's'; continue; } if (ch === '"') { state = 'd'; continue; } if (ch === '`') { state = 't'; continue; }
    if (ch === '/' && /[=(:,!&|?;{}[\]]/.test(prev || '=')) { state = 're'; cls = false; continue; }
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth === 0) return src.slice(m.index, i + 1); }
    if (!/\s/.test(ch)) prev = ch;
  }
  return null;
}

// ---- what must be gated. 'any of fns': the gate may sit in the named function or in a helper it hands off to ----
// REQUIRED = already in place today OR specified by the module groups' fix specs (merged before this test runs).
const REQUIRED = [
  // already gated today (these keep the test honest about not removing them)
  { m: 'stock',   fns: ['toggleLock'],                               h: 'stReauth', why: 'lock opening count' },
  { m: 'stock',   fns: ['doLockClosing'],                            h: 'stReauth', why: 'lock and sign off closing count' },
  { m: 'stock',   fns: ['doReopenConfirm'],                          h: 'stReauth', why: 're-open a locked section' },
  { m: 'dsr',     fns: ['submitAudit'],                              h: 'stReauth', why: 'sign off the DSR audit' },
  { m: 'dsr',     fns: ['unlockForCorrection'],                      h: 'stReauth', why: 'unlock a submitted DSR' },
  { m: 'payroll', fns: ['lockRun'],                                  h: 'stReauth', why: 'lock the pay-run' },
  { m: 'payroll', fns: ['unlockRun'],                                h: 'stReauth', why: 'unlock the pay-run' },
  { m: 'payroll', fns: ['closeMonth'],                               h: 'stReauth', why: 'close the month' },
  { m: 'payroll', fns: ['delAdvance'],                               h: 'stReauth', why: 'delete an advance voucher' },
  { m: 'payroll', fns: ['fnfGenerate'],                              h: 'stReauth', why: 'full and final settlement' },
  { m: 'expense', fns: ['voidEntry'],                                h: 'stReauth', why: 'void in a tax-locked month' },
  // added by the fix wave
  { m: 'stock',   fns: ['importJSON'],                               h: 'stReauth', why: 'import over a locked day (S06 U05-F-01)' },
  { m: 'stock',   fns: ['delConfirmSubmit'],                         h: 'stReauth', why: 'Clear Everything (S06 U05-F-02)' },
  { m: 'stock',   fns: ['clearDay'],                                 h: 'stReauth', why: 'clear a locked day (S06)' },
  { m: 'dsr',     fns: ['doDeleteAll'],                              h: 'stReauth', why: 'Delete All records (S05 U04-F8)' },
  { m: 'payroll', fns: ['resetAll'],                                 h: 'stReauth', why: 'Reset All (S10 U10-F01)' },
  { m: 'expense', fns: ['reopenDay'],                                h: 'stReauth', why: 'reopen a closed day (S07 U06-F01)' },
  { m: 'expense', fns: ['reopenStoreDay'],                           h: 'stReauth', why: 'reopen a store drawer (S07 U06-F01)' },
  { m: 'expense', fns: ['genTaxFeed'],                               h: 'stReauth', why: 'lock a month and generate its tax feed (S07 U06-F01)' },
  { m: 'service', fns: ['delCase', 'svcDeleteClosedWithApproval'],   h: 'svcD3Reauth', why: 'delete a delivered or invoiced case (S08 U07-F05)' },
];
// PROPOSED = owner decision O2 in the S15 spec. Flip to true only when the owner has said yes.
const OWNER_O2_APPROVED = false;
const PROPOSED = [
  { m: 'leave', fns: ['executeClearData'], h: 'stReauth', why: 'Clear All leave data' },
  { m: 'leave', fns: ['importJSON'],       h: 'stReauth', why: 'Leave import replaces data' },
  { m: 'qms',   fns: ['resetDemo'],        h: 'stReauth', why: 'Queue Reset All' },
  { m: 'qms',   fns: ['restoreData'],      h: 'stReauth', why: 'Queue Restore replaces all data' },
];

const gateRe = (h) => new RegExp(String.raw`await\s+${h}\s*\(`);

for (const item of [...REQUIRED, ...(OWNER_O2_APPROVED ? PROPOSED : [])]) {
  test(`S15 step-up: ${item.m} ${item.fns.join(' / ')} asks for the Owner PIN (${item.why})`, () => {
    const src = read(item.m);
    const bodies = item.fns.map((f) => bodyOf(src, f)).filter(Boolean);
    assert.ok(bodies.length > 0, `function not found: ${item.fns.join(', ')}`);
    assert.ok(bodies.some((b) => gateRe(item.h).test(b)), `no "await ${item.h}(" inside ${item.fns.join(' / ')}`);
  });
}

test('S15 step-up: every call of the PIN helper is awaited (a bare call returns a truthy Promise and never blocks)', () => {
  for (const id of ['stock', 'dsr', 'expense', 'payroll', 'service', 'leave', 'qms', 'tax', 'grooming', 'planning', 'cro_audit']) {
    const src = read(id);
    for (const h of ['stReauth', 'svcD3Reauth']) {
      for (const m of src.matchAll(new RegExp(String.raw`(?<![\w$.])${h}\s*\(`, 'g'))) {
        const before = src.slice(Math.max(0, m.index - 40), m.index);
        const isDefinition = /function\s+$/.test(before) || /(async\s+)?function\s+$/.test(before);
        if (isDefinition) continue;
        assert.match(before, /await\s*\(?\s*!?\s*$|await\s+$/, `${id}: un-awaited ${h}( near: ${before.replace(/\s+/g, ' ')}${h}(`);
      }
    }
  }
});

test('S15 step-up: no module reads its own role from storage to decide a privilege', () => {
  // The module-local role keys must be gone from every decision. Expense keeps gm_role as stored data but clamps on read.
  const expense = read('expense');
  assert.match(expense, /function allowedRoles\(\)/, 'expense: role ceiling (S07)');
  const qms = read('qms');
  assert.doesNotMatch(qms, /role=state\.role\|\|'SM'/, 'qms: role must not be restored from saved data (S04)');
});
