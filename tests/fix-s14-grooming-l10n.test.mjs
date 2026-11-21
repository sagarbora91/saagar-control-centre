import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../www/modules/grooming/index.html', import.meta.url), 'utf8');
const BEGIN = '/* S14-L10N-BEGIN';
const END = '/* S14-L10N-END */';
const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const dev = /[\u0900-\u097F]/;

function loadBlock() {
  assert.equal(html.split(BEGIN).length, 2, 'begin marker must appear exactly once');
  assert.equal(html.split(END).length, 2, 'end marker must appear exactly once');
  const code = html.slice(html.indexOf(BEGIN), html.indexOf(END) + END.length);
  const win = { SaagarI18n: { translate: s => s, getLanguage: () => 'hi' }, addEventListener() {} };
  const ctx = {
    window: win,
    document: { querySelectorAll: () => [] },
    renderDaily() {}, renderMonthly() {}, applyReadOnly() {}, setTimeout() {}
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\n;globalThis.__api={grmXlate,grmNode,grmEnText,grmLocalize};', ctx);
  return ctx.__api;
}

test('S14 L10N block exists once and loads', () => { loadBlock(); });

test('every checklist sentence and group heading translates in hi and mr', () => {
  const api = loadBlock();
  const texts = [
    ...[...html.matchAll(/<span class="cltxt">([\s\S]*?)<\/span>/g)].map(m => decode(m[1])),
    ...[...html.matchAll(/<div class="clgh [^"]*">(?:<span[^>]*><\/span>)?([\s\S]*?)<\/div>/g)].map(m => decode(m[1]))
  ];
  assert.ok(texts.length >= 40, 'found ' + texts.length);
  for (const t of texts) for (const lang of ['hi', 'mr']) {
    const out = api.grmXlate(t, lang);
    assert.notEqual(out, t, lang + ': ' + t);
    assert.match(out, dev, lang + ': ' + t);
  }
});

test('templates keep their numbers', () => {
  const api = loadBlock();
  for (const lang of ['hi', 'mr']) {
    let o = api.grmXlate('All 15 parameters passed', lang); assert.ok(o.includes('15') && dev.test(o));
    o = api.grmXlate('7 passed', lang); assert.ok(o.includes('7') && dev.test(o));
    o = api.grmXlate('failed 1 time', lang); assert.ok(o.includes('1') && dev.test(o));
    o = api.grmXlate('failed 3 times', lang); assert.ok(o.includes('3') && dev.test(o));
    o = api.grmXlate('50% fail rate (2/4)', lang); assert.ok(o.includes('50% ') && o.includes('(2/4)') && dev.test(o));
    o = api.grmXlate('Pending this morning \u2014 3', lang); assert.ok(o.includes('3') && dev.test(o));
    o = api.grmXlate('Most-missed grooming standards this month \u2014 top 8 of 12 checks with failures', lang);
    assert.ok(o.includes('8') && o.includes('12') && dev.test(o));
  }
});

test('node round trip keeps English recoverable', () => {
  const api = loadBlock();
  const node = { nodeType: 3, nodeValue: 'Uniform' };
  api.grmNode(node, 'mr');
  assert.notEqual(node.nodeValue, 'Uniform');
  assert.match(node.nodeValue, dev);
  assert.equal(api.grmEnText({ firstChild: node, textContent: node.nodeValue }), 'Uniform');
  api.grmNode(node, 'en');
  assert.equal(node.nodeValue, 'Uniform');
});

test('ST_LANG receiver accepts only the shell (validated source and origin)', () => {
  const code = html.slice(html.indexOf(BEGIN), html.indexOf(END) + END.length);
  const parent = {};
  let listener = null;
  const win = {
    parent,
    SaagarI18n: { translate: s => s, getLanguage: () => 'en' },
    addEventListener(type, fn) { if (type === 'message') listener = fn; }
  };
  win.SaagarModuleRuntime = { accepts: (e, src) => !!e && e.source === src && e.origin === 'https://app.local' };
  const ctx = { window: win, SaagarModuleRuntime: win.SaagarModuleRuntime, document: { querySelectorAll: () => [] },
    renderDaily() {}, renderMonthly() {}, applyReadOnly() {}, setTimeout() {} };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  assert.equal(typeof listener, 'function');
  listener({ source: {}, origin: 'https://app.local', data: { type: 'ST_LANG', lang: 'hi' } });
  assert.equal(win.__grmLang, undefined, 'a foreign frame must not switch the language');
  listener({ source: parent, origin: 'https://evil.invalid', data: { type: 'ST_LANG', lang: 'hi' } });
  assert.equal(win.__grmLang, undefined, 'a foreign origin must not switch the language');
  listener({ source: parent, origin: 'https://app.local', data: { type: 'ST_LANG', lang: 'mr' } });
  assert.equal(win.__grmLang, 'mr');
  const block = code.match(/addEventListener\('message'([\s\S]{0,700})/);
  assert.match(block[1], /SaagarModuleRuntime\.accepts/);
});

test('saveCRO reads the English label and the action identities are unchanged', () => {
  assert.ok(html.includes("const label = grmEnText(item.querySelector('.cltxt'));"));
  assert.ok(!html.includes("const label = item.querySelector('.cltxt').textContent;"));
  const staticMarkup = html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  assert.equal([...staticMarkup.matchAll(/data-action="([^"]+)"/g)].length, 12);
});
