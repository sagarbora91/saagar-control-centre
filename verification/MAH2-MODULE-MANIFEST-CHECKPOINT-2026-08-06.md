# MAH-2 module-manifest checkpoint — 2026-08-06

## Resume identity and safety

- Repository: `V:\Co work\Projects\Retail\saagar-control-centre`
- Branch: `main`
- HEAD: `c04bc98255a78d45b08ac449d88365b22d033f28`
- Working tree: intentionally dirty; all C1/MAH-1 and owner-owned changes were
  preserved.
- No reset, discard, delete, commit, push or APK build was performed.
- `package-lock.json` remains untouched. ETP, PHP, storage and business-rule
  work remain excluded.

## Discrepancies reported before editing

1. MAH-1 source protection was green, but its 168 rendered visual cases and
   physical-device evidence were still open.
2. Eleven valid external-module records were embedded directly in the 723,205
   byte shell with no schema/version validation.
3. Inventory, extraction and multiple security tests parsed the literal
   `const MODULES = [...]`, so moving the data alone would have broken tooling.
4. The active loader used `iframe.src`, but diagnostics still attempted
   `html_b64` decoding and boot scheduled three base64 prewarm jobs that could
   only fail silently.
5. Only Stock, Service, DSR and Expense have the live access-context bridge;
   this work did not broaden that security capability.

## Saved implementation

- Added `www/module-manifest.js` as the sole parser-time registry authority:
  - synchronous classic UMD for Android WebView and Node/CommonJS;
  - schema version 1 and exact ordered identity set for all eleven modules;
  - strict missing/unknown-field, duplicate, canonical-path, byte declaration
    and lowercase SHA-256 declaration checks;
  - immutable API, IDs, module array and module records;
  - stable `get(id)` and `has(id)` helpers;
  - one uniquely marked JSON data block for guarded build-tool updates.
- `www/index.html` loads the manifest synchronously before its main script and
  retains a read-only `MODULES` compatibility alias. A missing/invalid asset
  shows a recoverable build-error page and exposes no module.
- Corrected live diagnostics to report manifest integrity and external routes.
  Removed the dead external-module base64 prewarm scheduler. Historical
  `srcdoc/buildModuleSrc` fallback functions remain for a separately gated
  retirement.
- Migrated the shared test loader, four duplicate security-test parsers, the
  modular inventory, and retained Stock/all-module extraction tools away from
  the inline shell array.
- Seeded APK tooling now fails before Gradle if Capacitor did not copy
  `module-manifest.js` byte-for-byte or if the shell does not load exactly one
  synchronous manifest before its compatibility alias.
- Registered `npm run test:manifest` and included its six cases in
  `npm run test:modular` and therefore the offline pre-gate.

## Measured result

- Shell: 715,491 bytes, SHA-256
  `a79ab0cc1c42e732c151bd5a719d3b728fec68a6c20442b3bc718a3434c5e219`.
- Manifest: 12,539 bytes, schema 1, SHA-256
  `64e90916c64f8babd39254cd800372d6b5e9800311bb4c7c59480bbaacd35330`.
- Module count: exactly 11; every declared byte count and SHA-256 matches its
  raw module file.
- Retained extraction previews: all-module preview passed for 11/11; Stock
  verify mode passed with no write and no remote asset.

## Verification

- Manifest contract: 6/6 passed.
- Combined modular protection: 14/14 passed.
- Focused policy/security/integration/seeded-profile regression: 88/88 passed.
- Offline suite: 256/256 passed; C1, mobile, Settings, language and modular
  pre-gates also passed.
- Complete `tests/*.test.mjs` glob: 303/303 passed.
- Shell inline-script parsing and seeded source-safety tests passed.

## Evidence limits and remaining MAH-2 work

- This completes the **MAH-2 manifest foundation**, not all shared architecture.
- No module HTML content, business workflow, storage key, role grant, policy or
  screen layout was changed.
- Raw module byte/SHA integrity is enforced in build/tests, not by runtime
  fetch/WebCrypto on API 23.
- The MAH-1 168-case rendered baseline, native-language review and physical
  device acceptance remain open and are not inferred from source tests.
- Shared runtime extraction, a versioned ready/error message envelope,
  lifecycle cleanup, common CSS/tokens, module internal splitting, shell
  slimming and historical fallback retirement remain pending.
- No APK was built because this foundation has no owner-facing workflow change
  and the rendered-baseline gate remains open.

## Exact next sequence

1. Establish/capture the supported 168-case MAH-1 geometry/language baseline.
2. Pilot parameterized common-runtime extraction in Planning, the smallest
   module with no table, access bridge or recurring interval.
3. Verify Planning across four viewports and three languages, then use DSR and
   QMS as timer/access/mobile-menu canaries.
4. Introduce message-envelope and lifecycle contracts only after those canaries
   are green.
5. Extract shared CSS/design primitives last, with before/after rendered
   evidence; retain Stock-specific differences.
6. Build one consolidated seeded review APK only after the visual gate passes.
7. Commit or push only after Sagar approves the exact dirty-tree scope.
