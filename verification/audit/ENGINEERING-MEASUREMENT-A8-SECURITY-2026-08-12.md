# Engineering measurement — A8 security policy

> **NUMBERING CORRECTION (2026-08-12).** This record was originally filed under
> the P4.x numbering in `docs/audit/CONSOLIDATED-REMAINING-CLOSURE-PHASE-2026-08-12.md`.
> That numbering is **superseded**. The authority is
> `docs/audit/PHASE-4-MICRO-CHECKPOINTS-2026-08-12.md`, where P4.2 is *Final
> target freeze*, P4.3 *Unapproved controlled comparison*, P4.4 *Capability
> approval closure* and P4.5 *Localization and trusted UI closure*.
>
> This document is **engineering measurement only**. It closes no micro-checkpoint
> and must not be read as one. The current mini-phase is **P4.2 — final target
> freeze**, blocked on the A9-02 generated identity-hash contract.


**Date:** 2026-08-12 (Asia/Kolkata)
**Branch:** `agent/modular-phase1-shared-spine-v2`
**Phase authority:** `docs/audit/CONSOLIDATED-REMAINING-CLOSURE-PHASE-2026-08-12.md`
**Status:** work package **COMPLETE in code**. Gated on the two-device test before
release — see §4. That gate is a genuine release condition, not paperwork.

---

## 1. Exit criteria

> **Exit:** A8-01 through A8-05 are measured and pass with no P0 security finding.

Measured at branch HEAD with the discovery authorities `run.mjs` supplies:

| Check | Phase-doc starting point | Now |
|---|---|---|
| A8-01 PII flow | coverage required for 94 runtime files | **pass** — 93 runtime files, 0 high-confidence flows, authority complete |
| A8-02 export policy | 2 unguarded export/print paths | **pass** — 0 bypasses, 0 unresolved paths |
| A8-03 fail-open auth | 10 exception paths + ambiguous paths | **pass** — 0 fail-open paths, 0 unresolved |
| A8-04 tracked secrets | needed a declared discovery authority | **pass** — 567 tracked files, 564 scanned, 0 verified secret patterns |
| A8-05 remote runtime | 42 dynamic remote targets | **pass** — 0 unapproved remote calls, 0 unresolved dynamic targets |

**No P0 security finding remains.** All five were P0 at the Gate 0 baseline.

## 2. A8-05 — the messaging origin work (Decision 2)

Wildcard `postMessage` targets in product: **47 → 1**.

The implementation matches the shape recorded in
`docs/audit/P0-DECISIONS-2026-08-10.md` Decision 2, and it implements **both**
halves rather than only the easy one:

**Sender side** (`www/shared/module-runtime.js`) — one shared resolution, not 47
independent literals:

```js
var ORIGIN = (root.location && typeof root.location.origin === 'string') ? root.location.origin : '';
TARGET_ORIGIN = /^[a-z][a-z0-9+.-]*:\/\//i.test(ORIGIN) ? ORIGIN : '*';
```

with an explicit warning when the fallback engages
(`controlled wildcard fallback: same-origin target unavailable`). This is the
specific safety property Decision 2 required: a `file://` context yields origin
`"null"`, which fails the scheme test and falls back to `'*'` rather than
throwing — so constraining the origin cannot silently kill module messaging.

**Receiver side** (`www/shared/mah4-runtime.js`) — `event.origin === origin`
validation on inbound messages. This is the half that actually provides the
security benefit; a sender-side `targetOrigin` alone only limits leakage.

### 2.1 Residual

One wildcard remains, at `www/integration-bridge.js:927`
(`ST_OPEN_MODULE` for grooming). A8-05 reports **0 unapproved** remote calls, so
it sits inside an approved context. Recorded here so it is a known, deliberate
residual rather than something discovered later and mistaken for a regression.

### 2.2 Observation for the device test

The receiver-side check is strict equality against `location.origin` with no
`"null"`-origin allowance. In the shipped Capacitor WebView the origin is real,
so this is correct. But if any surface is ever loaded via `file://`, inbound
module messages would be rejected while the sender falls back to `'*'` — the two
halves degrade differently. Worth one explicit check on device.

## 3. A8-03 — re-auth moved off `prompt()` (Decision 1)

`SaagarReauth` no longer returns `true` on a throwing prompt. It now calls
`reauthKeypadResult()` — the Slice D DOM keypad — and on error returns
`{ok:false, status:'error'}`, i.e. **fails closed**.

This is exactly the remedy Decision 1 identified, and it is the right one:
removing the `prompt()` dependency is what makes fail-closed safe. The audit
previously reported 10-11 fail-open paths; it now reports 0.

## 4. Release gate — must not be skipped

**This work package changes authentication behaviour and the app's entire
shell↔module messaging on real devices.** Both changes are correct in code and
both are exactly the changes that were deliberately deferred as "device-gated"
because headless tests cannot observe them:

1. **Re-auth.** The failure mode being replaced is a store manager locked out on
   a device where the old fail-open path let them through. Confirm a real re-auth
   succeeds and a cancelled one denies, on both devices.
2. **Messaging origin.** Confirm every module still opens, exchanges messages and
   returns to the shell, and that the wildcard fallback warning does **not**
   appear in normal operation. If it does, the origin is not resolving and the
   constraint is not actually in force.

Until both pass on the two-device matrix, A8-03 and A8-05 are code-complete but
not release-accepted.

## 5. Regression coverage

Five A8 tests are present; one was added with this work
(`A8 approves only the validated local module-manifest src assignment`). The
conservative-authority guard from U1 also still holds: no A8 check can report
`pass` from heuristic absence alone — each one above declares complete discovery
authority, which is why these are `pass` rather than `unmeasured`.

## 6. Non-claims

- These are static-analysis results plus source verification. No device evidence
  exists for either behavioural change (§4).
- A8-01's clean result covers 93 runtime files under declared authority; it is
  not a proof that no PII flow can ever exist.
- The residual wildcard in §2.1 is approved, not absent.
