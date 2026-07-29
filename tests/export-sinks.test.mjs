import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { inlineModuleScripts, loadModuleBundle } from './lib/module-bundle.mjs';

const modules = loadModuleBundle();

test('embedded modules match their byte count and SHA-256 metadata', () => {
  assert.equal(modules.length, 11);
  modules.forEach(module => {
    assert.equal(module.actualBytes, module.bytes, `${module.id} byte count`);
    assert.equal(module.actualSha256, module.sha256, `${module.id} SHA-256`);
  });
});

test('every embedded module script parses', () => {
  modules.forEach(module => {
    const scripts = inlineModuleScripts(module.html);
    assert.ok(scripts.length > 0, `${module.id} has inline scripts`);
    scripts.forEach((source, i) => {
      assert.doesNotThrow(() => new vm.Script(source, { filename: `${module.id}-inline-${i + 1}.js` }));
    });
  });
});

test('embedded modules have no direct file, share, WhatsApp or popup delivery bypass', () => {
  const forbidden = [
    { name: 'direct anchor download', pattern: /\.download\s*=/ },
    { name: 'browser share API', pattern: /\bnavigator\.share\s*\(/ },
    { name: 'direct native share', pattern: /\.Plugins\.Share|\.Share\.share\s*\(/ },
    { name: 'direct WhatsApp scheme', pattern: /whatsapp:\/\//i },
    { name: 'direct WhatsApp popup', pattern: /window\.open\s*\(\s*["']https:\/\/wa\.me\//i },
    { name: 'standalone print popup', pattern: /window\.open\s*\(\s*["']{2}\s*,\s*["']_blank["']/i },
    { name: 'shell share bypass', pattern: /parent\.SaagarShare\.share\s*\(/ }
  ];
  modules.forEach(module => {
    forbidden.forEach(rule => assert.doesNotMatch(module.html, rule.pattern, `${module.id}: ${rule.name}`));
  });
});

test('all outbound-capable modules use registered shell routes', () => {
  const expected = ['cro_audit', 'dsr', 'expense', 'grooming', 'leave', 'payroll', 'qms', 'service', 'stock', 'tax'];
  expected.forEach(id => {
    const module = modules.find(item => item.id === id);
    assert.ok(module, `${id} exists`);
    assert.match(module.html, /type\s*:\s*['"]ST_(?:SHARE|WA|WA_LINK|PRINT|REPORT|REPORT_BATCH)['"]/);
  });
});
