import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  LEGACY_ASSET,
  LEGACY_MODULE_ALLOWLIST,
  MODULE_BASELINE_SHA256,
  restoreMigratedLegacySource
} from '../../scripts/prepare-phase6c-mobile-legacy-css.mjs';
import { readModuleManifestSource, renderModuleManifestSource } from '../../scripts/lib/module-manifest-source.mjs';
import crypto from 'node:crypto';
import { restorePhase6dStockSource } from './phase6e-stock-source.mjs';
import { restorePhase6eEtpGatewaySource, restorePhase6eEtpPresentationSource } from './phase6f-family-a-source.mjs';
import { restorePhase6eFamilyASource } from './phase6f-family-a-source.mjs';
import { restorePrePhase6gFamilyBSource } from './phase6g-family-b-source.mjs';
import { restorePrePhase6gShellAssets } from './phase6g-shell-source.mjs';

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const ETP_SHA256 = 'b2973563b988779468471950bb777c6323580e90ac6011c9038581845b9cfa12';
const PRE_PHASE6D_BRAND_TOKENS = `:root{
  --navy:#0d2340; --navy-mid:#1a3a5c; --navy-light:#264d7a;
  --gold:#b8922a; --gold-light:#d4a843; --gold-pale:#fdf6e3;
  --cream:#faf8f3; --paper:#ffffff;
  --red:#b91c1c; --red-pale:#fef2f2; --amber:#b45309; --amber-pale:#fffbeb;
  --green:#166534; --green-pale:#f0fdf4; --blue:#1d4ed8; --blue-pale:#eff6ff;
  --gray-50:#fafafa; --gray-100:#f4f4f5; --gray-200:#e4e4e7; --gray-300:#d4d4d8;
  --gray-400:#a1a1aa; --gray-500:#71717a; --gray-600:#52525b; --gray-700:#3f3f46; --gray-800:#27272a;
  --radius:12px; --radius-lg:16px;
  --font-sans:'DM Sans',system-ui,'Segoe UI',Roboto,Arial,sans-serif;
  --font-serif:'DM Serif Display',Georgia,'Times New Roman',serif;
}
`;

export function reconstructPhase6cBoundaryWww(workspaceRoot) {
  const phase6gShellPath = path.join(workspaceRoot, 'www/index.html');
  const phase6gShellManifestPath = path.join(workspaceRoot, 'www/shell-asset-manifest.js');
  const phase6gShell = restorePrePhase6gShellAssets({
    index: fs.readFileSync(phase6gShellPath, 'utf8'),
    manifest: fs.readFileSync(phase6gShellManifestPath, 'utf8')
  });
  fs.writeFileSync(phase6gShellPath, phase6gShell.index, 'utf8');
  fs.writeFileSync(phase6gShellManifestPath, phase6gShell.manifest, 'utf8');
  fs.rmSync(path.join(workspaceRoot, 'www/shell-responsive.css'));
  fs.rmSync(path.join(workspaceRoot, 'www/shared/shell-responsive-runtime.js'));
  for (const moduleId of ['expense', 'leave', 'cro_audit', 'tax', 'dsr', 'qms']) {
    const modulePath = path.join(workspaceRoot, `www/modules/${moduleId}/index.html`);
    const cssName = `${moduleId.replace('_', '-')}-ui.css`;
    const cssPath = path.join(workspaceRoot, `www/modules/${moduleId}/${cssName}`);
    fs.writeFileSync(modulePath, restorePrePhase6gFamilyBSource(
      moduleId, fs.readFileSync(modulePath, 'utf8'), fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : ''
    ), 'utf8');
    if (fs.existsSync(cssPath)) fs.rmSync(cssPath);
  }
  fs.rmSync(path.join(workspaceRoot, 'www/modules/qms/qms-view.js'));
  for (const moduleId of ['payroll', 'grooming', 'service']) {
    const modulePath = path.join(workspaceRoot, `www/modules/${moduleId}/index.html`);
    const cssPath = path.join(workspaceRoot, `www/modules/${moduleId}/${moduleId}-ui.css`);
    fs.writeFileSync(modulePath, restorePhase6eFamilyASource(
      moduleId, fs.readFileSync(modulePath, 'utf8'), fs.readFileSync(cssPath, 'utf8')
    ), 'utf8');
    fs.rmSync(cssPath);
  }
  const stockPath = path.join(workspaceRoot, 'www/modules/stock/index.html');
  const stockCssPath = path.join(workspaceRoot, 'www/modules/stock/stock-ui.css');
  fs.writeFileSync(stockPath, restorePhase6dStockSource(
    fs.readFileSync(stockPath, 'utf8'), fs.readFileSync(stockCssPath, 'utf8')
  ), 'utf8');
  fs.rmSync(stockCssPath);
  const shellPath = path.join(workspaceRoot, 'www/index.html');
  fs.writeFileSync(shellPath, fs.readFileSync(shellPath, 'utf8')
    .replace('content="width=device-width, initial-scale=1.0, viewport-fit=cover"', 'content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no"'), 'utf8');
  const dsrPath = path.join(workspaceRoot, 'www/modules/dsr/index.html');
  fs.writeFileSync(dsrPath, fs.readFileSync(dsrPath, 'utf8')
    .replace('content="width=device-width, initial-scale=1.0"', 'content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"'), 'utf8');
  const manifestPath = path.join(workspaceRoot, 'www/module-manifest.js');
  let manifestSource = fs.readFileSync(manifestPath, 'utf8')
    .replace("input.sharedAssets.length !== 27", "input.sharedAssets.length !== 25")
    .replace("sharedAssets must contain exactly twenty-seven entries", "sharedAssets must contain exactly twenty-five entries")
    .replace("input.sharedAssets.length !== 25", "input.sharedAssets.length !== 20")
    .replace("sharedAssets must contain exactly twenty-five entries", "sharedAssets must contain exactly twenty entries")
    .replace("input.sharedAssets.length !== 20", "input.sharedAssets.length !== 11")
    .replace("sharedAssets must contain exactly twenty entries", "sharedAssets must contain exactly eleven entries");
  for (const entry of [
    "      ,{ id: 'module-rendered-components', file: 'shared/module-rendered-components.js' }\n",
    "      ,{ id: 'leave-ui-css', file: 'modules/leave/leave-ui.css' }\n",
    "      ,{ id: 'cro-audit-ui-css', file: 'modules/cro_audit/cro-audit-ui.css' }\n",
    "      ,{ id: 'tax-ui-css', file: 'modules/tax/tax-ui.css' }\n",
    "      ,{ id: 'dsr-ui-css', file: 'modules/dsr/dsr-ui.css' }\n",
    "      ,{ id: 'qms-view', file: 'modules/qms/qms-view.js' }\n",
    "      ,{ id: 'qms-ui-css', file: 'modules/qms/qms-ui.css' }\n",
    "      ,{ id: 'module-responsive-css', file: 'shared/module-responsive.css' }\n",
    "      ,{ id: 'module-ui-runtime', file: 'shared/module-ui-runtime.js' }\n",
    "      ,{ id: 'module-table-css', file: 'shared/module-table.css' }\n",
    "      ,{ id: 'module-table-runtime', file: 'shared/module-table-runtime.js' }\n",
    "      ,{ id: 'module-components-css', file: 'shared/module-components.css' }\n"
    ,"      ,{ id: 'stock-ui-css', file: 'modules/stock/stock-ui.css' }\n"
    ,"      ,{ id: 'payroll-ui-css', file: 'modules/payroll/payroll-ui.css' }\n"
    ,"      ,{ id: 'grooming-ui-css', file: 'modules/grooming/grooming-ui.css' }\n"
    ,"      ,{ id: 'service-ui-css', file: 'modules/service/service-ui.css' }\n"
  ]) manifestSource = manifestSource.replace(entry, '');
  fs.writeFileSync(manifestPath, manifestSource, 'utf8');
  fs.writeFileSync(path.join(workspaceRoot, 'www/shared/module-brand-tokens.css'), PRE_PHASE6D_BRAND_TOKENS, 'utf8');
  fs.rmSync(path.join(workspaceRoot, 'www/shared/module-responsive.css'));
  fs.rmSync(path.join(workspaceRoot, 'www/shared/module-ui-runtime.js'));
  fs.rmSync(path.join(workspaceRoot, 'www/shared/module-table.css'));
  fs.rmSync(path.join(workspaceRoot, 'www/shared/module-table-runtime.js'));
  fs.rmSync(path.join(workspaceRoot, 'www/shared/module-components.css'));
  fs.rmSync(path.join(workspaceRoot, 'www/shared/module-rendered-components.js'));
  const snapshot = readModuleManifestSource(workspaceRoot);
  snapshot.data.sharedAssets = snapshot.data.sharedAssets.filter(item => ![
    'module-rendered-components', 'leave-ui-css', 'cro-audit-ui-css', 'tax-ui-css', 'dsr-ui-css', 'qms-view', 'qms-ui-css',
    'module-responsive-css', 'module-ui-runtime', 'module-table-css', 'module-table-runtime', 'module-components-css',
    'stock-ui-css', 'payroll-ui-css', 'grooming-ui-css', 'service-ui-css'
  ].includes(item.id));
  for (const moduleId of ['expense', 'leave', 'cro_audit', 'tax', 'dsr', 'qms']) {
    const module = snapshot.data.modules.find(item => item.id === moduleId);
    const bytes = fs.readFileSync(path.join(workspaceRoot, 'www', module.file));
    module.bytes = bytes.length;
    module.sha256 = sha256(bytes);
  }
  const brandTokens = snapshot.data.sharedAssets.find(item => item.id === 'module-brand-tokens-css');
  const brandBytes = fs.readFileSync(path.join(workspaceRoot, 'www', brandTokens.file));
  brandTokens.bytes = brandBytes.length;
  brandTokens.sha256 = sha256(brandBytes);
  const dsrModule = snapshot.data.modules.find(item => item.id === 'dsr');
  const dsrBytes = fs.readFileSync(dsrPath);
  dsrModule.bytes = dsrBytes.length;
  dsrModule.sha256 = sha256(dsrBytes);
  const stockModule = snapshot.data.modules.find(item => item.id === 'stock');
  const stockBytes = fs.readFileSync(stockPath);
  stockModule.bytes = stockBytes.length;
  stockModule.sha256 = sha256(stockBytes);
  for (const moduleId of ['payroll', 'grooming', 'service']) {
    const module = snapshot.data.modules.find(item => item.id === moduleId);
    const bytes = fs.readFileSync(path.join(workspaceRoot, 'www', module.file));
    module.bytes = bytes.length;
    module.sha256 = sha256(bytes);
  }
  fs.writeFileSync(manifestPath, renderModuleManifestSource(snapshot, snapshot.data), 'utf8');
  return workspaceRoot;
}

export function reconstructPrePhase6cWww(workspaceRoot) {
  reconstructPhase6cBoundaryWww(workspaceRoot);
  const gatewayPath = path.join(workspaceRoot, 'www/etp-module-gateway.js');
  fs.writeFileSync(gatewayPath, restorePhase6eEtpGatewaySource(fs.readFileSync(gatewayPath, 'utf8')), 'utf8');
  const presentationPath = path.join(workspaceRoot, 'www/etp-verified-presentation.js');
  fs.writeFileSync(presentationPath, restorePhase6eEtpPresentationSource(fs.readFileSync(presentationPath, 'utf8')), 'utf8');
  const etpPath = path.join(workspaceRoot, 'www/modules/etp/index.html');
  const etpBefore = fs.readFileSync(etpPath);
  if (sha256(etpBefore) !== ETP_SHA256 || etpBefore.includes(Buffer.from('module-mobile-legacy.css'))) {
    throw new Error('ETP is not the frozen unlinked Phase 6C exclusion authority');
  }
  const authorityPath = path.join(workspaceRoot, 'www', LEGACY_ASSET);
  const authority = fs.readFileSync(authorityPath, 'utf8');
  for (const moduleId of LEGACY_MODULE_ALLOWLIST) {
    const file = path.join(workspaceRoot, 'www/modules', moduleId, 'index.html');
    const restored = restoreMigratedLegacySource(moduleId, fs.readFileSync(file, 'utf8'), authority);
    fs.writeFileSync(file, restored, 'utf8');
    if (sha256(Buffer.from(restored)) !== MODULE_BASELINE_SHA256[moduleId]) {
      throw new Error(`${moduleId} did not reconstruct to its pre-Phase6C authority`);
    }
  }
  fs.rmSync(authorityPath);

  const manifestPath = path.join(workspaceRoot, 'www/module-manifest.js');
  let manifestSource = fs.readFileSync(manifestPath, 'utf8')
    .replace("input.sharedAssets.length !== 11", "input.sharedAssets.length !== 10")
    .replace("sharedAssets must contain exactly eleven entries", "sharedAssets must contain exactly ten entries")
    .replace("      ,{ id: 'module-mobile-legacy-css', file: 'shared/module-mobile-legacy.css' }\n", '');
  fs.writeFileSync(manifestPath, manifestSource, 'utf8');
  const snapshot = readModuleManifestSource(workspaceRoot);
  snapshot.data.sharedAssets = snapshot.data.sharedAssets.filter(item => item.id !== 'module-mobile-legacy-css');
  const presentationAsset = snapshot.data.sharedAssets.find(item => item.id === 'etp-verified-presentation');
  const presentationBytes = fs.readFileSync(presentationPath);
  presentationAsset.bytes = presentationBytes.length;
  presentationAsset.sha256 = sha256(presentationBytes);
  for (const module of snapshot.data.modules) {
    if (!LEGACY_MODULE_ALLOWLIST.includes(module.id)) continue;
    const bytes = fs.readFileSync(path.join(workspaceRoot, 'www', module.file));
    module.bytes = bytes.length;
    module.sha256 = sha256(bytes);
  }
  fs.writeFileSync(manifestPath, renderModuleManifestSource(snapshot, snapshot.data), 'utf8');
  const etpAfter = fs.readFileSync(etpPath);
  if (!etpAfter.equals(etpBefore) || sha256(etpAfter) !== ETP_SHA256 || etpAfter.includes(Buffer.from('module-mobile-legacy.css'))) {
    throw new Error('ETP changed while reconstructing pre-Phase6C authority');
  }
  return workspaceRoot;
}

export function createPrePhase6cWorkspace(sourceRoot) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-pre-phase6c-'));
  for (const entry of ['www', 'scripts', 'tests', 'verification']) {
    fs.cpSync(path.join(sourceRoot, entry), path.join(target, entry), { recursive: true });
  }
  for (const file of ['package.json']) fs.copyFileSync(path.join(sourceRoot, file), path.join(target, file));
  reconstructPrePhase6cWww(target);
  return target;
}

export function createPhase6cBoundaryWorkspace(sourceRoot) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-phase6c-boundary-'));
  for (const entry of ['www', 'scripts', 'tests', 'verification']) {
    fs.cpSync(path.join(sourceRoot, entry), path.join(target, entry), { recursive: true });
  }
  for (const file of ['package.json']) fs.copyFileSync(path.join(sourceRoot, file), path.join(target, file));
  reconstructPhase6cBoundaryWww(target);
  return target;
}
