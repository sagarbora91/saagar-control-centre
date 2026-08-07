import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('../www/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../www/settings-navigation.css', import.meta.url), 'utf8');

const expectedRoutes = [
  'appearance', 'employees', 'org', 'masters', 'admin', 'security',
  'backup', 'sync', 'diagnostics', 'privacy', 'about'
];

test('Settings uses a vertical route home instead of the clipped tab rail', () => {
  assert.match(index, /<link rel="stylesheet" href="settings-navigation\.css">/);
  assert.match(index, /id="settingsHome"/);
  assert.match(index, /id="settingsDetail"/);
  assert.doesNotMatch(index, /id="configTabs"/);

  const routes = [...index.matchAll(/data-settings-route="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(routes, expectedRoutes);
});

test('every Settings route owns an exact detail surface', () => {
  const surfaces = {
    appearance: 'subAppearance', employees: 'subEmployees', org: 'subOrg',
    masters: 'subMasters', admin: 'subAdmin', security: 'subSecurity',
    backup: 'subBackup', sync: 'subSync', diagnostics: 'subDiagnostics',
    privacy: 'subPrivacy', about: 'subAbout'
  };
  for (const [route, id] of Object.entries(surfaces)) {
    assert.match(index, new RegExp(`${route}:\\s*\\{[^}]*section:\\s*'${id}'`, 's'));
    assert.match(index, new RegExp(`id="${id}"`));
  }
});

test('phone Settings is an explicit home/detail navigation stack', () => {
  assert.match(css, /@media\s*\(max-width:\s*980px\)/);
  assert.match(index, /matchMedia\('\(max-width:\s*980px\)'\)/);
  assert.match(css, /#configView\.settings-detail-open\s+\.settings-home\s*\{[^}]*display:\s*none/s);
  assert.match(css, /#configView\.settings-detail-open\s+\.settings-detail\s*\{[^}]*display:\s*block/s);
  assert.match(css, /\.settings-detail-back\s*\{[^}]*min-(?:width|height):\s*44px/s);
  assert.doesNotMatch(css, /overflow-x:\s*auto/);
});

test('wide desktop keeps a persistent master/detail layout', () => {
  assert.match(css, /\.settings-layout\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:/s);
  assert.match(css, /@media\s*\(min-width:\s*981px\)[\s\S]*?\.settings-home\s*\{[^}]*position:\s*sticky/s);
  assert.doesNotMatch(css, /@media\s*\(min-width:\s*981px\)[\s\S]*?#configView[^}]*\.settings-detail\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.settings-detail\s+\.field-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
});

test('Settings re-evaluates its presentation when the viewport changes', () => {
  assert.match(index, /function refreshSettingsResponsiveLayout\(\)/);
  assert.match(index, /window\.addEventListener\('resize',\s*function\(\)/);
  assert.match(index, /const wasStacked\s*=\s*view\.classList\.contains\('settings-stack'\)/);
  assert.match(index, /if\(stacked\)\s*showSettingsHome\(\)/);
  assert.match(index, /else\s*switchConfigTab\(activeConfigTab\|\|'appearance'\)/);
  const authoritativeRender = index.slice(index.indexOf('function doFirstRender(){'), index.indexOf('// First render'));
  assert.match(authoritativeRender, /reflectUiModeUI\(\);\s*syncSettingsLayoutClass\(\)/);
});

test('Settings rows expose summaries and search without changing data handlers', () => {
  assert.match(index, /id="settingsSearch"[^>]+oninput="filterSettingsRoutes\(this\.value\)"/);
  for (const route of expectedRoutes) {
    const summaryId = `settingsSummary${route[0].toUpperCase()}${route.slice(1)}`;
    assert.match(index, new RegExp(`id="${summaryId}"`));
  }
  for (const handler of [
    'securityOwnerPinAction', 'exportBackup', 'handleRestoreFile', 'resetSelectedModule',
    'renderConfigSecurity', 'renderConfigBackup', 'renderSync'
  ]) {
    assert.match(index, new RegExp(`\\b${handler}\\b`));
  }
});

test('Android Back returns from Settings detail to Settings home first', () => {
  assert.match(index, /function settingsHandleBack\(\)/);
  const hardwareBack = index.slice(index.indexOf('function handleHardwareBack(){'));
  const settingsBack = hardwareBack.indexOf('settingsHandleBack()');
  const leaveSettings = hardwareBack.indexOf("activeView !== 'home'");
  assert.ok(settingsBack >= 0, 'hardware Back must call settingsHandleBack');
  assert.ok(leaveSettings >= 0, 'hardware Back must retain the shell fallback');
  assert.ok(settingsBack < leaveSettings, 'Settings detail must be consumed before leaving Settings');
});

test('existing Settings deep links still target registered routes', () => {
  for (const route of ['employees', 'backup', 'admin', 'sync']) {
    assert.match(index, new RegExp(`switchConfigTab\\('${route}'\\)`));
  }
  assert.match(index, /function renderConfigPage\(\)/);
  assert.match(index, /function showSettingsHome\(\)/);
});
