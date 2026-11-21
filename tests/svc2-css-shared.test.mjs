// Service wave 2, group css-shared (W-D10): the D10 append to www/shared/module-mobile-common.css.
// Covers P5 U95 to U99 and P7 T12. Expected values are typed by hand from the plan and specs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const CSS_PATH = new URL('../www/shared/module-mobile-common.css', import.meta.url);
const SERVICE_CSS_PATH = new URL('../www/modules/service/service-ui.css', import.meta.url);
const APPLY = 'E:/Projects/Saagar Control Centre Workspace/service-wave-2/work/W-D10/apply.cjs';

const G0_SIZE = 26137;
const G0_SHA = 'b8ae67010cb906861df2e858079106a1d76a122ccc6f2748b9090a843d7f67f2';
const CR_AT = [1079, 1081, 1158];
const SCOPE = 'html.bcc-mobile[data-mod="service"] ';
const PHASE6I_MARKER = '/* Phase 6I: consolidated responsive migration authority (from Phase 6C) */';
const D10_MARKER = 'Service wave 2 / D10:';
const MODULES = ['cro_audit', 'dsr', 'etp', 'expense', 'grooming', 'leave', 'payroll', 'planning', 'qms', 'service', 'stock', 'tax'];

// The eleven rules, typed by hand from specs/P5-ui.md section 12.2.
const EXPECTED_TAIL = [
  '',
  '/* Service wave 2 / D10: in wizard mode the 12-step sidebar is the sticky chip rail at EVERY width (it sat over the form from 721 px up). Same declarations as the module\'s own max-width 720px block. */',
  'html.bcc-mobile[data-mod="service"] .form-sidebar{width:100%;height:auto;position:sticky;top:60px;z-index:150;padding:0;flex-direction:column;box-shadow:0 4px 12px rgba(13,35,64,.18)}',
  'html.bcc-mobile[data-mod="service"] .sidebar-order-info{padding:10px 14px;margin-bottom:0;border-bottom:1px solid rgba(255,255,255,.08)}',
  'html.bcc-mobile[data-mod="service"] .sidebar-prog-wrap{margin-top:8px}',
  'html.bcc-mobile[data-mod="service"] .sidebar-nav{flex:none;display:flex;flex-direction:row;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:10px 14px;scrollbar-width:none}',
  'html.bcc-mobile[data-mod="service"] .sidebar-nav::-webkit-scrollbar{display:none}',
  'html.bcc-mobile[data-mod="service"] .nav-item{flex:0 0 auto;gap:7px;padding:8px 12px;min-height:44px;border-radius:999px;background:rgba(255,255,255,.05);white-space:nowrap}',
  'html.bcc-mobile[data-mod="service"] .nav-item.active::before{display:none}',
  'html.bcc-mobile[data-mod="service"] .nav-item.active{background:rgba(184,146,42,.18)}',
  'html.bcc-mobile[data-mod="service"] .nav-item.done{background:rgba(22,101,52,.18)}',
  'html.bcc-mobile[data-mod="service"] .nav-text{font-size:12px}',
  'html.bcc-mobile[data-mod="service"] .sidebar-actions{display:none}',
  ''
].join('\n');

const live = fs.readFileSync(CSS_PATH);
const prefix = live.subarray(0, G0_SIZE);
const tail = live.subarray(G0_SIZE);
const tailText = tail.toString('utf8');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const crOffsets = b => { const r = []; for (let i = 0; i < b.length; i++) if (b[i] === 13) r.push(i); return r; };

// Tiny CSS reader: strips comments, returns top-level blocks as {prelude, body}; asserts balanced braces.
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }
function topLevel(css) {
  const src = stripComments(css);
  const out = [];
  let depth = 0, start = 0, open = -1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') { if (depth === 0) open = i; depth++; }
    else if (ch === '}') {
      depth--;
      assert.ok(depth >= 0, 'stray closing brace at char ' + i);
      if (depth === 0) { out.push({ prelude: src.slice(start, open).trim(), body: src.slice(open + 1, i) }); start = i + 1; }
    }
  }
  assert.equal(depth, 0, 'unbalanced braces');
  assert.equal(src.slice(start).trim(), '', 'text after the last rule');
  return out;
}
function decls(body) {
  const map = new Map();
  for (const part of body.split(';')) {
    const t = part.trim();
    if (!t) continue;
    const i = t.indexOf(':');
    const prop = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim().replace(/\s+/g, '').replace(/0\.(\d)/g, '.$1').replace(/!important/, '');
    map.set(prop, val);
  }
  return map;
}

test('U95 css-bytes: first 26,137 bytes are the pre-wave bytes, three CRs at the same offsets, tail has no CR and ends with LF', () => {
  assert.ok(live.length > G0_SIZE, 'the D10 block has not been appended');
  assert.equal(sha(prefix), G0_SHA);
  assert.deepEqual(crOffsets(live), CR_AT);
  assert.equal(crOffsets(tail).length, 0);
  assert.equal(live[live.length - 1], 10);
  assert.equal(prefix[G0_SIZE - 1], 10);
  assert.equal(tailText, EXPECTED_TAIL, 'appended text differs from the P5 12.2 block');
  assert.equal(live.indexOf(Buffer.from(D10_MARKER)), live.lastIndexOf(Buffer.from(D10_MARKER)), 'D10 marker occurs once');
  assert.equal(live.includes(0xEF) && live.subarray(0, 3).equals(Buffer.from([0xEF, 0xBB, 0xBF])), false, 'no BOM');
});

test('U95b the .gitattributes rule that protects the CR bytes is still there', () => {
  const ga = fs.readFileSync(new URL('../.gitattributes', import.meta.url), 'utf8');
  assert.match(ga, /module-mobile-common\.css[^\n]*-text/);
});

test('U96 css-scope: every appended selector starts with the service scope; no @media, @import, star or bare html.bcc-mobile', () => {
  const rules = topLevel(tailText);
  assert.equal(rules.length, 11, 'eleven rules');
  for (const r of rules) {
    assert.ok(!r.prelude.startsWith('@'), 'no at-rule: ' + r.prelude);
    for (const sel of r.prelude.split(',')) {
      assert.ok((sel.trim() + ' ').startsWith(SCOPE), 'unscoped selector: ' + sel);
      assert.ok(!sel.includes('*'), 'star in selector: ' + sel);
      assert.ok(!/html\.bcc-mobile(?!\[data-mod="service"\])/.test(sel), 'bare html.bcc-mobile: ' + sel);
    }
  }
  assert.ok(!/@media|@import|!important/.test(stripComments(tailText)));
  assert.ok(!/\*/.test(stripComments(tailText)), 'no star anywhere outside comments');
});

test('T12 shared css: no Chrome 44 trouble except gap (allowed only because the module has the same gap), no var() without fallback', () => {
  const body = stripComments(tailText);
  assert.ok(!/inset|grid|:is\(|:where\(|aspect-ratio|clamp\(|min\(|max\(/.test(body));
  for (const m of body.matchAll(/var\(([^)]*)\)/g)) assert.ok(m[1].includes(','), 'var() without fallback: ' + m[0]);
  const gapRules = topLevel(tailText).filter(r => /(^|;)gap:/.test(r.body));
  assert.deepEqual(gapRules.map(r => r.prelude), [SCOPE + '.sidebar-nav', SCOPE + '.nav-item'], 'gap only on the chip rail and the chips');
  const module720 = moduleBlock720();
  for (const r of gapRules) {
    const sel = r.prelude.slice(SCOPE.length - 1).trim();
    assert.equal(decls(r.body).get('gap'), module720.get(sel).get('gap'), 'the module declares the same gap for ' + sel);
  }
});

test('T12 shared css: the text before the Phase 6I marker (the part the capability analyser and the history rebuild read) equals G0', () => {
  const text = live.toString('latin1');
  const g0text = prefix.toString('latin1');
  assert.equal(text.split(PHASE6I_MARKER).length, 2, 'marker occurs once');
  assert.ok(text.indexOf(PHASE6I_MARKER) < G0_SIZE, 'marker sits inside the G0 bytes');
  assert.equal(text.split(PHASE6I_MARKER)[0], g0text.split(PHASE6I_MARKER)[0], 'analyser read unchanged');
  // The appended block is after the marker, so the cut drops it, exactly as the history helper cuts it.
  assert.ok(text.indexOf(D10_MARKER) > text.indexOf(PHASE6I_MARKER));
  assert.equal(`${text.split(PHASE6I_MARKER)[0].trimEnd()}\n`, `${g0text.split(PHASE6I_MARKER)[0].trimEnd()}\n`, 'history rebuild text unchanged');
});

test('T12 shared css: the Planning legacy fixture is still the tail of the unmodified region', () => {
  const fixture = fs.readFileSync(new URL('./fixtures/phase6c/module-mobile-legacy.css', import.meta.url));
  const region = prefix.subarray(G0_SIZE - fixture.length);
  assert.ok(region.equals(fixture), 'fixture equals the last bytes of the pre-wave sheet');
  assert.equal(live.subarray(G0_SIZE - fixture.length, G0_SIZE).equals(fixture), true);
});

test('U97 css-other-modules: non-service rules are identical before and after; no appended selector matches any other module', () => {
  const nonService = css => topLevel(css).filter(r => !r.prelude.includes('data-mod="service"')).map(r => r.prelude + '{' + r.body + '}');
  assert.deepEqual(nonService(live.toString('utf8')), nonService(prefix.toString('utf8')));
  // The brace parser also proves the whole new file is balanced.
  assert.ok(topLevel(live.toString('utf8')).length > topLevel(prefix.toString('utf8')).length);
  // Mini matcher: only the root part (html, class, data-mod) of each selector can differ between modules.
  const rootMatches = (sel, root) => {
    const m = /^html((?:\.[\w-]+)*)((?:\[[^\]]+\])*)/.exec(sel.trim());
    if (!m) return false;
    const classes = (m[1] || '').split('.').filter(Boolean);
    if (!classes.every(c => root.classes.includes(c))) return false;
    for (const a of (m[2] || '').matchAll(/\[([\w-]+)="([^"]*)"\]/g)) if (root.attrs[a[1]] !== a[2]) return false;
    return true;
  };
  const appended = topLevel(tailText).flatMap(r => r.prelude.split(','));
  assert.ok(appended.length >= 11);
  for (const id of MODULES) {
    const root = { classes: ['bcc-mobile'], attrs: { 'data-mod': id } };
    const hits = appended.filter(s => rootMatches(s, root)).length;
    assert.equal(hits, id === 'service' ? appended.length : 0, id);
  }
});

test('U97b each of the twelve module pages links the sheet and sets data-mod to its own id (through the shared runtime)', () => {
  const runtime = fs.readFileSync(new URL('../www/shared/module-runtime.js', import.meta.url), 'utf8');
  assert.match(runtime, /setAttribute\('data-mod',c\.moduleId\)/);
  for (const id of MODULES) {
    const html = fs.readFileSync(new URL(`../www/modules/${id}/index.html`, import.meta.url), 'utf8');
    assert.ok(html.includes('href="../../shared/module-mobile-common.css"'), id + ' links the sheet');
    const ids = new Set([...html.matchAll(/moduleId\s*:\s*'([a-z_]+)'/g)].map(m => m[1]));
    assert.deepEqual([...ids], [id], id + ' passes its own module id');
    assert.ok(!/setAttribute\(\s*'data-mod'/.test(html), id + ' sets data-mod nowhere else');
  }
});

// The module's own @media (max-width: 720px) block, as Map(selector -> Map(prop -> value)).
function moduleBlock720() {
  const src = fs.readFileSync(SERVICE_CSS_PATH, 'utf8');
  const marks = [...src.matchAll(/@media \(max-width: 720px\)/g)].map(m => m.index);
  for (const at of marks) {
    const open = src.indexOf('{', at);
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const inner = src.slice(open + 1, end);
    if (!/\.form-sidebar\s*\{/.test(inner)) continue;
    const map = new Map();
    for (const r of topLevel(inner)) for (const s of r.prelude.split(',')) map.set(s.trim(), decls(r.body));
    return map;
  }
  throw new Error('720px block with .form-sidebar not found in service-ui.css');
}

test('U98 css-parity: the eleven appended rules carry the same declarations as the module 720px block', () => {
  const mod = moduleBlock720();
  const rules = topLevel(tailText);
  assert.equal(rules.length, 11);
  const checked = [];
  for (const r of rules) {
    const sel = r.prelude.slice(SCOPE.length - 1).trim();
    assert.ok(mod.has(sel), 'module 720px block has ' + sel);
    assert.deepEqual([...decls(r.body)], [...mod.get(sel)], sel);
    checked.push(sel);
  }
  assert.deepEqual(checked, ['.form-sidebar', '.sidebar-order-info', '.sidebar-prog-wrap', '.sidebar-nav', '.sidebar-nav::-webkit-scrollbar', '.nav-item', '.nav-item.active::before', '.nav-item.active', '.nav-item.done', '.nav-text', '.sidebar-actions']);
});

test('U99 css-apply-script: on a scratch copy it gives the committed bytes, refuses twice, refuses wrong CR count', t => {
  if (!fs.existsSync(APPLY)) { t.skip('apply script not found at ' + APPLY + ' (workspace is outside git)'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc2-css-'));
  try {
    const file = path.join(dir, 'm.css');
    fs.writeFileSync(file, prefix);
    const run = p => spawnSync(process.execPath, [APPLY, p], { encoding: 'utf8' });
    const first = run(file);
    assert.equal(first.status, 0, first.stderr);
    assert.ok(fs.readFileSync(file).equals(live), 'scratch result equals the committed file');
    const second = run(file);
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /already applied/);
    assert.ok(fs.readFileSync(file).equals(live), 'second run changed nothing');
    // A copy with one CR turned into a space: same size, two CRs.
    const bad = Buffer.from(prefix);
    bad[CR_AT[0]] = 32;
    const badFile = path.join(dir, 'bad.css');
    fs.writeFileSync(badFile, bad);
    const refused = run(badFile);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /CR bytes/);
    assert.ok(fs.readFileSync(badFile).equals(bad), 'refused run changed nothing');
    // A copy of the wrong size.
    const shortFile = path.join(dir, 'short.css');
    fs.writeFileSync(shortFile, prefix.subarray(0, G0_SIZE - 1));
    assert.notEqual(run(shortFile).status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
