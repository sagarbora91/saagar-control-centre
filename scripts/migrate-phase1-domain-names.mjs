#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const changes=[
  ['www/etp-core-contract.js','VERSION','ETP_CORE_VERSION'],
  ['www/etp-retail-profile.js','VERSION','ETP_PROFILE_VERSION'],
  ['www/etp-recovery-integration.js','CONTRACT_VERSION','ETP_RECOVERY_CONTRACT_VERSION'],
  ['www/storage-capacity-policy.js','CONTRACT_VERSION','CAPACITY_CONTRACT_VERSION'],
  ['www/storage-recovery-policy.js','CONTRACT_VERSION','RECOVERY_CONTRACT_VERSION'],
  ['www/sqlite-store.js','LOG_KEY','SQLITE_LOG_KEY'],
  ['www/storage-core.js','LOG_KEY','STORAGE_LOG_KEY']
];
for(const [relative,before,after] of changes){const file=path.join(root,relative);let source=fs.readFileSync(file,'utf8');if(!new RegExp(`\\b${before}\\b`).test(source))throw new Error(`Missing ${before} in ${relative}`);source=source.replace(new RegExp(`\\b${before}\\b`,'g'),after);fs.writeFileSync(file,source,'utf8');}
process.stdout.write(`${JSON.stringify({files:changes.length})}\n`);
