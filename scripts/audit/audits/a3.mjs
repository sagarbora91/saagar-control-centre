import { CURRENT_AUTHORITY_DOCUMENTS } from '../config.mjs';
import { auditResult, makeCheck, sha256 } from '../lib.mjs';

const MAX_FUNCTIONS = 4000;
const MAX_CAPABILITIES = 2500;
const MAX_UNRESOLVED_EVIDENCE = 50;
const MAX_HOSTS = 5000;

function lineAt(text, offset) {
  return text.slice(0, Math.max(0, offset)).split(/\r?\n/).length;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slug(value) {
  const normalized = String(value || '').normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return normalized || `h-${sha256(String(value || '')).slice(0, 16)}`;
}

/* The value is read with the OPPOSITE quote allowed inside it. A single
   character class such as ([^"']*) cannot express that, and silently returned
   '' for every value containing the other quote — which in this product means
   almost every real inline handler, because handlers take string arguments:
   onclick="llKey('1')" resolved to no binding at all. `handlerStrippedAttributes`
   below already used the correct alternation; this is the same idiom. */
function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  const value = match ? (match[1] !== undefined ? match[1] : match[2]) : '';
  return value.trim();
}

function maskElementContent(source, names) {
  const expression = new RegExp(`<(${names.join('|')})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'gi');
  return source.replace(expression, value => value.replace(/[^\r\n]/g, ' '))
    .replace(/<!--[\s\S]*?-->/g, value => value.replace(/[^\r\n]/g, ' '));
}

function htmlSurfaces(context) {
  const result = [];
  if (context.exists('www/index.html')) result.push({ id: 'shell', file: 'www/index.html', source: context.read('www/index.html') });
  for (const module of context.modules) result.push({ id: module.id, file: module.file, source: module.html });
  return result;
}

function firstPartyScriptSurfaces(context) {
  return context.productFiles
    .filter(file => /^www\/.+\.m?js$/i.test(file))
    .filter(file => !/^www\/(?:vendor|fonts)\//i.test(file) && !/\.(?:min|bundle)\.js$/i.test(file) &&
      file !== 'www/sql-wasm.js')
    .sort()
    .map(file => ({ id: `script-${slug(file.replace(/^www\//, '').replace(/\.m?js$/i, ''))}`,
      file, source: context.read(file) }));
}

function semanticSurfaces(context) {
  return [...htmlSurfaces(context), ...firstPartyScriptSurfaces(context)];
}

function normalizeExpression(value) {
  return String(value || '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\r\n]*/g, ' ')
    .replace(/\s+/g, ' ').replace(/;+$/, '').trim();
}

/* Comments are skipped. Without this an apostrophe inside a comment — English
   possessives and quoted words are common, e.g. "Stock's own brands" or
   "'titanworld'" — opened a phantom string that consumed the rest of the scan.
   matchingBrace then returned -1 and handlerRegistry silently dropped that
   function, so genuinely defined handlers were reported as unresolved. */
function matchingBrace(source, open) {
  let depth = 0, quote = '', escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) return -1;
      index = end + 1;
      continue;
    }
    if (character === '/' && source[index + 1] === '/') {
      const end = source.indexOf('\n', index + 2);
      if (end < 0) return -1;
      index = end;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') { quote = character; continue; }
    if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return index;
  }
  return -1;
}

function scriptSegments(file, source) {
  if (!/\.html?$/i.test(file)) return [{ source, offset: 0 }];
  const result = [];
  for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    result.push({ source: match[1], offset: match.index + match[0].indexOf('>') + 1 });
  }
  return result;
}

function functionInventory(context) {
  const inventory = [];
  const declaration = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  const assignment = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|(?:\([^;{}]*\)|[A-Za-z_$][\w$]*)\s*=>)/g;
  for (const surface of semanticSurfaces(context)) {
    for (const segment of scriptSegments(surface.file, surface.source)) {
      for (const match of segment.source.matchAll(declaration)) {
        inventory.push({ functionId: `${surface.id}:function:${slug(match[1])}:${sha256(`${surface.file}:${segment.offset + match.index}`).slice(0, 10)}`,
          name: match[1], surface: surface.id, path: surface.file, line: lineAt(surface.source, segment.offset + match.index), kind: 'declaration' });
      }
      for (const match of segment.source.matchAll(assignment)) {
        inventory.push({ functionId: `${surface.id}:function:${slug(match[1])}:${sha256(`${surface.file}:${segment.offset + match.index}`).slice(0, 10)}`,
          name: match[1], surface: surface.id, path: surface.file, line: lineAt(surface.source, segment.offset + match.index), kind: 'assignment' });
      }
    }
  }
  return inventory.sort((a, b) => a.functionId.localeCompare(b.functionId));
}

function handlerRegistry(context) {
  const handlers = new Map();
  const add = (name, body) => {
    const normalized = normalizeExpression(body);
    if (!normalized) return;
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name).add(sha256(normalized));
  };
  for (const surface of semanticSurfaces(context)) for (const segment of scriptSegments(surface.file, surface.source)) {
    const patterns = [
      /\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g,
      /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\s*\([^)]*\)|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)\s*\{/g,
      /\b(?:window|root|globalThis)\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\s*\([^)]*\)\s*\{/g
    ];
    for (const pattern of patterns) for (const match of segment.source.matchAll(pattern)) {
      const open = segment.source.indexOf('{', match.index);
      const close = matchingBrace(segment.source, open);
      if (close > open) add(match[1], segment.source.slice(open + 1, close));
    }
    for (const match of segment.source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*([^;\r\n{}]{1,500})/g)) {
      add(match[1], match[2]);
    }
  }
  return new Map([...handlers.entries()].map(([name, hashes]) => [name, [...hashes].sort()]));
}

const NON_HANDLER_CALLS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return',
  'preventDefault', 'stopPropagation', 'trim', 'toLowerCase', 'toUpperCase', 'String', 'Number', 'Boolean',
  /* Literals and operators can precede '(' in a real expression and are never
     handler names: onclick="x ? f() : null" previously yielded 'null'. */
  'null', 'undefined', 'true', 'false', 'typeof', 'void', 'delete', 'new', 'in', 'of', 'else', 'do', 'try']);

/* A qualified call names a contract on another object — SaagarReport.openHub(),
   document.getElementById(...).click(). Its method name is NOT a top-level
   handler and must not be looked up as one; doing so reported working controls
   as unresolved. The qualified names are still captured, so a change to the
   called contract remains visible to before/after comparison. */
function handlerNames(normalized) {
  const bare = new Set();
  const qualified = new Set();
  for (const match of normalized.matchAll(/(\.\s*)?\b([A-Za-z_$][\w$]*)\s*(?=\()/g)) {
    if (match[1]) { qualified.add(match[2]); continue; }
    if (!NON_HANDLER_CALLS.has(match[2])) bare.add(match[2]);
  }
  return { bare, qualified };
}

function eventBinding(event, kind, expression, handlers, native = false) {
  const normalized = normalizeExpression(expression);
  const names = new Set();
  let qualifiedCalls = [];
  if (!native) {
    const extracted = handlerNames(normalized);
    for (const name of extracted.bare) names.add(name);
    qualifiedCalls = [...extracted.qualified].sort();
    if (/^[A-Za-z_$][\w$]*$/.test(normalized)) names.add(normalized);
  }
  const unknown = [...names].filter(name => !handlers.has(name)).sort();
  const referencedHandlers = [...names].filter(name => handlers.has(name)).sort()
    .flatMap(name => handlers.get(name).map(bodySha256 => ({ name, bodySha256 })));
  return { event, kind, expressionSha256: sha256(normalized), referencedHandlers, qualifiedCalls,
    unresolved: !native && (unknown.length > 0 ||
      (/^[A-Za-z_$][\w$]*$/.test(normalized) && !referencedHandlers.length)) };
}

function addIndexedBinding(index, id, binding) {
  if (!id) return;
  if (!index.has(id)) index.set(id, []);
  index.get(id).push(binding);
}

function selectorEventBindings(context, handlers) {
  const index = new Map();
  for (const surface of semanticSurfaces(context)) for (const segment of scriptSegments(surface.file, surface.source)) {
    const source = segment.source;
    /* An alias binds only from its own assignment until that identifier is
       assigned again. A single Map keyed by name attributed EVERY later
       `name.addEventListener(...)` in the segment to the first element the name
       ever referred to — and short names such as `b` are reused constantly, so
       unrelated handlers were attributed to whichever element happened to be
       first. Assignments to something other than a document lookup invalidate
       the alias rather than silently keeping the stale element. */
    const aliasTimeline = new Map();
    const noteAlias = (name, offset, id) => {
      if (!aliasTimeline.has(name)) aliasTimeline.set(name, []);
      aliasTimeline.get(name).push({ offset, id });
    };
    for (const match of source.matchAll(/\b(?:const|let|var\s+|)\s*([A-Za-z_$][\w$]*)\s*=\s*([^;\r\n]{0,200})/g)) {
      const selector = /^document\s*\.\s*(getElementById|querySelector)\s*\(\s*(['"])([^'"]+)\2\s*\)/.exec(match[2]);
      if (!selector) { noteAlias(match[1], match.index, ''); continue; }
      const id = selector[1] === 'querySelector' ? (/^#([A-Za-z][\w:.-]*)$/.exec(selector[3])?.[1] || '') : selector[3];
      noteAlias(match[1], match.index, id);
    }
    for (const entries of aliasTimeline.values()) entries.sort((a, b) => a.offset - b.offset);
    const aliasAt = (name, offset) => {
      const entries = aliasTimeline.get(name);
      if (!entries) return '';
      let current = '';
      for (const entry of entries) { if (entry.offset > offset) break; current = entry.id; }
      return current;
    };
    const aliases = new Map();
    for (const [name, entries] of aliasTimeline) if (entries.some(entry => entry.id)) aliases.set(name, name);
    const directAdd = [
      /document\s*\.\s*getElementById\s*\(\s*(['"])([^'"]+)\1\s*\)\s*\.\s*addEventListener\s*\(\s*(['"])(click|change|submit|input)\3\s*,\s*([^,\)\r\n]{1,500})/g,
      /document\s*\.\s*querySelector\s*\(\s*(['"])#([A-Za-z][\w:.-]*)\1\s*\)\s*\.\s*addEventListener\s*\(\s*(['"])(click|change|submit|input)\3\s*,\s*([^,\)\r\n]{1,500})/g
    ];
    for (const pattern of directAdd) for (const match of source.matchAll(pattern)) {
      addIndexedBinding(index, match[2], eventBinding(match[4], 'addEventListener', match[5], handlers));
    }
    const directOn = [
      /document\s*\.\s*getElementById\s*\(\s*(['"])([^'"]+)\1\s*\)\s*\.\s*on(click|change|submit|input)\s*=\s*([^;\r\n]{1,500})/g,
      /document\s*\.\s*querySelector\s*\(\s*(['"])#([A-Za-z][\w:.-]*)\1\s*\)\s*\.\s*on(click|change|submit|input)\s*=\s*([^;\r\n]{1,500})/g
    ];
    for (const pattern of directOn) for (const match of source.matchAll(pattern)) {
      addIndexedBinding(index, match[2], eventBinding(match[3], 'event-property', match[4], handlers));
    }
    for (const alias of aliases.keys()) {
      const escaped = escapeRegExp(alias);
      const add = new RegExp(`\\b${escaped}\\s*\\.\\s*addEventListener\\s*\\(\\s*(['"])(click|change|submit|input)\\1\\s*,\\s*([^,\\)\\r\\n]{1,500})`, 'g');
      for (const match of source.matchAll(add)) addIndexedBinding(index, aliasAt(alias, match.index),
        eventBinding(match[2], 'alias-addEventListener', match[3], handlers));
      const assign = new RegExp(`\\b${escaped}\\s*\\.\\s*on(click|change|submit|input)\\s*=\\s*([^;\\r\\n]{1,500})`, 'g');
      for (const match of source.matchAll(assign)) addIndexedBinding(index, aliasAt(alias, match.index),
        eventBinding(match[1], 'alias-event-property', match[2], handlers));
    }
  }
  return index;
}

function handlerStrippedAttributes(value) {
  return String(value || '').replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function actionKey(source, match) {
  const tag = match[1].toLowerCase();
  const attrs = match[2];
  const id = attribute(attrs, 'id');
  const name = attribute(attrs, 'name');
  const action = attribute(attrs, 'data-action');
  const href = attribute(attrs, 'href');
  const aria = attribute(attrs, 'aria-label');
  const title = attribute(attrs, 'title');
  let text = '';
  if (tag === 'button' || tag === 'a' || tag === 'summary' || tag === 'form') {
    const close = source.slice(match.index + match[0].length).match(new RegExp(`^([\\s\\S]{0,500}?)<\\/${tag}\\s*>`, 'i'));
    if (close) text = close[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  }
  const stableAttributes = handlerStrippedAttributes(attrs);
  return { key: id || name || action || href || aria || title || text || `${tag}:${sha256(stableAttributes).slice(0, 14)}`,
    id, stableAttributesSha256: sha256(stableAttributes) };
}

function enclosingFormExpression(source, offset, attrs) {
  const explicit = attribute(attrs, 'form');
  if (explicit) return `form=${explicit}`;
  const before = source.slice(0, offset);
  const open = [...before.matchAll(/<form\b([^>]*)>/gi)].pop();
  if (!open || before.lastIndexOf('</form') > open.index) return '';
  const formAttrs = open[1];
  return `form=${attribute(formAttrs, 'id')};method=${attribute(formAttrs, 'method') || 'get'};action=${attribute(formAttrs, 'action') || 'current'}`;
}

function visibleActions(surface, handlers, indexedBindings) {
  const markup = maskElementContent(surface.source, ['script', 'style', 'template']);
  const actions = [];
  const unresolved = [];
  const tagPattern = /<(button|a|summary|input|select|form)\b([^>]*)>/gi;
  for (const match of markup.matchAll(tagPattern)) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const identity = actionKey(markup, match);
    const type = attribute(attrs, 'type').toLowerCase();
    const bindings = [];
    for (const event of ['click', 'change', 'submit', 'input']) {
      const expression = attribute(attrs, `on${event}`);
      if (expression) bindings.push(eventBinding(event, 'inline-event', expression, handlers));
    }
    if (identity.id && indexedBindings.has(identity.id)) bindings.push(...indexedBindings.get(identity.id));
    const href = attribute(attrs, 'href');
    if (tag === 'a' && href) bindings.push(eventBinding('navigate', 'native-href', href, handlers, true));
    if (tag === 'summary') bindings.push(eventBinding('toggle', 'native-summary', 'details-toggle', handlers, true));
    if (tag === 'form') bindings.push(eventBinding('submit', 'native-form',
      `method=${attribute(attrs, 'method') || 'get'};action=${attribute(attrs, 'action') || 'current'}`, handlers, true));
    if ((tag === 'button' || tag === 'input') && /^(?:submit|reset|image)$/.test(type)) {
      bindings.push(eventBinding(type === 'reset' ? 'reset' : 'submit', `native-form-${type || 'submit'}`,
        enclosingFormExpression(markup, match.index, attrs) || 'form=current', handlers, true));
    }
    if (tag === 'a' && !href && attribute(attrs, 'role').toLowerCase() !== 'button' && !bindings.length) continue;
    if (tag === 'input' && !/^(?:button|submit|reset|image)$/.test(type) && !bindings.length) continue;
    /* A select or textarea carrying no event binding is a form value control
       read at submit time, exactly like the bindingless non-button input
       excluded on the line above. Including one and excluding the other was an
       inconsistency that reported ordinary form fields as unbound actions. A
       select that DOES carry a binding is still inventoried as an action. */
    if ((tag === 'select' || tag === 'textarea') && !bindings.length) continue;
    const contracts = bindings.map(({ unresolved: ignored, ...binding }) => binding)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const signature = `${tag}\0${type}\0${identity.key}\0${identity.stableAttributesSha256}`;
    const action = {
      capabilityId: `${surface.id}:action:${slug(identity.key)}:${sha256(signature).slice(0, 10)}`,
      category: 'visible-action', surface: surface.id, path: surface.file,
      line: lineAt(surface.source, match.index), outcome: { element: tag, type: type || undefined, bindings: contracts }
    };
    actions.push(action);
    if (!bindings.length || bindings.some(binding => binding.unresolved)) unresolved.push({ path: surface.file,
      line: action.line, capabilityId: action.capabilityId, code: 'ACTION_HANDLER_BINDING_UNRESOLVED' });
  }
  return { actions, unresolved };
}

function permissionCapabilities(surface) {
  const rules = [
    { id: 'reauthentication', pattern: /\bSaagarReauth\b/, outcome: 'sensitive action requires explicit reauthentication contract' },
    { id: 'owner-session', pattern: /\b(?:SaagarOwnerSession|isSuperAdmin|ownerOnly)\b/i, outcome: 'owner-session or owner-only decision is consulted' },
    { id: 'access-context', pattern: /\b(?:ST_ACCESS_CONTEXT|SaagarAccess|accessContext)\b/, outcome: 'shell access context participates in permission decisions' },
    { id: 'role-policy', pattern: /\b(?:canAccess|hasPermission|requireRole|roleAllows)\b/i, outcome: 'role policy participates in access decisions' }
  ];
  return rules.filter(rule => rule.pattern.test(surface.source)).map(rule => ({
    capabilityId: `${surface.id}:permission:${rule.id}`,
    category: 'permission', surface: surface.id, path: surface.file, outcome: rule.outcome
  }));
}

function localStringConstants(source) {
  const constants = new Map();
  for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Z][A-Z0-9_]{2,})\s*=\s*(['"])([^'"\r\n]{1,200})\2/g)) {
    constants.set(match[1], match[3]);
  }
  return constants;
}

function persistenceCapabilities(surface) {
  const constants = localStringConstants(surface.source);
  const calls = /\b(?:localStorage\s*\.\s*setItem|safeSet|store\s*\.\s*set)\s*\(\s*([^,\n\r)]+)/g;
  const result = [];
  for (const match of surface.source.matchAll(calls)) {
    const expression = match[1].trim();
    const literal = expression.match(/^(['"])([^'"]+)\1$/);
    const identifier = expression.match(/^[A-Z][A-Z0-9_]{2,}$/);
    const resolved = literal ? literal[2] : identifier && constants.get(identifier[0]);
    const identity = resolved || expression.replace(/\s+/g, ' ').slice(0, 160);
    result.push({
      capabilityId: `${surface.id}:persist:${sha256(identity).slice(0, 20)}`,
      category: 'persisted-outcome', surface: surface.id, path: surface.file,
      line: lineAt(surface.source, match.index),
      outcome: { operation: 'write', keyIdentitySha256: sha256(identity),
        keyBinding: resolved ? (identifier ? identifier[0] : 'literal') : 'computed' }
    });
  }
  return result;
}

function failureCapability(surface) {
  const catches = [...surface.source.matchAll(/\bcatch\s*(?:\([^)]*\))?\s*\{/g)].length;
  const swallowed = [...surface.source.matchAll(/\bcatch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\s*)?\}/g)].length;
  const throws = [...surface.source.matchAll(/\bthrow\s+(?:new\s+)?[A-Za-z_$]/g)].length;
  const userVisible = [...surface.source.matchAll(/\b(?:toast|alert|showError|renderError|ST_ERROR)\b/g)].length;
  const fallbacks = [...surface.source.matchAll(/\b(?:fallback|return\s+(?:null|false|\[\]|\{\}))\b/gi)].length;
  return {
    capabilityId: `${surface.id}:failure:posture`, category: 'failure-posture',
    surface: surface.id, path: surface.file,
    outcome: { catchBlocks: catches, swallowedCatchBlocks: swallowed, throwSites: throws,
      userVisibleErrorSites: userVisible, explicitFallbackSites: fallbacks }
  };
}

function semanticCapabilities(context) {
  const all = [];
  const unresolvedActions = [];
  const handlers = handlerRegistry(context);
  const indexedBindings = selectorEventBindings(context, handlers);
  all.push({ capabilityId: 'shell:route:home', category: 'route', surface: 'shell', path: 'www/index.html',
    outcome: 'loads the offline application shell' });
  for (const module of context.modules) {
    all.push({ capabilityId: `${module.id}:route:entry`, category: 'route', surface: module.id, path: module.file,
      outcome: `loads manifest-bound module ${module.id}` });
  }
  for (const surface of htmlSurfaces(context)) {
    const visible = visibleActions(surface, handlers, indexedBindings);
    all.push(...visible.actions);
    unresolvedActions.push(...visible.unresolved);
  }
  for (const surface of semanticSurfaces(context)) {
    all.push(...permissionCapabilities(surface));
    all.push(...persistenceCapabilities(surface));
    all.push(failureCapability(surface));
  }

  const byId = new Map();
  const conflicts = [];
  for (const capability of all) {
    if (!byId.has(capability.capabilityId)) {
      byId.set(capability.capabilityId, { ...capability, occurrences: 1 });
      continue;
    }
    const existing = byId.get(capability.capabilityId);
    if (JSON.stringify(existing.outcome) !== JSON.stringify(capability.outcome) || existing.category !== capability.category) {
      conflicts.push({ capabilityId: capability.capabilityId, path: capability.path });
    } else existing.occurrences += 1;
  }
  const capabilities = [...byId.values()].sort((a, b) => a.capabilityId.localeCompare(b.capabilityId));
  const categoryCounts = Object.fromEntries(['route', 'visible-action', 'permission', 'persisted-outcome', 'failure-posture']
    .map(category => [category, capabilities.filter(item => item.category === category).length]));
  const actionlessModules = context.modules.filter(module => !capabilities.some(item => item.surface === module.id && item.category === 'visible-action'))
    .map(module => module.id);
  const missingCategories = Object.entries(categoryCounts).filter(([, count]) => count === 0).map(([category]) => category);
  return { capabilities, conflicts, categoryCounts, actionlessModules, missingCategories, unresolvedActions,
    overflow: capabilities.length > MAX_CAPABILITIES };
}

function hostInventory(context) {
  const missing = [];
  const uncertain = [];
  const unused = [];
  let definitions = 0;
  let references = 0;
  for (const surface of htmlSurfaces(context)) {
    const defs = new Map();
    const addDefinition = (id, offset, kind) => {
      if (!defs.has(id)) defs.set(id, []);
      defs.get(id).push({ offset, kind });
    };
    for (const match of surface.source.matchAll(/\bid\s*=\s*(['"])([^'"\s<>]{1,160})\1/gi)) addDefinition(match[2], match.index, 'attribute');
    for (const match of surface.source.matchAll(/\.id\s*=\s*(['"])([^'"\r\n]{1,160})\1/g)) addDefinition(match[2], match.index, 'property');
    for (const match of surface.source.matchAll(/\.setAttribute\(\s*(['"])id\1\s*,\s*(['"])([^'"\r\n]{1,160})\2\s*\)/g)) addDefinition(match[3], match.index, 'setAttribute');
    definitions += defs.size;

    const direct = [];
    for (const match of surface.source.matchAll(/document\.getElementById\(\s*(['"])([^'"]+)\1\s*\)\s*\.\s*([A-Za-z_$][\w$]*)/g)) {
      direct.push({ id: match[2], offset: match.index, member: match[3], kind: 'getElementById-dereference' });
    }
    for (const match of surface.source.matchAll(/document\.querySelector\(\s*(['"])#([A-Za-z][\w:.-]*)\1\s*\)\s*\.\s*([A-Za-z_$][\w$]*)/g)) {
      direct.push({ id: match[2], offset: match.index, member: match[3], kind: 'querySelector-dereference' });
    }
    references += direct.length;
    for (const ref of direct) {
      if (defs.has(ref.id)) continue;
      const quotedOccurrences = [...surface.source.matchAll(new RegExp(`(["'])${escapeRegExp(ref.id)}\\1`, 'g'))].length;
      const item = { path: surface.file, line: lineAt(surface.source, ref.offset), host: ref.id,
        member: ref.member, kind: ref.kind };
      if (quotedOccurrences <= 1) missing.push(item);
      else uncertain.push(item);
    }

    for (const [id, sites] of defs) {
      const quotedOccurrences = [...surface.source.matchAll(new RegExp(`(["'])${escapeRegExp(id)}\\1`, 'g'))].length;
      const selectorOccurrences = [...surface.source.matchAll(new RegExp(`#${escapeRegExp(id)}(?![A-Za-z0-9_-])`, 'g'))].length;
      if (quotedOccurrences <= sites.length && selectorOccurrences === 0) {
        unused.push({ path: surface.file, line: lineAt(surface.source, sites[0].offset), host: id,
          definitionKind: sites[0].kind });
      }
    }
  }
  return { definitions, references, missing, uncertain, unused,
    overflow: definitions > MAX_HOSTS };
}

function documentedClaims(context) {
  const claims = new Map();
  const unavailable = [];
  const patterns = [
    /\bcapabilityId\s*[:=]\s*[`'"]([a-z][a-z0-9_.-]*:[a-z0-9_.:-]+)[`'"]/gi,
    /`(capability:[a-z0-9_.:-]+)`/gi
  ];
  for (const file of CURRENT_AUTHORITY_DOCUMENTS) {
    if (!context.exists(file)) { unavailable.push(file); continue; }
    const source = context.read(file);
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const id = match[1].startsWith('capability:') ? match[1].slice('capability:'.length) : match[1];
        if (!claims.has(id)) claims.set(id, []);
        claims.get(id).push({ path: file, line: lineAt(source, match.index) });
      }
    }
  }
  return { claims: [...claims.entries()].map(([capabilityId, sites]) => ({ capabilityId, sites })).sort((a, b) => a.capabilityId.localeCompare(b.capabilityId)),
    unavailable };
}

export async function run(context) {
  const functions = functionInventory(context);
  const semantic = semanticCapabilities(context);
  const hosts = hostInventory(context);
  const documented = documentedClaims(context);
  const capabilityIds = new Set(semantic.capabilities.map(item => item.capabilityId));
  const missingDocumented = documented.claims.filter(item => !capabilityIds.has(item.capabilityId));
  /* A3-02's verdict is about the STABILITY AND UNIQUENESS OF CAPABILITY IDS,
     because that inventory is the before/after acceptance oracle for the
     migration. Anything that makes an ID ambiguous, missing or truncated still
     blocks: an overflowed inventory, a duplicate ID carrying a different
     outcome, an empty category, or a module with no actions at all.

     An unresolved action BINDING does not affect ID identity — IDs derive from
     tag, type, key and stable attributes, never from the handler. Binding
     resolution is heuristic static discovery over inline handlers, aliases and
     delegation, and it cannot be completed without full JavaScript lexing;
     requiring zero unresolved bindings made a mandatory gate permanently
     unsatisfiable and hid the ID-stability signal it exists to provide.
     Unresolved bindings are therefore reported as bounded evidence and as an
     explicit metric, never silently dropped, but they no longer veto the
     verdict. Owner decision, 2026-08-10. */
  const semanticBlockingCauses = [
    ...(semantic.overflow ? ['CAPABILITY_INVENTORY_LIMIT_EXCEEDED'] : []),
    ...(semantic.conflicts.length ? ['CAPABILITY_ID_CONFLICT'] : []),
    ...(semantic.missingCategories.length ? ['CAPABILITY_CATEGORY_EMPTY'] : []),
    ...(semantic.actionlessModules.length ? ['MODULE_ACTION_INVENTORY_EMPTY'] : [])
  ];
  const semanticIncomplete = semanticBlockingCauses.length > 0;
  const documentedResult = documented.unavailable.length || documented.claims.length === 0
    ? 'unmeasured' : missingDocumented.length ? 'fail' : 'pass';

  const checks = [
    makeCheck({
      id: 'A3-01', title: 'Internal function inventory',
      result: functions.length > MAX_FUNCTIONS ? 'unmeasured' : 'pass', severity: 'INFO', mandatory: false,
      metric: { functions: functions.length, functionLimit: MAX_FUNCTIONS,
        inventory: functions.slice(0, MAX_FUNCTIONS), inventorySha256: sha256(JSON.stringify(functions)) },
      rule: 'Produce a deterministic internal function inventory; function identity is informational and may change during migration.',
      evidence: functions.length > MAX_FUNCTIONS ? [{ code: 'FUNCTION_INVENTORY_LIMIT_EXCEEDED', functions: functions.length, limit: MAX_FUNCTIONS }] : [],
      notes: 'The inventory includes named declarations and functions assigned to local variables in shipped shell/module scripts.'
    }),
    makeCheck({
      id: 'A3-02', title: 'Stable semantic capability inventory',
      result: semanticIncomplete ? 'unmeasured' : 'pass', severity: 'P1', mandatory: true,
      metric: { capabilities: semantic.capabilities.length, capabilityLimit: MAX_CAPABILITIES,
        categories: semantic.categoryCounts, inventory: semantic.capabilities.slice(0, MAX_CAPABILITIES),
        inventorySha256: sha256(JSON.stringify(semantic.capabilities)), actionlessModules: semantic.actionlessModules,
        missingCategories: semantic.missingCategories, conflictingIds: semantic.conflicts.length,
        unresolvedActionBindings: semantic.unresolvedActions.length,
        /* Exactly why the verdict is unmeasured. Empty means the inventory is
           stable and unique; unresolved bindings never appear here. */
        blockingCauses: semanticBlockingCauses },
      rule: 'Generate stable, unique capability IDs for routes, visible actions, permissions, persisted outcomes and failure posture. A duplicate ID carrying a different outcome, an empty category, an actionless module or an overflowed inventory is not measurable. Unresolved action bindings are reported as evidence and do not decide the verdict.',
      evidence: [
        ...semantic.conflicts.map(item => ({ path: item.path, code: 'CAPABILITY_ID_CONFLICT', capabilityId: item.capabilityId })),
        ...semantic.actionlessModules.map(moduleId => ({ code: 'MODULE_ACTION_INVENTORY_EMPTY', moduleId })),
        ...semantic.missingCategories.map(category => ({ code: 'CAPABILITY_CATEGORY_EMPTY', category })),
        /* Bounded so that verdict-deciding rows can never be crowded out of the
           evidence array. A previous run reported 23 conflicts in the metric but
           surfaced only 10, because unresolved rows consumed the shared cap. */
        ...semantic.unresolvedActions.slice(0, MAX_UNRESOLVED_EVIDENCE),
        ...(semantic.unresolvedActions.length > MAX_UNRESOLVED_EVIDENCE
          ? [{ code: 'UNRESOLVED_ACTION_BINDING_EVIDENCE_TRUNCATED',
            unresolved: semantic.unresolvedActions.length, shown: MAX_UNRESOLVED_EVIDENCE }]
          : []),
        ...(semantic.overflow ? [{ code: 'CAPABILITY_INVENTORY_LIMIT_EXCEEDED', capabilities: semantic.capabilities.length, limit: MAX_CAPABILITIES }] : [])
      ],
      notes: semanticIncomplete
        ? `The capability inventory is not measurable: ${semanticBlockingCauses.join(', ')}.`
        : `Capability IDs describe behavior-facing surfaces; internal function names are deliberately excluded. ${semantic.unresolvedActions.length} action binding(s) could not be statically resolved; they are reported as evidence and do not affect ID stability.`
    }),
    makeCheck({
      id: 'A3-03', title: 'DOM host/reference reconciliation',
      result: hosts.overflow ? 'unmeasured' : hosts.missing.length ? 'fail' : 'pass', severity: 'P0', mandatory: true,
      metric: { definedHosts: hosts.definitions, directDereferences: hosts.references,
        definiteMissingHosts: hosts.missing.length, uncertainDynamicHosts: hosts.uncertain.length,
        hostLimit: MAX_HOSTS },
      rule: 'A literal DOM host that is directly dereferenced must have a definite declaration in the same shell or module document.',
      evidence: hosts.overflow ? [{ code: 'DOM_HOST_LIMIT_EXCEEDED', definitions: hosts.definitions, limit: MAX_HOSTS }]
        : hosts.missing.map(item => ({ ...item, code: 'DEFINITE_DOM_HOST_MISSING' })),
      notes: 'Potential dynamically-created hosts with another literal occurrence are counted as uncertain and do not create a P0 without proof.'
    }),
    makeCheck({
      id: 'A3-04', title: 'Defined-never-referenced candidates', result: 'pass', severity: 'INFO', mandatory: false,
      metric: { candidates: hosts.unused.length, candidateSha256: sha256(JSON.stringify(hosts.unused)),
        inventory: hosts.unused.slice(0, 500) },
      rule: 'Inventory literal DOM host definitions with no static string or ID-selector reference beyond their definition.',
      evidence: hosts.unused.map(item => ({ ...item, code: 'DEFINED_HOST_WITHOUT_STATIC_REFERENCE' })),
      notes: hosts.unused.length > 500 ? 'The metric contains the first 500 deterministic candidates; the complete inventory is represented by its SHA-256.' : 'Candidates are informational because dynamic lookup may be legitimate.'
    }),
    makeCheck({
      id: 'A3-05', title: 'Documented capability without implementation',
      result: documentedResult, severity: 'P1', mandatory: true,
      metric: { authoritativeDocuments: CURRENT_AUTHORITY_DOCUMENTS.length,
        unavailableDocuments: documented.unavailable.length, machineReadableClaims: documented.claims.length,
        missingImplementations: missingDocumented.length },
      rule: 'Every stable capabilityId declared by a current-authority document must exist in the measured semantic capability inventory.',
      evidence: documented.unavailable.map(path => ({ path, code: 'CURRENT_AUTHORITY_DOCUMENT_UNAVAILABLE' }))
        .concat(documented.claims.length === 0 ? [{ code: 'MACHINE_READABLE_CAPABILITY_DECLARATIONS_ABSENT' }] : [])
        .concat(missingDocumented.flatMap(item => item.sites.map(site => ({ ...site, code: 'DOCUMENTED_CAPABILITY_NOT_IMPLEMENTED',
          capabilityId: item.capabilityId })))),
      notes: documented.claims.length === 0 ? 'Current-authority prose has no stable machine-readable capability declarations; absence cannot be converted into a pass.' : ''
    })
  ];

  return auditResult('A3', 'Semantic capability inventory', checks, {
    functionInventorySha256: sha256(JSON.stringify(functions)),
    capabilityInventorySha256: sha256(JSON.stringify(semantic.capabilities)),
    hostInventorySha256: sha256(JSON.stringify({ missing: hosts.missing, uncertain: hosts.uncertain, unused: hosts.unused }))
  });
}
