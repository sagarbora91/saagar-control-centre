#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMah4Profile } from './lib/mah4-contract-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'verification', 'MAH4-MESSAGE-LIFECYCLE-BASELINE-PROFILE.json');
fs.writeFileSync(target, `${JSON.stringify(createMah4Profile(root), null, 2)}\n`, 'utf8');
process.stdout.write(`${target}\n`);
