# Phase 5 current remaining-work inventory — 2026-08-23

**Authority:** current resume inventory. Supersedes
`PHASE-5-REMAINING-INVENTORY-2026-08-22.md`, which is retained as a historical
pre-approval snapshot.

**Branch checkpoint:** `agent/modular-phase1-shared-spine-v2`, pushed through
`2347f6b`. Product commit `a104f5f40bd2b475f9ab45fb407f99149fafb8d9`;
product fingerprint SHA-256
`4e42cf230b9650a7e0f8ad30633dbf639d2158215d99232dfe14f0ab90716667`;
WWW tree SHA-256
`03a766bc9204ef956477a2f0177a636cf874165487fea381964e0bec789a20a5`.

**Corrected debug candidate:**
`V:\Co work\Projects\Retail\SaagarCC-C1-DemoData-2Years-v2.9.apk`, SHA-256
`90dda701c2b9d44b89b6d7e6acadb80a22cb67d5885616781c82dec4f349d2dd`,
7,218,076 bytes. This is not a production release.

## Current status

- Repository-controlled Phase 5 engineering: **complete**.
- Focused verification: **439 tests, zero failures**.
- Applicable owner approvals: **rebound to `a104f5f`**.
- Closure register: **5 closed gates, 2 pending gates, 3 carried-open gates**.
- Audit comparison residue: **3 carried checks** (`A10-01`, `A10-04`,
  `A10-05`); `C-08` remains failed or unmeasured because of these checks.
- Final production release: **not complete**.

## Remaining gates

| ID | Current state | Exact remaining work | Required input/authority | Can current SM-T875 close it? |
|---|---|---|---|---|
| `GATE-ETP-PHYSICAL` | Carried open, not passed | On a real API-23-class OEM device, select the four files through its document provider, retain URI permission, import, relaunch and verify readback against the final artifact | API-23-class physical/OEM device or qualifying cloud real-device farm; named tester; authorized safe four-file set | **No.** SM-T875 is API 33 |
| `GATE-ETP-INTERRUPTION` | Carried open, not passed | Run only the two uncovered cases: document-provider interruption and safe low-storage; prove no partial generation or plaintext publication | Same API-23-class OEM device/tester and controlled storage setup | **No.** Do not repeat the already-banked emulator subset |
| `GATE-ETP-PRODUCTION` | Carried open, owner-deferred, not passed | Import untouched authorized WLMHW/HEMW R003, R013, R022 and R025; record bounded hashes/counts, complete-period declaration, manager reauthentication, REC-002, active/previous generation and metadata-only receipt | Authorized four-report production set; production-data custodian; Sagar as Owner/Admin | SM-T875 is optional; the gate itself needs the authorized data, not a particular device |
| `GATE-UAT` | Pending | Complete the role/store matrix with cashier/maker, manager/checker and owner/admin; record expected/actual results, owner decision and privacy/legal checklist | Two named representative staff testers; Sagar owner/admin; Sagar owner self-review for privacy/legal unless independent counsel is added | Device may be used, but Codex/ADB cannot substitute for staff decisions |
| `GATE-RELEASE` | Pending | Produce production-signed artifact and receipt; verify certificate, `debuggable=false`, no debug cert, exact-hash install/launch; issue exact-artifact release decision acknowledging every carried exception | Locally configured production keystore credentials; Sagar as custodian; release decision. Current same-person approver assignment remains a recorded independence exception | Final signed artifact must be tested; current debug APK cannot close it |

## Closed gate that still needs final-artifact rebinding

`GATE-UPDATE-API23` is historically closed against APK `f7f18ea3`, but its
`rebindingRequired` flag remains. Do **one** install-replace/launch check on the
eventual production-signed shipping artifact. Combine it with the API-23/OEM ETP
session above; do not run a separate intermediate build merely to rebind it.

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
4. Production signing credentials configured locally through the existing
   `SAAGAR_*` environment contract. No signing variables are currently configured;
   private key material must not be committed or pasted into evidence.
5. Optional independent release approver. Sagar currently holds both custodian
   and approver roles; the separation-of-duties control remains unsatisfied and
   explicitly recorded as an exception.

## Final engineering closure after inputs arrive

After the external sessions and signing are complete, run exactly one final
controlled audit/comparison, update the closure register and `HANDOFF.md`, verify
all cited hashes, commit and push the final checkpoint. This final run must not be
started early because signing or later evidence would force it to be repeated.

## Do-not-repeat boundary

- Do not repeat MAH-3 visual capture, rendered-language capture, localization
  review, R003/R013 presentation review or the `a104f5f` approval rebind.
- Do not repeat SM-T875 update preservation, DAT-02 or Expense-memory diagnostics.
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
