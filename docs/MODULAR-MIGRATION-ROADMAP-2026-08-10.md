# Modular HTML Migration — Roadmap

**Date:** 2026-08-10 (Asia/Kolkata)
**Anchor at authoring:** `fccd115cfefe136ce541331700b5a43b8269e898`
**Authority:** `docs/audit/AUDIT-PROGRAM-v1.md`; P0 dispositions in `docs/audit/P0-DECISIONS-2026-08-10.md`.
**Shape:** one gate + **three phases**. Deliberately minimal — each phase is a
coherent, separately shippable unit with its own device pass. Fewer phases would
put unrelated risk classes (messaging, structure, storage) in one device test.

---

## Where the code actually is

Measured at `fccd115`, not estimated:

| Fact | Value |
|---|---|
| Shell `www/index.html` | **711,857 bytes** |
| Modules | 11 external HTML files |
| Shared assets | 2 (`www/shared/`) |
| `www` total | 7,974,896 bytes, 85 files |
| Functions inventoried | 13,172 |
| Capability inventory (the oracle) | **654 capabilities, 0 conflicts, A3-02 `pass`** |

What the audit says is wrong, and which phase owns it:

| Check | Finding | Phase |
|---|---|---|
| A2-01 | 39 byte-identical duplicate function groups across 10 files | 1 |
| A2-02 | 42 near-copy groups, 1,997 similarity edges | 1 |
| A2-03 | 13 duplicate CSS blocks across all 11 modules | 1 |
| A2-04 | 6 domain constants duplicated across 17 files | 1 |
| A2-05 | 16 authority gaps for shared concepts | 1 |
| A8-05 | 47 wildcard `postMessage` calls | 1 |
| A1-02 | Undeclared `parent.*` / global dependencies (e.g. `parent.__stTargetPending`) | 2 |
| A1-07 | Shared-asset fan-out; `app-i18n.js` reaches all 11 modules | 2 |
| A6-04/05 | No rendered-UI evidence | 3 |
| A8-03 | Re-auth still on `prompt()` | 3 |

---

## The one rule that governs every phase

**The capability inventory must come out identical.** A3-02 is the acceptance
oracle: 654 capabilities with 0 conflicting IDs. Any phase that changes it has
changed behaviour, whatever the tests say. Comparison elsewhere is
direction-based; **this one is exact equality**.

Because capability IDs derive from tag, type, key and stable attributes, moving
markup between files is safe, but renaming a control, dropping a `data-action`
or changing an `id` is not. Where a control genuinely must move, its
`data-action` travels with it unchanged.

---

## Gate 0 — Freeze the "before"

**This is not migration work. Nothing in Phase 1 may start until it is done.**

The published baseline is at `57507ef` / anchor `f4da822`, which predates the
SEC-08 fail-closed fix, the A4 classification work and the A8 guard-resolution
fixes. A migration's "before" must be taken at the commit you migrate *from*.

1. Re-run the baseline from a clean detached worktree at the current anchor.
2. Confirm A3-02 `pass` with 0 conflicts, A4-03 `pass`, A4-02 at 73, A8-02 at 2.
3. Commit and push the evidence.

**Exit:** committed baseline evidence whose `productBaselineSha` equals the
current anchor. ~20 minutes, unattended.

---

## Phase 1 — Shared spine

**Owns: A2 (all five), A8-05. Modules keep their current structure.**

De-duplication needs somewhere to move code *into*, and the messaging layer is
that spine. Doing the origin fix here rather than later means the shell↔module
contract is device-tested **once**, not twice.

### Work

1. **Versioned shared runtime.** Promote the 39 byte-identical groups and the
   defensible subset of the 42 near-copy groups into `www/shared/`, behind an
   explicit version. Near-copies are reviewed individually — some differ for a
   reason, and collapsing those is how migrations introduce bugs.
2. **Shared stylesheet.** Lift the 13 duplicate CSS blocks out of 11 modules.
3. **Single authority for shared concepts.** Close the 6 duplicated constants
   and 16 authority gaps: one owner per concept, everything else imports it.
4. **Constrain `postMessage` (A8-05).** One shared helper resolving the target
   origin once, with an explicit logged fallback where the origin is unusable —
   not 47 independent literals. Add receiver-side `event.origin` validation,
   which is the half that actually provides the security benefit.

### Risk and rollback

The messaging change is the risky part: if `location.origin` resolves to
`"null"`, `postMessage` throws and module communication stops. The helper must
be written so the fallback path is reachable and logged, and rollback is
reverting the single helper rather than 47 sites.

### Exit

- A2-01/03/04/05 pass; A2-02 reduced with each surviving near-copy justified.
- A8-05 unapproved remote calls reduced to declared, approved contexts.
- **A3-02 identical: 654 / 0 conflicts.**
- 492/492 offline; MAH-3 and MAH-4 baselines regenerated; **two-device pass**.
- Re-anchor and re-baseline.

---

## Phase 2 — Structure

**Owns: A1-02, A1-07, M3 (split module internals), M4 (shell slimming).**

Only attemptable once Phase 1 gives shared contracts to depend on. This is the
phase that actually makes the codebase modular.

### Work

1. **Declare the boundary (A1-02).** Every `parent.*` and global dependency —
   `parent.__stTargetPending` and its siblings — becomes a declared, versioned
   entry in the module contract. Undeclared access becomes a failure, not a habit.
2. **Split the 711 KB shell (M4)** into controllers and surfaces along the
   boundary Phase 1 established. Target is structural, not a byte count:
   no controller should own more than one concern.
3. **Split module internals (M3)** where a module carries several concerns.
4. **Rationalise fan-out (A1-07).** `app-i18n.js` reaching all 11 modules is
   fine *if declared*; the finding is undeclared coupling, not sharing.

### Explicitly out of scope

**Storage.** `www/storage-core.js` and the native storage path are not touched
in this phase. This repository's history is that storage changes crashed the app
three times in about three days, and headless tests cannot see WebView storage
failures. Any storage restructuring is its own slice, after Phase 3, done
micro-incrementally with a device test per step.

### Exit

- A1-02 and A1-07 pass; shell split with no behaviour delta.
- **A3-02 identical: 654 / 0 conflicts.** This is the phase where that check
  earns its existence — it is the only mechanism that will catch a control
  silently lost while moving markup between files.
- 492/492; two-device pass; re-anchor and re-baseline.

---

## Phase 3 — Guard rails and acceptance

**Owns: M6, A6-04/05, A8-03, and the final comparison.**

### Work

1. **Rendered-layout guard rails (M6, A6-04/05).** Supply the rendered-UI
   evidence matrix so responsive/contrast checks stop being `unmeasured`. This
   is the guard that makes *future* migrations safe, which is why it lands after
   the structure it will protect.
2. **Re-auth off `prompt()` (A8-03, Decision 1).** Move re-auth onto the Slice D
   DOM keypad. Once the `prompt()` dependency is gone the control can fail closed
   without the lockout risk that justifies today's fail-open. Device-gated.
3. **Final comparison run.** Re-run the frozen program in `comparison` mode
   against the Gate 0 baseline.

### Exit — the actual definition of done

- Capability inventory **exactly equal** to the Gate 0 baseline.
- No new `fail`, no new mandatory `unmeasured` versus Gate 0.
- A2 and A1 findings closed; M2/M3/M4/M6 complete.
- 492/492; two-device pass; evidence committed and pushed.

---

## Carried, not blocking

| Item | Why it does not gate migration |
|---|---|
| A9-01/02/05 two-build evidence | Blocked on the `services.gradle.org` TLS revocation failure, not on code. Fix the proxy/TLS path, then re-run. |
| A5-05 storage mutation | Detected correctly; the run takes ~150 s against a 120 s capture timeout. Tooling fix. |
| A4-02 (73) and A8-02 (2) residue | Analyser limits — runtime-computed key names, and two sinks whose guards are shaped differently. Not product defects. |
| 10 external gates | Device, UAT, language, legal, signing, release. End-of-line, human-owned. |

## Per-phase discipline

Every phase repeats the same loop, because every one of these has bitten this
repository before:

1. Change product → regenerate module manifest, golden hashes, MAH-3 and MAH-4
   profiles.
2. Bump the MAH-4 frozen `www` byte total deliberately — it exists to force
   acknowledgement of a `www` change.
3. Run 492/492 offline **and** the audit self-test.
4. Re-anchor: the gates demand an exact product-fingerprint match, so a product
   change without a re-anchor blocks every future baseline. Anchor history lives
   in `AUDIT-PROGRAM-v1.md` §1.3.
5. Re-baseline, then device-test.

Migration may not begin without owner authorization (closure addendum, step 16).
