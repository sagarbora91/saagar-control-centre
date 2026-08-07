import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readdir, readFile } from 'node:fs/promises';

const root = new URL('../www/', import.meta.url);
const source = await readFile(new URL('app-i18n.js', root), 'utf8').catch(() => '');
const shell = await readFile(new URL('index.html', root), 'utf8');
const moduleNames = (await readdir(new URL('modules/', root), { withFileTypes: true }))
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();

function loadApi() {
  const listeners = {};
  const document = {
    readyState: 'loading',
    documentElement: { lang: 'en' },
    addEventListener(type, handler) { listeners[type] = handler; },
    querySelectorAll() { return []; }
  };
  const storage = new Map();
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); }
  };
  const window = {
    document,
    localStorage,
    addEventListener(type, handler) { listeners[`window:${type}`] = handler; },
    setTimeout(handler) { handler(); return 1; },
    clearTimeout() {}
  };
  window.window = window;
  vm.runInNewContext(source, { window, document, localStorage, console, MutationObserver: class { observe() {} } });
  return window.SaagarI18n;
}

test('one offline localization runtime is loaded by the shell and every module', async () => {
  assert.match(shell, /<script src="app-i18n\.js"><\/script>/);
  assert.equal(moduleNames.length, 11);
  for (const moduleName of moduleNames) {
    const html = await readFile(new URL(`modules/${moduleName}/index.html`, root), 'utf8');
    assert.match(html, /<script src="\.\.\/\.\.\/app-i18n\.js"><\/script>/, `${moduleName} must load shared language runtime`);
  }
});

test('Marathi and Hindi dictionaries cover Settings, module names and common actions', () => {
  const api = loadApi();
  assert.ok(api, 'SaagarI18n must be exported');
  assert.equal(api.translate('Settings', 'mr'), 'सेटिंग्ज');
  assert.equal(api.translate('Appearance & language', 'mr'), 'दिसणे आणि भाषा');
  assert.equal(api.translate('Stock Register', 'mr'), 'स्टॉक नोंदवही');
  assert.equal(api.translate("Start Today's Register", 'mr'), 'आजची नोंदवही सुरू करा');
  assert.equal(api.translate('New Service Order', 'mr'), 'नवीन सेवा आदेश');
  assert.equal(api.translate('Opening Stock — Daily Head Count Register', 'mr'), 'आरंभीचा साठा — दैनिक मोजणी नोंदवही');
  assert.equal(api.translate('Desktop - Marathi - Normal text', 'mr'), 'डेस्कटॉप - मराठी - सामान्य मजकूर');
  assert.equal(api.translate('Owner PIN not set - 2 protected', 'mr'), 'मालक पिन सेट नाही - 2 संरक्षित');
  assert.equal(api.translate('Save', 'hi'), 'सहेजें');
  assert.equal(api.translate('Manage Compliance', 'hi'), 'अनुपालन प्रबंधन');
  assert.equal(api.translate('Unmapped business value', 'mr'), 'Unmapped business value');
  const stats = api.stats();
  assert.ok(stats.mr >= 850, `expected >=850 Marathi UI phrases, got ${stats.mr}`);
  assert.equal(stats.mr, stats.hi, 'Marathi and Hindi must have equal phrase coverage');
});

test('runtime localizes dynamic UI but excludes editable and business-data surfaces', () => {
  assert.match(source, /new MutationObserver/);
  assert.match(source, /ST_LANG/);
  assert.match(source, /saagar_lang/);
  for (const guard of ['INPUT', 'TEXTAREA', 'TBODY', 'contenteditable', 'data-no-i18n']) {
    assert.match(source, new RegExp(guard, 'i'), `${guard} guard must remain present`);
  }
  assert.match(source, /data-i18n/);
});

test('shell broadcasts language changes to the active module', () => {
  const setLang = shell.slice(shell.indexOf('function setLang('), shell.indexOf('/*', shell.indexOf('function setLang(')));
  assert.match(setLang, /applyLangToFrame\(l\)/);
  assert.match(shell, /postMessage\(\{type:'ST_LANG',lang:/);
  const moduleLoad = shell.slice(shell.indexOf("__f.addEventListener('load'"), shell.indexOf('// Loader safety net'));
  assert.match(moduleLoad, /applyLangToFrame\(getLang\(\)\)/);
  const authoritativeRender = shell.slice(shell.indexOf('function doFirstRender(){'), shell.indexOf('// First render'));
  assert.match(authoritativeRender, /applyLang\(\);\s*reflectLangUI\(\)/);
  assert.doesNotMatch(shell, /data-i18n="cfg\.language">Language<\/span>\s*\/\s*भाषा/);
});
