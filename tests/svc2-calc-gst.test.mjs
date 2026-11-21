// Service wave 2, writer W-CALC: GSTIN, state codes and the tax split (P2 section 11 tests T61 to T80, section 10.6 Z01 to Z16).
// Field names follow PLAN C-CALC-1 and C-CALC-2: recipientStateCode, recipientGstin, and no "pan" key anywhere.
// The check characters below are from the spec table and were each worked by hand (see the report) before use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Calc, part, labour, one, GSTIN_29, GSTIN_27, GSTIN_33 } from './lib/svc2-calc-load.mjs';

function expectFail(r, code) {
  assert.equal(r.ok, false, 'expected a failure ' + code + ' got ' + JSON.stringify(r));
  assert.equal(r.code, code);
  assert.equal(r.message, Calc.MESSAGES[code]);
}

// ---- T61 to T66: Z01 to Z16 ----
const SUPPLY_OK = [
  ['Z01', {}, { supplyType: 'INTRA', placeOfSupplyStateCode: '27', recipientGstin: '', reason: 'UNREGISTERED' }],
  ['Z02', { recipientGstin: GSTIN_29 }, { supplyType: 'INTER', placeOfSupplyStateCode: '29', recipientGstin: '29LMNOP4321D1ZR', reason: 'REGISTERED' }],
  ['Z03', { recipientGstin: GSTIN_27 }, { supplyType: 'INTRA', placeOfSupplyStateCode: '27', recipientGstin: '27PQRST5678K1Z2', reason: 'REGISTERED' }],
  ['Z04', { recipientGstin: GSTIN_33 }, { supplyType: 'INTER', placeOfSupplyStateCode: '33', recipientGstin: '33FGHIJ9876C1ZH', reason: 'REGISTERED' }],
  ['Z05', { recipientGstin: '27pqrst5678k1z2 ' }, { supplyType: 'INTRA', placeOfSupplyStateCode: '27', recipientGstin: '27PQRST5678K1Z2', reason: 'REGISTERED' }],
  ['Z13', { recipientStateCode: '29' }, { supplyType: 'INTRA', placeOfSupplyStateCode: '27', recipientGstin: '', reason: 'UNREGISTERED' }],
  ['Z14', { sellerStateCode: '29', recipientGstin: GSTIN_29 }, { supplyType: 'INTRA', placeOfSupplyStateCode: '29', recipientGstin: '29LMNOP4321D1ZR', reason: 'REGISTERED' }],
  ['Z14b', { recipientGstin: '   ' }, { supplyType: 'INTRA', placeOfSupplyStateCode: '27', recipientGstin: '', reason: 'UNREGISTERED' }],
  ['Z14c', { recipientStateCode: '29', recipientGstin: GSTIN_29 }, { supplyType: 'INTER', placeOfSupplyStateCode: '29', recipientGstin: '29LMNOP4321D1ZR', reason: 'REGISTERED' }]
];
const SUPPLY_FAIL = [
  ['Z06', { recipientGstin: '27PQRST5678K1Z3' }, 'GSTIN_CHECKSUM'],
  ['Z07', { recipientGstin: '27PQRST5678K1Z' }, 'GSTIN_FORMAT'],
  ['Z08', { recipientGstin: '27PQRST5678K0Z2' }, 'GSTIN_FORMAT'],
  ['Z09', { recipientGstin: '27PQRST5678K1Y2' }, 'GSTIN_FORMAT'],
  ['Z10', { recipientGstin: '40PQRST5678K1Z2' }, 'GSTIN_STATE'],
  ['Z11', { recipientGstin: '00PQRST5678K1Z2' }, 'GSTIN_STATE'],
  ['Z12', { recipientStateCode: '29', recipientGstin: GSTIN_27 }, 'GSTIN_STATE_MISMATCH'],
  ['Z15a', { sellerStateCode: '3' }, 'SELLER_STATE_INVALID'],
  ['Z15b', { sellerStateCode: 'AB' }, 'SELLER_STATE_INVALID'],
  ['Z15c', { sellerStateCode: 27 }, 'SELLER_STATE_INVALID'],
  ['Z16a', { recipientGstin: 27 }, 'GSTIN_FORMAT'],
  ['Z16b', { recipientGstin: {} }, 'GSTIN_FORMAT'],
  ['Z17a', { recipientStateCode: 'XX' }, 'CUSTOMER_STATE_INVALID'],
  ['Z17b', { recipientStateCode: '39' }, 'CUSTOMER_STATE_INVALID'],
  ['Z17c', { recipientStateCode: 29 }, 'CUSTOMER_STATE_INVALID']
];
test('T61 to T63: decideSupply, accepted cases Z01 to Z05, Z13, Z14', () => {
  for (const [id, input, want] of SUPPLY_OK) {
    const r = Calc.decideSupply(input);
    assert.deepEqual(r, Object.assign({ ok: true }, want), id);
    assert.deepEqual(Object.keys(r), ['ok', 'supplyType', 'placeOfSupplyStateCode', 'recipientGstin', 'reason'], id + ' key order');
  }
});
test('T64 to T66: decideSupply, refused cases Z06 to Z12, Z15, Z16', () => {
  for (const [id, input, code] of SUPPLY_FAIL) expectFail(Calc.decideSupply(input), code);
  expectFail(Calc.decideSupply(null), 'INPUT_INVALID');
  expectFail(Calc.decideSupply('27'), 'INPUT_INVALID');
});
test('T66: the same decisions through computeBill (Z02, Z05, Z12, Z13) with the keys of the plan', () => {
  const b = Calc.computeBill(one({}, { recipientGstin: '29lmnop4321d1zr ' }));
  assert.equal(b.ok, true);
  assert.deepEqual(b.supply, { type: 'INTER', sellerStateCode: '27', placeOfSupplyStateCode: '29', recipientGstin: GSTIN_29, reason: 'REGISTERED' });
  assert.deepEqual(b.input, {
    lines: b.input.lines, billDiscountPaise: 0, sellerStateCode: '27', recipientStateCode: '29', recipientGstin: GSTIN_29
  });
  expectFail(Calc.computeBill(one({}, { recipientStateCode: '29', recipientGstin: GSTIN_27 })), 'GSTIN_STATE_MISMATCH');
  const z13 = Calc.computeBill(one({}, { recipientStateCode: '29' }));
  assert.equal(z13.supply.type, 'INTRA');
  assert.equal(z13.input.recipientStateCode, '29');
  assert.equal(z13.input.recipientGstin, '');
  const plain = Calc.computeBill(one({}));
  assert.equal(plain.input.recipientStateCode, '27', 'a missing customer state is the shop state');
  assert.equal(plain.input.sellerStateCode, '27');
  assert.equal(Calc.computeBill({ lines: [part()] }).supply.sellerStateCode, '27', 'the shop state defaults to 27');
  assert.equal(Calc.computeBill({ lines: [part()], sellerStateCode: '29' }).supply.placeOfSupplyStateCode, '29');
});

// ---- T67 to T72: GSTIN ----
// Each check character was worked by hand from the algorithm of section 4.3 (see the report for the working of the first three).
const CHECK_CHARS = [
  ['27ABCDE1234F1Z', '0'], ['27PQRST5678K1Z', '2'], ['29LMNOP4321D1Z', 'R'], ['24ABCDE1234F1Z', '6'],
  ['07ABCDE1234F1Z', '2'], ['27ABCDE1234F2Z', 'Z'], ['33FGHIJ9876C1Z', 'H']
];
test('T67: gstinCheckChar gives the hand-worked check characters', () => {
  for (const [first14, ch] of CHECK_CHARS) assert.equal(Calc.gstinCheckChar(first14), ch, first14);
});
test('T67b: gstinCheckChar gives an empty text for anything that is not 14 valid characters', () => {
  for (const bad of ['', '27ABCDE1234F1', '27ABCDE1234F1ZZ', '27abcde1234f1z', '27ABCDE1234F1!', null, undefined, 27, {}, [], '27ABCDE1234F1Z '.trim() + 'x']) {
    assert.equal(Calc.gstinCheckChar(bad), '');
  }
});
test('T68: all seven numbers built from the check characters pass validateGstin and carry only gstin and stateCode', () => {
  for (const [first14, ch] of CHECK_CHARS) {
    const g = first14 + ch;
    const r = Calc.validateGstin(g);
    assert.deepEqual(r, { ok: true, gstin: g, stateCode: first14.slice(0, 2) }, g);
    assert.deepEqual(Object.keys(r), ['ok', 'gstin', 'stateCode']);
    assert.equal('pan' in r, false);
  }
  assert.deepEqual(Calc.validateGstin(' 33fghij9876c1zh '), { ok: true, gstin: '33FGHIJ9876C1ZH', stateCode: '33' });
});
test('T69: the firm GSTIN of the existing fixtures does not satisfy the checksum, and this file never checks the firm number', () => {
  // 27ABCDE1234F1Z5 is in tests/fix-s02-reports-invoice.test.mjs. The right check character for those 14 characters is 0 (worked by hand).
  expectFail(Calc.validateGstin('27ABCDE1234F1Z5'), 'GSTIN_CHECKSUM');
  assert.equal(Calc.validateGstin('27ABCDE1234F1Z0').ok, true);
  // the shop side takes only a state code: a whole number there is refused, never validated
  expectFail(Calc.computeBill(one({}, { sellerStateCode: '27ABCDE1234F1Z5' })), 'SELLER_STATE_INVALID');
});
test('T70: a single changed character in the first 14 positions always breaks the number', () => {
  const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  const STATES = new Set([...Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, '0')), '97', '99']);
  let checksumHits = 0;
  for (const base of ['27PQRST5678K1Z2', '29LMNOP4321D1ZR', '33FGHIJ9876C1ZH']) {
    for (let i = 0; i < 14; i += 1) {
      for (const ch of CHARS) {
        if (ch === base[i]) continue;
        const g = base.slice(0, i) + ch + base.slice(i + 1);
        const r = Calc.validateGstin(g);
        assert.equal(r.ok, false, g);
        if (!FORMAT.test(g)) assert.equal(r.code, 'GSTIN_FORMAT', g);
        else if (!STATES.has(g.slice(0, 2))) assert.equal(r.code, 'GSTIN_STATE', g);
        else { assert.equal(r.code, 'GSTIN_CHECKSUM', g); checksumHits += 1; }
      }
    }
  }
  assert.ok(checksumHits > 500, 'the loop must reach the checksum step many times, got ' + checksumHits);
});
test('T71: changing the check character itself breaks the number', () => {
  for (const base of ['27PQRST5678K1Z2', '29LMNOP4321D1ZR']) {
    for (const ch of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      if (ch === base[14]) continue;
      expectFail(Calc.validateGstin(base.slice(0, 14) + ch), 'GSTIN_CHECKSUM');
    }
  }
});
test('T72: validateGstin refuses anything that is not a text', () => {
  for (const bad of [undefined, null, 0, 27, {}, [], true]) expectFail(Calc.validateGstin(bad), 'GSTIN_FORMAT');
  expectFail(Calc.validateGstin(''), 'GSTIN_FORMAT');
  expectFail(Calc.validateGstin('27PQRST5678K1Z22'), 'GSTIN_FORMAT');
});
test('T72b: state codes are 01 to 38, 97 and 99 and nothing else', () => {
  const want = [];
  for (let i = 1; i <= 38; i += 1) want.push(i < 10 ? '0' + i : String(i));
  want.push('97', '99');
  assert.deepEqual(Array.from(Calc.STATE_CODES), want);
  assert.equal(Object.isFrozen(Calc.STATE_CODES), true);
  expectFail(Calc.decideSupply({ sellerStateCode: '00' }), 'SELLER_STATE_INVALID');
  expectFail(Calc.decideSupply({ sellerStateCode: '39' }), 'SELLER_STATE_INVALID');
  expectFail(Calc.decideSupply({ sellerStateCode: '98' }), 'SELLER_STATE_INVALID');
  assert.equal(Calc.decideSupply({ sellerStateCode: '97' }).ok, true);
  assert.equal(Calc.decideSupply({ sellerStateCode: '99' }).ok, true);
});

// ---- T73: the hard checksum switch ----
test('T73: the checksum is hard and a bad check character is refused', () => {
  assert.equal(Calc.GSTIN_CHECKSUM_HARD, true);
  expectFail(Calc.validateGstin('27PQRST5678K1Z3'), 'GSTIN_CHECKSUM');
  expectFail(Calc.computeBill(one({}, { recipientGstin: '27PQRST5678K1Z3' })), 'GSTIN_CHECKSUM');
  assert.equal(Object.keys(Calc).includes('setChecksumHard'), false, 'no test-only switch is exported');
});

// ---- T74: same lines, intra and inter ----
test('T74: the same lines give identical tax and total for INTRA and INTER, only the split differs', () => {
  const lines = [part({ unitPricePaise: 33333, qty: 3, priceBasis: 'INCL' }), labour({ unitPricePaise: 45001 }), part({ code: 'P2', rateBp: 1200, unitPricePaise: 30000 })];
  const intra = Calc.computeBill({ lines });
  const inter = Calc.computeBill({ lines, recipientGstin: GSTIN_29 });
  assert.equal(intra.supply.type, 'INTRA');
  assert.equal(inter.supply.type, 'INTER');
  assert.equal(inter.totals.taxPaise, intra.totals.taxPaise);
  assert.equal(inter.totals.totalPaise, intra.totals.totalPaise);
  assert.equal(inter.totals.taxablePaise, intra.totals.taxablePaise);
  assert.equal(inter.totals.igstPaise, intra.totals.cgstPaise + intra.totals.sgstPaise);
  assert.equal(inter.totals.cgstPaise + inter.totals.sgstPaise, 0);
  intra.lines.forEach((l, i) => {
    assert.equal(inter.lines[i].taxPaise, l.taxPaise);
    assert.equal(inter.lines[i].totalPaise, l.totalPaise);
    assert.equal(inter.lines[i].igstPaise, l.cgstPaise + l.sgstPaise);
    // CGST takes the odd paisa (by hand: tax 5 gives 3 and 2, tax 4 gives 2 and 2)
    assert.ok(l.cgstPaise - l.sgstPaise === 0 || l.cgstPaise - l.sgstPaise === 1);
  });
});

// ---- T75 to T80: rates ----
test('T75: a rate-0 line is in the HSN summary and has a 0bp rate group with no tax', () => {
  const b = Calc.computeBill({ lines: [part({ rateBp: 0, unitPricePaise: 5000 })] });
  assert.deepEqual(b.hsnSummary, [{ hsnSac: '9101', rateBp: 0, qty: 1, taxablePaise: 5000, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, taxPaise: 0 }]);
  assert.deepEqual(b.rateGroups, [{ rateBp: 0, taxablePaise: 5000, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, taxPaise: 0, totalPaise: 5000 }]);
});
test('T76: two lines with one rate in different bases share one rate group', () => {
  // by hand: 10000 excl at 18 percent is 11800 (taxable 10000 tax 1800); 11800 incl is taxable 10000 tax 1800
  const b = Calc.computeBill({ lines: [part({ unitPricePaise: 10000 }), part({ code: 'P2', priceBasis: 'INCL', unitPricePaise: 11800 })] });
  assert.deepEqual(b.rateGroups, [{ rateBp: 1800, taxablePaise: 20000, cgstPaise: 1800, sgstPaise: 1800, igstPaise: 0, taxPaise: 3600, totalPaise: 23600 }]);
});
test('T77: five different rates make five groups in ascending order', () => {
  const rates = [2800, 0, 1800, 500, 1200];
  const b = Calc.computeBill({ lines: rates.map((r, i) => part({ code: 'P' + (i + 1), rateBp: r, unitPricePaise: 10000 })) });
  // by hand: 10000 excl gives tax 0, 500, 1200, 1800, 2800 for the rates 0, 500, 1200, 1800, 2800
  assert.deepEqual(b.rateGroups.map((g) => [g.rateBp, g.taxPaise, g.totalPaise]), [
    [0, 0, 10000], [500, 500, 10500], [1200, 1200, 11200], [1800, 1800, 11800], [2800, 2800, 12800]
  ]);
  assert.equal(b.totals.linesTotalPaise, 56300);
  assert.equal(b.warnings.length, 0);
});
test('T78: the rate of 100 percent is allowed and 28 percent warns nothing', () => {
  const b = Calc.computeBill({ lines: [part({ rateBp: 10000, unitPricePaise: 1000 })] });
  assert.equal(b.totals.taxPaise, 1000);
  assert.deepEqual(b.warnings, [{ code: 'RATE_UNUSUAL', lineNo: 1 }]);
  assert.deepEqual(Calc.computeBill({ lines: [part({ rateBp: 2800 })] }).warnings, []);
});
test('T79: a tax of one paisa is shared as CGST 1 and SGST 0 (the odd paisa goes to CGST)', () => {
  // by hand: 6 paise at 18 percent is 1.08, rounds to 1 paisa of tax
  const b = Calc.computeBill({ lines: [part({ unitPricePaise: 6, rateBp: 1800 })] });
  assert.equal(b.lines[0].taxPaise, 1);
  assert.equal(b.lines[0].cgstPaise, 1);
  assert.equal(b.lines[0].sgstPaise, 0);
  // 3 paise of tax: 17 paise at 18 percent is 3.06 -> 3: CGST 2, SGST 1
  const c = Calc.computeBill({ lines: [part({ unitPricePaise: 17, rateBp: 1800 })] });
  assert.equal(c.lines[0].taxPaise, 3);
  assert.equal(c.lines[0].cgstPaise, 2);
  assert.equal(c.lines[0].sgstPaise, 1);
});
test('T80: half-up rounding of tax: 25 paise at 2 percent tax is 0.5 and rounds to 1', () => {
  const b = Calc.computeBill({ lines: [part({ unitPricePaise: 25, rateBp: 200 })] });
  assert.equal(b.lines[0].taxPaise, 1);
  const c = Calc.computeBill({ lines: [part({ unitPricePaise: 24, rateBp: 200 })] });
  assert.equal(c.lines[0].taxPaise, 0);
});

// ---- A-CALC auditor example E05: an invented GSTIN of state 24, check character worked by hand (sum 218, 218 mod 36 = 2, 36 - 2 = 34 = Y) ----
test('A-CALC E05: IGST for a valid invented GSTIN of state 24 at 28 percent', () => {
  assert.equal(Calc.gstinCheckChar('24QWERT1357Y1Z'), 'Y');
  expectFail(Calc.validateGstin('24QWERT1357Y1ZX'), 'GSTIN_CHECKSUM');
  const b = Calc.computeBill(one({ unitPricePaise: 99999, rateBp: 2800 }, { recipientGstin: '24qwert1357y1zy ' }));
  assert.deepEqual([b.supply.type, b.supply.placeOfSupplyStateCode, b.supply.recipientGstin, b.input.recipientStateCode], ['INTER', '24', '24QWERT1357Y1ZY', '24']);
  assert.deepEqual([b.lines[0].taxPaise, b.lines[0].cgstPaise, b.lines[0].sgstPaise, b.lines[0].igstPaise, b.totals.linesTotalPaise, b.totals.roundOffPaise, b.totals.totalPaise], [28000, 0, 0, 28000, 127999, 1, 128000]);
  assert.deepEqual(b.warnings, []);
  assert.equal(Calc.verifyBill(JSON.parse(JSON.stringify(b))).ok, true);
});
test('A-CALC: with no customer state the echoed state is the seller state, not a fixed 27', () => {
  const b = Calc.computeBill(one({}, { sellerStateCode: '24' }));
  assert.equal(b.input.recipientStateCode, '24');
  assert.equal(b.supply.placeOfSupplyStateCode, '24');
  assert.deepEqual(b.warnings, []);
  assert.equal(Calc.verifyBill(b).ok, true);
  const o = Calc.computeBill(one({}, { sellerStateCode: '24', recipientStateCode: '27' }));
  assert.deepEqual(o.warnings, [{ code: 'OTHER_STATE_UNREGISTERED_INTRA' }]);
  assert.equal(o.supply.type, 'INTRA');
});
