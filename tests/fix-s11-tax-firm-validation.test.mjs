// S11 U11-F07 (PAN/GSTIN format, same patterns as www/dashboard-policy.js) and U11-F08 (duplicate firm names).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildContext, run, readTax, ROOT } from './lib/fix-s11-extract.mjs';

function setup(firms = [], editing = null) {
  const log = { alerts: [], saves: 0 };
  const els = {};
  const field = (id, v) => (els[id] = { value: v, checked: false });
  const ctx = buildContext(['saveFirm'], {
    String, Date, Object,
    STATE: { firms, activeFirmId: null },
    editingFirmId: editing,
    alert: m => log.alerts.push(m),
    saveState: () => { log.saves++; },
    populateFirmSelector: () => {}, switchFirm: () => {}, renderFirmList: () => {}, resetFirmForm: () => {},
    document: { getElementById: id => els[id] || (els[id] = { value: '', checked: false }) }
  });
  const fill = (o) => {
    field('ff-name', o.name ?? 'Test Firm'); field('ff-pan', o.pan ?? ''); field('ff-gstin', o.gstin ?? '');
    field('ff-entity', 'proprietorship'); field('ff-type', 'regular'); field('ff-emp', 'yes'); field('ff-notes', '');
    els['ff-qrmp'] = { checked: false, value: '' };
  };
  return { ctx, log, fill, firms: ctx.STATE.firms };
}
const save = (s, o) => { s.fill(o); run(s.ctx, 'saveFirm()'); };

test('F07: bad PAN and bad GSTIN are refused with a message', () => {
  let s = setup(); save(s, { pan: '12' });
  assert.equal(s.firms.length, 0); assert.match(s.log.alerts[0], /PAN must be 10 characters/);
  s = setup(); save(s, { gstin: 'NOTAGSTIN' });
  assert.equal(s.firms.length, 0); assert.match(s.log.alerts[0], /GSTIN must be 15 characters/);
});

test('F07: valid values save, lowercase is upper-cased, blank is allowed', () => {
  let s = setup(); save(s, { pan: 'abcde1234f', gstin: '27abcde1234f1z5' });
  assert.equal(s.firms.length, 1);
  assert.equal(s.firms[0].pan, 'ABCDE1234F'); assert.equal(s.firms[0].gstin, '27ABCDE1234F1Z5');
  s = setup(); save(s, {});
  assert.equal(s.firms.length, 1); assert.deepEqual(s.log.alerts, []);
});

test('F07: an old firm with a stored bad value can still be edited when the value is unchanged', () => {
  const old = { id: 'firm_1', name: 'Old', pan: '12', gstin: 'XYZ' };
  const s = setup([old], 'firm_1');
  save(s, { name: 'Old Renamed', pan: '12', gstin: 'XYZ' });
  assert.deepEqual(s.log.alerts, []);
  assert.equal(s.firms[0].name, 'Old Renamed');
  const t = setup([{ ...old }], 'firm_1');
  save(t, { name: 'Old', pan: '99', gstin: 'XYZ' });
  assert.match(t.log.alerts[0], /PAN must/);
});

test('F07: the demo seed firm passes both patterns, and the module patterns match dashboard-policy', () => {
  const seed = fs.readFileSync(path.join(ROOT, 'www', 'demo-seed.js'), 'utf8');
  assert.ok(/ABCDE1234F/.test(seed) && /27ABCDE1234F1Z5/.test(seed));
  const src = readTax();
  assert.ok(src.includes('/^[A-Z]{5}[0-9]{4}[A-Z]$/'));
  assert.ok(src.includes('/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/'));
  assert.match(src, /id="ff-gstin" type="text" maxlength="15"/);
});

test('F08: duplicate firm names (case and spaces ignored) are refused', () => {
  const s = setup([{ id: 'firm_1', name: 'Test Comp Traders' }]);
  save(s, { name: ' test comp traders ' });
  assert.equal(s.firms.length, 1);
  assert.match(s.log.alerts[0], /already exists/);
});

test('F08: editing a firm and keeping its own name is allowed; legacy equal pair stays editable', () => {
  let s = setup([{ id: 'firm_1', name: 'Same' }], 'firm_1');
  save(s, { name: 'Same' });
  assert.deepEqual(s.log.alerts, []);
  s = setup([{ id: 'firm_1', name: 'Dup' }, { id: 'firm_2', name: 'Dup' }], 'firm_2');
  save(s, { name: 'Dup' });
  assert.deepEqual(s.log.alerts, [], 'unchanged name of a legacy duplicate can be saved');
  s = setup([{ id: 'firm_1', name: 'One' }, { id: 'firm_2', name: 'Two' }], 'firm_2');
  save(s, { name: 'one' });
  assert.equal(s.log.alerts.length, 1, 'renaming into another firm name is refused');
});
