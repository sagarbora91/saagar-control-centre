# Phase 4C.2 remaining work

**Updated:** 2026-08-17 (Asia/Kolkata)
**Status:** Phase 4C.1 is complete with A10-01 explicitly open. Phase 4C.2 contains only physical-device and external release acceptance.

## Frozen authority

| Item | Identity |
|---|---|
| Product implementation | `ad2d643dfa371c05779aafc52e0c2ecf618c1a42` |
| Product fingerprint SHA-256 | `08734dfbb1d82f69849a4d8857cf1c311c0c0054f5a1b46bca41d42d2c15969e` |
| Audited comparison target | `cc9a117c5245f352922da5c9f699daa16226bbf3` |
| Audit tooling | `667ab0d2bc83f8f6347976548f30f5a1ccf6b12a` |
| Approved comparison evidence | `verification/audit/2026-08-17-220000-cc9a117c5245` |
| Approved comparison manifest SHA-256 | `f2741ee762fe39caa0ba8d99b6842611ca6cd98d573ebf70fa874399337bfd5a` |
| Final debug-UAT APK | `V:\Co work\Projects\Retail\SaagarCC-Phase4C1-Seeded-2Y-v2.9-ad2d643-F7F18EA3.apk` |
| APK SHA-256 | `f7f18ea3e3a0bd1b42b7b390e567993ad46160e0aa844a126509c28a33754287` |
| APK size | 7,010,364 bytes |
| Package/version | `com.saagartraders.bcc`, version `2.9`, code `209` |

Do not rebuild, retarget, remeasure or recapture this product merely to execute Phase 4C.2. A new APK or audit identity is required only if tracked product code changes.

## Carried open engineering exception

### A10-01 — shell parse performance

- State: **OPEN, owner accepted for continuation**.
- Measured result: `1070.2 -> 1151.1 ms`, `+7.559%`.
- Threshold: maximum `+5%`.
- Audit finding: P2.
- Comparison impact: C-08 remains failed solely for this result.
- Owner direction: proceed with A10-01 remaining open.

This is not a pass or silent waiver. Do not run another timing measurement or create another performance candidate unless Sagar explicitly opens a separate bounded remediation task.

## Remaining gate matrix

| Gate/check | State | Required work | Required authority |
|---|---|---|---|
| A10-04 / GATE-UPDATE-PHYSICAL | OPEN | On the exact final APK, capture five complete DAT-02 save-latency samples and verify every p95 budget. Confirm update/install-replace, preserved data and normal relaunch on the physical owner device. | Sagar on the named device |
| A10-05 | OPEN | Capture two complete Expense open/close/reopen memory cycles with pre/post PSS and verify the allowed memory-growth threshold. | Sagar on the named device |
| GATE-ETP-PHYSICAL | OPEN | Import the exact four-report ETP set through a physical Android document provider/OEM flow; verify staging, reconciliation, confirmation and publication. | Physical API-23/OEM tester and owner |
| GATE-ETP-INTERRUPTION | OPEN | Complete the physical/OEM interruption cases not covered by emulator evidence, including document-provider interruption and a safe low-storage case. | Physical API-23/OEM tester |
| GATE-ETP-PRODUCTION | OPEN | Use authorized real WLMHW/HEMW R003, R013, R022 and R025 exports; verify exact-signature parsing, reconciliation, publication and retained receipt metadata. | Production-data custodian and owner |
| GATE-ETP-EXCEPTIONS | OPEN | Review the final Reports UI for R003/R013 exception counts and confirm that the presentation is bounded, understandable and does not change revenue/sales totals. | Sagar/owner |
| GATE-PAYMENTTYPE25 | OPEN | Review the non-zero unresolved PAYMENTTYPE25 quarantine behavior and approve the business disposition without silently publishing excluded values. | Sagar/owner |
| GATE-UAT | OPEN | Complete staff/owner workflow UAT and record legal/privacy acceptance for the final APK identity. | Named staff testers, owner and legal reviewer |
| GATE-RELEASE | OPEN | Produce the production-signed APK/AAB, record certificate identity, verify install/update, and provide final independent release acceptance. | Signing custodian and release approver |

Already closed and not to be repeated:

- `GATE-UPDATE-API23`: exact-hash emulator install-replace, launch/focus and zero-fatal engineering checks pass.
- `GATE-NATIVE-LANGUAGE`: Sagar approved the exact signed 72-cell English/Marathi/Hindi evidence with zero target, contrast or browser-error violations.
- Capability approval: all 107 exact deltas are approved and identity-bound; C-02 and C-03 pass.

## Execution order

### 4C.2-A — owner physical session

When the SM-T875 becomes available:

1. Verify device model, Android version and exact installed APK SHA-256.
2. Perform install-replace/update and verify application data is preserved.
3. Capture the five A10-04 DAT-02 samples.
4. Capture the two A10-05 Expense memory cycles.
5. Review R003/R013 exception presentation and PAYMENTTYPE25 quarantine behavior.
6. Record the owner result against the exact APK identity.

If an API-23/OEM document-provider device is separate from the SM-T875, execute the physical ETP rows in a separate session. Do not substitute emulator evidence for that physical/OEM acceptance.

### 4C.2-B — production ETP and UAT

1. Obtain the authorized four-report production export set without committing source business files to the repository.
2. Run the exact import/reconciliation/publication workflow.
3. Record bounded receipts, control totals and acceptance; do not retain raw source rows in audit evidence.
4. Complete staff and owner UAT.
5. Obtain legal/privacy acceptance.

### 4C.2-C — production release

1. Build with the authorized production signing identity.
2. Record final artifact SHA-256, bytes, package/version and signing-certificate SHA-256.
3. Verify clean install and update behavior for that exact production artifact.
4. Obtain independent release approval.
5. Update the final closure register and HANDOFF without changing the audited Phase 4C.1 target identity.

## Evidence rules

- Bind every result to device model, Android version, APK SHA-256, package/version and timestamp.
- Keep production ETP source files and signing private keys outside the repository.
- Commit only bounded, non-sensitive receipts, hashes, decisions and acceptance records.
- A failed or incomplete case remains open; do not infer acceptance from emulator tests or prior APKs.
- Do not rerun Phase 4C.1 tests, timing, UI capture, baseline or comparison unless tracked product/tooling inputs change and Sagar explicitly authorizes the invalidation cost.
- Use one evidence producer per gate. Additional agents may review but must not repeat the same measurement.

## Phase 4 completion condition

Phase 4 may be called fully closed only when:

1. every Phase 4C.2 gate above has a complete identity-bound decision and evidence record;
2. the production artifact is signed and independently accepted;
3. the final closure register and HANDOFF truthfully retain A10-01 as open unless a separately authorized remediation later closes it; and
4. no physical, UAT, legal, production-data, signing or release authority is represented by emulator-only evidence.

Until then, the correct status is: **Modular HTML migration and Phase 4C.1 engineering/evidence execution complete; Phase 4C.2 external release acceptance pending.**
