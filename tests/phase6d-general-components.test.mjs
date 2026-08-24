import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const componentPath = path.join(root, 'www', 'shared', 'module-components.css');
const source = fs.readFileSync(componentPath, 'utf8');
const moduleRoot = path.join(root, 'www', 'modules');

function selectors(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...clean.matchAll(/(?:^|})\s*([^@][^{]*)\{/g)].map(match => match[1].trim());
}

test('general component selectors are completely gated and module-agnostic', () => {
  const rules = selectors(source);
  assert.ok(rules.length >= 20);
  for (const selector of rules) {
    for (const branch of selector.split(',')) assert.match(branch.trim(), /^\[data-saagar-ui\](?:\s|$)/, branch);
  }
  assert.doesNotMatch(source, /#(?:stock|planning|expense|service|qms|payroll|leave|tax|dsr|etp)\b/i);
  assert.doesNotMatch(source, /\.module-|\[data-module/);
});

test('forms, buttons, cards, overlays, toolbar and navigation publish the complete contract', () => {
  for (const name of [
    'saagar-field','saagar-label','saagar-input','saagar-select','saagar-textarea',
    'saagar-button','saagar-button--secondary','saagar-button--danger','saagar-card','saagar-tile',
    'saagar-modal-backdrop','saagar-modal','saagar-sheet-backdrop','saagar-sheet',
    'saagar-toolbar','saagar-toolbar__actions','saagar-nav','saagar-nav-link'
  ]) assert.match(source, new RegExp(`\\.${name.replaceAll('-', '\\-')}(?:[\\s,{:\\[])`), name);
});

test('loading, empty, error, success and disabled states are explicit', () => {
  for (const state of ['loading','empty','error','success','disabled']) {
    assert.match(source, new RegExp(`data-state="${state}"`), state);
  }
  assert.match(source, /\[aria-disabled="true"\]/);
  assert.match(source, /:disabled/);
});

test('persistent text, controls, navigation and focus meet the shared floor', () => {
  assert.match(source, /font-size:16px;font-size:var\(--type-floor,16px\)/);
  assert.match(source, /min-height:44px;min-height:var\(--control-height,44px\)/);
  assert.match(source, /min-(?:height|width):44px;min-(?:height|width):var\(--touch-target,44px\)/);
  assert.match(source, /outline:3px solid #93c5fd;outline:3px solid var\(--blue-pale,#93c5fd\)/);
  assert.match(source, /box-shadow:0 0 0 3px rgba\(29,78,216,\.28\);box-shadow:var\(--focus-ring\)/);
});

test('every governed custom-property use has an explicit legacy declaration first', () => {
  const declarations = source.match(/[^{}]+\{[^{}]*\}/g) || [];
  for (const rule of declarations) {
    const body = rule.slice(rule.indexOf('{') + 1, -1);
    for (const match of body.matchAll(/([\w-]+):var\([^;]+/g)) {
      const before = body.slice(0, match.index);
      assert.match(before, new RegExp(`(?:^|;)${match[1].replace('-', '\\-')}:[^;]+;$`), `${match[1]} lacks fallback in ${rule}`);
    }
  }
});

test('API-23 path has explicit layout fallbacks and no modern feature as sole path', () => {
  assert.match(source, /display:flex;display:-webkit-flex/);
  assert.match(source, /display:inline-flex;display:-webkit-inline-flex/);
  assert.match(source, /align-items:center;-webkit-align-items:center/);
  assert.doesNotMatch(source, /@supports|container-type|@container|:has\(|subgrid|backdrop-filter/);
  assert.doesNotMatch(source, /\bgrid-template|display:grid/);
});

test('general component adoption is bounded to Stock plus Family A', () => {
  const adopted = new Set(['stock', 'payroll', 'grooming', 'service']);
  for (const id of fs.readdirSync(moduleRoot)) {
    const file = path.join(moduleRoot, id, 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    if (adopted.has(id)) {
      assert.match(html, /module-components\.css/, file);
      continue;
    }
    assert.doesNotMatch(html, /module-components\.css/, file);
    assert.doesNotMatch(html, /saagar-(?:field|button|card|tile|modal|sheet|toolbar|nav|state)\b/, file);
  }
});
