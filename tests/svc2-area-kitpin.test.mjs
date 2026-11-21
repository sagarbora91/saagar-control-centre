// A-UI audit, F2 (rule A2-02): the date rule and the Owner PIN step live once, in the main UI kit; the Billing area calls them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, AREA_SOURCE } from './lib/svc2-area-kit.mjs';

test('KP01 the area holds no own copy of the date rule or of the Owner step; the kit exports both', () => {
  assert.equal(/getUTCFullYear\(\) === \+m\[1\]/.test(AREA_SOURCE), false, 'no copy of the kit date rule in the area');
  assert.equal((AREA_SOURCE.match(/first\.isOwner !== true/g) || []).length, 0, 'no Owner-step body in the area');
  assert.match(AREA_SOURCE, /kitFn\('validIso'\)/);
  assert.match(AREA_SOURCE, /kitFn\('ownerStep'\)/);
  const kit = setup({}).ui.kit;
  assert.equal(typeof kit.validIso, 'function');
  assert.equal(typeof kit.ownerStep, 'function');
  assert.equal(kit.validIso('2026-02-29'), false);
  assert.equal(kit.validIso('2028-02-29'), true);
  assert.equal(kit.validIso('2026-13-01'), false);
  assert.equal(kit.validIso(' 2026-11-19'), false);
});

test('KP02 the kit Owner step uses the asker it is given, refuses a cancelled PIN and a non-true answer, and calls the work once with the step-up', async () => {
  const a = setup({});
  a.mountUi();
  const kit = a.ui.kit;
  const asked = [];
  let ran = 0;
  const work = (ctx) => { ran += 1; return Promise.resolve({ ok: true, ctx }); };
  const ok = await kit.ownerStep('Label for the keypad', work, 'ref-1', (l) => { asked.push(l); return Promise.resolve(true); });
  assert.equal(ok.ok, true);
  assert.equal(ran, 1);
  assert.equal(ok.ctx.stepUp.ok, true);
  assert.equal(ok.ctx.clientRef, 'ref-1');
  assert.deepEqual(asked, ['Label for the keypad']);
  assert.equal(a.calls.reauth.length, 0, 'the host keypad is not asked when an asker is given');
  assert.equal((await kit.ownerStep('x', work, 'ref-2', () => Promise.resolve(false))).code, 'SVB_PIN_DENIED');
  assert.equal((await kit.ownerStep('x', work, 'ref-3', () => Promise.resolve('yes'))).ok, false, 'only exactly true opens the step');
  assert.equal(ran, 1, 'a refused PIN never runs the work');
  a.h.session = { ok: true, isOwner: false, isManager: true, role: 'Store Manager', tier: 'manager', actorName: 'M' };
  assert.equal((await kit.ownerStep('x', work, 'ref-4', () => Promise.resolve(true))).code, 'SVB_OWNER_ONLY');
  assert.equal(ran, 1);
});
