// U05-F-06, F-07, F-05 pin, STK-113: brand management.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCtx, stockSource } from './lib/fix-S06-stock-vm.mjs';

const master = list => ({ saagar_master_brands: JSON.stringify(list) });
const idx = (c, name) => c.api.getBrands('titanworld').indexOf(name);

test('F-06 removing a master-only brand hides it for this store only and copies nothing', () => {
  const c = makeCtx({ storage: master([{ name: 'MASTERONLY', store: '' }]) }); c.api.st.mode = 'sm';
  const i = idx(c, 'MASTERONLY');
  assert.ok(i >= 0);
  c.api.removeBrand(i);
  assert.equal(c.api.getBrands('titanworld').includes('MASTERONLY'), false);
  assert.equal(c.mem.get('saagar_brands'), undefined);
  assert.deepEqual(JSON.parse(c.mem.get('saagar_brands_hidden')), { titanworld: ['masteronly'] });
  assert.equal(c.api.getBrands('helios').includes('MASTERONLY'), true);
});

test('F-06 addBrand of the hidden name un-hides it; reset clears the hide', () => {
  const c = makeCtx({ storage: master([{ name: 'MASTERONLY', store: '' }]) }); c.api.st.mode = 'sm';
  c.api.removeBrand(idx(c, 'MASTERONLY'));
  c.els['brand-inp'] = c.sandbox.document.getElementById('brand-inp');
  c.els['brand-inp'].value = 'masteronly';
  c.api.addBrand();
  assert.equal(c.api.getBrands('titanworld').includes('MASTERONLY'), true);
  assert.equal(JSON.parse(c.mem.get('saagar_brands_hidden') || '{}').titanworld, undefined);
  c.api.removeBrand(idx(c, 'MASTERONLY'));
  c.api.resetBrandsToDefault();
  assert.equal(JSON.parse(c.mem.get('saagar_brands_hidden') || '{}').titanworld, undefined);
  assert.equal(c.api.getBrands('titanworld').includes('MASTERONLY'), true);
});

test('F-06 removing an own brand never copies master names into saagar_brands', () => {
  const c = makeCtx({ storage: master([{ name: 'MASTERONLY', store: '' }]) }); c.api.st.mode = 'sm';
  const first = c.api.getBrands('titanworld')[0];
  c.api.removeBrand(0);
  const saved = JSON.parse(c.mem.get('saagar_brands')).titanworld;
  assert.equal(saved.includes(first), false);
  assert.equal(saved.includes('MASTERONLY'), false);
  assert.equal(c.mem.has('saagar_brands_hidden'), false);
});

test('F-06 brandDrop reorders own rows only; master row drag changes nothing', () => {
  const c = makeCtx({ storage: master([{ name: 'MASTERONLY', store: '' }]) }); c.api.st.mode = 'sm';
  const own = c.api.getOwnBrands('titanworld');
  const ev = { preventDefault() {}, dataTransfer: {} };
  c.sandbox.window.parent = c.sandbox.window;
  const before = JSON.parse(JSON.stringify(own));
  // _dragIdx is module state; use the module's own drag start function through the vm
  const run = (code) => c.run(code);
  run('brandDragStart({dataTransfer:{}},0)');
  c.api.brandDrop(ev, 2);
  const saved = JSON.parse(c.mem.get('saagar_brands')).titanworld;
  assert.deepEqual(saved, (() => { const a = before.slice(); const [m] = a.splice(0, 1); a.splice(2, 0, m); return a; })());
  assert.equal(saved.includes('MASTERONLY'), false);
  // master row involved
  const snap = c.mem.get('saagar_brands');
  const mi = c.api.getBrands('titanworld').indexOf('MASTERONLY');
  run('brandDragStart({dataTransfer:{}},' + mi + ')');
  c.api.brandDrop(ev, 1);
  assert.equal(c.mem.get('saagar_brands'), snap);
});

test('F-05 pin: store-tagged master brands do not leak across stores', () => {
  const c = makeCtx({ storage: master([{ name: 'ZZTITAN', store: 'titanworld' }, { name: 'ZZHELI', store: 'helios' }]) });
  assert.equal(c.api.getBrands('helios').includes('ZZTITAN'), false);
  assert.equal(c.api.getBrands('titanworld').includes('ZZHELI'), false);
  assert.equal(c.api.getBrands('titanworld').includes('ZZTITAN'), true);
});

test('STK-113 long brand name refused, 40 characters accepted', () => {
  const c = makeCtx(); c.api.st.mode = 'sm';
  const inp = c.sandbox.document.getElementById('brand-inp');
  inp.value = 'x'.repeat(300);
  c.api.addBrand();
  assert.equal(c.mem.has('saagar_brands'), false);
  assert.ok(c.lastToast().cls.includes('err'));
  inp.value = 'y'.repeat(40);
  c.api.addBrand();
  assert.ok(JSON.parse(c.mem.get('saagar_brands')).titanworld.includes('Y'.repeat(40)));
});

test('F-07 wording no longer promises an Add that is hidden', () => {
  const s = stockSource();
  assert.equal(s.includes('Add or remove watch brands'), false);
  assert.equal(s.includes('Settings → Brand List'), false);
  assert.equal(s.split('Settings → Masters → Brands').length - 1, 2);
});
