// S02 U07-F03 (invoice figures, Discount / Additional charge, no false Round Off), U07-F04 report side and S02-2 (frozen snapshot, interface B)
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadReport } from './lib/fix-s02-load.mjs';

const ORG = { firms: [{ name: 'Saagar Traders', gstin: '27ABCDE1234F1Z5', address: 'Station Road, Latur' }] };
const baseCase = (over = {}) => Object.assign({
  id: 'WS-2026-2433', custName: 'Ravi Patil', custMobile: '9876543210', custAddr: 'Latur', brand: 'Titan', model: 'Edge',
  subTotal: 300, gst: 18, lineItems: [{ desc: 'Battery change', qty: 1, unit: 300, total: 300 }],
  invoiceNo: 'WS-2026-002', delivery: { collectDate: '2026-11-12', finalAmt: 300, payMode: 'UPI', payRef: 'R1' }
}, over);
const load = (cases, extra = {}) => loadReport(Object.assign({ storage: { saagar_wsf_v2: cases, saagar_org_master_v1: ORG } }, extra));
const taxPairs = (m) => {
  const i = m.blocks.findIndex((b) => b.t === 'section' && b.title === 'Tax Summary');
  return m.blocks[i + 1].pairs;
};
const asMap = (pairs) => Object.fromEntries(pairs.map((p) => [p[0], p[1]]));
const total = (m) => m.blocks.filter((b) => b.t === 'kv').pop().pairs[0][1];

test('worked case: estimate 300 at 18 percent, final 300 is a Discount of 46, not a Round Off of -54', () => {
  const h = load([baseCase()]);
  const m = h.R._buildModel('serviceTaxInvoice', { id: 'WS-2026-2433', invoiceNo: 'WS-2026-002' });
  const p = taxPairs(m), mp = asMap(p);
  assert.ok(!('Round Off' in mp));
  assert.equal(mp['CGST @ 9%'], '₹23');
  assert.equal(mp['SGST @ 9%'], '₹23');
  assert.equal(mp['Items total'], '₹300');
  assert.equal(mp['Discount'], '− ₹46');
  assert.equal(mp['Taxable Value'], '₹254');
  assert.equal(mp['Total GST'], '₹46');
  assert.equal(total(m), '₹300');
});

test('worked case: final 400 is an Additional charge of 39 and GST 61 (CGST 31, SGST 30)', () => {
  const h = load([baseCase({ delivery: { collectDate: '2026-11-12', finalAmt: 400 } })]);
  const mp = asMap(taxPairs(h.R._buildModel('serviceTaxInvoice', { id: 'WS-2026-2433' })));
  assert.equal(mp['Additional charge'], '₹39');
  assert.equal(mp['Taxable Value'], '₹339');
  assert.equal(mp['Total GST'], '₹61');
  assert.equal(mp['CGST @ 9%'], '₹31');
  assert.equal(mp['SGST @ 9%'], '₹30');
  assert.ok(!('Round Off' in mp));
});

test('final equal to the estimate prints as before; a gap under Rs 1 is a true Round Off', () => {
  for (const fin of [354, 354.4]) {
    const h = load([baseCase({ delivery: { collectDate: '2026-11-12', finalAmt: fin } })]);
    const m = h.R._buildModel('serviceTaxInvoice', { id: 'WS-2026-2433' });
    const mp = asMap(taxPairs(m));
    assert.equal(mp['Taxable Value'], '₹300');
    assert.equal(mp['Total GST'], '₹54');
    assert.ok(!('Discount' in mp) && !('Additional charge' in mp) && !('Items total' in mp), String(fin));
    assert.equal(total(m), '₹354');
  }
});

test('GST 0 percent: final 250 on 300 is a Discount of 50 with GST not applicable', () => {
  const h = load([baseCase({ gst: 0, delivery: { collectDate: '2026-11-12', finalAmt: 250 } })]);
  const mp = asMap(taxPairs(h.R._buildModel('serviceTaxInvoice', { id: 'WS-2026-2433' })));
  assert.equal(mp['GST'], 'Not applicable');
  assert.equal(mp['Discount'], '− ₹50');
  assert.equal(mp['Taxable Value'], '₹250');
});

test('makeInvoiceSnapshot (interface B): figures add up, shape is exact, JSON round trips, not gated, GST outside 0 to 100 throws', () => {
  const cases = [[300, 18, 300], [300, 18, 400], [300, 18, 354], [300, 18, 354.4], [300, 0, 250], [1999.5, 12, 2400]];
  const h = load([baseCase()], { role: 'cashier' });
  for (const [sub, gst, fin] of cases) {
    const s = h.R.makeInvoiceSnapshot(baseCase({ subTotal: sub, gst, delivery: { finalAmt: fin } }), 'WS-2026-009');
    const f = s.figs;
    assert.equal(f.taxable + f.gst + f.roundOff, f.total, JSON.stringify(f));
    assert.equal(f.cgst + f.sgst, f.gst);
    assert.ok(Math.abs(f.roundOff) <= 1);
    assert.equal(f.listed + f.adjustment, f.taxable);
  }
  const s = h.R.makeInvoiceSnapshot(baseCase(), 'WS-2026-002');
  assert.deepEqual([...Object.keys(s)], ['v', 'basis', 'invoiceNo', 'issuedAt', 'invoiceDate', 'caseId', 'firm', 'customer', 'watch', 'lines', 'figs', 'delivery']);
  assert.deepEqual([...Object.keys(s.figs)], ['gstPct', 'listed', 'adjustment', 'taxable', 'gst', 'cgst', 'sgst', 'roundOff', 'finalAmt', 'total']);
  assert.deepEqual([...Object.keys(s.firm)], ['name', 'gstin', 'address']);
  assert.deepEqual([...Object.keys(s.customer)], ['name', 'mobile', 'address']);
  assert.deepEqual([...Object.keys(s.delivery)], ['collectDate', 'payMode', 'payRef', 'warrantyTill', 'warrantyMonths']);
  assert.equal(s.v, 1); assert.equal(s.basis, 'issue'); assert.equal(s.invoiceNo, 'WS-2026-002'); assert.equal(s.caseId, 'WS-2026-2433');
  assert.equal(s.firm.gstin, '27ABCDE1234F1Z5');
  assert.deepEqual(JSON.parse(JSON.stringify(s)), JSON.parse(JSON.stringify(s)));
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(s))), JSON.stringify(s));
  assert.throws(() => h.R.makeInvoiceSnapshot(baseCase({ gst: 150 }), 'X'), /GST/);
  assert.throws(() => h.R.makeInvoiceSnapshot(baseCase({ gst: -1 }), 'X'), /GST/);
});

test('a snapshot-backed invoice reprints identically after the live case and the firm are edited', () => {
  const h0 = load([baseCase()]);
  const snap = h0.R.makeInvoiceSnapshot(baseCase(), 'WS-2026-002');
  const c = baseCase({ invoiceSnapshot: snap });
  const h = load([c]);
  const before = JSON.stringify(h.R._buildModel('serviceTaxInvoice', { id: c.id, invoiceNo: 'WS-2026-002' }));
  const edited = baseCase({ invoiceSnapshot: snap, custName: 'Someone Else', subTotal: 1998, gst: 18, delivery: { finalAmt: 354, collectDate: '2026-12-01' }, lineItems: [] });
  h.store.saagar_wsf_v2 = JSON.stringify([edited]);
  h.store.saagar_org_master_v1 = JSON.stringify({ firms: [{ name: 'New Firm', gstin: 'X', address: 'Y' }] });
  const after = JSON.stringify(h.R._buildModel('serviceTaxInvoice', { id: c.id, invoiceNo: 'WS-9999' }));
  assert.equal(after, before);
  assert.ok(before.includes('Ravi Patil') && before.includes('Saagar Traders') && !before.includes('Someone Else'));
  assert.ok(!before.includes('before invoice records were frozen'));
});

test('a legacy invoice (number, no snapshot) follows the live case and carries the amber note', () => {
  const h = load([baseCase()]);
  const a = JSON.stringify(h.R._buildModel('serviceTaxInvoice', { id: 'WS-2026-2433', invoiceNo: 'WS-2026-002' }));
  assert.ok(a.includes('Reprint of an invoice issued before invoice records were frozen'));
  h.store.saagar_wsf_v2 = JSON.stringify([baseCase({ custName: 'Changed Name' })]);
  const b = JSON.stringify(h.R._buildModel('serviceTaxInvoice', { id: 'WS-2026-2433', invoiceNo: 'WS-2026-002' }));
  assert.notEqual(a, b);
  assert.ok(b.includes('Changed Name'));
});

test('an invoice with no number prints as DRAFT with the not-issued note', () => {
  const h = load([baseCase({ invoiceNo: undefined })]);
  const m = h.R._buildModel('serviceTaxInvoice', { id: 'WS-2026-2433' });
  const hdr = m.blocks.find((b) => b.t === 'header');
  assert.equal(hdr.chip, 'DRAFT - NOT ISSUED');
  assert.equal(hdr.chipKind, 'draft');
  assert.ok(m.blocks.some((b) => b.t === 'note' && /Not issued: preview only/.test(b.text)));
  assert.ok(!JSON.stringify(m).includes('WS-WS-2026'));
});

test('a legacy case with GST outside 0 to 100 prints an error page, not a nonsense invoice', () => {
  const h = load([baseCase({ gst: 150 })]);
  const m = h.R._buildModel('serviceTaxInvoice', { id: 'WS-2026-2433', invoiceNo: 'WS-2026-002' });
  assert.ok(m.blocks.some((b) => b.t === 'empty' && /Invoice cannot be built/.test(b.text)));
});

test('a snapshot with a different version is not trusted', () => {
  const h0 = load([baseCase()]);
  const snap = h0.R.makeInvoiceSnapshot(baseCase(), 'WS-2026-002');
  snap.v = 2; snap.figs.total = 1;
  const h = load([baseCase({ invoiceSnapshot: snap })]);
  const s = JSON.stringify(h.R._buildModel('serviceTaxInvoice', { id: 'WS-2026-2433', invoiceNo: 'WS-2026-002' }));
  assert.ok(s.includes('before invoice records were frozen'));
});

test('audit: Round Off is never outside -1 to +1, also with paise sub-totals, and the printed figures always add up', () => {
  const h = load([baseCase()]);
  const sub = 100.43, fin = 119.5;   // gap 0.99 from the estimate 118.51, but whole-rupee rounding would print Round Off 2
  const f = h.R.makeInvoiceSnapshot({ subTotal: sub, gst: 18, delivery: { finalAmt: fin } }, 'X').figs;
  assert.ok(Math.abs(f.roundOff) <= 1, JSON.stringify(f));
  for (let s = 10000; s < 10150; s += 1) {
    for (let d = -150; d <= 150; d += 3) {
      const est = Math.round(s * 1.18) / 100, F = h.R.makeInvoiceSnapshot({ subTotal: s / 100, gst: 18, delivery: { finalAmt: Math.round((est + d / 100) * 100) / 100 } }, 'X').figs;
      assert.ok(Math.abs(F.roundOff) <= 1, JSON.stringify(F));
      assert.equal(F.listed + F.adjustment + F.gst + F.roundOff, F.total);
      assert.equal(F.cgst + F.sgst, F.gst);
    }
  }
});
