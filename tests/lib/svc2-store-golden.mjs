// tests/lib/svc2-store-golden.mjs
// A fixed run of 40 Phase 1 postings (ledger, docs, defective, parts, labour, config, audit) with a fake clock.
// Run against a store module, it returns every svcs key and the device mark as text. The expected hashes in the
// test were produced by running this same scenario on the committed Phase 1 store (commit 031841f), before any
// Phase 2 edit, so a match proves that nothing a Phase 1 stream writes has moved.
import { makeClock, makeAdapter } from './svc1-store-harness.mjs';

const OWNER = { t: 'owner', r: 'Owner', m: 'Test Owner' };
const MGR = { t: 'manager', r: 'Store Manager', m: 'Test Keeper' };

export function runGolden(StoreMod) {
  const clock = makeClock('2026-09-10T05:00:00.000Z');
  const adapter = makeAdapter();
  const made = StoreMod.createStore(adapter, { now: clock.now });
  if (made.ok !== true) throw new Error('createStore failed');
  const store = made.store;
  if (store.open().ok !== true) throw new Error('open failed');
  let count = 0;
  const put = (stream, item, actor) => {
    const h = store.head(stream);
    const r = store.append(stream, [item], { expectRev: h.rev, actor: actor || MGR });
    if (r.ok !== true) throw new Error('append failed: ' + JSON.stringify(r));
    count += 1;
    clock.advance(1000);
    return r;
  };
  const numbered = (series, stream, kind, body, ref) => {
    const t = store.nextAt(stream);
    const n = store.nextNumber(series, t.at);
    const item = { k: kind, series, b: Object.assign({ no: n.no }, body) };
    if (ref) item.r = ref;
    const h = store.head(stream);
    const r = store.append(stream, [item], { expectRev: h.rev, actor: MGR, at: t.at });
    if (r.ok !== true) throw new Error('numbered append failed: ' + JSON.stringify(r));
    count += 1;
    clock.advance(1000);
    return r;
  };
  for (let i = 1; i <= 12; i++) numbered('GRN', 'ledger', 'GRN', { qty: i, unitCostPaise: 1000 + i, note: 'receipt ' + i }, 'REF:g:' + i);
  clock.set('2026-10-12T05:00:00.000Z');
  for (let i = 1; i <= 4; i++) numbered('CSL', 'ledger', 'CSL', { qty: 1, amountPaise: 5000 * i, moneyPosted: false }, 'REF:c:' + i);
  for (let i = 1; i <= 6; i++) put('docs', { k: 'OPN_PROPOSE', b: { lines: [{ partCode: 'P' + i, qty: i, unitCostPaise: 100 }], note: 'count ' + i }, r: 'REF:d:' + i });
  for (let i = 1; i <= 4; i++) numbered('OLD', 'defective', 'OLD_REGISTER', { jobId: 'J-' + i, partText: 'old part ' + i, qty: 1, state: 'HELD_FOR_CLAIM' });
  for (let i = 1; i <= 3; i++) put('parts', { k: 'PART_CREATE', b: { code: 'T-' + i, row: { code: 'T-' + i, name: 'Test part ' + i, sellPricePaise: 1000 * i }, changes: [], reason: 'seed', via: 'manual', batchId: 'B1' } });
  for (let i = 1; i <= 2; i++) put('labour', { k: 'LAB_CREATE', b: { code: 'L-' + i, row: { code: 'L-' + i, name: 'Test job ' + i, ratePaise: 25000 * i }, changes: [], reason: 'seed', via: 'manual', batchId: 'B2' } });
  put('config', { k: 'CONFIG_SET', b: { adjustLimitPaise: 100000, storeRoles: ['Technician'] } }, OWNER);
  for (let i = 1; i <= 2; i++) put('audit', { k: 'NOTE', b: { text: 'note ' + i } });
  clock.set('2026-11-13T05:00:00.000Z');
  for (let i = 13; i <= 18; i++) numbered('GRN', 'ledger', 'GRN', { qty: i, unitCostPaise: 1000 + i, note: 'receipt ' + i }, 'REF:g:' + i);
  const out = {};
  for (const k of adapter.svcsKeys()) out[k] = adapter.data.get(k);
  out[StoreMod.WATERMARK_KEY] = adapter.data.get(StoreMod.WATERMARK_KEY);
  return { count, texts: out };
}
