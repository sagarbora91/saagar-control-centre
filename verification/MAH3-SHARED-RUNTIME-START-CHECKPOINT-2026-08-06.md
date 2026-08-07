# MAH-3 shared-runtime canary start checkpoint — 2026-08-06

## Resume identity and safety

- Repository: `V:\Co work\Projects\Retail\saagar-control-centre`
- Branch: `main`
- HEAD: `c04bc98255a78d45b08ac449d88365b22d033f28`
- Working tree: intentionally dirty; all existing/user-owned changes preserved.
- `package-lock.json` remains untouched.
- No reset, discard, delete, APK build, commit or push was performed.
- ETP, PHP, storage semantics, business rules and production signing remain
  excluded.

## Phase identity

The owner’s “Phase 3” instruction is recorded as **MAH-3 — Shared Module
Runtime Canary**, following MAH-1 source protection and the MAH-2 manifest
foundation. It is not the master-plan money phase, C3 release acceptance, or
historical M3 HTML/CSS/JS splitting.

## Discrepancies reported before editing

1. MAH-1 has no reviewed 168-case rendered baseline; source tests cannot replace
   it and physical-device/native-language acceptance remain false.
2. MAH-2 is foundation-complete only. Shared runtime, messages, lifecycle, CSS,
   splitting and shell slimming are still open.
3. The MAH-1 inventory predates MAH-2: its shell/timeouts values are stale.
   Current values are 715,491 bytes and 28 source-visible timeouts.
4. Planning has no table, interval or access bridge but has 8 timeouts and 2
   MutationObservers.
5. Manifest schema 1 does not bind transitive shared assets, while generic
   inventory/export scanners currently inspect only inline HTML.
6. DSR is the access/timer canary; QMS has timers/mobile menu but no live access
   bridge.
7. Browser control failed at startup because its Windows ACL sandbox process
   could not initialize. No render pass was fabricated.

## Saved Stage-A implementation

- Added a strict baseline profile:
  `verification/MAH3-SHARED-RUNTIME-BASELINE-PROFILE.json`.
  It binds the complete 63-file, 7,752,655-byte `www` tree at SHA-256
  `be92d6c9202052866d02aa33590160c27a804c638267c6f21717e00e89d78d95`,
  plus critical shell/manifest/language/layout/Planning/DSR/QMS assets.
- Added `scripts/mah3-visual-review-server.mjs`:
  - binds only `127.0.0.1`;
  - accepts GET/HEAD only;
  - validates the exact profile and manifest routes;
  - captures each `www` byte once, recomputes the snapshot fingerprint and
    serves only that immutable in-memory snapshot;
  - snapshots the review UI, emits no-store/nosniff headers and applies a
    runner-only CSP; and
  - exposes raw profile, source-tree and runner-bundle hashes to evidence.
- Added the manual review UI under `verification/mah3-visual-review/`:
  - exact 14 surfaces × 4 viewports × 3 languages = 168 cases;
  - every module opens through the real shell `openModule()` path;
  - shell chrome and nested module geometry are both recorded;
  - a deterministic generic Planning fixture exercises targets, QMS actual,
    leave freeze and checklist layout without names or phone numbers;
  - readiness checks pin URL, dimensions, mode, language storage, fonts,
    surface, nested load/loader state and blocking overlays;
  - advisory checks cover overflow, clipped/covered/unreachable controls,
    table/tab containment, tap floors and fixed/sticky collisions;
  - a Pass is blocked until the current case is readiness-green and has an
    evidence reference;
  - import/resume is bound to exact profile/source/runner hashes; and
  - capture completion, visual pass and refactor readiness are separate.
- Added focused source/server tests and registered:
  - `npm run test:mah3`;
  - `npm run review:mah3`; and
  - both MAH-3 test files in `npm run test:modular`, therefore the offline
    pre-gate.
- Added the controlling change contract:
  `docs/audit/MAH3-SHARED-RUNTIME-CANARY-CHANGE-CONTRACT-2026-08-06.md`.

`verification/mah3-visual-review/review-controller.js` is authoritative.
The untracked local `review.js` is an unused superseded draft and is excluded
from controlled publication; the server neither serves nor fingerprints it.

## Planning canary inventory

- Entry: 60,724 bytes, SHA-256
  `85bdf7c272a33a8ac761aafb5d0560fbae7f063eeb280af4f4cc4e129c574d1f`.
- Six shared JavaScript bodies: 13,366 bytes total.
- Byte-identical across all eleven: iframe storage shim and safety net.
- Parameterized common templates: mobile boot, Back, employee assist and audit.
- Planning config: `moduleId=planning`, no next steps, no customer selectors,
  no access bridge.
- Planning business CSS and JavaScript are separately hash-pinned.
- Four identical shared CSS blocks remain deliberately inline until the later
  rendered CSS phase.

## Verification at save point

- MAH-3 focused profile/runner/server suite: **7/7 passed**.
- Combined modular gate: **21/21 passed**.
- Explicit offline suite, including all focused pre-gates: **256/256 passed**.
- Complete `tests/*.test.mjs` regression glob: **310/310 passed**.
- The server tests prove immutable serving after source mutation, runner
  snapshotting, exact matrix/profile/runner hashes, GET/HEAD behavior, POST
  rejection and encoded traversal rejection.
- Product `www` bytes remain unchanged from the MAH-2 baseline.

These results were rerun from the saved MAH-3 working tree on 2026-08-06. They
are automated engineering evidence only and do not replace the open rendered
or physical-device gates.

## Evidence status and exact next action

- Review runner: ready.
- 168 rendered cases reviewed: **0/168**.
- `visualBaselinesCaptured`: **false**.
- Planning shared runtime wired: **no**.
- Device/native-language/production acceptance: **false**.

Run `npm run review:mah3`, open the printed loopback URL, complete/import the
review, and export the evidence JSON. Product refactoring begins only after the
evidence is reviewed and says `refactorGateReady=true`.

After that gate, the next coherent module is manifest-bound shared JavaScript
for Planning only, preserving six parser positions and all current CSS. Then
run Planning 12/12 renders, followed by DSR and QMS canaries. Message/lifecycle
contracts and CSS remain later modules.
