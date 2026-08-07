# MAH-1 — Modular Architecture Protection & Visual Baselines

**Date:** 2026-08-06 (Asia/Kolkata)

**Owner authorization:** “lets start with Phase 1”

**Technical prefix:** `MH1` in scripts/tests to keep filenames compact

**Baseline:** branch `main`, HEAD
`c04bc98255a78d45b08ac449d88365b22d033f28`, intentionally dirty C1 tree

## 1. Naming and programme position

This work is named **MAH-1** so it cannot be confused with the legacy Android
master plan's “Phase 1”, which includes ETP work. MAH-1 is a post-C1 hardening
workstream. It does not change the controlling C1/C2/C3 programme structure.

## 2. Objective

Create a reproducible inventory and a protection layer before shared CSS/JS,
message-protocol, lifecycle, shell-splitting or per-module refactoring begins.
The phase must detect architectural and responsive drift without changing
business calculations, persistence semantics or operational workflows.

## 3. In scope

- All eleven external module documents and the shell.
- Relative-path, byte, SHA-256 and offline-asset integrity.
- Shared responsive, language and shell-bridge dependencies.
- Module risk/review-state inventory.
- Viewport/language evidence matrix.
- Protection of forced Desktop mode from phone-only shell CSS.
- Reproducible counts for module assets, messages, parent dependencies, storage
  literals, inline scripts/styles, tables, timers, observers and breakpoints.
- Dependency-free Node tests registered in the offline pre-gate.
- A later rendered geometry/screenshot evidence run, clearly separated from
  source-contract evidence.

## 4. Explicitly out of scope

- ETP and PHP.
- SQLite/storage changes, schema changes or data migration.
- Business-rule, payroll, tax, QMS, Service, DSR or Stock workflow changes.
- Shared design-system extraction.
- Message protocol or access-control redesign.
- Module lifecycle implementation.
- Shell or module HTML/CSS/JS splitting.
- Production signing, release distribution, commit or push.

## 5. Current architectural truth

External-file extraction is complete: all eleven modules are relative local
files and `html_b64` is absent from the active registry. The broader historical
M0–M6 target is not complete:

- the shell remains 723,205 bytes;
- all modules remain large single `index.html` documents;
- there is no `www/shared/` or `www/shell/` directory;
- the shell still contains the `srcdoc`/`buildModuleSrc` fallback;
- rendered DOM/geometry/screenshot baselines do not yet exist;
- same-origin behaviour and physical-device acceptance are not formally proven.

No document may use “modular migration complete” without distinguishing those
two levels.

## 6. Deliverables

1. `scripts/audit-modular-architecture.mjs` — read-only reproducible inventory.
2. `verification/MH1-MODULAR-PROTECTION-PROFILE.json` — versioned protection
   profile, module risks, review states and evidence matrix.
3. `tests/mh1-modular-inventory.test.mjs` — inventory and dependency contracts.
4. `tests/mh1-modular-protection.test.mjs` — integrity, offline, responsive,
   language, bridge and acceptance-honesty contracts.
5. `www/mobile-shell.css` — phone rules require both phone width and explicit
   `html.bcc-mobile` mode.
6. A rendered visual/geometry evidence record. This remains pending until a
   supported deterministic browser run is available.

## 7. Evidence policy

- Source tests do not equal visual acceptance.
- Browser screenshots do not equal physical-device acceptance.
- Proper names, business data and volatile seeded values must not be used as
  visual golden content.
- Screenshot comparison must not become a blocking gate until browser engine,
  version, fonts, viewport, date and seed profile are pinned.
- Geometry checks should precede pixel comparisons: root overflow, unreachable
  controls, fixed-action overlap, local scroll containment and Settings
  master/detail visibility.

## 8. Completion criteria

MAH-1 is complete only when:

- the reproducible inventory covers all eleven modules;
- dependency, byte/hash, offline and responsive guards pass;
- the approved viewport/language matrix has reviewed visual evidence;
- every reported defect is either fixed and recaptured or explicitly deferred;
- focused Settings/language, offline and full regression suites remain green;
- no formal device, language or production acceptance is claimed without its
  own evidence; and
- an immutable baseline commit is created only after explicit owner approval.
