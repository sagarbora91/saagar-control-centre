#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellPath = path.join(root, 'www', 'index.html');
let shell = fs.readFileSync(shellPath, 'utf8');

function removeBetween(startMarker, endMarker, keepEnd = true) {
  const start = shell.indexOf(startMarker);
  const end = shell.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`Expected shell markers not found: ${startMarker} -> ${endMarker}`);
  }
  shell = shell.slice(0, start) + (keepEnd ? shell.slice(end) : shell.slice(end + endMarker.length));
}

removeBetween("/* Perf: building a module's iframe document", 'function openModule(id){');
removeBetween('function openModuleLegacy(id){', '/* Loader error affordance');
removeBetween('/* Insert a fragment before the LAST </body>', 'function openModal(){');

for (const retired of [
  'openModuleLegacy', 'buildModuleSrc', 'loadExternalModuleHtml',
  'injectModuleHideCSS', 'injectLegacyManagerPasswordGuard', 'injectModuleAccessBridge',
  'injectIframeShim', 'injectBackHome', 'injectEmployeeAssist', 'injectModuleAuditBridge',
  'injectUniformCSS', 'injectMobileMode', 'injectSafetyNet'
]) {
  if (shell.includes(`function ${retired}(`)) throw new Error(`Retired function remains: ${retired}`);
}

fs.writeFileSync(shellPath, shell, 'utf8');
process.stdout.write(`${JSON.stringify({ file: 'www/index.html', bytes: Buffer.byteLength(shell) })}\n`);
