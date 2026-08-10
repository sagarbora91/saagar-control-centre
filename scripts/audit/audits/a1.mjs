import path from 'node:path';

import { auditResult, makeCheck, posix, sha256 } from '../lib.mjs';

const MODULE_PREFIXES = Object.freeze([
  'stock', 'service', 'qms', 'dsr', 'expense', 'grooming',
  'cro_audit', 'payroll', 'leave', 'tax', 'planning'
]);
const VENDOR_PATH = /(?:^|\/)(?:vendor|vendors|third[-_]?party|libs?)(?:\/|$)|(?:jszip|jspdf|fflate|read-excel-file|dompurify)/i;
const REMOTE_OR_EMBEDDED = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

function lineAt(text, offset) {
  return text.slice(0, Math.max(0, offset)).split(/\r?\n/).length;
}

function runtimeFiles(context) {
  return context.productFiles
    .filter(file => /^www\/.+\.(?:html?|js|mjs|css)$/i.test(file))
    .sort();
}

function htmlFiles(context) {
  return context.productFiles.filter(file => /^www\/.+\.html?$/i.test(file)).sort();
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([^"']*)\\1`, 'i'));
  return match ? match[2] : '';
}

function tagDependencies(file, html) {
  const found = [];
  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    const value = attribute(match[0], 'src');
    if (value) found.push({ file, tag: 'script', value, offset: match.index });
  }
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attribute(match[0], 'rel').toLowerCase().split(/\s+/);
    const value = attribute(match[0], 'href');
    if (value && rel.includes('stylesheet')) found.push({ file, tag: 'style', value, offset: match.index });
  }
  return found;
}

function resolveLocalAsset(sourceFile, value) {
  const clean = String(value).split('#', 1)[0].split('?', 1)[0];
  if (!clean || REMOTE_OR_EMBEDDED.test(clean) || clean.includes('\\') || /%(?:2e|2f|5c)/i.test(clean)) return null;
  const candidate = clean.startsWith('/')
    ? `www/${clean.replace(/^\/+/, '')}`
    : path.posix.normalize(path.posix.join(path.posix.dirname(sourceFile), clean));
  if (!candidate.startsWith('www/') || candidate.includes('/../')) return null;
  return posix(candidate);
}

function assetReferenceEvidence(value) {
  const reference = String(value || '');
  if (!REMOTE_OR_EMBEDDED.test(reference)) return { value: reference };
  const scheme = reference.match(/^([a-z][a-z0-9+.-]*):/i);
  return {
    valueScheme: scheme ? scheme[1].toLowerCase() : 'protocol-relative',
    valueLength: reference.length,
    valueSha256: sha256(reference)
  };
}

function collectDependencies(context) {
  const rows = [];
  for (const file of htmlFiles(context)) {
    const source = context.read(file);
    for (const item of tagDependencies(file, source)) {
      const resolved = resolveLocalAsset(file, item.value);
      let state = 'resolved';
      if (!resolved) state = REMOTE_OR_EMBEDDED.test(item.value) ? 'remote-or-embedded' : 'invalid-path';
      else if (!context.exists(resolved)) state = 'missing';
      else if (!context.files.includes(resolved)) state = 'untracked';
      rows.push({ ...item, resolved, state, line: lineAt(source, item.offset) });
    }
  }
  return rows.sort((a, b) => `${a.file}\0${a.line}\0${a.value}`.localeCompare(`${b.file}\0${b.line}\0${b.value}`));
}

function exportedGlobals(context, file) {
  const source = context.read(file);
  const names = new Set();
  for (const match of source.matchAll(/\b(?:root|window|globalThis)\s*\.\s*([A-Za-z_$][\w$]*)\s*=/g)) names.add(match[1]);
  for (const match of source.matchAll(/Object\.defineProperty\(\s*(?:root|window|globalThis)\s*,\s*(["'])([A-Za-z_$][\w$]*)\1/g)) names.add(match[2]);
  return names;
}

function declaredSharedGlobals(context, module, dependencies) {
  const assets = [...new Set(dependencies
    .filter(item => item.file === module.file && item.resolved && item.state === 'resolved' && /\.m?js$/i.test(item.resolved))
    .map(item => item.resolved))];
  const declared = new Set();
  for (const asset of assets) {
    for (const name of exportedGlobals(context, asset)) declared.add(`window.${name}`);
  }
  return declared;
}

function appGlobalDependencies(context, dependencies) {
  const rows = [];
  for (const module of context.modules) {
    const source = module.html;
    const declared = declaredSharedGlobals(context, module, dependencies);
    const localDefinitions = new Set();
    for (const match of source.matchAll(/(?:window\s*\.\s*|Object\.defineProperty\(\s*window\s*,\s*['"])(Saagar[A-Za-z0-9_$]+)/g)) {
      const tail = source.slice(match.index, match.index + match[0].length + 80);
      if (/Saagar[A-Za-z0-9_$]+\s*=/.test(tail) || /Object\.defineProperty/.test(match[0])) localDefinitions.add(match[1]);
    }

    for (const match of source.matchAll(/(?:window\s*\.\s*)?parent\s*\.\s*([A-Za-z_$][\w$]*)/g)) {
      const property = match[1];
      if (property === 'postMessage') continue;
      rows.push({
        moduleId: module.id,
        file: module.file,
        line: lineAt(source, match.index),
        dependency: `parent.${property}`,
        declared: false
      });
    }
    for (const match of source.matchAll(/(?:window\s*\.\s*)?parent\s*\[\s*(['"])([A-Za-z_$][\w$]*)\1\s*\]/g)) {
      const property = match[2];
      rows.push({ moduleId: module.id, file: module.file, line: lineAt(source, match.index),
        dependency: `parent.${property}`, declared: false });
    }
    for (const match of source.matchAll(/window\s*\.\s*(Saagar[A-Za-z0-9_$]+)/g)) {
      const property = match[1];
      if (localDefinitions.has(property)) continue;
      const dependency = `window.${property}`;
      rows.push({ moduleId: module.id, file: module.file, line: lineAt(source, match.index),
        dependency, declared: declared.has(dependency) });
    }
  }

  const unique = new Map();
  for (const row of rows) {
    const key = `${row.moduleId}\0${row.dependency}`;
    if (!unique.has(key) || row.line < unique.get(key).line) unique.set(key, row);
  }
  return [...unique.values()].sort((a, b) => `${a.moduleId}\0${a.dependency}`.localeCompare(`${b.moduleId}\0${b.dependency}`));
}

function messageInventory(context) {
  const inventory = new Map();
  const literal = /(['"])(ST_[A-Z0-9_]+|__edit_mode_available)\1/g;
  for (const file of runtimeFiles(context)) {
    const source = context.read(file);
    for (const match of source.matchAll(literal)) {
      const type = match[2];
      const before = source.slice(Math.max(0, match.index - 320), match.index);
      const after = source.slice(match.index, Math.min(source.length, match.index + 320));
      let kind = 'reference';
      if (/postMessage\s*\([^)]*$/s.test(before) || /\btype\s*:\s*$/.test(before.slice(-40))) kind = 'send';
      if (/(?:data|message|payload)\s*(?:\.|\[)[\s\S]{0,100}(?:type|ST_)/i.test(before) ||
          /(?:===|==|case)\s*$/.test(before.slice(-24)) || /\b(?:data|message|payload)\.type\b/.test(after)) kind = 'receive';
      if (!inventory.has(type)) inventory.set(type, { type, sendFiles: new Set(), receiveFiles: new Set(), referenceFiles: new Set() });
      inventory.get(type)[`${kind}Files`].add(file);
    }
  }
  return [...inventory.values()].map(item => ({
    type: item.type,
    sendFiles: [...item.sendFiles].sort(),
    receiveFiles: [...item.receiveFiles].sort(),
    referenceFiles: [...item.referenceFiles].sort()
  })).sort((a, b) => a.type.localeCompare(b.type));
}

function crossModuleReferences(context) {
  const results = [];
  const prefixExpression = MODULE_PREFIXES.map(value => value.replace('_', '[_-]?')).join('|');
  const storagePattern = new RegExp(`(['"])(saagar_(${prefixExpression})[A-Za-z0-9_.:-]*)\\1`, 'gi');
  const modulePathPattern = /(?:^|[^A-Za-z0-9_])(?:\.\.\/|\.\/|\/)?modules\/([a-z][a-z0-9_]*)\//gi;
  const parentPattern = /(?:window\s*\.\s*)?parent\s*\.\s*([A-Za-z_$][\w$]*)/g;
  for (const module of context.modules) {
    const source = module.html;
    for (const match of source.matchAll(modulePathPattern)) {
      const target = match[1].toLowerCase();
      if (MODULE_PREFIXES.includes(target) && target !== module.id) {
        results.push({ source: module.id, target, kind: 'module-path', file: module.file, line: lineAt(source, match.index) });
      }
    }
    for (const match of source.matchAll(storagePattern)) {
      const target = match[3].toLowerCase().replace('-', '_');
      if (MODULE_PREFIXES.includes(target) && target !== module.id) {
        results.push({ source: module.id, target, kind: 'persistent-key', file: module.file, line: lineAt(source, match.index) });
      }
    }
    for (const match of source.matchAll(parentPattern)) {
      const property = match[1].toLowerCase();
      const target = MODULE_PREFIXES.find(id => property.startsWith(id.replace('_', '')) || property.startsWith(id));
      if (target && target !== module.id) {
        results.push({ source: module.id, target, kind: 'parent-api', file: module.file, line: lineAt(source, match.index) });
      }
    }
  }
  const unique = new Map();
  for (const item of results) {
    const key = `${item.source}\0${item.target}\0${item.kind}\0${item.file}`;
    if (!unique.has(key) || item.line < unique.get(key).line) unique.set(key, item);
  }
  return [...unique.values()].sort((a, b) => `${a.source}\0${a.target}\0${a.kind}`.localeCompare(`${b.source}\0${b.target}\0${b.kind}`));
}

function testCorpus(context) {
  return context.files.filter(file => /^tests\/.+\.(?:mjs|js|json)$/i.test(file)).sort()
    .map(file => context.read(file).toLowerCase().replaceAll('\\', '/')).join('\n');
}

function assetFanout(context, dependencies) {
  const byAsset = new Map();
  const moduleFiles = new Set(context.modules.map(module => module.file));
  for (const item of dependencies) {
    if (!item.resolved || item.state !== 'resolved' || !moduleFiles.has(item.file)) continue;
    if (!byAsset.has(item.resolved)) byAsset.set(item.resolved, new Set());
    byAsset.get(item.resolved).add(item.file);
  }
  const tests = testCorpus(context);
  return [...byAsset.entries()].map(([asset, consumers]) => {
    const basename = path.posix.basename(asset).toLowerCase();
    const normalized = asset.toLowerCase();
    const vendor = VENDOR_PATH.test(asset);
    const referencedByTest = tests.includes(normalized) || tests.includes(normalized.replace(/^www\//, '')) || tests.includes(basename);
    return { asset, moduleCount: consumers.size, modules: [...consumers].sort(), vendor, referencedByTest };
  }).sort((a, b) => a.asset.localeCompare(b.asset));
}

function manifestParity(context) {
  const expectedModules = context.modules.map(module => module.file).sort();
  const actualModules = context.files.filter(file => /^www\/modules\/[^/]+\/index\.html$/i.test(file)).sort();
  const findings = [];
  for (const file of expectedModules.filter(file => !actualModules.includes(file))) findings.push({ path: file, code: 'MANIFEST_MODULE_MISSING' });
  for (const file of actualModules.filter(file => !expectedModules.includes(file))) findings.push({ path: file, code: 'FILESYSTEM_MODULE_UNDECLARED' });

  const identities = [
    ...context.modules.map(module => ({ kind: 'module', id: module.id, file: module.file, bytes: module.bytes, sha256: module.sha256 })),
    ...context.sharedAssets.map(asset => ({ kind: 'shared-asset', id: asset.id, file: `www/${posix(asset.file)}`, bytes: asset.bytes, sha256: asset.sha256 }))
  ];
  for (const item of identities) {
    if (!context.exists(item.file)) {
      findings.push({ path: item.file, code: 'MANIFEST_FILE_MISSING', identity: item.id });
      continue;
    }
    const bytes = Buffer.from(context.read(item.file), 'utf8');
    if (bytes.length !== item.bytes) findings.push({ path: item.file, code: 'MANIFEST_BYTES_MISMATCH', identity: item.id,
      expected: item.bytes, actual: bytes.length });
    const actualHash = sha256(bytes);
    if (actualHash !== item.sha256) findings.push({ path: item.file, code: 'MANIFEST_HASH_MISMATCH', identity: item.id,
      expectedSha256: item.sha256, actualSha256: actualHash });
  }
  return { expectedModules, actualModules, identities, findings };
}

export async function run(context) {
  const parity = manifestParity(context);
  const dependencies = collectDependencies(context);
  const dependencyFailures = dependencies.filter(item => item.state !== 'resolved');
  const globals = appGlobalDependencies(context, dependencies);
  const undeclared = globals.filter(item => !item.declared);
  const messages = messageInventory(context);
  const cross = crossModuleReferences(context);
  const fanout = assetFanout(context, dependencies);
  const untestedFanout = fanout.filter(item => !item.vendor && item.moduleCount >= 3 && !item.referencedByTest);

  const matrix = context.modules.map(module => ({
    moduleId: module.id,
    parentOrGlobalDependencies: globals.filter(item => item.moduleId === module.id).map(item => item.dependency).sort(),
    messageTypes: messages.filter(item => [...item.sendFiles, ...item.receiveFiles, ...item.referenceFiles].includes(module.file)).map(item => item.type).sort(),
    directBusinessTargets: [...new Set(cross.filter(item => item.source === module.id).map(item => item.target))].sort(),
    localAssets: dependencies.filter(item => item.file === module.file && item.resolved).map(item => item.resolved).sort()
  }));

  const checks = [
    makeCheck({
      id: 'A1-01', title: 'Manifest/filesystem module parity',
      result: parity.findings.length ? 'fail' : 'pass', severity: 'P0', mandatory: true,
      metric: { manifestModules: parity.expectedModules.length, filesystemModules: parity.actualModules.length,
        manifestSharedAssets: context.sharedAssets.length, mismatches: parity.findings.length },
      rule: 'Every module and shared asset must exist at its manifest path with the exact declared byte count and SHA-256.',
      evidence: parity.findings,
      notes: 'The check covers the canonical module entry files and both manifest-bound shared runtime assets.'
    }),
    makeCheck({
      id: 'A1-02', title: 'Parent/global dependency census',
      result: undeclared.length ? 'fail' : 'pass', severity: 'P1', mandatory: true,
      metric: { dependencies: globals.length, declaredDependencies: globals.length - undeclared.length,
        undeclaredDependencies: undeclared.length,
        census: globals.slice(0, 500).map(({ moduleId, dependency, declared }) => ({ moduleId, dependency, declared })) },
      rule: 'Every application-owned parent/global dependency used by a business module must be declared by its manifest-bound runtime contract.',
      evidence: undeclared.map(item => ({ path: item.file, line: item.line, code: 'UNDECLARED_PARENT_GLOBAL',
        moduleId: item.moduleId, dependency: item.dependency })),
      notes: globals.length > 500 ? 'The bounded census contains its first 500 deterministic entries.' : ''
    }),
    makeCheck({
      id: 'A1-03', title: 'Complete message inventory', result: 'pass', severity: 'INFO', mandatory: false,
      metric: { messageTypes: messages.length, inventory: messages.slice(0, 250) },
      rule: 'All statically declared ST_* and legacy edit-mode message literals in shipped web runtime sources are inventoried.',
      evidence: messages.map(item => ({ code: 'MESSAGE_TYPE', type: item.type,
        sendFileCount: item.sendFiles.length, receiveFileCount: item.receiveFiles.length,
        referenceFileCount: item.referenceFiles.length })),
      notes: 'Dynamic payload values are reported by protocol checks; this check inventories every literal message identity visible to deterministic static analysis.'
    }),
    makeCheck({
      id: 'A1-04', title: 'Local script/style dependency resolution',
      result: dependencyFailures.length ? 'fail' : 'pass', severity: 'P0', mandatory: true,
      metric: { dependencies: dependencies.length, resolved: dependencies.length - dependencyFailures.length,
        unresolvedOrRemote: dependencyFailures.length },
      rule: 'Every shipped script and stylesheet tag dependency must resolve to a tracked local file; remote or embedded dependencies are forbidden.',
      evidence: dependencyFailures.map(item => ({ path: item.file, line: item.line, code: `ASSET_${item.state.toUpperCase().replaceAll('-', '_')}`,
        tag: item.tag, ...assetReferenceEvidence(item.value), resolved: item.resolved || undefined }))
    }),
    makeCheck({
      id: 'A1-05', title: 'Direct business-module references',
      result: cross.length ? 'fail' : 'pass', severity: 'P1', mandatory: true,
      metric: { directReferences: cross.length, sourceModules: new Set(cross.map(item => item.source)).size,
        targetModules: new Set(cross.map(item => item.target)).size },
      rule: 'Business modules must communicate through declared shell/shared contracts rather than another business module path, parent API, or persistence namespace.',
      evidence: cross.map(item => ({ path: item.file, line: item.line, code: 'DIRECT_BUSINESS_MODULE_REFERENCE',
        sourceModule: item.source, targetModule: item.target, kind: item.kind }))
    }),
    makeCheck({
      id: 'A1-06', title: 'Shell/module coupling matrix', result: 'pass', severity: 'INFO', mandatory: false,
      metric: { moduleCount: matrix.length, matrix, matrixSha256: sha256(JSON.stringify(matrix)) },
      rule: 'Produce a deterministic per-module matrix of parent/global dependencies, message identities, direct business targets and local assets.',
      notes: 'This is a measurement check; its individual risks are decided by A1-02, A1-04, A1-05 and A1-07.'
    }),
    makeCheck({
      id: 'A1-07', title: 'Shared application asset fan-out',
      result: untestedFanout.length ? 'fail' : 'pass', severity: 'P1', mandatory: true,
      metric: { sharedAssets: fanout.length, applicationAssetsAtLeastThreeModules: fanout.filter(item => !item.vendor && item.moduleCount >= 3).length,
        vendorAssetsAtLeastThreeModules: fanout.filter(item => item.vendor && item.moduleCount >= 3).length,
        untestedApplicationAssets: untestedFanout.length,
        fanout: fanout.slice(0, 250) },
      rule: 'An application-owned shared asset consumed by at least three modules must be referenced by a test path or basename; vendor fan-out is informational.',
      evidence: untestedFanout.map(item => ({ path: item.asset, code: 'UNTESTED_SHARED_ASSET_FANOUT',
        moduleCount: item.moduleCount, modules: item.modules }))
    })
  ];

  return auditResult('A1', 'Architecture and coupling', checks, {
    moduleCount: context.modules.length,
    dependencyCount: dependencies.length,
    couplingMatrixSha256: sha256(JSON.stringify(matrix))
  });
}
