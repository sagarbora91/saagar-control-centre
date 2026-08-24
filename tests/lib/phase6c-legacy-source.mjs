import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEGACY_ASSET,
  restoreMigratedLegacySource
} from '../../scripts/prepare-phase6c-mobile-legacy-css.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const authority = fs.readFileSync(path.join(root, 'www', LEGACY_ASSET), 'utf8');

export function restoreInlineLegacySource(moduleId, source) {
  const restored = restoreMigratedLegacySource(moduleId, source, authority);
  assert.notEqual(restored, source, `${moduleId} Phase 6C migrated source`);
  return restored;
}
