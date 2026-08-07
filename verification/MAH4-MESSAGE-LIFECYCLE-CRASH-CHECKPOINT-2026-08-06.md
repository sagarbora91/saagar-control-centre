# MAH-4 Message/Lifecycle Crash Checkpoint — 2026-08-06

> **Resolved and superseded 2026-08-07.** The crash-recovery actions in this
> file were completed: the scanner/profile were reconciled, explicit dynamic
> loaders and persistent hooks were frozen, the Stage-A executable
> specification and synthetic tests were added, and current evidence moved to
> `verification/MAH4-MESSAGE-LIFECYCLE-STAGE-A-CHECKPOINT-2026-08-07.md`.
> Keep this file only as historical crash evidence.

## Resume identity

- Repository: `V:\Co work\Projects\Retail\saagar-control-centre`
- Branch: `main`
- HEAD: `c04bc98255a78d45b08ac449d88365b22d033f28`
- Working tree: intentionally dirty; preserve every existing modification, deletion and untracked file.
- Do not reset, overwrite, delete, commit or push without owner approval.
- `package-lock.json`: untouched by this MAH-4 work.
- Product source rule: no `www/**` file was edited during this resumed MAH-4 audit. Existing `www` differences pre-date this work and remain owner/user work.

## Phase binding and gate

Phase 4 is bound to **MAH-4 — Message Envelope & Lifecycle Contracts**. Only Stage-A read-only source inventory, contract, profile and test-oracle work is currently allowed. Runtime refactoring remains blocked by the MAH-3 visual gate (`0/168`, `refactorGateReady=false`) and the ordered Planning → DSR → QMS canaries.

## Surviving MAH-4 files

- `docs/audit/MAH4-MESSAGE-LIFECYCLE-CHANGE-CONTRACT-2026-08-06.md`
- `verification/MAH4-MESSAGE-LIFECYCLE-START-CHECKPOINT-2026-08-06.md`
- `verification/MAH4-MESSAGE-LIFECYCLE-INVENTORY-2026-08-06.md`
- `verification/MAH4-MESSAGE-LIFECYCLE-BASELINE-PROFILE.json`
- `scripts/audit-mah4-message-lifecycle.mjs`
- `scripts/lib/mah4-contract-source.mjs`
- `tests/mah4-contract-source.test.mjs`
- `tests/mah4-message-lifecycle-baseline.test.mjs`

## Work completed immediately before this checkpoint

`scripts/lib/mah4-contract-source.mjs` now has a **partially integrated** hardened scanner:

1. Exact case-insensitive script-attribute parsing; `data-src` is not treated as `src`, and empty, unquoted or duplicate `src` values fail closed.
2. HTML comments are excluded from script-tag discovery.
3. Balanced `postMessage(...)` argument inspection prevents one call from consuming a later wildcard target.
4. Shell dormant-generator markers must occur exactly once and in the correct order; missing, duplicate or reversed markers throw.
5. Raw shell, active shell and dormant shell lifecycle call sites are separated.
6. Direct loaded-script lifecycle source sites and effective per-document/module totals are separated.
7. Syntactic producers are separated from configured producers. Constant-empty `steps=[]` modules no longer count as configured `ST_OPEN_MODULE` senders.
8. Direct message assets are filtered using active producer/consumer inspection, removing the comment-only `storage-core.js` false positive.
9. Listener-local consumer trust records are now derived rather than using unrelated global `.source`/`.origin` matches.
10. Readiness/control booleans are derived from the specific iframe load hook and discovered control types rather than hardcoded.

The scanner module passes `node --check` and `createMah4Inventory()` currently reproduces these corrected figures:

- syntactic sends: **74**
- configured sends: **68**
- all syntactic sends use wildcard target origin: **74/74**
- direct entry scripts: **33**
- active direct message assets: exactly `www/app-i18n.js` and `www/sqlite-store.js`
- raw inline module totals: **110 timeouts / 3 intervals / 22 MutationObservers / 183 event listeners**
- effective module totals with directly loaded assets weighted by execution context: **121 / 3 / 33 / 223**
- raw inline shell: **28 timeouts / 2 intervals / 2 MutationObservers / 29 event listeners / 2 resize listeners**
- active inline shell after excluding the dormant generator: **21 / 2 / 0 / 16 / 1**

## Important listener/lifecycle evidence received

- Shell router `ST_AUDIT` handling is source guarded against the active iframe; `sqlite-store.js` `ST_AUDIT` handling is not source/origin guarded.
- `app-i18n.js` receives `ST_LANG` without source/origin checks and executes in the shell plus all 11 modules.
- All 11 modules receive `ST_UI_MODE`, `ST_SET_DATE` and `ST_OPEN_FEATURE` without source/origin checks.
- Only DSR, Expense, Service and Stock source-guard `ST_ACCESS_CONTEXT` against `window.parent`.
- Service has unsourced edit-mode messages and unsourced state-mutating `ST_WA_SENT` handling.
- Additional persistent iframe load hooks exist in `integration-bridge.js` and `whatsapp-share.js`.
- Dynamic local script loading includes demo seed, JSZip, PDF libraries/worker and integration bridge. `saagar-report.js` contains a second JSZip loader.
- No active listener checks `event.origin`.

## Incomplete integration — resume here first

Do **not** trust or regenerate the frozen profile yet.

1. `createMah4Profile()` still references the previous inventory field names (`activePostMessageCalls`, `transitiveMessageAssets`, old lifecycle shape). Reconcile it with the new inventory schema.
2. Update the two MAH-4 test files for:
   - 74 syntactic versus 68 configured sends;
   - exact configured `ST_OPEN_MODULE` paths: DSR, Expense, Grooming, QMS and Service;
   - exact direct message assets: app-i18n and sqlite-store;
   - raw/active/direct/effective lifecycle buckets;
   - listener-local `ST_AUDIT` trust;
   - unrelated `.source` decoy cannot create a guarded result;
   - balanced wildcard decoy;
   - uppercase/data-src/unquoted/duplicate script attributes;
   - missing/duplicate/reversed dormant markers.
3. Add a separately named conditional/dynamic loader inventory or explicitly freeze it as a Stage-B deferral. Do not call direct script discovery transitive.
4. Decide how to freeze the persistent iframe hooks in integration-bridge and whatsapp-share without modifying product runtime.
5. Regenerate `MAH4-MESSAGE-LIFECYCLE-BASELINE-PROFILE.json` only after the schema/tests agree.
6. Correct every MAH-4 document and roadmap lifecycle statement. Use qualified raw-inline, active-inline, direct-loaded and effective-document labels; state 74 syntactic versus 68 configured sends.
7. Update `docs/audit/HANDOFF.md` to point here.
8. Run, in order: `npm run test:mah4`, `npm run test:modular`, `npm run test:offline`, and `node --test tests/*.test.mjs`.
9. Finish with `git diff --check`, Git status, package-lock check and MAH-3/`www` identity verification.

## Evidence status at stop

- Scanner syntax check: **PASS**
- Corrected `createMah4Inventory()` spot-check: **PASS**
- MAH-4 focused suite after the partial schema change: **NOT RUN / expected stale until profile and tests are reconciled**
- Modular/offline/full suites after this partial change: **NOT RUN**
- Device/browser/native-language acceptance: **not claimed**
- Commit/push/APK: **not performed**
