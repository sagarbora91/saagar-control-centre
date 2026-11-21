/* ETP report-engine bridge, tablet side: compare mode (www/etp-bridge-compare.js). Synthetic, invented data only.
   Nothing here needs a key. Owner decisions given in chat, 2026-11-12 (Q2, Q3, Q6). */
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { computeTotals } from '../scripts/lib/etp-bridge-pack-builder.mjs';
import { BANNED_BROWSER_TOKENS, readWww, seeded, verifierApi } from './lib/etp-bridge-test-support.mjs';

const require = createRequire(import.meta.url);
const compareApi = require('../www/etp-bridge-compare.js');
const gatewayApi = require('../www/etp-module-gateway.js');
const { compare, CODES, REPORT_IDS, COLUMNS, MEASURES } = compareApi;
const SOURCE = readWww('etp-bridge-compare.js');
const GENERATION = `etp_${'d'.repeat(32)}`;
const SCOPE = Object.freeze({ storeCode: 'WLMHW', financialYear: '2026-27', periodStart: '2026-08-01', periodEnd: '2026-08-31', scopeKey: 'WLMHW|2026-27|2026-08-01..2026-08-31' });
const SYNTH = 'SYNTHETIC_ONLY';

/* ---- synthetic data ------------------------------------------------------------------------------------------ */
const money = (cents) => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
function invoices(count, seed = 1) {
  const random = seeded(seed), list = [];
  for (let i = 0; i < count; i += 1) {
    const roll = random(), type = roll < 0.78 ? 'INV' : (roll < 0.92 ? 'SR' : 'BC');
    const net = 100000 + Math.floor(random() * 4000000), tax = Math.floor(net * 0.18);
    list.push({ date: `2026-08-${String(1 + Math.floor(random() * 31)).padStart(2, '0')}`, no: `S${String(1000 + i).padStart(7, '0')}`, type,
      qty: `${1 + Math.floor(random() * 3)}.000`, net: money(net), scheme: money(Math.floor(random() * 5) * 10000), user: money(Math.floor(random() * 3) * 5000), tax: money(tax),
      cro: `CRO-S${String(1 + Math.floor(random() * 4)).padStart(2, '0')}`, tender: money(net) });
  }
  return list;
}
function reportRows(list) {
  const rows = { R003: [], R013: [], R022: [], R025: [] };
  for (const v of list) {
    rows.R003.push({ invoice_date: v.date, transaction_type_raw: v.type, net_amount: v.net, scheme_discount: v.scheme, user_discount: v.user });
    rows.R013.push({ invoice_date: v.date, invoice_number: v.no, transaction_type_raw: v.type, quantity: v.qty, net_amount: v.net, cro_number: v.cro });
    rows.R022.push({ invoice_date: v.date, invoice_number: v.no, transaction_type_raw: v.type, invoice_quantity: v.qty, net_value: v.net, cash_amount: v.tender, card_amount: '0.00',
      bhim_upi_amount: '0.00', phonepe_amount: '0.00', paytm_amount: '0.00', razorpay_amount: '0.00', bharatpe_amount: '0.00', cheque_amount: '0.00', others_amount: '0.00', payment_type24_amount: '0.00' });
    rows.R025.push({ invoice_date: v.date, invoice_number: v.no, transaction_type_raw: v.type, quantity: v.qty, net_amount: v.net, brand: SYNTH, cluster: SYNTH, gender: SYNTH,
      scheme_discount: v.scheme, user_discount: v.user, tax_amount: v.tax });
  }
  return rows;
}
const base = reportRows(invoices(40));
/* Builds a compare input. The pack side recomputes its own PLAIN engine totals from its rows, as the verifier would have checked them. */
function makeInput({ tablet = base, pack = base, figures = [], scope = SCOPE, tabletExtra = {}, packExtra = {}, options, totals } = {}) {
  const engineTotals = totals || Object.fromEntries(REPORT_IDS.map((id) => [id, { rowCount: pack[id] ? pack[id].length : 0, sums: pack[id] ? computeTotals(pack[id], id).sums : {} }]));
  return {
    scope: { ...scope },
    tablet: { ok: true, generationId: GENERATION, complete: true, rows: clone(tablet), ...tabletExtra },
    pack: { verified: true, exportId: 'a'.repeat(32), manifestSha256: 'b'.repeat(64), keyId: 'c'.repeat(16), engineGeneration: 1, storeCode: scope.storeCode, scopeKey: scope.scopeKey,
      rows: clone(pack), engineTotals, engineFigures: figures, ...packExtra },
    ...(options ? { options } : {})
  };
}
const edit = (rows, id, index, patch) => { const copy = clone(rows); Object.assign(copy[id][index], patch); return copy; };

test('identical data on both sides is a MATCH, with every count and delta at zero and the invariants holding', () => {
  const result = compare(makeInput());
  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'MATCH');
  assert.deepEqual(result.reasonCodes, []);
  assert.equal(result.contract, 'ETP_BRIDGE_COMPARE_V1');
  assert.equal(result.level, 'ROWS');
  assert.equal(result.appliedToCalculations, false);
  assert.equal(result.publishes, false);
  assert.equal(result.scope.fullCalendarMonth, true);
  for (const id of REPORT_IDS) {
    const report = result.reports[id];
    assert.equal(report.status, 'MATCH', id);
    assert.equal(report.rows.matched, 40, id);
    assert.equal(report.rows.tablet, report.rows.matched + report.rows.differing + report.rows.onlyTablet);
    assert.equal(report.rows.pack, report.rows.matched + report.rows.differing + report.rows.onlyPack);
    assert.equal(report.daysDiffering, 0);
    assert.deepEqual(report.totals.tablet, report.totals.pack);
    for (const column of Object.values(report.columns)) assert.equal(column.rows, 0);
  }
  assert.equal(result.counts.reportsMatch, 4);
  assert.equal(result.counts.rowsMatched, 160);
});

test('the result does not depend on row order, and a frozen result has no function members', () => {
  const shuffle = (rows, seed) => {
    const random = seeded(seed), out = clone(rows);
    for (const id of REPORT_IDS) for (let i = out[id].length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [out[id][i], out[id][j]] = [out[id][j], out[id][i]]; }
    return out;
  };
  const withDifferences = edit(base, 'R025', 3, { net_amount: '1.00' });
  const first = JSON.stringify(compare(makeInput({ tablet: shuffle(base, 11), pack: shuffle(withDifferences, 12) })));
  const second = JSON.stringify(compare(makeInput({ tablet: shuffle(base, 21), pack: shuffle(withDifferences, 22) })));
  assert.equal(first, second);
  const result = compare(makeInput());
  const walk = (value, path) => {
    assert.ok(typeof value !== 'function', path);
    if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value), `${path} is frozen`); for (const key of Object.keys(value)) walk(value[key], `${path}.${key}`); }
  };
  walk(result, 'result');
  assert.equal(JSON.stringify(compare(makeInput())), JSON.stringify(compare(makeInput())), 'the same pack twice gives the same result');
});

test('one paisa and one thousandth are differences, with the report, column, day and delta named and no tolerance', () => {
  const tabletRows = clone(base);
  const money1 = compare(makeInput({ pack: edit(base, 'R025', 5, { net_amount: money(Math.round(Number(base.R025[5].net_amount) * 100) + 1) }) }));
  assert.equal(money1.outcome, 'DIFFERENCES');
  const report = money1.reports.R025;
  assert.equal(report.status, 'DIFFERENCES');
  assert.equal(report.columns.net_amount.rows, 1);
  assert.equal(report.columns.net_amount.deltaUnits, 1);
  assert.equal(report.rows.differing, 1);
  assert.equal(report.rows.matched, 39);
  assert.equal(report.daysDiffering, 1);
  assert.equal(report.days[0].date, base.R025[5].invoice_date);
  assert.ok(report.days[0].diffs.some((diff) => diff.key === 'net_amount'));
  assert.equal(money1.reports.R013.status, 'MATCH', 'other reports are untouched');
  const sign = base.R025[5].transaction_type_raw === 'INV' ? 1 : -1;
  assert.equal(report.totals.pack.sums.net_amount - report.totals.tablet.sums.net_amount, sign);
  const quantity = compare(makeInput({ pack: edit(base, 'R013', 2, { quantity: '9.001' }), tablet: edit(tabletRows, 'R013', 2, { quantity: '9.000' }) }));
  assert.equal(quantity.reports.R013.columns.quantity.rows, 1);
  assert.equal(quantity.reports.R013.columns.quantity.deltaUnits, 1);
  assert.equal(quantity.outcome, 'DIFFERENCES');
});

test('numbers that are equal but written differently are equal; a digit beyond the scale is never rounded', () => {
  const forms = [['12.5', '12.50'], ['12.500', '12.50'], ['1.25E1', '12.50'], ['0012.50', '12.50'], ['-0', '0.00'], ['-0.00', '0.00'], [12.5, '12.50'], ['1250E-2', '12.50'], ['0', '0.00'], [0, '0.00']];
  for (const [left, right] of forms) {
    const result = compare(makeInput({ tablet: edit(base, 'R003', 0, { net_amount: left }), pack: edit(base, 'R003', 0, { net_amount: right }) }));
    assert.equal(result.reports.R003.status, 'MATCH', `${left} vs ${right}`);
  }
  const equal = compare(makeInput({ tablet: edit(base, 'R003', 0, { net_amount: '1.25E1', scheme_discount: '12.500' }), pack: edit(base, 'R003', 0, { net_amount: '12.50', scheme_discount: '12.50' }) }));
  assert.equal(equal.reports.R003.status, 'MATCH');
  assert.ok(equal.reports.R003.normalisations.exponentExpanded >= 1);
  assert.ok(equal.reports.R003.normalisations.trailingZerosTrimmed >= 1);
  for (const bad of ['12.505', '1E-3', '1.25E-1', 'abc', '+5', '', ' ', '1e31', '9007199254740993', '12,50', '1.2.3', 'NaN', 'Infinity', '0x10']) {
    const result = compare(makeInput({ tablet: edit(base, 'R003', 0, { net_amount: bad }) }));
    assert.equal(result.reports.R003.status, 'CANNOT_COMPARE', JSON.stringify(bad));
    assert.ok(result.reports.R003.reasonCodes.includes('ETP_BRIDGE_COMPARE_ROW_VALUE_UNPARSEABLE'), JSON.stringify(bad));
    assert.equal(result.reports.R013.status, 'MATCH', 'the other reports are still compared');
    assert.equal(result.outcome, 'CANNOT_COMPARE');
  }
  assert.equal(compare(makeInput({ tablet: edit(base, 'R003', 0, { net_amount: Infinity }) })).reports.R003.status, 'CANNOT_COMPARE', 'a number that is not finite');
});

test('blank optional money counts as zero; a blank required value cannot be compared', () => {
  const blank = compare(makeInput({ tablet: edit(base, 'R022', 0, { cash_amount: null, card_amount: '' }), pack: edit(base, 'R022', 0, { cash_amount: '0.00', card_amount: '0.00' }) }));
  assert.equal(blank.reports.R022.normalisations.blankAsZero, 2);
  assert.notEqual(blank.reports.R022.status, 'CANNOT_COMPARE');
  const same = compare(makeInput({ tablet: edit(base, 'R022', 1, { card_amount: null }) }));
  assert.equal(same.reports.R022.status, 'MATCH', 'a blank card amount equals 0.00');
  for (const [id, column] of [['R003', 'net_amount'], ['R013', 'quantity'], ['R022', 'net_value'], ['R025', 'net_amount']]) {
    const result = compare(makeInput({ tablet: edit(base, id, 0, { [column]: null }) }));
    assert.equal(result.reports[id].status, 'CANNOT_COMPARE', `${id}.${column}`);
  }
});

test('rows on one side only, duplicate lines and whole invoices missing are counted and never ignored', () => {
  const missing = clone(base);
  missing.R025.splice(0, 1);
  const packSide = compare(makeInput({ pack: missing }));
  assert.equal(packSide.reports.R025.rows.onlyTablet, 1);
  assert.equal(packSide.reports.R025.rows.matched, 39);
  assert.equal(packSide.reports.R025.status, 'DIFFERENCES');
  const tabletSide = compare(makeInput({ tablet: missing }));
  assert.equal(tabletSide.reports.R025.rows.onlyPack, 1);
  const duplicated = clone(base);
  duplicated.R013.push(clone(duplicated.R013[0]));
  const dup = compare(makeInput({ tablet: duplicated }));
  assert.equal(dup.reports.R013.rows.matched, 40);
  assert.equal(dup.reports.R013.rows.onlyTablet, 1);
  assert.equal(dup.reports.R013.rows.tablet, 41);
  for (const id of REPORT_IDS) {
    const report = dup.reports[id];
    assert.equal(report.rows.tablet, report.rows.matched + report.rows.differing + report.rows.onlyTablet);
    assert.equal(report.rows.pack, report.rows.matched + report.rows.differing + report.rows.onlyPack);
  }
});

test('R003 is matched by day and type only: swapping values between two days shows up as day differences', () => {
  const tabletRows = clone(base), packRows = clone(base);
  const a = tabletRows.R003.findIndex((row) => row.transaction_type_raw === 'INV');
  const b = tabletRows.R003.findIndex((row, index) => index > a && row.transaction_type_raw === 'INV' && row.invoice_date !== tabletRows.R003[a].invoice_date);
  assert.ok(a >= 0 && b > a);
  [packRows.R003[a].net_amount, packRows.R003[b].net_amount] = [tabletRows.R003[b].net_amount, tabletRows.R003[a].net_amount];
  assert.notEqual(packRows.R003[a].net_amount, tabletRows.R003[a].net_amount);
  const result = compare(makeInput({ tablet: tabletRows, pack: packRows }));
  assert.equal(result.reports.R003.status, 'DIFFERENCES');
  assert.equal(result.reports.R003.daysDiffering, 2);
  assert.equal(result.reports.R003.totals.tablet.sums.net_amount, result.reports.R003.totals.pack.sums.net_amount, 'the period totals are equal; only the days differ');
});

test('a text difference is a difference (case is not folded), reported without a numeric delta', () => {
  const result = compare(makeInput({ pack: edit(base, 'R025', 4, { brand: 'synthetic_only' }) }));
  assert.equal(result.reports.R025.status, 'DIFFERENCES');
  assert.equal(result.reports.R025.columns.brand.rows, 1);
  assert.equal(result.reports.R025.columns.brand.deltaUnits, null);
  assert.equal(compare(makeInput({ pack: edit(base, 'R013', 4, { cro_number: ' CRO-S01 ' }), tablet: edit(base, 'R013', 4, { cro_number: 'CRO-S01' }) })).reports.R013.status, 'MATCH', 'surrounding spaces are trimmed');
});

test('transaction types: exactly INV, SR, BC, or the ASCII lower-case forms; no other case folding and no trimming', () => {
  const lower = compare(makeInput({ tablet: edit(base, 'R003', 0, { transaction_type_raw: base.R003[0].transaction_type_raw.toLowerCase() }) }));
  assert.equal(lower.reports.R003.status, 'MATCH');
  assert.equal(lower.reports.R003.normalisations.caseFolded, 1);
  for (const bad of ['XX', 'Inv', ' INV', 'INV ', 'ınv', 'İNV', 'inV', '', null, 'INVOICE']) {
    const result = compare(makeInput({ tablet: edit(base, 'R003', 0, { transaction_type_raw: bad }) }));
    assert.equal(result.reports.R003.status, 'CANNOT_COMPARE', JSON.stringify(bad));
    assert.ok(result.reports.R003.reasonCodes.includes('ETP_BRIDGE_COMPARE_TXN_TYPE_UNKNOWN'), JSON.stringify(bad));
  }
  assert.ok(!/toUpperCase|toLowerCase/.test(SOURCE), 'the module never calls a case function');
});

test('flags that never change the outcome: sign convention, leading zeros and ambiguous pairing', () => {
  const returnIndex = base.R025.findIndex((row) => row.transaction_type_raw === 'SR');
  assert.ok(returnIndex >= 0);
  const negated = clone(base);
  for (const column of ['quantity', 'net_amount', 'scheme_discount', 'user_discount', 'tax_amount']) negated.R025[returnIndex][column] = `-${base.R025[returnIndex][column]}`;
  const sign = compare(makeInput({ pack: negated, tablet: base }));
  assert.equal(sign.reports.R025.status, 'DIFFERENCES');
  assert.ok(sign.reports.R025.flags.includes('ETP_BRIDGE_COMPARE_SIGN_CONVENTION_SUSPECT'));
  assert.ok(sign.reasonCodes.includes('ETP_BRIDGE_COMPARE_SIGN_CONVENTION_SUSPECT'));
  const zero = clone(base);
  zero.R013[0].invoice_number = `00${zero.R013[0].invoice_number}`;
  const lead = compare(makeInput({ pack: zero }));
  assert.equal(lead.reports.R013.status, 'DIFFERENCES');
  assert.equal(lead.reports.R013.rows.onlyPack, 1);
  assert.equal(lead.reports.R013.rows.onlyTablet, 1);
  assert.ok(lead.reports.R013.flags.includes('ETP_BRIDGE_COMPARE_LEADING_ZERO_KEY_SUSPECT'), 'flagged, never repaired');
  const ambiguous = clone(base);
  for (let i = 0; i < 3; i += 1) ambiguous.R022.push({ ...clone(base.R022[0]), net_value: money(1000 + i) });
  const amb = compare(makeInput({ tablet: ambiguous }));
  assert.equal(amb.reports.R022.rows.onlyTablet, 3);
  assert.equal(amb.reports.R022.rows.ambiguousGroups, 1);
  assert.ok(amb.reports.R022.flags.includes('ETP_BRIDGE_COMPARE_PAIRING_AMBIGUOUS'));
  const clean = compare(makeInput());
  assert.deepEqual(clean.reports.R022.flags, []);
});

test('engine figures: a business-rule difference is reported beside a MATCH and is never applied', () => {
  const sales = new Set(base.R022.filter((row) => row.transaction_type_raw === 'INV').map((row) => row.invoice_number)).size;
  const figure = (value, extra = {}) => ({ date: null, figureId: 'R022.INVOICE_COUNT', kind: 'COUNT', reportId: 'R022', ruleRef: 'ETP-DECISION-41', value: String(value), ...extra });
  const equal = compare(makeInput({ figures: [figure(sales)] }));
  assert.equal(equal.figures[0].status, 'MATCH');
  assert.equal(equal.counts.figuresMatched, 1);
  const different = compare(makeInput({ figures: [figure(sales - 2)] }));
  assert.equal(different.outcome, 'MATCH', 'a business-rule difference does not change the outcome');
  assert.equal(different.figures[0].status, 'BUSINESS_RULE_DIFFERENCE');
  assert.equal(different.figures[0].label, 'business-rule difference');
  assert.equal(different.figures[0].tabletUnits, sales);
  assert.equal(different.figures[0].engineUnits, sales - 2);
  assert.equal(different.figures[0].deltaUnits, -2);
  assert.equal(different.figures[0].ruleRef, 'ETP-DECISION-41');
  assert.equal(different.counts.businessRuleDifferences, 1);
  assert.equal(different.appliedToCalculations, false);
  assert.equal(different.publishes, false);
  const day = base.R022[0].invoice_date;
  const perDay = new Set(base.R022.filter((row) => row.transaction_type_raw === 'INV' && row.invoice_date === day).map((row) => row.invoice_number)).size;
  const daily = compare(makeInput({ figures: [figure(perDay, { date: day })] }));
  assert.equal(daily.figures[0].status, 'MATCH');
  assert.equal(compare(makeInput({ figures: [figure(0, { date: '2026-08-30' })] })).figures[0].tabletUnits >= 0, true);
  const rowsDiffer = compare(makeInput({ figures: [figure(sales - 1)], pack: edit(base, 'R022', 0, { net_value: '1.00' }) }));
  assert.equal(rowsDiffer.figures[0].status, 'ROW_DIFFERENCE_PRESENT');
  assert.equal(rowsDiffer.counts.businessRuleDifferences, 0);
  const odd = compare(makeInput({ figures: [figure(3, { figureId: 'R013.SOMETHING_ELSE', reportId: 'R013' }), figure(3, { ruleRef: 'bad ref!' }), { nonsense: true }, figure('x'), figure(3, { kind: 'MONEY_UNITS' })] }));
  assert.equal(odd.figures.length, 5);
  assert.equal(odd.figures[0].status, 'NOT_COMPARABLE');
  assert.equal(odd.figures[1].ruleRef, '', 'a rule reference outside the safe pattern is dropped');
  assert.equal(odd.figures[2].status, 'NOT_COMPARABLE');
  assert.equal(odd.figures[3].status, 'NOT_COMPARABLE');
  assert.equal(odd.figures[4].status, 'NOT_COMPARABLE');
  assert.equal(odd.counts.figuresNotComparable, 4);
  assert.deepEqual(Object.keys(compareApi.FIGURES), ['R022.INVOICE_COUNT'], 'one proposed figure only');
  assert.equal(compareApi.FIGURES['R022.INVOICE_COUNT'].status, 'PROPOSED');
});

test('scope preconditions: only the exact store WLMHW, a matching scope key, an unfenced complete baseline and a verified pack', () => {
  const codeOf = (input) => { const result = compare(input); assert.equal(result.outcome, 'CANNOT_COMPARE'); assert.ok(Object.values(result.reports).every((report) => report.status === 'CANNOT_COMPARE')); return result.reasonCodes; };
  for (const store of ['HEMW', 'AW330', 'wlmhw', ' WLMHW', 'WLMHW ', 'WLMHW​', 'WLMHW.', '']) {
    const input = makeInput();
    input.scope.storeCode = store; input.pack.storeCode = store;
    assert.ok(codeOf(input).includes('ETP_BRIDGE_COMPARE_STORE_REFUSED'), JSON.stringify(store));
  }
  const oneSided = makeInput(); oneSided.pack.storeCode = 'HEMW';
  assert.ok(codeOf(oneSided).includes('ETP_BRIDGE_COMPARE_STORE_REFUSED'));
  const keyMismatch = makeInput(); keyMismatch.pack.scopeKey = 'WLMHW|2026-27|2026-08-01..2026-08-30';
  assert.ok(codeOf(keyMismatch).includes('ETP_BRIDGE_COMPARE_SCOPE_MISMATCH'));
  const forged = makeInput(); forged.scope.scopeKey = 'WLMHW|2026-27|2026-08-01..2026-08-30'; forged.pack.scopeKey = forged.scope.scopeKey;
  assert.ok(codeOf(forged).includes('ETP_BRIDGE_COMPARE_SCOPE_MISMATCH'), 'the key must be built from the fields');
  for (const edit2 of [(i) => { i.pack.verified = 'true'; }, (i) => { i.pack.verified = 1; }, (i) => { delete i.pack.manifestSha256; }, (i) => { i.pack.exportId = 'x'; }, (i) => { i.pack.keyId = 'ABCDEF0123456789'; }]) {
    const input = makeInput(); edit2(input);
    assert.ok(codeOf(input).includes('ETP_BRIDGE_COMPARE_PACK_NOT_VERIFIED'));
  }
  const noGeneration = makeInput(); noGeneration.tablet = { ok: false };
  assert.ok(codeOf(noGeneration).includes('ETP_BRIDGE_COMPARE_NO_TABLET_GENERATION'));
  const badGeneration = makeInput(); badGeneration.tablet.generationId = 'etp_xyz';
  assert.ok(codeOf(badGeneration).includes('ETP_BRIDGE_COMPARE_NO_TABLET_GENERATION'));
  const incomplete = makeInput({ tabletExtra: { complete: false } });
  assert.ok(codeOf(incomplete).includes('ETP_BRIDGE_COMPARE_TABLET_READ_INCOMPLETE'), 'an incomplete baseline is never a MATCH');
  const incompleteText = makeInput({ tabletExtra: { complete: 'true' } });
  assert.ok(codeOf(incompleteText).includes('ETP_BRIDGE_COMPARE_TABLET_READ_INCOMPLETE'));
});

test('the pack tripwire uses PLAIN sums: returns carry positive magnitudes, and a pack that disagrees with its own totals by one paisa cannot be compared', () => {
  const plain = compare(makeInput());
  assert.equal(plain.reports.R025.status, 'MATCH', 'plain engine totals of a month with SR rows are accepted');
  const rowsPlain = computeTotals(base.R025, 'R025').sums.net_amount, signedPack = plain.reports.R025.totals.pack.sums.net_amount;
  assert.notEqual(Number(rowsPlain.replace('.', '')), signedPack, 'the plain sum differs from the signed sum when there are returns');
  const totals = Object.fromEntries(REPORT_IDS.map((id) => [id, { rowCount: base[id].length, sums: computeTotals(base[id], id).sums }]));
  const off = clone(totals);
  off.R022.sums.net_value = money(Math.round(Number(off.R022.sums.net_value) * 100) + 1);
  const result = compare(makeInput({ totals: off }));
  assert.equal(result.reports.R022.status, 'CANNOT_COMPARE');
  assert.deepEqual(result.reports.R022.reasonCodes, ['ETP_BRIDGE_COMPARE_PACK_TOTALS_INCONSISTENT']);
  assert.equal(result.reports.R003.status, 'MATCH');
  const signed = clone(totals);
  signed.R025.sums.net_amount = money(plain.reports.R025.totals.pack.sums.net_amount);
  assert.equal(compare(makeInput({ totals: signed })).reports.R025.status, 'CANNOT_COMPARE', 'signed sums are not plain sums');
  for (const mutate of [(t) => { t.R003.rowCount += 1; }, (t) => { delete t.R003.sums.net_amount; }, (t) => { t.R003.sums.extra = '1.00'; }, (t) => { t.R003.sums.net_amount = 5; }, (t) => { t.R003 = null; }]) {
    const copy = clone(totals); mutate(copy);
    assert.equal(compare(makeInput({ totals: copy })).reports.R003.status, 'CANNOT_COMPARE');
  }
});

test('the tablet row count must equal the count the baseline reports; a short read is a CANNOT_COMPARE', () => {
  const equal = compare(makeInput({ tabletExtra: { expectedRowCounts: { R003: 40, R013: 40, R022: 40, R025: 40 } } }));
  assert.equal(equal.outcome, 'MATCH');
  const short = compare(makeInput({ tabletExtra: { expectedRowCounts: { R003: 40, R013: 41, R022: 40, R025: 40 } } }));
  assert.equal(short.reports.R013.status, 'CANNOT_COMPARE');
  assert.deepEqual(short.reports.R013.reasonCodes, ['ETP_BRIDGE_COMPARE_TABLET_COUNT_MISMATCH']);
  assert.equal(short.outcome, 'CANNOT_COMPARE');
  const odd = compare(makeInput({ tabletExtra: { expectedRowCounts: { R003: '40' } } }));
  assert.equal(odd.reports.R003.status, 'CANNOT_COMPARE');
});

test('row shape: extra, missing and blocked keys, odd values and non-objects are refused without an exception or pollution', () => {
  const before = Object.keys(Object.prototype).length;
  const attempts = [
    (rows) => { rows.R013[0].customer_name = 'x'; }, (rows) => { delete rows.R013[0].cro_number; }, (rows) => { rows.R013.push(null); }, (rows) => { rows.R013.push('row'); },
    (rows) => { rows.R013.push([]); }, (rows) => { rows.R013[0].quantity = { value: 1 }; }, (rows) => { rows.R013[0].quantity = true; },
    (rows) => { rows.R013[0] = JSON.parse(`{"invoice_date":"2026-08-03","invoice_number":"1","transaction_type_raw":"INV","quantity":"1.000","net_amount":"1.00","__proto__":{"x":1}}`); }
  ];
  for (const attempt of attempts) {
    const tabletRows = clone(base); attempt(tabletRows);
    const result = compare(makeInput({ tablet: tabletRows }));
    assert.equal(result.reports.R013.status, 'CANNOT_COMPARE');
    assert.ok(result.reports.R013.reasonCodes.includes('ETP_BRIDGE_COMPARE_ROW_SHAPE_INVALID'));
    assert.equal(result.reports.R013.rows.matched, 0);
  }
  assert.equal(Object.keys(Object.prototype).length, before);
  assert.equal({}.x, undefined);
  const hostileInput = makeInput();
  Object.defineProperty(hostileInput.tablet.rows.R003, '0', { get() { throw new Error('boom'); }, enumerable: true });
  assert.doesNotThrow(() => compare(hostileInput));
  assert.equal(compare(hostileInput).ok === false || compare(hostileInput).outcome === 'CANNOT_COMPARE', true);
});

test('hostile exponents are bounded: a huge exponent cannot allocate a huge string, and zero with a large exponent is not read', () => {
  const started = Date.now();
  for (const bad of ['1e99999999', '0e31', '5E-999999999', '1e-31', '1E31', '0E-31']) {
    const result = compare(makeInput({ tablet: edit(base, 'R003', 0, { net_amount: bad }) }));
    assert.equal(result.reports.R003.status, 'CANNOT_COMPARE', bad);
    assert.deepEqual(result.reports.R003.reasonCodes, ['ETP_BRIDGE_COMPARE_ROW_VALUE_UNPARSEABLE'], bad);
  }
  assert.ok(Date.now() - started < 2000);
});

test('dates must be real calendar dates in ISO form', () => {
  for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-8-1', '20260801', 'x', '', null, '2026-08-32', '2026/08/05', ' 2026-08-05x']) {
    const result = compare(makeInput({ tablet: edit(base, 'R003', 0, { invoice_date: bad }) }));
    assert.equal(result.reports.R003.status, 'CANNOT_COMPARE', JSON.stringify(bad));
  }
  assert.equal(compare(makeInput({ tablet: edit(base, 'R003', 0, { invoice_date: ` ${base.R003[0].invoice_date} ` }) })).reports.R003.status, 'MATCH', 'surrounding spaces are trimmed');
});

test('engine figure values must be canonical integer text; look-alike numbers are not comparable', () => {
  const figure = (value) => ({ date: null, figureId: 'R022.INVOICE_COUNT', kind: 'COUNT', reportId: 'R022', ruleRef: 'ETP-DECISION-41', value });
  for (const bad of ['0x10', '1e2', ' 5', '+5', '05', '1.0', '-0', '', '9007199254740993', 5, null, undefined]) {
    assert.equal(compare(makeInput({ figures: [figure(bad)] })).figures[0].status, 'NOT_COMPARABLE', JSON.stringify(bad));
  }
  const sales = new Set(base.R022.filter((row) => row.transaction_type_raw === 'INV').map((row) => row.invoice_number)).size;
  assert.equal(compare(makeInput({ figures: [figure(String(sales))] })).figures[0].status, 'MATCH');
});

test('the outcome is DIFFERENCES whenever any report differs, even if another report cannot be read; the unreadable one is still listed', () => {
  const tabletRows = edit(base, 'R013', 0, { net_amount: 'abc' });
  const result = compare(makeInput({ tablet: tabletRows, pack: edit(base, 'R025', 2, { net_amount: '1.00' }) }));
  assert.equal(result.outcome, 'DIFFERENCES');
  assert.equal(result.reports.R013.status, 'CANNOT_COMPARE');
  assert.equal(result.reports.R025.status, 'DIFFERENCES');
  assert.equal(result.counts.reportsCannotCompare, 1);
  assert.equal(result.counts.reportsDifferent, 1);
});

test('text cells that contain the separator or a backslash cannot collide with a neighbouring column', () => {
  const tabletSide = clone(base), packSide = clone(base);
  Object.assign(tabletSide.R025[0], { brand: 'A\u001fB', cluster: 'C' });
  Object.assign(packSide.R025[0], { brand: 'A', cluster: 'B\u001fC' });
  const result = compare(makeInput({ tablet: tabletSide, pack: packSide }));
  assert.equal(result.reports.R025.status, 'DIFFERENCES');
  assert.equal(result.reports.R025.columns.brand.rows, 1);
  assert.equal(result.reports.R025.columns.cluster.rows, 1);
  const slashes = compare(makeInput({ tablet: edit(base, 'R025', 0, { brand: 'A\\u', cluster: 'x' }), pack: edit(base, 'R025', 0, { brand: 'A\u001f', cluster: 'x' }) }));
  assert.equal(slashes.reports.R025.status, 'DIFFERENCES');
  assert.equal(compare(makeInput({ tablet: edit(base, 'R025', 0, { brand: 'A\u001fB' }), pack: edit(base, 'R025', 0, { brand: 'A\u001fB' }) })).reports.R025.status, 'MATCH');
});

test('misuse never throws: bad input gives a coded failure, not an outcome', () => {
  for (const input of [undefined, null, 5, 'x', [], {}, { scope: {}, tablet: {}, pack: null }, { scope: null, tablet: {}, pack: {} }, makeInput({ options: { sampleLimitPerReport: 9 } }), makeInput({ options: { sampleLimitPerReport: -1 } }), makeInput({ options: 'x' })]) {
    const result = compare(input);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'ETP_BRIDGE_COMPARE_INPUT_INVALID');
    assert.equal(result.stage, 'COMPARE');
  }
  const throwing = { get scope() { throw new Error('boom'); } };
  assert.equal(compare(throwing).code, 'ETP_BRIDGE_COMPARE_INPUT_INVALID');
});

test('limits: 50,000 rows are accepted and 50,001 are refused; a sum near 2^53 is an explicit overflow, and large inputs finish quickly', () => {
  const big = (count) => Array.from({ length: count }, (_, i) => ({ invoice_date: '2026-08-05', transaction_type_raw: 'INV', net_amount: '1.00', scheme_discount: '0.00', user_discount: `0.0${i % 10}` }));
  const wide = { R003: big(50000) };
  const started = Date.now();
  const ok = compare(makeInput({ tablet: { ...base, R003: wide.R003 }, pack: { ...base, R003: wide.R003 } }));
  assert.equal(ok.reports.R003.status, 'MATCH');
  assert.equal(ok.reports.R003.rows.matched, 50000);
  assert.ok(Date.now() - started < 10000, 'finishes in a sane time on Node (not a device claim)');
  const over = compare(makeInput({ tablet: { ...base, R003: big(50001) }, pack: { ...base, R003: big(50001) }, totals: undefined }));
  assert.equal(over.reports.R003.status, 'CANNOT_COMPARE');
  assert.deepEqual(over.reports.R003.reasonCodes, ['ETP_BRIDGE_COMPARE_ROW_LIMIT_EXCEEDED']);
  const huge = [{ ...base.R003[0], net_amount: '90071992547409.91', transaction_type_raw: 'INV' }, { ...base.R003[0], net_amount: '90071992547409.91', transaction_type_raw: 'INV', invoice_date: '2026-08-04' }];
  const overflow = compare(makeInput({ tablet: { ...base, R003: huge }, pack: { ...base, R003: huge }, totals: {} }));
  assert.equal(overflow.reports.R003.status, 'CANNOT_COMPARE');
  assert.ok(overflow.reports.R003.reasonCodes.includes('ETP_BRIDGE_COMPARE_AGGREGATE_OVERFLOW'));
});

test('days are the union of both sides; a day on one side only counts, the list is bounded at 62, the true count is kept', () => {
  const extra = clone(base);
  extra.R003.push({ invoice_date: '2026-09-15', transaction_type_raw: 'INV', net_amount: '10.00', scheme_discount: '0.00', user_discount: '0.00' });
  const outside = compare(makeInput({ tablet: extra }));
  assert.equal(outside.reports.R003.status, 'DIFFERENCES');
  assert.ok(outside.reports.R003.days.some((day) => day.date === '2026-09-15'));
  assert.equal(compare(makeInput({ pack: extra })).reports.R003.days.some((day) => day.date === '2026-09-15'), true, 'in both directions');
  const spread = (shift) => Array.from({ length: 70 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    return { invoice_date: date, transaction_type_raw: 'INV', net_amount: String(100 + shift) + '.00', scheme_discount: '0.00', user_discount: '0.00' };
  });
  const many = compare(makeInput({ tablet: { ...base, R003: spread(0) }, pack: { ...base, R003: spread(1) } }));
  assert.equal(many.reports.R003.daysDiffering, 70);
  assert.equal(many.reports.R003.days.length, 62);
  assert.ok(many.reports.R003.flags.includes('ETP_BRIDGE_COMPARE_DAYS_TRUNCATED'));
});

test('samples are off by default, bounded when asked for, and carry only the row key', () => {
  const missing = clone(base); missing.R025.splice(0, 1);
  assert.deepEqual(compare(makeInput({ pack: missing })).samples, []);
  const sampled = compare(makeInput({ pack: missing, options: { sampleLimitPerReport: 2 } }));
  assert.equal(sampled.samples.length, 1);
  assert.equal(sampled.samples[0].kind, 'ONLY_TABLET');
  assert.equal(sampled.samples[0].report, 'R025');
  assert.deepEqual(Object.keys(sampled.samples[0].key).sort(), ['invoice_date', 'invoice_number', 'transaction_type_raw']);
});

test('the module agrees with the verifier and the gateway: same columns, same measures, same report list', () => {
  assert.deepEqual([...REPORT_IDS], [...verifierApi.REPORT_IDS]);
  for (const id of REPORT_IDS) {
    assert.deepEqual([...COLUMNS[id]], [...verifierApi.REPORT_COLUMNS[id]], `${id} columns equal the verifier columns`);
    assert.deepEqual(MEASURES[id].map((m) => [m.name, m.scale]), verifierApi.MEASURES[id].map((m) => [m.name, m.scale]), `${id} measures`);
    const projection = id === 'R022' ? ['invoice_date', 'invoice_number', ...gatewayApi.PROJECTIONS[id]] : ['invoice_date', ...gatewayApi.PROJECTIONS[id]];
    assert.deepEqual([...COLUMNS[id]], projection, `${id} columns equal the gateway analytics projection`);
  }
});

test('codes are a frozen list of safe names; the module is pure and names no storage, network, publish or calculation surface', () => {
  assert.ok(Object.isFrozen(CODES) && Object.isFrozen(compareApi));
  for (const code of CODES) assert.match(code, /^ETP_BRIDGE_COMPARE_[A-Z0-9_]{1,60}$/);
  assert.equal(new Set(CODES).size, CODES.length);
  for (const pattern of BANNED_BROWSER_TOKENS) assert.doesNotMatch(SOURCE, pattern, String(pattern));
  assert.doesNotMatch(SOURCE, /importFacade|confirm\s*\(|createReceipt|saveReceipt|SaagarEtpStore|beginStage|publishStage|\bpublish\s*\(|\bapply\s*\(|incentive|payroll|Date\.now|new Date\(\)/i);
  assert.deepEqual(Object.keys(compareApi).sort(), ['CODES', 'COLUMNS', 'CONTRACT', 'FIGURES', 'INFORMATIONAL', 'LABEL_RULE_DIFFERENCE', 'MAX_DAYS_LISTED', 'MAX_ROWS', 'MEASURES', 'REPORT_IDS', 'VERSION', 'compare', 'formatUnits']);
  for (const name of Object.keys(compareApi)) assert.doesNotMatch(name, /^(?:publish|apply|confirm|save|store|persist)/i);
});

test('in a browser-like context the global is defined once, frozen, non-writable and non-configurable; an existing name is never replaced', () => {
  const context = vm.createContext({});
  vm.runInContext(SOURCE, context, { filename: 'etp-bridge-compare.js' });
  const descriptor = Object.getOwnPropertyDescriptor(context, 'SaagarEtpBridgeCompare');
  assert.equal(descriptor.writable, false);
  assert.equal(descriptor.configurable, false);
  assert.ok(Object.isFrozen(descriptor.value));
  const before = descriptor.value;
  vm.runInContext(SOURCE, context, { filename: 'again.js' });
  assert.equal(Object.getOwnPropertyDescriptor(context, 'SaagarEtpBridgeCompare').value, before);
  const taken = vm.createContext({ SaagarEtpBridgeCompare: 'earlier' });
  vm.runInContext(SOURCE, taken);
  assert.equal(taken.SaagarEtpBridgeCompare, 'earlier', 'an existing definition is left alone, not replaced');
});

test('formatting helper: 2-place money, 3-place quantity, signs and small values', () => {
  assert.equal(compareApi.formatUnits(0, 2), '0.00');
  assert.equal(compareApi.formatUnits(5, 2), '0.05');
  assert.equal(compareApi.formatUnits(-5, 2), '-0.05');
  assert.equal(compareApi.formatUnits(123456, 2), '1234.56');
  assert.equal(compareApi.formatUnits(7, 3), '0.007');
  assert.equal(compareApi.formatUnits(-12345, 3), '-12.345');
});
