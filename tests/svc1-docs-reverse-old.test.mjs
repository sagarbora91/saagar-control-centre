// Service Stores docs layer: reversal, old / defective part register, monthly scrap sign-off.
// Real store, real FIFO, real masters. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Fifo, makeEnv, expectFail, expectOk, unchanged, OWNER, MANAGER, MANAGER2, KEEPER, CASHIER
} from './lib/svc1-docs-env.mjs';

const stdLine = (partCode, extra = {}) => ({ partCode, qtyReceived: 10, unitCostPaise: 1000, ...extra });
const ledger = (env) => env.store.read('ledger').records;
const defective = (env) => env.store.read('defective').records;
function withKeeper(env) {
  expectOk(env.docs.setConfig({ storeRoles: ['Assistant Technician'] }, env.ctxPin(OWNER)));
}

test('reverse GRN: Owner with PIN, one REV record, one reversal movement per line, stock gone, document shown as reversed', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2'] });
  env.clock.advance(1000);
  const g = env.grn([stdLine('P-1'), stdLine('P-2', { qtyReceived: 4, unitCostPaise: 2500 })]);
  expectFail(unchanged(env, () => env.docs.reverseDoc(g.doc.no, 'entered twice by mistake', env.ctx(MANAGER))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => env.docs.reverseDoc(g.doc.no, 'entered twice by mistake', env.ctx(OWNER))), 'PIN_REQUIRED');
  expectFail(unchanged(env, () => env.docs.reverseDoc(g.doc.no, 'abcd', env.ctxPin(OWNER))), 'REASON_REQUIRED');
  expectFail(unchanged(env, () => env.docs.reverseDoc(g.doc.no, undefined, env.ctxPin(OWNER))), 'REASON_REQUIRED');
  expectFail(unchanged(env, () => env.docs.reverseDoc('GRN/26-27/9999', 'entered twice by mistake', env.ctxPin(OWNER))), 'DOC_NOT_FOUND');
  expectFail(unchanged(env, () => env.docs.reverseDoc(null, 'entered twice by mistake', env.ctxPin(OWNER))), 'DOC_NOT_FOUND');
  env.clock.advance(1000);
  const n = ledger(env).length;
  const r = expectOk(env.docs.reverseDoc(g.doc.no, 'entered twice by mistake', env.ctxPin(OWNER)));
  assert.equal(ledger(env).length, n + 1);
  assert.equal(r.reversed, g.doc.no);
  assert.equal(r.doc.kind, 'REV');
  assert.equal(r.doc.no, '');
  assert.equal(r.doc.reverses, g.doc.no);
  assert.equal(r.doc.reason, 'entered twice by mistake');
  assert.equal(r.doc.pinAt, env.clock.ms());
  assert.equal(r.doc.lines.length, 2);
  assert.deepEqual(r.doc.lines.map((l) => l.movementId), [g.doc.mv[1].id, g.doc.mv[0].id], 'last line is undone first');
  r.doc.mv.forEach((m, i) => {
    assert.equal(m.type, 'reversal');
    assert.equal(m.reverses, r.doc.lines[i].movementId);
    assert.equal(m.valuePaise, -g.doc.mv.filter((x) => x.id === m.reverses)[0].valuePaise);
  });
  assert.equal(env.onHand('P-1'), 0);
  assert.equal(env.value('P-2'), 0);
  const view = env.docs.getDoc(g.doc.no).doc;
  assert.equal(view.state, 'REVERSED');
  assert.equal(view.reversedBy.reason, 'entered twice by mistake');
  assert.equal(view.reversedBy.id, r.doc.id);
  expectFail(unchanged(env, () => env.docs.reverseDoc(g.doc.no, 'entered twice by mistake', env.ctxPin(OWNER))), 'STATE_INVALID');
  // a restart sees the same truth
  const again = env.reopen();
  assert.equal(again.getDoc(g.doc.no).doc.state, 'REVERSED');
  assert.equal(Fifo.partBalance(again.fifoState(), 'P-1').qty, 0);
});

test('reverse GRN: refused when some of its stock was used; the document stays posted and storage is untouched', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  const g = env.grn([stdLine('P-1')]);
  env.issue('WS-1', [{ partCode: 'P-1', qty: 1 }]);
  const r = expectFail(unchanged(env, () => env.docs.reverseDoc(g.doc.no, 'entered twice by mistake', env.ctxPin(OWNER))), 'REVERSAL_BLOCKED');
  assert.equal(r.detail.fifoCode, 'LAYER_PARTLY_CONSUMED');
  assert.equal(r.detail.partCode, 'P-1');
  assert.equal(env.docs.getDoc(g.doc.no).doc.state, 'POSTED');
  assert.equal(env.onHand('P-1'), 9);
});

test('reverse GRN: a two-layer document is undone line by line, but one blocked line blocks the whole reversal', () => {
  // one part per line (a receipt refuses the same part twice, second pass DEF-4)
  const env = makeEnv({ parts: ['P-1', 'P-2', 'P-3'] });
  env.clock.advance(1000);
  const g = env.grn([stdLine('P-1'), stdLine('P-3', { unitCostPaise: 1700 }), stdLine('P-2')]);
  env.issue('WS-1', [{ partCode: 'P-2', qty: 1 }]);
  expectFail(unchanged(env, () => env.docs.reverseDoc(g.doc.no, 'wrong delivery', env.ctxPin(OWNER))), 'REVERSAL_BLOCKED');
  const before1 = env.onHand('P-1');
  const before3 = env.onHand('P-3');
  const h = env.grn([stdLine('P-1'), stdLine('P-3', { unitCostPaise: 1700 })]);
  expectOk(env.docs.reverseDoc(h.doc.no, 'wrong delivery', env.ctxPin(OWNER)));
  assert.equal(env.onHand('P-1'), before1);
  assert.equal(env.onHand('P-3'), before3);
  assert.ok(before1 > 0 && before3 > 0);
});

test('reverse ISS, RET and OPN: nobody can, the Owner included', () => {
  const env = makeEnv({ parts: ['P-1', 'P-2'] });
  env.clock.advance(1000);
  env.openingPosted([{ partCode: 'P-2', qty: 4, unitCostPaise: 300 }]);
  env.grn([stdLine('P-1')]);
  const i = env.issue('WS-1', [{ partCode: 'P-1', qty: 3 }]);
  const r = expectOk(env.docs.returnFromJob({ jobId: 'WS-1', lines: [{ issueMovementId: i.doc.mv[0].id, qty: 1, returnReason: 'UNUSED' }] }, env.ctx(MANAGER)));
  for (const no of [i.doc.no, r.doc.no, 'OPN/26-27/0001']) {
    for (const ctx of [env.ctxPin(OWNER), env.ctx(MANAGER)]) {
      const x = expectFail(unchanged(env, () => env.docs.reverseDoc(no, 'wrong entry made', ctx)), 'NOT_REVERSIBLE');
      assert.ok(x.detail.kind);
    }
  }
  assert.equal(env.docs.can('REVERSE_ISSUE', OWNER).code, 'NOT_REVERSIBLE');
});

test('reverse counter sale: Manager the same India day without a PIN; later only the Owner, with a PIN', () => {
  const env = makeEnv({ parts: ['P-1'], saleable: ['P-1'], start: '2026-11-13T05:00:00.000Z' });
  env.clock.advance(1000);
  env.grn([stdLine('P-1', { qtyReceived: 20 })]);
  const sale = (qty = 2) => expectOk(env.docs.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P-1', qty, unitPricePaise: 1500 }] }, env.ctx(MANAGER)));
  const a = sale();
  assert.equal(env.onHand('P-1'), 18);
  expectFail(unchanged(env, () => env.docs.reverseDoc(a.doc.no, 'sold wrong part', env.ctx(CASHIER))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => env.docs.reverseDoc(a.doc.no, 'sold wrong part', env.ctx(KEEPER))), 'NOT_ALLOWED');
  const ra = expectOk(env.docs.reverseDoc(a.doc.no, 'sold wrong part', env.ctx(MANAGER)));
  assert.equal(ra.doc.pinAt, null);
  assert.equal(env.onHand('P-1'), 20);
  assert.equal(env.docs.getDoc(a.doc.no).doc.state, 'REVERSED');
  // the Owner the same day: no PIN needed either
  const b = sale(3);
  expectOk(env.docs.reverseDoc(b.doc.no, 'customer changed mind', env.ctx(OWNER)));
  // an older sale
  const c = sale(1);
  env.clock.set('2026-11-14T05:00:00.000Z');
  expectFail(unchanged(env, () => env.docs.reverseDoc(c.doc.no, 'found a mistake today', env.ctx(MANAGER))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => env.docs.reverseDoc(c.doc.no, 'found a mistake today', env.ctx(OWNER))), 'PIN_REQUIRED');
  const rc = expectOk(env.docs.reverseDoc(c.doc.no, 'found a mistake today', env.ctxPin(OWNER)));
  assert.equal(rc.doc.pinAt, env.clock.ms());
  assert.equal(env.onHand('P-1'), 20);
});

test('reverse counter sale: the India day, not the UTC day, decides "same day"', () => {
  // 18:00 UTC on the 13th is 23:30 India time on the 13th; 18:40 UTC is 00:10 India time on the 14th
  const env = makeEnv({ parts: ['P-1'], saleable: ['P-1'], start: '2026-11-13T17:00:00.000Z' });
  env.grn([stdLine('P-1', { qtyReceived: 20 })]);
  env.clock.set('2026-11-13T18:00:00.000Z');
  const a = expectOk(env.docs.counterSale({ payMode: 'CASH', lines: [{ partCode: 'P-1', qty: 1, unitPricePaise: 100 }] }, env.ctx(MANAGER)));
  assert.equal(a.doc.docDate, '2026-11-13');
  env.clock.set('2026-11-13T18:40:00.000Z');
  expectFail(unchanged(env, () => env.docs.reverseDoc(a.doc.no, 'next morning in India', env.ctx(MANAGER))), 'NOT_ALLOWED');
  env.clock.set('2026-11-13T18:20:00.000Z');
  // (clock moved back a little: clamped, still the same India day 23:50)
  expectOk(env.docs.reverseDoc(a.doc.no, 'still the same day here', env.ctx(MANAGER)));
});

test('reverse adjustment: Owner with PIN; up and down are both undone; a used up-layer blocks it', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  env.grn([stdLine('P-1')]);
  const up = expectOk(env.docs.proposeAdjustment({ lines: [{ partCode: 'P-1', qtyDelta: 4, reason: 'FOUND' }], note: 'found a box' }, env.ctx(MANAGER)));
  const upDoc = expectOk(env.docs.approveAdjustment(up.proposalId, env.ctxPin(OWNER)));
  assert.equal(env.onHand('P-1'), 14);
  expectFail(unchanged(env, () => env.docs.reverseDoc(upDoc.doc.no, 'found by mistake', env.ctx(MANAGER))), 'NOT_ALLOWED');
  expectOk(env.docs.reverseDoc(upDoc.doc.no, 'found by mistake', env.ctxPin(OWNER)));
  assert.equal(env.onHand('P-1'), 10);
  const down = expectOk(env.docs.proposeAdjustment({ lines: [{ partCode: 'P-1', qtyDelta: -3, reason: 'LOST' }], note: 'cannot find them' }, env.ctx(MANAGER)));
  const downDoc = expectOk(env.docs.approveAdjustment(down.proposalId, env.ctxPin(OWNER)));
  assert.equal(env.onHand('P-1'), 7);
  expectOk(env.docs.reverseDoc(downDoc.doc.no, 'found them again', env.ctxPin(OWNER)));
  assert.equal(env.onHand('P-1'), 10);
  assert.equal(env.value('P-1'), 10000);
  // an up-adjustment whose layer was used cannot be undone
  const up2 = expectOk(env.docs.proposeAdjustment({ lines: [{ partCode: 'P-1', qtyDelta: 20, reason: 'FOUND' }], note: 'found more' }, env.ctx(MANAGER)));
  const up2Doc = expectOk(env.docs.approveAdjustment(up2.proposalId, env.ctxPin(OWNER)));
  env.issue('WS-1', [{ partCode: 'P-1', qty: 25 }]);
  expectFail(unchanged(env, () => env.docs.reverseDoc(up2Doc.doc.no, 'found by mistake', env.ctxPin(OWNER))), 'REVERSAL_BLOCKED');
});

test('reversing a receipt that settled an Owner override shortfall re-opens the shortfall, the same after a restart', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  env.grn([stdLine('P-1', { qtyReceived: 2 })]);
  const o = expectOk(env.docs.issueToJob({ jobId: 'WS-1', note: 'shelf has it, book does not', lines: [{ partCode: 'P-1', qty: 5, allowNegative: true }] }, env.ctxPin(OWNER)));
  assert.deepEqual(o.doc.lines[0].override, { by: 'Test Owner', note: 'shelf has it, book does not' });
  assert.ok(o.warnings.includes('NEGATIVE_OVERRIDE_USED'));
  assert.equal(env.onHand('P-1'), -3);
  const g = env.grn([stdLine('P-1', { qtyReceived: 3, unitCostPaise: 1200 })]);
  assert.equal(env.onHand('P-1'), 0);
  expectOk(env.docs.reverseDoc(g.doc.no, 'wrong delivery', env.ctxPin(OWNER)));
  assert.equal(env.onHand('P-1'), -3, 'the shortfall is open again');
  const again = env.reopen();
  assert.equal(Fifo.partBalance(again.fifoState(), 'P-1').qty, -3);
});

// ---------------------------------------------------------------------------------------------- old parts

function reg(env, extra = {}, session = MANAGER) {
  return env.docs.registerOldPart({ jobId: 'WS-1', partText: 'old crown', qty: 1, state: 'HELD_FOR_CLAIM', ...extra }, env.ctx(session));
}

test('old parts: register into each of the three start states, labels and bins are exact', () => {
  const env = makeEnv({ parts: ['P-1'], start: '2026-11-13T05:00:00.000Z' });
  env.clock.advance(1000);
  const a = expectOk(reg(env, { state: 'HELD_FOR_CLAIM', claimRef: 'CL-1', serialRef: 'SN 12', note: 'dead' }));
  assert.equal(a.row.no, 'OLD/26-27/0001');
  assert.equal(a.row.state, 'HELD_FOR_CLAIM');
  assert.equal(a.row.stateLabel, 'Held for claim');
  assert.equal(a.row.bin, 'CLAIM');
  assert.equal(a.row.claimRef, 'CL-1');
  assert.equal(a.row.serialRef, 'SN 12');
  assert.equal(a.row.jobId, 'WS-1');
  assert.equal(a.row.partText, 'old crown');
  assert.equal(a.row.scrapMonth, '');
  const b = expectOk(reg(env, { state: 'CUSTOMER_RETURNED', partCode: 'p-1', partText: '' }));
  assert.equal(b.row.stateLabel, 'Customer Returned');
  assert.equal(b.row.bin, '');
  assert.equal(b.row.partCode, 'P-1');
  assert.equal(b.row.returnedOn, '2026-11-13');
  const c = expectOk(reg(env, { state: 'SCRAP_PENDING' }));
  assert.equal(c.row.stateLabel, 'Scrap pending Owner sign-off');
  assert.equal(c.row.bin, 'SCRAP');
  assert.equal(c.row.scrapMonth, '2026-11');
  assert.equal(c.row.no, 'OLD/26-27/0003');
  expectFail(unchanged(env, () => reg(env, { state: 'SCRAPPED' })), 'OLD_TRANSITION_INVALID');
  expectFail(unchanged(env, () => reg(env, { state: 'GONE' })), 'OLD_TRANSITION_INVALID');
  const rec = defective(env)[0];
  assert.equal(rec.k, 'OLD_REGISTER');
  assert.equal(rec.b.no, a.row.no);
  assert.equal(JSON.stringify(rec).toLowerCase().includes('returnedto'), false);
});

test('old parts: register refusals; a closed job is allowed; a store role registers but cannot move', () => {
  const env = makeEnv({
    parts: ['P-1'],
    jobs: [['WS-1', { id: 'WS-1', status: 'open', invoiceNo: '', paymentStatus: 'pending', stub: false }], ['WS-C', { id: 'WS-C', status: 'closed', invoiceNo: 'SV/2026-27/0001', paymentStatus: 'paid', stub: false }]]
  });
  env.clock.advance(1000);
  expectFail(unchanged(env, () => reg(env, {}, CASHIER)), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => reg(env, {}, KEEPER)), 'NOT_ALLOWED');
  withKeeper(env);
  const k = expectOk(reg(env, { jobId: 'WS-C' }, KEEPER));
  assert.equal(k.row.jobId, 'WS-C');
  expectFail(unchanged(env, () => env.docs.moveOldPart(k.row.no, { to: 'SCRAP_PENDING', note: 'beyond repair' }, env.ctx(KEEPER))), 'NOT_ALLOWED');
  expectFail(unchanged(env, () => reg(env, { jobId: 'NOPE' })), 'JOB_NOT_FOUND');
  expectFail(unchanged(env, () => reg(env, { partText: '', partCode: '' })), 'INPUT_INVALID');
  expectFail(unchanged(env, () => reg(env, { partText: undefined })), 'INPUT_INVALID');
  expectFail(unchanged(env, () => reg(env, { partCode: 'NOPE' })), 'PART_UNKNOWN');
  expectFail(unchanged(env, () => reg(env, { partText: 'x'.repeat(61) })), 'INPUT_INVALID');
  expectFail(unchanged(env, () => reg(env, { serialRef: 'x'.repeat(41) })), 'INPUT_INVALID');
  expectFail(unchanged(env, () => reg(env, { claimRef: 'x'.repeat(41) })), 'INPUT_INVALID');
  expectFail(unchanged(env, () => reg(env, { note: 'x'.repeat(201) })), 'INPUT_INVALID');
  for (const qty of [0, 1.5, 100001, '2', undefined]) expectFail(unchanged(env, () => reg(env, { qty })), 'QTY_INVALID');
  // no job given is allowed (a loose part), a part code with no text is allowed, text with no code is allowed
  expectOk(reg(env, { jobId: '' }));
  expectOk(reg(env, { jobId: undefined, partText: '', partCode: 'P-1' }));
  // old parts never touch the stock ledger
  assert.equal(ledger(env).length, 0);
  assert.equal(env.docs.status().lastSeq, 0);
});

test('old parts: moves follow the table, notes are needed where required, terminal states stay put, history keeps every step', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  const a = expectOk(reg(env, { state: 'HELD_FOR_CLAIM' })).row;
  const mv = (to, note = '', claimRef = '', session = MANAGER) => env.docs.moveOldPart(a.no, { to, note, claimRef }, env.ctx(session));
  expectFail(unchanged(env, () => mv('SCRAP_PENDING', 'abcd')), 'OLD_NOTE_REQUIRED');
  expectFail(unchanged(env, () => mv('SCRAP_PENDING', '')), 'OLD_NOTE_REQUIRED');
  expectFail(unchanged(env, () => mv('SCRAPPED', 'sign-off is monthly', '', OWNER)), 'OLD_TRANSITION_INVALID');
  expectFail(unchanged(env, () => mv('HELD_FOR_CLAIM', 'same state again')), 'OLD_TRANSITION_INVALID');
  expectFail(unchanged(env, () => mv('NOWHERE', 'bad target')), 'OLD_TRANSITION_INVALID');
  expectFail(unchanged(env, () => mv('SCRAP_PENDING', 'claim rejected by Titan', 'c'.repeat(41))), 'INPUT_INVALID');
  expectFail(unchanged(env, () => env.docs.moveOldPart('OLD/26-27/0099', { to: 'SCRAP_PENDING', note: 'claim rejected' }, env.ctx(MANAGER))), 'OLD_NOT_FOUND');
  expectFail(unchanged(env, () => env.docs.moveOldPart(7, { to: 'SCRAP_PENDING', note: 'claim rejected' }, env.ctx(MANAGER))), 'OLD_NOT_FOUND');
  expectFail(unchanged(env, () => env.docs.moveOldPart(a.no, null, env.ctx(MANAGER))), 'INPUT_INVALID');
  env.clock.advance(1000);
  const s1 = expectOk(mv('SCRAP_PENDING', 'claim rejected by Titan', 'CL-9'));
  assert.equal(s1.row.state, 'SCRAP_PENDING');
  assert.equal(s1.row.bin, 'SCRAP');
  assert.equal(s1.row.scrapMonth, '2026-11');
  assert.equal(s1.row.claimRef, 'CL-9');
  env.clock.advance(1000);
  const back = expectOk(mv('HELD_FOR_CLAIM', 'claim reopened after call'));
  assert.equal(back.row.bin, 'CLAIM');
  assert.equal(back.row.claimRef, 'CL-9', 'an empty claim ref keeps the old one');
  env.clock.advance(1000);
  expectOk(mv('SCRAP_PENDING', 'claim rejected again'));
  env.clock.advance(1000);
  const ret = expectOk(mv('CUSTOMER_RETURNED', ''));
  assert.equal(ret.row.stateLabel, 'Customer Returned');
  assert.equal(ret.row.returnedOn, '2026-11-13');
  assert.deepEqual(ret.row.history.map((h) => [h.from, h.to]), [['', 'HELD_FOR_CLAIM'], ['HELD_FOR_CLAIM', 'SCRAP_PENDING'], ['SCRAP_PENDING', 'HELD_FOR_CLAIM'], ['HELD_FOR_CLAIM', 'SCRAP_PENDING'], ['SCRAP_PENDING', 'CUSTOMER_RETURNED']]);
  assert.equal(ret.row.history[1].by.name, 'Test Manager');
  assert.equal(ret.row.rev, 5);
  // terminal
  for (const to of ['HELD_FOR_CLAIM', 'SCRAP_PENDING', 'CUSTOMER_RETURNED']) expectFail(unchanged(env, () => mv(to, 'try to move on again')), 'OLD_TRANSITION_INVALID');
  // held directly to customer returned needs no note
  const b = expectOk(reg(env, { partText: 'old strap', state: 'HELD_FOR_CLAIM' })).row;
  expectOk(env.docs.moveOldPart(b.no, { to: 'CUSTOMER_RETURNED' }, env.ctx(OWNER)));
  // the register and its filters
  assert.equal(env.docs.oldRegister().rows.length, 2);
  assert.equal(env.docs.oldRegister({ state: 'CUSTOMER_RETURNED' }).rows.length, 2);
  assert.equal(env.docs.oldRegister({ state: 'HELD_FOR_CLAIM' }).rows.length, 0);
  assert.equal(env.docs.oldRegister({ jobId: 'WS-1' }).rows.length, 2);
  assert.equal(env.docs.oldRegister({ jobId: 'WS-9' }).rows.length, 0);
});

test('old parts: OLD numbers restart on 1 April', () => {
  const env = makeEnv({ parts: ['P-1'], start: '2027-03-31T05:00:00.000Z' });
  assert.equal(expectOk(reg(env)).row.no, 'OLD/26-27/0001');
  assert.equal(expectOk(reg(env)).row.no, 'OLD/26-27/0002');
  env.clock.set('2027-04-02T05:00:00.000Z');
  assert.equal(expectOk(reg(env)).row.no, 'OLD/27-28/0001');
});

test('scrap sign-off: Owner with PIN, only after the month ended, only pending rows, all or none, one record', () => {
  const env = makeEnv({ parts: ['P-1'], start: '2026-10-20T05:00:00.000Z' });
  const s1 = expectOk(reg(env, { state: 'SCRAP_PENDING', partText: 'old crown' })).row;
  const s2 = expectOk(reg(env, { state: 'SCRAP_PENDING', partText: 'old strap' })).row;
  const held = expectOk(reg(env, { state: 'HELD_FOR_CLAIM', partText: 'old glass' })).row;
  env.clock.set('2026-11-05T05:00:00.000Z');
  const s3 = expectOk(reg(env, { state: 'SCRAP_PENDING', partText: 'old pusher' })).row;
  assert.equal(s3.scrapMonth, '2026-11');
  const call = (input, ctx) => unchanged(env, () => env.docs.signOffScrap(input, ctx));
  expectFail(call({ month: '2026-10', oldNos: [s1.no], note: 'monthly' }, env.ctxPin(MANAGER)), 'NOT_ALLOWED');
  expectFail(call({ month: '2026-10', oldNos: [s1.no], note: 'monthly' }, env.ctx(OWNER)), 'PIN_REQUIRED');
  expectFail(call({ month: '2026-11', oldNos: [s3.no], note: 'monthly' }, env.ctxPin(OWNER)), 'SIGNOFF_MONTH_OPEN');
  expectFail(call({ month: '2026-12', oldNos: [s3.no], note: 'monthly' }, env.ctxPin(OWNER)), 'SIGNOFF_MONTH_OPEN');
  expectFail(call({ month: '2026-13', oldNos: [s1.no] }, env.ctxPin(OWNER)), 'INPUT_INVALID');
  expectFail(call({ month: 'Oct', oldNos: [s1.no] }, env.ctxPin(OWNER)), 'INPUT_INVALID');
  expectFail(call({ month: '2026-10', oldNos: [] }, env.ctxPin(OWNER)), 'SIGNOFF_EMPTY');
  expectFail(call({ month: '2026-10' }, env.ctxPin(OWNER)), 'SIGNOFF_EMPTY');
  // a row that is not waiting, an unknown row, a row from a later month, a repeated row: nothing is written
  expectFail(call({ month: '2026-10', oldNos: [s1.no, held.no] }, env.ctxPin(OWNER)), 'OLD_TRANSITION_INVALID');
  expectFail(call({ month: '2026-10', oldNos: [s1.no, s3.no] }, env.ctxPin(OWNER)), 'OLD_TRANSITION_INVALID');
  expectFail(call({ month: '2026-10', oldNos: [s1.no, s1.no] }, env.ctxPin(OWNER)), 'OLD_TRANSITION_INVALID');
  expectFail(call({ month: '2026-10', oldNos: [s1.no, 'OLD/26-27/0099'] }, env.ctxPin(OWNER)), 'OLD_NOT_FOUND');
  expectFail(call({ month: '2026-10', oldNos: [s1.no], note: 'n'.repeat(201) }, env.ctxPin(OWNER)), 'INPUT_INVALID');
  assert.equal(env.docs.oldRegister({ state: 'SCRAP_PENDING' }).rows.length, 3);
  // a subset leaves the others pending
  const dBefore = defective(env).length;
  const so = expectOk(env.docs.signOffScrap({ month: '2026-10', oldNos: [s1.no], note: 'October scrap' }, env.ctxPin(OWNER)));
  assert.equal(defective(env).length, dBefore + 1, 'one record for the whole sign-off');
  assert.equal(so.signoff.no, 'SCR/26-27/0001');
  assert.equal(so.signoff.count, 1);
  assert.equal(so.signoff.month, '2026-10');
  assert.equal(so.signoff.pinAt, env.clock.ms());
  assert.equal(so.rows[0].state, 'SCRAPPED');
  assert.equal(so.rows[0].stateLabel, 'Scrapped');
  assert.equal(so.rows[0].signoffNo, 'SCR/26-27/0001');
  assert.equal(so.rows[0].bin, '');
  const rec = defective(env)[defective(env).length - 1];
  assert.equal(rec.k, 'SCRAP_SIGNOFF');
  assert.deepEqual(rec.b.oldNos, [s1.no]);
  assert.equal(env.docs.oldRegister({ state: 'SCRAP_PENDING' }).rows.length, 2);
  // grouped by month in pending()
  const pend = env.docs.pending().scrapPending;
  assert.deepEqual(pend.map((r) => r.scrapMonth), ['2026-10', '2026-11', '2026-11'].slice(0, pend.length));
  const groups = env.docs.pending().scrapGroups;
  assert.deepEqual(groups.map((g) => [g.month, g.count]), [['2026-10', 1], ['2026-11', 1]]);
  assert.equal(groups[0].rows[0].no, s2.no);
  assert.equal(env.docs.oldRegister({ month: '2026-11' }).rows.length, 1);
  // the second sign-off for the same month takes the rest of October
  const so2 = expectOk(env.docs.signOffScrap({ month: '2026-10', oldNos: [s2.no] }, env.ctxPin(OWNER)));
  assert.equal(so2.signoff.no, 'SCR/26-27/0002');
  // a scrapped row cannot be signed twice or moved
  expectFail(call({ month: '2026-10', oldNos: [s1.no] }, env.ctxPin(OWNER)), 'OLD_TRANSITION_INVALID');
  expectFail(unchanged(env, () => env.docs.moveOldPart(s1.no, { to: 'HELD_FOR_CLAIM', note: 'bring it back' }, env.ctxPin(OWNER))), 'OLD_TRANSITION_INVALID');
  assert.equal(env.docs.listSignoffs().signoffs.length, 2);
  // a restart reads the same rows
  const again = env.reopen();
  assert.equal(again.oldRegister({ state: 'SCRAPPED' }).rows.length, 2);
  assert.equal(again.oldRegister({ state: 'SCRAP_PENDING' }).rows.length, 1);
  // a held row moved to scrap-pending in November is signed off in December only
  env.clock.set('2026-12-02T05:00:00.000Z');
  expectOk(env.docs.signOffScrap({ month: '2026-11', oldNos: [s3.no] }, env.ctxPin(OWNER)));
});

test('scrap sign-off: retry with the same clientRef returns the saved sign-off', () => {
  const env = makeEnv({ parts: ['P-1'], start: '2026-10-20T05:00:00.000Z' });
  const s1 = expectOk(reg(env, { state: 'SCRAP_PENDING' })).row;
  env.clock.set('2026-11-05T05:00:00.000Z');
  const ctx = env.ctxPin(OWNER, { clientRef: 'svs-sign-1' });
  const a = expectOk(env.docs.signOffScrap({ month: '2026-10', oldNos: [s1.no] }, ctx));
  const b = unchanged(env, () => env.docs.signOffScrap({ month: '2026-10', oldNos: [s1.no] }, ctx));
  assert.equal(b.replayed, true);
  assert.equal(b.signoff.no, a.signoff.no);
});

test('old part registration and moves: retry with the same clientRef does not repeat', () => {
  const env = makeEnv({ parts: ['P-1'] });
  env.clock.advance(1000);
  const ctx = env.ctx(MANAGER, { clientRef: 'svs-old-1' });
  const a = expectOk(env.docs.registerOldPart({ jobId: 'WS-1', partText: 'old crown', qty: 1, state: 'HELD_FOR_CLAIM' }, ctx));
  const b = unchanged(env, () => env.docs.registerOldPart({ jobId: 'WS-1', partText: 'old crown', qty: 1, state: 'HELD_FOR_CLAIM' }, ctx));
  assert.equal(b.replayed, true);
  assert.equal(b.row.no, a.row.no);
  const mctx = env.ctx(MANAGER, { clientRef: 'svs-old-2' });
  expectOk(env.docs.moveOldPart(a.row.no, { to: 'CUSTOMER_RETURNED' }, mctx));
  const m2 = unchanged(env, () => env.docs.moveOldPart(a.row.no, { to: 'CUSTOMER_RETURNED' }, mctx));
  assert.equal(m2.replayed, true);
  assert.equal(env.docs.oldRegister().rows[0].history.length, 2);
});

test('masters deps: a never-used part can be removed by the Owner; a part with movements or proposals cannot', () => {
  const env = makeEnv({ parts: ['P-USED', 'P-PROP', 'P-FREE', 'P-OLD'] });
  env.clock.advance(1000);
  env.grn([stdLine('P-USED')]);
  expectOk(env.docs.proposeOpening({ lines: [{ partCode: 'P-PROP', qty: 1, unitCostPaise: 5 }] }, env.ctx(MANAGER)));
  expectOk(reg(env, { partText: '', partCode: 'P-OLD' }));
  const deps = env.docs.mastersDeps();
  assert.equal(deps.hasMovements('P-USED'), true);
  assert.equal(deps.hasMovements('P-FREE'), false);
  assert.equal(deps.hasMovements('bad code!'), true, 'unclear answers fail closed');
  assert.equal(deps.isReferenced('part', 'P-PROP'), true);
  assert.equal(deps.isReferenced('part', 'P-OLD'), true);
  assert.equal(deps.isReferenced('part', 'P-FREE'), false);
  assert.equal(deps.isReferenced('labour', 'L-1'), false);
  assert.equal(deps.isReferenced('mystery', 'X'), true);
  assert.equal(deps.onHand('P-USED'), 10);
  const M = env.mctx(OWNER);
  const rm = (code) => Masters_removeUnused(env, code);
  assert.equal(rm('P-USED').code, 'HAS_MOVEMENTS');
  assert.equal(rm('P-PROP').code, 'HAS_REFERENCES');
  assert.equal(rm('P-OLD').code, 'HAS_REFERENCES');
  assert.equal(rm('P-FREE').ok, true);
  assert.ok(M);
});
import { Masters } from './lib/svc1-docs-env.mjs';
function Masters_removeUnused(env, code) {
  const ctx = { session: OWNER, stepUp: env.pin(), clientRef: env.ref(), now: env.clock.now };
  return Masters.removeUnused(env.store, ctx, 'part', code, 'never used part removed', env.docs.mastersDeps());
}

test('scrap sign-off: more than 100 rows in one sign-off is refused before anything else', () => {
  const env = makeEnv({ parts: ['P-1'], start: '2026-11-20T05:00:00.000Z' });
  const names = Array.from({ length: 101 }, (_, i) => 'OLD/26-27/' + String(i + 1).padStart(4, '0'));
  expectFail(unchanged(env, () => env.docs.signOffScrap({ month: '2026-10', oldNos: names }, env.ctxPin(OWNER))), 'TOO_MANY_LINES');
});
