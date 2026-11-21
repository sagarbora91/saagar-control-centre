import assert from 'node:assert/strict';
import test from 'node:test';
import { masters as M, makeEnv, part, labour, OWNER, MANAGER, STAFF, NONE, NO_STOCK } from './lib/svc1-masters-env.mjs';

function setup() {
  const env = makeEnv();
  return env;
}
function mk(env, code, extra) {
  const r = M.createRow(env.store, env.ctx(MANAGER), 'part', part(code, extra));
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.row;
}
const codeOf = (r) => r.errors && r.errors.map((e) => e.code);
function firstCode(v) { return v.errors.length ? v.errors[0].code : null; }

test('primitives: code normalising, zero key, rupee and percent parsing, formatting', () => {
  assert.equal(M.normalizeCode(' 00ab-1 '), '00AB-1');
  assert.equal(M.codeZeroKey('0012'), '12');
  assert.equal(M.codeZeroKey('000'), '0');
  assert.deepEqual(M.parseRupeesToPaise('19.99'), { ok: true, paise: 1999, blank: false });
  assert.equal(M.parseRupeesToPaise('1,250.00', true).paise, 125000);
  assert.equal(M.parseRupeesToPaise('1,250.00', false).ok, false);
  assert.equal(M.parseRupeesToPaise('₹ 99').paise, 9900);
  assert.equal(M.parseRupeesToPaise('1.234').ok, false);
  assert.equal(M.parseRupeesToPaise('').blank, true);
  assert.equal(M.parsePercentToBp('18%').bp, 1800);
  assert.equal(M.parsePercentToBp('12.5').bp, 1250);
  assert.equal(M.parsePercentToBp('0.25').bp, 25);
  assert.equal(M.parsePercentToBp('').bp, null);
  assert.equal(M.parsePercentToBp('100.01').ok, false);
  assert.equal(M.parsePercentToBp('18.123').ok, false);
  assert.equal(M.parsePercentToBp('-1').ok, false);
  assert.equal(M.paiseToRupeeText(125005), '1250.05');
  assert.equal(M.bpToPercentText(1250), '12.5');
  assert.equal(M.bpToPercentText(1800), '18');
  assert.equal(M.bpToPercentText(25), '0.25');
});

test('validation: code rules', () => {
  const v = (code, rows = []) => M.validateRow('part', part(code), { rows, mode: 'create' });
  assert.equal(firstCode(v('')), 'PART_CODE_REQUIRED');
  assert.equal(firstCode(v('AB CD')), 'PART_CODE_INVALID');
  assert.equal(firstCode(v('A'.repeat(41))), 'PART_CODE_INVALID');
  assert.equal(v('A'.repeat(40)).ok, true);
  assert.equal(firstCode(v('1.5E+10')), 'PART_CODE_SCIENTIFIC');
  assert.equal(firstCode(v('2E5')), 'PART_CODE_SCIENTIFIC');
  assert.equal(v('00123').value.code, '00123');
  assert.equal(firstCode(v('tst0001', [{ code: 'TST0001' }])), 'PART_CODE_DUPLICATE');
  assert.equal(firstCode(v('0123', [{ code: '123' }])), 'PART_CODE_ZERO_VARIANT');
  assert.equal(firstCode(v('123', [{ code: '0123' }])), 'PART_CODE_ZERO_VARIANT');
  assert.equal(firstCode(v('000', [{ code: '0' }])), 'PART_CODE_ZERO_VARIANT');
  assert.equal(firstCode(M.validateRow('part', part('X2'), { rows: [], mode: 'edit', existing: { code: 'X1' } })), 'CODE_CHANGE_NOT_ALLOWED');
  assert.equal(firstCode(M.validateRow('widget', part('X2'), {})), 'KIND_INVALID');
});

test('validation: name, group, unit', () => {
  const v = (extra, rows = []) => M.validateRow('part', part('N1', extra), { rows, mode: 'create' });
  assert.equal(firstCode(v({ name: '' })), 'NAME_REQUIRED');
  assert.equal(firstCode(v({ name: 'x'.repeat(81) })), 'NAME_INVALID');
  assert.equal(firstCode(v({ name: '=SUM(A1)' })), 'NAME_INVALID');
  assert.equal(firstCode(v({ name: '@cmd' })), 'NAME_INVALID');
  assert.equal(firstCode(v({ name: 'Bad\tname' })), 'NAME_INVALID');
  assert.equal(v({ name: '  Two   spaces  ' }).value.name, 'Two spaces');
  const dupActive = v({ name: 'same name' }, [{ code: 'Z', name: 'Same Name', group: 'g', active: true }]);
  assert.equal(dupActive.ok, true);
  assert.equal(dupActive.warnings.some((w) => w.code === 'NAME_DUPLICATE_WARNING'), true);
  const dupInactive = v({ name: 'same name' }, [{ code: 'Z', name: 'Same Name', group: 'g', active: false }]);
  assert.equal(dupInactive.warnings.some((w) => w.code === 'NAME_DUPLICATE_WARNING'), false);
  assert.equal(v({ group: 'strap' }, [{ code: 'Q', name: 'q', group: 'Strap', active: true }]).value.group, 'Strap');
  assert.equal(firstCode(v({ group: 'g'.repeat(41) })), 'GROUP_INVALID');
  assert.equal(firstCode(v({ group: '' })), 'GROUP_REQUIRED');
  assert.equal(firstCode(v({ unit: 'kg' })), 'UNIT_INVALID');
  assert.equal(firstCode(v({ unit: 'hour' })), 'UNIT_INVALID');
  assert.equal(M.validateRow('labour', labour('L1', { unit: 'hour' }), { mode: 'create' }).ok, true);
  assert.equal(firstCode(M.validateRow('labour', labour('L1', { unit: 'set' }), { mode: 'create' })), 'UNIT_INVALID');
});

test('validation: HSN, SAC, GST basis points', () => {
  const p = (extra) => M.validateRow('part', part('H1', extra), { rows: [], mode: 'create' });
  assert.equal(p({ hsn: '' }).ok, true);
  for (const good of ['1234', '123456', '12345678']) assert.equal(p({ hsn: good }).ok, true, good);
  for (const bad of ['123', '12345', '12A4']) assert.equal(firstCode(p({ hsn: bad })), 'HSN_INVALID', bad);
  assert.equal(p({ hsn: '12 34' }).value.hsn, '1234');
  const l = (sac) => M.validateRow('labour', labour('S1', { sac }), { mode: 'create' });
  assert.equal(l('9987').ok, true);
  assert.equal(l('998719').ok, true);
  assert.equal(firstCode(l('99871')), 'SAC_INVALID');
  assert.equal(p({ gstRateBp: null }).value.gstRateBp, null);
  assert.equal(p({ gstRateBp: '' }).value.gstRateBp, null);
  for (const bp of [0, 1800, 1250]) assert.equal(p({ gstRateBp: bp }).value.gstRateBp, bp);
  for (const bad of [-1, 10001, 'abc', 18.5, NaN]) assert.equal(firstCode(p({ gstRateBp: bad })), 'GST_RATE_INVALID', String(bad));
  assert.equal(p({ gstRateBp: 18 }).warnings.some((w) => w.code === 'GST_RATE_FRACTION_WARNING'), true);
  assert.equal(p({ gstRateBp: 25 }).warnings.some((w) => w.code === 'GST_RATE_FRACTION_WARNING'), false);
  assert.equal(p({ gstRateBp: 100 }).warnings.some((w) => w.code === 'GST_RATE_FRACTION_WARNING'), false);
  // no default rate is ever supplied
  assert.equal(M.validateRow('part', { code: 'D1', name: 'n', group: 'g' }, { rows: [], mode: 'create' }).value.gstRateBp, null);
});

test('validation: price, basis, reorder, bin, flags (integer paise)', () => {
  const p = (extra) => M.validateRow('part', part('P1', extra), { rows: [], mode: 'create' });
  for (const bad of [-1, 1000000001, 1.5, 'x', NaN]) assert.equal(firstCode(p({ sellPricePaise: bad })), 'PRICE_INVALID', String(bad));
  assert.equal(p({ sellPricePaise: 1000000000 }).ok, true);
  const zero = p({ sellPricePaise: 0, priceIncludesTax: null });
  assert.equal(zero.ok, true);
  assert.equal(zero.warnings.some((w) => w.code === 'PRICE_ZERO_WARNING'), true);
  assert.equal(firstCode(p({ sellPricePaise: 10000, priceIncludesTax: null })), 'PRICE_BASIS_REQUIRED');
  assert.equal(firstCode(p({ sellPricePaise: 10000, priceIncludesTax: 'yes' })), 'PRICE_BASIS_REQUIRED');
  assert.equal(p({ sellPricePaise: 10000, priceIncludesTax: false }).value.priceIncludesTax, false);
  for (const bad of [-1, 1.5, 100001]) assert.equal(firstCode(p({ reorderLevel: bad })), 'REORDER_INVALID', String(bad));
  assert.equal(p({ reorderLevel: 5, reorderQty: 0 }).warnings.some((w) => w.code === 'REORDER_QTY_ZERO_WARNING'), true);
  assert.equal(firstCode(p({ bin: 'x'.repeat(21) })), 'BIN_INVALID');
  assert.equal(firstCode(p({ bin: '<b>' })), 'BIN_INVALID');
  assert.equal(p({ bin: ' A1/B-2 ' }).value.bin, 'A1/B-2');
  assert.equal(firstCode(p({ flags: { shiny: true } })), 'FLAG_INVALID');
  assert.equal(firstCode(p({ flags: { battery: 'yes' } })), 'FLAG_INVALID');
  assert.equal(p({ flags: { battery: true } }).value.flags.battery, true);
  // labour money field
  assert.equal(firstCode(M.validateRow('labour', labour('L1', { ratePaise: -5 }), { mode: 'create' })), 'PRICE_INVALID');
});

test('validated row has the agreed key order and no float anywhere', () => {
  const v = M.validateRow('part', part('K1', { flags: { glass: true } }), { rows: [], mode: 'create' });
  assert.deepEqual(Object.keys(v.value), ['code', 'name', 'group', 'unit', 'hsn', 'gstRateBp', 'priceIncludesTax', 'sellPricePaise', 'reorderLevel', 'reorderQty', 'bin', 'flags', 'active']);
  assert.deepEqual(Object.keys(v.value.flags), ['battery', 'strap', 'glass', 'crown', 'movement', 'warrantyClaimable', 'counterSaleable']);
  const l = M.validateRow('labour', labour('K2'), { mode: 'create' });
  assert.deepEqual(Object.keys(l.value), ['code', 'name', 'group', 'unit', 'sac', 'gstRateBp', 'priceIncludesTax', 'ratePaise', 'active']);
});

test('isTaxPending and canUse', () => {
  assert.equal(M.isTaxPending({ hsn: '', gstRateBp: 1800 }), true);
  assert.equal(M.isTaxPending({ hsn: '1234', gstRateBp: null }), true);
  assert.equal(M.isTaxPending({ hsn: '1234', gstRateBp: 1800 }), false);
  assert.equal(M.isTaxPending({ sac: '', gstRateBp: 1800 }), true);
  assert.equal(M.isTaxPending({ sac: '9987', gstRateBp: 1800 }), false);
  const inactive = { code: 'A', active: false, hsn: '1234', gstRateBp: 1800, flags: { counterSaleable: true } };
  for (const p of ['receipt', 'issue', 'sale', 'estimate']) assert.equal(M.canUse(inactive, p).code, 'PART_INACTIVE', p);
  for (const p of ['return', 'adjust', 'count']) assert.equal(M.canUse(inactive, p).ok, true, p);
  assert.equal(M.canUse(null, 'issue').code, 'PART_NOT_FOUND');
  assert.equal(M.canUse(undefined, 'sale').code, 'PART_NOT_FOUND');
  assert.equal(M.canUse({ active: true }, 'bogus').code, 'PURPOSE_INVALID');
  const pending = { active: true, hsn: '', gstRateBp: null, flags: { counterSaleable: true } };
  assert.equal(M.canUse(pending, 'estimate').code, 'TAX_DETAILS_MISSING');
  assert.equal(M.canUse(pending, 'receipt').ok, true);
  assert.equal(M.canUse(pending, 'issue').ok, true);
  const sale = M.canUse(pending, 'sale');
  assert.equal(sale.ok, true);
  assert.equal(sale.warnings[0].code, 'TAX_DETAILS_MISSING');
  assert.equal(M.canUse({ active: true, hsn: '1234', gstRateBp: 1800, flags: { counterSaleable: false } }, 'sale').code, 'NOT_COUNTER_SALEABLE');
  assert.deepEqual(M.canUse({ active: true, hsn: '1234', gstRateBp: 1800, flags: { counterSaleable: true } }, 'sale').warnings, []);
});

test('createRow: stored through the parts stream, row shape, history entry', () => {
  const env = setup();
  const r = M.createRow(env.store, env.ctx(MANAGER, { clientRef: env.ref() }), 'part', part('TST0001', { flags: { battery: true } }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.row.rev, 1);
  assert.equal(r.row.source, 'manual');
  assert.equal(r.row.active, true);
  assert.equal(r.row.createdBy, 'Test Manager (Store Manager)');
  assert.equal(r.row.flags.battery, true);
  assert.deepEqual(Object.keys(r.row).slice(0, 13), ['code', 'name', 'group', 'unit', 'hsn', 'gstRateBp', 'priceIncludesTax', 'sellPricePaise', 'reorderLevel', 'reorderQty', 'bin', 'flags', 'active']);
  const recs = env.store.read('parts').records;
  assert.equal(recs.length, 1);
  assert.equal(recs[0].k, 'PART_CREATE');
  assert.equal(recs[0].b.code, 'TST0001');
  assert.equal(recs[0].b.via, 'manual');
  assert.equal(env.store.read('labour').records.length, 0);
  const h = M.historyFor(env.store, 'part', 'TST0001');
  assert.equal(h.entries.length, 1);
  assert.equal(h.entries[0].action, 'create');
  assert.equal(h.entries[0].rev, 1);
});

test('createRow for labour writes only to the labour stream', () => {
  const env = setup();
  const r = M.createRow(env.store, env.ctx(OWNER), 'labour', labour('LAB1'));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(env.store.read('labour').records[0].k, 'LAB_CREATE');
  assert.equal(env.store.read('parts').records.length, 0);
  assert.equal(M.loadMasters(env.store).labour.length, 1);
});

test('role gates: staff, none and broken sessions are refused and nothing is written', () => {
  const env = setup();
  mk(env, 'R1');
  const before = env.snapshot();
  const calls = (s) => [
    M.createRow(env.store, env.ctx(s), 'part', part('R2')),
    M.editRow(env.store, env.ctx(s), 'part', 'R1', { name: 'new' }, 1, ''),
    M.setActive(env.store, env.ctx(s), 'part', 'R1', false, 'reason ok', NO_STOCK),
    M.removeUnused(env.store, env.ctxPin(s), 'part', 'R1', 'reason ok', NO_STOCK),
    M.planBulkCreate(env.store, env.ctx(s), 'part', M.templateExample('part')),
    M.commitBulkCreate(env.store, env.ctx(s), { ok: true, kind: 'part', toCreate: [], batchId: 'MB-000000000000' })
  ];
  for (const r of calls(STAFF)) assert.equal(r.code === 'ROLE_DENIED' || r.ok === false, true);
  assert.deepEqual(calls(STAFF).map((r) => r.code), ['ROLE_DENIED', 'ROLE_DENIED', 'ROLE_DENIED', 'ROLE_DENIED', 'ROLE_DENIED', 'ROLE_DENIED']);
  for (const s of [NONE, {}, null, undefined, { ok: true }, { ok: true, tier: 'admin' }, { ok: false, tier: 'owner', isOwner: true }]) {
    assert.deepEqual(calls(s).map((r) => r.code), Array(6).fill('SESSION_REQUIRED'), JSON.stringify(s));
  }
  // an owner-tier session that is not flagged isOwner is refused too
  assert.equal(M.createRow(env.store, env.ctx({ ok: true, tier: 'owner', isOwner: false, role: 'x', actorName: 'y' }), 'part', part('R3')).code, 'ROLE_DENIED');
  assert.equal(env.snapshot(), before);
});

test('role gates: the session is read on every call, nothing is cached', () => {
  const env = setup();
  assert.equal(M.createRow(env.store, env.ctx(OWNER), 'part', part('S1')).ok, true);
  assert.equal(M.createRow(env.store, env.ctx(STAFF), 'part', part('S2')).code, 'ROLE_DENIED');
  const live = { ...OWNER };
  const ctx = env.ctx(live);
  assert.equal(M.createRow(env.store, ctx, 'part', part('S3')).ok, true);
  live.tier = 'staff';
  assert.equal(M.createRow(env.store, ctx, 'part', part('S4')).code, 'ROLE_DENIED');
});

test('rights() reflects the role table', () => {
  assert.deepEqual(M.rights(OWNER), { view: true, edit: true, remove: true });
  assert.deepEqual(M.rights(MANAGER), { view: true, edit: true, remove: false });
  assert.deepEqual(M.rights(STAFF), { view: true, edit: false, remove: false });
  assert.deepEqual(M.rights(NONE), { view: false, edit: false, remove: false });
  assert.deepEqual(M.rights(null), { view: false, edit: false, remove: false });
});

test('createRow refusals leave storage untouched; duplicate and zero variant against stored rows', () => {
  const env = setup();
  mk(env, 'D1');
  mk(env, '0123');
  const before = env.snapshot();
  assert.equal(M.createRow(env.store, env.ctx(MANAGER), 'part', part('d1')).code, 'PART_CODE_DUPLICATE');
  assert.equal(M.createRow(env.store, env.ctx(MANAGER), 'part', part('123')).code, 'PART_CODE_ZERO_VARIANT');
  assert.equal(M.createRow(env.store, env.ctx(MANAGER), 'part', part('')).code, 'PART_CODE_REQUIRED');
  assert.equal(env.snapshot(), before);
});

test('createRow: warnings are returned with the row', () => {
  const env = setup();
  const r = M.createRow(env.store, env.ctx(MANAGER), 'part', part('W1', { sellPricePaise: 0, priceIncludesTax: null, reorderLevel: 3 }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings.map((w) => w.code).sort(), ['PRICE_ZERO_WARNING', 'REORDER_QTY_ZERO_WARNING']);
});

test('createRow: MASTER_FULL at the row limit', () => {
  const env = setup();
  // fill with a fake-friendly path: appended directly in batches of 200 through the store
  const total = M.MAX_ROWS;
  let rev = 0;
  for (let i = 0; i < total; i += 200) {
    const items = [];
    for (let j = i; j < Math.min(i + 200, total); j += 1) {
      const code = 'F' + String(j).padStart(5, '0');
      const v = M.validateRow('part', part(code), { rows: [], mode: 'create' });
      items.push({ k: 'PART_CREATE', b: { code, row: v.value, changes: [], reason: '', via: 'manual', batchId: '' } });
    }
    const res = env.store.append('parts', items, { expectRev: rev, actor: { t: 'manager', r: 'Store Manager', m: 'T' } });
    assert.equal(res.ok, true, JSON.stringify(res));
    rev += 1;
  }
  assert.equal(M.loadMasters(env.store).parts.length, total);
  assert.equal(M.createRow(env.store, env.ctx(MANAGER), 'part', part('ZZZ1')).code, 'MASTER_FULL');
});

test('editRow: price change needs a reason, is logged as sensitive', () => {
  const env = setup();
  const row = mk(env, 'E1');
  const ctx = () => env.ctx(MANAGER);
  assert.equal(M.editRow(env.store, ctx(), 'part', 'E1', { sellPricePaise: 18000 }, 1, '').code, 'REASON_REQUIRED');
  assert.equal(M.editRow(env.store, ctx(), 'part', 'E1', { sellPricePaise: 18000 }, 1, 'abcd').code, 'REASON_REQUIRED');
  const ok = M.editRow(env.store, ctx(), 'part', 'E1', { sellPricePaise: 18000 }, 1, 'price list 2026');
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.row.rev, 2);
  assert.equal(ok.row.sellPricePaise, 18000);
  assert.deepEqual(ok.diff, [{ field: 'sellPricePaise', from: 15000, to: 18000 }]);
  const h = M.historyFor(env.store, 'part', 'E1').entries;
  assert.equal(h.length, 2);
  assert.equal(h[1].action, 'edit');
  assert.equal(h[1].sensitive, true);
  assert.equal(h[1].rev, 2);
  assert.equal(h[1].reason, 'price list 2026');
  assert.equal(h[1].actor.t, 'manager');
  assert.equal(row.rev, 1);
});

test('editRow: gst, hsn, basis changes are sensitive; rename and flags are not', () => {
  const env = setup();
  mk(env, 'E2');
  let rev = 1;
  const edit = (patch, reason) => {
    const r = M.editRow(env.store, env.ctx(MANAGER), 'part', 'E2', patch, rev, reason);
    if (r.ok) rev = r.row.rev;
    return r;
  };
  for (const patch of [{ gstRateBp: 1800 }, { hsn: '9102' }, { priceIncludesTax: false }]) {
    assert.equal(edit(patch, '').code, 'REASON_REQUIRED', JSON.stringify(patch));
    assert.equal(edit(patch, 'accountant list').ok, true, JSON.stringify(patch));
  }
  const rename = edit({ name: 'Renamed part' }, '');
  assert.equal(rename.ok, true);
  const flag = edit({ flags: { glass: true } }, '');
  assert.equal(flag.ok, true);
  assert.deepEqual(flag.diff, [{ field: 'flags.glass', from: false, to: true }]);
  const h = M.historyFor(env.store, 'part', 'E2').entries;
  assert.equal(h[h.length - 2].sensitive, false);
  assert.equal(h[h.length - 1].sensitive, false);
  assert.equal(h.filter((e) => e.sensitive).length, 3);
});

test('editRow: code change, no change, stale rev, missing code, active, bad arguments', () => {
  const env = setup();
  mk(env, 'E3');
  const c = () => env.ctx(MANAGER);
  assert.equal(M.editRow(env.store, c(), 'part', 'E3', { code: 'E4' }, 1, '').code, 'CODE_CHANGE_NOT_ALLOWED');
  assert.equal(M.editRow(env.store, c(), 'part', 'E3', { code: 'e3', name: 'Changed' }, 1, '').ok, true);
  const n = env.store.read('parts').records.length;
  assert.equal(M.editRow(env.store, c(), 'part', 'E3', { name: 'Changed' }, 2, '').code, 'NO_CHANGE');
  assert.equal(env.store.read('parts').records.length, n);
  assert.equal(M.editRow(env.store, c(), 'part', 'E3', { name: 'Again' }, 1, '').code, 'REV_CONFLICT');
  assert.equal(M.editRow(env.store, c(), 'part', 'NOPE', { name: 'x' }, 1, '').code, 'NOT_FOUND');
  assert.equal(M.editRow(env.store, c(), 'part', 'E3', { active: false }, 2, 'reason ok').code, 'ACTIVE_NOT_EDITABLE');
  assert.equal(M.editRow(env.store, c(), 'part', 'E3', null, 2, '').code, 'ARGS_INVALID');
  assert.equal(M.editRow(env.store, c(), 'part', 'E3', { name: 'z' }, 'x', '').code, 'ARGS_INVALID');
  assert.equal(M.editRow(env.store, c(), 'part', 'E3', { name: '' }, 2, '').code, 'NAME_REQUIRED');
  assert.equal(M.editRow(env.store, c(), 'part', 'E3', { sellPricePaise: 1.5 }, 2, 'reason ok').code, 'PRICE_INVALID');
  assert.equal(M.editRow(env.store, c(), 'part', 'E3', { name: 'z' }, 2, 'r'.repeat(201)).code, 'REASON_INVALID');
});

test('editRow: a reason longer than 200 characters is refused', () => {
  const env = setup();
  mk(env, 'E5');
  assert.equal(M.editRow(env.store, env.ctx(MANAGER), 'part', 'E5', { sellPricePaise: 100 }, 1, 'r'.repeat(201)).code, 'REASON_INVALID');
});

test('editRow: stale expectedRev after another edit is a conflict and writes nothing', () => {
  const env = setup();
  mk(env, 'E6');
  assert.equal(M.editRow(env.store, env.ctx(MANAGER), 'part', 'E6', { name: 'First' }, 1, '').ok, true);
  const before = env.snapshot();
  assert.equal(M.editRow(env.store, env.ctx(OWNER), 'part', 'E6', { name: 'Second' }, 1, '').code, 'REV_CONFLICT');
  assert.equal(env.snapshot(), before);
});

test('editRow keeps existing row values it was not asked to change (no float, no default drift)', () => {
  const env = setup();
  M.createRow(env.store, env.ctx(MANAGER), 'part', part('E7', { hsn: '9102', gstRateBp: 1800, reorderLevel: 4, reorderQty: 8, bin: 'B1', flags: { strap: true } }));
  const r = M.editRow(env.store, env.ctx(MANAGER), 'part', 'E7', { name: 'Only the name' }, 1, '');
  assert.equal(r.ok, true);
  assert.equal(r.row.hsn, '9102');
  assert.equal(r.row.gstRateBp, 1800);
  assert.equal(r.row.reorderQty, 8);
  assert.equal(r.row.bin, 'B1');
  assert.equal(r.row.flags.strap, true);
  assert.deepEqual(r.diff, [{ field: 'name', from: 'Battery 377 (invented E7)', to: 'Only the name' }]);
});

test('retry with the same client reference after a lost reply posts once', () => {
  const env = setup();
  const ref = env.ref();
  const a = M.createRow(env.store, env.ctx(MANAGER, { clientRef: ref }), 'part', part('RT1'));
  assert.equal(a.ok, true);
  const b = M.createRow(env.store, env.ctx(MANAGER, { clientRef: ref }), 'part', part('RT1'));
  assert.equal(b.ok, true);
  assert.equal(b.replayed, true);
  assert.equal(env.store.read('parts').records.length, 1);
  const ref2 = env.ref();
  assert.equal(M.editRow(env.store, env.ctx(MANAGER, { clientRef: ref2 }), 'part', 'RT1', { name: 'Edit once' }, 1, '').ok, true);
  const again = M.editRow(env.store, env.ctx(MANAGER, { clientRef: ref2 }), 'part', 'RT1', { name: 'Edit once' }, 1, '');
  assert.equal(again.ok, true);
  assert.equal(again.replayed, true);
  assert.equal(env.store.read('parts').records.length, 2);
  assert.equal(M.createRow(env.store, env.ctx(MANAGER, { clientRef: 'no' }), 'part', part('RT2')).code, 'ARGS_INVALID');
});

test('store failures pass through unchanged and leave the master as it was', () => {
  const env = setup();
  mk(env, 'F1');
  const before = env.snapshot();
  env.failWrites(1);
  const ref = env.ref();
  const r = M.createRow(env.store, env.ctx(MANAGER, { clientRef: ref }), 'part', part('F2'));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'SVCS_WRITE_FAILED');
  assert.equal(typeof r.message, 'string');
  assert.equal(M.getRow(env.store, 'part', 'F2').code, 'NOT_FOUND');
  assert.equal(env.snapshot(), before);
  // the same press can be retried
  assert.equal(M.createRow(env.store, env.ctx(MANAGER, { clientRef: ref }), 'part', part('F2')).ok, true);
  assert.equal(M.getRow(env.store, 'part', 'F2').ok, true);
  // a stale revision seen by the store (another screen wrote in between) is reported as the store code
  const stale = M.loadMasters(env.store).revs.parts;
  assert.equal(M.createRow(env.store, env.ctx(MANAGER), 'part', part('F3')).ok, true);
  const raced = env.store.append('parts', [{ k: 'PART_EDIT', b: { code: 'F1', row: M.getRow(env.store, 'part', 'F1').row, changes: [], reason: '', via: 'manual', batchId: '' } }],
    { expectRev: stale, actor: { t: 'manager', r: 'Store Manager', m: 'T' } });
  assert.equal(raced.ok, false);
  assert.equal(raced.code, 'SVCS_REV_CONFLICT');
});

test('setActive: deactivate and reactivate with reasons, warnings and state checks', () => {
  const env = setup();
  mk(env, 'A1');
  const c = () => env.ctx(MANAGER);
  assert.equal(M.setActive(env.store, c(), 'part', 'A1', false, '', NO_STOCK).code, 'REASON_REQUIRED');
  assert.equal(M.setActive(env.store, c(), 'part', 'A1', false, 'abcd', NO_STOCK).code, 'REASON_REQUIRED');
  assert.equal(M.setActive(env.store, c(), 'part', 'A1', 'no', 'reason ok', NO_STOCK).code, 'ARGS_INVALID');
  const off = M.setActive(env.store, c(), 'part', 'A1', false, 'discontinued', { hasMovements: () => true, isReferenced: () => true, onHand: () => 3 });
  assert.equal(off.ok, true, JSON.stringify(off));
  assert.equal(off.row.active, false);
  assert.equal(off.row.deactivateReason, 'discontinued');
  assert.equal(off.row.deactivatedBy, 'Test Manager (Store Manager)');
  assert.equal(off.row.rev, 2);
  assert.deepEqual(off.warnings.map((w) => w.code), ['STOCK_ON_HAND_WARNING']);
  assert.equal(M.setActive(env.store, c(), 'part', 'A1', false, 'again again', NO_STOCK).code, 'ALREADY_INACTIVE');
  // an inactive code still blocks a new row
  assert.equal(M.createRow(env.store, c(), 'part', part('A1')).code, 'PART_CODE_DUPLICATE');
  const on = M.setActive(env.store, c(), 'part', 'A1', true, 'back in range', NO_STOCK);
  assert.equal(on.ok, true);
  assert.equal(on.row.active, true);
  assert.equal(on.row.deactivatedAt, '');
  assert.equal(on.row.deactivateReason, '');
  assert.equal(M.setActive(env.store, c(), 'part', 'A1', true, 'again again', NO_STOCK).code, 'ALREADY_ACTIVE');
  assert.equal(M.setActive(env.store, c(), 'part', 'MISSING', false, 'reason ok', NO_STOCK).code, 'NOT_FOUND');
  const h = M.historyFor(env.store, 'part', 'A1').entries.map((e) => e.action);
  assert.deepEqual(h, ['create', 'deactivate', 'reactivate']);
  // onHand that throws is treated as unknown stock and warns
  mk(env, 'A2');
  assert.deepEqual(M.setActive(env.store, c(), 'part', 'A2', false, 'reason ok', { onHand: () => { throw new Error('x'); } }).warnings.map((w) => w.code), ['STOCK_ON_HAND_WARNING']);
});

test('removeUnused: owner plus step-up plus strict false checks', () => {
  const env = setup();
  mk(env, 'X1');
  const rm = (ctx, deps, reason = 'entered by mistake') => M.removeUnused(env.store, ctx, 'part', 'X1', reason, deps);
  assert.equal(rm(env.ctxPin(MANAGER), NO_STOCK).code, 'ROLE_DENIED');
  assert.equal(rm(env.ctx(OWNER), NO_STOCK).code, 'PIN_REQUIRED');
  assert.equal(rm(env.ctx(OWNER, { stepUp: { ok: false, at: env.clock.ms() } }), NO_STOCK).code, 'PIN_REQUIRED');
  assert.equal(rm(env.ctx(OWNER, { stepUp: { ok: true, at: env.clock.ms() - 120001 } }), NO_STOCK).code, 'PIN_REQUIRED');
  assert.equal(rm(env.ctx(OWNER, { stepUp: { ok: true, at: env.clock.ms() + 5 } }), NO_STOCK).code, 'PIN_REQUIRED');
  assert.equal(rm(env.ctx(OWNER, { stepUp: { ok: true, at: env.clock.ms() - 120000 } }), { hasMovements: () => true, isReferenced: () => false }).code, 'HAS_MOVEMENTS');
  const pin = () => env.ctxPin(OWNER);
  assert.equal(rm(pin(), NO_STOCK, 'abc').code, 'REASON_REQUIRED');
  assert.equal(rm(pin(), undefined).code, 'DEPENDENCY_MISSING');
  assert.equal(rm(pin(), { hasMovements: () => false }).code, 'DEPENDENCY_MISSING');
  for (const bad of [true, undefined, null, 0, 'false']) {
    assert.equal(rm(pin(), { hasMovements: () => bad, isReferenced: () => false }).code, 'HAS_MOVEMENTS', String(bad));
  }
  assert.equal(rm(pin(), { hasMovements: () => { throw new Error('shard'); }, isReferenced: () => false }).code, 'HAS_MOVEMENTS');
  assert.equal(rm(pin(), { hasMovements: () => false, isReferenced: () => true }).code, 'HAS_REFERENCES');
  assert.equal(rm(pin(), { hasMovements: () => false, isReferenced: () => null }).code, 'HAS_REFERENCES');
  assert.equal(rm(pin(), { hasMovements: () => false, isReferenced: () => { throw new Error('x'); } }).code, 'HAS_REFERENCES');
  assert.equal(M.getRow(env.store, 'part', 'X1').ok, true);
  const done = rm(pin(), NO_STOCK);
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.equal(M.getRow(env.store, 'part', 'X1').code, 'NOT_FOUND');
  const last = M.historyFor(env.store, 'part', 'X1').entries.pop();
  assert.equal(last.action, 'delete');
  assert.equal(last.changes[0].field, '*');
  assert.equal(last.changes[0].from.code, 'X1');
  assert.equal(last.changes[0].to, null);
  assert.equal(last.actor.t, 'owner');
  // the code can be created again and its new life starts at rev 1
  const again = M.createRow(env.store, env.ctx(MANAGER), 'part', part('X1'));
  assert.equal(again.ok, true);
  assert.equal(again.row.rev, 1);
  assert.deepEqual(M.historyFor(env.store, 'part', 'X1').entries.map((e) => e.action), ['create', 'delete', 'create']);
  assert.equal(M.removeUnused(env.store, env.ctxPin(OWNER), 'part', 'NOPE', 'entered by mistake', NO_STOCK).code, 'NOT_FOUND');
});

test('removeUnused works for labour and does not touch parts', () => {
  const env = setup();
  M.createRow(env.store, env.ctx(MANAGER), 'labour', labour('LX1'));
  mk(env, 'LX1');
  const r = M.removeUnused(env.store, env.ctxPin(OWNER), 'labour', 'LX1', 'entered by mistake', NO_STOCK);
  assert.equal(r.ok, true);
  assert.equal(M.getRow(env.store, 'labour', 'LX1').code, 'NOT_FOUND');
  assert.equal(M.getRow(env.store, 'part', 'LX1').ok, true);
});

test('history carries the stored changes for rows that were bulk created and edited', () => {
  const env = setup();
  mk(env, 'H1');
  M.editRow(env.store, env.ctx(OWNER), 'part', 'H1', { sellPricePaise: 16000 }, 1, 'new price');
  M.setActive(env.store, env.ctx(OWNER), 'part', 'H1', false, 'old model', NO_STOCK);
  const e = M.historyFor(env.store, 'part', 'h1').entries;
  assert.deepEqual(e.map((x) => [x.action, x.rev]), [['create', 1], ['edit', 2], ['deactivate', 3]]);
  assert.equal(e[2].changes[0].field, 'active');
  assert.equal(M.historyFor(env.store, 'bogus', 'H1').code, 'KIND_INVALID');
  assert.equal(M.historyFor(env.store, 'part', 'NOPE').entries.length, 0);
});

test('filtering, groups and natural ordering', () => {
  const env = setup();
  mk(env, 'A10', { name: 'Gamma crown', group: 'Crown', bin: 'B2' });
  mk(env, 'A2', { name: 'Alpha strap long', group: 'Strap', bin: 'B1' });
  mk(env, 'A1', { name: 'Alpha battery', group: 'battery', hsn: '8506', gstRateBp: 1800 });
  M.setActive(env.store, env.ctx(MANAGER), 'part', 'A10', false, 'reason ok', NO_STOCK);
  const all = M.loadMasters(env.store).parts;
  assert.deepEqual(all.map((r) => r.code), ['A1', 'A2', 'A10']);
  assert.deepEqual(M.sortRows(all.slice().reverse()).map((r) => r.code), ['A1', 'A2', 'A10']);
  assert.deepEqual(M.filterRows(all, { q: 'alpha strap' }).map((r) => r.code), ['A2']);
  assert.deepEqual(M.filterRows(all, { q: 'b2' }).map((r) => r.code), ['A10']);
  assert.deepEqual(M.filterRows(all, { group: 'STRAP' }).map((r) => r.code), ['A2']);
  assert.deepEqual(M.filterRows(all, { active: false }).map((r) => r.code), ['A10']);
  assert.deepEqual(M.filterRows(all, { active: true }).map((r) => r.code), ['A1', 'A2']);
  assert.deepEqual(M.filterRows(all, { taxPending: true }).map((r) => r.code), ['A2', 'A10']);
  assert.deepEqual(M.filterRows(all, { taxPending: false }).map((r) => r.code), ['A1']);
  assert.deepEqual(M.filterRows(all, {}).length, 3);
  assert.deepEqual(M.groupsOf(all), ['battery', 'Crown', 'Strap']);
  assert.deepEqual(M.groupsOf(M.groupsOf([]) ), []);
  assert.deepEqual(M.sortRows([{ code: '007' }, { code: '7' }, { code: '10' }, { code: 'B1' }]).map((r) => r.code), ['7', '007', '10', 'B1']);
});

test('loaded rows are frozen and independent of later writes', () => {
  const env = setup();
  mk(env, 'Z1');
  const a = M.loadMasters(env.store).parts;
  assert.equal(Object.isFrozen(a[0]), true);
  assert.equal(Object.isFrozen(a[0].flags), true);
  M.editRow(env.store, env.ctx(MANAGER), 'part', 'Z1', { name: 'Newer' }, 1, '');
  assert.equal(a[0].name, 'Battery 377 (invented Z1)');
  assert.equal(M.loadMasters(env.store).parts[0].name, 'Newer');
});

test('a stored row with sorted keys is rebuilt in the agreed order', () => {
  const env = setup();
  mk(env, 'O1');
  const rec = env.store.read('parts').records[0];
  assert.deepEqual(Object.keys(rec.b.row), Object.keys(rec.b.row).slice().sort());
  assert.equal(Object.keys(M.getRow(env.store, 'part', 'O1').row)[0], 'code');
});

test('every code has an English message and codes are unique strings', () => {
  for (const [k, v] of Object.entries(M.CODES)) {
    assert.equal(k, v);
    assert.equal(typeof M.MESSAGES[k], 'string');
    assert.ok(M.MESSAGES[k].length > 5);
  }
  for (const code of ['ROLE_DENIED', 'SESSION_REQUIRED', 'PIN_REQUIRED', 'NOT_COUNTER_SALEABLE', 'TAX_DETAILS_MISSING', 'REV_CONFLICT', 'HAS_MOVEMENTS', 'HAS_REFERENCES']) {
    assert.ok(M.CODES[code], code);
  }
  for (const gone of ['LOG_CHAIN_BROKEN', 'MASTER_LOG_MISMATCH', 'LOG_APPEND_FAILED', 'STORAGE_CORRUPT', 'STORAGE_WRITE_FAILED', 'STORAGE_UNAVAILABLE']) {
    assert.equal(M.CODES[gone], undefined, gone);
  }
});

test('backend used (information)', () => {
  const env = setup();
  console.log('masters tests ran against the ' + env.backend + ' store');
  assert.ok(env.backend === 'real' || env.backend === 'fake');
});

test('a damaged shard blocks every master call with the store code and writes nothing (real store only)', async (t) => {
  const env = setup();
  if (env.backend !== 'real') { t.skip('real store file not present'); return; }
  mk(env, 'BL1');
  const key = Array.from(env.adapterMap.keys()).find((k) => /^saagar_svcs_parts_v1/.test(k));
  assert.ok(key);
  env.adapterMap.set(key, '{not json');
  const damaged = env.adapterMap.get(key);
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const mod = req('../www/service-stores-store.js');
  const adapter = {
    getItem: (k) => (env.adapterMap.has(k) ? env.adapterMap.get(k) : null),
    setItem: (k, v) => { env.adapterMap.set(k, String(v)); },
    keys: () => Array.from(env.adapterMap.keys()),
    authoritative: () => true
  };
  const created = mod.createStore(adapter, { now: () => env.clock.iso() });
  const store2 = created.store || created;
  const opened = store2.open({ replay: () => [] });
  assert.equal(opened.blocked, true);
  const before = JSON.stringify(Array.from(env.adapterMap.entries()));
  const load = M.loadMasters(store2);
  assert.equal(load.ok, false);
  assert.match(load.code, /^SVCS_/);
  const made = M.createRow(store2, env.ctx(MANAGER), 'part', part('BL2'));
  assert.equal(made.ok, false);
  assert.match(made.code, /^SVCS_/);
  assert.equal(env.adapterMap.get(key), damaged);
  assert.equal(JSON.stringify(Array.from(env.adapterMap.entries())), before);
});
