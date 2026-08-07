# Code Closure — API-23 compatibility

**Date:** 2026-08-07 (Asia/Kolkata)
**Scope:** Android code closure only; ETP and PHP are excluded.

## Outcome

Generated APK assets are now prepared for the stock API-23 WebView (Chrome 44)
without rewriting the readable `www` source. Babel lowers external and inline
application scripts and Capacitor's injected native bridge; deterministic
shims cover missing collection, string and object APIs. Normal, release and
two-year seeded builds use the same step. The generated manifest is rebound to
the transformed module and shared-runtime byte counts and SHA-256 values.

The closure also repaired a modular-loader mismatch: the shell was still
decoding the removed `html_b64` field. It now loads the manifest-bound local
module route and retains the injection/lifecycle chain.

## API-23 evidence

- Android 6.0 / API 23, stock WebView Chrome `44.0.2403.119`.
- Capacitor bridge: **available**.
- `SaagarNativeStore`: **available**.
- Shell: **rendered**.
- External module render sweep: **11/11**, with no module-load affordance.
- Machine capture: `verification/api23-code-closure-evidence.json`.
- Full regression: **372/372 passed**.
- Normal debug APK build: **passed**.
- Seeded two-year APK build: **passed**, 7,323,243 bytes, SHA-256
  `46B4342570842DEBAFA890DD9E2A58E624B7B8E0D3127038090ADBD20A68ABAA`.

Chrome 44 has no WebAssembly. `sql-wasm.js` therefore reports its expected
initialization failure and storage uses the native fallback. This does not
claim WebAssembly support.

## Evidence boundary

This is emulator engineering evidence, not physical-device acceptance, owner
UAT, production signing, accessibility acceptance, native Marathi/Hindi
acceptance, or production-data migration approval. Earlier owner APK feedback
remains owner-reported smoke evidence only.
