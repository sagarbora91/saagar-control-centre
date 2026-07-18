#!/usr/bin/env node
/* Make security-hardening AndroidManifest edits PERMANENT across Capacitor regeneration.
   `android/` is git-ignored (Capacitor regenerates it), so a `cap add`/regen reverts the
   source manifest to the AGP defaults. This script re-applies the deliberate hardening after
   `cap sync`, so the shipped APK always carries it. It PATCHES only the specific attribute
   (never rewrites the whole manifest), so plugin-merged permissions/receivers are untouched.

   Currently enforced:
     • android:allowBackup="false"  (audit sec-apk-2 — block `adb backup` exfiltration of the
       offline SQLite business/financial data).
     • SaagarKeystore native plugin (R0-W2 W2-S2a) — copy the canonical Java source into the
       regenerated android project AND register it in MainActivity. `android/` reverts MainActivity
       to a bare BridgeActivity and drops any hand-added Java on every `cap sync`, so this re-stamp
       is LOAD-BEARING: a missed re-apply = plugin absent = getDEK silently falls back to plaintext
       (fail-open, but the encryption is gone). DT-check the plugin every build.

   Idempotent + safe to run any number of times. If the manifest isn't present yet (fresh clone
   before `cap add`), it no-ops with a note. No new dependencies — Node stdlib only. */
'use strict';
const fs = require('fs');
const path = require('path');

const ANDROID_PKG_DIR = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'saagartraders', 'bcc');
const MANIFEST = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const PLUGIN_SRC = path.join(__dirname, 'native', 'SaagarKeystorePlugin.java');
const PLUGIN_DST = path.join(ANDROID_PKG_DIR, 'SaagarKeystorePlugin.java');   /* filename MUST match the public class name (Java rule) */
const MAIN_ACTIVITY = path.join(ANDROID_PKG_DIR, 'MainActivity.java');

/* The exact MainActivity form that registers the in-app plugin (Capacitor 6: registerPlugin BEFORE super.onCreate). */
const MAIN_ACTIVITY_REGISTERED =
`package com.saagartraders.bcc;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaagarKeystorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`;

function applyKeystorePlugin() {
  if (!fs.existsSync(ANDROID_PKG_DIR)) {
    console.log('[apply-overrides] android package dir not found — skipping SaagarKeystore stamp:', ANDROID_PKG_DIR);
    return;
  }
  // (a) copy the canonical plugin source (byte-for-byte; overwrite any stale copy)
  const src = fs.readFileSync(PLUGIN_SRC, 'utf8');
  const dstExists = fs.existsSync(PLUGIN_DST);
  if (!dstExists || fs.readFileSync(PLUGIN_DST, 'utf8') !== src) {
    fs.writeFileSync(PLUGIN_DST, src);
    console.log('[apply-overrides] stamped SaagarKeystorePlugin.java');
  } else {
    console.log('[apply-overrides] SaagarKeystorePlugin.java already current — no change');
  }
  // (b) register the plugin in MainActivity — idempotent: only rewrite if not already the registered form
  if (fs.existsSync(MAIN_ACTIVITY)) {
    const cur = fs.readFileSync(MAIN_ACTIVITY, 'utf8');
    if (cur.indexOf('registerPlugin(SaagarKeystorePlugin.class)') === -1) {
      fs.writeFileSync(MAIN_ACTIVITY, MAIN_ACTIVITY_REGISTERED);
      console.log('[apply-overrides] patched MainActivity to register SaagarKeystorePlugin');
    } else {
      console.log('[apply-overrides] MainActivity already registers SaagarKeystorePlugin — no change');
    }
  } else {
    // Adversarial P2 fold: the package dir exists (this IS a real build) but MainActivity is gone — a partial/
    // interrupted cap regen. Copying the plugin without registering it = plugin compiled-but-absent at runtime =
    // silent plaintext (once the writer flips). Hard-fail rather than ship that shape.
    console.error('[apply-overrides] FATAL: package dir present but MainActivity.java missing — cannot register SaagarKeystorePlugin:', MAIN_ACTIVITY);
    process.exit(1);
  }
}

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

  applyKeystorePlugin();
}

main();
