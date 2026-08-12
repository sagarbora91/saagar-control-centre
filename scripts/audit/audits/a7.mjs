import { auditResult, lineNumber, makeCheck, sha256, stableSha256 } from '../lib.mjs';
import { conservativeStaticResult, messageInventoryAuthority, staticDiscoveryAuthority, staticDiscoveryEvidence } from '../runner-support.mjs';

const MAX_MESSAGE_CONTRACTS = 1000;

function lexicalMask(source, maskStrings = false) {
  const input = String(source);
  const output = input.split('');
  let state = 'code';
  let quote = '';
  let escaped = false;
  const blank = index => { if (output[index] !== '\n' && output[index] !== '\r') output[index] = ' '; };
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1] || '';
    if (state === 'line') {
      if (char === '\n' || char === '\r') state = 'code'; else blank(index);
      continue;
    }
    if (state === 'block') {
      blank(index);
      if (char === '*' && next === '/') { blank(index + 1); index += 1; state = 'code'; }
      continue;
    }
    if (state === 'html') {
      blank(index);
      if (input.slice(index, index + 3) === '-->') {
        blank(index + 1); blank(index + 2); index += 2; state = 'code';
      }
      continue;
    }
    if (state === 'string') {
      if (maskStrings && char !== quote) blank(index);
      if (escaped) escaped = false;
      else if (char === '\\') { escaped = true; if (maskStrings) blank(index); }
      else if (char === quote) { state = 'code'; quote = ''; }
      continue;
    }
    if (char === '/' && next === '/') { blank(index); blank(index + 1); index += 1; state = 'line'; continue; }
    if (char === '/' && next === '*') { blank(index); blank(index + 1); index += 1; state = 'block'; continue; }
    if (input.slice(index, index + 4) === '<!--') {
      blank(index); blank(index + 1); blank(index + 2); blank(index + 3);
      index += 3; state = 'html'; continue;
    }
    if (char === '"' || char === "'" || char.charCodeAt(0) === 96) { state = 'string'; quote = char; }
  }
  return output.join('');
}

function codeSite(mask, offset) {
  return /\S/.test(mask[offset] || '');
}

function runtimeFiles(context) {
  return context.productFiles.filter(file => /^(?:www|build-overrides)\//.test(file))
    .filter(file => /\.(?:html?|js|mjs|java)$/i.test(file))
    .filter(file => !/\.(?:min|bundle)\.js$/i.test(file));
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

function valueKind(value) {
  const text = value.trim();
  if (/^["'`]/.test(text)) return 'string';
  if (/^(?:true|false)\b/.test(text)) return 'boolean';
  if (/^null\b/.test(text)) return 'null';
  if (/^-?(?:\d+(?:\.\d+)?|\.\d+)\b/.test(text)) return 'number';
  if (/^\[/.test(text) || /^Array\b/.test(text)) return 'array';
  if (/^(?:Object\.(?:freeze|assign)\s*\(\s*)?\{/.test(text)) return 'object';
  return 'expression';
}

function topLevelProperties(source, open, close) {
  const result = [];
  let depth = 1;
  let quote = '';
  let escaped = false;
  for (let i = open + 1; i < close; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{' || ch === '[' || ch === '(') { depth += 1; continue; }
    if (ch === '}' || ch === ']' || ch === ')') { depth -= 1; continue; }
    if (depth !== 1 || !/[A-Za-z_$]/.test(ch)) continue;
    const nameMatch = /^[A-Za-z_$][\w$]*/.exec(source.slice(i));
    if (!nameMatch) continue;
    const name = nameMatch[0];
    let cursor = i + name.length;
    while (/\s/.test(source[cursor] || '')) cursor += 1;
    if (source[cursor] !== ':') continue;
    cursor += 1;
    const valueStart = cursor;
    let innerDepth = 1;
    let innerQuote = '';
    let innerEscaped = false;
    for (; cursor < close; cursor += 1) {
      const valueChar = source[cursor];
      if (innerQuote) {
        if (innerEscaped) innerEscaped = false;
        else if (valueChar === '\\') innerEscaped = true;
        else if (valueChar === innerQuote) innerQuote = '';
        continue;
      }
      if (valueChar === "'" || valueChar === '"' || valueChar === '`') { innerQuote = valueChar; continue; }
      if (valueChar === '{' || valueChar === '[' || valueChar === '(') innerDepth += 1;
      else if (valueChar === '}' || valueChar === ']' || valueChar === ')') innerDepth -= 1;
      else if (valueChar === ',' && innerDepth === 1) break;
    }
    const value = source.slice(valueStart, cursor).trim();
    result.push({ name, kind: valueKind(value), value });
    i = Math.max(i, cursor - 1);
  }
  return result;
}

function sendersIn(file, source) {
  const rows = [];
  const unresolved = [];
  const safe = lexicalMask(source);
  const code = lexicalMask(source, true);
  const unresolvedKeys = new Set();
  const recordUnresolved = row => {
    const key = [row.path, row.line, row.code, row.expressionSha256 || row.payloadSha256 || ''].join('\0');
    if (!unresolvedKeys.has(key)) { unresolvedKeys.add(key); unresolved.push(row); }
  };
  for (const match of code.matchAll(/\bpostMessage\s*(?:\?\.\s*)?\(/g)) {
    let open = code.indexOf('(', match.index);
    let cursor = open + 1;
    while (/\s/.test(code[cursor] || '')) cursor += 1;
    if (safe[cursor] !== '{') {
      const expression = safe.slice(cursor, Math.min(safe.length, cursor + 240)).split(/[,\r\n)]/, 1)[0].trim();
      recordUnresolved({ path: file, line: lineNumber(source, match.index), code: 'MESSAGE_SENDER_PAYLOAD_UNRESOLVED',
        expressionSha256: sha256(expression) });
      continue;
    }
    open = cursor;
    const close = matchingBrace(safe, open);
    if (close <= open) {
      recordUnresolved({ path: file, line: lineNumber(source, match.index), code: 'MESSAGE_SENDER_PAYLOAD_UNRESOLVED',
        expressionSha256: sha256(safe.slice(open, open + 240)) });
      continue;
    }
    const body = safe.slice(open, close + 1);
    const properties = topLevelProperties(safe, open, close);
    const typeProperties = properties.filter(item => item.name === 'type');
    const type = typeProperties.length === 1 ? /^(["'])(ST_[A-Z0-9_]+)\1$/.exec(typeProperties[0].value) : null;
    if (!type) {
      const hasTypeSyntax = typeProperties.length > 0 || /\btype\s*:|\[\s*(["'])type\1\s*\]\s*:/.test(body);
      recordUnresolved({ path: file, line: lineNumber(source, match.index),
        code: hasTypeSyntax ? 'MESSAGE_SENDER_TYPE_UNRESOLVED' : 'MESSAGE_SENDER_PAYLOAD_UNRESOLVED',
        expressionSha256: sha256(body) });
      continue;
    }
    const fields = properties.filter(item => item.name !== 'type')
      .map(item => ({ name: item.name, kind: item.kind }));
    rows.push({ file, line: lineNumber(source, match.index), type: type[2], fields });
    if (fields.some(field => field.kind === 'expression') || /(?:^|[,{}])\s*\.\.\./m.test(body)) {
      recordUnresolved({ path: file, line: lineNumber(source, match.index), code: 'MESSAGE_SENDER_FIELD_TYPE_UNRESOLVED',
        messageType: type[2], payloadSha256: sha256(body) });
    }
  }
  const literalComputed = new Set();
  for (const match of safe.matchAll(/\[\s*(["'])postMessage\1\s*\]\s*(?:\?\.\s*)?\(/g)) {
    if (!codeSite(code, match.index)) continue;
    literalComputed.add(match.index);
    recordUnresolved({ path: file, line: lineNumber(source, match.index),
      code: 'MESSAGE_SENDER_COMPUTED_CALL_UNRESOLVED',
      expressionSha256: sha256(safe.slice(match.index, Math.min(safe.length, match.index + 240))) });
  }
  for (const match of code.matchAll(/\[\s*([^\]\r\n]{1,160})\s*\]\s*(?:\?\.\s*)?\(/g)) {
    if (literalComputed.has(match.index)) continue;
    const open = code.indexOf('(', match.index);
    let cursor = open + 1;
    while (/\s/.test(code[cursor] || '')) cursor += 1;
    if (safe[cursor] !== '{') continue;
    const close = matchingBrace(safe, cursor);
    if (close <= cursor) continue;
    const body = safe.slice(cursor, close + 1);
    if (!/\btype\s*:|\[\s*(["'])type\1\s*\]\s*:/.test(body)) continue;
    recordUnresolved({ path: file, line: lineNumber(source, match.index),
      code: 'MESSAGE_SENDER_COMPUTED_CALL_UNRESOLVED', expressionSha256: sha256(body) });
  }
  const aliasPatterns = [
    /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:window\s*\.\s*)?parent\s*\.\s*postMessage\s*\.\s*bind\s*\(/g,
    /\b(?:const|let|var)\s*\{\s*postMessage(?:\s*:\s*[A-Za-z_$][\w$]*)?\s*\}\s*=\s*(?:window\s*\.\s*)?parent\b/g
  ];
  for (const pattern of aliasPatterns) for (const match of safe.matchAll(pattern)) {
    if (!codeSite(code, match.index)) continue;
    recordUnresolved({ path: file, line: lineNumber(source, match.index),
      code: 'MESSAGE_SENDER_ALIAS_UNRESOLVED',
      expressionSha256: sha256(safe.slice(match.index, Math.min(safe.length, match.index + 240))) });
  }
  return { rows, unresolved };
}

function messageHandlerRanges(source) {
  const ranges = [];
  const patterns = [
    /\baddEventListener\s*\(\s*(["'])message\1\s*,/g,
    /\bonmessage\s*=/g
  ];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) {
    const searchEnd = Math.min(source.length, match.index + 1000);
    const fragment = source.slice(match.index, searchEnd);
    const arrow = fragment.search(/=>\s*\{/);
    const functionBody = fragment.search(/\bfunction\b[^{}]{0,300}\{/);
    const offsets = [arrow, functionBody].filter(value => value >= 0);
    if (!offsets.length) continue;
    const relative = Math.min(...offsets);
    const open = source.indexOf('{', match.index + relative);
    const end = matchingBrace(source, open);
    if (open >= 0 && end > open) ranges.push({ start: open, end });
  }
  return ranges;
}
function scopedMessageHandlerRanges(source) {
  const safe = lexicalMask(source);
  const code = lexicalMask(source, true);
  const ranges = [];
  const seen = new Set();
  const addRange = open => {
    const end = matchingBrace(safe, open);
    if (open < 0 || end <= open || seen.has(open)) return;
    seen.add(open);
    ranges.push({ start: open, end });
  };
  const addNamedRange = name => {
    const patterns = [
      new RegExp('\\bfunction\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{', 'g'),
      new RegExp('\\b(?:const|let|var)\\s+' + name +
        '\\s*=\\s*(?:async\\s*)?function(?:\\s+[A-Za-z_$][\\w$]*)?\\s*\\([^)]*\\)\\s*\\{', 'g'),
      new RegExp('\\b(?:const|let|var)\\s+' + name +
        '\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>\\s*\\{', 'g')
    ];
    for (const pattern of patterns) for (const match of code.matchAll(pattern)) {
      addRange(match.index + match[0].lastIndexOf('{'));
    }
  };
  const registrations = [
    /\baddEventListener\s*\(\s*(["'])message\1\s*,/g,
    /\bonmessage\s*=/g
  ];
  for (const pattern of registrations) for (const match of safe.matchAll(pattern)) {
    if (!codeSite(code, match.index)) continue;
    const start = match.index + match[0].length;
    const tail = code.slice(start, Math.min(code.length, start + 1000));
    const inline = /^\s*(?:(?:async\s+)?function(?:\s+[A-Za-z_$][\w$]*)?\s*\([^)]*\)|(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)\s*\{/.exec(tail);
    if (inline) addRange(start + inline[0].lastIndexOf('{'));
    else {
      const named = /^\s*([A-Za-z_$][\w$]*)\b/.exec(tail);
      if (named) addNamedRange(named[1]);
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

function receiversIn(file, source) {
  const rows = [];
  const unresolved = [];
  const safe = lexicalMask(source);
  const code = lexicalMask(source, true);
  const unresolvedKeys = new Set();
  const recordUnresolved = row => {
    const key = [row.path, row.line, row.code, row.expressionSha256 || ''].join('\0');
    if (!unresolvedKeys.has(key)) { unresolvedKeys.add(key); unresolved.push(row); }
  };
  const handlerRanges = scopedMessageHandlerRanges(source);
  const inMessageHandler = offset => handlerRanges.some(range => offset >= range.start && offset <= range.end);
  const isEventDataType = expression => /\b(?:event|e|evt|messageEvent)\s*\.\s*data\s*\.\s*type\b/.test(expression);
  const patterns = [
    { pattern: /\b((?:[A-Za-z_$][\w$]*\s*\.\s*)*type)\s*(?:===|!==|==|!=)\s*(["'])(ST_[A-Z0-9_]+)\2/g,
      lhsGroup: 1, typeGroup: 3 },
    { pattern: /(["'])(ST_[A-Z0-9_]+)\1\s*(?:===|!==|==|!=)\s*\b((?:[A-Za-z_$][\w$]*\s*\.\s*)*type)\b/g,
      lhsGroup: 3, typeGroup: 2 }
  ];
  for (const rule of patterns) for (const match of safe.matchAll(rule.pattern)) {
    if (!codeSite(code, match.index)) continue;
    const lhs = match[rule.lhsGroup];
    if (!isEventDataType(lhs) && !inMessageHandler(match.index)) continue;
    rows.push({ file, line: lineNumber(source, match.index), type: match[rule.typeGroup] });
  }
  for (const match of safe.matchAll(/\b((?:[A-Za-z_$][\w$]*\s*\.\s*)+type)\s*(?:===|!==|==|!=)\s*([^;\r\n)]+)/g)) {
    if (!codeSite(code, match.index)) continue;
    const expression = match[2].trim();
    if (!/^(["'])ST_[A-Z0-9_]+\1(?:\s|&&|\|\||\)|$)/.test(expression) &&
        (isEventDataType(match[1]) || inMessageHandler(match.index))) recordUnresolved({ path: file,
      line: lineNumber(source, match.index), code: 'MESSAGE_RECEIVER_TYPE_UNRESOLVED',
      expressionSha256: sha256(expression) });
  }
  for (const switchMatch of safe.matchAll(/\bswitch\s*\(\s*([^)]*\.\s*type)\s*\)\s*\{/g)) {
    if (!codeSite(code, switchMatch.index)) continue;
    if (!isEventDataType(switchMatch[1]) && !inMessageHandler(switchMatch.index)) continue;
    const open = source.indexOf('{', switchMatch.index);
    const close = matchingBrace(safe, open);
    const body = close > open ? safe.slice(open, close + 1) : '';
    for (const caseMatch of body.matchAll(/\bcase\s+([^:\r\n]{1,200})\s*:/g)) {
      const expression = caseMatch[1].trim();
      const literal = /^(["'])(ST_[A-Z0-9_]+)\1$/.exec(expression);
      if (literal) rows.push({ file, line: lineNumber(source, open + caseMatch.index), type: literal[2] });
      else recordUnresolved({ path: file,
        line: lineNumber(source, open + caseMatch.index), code: 'MESSAGE_RECEIVER_TYPE_UNRESOLVED',
        expressionSha256: sha256(expression) });
    }
  }
  const computedReceivers = [
    /\b(?:event|e|evt|messageEvent)\s*(?:\.\s*data|\[\s*(["'])data\1\s*\])\s*\[\s*([^\]\r\n]{1,160})\s*\]/g,
    /\b(?:event|e|evt|messageEvent)\s*\[\s*(["'])data\1\s*\]\s*\.\s*type\b/g
  ];
  for (const pattern of computedReceivers) for (const match of safe.matchAll(pattern)) {
    if (!codeSite(code, match.index)) continue;
    recordUnresolved({ path: file, line: lineNumber(source, match.index),
      code: 'MESSAGE_RECEIVER_COMPUTED_TYPE_UNRESOLVED', expressionSha256: sha256(match[0]) });
  }
  return { rows, unresolved };
}

function manifestBinding(context) {
  const mismatches = [];
  const sourceExists = file => typeof context.exists === 'function'
    ? context.exists(file)
    : (context.files || []).includes(file);
  for (const module of context.modules || []) {
    const bytes = Buffer.byteLength(module.html, 'utf8');
    const digest = sha256(Buffer.from(module.html, 'utf8'));
    if (bytes !== module.bytes || digest !== module.sha256) mismatches.push({ path: module.file, code: 'MODULE_MANIFEST_BINDING_MISMATCH' });
  }
  for (const asset of context.sharedAssets || []) {
    const file = `www/${String(asset.file || '').replaceAll('\\', '/')}`;
    if (!sourceExists(file)) { mismatches.push({ path: file, code: 'SHARED_ASSET_MISSING' }); continue; }
    const source = context.read(file);
    if (Buffer.byteLength(source, 'utf8') !== asset.bytes || sha256(Buffer.from(source, 'utf8')) !== asset.sha256) {
      mismatches.push({ path: file, code: 'SHARED_MANIFEST_BINDING_MISMATCH' });
    }
  }
  const shellAvailable = sourceExists('www/index.html');
  const runtimeAvailable = sourceExists('www/shared/mah4-runtime.js');
  const shell = shellAvailable ? context.read('www/index.html') : '';
  const runtime = runtimeAvailable ? context.read('www/shared/mah4-runtime.js') : '';
  const manifestTag = shell.indexOf('<script src="module-manifest.js"></script>');
  const manifestUse = shell.indexOf('const MODULE_MANIFEST');
  const manifestFirst = manifestTag >= 0 && manifestUse > manifestTag;
  const directManifestRoutes = /__f\.src\s*=\s*mod\.src/.test(shell) && /moduleById\(id\)/.test(shell);
  const controllerAvailable = sourceExists('www/shared/shell-module-frame-controller.js');
  const controller = controllerAvailable ? context.read('www/shared/shell-module-frame-controller.js') : '';
  const delegatesToController = /SaagarShellModuleFrameController\.open\s*\(\s*id\s*,\s*\{[\s\S]{0,800}?moduleById\s*:\s*moduleById/.test(shell);
  const controllerManifestRoutes = controllerAvailable && /shell\.moduleById\s*\(\s*id\s*\)/.test(controller) &&
    /(?:frame|shell\.frame)\.src\s*=\s*mod\.src/.test(controller) && /if\s*\(\s*!mod\.src\s*\)/.test(controller);
  const manifestRoutes = directManifestRoutes || (delegatesToController && controllerManifestRoutes);
  const versionReject = /event\.data\.version\s*!==\s*VERSION/.test(runtime) && /m\.type\s*===\s*["']ST_INIT["']/.test(runtime);
  if (!shellAvailable) mismatches.push({ path: 'www/index.html', code: 'SHELL_PROTOCOL_SOURCE_MISSING' });
  if (!runtimeAvailable) mismatches.push({ path: 'www/shared/mah4-runtime.js', code: 'SHARED_PROTOCOL_SOURCE_MISSING' });
  if (!manifestFirst) mismatches.push({ path: 'www/index.html', code: 'MANIFEST_NOT_LOADED_BEFORE_SHELL' });
  if (!manifestRoutes) mismatches.push({ path: 'www/index.html', code: 'MODULE_ROUTE_NOT_MANIFEST_BOUND' });
  if (!versionReject) mismatches.push({ path: 'www/shared/mah4-runtime.js', code: 'UNSUPPORTED_PROTOCOL_VERSION_NOT_REJECTED' });
  return { mismatches, manifestFirst, manifestRoutes, versionReject };
}

function undeclaredContracts(context, files) {
  const allowedParent = new Set(['postMessage']);
  const allowedGlobals = new Set(['SaagarModuleRuntime', 'SaagarMah4']);
  const rows = [];
  for (const file of files.filter(value => value.startsWith('www/modules/'))) {
    const source = context.read(file);
    const locallyDefined = new Set([...source.matchAll(/\bwindow\.(Saagar[A-Za-z0-9_$]+)\s*=/g)].map(match => match[1]));
    for (const match of source.matchAll(/\b(?:window\s*\.\s*)?parent\s*\.\s*([A-Za-z_$][\w$]*)/g)) {
      if (!allowedParent.has(match[1])) rows.push({ path: file, line: lineNumber(source, match.index), contract: `parent.${match[1]}`, code: 'UNDECLARED_PARENT_CONTRACT' });
    }
    for (const match of source.matchAll(/\bwindow\.(Saagar[A-Za-z0-9_$]+)/g)) {
      if (!allowedGlobals.has(match[1]) && !locallyDefined.has(match[1])) {
        rows.push({ path: file, line: lineNumber(source, match.index), contract: `window.${match[1]}`, code: 'UNDECLARED_GLOBAL_CONTRACT' });
      }
    }
  }
  return rows;
}

export async function run(context) {
  const files = runtimeFiles(context);
  const senders = [];
  const receivers = [];
  const unresolved = [];
  for (const file of files) {
    const source = context.read(file);
    const senderDiscovery = sendersIn(file, source);
    const receiverDiscovery = receiversIn(file, source);
    senders.push(...senderDiscovery.rows);
    receivers.push(...receiverDiscovery.rows);
    unresolved.push(...senderDiscovery.unresolved, ...receiverDiscovery.unresolved);
  }
  senders.sort((a, b) => a.type.localeCompare(b.type) || a.file.localeCompare(b.file) || a.line - b.line);
  receivers.sort((a, b) => a.type.localeCompare(b.type) || a.file.localeCompare(b.file) || a.line - b.line);
  unresolved.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.code.localeCompare(b.code));

  const sentTypes = new Set(senders.map(row => row.type));
  const receivedTypes = new Set(receivers.map(row => row.type));
  const allTypes = [...new Set([...sentTypes, ...receivedTypes])].sort();
  const unmatched = allTypes.filter(type => !sentTypes.has(type) || !receivedTypes.has(type)).map(type => ({
    type,
    code: sentTypes.has(type) ? 'MESSAGE_SENT_NEVER_HANDLED' : 'MESSAGE_HANDLED_NEVER_SENT'
  }));

  const conflicts = [];
  for (const type of [...sentTypes].sort()) {
    const byField = new Map();
    for (const sender of senders.filter(row => row.type === type)) {
      for (const field of sender.fields) {
        if (!byField.has(field.name)) byField.set(field.name, new Set());
        byField.get(field.name).add(field.kind);
      }
    }
    for (const [field, kinds] of [...byField.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const definite = [...kinds].filter(kind => kind !== 'expression' && kind !== 'null');
      if (new Set(definite).size > 1) conflicts.push({ type, field, kinds: [...kinds].sort(), code: 'PAYLOAD_FIELD_TYPE_CONFLICT' });
    }
  }

  const binding = manifestBinding(context);
  const undeclared = undeclaredContracts(context, files);
  const resolvedContracts = allTypes.map(messageType => {
    const typeSenders = senders.filter(row => row.type === messageType);
    const typeReceivers = receivers.filter(row => row.type === messageType);
    const senderContracts = typeSenders.map(row => ({ path: row.file,
      payloadFields: row.fields.map(field => ({ field: field.name, kind: field.kind }))
        .sort((a, b) => a.field.localeCompare(b.field) || a.kind.localeCompare(b.kind)) }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const receiverContracts = typeReceivers.map(row => ({ path: row.file }))
      .sort((a, b) => a.path.localeCompare(b.path));
    return { contractId: `message:${messageType}`, kind: 'resolved', messageType, path: '',
      unresolvedCode: '', expressionSha256: '', senderContracts, receiverContracts };
  });
  const unresolvedOrdinals = new Map();
  const representedUnresolved = unresolved.map(row => {
    const stableSite = [row.path, row.code, row.messageType || ''].join('\\0');
    const ordinal = (unresolvedOrdinals.get(stableSite) || 0) + 1;
    unresolvedOrdinals.set(stableSite, ordinal);
    return { contractId: `unresolved:${sha256(stableSite)}:${ordinal}`, kind: 'unresolved',
      messageType: row.messageType || '', path: row.path, unresolvedCode: row.code,
      expressionSha256: row.expressionSha256 || row.payloadSha256 || sha256(row.code),
      senderContracts: [], receiverContracts: [] };
  });
  const contractInventory = [...resolvedContracts, ...representedUnresolved]
    .sort((a, b) => a.contractId.localeCompare(b.contractId));
  const discoveredArtifacts = contractInventory.length;
  const overflow = discoveredArtifacts > MAX_MESSAGE_CONTRACTS;
  const zeroCensus = discoveredArtifacts === 0;
  const inventoryComplete = !zeroCensus && !overflow;
  const lifecycleComplete = inventoryComplete && unresolved.length === 0;
  const inventory = overflow ? contractInventory.slice(0, MAX_MESSAGE_CONTRACTS) : contractInventory;
  const inventorySha256 = inventoryComplete ? stableSha256(inventory) : null;
  const censusGaps = [
    ...(zeroCensus ? [{ code: 'MESSAGE_CONTRACT_CENSUS_EMPTY' }] : []),
    ...(overflow ? [{ code: 'MESSAGE_CONTRACT_INVENTORY_OVERFLOW', discoveredArtifacts,
      artifactLimit: MAX_MESSAGE_CONTRACTS }] : [])
  ];
  const lifecycleGaps = unresolved.length ? unresolved : censusGaps;
  /* Closure addendum §3. A bounded, non-empty, non-overflowing census proves the
     inventory is representable — not that the scanner observed every protocol
     site. Heuristic absence therefore settles at 'unmeasured', never 'pass',
     unless an explicit complete authority is supplied. */
  const authority = staticDiscoveryAuthority(context);
  const inventoryAuthority = messageInventoryAuthority(context);
  const inventoryResult = conservativeStaticResult({
    definiteViolations: 0,
    unresolved: inventoryComplete ? 0 : 1,
    authority: inventoryAuthority
  });
  const lifecycleResult = conservativeStaticResult({
    definiteViolations: unmatched.length,
    unresolved: lifecycleComplete ? 0 : 1,
    authority
  });
  const shapeResult = conservativeStaticResult({
    definiteViolations: conflicts.length,
    unresolved: lifecycleComplete ? 0 : 1,
    authority
  });
  const globalResult = conservativeStaticResult({
    definiteViolations: undeclared.length,
    unresolved: 0,
    authority
  });

  return auditResult('A7', 'Protocol stability', [
    makeCheck({
      id: 'A7-01', title: 'ST message sender and receiver inventory',
      result: inventoryResult, severity: inventoryResult === 'pass' ? 'INFO' : 'P1', mandatory: true,
      metric: { messageTypes: allTypes.length, senderSites: senders.length, receiverSites: receivers.length,
        unresolvedContracts: unresolved.length, discoveredArtifacts, artifactLimit: MAX_MESSAGE_CONTRACTS,
        inventoryComplete, inventorySha256, inventory,
        staticDiscoveryComplete: inventoryAuthority.complete, staticAbsenceIsProof: false },
      rule: 'Maintain a bounded, exact and hash-bound ST message contract inventory; a bounded census is evidence but never proof of complete scanner coverage, so heuristic absence is unmeasured',
      evidence: inventoryComplete
        ? staticDiscoveryEvidence(inventoryAuthority, inventoryAuthority.complete
          ? [{ code: 'MESSAGE_CONTRACT_INVENTORY_BOUND', inventorySha256, representedUnresolved: unresolved.length }]
          : [])
        : censusGaps,
      notes: 'The inventory remains useful evidence at unmeasured; it is not upgraded to pass without explicit complete discovery authority.'
    }),
    makeCheck({
      id: 'A7-02', title: 'Message lifecycle pairing', result: lifecycleResult,
      severity: unmatched.length ? 'P1' : lifecycleResult === 'pass' ? 'INFO' : 'P2', mandatory: true,
      metric: { sentNeverHandled: unmatched.filter(row => row.code === 'MESSAGE_SENT_NEVER_HANDLED').length,
        handledNeverSent: unmatched.filter(row => row.code === 'MESSAGE_HANDLED_NEVER_SENT').length,
        unresolvedContracts: unresolved.length,
        staticDiscoveryComplete: authority.complete, staticAbsenceIsProof: false },
      rule: 'A definite unpaired shipped ST_* message is P1; heuristic absence of unpaired messages is unmeasured, never pass',
      evidence: unmatched.length ? unmatched
        : lifecycleComplete ? staticDiscoveryEvidence(authority) : lifecycleGaps
    }),
    makeCheck({
      id: 'A7-03', title: 'Message payload shape compatibility', result: shapeResult,
      severity: conflicts.length ? 'P1' : shapeResult === 'pass' ? 'INFO' : 'P2', mandatory: true,
      metric: { definiteFieldTypeConflicts: conflicts.length, unresolvedContracts: unresolved.length,
        staticDiscoveryComplete: authority.complete, staticAbsenceIsProof: false },
      rule: 'A field used with conflicting definite payload types for one message type is P1; heuristic absence of conflicts is unmeasured, never pass',
      evidence: conflicts.length ? conflicts
        : lifecycleComplete ? staticDiscoveryEvidence(authority) : lifecycleGaps
    }),
    makeCheck({
      id: 'A7-04', title: 'Packaged protocol and manifest binding', result: binding.mismatches.length ? 'fail' : 'pass',
      severity: binding.mismatches.length ? 'P1' : 'INFO', mandatory: true,
      metric: { bindingMismatches: binding.mismatches.length, modules: (context.modules || []).length,
        sharedAssets: (context.sharedAssets || []).length, rejectsUnsupportedVersion: binding.versionReject },
      rule: 'Packaged shell, modules and shared runtimes must be byte/hash bound and reject unsupported protocol versions',
      evidence: binding.mismatches.length ? binding.mismatches : [{ code: 'MANIFEST_AND_PROTOCOL_VERSION_BOUND' }]
    }),
    makeCheck({
      id: 'A7-05', title: 'Declared parent and global contracts', result: globalResult,
      severity: undeclared.length ? 'P1' : globalResult === 'pass' ? 'INFO' : 'P2', mandatory: true,
      metric: { undeclaredContractSites: undeclared.length,
        staticDiscoveryComplete: authority.complete, staticAbsenceIsProof: false },
      rule: 'A definite undeclared parent/global contract use is P1; heuristic absence is unmeasured, never pass, because alias and computed access can evade the scan',
      evidence: undeclared.length ? undeclared : staticDiscoveryEvidence(authority)
    })
  ], { messageTypes: allTypes.length, senderSites: senders.length, receiverSites: receivers.length,
    unresolvedContracts: unresolved.length, inventoryComplete, lifecycleComplete });
}
