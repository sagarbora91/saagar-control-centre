# Phase 6A — CI/release containment and foundation checkpoint

**Date:** 2026-08-24 (Asia/Kolkata)
**Branch:** `agent/modular-phase1-shared-spine-v2`
**Status:** repository implementation complete locally; push/live-CI evidence pending

## Containment result

- Commit `08c156f` changes normal GitHub Actions execution to `contents: read` and produces only an immutable, clearly named debug/test workflow artifact.
- Push-triggered GitHub Release creation, mutable `latest`, release-action use and debug-to-release publication are prohibited by `tests/release-workflow-policy.test.mjs`.
- The containment commit has **not been pushed**. Consequently, this record does not claim live post-push CI evidence.
- No Firebase upload, GitHub Release, APK publication, billing action or production build occurred during Phase 6A.

## Canonical local production recipe

The tracked `scripts/build-production-release.ps1` is the sole package-level `build:release`
entry. It requires an exact clean commit and a new external output directory, accepts signing
credentials only through the four `SAAGAR_*` process environment variables, clears those
variables on exit, and runs the governed sequence:

1. Capacitor synchronization;
2. canonical Android override application;
3. generated release-configuration verification;
4. API-23 asset preparation;
5. Gradle `clean assembleRelease`;
6. signer-policy verification and immutable receipt registration.

The public signer policy pins package `com.saagartraders.bcc` and certificate SHA-256
`DF7877F01D2956A7C9134ACA06BF91FF03A953AFEBC561BF520B2B4D55F98519`.
No password, keystore or private key is stored in the repository. The recipe was parsed and
contract-tested, but deliberately not executed while the tree is dirty.

## API-23 and multi-financial-year foundation

- Legacy WebView fallback is now activated only for the legacy capability/Chrome condition;
  modern tablets do not receive the API-23 layout override.
- A Chrome-44-compatible `replaceChildren` polyfill prevents the ETP verified-scope list from
  failing on API 23.
- Multi-FY exports are bounded to the explicitly selected store, financial year and inclusive
  date range before reconciliation or native staging.
- Out-of-scope rows and out-of-scope `PAYMENTTYPE25` values cannot contribute to staged chunks
  or quarantine metadata.
- Governed identities were rebound for `www/shell-core.css` and
  `www/modules/etp/index.html`; this is an engineering identity update, not visual/UAT approval.

## Validation record

| Check | Result |
|---|---:|
| Phase-0 workflow/release policy tests | 23/23 pass |
| ETP suite | 183/183 pass |
| API-23/mobile/shell focused suite | 19/19 pass |
| Canonical release/API-23 focused suite | 16/16 pass |
| Module manifest/MH1 protection checks | 16/16 pass |
| PowerShell parser | pass, zero syntax errors |
| Whole-app audit-runner tests | 77/80 pass |

The three whole-app audit-runner failures are the pre-existing frozen product-anchor mismatch
(`296` files / old tree identity versus the current `350`-file product tree). The audit remains
fail-closed. Phase 6A does not rebind that formal audit anchor; the controlling plan assigns the
final architecture/identity rebind to Phase 6I after feature writes stop. Older MAH-3/MAH-4 and
capability-delta baselines likewise reject the changed product tree and are not represented as
passing acceptance evidence.

## Exit decision and remaining external proof

Phase 6A's repository containment, canonical recipe, and API-23/multi-FY foundation are ready
for local checkpoint commits. The following are explicitly not claimed:

- live CI behavior after a push;
- a new production-signed APK;
- device/UAT or visual acceptance for this changed Phase-6 identity;
- production workbook publication;
- Phase 6 or Phase 5 closure.

The protected untracked `.tmp-etp-synthetic-fixtures-device/` directory was preserved and is
excluded from commits. Phase 6B may begin after the local Phase 6A commits and Graphify refresh;
push remains a separate owner-controlled action.
