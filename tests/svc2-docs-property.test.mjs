// Service wave 2, billing documents: seeded property test (P3 test 55) and two-instance concurrency test (P3 test 56).
// REAL store, FIFO, masters, Phase 1 docs, calc and money. Seeds 1 to 200, 60 random steps each. Failures print the seed and the last steps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, makeStack, makeClock, makeAdapter, Calc, OWNER, MANAGER, CASHIER, GREETER, NONE } from './lib/svc2-docs-env.mjs';

function mulberry32(a) {
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const JOBS = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'];
const NOCHARGE = new Set(['J5', 'J6']);
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

function setup(seed) {
  const r = mulberry32(seed);
  const env = makeEnv();
  env.addPart('P1', { sellPricePaise: 11800, priceIncludesTax: true });
  env.addPart('P2', { name: 'Strap P2', hsn: '9113', sellPricePaise: 5000, priceIncludesTax: false });
  env.addPart('P3', { name: 'Seal P3', hsn: '9114', sellPricePaise: 2300, priceIncludesTax: true });
  env.addLabour('L1');
  env.addLabour('L2', { ratePaise: 25000, priceIncludesTax: true });
  for (const [c, a, b] of [['P1', 10000, 12000], ['P2', 2000, 2500], ['P3', 500, 700]]) {
    env.grn([{ partCode: c, qtyReceived: 40, unitCostPaise: a }]);
    env.grn([{ partCode: c, qtyReceived: 40, unitCostPaise: b }]);
  }
  for (const j of JOBS) env.job(j, NOCHARGE.has(j) ? { paymentStatus: 'no_charge_warranty' } : {});
  env.setConfig({ billingRoles: ['Cashier'], discountLimitPaise: r() < 0.5 ? 0 : 500 });
  return { env, r };
}

const pick = (r, a) => a[Math.floor(r() * a.length)];
function sessionFor(env, r) {
  const x = r();
  if (x < 0.4) return { s: OWNER, pin: true };
  if (x < 0.6) return { s: OWNER, pin: false };
  if (x < 0.7) return { s: OWNER, pin: 'stale' };
  if (x < 0.85) return { s: MANAGER, pin: false };
  if (x < 0.93) return { s: CASHIER, pin: false };
  if (x < 0.97) return { s: GREETER, pin: false };
  return { s: NONE, pin: false };
}
function ctxOf(cur, o) {
  const c = { session: o.s, clientRef: cur.ref() };
  if (o.pin === true) c.stepUp = { ok: true, at: cur.clock.ms() };
  if (o.pin === 'stale') c.stepUp = { ok: true, at: cur.clock.ms() - 121000 };
  return c;
}

// returns {name, billing, res}
function act(cur, r) {
  const o = sessionFor(cur, r);
  const ctx = () => ctxOf(cur, o);
  const job = pick(r, JOBS);
  const b = cur.bill;
  const x = r();
  const lines = () => {
    const n = 1 + Math.floor(r() * 3);
    const out = [];
    const used = new Set();
    for (let i = 0; i < n; i += 1) {
      const code = pick(r, ['P1', 'P2', 'P3', 'L1', 'L2']);
      if (used.has(code)) continue;
      used.add(code);
      out.push({ kind: code[0] === 'P' ? 'PART' : 'LABOUR', code, qty: 1 + Math.floor(r() * 3) });
    }
    return out;
  };
  if (x < 0.07) return { name: 'est', billing: true, res: b.saveEstimate({ jobId: job, lines: lines(), reason: 'property change of quote' }, ctx()) };
  if (x < 0.14) {
    const v = b.estimateView(job, { session: MANAGER });
    return { name: 'apr', billing: true, res: b.recordApproval({ jobId: job, version: v.ok ? v.version : 1, method: pick(r, ['CALL', 'WHATSAPP', 'IN_PERSON']) }, ctx()) };
  }
  if (x < 0.27) {
    const code = pick(r, ['P1', 'P2', 'P3']);
    return { name: 'iss', billing: false, res: cur.stock.issueToJob({ jobId: job, lines: [{ partCode: code, qty: 1 + Math.floor(r() * 2) }] }, ctxOf(cur, { s: MANAGER, pin: false })) };
  }
  if (x < 0.32) {
    const st = cur.stock.jobStock(job);
    const it = st.ok ? st.issues.filter((i) => i.outstanding > 0) : [];
    if (!it.length) return { name: 'ret0', billing: false, res: { ok: true } };
    const i = pick(r, it);
    return { name: 'ret', billing: false, res: cur.stock.returnFromJob({ jobId: job, lines: [{ issueMovementId: i.movementId, qty: 1, returnReason: 'UNUSED' }] }, ctxOf(cur, { s: MANAGER, pin: false })) };
  }
  if (x < 0.5) {
    const p = b.prepareInvoice(job, { session: MANAGER });
    const input = p.ok ? p.input : { jobId: job };
    if (r() < 0.2 && input.parts && input.parts.length) input.parts = input.parts.slice(1);
    if (r() < 0.25) { input.billDiscountPaise = 100 + Math.floor(r() * 500); input.discountReason = 'property discount'; }
    if (r() < 0.2) { input.mode = 'NOT_IN_CCPT'; input.notInCcptReason = 'property not in ccpt'; }
    else if (r() < 0.3) input.ccptInvoiceNo = 'C-' + Math.floor(r() * 5);
    if (r() < 0.3) input.approvalOverrideReason = 'property override';
    if (!input.labour.length && !input.parts.length && r() < 0.8) input.labour = [{ code: 'L1', qty: 1, discountPaise: 0 }];
    return { name: 'bill', billing: true, res: b.issueInvoice(input, ctx()) };
  }
  if (x < 0.55) {
    const no = b.activeInvoiceNo(job);
    return { name: 'ccpt', billing: true, res: b.linkCcptInvoice({ invoiceNo: typeof no === 'string' && no ? no : 'SV/2026-27/9999', ccptInvoiceNo: 'C-' + Math.floor(r() * 5), reason: 'property link' }, ctx()) };
  }
  if (x < 0.62) {
    const no = b.activeInvoiceNo(job);
    if (r() < 0.3) cur.clock.advance(86400000);
    return { name: 'cancel', billing: true, res: b.cancelInvoice(typeof no === 'string' && no ? no : 'SV/2026-27/9999', 'property cancel', ctx()) };
  }
  if (x < 0.77) {
    const no = b.activeInvoiceNo(job);
    const inv = typeof no === 'string' && no ? b.getInvoice(no, { session: MANAGER }).invoice : null;
    const full = r() < 0.3;
    let req = { kind: 'FULL' };
    let stock = [];
    if (!full) {
      const ln = inv && inv.bill.lines.length ? 1 + Math.floor(r() * inv.bill.lines.length) : 1;
      const l = inv ? inv.bill.lines[ln - 1] : null;
      if (r() < 0.5 || !l) req = { kind: 'LINES', lines: [{ lineNo: ln, qty: 1 }] };
      else req = { kind: 'LINES', lines: [{ lineNo: ln, taxablePaise: 1 + Math.floor(r() * Math.max(1, l.taxablePaise)) }] };
      if (req.lines[0].qty && l && l.kind === 'PART' && r() < 0.7) stock = [{ lineNo: ln, qty: 1 }];
    } else if (inv && r() < 0.5) {
      stock = inv.stock.map((s) => ({ lineNo: s.lineNo, qty: inv.bill.lines[s.lineNo - 1].qty }));
    }
    return { name: 'cn', billing: true, res: b.issueCreditNote({ invoiceNo: inv ? inv.no : 'SV/2026-27/9999', mode: full ? 'FULL' : 'PARTIAL', reasonClass: 'RETURN', reason: 'property credit', request: req, stock }, ctx()) };
  }
  if (x < 0.82) {
    const rows = b.pendingCreditReturns({ session: MANAGER });
    if (!rows.ok || !rows.rows.length) return { name: 'cnret0', billing: false, res: { ok: true } };
    const row = pick(r, rows.rows);
    const st = cur.stock.jobStock(row.jobId);
    const inv = b.getInvoice(row.invoiceNo, { session: MANAGER }).invoice;
    const ids = inv.stock.find((s) => s.lineNo === row.lineNo).issues.map((i) => i.id);
    const mv = st.issues.find((i) => ids.includes(i.movementId) && i.outstanding > 0);
    if (!mv) return { name: 'cnret0', billing: false, res: { ok: true } };
    return { name: 'cnret', billing: false, res: cur.stock.returnFromJob({ jobId: row.jobId, creditNoteNo: row.cnNo, lines: [{ issueMovementId: mv.movementId, qty: 1, returnReason: 'UNUSED' }] }, ctxOf(cur, { s: MANAGER, pin: false })) };
  }
  if (x < 0.86) return { name: 'sheet', billing: true, res: b.issueNoChargeSheet({ jobId: job, labour: r() < 0.5 ? [{ code: 'L1', qty: 1 }] : [] }, ctx()) };
  if (x < 0.89) {
    const j = b.jobBilling(job, { session: MANAGER });
    return { name: 'sheetcancel', billing: true, res: b.cancelNoChargeSheet(j.ok && j.sheet ? j.sheet.id : 'INV-000999', 'property sheet cancel', ctx()) };
  }
  if (x < 0.92) return { name: 'void', billing: true, res: b.voidJob(job, 'property void', ctx()) };
  if (x < 0.94) return { name: 'cfg', billing: true, res: b.setBillingConfig({ discountLimitPaise: pick(r, [0, 500]) }, ctx()) };
  if (x < 0.95) {
    const k = r();
    if (k < 0.15) cur.clock.set('2027-03-31T18:29:50.000Z');
    else if (k < 0.3) cur.clock.set('2027-03-31T18:30:05.000Z');
    else cur.clock.advance(Math.floor(r() * 4 * 3600000));
    return { name: 'clock', billing: false, res: { ok: true } };
  }
  if (x < 0.97) {
    const n = makeStack({ clock: cur.clock, adapter: cur.adapter.copy(), jobs: cur.jobs, legacy: cur.legacy });
    Object.assign(cur, { stock: n.stock, money: n.money, bill: n.bill, store: n.store, adapter: n.adapter });
    return { name: 'reopen', billing: false, res: n.bill.open() };
  }
  return { name: 'adv', billing: false, res: cur.money.takeAdvance({ jobId: job, amountPaise: 100 * (1 + Math.floor(r() * 50)), payMode: 'Cash' }, ctxOf(cur, { s: OWNER, pin: false })) };
}

function snapshot(b) {
  const m = { session: MANAGER };
  return JSON.stringify([b.listInvoices({}, m), b.listCreditNotes({}, m), JOBS.map((j) => b.jobBilling(j, m)), b.pendingCcpt(m), b.unbilledIssues(m), b.config()]);
}

function invariants(cur, seed, trail) {
  const where = 'seed ' + seed + ' after ' + trail.slice(-6).join(' | ');
  const v = cur.store.verifyAll();
  assert.equal(v.ok, true, where + ' store ' + JSON.stringify(v));
  const recs = cur.store.read('invoices').records;
  // numbers: consecutive per series and year, from 0001, including cancelled bills
  const seen = {};
  for (const rec of recs) {
    const no = rec.b.no;
    if (typeof no !== 'string' || !/^(SV|SCN)\//.test(no)) continue;
    const m = /^(SV|SCN)\/([0-9-]+)\/(\d+)$/.exec(no);
    const k = m[1] + '|' + m[2];
    seen[k] = (seen[k] || 0) + 1;
    assert.equal(+m[3], seen[k], where + ' number gap ' + no);
  }
  const m = { session: MANAGER };
  const ccpt = {};
  for (const job of JOBS) {
    const jb = cur.bill.jobBilling(job, m);
    assert.equal(jb.ok, true, where);
    const active = jb.activeInvoice ? 1 : 0;
    const sheet = jb.sheet ? 1 : 0;
    assert.ok(active + sheet <= 1, where + ' bill and sheet on ' + job);
    // a fully credited bill is not live (P3 void rule: cancel or fully credit first), so a void may sit on top of it
    if (jb.voided) assert.equal((jb.activeInvoice && jb.activeInvoice.state !== 'CREDITED_FULLY' ? 1 : 0) + sheet, 0, where + ' voided with a live document');
    if (active || sheet) assert.equal(jb.outcomes.filter((o) => o.outcome === 'UNBILLED').length, 0, where + ' unbilled units on ' + job);
    if (active) {
      const i = jb.activeInvoice;
      assert.ok(i.balanceDuePaise >= 0, where);
      assert.ok(i.creditedPaise <= i.totalPaise, where + ' credits above the bill');
      if (!i.approvalOverride) assert.ok(i.totalPaise <= i.estimate.approvedPaise, where + ' bill above approval without override');
      if (i.ccptInvoiceNo) { assert.equal(ccpt[i.ccptInvoiceNo.toUpperCase()], undefined, where + ' CCPT number twice'); ccpt[i.ccptInvoiceNo.toUpperCase()] = 1; }
    }
  }
  const lim = [];
  for (const rec of recs) {
    if (rec.k === 'BCFG_SET') lim.push(rec.b.discountLimitPaise);
  }
  let limit = 0;
  for (const rec of recs) {
    if (rec.k === 'BCFG_SET') limit = rec.b.discountLimitPaise;
    if (rec.k === 'INV_ISSUE') {
      const b = rec.b;
      assert.equal(cur.bill.verifyCost(b.no, m).ok, true, where + ' cost ' + b.no);
      assert.equal(Calc.verifyBill(JSON.parse(JSON.stringify(b.bill))).ok, true, where + ' bill figures ' + b.no);
      assert.ok(b.balanceDuePaise >= 0);
      if (b.discount) {
        assert.notEqual(rec.a.t, 'staff', where + ' staff discount');
        if (b.discount.totalPaise > b.discount.limitPaise) assert.ok(rec.a.t === 'owner' && b.discount.pinAt !== null, where + ' discount above limit without owner pin');
      }
    }
    for (const pinAt of [rec.b.pinAt, rec.b.notInCcpt && rec.b.notInCcpt.pinAt, rec.b.approvalOverride && rec.b.approvalOverride.pinAt, rec.b.discount && rec.b.discount.totalPaise > rec.b.discount.limitPaise ? rec.b.discount.pinAt : null]) {
      if (typeof pinAt === 'number') {
        const d = Date.parse(rec.at) - pinAt;
        assert.ok(d >= 0 && d <= 120000, where + ' pin age ' + d + ' on ' + rec.k);
      }
    }
  }
  void lim; void limit;
}

function run(seed, steps = 60) {
  const { env, r } = setup(seed);
  const cur = env;
  const trail = [];
  env.openAll();
  for (let i = 0; i < steps; i += 1) {
    const before = cur.adapter.text();
    const revBefore = cur.store.head('invoices').rev;
    const a = act(cur, r);
    trail.push(a.name + ':' + (a.res && a.res.ok ? 'ok' : (a.res && a.res.code)));
    if (a.billing) {
      assert.equal(typeof a.res.ok, 'boolean', 'seed ' + seed);
      if (!a.res.ok) {
        assert.equal(typeof a.res.code, 'string');
        assert.ok(a.res.message && a.res.message.length > 8, 'seed ' + seed + ' ' + a.res.code);
        assert.equal(cur.adapter.text(), before, 'seed ' + seed + ' refusal changed storage after ' + trail.slice(-4).join(' | '));
      } else {
        const added = cur.store.head('invoices').rev - revBefore;
        assert.ok(added === 1 || (a.res.replayed === true && added === 0), 'seed ' + seed + ' ' + a.name + ' wrote ' + added + ' batches');
      }
    }
    invariants(cur, seed, trail);
    if (i % 10 === 9) {
      const fresh = makeStack({ clock: cur.clock, adapter: cur.adapter.copy(), jobs: cur.jobs, legacy: cur.legacy });
      assert.equal(snapshot(fresh.bill), snapshot(cur.bill), 'seed ' + seed + ' index differs from a fresh rebuild after ' + trail.slice(-4).join(' | '));
    }
  }
  return { text: cur.adapter.text(), trail };
}

test('55 property: seeds 1 to 200, 60 random steps each, every invariant after every step', () => {
  let bills = 0;
  let credits = 0;
  for (const seed of SEEDS) {
    const out = run(seed);
    bills += out.trail.filter((t) => t === 'bill:ok').length;
    credits += out.trail.filter((t) => t === 'cn:ok').length;
  }
  console.log('property run: ' + bills + ' bills and ' + credits + ' credit notes issued over ' + SEEDS.length + ' seeds');
  assert.ok(bills > 100, 'the run must really issue bills: ' + bills);
  assert.ok(credits > 20, 'the run must really issue credit notes: ' + credits);
});

test('55 determinism: the same seed gives byte-identical storage', () => {
  for (const seed of [3, 77, 150]) assert.equal(run(seed, 40).text, run(seed, 40).text);
});

test('56 concurrency: two instances over one storage, random interleaving; every outcome is success or a clean refusal; no double number', () => {
  const OK = new Set(['SVCS_REV_CONFLICT']);
  let conflicts = 0;
  let wins = 0;
  for (let seed = 1; seed <= 30; seed += 1) {
    const r = mulberry32(seed * 7919);
    const { env } = setup(seed);
    env.openAll();
    const other = makeStack({ clock: env.clock, adapter: env.adapter, jobs: env.jobs, legacy: env.legacy });
    other.bill.open();
    const insts = [env, other];
    for (let i = 0; i < 40; i += 1) {
      const cur = insts[r() < 0.5 ? 0 : 1];
      const job = pick(r, JOBS);
      const o = sessionFor(env, r);
      const x = r();
      let res;
      const ctx = ctxOf({ ref: env.ref, clock: env.clock }, o);
      if (x < 0.25) res = cur.bill.saveEstimate({ jobId: job, lines: [{ kind: 'LABOUR', code: 'L1', qty: 1 + Math.floor(r() * 3) }], reason: 'race change of quote' }, ctx);
      else if (x < 0.4) { const v = cur.bill.estimateView(job, { session: MANAGER }); res = cur.bill.recordApproval({ jobId: job, version: v.ok && v.version ? v.version : 1, method: 'CALL' }, ctx); }
      else if (x < 0.75) res = cur.bill.issueInvoice({ jobId: job, labour: [{ code: 'L1', qty: 1, discountPaise: 0 }], approvalOverrideReason: 'race override' }, ctx);
      else if (x < 0.9) { const no = cur.bill.activeInvoiceNo(job); res = cur.bill.cancelInvoice(typeof no === 'string' && no ? no : 'SV/2026-27/9999', 'race cancel', ctx); }
      else res = cur.bill.setBillingConfig({ discountLimitPaise: pick(r, [0, 200, 500]) }, ctx);
      if (res.ok) wins += 1;
      else {
        assert.equal(typeof res.code, 'string');
        if (res.code === 'SVCS_REV_CONFLICT') conflicts += 1;
        assert.ok(!res.code.startsWith('SVCS_') || OK.has(res.code), 'seed ' + seed + ' unexpected store failure ' + res.code);
      }
    }
    const recs = env.store.read('invoices').records;
    void recs;
    const fresh = makeStack({ clock: env.clock, adapter: env.adapter.copy(), jobs: env.jobs, legacy: env.legacy });
    assert.equal(fresh.store.verifyAll().ok, true, 'seed ' + seed);
    fresh.bill.open();
    const all = fresh.store.read('invoices').records;
    const seen = {};
    for (const rec of all) {
      if (typeof rec.b.no !== 'string' || !/^(SV|SCN)\//.test(rec.b.no)) continue;
      assert.equal(seen[rec.b.no], undefined, 'seed ' + seed + ' number twice ' + rec.b.no);
      seen[rec.b.no] = true;
    }
    const nos = Object.keys(seen).filter((n) => n.startsWith('SV/')).sort();
    nos.forEach((n, k) => assert.equal(+n.split('/')[2], k + 1, 'seed ' + seed + ' gap ' + n));
    for (const job of JOBS) {
      const jb = fresh.bill.jobBilling(job, { session: MANAGER });
      assert.equal(jb.ok, true);
      assert.ok((jb.activeInvoice ? 1 : 0) + (jb.sheet ? 1 : 0) <= 1, 'seed ' + seed + ' two live documents on ' + job);
    }
  }
  console.log('concurrency run: ' + wins + ' writes won, ' + conflicts + ' clean revision conflicts');
  assert.ok(wins > 50);
  void makeClock; void makeAdapter;
});
