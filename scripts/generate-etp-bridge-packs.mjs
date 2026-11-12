#!/usr/bin/env node
/* Writes the synthetic ETP report-engine bridge packs (valid, boundary and negative) to a folder OUTSIDE the repo.
   Usage: node scripts/generate-etp-bridge-packs.mjs --output <folder> [--skip-large]
   The key pair is created in memory for this run, is non-extractable, and is never written. The index carries the
   key id only. Every pack is invented data. The built app has no trusted key, so it refuses every one of these packs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCaseSet, sha256Hex, SHIPPED_EXPECTATION, TENDER_DICTIONARY_ID, verifierApi } from './lib/etp-bridge-pack-builder.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORBIDDEN_SEGMENTS = Object.freeze(['.tmp-etp-synthetic-fixtures-device', '.audit-secrets']);
export const INDEX_FORMAT = 'SCC_ETP_BRIDGE_SYNTHETIC_PACKS_V1';

function realPathOfPlanned(target) {
  const rest = [];
  let current = path.resolve(target);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    rest.unshift(path.basename(current));
    current = parent;
  }
  return path.join(fs.realpathSync(current), ...rest);
}
function folded(value) { return value.toLowerCase(); }

/* Throws when the folder is inside the repo, inside the protected fixture folder, or inside any .audit-secrets folder. */
export function assertSafeOutputDir(outputDir) {
  if (typeof outputDir !== 'string' || outputDir.trim() === '') throw new Error('An --output folder is required (there is no default).');
  const planned = realPathOfPlanned(outputDir), root = realPathOfPlanned(repoRoot);
  const relative = path.relative(folded(root), folded(planned));
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) throw new Error('Refusing to write packs inside the repository.');
  const segments = folded(planned).split(/[\\/]+/);
  for (const forbidden of FORBIDDEN_SEGMENTS) {
    if (segments.includes(folded(forbidden))) throw new Error(`Refusing to write packs under ${forbidden}.`);
  }
  return planned;
}

function fileFor(entry) {
  if (entry.id === 'valid-day') return 'valid/WLMHW_2026-27_2026-08-21_2026-08-21_G01.scc-etp';
  if (entry.id === 'valid-month') return 'valid/WLMHW_2026-27_2026-08-01_2026-08-31_G01.scc-etp';
  const folder = entry.group === 'valid' ? 'valid' : entry.group === 'large' ? 'large' : 'negative';
  return `${folder}/${entry.id}.scc-etp`;
}

export async function writePackSet(outputDir, { includeLarge = true } = {}) {
  const target = assertSafeOutputDir(outputDir);
  const set = await buildCaseSet({ includeLarge });
  const cases = [];
  for (const entry of set.cases) {
    const relativePath = fileFor(entry), full = path.join(target, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, entry.bytes);
    cases.push({ id: entry.id, group: entry.group, file: relativePath, bytes: entry.bytes.length, sha256: await sha256Hex(entry.bytes),
      expect: entry.expect, verifyOptions: entry.verifyOptions, note: entry.note });
  }
  const index = {
    format: INDEX_FORMAT, contract: verifierApi.CONTRACT, tenderDictionaryVersionId: TENDER_DICTIONARY_ID, shippedExpectation: SHIPPED_EXPECTATION,
    trustedKeyId: set.anchor.keyId, otherKeyId: set.otherAnchor.keyId,
    note: 'Synthetic, invented data. Signed with throwaway keys that existed only in memory while this ran; no key of any kind was written. The built app refuses every pack here.',
    caseCount: cases.length, cases
  };
  fs.writeFileSync(path.join(target, '_index.json'), `${JSON.stringify(index, null, 2)}\n`);
  return { outputDir: target, caseCount: cases.length, groups: [...new Set(cases.map((entry) => entry.group))], index };
}

function parseArguments(argv) {
  const options = { output: '', skipLarge: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--output') { options.output = argv[i + 1] || ''; i += 1; } else if (argv[i] === '--skip-large') options.skipLarge = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return options;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const written = await writePackSet(options.output, { includeLarge: !options.skipLarge });
    console.log(`Wrote ${written.caseCount} synthetic packs (${written.groups.join(', ')}) to ${written.outputDir}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Pack generation failed.');
    process.exitCode = 1;
  }
}
