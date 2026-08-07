# MAH-3 — Shared Module Runtime Canary

**Date:** 2026-08-06 (Asia/Kolkata)

**Owner authorization:** “can we start with Phase 3”

**Baseline:** `main` at `c04bc98255a78d45b08ac449d88365b22d033f28`, intentionally dirty

## 1. Programme identity

In this post-C1 modular-hardening sequence, Phase 3 means **MAH-3 — Shared
Module Runtime Canary**. It is not:

- the master plan’s Phase 3 money/insight/release work;
- C3 formal acceptance and production release; or
- historical M3 per-module HTML/CSS/JS splitting.

The MAH-2 manifest foundation is green, but MAH-2 shared architecture is not
complete. The controlling next dependency is the uncaptured MAH-1 rendered
baseline.

## 2. Findings reported before editing

1. `visualBaselinesCaptured` and physical-device/native-language acceptance are
   still false. Earlier C1 browser evidence predates the Settings redesign.
2. The saved MAH-1 inventory is stale after MAH-2: the live shell is 715,491
   bytes with 28 source-visible timeouts, not 723,205 bytes and 29 timeouts.
3. Planning is a medium-risk canary: no table, interval or access bridge, but 8
   timeouts and 2 MutationObservers.
4. Planning’s six shared JavaScript bodies total 13,366 bytes. Two are
   byte-identical in all eleven modules; the remaining four normalize to one
   parameterized template each.
5. Four large CSS blocks are also duplicated, but CSS extraction is explicitly
   last because loading/cascade changes require rendered evidence.
6. Manifest schema 1 hashes module entry HTML only. A future shared runtime must
   become a manifest-bound asset before any module consumes it.
7. Existing inventory and export/security scanners inspect inline HTML. They
   must resolve declared local scripts before runtime extraction or they will
   become false-green.
8. DSR is the access/timer canary. QMS is the timer/mobile-menu canary and must
   not be described as having live access context.
9. The in-app visual tool could not start because its Windows ACL sandbox
   process failed. No browser/device pass is inferred from source tests.

## 3. Authorized scope

### Stage A — baseline gate (implemented in this checkpoint)

- Bind the exact dirty `www` tree, critical assets, raw profile and runner to
  SHA-256 identities.
- Provide a dependency-free, loopback-only 168-case review runner.
- Load every module through the real shell `openModule()` path and inspect both
  shell chrome and the nested module frame.
- Preserve evidence honesty: geometry is advisory; a person must review every
  case; browser evidence is not device or native-language acceptance.
- Use empty non-PII topology state generally and a deterministic non-PII
  Planning fixture for targets, actuals and checklist layout.
- Keep all product runtime files byte-identical while the baseline is pending.

### Stage B — Planning runtime canary (gated, not yet applied)

Only after the exported evidence says `refactorGateReady=true` and the evidence
is reviewed:

- introduce one classic, synchronous, offline shared runtime;
- bind it in a strict versioned manifest with byte/SHA metadata;
- replace only Planning’s six shared JavaScript bodies while preserving their
  six parser positions and execution order;
- keep Planning business CSS/JS and all shared CSS blocks byte-identical;
- make inventory, export/security scanning and Android package parity resolve
  the declared local runtime; and
- verify Planning at 4 viewports × 3 languages before DSR and QMS canaries.

### Explicitly excluded

- ETP, PHP, SQLite/storage semantics, schema changes and business rules.
- Broad access-context enablement.
- Message-envelope/origin redesign and lifecycle cleanup.
- Shared CSS/design tokens, module splitting, shell slimming and fallback
  retirement.
- APK build, production signing, commit or push without separate approval.

## 4. Exact baseline identity

- `www` files: 63
- total bytes: 7,752,655
- tree SHA-256:
  `be92d6c9202052866d02aa33590160c27a804c638267c6f21717e00e89d78d95`
- shell SHA-256:
  `a79ab0cc1c42e732c151bd5a719d3b728fec68a6c20442b3bc718a3434c5e219`
- manifest SHA-256:
  `64e90916c64f8babd39254cd800372d6b5e9800311bb4c7c59480bbaacd35330`
- Planning SHA-256:
  `85bdf7c272a33a8ac761aafb5d0560fbae7f063eeb280af4f4cc4e129c574d1f`

The server verifies the profile, captures each `www` file once, recomputes the
snapshot fingerprint, and serves only that immutable in-memory snapshot. A
running review therefore cannot silently mix source revisions.

## 5. Review runner contract

Run:

```text
npm run review:mah3
```

Then open the printed `127.0.0.1` URL. The server never binds to a LAN address.

The matrix is exactly:

- surfaces: shell Home, Settings home/detail, and all eleven modules;
- viewports: 360×800, 412×915, 800×600 and 1365×768;
- languages: English, Marathi and Hindi;
- total: 168 unique cases.

Before allowing Pass, the current case must have the expected path, dimensions,
language storage, UI mode, fonts, shell/module state, hidden loader and no large
blocking overlay. The runner waits for the nested frame, fonts, the existing
1,600 ms helper timer and two paint frames.

Advisory geometry records root overflow, horizontal/off-screen controls,
ancestor clipping, covered visible controls, vertical reachability, table/tab
scroll containment, 44 px tap candidates and fixed/sticky collision candidates.
Notes are length-limited and must not contain customer or staff data.

Evidence can be exported incomplete and later imported/resumed. A complete
capture and a passing visual baseline are deliberately separate:

- `captureComplete` requires reviewer, all 168 manual statuses, geometry and
  evidence references, plus notes for defects/deferrals;
- `visualBaselinePassed` additionally requires no defect, deferral, readiness
  failure or hard geometry finding;
- `refactorGateReady` equals the passing visual baseline;
- device, native-language and production acceptance always remain false here.

The 168-case matrix proves default/topology surfaces plus a meaningful Planning
canary fixture. It does **not** claim all three review states for every module.

## 6. Planning extraction contract after the gate

Planning configuration is fixed as:

```json
{
  "schemaVersion": 1,
  "moduleId": "planning",
  "nextSteps": [],
  "customerSelectors": [],
  "accessContext": false
}
```

Required order remains:

1. storage shim;
2. safety net;
3. existing mobile CSS;
4. mobile bootstrap;
5. Planning head assets;
6. Planning business script;
7. Back CSS and FAB markup;
8. Back runtime;
9. employee-assist CSS and runtime; and
10. audit wrapper last.

Do not use `async`, `defer`, `type="module"`, fetch, remote assets or a new API
dependency for this runtime. Audit wrapping must remain after the storage facade
and before `DOMContentLoaded`. Planning’s business script must remain classic
and global because its inline handlers call global functions.

## 7. Gates

Current automated gate:

```text
npm run test:mah3
npm run test:modular
```

Stage B cannot begin until:

- all 168 cases have reviewed evidence;
- exported evidence is bound to the exact profile/source/runner hashes;
- `refactorGateReady=true`;
- every defect is fixed and recaptured, with no deferral treated as a pass; and
- the owner confirms the evidence is the intended baseline.
