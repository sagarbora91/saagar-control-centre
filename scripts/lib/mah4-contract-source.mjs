import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createWwwFingerprint } from '../mah3-visual-review-server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..', '..');
const require = createRequire(import.meta.url);

export const SHELL_TO_MODULE_TYPES = Object.freeze([
  'ST_ACCESS_CONTEXT',
  'ST_LANG',
  'ST_OPEN_FEATURE',
  'ST_SET_DATE',
  'ST_UI_MODE',
  'ST_WA_SENT'
]);

export const MODULE_TO_SHELL_TYPES = Object.freeze([
  'ST_AUDIT',
  'ST_BACK_HOME',
  'ST_OPEN_MODULE',
  'ST_PRINT',
  'ST_REPORT',
  'ST_REPORT_BATCH',
  'ST_SHARE',
  'ST_WA',
  'ST_WA_LINK'
]);

export const PROPOSED_CONTROL_TYPES = Object.freeze([
  'ST_INIT', 'ST_READY', 'ST_ERROR', 'ST_DISPOSE', 'ST_DISPOSED'
]);

const DYNAMIC_LOADER_GROUPS = Object.freeze([
  {
    id: 'shell-demo-seed', owner: 'index.html', trigger: 'demo-gate-disabled',
    mechanisms: ['create-element-script', 'document-write-fallback'],
    coreAssetPaths: ['demo-seed.js'], optionalAssetPaths: []
  },
  {
    id: 'shell-jszip', owner: 'index.html', trigger: 'on-demand-ensure-jszip',
    mechanisms: ['create-element-script'],
    coreAssetPaths: ['jszip.min.js'], optionalAssetPaths: []
  },
  {
    id: 'shell-pdf-libs', owner: 'index.html', trigger: 'on-demand-ensure-pdf-libs',
    mechanisms: ['create-element-script'],
    coreAssetPaths: [
      'jspdf.umd.min.js',
      'jspdf.plugin.autotable.min.js',
      'fonts/DMSans-normal.js',
      'fonts/DMSans-bold.js',
      'pdf.min.js'
    ],
    optionalAssetPaths: ['html2pdf.bundle.min.js']
  },
  {
    id: 'shell-integration-bridge', owner: 'index.html', trigger: 'storage-ready-or-parser-fallback',
    mechanisms: ['create-element-script', 'document-write-fallback'],
    coreAssetPaths: ['integration-bridge.js'], optionalAssetPaths: []
  },
  {
    id: 'report-jszip', owner: 'saagar-report.js', trigger: 'on-demand-report-zip',
    mechanisms: ['create-element-script'],
    coreAssetPaths: ['jszip.min.js'], optionalAssetPaths: []
  }
]);

const DYNAMIC_WORKER_BINDINGS = Object.freeze([
  { id: 'shell-pdf-worker', owner: 'index.html', assetPath: 'pdf.worker.min.js' }
]);

const DYNAMIC_VENDOR_ASSETS = new Set([
  'jszip.min.js',
  'jspdf.umd.min.js',
  'jspdf.plugin.autotable.min.js',
  'fonts/DMSans-normal.js',
  'fonts/DMSans-bold.js',
  'pdf.min.js',
  'html2pdf.bundle.min.js',
  'pdf.worker.min.js'
]);

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const count = (source, expression) => [...source.matchAll(expression)].length;
const unique = values => [...new Set(values)].sort();
const slash = value => value.replace(/\\/g, '/');

function fileIdentity(root, relativePath) {
  const normalized = slash(relativePath);
  const bytes = fs.readFileSync(path.resolve(root, normalized));
  return { path: normalized, bytes: bytes.length, sha256: sha256(bytes) };
}

function replaceWithSpace(char) {
  return char === '\n' || char === '\r' ? char : ' ';
}

// This is intentionally a small lexical mask, not a JavaScript parser. It
// removes comments and whole template literals so dormant generated srcdoc
// programs are not misclassified as live shell code, while preserving normal
// quoted literals used by active message type comparisons.
export function maskCommentsAndTemplates(source) {
  let output = '';
  let state = 'code';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === 'line-comment') {
      output += replaceWithSpace(char);
      if (char === '\n') state = 'code';
      continue;
    }
    if (state === 'block-comment') {
      output += replaceWithSpace(char);
      if (char === '*' && next === '/') {
        output += ' ';
        index += 1;
        state = 'code';
      }
      continue;
    }
    if (state === 'template') {
      output += replaceWithSpace(char);
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '`') {
        state = 'code';
      }
      continue;
    }
    if (state === 'single' || state === 'double') {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if ((state === 'single' && char === "'") || (state === 'double' && char === '"')) {
        state = 'code';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      output += '  ';
      index += 1;
      state = 'line-comment';
    } else if (char === '/' && next === '*') {
      output += '  ';
      index += 1;
      state = 'block-comment';
    } else if (char === '`') {
      output += ' ';
      state = 'template';
    } else {
      output += char;
      if (char === "'") state = 'single';
      if (char === '"') state = 'double';
    }
  }
  return output;
}

function parseTagAttributes(source) {
  const attributes = [];
  let index = 0;
  while (index < source.length) {
    while (/\s/.test(source[index] || '')) index += 1;
    if (index >= source.length || source[index] === '/') break;
    const nameStart = index;
    while (index < source.length && !/[\s=/>]/.test(source[index])) index += 1;
    if (index === nameStart) throw new Error('MAH-4 cannot parse script attributes');
    const name = source.slice(nameStart, index);
    while (/\s/.test(source[index] || '')) index += 1;
    let value = null;
    let quoted = false;
    if (source[index] === '=') {
      index += 1;
      while (/\s/.test(source[index] || '')) index += 1;
      const quote = source[index];
      if (quote === '"' || quote === "'") {
        quoted = true;
        index += 1;
        const valueStart = index;
        while (index < source.length && source[index] !== quote) index += 1;
        if (index >= source.length) throw new Error(`MAH-4 unterminated ${name} attribute`);
        value = source.slice(valueStart, index);
        index += 1;
      } else {
        const valueStart = index;
        while (index < source.length && !/[\s>]/.test(source[index])) index += 1;
        value = source.slice(valueStart, index);
      }
    }
    attributes.push({ name, value, quoted });
  }
  return attributes;
}

function scriptBlocks(html) {
  const blocks = [];
  const withoutHtmlComments = html.replace(/<!--[\s\S]*?-->/g, match => match.replace(/[^\r\n]/g, ' '));
  for (const match of withoutHtmlComments.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attributes = parseTagAttributes(match[1]);
    const sources = attributes.filter(attribute => attribute.name.toLowerCase() === 'src');
    if (sources.length > 1) throw new Error('MAH-4 rejects duplicate script src attributes');
    if (sources.length === 1 && (!sources[0].quoted || !sources[0].value)) {
      throw new Error(`MAH-4 requires a non-empty quoted script src attribute: ${match[1].trim().slice(0, 120)}`);
    }
    blocks.push({ body: match[2], src: sources[0]?.value || null });
  }
  return blocks;
}

export function inlineJavaScript(html) {
  return scriptBlocks(html).filter(block => !block.src).map(block => block.body).join('\n');
}

export function scriptSources(html) {
  return unique(scriptBlocks(html).filter(block => block.src).map(block => block.src));
}

export function resolveLocalScript(ownerRelativePath, sourceReference) {
  const owner = slash(String(ownerRelativePath || ''));
  const reference = slash(String(sourceReference || '').trim());
  if (!owner || !reference) throw new Error('MAH-4 script path is empty');
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(reference)) {
    throw new Error(`MAH-4 rejects remote or absolute script: ${reference}`);
  }
  if (/[?#%]/.test(reference) || reference.includes('\0')) {
    throw new Error(`MAH-4 rejects noncanonical script: ${reference}`);
  }
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(owner), reference));
  if (resolved === '..' || resolved.startsWith('../') || path.posix.isAbsolute(resolved)) {
    throw new Error(`MAH-4 rejects script traversal: ${reference}`);
  }
  if (!resolved.endsWith('.js')) throw new Error(`MAH-4 script is not JavaScript: ${reference}`);
  return resolved;
}

export function resolveManifestEntry(sourceReference) {
  const reference = slash(String(sourceReference || '').trim());
  if (!reference) throw new Error('MAH-4 manifest entry path is empty');
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(reference)) {
    throw new Error(`MAH-4 rejects remote or absolute manifest entry: ${reference}`);
  }
  if (/[?#%]/.test(reference) || reference.includes('\0')) {
    throw new Error(`MAH-4 rejects noncanonical manifest entry: ${reference}`);
  }
  const normalized = path.posix.normalize(reference);
  if (normalized !== reference || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`MAH-4 rejects manifest entry traversal: ${reference}`);
  }
  if (!normalized.endsWith('.html')) throw new Error(`MAH-4 manifest entry is not HTML: ${reference}`);
  return normalized;
}

function frequency(values) {
  const result = {};
  for (const value of values) result[value] = (result[value] || 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function skipQuoted(source, index, quote) {
  let escaped = false;
  for (let cursor = index + 1; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (escaped) escaped = false;
    else if (char === '\\') escaped = true;
    else if (char === quote) return cursor + 1;
  }
  return source.length;
}

function skipLineComment(source, index) {
  const newline = source.indexOf('\n', index + 2);
  return newline < 0 ? source.length : newline + 1;
}

function skipBlockComment(source, index) {
  const close = source.indexOf('*/', index + 2);
  return close < 0 ? source.length : close + 2;
}

const REGEX_PREFIX_KEYWORDS = new Set([
  'await', 'case', 'delete', 'else', 'in', 'instanceof', 'new', 'of',
  'return', 'throw', 'typeof', 'void', 'yield'
]);

// Lightweight lexical hardening for this frozen source tree. Masking regular
// expression literals prevents quote characters inside /[...]\/ patterns from
// confusing the balanced call scanner. Template interpolation remains an
// explicitly recorded Stage-A parser limitation.
function maskRegexLiterals(source) {
  let output = '';
  let canStartRegex = true;
  for (let index = 0; index < source.length;) {
    const char = source[index];
    const next = source[index + 1];
    if (/\s/.test(char)) {
      output += char;
      index += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      const end = skipLineComment(source, index);
      output += source.slice(index, end);
      index = end;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = skipBlockComment(source, index);
      output += source.slice(index, end);
      index = end;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const end = skipQuoted(source, index, char);
      output += source.slice(index, end);
      index = end;
      canStartRegex = false;
      continue;
    }
    if (char === '/' && canStartRegex) {
      let cursor = index + 1;
      let escaped = false;
      let characterClass = false;
      while (cursor < source.length) {
        const current = source[cursor];
        if (escaped) escaped = false;
        else if (current === '\\') escaped = true;
        else if (current === '[') characterClass = true;
        else if (current === ']') characterClass = false;
        else if (current === '/' && !characterClass) {
          cursor += 1;
          while (/[A-Za-z]/.test(source[cursor] || '')) cursor += 1;
          break;
        } else if (current === '\n' || current === '\r') {
          break;
        }
        cursor += 1;
      }
      output += source.slice(index, cursor).replace(/[^\r\n]/g, ' ');
      index = cursor;
      canStartRegex = false;
      continue;
    }
    if (/[A-Za-z_$]/.test(char)) {
      const start = index;
      index += 1;
      while (/[A-Za-z0-9_$]/.test(source[index] || '')) index += 1;
      const word = source.slice(start, index);
      output += word;
      canStartRegex = REGEX_PREFIX_KEYWORDS.has(word);
      continue;
    }
    if (/[0-9]/.test(char)) {
      const start = index;
      index += 1;
      while (/[0-9A-Fa-f_xXobOB.eE+-]/.test(source[index] || '')) index += 1;
      output += source.slice(start, index);
      canStartRegex = false;
      continue;
    }
    output += char;
    index += 1;
    canStartRegex = !/[\w$)\]}]/.test(char) && char !== '.';
  }
  return output;
}

function readCallArguments(source, openIndex) {
  const args = [];
  let argumentStart = openIndex + 1;
  let parentheses = 1;
  let braces = 0;
  let brackets = 0;
  for (let index = openIndex + 1; index < source.length;) {
    const char = source[index];
    const next = source[index + 1];
    if (char === "'" || char === '"' || char === '`') {
      index = skipQuoted(source, index, char);
      continue;
    }
    if (char === '/' && next === '/') {
      index = skipLineComment(source, index);
      continue;
    }
    if (char === '/' && next === '*') {
      index = skipBlockComment(source, index);
      continue;
    }
    if (char === '(') parentheses += 1;
    else if (char === ')') {
      parentheses -= 1;
      if (parentheses === 0) {
        args.push(source.slice(argumentStart, index));
        return { args, end: index + 1 };
      }
    } else if (char === '{') braces += 1;
    else if (char === '}') braces -= 1;
    else if (char === '[') brackets += 1;
    else if (char === ']') brackets -= 1;
    else if (char === ',' && parentheses === 1 && braces === 0 && brackets === 0) {
      args.push(source.slice(argumentStart, index));
      argumentStart = index + 1;
    }
    index += 1;
  }
  throw new Error('MAH-4 found an unterminated JavaScript call');
}

function identifierCalls(source, identifier) {
  const calls = [];
  const expression = new RegExp(`\\b${identifier}\\s*\\(`, 'g');
  for (const match of source.matchAll(expression)) {
    const open = match.index + match[0].lastIndexOf('(');
    // Start lexical masking at this call boundary. This avoids an unrelated
    // earlier template/regular-expression literal contaminating the balanced
    // argument result while still preventing commas inside regex literals from
    // being mistaken for argument separators.
    const local = maskRegexLiterals(source.slice(open));
    const call = readCallArguments(local, 0);
    calls.push({ start: match.index, end: open + call.end, args: call.args });
  }
  return calls;
}

function quotedLiteral(value) {
  const match = String(value || '').trim().match(/^(["'])([\s\S]*)\1$/);
  return match ? match[2] : null;
}

function messageTypeFromPayload(value) {
  const match = String(value || '').match(/^\s*\{\s*(?:type|["']type["'])\s*:\s*(["'])([A-Za-z_][A-Za-z0-9_]*)\1/);
  return match ? match[2] : null;
}

function consumerTypesIn(source) {
  return [...source.matchAll(/\b(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*(?:\?\.|\.)type\s*(?:===|==|!==|!=)\s*(["'])((?:ST_[A-Z0-9_]+|__[a-z0-9_]+))\1/g)]
    .map(match => match[2]);
}

function callbackParameter(callback) {
  const functionMatch = callback.match(/^\s*function(?:\s+[A-Za-z_$][\w$]*)?\s*\(\s*([A-Za-z_$][\w$]*)/);
  if (functionMatch) return functionMatch[1];
  const arrowMatch = callback.match(/^\s*(?:\(\s*([A-Za-z_$][\w$]*)\s*\)|([A-Za-z_$][\w$]*))\s*=>/);
  return arrowMatch ? (arrowMatch[1] || arrowMatch[2]) : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function inspectJavaScript(source, { mask = true } = {}) {
  const active = mask ? maskCommentsAndTemplates(maskRegexLiterals(source)) : source;
  const postMessageCalls = identifierCalls(active, 'postMessage');
  const producerCallDetails = postMessageCalls.map(call => ({
    type: messageTypeFromPayload(call.args[0]),
    wildcardTarget: quotedLiteral(call.args[1]) === '*'
  }));
  const producerTypes = producerCallDetails.map(call => call.type).filter(Boolean);
  const consumerTypes = consumerTypesIn(active);
  const lexicalTokens = [...source.matchAll(/\bST_[A-Z0-9_]+\b/g)].map(match => match[0]);
  const messageListenerDetails = identifierCalls(active, 'addEventListener')
    .filter(call => quotedLiteral(call.args[0]) === 'message')
    .map(call => {
      const callback = call.args[1] || '';
      const callbackConsumerTypes = unique(consumerTypesIn(callback));
      const firstTypeIndex = callbackConsumerTypes.reduce((earliest, type) => {
        const index = callback.indexOf(type);
        return index >= 0 && index < earliest ? index : earliest;
      }, Number.POSITIVE_INFINITY);
      const parameter = callbackParameter(callback);
      const parameterPattern = parameter ? escapeRegExp(parameter) : null;
      const sourceIndex = parameterPattern === null
        ? -1
        : callback.search(new RegExp(`\\b${parameterPattern}\\.source\\s*(?:===|==|!==|!=)`));
      const originIndex = parameterPattern === null
        ? -1
        : callback.search(new RegExp(`\\b${parameterPattern}\\.origin\\s*(?:===|==|!==|!=)`));
      return {
        consumerTypes: callbackConsumerTypes,
        sourceGuard: sourceIndex >= 0 && sourceIndex < firstTypeIndex,
        originGuard: originIndex >= 0 && originIndex < firstTypeIndex
      };
    });
  return {
    producerCounts: frequency(producerTypes),
    producerCallDetails,
    consumerCounts: frequency(consumerTypes),
    lexicalTokens: unique(lexicalTokens),
    postMessageCalls: postMessageCalls.length,
    classifiedProducerCalls: producerTypes.length,
    wildcardPostMessageCalls: postMessageCalls.filter(call => quotedLiteral(call.args[1]) === '*').length,
    messageListeners: messageListenerDetails.length,
    messageListenerDetails,
    sourceChecks: count(active, /\.source\s*(?:===|==|!==|!=)/g),
    originChecks: count(active, /\.origin\s*(?:===|==|!==|!=)/g)
  };
}

export function lifecycleCounts(source) {
  return {
    timeouts: count(source, /\bsetTimeout\s*\(/g),
    clearTimeouts: count(source, /\bclearTimeout\s*\(/g),
    intervals: count(source, /\bsetInterval\s*\(/g),
    clearIntervals: count(source, /\bclearInterval\s*\(/g),
    mutationObservers: count(source, /\bnew\s+MutationObserver\s*\(/g),
    observerDisconnects: count(source, /\.disconnect\s*\(/g),
    eventListeners: count(source, /\baddEventListener\s*\(/g),
    removedEventListeners: count(source, /\bremoveEventListener\s*\(/g),
    resizeListeners: count(source, /addEventListener\s*\(\s*["']resize["']/g)
  };
}

function mergeSites(target, counts, sourcePath) {
  for (const [type, occurrences] of Object.entries(counts)) {
    if (!target[type]) target[type] = [];
    target[type].push({ path: sourcePath, occurrences });
  }
}

function orderedSites(sites) {
  return Object.fromEntries(Object.entries(sites)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, values]) => [type, values.sort((left, right) => left.path.localeCompare(right.path))]));
}

function sumLifecycle(rows) {
  const keys = Object.keys(lifecycleCounts(''));
  return Object.fromEntries(keys.map(key => [key, rows.reduce((total, row) => total + row.lifecycle[key], 0)]));
}

function addLifecycle(...values) {
  const keys = Object.keys(lifecycleCounts(''));
  return Object.fromEntries(keys.map(key => [key, values.reduce((total, value) => total + (value?.[key] || 0), 0)]));
}

function hasLifecycle(value) {
  return Object.values(value).some(occurrences => occurrences > 0);
}

function readManifest(root) {
  const manifestPath = path.join(root, 'www', 'module-manifest.js');
  delete require.cache[require.resolve(manifestPath)];
  return require(manifestPath);
}

function markerIndex(source, marker) {
  const first = source.indexOf(marker);
  const duplicate = first < 0 ? -1 : source.indexOf(marker, first + marker.length);
  if (first < 0 || duplicate >= 0) {
    throw new Error(`MAH-4 shell marker must occur exactly once: ${marker}`);
  }
  return first;
}

export function splitShellInlinePrograms(inline) {
  const startMarker = 'function injectModuleHideCSS';
  const endMarker = 'function openModal()';
  const start = markerIndex(inline, startMarker);
  const end = markerIndex(inline, endMarker);
  if (end <= start) throw new Error('MAH-4 shell dormant range markers are reversed');
  return {
    active: `${inline.slice(0, start)}${' '.repeat(end - start)}${inline.slice(end)}`,
    dormant: inline.slice(start, end)
  };
}

function htmlUnit(root, relativePath, role, moduleId = null) {
  const absolutePath = path.join(root, 'www', ...relativePath.split('/'));
  const bytes = fs.readFileSync(absolutePath);
  const html = bytes.toString('utf8');
  const inline = inlineJavaScript(html);
  // Module entries are the active documents themselves. Keep their complete
  // inline programs: some business templates contain nested backticks that a
  // lightweight mask cannot parse, while none of the entries generates a
  // second dormant module program like the shell does.
  let active = inline;
  let dormant = '';
  if (role === 'shell') {
    // Schema-1 records always use src. Remove the retained generator block
    // from the active shell view without asking a lightweight lexer to parse
    // its deliberately fragmented nested <script> template strings.
    ({ active, dormant } = splitShellInlinePrograms(inline));
  }
  return {
    role,
    moduleId,
    path: `www/${relativePath}`,
    relativePath,
    bytes: bytes.length,
    sha256: sha256(bytes),
    raw: html,
    active,
    dormant,
    scripts: scriptSources(html),
    messages: inspectJavaScript(active, { mask: false }),
    lifecycle: lifecycleCounts(inline),
    activeLifecycle: lifecycleCounts(active),
    dormantLifecycle: lifecycleCounts(dormant)
  };
}

function walkSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkSourceFiles(absolutePath) : [absolutePath];
  });
}

function firstQuotedReferenceIndex(source, reference) {
  const single = source.indexOf(`'${reference}'`);
  const double = source.indexOf(`"${reference}"`);
  if (single < 0) return double;
  if (double < 0) return single;
  return Math.min(single, double);
}

function exactSiteCounts(rows) {
  return Object.fromEntries(rows.filter(row => row.occurrences > 0)
    .map(row => [row.path, row.occurrences])
    .sort(([left], [right]) => left.localeCompare(right)));
}

function createDynamicLocalInventory(root, shell, loadedAssets) {
  const ownerSources = new Map([
    ['index.html', shell.active],
    ['saagar-report.js', fs.readFileSync(path.join(root, 'www', 'saagar-report.js'), 'utf8')]
  ]);
  let scriptLiteralReferenceCount = 0;
  const loaderGroups = DYNAMIC_LOADER_GROUPS.map(group => {
    const source = ownerSources.get(group.owner);
    if (source === undefined) throw new Error(`MAH-4 dynamic loader owner is not inventoried: ${group.owner}`);
    const assetPaths = [...group.coreAssetPaths, ...group.optionalAssetPaths];
    let previousCoreIndex = -1;
    for (const assetPath of group.coreAssetPaths) {
      const index = firstQuotedReferenceIndex(source, assetPath);
      if (index < 0 || index <= previousCoreIndex) {
        throw new Error(`MAH-4 dynamic loader core order drift: ${group.id}`);
      }
      previousCoreIndex = index;
    }
    const literalCounts = Object.fromEntries(assetPaths.map(assetPath => {
      const expression = new RegExp(`(["'])${escapeRegExp(assetPath)}\\1`, 'g');
      const occurrences = count(source, expression);
      const expected = group.mechanisms.includes('document-write-fallback') ? 2 : 1;
      if (occurrences !== expected) {
        throw new Error(`MAH-4 dynamic loader reference drift: ${group.id}/${assetPath}`);
      }
      scriptLiteralReferenceCount += occurrences;
      resolveLocalScript(group.owner, assetPath);
      return [assetPath, occurrences];
    }));
    return {
      id: group.id,
      owner: `www/${group.owner}`,
      trigger: group.trigger,
      mechanisms: [...group.mechanisms],
      coreAssetPaths: group.coreAssetPaths.map(assetPath => `www/${assetPath}`),
      optionalAssetPaths: group.optionalAssetPaths.map(assetPath => `www/${assetPath}`),
      literalCounts: Object.fromEntries(Object.entries(literalCounts).map(([assetPath, occurrences]) => [
        `www/${assetPath}`, occurrences
      ]))
    };
  });
  if (scriptLiteralReferenceCount !== 12) {
    throw new Error('MAH-4 dynamic script literal count drift');
  }

  const applicationSources = walkSourceFiles(path.join(root, 'www'))
    .filter(absolutePath => /\.(?:html|js)$/i.test(absolutePath))
    .map(absolutePath => {
      const relativePath = slash(path.relative(path.join(root, 'www'), absolutePath));
      if (DYNAMIC_VENDOR_ASSETS.has(relativePath)) return null;
      return {
        path: `www/${relativePath}`,
        source: relativePath === 'index.html' ? shell.active : fs.readFileSync(absolutePath, 'utf8')
      };
    })
    .filter(Boolean);
  const scriptCreateSites = exactSiteCounts(applicationSources.map(item => ({
    path: item.path,
    occurrences: count(item.source, /\bcreateElement\s*\(\s*(["'])script\1\s*\)/g)
  })));
  const documentWriteSites = exactSiteCounts(applicationSources.map(item => ({
    path: item.path,
    occurrences: count(item.source, /\bdocument\.write\s*\(/g)
  })));
  const dynamicImportSites = exactSiteCounts(applicationSources.map(item => ({
    path: item.path,
    occurrences: count(item.source, /\bimport\s*\(/g)
  })));
  const workerBindingSites = exactSiteCounts(applicationSources.map(item => ({
    path: item.path,
    occurrences: count(item.source, /\bGlobalWorkerOptions\.workerSrc\s*=/g)
  })));
  if (!isDeepStrictEqual(scriptCreateSites, {
    'www/index.html': 4,
    'www/saagar-report.js': 1
  }) || !isDeepStrictEqual(documentWriteSites, { 'www/index.html': 2 })
    || Object.keys(dynamicImportSites).length !== 0
    || !isDeepStrictEqual(workerBindingSites, { 'www/index.html': 1 })) {
    throw new Error('MAH-4 found an unaccounted dynamic code-loading sink');
  }

  const resourceLoaders = new Map();
  for (const group of DYNAMIC_LOADER_GROUPS) {
    for (const assetPath of [...group.coreAssetPaths, ...group.optionalAssetPaths]) {
      if (!resourceLoaders.has(assetPath)) resourceLoaders.set(assetPath, new Set());
      resourceLoaders.get(assetPath).add(group.id);
    }
  }
  for (const binding of DYNAMIC_WORKER_BINDINGS) {
    const source = ownerSources.get(binding.owner);
    if (!source || firstQuotedReferenceIndex(source, binding.assetPath) < 0) {
      throw new Error(`MAH-4 dynamic worker binding drift: ${binding.id}`);
    }
    resolveLocalScript(binding.owner, binding.assetPath);
    if (!resourceLoaders.has(binding.assetPath)) resourceLoaders.set(binding.assetPath, new Set());
    resourceLoaders.get(binding.assetPath).add(binding.id);
  }
  const resources = [...resourceLoaders.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([relativePath, loaders]) => {
      const absolutePath = path.join(root, 'www', ...relativePath.split('/'));
      const bytes = fs.readFileSync(absolutePath);
      const source = bytes.toString('utf8');
      return {
        path: `www/${relativePath}`,
        relativePath,
        kind: DYNAMIC_WORKER_BINDINGS.some(binding => binding.assetPath === relativePath) ? 'worker' : 'script',
        classification: DYNAMIC_VENDOR_ASSETS.has(relativePath) ? 'vendor' : 'application',
        bytes: bytes.length,
        sha256: sha256(bytes),
        loadedBy: [...loaders].sort(),
        messages: inspectJavaScript(source),
        lifecycle: lifecycleCounts(source),
        source
      };
    });
  const directOverlap = resources
    .filter(resource => resource.kind === 'script'
      && loadedAssets.some(asset => asset.relativePath === resource.relativePath))
    .map(resource => resource.path);
  if (directOverlap.length > 0) throw new Error('MAH-4 direct/dynamic script inventory overlap');
  for (const resource of resources.filter(resource => resource.classification === 'vendor')) {
    if (resource.messages.lexicalTokens.length > 0) {
      throw new Error(`MAH-4 vendor dynamic resource contains an ST token: ${resource.path}`);
    }
  }
  const dynamicMessageAssets = resources.filter(resource => resource.classification === 'application'
    && (Object.keys(resource.messages.producerCounts).length > 0
      || Object.keys(resource.messages.consumerCounts).length > 0));
  const dynamicPostMessageCalls = dynamicMessageAssets
    .reduce((total, asset) => total + asset.messages.postMessageCalls, 0);
  const dynamicClassifiedProducerCalls = dynamicMessageAssets
    .reduce((total, asset) => total + asset.messages.classifiedProducerCalls, 0);
  if (dynamicPostMessageCalls !== dynamicClassifiedProducerCalls) {
    throw new Error('MAH-4 found an unclassified application dynamic postMessage call');
  }

  const integration = resources.find(resource => resource.relativePath === 'integration-bridge.js');
  const whatsapp = loadedAssets.find(asset => asset.relativePath === 'whatsapp-share.js');
  if (!integration || !whatsapp) throw new Error('MAH-4 iframe hook owner is missing');
  const iframeLoadHookSites = [
    {
      id: 'shell-open-module', owner: 'www/index.html', sourceKind: 'active-inline',
      once: true, persistent: false, bindGuard: null, perDocumentGuard: null,
      valid: count(shell.active, /\b__f\.addEventListener\(\s*["']load["']/g) === 1
        && /\{\s*once\s*:\s*true\s*\}/.test(shell.active)
    },
    {
      id: 'integration-bridge-frame', owner: 'www/integration-bridge.js', sourceKind: 'dynamic-local-script',
      once: false, persistent: true, bindGuard: '__saagarBridgeBound', perDocumentGuard: null,
      valid: count(integration.source, /\bf\.addEventListener\(\s*["']load["']/g) === 1
        && /f\.__saagarBridgeBound\)return;\s*f\.__saagarBridgeBound=true/.test(integration.source)
    },
    {
      id: 'whatsapp-share-frame', owner: 'www/whatsapp-share.js', sourceKind: 'direct-entry-script',
      once: false, persistent: true, bindGuard: '__saagarBound', perDocumentGuard: '__saagarPrintHooked',
      valid: count(whatsapp.source || fs.readFileSync(path.join(root, 'www', 'whatsapp-share.js'), 'utf8'),
        /\bframe\.addEventListener\(\s*["']load["']/g) === 1
    }
  ];
  const whatsappSource = fs.readFileSync(path.join(root, 'www', 'whatsapp-share.js'), 'utf8');
  iframeLoadHookSites[2].valid = iframeLoadHookSites[2].valid
    && /frame\.__saagarBound\)\s*return;\s*frame\.__saagarBound\s*=\s*true/.test(whatsappSource)
    && /win\.__saagarPrintHooked\)\s*return;\s*win\.__saagarPrintHooked\s*=\s*true/.test(whatsappSource);
  const loadRemovalSites = count(shell.active, /removeEventListener\(\s*["']load["']/g)
    + count(integration.source, /removeEventListener\(\s*["']load["']/g)
    + count(whatsappSource, /removeEventListener\(\s*["']load["']/g);
  if (iframeLoadHookSites.some(site => !site.valid) || loadRemovalSites !== 0) {
    throw new Error('MAH-4 iframe load-hook contract drift');
  }

  const resourceRecords = resources.map(({ source, messages, ...resource }) => ({
    ...resource,
    stLexicalTokens: messages.lexicalTokens
  }));
  const dynamicMessageRecords = dynamicMessageAssets.map(({ source, ...asset }) => asset);

  return {
    loaderGroupCount: loaderGroups.length,
    scriptRouteCount: loaderGroups.reduce((total, group) =>
      total + group.coreAssetPaths.length + group.optionalAssetPaths.length, 0),
    uniqueScriptAssetCount: resourceRecords.filter(resource => resource.kind === 'script').length,
    scriptLiteralReferenceCount,
    injectionSinks: {
      createElementScript: Object.values(scriptCreateSites).reduce((total, value) => total + value, 0),
      documentWriteScript: Object.values(documentWriteSites).reduce((total, value) => total + value, 0),
      dynamicImport: 0,
      unclassified: 0,
      createElementSites: scriptCreateSites,
      documentWriteSites
    },
    loaderGroups,
    workerBindings: DYNAMIC_WORKER_BINDINGS.map(binding => ({
      id: binding.id,
      owner: `www/${binding.owner}`,
      path: `www/${binding.assetPath}`
    })),
    resources: resourceRecords,
    totalResourceBytes: resourceRecords.reduce((total, resource) => total + resource.bytes, 0),
    directScriptOverlap: directOverlap,
    dynamicMessageAssets: dynamicMessageRecords,
    dynamicPostMessageCalls,
    dynamicClassifiedProducerCalls,
    dynamicWildcardPostMessageCalls: dynamicMessageAssets
      .reduce((total, asset) => total + asset.messages.wildcardPostMessageCalls, 0),
    knownRejectedConfiguredRoutes: [{
      type: 'ST_OPEN_MODULE',
      path: 'www/integration-bridge.js',
      reason: 'shell-realm sender fails active-iframe source guard'
    }],
    iframeLoadHooks: {
      totalSites: iframeLoadHookSites.length,
      oneShotSites: iframeLoadHookSites.filter(site => site.once).length,
      persistentSites: iframeLoadHookSites.filter(site => site.persistent).length,
      removeLoadListenerSites: loadRemovalSites,
      sites: iframeLoadHookSites.map(({ valid, ...site }) => site)
    }
  };
}

export function createMah4Inventory(root = defaultRoot) {
  const manifest = readManifest(root);
  const shell = htmlUnit(root, 'index.html', 'shell');
  const modules = manifest.modules.map(module =>
    htmlUnit(root, resolveManifestEntry(module.src), 'module', module.id));
  const entries = [shell, ...modules];

  const loadedBy = new Map();
  for (const unit of entries) {
    for (const reference of unit.scripts) {
      const resolved = resolveLocalScript(unit.relativePath, reference);
      if (!loadedBy.has(resolved)) loadedBy.set(resolved, new Set());
      loadedBy.get(resolved).add(unit.moduleId || 'shell');
    }
  }

  const loadedAssets = [];
  for (const [relativePath, consumers] of [...loadedBy.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const absolutePath = path.join(root, 'www', ...relativePath.split('/'));
    const bytes = fs.readFileSync(absolutePath);
    const source = bytes.toString('utf8');
    const sourceSha256 = sha256(bytes);
    const pinnedOpaqueVendor = relativePath === 'vendor/read-excel-file-9.3.7.min.js'
      && sourceSha256 === '081c20d5feeb517b92397338c2696df872a0c9fd17922a05f2d864d877fa5c01';
    loadedAssets.push({
      path: `www/${relativePath}`,
      relativePath,
      bytes: bytes.length,
      sha256: sourceSha256,
      loadedBy: [...consumers].sort(),
      // This exact third-party worker bundle contains internal postMessage calls
      // that are unrelated to SAAGAR's shell protocol. Treat it as opaque only
      // while its pinned dependency hash matches; any byte drift is scanned and
      // fails closed like every other loaded asset.
      messages: pinnedOpaqueVendor ? inspectJavaScript('') : inspectJavaScript(source),
      lifecycle: lifecycleCounts(source)
    });
  }
  const loadedAssetByPath = new Map(loadedAssets.map(asset => [asset.relativePath, asset]));
  const messageAssets = loadedAssets.filter(asset =>
    Object.keys(asset.messages.producerCounts).length > 0
    || Object.keys(asset.messages.consumerCounts).length > 0);
  const lifecycleAssets = loadedAssets.filter(asset => hasLifecycle(asset.lifecycle));
  const dynamicLocal = createDynamicLocalInventory(root, shell, loadedAssets);

  const producerSites = {};
  const configuredProducerSites = {};
  const dynamicProducerSites = {};
  const aggregateProducerSites = {};
  const aggregateConfiguredProducerSites = {};
  const consumerSites = {};
  const lexicalTokens = [];
  let disabledConfiguredPostMessageCalls = 0;
  let disabledConfiguredWildcardPostMessageCalls = 0;
  for (const unit of entries) {
    mergeSites(producerSites, unit.messages.producerCounts, unit.path);
    mergeSites(aggregateProducerSites, unit.messages.producerCounts, unit.path);
    const configuredCounts = { ...unit.messages.producerCounts };
    if (unit.role === 'module' && /\bvar\s+steps\s*=\s*\[\s*\]\s*;/.test(unit.active)) {
      const disabledCalls = unit.messages.producerCallDetails.filter(call => call.type === 'ST_OPEN_MODULE');
      disabledConfiguredPostMessageCalls += disabledCalls.length;
      disabledConfiguredWildcardPostMessageCalls += disabledCalls.filter(call => call.wildcardTarget).length;
      delete configuredCounts.ST_OPEN_MODULE;
    }
    mergeSites(configuredProducerSites, configuredCounts, unit.path);
    mergeSites(aggregateConfiguredProducerSites, configuredCounts, unit.path);
    mergeSites(consumerSites, unit.messages.consumerCounts, unit.path);
    lexicalTokens.push(...unit.messages.lexicalTokens);
  }
  for (const asset of messageAssets) {
    mergeSites(producerSites, asset.messages.producerCounts, asset.path);
    mergeSites(aggregateProducerSites, asset.messages.producerCounts, asset.path);
    mergeSites(configuredProducerSites, asset.messages.producerCounts, asset.path);
    mergeSites(aggregateConfiguredProducerSites, asset.messages.producerCounts, asset.path);
    mergeSites(consumerSites, asset.messages.consumerCounts, asset.path);
    lexicalTokens.push(...asset.messages.lexicalTokens);
  }
  for (const asset of dynamicLocal.dynamicMessageAssets) {
    mergeSites(dynamicProducerSites, asset.messages.producerCounts, asset.path);
    mergeSites(aggregateProducerSites, asset.messages.producerCounts, asset.path);
    mergeSites(aggregateConfiguredProducerSites, asset.messages.producerCounts, asset.path);
    lexicalTokens.push(...asset.messages.lexicalTokens);
  }

  const activeStTypes = unique([
    ...Object.keys(producerSites).filter(type => type.startsWith('ST_')),
    ...Object.keys(consumerSites).filter(type => type.startsWith('ST_'))
  ]);
  const nonStProducers = Object.fromEntries(Object.entries(orderedSites(producerSites))
    .filter(([type]) => !type.startsWith('ST_')));
  const nonStConsumers = Object.fromEntries(Object.entries(orderedSites(consumerSites))
    .filter(([type]) => !type.startsWith('ST_')));

  const moduleLifecycle = modules.map(unit => ({
    id: unit.moduleId,
    path: unit.path,
    bytes: unit.bytes,
    sha256: unit.sha256,
    lifecycle: unit.lifecycle
  }));
  const directLifecycleFor = unit => addLifecycle(...unit.scripts.map(reference => {
    const resolved = resolveLocalScript(unit.relativePath, reference);
    return loadedAssetByPath.get(resolved)?.lifecycle;
  }));
  const effectiveLifecycleFor = (unit, entryLifecycle = unit.lifecycle) =>
    addLifecycle(entryLifecycle, directLifecycleFor(unit));
  const effectiveModuleLifecycle = modules.map(unit => ({
    id: unit.moduleId,
    path: unit.path,
    entryLifecycle: unit.lifecycle,
    directAssetLifecycle: directLifecycleFor(unit),
    lifecycle: effectiveLifecycleFor(unit)
  }));
  const mah3Path = path.join(root, 'verification', 'MAH3-SHARED-RUNTIME-BASELINE-PROFILE.json');
  const mah3Bytes = fs.readFileSync(mah3Path);
  const mah3 = JSON.parse(mah3Bytes.toString('utf8'));
  const wwwFingerprint = createWwwFingerprint(root);
  const effectiveModuleConsumers = Object.fromEntries(modules.map(unit => {
    const values = [...Object.keys(unit.messages.consumerCounts)];
    for (const reference of unit.scripts) {
      const resolved = resolveLocalScript(unit.relativePath, reference);
      const asset = messageAssets.find(item => item.relativePath === resolved);
      if (asset) values.push(...Object.keys(asset.messages.consumerCounts));
    }
    return [unit.moduleId, unique(values.filter(type => type.startsWith('ST_')))];
  }));

  const messageListenerSites = [];
  for (const item of [...entries, ...messageAssets]) {
    item.messages.messageListenerDetails.forEach((listener, listenerIndex) => {
      messageListenerSites.push({
        path: item.path,
        listenerIndex,
        consumerTypes: listener.consumerTypes,
        sourceGuard: listener.sourceGuard,
        originGuard: listener.originGuard
      });
    });
  }
  const consumerTrust = {};
  for (const listener of messageListenerSites) {
    for (const type of listener.consumerTypes) {
      if (!consumerTrust[type]) consumerTrust[type] = [];
      consumerTrust[type].push({
        path: listener.path,
        sourceGuard: listener.sourceGuard,
        originGuard: listener.originGuard
      });
    }
  }
  for (const sites of Object.values(consumerTrust)) sites.sort((left, right) => left.path.localeCompare(right.path));
  const sourceGuardFor = (type, sourcePath) => {
    const sites = (consumerTrust[type] || []).filter(site => site.path === sourcePath);
    return sites.length > 0 && sites.every(site => site.sourceGuard);
  };
  const syntacticPostMessageCalls = entries.reduce((total, unit) => total + unit.messages.postMessageCalls, 0)
    + messageAssets.reduce((total, unit) => total + unit.messages.postMessageCalls, 0);
  const classifiedProducerCalls = entries.reduce((total, unit) => total + unit.messages.classifiedProducerCalls, 0)
    + messageAssets.reduce((total, unit) => total + unit.messages.classifiedProducerCalls, 0);
  const syntacticWildcardPostMessageCalls = entries.reduce((total, unit) => total + unit.messages.wildcardPostMessageCalls, 0)
    + messageAssets.reduce((total, unit) => total + unit.messages.wildcardPostMessageCalls, 0);
  if (classifiedProducerCalls !== syntacticPostMessageCalls) {
    throw new Error('MAH-4 found an unclassified syntactic postMessage call');
  }
  const proposedControlTypesPresent = PROPOSED_CONTROL_TYPES.filter(type => activeStTypes.includes(type));
  const renderedCasesReviewed = mah3.review?.visualBaselinesCaptured === true ? mah3.matrix.minimumVisualCases : 0;
  const planningRuntimeWired = modules.find(unit => unit.moduleId === 'planning')?.scripts.includes('../../shared/mah4-runtime.js') === true;
  const allModulesRuntimeWired = modules.length === manifest.modules.length
    && modules.every(unit => unit.scripts.includes('../../shared/mah4-runtime.js'));
  const canaryPassed = name => {
    try {
      const evidence = JSON.parse(fs.readFileSync(path.join(root, 'verification', 'mah3-visual-review', `MAH3-${name}-CANARY-EVIDENCE-2026-08-07.json`), 'utf8'));
      return evidence.results?.reviewed === 12 && evidence.results?.passed === 12 && evidence.results?.defects === 0;
    } catch { return false; }
  };
  const dsrCanaryPassed = canaryPassed('DSR');
  const qmsCanaryPassed = canaryPassed('QMS');

  return {
    schemaVersion: 3,
    profileId: 'mah4-message-lifecycle-stage-a-2026-08-07',
    upstream: {
      mah3ProfilePath: 'verification/MAH3-SHARED-RUNTIME-BASELINE-PROFILE.json',
      mah3ProfileBytes: mah3Bytes.length,
      mah3ProfileSha256: sha256(mah3Bytes),
      mah3TreeSha256: mah3.sourceFingerprint.treeSha256,
      currentWwwTreeSha256: wwwFingerprint.treeSha256,
      currentWwwFileCount: wwwFingerprint.fileCount,
      currentWwwTotalBytes: wwwFingerprint.totalBytes,
      shell: { path: shell.path, bytes: shell.bytes, sha256: shell.sha256 },
      manifest: {
        path: 'www/module-manifest.js',
        schemaVersion: manifest.schemaVersion,
        moduleCount: manifest.modules.length
      }
    },
    protocol: {
      shellToModuleTypes: [...SHELL_TO_MODULE_TYPES],
      moduleToShellTypes: [...MODULE_TO_SHELL_TYPES],
      activeStTypes,
      lexicalStTokens: unique(lexicalTokens),
      producerSites: orderedSites(producerSites),
      configuredProducerSites: orderedSites(configuredProducerSites),
      dynamicProducerSites: orderedSites(dynamicProducerSites),
      aggregateProducerSites: orderedSites(aggregateProducerSites),
      aggregateConfiguredProducerSites: orderedSites(aggregateConfiguredProducerSites),
      consumerSites: orderedSites(consumerSites),
      consumerTrust: Object.fromEntries(Object.entries(consumerTrust).sort(([left], [right]) => left.localeCompare(right))),
      effectiveModuleConsumers,
      nonStProducers,
      nonStConsumers,
      directEntrySyntacticPostMessageCalls: syntacticPostMessageCalls,
      directEntryClassifiedProducerCalls: classifiedProducerCalls,
      directEntryConfiguredPostMessageCalls: syntacticPostMessageCalls - disabledConfiguredPostMessageCalls,
      directEntrySyntacticWildcardPostMessageCalls: syntacticWildcardPostMessageCalls,
      directEntryConfiguredWildcardPostMessageCalls: syntacticWildcardPostMessageCalls
        - disabledConfiguredWildcardPostMessageCalls,
      dynamicSyntacticPostMessageCalls: dynamicLocal.dynamicPostMessageCalls,
      dynamicClassifiedProducerCalls: dynamicLocal.dynamicClassifiedProducerCalls,
      dynamicConfiguredPostMessageCalls: dynamicLocal.dynamicPostMessageCalls,
      dynamicWildcardPostMessageCalls: dynamicLocal.dynamicWildcardPostMessageCalls,
      aggregateSyntacticPostMessageCalls: syntacticPostMessageCalls + dynamicLocal.dynamicPostMessageCalls,
      aggregateConfiguredPostMessageCalls: syntacticPostMessageCalls - disabledConfiguredPostMessageCalls
        + dynamicLocal.dynamicPostMessageCalls,
      aggregateWildcardPostMessageCalls: syntacticWildcardPostMessageCalls
        + dynamicLocal.dynamicWildcardPostMessageCalls,
      aggregateAcceptedConfiguredPostMessageCalls: syntacticPostMessageCalls - disabledConfiguredPostMessageCalls
        + dynamicLocal.dynamicPostMessageCalls - dynamicLocal.knownRejectedConfiguredRoutes.length,
      knownRejectedConfiguredRoutes: dynamicLocal.knownRejectedConfiguredRoutes,
      mainShellRouterSourceGuard: sourceGuardFor('ST_AUDIT', 'www/index.html'),
      sqliteAuditSourceGuard: sourceGuardFor('ST_AUDIT', 'www/sqlite-store.js'),
      shellOriginCheckPresent: messageListenerSites
        .filter(listener => listener.path === 'www/index.html')
        .some(listener => listener.originGuard),
      directLanguageReceiver: messageAssets.some(asset => asset.relativePath === 'app-i18n.js'
        && Object.hasOwn(asset.messages.consumerCounts, 'ST_LANG')),
      accessContextSourceGuardModules: modules
        .filter(unit => sourceGuardFor('ST_ACCESS_CONTEXT', unit.path))
        .map(unit => unit.moduleId),
      unsourcedSharedReceiverTypes: SHELL_TO_MODULE_TYPES.filter(type =>
        (consumerTrust[type] || []).some(site => !site.sourceGuard)),
      proposedControlTypesPresent
    },
    scriptDiscovery: {
      mode: 'direct-entry-script-tags-plus-explicit-dynamic-local-loader-inventory',
      directEntryScriptAssetCount: loadedAssets.length,
      dynamicLocalAssetsInventoried: true,
      parserLimitations: [
        'entry-template-interpolation-not-classified',
        'entry-program-comment-masking-disabled'
      ],
      dynamicLocal
    },
    directEntryMessageAssets: messageAssets,
    dynamicMessageAssets: dynamicLocal.dynamicMessageAssets,
    lifecycle: {
      shell: shell.lifecycle,
      activeShell: shell.activeLifecycle,
      dormantShell: shell.dormantLifecycle,
      moduleTotals: sumLifecycle(moduleLifecycle),
      modules: moduleLifecycle,
      uniqueDirectAssetTotals: sumLifecycle(lifecycleAssets),
      directAssets: lifecycleAssets.map(asset => ({
        path: asset.path,
        bytes: asset.bytes,
        sha256: asset.sha256,
        loadedBy: asset.loadedBy,
        lifecycle: asset.lifecycle
      })),
      effectiveShell: effectiveLifecycleFor(shell),
      configuredEffectiveShell: effectiveLifecycleFor(shell, shell.activeLifecycle),
      effectiveModuleTotals: sumLifecycle(effectiveModuleLifecycle),
      effectiveModules: effectiveModuleLifecycle,
      conditionalDynamicScriptTotals: sumLifecycle(dynamicLocal.resources
        .filter(resource => resource.kind === 'script').map(resource => ({ lifecycle: resource.lifecycle }))),
      conditionalDynamicWorkerTotals: sumLifecycle(dynamicLocal.resources
        .filter(resource => resource.kind === 'worker').map(resource => ({ lifecycle: resource.lifecycle }))),
      applicationDynamicTotals: sumLifecycle(dynamicLocal.resources
        .filter(resource => resource.classification === 'application').map(resource => ({ lifecycle: resource.lifecycle })))
    },
    mountLifecycle: {
      frameLoadHookPresent: /\b__f\.addEventListener\(\s*["']load["']/.test(shell.active),
      frameErrorHookPresent: /\b__f\.addEventListener\(\s*["']error["']/.test(shell.active),
      controlHandshakeAbsent: proposedControlTypesPresent.length === 0,
      closeRemovesSrc: /moduleFrame["']\)\.removeAttribute\(\s*["']src["']\s*\)/.test(shell.active),
      closeBlanksSrcdoc: /moduleFrame["']\)\.srcdoc\s*=\s*["']["']/.test(shell.active),
      dormantFallbackPresent: /if\(mod\.src\)[\s\S]*else\s*\{[\s\S]*buildModuleSrc\(mod\)/.test(shell.active),
      manifestRequiresSrc: manifest.modules.every(module => typeof module.src === 'string' && module.src.length > 0),
      manifestContainsHtmlB64: manifest.modules.some(module => Object.hasOwn(module, 'html_b64')),
      allProposedControlTypesObserved: proposedControlTypesPresent.length === PROPOSED_CONTROL_TYPES.length,
      iframeLoadHooks: dynamicLocal.iframeLoadHooks
    },
    gates: {
      mah3RenderedCasesReviewed: renderedCasesReviewed,
      mah3RenderedCaseTotal: 168,
      refactorGateReady: renderedCasesReviewed === 168 && dsrCanaryPassed && qmsCanaryPassed,
      planningRuntimeWired,
      dsrCanaryPassed,
      qmsCanaryPassed,
      mah4RuntimeImplemented: allModulesRuntimeWired
        && proposedControlTypesPresent.length === PROPOSED_CONTROL_TYPES.length,
      physicalDeviceAccepted: false,
      nativeLanguageAccepted: false,
      productionAccepted: false
    }
  };
}

function pathCoverage(sites) {
  return Object.fromEntries(Object.entries(sites).map(([type, values]) => [
    type,
    values.map(value => value.path)
  ]));
}

function stSites(sites) {
  return Object.fromEntries(Object.entries(sites).filter(([type]) => type.startsWith('ST_')));
}

export function createMah4Profile(root = defaultRoot) {
  const inventory = createMah4Inventory(root);
  const rawLifecycleById = Object.fromEntries(inventory.lifecycle.modules.map(module => [module.id, module.lifecycle]));
  const effectiveLifecycleById = Object.fromEntries(inventory.lifecycle.effectiveModules
    .map(module => [module.id, module.lifecycle]));
  const dynamic = inventory.scriptDiscovery.dynamicLocal;
  const stageAContractFiles = [
    fileIdentity(root, 'scripts/lib/mah4-protocol-contract.mjs'),
    fileIdentity(root, 'tests/mah4-protocol-contract.test.mjs')
  ];
  return {
    schemaVersion: inventory.schemaVersion,
    profileId: inventory.profileId,
    upstream: inventory.upstream,
    protocol: {
      shellToModuleTypes: inventory.protocol.shellToModuleTypes,
      moduleToShellTypes: inventory.protocol.moduleToShellTypes,
      activeStTypes: inventory.protocol.activeStTypes,
      lexicalStTokens: inventory.protocol.lexicalStTokens,
      directSyntacticProducerPaths: pathCoverage(stSites(inventory.protocol.producerSites)),
      directConfiguredProducerPaths: pathCoverage(stSites(inventory.protocol.configuredProducerSites)),
      dynamicProducerPaths: pathCoverage(stSites(inventory.protocol.dynamicProducerSites)),
      consumerPaths: pathCoverage(stSites(inventory.protocol.consumerSites)),
      consumerTrust: inventory.protocol.consumerTrust,
      effectiveModuleConsumers: inventory.protocol.effectiveModuleConsumers,
      nonStProducerPaths: pathCoverage(inventory.protocol.nonStProducers),
      nonStConsumerPaths: pathCoverage(inventory.protocol.nonStConsumers),
      directEntrySyntacticPostMessageCalls: inventory.protocol.directEntrySyntacticPostMessageCalls,
      directEntryClassifiedProducerCalls: inventory.protocol.directEntryClassifiedProducerCalls,
      directEntryConfiguredPostMessageCalls: inventory.protocol.directEntryConfiguredPostMessageCalls,
      directEntrySyntacticWildcardPostMessageCalls: inventory.protocol.directEntrySyntacticWildcardPostMessageCalls,
      directEntryConfiguredWildcardPostMessageCalls: inventory.protocol.directEntryConfiguredWildcardPostMessageCalls,
      dynamicSyntacticPostMessageCalls: inventory.protocol.dynamicSyntacticPostMessageCalls,
      dynamicClassifiedProducerCalls: inventory.protocol.dynamicClassifiedProducerCalls,
      dynamicConfiguredPostMessageCalls: inventory.protocol.dynamicConfiguredPostMessageCalls,
      dynamicWildcardPostMessageCalls: inventory.protocol.dynamicWildcardPostMessageCalls,
      aggregateSyntacticPostMessageCalls: inventory.protocol.aggregateSyntacticPostMessageCalls,
      aggregateConfiguredPostMessageCalls: inventory.protocol.aggregateConfiguredPostMessageCalls,
      aggregateWildcardPostMessageCalls: inventory.protocol.aggregateWildcardPostMessageCalls,
      aggregateAcceptedConfiguredPostMessageCalls: inventory.protocol.aggregateAcceptedConfiguredPostMessageCalls,
      knownRejectedConfiguredRoutes: inventory.protocol.knownRejectedConfiguredRoutes,
      mainShellRouterSourceGuard: inventory.protocol.mainShellRouterSourceGuard,
      sqliteAuditSourceGuard: inventory.protocol.sqliteAuditSourceGuard,
      shellOriginCheckPresent: inventory.protocol.shellOriginCheckPresent,
      directLanguageReceiver: inventory.protocol.directLanguageReceiver,
      accessContextSourceGuardModules: inventory.protocol.accessContextSourceGuardModules,
      unsourcedSharedReceiverTypes: inventory.protocol.unsourcedSharedReceiverTypes,
      proposedControlTypesPresent: inventory.protocol.proposedControlTypesPresent
    },
    scriptDiscovery: {
      mode: inventory.scriptDiscovery.mode,
      directEntryScriptAssetCount: inventory.scriptDiscovery.directEntryScriptAssetCount,
      dynamicLocalAssetsInventoried: inventory.scriptDiscovery.dynamicLocalAssetsInventoried,
      parserLimitations: inventory.scriptDiscovery.parserLimitations,
      dynamicLocal: {
        loaderGroupCount: dynamic.loaderGroupCount,
        scriptRouteCount: dynamic.scriptRouteCount,
        uniqueScriptAssetCount: dynamic.uniqueScriptAssetCount,
        scriptLiteralReferenceCount: dynamic.scriptLiteralReferenceCount,
        injectionSinks: dynamic.injectionSinks,
        loaderGroups: dynamic.loaderGroups,
        workerBindings: dynamic.workerBindings,
        resources: dynamic.resources.map(resource => ({
          path: resource.path,
          kind: resource.kind,
          classification: resource.classification,
          bytes: resource.bytes,
          sha256: resource.sha256,
          loadedBy: resource.loadedBy
        })),
        totalResourceBytes: dynamic.totalResourceBytes,
        directScriptOverlap: dynamic.directScriptOverlap
      }
    },
    directEntryMessageAssets: inventory.directEntryMessageAssets.map(asset => ({
      path: asset.path,
      bytes: asset.bytes,
      sha256: asset.sha256,
      loadedBy: asset.loadedBy,
      producerTypes: Object.keys(asset.messages.producerCounts),
      consumerTypes: Object.keys(asset.messages.consumerCounts)
    })),
    dynamicMessageAssets: inventory.dynamicMessageAssets.map(asset => ({
      path: asset.path,
      bytes: asset.bytes,
      sha256: asset.sha256,
      loadedBy: asset.loadedBy,
      producerTypes: Object.keys(asset.messages.producerCounts),
      consumerTypes: Object.keys(asset.messages.consumerCounts)
    })),
    lifecycle: {
      countingUnit: 'static-call-sites-not-runtime-resource-instances',
      rawInlineShellCallSites: inventory.lifecycle.shell,
      activeInlineShellCallSites: inventory.lifecycle.activeShell,
      dormantInlineShellCallSites: inventory.lifecycle.dormantShell,
      rawInlineModuleTotals: inventory.lifecycle.moduleTotals,
      uniqueDirectAssetCallSites: inventory.lifecycle.uniqueDirectAssetTotals,
      directLifecycleAssets: inventory.lifecycle.directAssets.map(asset => ({
        path: asset.path,
        bytes: asset.bytes,
        sha256: asset.sha256,
        loadedBy: asset.loadedBy
      })),
      rawShellPlusDirectAssetCallSites: inventory.lifecycle.effectiveShell,
      activeShellPlusDirectAssetCallSites: inventory.lifecycle.configuredEffectiveShell,
      directEffectiveModuleTotals: inventory.lifecycle.effectiveModuleTotals,
      conditionalDynamicScriptCallSites: inventory.lifecycle.conditionalDynamicScriptTotals,
      conditionalDynamicWorkerCallSites: inventory.lifecycle.conditionalDynamicWorkerTotals,
      applicationDynamicCallSites: inventory.lifecycle.applicationDynamicTotals,
      rawQmsCallSites: rawLifecycleById.qms,
      rawDsrCallSites: rawLifecycleById.dsr,
      directEffectiveQmsCallSites: effectiveLifecycleById.qms,
      directEffectiveDsrCallSites: effectiveLifecycleById.dsr,
      rawMutationObserverCallSitesByModule: Object.fromEntries(inventory.lifecycle.modules
        .map(module => [module.id, module.lifecycle.mutationObservers])),
      directEffectiveMutationObserverCallSitesByModule: Object.fromEntries(inventory.lifecycle.effectiveModules
        .map(module => [module.id, module.lifecycle.mutationObservers]))
    },
    mountLifecycle: inventory.mountLifecycle,
    stageAContractOracle: {
      status: 'non-product-executable-specification',
      runtimeLoaded: false,
      files: stageAContractFiles
    },
    gates: inventory.gates
  };
}

export function validateMah4Profile(root = defaultRoot, profilePath = path.join(root, 'verification', 'MAH4-MESSAGE-LIFECYCLE-BASELINE-PROFILE.json')) {
  const expected = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  const actual = createMah4Profile(root);
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error('MAH-4 message/lifecycle baseline profile does not match current source');
  }
  return actual;
}
