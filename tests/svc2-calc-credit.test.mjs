// Service wave 2, writer W-CALC: credit notes and settle (P2 section 11 tests T81 to T110, section 10.4 X01 to X17, section 10.5 Y01 to Y11).
// Expected values are typed by hand from the spec tables; each figure was also re-worked by hand (see the report).
// A line is checked as [lineNo, qty, taxable, CGST, SGST, IGST, tax, total].
import test from 'node:test';
import assert from 'node:assert/strict';
import { Calc, fixture, billInput, part, labour, clone, deepFreeze, GSTIN_29 } from './lib/svc2-calc-load.mjs';

const FX = fixture('calc-bill-examples.json').examples;

function expectFail(r, code) {
  assert.equal(r.ok, false, 'expected a failure ' + code + ' got ' + JSON.stringify(r));
  assert.equal(r.code, code);
  assert.equal(r.message, Calc.MESSAGES[code]);
}
const row = (l) => [l.lineNo, l.qty, l.taxablePaise, l.cgstPaise, l.sgstPaise, l.igstPaise, l.taxPaise, l.totalPaise];

const INV_A_INPUT = { lines: [part({ unitPricePaise: 50000, qty: 3 }), labour({ unitPricePaise: 80000 })] };
const INV_B_INPUT = { lines: [part({ priceBasis: 'INCL', unitPricePaise: 33333, qty: 3 })] };
const INV_I_INPUT = { lines: [part({ unitPricePaise: 50000, qty: 3 })], recipientGstin: GSTIN_29 };
const INV_A = Calc.computeBill(INV_A_INPUT);
const INV_B = Calc.computeBill(INV_B_INPUT);
const INV_I = Calc.computeBill(INV_I_INPUT);
const note = (bill, req, priors) => Calc.computeCreditNote(bill, req, priors || []);
const lines = (...l) => ({ kind: 'LINES', lines: l });

test('the three invoices of section 10.4 are as the spec says', () => {
  assert.deepEqual(row(INV_A.lines[0]), [1, 3, 150000, 13500, 13500, 0, 27000, 177000]);
  assert.deepEqual(row(INV_A.lines[1]), [2, 1, 80000, 7200, 7200, 0, 14400, 94400]);
  assert.equal(INV_A.totals.taxablePaise, 230000);
  assert.equal(INV_A.totals.taxPaise, 41400);
  assert.equal(INV_A.totals.totalPaise, 271400);
  assert.equal(INV_A.totals.roundOffPaise, 0);
  assert.deepEqual(row(INV_B.lines[0]), [1, 3, 84745, 7627, 7627, 0, 15254, 99999]);
  assert.equal(INV_B.totals.linesTotalPaise, 99999);
  assert.equal(INV_B.totals.totalPaise, 100000);
  assert.equal(INV_B.totals.roundOffPaise, 1);
  assert.deepEqual(row(INV_I.lines[0]), [1, 3, 150000, 0, 0, 27000, 27000, 177000]);
  assert.equal(INV_I.supply.type, 'INTER');
  assert.equal(INV_I.totals.roundOffPaise, 0);
});

// ---- T81 to T97: X01 to X17 ----
test('T81 X01: full credit of INV-A', () => {
  const n = note(INV_A, { kind: 'FULL' });
  assert.equal(n.ok, true);
  assert.equal(n.kind, 'FULL');
  assert.deepEqual(n.lines.map(row), [[1, 3, 150000, 13500, 13500, 0, 27000, 177000], [2, 1, 80000, 7200, 7200, 0, 14400, 94400]]);
  assert.equal(n.linesTotalPaise, 271400);
  assert.equal(n.totalPaise, 271400);
  assert.equal(n.roundOffPaise, 0);
  assert.equal(n.taxablePaise, 230000);
  assert.equal(n.cgstPaise, 20700);
  assert.equal(n.sgstPaise, 20700);
  assert.equal(n.igstPaise, 0);
  assert.equal(n.taxPaise, 41400);
  assert.equal(n.remainingAfter.billRemainingPaise, 0);
  assert.deepEqual(n.remainingAfter.lines, [{ lineNo: 1, qty: 0, taxablePaise: 0, taxPaise: 0 }, { lineNo: 2, qty: 0, taxablePaise: 0, taxPaise: 0 }]);
});
test('T82 X02: one piece of three', () => {
  const n = note(INV_A, lines({ lineNo: 1, qty: 1 }));
  assert.equal(n.ok, true);
  assert.equal(n.kind, 'LINES');
  assert.deepEqual(n.lines.map(row), [[1, 1, 50000, 4500, 4500, 0, 9000, 59000]]);
  assert.equal(n.totalPaise, 59000);
  assert.equal(n.roundOffPaise, 0);
  assert.deepEqual(n.remainingAfter.lines[0], { lineNo: 1, qty: 2, taxablePaise: 100000, taxPaise: 18000 });
  assert.equal(n.remainingAfter.billRemainingPaise, 212400);
});
test('T83 X03: the last (only) piece of line 2 takes the whole line', () => {
  const n = note(INV_A, lines({ lineNo: 2, qty: 1 }));
  assert.deepEqual(n.lines.map(row), [[2, 1, 80000, 7200, 7200, 0, 14400, 94400]]);
  assert.equal(n.totalPaise, 94400);
});
test('T84 X04: a price correction of Rs 100 on the labour line', () => {
  const n = note(INV_A, lines({ lineNo: 2, taxablePaise: 10000 }));
  assert.deepEqual(n.lines.map(row), [[2, 0, 10000, 900, 900, 0, 1800, 11800]]);
  assert.equal(n.totalPaise, 11800);
  assert.equal(n.roundOffPaise, 0);
  assert.deepEqual(n.remainingAfter.lines[1], { lineNo: 2, qty: 1, taxablePaise: 70000, taxPaise: 12600 });
});
test('T85 X05a: first of three pieces of INV-B (round-off -33)', () => {
  const n = note(INV_B, lines({ lineNo: 1, qty: 1 }));
  assert.deepEqual(n.lines.map(row), [[1, 1, 28248, 2543, 2542, 0, 5085, 33333]]);
  assert.equal(n.linesTotalPaise, 33333);
  assert.equal(n.totalPaise, 33300);
  assert.equal(n.roundOffPaise, -33);
});
const B1 = note(INV_B, lines({ lineNo: 1, qty: 1 }));
test('T86 X05b: second piece (round-off +66, note total 33400)', () => {
  const n = note(INV_B, lines({ lineNo: 1, qty: 1 }), [B1]);
  assert.deepEqual(n.lines.map(row), [[1, 1, 28249, 2543, 2542, 0, 5085, 33334]]);
  assert.equal(n.linesTotalPaise, 33334);
  assert.equal(n.totalPaise, 33400);
  assert.equal(n.roundOffPaise, 66);
});
test('T87 X05c: the last piece takes the exact remainder (round-off -32, note total 33300)', () => {
  const B2 = note(INV_B, lines({ lineNo: 1, qty: 1 }), [B1]);
  const n = note(INV_B, lines({ lineNo: 1, qty: 1 }), [B1, B2]);
  assert.deepEqual(n.lines.map(row), [[1, 1, 28248, 2541, 2543, 0, 5084, 33332]]);
  assert.equal(n.linesTotalPaise, 33332);
  assert.equal(n.totalPaise, 33300);
  assert.equal(n.roundOffPaise, -32);
  assert.equal(n.remainingAfter.billRemainingPaise, 0);
  assert.equal(B1.totalPaise + B2.totalPaise + n.totalPaise, 100000, 'the three notes add up to the invoice total');
});
test('T88 X05d: a fourth piece is refused', () => {
  const B2 = note(INV_B, lines({ lineNo: 1, qty: 1 }), [B1]);
  const B3 = note(INV_B, lines({ lineNo: 1, qty: 1 }), [B1, B2]);
  expectFail(note(INV_B, lines({ lineNo: 1, qty: 1 }), [B1, B2, B3]), 'CREDIT_EXCEEDS_LINE');
  expectFail(note(INV_B, { kind: 'FULL' }, [B1, B2, B3]), 'CREDIT_NOTHING');
});
test('T89 X06: a full credit after the first piece (round-off +34, note total 66700)', () => {
  const n = note(INV_B, { kind: 'FULL' }, [B1]);
  assert.deepEqual(n.lines.map(row), [[1, 2, 56497, 5084, 5085, 0, 10169, 66666]]);
  assert.equal(n.linesTotalPaise, 66666);
  assert.equal(n.totalPaise, 66700);
  assert.equal(n.roundOffPaise, 34);
  assert.equal(B1.totalPaise + n.totalPaise, 100000);
});
test('T90 X07: a credit on an inter-state invoice is all IGST', () => {
  const n = note(INV_I, lines({ lineNo: 1, qty: 2 }));
  assert.deepEqual(n.lines.map(row), [[1, 2, 100000, 0, 0, 18000, 18000, 118000]]);
  assert.equal(n.totalPaise, 118000);
  assert.equal(n.cgstPaise + n.sgstPaise, 0);
  assert.equal(n.igstPaise, 18000);
});
test('T91 X08a to X08c: price corrections that add up', () => {
  const a = note(INV_A, lines({ lineNo: 2, taxablePaise: 30000 }));
  assert.deepEqual(a.lines.map(row), [[2, 0, 30000, 2700, 2700, 0, 5400, 35400]]);
  assert.equal(a.totalPaise, 35400);
  expectFail(note(INV_A, lines({ lineNo: 2, taxablePaise: 60000 }), [a]), 'CREDIT_EXCEEDS_TAXABLE');
  const c = note(INV_A, lines({ lineNo: 2, taxablePaise: 50000 }), [a]);
  assert.deepEqual(c.lines.map(row), [[2, 0, 50000, 4500, 4500, 0, 9000, 59000]]);
  assert.equal(c.totalPaise, 59000);
  assert.equal(c.linesTotalPaise, 59000);
  // A-CALC fix: the goods of line 2 can still come back, as a note with no money (so they can return to stock)
  const rest = note(INV_A, lines({ lineNo: 2, qty: 1 }), [a, c]);
  assert.equal(rest.ok, true, 'a line with no money left still takes its goods back');
  assert.deepEqual(rest.lines.map(row), [[2, 1, 0, 0, 0, 0, 0, 0]]);
  assert.equal(rest.linesTotalPaise, 0);
  assert.equal(rest.totalPaise, 0);
  assert.equal(rest.roundOffPaise, 0);
  assert.equal(rest.remainingAfter.billRemainingPaise, 271400 - 35400 - 59000);
  // the same through a full credit: line 1 in full, line 2 goods only
  const full = note(INV_A, { kind: 'FULL' }, [a, c]);
  assert.deepEqual(full.lines.map(row), [[1, 3, 150000, 13500, 13500, 0, 27000, 177000], [2, 1, 0, 0, 0, 0, 0, 0]]);
  // once the goods are back there is nothing left
  expectFail(note(INV_A, { kind: 'FULL' }, [a, c, rest, note(INV_A, lines({ lineNo: 1, qty: 3 }), [a, c, rest])]), 'CREDIT_NOTHING');
});
test('A-CALC: a 100 percent discounted bill (W18 style) can still take the goods back with a zero-value note', () => {
  const b = Calc.computeBill({ lines: [{ kind: 'PART', code: 'P1', name: 'A', hsnSac: '9101', rateBp: 1800, priceBasis: 'EXCL', unitPricePaise: 100000, qty: 2 }], billDiscountPaise: 236000 });
  assert.equal(b.totals.totalPaise, 0);
  const n1 = note(b, lines({ lineNo: 1, qty: 1 }));
  assert.deepEqual(n1.lines.map(row), [[1, 1, 0, 0, 0, 0, 0, 0]]);
  assert.equal(n1.totalPaise, 0);
  const n2 = note(b, { kind: 'FULL' }, [n1]);
  assert.deepEqual(n2.lines.map(row), [[1, 1, 0, 0, 0, 0, 0, 0]]);
  expectFail(note(b, { kind: 'FULL' }, [n1, n2]), 'CREDIT_NOTHING');
});
test('T92 X09: an earlier note whose total is not the running rounding is refused', () => {
  const a = note(INV_A, lines({ lineNo: 2, taxablePaise: 30000 }));
  const bad = Object.assign(clone(a), { linesTotalPaise: 35400, totalPaise: 35000 });
  expectFail(note(INV_A, { kind: 'FULL' }, [bad]), 'CREDIT_PRIOR_INVALID');
  expectFail(Calc.creditRemaining(INV_A, [bad]), 'CREDIT_PRIOR_INVALID');
});
test('T93 X10, X11: nothing left to credit', () => {
  const full = note(INV_A, { kind: 'FULL' });
  expectFail(note(INV_A, { kind: 'FULL' }, [full]), 'CREDIT_NOTHING');
  expectFail(note(INV_A, lines()), 'CREDIT_NOTHING');
});
test('T94 X12, X13: a line twice, a line that is not on the invoice', () => {
  expectFail(note(INV_A, lines({ lineNo: 1, qty: 1 }, { lineNo: 1, qty: 1 })), 'CREDIT_DUPLICATE_LINE');
  expectFail(note(INV_A, lines({ lineNo: 9, qty: 1 })), 'CREDIT_LINE_UNKNOWN');
  expectFail(note(INV_A, lines({ lineNo: 3, qty: 1 })), 'CREDIT_LINE_UNKNOWN');
});
test('T95 X14, X15: both keys, neither key, too many pieces', () => {
  expectFail(note(INV_A, lines({ lineNo: 1, qty: 1, taxablePaise: 100 })), 'CREDIT_KIND_CONFLICT');
  expectFail(note(INV_A, lines({ lineNo: 1 })), 'CREDIT_KIND_CONFLICT');
  expectFail(note(INV_A, lines({ lineNo: 1, qty: 4 })), 'CREDIT_EXCEEDS_LINE');
});
const W19 = Calc.computeBill(billInput(FX.find((e) => e.id === 'W19')));
const W20 = Calc.computeBill(billInput(FX.find((e) => e.id === 'W20')));
test('T96 X16: an invoice where every line is no-charge cannot be credited', () => {
  expectFail(note(W19, { kind: 'FULL' }), 'NOCHARGE_NO_CREDIT');
  expectFail(note(W19, lines({ lineNo: 1, qty: 1 })), 'NOCHARGE_NO_CREDIT');
});
test('T97 X17: a no-charge line of a mixed invoice cannot be credited; a full credit leaves it out', () => {
  expectFail(note(W20, lines({ lineNo: 1, qty: 1 })), 'CREDIT_LINE_NOCHARGE');
  const n = note(W20, { kind: 'FULL' });
  assert.deepEqual(n.lines.map(row), [[2, 1, 50000, 4500, 4500, 0, 9000, 59000]]);
  assert.equal(n.totalPaise, 59000);
});
test('T97b: a credit on an invoice with line and bill discounts (W13), full credit', () => {
  const w13 = Calc.computeBill(billInput(FX.find((e) => e.id === 'W13')));
  const n = note(w13, { kind: 'FULL' });
  assert.deepEqual(n.lines.map(row), [[1, 1, 63000, 5670, 5670, 0, 11340, 74340], [2, 1, 45000, 4050, 4050, 0, 8100, 53100]]);
  assert.equal(n.linesTotalPaise, 127440);
  assert.equal(n.totalPaise, 127400);
  assert.equal(n.roundOffPaise, -40);
  assert.equal(n.remainingAfter.billRemainingPaise, 0);
});

// ---- T98: the chain of X05 ----
test('T98: the three notes of INV-B add up to the invoice total, step by step', () => {
  const n1 = note(INV_B, lines({ lineNo: 1, qty: 1 }));
  const n2 = note(INV_B, lines({ lineNo: 1, qty: 1 }), [n1]);
  const n3 = note(INV_B, lines({ lineNo: 1, qty: 1 }), [n1, n2]);
  assert.deepEqual([n1.totalPaise, n2.totalPaise, n3.totalPaise], [33300, 33400, 33300]);
  assert.deepEqual([n1.remainingAfter.billRemainingPaise, n2.remainingAfter.billRemainingPaise, n3.remainingAfter.billRemainingPaise], [66700, 33300, 0]);
});

// ---- T99 to T103 (property tests on 20,000 bills are in svc2-calc-invariants.test.mjs); here the direct checks ----
test('T99: note totals are whole rupees and round-off stays below one rupee', () => {
  for (const n of [B1, note(INV_B, { kind: 'FULL' }, [B1]), note(INV_A, lines({ lineNo: 1, qty: 1 })), note(INV_A, lines({ lineNo: 2, taxablePaise: 12345 }))]) {
    assert.equal(n.totalPaise % 100, 0);
    assert.ok(n.totalPaise >= 0);
    assert.ok(Math.abs(n.roundOffPaise) < 100);
    assert.equal(n.taxPaise, n.cgstPaise + n.sgstPaise + n.igstPaise);
    for (const l of n.lines) assert.equal(l.taxPaise, l.cgstPaise + l.sgstPaise + l.igstPaise);
  }
});
test('T100: price correction of 12345 paise on the labour line, worked by hand', () => {
  // tax = 14400 x 12345 / 80000 = 2222.1 -> 2222; CGST floor(2223/2) = 1111, SGST 1111; line total 14567; note 14600; round-off +33
  const n = note(INV_A, lines({ lineNo: 2, taxablePaise: 12345 }));
  assert.deepEqual(n.lines.map(row), [[2, 0, 12345, 1111, 1111, 0, 2222, 14567]]);
  assert.equal(n.totalPaise, 14600);
  assert.equal(n.roundOffPaise, 33);
});
test('T101: a request in any line order gives the lines in invoice order', () => {
  const n = note(INV_A, lines({ lineNo: 2, qty: 1 }, { lineNo: 1, qty: 3 }));
  assert.deepEqual(n.lines.map((l) => l.lineNo), [1, 2]);
  assert.equal(n.totalPaise, 271400);
});
test('T102: key order of a credit note', () => {
  const n = note(INV_A, lines({ lineNo: 1, qty: 1 }));
  assert.deepEqual(Object.keys(n), [
    'ok', 'kind', 'lines', 'linesTotalPaise', 'taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'taxPaise', 'roundOffPaise',
    'totalPaise', 'remainingAfter'
  ]);
  assert.deepEqual(Object.keys(n.lines[0]), ['lineNo', 'qty', 'taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'taxPaise', 'totalPaise']);
  assert.deepEqual(Object.keys(n.remainingAfter), ['lines', 'billRemainingPaise']);
  assert.deepEqual(Object.keys(n.remainingAfter.lines[0]), ['lineNo', 'qty', 'taxablePaise', 'taxPaise']);
});
test('T103: request refusals', () => {
  for (const bad of [undefined, null, 'FULL', [], {}, { kind: 'X' }, { kind: 'FULL', extra: 1 }, { kind: 'LINES' }, { kind: 'LINES', lines: 'x' }, { kind: 'LINES', lines: [], extra: 1 }]) {
    expectFail(note(INV_A, bad), 'CREDIT_REQUEST_INVALID');
  }
  for (const el of [null, 5, 'a', [], { qty: 1 }, { lineNo: 'a', qty: 1 }, { lineNo: 0, qty: 1 }, { lineNo: 1.5, qty: 1 }, { lineNo: 1, qty: 1, color: 'x' }]) {
    expectFail(note(INV_A, lines(el)), 'CREDIT_REQUEST_INVALID');
  }
  for (const q of [0, -1, 1.5, '1', null, NaN]) expectFail(note(INV_A, lines({ lineNo: 1, qty: q })), 'CREDIT_QTY_INVALID');
  for (const t of [0, -5, 1.5, '5', NaN]) expectFail(note(INV_A, lines({ lineNo: 2, taxablePaise: t })), 'CREDIT_TAXABLE_INVALID');
});

// ---- T104 to T109 ----
test('T104: creditRemaining after X05a and after X05a and X05b', () => {
  const B2 = note(INV_B, lines({ lineNo: 1, qty: 1 }), [B1]);
  assert.deepEqual(Calc.creditRemaining(INV_B, []), {
    ok: true, lines: [{ lineNo: 1, qty: 3, taxablePaise: 84745, cgstPaise: 7627, sgstPaise: 7627, igstPaise: 0, taxPaise: 15254 }], billRemainingPaise: 100000
  });
  assert.deepEqual(Calc.creditRemaining(INV_B, [B1]), {
    ok: true, lines: [{ lineNo: 1, qty: 2, taxablePaise: 56497, cgstPaise: 5084, sgstPaise: 5085, igstPaise: 0, taxPaise: 10169 }], billRemainingPaise: 66700
  });
  assert.deepEqual(Calc.creditRemaining(INV_B, [B1, B2]), {
    ok: true, lines: [{ lineNo: 1, qty: 1, taxablePaise: 28248, cgstPaise: 2541, sgstPaise: 2543, igstPaise: 0, taxPaise: 5084 }], billRemainingPaise: 33300
  });
});
test('T105: the bill without its input gives the same note; the bill and priors are not changed', () => {
  const stored = clone(INV_A);
  delete stored.input;
  const a = note(stored, lines({ lineNo: 1, qty: 2 }));
  assert.deepEqual(a, note(INV_A, lines({ lineNo: 1, qty: 2 })));
  const frozenBill = deepFreeze(clone(INV_B));
  const frozenPrior = deepFreeze(clone(B1));
  const frozenReq = deepFreeze({ kind: 'FULL' });
  assert.equal(Calc.computeCreditNote(frozenBill, frozenReq, [frozenPrior]).ok, true);
  assert.equal(Calc.creditRemaining(frozenBill, [frozenPrior]).ok, true);
});
test('T106: billRemainingPaise is the invoice total minus all note totals', () => {
  const n1 = note(INV_A, lines({ lineNo: 1, qty: 1 }));
  const n2 = note(INV_A, lines({ lineNo: 2, taxablePaise: 12345 }), [n1]);
  assert.equal(n1.remainingAfter.billRemainingPaise, 271400 - n1.totalPaise);
  assert.equal(n2.remainingAfter.billRemainingPaise, 271400 - n1.totalPaise - n2.totalPaise);
  assert.equal(Calc.creditRemaining(INV_A, [n1, n2]).billRemainingPaise, n2.remainingAfter.billRemainingPaise);
});
test('T107: a credit on an inter-state invoice never has CGST or SGST', () => {
  for (const req of [{ kind: 'FULL' }, lines({ lineNo: 1, qty: 1 }), lines({ lineNo: 1, taxablePaise: 777 })]) {
    const n = note(INV_I, req);
    assert.equal(n.ok, true);
    assert.equal(n.cgstPaise, 0);
    assert.equal(n.sgstPaise, 0);
    assert.equal(n.igstPaise, n.taxPaise);
    for (const l of n.lines) assert.equal(l.cgstPaise + l.sgstPaise, 0);
  }
});
test('T108: CREDIT_BILL_INVALID for a non-bill, a failure object, an unknown version and a damaged bill', () => {
  const failed = Calc.computeBill({ lines: [] });
  const wrongVersion = Object.assign(clone(INV_A), { calcVersion: 'SBC-9' });
  const noLines = Object.assign(clone(INV_A), { lines: [] });
  const wrongTotal = clone(INV_A);
  wrongTotal.totals.totalPaise += 100;
  const wrongLine = clone(INV_A);
  wrongLine.lines[0].totalPaise += 1;
  const wrongSupply = clone(INV_A);
  wrongSupply.supply.type = 'BOTH';
  for (const bad of [undefined, null, 0, 'bill', [], {}, failed, wrongVersion, noLines, wrongTotal, wrongLine, wrongSupply]) {
    expectFail(note(bad, { kind: 'FULL' }), 'CREDIT_BILL_INVALID');
    expectFail(Calc.creditRemaining(bad, []), 'CREDIT_BILL_INVALID');
  }
});
test('T109: an earlier note that has been changed is detected', () => {
  const a = note(INV_A, lines({ lineNo: 2, taxablePaise: 30000 }));
  const FULL = { kind: 'FULL' };
  // one paisa more on a line breaks the line sum
  const t1 = clone(a); t1.lines[0].taxablePaise += 1;
  expectFail(note(INV_A, FULL, [t1]), 'CREDIT_PRIOR_INVALID');
  // CGST one paisa more breaks the tax sum
  const t2 = clone(a); t2.lines[0].cgstPaise += 1;
  expectFail(note(INV_A, FULL, [t2]), 'CREDIT_PRIOR_INVALID');
  // an amount larger than the invoice line had makes a remainder negative
  const t4 = clone(a);
  t4.lines[0] = { lineNo: 2, qty: 0, taxablePaise: 80001, cgstPaise: 7200, sgstPaise: 7200, igstPaise: 0, taxPaise: 14400, totalPaise: 94401 };
  t4.linesTotalPaise = 94401; t4.totalPaise = 94400;
  expectFail(note(INV_A, FULL, [t4]), 'CREDIT_PRIOR_INVALID');
  // a note with a line the invoice does not have
  const t5 = clone(a); t5.lines[0].lineNo = 3;
  expectFail(note(INV_A, FULL, [t5]), 'CREDIT_PRIOR_INVALID');
  // totals that do not match the lines
  const t6 = clone(a); t6.linesTotalPaise += 1;
  expectFail(note(INV_A, FULL, [t6]), 'CREDIT_PRIOR_INVALID');
  // the note total altered by a whole rupee
  const t7 = clone(a); t7.totalPaise += 100;
  expectFail(note(INV_A, FULL, [t7]), 'CREDIT_PRIOR_INVALID');
  // notes that together are more than the invoice
  const full = note(INV_A, FULL);
  expectFail(note(INV_A, FULL, [full, full]), 'CREDIT_PRIOR_INVALID');
  for (const bad of [undefined, null, 'x', {}, [null], [{}], [5]]) expectFail(Calc.computeCreditNote(INV_A, FULL, bad), 'CREDIT_PRIOR_INVALID');
  // a note exceeding what remains cannot be asked for in one step either
  assert.equal(note(INV_A, FULL, [a]).ok, true);
});

// ---- T110: settle, Y01 to Y11 ----
const S = (payable, receipts, credit, refunds) => {
  const i = { payablePaise: payable, receiptsPaise: receipts };
  if (credit !== undefined) i.creditTotalPaise = credit;
  if (refunds !== undefined) i.refundsPaise = refunds;
  return Calc.settle(i);
};
const pick = (r) => [r.netPayablePaise, r.netReceivedPaise, r.appliedPaise, r.balanceDuePaise, r.refundDuePaise, r.status];
test('T110 Y01: part payment', () => {
  const r = S(271400, [100000]);
  assert.equal(r.ok, true);
  assert.deepEqual(pick(r), [271400, 100000, 100000, 171400, 0, 'PART_PAID']);
});
test('T110 Y02: an advance larger than the bill', () => {
  assert.deepEqual(pick(S(271400, [300000])), [271400, 300000, 271400, 0, 28600, 'OVERPAID']);
});
test('T110 Y03: paid in two receipts', () => {
  assert.deepEqual(pick(S(271400, [100000, 171400])), [271400, 271400, 271400, 0, 0, 'PAID']);
});
test('T110 Y04: a credit note after full payment leaves a refund due', () => {
  assert.deepEqual(pick(S(271400, [271400], 59000)), [212400, 271400, 212400, 0, 59000, 'OVERPAID']);
});
test('T110 Y05: a credit note on a part-paid invoice first reduces the balance', () => {
  assert.deepEqual(pick(S(271400, [100000], 59000)), [212400, 100000, 100000, 112400, 0, 'PART_PAID']);
});
test('T110 Y06: refunded after the credit note', () => {
  assert.deepEqual(pick(S(271400, [271400], 59000, [59000])), [212400, 212400, 212400, 0, 0, 'PAID']);
});
test('T110 Y07, Y08: a no-charge bill is paid; an unpaid bill is unpaid', () => {
  assert.deepEqual(pick(S(0, [], 0)), [0, 0, 0, 0, 0, 'PAID']);
  assert.deepEqual(pick(S(100000, [])), [100000, 0, 0, 100000, 0, 'UNPAID']);
});
test('T110 Y09 to Y11: refusals', () => {
  expectFail(S(100000, [50000], 0, [60000]), 'REFUNDS_EXCEED_RECEIPTS');
  expectFail(S(100000, [100000], 100100), 'CREDIT_EXCEEDS_INVOICE');
  expectFail(S(100000, [100.5]), 'SETTLE_INVALID');
});
test('T110: settle echoes its figures and refuses bad shapes', () => {
  const r = S(271400, [100000], 59000, [10000]);
  assert.deepEqual(r, {
    ok: true, payablePaise: 271400, creditTotalPaise: 59000, netPayablePaise: 212400, receivedPaise: 100000, refundedPaise: 10000,
    netReceivedPaise: 90000, appliedPaise: 90000, balanceDuePaise: 122400, refundDuePaise: 0, status: 'PART_PAID'
  });
  for (const bad of [null, undefined, 5, 'x', [], {}, { payablePaise: 1 }, { payablePaise: -1, receiptsPaise: [] }, { payablePaise: 1.5, receiptsPaise: [] },
    { payablePaise: 1, receiptsPaise: 'x' }, { payablePaise: 1, receiptsPaise: [-1] }, { payablePaise: 1, receiptsPaise: ['5'] },
    { payablePaise: 1, receiptsPaise: [], refundsPaise: 'x' }, { payablePaise: 1, receiptsPaise: [], creditTotalPaise: -1 },
    { payablePaise: 1, receiptsPaise: [], other: 1 }, { payablePaise: 1, receiptsPaise: [NaN] }]) {
    expectFail(Calc.settle(bad), 'SETTLE_INVALID');
  }
  const frozen = deepFreeze({ payablePaise: 5, receiptsPaise: [5], refundsPaise: [], creditTotalPaise: 0 });
  assert.equal(Calc.settle(frozen).status, 'PAID');
});
test('T110: settle from a real invoice and a real credit note', () => {
  const n = note(INV_A, lines({ lineNo: 1, qty: 1 }));
  const r = Calc.settle({ payablePaise: INV_A.totals.totalPaise, receiptsPaise: [100000, 50000], creditTotalPaise: n.totalPaise });
  assert.deepEqual(pick(r), [212400, 150000, 150000, 62400, 0, 'PART_PAID']);
});

// ---- A-CALC auditor example E10 (worked by hand in service-wave-2\reports\calc-audit.md) ----
test('A-CALC E10: a price correction, a piece, then a full credit add up exactly to the invoice', () => {
  const inv = Calc.computeBill({ lines: [part({ priceBasis: 'INCL', unitPricePaise: 33333, qty: 3 }), labour({ unitPricePaise: 12345 })] });
  assert.deepEqual([inv.totals.linesTotalPaise, inv.totals.roundOffPaise, inv.totals.totalPaise], [114566, 34, 114600]);
  const n1 = note(inv, lines({ lineNo: 2, taxablePaise: 5000 }, { lineNo: 1, qty: 1 }));
  assert.deepEqual(n1.lines.map(row), [[1, 1, 28248, 2543, 2542, 0, 5085, 33333], [2, 0, 5000, 450, 450, 0, 900, 5900]]);
  assert.deepEqual([n1.linesTotalPaise, n1.totalPaise, n1.roundOffPaise], [39233, 39200, -33]);
  const n2 = note(inv, lines({ lineNo: 1, qty: 1 }), [n1]);
  assert.deepEqual(n2.lines.map(row), [[1, 1, 28249, 2543, 2542, 0, 5085, 33334]]);
  assert.deepEqual([n2.totalPaise, n2.roundOffPaise], [33400, 66]);
  expectFail(note(inv, lines({ lineNo: 2, taxablePaise: 7346 }), [n1, n2]), 'CREDIT_EXCEEDS_TAXABLE');
  const n3 = note(inv, { kind: 'FULL' }, [n1, n2]);
  assert.deepEqual(n3.lines.map(row), [[1, 1, 28248, 2541, 2543, 0, 5084, 33332], [2, 1, 7345, 661, 661, 0, 1322, 8667]]);
  assert.deepEqual([n3.linesTotalPaise, n3.totalPaise, n3.roundOffPaise, n3.remainingAfter.billRemainingPaise], [41999, 42000, 1, 0]);
  assert.equal(n1.totalPaise + n2.totalPaise + n3.totalPaise, 114600);
  expectFail(note(inv, { kind: 'FULL' }, [n1, n2, n3]), 'CREDIT_NOTHING');
});
test('A-CALC: SGST of a credit line never goes above what the invoice has left, even after an odd earlier split', () => {
  // an earlier note (consistent figures) that took all the SGST of line 2 and none of its CGST
  const prior = { lines: [{ lineNo: 2, qty: 0, taxablePaise: 40000, cgstPaise: 0, sgstPaise: 7200, igstPaise: 0, taxPaise: 7200, totalPaise: 47200 }], linesTotalPaise: 47200, totalPaise: 47200 };
  const n = note(INV_A, lines({ lineNo: 2, taxablePaise: 20000 }), [prior]);
  assert.deepEqual(n.lines.map(row), [[2, 0, 20000, 3600, 0, 0, 3600, 23600]]);
  const rem = Calc.creditRemaining(INV_A, [prior, n]);
  assert.deepEqual([rem.lines[1].cgstPaise, rem.lines[1].sgstPaise], [3600, 0]);
});
test('A-CALC: a stored bill with figures above the bill limit is refused before any multiplication', () => {
  const t = clone(INV_A);
  t.lines[0].taxablePaise = 4000000000000000;
  t.lines[0].totalPaise = t.lines[0].taxablePaise + t.lines[0].taxPaise;
  t.totals.linesTotalPaise = t.lines[0].totalPaise + t.lines[1].totalPaise;
  t.totals.totalPaise = Math.floor((2 * t.totals.linesTotalPaise + 100) / 200) * 100;
  expectFail(note(t, lines({ lineNo: 1, qty: 1 })), 'CREDIT_BILL_INVALID');
  expectFail(Calc.creditRemaining(t, []), 'CREDIT_BILL_INVALID');
  const q = clone(INV_A);
  q.lines[0].qty = 10000;
  expectFail(note(q, lines({ lineNo: 1, qty: 1 })), 'CREDIT_BILL_INVALID');
});
