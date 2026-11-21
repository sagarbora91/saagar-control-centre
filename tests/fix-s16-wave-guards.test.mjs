import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// S16 governance (fix wave 2026-11-12): guards that need no knowledge of any single fix.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

// FROZEN_AT_FIX_WAVE_START is written by the integrator at step I-0 from the real files (never typed by hand).
// Frozen history and tooling: the wave must never regenerate or edit any of these.
const FROZEN_AT_FIX_WAVE_START = {
  'scripts/audit/capture-mutations.mjs': '55de546d53e29c04a47ad22e6f9a47378b94693c483f97ac97808e621995fb9f',
  'scripts/audit/comparison.mjs': 'f62333c196e13ee45fc16ddd87ffbe9c36a5542ed7728a984d2f96295dd949b7',
  'scripts/audit/config.mjs': 'b54b6c746c76caa7714a49e3683430b9d63e0e99c4c3704204cec5396f68e937',
  'scripts/audit/lib.mjs': '4eec39a7832b70cb19ae79d2cf78d32b6435be865ae8c11ef04a3cac2883c2e2',
  'scripts/audit/runner-support.mjs': '155412469a03802fbc263426f88956884e58f8a78a775b3dd6f0338c3c462ec6',
  'tests/fixtures/phase6c/module-mobile-legacy.css': 'acc970dbe54fb99b0dfa25a2807fb3626ba11130fcd87969ca336d8000efa443',
  'tests/whole-app-audit-runner.test.mjs': '1d58c0cb53fa67f5e5db14ce4fb9281be002ac47feb33e6509102f2751592c79',
  'verification/MAH3-SHARED-RUNTIME-BASELINE-PROFILE.json': '3233df39b36a63dc83d62dbb0f7955f502ff0531d21404f6340dc986b9d7306a',
  'verification/MAH4-MESSAGE-LIFECYCLE-BASELINE-PROFILE.json': 'f143ecbc7012e9cb8f142bb003441a5152aaae20a64abe06d587b0fa7312870a',
  'verification/MAH4-STAGE-B-RENDERED-RUNTIME-EVIDENCE-2026-08-07.json': '06ede72fa4179c268a9d8db655b5e01558b8afb0f3e209b54060f6657d87483b',
  'verification/MH1-MODULAR-PROTECTION-PROFILE.json': '47b104630f4f9928f394a02567b42a641850766c94dc207acf8fbe59ab729623',
  'verification/audit/PHASE-6C-CURRENT-SOURCE-PROFILE-2026-08-24.json': '98f25e597c57901989ba5509b336c7f5d6def8ba324ce6b088352e0c5c87738f',
  'verification/audit/PHASE-6C-PLANNING-VISUAL-RECEIPT-2026-08-24.json': 'e0819699593fd2bf8e882ad7fd720598d2857fb04530dd170a513481dd3ec913',
  'verification/audit/PHASE-6I-SOURCE-FREEZE-2026-08-24.json': '45f7f51bfd4ddf93e9cdd22528b97691c48303b9542105aebd6272c468c4324b',
  'verification/audit/PHASE-6I-SOURCE-FREEZE-2026-08-24.md': 'c60267f9f25445844bfdbe8370b6a013156527d495234c4a521a13a33db14d17',
  'verification/audit/approvals/2026-08-12-11bb84abc74c.json': '8f463cb7e68a85c543232ce2fdbfee0aec8188a7b58af09f7a94a9da5be115aa',
  'verification/audit/approvals/2026-08-12-9b54d5bd0036.json': '3106a9246eef04fc6c5f8da0acb56ce71f5b48c146126654ca71530f5ac93595',
  'verification/audit/approvals/2026-08-16-3f8a37cebf99.json': '4f92d42a696de732aad2d108e59c5ebebd0f2c996634b90b39c1a2c0c772c858',
  'verification/audit/approvals/2026-08-17-cc9a117c5245.json': 'fbce51a37b3026fc6ea2210d45cba054e5568f5fb2cfa289ffb13236ab7a0d3d',
  'verification/audit/approvals/ETP-CAPABILITY-DELTA-APPROVAL-2026-08-22.json': 'da5337f5b19f513bf98254494da4e489252c06d60c97c3da8a2435dccd4ef612',
  'verification/audit/approvals/ETP-CAPABILITY-DELTA-APPROVAL-2026-11-11.json': '8e8749463dc0c60c9c0fafcc7661d5f024108b88339a8846cad7e557793e459e',
  'verification/audit/approvals/ETP-ENGINE-BRIDGE-TABLET-SIDE-CAPABILITY-APPROVAL-2026-11-12.json': '4e812423055782cec06a8a9ca3f5dd8c5b7f1a95f11f1bb1e2124ee0efc8a237',
  'verification/audit/approvals/ETP-EXCEPTIONS-APPROVAL-2026-08-22.json': '1db38dbc11d73b014fae96332ae7c11492a4c1f54b421855f297b6889ded7405',
  'verification/audit/approvals/ETP-LOCALIZATION-APPROVAL-2026-08-21.json': '77776928c66bc27f255812ed58bdb78fed756f6f7f335326106342d5d73ab987',
  'verification/audit/approvals/GATE-UPDATE-PHYSICAL-APPROVAL-2026-08-22.json': '9875a978062dccd905f93c4610d8348c2acf77736ddbcdbe9d88372792e66260',
  'verification/audit/approvals/MAH3-ETP-VISUAL-APPROVAL-2026-08-22.json': 'e48ba79490ff1ac24adee1e1c2aa677393a2bfd4f6525dfe19dbc494cd34c0e1',
  'verification/audit/approvals/PHASE-4-PAYMENTTYPE25-QUARANTINE-APPROVAL-2026-08-21.json': 'aed75215b351e141e6cbf99c92deca036f96c6fec8a52c677bee232149a9c277',
  'verification/audit/approvals/PHASE-4A-NATIVE-LANGUAGE-APPROVAL-2026-08-16.json': '40cdbd0078155b50ccb776d1a17ef7075c75c7d9ab5dbec786dc3d87e1095cb9',
  'verification/audit/approvals/PHASE-4B-NATIVE-LANGUAGE-APPROVAL-2026-08-16.json': '2da51e5ca86db35c2cc112fd0bfd8fec1256917b3111aa4e999ae08b60055978',
  'verification/audit/approvals/PHASE-4C1-NATIVE-LANGUAGE-APPROVAL-2026-08-17.json': '9e290f1313790f274ba450f1aa8d343858a3ebfd06d4c0586335f5020b82f458',
  'verification/audit/approvals/PHASE-5-A104F5F-IDENTITY-REBIND-APPROVAL-2026-08-22.json': 'eee44432f7b75b67c60645d59e3b58784f328437724b363e456e1911b6df490d',
  'verification/audit/approvals/PHASE-5-ROLE-ASSIGNMENT-2026-08-22.json': '0d39197c44a4bdf9ed2de1905c68b02bd8b656b724475331ecb609146269af8a',
  'verification/audit/approvals/PHASE-5C-NATIVE-LANGUAGE-APPROVAL-2026-08-22.json': '35f50bedf3fb9bbed8ab01d1da4531dc2938db7cd58978d8e459bcedae376719',
  'verification/audit/approvals/SHELL-SEARCH-AND-ETP-LOADER-CAPABILITY-APPROVAL-2026-11-12.json': '9a58ca7a85950f44f966acda5c49dbe14c00eedf15ae323eef749c9ce192bfc9',
  'verification/audit/approvals/WAVE-7-RELEASE-READINESS-ADDENDUM-2026-11-12.json': 'cb9e8ab58c807580ea44899eefa6511ea1e7f2ab384e663a02f0f183336fe852',
  'verification/mah3-visual-review/MAH3-DSR-CANARY-EVIDENCE-2026-08-07.json': 'ce3a6f046d57cff839139b7320904058186e6711d38a08ebd4df6fd06234f481',
  'verification/mah3-visual-review/MAH3-PLANNING-CANARY-EVIDENCE-2026-08-07.json': 'bb7aefdab06351a3b39c5d24bc9a69df7ad841754d7bab700555a053d82ecdba',
  'verification/mah3-visual-review/MAH3-QMS-CANARY-EVIDENCE-2026-08-07.json': '7b4aaabeae40e153fa53b4a327964ea45795348c5b4f0b1cfd139278b5baf512',
  'verification/mah3-visual-review/MAH3-VISUAL-REVIEW-EVIDENCE-2026-08-07.json': 'c34a623190db688f869c8e07462957de5eec35d0d88a668abb928208faa38305',
};

test('frozen history artefacts and audit tooling are byte-identical to the wave start', () => {
  const entries = Object.entries(FROZEN_AT_FIX_WAVE_START);
  assert.ok(entries.length >= 20, 'the frozen table is empty: the integrator must generate it at step I-0');
  for (const [rel, expected] of entries) assert.equal(sha256(fs.readFileSync(path.join(root, rel))), expected, `${rel} was regenerated or edited`);
});

test('www/index.html stays strictly below the 580,636-byte limit', () => {
  const bytes = fs.statSync(path.join(root, 'www/index.html')).size;
  assert.ok(bytes < 580636, `www/index.html is ${bytes} bytes`);
});

test('every fix-wave test file is declared in the test:fix-wave package script', () => {
  const pkgText = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  const script = JSON.parse(pkgText).scripts['test:fix-wave'];
  assert.equal(typeof script, 'string', 'package.json has no test:fix-wave script');
  const files = fs.readdirSync(path.join(root, 'tests')).filter(name => /^fix-.*\.test\.mjs$/i.test(name));
  assert.ok(files.length >= 10, 'expected the wave test files to be present');
  for (const name of files) assert.ok(script.includes(`tests/${name}`), `${name} is not in test:fix-wave`);
});
