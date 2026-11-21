// Service Stores UI (wave 1, group ui): pure logic. Money, quantities, rights, error text, part ranking.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadUi, SESS } from './lib/svc1-ui-harness.mjs';
import { SESSIONS, BROKEN } from './lib/fix-s15-role-table.mjs';

const { ui } = loadUi();
const I = ui.internals;
const P = (o) => JSON.parse(JSON.stringify(o));

test('L1 parsePaise: exact integer paise, no float error, strict shapes', () => {
  const ok = { '12': 1200, '12.5': 1250, '12.50': 1250, '1,234.5': 123450, ' 7 ': 700, 'Rs 99': 9900, 'rs. 5': 500, '₹ 3.25': 325, '0.05': 5, '19.99': 1999, '9999999.99': 999999999 };
  for (const k of Object.keys(ok)) assert.deepEqual(P(I.parsePaise(k)), { ok: true, paise: ok[k] }, k);
  for (const bad of ['12.345', '-1', 'abc', '1e3', '', '   ', '10000000', '1.', '.5', '1,2,3.456', 'Rs', '0']) {
    const r = I.parsePaise(bad);
    assert.equal(r.ok, false, bad);
    assert.equal(r.code, 'SVS_MONEY_INVALID');
  }
  assert.deepEqual(P(I.parsePaise('0', { allowZero: true })), { ok: true, paise: 0 });
  assert.deepEqual(P(I.parsePaise('0.00', { allowZero: true })), { ok: true, paise: 0 });
  for (let i = 0; i < 2000; i++) {
    const rupees = (i * 7919) % 100000;
    const cents = (i * 31) % 100;
    const txt = rupees + '.' + String(cents).padStart(2, '0');
    assert.equal(I.parsePaise(txt, { allowZero: true }).paise, rupees * 100 + cents, txt);
  }
});

test('L2 money(): Indian grouping, two decimals, dash for null', () => {
  const t = { 0: 'Rs 0.00', 5: 'Rs 0.05', 100: 'Rs 1.00', 123456: 'Rs 1,234.56', 12345678: 'Rs 1,23,456.78', 99999999: 'Rs 9,99,999.99', 100000000: 'Rs 10,00,000.00', 1234567890: 'Rs 1,23,45,678.90' };
  for (const k of Object.keys(t)) assert.equal(I.money(Number(k)), t[k], k);
  assert.equal(I.money(-250), '-Rs 2.50');
  assert.equal(I.money(null), '-');
  assert.equal(I.money(undefined), '-');
  assert.equal(I.money(NaN), '-');
  assert.equal(I.money(1.5), '-');
  assert.equal(I.money('100'), '-');
});

test('L3 parseQty: bounds and shapes', () => {
  assert.deepEqual(P(I.parseQty('1')), { ok: true, qty: 1 });
  assert.deepEqual(P(I.parseQty(' 100000 ')), { ok: true, qty: 100000 });
  assert.deepEqual(P(I.parseQty('0', { min: 0 })), { ok: true, qty: 0 });
  for (const bad of ['0', '100001', '1.5', '-1', '1e2', '', 'x', '1234567']) assert.equal(I.parseQty(bad).ok, false, bad);
  const r = I.parseQty('9', { min: 1, max: 5 });
  assert.deepEqual(P([r.ok, r.code, r.min, r.max]), [false, 'SVS_QTY_INVALID', 1, 5]);
  assert.equal(I.errorText(r), 'Enter a whole number from 1 to 5.');
});

test('L4 rightsFor: the 10 shell sessions and the 5 broken ones against the role table', () => {
  const sessionOf = (read) => ({ ok: true, isOwner: read.isOwner === true, isManager: read.isManager === true, role: read.role, tier: read.isOwner ? 'owner' : (read.isManager ? 'manager' : 'staff'), actorName: 'x' });
  for (const s of SESSIONS) {
    const R = I.rightsFor(sessionOf(s.read), { adjustLimitPaise: 0, storeRoles: [] });
    if (s.read.isOwner) {
      assert.equal(R.tier, 'owner', s.name);
      for (const k of ['viewQty', 'viewCost', 'viewLedger', 'editMasters', 'openingPost', 'receive', 'issue', 'returnPart', 'counterSale', 'proposeAdj', 'approveAdj', 'reverseDoc', 'oldPartRegister', 'oldPartMove', 'scrapSignoff', 'settings', 'acknowledge', 'override']) assert.equal(R[k], true, s.name + ' ' + k);
    } else if (s.read.role === 'Store Manager') {
      assert.equal(R.tier, 'manager', s.name);
      for (const k of ['viewQty', 'viewCost', 'viewLedger', 'editMasters', 'openingPropose', 'receive', 'issue', 'returnPart', 'counterSale', 'proposeAdj', 'oldPartRegister', 'oldPartMove', 'reverseCounter', 'rejectProposal']) assert.equal(R[k], true, s.name + ' ' + k);
      for (const k of ['openingPost', 'approveAdj', 'reverseDoc', 'scrapSignoff', 'settings', 'acknowledge', 'override', 'approveAdjMgr']) assert.equal(R[k], false, s.name + ' ' + k);
    } else {
      assert.equal(R.tier, 'staff', s.name);
      assert.equal(R.viewQty, true);
      for (const k of ['viewCost', 'viewLedger', 'editMasters', 'openingPropose', 'openingPost', 'receive', 'issue', 'returnPart', 'counterSale', 'proposeAdj', 'approveAdj', 'reverseDoc', 'oldPartRegister', 'oldPartMove', 'scrapSignoff', 'settings', 'acknowledge', 'override', 'reverseCounter', 'rejectProposal']) assert.equal(R[k], false, s.name + ' ' + k);
    }
  }
  for (const b of BROKEN) {
    // the page and the runtime turn every broken read into the closed value
    const R = I.rightsFor({ ok: false, isOwner: false, isManager: false, role: '', tier: 'none', actorName: '' }, { storeRoles: ['Cashier'] });
    for (const k of Object.keys(R)) { if (typeof R[k] === 'boolean') assert.equal(R[k], false, b.name + ' ' + k); }
    assert.equal(R.tier, 'none');
  }
  // a session object that only looks right is not trusted
  const fake = I.rightsFor({ ok: true, isOwner: 'true', isManager: 1, role: 'Store Manager', tier: 'owner', actorName: 'x' }, {});
  assert.equal(fake.tier, 'staff');
  assert.equal(fake.owner, false);
  assert.equal(I.rightsFor(null, {}).tier, 'none');
  assert.equal(I.rightsFor(undefined, {}).viewQty, false);
});

test('L5 rightsFor: store roles from settings give store-class rights only (never cost, masters or approval)', () => {
  const cfg = { adjustLimitPaise: 0, storeRoles: ['Cashier', 'Technician'] };
  const cashier = I.rightsFor(SESS.staff, cfg);
  assert.equal(cashier.storeClass, true);
  for (const k of ['receive', 'issue', 'returnPart', 'counterSale', 'proposeAdj', 'oldPartRegister', 'openingPropose']) assert.equal(cashier[k], true, k);
  for (const k of ['viewCost', 'viewLedger', 'editMasters', 'openingPost', 'approveAdj', 'reverseDoc', 'oldPartMove', 'scrapSignoff', 'settings', 'reverseCounter']) assert.equal(cashier[k], false, k);
  assert.equal(I.rightsFor({ ok: true, isOwner: false, isManager: false, role: 'Greeter', tier: 'staff', actorName: 'g' }, cfg).receive, false);
  assert.equal(I.rightsFor(SESS.manager, { adjustLimitPaise: 50000 }).approveAdjMgr, true);
  assert.equal(I.rightsFor(SESS.manager, { adjustLimitPaise: 0 }).approveAdjMgr, false);
  assert.equal(I.rightsFor(SESS.owner, { adjustLimitPaise: 50000 }).approveAdjMgr, false);
  assert.equal(I.rightsFor(SESS.manager, { adjustLimitPaise: '500' }).adjustLimitPaise, 0);
});

test('L6 errorText: every code has text, numbers fill in, unknown codes show the real code', () => {
  for (const code of Object.keys(I.ERR)) {
    const text = I.errorText({ ok: false, code });
    assert.ok(text.length > 0, code);
    assert.equal(/\{[a-z]+\}/.test(text) && code !== 'SVS_QTY_INVALID', false, code + ': ' + text);
  }
  assert.equal(I.errorText({ code: 'INSUFFICIENT_STOCK', detail: { onHand: 3 } }), 'Not enough stock. On hand: 3.');
  assert.equal(I.errorText({ code: 'INSUFFICIENT_STOCK' }), 'Not enough stock. Nothing was posted.');
  assert.match(I.errorText({ code: 'SOMETHING_NEW' }), /Code: SOMETHING_NEW\./);
  assert.match(I.errorText(null), /Code: SVS_BAD_REPLY\./);
  assert.match(I.errorText({ code: 'SVS_INTERNAL', detail: { message: 'boom' } }), /boom/);
  assert.equal(I.errorText({ code: 'SVS_PIN_DENIED' }), 'Owner approval was not given. Nothing was changed.');
  assert.equal(I.errorText({ code: 'SVS_OWNER_ONLY' }), 'Only the Owner can do this. Unlock Owner mode in the app header, then try again.');
});

test('L7 rankParts: exact code first, then prefix, then description; capped at 8; leading zeros kept', () => {
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push({ code: 'AB' + String(i).padStart(3, '0'), name: 'Spring ' + i });
  rows.push({ code: '00123', name: 'Zero lead' }, { code: '123', name: 'No lead' }, { code: 'X1', name: 'ab special glass' });
  const r1 = I.rankParts(rows, 'ab005');
  assert.equal(r1[0].code, 'AB005');
  const r2 = I.rankParts(rows, 'AB');
  assert.equal(r2.length, 8);
  assert.equal(r2[0].code.startsWith('AB'), true);
  const r3 = I.rankParts(rows, '00123');
  assert.equal(r3[0].code, '00123');
  assert.equal(r3.some((r) => r.code === '123'), false);
  const r4 = I.rankParts(rows, 'special');
  assert.deepEqual(P(r4.map((r) => r.code)), ['X1']);
  assert.deepEqual(P(I.rankParts(rows, 'nomatch')), []);
  assert.deepEqual(P(I.rankParts(null, 'x')), []);
});

test('L8 date helpers: IST day, add days, month roll-back', () => {
  assert.equal(I.istDay('2026-11-13T20:00:00.000Z'), '2026-11-14');
  assert.equal(I.istDay('2026-11-13T05:00:00.000Z'), '2026-11-13');
  assert.equal(I.istDay('2026-11-13'), '2026-11-13');
  assert.equal(I.istDay('junk'), '');
  assert.equal(I.addDays('2026-11-13', -90), '2026-08-15');
  assert.equal(I.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(I.addDays('2028-03-01', -1), '2028-02-29');
});
