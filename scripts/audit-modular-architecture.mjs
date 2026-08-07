#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, '..');
const require = createRequire(import.meta.url);

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const count = (source, expression) => [...source.matchAll(expression)].length;
const unique = values => [...new Set(values)].sort();

function resources(html) {
  const values = [];
  for (const match of html.matchAll(/<(?:link|script)\b[^>]+(?:href|src)=["']([^"']+)["']/gi)) {
    values.push(match[1]);
  }
  return unique(values);
}

function storageKeys(html) {
  const values = [];
  const literal = /["']((?:saagar_|gm_|tanishq_|taxcal_|leavedesk_|payroll_|retail_queue_)[A-Za-z0-9_.:-]*)["']/g;
  for (const match of html.matchAll(literal)) values.push(match[1]);
  return unique(values);
}

function messages(html) {
  return unique([...html.matchAll(/\bST_[A-Z0-9_]+\b/g)].map(match => match[0]));
}

function parentGlobals(html) {
  return unique([...html.matchAll(/\bwindow\.parent\.([A-Za-z_$][\w$]*)/g)].map(match => match[1]));
}

function breakpoints(html) {
  return unique(
    [...html.matchAll(/@media[^{}]*\((?:min|max)-width:\s*(\d+)px\)/gi)]
      .map(match => Number(match[1]))
  ).sort((a, b) => a - b);
}

function readRegistry(root) {
  const shellPath = path.join(root, 'www', 'index.html');
  const manifestPath = path.join(root, 'www', 'module-manifest.js');
  const shell = fs.readFileSync(shellPath, 'utf8');
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = require(manifestPath);
  return {
    shellPath,
    shell,
    manifestPath,
    manifestBytes,
    manifestSchemaVersion: manifest.schemaVersion,
    modules: manifest.modules
  };
}

export function createInventory(root = defaultRoot) {
  const { shellPath, shell, manifestBytes, manifestSchemaVersion, modules } = readRegistry(root);
  const shellBytes = fs.readFileSync(shellPath);
  return {
    schemaVersion: 1,
    manifest: {
      path: 'www/module-manifest.js',
      schemaVersion: manifestSchemaVersion,
      bytes: manifestBytes.length,
      sha256: sha256(manifestBytes)
    },
    shell: {
      path: 'www/index.html',
      bytes: shellBytes.length,
      sha256: sha256(shellBytes),
      messages: messages(shell),
      timers: {
        timeouts: count(shell, /\bsetTimeout\s*\(/g),
        intervals: count(shell, /\bsetInterval\s*\(/g),
        mutationObservers: count(shell, /\bnew\s+MutationObserver\s*\(/g),
        resizeListeners: count(shell, /addEventListener\s*\(\s*["']resize["']/g)
      },
      breakpoints: breakpoints(shell)
    },
    modules: modules.map(module => {
      if (!module.src || module.html_b64) throw new Error(`module is not external: ${module.id}`);
      const absolutePath = path.join(root, 'www', module.src);
      const bytes = fs.readFileSync(absolutePath);
      const html = bytes.toString('utf8');
      return {
        id: module.id,
        path: `www/${module.src.replace(/\\/g, '/')}`,
        bytes: bytes.length,
        sha256: sha256(bytes),
        registryBytes: module.bytes,
        registrySha256: module.sha256,
        assets: resources(html),
        messages: messages(html),
        parentGlobals: parentGlobals(html),
        storageKeys: storageKeys(html),
        inlineScripts: count(html, /<script\b(?![^>]*\bsrc=)[^>]*>/gi),
        inlineStyles: count(html, /<style\b[^>]*>/gi),
        tables: count(html, /<table\b/gi),
        timers: {
          timeouts: count(html, /\bsetTimeout\s*\(/g),
          intervals: count(html, /\bsetInterval\s*\(/g),
          mutationObservers: count(html, /\bnew\s+MutationObserver\s*\(/g)
        },
        breakpoints: breakpoints(html),
        liveAccessContext: /id=["']st-v5-module-access-bridge["']/.test(html)
      };
    })
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  process.stdout.write(`${JSON.stringify(createInventory(), null, 2)}\n`);
}
