#!/usr/bin/env node
/* Make security-hardening AndroidManifest edits PERMANENT across Capacitor regeneration.
   `android/` is git-ignored (Capacitor regenerates it), so a `cap add`/regen reverts the
   source manifest to the AGP defaults. This script re-applies the deliberate hardening after
   `cap sync`, so the shipped APK always carries it. It PATCHES only the specific attribute
   (never rewrites the whole manifest), so plugin-merged permissions/receivers are untouched.

   Currently enforced:
     • android:allowBackup="false"  (audit sec-apk-2 — block `adb backup` exfiltration of the
       offline SQLite business/financial data).

   Idempotent + safe to run any number of times. If the manifest isn't present yet (fresh clone
   before `cap add`), it no-ops with a note. No new dependencies — Node stdlib only. */
'use strict';
const fs = require('fs');
const path = require('path');

const MANIFEST = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

function main() {
  if (!fs.existsSync(MANIFEST)) {
    console.log('[apply-overrides] AndroidManifest not found — run `npx cap add android` / `cap sync` first. Skipping:', MANIFEST);
    return; // exit 0: not an error during a partial setup
  }
  let xml = fs.readFileSync(MANIFEST, 'utf8');
  const before = xml;

  // android:allowBackup="false"
  if (/android:allowBackup\s*=\s*"true"/.test(xml)) {
    xml = xml.replace(/android:allowBackup\s*=\s*"true"/, 'android:allowBackup="false"');
  } else if (!/android:allowBackup\s*=/.test(xml)) {
    // attribute absent (AGP default is true) → inject it on the <application> element
    xml = xml.replace(/<application\b/, '<application\n        android:allowBackup="false"');
  }

  if (xml !== before) {
    fs.writeFileSync(MANIFEST, xml);
    console.log('[apply-overrides] set android:allowBackup="false"');
  } else {
    console.log('[apply-overrides] android:allowBackup already "false" — no change');
  }
}

main();
