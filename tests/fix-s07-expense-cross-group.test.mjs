// S07 cross-group source checks (G10: judged at integration step I-7, because they need another group's file).
//  - U06-F12: S01 applies the Escape edit in www/index.html raKeydownHandler.
//  - U06-F11 phrase rows wait for OD-5 (app-i18n.js is frozen), so no phrase assertion is made here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('U06-F12 raKeydownHandler stops the Escape event before the shell Esc handler can leave the module', () => {
  const src = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
  const start = src.indexOf('function raKeydownHandler(e){');
  assert.ok(start >= 0, 'raKeydownHandler present');
  const body = src.slice(start, start + 1500);
  const stop = body.indexOf('stopImmediatePropagation');
  const cancel = body.indexOf('raCancel()');
  assert.ok(stop >= 0, 'stopImmediatePropagation present');
  assert.ok(cancel < 0 || stop < cancel, 'stop comes before the cancel branch');
});
