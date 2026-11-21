# P0 Findings — Decision Record

**Date:** 2026-08-10 (Asia/Kolkata)
**Baseline:** `verification/audit/2026-08-10-130643-57507ef` (target `57507ef`, anchor `f4da822`)
**Status of this record:** owner-directed. Decisions 1-3 below were raised as
concerns, reaffirmed by the owner, and are being executed in the stated order.

The 2026-08-10 baseline reported five P0 findings. Investigation showed they are
not five instances of one thing. They fall into three classes, and only one class
is "a bug in product code".

| Finding | Class | Disposition |
|---|---|---|
| A4-03 storage classification/use contradiction | Real defect | **FIXED** — `8bbd716`, now passes |
| A4-02 persistent-artifact classification | Part real, part audit blind spot | **PARTIALLY FIXED** — 98 → 80; remainder is Decision 3 |
| A8-02 export policy bypass | Audit blind spot | Decision 3 |
| A8-03 fail-open authentication | Signed design, not a defect | Decision 1 |
| A8-05 unapproved remote runtime behaviour | Real architectural risk | Decision 2 |

---

## Decision 1 — A8-03 fail-open authentication

### What the audit found

11 fail-open paths. The two central ones are in `SaagarReauth`
(`www/index.html` 3061, 3077):

```js
if(!hasAdminPin()) return true;   /* FAIL-OPEN: no PIN on this device => never gate */
catch(e){ return true; }          /* FAIL-OPEN: a throwing prompt (WebView quirk)
                                     must ALLOW, never brick */
```

### Why this is not a bug

These are deliberate and signed. The function header states the behaviour is
preserved "byte-for-byte" and calls it "the single load-bearing line". R0-W1
Slice B shipped `SaagarReauth` explicitly as a fail-open primitive, and the
recorded device risk is the inverse of what the audit wants: a restored PIN plus
a broken `prompt()` produces a store-manager lockout. `SaagarReauth` is also
verify-only — it can neither grant nor revoke privilege — so a fail-open return
does not escalate anyone; it only declines to re-challenge.

Making it fail-closed would deny access on precisely the devices the design
protects, on an app in daily retail use. **The audit is right that it is
fail-open, and the design is right that it must be.**

### Decision

Keep fail-open. Do **not** flip the return values.

The real remedy is to remove the dependency that forces the compromise: re-auth
still uses `prompt()`, whereas R0-W1 Slice D already replaced the launch lock's
`prompt()` with a DOM keypad overlay. Moving re-auth onto that same keypad makes
the `catch` unreachable in practice and lets the control fail closed without
risking a lockout.

**Status: deferred, device-gated.** This is a build slice, not a patch: it needs
the keypad path, a two-device test pass, and owner sign-off — the same treatment
Slice D received. A8-03 remains an accepted, documented P0 until then.

---

## Decision 2 — A8-05 unapproved remote runtime behaviour

### What the audit found

24 rows, dominated by `postMessage(..., '*')`. Across the product there are
**47** wildcard `postMessage` calls. A wildcard target origin means the message
is deliverable to any origin that ends up in that frame.

### Why it was not changed blind

These calls are the shell↔module messaging backbone. Constraining them touches:

- the MAH-4 protocol contract and its frozen baseline profiles;
- every module iframe interaction in the app;
- platform behaviour that headless tests cannot observe. If `location.origin`
  resolves to `"null"` (a `file://` context), `postMessage` with that string
  throws and module communication stops dead.

This repository's history is explicit that WebView storage and messaging changes
have crashed the app repeatedly and must be device-tested.

### Decision

Constrain the target origin, but as a **device-gated slice**, not a blind
rewrite. The intended shape:

1. A single shared helper resolving the target origin once, with an explicit,
   logged fallback when the origin is not usable — rather than 47 independent
   literals.
2. Receiver-side `event.origin` validation, which is the half that actually
   provides the security benefit; sender-side `targetOrigin` alone mostly
   prevents leakage.
3. Regenerate the MAH-4 baseline profiles, then a two-device test pass.

**Status: deferred, device-gated.** A8-05 remains an accepted, documented P0.

---

## Decision 3 — A4-02 and A8-02 audit blind spots

### What the audit found

- **A8-02:** 9 export-policy bypasses, `staticDiscoveryComplete: false`.
- **A4-02:** 80 unclassified artifacts after the `8bbd716` fix, of which 66 have
  runtime-computed filenames.

### Why these are not product defects

**A8-02.** `downloadFallback` has 6 references and *every one* is inside
`share()`. `share()` fail-closes on `beginDelivery` before any of them, and the
module exports only `{ share }`, so no other entry point exists. The guard is
present and structurally sound; the analyser requires it inside the function or
proven at every call site, and cannot currently prove the latter. Adding a second
guard inside `downloadFallback` was considered and rejected: it would have to
block whenever the export register is unreadable, converting a storage hiccup
into a failed legitimate export.

**A4-02.** The 66 remaining artifacts have filenames built at runtime. Rewriting
dynamic filename construction into literals across the product to satisfy a
static matcher is exactly the harmful churn rejected during the A3-02 work, where
206 "unresolved bindings" turned out to be five audit defects rather than product
defects.

### Decision

Fix the tooling, not the product — the approach already validated on A3-02.

1. **A8-02:** teach the analyser caller-proven guards. A helper counts as guarded
   when it is module-private (never exported) and *every* reference to it lies
   inside a function that structurally fail-closes. This is stricter than the
   current heuristic, not looser: it requires proving the complete call set, and
   any unproven reference still fails.
2. **A4-02:** classify file artifacts by their **directory**, which is statically
   known even when the filename is not. A `CACHE:` artifact is re-derivable and a
   `DATA:` artifact is device-local regardless of what the computed filename
   turns out to be, so the classification is sound without resolving the name.

**Status: in progress in this session.**

---

## Standing rule confirmed by this exercise

A P0 from a static audit is a *question*, not a verdict. Three of these five were
not defects in the product: one was a signed design, one an architectural change
needing device evidence, and two were limits of the analyser. Fixing product code
to satisfy any of those would have degraded a working retail application. The
audit's value here was in forcing each one to be examined and recorded — which is
what this document is for.
