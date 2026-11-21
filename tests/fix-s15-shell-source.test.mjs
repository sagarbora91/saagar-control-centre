// tests/fix-s15-shell-source.test.mjs
// S15: the three small shell edits in www/index.html (seal call, WhatsApp result, roles wording) and the
// shell globals the shared runtime reads. Loads the real index.html text.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.S15_REPO_ROOT || fileURLToPath(new URL('..', import.meta.url));
const shell = fs.readFileSync(`${ROOT}/www/index.html`, 'utf8');

function fn(name) {                                    // brace-matched function text (strings/comments skipped)
  const m = new RegExp(String.raw`(?:async\s+)?function\s+${name}\s*\(`).exec(shell);
  assert.ok(m, `function ${name} not found`);
  const open = shell.indexOf('{', m.index + m[0].length);
  let depth = 0, st = 'code', esc = false, prev = '';
  for (let i = open; i < shell.length; i++) {
    const c = shell[i], n = shell[i + 1];
    if (st === 'line') { if (c === '\n') st = 'code'; continue; }
    if (st === 'block') { if (c === '*' && n === '/') { st = 'code'; i++; } continue; }
    if (st === 's' || st === 'd' || st === 't') {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if ((st === 's' && c === "'") || (st === 'd' && c === '"') || (st === 't' && c === '`')) st = 'code';
      continue;
    }
    if (st === 're') { if (esc) { esc = false; continue; } if (c === '\\') { esc = true; continue; } if (c === '/') st = 'code'; continue; }
    if (c === '/' && n === '/') { st = 'line'; i++; continue; }
    if (c === '/' && n === '*') { st = 'block'; i++; continue; }
    if (c === "'") { st = 's'; continue; }
    if (c === '"') { st = 'd'; continue; }
    if (c === '`') { st = 't'; continue; }
    if (c === '/' && /[=(:,!&|?;{}[\]]/.test(prev || '=')) { st = 're'; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) return shell.slice(m.index, i + 1); }
    if (!/\s/.test(c)) prev = c;
  }
  assert.fail('unterminated ' + name);
}

test('S15 shell: the runtime seals the role and PIN gates right after the Owner session object is built', () => {
  const at = shell.indexOf('window.SaagarOwnerSession=Object.freeze({');
  assert.ok(at > 0, 'pinned text kept: window.SaagarOwnerSession=Object.freeze({');
  const tail = shell.slice(at, at + 700);
  assert.match(tail, /read:moduleAccessSnapshot\s*\}\);\s*try\{ SaagarModuleRuntime\.seal\(\); \}catch\(e\)\{\}\s*function notifyModuleAccessChanged\(\)/);
  assert.match(shell, /window\.SaagarReauth = SaagarReauth/, 'pinned text kept (d1-reauth test)');
  assert.ok(shell.indexOf('window.SaagarAdminPinCheck = function') > 0 && shell.indexOf('window.SaagarAdminPinCheck = function') < at, 'SaagarAdminPinCheck exists before it is sealed');
  assert.ok(shell.indexOf('window.SaagarReauth = SaagarReauth') < at, 'SaagarReauth exists before it is sealed');
});

test('S15 shell: the shell globals the shared session() reads for attribution still exist at top level', () => {
  assert.match(shell, /\nfunction activeStaff\(\)\{/);
  assert.match(shell, /\nfunction ownerName\(\)\{/);
  assert.match(shell, /\nfunction moduleAccessSnapshot\(\)\{/);
  assert.match(fn('moduleAccessSnapshot'), /isManager:isAdmin===true\|\|role==='Store Manager'/);
});

test('S15 shell: openControlledWhatsApp reports success with true and every refusal with false', async () => {
  const src = fn('openControlledWhatsApp');
  async function run({ legal = { ok: true, category: 'transactional' }, token = 'tok', begin = true, openThrows = false } = {}) {
    const log = { opened: [], toasts: [], outcomes: [] };
    const sb = {
      URL, console, toast: (m) => log.toasts.push(m), auditLog() {}, activeModuleId: 'cro_audit',
      window: {
        SaagarLegal: { authorizeMessage: () => legal },
        SaagarExportControl: { authorize: async () => token, beginDelivery: () => begin, recordOutcome: (t, o) => log.outcomes.push(o) },
        open: (u) => { if (openThrows) throw new Error('blocked'); log.opened.push(u); }
      }
    };
    const ctx = vm.createContext(sb);
    const f = vm.runInContext('(' + src + ')', ctx);
    return { result: await f('https://wa.me/919999999999?text=hi', 'cro-review-request', 'promotional-review-solicitation'), log };
  }
  let r = await run();
  assert.equal(r.result, true); assert.deepEqual(r.log.outcomes, ['shared']); assert.equal(r.log.opened.length, 1);
  r = await run({ legal: { ok: false, reason: 'no-consent' } });
  assert.equal(r.result, false); assert.equal(r.log.opened.length, 0);
  r = await run({ token: null });
  assert.equal(r.result, false); assert.equal(r.log.opened.length, 0);
  r = await run({ begin: false });
  assert.equal(r.result, false); assert.equal(r.log.opened.length, 0);
  r = await run({ openThrows: true });
  assert.equal(r.result, false); assert.deepEqual(r.log.outcomes, ['failed']);
});
