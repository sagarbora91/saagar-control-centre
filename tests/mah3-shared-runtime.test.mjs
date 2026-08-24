import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimePath = path.join(root, 'www', 'shared', 'module-runtime.js');
const planningPath = path.join(root, 'www', 'modules', 'planning', 'index.html');
const source = fs.readFileSync(runtimePath, 'utf8');
const planning = fs.readFileSync(planningPath, 'utf8');
const config = "{schemaVersion:1,moduleId:'planning',nextSteps:[],customerSelectors:[],accessContext:false}";
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

test('MAH-3 runtime is one classic synchronous offline immutable global', () => {
  assert.doesNotThrow(() => new vm.Script(source, { filename: 'module-runtime.js' }));
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|import\s*\(|WebSocket)\b/);
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const api = context.window.SaagarModuleRuntime;
  assert.ok(api);
  assert.equal(api.version, 2);
  assert.equal(typeof api.accepts, 'function');
  assert.equal(Object.isFrozen(api), true);
  assert.throws(() => { context.window.SaagarModuleRuntime = null; }, TypeError);
});

test('MAH-3 Planning canary evidence binds all 12 browser cases without device overclaim', () => {
  const evidence = JSON.parse(fs.readFileSync(path.join(root, 'verification', 'mah3-visual-review', 'MAH3-PLANNING-CANARY-EVIDENCE-2026-08-07.json')));
  assert.equal(evidence.cases.length, 12);
  assert.equal(new Set(evidence.cases).size, 12);
  assert.deepEqual(evidence.results, {reviewed:12,passed:12,readinessFailures:0,hardGeometryFindings:0,defects:0,deferred:0});
  const legacyCss = fs.readFileSync(path.join(root, 'www', 'shared', 'module-mobile-legacy.css'), 'utf8');
  const reconstructedCanary = planning.replace(
    '<link id="st-v5-mobile-css" rel="stylesheet" href="../../shared/module-mobile-legacy.css">',
    `<style id="st-v5-mobile-css">${legacyCss}</style>`
  );
  assert.equal(evidence.planningSha256, sha256(reconstructedCanary));
  assert.notEqual(evidence.planningSha256, sha256(fs.readFileSync(planningPath)));
  assert.equal(evidence.runtimeSha256, sha256(fs.readFileSync(runtimePath)));
  assert.equal(evidence.acceptance.browserCanaryPassed, true);
  assert.equal(evidence.acceptance.physicalDeviceAccepted, false);
  assert.equal(evidence.acceptance.nativeLanguageAccepted, false);
  assert.equal(evidence.acceptance.productionAccepted, false);
});

test('MAH-3 runtime validates, freezes and drift-locks module configuration', () => {
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const api = context.window.SaagarModuleRuntime;
  const accepted = api.configure({schemaVersion:1,moduleId:'planning',nextSteps:[],customerSelectors:[],accessContext:false});
  assert.equal(Object.isFrozen(accepted), true);
  assert.equal(Object.isFrozen(accepted.nextSteps), true);
  assert.throws(() => api.configure({schemaVersion:1,moduleId:'planning',nextSteps:[],customerSelectors:['<bad>'],accessContext:false}), /Invalid/);
  assert.throws(() => api.configure({schemaVersion:1,moduleId:'planning',nextSteps:[],customerSelectors:[],accessContext:true}), /drift/);
  assert.throws(() => api.run('unknown',{schemaVersion:1,moduleId:'other',nextSteps:[],customerSelectors:[],accessContext:false}), /Unknown/);
});

test('MAH-3 Planning replaces exactly six helpers at their original parser positions', () => {
  assert.equal(planning.split('<script src="../../shared/module-runtime.js"></script>').length - 1, 1);
  const ids = ['st-v5-iframe-shim','st-v5-safety-net','st-v5-mobile-boot','st-v5-back-script','st-v5-emp-assist-script','st-v5-module-audit-bridge'];
  const stages = ['storage','safety','mobile','back','employees','audit'];
  let previous = -1;
  ids.forEach((id, index) => {
    const expression = new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`);
    const match = planning.match(expression);
    assert.ok(match, id);
    assert.match(match[1], new RegExp(`SaagarModuleRuntime\\.run\\('${stages[index]}'`));
    assert.ok(match[1].includes(config));
    const at = planning.indexOf(`id="${id}"`);
    assert.ok(at > previous, `${id} order`);
    previous = at;
  });
  assert.match(planning, /<script src="\.\.\/\.\.\/shared\/module-runtime\.js"><\/script>/);
  // Phase 1 extends this parser-position contract to every manifest module.
  const expected = new Map([
    ['stock', "{schemaVersion:1,moduleId:'stock',nextSteps:[],customerSelectors:[],accessContext:true}"],
    ['service', "{schemaVersion:1,moduleId:'service',nextSteps:[{id:'qms',label:'Back to Queue →'}],customerSelectors:['#f-cn','#f-an','#f-dcs'],accessContext:true}"],
    ['qms', "{schemaVersion:1,moduleId:'qms',nextSteps:[{id:'dsr',label:'Record in DSR →'}],customerSelectors:['#custName'],accessContext:false}"],
    ['dsr', "{schemaVersion:1,moduleId:'dsr',nextSteps:[{id:'stock',label:'Update Stock →'}],customerSelectors:[],accessContext:true}"],
    ['expense', "{schemaVersion:1,moduleId:'expense',nextSteps:[{id:'tax',label:'Check Tax →'}],customerSelectors:[],accessContext:true}"],
    ['grooming', "{schemaVersion:1,moduleId:'grooming',nextSteps:[{id:'qms',label:'Open Queue →'}],customerSelectors:[],accessContext:false}"],
    ['cro_audit', "{schemaVersion:1,moduleId:'cro_audit',nextSteps:[],customerSelectors:[],accessContext:false}"],
    ['payroll', "{schemaVersion:1,moduleId:'payroll',nextSteps:[],customerSelectors:[],accessContext:false}"],
    ['leave', "{schemaVersion:1,moduleId:'leave',nextSteps:[],customerSelectors:[],accessContext:false}"],
    ['tax', "{schemaVersion:1,moduleId:'tax',nextSteps:[],customerSelectors:[],accessContext:false}"],
    ['planning', config]
  ]);
  const helperIds = ['st-v5-iframe-shim','st-v5-safety-net','st-v5-mobile-boot','st-v5-back-script','st-v5-emp-assist-script','st-v5-module-audit-bridge'];
  const allStages = ['storage','safety','mobile','back','employees','audit'];
  for (const [moduleId, expectedConfig] of expected) {
    const html = fs.readFileSync(path.join(root, 'www', 'modules', moduleId, 'index.html'), 'utf8');
    assert.equal(html.split('<script src="../../shared/module-runtime.js"></script>').length - 1, 1, moduleId);
    helperIds.forEach((id, index) => {
      const body = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));
      assert.ok(body, `${moduleId}:${id}`);
      assert.equal(body[1], `SaagarModuleRuntime.run('${allStages[index]}',${expectedConfig});`);
    });
  }
});
