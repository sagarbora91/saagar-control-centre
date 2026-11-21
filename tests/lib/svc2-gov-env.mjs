// tests/lib/svc2-gov-env.mjs
// The whole Service stack of wave 2 on one in-memory adapter that counts writes, for the governance tests:
// the REAL Phase 1 libraries and core, then the REAL billing calc, docs, money, migrate and facade (plan 2.9).
// Invented data only: no real customer name, mobile, GSTIN or PAN. The Owner PIN is never typed: the step-up time is set by hand.
// While a billing file is not written yet, makeBillingEnv() returns {waiting:[files]} and the tests say so.
import { createRequire } from 'node:module';
import path from 'node:path';
import { REPO, BILLING, exists } from './svc2-gov-common.mjs';
import { makeGovEnv, makeClock, makeAdapter, loadLibs, FAKE_CUSTOMER, FAKE_CUSTOMER_STRINGS, leakyJob, jsonOf, seedFlow } from './svc1-gov-env.mjs';

export { makeClock, makeAdapter, FAKE_CUSTOMER, FAKE_CUSTOMER_STRINGS, leakyJob, jsonOf };

const require = createRequire(import.meta.url);
const req = (f) => require(path.join(REPO, 'www', f));

export function billingMissing() { return BILLING.filter((f) => !exists(f.file)).map((f) => f.file); }

// Invented customer-bearing values for the privacy test. The GSTIN has an impossible state code (99), so it cannot be a real one.
export const FAKE_GSTIN = '99ZZZZZ9999Z9Z9';
export const FAKE_CUSTOMER_W2 = Object.freeze(Object.assign({}, FAKE_CUSTOMER, { custGstin: FAKE_GSTIN }));
export const FAKE_CUSTOMER_STRINGS_W2 = Object.freeze(FAKE_CUSTOMER_STRINGS.slice());

// Find a numeric field by name anywhere in an answer (the plan fixes names, not nesting, for several read shapes).
export function deepFind(v, name, depth = 0) {
  if (v === null || typeof v !== 'object' || depth > 8) return undefined;
  if (Object.prototype.hasOwnProperty.call(v, name)) return v[name];
  for (const k of Object.keys(v)) { const r = deepFind(v[k], name, depth + 1); if (r !== undefined) return r; }
  return undefined;
}

/**
 * jobs: { id: {id, status, invoiceNo, paymentStatus, stub, typedAdvancePaise ...} }
 * Returns {waiting:[...]} when a billing file is missing, otherwise the env.
 * env.core1 = Phase 1 core, env.bill = billing facade, env.as(session) sets the session the providers return,
 * env.pin(deltaMs) makes a PIN time `deltaMs` before now (0 = just now), env.noPin() clears it,
 * env.ctx(session, extra) is the Phase 1 test helper shape: it switches the session and the PIN time like the page would.
 */
export function makeBillingEnv({ jobs = {}, start, billingOptions = {}, adapter: givenAdapter, clock: givenClock, watermark = false } = {}) {
  const waiting = billingMissing();
  if (waiting.length) return { waiting };
  const p1 = loadLibs();
  const calc = req('service-billing-calc.js');
  const docsLib = req('service-billing-docs.js');
  const moneyLib = req('service-billing-money.js');
  const migrateLib = req('service-billing-migrate.js');
  const coreLib = req('service-billing-core.js');
  const clock = givenClock || makeClock(start);
  const adapter = givenAdapter || makeAdapter();
  let current = null;
  let pinAt = null;
  let shared = null;
  const cases = {
    get: (id) => (Object.prototype.hasOwnProperty.call(jobs, id) ? jobs[id] : null),
    legacyFloor: () => 0,
    legacyInput: () => null,
    list: () => Object.keys(jobs).map((k) => jobs[k])
  };
  const providers = { session: () => current, stepUpAt: () => pinAt };
  const made1 = p1.core.create({
    adapter, now: clock.now, cases, libs: { store: p1.store, fifo: p1.fifo, masters: p1.masters, docs: p1.docs },
    storeOptions: watermark ? undefined : { watermark: false }, session: providers.session, stepUpAt: providers.stepUpAt, share: (h) => { shared = h; }
  });
  if (!made1 || made1.ok !== true) throw new Error('phase 1 core.create failed: ' + JSON.stringify(made1));
  const madeB = coreLib.create(Object.assign({
    share: shared, calc, docsLib, moneyLib, migrateLib, masters: p1.masters, cases, now: clock.now, session: providers.session, stepUpAt: providers.stepUpAt
  }, billingOptions));
  const bill = madeB && madeB.ok === true && madeB.core ? madeB.core : madeB;
  const env = { libs: Object.assign({}, p1, { calc, docsLib, moneyLib, migrateLib, coreLib }), clock, adapter, cases, jobs, core: made1.core, core1: made1.core, bill, createResult: madeB, shared, refN: 0 };
  env.as = (session) => { current = session; return env; };
  env.pin = (deltaMs = 0) => { pinAt = clock.ms - deltaMs; return env; };
  env.noPin = () => { pinAt = null; return env; };
  env.stamp = (deltaMs = 0) => ({ ok: true, at: clock.ms + deltaMs });
  env.ctx = (session, extra) => {
    current = session;
    pinAt = extra && extra.stepUp && typeof extra.stepUp.at === 'number' ? extra.stepUp.at : null;
    const out = Object.assign({ clientRef: 'gov2-' + clock.ms + '-' + (env.refN += 1) }, extra || {});
    return out;
  };
  env.fingerprint = () => adapter.fingerprint();
  return env;
}

const must = (name, r) => { if (!r || r.ok !== true) throw new Error('seedBillingFlow ' + name + ' failed: ' + JSON.stringify(r)); return r; };

// Save an estimate for a job and record the customer approval of that exact version and amount. Returns the estimate total in paise.
export function estimateAndApprove(env, session, jobId, lines) {
  const B = env.bill;
  const est = must('saveEstimate ' + jobId, B.saveEstimate({ jobId, lines, recipientGstin: '', recipientStateCode: '27', reason: '', note: '' }, env.ctx(session)));
  const total = deepFind(deepFind(est, 'totals'), 'totalPaise');
  if (!Number.isInteger(total)) throw new Error('estimateAndApprove: no total in the saveEstimate answer: ' + JSON.stringify(est).slice(0, 200));
  must('recordApproval ' + jobId, B.recordApproval({ jobId, version: 1, method: 'IN_PERSON', takenByName: 'Invented Clerk', approvedAt: new Date(env.clock.ms).toISOString(), evidence: '', amountPaise: total, note: '' }, env.ctx(session)));
  return total;
}

/**
 * One of everything, in the plan shapes (2.7, 2.9): parts and labour with tax details, stock in, three jobs
 * (WS-2026-001 estimate, approval, advance, bill, balance, credit note, refund; WS-2026-002 bill then same-day cancel; WS-2026-003 void),
 * a counter sale with its receipt. Returns the ids it made. Throws a readable message at the first step that fails.
 */
export function seedBillingFlow(env, { owner, manager }) {
  const out = {};
  const B = env.bill;
  const x = (s, extra) => env.ctx(s, extra);
  const pin = () => ({ stepUp: env.stamp() });
  out.stock = seedFlow(env, { owner, manager });
  must('setConfig', B.setConfig({ discountLimitPaise: 0, billingRoles: ['Cashier'], estimateRoles: ['Technician', 'Assistant Technician'] }, x(owner, pin())));
  const est = must('saveEstimate', B.saveEstimate({ jobId: 'WS-2026-001', lines: [{ kind: 'PART', code: 'NEW-1', qty: 2 }, { kind: 'LABOUR', code: 'LAB-1', qty: 1 }], recipientGstin: '', recipientStateCode: '27', reason: '', note: 'first estimate' }, x(manager)));
  const total = deepFind(deepFind(est, 'totals'), 'totalPaise');
  if (!Number.isInteger(total)) throw new Error('seedBillingFlow: no totalPaise in the saveEstimate answer: ' + JSON.stringify(est).slice(0, 200));
  out.estimateTotalPaise = total;
  must('recordApproval', B.recordApproval({ jobId: 'WS-2026-001', version: 1, method: 'IN_PERSON', takenByName: 'Invented Clerk', approvedAt: new Date(env.clock.ms).toISOString(), evidence: '', amountPaise: total, note: '' }, x(manager)));
  out.advance = must('takeReceipt advance', B.takeReceipt({ jobId: 'WS-2026-001', kind: 'advance', amountPaise: 10000, payMode: 'Cash', payRef: '', note: '' }, x(manager)));
  const draft = must('prepareBill', B.prepareBill('WS-2026-001', x(manager)));
  const input = Object.assign({ mode: 'CCPT_BILLED', ccptInvoiceNo: 'CCPT-INV-0001', notInCcptReason: '', approvalOverrideReason: '', discountReason: '', billDiscountPaise: 0, note: '' }, draft.draft || draft.input || draft);
  input.jobId = 'WS-2026-001';
  out.bill = must('issueBill', B.issueBill(input, x(manager)));
  out.invoiceNo = deepFind(out.bill, 'invoiceNo') || deepFind(out.bill, 'no');
  const job = must('getJob', B.getJob('WS-2026-001', x(manager)));
  const due = deepFind(job, 'duePaise');
  if (Number.isInteger(due) && due > 0) must('takeReceipt balance', B.takeReceipt({ jobId: 'WS-2026-001', kind: 'balance', amountPaise: due, payMode: 'UPI', payRef: 'UPI-REF-1', note: '' }, x(manager)));
  out.credit = must('issueCreditNote', B.issueCreditNote({ invoiceNo: out.invoiceNo, mode: 'PARTIAL', reasonClass: 'PRICE', reason: 'invented price correction', request: { kind: 'LINES', lines: [{ lineNo: 2, taxablePaise: 1000 }] }, stock: [], note: '' }, x(owner, pin())));
  out.cnNo = deepFind(out.credit, 'no');
  out.refund = must('refund', B.refund({ jobId: 'WS-2026-001', cnNo: out.cnNo, amountPaise: 1000, payMode: 'Cash', payRef: '', reason: 'invented refund of the credit' }, x(owner, pin())));
  // job 2: bill and cancel the same day
  estimateAndApprove(env, manager, 'WS-2026-002', [{ kind: 'LABOUR', code: 'LAB-1', qty: 1 }]);
  const d2 = must('prepareBill 2', B.prepareBill('WS-2026-002', x(manager)));
  const in2 = Object.assign({ mode: 'CCPT_BILLED', ccptInvoiceNo: 'CCPT-INV-0002', notInCcptReason: '', approvalOverrideReason: '', discountReason: '', billDiscountPaise: 0, note: '' }, d2.draft || d2.input || d2);
  in2.jobId = 'WS-2026-002';
  out.bill2 = must('issueBill 2', B.issueBill(in2, x(owner, pin())));
  out.invoiceNo2 = deepFind(out.bill2, 'invoiceNo') || deepFind(out.bill2, 'no');
  out.cancel = must('cancelBill', B.cancelBill({ invoiceNo: out.invoiceNo2, reason: 'invented wrong bill' }, x(owner, pin())));
  // job 3: void (no parts, no money)
  out.voided = must('voidJob', B.voidJob({ jobId: 'WS-2026-003', reason: 'invented duplicate job' }, x(owner, pin())));
  // a counter sale made by this build (rcptDue) and its receipt
  const sale = must('counterSale', env.core1.counterSale({ lines: [{ partCode: 'NEW-1', qty: 1, unitPricePaise: 15000 }], payMode: 'CASH', ccptInvoiceNo: '', amountPaise: 15000, note: '' }, x(manager)));
  out.saleNo = sale.doc.no;
  out.counterReceipt = must('takeCounterReceipt', B.takeCounterReceipt({ saleNo: out.saleNo, amountPaise: 15000, payMode: 'Cash', payRef: '', note: '' }, x(manager)));
  return out;
}

// Jobs for the governance flows. Every job carries invented customer fields on purpose (a leak must show up in the privacy test).
//  001 main flow, 002 bill then cancel, 003 void, 004 open bill (cancel and credit probes), 005 void probe, 006 no-charge warranty job, 007 old typed advance,
//  008 to 010 spare jobs for the role tests
export function govJobs() {
  const j = (id, extra) => Object.assign(leakyJob(id), extra || {});
  return {
    'WS-2026-001': j('WS-2026-001'), 'WS-2026-002': j('WS-2026-002'), 'WS-2026-003': j('WS-2026-003'), 'WS-2026-004': j('WS-2026-004'),
    'WS-2026-005': j('WS-2026-005'), 'WS-2026-006': j('WS-2026-006', { paymentStatus: 'no_charge_warranty' }),
    'WS-2026-007': j('WS-2026-007', { typedAdvancePaise: 20000 }), 'WS-2026-008': j('WS-2026-008'), 'WS-2026-009': j('WS-2026-009'), 'WS-2026-010': j('WS-2026-010')
  };
}

/**
 * Live targets for every Owner PIN action, made after seedBillingFlow: an open bill (job 004), a no-charge sheet (job 006),
 * an undecided old advance (job 007), an unused job (job 005). Returns the ids.
 */
export function seedPinTargets(env, { owner, manager }) {
  const B = env.bill;
  const x = (s, extra) => env.ctx(s, extra);
  const out = {};
  estimateAndApprove(env, manager, 'WS-2026-004', [{ kind: 'LABOUR', code: 'LAB-1', qty: 1 }]);
  const d4 = must('prepareBill 4', B.prepareBill('WS-2026-004', x(manager)));
  const in4 = Object.assign({ mode: 'CCPT_BILLED', ccptInvoiceNo: 'CCPT-INV-0004', notInCcptReason: '', approvalOverrideReason: '', discountReason: '', billDiscountPaise: 0, note: '' }, d4.draft || d4.input || d4);
  in4.jobId = 'WS-2026-004';
  const bill4 = must('issueBill 4', B.issueBill(in4, x(manager)));
  out.invoiceNo4 = deepFind(bill4, 'invoiceNo') || deepFind(bill4, 'no');
  const sheet = must('issueNoChargeSheet', B.issueNoChargeSheet({ jobId: 'WS-2026-006', labour: [{ code: 'LAB-1', name: 'Invented service', qty: 1 }], note: '' }, x(manager)));
  out.sheetId = deepFind(sheet, 'sheetId') || deepFind(sheet, 'id');
  return out;
}

export { makeGovEnv, seedFlow };
