# MAH-2 — Shared architecture foundation: module manifest

**Date:** 2026-08-06 (Asia/Kolkata)
**Owner authorization:** “begin with phase 2”
**Baseline:** `main` at `c04bc98255a78d45b08ac449d88365b22d033f28`, intentionally dirty C1/MAH-1 tree

## Objective

Create one parser-time, versioned and fail-closed source of truth for all eleven
external modules before shared runtime, message, lifecycle, CSS or shell
refactoring begins.

## In scope

- One synchronous local `www/module-manifest.js` used by the browser and Node.
- Exact preservation of the current 11 records, order and flat runtime shape.
- Strict rejection of missing/unknown fields, duplicate identities, malformed
  hashes, noncanonical paths, remote paths and path traversal.
- Recursively frozen runtime records with stable `get`/`has` lookup helpers.
- Build-time byte/SHA checks against every raw module file.
- Migration of inventory, extraction and test consumers away from parsing an
  inline array in `index.html`.
- Explicit seeded-build checks that Capacitor copied the manifest unchanged.

## Not in scope

- ETP, PHP, storage, business rules, role grants or permission changes.
- Enabling the access-context bridge for the seven modules that do not have it.
- Message-origin/protocol changes, lifecycle cleanup, lazy loading or prewarm
  redesign.
- Shared CSS/helper extraction or module HTML/CSS/JS splitting before the
  pending MAH-1 rendered baseline exists.
- Production signing, formal device acceptance, commit or push.

## Compatibility and safety rules

1. The manifest is a classic synchronous local script; no fetch, module script,
   `async` or `defer` dependency is introduced.
2. The shell retains a `const MODULES` compatibility alias so existing runtime
   consumers and `c1-closure.js` keep the same shape and order.
3. A missing or invalid manifest produces a recoverable build-error screen and
   exposes no module.
4. Runtime validation verifies schema/path declarations. Raw byte and SHA
   integrity remains a deterministic build/test gate; it is not moved into
   Android WebView crypto/fetch code.
5. Existing module files, storage keys, workflows, UI and policy load order are
   unchanged in this module.

## Exit gates for this module

- Manifest contract and browser/Node parity tests pass.
- All eleven paths, byte counts and SHA-256 values match their files.
- Inventory and retained extraction tools read/write only the manifest data
  block, never an inline shell registry.
- Seeded packaging checks require an unchanged copied manifest.
- Modular, focused integration, offline and complete regression suites pass.
- Documentation records that MAH-1 visual/device acceptance remains open.
