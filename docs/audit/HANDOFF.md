# SAAGAR Control Centre — Safe Android Audit Handoff

**Updated:** 2026-08-09 (Asia/Kolkata)
**Purpose:** authoritative resume point for the whole-app pre-/post-Modular-HTML audit.
**Status:** product engineering anchor published; audit tooling not yet frozen or run.

## Current repository authority

| Item | Current fact |
|---|---|
| Product branch | `agent/etp-retail-runtime` |
| Product anchor | `88ba11842613f29173f436a39ca60f12b33e5085` |
| GitHub branch | `origin/agent/etp-retail-runtime` resolves to the same product anchor |
| Product closure | Storage large-record update hotfix plus Retail ETP Core Contract Closure |
| Local dirt before this document is committed | modified `docs/audit/HANDOFF.md`; untracked `docs/audit/AUDIT-PROGRAM-v1.md` |
| Product source outside the anchor | none |
| PHP/platform work | excluded until fresh owner authorization |
| Modular HTML | external-file migration complete; full modular hardening still pending |

The historical statement that `www/storage-core.js` and thirteen other product
files were an in-flight dirty hotfix is superseded. Those changes are committed
and pushed in `88ba118`.

## Product evidence at `88ba118`

- Complete offline regression: **492/492 passed**.
- ETP suite: **128/128 passed**.
- Modular suite: **72/72 passed**.
- Main offline/storage/security suite: **262/262 passed**.
- Normal, non-seeded debug APK build passed for version 2.9, versionCode 209,
  minSdk 23 and targetSdk 34.
- APK path: `android/app/build/outputs/apk/debug/app-debug.apk`.
- APK size: 7,326,431 bytes.
- APK SHA-256:
  `A5502378EB5877BCD3CAA36172DBC7D6777ABE19FAF340A81053F6D5BCDBCDDB`.
- Native ETP API-23 emulator instrumentation: **2/2 passed**.

The rebuilt APK's install-replace harness did not reach candidate installation:
its baseline synthetic seed exceeded the fixed ten-minute harness budget twice.
No update-in-place pass is claimed for `A5502378…`. The earlier passing storage
evidence remains bound only to its earlier APK hash.

## Retail ETP core status

`retail-etp-core-v1` is frozen for R003, R013, R022 and R025 across WLMHW and
HEMW. The runtime is app-loaded and includes bounded offline OOXML preflight,
worker parsing, the shared profile, coordinator, import UI, encrypted native
generation store, metadata-only control receipt, verified reader and
restore/re-import fencing.

Real aggregate-only conformance established:

- identical frozen report signatures across WLMHW and HEMW;
- blocking REC-002 passed with zero differences for 4,658 WLMHW and 708 HEMW
  invoice/date groups;
- R013 attribution exceptions remain visible: 136 WLMHW and 33 HEMW;
- R003 discount exceptions remain visible: 162 WLMHW and 6 HEMW;
- unresolved PAYMENTTYPE25 is quarantined and excluded from persisted/verified
  facts: 2,802 WLMHW and 18 HEMW non-zero rows;
- workbook bytes, raw rows and raw PII remain outside the app and repository.

Controlling ETP evidence:

- `verification/ETP-CORE-CONTRACT-CLOSURE-HANDOFF-2026-08-09.md`
- `verification/ETP-CORE-REAL-CONFORMANCE-2026-08-09.json`
- `verification/STORAGE-UPDATE-LARGE-RECORD-HOTFIX-HANDOFF-2026-08-08.md`

## Modular HTML status

All eleven business modules are external local HTML files and active base64
module payloads are retired. This is not the same as complete modular
architecture. Remaining migration work includes:

- splitting the 711 KB shell into stable controllers and surfaces;
- moving repeated module JavaScript and CSS behind shared versioned contracts;
- adopting the shared module runtime across the remaining modules;
- introducing one versioned web-to-native device gateway;
- preserving the intentional native boundary for Keystore, SQLite, files,
  notifications, lifecycle and security;
- removing dormant compatibility machinery only after migration evidence;
- adding strict before/after capability and rendered-layout guard rails.

The next product change is not authorized until the audit baseline is frozen.

## Audit identity model

The audit uses two immutable identities:

1. **Product baseline SHA:** `88ba11842613f29173f436a39ca60f12b33e5085`.
2. **Audit tooling SHA:** the later commit containing the reviewed program and
   complete tested runner.

The tooling commit must change only audit documentation, audit scripts/tests and
package command metadata. Its product fingerprint must exactly equal the
fingerprint computed from `88ba118`.

Audit output must be produced from an isolated clean worktree. Build, browser
and mutation probes may write only inside disposable worktrees. The live source
tree is never the audit target.

## Required sequence

1. Correct and commit the two audit documents separately above `88ba118`.
2. Build and test the complete A1–A11 runner.
3. Commit and freeze the audit tooling.
4. Prove the product fingerprint still equals `88ba118`.
5. Run the audit from an isolated clean snapshot.
6. Commit and push immutable baseline evidence separately.
7. Consolidate findings into an ordered strategy.
8. Begin Modular HTML remediation only under separate owner authorization.
9. Re-run the identical frozen audit version after migration.

## Open acceptance gates

These remain open and must never be inferred from source tests or emulator
evidence:

- owner physical update-in-place smoke for the final APK hash;
- physical API-23/OEM WebView import and document-provider evidence;
- process-death, disk-full, corruption, background/rotation and low-storage ETP
  evidence;
- real production native ETP publication and operational acceptance;
- user-facing treatment of R003/R013 exceptions;
- approved PAYMENTTYPE25 mapping;
- E2–E6 presentation/analytics, Service ETP and PHP/server work;
- fluent native-language review, staff UAT and legal review;
- production signing and release acceptance.

## Authority rule

Code is authoritative for what the current app does. Approved contracts,
dictionaries and source evidence are authoritative for what it must do. Any
disagreement is an audit finding. `unmeasured` never means `pass`.

## Historical record

Earlier branch positions, APK hashes, dirty-tree checkpoints and test totals are
preserved by Git history and the dated documents under `verification/`. They are
immutable historical evidence, not current resume instructions.
