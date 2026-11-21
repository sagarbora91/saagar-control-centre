#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulesRoot = path.join(root, 'www', 'modules');
const replacements = [
  ['window.parent.WA_CFG', 'SaagarModuleBridge.waConfig'], ['parent.WA_CFG', 'SaagarModuleBridge.waConfig'],
  ['window.parent.SaagarAdminPinCheck', 'SaagarModuleBridge.adminPinCheck'], ['parent.SaagarAdminPinCheck', 'SaagarModuleBridge.adminPinCheck'],
  ['window.parent.SaagarDsrCompletionPolicy', 'SaagarModuleBridge.dsrCompletionPolicy'], ['parent.SaagarDsrCompletionPolicy', 'SaagarModuleBridge.dsrCompletionPolicy'],
  ['window.SaagarDsrCompletionPolicy', 'SaagarModuleBridge.dsrCompletionPolicy'],
  ['window.parent.SaagarOwnerSession', 'SaagarModuleBridge.ownerSession'], ['parent.SaagarOwnerSession', 'SaagarModuleBridge.ownerSession'],
  ['window.parent.SaagarShare', 'SaagarModuleBridge.share'], ['parent.SaagarShare', 'SaagarModuleBridge.share'],
  ['window.parent.shareText', 'SaagarModuleBridge.shareText'], ['parent.shareText', 'SaagarModuleBridge.shareText'],
  ['window.parent.localStorage', 'SaagarModuleBridge.sharedStorage'], ['parent.localStorage', 'SaagarModuleBridge.sharedStorage'],
  ['window.parent.SaagarEvidence', 'SaagarModuleBridge.evidence'], ['parent.SaagarEvidence', 'SaagarModuleBridge.evidence'], ['window.SaagarEvidence', 'SaagarModuleBridge.evidence'],
  ['window.parent.SaagarLegal', 'SaagarModuleBridge.legal'], ['parent.SaagarLegal', 'SaagarModuleBridge.legal'], ['window.SaagarLegal', 'SaagarModuleBridge.legal'],
  ['window.parent.SaagarReauth', 'SaagarModuleBridge.reauth'], ['parent.SaagarReauth', 'SaagarModuleBridge.reauth'], ['window.SaagarReauth', 'SaagarModuleBridge.reauth'],
  ['window.parent.SaagarReport', 'SaagarModuleBridge.report'], ['parent.SaagarReport', 'SaagarModuleBridge.report'], ['window.SaagarReport', 'SaagarModuleBridge.report'],
  ['window.parent.SaagarServicePersistence', 'SaagarModuleBridge.servicePersistence'], ['parent.SaagarServicePersistence', 'SaagarModuleBridge.servicePersistence'], ['window.SaagarServicePersistence', 'SaagarModuleBridge.servicePersistence'],
  ['window.parent.SaagarServiceWorkboardPolicy', 'SaagarModuleBridge.serviceWorkboardPolicy'], ['parent.SaagarServiceWorkboardPolicy', 'SaagarModuleBridge.serviceWorkboardPolicy'], ['window.SaagarServiceWorkboardPolicy', 'SaagarModuleBridge.serviceWorkboardPolicy'],
  ['window.parent.SaagarQmsPersistence', 'SaagarModuleBridge.qmsPersistence'], ['parent.SaagarQmsPersistence', 'SaagarModuleBridge.qmsPersistence'], ['window.SaagarQmsPersistence', 'SaagarModuleBridge.qmsPersistence'],
  ['window.parent.SaagarQmsPolicy', 'SaagarModuleBridge.qmsPolicy'], ['parent.SaagarQmsPolicy', 'SaagarModuleBridge.qmsPolicy'], ['window.SaagarQmsPolicy', 'SaagarModuleBridge.qmsPolicy'],
  ['window.parent.qmsArchiveLookup', 'SaagarModuleBridge.qmsArchiveLookup'], ['parent.qmsArchiveLookup', 'SaagarModuleBridge.qmsArchiveLookup'],
  ['window.SaagarPhoto', 'SaagarModuleBridge.photo'],
  ['window.parent.JSZip', 'SaagarModuleBridge.jsZip'], ['parent.JSZip', 'SaagarModuleBridge.jsZip'],
  ['window.parent.ensureJSZip', 'SaagarModuleBridge.ensureJsZip'], ['parent.ensureJSZip', 'SaagarModuleBridge.ensureJsZip']
];

for (const id of fs.readdirSync(modulesRoot).sort()) {
  const file = path.join(modulesRoot, id, 'index.html');
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('../../shared/module-bridge.js')) {
    html = html.replace('<script src="../../shared/module-runtime.js"></script>', '<script src="../../shared/module-bridge.js"></script>\n<script src="../../shared/module-runtime.js"></script>');
  }
  for (const [from, to] of replacements) html = html.split(from).join(to);
  fs.writeFileSync(file, html, 'utf8');
}
