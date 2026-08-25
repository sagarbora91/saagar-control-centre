# Phase 5 — Consolidated closure

**Prepared:** 2026-08-21 (Asia/Kolkata)
**Purpose:** one phase that finishes everything still open across Phase 4C.2 and ETP, in a single ordered run.
**Supersedes as a plan:** the scattered remainders in `PHASE-4C2-REMAINING-WORK-2026-08-17.md`, `ETP-COMPLETION-PHASES-2026-08-21.md` (ETP-4), `ETP-L10N-IMPORT-CHECKPOINT-2026-08-21.md` and `ETP-IDENTITY-REGEN-FINDINGS-2026-08-21.md`. Those stay as the evidence trail; this is the running order.

---

## 1. Everything that remains, in one table

| # | Item | Kind | Blocked by |
|---|---|---|---|
| **5A-1** | ~~harness handshake~~ **NOT a defect** - capture needs a visible browser | environment | a desktop browser |
| **5A-2** | Capture 12 `etp` visual cases | capture | 5A-1 |
| **5A-3** | Fluent review of the 12 cases; restore `visualBaselinesCaptured` | **owner gate** | 5A-2 |
| **5B-1** | Regenerate the capability delta | engineering | nothing |
| **5B-2** | New owner capability approval for the regenerated delta | **owner gate** | 5B-1 |
| **5C-1** | Rendered-language matrix recapture (72 cells) | capture | 5A-1 (same harness) |
| **5C-2** | Identity-bound fluent visual approval | **owner gate** | 5C-1 |
| **5D-1** | `GATE-PAYMENTTYPE25` disposition | **owner decision** | nothing |
| **5D-2** | `GATE-ETP-EXCEPTIONS` screen review | **owner gate** | nothing |
| **5E-1** | Build one seeded APK from the frozen post-ETP identity | engineering | 5A–5C complete |
| **5E-2** | `GATE-UPDATE-PHYSICAL` — install-replace on a real device | device | 5E-1 |
| **5E-3** | `GATE-ETP-PHYSICAL` + `GATE-ETP-INTERRUPTION` — API-23 OEM | device | 5E-1 |
| **5E-4** | `GATE-ETP-PRODUCTION` — real four-report publication | owner + data | 5E-1 |
| **5F-1** | `GATE-UAT` — staff matrix + named legal/privacy reviewer | **owner gate** | 5E-1 |
| **5F-2** | `GATE-RELEASE` — production signing + independent approver | **owner gate** | everything |
| **5G-1** | Final controlled audit/comparison; update HANDOFF | engineering | all above |

**Only three items are pure engineering with nothing in front of them: 5A-1, 5B-1, and later 5G-1.** Everything else waits on a person, a device, or real data.

---

## 2. Why capture is blocked - 5A-1, corrected

The MAH-3 capture harness cannot complete **any** module case on the current shell. Verified today on both `etp` and `planning`: both stall at `loadState: "Opening module"` and geometry never runs.

Two separate causes, one already fixed:

**Fixed — the session gate.** The shell gained an owner-claim and role gate after the harness was written (V6 Wave 6). With no session it sat on a blocking overlay and `blocking-shell-overlays` readiness failed. `prepareOrigin()` in `verification/mah3-visual-review/review-controller.js` now seeds `st_v2_owner_setup_v1`, `st_v5_owner_name` and `saagar_current_role_v1` on the dedicated loopback origin, which is cleared before every case. **Nothing ships** — the product never sets these; the harness writes them only on `127.0.0.1:8766`. Verified working: the role gate is gone and the module frame renders.

**First theory, now withdrawn - the module-open handshake.** The harness does:

```js
var loaded = waitForLoad(nestedFrame, 12000);
shellWindow.openModule(item.surface);
await loaded;
```

It waits for a plain `load` event on `#moduleFrame`, and module opening has since moved behind `www/shared/shell-module-frame-controller.js`. That looked like the cause. It is not.

**CORRECTION, same day: this was a misdiagnosis of mine.** The handshake is not broken. The harness calls `nextPaint()`, which uses `requestAnimationFrame`. Measured directly in the automation browser: `document.hidden` is permanently `true` and **rAF never fires**, neither top-level nor inside the iframe, so `nextPaint()` can never resolve and the flow parks at "Opening module". The identical stall reproduces on `planning`, which was captured successfully on 2026-08-07. **There is no harness bug to fix.** Capture needs a **visible browser window**, which the headless automation pane cannot provide. Run it from a real desktop browser - the session seed now clears the role gate, which was a genuine blocker and is fixed.

Clearing the role gate was still necessary and is done. Once run in a visible browser, the same harness serves **both 5A-2 and 5C-1** - the ETP visual cases and the rendered-language matrix.

---

## 3. Running order

### Stage 5A — visual evidence (engineering, then owner)

1. **5A-1** run the harness in a **visible desktop browser** (not an automation pane). Verify by capturing one `planning` case green first.
2. **5A-2** capture all 12 `etp` cases (169–180).
3. **5A-3** fluent reviewer marks each Pass/Defect with an evidence reference. Then, and only then, set `review.visualBaselinesCaptured` and `baseline.visualBaselinesCaptured` back to `true`, restore `reviewStatus`, refresh `runtimeRefactorGate` prose, and update the MAH-4 gates (`mah3RenderedCasesReviewed` back to 180, `refactorGateReady` true) with the test constants.

### Stage 5B — capability ledger

4. **5B-1** regenerate the delta against the post-ETP identity.
5. **5B-2** owner approves the exact rows, as the 107-row approval was done. This clears the last 3 `test:modular` failures.

### Stage 5C — language

6. **5C-1** recapture the 72-cell rendered matrix (the wording import changed product bytes).
7. **5C-2** identity-bound fluent visual approval.

### Stage 5D — owner decisions, can run in parallel from today

8. **5D-1** PAYMENTTYPE25: approve a versioned mapping or continued quarantine. Facts: WLMHW 2,802/4,658 rows (60.2%), HEMW 18/708. Quarantine drops tender attribution, **not** revenue — REC-002 reconciles clean.
9. **5D-2** ETP exceptions screen review; name the surface reviewed.

### Stage 5E — one build, then devices

10. **5E-1** freeze the identity and build **one** seeded APK. Record sha256, bytes, package/version.
11. **5E-2/3** device sessions. A cloud real-device farm satisfies `physical-android` honestly; an emulator does not. Class 2 needs a genuine API-23-era OEM device.
12. **5E-4** production ETP publication with the authorized four-report set.

### Stage 5F — release

13. **5F-1** staff UAT matrix + named privacy/legal reviewer.
14. **5F-2** production signing by a named custodian, then an **independent** approver. The approver must acknowledge in writing that A10-01, A10-04 and A10-05 are carried exceptions.

### Stage 5G — close

15. **5G-1** final controlled audit/comparison; update `HANDOFF.md`; mark the closure register.

---

## 4. Carried exceptions that do not block, but must survive into the register

| ID | State |
|---|---|
| `A10-01` | shell parse `+7.559%` vs `+5%`, P2 — C-08 fails solely for this |
| `A10-04` | DAT-02 save latency — unmeasured, structurally unclosable (see below) |
| `A10-05` | Expense memory growth — unmeasured, same |

`A10-04`/`A10-05` remain blocked by two structural facts, unchanged: `validBuildBinding` accepts only the reproducible-build APK (`d79eb925`), never the seeded one; and no producer emits `SAAGAR_A10_DEVICE_RUNTIME_ACCEPTANCE`. Closing them needs a device harness plus a decision about which artifact carries device evidence. **Not in Phase 5 scope unless separately authorised.**

The four ETP gates are carried exceptions only until 5E-3/5E-4 close them.

---

## 5. What "done" means

Phase 5 is complete when:

1. `test:mah3`, `test:mah4`, `test:modular`, `test:etp`, `test:manifest`, `test:language` are all green;
2. all 180 visual cases are captured and reviewed, and `visualBaselinesCaptured` is honestly `true`;
3. every gate row in the closure register carries a decision — closed, or explicitly carried with its risk stated;
4. the release-approved artifact is the **production-signed** one, not a debug APK; and
5. no physical, UAT, legal, production-data, signing or release authority rests on emulator-only evidence.

## 6. Current suite state

| Suite | Result |
|---|---|
| `test:mah3` | 19/19 |
| `test:mah4` | 46/46 |
| `test:etp` | 155/155 |
| `test:manifest` | 8/8 |
| `test:language` | 10/10 |
| `test:modular` | **83 pass, 3 fail** — the three capability-ledger checks (5B) |

`test:modular` has gone 74/12 → 83/3 across this work.

---

## 7. Update 2026-08-22 — 5B complete, 5C blocked

### 5B is done

Owner approved all 17 capability deltas on 2026-08-22
(`verification/audit/approvals/ETP-CAPABILITY-DELTA-APPROVAL-2026-08-22.json`). Three narrowly
scoped classification rules were added citing that approval, the analyser inventory was raised
660 → 680, and the ledger was regenerated. The ledger itself correctly remains
`approvalStatus: pending-owner-approval`; approval lives in the separate record, exactly as the
107-row set was handled.

One defect was fixed along the way. `A2-04` was failing because ETP-1's `etp-module-gateway.js`
duplicated the constants `VERSION` and `MAX_READ_ROWS` with `etp-native-store.js`. The gateway's
internals were renamed to `GATEWAY_VERSION` and `GATEWAY_MAX_READ_ROWS`; its **exported keys are
unchanged**, so there is no API change.

**Full sweep, 438 tests, zero failures:**

| Suite | Result |
|---|---|
| `test:modular` | **86/0** (was 74 pass / 12 fail when this work began) |
| `test:mah4` | 46/0 |
| `test:mah3` | 19/0 |
| `test:etp` | 155/0 |
| `test:security` | 100/0 |
| `test:manifest` / `test:language` / `test:mobile` / `test:settings` | 8/0 · 10/0 · 6/0 · 8/0 |

### 5C-1 is blocked, and not by anything fixable here

The rendered-language matrix recapture cannot be produced in this environment. Three independent
reasons, each verified:

1. **No producer exists.** `SAAGAR_RENDERED_UI_ATTESTATION` appears only in `scripts/audit/audits/a6.mjs`
   (the validator), `scripts/audit/evidence-trust-root.mjs` (the signing policy) and
   `scripts/audit/evidence-contract.mjs` (the path prefix). **Nothing in the repository writes one.**
   The three existing attestations were produced by tooling that was never committed.
2. **It must be Ed25519-signed** by trusted signer `phase4a-renderer-ed25519-9ec3b61bbbdb245f`.
   `a6` gates validity on `trust.authorized`, so an unsigned record is worthless. That private key is
   owner-provisioned and is not available here.
3. **Rendering needs a visible browser** — the same `requestAnimationFrame` limitation that blocks
   5A-2.

This is the **same structural shape as A10-04/A10-05**: a validator with no producer, plus an
owner-held signing key.

**The existing attestation is now stale.** It is bound to product fingerprint `08734dfb`, and
`www/app-i18n.js` changed with the wording import, so the current fingerprint has moved. `A6-04` and
`A6-05` will fail on the next full audit run until a fresh matrix is captured and signed. Nothing in
the focused suites covers this, which is why it is invisible today — exactly how the ETP-1 identity
drift went unnoticed.

### Revised remaining work

| # | Item | Blocked by |
|---|---|---|
| 5A-2 | capture 12 `etp` visual cases | visible browser |
| 5A-3 | fluent review of those 12 | owner |
| **5C-1** | **rendered-language matrix** | **no producer + owner signing key + visible browser** |
| 5C-2 | identity-bound visual approval | 5C-1 |
| 5D-1 | PAYMENTTYPE25 disposition | owner decision, available now |
| 5D-2 | ETP exceptions screen review | owner, available now |
| 5E–5G | build, devices, production data, UAT, legal, signing, release, final audit | as before |

**No engineering remains that can be done without either a visible browser, the signing key, a
device, real data, or an owner decision.** 5D-1 and 5D-2 are the only items that need nothing but
your judgement.
