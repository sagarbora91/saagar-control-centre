import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inlineJavaScript,
  inspectJavaScript,
  maskCommentsAndTemplates,
  resolveLocalScript,
  resolveManifestEntry,
  scriptSources,
  splitShellInlinePrograms
} from '../scripts/lib/mah4-contract-source.mjs';

test('MAH-4 lexical mask excludes comments and dormant template programs', () => {
  const source = [
    "parent.postMessage({type:'ST_READY'},'*');",
    "// parent.postMessage({type:'ST_BACK'},'*');",
    "const dormant = `parent.postMessage({type:'ST_DISPOSE'},'*')`;",
    "if (event.data.type === 'ST_INIT') boot();"
  ].join('\n');
  const masked = maskCommentsAndTemplates(source);
  const inspected = inspectJavaScript(source);
  assert.match(masked, /ST_READY/);
  assert.doesNotMatch(masked, /ST_BACK|ST_DISPOSE/);
  assert.deepEqual(inspected.producerCounts, { ST_READY: 1 });
  assert.deepEqual(inspected.consumerCounts, { ST_INIT: 1 });
  assert.deepEqual(inspected.lexicalTokens, ['ST_BACK', 'ST_DISPOSE', 'ST_INIT', 'ST_READY']);
});

test('MAH-4 resolver follows canonical local module assets', () => {
  assert.equal(resolveLocalScript('modules/planning/index.html', '../../app-i18n.js'), 'app-i18n.js');
  assert.equal(resolveLocalScript('index.html', 'module-manifest.js'), 'module-manifest.js');
});

test('MAH-4 resolver rejects remote, traversal, query and non-JavaScript assets', () => {
  for (const reference of [
    'https://example.invalid/runtime.js',
    '//example.invalid/runtime.js',
    '../../../outside.js',
    '../../app-i18n.js?v=2',
    '../../mobile-layout.css'
  ]) {
    assert.throws(() => resolveLocalScript('modules/planning/index.html', reference), /MAH-4/);
  }
});

test('MAH-4 manifest entries are canonical local HTML before file access', () => {
  assert.equal(resolveManifestEntry('modules/planning/index.html'), 'modules/planning/index.html');
  for (const reference of [
    '../outside.html',
    'modules/../index.html',
    '/absolute.html',
    'https://example.invalid/module.html',
    'modules/planning/index.html?v=2',
    'modules/planning/runtime.js'
  ]) {
    assert.throws(() => resolveManifestEntry(reference), /MAH-4/);
  }
});

test('MAH-4 script discovery accepts exact quoted SRC and ignores data-src', () => {
  const html = [
    '<!-- <script src> is documentation, not a script tag -->',
    '<script SRC="runtime.js"></script>',
    '<script data-src="decoy.js">window.inlineBoot = true;</script>'
  ].join('\n');
  assert.deepEqual(scriptSources(html), ['runtime.js']);
  assert.match(inlineJavaScript(html), /inlineBoot/);
});

test('MAH-4 script discovery fails closed on unquoted, empty or duplicate src', () => {
  for (const html of [
    '<script src=runtime.js></script>',
    '<script src=""></script>',
    '<script src="one.js" SRC="two.js"></script>'
  ]) {
    assert.throws(() => scriptSources(html), /MAH-4/);
  }
});

test('MAH-4 balanced wildcard inspection cannot cross into a later call', () => {
  const inspected = inspectJavaScript([
    "parent.postMessage({type:'ST_READY'}, expectedOrigin);",
    "unrelated({value:1}, '*');"
  ].join('\n'));
  assert.equal(inspected.postMessageCalls, 1);
  assert.equal(inspected.classifiedProducerCalls, 1);
  assert.equal(inspected.wildcardPostMessageCalls, 0);
});

test('MAH-4 listener trust is local and must precede the handled type', () => {
  const outsideDecoy = inspectJavaScript([
    'if (unrelated.source === trusted) noop();',
    "window.addEventListener('message', e => { if (e.data.type === 'ST_AUDIT') persist(); });"
  ].join('\n'));
  assert.equal(outsideDecoy.messageListenerDetails[0].sourceGuard, false);

  const lateDecoy = inspectJavaScript(
    "window.addEventListener('message', e => { if (e.data.type === 'ST_AUDIT') persist(); if (e.source === trusted) noop(); });"
  );
  assert.equal(lateDecoy.messageListenerDetails[0].sourceGuard, false);

  const wrongObjectDecoy = inspectJavaScript(
    "window.addEventListener('message', e => { if (other.source === trusted) noop(); if (e.data.type === 'ST_AUDIT') persist(); });"
  );
  assert.equal(wrongObjectDecoy.messageListenerDetails[0].sourceGuard, false);

  const guarded = inspectJavaScript(
    "window.addEventListener('message', e => { if (e.source !== trusted) return; if (e.data.type === 'ST_AUDIT') persist(); });"
  );
  assert.equal(guarded.messageListenerDetails[0].sourceGuard, true);
});

test('MAH-4 shell dormant boundaries fail closed on marker drift', () => {
  const start = 'function injectModuleHideCSS';
  const end = 'function openModal()';
  const split = splitShellInlinePrograms(`activeA\n${start}{}\ndormant\n${end}{}\nactiveB`);
  assert.match(split.active, /activeA[\s\S]*activeB/);
  assert.doesNotMatch(split.active, /dormant/);
  assert.match(split.dormant, /injectModuleHideCSS[\s\S]*dormant/);

  assert.throws(() => splitShellInlinePrograms(`${start}{} only`), /exactly once/);
  assert.throws(() => splitShellInlinePrograms(`${start}{} ${start}{} ${end}{}`), /exactly once/);
  assert.throws(() => splitShellInlinePrograms(`${end}{} ${start}{}`), /reversed/);
});
