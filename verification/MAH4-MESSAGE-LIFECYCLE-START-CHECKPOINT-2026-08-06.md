# MAH-4 message/lifecycle start checkpoint — 2026-08-06

> **Superseded 2026-08-07.** This is the historical start checkpoint. Its
> `9/9`, `30/30`, “transitive,” “74 active,” pending-schema and exact-next-action
> statements are no longer current. Resume from
> `verification/MAH4-MESSAGE-LIFECYCLE-STAGE-A-CHECKPOINT-2026-08-07.md`.
> Product runtime remains blocked exactly as described below.

## Resume identity and safety

- Repository: `V:\Co work\Projects\Retail\saagar-control-centre`
- Branch: `main`
- HEAD: `c04bc98255a78d45b08ac449d88365b22d033f28`
- Working tree: intentionally dirty; all existing and user-owned changes remain
  preserved.
- `package-lock.json`: untouched.
- MAH-4 adds only documentation plus a non-product inventory oracle and tests.
  No `www`, manifest, Android or MAH-3 runner/profile byte changed.
- No reset, discard, deletion, APK build, commit or push was performed.
- ETP, PHP, storage semantics, business rules and production signing remain
  excluded.

## Phase identity

The owner's “Phase 4” instruction is recorded as **MAH-4 — Message Envelope &
Lifecycle Contracts**, following MAH-1 protection, the MAH-2 manifest foundation
and the still-incomplete MAH-3 shared-runtime canary.

This is not historical M4 shell slimming, C2 ETP, C3 acceptance, the older
master-plan closure phase or authorization to bypass MAH-3.

Controlling contract:
`docs/audit/MAH4-MESSAGE-LIFECYCLE-CHANGE-CONTRACT-2026-08-06.md`.

## Discrepancies recorded at start

1. No prior controlling document explicitly defined MAH-4. The MAH-2 exact
   sequence nevertheless places message-envelope and lifecycle contracts after
   the Planning, DSR and QMS shared-runtime canaries and before shared CSS.
2. MAH-3 rendered review remains **0/168**, `refactorGateReady=false`, and no
   reviewed evidence export is present.
3. Planning shared runtime is not wired; its 12-case comparison and the DSR/QMS
   canaries therefore have not occurred.
4. Semantic inspection identifies **15 active protocol types**:
   - shell → module (6): `ST_ACCESS_CONTEXT`, `ST_LANG`, `ST_OPEN_FEATURE`,
     `ST_SET_DATE`, `ST_UI_MODE`, `ST_WA_SENT`;
   - module → shell (9): `ST_AUDIT`, `ST_BACK_HOME`, `ST_OPEN_MODULE`,
     `ST_PRINT`, `ST_REPORT`, `ST_REPORT_BATCH`, `ST_SHARE`, `ST_WA`,
     `ST_WA_LINK`.
5. `ST_BACK` is a future/deep-Back marker and `ST_READ_ONLY` is a source marker;
   neither is an active posted-message flow today.
6. Service posts the orphan non-`ST_*` `__edit_mode_available` signal and has
   listeners for `__activate_edit_mode` / `__deactivate_edit_mode`; the shell
   has no matching live route and those listeners do not source-check.
7. No `READY`, `ERROR`, `DISPOSE` or disposal acknowledgement exists.
8. Active messages use wildcard target origins. The main shell router
   source-checks its nine module-originating action types against the active
   iframe, but `sqlite-store.js` separately consumes `ST_AUDIT` without that
   guard. Origin, version and per-load instance are not uniformly bound, and
   module receiver checks are inconsistent.
9. Current source-visible lifecycle positions are:
   - shell: 28 timeouts, 2 intervals, 2 mutation observers and 2 resize
     listeners;
   - modules: 110 timeouts, 3 intervals and 22 mutation observers;
   - QMS: 2 recurring intervals; DSR: 1 recurring interval.
   Counts describe source positions, not simultaneous runtime activity.
10. Manifest schema 1 does not bind transitive shared runtime assets. The
    historical `srcdoc/buildModuleSrc` branch remains in source but is dormant
    for valid schema-1 records, which always have `src` and no `html_b64`.
11. `ST_AUDIT` currently carries raw storage `before`/`after` values. Protocol
    diagnostics must not preserve that PII-capable payload accidentally; its
    redaction/retention policy remains an explicit pre-runtime decision.

## Saved Stage-A result

- Phase identity and ordering are explicit.
- The 6/9 direction split and 15-type active catalogue are established as the
  baseline vocabulary; exact schemas, limits and authorization behavior still
  require the Stage-A oracle and fixtures before being called frozen.
- `scripts/lib/mah4-contract-source.mjs` resolves canonical manifest-linked
  scripts, separates the dormant shell generator from active entry programs,
  and inventories producers, consumers, transitive assets and lifecycle sites.
- `scripts/audit-mah4-message-lifecycle.mjs` emits the reproducible JSON
  inventory; `verification/MAH4-MESSAGE-LIFECYCLE-BASELINE-PROFILE.json` pins
  the exact result to the unchanged MAH-3 `www` tree.
- The scanner records 74 active literal `postMessage` call sites, all using a
  wildcard target origin. It distinguishes the 15 live `ST_*` types from the
  17 lexical tokens and the three Service `__edit_mode_*` orphan signals.
- Transitive inspection includes `app-i18n.js` for `ST_LANG` and the second,
  unguarded `ST_AUDIT` consumer in `sqlite-store.js`.
- Two focused test files cover path rejection, dormant-program masking, exact
  vocabulary/directions, producer/consumer drift, trust posture, QMS/DSR
  lifecycle counts, mount/unmount facts and honest false acceptance gates.
- A proposed protocol-v1 envelope includes channel, version, type, module id,
  per-load instance id, message id, optional correlation and bounded payload.
- Proposed control messages are `ST_INIT`, `ST_READY`, `ST_ERROR`,
  `ST_DISPOSE` and `ST_DISPOSED`. They are specifications only and are not live.
- Unknown channel/version/type/module/instance/source/origin cases are required
  to fail closed with bounded, non-PII audit metadata.
- The lifecycle design tracks timeouts, intervals, listeners, observers,
  subscriptions and explicit cleanup callbacks per module instance.
- Disposal is specified as reverse-order, failure-isolated, reference-releasing
  and idempotent. Repeated dispose must not execute a cleanup twice.
- DSR and QMS are required to prove recurring work is cleared and does not
  duplicate after reopen.
- The proposed handshake is an explicit load/init/ready/dispose state machine;
  business messages before matching READY fail closed and navigation retains a
  bounded forced-close fallback.

**No shared runtime, envelope adapter, listener, timer, observer, manifest or
module code was implemented. Stage A starts MAH-4 but does not implement its
runtime.**

## Verification at save point

- MAH-4 focused source/profile suite: **9/9 passed**.
- Combined modular gate: **30/30 passed**.
- MAH-3 source identity remains exactly 63 files, 7,752,655 bytes and tree
  SHA-256 `be92d6c9202052866d02aa33590160c27a804c638267c6f21717e00e89d78d95`.
- Broader explicit-offline and complete-glob results remain to be recorded
  after their next run.

## Strict Stage-B gate

Do not start runtime wiring until all of these are true:

1. MAH-3 evidence covers all 168 exact cases, is identity-bound, contains no
   defect/deferral treated as a pass, says `refactorGateReady=true`, and is
   confirmed by the owner as the intended baseline.
2. Planning consumes the manifest-bound shared JavaScript runtime without
   changing its business CSS/JS or required synchronous order.
3. Planning passes 4 viewports × 3 languages.
4. DSR passes its access/timer canary and QMS passes its timer/mobile-menu
   canary.
5. Inventory, security/export scanning and packaged-asset parity resolve every
   shared runtime dependency.
6. Focused, modular, explicit offline and complete regression suites pass from
   the exact candidate tree.

Only then may a compatibility-preserving MAH-4 canary wrap the current 15
flows and introduce ready/error/dispose behavior. Eleven-module rollout, CSS
extraction, module splitting, shell slimming and fallback retirement remain
separate later decisions.

## Acceptance status

- MAH-4 Stage A contract draft: **complete**.
- MAH-4 Stage A reproducible inventory/tests: **9/9 green**.
- Exact payload schemas/limits/authorization catalogue: **pending**.
- MAH-4 runtime implemented: **no**.
- MAH-3 rendered review: **0/168**.
- `refactorGateReady`: **false**.
- Planning/DSR/QMS MAH-3 canaries: **not run**.
- Browser/native-language/device/API-23/production acceptance: **false**.

No automated or documentation result in this checkpoint may be relabelled as a
rendered pass, physical-device acceptance, owner UAT or production approval.

## Exact next action

Resume MAH-3, run `npm run review:mah3`, complete and review the identity-bound
168-case export, and proceed through Planning, DSR and QMS only after
`refactorGateReady=true`. Return to MAH-4 Stage B after those canaries are green.
