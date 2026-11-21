// Service wave 2, writer W-CALC: invariants on 20,000 seeded random bills, a second (BigInt) check of every line, and credit-note chains.
// Fixed seed. No Math.random. The generator lives in tests/lib/svc2-calc-load.mjs.
// The BigInt check below is a second, separately written reading of the same rules (P2 sections 3 and 5). It is a cross-check, not a
// replacement for the hand-typed worked examples in svc2-calc-bill.test.mjs, which are the primary evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Calc, makeRng, randomBillInput, ROW_FIELDS } from './lib/svc2-calc-load.mjs';

const SEED = 20261118;
const BILLS_N = 20000;

const rd = (n, d) => (2n * n + d) / (2n * d);

function bigAllocate(total, weights) {
  const W = weights.reduce((a, x) => a + x, 0n);
  const base = weights.map((w) => (total * w) / W);
  const rem = weights.map((w, i) => total * w - base[i] * W);
  let left = total - base.reduce((a, x) => a + x, 0n);
  const order = weights.map((w, i) => i).filter((i) => weights[i] > 0n).sort((a, b) => (rem[b] > rem[a] ? 1 : rem[b] < rem[a] ? -1 : a - b));
  const out = base.slice();
  for (let k = 0; left > 0n; k += 1, left -= 1n) out[order[k]] += 1n;
  return out;
}

function bigBill(echo) {
  const rows = echo.lines.map((l) => {
    const A = BigInt(l.unitPricePaise) * BigInt(l.qty);
    const r = BigInt(l.rateBp);
    const A1 = l.noCharge ? 0n : A - BigInt(l.discountPaise);
    const P = l.noCharge ? 0n : (l.priceBasis === 'INCL' ? A1 : A1 + rd(A1 * r, 10000n));
    return { l, A, A1, P, r };
  });
  const W = rows.reduce((a, x) => a + x.P, 0n);
  const D = BigInt(echo.billDiscountPaise);
  const shares = D > 0n ? bigAllocate(D, rows.map((x) => x.P)) : rows.map(() => 0n);
  const intra = !echo.recipientGstin || echo.recipientGstin.slice(0, 2) === echo.sellerStateCode;
  return { W, shares, intra, rows: rows.map((x, i) => {
    const s = shares[i];
    let N; let taxable; let tax;
    if (x.l.noCharge) { N = 0n; taxable = 0n; tax = 0n; } else if (x.l.priceBasis === 'INCL') {
      N = x.A1 - s; taxable = rd(N * 10000n, 10000n + x.r); tax = N - taxable;
    } else {
      const e = s === x.P ? x.A1 : (() => { const q = rd(s * 10000n, 10000n + x.r); return q < x.A1 ? q : x.A1; })();
      N = x.A1 - e; taxable = N; tax = rd(N * x.r, 10000n);
    }
    const cgst = intra ? (tax + 1n) / 2n : 0n;
    return { A: x.A, A1: x.A1, P: x.P, s, N, taxable, tax, cgst, sgst: intra ? tax - cgst : 0n, igst: intra ? 0n : tax, total: taxable + tax };
  }) };
}

test('20,000 seeded bills hold invariants I1 to I8 and agree with the BigInt cross-check', () => {
  const rng = makeRng(SEED);
  let withDiscount = 0; let inter = 0; let inclusive = 0; let noCharge = 0; let zero = 0; let lineDiscounts = 0;
  const roundOffs = new Set();
  for (let n = 0; n < BILLS_N; n += 1) {
    const { input, base: b } = randomBillInput(rng);
    assert.equal(b.ok, true, 'bill ' + n + ' ' + JSON.stringify(input));
    const t = b.totals;
    // I1, I2
    assert.equal(b.lines.reduce((a, l) => a + l.totalPaise, 0), t.linesTotalPaise);
    assert.equal(t.taxPaise, t.cgstPaise + t.sgstPaise + t.igstPaise);
    // I3
    assert.ok(Math.abs(t.roundOffPaise) <= 50 && t.roundOffPaise >= -49);
    assert.equal(t.totalPaise % 100, 0);
    roundOffs.add(t.roundOffPaise);
    // I4
    assert.equal(b.lines.reduce((a, l) => a + l.billDiscountSharePaise, 0), t.billDiscountPaise);
    for (const l of b.lines) {
      assert.ok(l.billDiscountSharePaise <= l.payableWeightPaise);
      for (const f of ROW_FIELDS) assert.ok(Number.isSafeInteger(l[f]) && l[f] >= 0);
      // I5, I6
      if (!l.noCharge) {
        assert.ok(l.netPaise >= 0 && l.taxablePaise <= l.netPaise);
        if (l.priceBasis === 'INCL') assert.equal(l.totalPaise, l.netPaise);
      } else assert.equal(l.totalPaise, 0);
      assert.equal(l.taxPaise, l.cgstPaise + l.sgstPaise + l.igstPaise);
    }
    // rate groups and HSN summary add up
    assert.equal(b.rateGroups.reduce((a, g) => a + g.totalPaise, 0), t.linesTotalPaise);
    assert.equal(b.hsnSummary.reduce((a, g) => a + g.taxablePaise, 0), t.taxablePaise);
    assert.equal(b.split.part.totalPaise + b.split.labour.totalPaise + b.split.other.totalPaise, t.linesTotalPaise);
    // I8
    assert.equal(Calc.verifyBill(b).ok, true);
    // the input is never changed and the same input gives the same bill
    assert.equal(JSON.stringify(Calc.computeBill(input)), JSON.stringify(b));
    // BigInt cross-check of every line
    const big = bigBill(b.input);
    assert.equal(big.W, BigInt(b.lines.reduce((a, l) => a + l.payableWeightPaise, 0)));
    b.lines.forEach((l, i) => {
      const o = big.rows[i];
      assert.equal(BigInt(l.listPaise), o.A, 'list ' + n);
      assert.equal(BigInt(l.priceAfterLineDiscountPaise), o.A1);
      assert.equal(BigInt(l.payableWeightPaise), o.P);
      assert.equal(BigInt(l.billDiscountSharePaise), o.s, 'share ' + n);
      assert.equal(BigInt(l.netPaise), o.N, 'net ' + n);
      assert.equal(BigInt(l.taxablePaise), o.taxable, 'taxable ' + n);
      assert.equal(BigInt(l.taxPaise), o.tax, 'tax ' + n);
      assert.equal(BigInt(l.cgstPaise), o.cgst);
      assert.equal(BigInt(l.sgstPaise), o.sgst);
      assert.equal(BigInt(l.igstPaise), o.igst);
      assert.equal(BigInt(l.totalPaise), o.total);
    });
    if (t.billDiscountPaise > 0) withDiscount += 1;
    if (b.supply.type === 'INTER') inter += 1;
    if (b.lines.some((l) => l.priceBasis === 'INCL' && !l.noCharge)) inclusive += 1;
    if (b.lines.some((l) => l.noCharge)) noCharge += 1;
    if (t.totalPaise === 0) zero += 1;
    if (t.lineDiscountPaise > 0) lineDiscounts += 1;
  }
  // the generator really exercised the interesting paths
  assert.ok(withDiscount > 5000, 'bill discounts ' + withDiscount);
  assert.ok(inter > 4000, 'inter-state ' + inter);
  assert.ok(inclusive > 10000, 'inclusive lines ' + inclusive);
  assert.ok(noCharge > 2000, 'no-charge lines ' + noCharge);
  assert.ok(lineDiscounts > 3000, 'line discounts ' + lineDiscounts);
  assert.ok(roundOffs.has(50) && roundOffs.has(-49) && roundOffs.has(0), 'round-off extremes reached');
  assert.ok(zero >= 1, 'a full-discount bill occurred');
});

function pickCreditStep(rng, rem, view) {
  // a random single-line request on a line that still has something to credit
  const open = rem.lines.filter((l, i) => !view.lines[i].noCharge && (l.qty > 0 || l.taxablePaise > 0));
  if (open.length === 0) return null;
  const l = open[rng.int(open.length)];
  const wantQty = l.qty > 0 && (l.taxablePaise === 0 || rng.int(3) > 0);
  if (wantQty) return { kind: 'LINES', lines: [{ lineNo: l.lineNo, qty: rng.range(1, l.qty) }] };
  return { kind: 'LINES', lines: [{ lineNo: l.lineNo, taxablePaise: rng.range(1, l.taxablePaise) }] };
}

test('credit chains on 20,000 seeded bills: notes sum exactly to the invoice and never exceed it', () => {
  const rng = makeRng(SEED + 1);
  let goodsOnly = 0; let exhausted = 0; let steps = 0; let nothing = 0; let negativeRound = 0; let positiveRound = 0;
  for (let n = 0; n < BILLS_N; n += 1) {
    const { base: bill } = randomBillInput(rng);
    assert.equal(bill.ok, true);
    if (bill.isNoCharge) {
      assert.equal(Calc.computeCreditNote(bill, { kind: 'FULL' }, []).code, 'NOCHARGE_NO_CREDIT');
      continue;
    }
    if (bill.totals.linesTotalPaise === 0) {
      // A-CALC fix: no money, but the goods can still come back with a zero-value note
      const z = Calc.computeCreditNote(bill, { kind: 'FULL' }, []);
      assert.equal(z.ok, true, 'zero-value goods note, bill ' + n);
      assert.equal(z.totalPaise, 0);
      assert.deepEqual(z.lines.map((l) => l.lineNo), bill.lines.filter((l) => !l.noCharge).map((l) => l.lineNo));
      z.lines.forEach((l) => assert.equal(l.qty, bill.lines[l.lineNo - 1].qty));
      continue;
    }
    const priors = [];
    let cumulative = 0;
    let linesSum = 0;
    const view = { lines: bill.lines };
    const wanted = rng.int(9);
    for (let s = 0; s <= wanted; s += 1) {
      const rem = Calc.creditRemaining(bill, priors);
      assert.equal(rem.ok, true, 'remaining ' + n);
      const req = s === wanted ? { kind: 'FULL' } : pickCreditStep(rng, rem, view);
      if (!req) break;
      const note = Calc.computeCreditNote(bill, req, priors);
      if (!note.ok) {
        assert.equal(note.code, 'CREDIT_NOTHING', 'only an empty note may be refused, got ' + JSON.stringify(note) + ' bill ' + n);
        nothing += 1;
        continue;
      }
      steps += 1;
      // note invariants
      assert.equal(note.totalPaise % 100, 0);
      assert.ok(note.totalPaise >= 0);
      assert.ok(Math.abs(note.roundOffPaise) < 100);
      assert.equal(note.totalPaise, note.linesTotalPaise + note.roundOffPaise);
      assert.equal(note.taxPaise, note.cgstPaise + note.sgstPaise + note.igstPaise);
      for (const l of note.lines) {
        assert.ok(l.cgstPaise >= 0 && l.sgstPaise >= 0 && l.igstPaise >= 0);
        assert.equal(l.taxPaise, l.cgstPaise + l.sgstPaise + l.igstPaise);
        assert.equal(l.totalPaise, l.taxablePaise + l.taxPaise);
        if (bill.supply.type === 'INTER') assert.equal(l.cgstPaise + l.sgstPaise, 0);
      }
      if (note.roundOffPaise < 0) negativeRound += 1;
      if (note.roundOffPaise > 0) positiveRound += 1;
      // I7: the note totals telescope to the rounded running sum, and never pass the invoice
      cumulative += note.totalPaise;
      linesSum += note.linesTotalPaise;
      assert.equal(cumulative, Math.floor((2 * linesSum + 100) / 200) * 100);
      assert.ok(cumulative <= bill.totals.totalPaise, 'credit above the invoice, bill ' + n);
      assert.equal(note.remainingAfter.billRemainingPaise, bill.totals.totalPaise - cumulative);
      priors.push(note);
      // no remainder is ever negative
      const after = Calc.creditRemaining(bill, priors);
      assert.equal(after.ok, true);
      for (const l of after.lines) {
        assert.ok(l.qty >= 0 && l.taxablePaise >= 0 && l.cgstPaise >= 0 && l.sgstPaise >= 0 && l.igstPaise >= 0 && l.taxPaise >= 0);
      }
      assert.equal(after.billRemainingPaise, bill.totals.totalPaise - cumulative);
    }
    // finish with a full credit (it may be empty when everything is already credited)
    const last = Calc.computeCreditNote(bill, { kind: 'FULL' }, priors);
    if (last.ok) {
      cumulative += last.totalPaise;
      linesSum += last.linesTotalPaise;
      priors.push(last);
    } else assert.equal(last.code, 'CREDIT_NOTHING');
    const fin = Calc.creditRemaining(bill, priors);
    fin.lines.forEach((l, i) => {
      if (bill.lines[i].noCharge) return;
      assert.deepEqual([l.taxablePaise, l.taxPaise, l.cgstPaise, l.sgstPaise, l.igstPaise], [0, 0, 0, 0, 0], 'line ' + (i + 1) + ' money closed, bill ' + n);
      // A-CALC fix: a full credit also takes back goods whose money is already credited, so nothing may stay.
      if (l.qty > 0) goodsOnly += 1;
    });
    // T-cn-sum: once every line is closed the note totals equal the invoice total exactly
    assert.equal(linesSum, bill.totals.linesTotalPaise);
    assert.equal(cumulative, bill.totals.totalPaise, 'notes sum to the invoice, bill ' + n);
    assert.equal(fin.billRemainingPaise, 0);
    // and a further full credit has nothing to give
    assert.equal(Calc.computeCreditNote(bill, { kind: 'FULL' }, priors).code, 'CREDIT_NOTHING');
    exhausted += 1;
  }
  assert.ok(exhausted > 15000, 'chains finished ' + exhausted);
  assert.ok(steps > 40000, 'notes made ' + steps);
  assert.ok(negativeRound > 1000 && positiveRound > 1000, 'both signs of round-off reached ' + negativeRound + ' ' + positiveRound);
  assert.equal(goodsOnly, 0, 'no goods stay on a line after a full credit: ' + goodsOnly);
});

test('credit chains of one piece at a time on a 99.99 inclusive line (three notes of 333.33 against 1000.00 style)', () => {
  // 10 pieces at Rs 100.00 inclusive, 18 percent: line total 100000. Each piece is a note; the notes must add up to 100000.
  const bill = Calc.computeBill({ lines: [{ kind: 'PART', code: 'P1', name: 'A', hsnSac: '9101', rateBp: 1800, priceBasis: 'INCL', unitPricePaise: 10000, qty: 10 }] });
  const priors = [];
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const n = Calc.computeCreditNote(bill, { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] }, priors);
    assert.equal(n.ok, true);
    assert.ok(Math.abs(n.totalPaise - 10000) <= 100, "each note is within one rupee of the piece price");
    priors.push(n);
    sum += n.totalPaise;
  }
  assert.equal(sum, 100000);
  // three notes of 333.33 against 1000.00 and three of 333.50 against 1001.00 (P2 section 10.4 remark), as one-piece notes
  const b3 = Calc.computeBill({ lines: [{ kind: 'PART', code: 'P1', name: 'A', hsnSac: '9101', rateBp: 0, priceBasis: 'EXCL', unitPricePaise: 33350, qty: 3 }] });
  assert.equal(b3.totals.linesTotalPaise, 100050);
  assert.equal(b3.totals.totalPaise, 100100);
  const p3 = [];
  let s3 = 0;
  for (let i = 0; i < 3; i += 1) {
    const n = Calc.computeCreditNote(b3, { kind: 'LINES', lines: [{ lineNo: 1, qty: 1 }] }, p3);
    p3.push(n);
    s3 += n.totalPaise;
    assert.ok(s3 <= 100100);
  }
  // by hand: 33350 -> 333.50 rounds to 334 (33400); 66700 -> 667 (66700 total, note 33300); 100050 -> 1001 (100100, note 33400)
  assert.deepEqual(p3.map((n) => n.totalPaise), [33400, 33300, 33400]);
  assert.equal(s3, 100100);
});

test('settle: applied plus balance equals the net payable, applied plus refund equals the net received (2,000 seeded cases)', () => {
  const rng = makeRng(SEED + 2);
  for (let i = 0; i < 2000; i += 1) {
    const payable = rng.int(2) === 0 ? rng.int(10000000) : rng.int(100) * 100;
    const credit = rng.int(payable + 1);
    const receipts = Array.from({ length: rng.int(4) }, () => rng.int(8000000));
    const got = receipts.reduce((a, x) => a + x, 0);
    const refunds = got > 0 && rng.int(3) === 0 ? [rng.int(got + 1)] : [];
    const r = Calc.settle({ payablePaise: payable, receiptsPaise: receipts, refundsPaise: refunds, creditTotalPaise: credit });
    assert.equal(r.ok, true);
    assert.equal(r.appliedPaise + r.balanceDuePaise, r.netPayablePaise);
    assert.equal(r.appliedPaise + r.refundDuePaise, r.netReceivedPaise);
    assert.ok(r.balanceDuePaise === 0 || r.refundDuePaise === 0);
    assert.equal(r.status, r.refundDuePaise > 0 ? 'OVERPAID' : r.balanceDuePaise === 0 ? 'PAID' : r.netReceivedPaise > 0 ? 'PART_PAID' : 'UNPAID');
  }
});
