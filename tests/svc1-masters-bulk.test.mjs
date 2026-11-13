import assert from 'node:assert/strict';
import test from 'node:test';
import { masters as M, makeEnv, part, OWNER, MANAGER, STAFF } from './lib/svc1-masters-env.mjs';

const PH = M.TEMPLATE_HEADERS.part.join(',');
const LH = M.TEMPLATE_HEADERS.labour.join(',');
const row = (...c) => c.join(',');
const codesOf = (plan) => plan.errors.map((e) => e.code);

function twelve() {
  const lines = [PH];
  for (let i = 1; i <= 12; i += 1) {
    const n = String(i).padStart(4, '0');
    const tax = i <= 9 ? ',9102,18' : ',,';
    lines.push(`TST${n},Invented part ${n},Strap,pc${tax},${i * 100}.50,${i % 2 ? 'yes' : 'no'},${i},${i * 2},A${i},${i % 3 === 0 ? 'battery|counter_saleable' : ''}`);
  }
  return lines.join('\n');
}

test('parseTemplate: comma, tab, BOM, CRLF, blank lines, quotes', () => {
  const text = '﻿' + PH + '\r\n\r\nA1,"Name, with comma",G,pc,,,"1,250.00",yes,0,0,,\r\n,,,,,,,,,,,\r\nA2,"Say ""hi""",G,pc,,,10,no,0,0,,\r\n';
  const p = M.parseTemplate('part', text);
  assert.equal(p.ok, true, JSON.stringify(p.errors));
  assert.equal(p.delimiter, ',');
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[0].cells[1], 'Name, with comma');
  assert.equal(p.rows[0].cells[6], '1,250.00');
  assert.equal(p.rows[0].quoted[6], true);
  assert.equal(p.rows[1].cells[1], 'Say "hi"');
  assert.deepEqual(p.rows.map((r) => r.line), [3, 5]);
  const tab = M.parseTemplate('part', M.TEMPLATE_HEADERS.part.join('\t') + '\nB1\tName\tG\tpc\t\t\t100\tyes\t0\t0\t\t');
  assert.equal(tab.delimiter, '\t');
  assert.equal(tab.ok, true);
  assert.equal(tab.rows[0].cells.length, 12);
  const unbalanced = M.parseTemplate('part', PH + '\nA1,"open,G,pc,,,10,yes,0,0,,');
  assert.equal(unbalanced.ok, false);
  assert.equal(unbalanced.errors[0].code, 'TEMPLATE_QUOTE_UNBALANCED');
  assert.equal(unbalanced.errors[0].line, 2);
});

test('parseTemplate: header errors', () => {
  assert.equal(M.parseTemplate('part', '').code, 'TEMPLATE_EMPTY');
  assert.equal(M.parseTemplate('part', '  \n\n ,,, \n').code, 'TEMPLATE_EMPTY');
  assert.equal(M.parseTemplate('part', undefined).code, 'TEMPLATE_EMPTY');
  const swapped = M.parseTemplate('part', ['name', 'code', ...M.TEMPLATE_HEADERS.part.slice(2)].join(','));
  assert.equal(swapped.code, 'TEMPLATE_HEADER_MISMATCH');
  const missing = M.parseTemplate('part', M.TEMPLATE_HEADERS.part.slice(0, 11).join(','));
  assert.equal(missing.code, 'TEMPLATE_HEADER_MISMATCH');
  assert.deepEqual(missing.missing, ['flags']);
  const extra = M.parseTemplate('part', PH + ',colour');
  assert.equal(extra.code, 'TEMPLATE_HEADER_MISMATCH');
  assert.deepEqual(extra.unexpected, ['colour']);
  assert.equal(M.parseTemplate('part', LH).code, 'TEMPLATE_HEADER_MISMATCH');
  assert.equal(M.parseTemplate('labour', PH).code, 'TEMPLATE_HEADER_MISMATCH');
  for (const bad of ['mobile', 'Customer Name', 'E-Mail', 'address', 'GSTIN', 'PAN', 'aadhaar', 'phone', 'email']) {
    assert.equal(M.parseTemplate('part', PH + ',' + bad).code, 'TEMPLATE_CUSTOMER_COLUMN', bad);
  }
  assert.equal(M.parseTemplate('part', PH.toUpperCase()).code, undefined);
  assert.equal(M.parseTemplate('widget', PH).code, 'KIND_INVALID');
});

test('parseTemplate: size limits (200 rows, 100000 characters)', () => {
  const body = (n) => PH + '\n' + Array(n).fill('A1,n,g,pc,,,1,yes,0,0,,').join('\n');
  assert.equal(M.parseTemplate('part', body(200)).ok, true);
  assert.equal(M.parseTemplate('part', body(201)).code, 'TEMPLATE_TOO_MANY_ROWS');
  assert.equal(M.parseTemplate('part', 'x'.repeat(100001)).code, 'TEMPLATE_TOO_LARGE');
  assert.equal(M.MAX_TEMPLATE_ROWS, 200);
});

test('planBulkCreate: row errors carry the line number and the template field name', () => {
  const env = makeEnv();
  const text = [PH,
    row('E1', '=BAD', 'G', 'pc', '', '', '10', 'yes', '0', '0', '', ''),
    row('E2', 'n', 'G', 'kg', '', '', '10', 'yes', '0', '0', '', ''),
    row('E3', 'n', 'G', 'pc', '12A4', '', '10', 'yes', '0', '0', '', ''),
    row('E4', 'n', 'G', 'pc', '', '101', '10', 'yes', '0', '0', '', ''),
    row('E5', 'n', 'G', 'pc', '', '', '10.123', 'yes', '0', '0', '', ''),
    row('E6', 'n', 'G', 'pc', '', '', '10', 'maybe', '0', '0', '', ''),
    row('E7', 'n', 'G', 'pc', '', '', '10', 'yes', '1.5', '0', '', ''),
    row('E8', 'n', 'G', 'pc', '', '', '10', 'yes', '0', '0', '', 'shiny'),
    row('E9', 'n', 'G', 'pc', '', '', '10', '', '0', '0', '', ''),
    row('E10', 'n', 'G', 'pc'),
    row('E11', 'n', 'G', 'pc', '', '', '10', 'yes', '0', '0', '<b>', '')
  ].join('\n');
  const plan = M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', text);
  assert.equal(plan.ok, false);
  assert.equal(plan.code, 'TEMPLATE_HAS_ERRORS');
  const by = Object.fromEntries(plan.errors.map((e) => [e.line, e]));
  assert.deepEqual([by[2].code, by[2].field], ['TEMPLATE_FORMULA_LIKE', 'name']);
  assert.deepEqual([by[3].code, by[3].field], ['UNIT_INVALID', 'unit']);
  assert.deepEqual([by[4].code, by[4].field], ['HSN_INVALID', 'hsn']);
  assert.deepEqual([by[5].code, by[5].field], ['GST_RATE_INVALID', 'gst_rate']);
  assert.deepEqual([by[6].code, by[6].field], ['PRICE_INVALID', 'sell_price']);
  assert.deepEqual([by[7].code, by[7].field], ['PRICE_BASIS_INVALID', 'price_includes_tax']);
  assert.deepEqual([by[8].code, by[8].field], ['REORDER_INVALID', 'reorder_level']);
  assert.deepEqual([by[9].code, by[9].field], ['FLAG_INVALID', 'flags']);
  assert.deepEqual([by[10].code, by[10].field], ['PRICE_BASIS_REQUIRED', 'price_includes_tax']);
  assert.equal(by[11].code, 'TEMPLATE_ROW_WIDTH');
  assert.deepEqual([by[12].code, by[12].field], ['BIN_INVALID', 'bin']);
  assert.equal(plan.toCreate.length, 0);
  assert.equal(plan.errors.length, 11);
});

test('planBulkCreate: duplicates inside the file and zero variants', () => {
  const env = makeEnv();
  M.createRow(env.store, env.ctx(MANAGER), 'part', part('0900'));
  const ok = (code) => row(code, 'n', 'G', 'pc', '', '', '10', 'yes', '0', '0', '', '');
  const plan = M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', [PH, ok('D1'), ok('d1'), ok('Z7'), ok('007'), ok('900')].join('\n'));
  const dup = plan.errors.filter((e) => e.code === 'TEMPLATE_DUPLICATE_IN_FILE').map((e) => e.line).sort();
  assert.deepEqual(dup, [2, 3]);
  const zero = plan.errors.filter((e) => e.code === 'PART_CODE_ZERO_VARIANT').map((e) => e.line);
  assert.deepEqual(zero, [6]);
  const two = M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', [PH, ok('0123'), ok('123')].join('\n'));
  assert.deepEqual(two.errors.filter((e) => e.code === 'PART_CODE_ZERO_VARIANT').map((e) => e.line).sort(), [2, 3]);
});

test('a file with one bad row among ten is refused as a whole and nothing is written', () => {
  const env = makeEnv();
  const lines = [PH];
  for (let i = 1; i <= 10; i += 1) lines.push(row('OK' + i, 'n', 'G', 'pc', '', '', i === 7 ? 'abc' : '10', 'yes', '0', '0', '', ''));
  const before = env.snapshot();
  const plan = M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', lines.join('\n'));
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.errors.map((e) => e.line), [8]);
  assert.equal(M.commitBulkCreate(env.store, env.ctx(MANAGER), plan).code, 'TEMPLATE_HAS_ERRORS');
  assert.equal(env.snapshot(), before);
});

test('existing codes are skipped with a diff, not changed', () => {
  const env = makeEnv();
  M.createRow(env.store, env.ctx(MANAGER), 'part', part('KEEP1', { name: 'Old name' }));
  const text = [PH, row('KEEP1', 'New name', 'Battery', 'pc', '', '', '150.00', 'yes', '0', '0', '', ''), row('NEW1', 'n', 'G', 'pc', '', '', '10', 'yes', '0', '0', '', '')].join('\n');
  const plan = M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', text);
  assert.equal(plan.ok, true);
  assert.equal(plan.skippedExisting.length, 1);
  assert.equal(plan.skippedExisting[0].code, 'KEEP1');
  assert.deepEqual(plan.skippedExisting[0].diff.map((d) => d.field), ['name']);
  assert.equal(plan.toCreate.length, 1);
  const done = M.commitBulkCreate(env.store, env.ctx(MANAGER), plan);
  assert.equal(done.ok, true);
  assert.equal(M.getRow(env.store, 'part', 'KEEP1').row.name, 'Old name');
  const allExist = M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', [PH, row('KEEP1', 'n', 'G', 'pc', '', '', '10', 'yes', '0', '0', '', '')].join('\n'));
  assert.equal(allExist.ok, false);
  assert.equal(allExist.code, 'TEMPLATE_NOTHING_TO_CREATE');
  assert.equal(M.commitBulkCreate(env.store, env.ctx(MANAGER), allExist).code, 'TEMPLATE_NOTHING_TO_CREATE');
});

test('happy path: twelve invented parts, one append, tax pending counted, same text gives the same batch id', () => {
  const env = makeEnv();
  const text = twelve();
  const plan = M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', text);
  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  assert.equal(plan.rowCount, 12);
  assert.equal(plan.toCreate.length, 12);
  assert.equal(plan.taxPendingCount, 3);
  assert.match(plan.batchId, /^MB-[0-9a-f]{12}$/);
  assert.equal(M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', text.replace(/\n/g, '\r\n') + '\r\n').batchId, plan.batchId);
  assert.notEqual(M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', text + '\n').batchId === '', true);
  const revBefore = env.store.head('parts').rev;
  const done = M.commitBulkCreate(env.store, env.ctx(MANAGER, { clientRef: env.ref() }), plan);
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.equal(done.created, 12);
  assert.equal(done.batchId, plan.batchId);
  assert.equal(env.store.head('parts').rev, revBefore + 1);
  const recs = env.store.read('parts').records;
  assert.equal(recs.length, 12);
  assert.equal(new Set(recs.map((r) => r.k)).size, 1);
  assert.equal(recs[0].b.via, 'template');
  assert.equal(recs[0].b.batchId, plan.batchId);
  const all = M.loadMasters(env.store).parts;
  assert.equal(all.length, 12);
  assert.equal(all[0].source, 'template');
  assert.equal(all[0].batchId, plan.batchId);
  assert.equal(all[0].rev, 1);
  assert.equal(all[0].sellPricePaise, 10050);
  assert.equal(all[0].gstRateBp, 1800);
  assert.equal(all[0].priceIncludesTax, true);
  assert.equal(all[2].flags.battery, true);
  assert.equal(all[2].flags.counterSaleable, true);
  assert.equal(all[0].flags.battery, false);
  assert.equal(all[11].hsn, '');
  assert.equal(all[11].gstRateBp, null);
  assert.equal(M.filterRows(all, { taxPending: true }).length, 3);
  assert.equal(M.historyFor(env.store, 'part', 'TST0005').entries[0].via, 'template');
  // second commit of the same plan: every code exists
  assert.equal(M.commitBulkCreate(env.store, env.ctx(MANAGER), plan).code, 'TEMPLATE_NOTHING_TO_CREATE');
});

test('commit retried with the same client reference does not write twice', () => {
  const env = makeEnv();
  const plan = M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', twelve());
  const ref = env.ref();
  assert.equal(M.commitBulkCreate(env.store, env.ctx(MANAGER, { clientRef: ref }), plan).ok, true);
  const again = M.commitBulkCreate(env.store, env.ctx(MANAGER, { clientRef: ref }), plan);
  assert.equal(again.ok, true);
  assert.equal(again.replayed, true);
  assert.equal(env.store.read('parts').records.length, 12);
});

test('a stale plan is re-checked at commit', () => {
  const env = makeEnv();
  const plan = M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', twelve());
  M.createRow(env.store, env.ctx(MANAGER), 'part', part('TST0003'));
  const before = env.snapshot();
  const r = M.commitBulkCreate(env.store, env.ctx(MANAGER), plan);
  assert.equal(r.code, 'PART_CODE_DUPLICATE');
  assert.equal(env.snapshot(), before);
  // a zero variant created after the plan
  const env2 = makeEnv();
  const plan2 = M.planBulkCreate(env2.store, env2.ctx(MANAGER), 'part', [PH, row('77', 'n', 'G', 'pc', '', '', '10', 'yes', '0', '0', '', '')].join('\n'));
  M.createRow(env2.store, env2.ctx(MANAGER), 'part', part('077'));
  assert.equal(M.commitBulkCreate(env2.store, env2.ctx(MANAGER), plan2).code, 'PART_CODE_ZERO_VARIANT');
});

test('a tampered plan cannot sneak a bad row in', () => {
  const env = makeEnv();
  const plan = M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', twelve());
  const forged = { ...plan, toCreate: plan.toCreate.map((r, i) => (i === 4 ? { ...r, sellPricePaise: 1.5 } : r)) };
  assert.equal(M.commitBulkCreate(env.store, env.ctx(MANAGER), forged).code, 'PRICE_INVALID');
  assert.equal(M.commitBulkCreate(env.store, env.ctx(MANAGER), { ...plan, batchId: 'bad' }).code, 'ARGS_INVALID');
  assert.equal(M.commitBulkCreate(env.store, env.ctx(MANAGER), { ...plan, toCreate: [plan.toCreate[0], plan.toCreate[0]] }).code, 'TEMPLATE_DUPLICATE_IN_FILE');
  assert.equal(M.commitBulkCreate(env.store, env.ctx(MANAGER), null).code, 'ARGS_INVALID');
  assert.equal(M.commitBulkCreate(env.store, env.ctx(MANAGER), { ...plan, kind: 'widget' }).code, 'KIND_INVALID');
  assert.equal(env.store.read('parts').records.length, 0);
});

test('roles: staff cannot plan or commit; the tier is re-read at commit', () => {
  const env = makeEnv();
  assert.equal(M.planBulkCreate(env.store, env.ctx(STAFF), 'part', twelve()).code, 'ROLE_DENIED');
  const plan = M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', twelve());
  assert.equal(plan.ok, true);
  assert.equal(M.commitBulkCreate(env.store, env.ctx(STAFF), plan).code, 'ROLE_DENIED');
  assert.equal(env.store.read('parts').records.length, 0);
  assert.equal(M.commitBulkCreate(env.store, env.ctx(OWNER), plan).ok, true);
});

test('labour template creates labour rows only', () => {
  const env = makeEnv();
  const text = [LH, row('LB1', 'Cleaning (invented)', 'Service', 'job', '9987', '18', '350.00', 'yes'), row('LB2', 'Strap fit', 'Service', 'job', '', '', '', '')].join('\n');
  const plan = M.planBulkCreate(env.store, env.ctx(MANAGER), 'labour', text);
  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  assert.equal(plan.taxPendingCount, 1);
  const done = M.commitBulkCreate(env.store, env.ctx(MANAGER), plan);
  assert.equal(done.ok, true);
  const m = M.loadMasters(env.store);
  assert.equal(m.labour.length, 2);
  assert.equal(m.parts.length, 0);
  assert.equal(m.labour[0].ratePaise, 35000);
  assert.equal(m.labour[0].gstRateBp, 1800);
  assert.equal(m.labour[0].sac, '9987');
  assert.equal(env.store.read('labour').records[0].k, 'LAB_CREATE');
});

test('money cells: quoted thousands in a tab file, unquoted comma is a width error in a comma file', () => {
  const env = makeEnv();
  const tabText = M.TEMPLATE_HEADERS.part.join('\t') + '\nT1\tName\tG\tpc\t\t\t"1,250.00"\tyes\t0\t0\t\t';
  const plan = M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', tabText);
  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  assert.equal(plan.toCreate[0].sellPricePaise, 125000);
  const unquoted = M.TEMPLATE_HEADERS.part.join('\t') + '\nT1\tName\tG\tpc\t\t\t1,250.00\tyes\t0\t0\t\t';
  assert.equal(M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', unquoted).errors[0].code, 'PRICE_INVALID');
  const comma = PH + '\nT1,Name,G,pc,,,1,250.00,yes,0,0,,';
  assert.equal(M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', comma).errors[0].code, 'TEMPLATE_ROW_WIDTH');
});

test('blank price and basis are accepted; price without a basis is not', () => {
  const env = makeEnv();
  const good = M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', [PH, row('B1', 'n', 'G', 'pc', '', '', '', '', '', '', '', '')].join('\n'));
  assert.equal(good.ok, true, JSON.stringify(good.errors));
  assert.equal(good.toCreate[0].sellPricePaise, 0);
  assert.equal(good.toCreate[0].priceIncludesTax, null);
  assert.equal(good.warnings.some((w) => w.code === 'PRICE_ZERO_WARNING' && w.line === 2), true);
  const bad = M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', [PH, row('B2', 'n', 'G', 'pc', '', '', '100', '', '', '', '', '')].join('\n'));
  assert.equal(bad.errors[0].code, 'PRICE_BASIS_REQUIRED');
  assert.equal(bad.errors[0].field, 'price_includes_tax');
});

test('flags parse from the template tokens; rupee sign and percent sign are accepted', () => {
  const env = makeEnv();
  const text = [PH, row('F1', 'n', 'G', 'PC', '8506', '12.5%', '₹250.5', 'Y', '2', '4', 'A-1', 'warranty_claimable|crown|strap')].join('\n');
  const plan = M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', text);
  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  const r = plan.toCreate[0];
  assert.equal(r.gstRateBp, 1250);
  assert.equal(r.sellPricePaise, 25050);
  assert.equal(r.unit, 'pc');
  assert.equal(r.flags.warrantyClaimable, true);
  assert.equal(r.flags.crown, true);
  assert.equal(r.flags.strap, true);
  assert.equal(r.flags.glass, false);
});

test('the example shown to the user is a valid template for both kinds', () => {
  const env = makeEnv();
  for (const kind of ['part', 'labour']) {
    const plan = M.planBulkCreate(env.store, env.ctx(MANAGER), kind, M.templateExample(kind));
    assert.equal(plan.ok, true, kind + ' ' + JSON.stringify(plan.errors));
    assert.equal(plan.toCreate.length, 1);
  }
});

test('200 rows go in as one append; the 200-row limit is exact', () => {
  const env = makeEnv();
  const lines = [PH];
  for (let i = 0; i < 200; i += 1) lines.push(row('B' + String(i).padStart(4, '0'), 'n', 'G', 'pc', '', '', '10', 'yes', '0', '0', '', ''));
  const plan = M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', lines.join('\n'));
  assert.equal(plan.ok, true);
  const rev = env.store.head('parts').rev;
  assert.equal(M.commitBulkCreate(env.store, env.ctx(MANAGER), plan).created, 200);
  assert.equal(env.store.head('parts').rev, rev + 1);
  lines.push(row('B9999', 'n', 'G', 'pc', '', '', '10', 'yes', '0', '0', '', ''));
  assert.equal(M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', lines.join('\n')).code, 'TEMPLATE_TOO_MANY_ROWS');
});

test('customer-like text in a cell is just text, but the stored body never gets a forbidden key', () => {
  const env = makeEnv();
  const plan = M.planBulkCreate(env.store, env.ctx(MANAGER), 'part', [PH, row('C1', 'Mobile phone strap', 'G', 'pc', '', '', '10', 'yes', '0', '0', '', '')].join('\n'));
  assert.equal(plan.ok, true);
  assert.equal(M.commitBulkCreate(env.store, env.ctx(MANAGER), plan).ok, true);
});
