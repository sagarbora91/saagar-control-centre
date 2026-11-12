// S11 U11-F02 (due day 31 in a short month) and U11-F05 module guard (local date, not UTC).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, run, MONTHS, readTax, extractFunction } from './lib/fix-s11-extract.mjs';

function ctxFor(fy, custom = [], extra = {}) {
  const saves = [];
  const bucket = {};
  const ctx = buildContext(
    ['parseDueDate', 'getCalendarYearForMonth', 'expandCustom', 'monthAbbr', 'escapeHtml', 'dueDateIso', 'materializeDueDates'],
    {
      MONTHS, parseInt, isNaN, String, Array, Date, Math, Object,
      STATE: { fyStartYear: fy, activeFirmId: 'f1', firms: [{ id: 'f1' }], custom },
      D: Object.fromEntries(MONTHS.map(m => [m, true])),
      isPastAsOf: () => false,
      getActiveFirm: () => ({ id: 'f1' }),
      getFirmCompliance: () => bucket,
      getMonthItems: m => run(ctx, 'expandCustom')(m),
      getVisibleItems: x => x,
      getControlProfile: () => ({ buffer: 2 }),
      stripHtml: s => String(s), renderFYText: s => String(s),
      saveState: () => saves.push(1),
      ...extra
    });
  return { ctx, bucket, saves };
}
const cust = (id, dueDay, months) => ({ id, name: 'X', months, dueDay });
const itemFor = (ctx, month) => run(ctx, 'expandCustom')(month)[0];

test('F02: day 31 in November shows 30 Nov and stores 2026-11-30', () => {
  const { ctx } = ctxFor(2026, [cust('cust-1', 31, ['November'])]);
  const it = itemFor(ctx, 'November');
  assert.equal(it.due, '30 Nov');
  assert.equal(run(ctx, 'dueDateIso')(it.due, 'November'), '2026-11-30');
});

test('F02: day 30 in February clamps to 28 (2027) and 29 (2028, leap year)', () => {
  let c = ctxFor(2026, [cust('cust-1', 30, ['February'])]);
  let it = itemFor(c.ctx, 'February');
  assert.equal(it.due, '28 Feb');
  assert.equal(run(c.ctx, 'dueDateIso')(it.due, 'February'), '2027-02-28');
  c = ctxFor(2027, [cust('cust-1', 30, ['February'])]);
  it = itemFor(c.ctx, 'February');
  assert.equal(it.due, '29 Feb');
  assert.equal(run(c.ctx, 'dueDateIso')(it.due, 'February'), '2028-02-29');
});

test('F02: ordinary days and Last-day items are unchanged', () => {
  const { ctx } = ctxFor(2026, [cust('cust-1', 15, ['November']), cust('cust-2', 0, ['November'])]);
  const items = run(ctx, 'expandCustom')('November');
  assert.equal(items[0].due, '15 Nov');
  assert.equal(items[1].due, 'Last day of Nov');
  assert.equal(run(ctx, 'dueDateIso')('Last day of Feb', 'February'), '2027-02-28');
});

test('F02: parseDueDate never rolls into the next month', () => {
  const { ctx } = ctxFor(2026);
  const d = run(ctx, 'parseDueDate')('31 Nov', 'November');
  assert.equal(d.getMonth(), 10);
  assert.equal(d.getDate(), 30);
});

test('F02: every built-in due string parses to the same date as before (no built-in changes)', () => {
  const src = readTax();
  const strings = new Set();
  const re = /due\s*:\s*'(\d{1,2}\s+[A-Z][a-z]{2})'/g;
  let m;
  while ((m = re.exec(src))) strings.add(m[1]);
  assert.ok(strings.size > 5, 'found built-in due strings: ' + strings.size);
  const { ctx } = ctxFor(2026);
  const shortMonths = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  for (const s of strings) {
    const [d, mon] = s.split(/\s+/);
    const mi = shortMonths[mon];
    const y = mi <= 2 ? 2027 : 2026;
    const old = new Date(y, mi, parseInt(d));
    const now = run(ctx, 'parseDueDate')(s, '');
    assert.equal(+now, +old, s);
  }
});

test('F02: materialize re-syncs a not-done custom record, keeps a done one', () => {
  const { ctx, bucket, saves } = ctxFor(2026, [cust('cust-1', 31, ['November'])]);
  bucket['cust-1-Nov'] = { dueDate: '2026-12-01', done: false, name: 'X', buffer: 2 };
  run(ctx, 'materializeDueDates')();
  assert.equal(bucket['cust-1-Nov'].dueDate, '2026-11-30');
  assert.ok(saves.length >= 1);
  const d = ctxFor(2026, [cust('cust-1', 31, ['November'])]);
  d.bucket['cust-1-Nov'] = { dueDate: '2026-12-01', done: true, filedOn: '2026-11-20', name: 'X', buffer: 2 };
  run(d.ctx, 'materializeDueDates')();
  assert.equal(d.bucket['cust-1-Nov'].dueDate, '2026-12-01');
});

test('F05 guard: dueDateIso gives the LOCAL date (no toISOString shift)', () => {
  const { ctx } = ctxFor(2026);
  assert.equal(run(ctx, 'dueDateIso')('11 Nov', 'November'), '2026-11-11');
  const code = extractFunction(readTax(), 'dueDateIso').split('/*')[0];
  assert.ok(code.indexOf('toISOString') < 0);
});
