// Invented fixtures for the Service wave 2 prints (writer W-REP). No real business data. Money is integer paise.
// Every expected number in the tests is typed by hand from the worked example in the P6 spec (section 14).
import { loadReport, fakeJsPdf } from './fix-s02-load.mjs';

export const TODAY = '2026-11-18';
export const todayIso = () => TODAY;
export const OWNER_NAME = 'Zed Quasar';

export function load(role, extra = {}) {
  return loadReport({ role, globals: Object.assign({ todayIso }, extra.globals || {}), storage: extra.storage });
}
export function loadPdf(role, log, extra = {}) {
  const B = fakeJsPdf(log);
  const globals = Object.assign({ todayIso, jspdf: { jsPDF: class extends B { splitTextToSize(t) { return [String(t)]; } } } }, extra.globals || {});
  return loadReport({ role, globals, storage: extra.storage });
}
export const plain = (m) => JSON.parse(JSON.stringify(m));
export const text = (m) => JSON.stringify(plain(m));
export const tableOf = (m, n = 0) => m.blocks.filter((b) => b.t === 'table')[n];
export const tables = (m) => m.blocks.filter((b) => b.t === 'table');
export const kpi = (m, label) => { const b = m.blocks.find((x) => x.t === 'kpi'); return b ? b.items.find((i) => i.label === label) : undefined; };
export const notes = (m) => m.blocks.filter((b) => b.t === 'note').map((b) => b.text);
export const empties = (m) => m.blocks.filter((b) => b.t === 'empty').map((b) => b.text);
export const hdr = (m) => m.blocks[0];
export const kvPairs = (m) => m.blocks.filter((b) => b.t === 'kv').reduce((a, b) => a.concat(b.pairs), []);
export const kv = (m, label) => { const p = kvPairs(m).find((x) => x[0] === label); return p ? p[1] : undefined; };
export const sections = (m) => m.blocks.filter((b) => b.t === 'section').map((b) => b.title);
export const alltext = (m) => { const out = []; const walk = (v) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k])); }; walk(plain(m)); return out; };

export const FIRM = { name: 'Zed Time Works', gstin: '27ZZZZZ9999Z1Z5', address: '12 Sample Road, Testville', state: 'Maharashtra', stateCode: '27' };
export const BILL_TO = { name: 'Ana Tester', address: 'Flat 4, Example Lane, Testville', gstin: '', state: 'Maharashtra', stateCode: '27', mobile: '9000000001' };

// ---- the worked invoice (P6 section 14): lines total 233,966; round off +34; total 234,000; advance 50,000; balance 184,000
export function lines(inter) {
  const split = (t) => (inter ? { cgstPaise: 0, sgstPaise: 0, igstPaise: t } : { cgstPaise: t / 2, sgstPaise: t / 2, igstPaise: 0 });
  return [
    Object.assign({ kind: 'PART', partCode: 'BAT-SR626', desc: 'Battery SR626', hsn: '8506', unit: 'pc', qty: 1, unitPricePaise: 25000, priceBasis: 'EXCL', discountPaise: 0,
      taxablePaise: 25000, rateBp: 1800, totalPaise: 29500 }, split(4500)),
    Object.assign({ kind: 'LABOUR', partCode: '', desc: 'Movement service', hsn: '9987', unit: '', qty: 1, unitPricePaise: 120000, priceBasis: 'EXCL', discountPaise: 10000,
      taxablePaise: 110000, rateBp: 1800, totalPaise: 129800 }, split(19800)),
    Object.assign({ kind: 'PART', partCode: 'STRAP-01', desc: 'Strap', hsn: '9113', unit: 'pc', qty: 2, unitPricePaise: 33333, priceBasis: 'EXCL', discountPaise: 0,
      taxablePaise: 66666, rateBp: 1200, totalPaise: 74666 }, split(8000))
  ];
}
export function invoice(over = {}, inter = false) {
  return Object.assign({
    v: 2, invoiceNo: 'SV/2026-27/0001', invoiceDate: '2026-11-18', status: 'ISSUED', cancelledDate: '', jobId: 'SO-1001', billedIn: 'SAAGAR', ccptInvoiceNo: '', ccptJobNo: '',
    rebuilt: false, supply: inter ? 'INTER' : 'INTRA', placeOfSupplyState: inter ? 'Karnataka' : 'Maharashtra', placeOfSupplyCode: inter ? '29' : '27', reverseCharge: false,
    firm: Object.assign({}, FIRM), lines: lines(inter), billDiscountPaise: 0, roundOffPaise: 34, totalPaise: 234000,
    advances: [{ receiptNo: 'SAR/26-27/0001', date: '2026-11-10', amountPaise: 50000 }], advanceSetOffPaise: 50000, balancePaise: 184000,
    warrantyTill: '2027-05-18', warrantyMonths: 6
  }, over);
}
export function invData(over = {}, inter = false, top = {}) {
  return Object.assign({ ok: true, kind: 'INVOICE', invoice: invoice(over, inter), billTo: Object.assign({}, BILL_TO), watch: 'Zed Chrono 7',
    receipts: [{ receiptNo: 'SAR/26-27/0001', receiptKind: 'ADVANCE', date: '2026-11-10', mode: 'UPI', amountPaise: 50000 }] }, top);
}
export function ccptData(over = {}, top = {}) {
  return invData(Object.assign({ billedIn: 'CCPT', ccptInvoiceNo: 'CC-INV-5001', ccptJobNo: 'CC-JOB-77' }, over), false, top);
}

// ---- credit note for one strap: taxable 33,333, tax 4,000, total 37,333, round off -33, note total 37,300
export function cnData(over = {}, top = {}) {
  return Object.assign({ ok: true, kind: 'CREDIT_NOTE', note: Object.assign({
    noteNo: 'SCN/2026-27/0001', noteDate: '2026-11-18', invoiceNo: 'SV/2026-27/0001', invoiceDate: '2026-11-10', billedIn: 'SAAGAR', ccptInvoiceNo: '', jobId: 'SO-1001',
    reasonLabel: 'Return of part', supply: 'INTRA', placeOfSupplyState: 'Maharashtra', placeOfSupplyCode: '27', firm: Object.assign({}, FIRM),
    lines: [{ kind: 'PART', partCode: 'STRAP-01', desc: 'Strap', hsn: '9113', unit: 'pc', qty: 1, taxablePaise: 33333, rateBp: 1200, cgstPaise: 2000, sgstPaise: 2000, igstPaise: 0, totalPaise: 37333 }],
    roundOffPaise: -33, totalPaise: 37300, refund: null }, over), billTo: Object.assign({}, BILL_TO) }, top);
}
export function rcptData(over = {}, top = {}) {
  return Object.assign({ ok: true, kind: 'RECEIPT', receipt: Object.assign({ receiptNo: 'SAR/26-27/0001', receiptKind: 'ADVANCE', date: '2026-11-10', mode: 'upi', ref: 'UPIREF0001112223334445556667',
    amountPaise: 50000, jobId: 'SO-1001', receivedBy: 'Counter One', watch: 'Zed Chrono 7' }, over), billTo: { name: 'Ana Tester', mobile: '9000000001' } }, top);
}
export function balRcptData(over = {}, top = {}) {
  return rcptData(Object.assign({ receiptNo: 'SRC/26-27/0001', receiptKind: 'BALANCE', amountPaise: 184000, mode: 'CARD', ref: '', invoiceNo: 'SV/2026-27/0001', billedIn: 'CCPT',
    ccptInvoiceNo: 'CC-INV-5001', invoiceTotalPaise: 234000, paidEarlierPaise: 50000, balanceAfterPaise: 0 }, over), top);
}
export function counterData(over = {}, top = {}) {
  return rcptData(Object.assign({ receiptNo: 'SRC/26-27/0002', receiptKind: 'COUNTER', jobId: '', watch: '', mode: 'CASH', ref: '', amountPaise: 15000,
    items: [{ desc: 'Strap pin', qty: 3, amountPaise: 6000 }, { desc: 'Battery SR616', qty: 1, amountPaise: 9000 }] }, over), top);
}
export function refundData(over = {}, top = {}) {
  return Object.assign({ ok: true, kind: 'REFUND', refund: Object.assign({ voucherNo: 'SRF/26-27/0001', date: '2026-11-18', mode: 'Bank', ref: 'NEFT123', amountPaise: 37300, jobId: 'SO-1001',
    againstKind: 'CREDIT_NOTE', againstNo: 'SCN/2026-27/0001', paidBy: 'Counter One' }, over), billTo: { name: 'Ana Tester' } }, top);
}
export function sheetData(over = {}, top = {}) {
  return Object.assign({ ok: true, kind: 'WARRANTY_SHEET', sheet: Object.assign({ jobId: 'SO-2002', dateReceived: '2026-11-01', dateDelivered: '2026-11-15', watch: 'Zed Chrono 7',
    refNo: 'REF-9', serialNo: 'SN-000123', diagnosis: 'Crown stem loose', workDone: 'Stem replaced', warrantyTill: '2027-05-15', advisor: 'Advisor One', technician: 'Tech One',
    parts: [{ partCode: 'STEM-01', desc: 'Crown stem', qty: 1 }, { partCode: 'GASK-02', desc: 'Gasket', qty: 2 }] }, over), firm: { name: 'Zed Time Works', address: '12 Sample Road, Testville' },
    billTo: { name: 'Ana Tester', mobile: '9000000001' } }, top);
}

// ---- lists
export function dayData(over = {}) {
  return Object.assign({ ok: true, kind: 'DAY_SUMMARY', date: TODAY,
    receipts: [
      { receiptNo: 'SAR/26-27/0001', receiptKind: 'ADVANCE', mode: 'Cash', amountPaise: 50000, jobId: 'SO-1' },
      { receiptNo: 'SRC/26-27/0001', receiptKind: 'BALANCE', mode: 'UPI', amountPaise: 184000, jobId: 'SO-1' },
      { receiptNo: 'SRC/26-27/0002', receiptKind: 'COUNTER', mode: 'Cash', amountPaise: 12000, jobId: '' }],
    refunds: [{ voucherNo: 'SRF/26-27/0001', mode: 'Cash', amountPaise: 5000, againstNo: 'SRC/26-27/0001', jobId: 'SO-2' }],
    invoices: [{ invoiceNo: 'SV/2026-27/0001', billedIn: 'SAAGAR', status: 'ISSUED', totalPaise: 234000, jobId: 'SO-1' },
      { invoiceNo: 'SV/2026-27/0002', billedIn: 'CCPT', status: 'CANCELLED', totalPaise: 50000, jobId: 'SO-3' }],
    creditNotes: [{ noteNo: 'SCN/2026-27/0001', invoiceNo: 'SV/2026-27/0001', totalPaise: 37300 }],
    advancesHeld: { count: 2, totalPaise: 75000 } }, over);
}
export function advData(over = {}) {
  return Object.assign({ ok: true, kind: 'ADVANCES_HELD', asOf: TODAY, rows: [
    { receiptNo: 'SAR/26-27/0002', origin: 'RECEIPT', date: '2026-10-18', jobId: 'SO-5', watch: 'Zed Chrono 7', jobStatus: 'Open', mode: 'Cash', amountPaise: 20000 },
    { receiptNo: 'SAR/26-27/0003', origin: 'RECEIPT', date: '2026-10-19', jobId: 'SO-6', watch: 'Zed Sport 2', jobStatus: 'Open', mode: 'UPI', amountPaise: 30000 },
    { receiptNo: '', origin: 'LEGACY', date: '2026-09-01', jobId: 'SO-9', watch: 'Zed Classic', jobStatus: 'Open', mode: '', amountPaise: 10000 }] }, over);
}
export function unbilledData(over = {}) {
  return Object.assign({ ok: true, kind: 'UNBILLED_ISSUES', asOf: TODAY, costBasis: 'EXCL_GST', rows: [
    { jobId: 'SO-8', watch: 'Zed Sport 2', jobStatus: 'Open', partCode: 'P-0002', desc: 'Battery 377', qtyOpen: 2, issuedDate: '2026-11-17', outcome: 'OPEN', costPaise: 9100 },
    { jobId: 'SO-7', watch: 'Zed Chrono 7', jobStatus: 'Open', partCode: 'P-0001', desc: 'Crown assembly', qtyOpen: 1, issuedDate: '2026-11-10', outcome: 'OPEN', costPaise: 10000 },
    { jobId: 'SO-9', watch: 'Zed Classic', jobStatus: 'Open', partCode: 'P-0003', desc: 'Glass', qtyOpen: 1, issuedDate: '2026-11-01', outcome: 'WARRANTY', costPaise: 5000 },
    { jobId: 'SO-4', watch: 'Zed Classic', jobStatus: 'Open', partCode: 'P-0004', desc: 'Spring', qtyOpen: 0, issuedDate: '2026-11-02', outcome: 'OPEN', costPaise: 700 }] }, over);
}
const rl = (kind, rateBp, taxablePaise, half) => ({ kind, rateBp, taxablePaise, cgstPaise: half, sgstPaise: half, igstPaise: 0 });
export function revData(over = {}) {
  return Object.assign({ ok: true, kind: 'REVENUE', from: '2026-11-01', to: '2026-11-30', invoices: [
    { invoiceNo: 'SV/2026-27/0001', date: '2026-11-10', status: 'ISSUED', billedIn: 'SAAGAR', roundOffPaise: 34, lines: [rl('PART', 1800, 25000, 2250), rl('LABOUR', 1800, 110000, 9900), rl('PART', 1200, 66666, 4000)] },
    { invoiceNo: 'SV/2026-27/0002', date: '2026-11-11', status: 'CANCELLED', billedIn: 'CCPT', roundOffPaise: 0, lines: [rl('LABOUR', 1800, 90000, 8100)] },
    { invoiceNo: 'SV/2026-27/0003', date: '2026-11-12', status: 'ISSUED', billedIn: 'CCPT', roundOffPaise: 0, lines: [rl('LABOUR', 1800, 50000, 4500)] }],
    creditNotes: [{ noteNo: 'SCN/2026-27/0001', date: '2026-11-12', invoiceNo: 'SV/2026-27/0001', billedIn: 'SAAGAR', roundOffPaise: -33, lines: [rl('PART', 1200, 33333, 2000)] }] }, over);
}
export const RANGE = { from: '2026-11-01', to: '2026-11-30' };
export const CUSTOMER_TYPES = ['serviceBillSummary', 'serviceTaxInvoiceV2', 'serviceCreditNote', 'serviceReceipt', 'serviceRefundVoucher', 'serviceWarrantySheet'];
export const LIST_TYPES = ['serviceUnbilledIssues', 'serviceDaySummary', 'serviceAdvancesHeld', 'serviceRevenue'];
export const ALL_TYPES = CUSTOMER_TYPES.concat(LIST_TYPES);
export const GOOD = () => ({ serviceBillSummary: ccptData(), serviceTaxInvoiceV2: invData(), serviceCreditNote: cnData(), serviceReceipt: rcptData(), serviceRefundVoucher: refundData(),
  serviceWarrantySheet: sheetData(), serviceUnbilledIssues: unbilledData(), serviceDaySummary: dayData(), serviceAdvancesHeld: advData(), serviceRevenue: revData() });
export const ARGS = { serviceBillSummary: { invoiceNo: 'SV/2026-27/0001' }, serviceTaxInvoiceV2: { invoiceNo: 'SV/2026-27/0001' }, serviceCreditNote: { noteNo: 'SCN/2026-27/0001' },
  serviceReceipt: { receiptNo: 'SAR/26-27/0001' }, serviceRefundVoucher: { voucherNo: 'SRF/26-27/0001' }, serviceWarrantySheet: { jobId: 'SO-2002' }, serviceRevenue: RANGE };
export const opts = (type, data) => Object.assign({ svcData: data === undefined ? GOOD()[type] : data }, ARGS[type] || {});
