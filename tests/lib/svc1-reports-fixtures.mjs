// Invented test data for the Service Stores reports (group reports). No real business data.
// Money is integer paise. Dates are IST calendar days.
import { loadReport } from './fix-s02-load.mjs';

export const TODAY = '2026-11-13';
export const todayIso = () => TODAY;

export function load(role, extra = {}) {
  return loadReport({ role, globals: Object.assign({ todayIso }, extra.globals || {}), storage: extra.storage });
}
// Plain copy of a model (drops functions, normalises the vm realm).
export const plain = (m) => JSON.parse(JSON.stringify(m));
export const text = (m) => JSON.stringify(plain(m));
export const tableOf = (m, n = 0) => m.blocks.filter((b) => b.t === 'table')[n];
export const kpi = (m, label) => {
  const b = m.blocks.find((x) => x.t === 'kpi');
  return b ? b.items.find((i) => i.label === label) : undefined;
};
export const notes = (m) => m.blocks.filter((b) => b.t === 'note').map((b) => b.text);
export const empties = (m) => m.blocks.filter((b) => b.t === 'empty').map((b) => b.text);
export const attns = (m) => m.blocks.filter((b) => b.t === 'attn').reduce((a, b) => a.concat(b.flags), []);

export const ok = (rest) => Object.assign({ ok: true }, rest);

export function stockRow(o) {
  return Object.assign({ partCode: 'P-0001', desc: 'Crown assembly', group: 'Crowns', unit: 'pc', bin: 'A1', active: true, onHand: 10, reorderLevel: 3,
    reorderQty: 5, valuePaise: 100000, lastReceiptCostPaise: 10000, lastReceiptDate: '2026-11-01' }, o);
}
export function stockData(rows) {
  return ok({ asOf: TODAY, method: 'FIFO', costBasis: 'EXCL_GST', lastMovementDate: TODAY, rows: rows || [
    stockRow({}),
    stockRow({ partCode: 'P-0002', desc: 'Battery 377', group: 'Batteries', bin: 'B2', onHand: 2, reorderLevel: 3, reorderQty: 20, valuePaise: 9100, lastReceiptCostPaise: 4550 }),
    stockRow({ partCode: '0042', desc: 'Strap pin', group: 'Straps', bin: 'C3', onHand: 1, reorderLevel: 0, reorderQty: 0, valuePaise: 123456, lastReceiptCostPaise: 123456 }),
    stockRow({ partCode: 'NEG-1', desc: 'Glass', group: 'Glass', bin: 'D4', onHand: -1, reorderLevel: 0, reorderQty: 0, valuePaise: 0, lastReceiptCostPaise: 7000 }),
    stockRow({ partCode: 'ZERO-1', desc: 'Idle part', group: 'Glass', bin: 'D5', onHand: 0, reorderLevel: 0, reorderQty: 0, valuePaise: 0, lastReceiptCostPaise: null, lastReceiptDate: '' })
  ] });
}

// Ledger A: GRN 10 at 100.00, issue 4 (400.00), return 1 (100.00).
export function ledgerA(over) {
  return ok(Object.assign({
    part: { partCode: 'P-0001', desc: 'Crown assembly', group: 'Crowns', unit: 'pc', bin: 'A1' }, from: '2026-04-01', to: TODAY, costBasis: 'EXCL_GST',
    opening: { qty: 0, valuePaise: 0 },
    rows: [
      { seq: 1, date: '2026-11-01', docType: 'GRN', docNo: 'GRN/26-27/0001', jobId: '', note: 'Titan lot', inQty: 10, outQty: 0, valueInPaise: 100000, valueOutPaise: 0, balQty: 10, balValuePaise: 100000, reversed: false, isReversal: false, reversalOf: '', actor: 'Store Manager' },
      { seq: 2, date: '2026-11-05', docType: 'ISS', docNo: 'ISS/26-27/0001', jobId: 'SO-1001', note: '', inQty: 0, outQty: 4, valueInPaise: 0, valueOutPaise: 40000, balQty: 6, balValuePaise: 60000, reversed: false, isReversal: false, reversalOf: '', actor: 'Technician' },
      { seq: 3, date: '2026-11-06', docType: 'RET', docNo: 'RET/26-27/0001', jobId: 'SO-1001', note: 'unused', inQty: 1, outQty: 0, valueInPaise: 10000, valueOutPaise: 0, balQty: 7, balValuePaise: 70000, reversed: false, isReversal: false, reversalOf: '', actor: 'Technician' }
    ],
    closing: { qty: 7, valuePaise: 70000 },
    layers: [{ layerId: 'L1', grnNo: 'GRN/26-27/0001', date: '2026-11-01', qtyReceived: 10, qtyRemaining: 7, unitCostPaise: 10000 }]
  }, over || {}));
}
// Ledger B: layers 6 at 100.00 and 5 at 120.00, then an issue of 8 = 840.00.
export function ledgerB() {
  const row = (seq, date, docType, docNo, inQty, outQty, vin, vout, bq, bv) => ({ seq, date, docType, docNo, jobId: outQty ? 'SO-2002' : '', note: '', inQty, outQty,
    valueInPaise: vin, valueOutPaise: vout, balQty: bq, balValuePaise: bv, reversed: false, isReversal: false, reversalOf: '', actor: '' });
  return ledgerA({
    rows: [row(1, '2026-10-01', 'GRN', 'GRN/26-27/0001', 6, 0, 60000, 0, 6, 60000), row(2, '2026-10-10', 'GRN', 'GRN/26-27/0002', 5, 0, 60000, 0, 11, 120000),
      row(3, '2026-10-20', 'ISS', 'ISS/26-27/0001', 0, 8, 0, 84000, 3, 36000)],
    closing: { qty: 3, valuePaise: 36000 },
    layers: [{ layerId: 'L1', grnNo: 'GRN/26-27/0001', date: '2026-10-01', qtyReceived: 6, qtyRemaining: 0, unitCostPaise: 10000 },
      { layerId: 'L2', grnNo: 'GRN/26-27/0002', date: '2026-10-10', qtyReceived: 5, qtyRemaining: 3, unitCostPaise: 12000 }]
  });
}

export function grnData(over) {
  return ok(Object.assign({
    header: { grnNo: 'GRN/26-27/0007', date: '2026-11-10', supplier: 'Titan', invoiceNo: 'INV-5521', invoiceDate: '2026-11-08', receivedBy: 'Store Manager', status: 'POSTED',
      reversedDate: '', reversedBy: '', reversalReason: '', costBasis: 'EXCL_GST' },
    lines: [
      { partCode: 'P-0001', desc: 'Crown assembly', qtyReceived: 5, qtyShort: 1, unitCostPaise: 10050, lineValuePaise: 50250 },
      { partCode: 'P-0002', desc: 'Battery 377', qtyReceived: 10, qtyShort: 0, unitCostPaise: 4550, lineValuePaise: 45500 }
    ]
  }, over || {}));
}

export function adjData(over) {
  const a = (o) => Object.assign({ adjNo: 'ADJ/26-27/0001', date: '2026-11-02', partCode: 'P-0001', desc: 'Crown assembly', qtyDelta: -1, reasonCode: 'DAMAGED', reasonLabel: 'Damaged',
    note: 'dropped', valueEffectPaise: -25000, proposedBy: 'Store Manager', status: 'POSTED', decidedBy: 'Owner', decidedDate: '2026-11-03', approverRole: 'Owner' }, o);
  return ok(Object.assign({
    from: '2026-11-01', to: '2026-11-30',
    awaiting: [a({ adjNo: 'DOC-000012', date: '2026-10-28', status: 'PROPOSED', decidedBy: '', decidedDate: '', approverRole: '', qtyDelta: 2, valueEffectPaise: 20000, reasonCode: 'FOUND', reasonLabel: 'Found' })],
    decided: [
      a({}),
      a({ adjNo: 'ADJ/26-27/0002', partCode: 'P-0002', desc: 'Battery 377', qtyDelta: 3, valueEffectPaise: 13650, reasonCode: 'FOUND', reasonLabel: 'Found', decidedDate: '2026-11-04' }),
      a({ adjNo: 'DOC-000009', status: 'REJECTED', decidedDate: '2026-11-05', valueEffectPaise: -99900, qtyDelta: -9 }),
      a({ adjNo: 'ADJ/26-27/0000', decidedDate: '2026-10-30', valueEffectPaise: -77700 })
    ]
  }, over || {}));
}

export function oldData(over) {
  const d = (o) => Object.assign({ regNo: 'OLD/26-27/0001', date: '2026-11-02', jobId: 'SO-1001', partCode: 'P-0001', desc: 'Old crown', qty: 1, state: 'HELD_FOR_CLAIM', claimRef: 'CL-77',
    decidedBy: '', decidedDate: '', signoffMonth: '' }, o);
  return ok(Object.assign({
    from: '2026-11-01', to: '2026-11-30',
    open: [d({}), d({ regNo: 'OLD/26-27/0002', date: '2026-09-02', state: 'SCRAP_PENDING', qty: 2, claimRef: '' }), d({ regNo: 'OLD/26-27/0004', date: '2026-10-02', state: 'HELD_FOR_CLAIM', qty: 3 })],
    listed: [d({}), d({ regNo: 'OLD/26-27/0003', state: 'CUSTOMER_RETURNED', claimRef: '', decidedBy: 'Store Manager', decidedDate: '2026-11-06' }),
      d({ regNo: 'OLD/26-27/0005', state: 'SCRAPPED', decidedBy: 'Owner', decidedDate: '2026-11-09', signoffMonth: '2026-10' }), d({ regNo: 'OLD/26-27/0006', state: 'WEIRD_STATE' })]
  }, over || {}));
}

export const BIG = (n, f) => Array.from({ length: n }, (_, i) => f(i));
