/* Fix wave S05 (DSR): sale and stock entry rules. U04-F1, F2, F4, F9, F11, F12.
   Loads the real functions from www/modules/dsr/index.html into a node:vm sandbox with small fakes. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(repoDir, 'www', 'modules', 'dsr', 'index.html'), 'utf8');

function slice(marker) {
  const i = SRC.indexOf(marker);
  assert.notEqual(i, -1, marker + ' must exist in the DSR module');
  const re = /\n(?:function |async function |let |const |\/\*)/g;
  re.lastIndex = i + marker.length;
  const m = re.exec(SRC);
  return SRC.slice(i, m ? m.index : SRC.length);
}
function load(markers, fakes) {
  const ctx = vm.createContext(Object.assign({}, fakes));
  vm.runInContext(markers.map(slice).join('\n'), ctx);
  return ctx;
}
function env(rec) {
  const els = {};
  const classes = [];
  const el = (id) => els[id] || (els[id] = { value: '', textContent: '', classList: { add: (c) => classes.push(id + ':' + c), remove() {} } });
  const toasts = [];
  const saves = [];
  const fakes = {
    el, toasts, saves, classes,
    toast: (m, t) => toasts.push({ m, t }),
    getRecord: () => rec, saveRec: (r) => saves.push(r), scheduleRecSave: (r) => saves.push(r),
    closeModal() {}, renderSales() {}, renderNonPurch() {}, renderVisitors() {}, updateProgress() {}, goStaffTab() {},
    isPastView: () => false, PROD_TYPES: ['Watch'], prevDayStr: () => '2026-11-13',
    STOCK_CATS: [{ id: 'x' }], setTimeout: () => 0,
    document: { activeElement: null },
  };
  return { els, el, toasts, saves, classes, fakes };
}
function newRec() { return { date: '2026-11-12', sales: [], nonpurch: [], visitors: [], opening: {}, closing: {} }; }
function fillSale(e, bill, amt) { e.el('s-bill').value = bill; e.el('s-amt').value = amt; e.el('s-prod').value = 'Watch'; e.el('s-mobile').value = ''; e.el('s-cust').value = ''; e.el('s-paymode').value = ''; }
const SALE_FNS = ['function esc(', 'function billCount(', 'function saveSale('];

test('saveSale refuses zero, negative, non-numeric and infinite amounts', () => {
  const rec = newRec(); const e = env(rec);
  const c = load(SALE_FNS, e.fakes);
  for (const amt of ['0', '-100', 'abc', '1e999']) {
    e.toasts.length = 0; fillSale(e, 'TB-' + amt, amt);
    c.saveSale(null);
    assert.equal(rec.sales.length, 0, 'amount ' + amt + ' must not be stored');
    assert.equal(e.saves.length, 0);
    assert.equal(e.toasts.at(-1).t, 'err');
    assert.match(e.toasts.at(-1).m, /greater than zero|required/);
  }
  fillSale(e, 'TB-1', '0'); e.toasts.length = 0; c.saveSale(null);
  assert.match(e.toasts.at(-1).m, /greater than zero/);
  fillSale(e, 'TB-2', '900'); c.saveSale(null);
  assert.equal(rec.sales.length, 1);
  assert.equal(rec.sales[0].amount, 900);
});

test('duplicate bill number is refused, edit of unchanged number is allowed', () => {
  const rec = newRec(); rec.sales.push({ billNo: 'TB-1001', amount: 900 });
  const e = env(rec); const c = load(SALE_FNS, e.fakes);
  fillSale(e, ' tb-1001 ', '500'); c.saveSale(null);
  assert.equal(rec.sales.length, 1);
  assert.equal(e.toasts.at(-1).t, 'err');
  assert.match(e.toasts.at(-1).m, /already entered/);
  fillSale(e, 'TB-1002', '500'); c.saveSale(null);
  assert.equal(rec.sales.length, 2);
  fillSale(e, 'TB-1001', '950'); c.saveSale(0);
  assert.equal(rec.sales[0].amount, 950);
  assert.equal(rec.sales.length, 2);
  /* two old duplicates can still be edited without changing the number */
  const rec2 = newRec(); rec2.sales.push({ billNo: 'D-1', amount: 10 }, { billNo: 'D-1', amount: 20 });
  const e2 = env(rec2); const c2 = load(SALE_FNS, e2.fakes);
  fillSale(e2, 'D-1', '30'); c2.saveSale(1);
  assert.equal(rec2.sales[1].amount, 30);
  /* blank bill never reaches the clash check (refused earlier) */
  fillSale(e2, '', '30'); c2.saveSale(null);
  assert.equal(rec2.sales.length, 2);
});

test('stock counts reject negatives', () => {
  const rec = newRec(); const e = env(rec);
  const inp = { tagName: 'INPUT', value: '-5', classList: { add() {}, remove() {} } };
  e.fakes.document.activeElement = inp;
  const c = load(['function stockTotal(', 'function cleanStockCount(', 'function stockEntered(', 'function refuseStockCount(', 'function updOpening(', 'function updClosing('], e.fakes);
  assert.equal(c.cleanStockCount('-5'), null);
  assert.equal(c.cleanStockCount(''), '');
  assert.equal(c.cleanStockCount('0'), '0');
  assert.equal(c.cleanStockCount('12'), '12');
  assert.equal(c.cleanStockCount('1e999'), null);
  c.updOpening('x', '-5');
  assert.equal(rec.opening.x, undefined);
  assert.equal(e.saves.length, 0);
  assert.equal(e.toasts.at(-1).t, 'err');
  assert.equal(inp.value, '');
  c.updClosing('x', '-3');
  assert.equal(rec.closing.x, undefined);
  assert.equal(e.saves.length, 0);
  c.updOpening('x', '7');
  assert.equal(rec.opening.x, '7');
  c.updClosing('x', '4');
  assert.equal(rec.closing.x, '4');
});

test('bill count ignores blank and non-positive rows, and the CSV uses it', () => {
  const c = load(['function billCount('], {});
  assert.equal(c.billCount([{ amount: 100 }, { amount: '' }, { amount: 0 }, { amount: -5 }, { amount: '250' }]), 2);
  assert.equal(c.billCount(null), 0);
  const one = slice('function exportSingleCSV(');
  const all = slice('function exportAllCSV(');
  assert.ok(one.includes('billCount('));
  assert.ok(all.includes('billCount('));
  assert.ok(!one.includes("'Total Sales Bills',r.sales.length"));
  assert.ok(!all.includes('r.sales.length,'));
});

test('non-purchase visitor mobile must hold six real digits', () => {
  const rec = newRec(); const e = env(rec);
  const c = load(['function saveNP('], e.fakes);
  const set = (m) => { e.el('np-mobile').value = m; e.el('np-cust').value = 'A'; e.el('np-reason').value = 'r'; e.el('np-rem').value = ''; };
  for (const bad of ['------', '++++++']) {
    set(bad); e.toasts.length = 0; c.saveNP(null);
    assert.equal(rec.nonpurch.length, 0, bad + ' must be refused');
    assert.equal(e.toasts.at(-1).t, 'err');
  }
  set(''); c.saveNP(null);
  assert.equal(rec.nonpurch.length, 1);
  set('98765 43210'); c.saveNP(null);
  assert.equal(rec.nonpurch.length, 2);
});

test('visitor outcome cannot be flipped, same outcome stays idempotent', () => {
  const rec = newRec();
  rec.visitors.push({ sourceRef: 'q1', outcome: 'purchase', customer: 'A', mobile: '' });
  rec.sales.push({ billNo: '', amount: '', source: 'qms-visitor', sourceRef: 'q1' });
  const e = env(rec);
  const c = load(['function findVisitor(', 'function visitorPurchase(', 'function visitorNonPurch('], e.fakes);
  c.visitorNonPurch('q1');
  assert.equal(rec.nonpurch.length, 0);
  assert.equal(rec.visitors[0].outcome, 'purchase');
  assert.equal(e.saves.length, 0);
  c.visitorPurchase('q1');
  assert.equal(rec.sales.length, 1);
  const rec2 = newRec(); rec2.visitors.push({ sourceRef: 'q2', outcome: 'nonpurchase' });
  const e2 = env(rec2); const c2 = load(['function findVisitor(', 'function visitorPurchase(', 'function visitorNonPurch('], e2.fakes);
  c2.visitorPurchase('q2');
  assert.equal(rec2.sales.length, 0);
  assert.equal(rec2.visitors[0].outcome, 'nonpurchase');
  assert.equal(e2.saves.length, 0);
});
