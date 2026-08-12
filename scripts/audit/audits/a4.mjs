import { auditResult, compareText, lineNumber, makeCheck, sha256, stableSha256 } from '../lib.mjs';

const CLASSIFICATIONS = new Set(['portable', 'device-local', 're-derivable-excluded', 'forbidden']);
const MAX_ARTIFACTS = 2500;
const STORAGE_METHODS = Object.freeze(['getItem', 'setItem', 'removeItem', 'clear', 'key']);

function runtimeFiles(context) {
  return context.productFiles.filter(file => /^(?:www|build-overrides\/native)\//.test(file))
    .filter(file => /\.(?:html?|js|mjs|java)$/i.test(file))
    .filter(file => !/\.(?:min|bundle)\.js$/i.test(file));
}

function constants(source) {
  const result = new Map();
  for (const match of source.matchAll(/\b(?:const|let|var|static\s+final\s+String|private\s+static\s+final\s+String)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'])([^"'\r\n]{0,240})\2/g)) {
    result.set(match[1], match[3]);
  }
  return result;
}

function stringTokens(source, symbols) {
  const values = [];
  for (const match of source.matchAll(/(["'])([^"'\r\n]{1,240})\1|\b([A-Za-z_$][\w$]*)\b/g)) {
    if (match[2] !== undefined) values.push(match[2]);
    else if (symbols.has(match[3])) values.push(symbols.get(match[3]));
  }
  return [...new Set(values)].sort();
}

function matchingBrace(source, open) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}' && --depth === 0) return i;
  }
  return -1;
}

function functionBody(source, name) {
  const match = new RegExp(`\\bfunction\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(source);
  if (!match) return '';
  const open = source.indexOf('{', match.index);
  const close = matchingBrace(source, open);
  return close > open ? source.slice(open + 1, close) : '';
}

function storagePolicy(index) {
  const symbols = constants(index);
  const appControlBody = functionBody(index, 'appControlKeys');
  const appArray = /return\s*\[([\s\S]*?)\]/.exec(appControlBody)?.[1] || '';
  const portableExact = new Set(stringTokens(appArray, symbols));
  portableExact.add('saagar_etp_scope_registry');
  portableExact.add('saagar_etp_control_registry_v1');

  const moduleExact = new Map();
  const modulePrefixes = new Map();
  const rulesAt = index.indexOf('const STORAGE_RULES');
  if (rulesAt >= 0) {
    const open = index.indexOf('{', rulesAt);
    const close = matchingBrace(index, open);
    const block = close > open ? index.slice(open + 1, close) : '';
    for (const match of block.matchAll(/\b([a-z][a-z0-9_]*)\s*:\s*\{\s*exact\s*:\s*\[([^\]]*)\]\s*,\s*prefix\s*:\s*\[([^\]]*)\]/g)) {
      const exact = stringTokens(match[2], symbols);
      const prefixes = stringTokens(match[3], symbols);
      moduleExact.set(match[1], exact);
      modulePrefixes.set(match[1], prefixes);
      exact.forEach(value => portableExact.add(value));
    }
  }
  const portablePrefixes = [...modulePrefixes.values()].flat();
  const rollbackPrefix = symbols.get('RESTORE_ROLLBACK_PREFIX') || 'st_v4_restore_rollback_';
  portablePrefixes.push(rollbackPrefix);

  const blockedBody = functionBody(index, 'restoreBlockedKeys');
  const blockedArray = /return\s*\[([\s\S]*?)\]/.exec(blockedBody)?.[1] || '';
  const restoreBlocked = new Set(stringTokens(blockedArray, symbols));
  /* Entries may be a CONSTANT NAME declared in the shell (resolved through
     `symbols`) or a raw key literal, because many device-local keys are written
     as literals at their use site and have no constant to resolve. */
  const deviceNames = [
    'ADMIN_PIN_KEY', 'ADMIN_MODE_KEY', 'OFFDEVICE_BACKUP_KEY', 'EXPORT_REGISTER_KEY',
    'RESTORE_DRILL_KEY', 'RESTORE_ACCEPTANCE_KEY', 'LAST_MODULE_RESET_KEY', 'PRODUCTION_DEVICE_KEY',
    'HIGHEST_BUILD_KEY', 'PIN_ATTEMPTS_KEY', 'CURRENT_ROLE_KEY', 'CURRENT_STORE_KEY',
    'ROLE_ACCESS_KEY', 'STAFF_PIN_KEY', 'UI_MODE_KEY',
    /* TEXT_SIZE_KEY is deliberately NOT device-local. Wave-13 P1-39 exports and
       restores saagar_text_size through appControlKeys(), re-validating it in
       getTextSize(). Declaring it device-local while the restore policy allows
       it was the single A4-03 contradiction. */

    /* Device-local secret. Must never enter a portable backup. */
    'st_v2_pin_salt',
    /* Device state markers: meaningless on another device and re-established
       locally, so exporting them would resurrect stale state on restore. */
    'bcc_docs_purged_v1', 'saagar_demo_seeded', 'saagar_native_store_migrated_v1',
    'saagar_gate_status', 'saagar_role_switch_lock_v1', 'saagar_acting_as',
    /* Device-local operational logs and last-run markers. */
    'bcc_autobackup_last', 'bcc_autobackup_log', 'bcc_autobackup_plaintext_warning',
    'saagar_sqlite_log', 'saagar_rpt_log', 'saagar_rpt_recent', 'saagar_exceptions',
    /* Per-device UI/session preferences. */
    'st_v2_admin_idle_min', 'saagar_selected_date', 'ui_day_closed', 'ui_hide_amounts'
  ];
  const explicitDeviceLocal = new Set(deviceNames.map(name => symbols.get(name) || name).filter(Boolean));
  const evidenceKeys = new Set([
    'OFFDEVICE_BACKUP_KEY', 'EXPORT_REGISTER_KEY', 'RESTORE_DRILL_KEY', 'RESTORE_ACCEPTANCE_KEY',
    'LAST_MODULE_RESET_KEY', 'PRODUCTION_DEVICE_KEY', 'HIGHEST_BUILD_KEY'
  ].map(name => symbols.get(name)).filter(Boolean));

  function whitelisted(name) {
    return portableExact.has(name) || portablePrefixes.some(prefix => name.startsWith(prefix));
  }
  function moduleOwner(name) {
    for (const [module, exact] of moduleExact) if (exact.includes(name)) return module;
    for (const [module, prefixes] of modulePrefixes) if (prefixes.some(prefix => name.startsWith(prefix))) return module;
    return 'shell';
  }
  return { symbols, portableExact, portablePrefixes, restoreBlocked, explicitDeviceLocal, evidenceKeys, whitelisted, moduleOwner };
}

function resolveArgument(raw, symbols) {
  const value = String(raw || '').trim();
  let match = /^(["'])([^"'\r\n]{1,240})\1$/.exec(value);
  if (match) return { name: match[2], pattern: false };
  match = /^`([^`]*)\$\{/.exec(value);
  if (match && match[1]) return { name: `${match[1]}*`, pattern: true };
  match = /^([A-Za-z_$][\w$]*)$/.exec(value);
  if (match && symbols.has(match[1])) return { name: symbols.get(match[1]), pattern: false };
  match = /^([A-Za-z_$][\w$]*)\s*\+/.exec(value);
  if (match && symbols.has(match[1])) return { name: `${symbols.get(match[1])}*`, pattern: true };
  match = /^(["'])([^"'\r\n]{1,200})\1\s*\+/.exec(value);
  if (match) return { name: `${match[2]}*`, pattern: true };
  return { name: `computed-${sha256(value).slice(0, 12)}`, pattern: true, unresolved: true };
}

function addArtifact(map, artifact) {
  const id = `${artifact.kind}:${artifact.name}`;
  let current = map.get(id);
  if (!current) {
    current = { id, kind: artifact.kind, name: artifact.name, pattern: Boolean(artifact.pattern), unresolved: Boolean(artifact.unresolved),
      operations: new Set(), locations: [], sourceClass: artifact.sourceClass || '' };
    map.set(id, current);
  }
  if (artifact.operation) current.operations.add(artifact.operation);
  if (artifact.path && artifact.line) current.locations.push({ path: artifact.path, line: artifact.line });
  current.unresolved ||= Boolean(artifact.unresolved);
}

function canonicalStorageSource(source) {
  return String(source || '')
    .replace(/\b(?:window|root|globalThis)\s*\.\s*localStorage\b/g, 'localStorage')
    .replace(/\b(?:window|root|globalThis)\s*\[\s*(['"])localStorage\1\s*\]/g, 'localStorage');
}

function storageAliases(source) {
  const aliases = new Set(['localStorage']);
  let changed = true;
  while (changed) {
    changed = false;
    for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*(?:;|\r?$)/gm)) {
      if (aliases.has(match[2]) && !aliases.has(match[1])) { aliases.add(match[1]); changed = true; }
    }
  }
  return aliases;
}

function methodAliases(source, objectAliases) {
  const methods = new Map();
  for (const objectAlias of objectAliases) {
    const object = objectAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const direct = new RegExp(`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${object}\\s*(?:\\.\\s*(${STORAGE_METHODS.join('|')})|\\[\\s*(['"])(?:${STORAGE_METHODS.join('|')})\\2\\s*\\])(?:\\s*\\.\\s*bind\\s*\\([^)]*\\))?`, 'g');
    for (const match of source.matchAll(direct)) {
      const expression = match[0];
      const method = match[2] || new RegExp(`['"](${STORAGE_METHODS.join('|')})['"]`).exec(expression)?.[1];
      if (method) methods.set(match[1], method);
    }
    const destructured = new RegExp(`\\b(?:const|let|var)\\s*\\{([^}]{1,500})\\}\\s*=\\s*${object}\\b`, 'g');
    for (const match of source.matchAll(destructured)) for (const part of match[1].split(',')) {
      const binding = /^\s*([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?\s*$/.exec(part);
      if (binding && STORAGE_METHODS.includes(binding[1])) methods.set(binding[2] || binding[1], binding[1]);
    }
  }
  return methods;
}

function localStorageArtifacts(context, files, map) {
  const blindSpots = [];
  const record = (file, source, match, operation, raw, symbols) => {
    const resolved = resolveArgument(raw, symbols);
    if (resolved.name === '__st_ping__') return;
    addArtifact(map, { kind: 'local-storage', ...resolved, operation, path: file,
      line: lineNumber(source, match.index) });
  };
  for (const file of files.filter(value => value.startsWith('www/'))) {
    const original = context.read(file);
    const source = canonicalStorageSource(original);
    const symbols = constants(original);
    const objects = storageAliases(source);
    const methods = methodAliases(source, objects);
    for (const objectAlias of objects) {
      const object = objectAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const dot = new RegExp(`\\b${object}\\s*\\.\\s*(getItem|setItem|removeItem)\\s*\\(\\s*([^,\\)\\r\\n]{1,240})`, 'g');
      for (const match of source.matchAll(dot)) record(file, original, match, match[1], match[2], symbols);
      const bracket = new RegExp(`\\b${object}\\s*\\[\\s*(['"])(getItem|setItem|removeItem)\\1\\s*\\]\\s*\\(\\s*([^,\\)\\r\\n]{1,240})`, 'g');
      for (const match of source.matchAll(bracket)) record(file, original, match, match[2], match[3], symbols);
      const scope = new RegExp(`\\b${object}\\s*(?:\\.\\s*(clear|key)|\\[\\s*(['"])(clear|key)\\2\\s*\\])\\s*\\(`, 'g');
      for (const match of source.matchAll(scope)) {
        const method = match[1] || match[3];
        record(file, original, match, method, `dynamic-${method}-${sha256(`${file}:${match.index}`).slice(0, 12)}`,
          symbols, 'STORAGE_SCOPE_OPERATION_UNRESOLVED');
      }
      const dynamicMember = new RegExp(`\\b${object}\\s*\\[\\s*([^\\]'"\\r\\n]{1,160})\\s*\\]\\s*(?:\\(|=)`, 'g');
      for (const match of source.matchAll(dynamicMember)) {
        const expression = String(match[1] || '').trim();
        addArtifact(map, { kind: 'local-storage', name: `computed-${sha256(expression).slice(0, 12)}`,
          pattern: true, unresolved: true, operation: 'dynamic-member', path: file, line: lineNumber(original, match.index) });
      }
      const literalProperty = new RegExp(`\\b${object}\\s*\\[\\s*(['"])([^'"]{1,240})\\1\\s*\\](?!\\s*\\()`, 'g');
      for (const match of source.matchAll(literalProperty)) {
        if (!STORAGE_METHODS.includes(match[2]) && match[2] !== '__st_ping__') {
          addArtifact(map, { kind: 'local-storage', name: match[2], operation: 'property-access',
            path: file, line: lineNumber(original, match.index) });
        }
      }
      const dotProperty = new RegExp(`\\b${object}\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\b(?!\\s*\\()`, 'g');
      for (const match of source.matchAll(dotProperty)) {
        if (!STORAGE_METHODS.includes(match[1]) && match[1] !== 'length') addArtifact(map, {
          kind: 'local-storage', name: match[1], operation: 'property-access', path: file,
          line: lineNumber(original, match.index)
        });
      }
    }
    for (const [alias, method] of methods) {
      const call = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(\\s*([^,\\)\\r\\n]{1,240})`, 'g');
      for (const match of source.matchAll(call)) {
        if (['getItem', 'setItem', 'removeItem'].includes(method)) record(file, original, match, method, match[1], symbols);
        else record(file, original, match, method, `dynamic-${method}-${sha256(`${file}:${match.index}`).slice(0, 12)}`,
          symbols, 'STORAGE_SCOPE_OPERATION_UNRESOLVED');
      }
    }
    const safe = /\b(safeGet|safeSet|safeRemove)\s*\(\s*([^,\)\r\n]{1,240})/g;
    for (const match of source.matchAll(safe)) {
      record(file, original, match, ({ safeGet: 'getItem', safeSet: 'setItem', safeRemove: 'removeItem' })[match[1]],
        match[2], symbols);
    }
    for (const match of original.matchAll(/\bindexedDB\s*\.\s*open\s*\(\s*(["'])([^"']+)\1/g)) {
      addArtifact(map, { kind: 'indexeddb', name: match[2], operation: 'open', path: file, line: lineNumber(original, match.index) });
    }
  }
  return blindSpots;
}

function nativeArtifacts(context, files, map) {
  for (const file of files.filter(value => value.startsWith('build-overrides/native/'))) {
    const source = context.read(file);
    for (const match of source.matchAll(/\b(?:NAME|DB_FILE)\s*=\s*(["'])([^"']+\.(?:db|sqlite))\1/g)) {
      addArtifact(map, { kind: 'native-database', name: match[2], operation: 'open', path: file, line: lineNumber(source, match.index), sourceClass: file });
    }
    for (const match of source.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gi)) {
      addArtifact(map, { kind: 'native-table', name: match[1], operation: 'create', path: file, line: lineNumber(source, match.index), sourceClass: file });
    }
    for (const match of source.matchAll(/\b(?:ALIAS|[A-Z0-9_]*KEY_ALIAS)\s*=\s*(["'])([^"']+)\1/g)) {
      addArtifact(map, { kind: 'keystore-alias', name: match[2], operation: 'open-or-create', path: file, line: lineNumber(source, match.index), sourceClass: file });
    }
    for (const match of source.matchAll(/\bPREFS\s*=\s*(["'])([^"']+)\1/g)) {
      addArtifact(map, { kind: 'native-preferences', name: match[2], operation: 'open', path: file, line: lineNumber(source, match.index), sourceClass: file });
    }
  }
}

function fileArtifacts(context, files, map) {
  for (const file of files.filter(value => value.startsWith('www/'))) {
    const source = context.read(file);
    const symbols = constants(source);
    const interestingConstants = [...symbols.entries()].filter(([name, value]) =>
      /(?:FILE|FOLDER|PATH)$/.test(name) && /(?:\.(?:db|sqlite|dek|json)|Backups|Reports)/i.test(value));
    for (const [name, value] of interestingConstants) {
      addArtifact(map, { kind: 'file', name: value, operation: 'declared', path: file,
        line: lineNumber(source, source.indexOf(name)), sourceClass: file });
    }
    for (const match of source.matchAll(/\b(?:readFile|writeFile|deleteFile|rename|copy|stat)\s*\(\s*\{[\s\S]{0,360}?\bpath\s*:\s*([^,}\r\n]{1,180})/g)) {
      const resolved = resolveArgument(match[1], symbols);
      const nearby = source.slice(match.index, Math.min(source.length, match.index + 500));
      const directory = /\bdirectory\s*:\s*(["'])([A-Z]+)\1/.exec(nearby)?.[2] || '';
      addArtifact(map, { kind: 'file', ...resolved, name: directory ? `${directory}:${resolved.name}` : resolved.name,
        operation: 'file-access', path: file, line: lineNumber(source, match.index), sourceClass: file });
    }
  }
}

function classify(artifact, policy) {
  const bareName = artifact.name.replace(/^(?:DATA|CACHE|DOCUMENTS):/, '');
  const patternPrefix = bareName.endsWith('*') ? bareName.slice(0, -1) : bareName;
  if (artifact.kind === 'local-storage') {
    if (artifact.unresolved) return { classification: null, owner: null, restore: 'unknown', reset: 'unknown', evidenceArtifact: false };
    const isDevice = policy.explicitDeviceLocal.has(bareName);
    const isPortable = artifact.pattern
      ? policy.portablePrefixes.some(prefix => patternPrefix.startsWith(prefix) || prefix.startsWith(patternPrefix))
      : policy.whitelisted(bareName);
    if (isDevice) return { classification: 'device-local', owner: 'shell', restore: policy.restoreBlocked.has(bareName) ? 'blocked' : isPortable ? 'allowed' : 'excluded', reset: 'factory-reset', evidenceArtifact: policy.evidenceKeys.has(bareName), policyPortable: isPortable };
    if (isPortable) return { classification: 'portable', owner: policy.moduleOwner(patternPrefix), restore: 'validated-restore', reset: 'module-or-factory-reset', evidenceArtifact: false, policyPortable: true };
    return { classification: null, owner: null, restore: 'unknown', reset: 'unknown', evidenceArtifact: false };
  }
  if (artifact.kind === 'indexeddb') return { classification: artifact.name === 'saagar_evidence' ? 'portable' : null,
    owner: artifact.name === 'saagar_evidence' ? 'shell-evidence' : null, restore: artifact.name === 'saagar_evidence' ? 'validated-restore' : 'unknown', reset: 'factory-reset', evidenceArtifact: false };
  if (artifact.kind === 'native-database' || artifact.kind === 'native-table') {
    const etp = /SaagarEtpStorePlugin/.test(artifact.sourceClass) || /^(?:generation|stage_chunk|scope_pointer)$/.test(artifact.name) || artifact.name === 'saagar-etp.db';
    return { classification: etp ? 're-derivable-excluded' : 'device-local', owner: etp ? 'etp-native-store' : 'storage-core',
      restore: etp ? 'excluded-and-fenced' : 'logical-key-restore-only', reset: etp ? 'scope-or-store-reset' : 'factory-reset', evidenceArtifact: false };
  }
  if (artifact.kind === 'keystore-alias') return { classification: 'device-local', owner: /etp/i.test(artifact.name) ? 'etp-native-store' : 'storage-core', restore: 'blocked', reset: 'native-reset-or-uninstall', evidenceArtifact: false };
  if (artifact.kind === 'native-preferences') return { classification: 'device-local', owner: 'offdevice-backup', restore: 'blocked', reset: 'app-reset-or-uninstall', evidenceArtifact: false };
  if (artifact.kind === 'file') {
    /* Directory-scoped classification is applied BEFORE the unresolved
       short-circuit. A file artifact whose NAME is computed at runtime still has
       a statically known DIRECTORY, and the directory alone determines the
       classification: everything the app writes under CACHE is re-derivable, and
       everything under app-private DATA is device-local, whatever the filename
       turns out to be. Short-circuiting on `unresolved` first left these
       permanently unclassifiable and was the bulk of A4-02 — the same class of
       audit blind spot as the A3-02 parser defects, and it must not be answered
       by rewriting computed filenames into literals in the product. */
    if (/^CACHE:/.test(artifact.name)) {
      return { classification: 're-derivable-excluded', owner: 'export-control',
        restore: 'not-restored', reset: 'cache-or-owner-file-management',
        evidenceArtifact: false, directoryScoped: artifact.unresolved || undefined };
    }
    if (/^DATA:/.test(artifact.name)) {
      return { classification: 'device-local', owner: 'storage-core',
        restore: 'logical-key-restore-only', reset: 'factory-reset',
        evidenceArtifact: false, directoryScoped: artifact.unresolved || undefined };
    }
    if (artifact.unresolved) return { classification: null, owner: null, restore: 'unknown', reset: 'unknown', evidenceArtifact: false };
    if (/saagar_qms_archive\.json/.test(bareName)) return { classification: 'portable', owner: 'qms', restore: 'validated-restore', reset: 'qms-or-factory-reset', evidenceArtifact: false };
    if (/saagar-etp\.db/.test(bareName)) return { classification: 're-derivable-excluded', owner: 'etp-native-store', restore: 'excluded-and-fenced', reset: 'scope-or-store-reset', evidenceArtifact: false };
    if (/^(?:bcc\.(?:sqlite|dek)|saagar-native-kv\.db)/.test(bareName)) return { classification: 'device-local', owner: 'storage-core', restore: 'logical-key-restore-only', reset: 'factory-reset', evidenceArtifact: false };
    if (/SaagarBCC-Backups/.test(bareName)) return { classification: 'device-local', owner: 'auto-backup', restore: 'same-device-backup-flow', reset: 'retention-or-owner-purge', evidenceArtifact: false };
    if (/^(?:CACHE:|DOCUMENTS:SaagarBCC-Reports)/.test(artifact.name)) return { classification: 're-derivable-excluded', owner: 'export-control', restore: 'not-restored', reset: 'cache-or-owner-file-management', evidenceArtifact: false };
    return { classification: null, owner: null, restore: 'unknown', reset: 'unknown', evidenceArtifact: false };
  }
  return { classification: null, owner: null, restore: 'unknown', reset: 'unknown', evidenceArtifact: false };
}

function sqlMismatches(context, files) {
  const rows = [];
  let schemas = 0;
  for (const file of files.filter(value => value.startsWith('build-overrides/native/'))) {
    const source = context.read(file);
    const tables = new Map();
    for (const match of source.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^";]+)\)/gi)) {
      const columns = match[2].split(',').map(part => part.trim()).filter(part => !/^(?:PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(part))
        .map(part => /^[`"[]?([A-Za-z_][A-Za-z0-9_]*)/.exec(part)?.[1]).filter(Boolean);
      tables.set(match[1].toLowerCase(), new Set(columns.map(value => value.toLowerCase())));
      schemas += 1;
    }
    for (const match of source.matchAll(/INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]+)\)/gi)) {
      const schema = tables.get(match[1].toLowerCase());
      if (!schema) continue;
      for (const column of match[2].split(',').map(value => value.trim().replace(/^[`"[]|[`"\]]$/g, '')).filter(Boolean)) {
        if (!schema.has(column.toLowerCase())) rows.push({ path: file, line: lineNumber(source, match.index), table: match[1], field: column, code: 'SQL_WRITE_FIELD_MISSING_FROM_SCHEMA' });
      }
    }
  }
  return { rows, schemas };
}

function gatewayBypasses(context) {
  const rows = [];
  for (const module of context.modules) {
    const usesStorage = /\blocalStorage\s*\./.test(module.html);
    const hasGateway = /SaagarModuleRuntime\.run\(\s*["']storage["']/.test(module.html);
    if (usesStorage && !hasGateway) rows.push({ path: module.file, code: 'MODULE_STORAGE_GATEWAY_MISSING' });
    if (/\bindexedDB\s*\.|\bCapacitor\.Plugins\.Filesystem\b/.test(module.html)) rows.push({ path: module.file, code: 'MODULE_DIRECT_DEVICE_STORAGE_ACCESS' });
  }
  return rows;
}

export async function run(context) {
  const files = runtimeFiles(context);
  const indexSource = context.exists && context.exists('www/index.html') ? context.read('www/index.html') : '';
  const policy = storagePolicy(indexSource);
  const artifactMap = new Map();
  const discoveredBlindSpots = localStorageArtifacts(context, files, artifactMap);
  nativeArtifacts(context, files, artifactMap);
  fileArtifacts(context, files, artifactMap);

  const artifacts = [...artifactMap.values()].map(artifact => {
    artifact.locations.sort((a, b) => compareText(a.path, b.path) || a.line - b.line);
    const decision = classify(artifact, policy);
    return { ...artifact, operations: [...artifact.operations].sort(), ...decision };
  }).sort((a, b) => compareText(a.kind, b.kind) || compareText(a.name, b.name));
  const blindSpots = [...discoveredBlindSpots];
  const overflow = artifacts.length > MAX_ARTIFACTS;
  const contractInventory = artifacts.map(artifact => ({
    artifactId: artifact.id,
    kind: artifact.kind,
    name: artifact.name,
    pattern: artifact.pattern,
    unresolved: artifact.unresolved,
    operations: artifact.operations,
    classification: artifact.classification || 'unclassified',
    owner: artifact.owner || 'unassigned',
    restore: artifact.restore,
    reset: artifact.reset,
    evidenceArtifact: Boolean(artifact.evidenceArtifact)
  }));
  const inventoryComplete = files.length > 0 && artifacts.length > 0 && !overflow && blindSpots.length === 0;
  const unclassified = artifacts.filter(artifact => !CLASSIFICATIONS.has(artifact.classification) || !artifact.owner || artifact.restore === 'unknown' || artifact.reset === 'unknown');
  const contradictions = artifacts.filter(artifact => artifact.classification === 'device-local' && artifact.policyPortable && artifact.restore !== 'blocked')
    .map(artifact => ({ artifact: artifact.id, path: artifact.locations[0]?.path, line: artifact.locations[0]?.line, code: 'DEVICE_LOCAL_ALLOWED_BY_RESTORE_POLICY' }));
  const restorableEvidence = artifacts.filter(artifact => artifact.classification === 'device-local' && artifact.evidenceArtifact && !['blocked', 'excluded'].includes(artifact.restore));
  const sql = sqlMismatches(context, files);
  const bypasses = gatewayBypasses(context);
  const counts = Object.fromEntries(['portable', 'device-local', 're-derivable-excluded', 'forbidden'].map(value => [value, artifacts.filter(item => item.classification === value).length]));

  return auditResult('A4', 'Data and storage integrity', [
    makeCheck({
      id: 'A4-01', title: 'Persistent-artifact census', result: inventoryComplete ? 'pass' : 'unmeasured',
      severity: inventoryComplete ? 'INFO' : 'P0', mandatory: true,
      metric: { artifacts: artifacts.length, localStorage: artifacts.filter(item => item.kind === 'local-storage').length,
        indexedDb: artifacts.filter(item => item.kind === 'indexeddb').length,
        nativeDatabases: artifacts.filter(item => item.kind === 'native-database').length,
        nativeTables: artifacts.filter(item => item.kind === 'native-table').length,
        keystoreAliases: artifacts.filter(item => item.kind === 'keystore-alias').length,
        files: artifacts.filter(item => item.kind === 'file').length,
        runtimeFiles: files.length, blindSpots: blindSpots.length, artifactLimit: MAX_ARTIFACTS,
        inventoryComplete, inventory: inventoryComplete ? contractInventory : [],
        inventorySha256: inventoryComplete ? stableSha256(contractInventory) : null },
      rule: 'Produce one bounded, exact and location-independent contract row for every persistent artifact; zero census, dynamic blind spots and overflow are unmeasured.',
      evidence: [
        ...(files.length ? [] : [{ code: 'PERSISTENT_RUNTIME_FILES_EMPTY' }]),
        ...(artifacts.length ? [] : [{ code: 'PERSISTENT_ARTIFACT_CENSUS_EMPTY' }]),
        ...blindSpots,
        ...(overflow ? [{ code: 'PERSISTENT_ARTIFACT_LIMIT_EXCEEDED', artifacts: artifacts.length, limit: MAX_ARTIFACTS }] : [])
      ],
      notes: inventoryComplete ? 'The metric inventory is the exact comparison contract and intentionally excludes source line/location fields.'
        : 'No truncated or dynamically unresolved census is represented as complete.'
    }),
    makeCheck({
      id: 'A4-02', title: 'Persistent-artifact classification', result: unclassified.length ? 'fail' : 'pass',
      severity: unclassified.length ? 'P0' : 'INFO', mandatory: true,
      metric: { ...counts, unclassifiedArtifacts: unclassified.length },
      rule: 'Every persistent artifact has exactly one authoritative classification, owner, restore behavior and reset behavior',
      evidence: unclassified.map(artifact => ({ artifact: artifact.id, path: artifact.locations[0]?.path,
        line: artifact.locations[0]?.line, code: 'UNCLASSIFIED_STORAGE' }))
    }),
    makeCheck({
      id: 'A4-03', title: 'Storage classification/use consistency', result: contradictions.length ? 'fail' : 'pass',
      severity: contradictions.length ? 'P0' : 'INFO', mandatory: true,
      metric: { contradictions: contradictions.length },
      rule: 'Declared classification and actual backup/restore use must not contradict each other',
      evidence: contradictions
    }),
    makeCheck({
      id: 'A4-04', title: 'Device-local evidence restore boundary', result: restorableEvidence.length ? 'fail' : 'pass',
      severity: restorableEvidence.length ? 'P0' : 'INFO', mandatory: true,
      metric: { restorableDeviceLocalEvidence: restorableEvidence.length },
      rule: 'Device-local control evidence must never be restorable',
      evidence: restorableEvidence.map(artifact => ({ artifact: artifact.id, path: artifact.locations[0]?.path,
        line: artifact.locations[0]?.line, code: 'DEVICE_LOCAL_EVIDENCE_RESTORABLE' }))
    }),
    makeCheck({
      id: 'A4-05', title: 'Definite persisted-field read/write mismatch', result: sql.rows.length ? 'fail' : 'pass',
      severity: sql.rows.length ? 'P1' : 'INFO', mandatory: true,
      metric: { nativeSchemasParsed: sql.schemas, definiteMismatches: sql.rows.length },
      rule: 'Report only statically definite persisted-field mismatches; dynamic JavaScript object shapes are not guessed',
      evidence: sql.rows,
      notes: 'The deterministic probe validates explicit native SQL write columns against declared schemas and does not infer defects from dynamic object access.'
    }),
    makeCheck({
      id: 'A4-06', title: 'Declared storage/device gateway enforcement', result: bypasses.length ? 'fail' : 'pass',
      severity: bypasses.length ? 'P1' : 'INFO', mandatory: true,
      metric: { gatewayBypasses: bypasses.length, modulesChecked: context.modules.length },
      rule: 'A module using persistent or device storage must enter through the manifest-bound shared storage gateway',
      evidence: bypasses
    })
  ], { artifacts: artifacts.length, classifications: counts, unclassifiedArtifacts: unclassified.length });
}
