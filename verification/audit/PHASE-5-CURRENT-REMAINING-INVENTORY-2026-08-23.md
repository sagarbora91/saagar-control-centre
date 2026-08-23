# Phase 5 current remaining-work inventory — 2026-08-23

**Authority:** current resume inventory. Supersedes
`PHASE-5-REMAINING-INVENTORY-2026-08-22.md`, which is retained as a historical
pre-approval snapshot.

**Branch checkpoint:** `agent/modular-phase1-shared-spine-v2`. Fixed product
commit `d5a96dbf6f938249d1cff5ca4a79968b0c299c22`; device-evidence checkpoint
`816fab29493823ef6cb253378663083c9177c543`; product fingerprint SHA-256
`51694c67facf756c4d6a735403a7d4b7b2c1c5db30987f9e0a67e05f1a013161`;
WWW tree SHA-256
`aa964dc6b40df928bde411c4551795e7fb9d3c0ab92c681baeb9c194f3cbd550`.

**Corrected debug candidate:**
`V:\Co work\Projects\Retail\SaagarCC-C1-DemoData-2Years-v2.9.apk`, SHA-256
`5cea95d2461810b1e318efaa359f2c6a169edee8a26ed43164b1c87eaf3f5fed`,
7,218,076 bytes. This is not a production release.

**Current production-signed candidate:**
`V:\Co work\Projects\Retail\SaagarCC-v2.9-production-dfa4ddb.apk`, SHA-256
`bc4ea8c17a5688b293e26c3ab18253069555b1744cb87e545878a64996a58bac`,
5,696,008 bytes, source commit `dfa4ddb288bdfefb2dca9b249fef430dea370afb`.
It is non-debug, signed by certificate SHA-256
`df7877f01d2956a7c9134aca06bf91ff03a953afebc561bf520b2b4d55f98519`,
and installed/read back exactly on SM-T875. The earlier signed hash `aa4f5ff9...`
is rejected because it visibly displayed a stale `TEST` badge.

## Resume reconciliation — 2026-08-23

| Check | Reconciled result |
|---|---|
| Repository | `e0cbe910391cfa4bf4b053121a26bc430fc12281` on the expected branch |
| Upstream | `github/agent/modular-phase1-shared-spine-v2`; 0 ahead / 0 behind after fetch |
| Working tree | No tracked changes; preserved untracked `.tmp-etp-synthetic-fixtures-device/` only |
| Root APK | SHA-256 recomputed and matches `5cea95d2461810b1e318efaa359f2c6a169edee8a26ed43164b1c87eaf3f5fed` |
| Graphify | Existing 6,158-node graph queried; `graphify check-update .` requires no update |
| Internal work | None executable without recreating completed evidence or starting the final audit early |

Phase 5 remains open on external inputs. No completed SM-T875, picker,
performance, memory, visual, language or synthetic ETP evidence was repeated.

## Current status

- Repository-controlled ETP defect remediation: **complete**.
- Current ETP verification: **173/173 passed**; the earlier 439-test focused
  sweep remains historical evidence for `a104f5f` and was not repeated.
- SM-T875 synthetic ETP validation/publication/readback: **passed**, including
  force-stop/cold-launch persistence.
- Applicable owner approvals: historically rebound to `a104f5f`; **final fixed
  identity rebind remains pending** because `www/etp-module-gateway.js` changed.
- Closure register: **5 closed gates, 2 pending gates, 3 carried-open gates**.
- Audit comparison residue: **3 carried checks** (`A10-01`, `A10-04`,
  `A10-05`); `C-08` remains failed or unmeasured because of these checks.
- Final production release: **not complete**.
- Production signing and exact-hash SM-T875 install/launch: **complete for
  `dfa4ddb`**; final release decision and prerequisite external gates remain open.

## Remaining gates

| ID | Current state | Exact remaining work | Required input/authority | Can current SM-T875 close it? |
|---|---|---|---|---|
| `GATE-ETP-PHYSICAL` | Carried open; SM-T875 synthetic path passed | On a real API-23-class OEM device, select the four files through its document provider, retain URI permission, import, relaunch and verify readback against the final shipping artifact | API-23-class physical/OEM device or qualifying cloud real-device farm; named tester; authorized safe four-file set | **No further SM-T875 work.** Its API-33 synthetic validation/publication/readback is banked |
| `GATE-ETP-INTERRUPTION` | Carried open; SM-T875 picker-background reauth passed | Run only the uncovered API-23/OEM and safe-low-storage cases; prove no partial generation or plaintext publication | API-23-class OEM device/tester and controlled storage setup | **No further SM-T875 picker repetition.** Do not repeat the banked emulator or API-33 subsets |
| `GATE-ETP-PRODUCTION` | Carried open, owner-deferred, not passed | Import untouched authorized WLMHW/HEMW R003, R013, R022 and R025; record bounded hashes/counts, complete-period declaration, manager reauthentication, REC-002, active/previous generation and metadata-only receipt | Authorized four-report production set; production-data custodian; Sagar as Owner/Admin | SM-T875 is optional; the gate itself needs the authorized data, not a particular device |
| `GATE-UAT` | Pending | Complete the role/store matrix with cashier/maker, manager/checker and owner/admin; record expected/actual results, owner decision and privacy/legal checklist | Two named representative staff testers; Sagar owner/admin; Sagar owner self-review for privacy/legal unless independent counsel is added | Device may be used, but Codex/ADB cannot substitute for staff decisions |
| `GATE-RELEASE` | Pending; signed-artifact build/install complete | Production-signed artifact, certificate, non-debug posture and exact-hash SM-T875 install/launch are verified. Remaining: complete prerequisite external gates, perform final identity rebind and issue the exact-artifact release decision acknowledging every carried exception | Sagar's release decision after API-23/OEM, production-data and staff-UAT inputs. Current same-person approver assignment remains a recorded independence exception | Corrected signed artifact is installed; SM-T875 cannot close the missing API-23 or human/data gates |

## Historical closed gates that still need final-artifact rebinding

`GATE-UPDATE-API23` is historically closed against APK `f7f18ea3`, but its
`rebindingRequired` flag remains. Do **one** install-replace/launch check on the
eventual production-signed shipping artifact. Combine it with the API-23/OEM ETP
session above; do not run a separate intermediate build merely to rebind it.

`GATE-UPDATE-PHYSICAL`, `GATE-NATIVE-LANGUAGE` and `GATE-ETP-EXCEPTIONS` were
approved/rebound to `a104f5f`. They remain valid historical evidence, but the
records are not bound to fixed product commit `d5a96db`. Rebind them once to the
eventual shipping identity after verifying the bounded ETP authorization/worker
delta. Do not manufacture a new rendered capture unless the reviewer determines
that the changed action-bound reauthentication text requires one.

## Carried audit checks — no work unless the owner changes disposition

| Check | Current truth | Existing mitigation/evidence | Reopen work if clean closure is demanded |
|---|---|---|---|
| `A10-01` | Failed P2: shell parse `+7.559%` versus `+5%` | Owner directed it remain open; no further timing candidate authorized | Separate bounded shell-performance remediation and comparison rerun |
| `A10-04` | Formally unmeasured | SM-T875 DAT-02 passed twice on synthetic data with no crash/ANR | Authorize and build the governed signed device producer, resolve seeded/final APK binding, justify representative volume and run the second/API-23 device |
| `A10-05` | Formally unmeasured | Two SM-T875 Expense cycles were healthy at `-7.61%` retained PSS | Same governed producer/build-binding work, then capture the compatible two-cycle record |

These checks are not passes. Under the current owner disposition they remain
visible exceptions in the release decision; do not build a harness or rerun them
unless Sagar explicitly reverses that disposition.

## Inputs not currently available

1. A real Android API-23-class OEM device or qualifying cloud real-device farm.
2. Authorized WLMHW/HEMW R003/R013/R022/R025 files for the controlled production
   publication session.
3. Names and participation of a cashier/maker tester and a manager/checker tester.
4. Optional independent release approver. Sagar currently holds both custodian
   and approver roles; the separation-of-duties control remains unsatisfied and
   explicitly recorded as an exception.
5. An explicit bounded approval rebind to the eventual fixed shipping commit and
   APK identity. No approval received before `d5a96db` should be relabeled as if
   it already names the new identity.

Production signing is no longer an unavailable input. The production key was
created outside Git and used through the existing `SAAGAR_*` process-only
environment contract; the custodian must retain the key and password securely.

## Final engineering closure after inputs arrive

After the external sessions and final decisions are complete, run exactly one final
controlled audit/comparison, update the closure register and `HANDOFF.md`, verify
all cited hashes, commit and push the final checkpoint. This final run must not be
started early because signing or later evidence would force it to be repeated.

## Do-not-repeat boundary

- Do not repeat MAH-3 visual capture, rendered-language capture, localization
  review or R003/R013 presentation review merely because the product hash moved;
  perform one bounded final-identity rebind unless visual review finds a material
  presentation change.
- Do not repeat SM-T875 update preservation, DAT-02 or Expense-memory diagnostics.
- Do not repeat the completed SM-T875 synthetic ETP validation, publication,
  readback or cold-relaunch persistence session.
- Do not repeat the banked API-23 emulator interruption subset.
- Do not rebuild another debug APK unless a tracked product change is approved.
- Do not run the final audit before the production artifact and external decisions
  exist.

## Consolidated-plan readiness

A one-go completion plan can be prepared once the inputs above are assigned. The
plan should parallelize independent evidence preparation, UAT coordination and
signing readiness, but must converge on one frozen product identity, one
production-signed artifact and one final audit. Parallel agents cannot replace
the missing API-23 hardware, authorized business files, staff decisions or
production key custody.
