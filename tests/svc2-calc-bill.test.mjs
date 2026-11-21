// Service wave 2, writer W-CALC: bill arithmetic (P2 section 11, tests T01 to T60 as corrected by PLAN 2.6 and C-CALC).
// Expected values are typed by hand from P2 section 10 (fixture calc-bill-examples.json and the tables below).
// None of them is produced by the product code. Bill input keys are recipientStateCode and recipientGstin (C-CALC-1).
//
// Invariants any random-bill test must hold (the 20,000 bill run is in svc2-calc-invariants.test.mjs):
//   I1 sum(line.totalPaise) = totals.linesTotalPaise     I2 totals.taxPaise = cgst + sgst + igst
//   I3 |roundOff| <= 50 and total % 100 = 0               I4 sum(billDiscountShare) = billDiscountPaise
//   I5 net >= 0 and taxable <= net for chargeable lines   I6 inclusive chargeable line: total = net
//   I7 note totals telescope                              I8 verifyBill ok
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Calc, fixture, billInput, fullLine, ROW_FIELDS, clone, deepFreeze, part, labour, one, makeRng, randomBillInput, GSTIN_29
} from './lib/svc2-calc-load.mjs';

const FX = fixture('calc-bill-examples.json').examples;
const byId = (id) => FX.find((e) => e.id === id);

function expectFail(r, code) {
  assert.equal(r.ok, false, 'expected a failure ' + code);
  assert.equal(r.code, code);
  assert.equal(typeof r.message, 'string');
  assert.ok(r.message.length > 5);
  assert.equal(r.message, Calc.MESSAGES[code]);
}

// ---- T01 to T22: worked examples W01 to W22 ----
for (const ex of FX) {
  test(ex.id + ': worked example, every line field, totals, groups and supply', () => {
    const b = Calc.computeBill(billInput(ex));
    assert.equal(b.ok, true, JSON.stringify(b));
    assert.equal(b.calcVersion, 'SBC-1');
    assert.equal(b.lines.length, ex.rows.length);
    ex.rows.forEach((row, i) => {
      ROW_FIELDS.forEach((f, c) => assert.equal(b.lines[i][f], row[c], ex.id + ' line ' + (i + 1) + ' ' + f));
      assert.equal(b.lines[i].lineNo, i + 1);
    });
    assert.equal(b.totals.taxablePaise, ex.bill.taxable);
    assert.equal(b.totals.cgstPaise, ex.bill.cgst);
    assert.equal(b.totals.sgstPaise, ex.bill.sgst);
    assert.equal(b.totals.igstPaise, ex.bill.igst);
    assert.equal(b.totals.taxPaise, ex.bill.tax);
    assert.equal(b.totals.linesTotalPaise, ex.bill.linesTotal);
    assert.equal(b.totals.roundOffPaise, ex.bill.roundOff);
    assert.equal(b.totals.totalPaise, ex.bill.total);
    assert.equal(b.totals.billDiscountPaise, ex.bd || 0);
    assert.equal(b.totals.listPaise, ex.rows.reduce((a, r) => a + r[0], 0));
    assert.equal(b.totals.lineDiscountPaise, ex.rows.reduce((a, r) => a + r[1], 0));
    assert.deepEqual(b.rateGroups.map((g) => [g.rateBp, g.taxablePaise, g.taxPaise, g.totalPaise]), ex.groups);
    assert.equal(b.supply.type, ex.supply);
    assert.equal(b.supply.sellerStateCode, '27');
    assert.equal(b.supply.recipientGstin, ex.gstin || '');
    assert.equal(b.isNoCharge, ex.isNoCharge === true);
    assert.equal(Calc.verifyBill(b).ok, true);
  });
}

// ---- T23: solveBillDiscount, W23 to W27 (bill S1 of section 10.3) ----
const S1 = {
  lines: [
    { kind: 'PART', code: 'P1', name: 'Part', hsnSac: '9101', rateBp: 1800, priceBasis: 'INCL', unitPricePaise: 45000, qty: 2 },
    { kind: 'LABOUR', code: 'L1', name: 'Labour', hsnSac: '998719', rateBp: 1800, priceBasis: 'EXCL', unitPricePaise: 30000, qty: 1 }
  ],
  sellerStateCode: '27'
};
test('S1: the base bill of section 10.3', () => {
  const b = Calc.computeBill(S1);
  assert.equal(b.lines[0].taxablePaise, 76271);
  assert.equal(b.lines[0].taxPaise, 13729);
  assert.equal(b.lines[1].taxablePaise, 30000);
  assert.equal(b.lines[1].taxPaise, 5400);
  assert.equal(b.lines[1].totalPaise, 35400);
  assert.equal(b.totals.linesTotalPaise, 125400);
  assert.equal(b.totals.roundOffPaise, 0);
  assert.equal(b.totals.totalPaise, 125400);
  assert.equal(b.totals.cgstPaise, 9565);
  assert.equal(b.totals.sgstPaise, 9564);
});
test('T23 W23: target 100000 gives a discount of 25400 and the shares 18230 and 7170', () => {
  const before = JSON.stringify(S1);
  const r = Calc.solveBillDiscount(S1, 100000);
  assert.equal(JSON.stringify(S1), before);
  assert.equal(r.ok, true);
  assert.equal(r.billDiscountPaise, 25400);
  const b = r.bill;
  assert.equal(b.lines[0].billDiscountSharePaise, 18230);
  assert.equal(b.lines[1].billDiscountSharePaise, 7170);
  assert.equal(b.lines[0].netPaise, 71770);
  assert.equal(b.lines[0].taxablePaise, 60822);
  assert.equal(b.lines[0].taxPaise, 10948);
  assert.equal(b.lines[0].totalPaise, 71770);
  assert.equal(b.lines[1].netPaise, 23924);
  assert.equal(b.lines[1].taxPaise, 4306);
  assert.equal(b.lines[1].totalPaise, 28230);
  assert.equal(b.totals.linesTotalPaise, 100000);
  assert.equal(b.totals.totalPaise, 100000);
  assert.equal(b.totals.roundOffPaise, 0);
  assert.equal(b.totals.billDiscountPaise, 25400);
});
test('T23 W24: target 125000 gives a discount of 400', () => {
  const r = Calc.solveBillDiscount(S1, 125000);
  assert.equal(r.ok, true);
  assert.equal(r.billDiscountPaise, 400);
  assert.equal(r.bill.totals.totalPaise, 125000);
  assert.equal(r.bill.totals.roundOffPaise, 0);
});
test('T23 W25 to W27: equal target, target above, target not a multiple of 100', () => {
  const eq = Calc.solveBillDiscount(S1, 125400);
  assert.equal(eq.ok, true);
  assert.equal(eq.billDiscountPaise, 0);
  expectFail(Calc.solveBillDiscount(S1, 130000), 'TARGET_ABOVE_TOTAL');
  expectFail(Calc.solveBillDiscount(S1, 12345), 'TARGET_INVALID');
  expectFail(Calc.solveBillDiscount(S1, -100), 'TARGET_INVALID');
  expectFail(Calc.solveBillDiscount(S1, 'x'), 'TARGET_INVALID');
  expectFail(Calc.solveBillDiscount(Object.assign({}, S1, { billDiscountPaise: 100 }), 100000), 'INPUT_INVALID');
  expectFail(Calc.solveBillDiscount({ lines: [] }, 100000), 'LINES_REQUIRED');
});
test('A-CALC: a target equal to the total of a bill with a negative round-off gives no discount', () => {
  // 10.49 at 0 percent: lines total 1049, total 1000, round-off -49. Typing 1000 must not invent a 49 paise discount.
  const r = Calc.solveBillDiscount(one({ unitPricePaise: 1049, rateBp: 0 }), 1000);
  assert.equal(r.ok, true);
  assert.equal(r.billDiscountPaise, 0);
  assert.equal(r.bill.totals.billDiscountPaise, 0);
  assert.equal(r.bill.totals.roundOffPaise, -49);
  assert.equal(r.bill.totals.totalPaise, 1000);
  assert.equal(Calc.verifyBill(r.bill).ok, true);
  // one rupee less is a real discount
  const r2 = Calc.solveBillDiscount(one({ unitPricePaise: 1049, rateBp: 0 }), 900);
  assert.equal(r2.ok, true);
  assert.equal(r2.bill.totals.totalPaise, 900);
  assert.ok(r2.billDiscountPaise > 0);
});

// ---- A-CALC auditor examples (worked by hand in service-wave-2\reports\calc-audit.md) ----
const AROW = ['listPaise', 'priceAfterLineDiscountPaise', 'payableWeightPaise', 'billDiscountSharePaise', 'netPaise', 'taxablePaise', 'taxPaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'totalPaise'];
const arow = (l) => AROW.map((k) => l[k]);
const atot = (b) => [b.totals.taxablePaise, b.totals.cgstPaise, b.totals.sgstPaise, b.totals.igstPaise, b.totals.taxPaise, b.totals.linesTotalPaise, b.totals.roundOffPaise, b.totals.totalPaise];
test('A-CALC E01: inclusive 123.45 x 3 at 18 percent', () => {
  const b = Calc.computeBill(one({ unitPricePaise: 12345, qty: 3, priceBasis: 'INCL' }));
  assert.deepEqual(arow(b.lines[0]), [37035, 37035, 37035, 0, 37035, 31386, 5649, 2825, 2824, 0, 37035]);
  assert.deepEqual(atot(b), [31386, 2825, 2824, 0, 5649, 37035, -35, 37000]);
});
test('A-CALC E03: line discount plus a bill discount spread over three lines with one paisa left over', () => {
  const b = Calc.computeBill({ lines: [part({ unitPricePaise: 10000, qty: 3, discountPaise: 1000 }), part({ code: 'P2', unitPricePaise: 7777, rateBp: 1200, priceBasis: 'INCL' }), labour({ unitPricePaise: 5000, rateBp: 500 })], billDiscountPaise: 1000 });
  assert.deepEqual(b.lines.map((l) => l.billDiscountSharePaise), [724, 165, 111]);
  assert.deepEqual(arow(b.lines[0]), [30000, 29000, 34220, 724, 28386, 28386, 5109, 2555, 2554, 0, 33495]);
  assert.deepEqual(arow(b.lines[1]), [7777, 7777, 7777, 165, 7612, 6796, 816, 408, 408, 0, 7612]);
  assert.deepEqual(arow(b.lines[2]), [5000, 5000, 5250, 111, 4894, 4894, 245, 123, 122, 0, 5139]);
  assert.deepEqual(atot(b), [40076, 3086, 3084, 0, 6170, 46246, -46, 46200]);
});
test('A-CALC E04, E07: odd paisa to CGST; round-off at -49, +50 and either side', () => {
  const b = Calc.computeBill(one({ unitPricePaise: 1050 }));
  assert.deepEqual([b.lines[0].taxPaise, b.lines[0].cgstPaise, b.lines[0].sgstPaise, b.totals.roundOffPaise, b.totals.totalPaise], [189, 95, 94, -39, 1200]);
  for (const [p, ro, t] of [[1049, -49, 1000], [1050, 50, 1100], [1051, 49, 1100], [1149, -49, 1100], [1150, 50, 1200], [49, -49, 0], [50, 50, 100]]) {
    const z = Calc.computeBill(one({ unitPricePaise: p, rateBp: 0 }));
    assert.deepEqual([z.totals.roundOffPaise, z.totals.totalPaise], [ro, t], 'price ' + p);
  }
});
test('A-CALC E13, E14: the largest bill, a 99.99 percent bill discount, and 100 percent tax inclusive', () => {
  const big = [part({ unitPricePaise: 50000000, rateBp: 0, priceBasis: 'INCL' }), part({ code: 'P2', unitPricePaise: 40000000, priceBasis: 'INCL' })];
  const b = Calc.computeBill({ lines: big });
  assert.deepEqual([b.lines[1].taxablePaise, b.lines[1].taxPaise, b.totals.totalPaise], [33898305, 6101695, 90000000]);
  const d = Calc.computeBill({ lines: big, billDiscountPaise: 89999999 });
  assert.deepEqual(d.lines.map((l) => l.billDiscountSharePaise), [49999999, 40000000]);
  assert.deepEqual([d.totals.linesTotalPaise, d.totals.roundOffPaise, d.totals.totalPaise], [1, -1, 0]);
  assert.equal(Calc.verifyBill(d).ok, true);
  const h = Calc.computeBill(one({ unitPricePaise: 49999999, rateBp: 10000, priceBasis: 'INCL' }));
  assert.deepEqual([h.lines[0].taxablePaise, h.lines[0].taxPaise, h.lines[0].cgstPaise, h.lines[0].sgstPaise, h.totals.roundOffPaise, h.totals.totalPaise], [25000000, 24999999, 12500000, 12499999, 1, 50000000]);
});
test('A-CALC: verifyBill refuses a record that is not a successful bill', () => {
  const b = Calc.computeBill(one());
  expectFail(Calc.verifyBill(Object.assign(clone(b), { ok: false })), 'BILL_RECORD_INVALID');
});

// ---- T24: hsnSummary ----
test('T24: hsnSummary of W06 has three rows sorted by code then rate', () => {
  const b = Calc.computeBill(billInput(byId('W06')));
  // PART lines carry HSN 9101 and the LABOUR line carries SAC 998719 in the fixture expansion.
  assert.deepEqual(b.hsnSummary, [
    { hsnSac: '9101', rateBp: 1200, qty: 1, taxablePaise: 26786, cgstPaise: 1607, sgstPaise: 1607, igstPaise: 0, taxPaise: 3214 },
    { hsnSac: '9101', rateBp: 1800, qty: 2, taxablePaise: 100000, cgstPaise: 9000, sgstPaise: 9000, igstPaise: 0, taxPaise: 18000 },
    { hsnSac: '998719', rateBp: 500, qty: 1, taxablePaise: 45000, cgstPaise: 1125, sgstPaise: 1125, igstPaise: 0, taxPaise: 2250 }
  ]);
});
test('T24: two lines with the same HSN and rate make one row and the quantities add up', () => {
  const b = Calc.computeBill({ lines: [part({ unitPricePaise: 10000, qty: 2 }), part({ code: 'P2', unitPricePaise: 20000, qty: 3 })] });
  assert.deepEqual(b.hsnSummary, [
    { hsnSac: '9101', rateBp: 1800, qty: 5, taxablePaise: 80000, cgstPaise: 7200, sgstPaise: 7200, igstPaise: 0, taxPaise: 14400 }
  ]);
});
test('T24: a no-charge line is not in the HSN summary or the rate groups', () => {
  const b = Calc.computeBill(billInput(byId('W20')));
  assert.equal(b.hsnSummary.length, 1);
  assert.equal(b.hsnSummary[0].qty, 1);
});

// ---- T25: split ----
test('T25: part, labour and other split of W06 and W21', () => {
  assert.deepEqual(Calc.computeBill(billInput(byId('W06'))).split, {
    part: { taxablePaise: 126786, totalPaise: 148000 },
    labour: { taxablePaise: 45000, totalPaise: 47250 },
    other: { taxablePaise: 0, totalPaise: 0 }
  });
  assert.deepEqual(Calc.computeBill(billInput(byId('W21'))).split, {
    part: { taxablePaise: 100000, totalPaise: 118000 },
    labour: { taxablePaise: 0, totalPaise: 0 },
    other: { taxablePaise: 20000, totalPaise: 23600 }
  });
});

// ---- T26: warnings ----
test('T26: warnings', () => {
  assert.deepEqual(Calc.computeBill(billInput(byId('W17'))).warnings, [{ code: 'OTHER_LINE_PRESENT', lineNo: 1 }]);
  assert.deepEqual(Calc.computeBill(billInput(byId('W18'))).warnings, [{ code: 'ZERO_VALUE_BILL' }]);
  assert.deepEqual(Calc.computeBill(billInput(byId('W19'))).warnings, []);
  assert.deepEqual(Calc.computeBill(billInput(byId('W01'))).warnings, []);
  assert.deepEqual(Calc.computeBill(one({ unitPricePaise: 0 })).warnings, [{ code: 'PRICE_ZERO', lineNo: 1 }, { code: 'ZERO_VALUE_BILL' }]);
  assert.deepEqual(Calc.computeBill(one({ rateBp: 3000 })).warnings, [{ code: 'RATE_UNUSUAL', lineNo: 1 }]);
  const z13 = Calc.computeBill(one({}, { recipientStateCode: '29' }));
  assert.deepEqual(z13.warnings, [{ code: 'OTHER_STATE_UNREGISTERED_INTRA' }]);
  assert.equal(z13.supply.type, 'INTRA');
  assert.equal(z13.supply.placeOfSupplyStateCode, '27');
  assert.equal(z13.supply.reason, 'UNREGISTERED');
  // a no-charge line with price 0 does not warn about the price
  assert.deepEqual(Calc.computeBill({ lines: [part({ unitPricePaise: 0, noCharge: true }), part({ code: 'P2' })] }).warnings, []);
});

// ---- T27 to T30: refusals F01 to F24 ----
const REFUSALS = [
  ['F01', one({}, { billDiscountPaise: 200000 }), 'DISCOUNT_EXCEEDS_BILL'],
  ['F02', one({ rateBp: undefined }), 'RATE_REQUIRED'],
  ['F03a', one({ rateBp: 1800.5 }), 'RATE_INVALID'],
  ['F03b', one({ rateBp: -1 }), 'RATE_INVALID'],
  ['F03c', one({ rateBp: 10001 }), 'RATE_INVALID'],
  ['F04', one({ priceBasis: undefined }), 'BASIS_REQUIRED'],
  ['F04b', one({ priceBasis: 'MAYBE' }), 'BASIS_INVALID'],
  ['F05', one({ hsnSac: '' }), 'HSN_REQUIRED'],
  ['F06', one({ hsnSac: '123' }), 'HSN_INVALID'],
  ['F07b', { lines: [labour({ hsnSac: '99871' })] }, 'SAC_INVALID'],
  ['F07c', { lines: [labour({ hsnSac: '' })] }, 'SAC_REQUIRED'],
  ['F07d', { lines: [labour({ hsnSac: '12345678' })] }, 'SAC_INVALID'],
  ['F08', one({ noCharge: true, discountPaise: 100 }), 'NOCHARGE_HAS_DISCOUNT'],
  ['F09', one({ discountPaise: 100001 }), 'DISCOUNT_EXCEEDS_LINE'],
  ['F09b', one({ discountPaise: -1 }), 'DISCOUNT_INVALID'],
  ['F10a', one({ qty: 0 }), 'QTY_INVALID'],
  ['F10b', one({ qty: 1.5 }), 'QTY_INVALID'],
  ['F10c', one({ qty: 10000 }), 'QTY_INVALID'],
  ['F11a', one({ unitPricePaise: 100.5 }), 'PRICE_INVALID'],
  ['F11b', one({ unitPricePaise: -1 }), 'PRICE_INVALID'],
  ['F11c', one({ unitPricePaise: '5' }), 'PRICE_INVALID'],
  ['F12', one({ unitPricePaise: 50000001 }), 'LINE_TOO_LARGE'],
  ['F12b', one({ unitPricePaise: 25000000, qty: 3 }), 'LINE_TOO_LARGE'],
  ['F13', { lines: [0, 1, 2].map((i) => part({ code: 'P' + (i + 1), rateBp: 0, unitPricePaise: 40000000 })) }, 'BILL_TOO_LARGE'],
  ['F14a', one({ color: 'red' }), 'INPUT_INVALID'],
  ['F14b', one({}, { foo: 1 }), 'INPUT_INVALID'],
  ['F14c', one({}, { customerGstin: '' }), 'INPUT_INVALID'],
  ['F14d', one({}, { customerStateCode: '27' }), 'INPUT_INVALID'],
  ['F15a', { lines: [] }, 'LINES_REQUIRED'],
  ['F15b', {}, 'LINES_REQUIRED'],
  ['F16', { lines: Array.from({ length: 101 }, (_, i) => part({ code: 'P' + (i + 1), unitPricePaise: 100 })) }, 'TOO_MANY_LINES'],
  ['F17', one({}, { recipientGstin: 'ABC' }), 'GSTIN_FORMAT'],
  ['F18a', one({ name: '=SUM(A1)' }), 'LINE_NAME_INVALID'],
  ['F18b', one({ name: '' }), 'LINE_NAME_REQUIRED'],
  ['F18c', one({ name: 'x'.repeat(81) }), 'LINE_NAME_INVALID'],
  ['F18d', one({ name: '@cmd' }), 'LINE_NAME_INVALID'],
  ['F19', { lines: [part({ noCharge: true })], billDiscountPaise: 100 }, 'DISCOUNT_EXCEEDS_BILL'],
  ['F21a', one({}, { billDiscountPaise: -1 }), 'BILL_DISCOUNT_INVALID'],
  ['F21b', one({}, { billDiscountPaise: 1.5 }), 'BILL_DISCOUNT_INVALID'],
  ['F22', one({ ref: 'a b' }), 'REF_INVALID'],
  ['F23', one({ code: '' }), 'CODE_INVALID'],
  ['F24', one({ kind: 'SERVICE' }), 'LINE_KIND_INVALID'],
  ['F25', { lines: 'x' }, 'LINES_REQUIRED'],
  ['F26', null, 'INPUT_INVALID'],
  ['F27', one({}, { sellerStateCode: '3' }), 'SELLER_STATE_INVALID']
];
function refusalGroup(name, from, to) {
  test(name, () => {
    for (const [id, input, code] of REFUSALS.slice(from, to)) {
      const r = Calc.computeBill(input);
      expectFail(r, code);
      // totals (step 6) are checked by computeBill only
      if (!['DISCOUNT_EXCEEDS_BILL', 'BILL_TOO_LARGE'].includes(code)) assert.deepEqual(Calc.checkBillInput(input).code, code, id + ' checkBillInput agrees');
    }
  });
}
refusalGroup('T27: refusals F01 to F07', 0, 12);
refusalGroup('T28: refusals F08 to F12', 12, 23);
refusalGroup('T29: refusals F13 to F18', 23, 36);
refusalGroup('T30: refusals F19 to F27', 36, REFUSALS.length);
test('T30: boundary acceptances next to the refusals', () => {
  assert.equal(Calc.computeBill({ lines: [0, 1].map((i) => part({ code: 'P' + (i + 1), rateBp: 0, unitPricePaise: 40000000 })) }).ok, true);
  assert.equal(Calc.computeBill({ lines: [labour({ hsnSac: '998719' })] }).ok, true);
  assert.equal(Calc.computeBill({ lines: [labour({ hsnSac: '9987' })] }).ok, true);
  assert.equal(Calc.computeBill({ lines: [part({ hsnSac: '91011100' })] }).ok, true);
  assert.equal(Calc.computeBill({ lines: [part({ hsnSac: '9101 11' })] }).lines[0].hsnSac, '910111');
  assert.equal(Calc.computeBill({ lines: [part({ qty: 9999, unitPricePaise: 5000 })] }).ok, true);
  expectFail(Calc.computeBill({ lines: [part({ unitPricePaise: 50000000, rateBp: 10000 })] }), 'BILL_TOO_LARGE');
  assert.equal(Calc.computeBill({ lines: [part({ unitPricePaise: 50000000, rateBp: 0 })] }).ok, true);
  assert.equal(Calc.computeBill({ lines: Array.from({ length: 100 }, (_, i) => part({ code: 'P' + (i + 1), unitPricePaise: 100 })) }).ok, true);
  assert.equal(Calc.computeBill({ lines: [part({ ref: 'MOV:12/a-b#3_x.y' })] }).ok, true);
  assert.equal(Calc.computeBill({ lines: [{ kind: 'OTHER', code: '', name: 'Free text', hsnSac: '', rateBp: 0, priceBasis: 'EXCL', unitPricePaise: 5, qty: 1 }] }).ok, true);
  assert.equal(Calc.computeBill({ lines: [{ kind: 'OTHER', code: 'X-1', name: 'Free text', hsnSac: '9101', rateBp: 0, priceBasis: 'EXCL', unitPricePaise: 5, qty: 1 }] }).ok, true);
  expectFail(Calc.computeBill({ lines: [{ kind: 'OTHER', code: '', name: 'Free text', hsnSac: '12', rateBp: 0, priceBasis: 'EXCL', unitPricePaise: 5, qty: 1 }] }), 'HSN_INVALID');
});

// ---- T31, T32: order and issue list ----
test('T31: the first failure follows the validation order of section 3.6', () => {
  const r = Calc.computeBill({ sellerStateCode: 'AB', lines: [] });
  expectFail(r, 'SELLER_STATE_INVALID');
  expectFail(Calc.computeBill({ sellerStateCode: 'AB', lines: [part({ rateBp: undefined })] }), 'SELLER_STATE_INVALID');
  expectFail(Calc.computeBill({ recipientStateCode: '27', recipientGstin: GSTIN_29, lines: [] }), 'GSTIN_STATE_MISMATCH');
  expectFail(Calc.computeBill({ lines: [] }), 'LINES_REQUIRED');
  expectFail(Calc.computeBill({ lines: [part({ rateBp: undefined })], billDiscountPaise: -5 }), 'RATE_REQUIRED');
  expectFail(Calc.computeBill({ foo: 1, sellerStateCode: 'AB', lines: [] }), 'INPUT_INVALID');
  // inside one line: unknown key, kind, code, name, hsn, rate, basis, price, qty (field order of section 3.1)
  expectFail(Calc.computeBill({ lines: [part({ name: '', hsnSac: '', rateBp: undefined })] }), 'LINE_NAME_REQUIRED');
  expectFail(Calc.computeBill({ lines: [part({ hsnSac: '', rateBp: undefined, qty: 0 })] }), 'HSN_REQUIRED');
});
test('T32: checkBillInput returns every line problem at once (F20)', () => {
  const input = { lines: [part({ rateBp: undefined }), part({ code: 'P2', priceBasis: undefined })] };
  const c = Calc.checkBillInput(input);
  expectFail(c, 'RATE_REQUIRED');
  assert.deepEqual(c.issues, [
    { lineNo: 1, field: 'rateBp', code: 'RATE_REQUIRED' },
    { lineNo: 2, field: 'priceBasis', code: 'BASIS_REQUIRED' }
  ]);
  const b = Calc.computeBill(input);
  assert.equal(b.code, 'RATE_REQUIRED');
  assert.deepEqual(b.detail, { lineNo: 1, field: 'rateBp' });
  assert.deepEqual(b.issues, c.issues);
  assert.deepEqual(Calc.checkBillInput(one({})), { ok: true });
});

// ---- T33 to T35: determinism, no mutation, no sharing ----
test('T33: the same input gives a byte-identical result on every call and on a deep copy', () => {
  for (const ex of FX) {
    const x = billInput(ex);
    const a = JSON.stringify(Calc.computeBill(x));
    assert.equal(JSON.stringify(Calc.computeBill(x)), a);
    assert.equal(JSON.stringify(Calc.computeBill(clone(x))), a);
  }
});
test('T34: inputs are never changed (also when frozen)', () => {
  for (const ex of FX) {
    const x = billInput(ex);
    const before = JSON.stringify(x);
    Calc.computeBill(x);
    Calc.checkBillInput(x);
    assert.equal(JSON.stringify(x), before);
    deepFreeze(x);
    assert.equal(Calc.computeBill(x).ok, true);
  }
});
test('T35: the output shares no object with the input', () => {
  const x = billInput(byId('W06'));
  const before = JSON.stringify(x);
  const b = Calc.computeBill(x);
  b.input.lines[0].name = 'changed';
  b.input.lines.push({});
  b.lines[0].qty = 99;
  b.totals.totalPaise = 1;
  assert.equal(JSON.stringify(x), before);
  assert.equal(b.input.lines[0] === x.lines[0], false);
  const again = Calc.computeBill(x);
  assert.equal(again.totals.totalPaise, 195300);
});

// ---- T36: verifyBill ----
test('T36: verifyBill accepts every example and catches changes', () => {
  for (const ex of FX) assert.equal(Calc.verifyBill(Calc.computeBill(billInput(ex))).ok, true, ex.id);
  const b = Calc.computeBill(billInput(byId('W06')));
  const t = clone(b);
  t.totals.totalPaise += 1;
  let r = Calc.verifyBill(t);
  expectFail(r, 'BILL_MISMATCH');
  assert.equal(r.detail.path, 'totals.totalPaise');
  const q = clone(b);
  q.input.lines[0].qty = 3;
  expectFail(Calc.verifyBill(q), 'BILL_MISMATCH');
  const l = clone(b);
  l.lines[1].taxPaise += 1;
  r = Calc.verifyBill(l);
  expectFail(r, 'BILL_MISMATCH');
  assert.equal(r.detail.path, 'lines[1].taxPaise');
  const w = clone(b);
  w.warnings.push({ code: 'PRICE_ZERO', lineNo: 1 });
  expectFail(Calc.verifyBill(w), 'BILL_MISMATCH');
  const v = clone(b);
  v.calcVersion = 'SBC-9';
  expectFail(Calc.verifyBill(v), 'CALC_VERSION_UNKNOWN');
  const n = clone(b);
  delete n.input;
  expectFail(Calc.verifyBill(n), 'BILL_RECORD_INVALID');
  expectFail(Calc.verifyBill(null), 'BILL_RECORD_INVALID');
  expectFail(Calc.verifyBill({}), 'BILL_RECORD_INVALID');
  const bad = clone(b);
  bad.input.lines[0].rateBp = 'x';
  expectFail(Calc.verifyBill(bad), 'BILL_MISMATCH');
  // the supply of a registered customer survives a round trip through the stored input
  const inter = Calc.computeBill(billInput(byId('W05')));
  assert.equal(inter.input.recipientStateCode, '29');
  assert.equal(Calc.verifyBill(JSON.parse(JSON.stringify(inter))).ok, true);
});

// ---- T37: key order ----
test('T37: key order of the bill, its input, supply, lines and totals is fixed', () => {
  const b = Calc.computeBill(billInput(byId('W06')));
  assert.deepEqual(Object.keys(b), ['ok', 'calcVersion', 'input', 'supply', 'lines', 'rateGroups', 'hsnSummary', 'split', 'totals', 'isNoCharge', 'warnings']);
  assert.deepEqual(Object.keys(b.input), ['lines', 'billDiscountPaise', 'sellerStateCode', 'recipientStateCode', 'recipientGstin']);
  assert.deepEqual(Object.keys(b.input.lines[0]), ['kind', 'code', 'name', 'hsnSac', 'rateBp', 'priceBasis', 'unitPricePaise', 'qty', 'discountPaise', 'noCharge', 'ref']);
  assert.deepEqual(Object.keys(b.supply), ['type', 'sellerStateCode', 'placeOfSupplyStateCode', 'recipientGstin', 'reason']);
  assert.deepEqual(Object.keys(b.lines[0]), [
    'lineNo', 'kind', 'other', 'code', 'name', 'hsnSac', 'rateBp', 'priceBasis', 'noCharge', 'qty', 'unitPricePaise', 'ref',
    'listPaise', 'lineDiscountPaise', 'priceAfterLineDiscountPaise', 'payableWeightPaise', 'billDiscountSharePaise', 'netPaise',
    'taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'taxPaise', 'totalPaise'
  ]);
  assert.deepEqual(Object.keys(b.rateGroups[0]), ['rateBp', 'taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'taxPaise', 'totalPaise']);
  assert.deepEqual(Object.keys(b.hsnSummary[0]), ['hsnSac', 'rateBp', 'qty', 'taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'taxPaise']);
  assert.deepEqual(Object.keys(b.totals), [
    'listPaise', 'lineDiscountPaise', 'billDiscountPaise', 'taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'taxPaise',
    'linesTotalPaise', 'roundOffPaise', 'totalPaise'
  ]);
  assert.deepEqual(Object.keys(b.split), ['part', 'labour', 'other']);
  assert.deepEqual(Object.keys(b.split.part), ['taxablePaise', 'totalPaise']);
  // no PAN key and no old field name anywhere in a bill
  const text = JSON.stringify(Calc.computeBill(billInput(byId('W05'))));
  assert.equal(/"pan"|customerGstin|customerStateCode/.test(text), false);
  assert.equal(b.lines[2].other, false);
  assert.equal(Calc.computeBill(billInput(byId('W17'))).lines[0].other, true);
});

// ---- T38: prototype pollution ----
test('T38: a __proto__ key on a line or on the input is refused and Object.prototype stays clean', () => {
  const line = JSON.parse('{"kind":"PART","code":"P1","name":"A","hsnSac":"9101","rateBp":1800,"priceBasis":"EXCL","unitPricePaise":100,"qty":1,"__proto__":{"polluted":true}}');
  expectFail(Calc.computeBill({ lines: [line] }), 'INPUT_INVALID');
  expectFail(Calc.computeBill(JSON.parse('{"lines":[],"__proto__":{"polluted":true}}')), 'INPUT_INVALID');
  expectFail(Calc.computeBill(JSON.parse('{"lines":[{"constructor":{"prototype":{"polluted":true}}}]}')), 'INPUT_INVALID');
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  // an object with a changed prototype is not a plain input
  expectFail(Calc.computeBill(Object.create({ lines: [part()] })), 'INPUT_INVALID');
});

// ---- T39 to T44: properties on 2,000 seeded bills (the 20,000 bill run is in the invariants file) ----
function seededBills(seed, n) {
  const rng = makeRng(seed);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const r = randomBillInput(rng);
    assert.equal(r.base.ok, true, 'a generated bill must be valid: ' + JSON.stringify(r.input));
    out.push(r);
  }
  return out;
}
const BILLS = seededBills(20261118, 2000);

test('T39 P1, P2: line totals add up and tax equals CGST + SGST + IGST', () => {
  for (const { base: b } of BILLS) {
    assert.equal(b.lines.reduce((a, l) => a + l.totalPaise, 0), b.totals.linesTotalPaise);
    for (const l of b.lines) assert.equal(l.taxPaise, l.cgstPaise + l.sgstPaise + l.igstPaise);
    assert.equal(b.totals.taxPaise, b.totals.cgstPaise + b.totals.sgstPaise + b.totals.igstPaise);
    assert.equal(b.totals.taxPaise, b.lines.reduce((a, l) => a + l.taxPaise, 0));
  }
});
test('T40 P3: round-off is within -49 to +50 and the total is a whole rupee', () => {
  for (const { base: b } of BILLS) {
    assert.ok(b.totals.roundOffPaise >= -49 && b.totals.roundOffPaise <= 50);
    assert.equal(b.totals.totalPaise % 100, 0);
    assert.equal(b.totals.totalPaise, b.totals.linesTotalPaise + b.totals.roundOffPaise);
  }
});
test('T41 P4: bill discount shares add to the discount and never exceed the line weight', () => {
  for (const { base: b } of BILLS) {
    assert.equal(b.lines.reduce((a, l) => a + l.billDiscountSharePaise, 0), b.totals.billDiscountPaise);
    for (const l of b.lines) assert.ok(l.billDiscountSharePaise <= l.payableWeightPaise);
  }
});
test('T42 P5: every inclusive chargeable line totals exactly its net', () => {
  for (const { base: b } of BILLS) {
    for (const l of b.lines) if (!l.noCharge && l.priceBasis === 'INCL') assert.equal(l.totalPaise, l.netPaise);
  }
});
test('T43 P6, P7: rate groups add to the lines total and every figure is a non-negative safe integer', () => {
  for (const { base: b } of BILLS) {
    assert.equal(b.rateGroups.reduce((a, g) => a + g.totalPaise, 0), b.totals.linesTotalPaise);
    const rates = b.rateGroups.map((g) => g.rateBp);
    assert.deepEqual(rates, rates.slice().sort((x, y) => x - y));
    for (const l of b.lines) {
      for (const f of ROW_FIELDS) assert.ok(Number.isSafeInteger(l[f]) && l[f] >= 0, f);
      if (!l.noCharge) assert.ok(l.taxablePaise <= l.netPaise);
    }
    for (const f of Object.keys(b.totals)) if (f !== 'roundOffPaise') assert.ok(Number.isSafeInteger(b.totals[f]) && b.totals[f] >= 0, f);
  }
});
test('T44 P8 to P10: full discount, supply split and verifyBill', () => {
  for (const { input, base: b } of BILLS) {
    if (b.supply.type === 'INTRA') assert.equal(b.totals.igstPaise, 0);
    else { assert.equal(b.totals.cgstPaise, 0); assert.equal(b.totals.sgstPaise, 0); }
    assert.equal(Calc.verifyBill(b).ok, true);
    const weight = b.lines.reduce((a, l) => a + l.payableWeightPaise, 0);
    const full = Calc.computeBill(Object.assign({}, input, { billDiscountPaise: weight }));
    assert.equal(full.ok, true);
    assert.equal(full.totals.linesTotalPaise, 0);
    assert.equal(full.totals.totalPaise, 0);
  }
});

// ---- T45 to T50: rounding helpers ----
test('T45 H16: divRound', () => {
  assert.equal(Calc.divRound(5, 2), 3);
  assert.equal(Calc.divRound(4, 2), 2);
  assert.equal(Calc.divRound(0, 7), 0);
  assert.equal(Calc.divRound(-1, 2), null);
  assert.equal(Calc.divRound(1.5, 2), null);
  assert.equal(Calc.divRound(1, 0), null);
  assert.equal(Calc.divRound(1, -3), null);
  assert.equal(Calc.divRound('5', 2), null);
  assert.equal(Calc.divRound(NaN, 2), null);
  assert.equal(Calc.divRound(Infinity, 2), null);
  // half up and just below half
  assert.equal(Calc.divRound(12349, 100), 123);
  assert.equal(Calc.divRound(12350, 100), 124);
  assert.equal(Calc.divRound(7, 3), 2);
  assert.equal(Calc.divRound(8, 3), 3);
  assert.equal(Calc.divRound(9007199254740991, 1), null, 'too large to double safely');
});
test('T46 H17, H18: allocateProportional ties go to the earlier line', () => {
  assert.deepEqual(Calc.allocateProportional(1, [5, 0, 5]), { ok: true, parts: [1, 0, 0] });
  // Spec example H18 (7 over [1,1,1] gives [3,2,2]) contradicts section 3.4 (a part never exceeds its weight, a total above the weights is refused) and H21. The rule of 3.4 is tested; see the report.
  assert.deepEqual(Calc.allocateProportional(2, [1, 1, 1]), { ok: true, parts: [1, 1, 0] });
  expectFail(Calc.allocateProportional(7, [1, 1, 1]), 'ALLOC_INVALID');
});
test('T47 H19, H20: a zero weight gets nothing', () => {
  // Spec example H19 (10 over [0,0,3]) has the same contradiction; 10 over [0,0,30] keeps its meaning.
  assert.deepEqual(Calc.allocateProportional(10, [0, 0, 30]), { ok: true, parts: [0, 0, 10] });
  expectFail(Calc.allocateProportional(10, [0, 0, 3]), 'ALLOC_INVALID');
  assert.deepEqual(Calc.allocateProportional(2, [1, 1, 1, 1]), { ok: true, parts: [1, 1, 0, 0] });
  assert.deepEqual(Calc.allocateProportional(0, [4, 5]), { ok: true, parts: [0, 0] });
});
test('T48 H21: allocateProportional refusals', () => {
  expectFail(Calc.allocateProportional(5, [1, 1]), 'ALLOC_INVALID');
  expectFail(Calc.allocateProportional(1, [0, 0]), 'ALLOC_INVALID');
  expectFail(Calc.allocateProportional(-1, [1]), 'ALLOC_INVALID');
  expectFail(Calc.allocateProportional(1, [1.5]), 'ALLOC_INVALID');
  expectFail(Calc.allocateProportional(1, 'x'), 'ALLOC_INVALID');
  expectFail(Calc.allocateProportional(9e7, [9e7 * 2, 9e7 * 2]), 'ALLOC_INVALID', 'product above the exactness cap');
});
test('T49: allocateProportional keeps its promises on small cases (sum, bounds, floor and ceiling of the exact share)', () => {
  const rng = makeRng(77);
  for (let i = 0; i < 3000; i += 1) {
    const n = rng.range(1, 6);
    const w = Array.from({ length: n }, () => rng.int(4) === 0 ? 0 : rng.range(1, 200));
    const sum = w.reduce((a, x) => a + x, 0);
    if (sum === 0) continue;
    const total = rng.int(sum + 1);
    const r = Calc.allocateProportional(total, w);
    assert.equal(r.ok, true);
    assert.equal(r.parts.reduce((a, x) => a + x, 0), total);
    r.parts.forEach((p, k) => {
      assert.ok(p <= w[k]);
      if (w[k] === 0) assert.equal(p, 0);
      assert.ok(p * sum >= total * w[k] - sum && p * sum <= total * w[k] + sum, 'within one unit of the exact share');
    });
    assert.deepEqual(Calc.allocateProportional(total, w), r);
  }
});
test('T50: a bill discount that is one paisa bigger never lowers the total discount given or the line weights', () => {
  // The spec asked for "no share ever falls". A largest-remainder split can lower one share when the total grows by one
  // (a known property of the method), so only the guaranteed properties are tested here. See the report.
  const rng = makeRng(5);
  for (let i = 0; i < 200; i += 1) {
    const lines = [part({ unitPricePaise: rng.range(100, 5000), priceBasis: 'INCL' }), part({ code: 'P2', unitPricePaise: rng.range(100, 5000), priceBasis: 'INCL' })];
    const weight = lines[0].unitPricePaise + lines[1].unitPricePaise;
    const d = rng.int(weight);
    const a = Calc.computeBill({ lines, billDiscountPaise: d });
    const b = Calc.computeBill({ lines, billDiscountPaise: d + 1 });
    assert.ok(b.totals.linesTotalPaise <= a.totals.linesTotalPaise);
    assert.equal(a.totals.linesTotalPaise, weight - d, 'an all-inclusive bill falls by exactly the typed amount');
  }
});

// ---- T51 to T55: typed amounts and percentages ----
test('T51 H01 to H06: rupeesToPaise', () => {
  assert.deepEqual(Calc.rupeesToPaise('1,200'), { ok: true, paise: 120000 });
  assert.deepEqual(Calc.rupeesToPaise('₹ 1,200.5'), { ok: true, paise: 120050 });
  assert.deepEqual(Calc.rupeesToPaise('Rs. 99'), { ok: true, paise: 9900 });
  assert.deepEqual(Calc.rupeesToPaise('0.05'), { ok: true, paise: 5 });
  assert.deepEqual(Calc.rupeesToPaise(' 7 '), { ok: true, paise: 700 });
  assert.deepEqual(Calc.rupeesToPaise('Rs 12.34'), { ok: true, paise: 1234 });
  assert.deepEqual(Calc.rupeesToPaise(12.5), { ok: true, paise: 1250 });
  assert.deepEqual(Calc.rupeesToPaise(1.1), { ok: true, paise: 110 });
  assert.deepEqual(Calc.rupeesToPaise(0), { ok: true, paise: 0 });
  assert.deepEqual(Calc.rupeesToPaise('999999999.99'), { ok: true, paise: 99999999999 });
  for (const bad of ['12.345', '', '-5', '1e3', '1234567890', 'abc', '1.', '.5', '1 2', null, undefined, {}, [], -1, NaN, Infinity, 1.005, true]) {
    expectFail(Calc.rupeesToPaise(bad), 'AMOUNT_INVALID');
  }
});
test('T52 H07 to H11: paiseToRupeesText', () => {
  assert.equal(Calc.paiseToRupeesText(12345678), '1,23,456.78');
  assert.equal(Calc.paiseToRupeesText(5), '0.05');
  assert.equal(Calc.paiseToRupeesText(100000000), '10,00,000.00');
  assert.equal(Calc.paiseToRupeesText(-250), '-2.50');
  assert.equal(Calc.paiseToRupeesText(1.5), '');
  assert.equal(Calc.paiseToRupeesText(0), '0.00');
  assert.equal(Calc.paiseToRupeesText(99999), '999.99');
  assert.equal(Calc.paiseToRupeesText(100000), '1,000.00');
  assert.equal(Calc.paiseToRupeesText(1234567890), '1,23,45,678.90');
  assert.equal(Calc.paiseToRupeesText('5'), '');
  assert.equal(Calc.paiseToRupeesText(NaN), '');
});
test('T53 H12: percentToBp accepts', () => {
  const cases = [['18', 1800], ['2.5', 250], ['18.00%', 1800], ['5 %', 500], ['100', 10000], ['0', 0], [18, 1800], [2.5, 250], [0.01, 1], [' 12 ', 1200]];
  for (const [x, bp] of cases) assert.deepEqual(Calc.percentToBp(x), { ok: true, bp }, String(x));
});
test('T54 H13: percentToBp refuses', () => {
  for (const bad of ['0.125', '101', '', '-1', 'abc', '100.01', 101, -1, 0.125, NaN, null, undefined]) expectFail(Calc.percentToBp(bad), 'PERCENT_INVALID');
});
test('T55 H14, H15: percentOfPaise', () => {
  assert.deepEqual(Calc.percentOfPaise(150000, 1000), { ok: true, paise: 15000 });
  assert.deepEqual(Calc.percentOfPaise(99999, 1250), { ok: true, paise: 12500 });
  assert.deepEqual(Calc.percentOfPaise(0, 1800), { ok: true, paise: 0 });
  expectFail(Calc.percentOfPaise(-1, 100), 'AMOUNT_INVALID');
  expectFail(Calc.percentOfPaise(90000001, 100), 'AMOUNT_INVALID');
  expectFail(Calc.percentOfPaise(100, 10001), 'PERCENT_INVALID');
  expectFail(Calc.percentOfPaise(100, 1.5), 'PERCENT_INVALID');
});

// ---- T56: approvalCheck ----
test('T56 H22: approvalCheck', () => {
  assert.deepEqual(Calc.approvalCheck({ approvedPaise: 100000, totalPaise: 100000 }), { ok: true, status: 'WITHIN', deltaPaise: 0 });
  assert.deepEqual(Calc.approvalCheck({ approvedPaise: 100000, totalPaise: 100100 }), { ok: true, status: 'ABOVE', deltaPaise: 100 });
  assert.deepEqual(Calc.approvalCheck({ approvedPaise: 100000, totalPaise: 90000 }), { ok: true, status: 'WITHIN', deltaPaise: -10000 });
  assert.deepEqual(Calc.approvalCheck({ approvedPaise: null, totalPaise: 5 }), { ok: true, status: 'NONE', deltaPaise: 0 });
  expectFail(Calc.approvalCheck({ approvedPaise: 1.5, totalPaise: 5 }), 'APPROVAL_INVALID');
  expectFail(Calc.approvalCheck({ approvedPaise: 100, totalPaise: -5 }), 'APPROVAL_INVALID');
  expectFail(Calc.approvalCheck({ totalPaise: 5 }), 'APPROVAL_INVALID');
  expectFail(Calc.approvalCheck({ approvedPaise: '100', totalPaise: 5 }), 'APPROVAL_INVALID');
  expectFail(Calc.approvalCheck(null), 'APPROVAL_INVALID');
});

// ---- T57, T58: old (version 1) jobs ----
test('T57 H24 to H26: legacyLinesToInput', () => {
  const r = Calc.legacyLinesToInput([{ desc: 'Battery change', qty: '1', unit: '300', total: '300' }, { desc: '', qty: '1', unit: '5', total: '5' }], '18');
  assert.deepEqual(r, {
    ok: true,
    lines: [{ kind: 'OTHER', code: '', name: 'Battery change', hsnSac: '', rateBp: 1800, priceBasis: 'EXCL', unitPricePaise: 30000, qty: 1 }],
    warnings: []
  });
  const frac = Calc.legacyLinesToInput([{ desc: 'Battery change', qty: '1.5', unit: '300', total: '450' }], '18');
  expectFail(frac, 'LEGACY_QTY_FRACTION');
  assert.deepEqual(frac.detail, { lineNo: 1 });
  const blank = Calc.legacyLinesToInput([{ desc: 'X', qty: '2', unit: '', total: '900' }], '');
  assert.equal(blank.ok, true);
  assert.equal(blank.lines[0].unitPricePaise, 45000);
  assert.equal(blank.lines[0].rateBp, 0);
  assert.deepEqual(blank.warnings, [{ code: 'LEGACY_GST_BLANK' }]);
  // an old job opened in the new screen computes to the old total: 300 at 18 percent exclusive is 354
  const bill = Calc.computeBill({ lines: r.lines });
  assert.equal(bill.ok, true);
  assert.equal(bill.totals.totalPaise, 35400);
  assert.equal(bill.lines[0].other, true);
  // refusals
  expectFail(Calc.legacyLinesToInput([{ desc: 'X', qty: '2', unit: '', total: '901.01' }], ''), 'AMOUNT_INVALID');
  expectFail(Calc.legacyLinesToInput([{ desc: 'X', qty: '1', unit: '', total: '' }], '18'), 'AMOUNT_INVALID');
  expectFail(Calc.legacyLinesToInput([{ desc: 'X', qty: '1', unit: 'abc', total: '5' }], '18'), 'AMOUNT_INVALID');
  expectFail(Calc.legacyLinesToInput([{ desc: 'X', qty: '1', unit: '5' }], '180'), 'PERCENT_INVALID');
  expectFail(Calc.legacyLinesToInput('x', '18'), 'LEGACY_INVALID');
  expectFail(Calc.legacyLinesToInput([{ desc: 'X', qty: '0', unit: '5' }], '18'), 'LEGACY_INVALID');
  expectFail(Calc.legacyLinesToInput([{ desc: 'X', qty: 'two', unit: '5' }], '18'), 'LEGACY_INVALID');
  expectFail(Calc.legacyLinesToInput([5], '18'), 'LEGACY_INVALID');
  assert.deepEqual(Calc.legacyLinesToInput([{ desc: 'Y', qty: 2, unit: 10, total: 20 }], '5%').lines[0].unitPricePaise, 1000);
  assert.deepEqual(Calc.legacyLinesToInput([], '18'), { ok: true, lines: [], warnings: [] });
});
test('T58 H23: fromLegacyFigs', () => {
  assert.deepEqual(Calc.fromLegacyFigs({ taxable: 254, gst: 46, cgst: 23, sgst: 23, adjustment: -46, roundOff: 0, total: 300 }), {
    ok: true, taxablePaise: 25400, cgstPaise: 2300, sgstPaise: 2300, igstPaise: 0, taxPaise: 4600, roundOffPaise: 0, totalPaise: 30000,
    discountPaise: 4600, additionalPaise: 0
  });
  const extra = Calc.fromLegacyFigs({ taxable: 100, gst: 18, cgst: 9, sgst: 9, adjustment: 12, roundOff: -1, total: 129 });
  assert.equal(extra.additionalPaise, 1200);
  assert.equal(extra.discountPaise, 0);
  assert.equal(extra.roundOffPaise, -100);
  expectFail(Calc.fromLegacyFigs({ taxable: 254.5, gst: 46, cgst: 23, sgst: 23, total: 300 }), 'LEGACY_INVALID');
  expectFail(Calc.fromLegacyFigs({ taxable: '254', gst: 46, cgst: 23, sgst: 23, total: 300 }), 'LEGACY_INVALID');
  expectFail(Calc.fromLegacyFigs({ gst: 46, cgst: 23, sgst: 23, total: 300 }), 'LEGACY_INVALID');
  expectFail(Calc.fromLegacyFigs(null), 'LEGACY_INVALID');
});

// ---- T59, T60: limits ----
test('T59: a 100 line bill at the cap is accepted and one paisa more is refused', () => {
  const lines = Array.from({ length: 100 }, (_, i) => part({ code: 'P' + (i + 1), rateBp: 0, unitPricePaise: 900000 }));
  const ok = Calc.computeBill({ lines });
  assert.equal(ok.ok, true);
  assert.equal(ok.totals.totalPaise, 90000000);
  const over = lines.map((l) => Object.assign({}, l));
  over[99].unitPricePaise = 900001;
  expectFail(Calc.computeBill({ lines: over }), 'BILL_TOO_LARGE');
  // a full discount of the biggest allowed bill splits exactly
  const full = Calc.computeBill({ lines, billDiscountPaise: 90000000 });
  assert.equal(full.ok, true);
  assert.equal(full.totals.totalPaise, 0);
  // a discount of 1 paisa less than all, over 100 equal lines
  const part1 = Calc.computeBill({ lines, billDiscountPaise: 89999999 });
  assert.equal(part1.lines.reduce((a, l) => a + l.billDiscountSharePaise, 0), 89999999);
});
test('T60: the largest price keeps full precision', () => {
  const b = Calc.computeBill({ lines: [part({ rateBp: 10000, priceBasis: 'INCL', unitPricePaise: 50000000 })] });
  assert.equal(b.ok, true);
  assert.equal(b.lines[0].taxablePaise, 25000000);
  assert.equal(b.lines[0].taxPaise, 25000000);
  assert.equal(b.lines[0].totalPaise, 50000000);
  assert.equal(b.lines[0].taxablePaise + b.lines[0].taxPaise, b.lines[0].netPaise);
  const odd = Calc.computeBill({ lines: [part({ rateBp: 1800, priceBasis: 'INCL', unitPricePaise: 49999999 })] });
  assert.equal(odd.lines[0].taxablePaise + odd.lines[0].taxPaise, 49999999);
  // by hand: 49999999 x 10000 / 11800 = 42372880.508, rounds up to 42372881, tax 49999999 - 42372881
  assert.equal(odd.lines[0].taxablePaise, 42372881);
  assert.equal(odd.lines[0].taxPaise, 7627118);
});
test('A-CALC: caps are exact to the paisa (line product, bill discount equal to the payable)', () => {
  // 16,666,667 x 3 = 50,000,001: one paisa above the line cap, with a unit price under the cap
  expectFail(Calc.computeBill(one({ unitPricePaise: 16666667, qty: 3, rateBp: 0 })), 'LINE_TOO_LARGE');
  assert.equal(Calc.computeBill(one({ unitPricePaise: 25000000, qty: 2, rateBp: 0 })).ok, true);
  // payable 118000: a bill discount of 118000 is allowed, 118001 is refused with the bill code (not the split code)
  assert.equal(Calc.computeBill(one({}, { billDiscountPaise: 118000 })).totals.totalPaise, 0);
  expectFail(Calc.computeBill(one({}, { billDiscountPaise: 118001 })), 'DISCOUNT_EXCEEDS_BILL');
});
