#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModuleManifestSource, renderModuleManifestSource } from './lib/module-manifest-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEGACY_MODULE_ALLOWLIST = Object.freeze([
  'stock', 'service', 'qms', 'dsr', 'expense', 'grooming',
  'cro_audit', 'payroll', 'leave', 'tax', 'planning'
]);
export const PLANNING_PROOF_MODULES = Object.freeze(['planning']);
export const LEGACY_ROLLOUT_MODULES = LEGACY_MODULE_ALLOWLIST;
export const LEGACY_ASSET = 'shared/module-mobile-legacy.css';
export const LEGACY_ASSET_BYTES = 24977;
export const LEGACY_ASSET_SHA256 = 'acc970dbe54fb99b0dfa25a2807fb3626ba11130fcd87969ca336d8000efa443';
export const PLANNING_BASELINE_SHA256 = '8fd35c2046b49034f0bb293b513dbf51a69e76054ebe12a4f0b8915a330aef4c';
export const ETP_BASELINE_SHA256 = 'b2973563b988779468471950bb777c6323580e90ac6011c9038581845b9cfa12';
export const MODULE_BASELINE_SHA256 = Object.freeze({
  stock: 'f0e478919ae3352b9bc28dc70c34b58c0cc890b763802c2b36e690af8f646608',
  service: 'b4f39ecb64aed4b0832a5249e69de0a9a33ada97911168af40064ac85816fae2',
  qms: '9d20b603cd3a9cf74edab5e2ee109d20c94e39e1e895101a08e3dab693b1d7b4',
  dsr: 'c720d74d9cf15011164e8bdf6e3f09a9f990e393237d3e921054ad2d625e185d',
  expense: '67d10355aaa51f2002d3cacedaf940cf510a3f83b46a5d460ab1ccc1073fd847',
  grooming: '050d3450ed268bbac9cac1fbb8c759e236b7fd853564367288f2451c5b0efe9d',
  cro_audit: 'f900d17d8ecf2790fdd5690e7f333ed84dd162fbcc66ec1e00950cdfdb4aa6bf',
  payroll: '237f86468ff095ab8095e8f54497ad72a264c0515769dc820536d7b5e7351868',
  leave: '6ba497a47202db9d982d14897aed6519ee7dcc016076ea5d1e3f501eda2a990a',
  tax: 'bbc76608e799451f526a58947f683e947739caa77be0a2af4007bb454d076534',
  planning: PLANNING_BASELINE_SHA256
});

export const MODULE_DELTAS = Object.freeze({
  service: 'html.bcc-mobile[data-mod="service"] .stage-chip{flex:0 0 auto}\n',
  qms: 'html.bcc-mobile[data-mod="qms"] .sidebar{visibility:hidden}\n' +
    'html.bcc-mobile[data-mod="qms"] .sidebar.open,html.bcc-mobile[data-mod="qms"] .qms-menu-toggle:checked~.sidebar{transform:translateX(0);visibility:visible}\n',
  payroll: '@media(max-width:480px){\n' +
    '  html.bcc-mobile[data-mod="payroll"] .hd-right{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%;flex:1 1 100%}\n' +
    '  html.bcc-mobile[data-mod="payroll"] .status-chip{grid-column:1/-1;justify-self:start}\n' +
    '  html.bcc-mobile[data-mod="payroll"] .btn-hd{width:100%;min-width:0;white-space:normal}\n' +
    '}\n'
});

const styleOpen = '<style id="st-v5-mobile-css">';
const stylePattern = /<style id="st-v5-mobile-css">([\s\S]*?)<\/style>/;
const legacyLink = '<link id="st-v5-mobile-css" rel="stylesheet" href="../../shared/module-mobile-legacy.css">';
export const renderLegacyDeltaStyle = moduleId => MODULE_DELTAS[moduleId]
  ? `<style id="st-v5-mobile-css-delta">\n${MODULE_DELTAS[moduleId]}</style>`
  : '';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function modulePath(workspaceRoot, moduleId) {
  return path.join(workspaceRoot, 'www', 'modules', moduleId, 'index.html');
}

function assertFrozenAuthority(body) {
  const bytes = Buffer.byteLength(body);
  const digest = sha256(body);
  if (bytes !== LEGACY_ASSET_BYTES || digest !== LEGACY_ASSET_SHA256) {
    throw new Error(`Planning legacy CSS authority drift: ${bytes} bytes ${digest}`);
  }
}

export function reconstructLegacyInlineBody(moduleId, authority) {
  if (moduleId === 'service') {
    const anchor = '/* payroll Send-Slip card cell: let the two action buttons wrap instead of overflowing the narrow card */';
    return authority.replace(anchor, `${MODULE_DELTAS.service}${anchor}`);
  }
  if (moduleId === 'qms') {
    const canonical = 'html.bcc-mobile[data-mod="qms"] .sidebar.open{transform:translateX(0)}\n';
    return authority.replace(canonical, MODULE_DELTAS.qms);
  }
  if (moduleId === 'payroll') {
    const anchor = 'html.bcc-mobile[data-mod="payroll"] .wp{max-width:100% !important;margin:0 !important;padding:12px 10px 84px !important}';
    return authority.replace(anchor, `${MODULE_DELTAS.payroll}${anchor}`);
  }
  return authority;
}

export function restoreMigratedLegacySource(moduleId, source, authority) {
  const migrated = legacyLink + renderLegacyDeltaStyle(moduleId);
  if (!source.includes(migrated)) return source;
  return source.replace(migrated,
    `<style id="st-v5-mobile-css">${reconstructLegacyInlineBody(moduleId, authority)}</style>`);
}

function refreshPinnedIdentities(workspaceRoot, moduleIds, assetBytes) {
  const snapshot = readModuleManifestSource(workspaceRoot);
  const data = snapshot.data;
  data.sharedAssets = data.sharedAssets.filter(item => item.id !== 'module-mobile-legacy-css');
  const commonIndex = data.sharedAssets.findIndex(item => item.id === 'module-mobile-common-css');
  if (commonIndex < 0) throw new Error('module-mobile-common-css manifest authority missing');
  data.sharedAssets.splice(commonIndex + 1, 0, {
    id: 'module-mobile-legacy-css', version: 1, file: LEGACY_ASSET,
    bytes: assetBytes.length, sha256: sha256(assetBytes)
  });
  const goldenPath = path.join(workspaceRoot, 'verification', 'module-build-golden-hashes.json');
  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  for (const moduleId of moduleIds) {
    const entry = data.modules.find(item => item.id === moduleId);
    if (!entry) throw new Error(`${moduleId} manifest entry missing`);
    const bytes = fs.readFileSync(modulePath(workspaceRoot, moduleId));
    entry.bytes = bytes.length;
    entry.sha256 = sha256(bytes);
    golden[moduleId] = { bytes: bytes.length, sha256: sha256(bytes) };
  }
  fs.writeFileSync(snapshot.filePath, renderModuleManifestSource(snapshot, data), 'utf8');
  fs.writeFileSync(goldenPath, `${JSON.stringify(golden, null, 2)}\n`, 'utf8');
}

export function preparePlanningProof({ workspaceRoot = root } = {}) {
  const before = new Map(LEGACY_MODULE_ALLOWLIST
    .filter(moduleId => moduleId !== 'planning')
    .map(moduleId => [moduleId, fs.readFileSync(modulePath(workspaceRoot, moduleId))]));
  const etpPath = modulePath(workspaceRoot, 'etp');
  const etpBefore = fs.readFileSync(etpPath);
  if (sha256(etpBefore) !== ETP_BASELINE_SHA256) throw new Error('ETP baseline drift before Phase 6C preparation');

  const planningPath = modulePath(workspaceRoot, 'planning');
  let planning = fs.readFileSync(planningPath, 'utf8');
  const inline = planning.match(stylePattern);
  let authority;
  if (inline) {
    if (sha256(planning) !== PLANNING_BASELINE_SHA256) throw new Error('Planning baseline drift before Phase 6C preparation');
    authority = inline[1];
    assertFrozenAuthority(authority);
    planning = planning.replace(inline[0], legacyLink);
    fs.writeFileSync(planningPath, planning, 'utf8');
  } else {
    if (!planning.includes(legacyLink) || planning.includes(styleOpen)) {
      throw new Error('Planning is neither the frozen inline baseline nor the staged legacy-link proof');
    }
    authority = fs.readFileSync(path.join(workspaceRoot, 'www', LEGACY_ASSET), 'utf8');
    assertFrozenAuthority(authority);
  }

  const assetPath = path.join(workspaceRoot, 'www', LEGACY_ASSET);
  fs.writeFileSync(assetPath, authority, 'utf8');
  const assetBytes = fs.readFileSync(assetPath);
  assertFrozenAuthority(assetBytes);

  const snapshot = readModuleManifestSource(workspaceRoot);
  const data = snapshot.data;
  data.sharedAssets = data.sharedAssets.filter(item => item.id !== 'module-mobile-legacy-css');
  const commonIndex = data.sharedAssets.findIndex(item => item.id === 'module-mobile-common-css');
  if (commonIndex < 0) throw new Error('module-mobile-common-css manifest authority missing');
  data.sharedAssets.splice(commonIndex + 1, 0, {
    id: 'module-mobile-legacy-css', version: 1, file: LEGACY_ASSET,
    bytes: assetBytes.length, sha256: sha256(assetBytes)
  });
  const planningEntry = data.modules.find(item => item.id === 'planning');
  if (!planningEntry) throw new Error('Planning manifest entry missing');
  const planningBytes = fs.readFileSync(planningPath);
  planningEntry.bytes = planningBytes.length;
  planningEntry.sha256 = sha256(planningBytes);
  fs.writeFileSync(snapshot.filePath, renderModuleManifestSource(snapshot, data), 'utf8');

  const goldenPath = path.join(workspaceRoot, 'verification', 'module-build-golden-hashes.json');
  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  golden.planning = { bytes: planningBytes.length, sha256: sha256(planningBytes) };
  fs.writeFileSync(goldenPath, `${JSON.stringify(golden, null, 2)}\n`, 'utf8');

  for (const [moduleId, bytes] of before) {
    if (!fs.readFileSync(modulePath(workspaceRoot, moduleId)).equals(bytes)) throw new Error(`${moduleId} changed during Planning-only preparation`);
  }
  const etpAfter = fs.readFileSync(etpPath);
  if (!etpAfter.equals(etpBefore) || sha256(etpAfter) !== ETP_BASELINE_SHA256) {
    throw new Error('ETP changed during Planning-only preparation');
  }
  return { stage: 'planning-proof', modules: PLANNING_PROOF_MODULES, asset: LEGACY_ASSET, bytes: assetBytes.length, sha256: sha256(assetBytes) };
}

export function prepareLegacyRollout({ workspaceRoot = root } = {}) {
  const etpPath = modulePath(workspaceRoot, 'etp');
  const etpBefore = fs.readFileSync(etpPath);
  if (sha256(etpBefore) !== ETP_BASELINE_SHA256) throw new Error('ETP baseline drift before Phase 6C rollout');
  const assetPath = path.join(workspaceRoot, 'www', LEGACY_ASSET);
  const authority = fs.readFileSync(assetPath, 'utf8');
  assertFrozenAuthority(authority);

  for (const moduleId of LEGACY_MODULE_ALLOWLIST) {
    const file = modulePath(workspaceRoot, moduleId);
    let source = fs.readFileSync(file, 'utf8');
    const inline = source.match(stylePattern);
    const replacement = legacyLink + renderLegacyDeltaStyle(moduleId);
    if (inline) {
      if (sha256(source) !== MODULE_BASELINE_SHA256[moduleId]) throw new Error(`${moduleId} baseline drift before Phase 6C rollout`);
      const expectedBody = reconstructLegacyInlineBody(moduleId, authority);
      if (inline[1] !== expectedBody) throw new Error(`${moduleId} inline legacy authority or delta drift`);
      source = source.replace(inline[0], replacement);
      fs.writeFileSync(file, source, 'utf8');
    } else if (!source.includes(replacement) || source.includes(styleOpen)) {
      throw new Error(`${moduleId} is neither the frozen inline baseline nor the migrated legacy-link form`);
    }
  }

  const assetBytes = fs.readFileSync(assetPath);
  refreshPinnedIdentities(workspaceRoot, LEGACY_MODULE_ALLOWLIST, assetBytes);
  const etpAfter = fs.readFileSync(etpPath);
  if (!etpAfter.equals(etpBefore) || sha256(etpAfter) !== ETP_BASELINE_SHA256) throw new Error('ETP changed during Phase 6C rollout');
  return { stage: 'legacy-rollout', modules: LEGACY_ROLLOUT_MODULES, deltas: Object.keys(MODULE_DELTAS), asset: LEGACY_ASSET, bytes: assetBytes.length, sha256: sha256(assetBytes) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(prepareLegacyRollout())}\n`);
}
