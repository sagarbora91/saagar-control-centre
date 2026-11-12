// S07 U06-F02 (petty on a closed day), U06-F04 (blank date), U06-F05 (sync preview, closed days held, one tap = one post).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadExpense } from './lib/fix-s07-expense-harness.mjs';

const OWNER = { isOwner: true, isManager: true, role: 'Store Manager' };
const PAST = '2026-01-10';

function petty(x, amount = 120) {
  x.set('pt_a', amount); x.set('pt_c', 'Miscellaneous'); x.set('pt_d', 'tea');
}

test('F02 petty refuses a closed day and posts nothing', () => {
  const x = loadExpense({ shell: OWNER });
  x.run('renderPetty=function(){}');
  x.closeDay(x.today());
  const before = x.run(`computeDay('${x.today()}')`).expectedClosing;
  petty(x);
  x.run('pettyOut()');
  assert.equal(x.ledger().length, 0);
  assert.equal(x.run(`computeDay('${x.today()}')`).expectedClosing, before);
  assert.match(x.toastText(), /locked/);
});

test('F02 petty on an open day still posts one Cash row (control)', () => {
  const x = loadExpense({ shell: OWNER });
  x.run('renderPetty=function(){}');
  petty(x);
  x.run('pettyOut()');
  const rows = x.ledger();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mode, 'Cash');
  assert.equal(rows[0].source, 'petty');
});

test('F02 petty on a closed day in a locked month is refused before the override window opens', () => {
  const today = loadExpense().today().slice(0, 7);   /* module's own local date, not UTC (audit S07) */
  const x = loadExpense({ shell: OWNER, storage: { gm_role: 'owner', gm_tax_feed: { [today]: { month: today } } } });
  x.run('renderPetty=function(){}');
  const t = x.today();
  x.closeDay(t);
  x.run(`ymLocked=isMonthLocked('${t}')`);
  assert.equal(x.run('ymLocked'), true);
  petty(x);
  x.run('pettyOut()');
  assert.equal(x.ledger().length, 0);
  assert.equal(x.modalHtml(), '', 'no override modal');
});

function entryFields(x, date) {
  x.set('f_date', date); x.set('f_amt', 31); x.set('f_desc', 'x'); x.set('f_cat', 'Miscellaneous'); x.set('f_mode', 'Cash');
}

test('F04 blank date is refused whether or not today is closed', () => {
  for (const closed of [true, false]) {
    const x = loadExpense({ shell: OWNER });
    x.run('render=function(){}; renderLedger=function(){};');
    if (closed) x.closeDay(x.today());
    entryFields(x, '');
    x.run('addEntry()');
    assert.equal(x.ledger().length, 0, `closed=${closed}`);
    assert.match(x.toastText(), /valid date/);
  }
});

test('F04 a real date: open day saves, closed day keeps the locked message', async () => {
  const open = loadExpense({ shell: OWNER });
  open.run('render=function(){}; renderLedger=function(){};');
  entryFields(open, open.today());
  open.run('addEntry()');
  await open.tick(20);
  assert.equal(open.ledger().length, 1);

  const closed = loadExpense({ shell: OWNER });
  closed.run('render=function(){}; renderLedger=function(){};');
  closed.closeDay(closed.today());
  entryFields(closed, closed.today());
  closed.run('addEntry()');
  await closed.tick(20);
  assert.equal(closed.ledger().length, 0);
  assert.match(closed.toastText(), /locked/);
});

function wscCase(id, closedAt, extra = {}) {
  return { id, status: 'closed', closedAt, custName: 'C' + id, brand: 'B', estTotal: 500, delivery: { finalAmt: 500, payMode: 'Cash' }, ...extra };
}

function seedTwoCases() {
  const probe = loadExpense({ shell: OWNER });
  const today = probe.today();
  const x = loadExpense({ shell: OWNER, storage: { saagar_wsf_v2: [wscCase('A', PAST), wscCase('B', today)] } });
  x.closeDay(PAST);
  return { x, today };
}

test('F05 syncPlan holds items on closed days', () => {
  const { x, today } = seedTwoCases();
  const plan = x.run('(function(){ var p=syncPlan(feedItems().filter(function(i){return !i.posted;})); return {post:p.post.map(function(i){return i.ref;}), held:p.held.map(function(i){return i.ref;})}; })()');
  assert.deepEqual([...plan.post], ['wsc_B']);
  assert.deepEqual([...plan.held], ['wsc_A']);
  assert.ok(today);
});

test('F05 Post all shows a preview first, then posts only the open-day item', async () => {
  const { x } = seedTwoCases();
  x.run('render=function(){}; renderSync=function(){};');
  x.run("postSrc('all')");
  assert.match(x.modalHtml(), /Review before posting/);
  assert.match(x.modalHtml(), /will <b>not<\/b> be posted/);
  assert.equal(x.ledger().length, 0, 'nothing written before confirm');
  await x.run("document.getElementById('mok').onclick()");
  const rows = x.ledger();
  assert.deepEqual(rows.map((r) => r.sourceRef), ['wsc_B']);
  const pending = x.run('feedItems().filter(function(i){return !i.posted;}).map(function(i){return i.ref;})');
  assert.deepEqual([...pending], ['wsc_A']);
  assert.equal(x.json('tanishq_statements')[PAST].closed, true);
  assert.match(x.toastText(), /held \(closed day\)/);
});

test('F05 a tax-locked month is named in the preview and its feed is marked stale', async () => {
  const probe = loadExpense({ shell: OWNER });
  const today = probe.today();
  const m = today.slice(0, 7);
  const x = loadExpense({ shell: OWNER, storage: { saagar_wsf_v2: [wscCase('B', today)], gm_tax_feed: { [m]: { month: m, generatedAt: '2000-01-01T00:00:00.000Z' } } } });
  x.run('render=function(){}; renderSync=function(){};');
  x.run("postSrc('all')");
  assert.ok(x.modalHtml().includes(m));
  assert.match(x.modalHtml(), /tax-locked/);
  await x.run("document.getElementById('mok').onclick()");
  assert.equal(x.json('gm_tax_feed')[m].stale, true);
  assert.ok(x.json('gm_audit', []).some((a) => a.action === 'feed.stale'));
});

test('F05 a double tap on Confirm posts once', async () => {
  const probe = loadExpense({ shell: OWNER });
  const today = probe.today();
  const x = loadExpense({ shell: OWNER, storage: { saagar_wsf_v2: [wscCase('B', today)] } });
  x.run('render=function(){}; renderSync=function(){};');
  x.run("postSrc('all')");
  const mok = x.get('mok');
  const first = mok.onclick();
  const second = mok.onclick();
  await Promise.all([first, second]);
  assert.equal(x.ledger().length, 1);
});

test('F05 when every pending item is on a closed day there is no preview, only a notice', () => {
  const x = loadExpense({ shell: OWNER, storage: { saagar_wsf_v2: [wscCase('A', PAST)] } });
  x.closeDay(PAST);
  x.run("postSrc('all')");
  assert.equal(x.modalHtml(), '');
  assert.match(x.toastText(), /reopen/);
  assert.equal(x.ledger().length, 0);
});

test('F05 part B: render computes the feed once, not twice', () => {
  const probe = loadExpense({ shell: OWNER });
  const x = loadExpense({ shell: OWNER, storage: { saagar_wsf_v2: [wscCase('B', probe.today())] } });
  x.run("CUR='sync'; window.__calls=0; var __orig=feedItems; feedItems=function(){ window.__calls++; return __orig.apply(this,arguments); };");
  x.run('render()');
  assert.equal(x.run('window.__calls'), 1);
});

/* U06-F05 part B, second pass. Root cause of the 15 s freeze: storage-core fires a synchronous 'storage' event on every write, and the module
   rendered on each one (about 125 full renders, each re-reading the whole ledger). The listener now skips events while a post runs and collapses a burst. */
import fs from 'node:fs';
import vm from 'node:vm';

function storageListenerSandbox() {
  const src = fs.readFileSync(new URL('../www/modules/expense/index.html', import.meta.url), 'utf8');
  const a = src.indexOf('var __stLast=0');
  const b = src.indexOf('});', src.indexOf("window.addEventListener('storage'", a)) + 3;
  assert.ok(a > 0 && b > a, 'storage listener block found');
  let listener = null, renders = 0, now = 1000, timers = [];
  const sandbox = {
    window: { addEventListener: (n, f) => { if (n === 'storage') listener = f; } },
    render: () => { renders++; },
    Date: { now: () => now },
    setTimeout: (f) => { timers.push(f); return timers.length; },
  };
  vm.runInNewContext(src.slice(a, b), sandbox);
  return { fire: () => listener(), busy: (v) => { sandbox.window.__syncBusy = v; }, renders: () => renders, timers: () => timers, advance: (ms) => { now += ms; } };
}

test('F05 part B: a burst of 127 storage events costs one immediate render and one trailing render', () => {
  const s = storageListenerSandbox();
  for (let i = 0; i < 127; i++) s.fire();
  assert.equal(s.renders(), 1);
  assert.equal(s.timers().length, 1);
  s.advance(300); s.timers()[0]();
  assert.equal(s.renders(), 2);
  s.advance(300); s.fire();
  assert.equal(s.renders(), 3, 'a later single event still renders at once');
});

test('F05 part B: no storage-event render while a sync post is running', () => {
  const s = storageListenerSandbox();
  s.busy(true);
  for (let i = 0; i < 50; i++) s.fire();
  assert.equal(s.renders(), 0);
  assert.equal(s.timers().length, 0);
});

test('F05 part B: the Posting label is given a frame to paint before the heavy loop', () => {
  const src = fs.readFileSync(new URL('../www/modules/expense/index.html', import.meta.url), 'utf8');
  const i = src.indexOf("ok.textContent='Posting…'");
  const j = src.indexOf('var led=getLedger()', i);
  assert.ok(i > 0 && j > i);
  assert.match(src.slice(i, j), /requestAnimationFrame/);
});
