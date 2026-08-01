import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const dashboard = require('../www/dashboard-policy.js');
const context = require('../www/store-context.js');
const shell = fs.readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');

const branches = [
  {
    code: 'WLMHW',
    storeKey: 'titanworld',
    name: 'Titan World Latur',
    channel: 'Titan World',
    aliases: ['TW Latur'],
    active: true
  },
  { code: 'HEMW', storeKey: 'helios', name: 'Helios Latur', channel: 'Helios', active: true }
];

test('dashboard policy hides non-permitted modules and lets Admin bypass the row', () => {
  const row = { qms: true, expense: false };
  assert.equal(dashboard.moduleVisible('qms', false, row), true);
  assert.equal(dashboard.moduleVisible('expense', false, row), false);
  assert.equal(dashboard.moduleVisible('expense', true, row), true);
  assert.equal(dashboard.actionModuleId("navigateToModule('service')"), 'service');
  assert.equal(dashboard.actionModuleId("switchView('config')"), '');

  const visible = dashboard.filterModuleItems(
    [{ moduleId: 'qms' }, { moduleId: 'expense' }, { moduleId: '' }],
    item => item.moduleId,
    false,
    row
  );
  assert.deepEqual(visible.map(item => item.moduleId), ['qms', '']);
});

test('store matcher preserves configured aliases, nested codes, and never treats firm as store', () => {
  assert.equal(context.classifyRecord({ store: { code: 'WLMHW' } }, 'WLMHW', branches), 'match');
  assert.equal(context.classifyRecord({ location: 'TW Latur' }, 'WLMHW', branches), 'match');
  assert.equal(context.classifyRecord({ firm: 'SAT' }, 'WLMHW', branches), 'unassigned');
});

test('Home and Today integrate role filtering across every sensitive dashboard surface', () => {
  assert.match(shell, /<script src="dashboard-policy\.js"><\/script>/);
  assert.match(shell, /visibleHeroStats=heroStats\.filter/);
  assert.match(shell, /visibleQuicks=quicks\.filter/);
  assert.match(shell, /visibleCells=cells\.filter/);
  assert.match(shell, /roleItems=normalizedItems\.filter/);
  assert.match(shell, /visibleSteps=steps\.filter/);
  assert.match(shell, /No role-visible modules opened yet/);
  assert.match(shell, /function briefModuleOrganisationWide\(brief,moduleId\)/);
  assert.match(shell, /Activity history is device-wide/);
  assert.match(shell, /!currentStoreSelection\(\)\.isAll/);
  assert.match(shell, /!moduleVisibleForRole\('qms'\)&&!moduleVisibleForRole\('service'\)/);
  assert.match(shell, /renderHome\(\).*renderToday\(\)/);
});

test('Today reconciliation uses canonical facts before applying store context', () => {
  assert.match(shell, /computeStockDay\(t\)/);
  assert.match(shell, /dateRec\|\|j\.bookingDate/);
  assert.match(shell, /!e\.void&&String\(e\.type\|\|'expense'\)\.toLowerCase\(\)!=='income'/);
  assert.match(shell, /cashRec\.filledBy\|\|cashRec\.closed/);
  assert.match(shell, /CURRENT_ROLE_KEY, CURRENT_STORE_KEY, ROLE_ACCESS_KEY/);
  assert.match(shell, /Combined\/untagged/);
  assert.match(shell, /function eodShareBrief\(\)\{[\s\S]*?const st=buildCloseDaySteps\(\)/);
  assert.doesNotMatch(shell, /function eodShareBrief\(\)\{[\s\S]*?buildCloseDaySteps\(brief\)[\s\S]*?shareTodayBrief/);
});
