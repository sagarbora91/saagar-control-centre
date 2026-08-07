# MAH-4 — Message Envelope & Lifecycle Contracts

**Date:** 2026-08-06 (Asia/Kolkata)

**Owner authorization:** “lets start with phase 4”

**Baseline:** `main` at `c04bc98255a78d45b08ac449d88365b22d033f28`, intentionally dirty

**Current stage:** Stage A engineering specification complete; Stage B runtime blocked and not implemented

## 0. Stage-A reconciliation — 2026-08-07

Stage A is now an identity-bound, non-product executable specification:

- `scripts/lib/mah4-protocol-contract.mjs` defines 15 business types and five
  proposed controls: eight shell-to-module and twelve module-to-shell contracts.
- Every envelope requires exact channel/version/type/module/instance/message,
  active source, expected origin, direction, state and exact payload keys.
  Correlated results require the exact INIT/DISPOSE message id.
- Current module participants, the 34 unique feature targets, five configured
  module-transition edges, eight report variants, Payroll batch-slip schema,
  WhatsApp module/template and scope/purpose pairs, resource ceilings and safe
  file/URL rules are executable checks. Protected record/report/export/
  communication sinks require an explicit synchronous authorization result;
  absence, false, exception or Promise fails closed.
- Legacy input cannot supply trusted identity. The composed adapter normalizes
  once, locks one legacy-or-canonical format per type for the life of an
  instance, enters a bounded per-instance dedup cache and returns a detached,
  immutable accepted envelope. Current file-only, text-only and
  file-plus-fallback-text share behavior is preserved.
- Canonical `ST_AUDIT` is metadata-only. Raw legacy `before`/`after` migration
  remains blocked until the owner approves redaction/retention behavior.
- Session tests bind repeated INIT/READY/DISPOSE operations to exact identity
  and correlation, reject stale/repeated navigation, bind `ST_ERROR` phases to
  state, and model READY/DISPOSE timeouts. An injected synthetic scheduler
  proves 5,000 ms READY and 1,500 ms DISPOSE arm/cancel/fire behavior.
- The per-instance lifecycle oracle owns synchronous timer, listener, observer,
  subscription and cleanup registrations; cleanup is reverse-order,
  failure-isolated, reentrancy-safe and repeat-safe. `ST_DISPOSED` proves only
  that tracked module cleanup ran. It does not prove cleanup of unregistered or
  third-party work, garbage collection, native work, or the two persistent
  shell-owned iframe hooks. Forced close is fallback, not cleanup evidence.
- Baseline-profile schema 3 pins both oracle and test hashes to the unchanged
  63-file `www` tree. The 20-test protocol suite is synthetic Stage-A evidence,
  not rendered, device, native-language, API-23 or production acceptance.

The inventory distinguishes direct 74 syntactic / 68 configured wildcard
sends from aggregate 75 syntactic / 69 configured after the dynamic Integration
Bridge site. That shell-realm site fails the active-iframe source guard, leaving
68 accepted configured routes. Lifecycle numbers are qualified static call
sites; they are not live-resource counts.

Stage A is engineering-complete as a specification/test phase. Runtime remains
unloaded (`runtimeLoaded=false`); API-23 timing/entropy, expected-origin,
MAH-3 rendered evidence and every product/device/production gate remain false.
These false gates do not become passes through documentation.

Final Stage-A verification is focused MAH-4 37/37, combined modular 58/58,
explicit offline 256/256 and complete regression glob 347/347. The
authoritative resume point is
`verification/MAH4-MESSAGE-LIFECYCLE-STAGE-A-CHECKPOINT-2026-08-07.md`.

## 1. Phase identity

In the post-C1 modular-hardening sequence, Phase 4 means **MAH-4 — Message
Envelope & Lifecycle Contracts**. This is the next design layer after MAH-3's
shared-runtime canaries. It is not:

- historical migration **M4 — Slim the shell**;
- the older Android master plan's money/insight closure phase;
- C2 ETP verification or C3 formal acceptance and production release; or
- authorization for shared CSS, module splitting, storage, PHP, signing,
  commit or push work.

No earlier controlling document names MAH-4 explicitly. This contract resolves
that ambiguity from the ordered dependency already recorded in the MAH-2 and
MAH-3 checkpoints: shared-runtime canaries first, message/lifecycle contracts
next, shared CSS/design primitives last.

## 2. Findings and discrepancies before implementation

1. MAH-3 is started but incomplete. Its review runner is ready, but rendered
   evidence remains **0/168**, `refactorGateReady=false`, and Planning shared
   runtime wiring has not begun.
2. The active bridge is an unversioned collection of top-level message objects,
   not a declared envelope. There is no protocol name, schema version, module
   instance identity, message identity or reply correlation.
3. Semantic inspection finds **15 active message types**, not every `ST_*`
   token visible to a source scanner:
   - shell to module (6): `ST_ACCESS_CONTEXT`, `ST_LANG`, `ST_OPEN_FEATURE`,
     `ST_SET_DATE`, `ST_UI_MODE`, `ST_WA_SENT`;
   - module to shell (9): `ST_AUDIT`, `ST_BACK_HOME`, `ST_OPEN_MODULE`,
     `ST_PRINT`, `ST_REPORT`, `ST_REPORT_BATCH`, `ST_SHARE`, `ST_WA`,
     `ST_WA_LINK`.
4. `ST_BACK` describes later deep-Back work but is not an active bridge type.
   `ST_READ_ONLY` is a source/reporting marker, not an active posted message.
   Neither may be counted as a live protocol flow without new evidence.
5. Service also contains an orphan non-`ST_*` edit-mode surface: it posts
   `__edit_mode_available` and listens for `__activate_edit_mode` and
   `__deactivate_edit_mode`. The shell has no corresponding live producer or
   consumer, and the Service listeners do not source-check the sender. These
   signals must be rejected, retired or explicitly migrated; they are not part
   of the 15-type supported catalogue.
6. There is no active `READY`, `ERROR` or `DISPOSE` handshake. A successful
   iframe load therefore does not prove that a module completed its boot, and
   close/switch does not provide a protocol-level cleanup acknowledgement.
7. The direct-entry graph contains 74 syntactic and 68 configured
   `postMessage(..., '*')` sites. Explicit dynamic-local inventory adds one
   Integration Bridge site (aggregate 75/69); its shell-realm sender fails the
   active-iframe source guard, so accepted configured behavior remains 68. The main shell router rejects its
   nine active inbound action types unless `event.source` is the current module
   frame, but it does not pin `event.origin`, protocol version, module id or
   per-load instance. Separately, `sqlite-store.js` consumes `ST_AUDIT` without
   a source/origin check, so the main-router guard is not a universal boundary.
   Module-side listeners also have inconsistent source checks.
8. The static source inventory contains lifecycle work with no central owner:
   - raw shell inline: 28 timeouts / 2 intervals / 2 observers / 29 listeners /
     2 resize listeners; active shell inline is 21 / 2 / 0 / 16 / 1;
   - unique direct-loaded assets add 15 / 2 / 2 / 19 / 0, making the active
     shell plus direct-assets bucket 36 / 4 / 2 / 34 / 1;
   - eleven raw module entries total 110 / 3 / 22 / 183 / 11; execution-context
     weighting of direct assets gives 121 / 3 / 33 / 223 / 11;
   - QMS owns 2 recurring intervals and DSR owns 1; and
   - every module entry contains 2 duplicated observer positions from common
     runtime blocks, while directly loaded `app-i18n.js` adds one effective
     observer per module document.
   These are static call sites, not a claim that every resource is live at once.
9. The historical `srcdoc/buildModuleSrc` branch remains in the shell, but it
   is dormant under every valid schema-1 manifest record because `src` is
   required and `html_b64` is absent. It is dead compatibility code, not a
   supported opaque-origin route. Its later retirement remains separately
   gated, and MAH-4 must not design security assumptions around it.
10. Manifest schema 1 binds module entry HTML only. MAH-3 Stage B must first
   establish manifest-bound shared-runtime assets and update inventory,
   security/export scanning and Android package-parity checks.
11. The current `ST_AUDIT` bridge sends raw storage `before` and `after` values.
    Those values can contain customer, staff or financial data. Protocol
    security diagnostics must always be bounded and non-PII; migration of the
    business audit flow requires an explicit product decision to redact, hash
    or drop raw values and cannot be called behavior-preserving by default.
12. Automated source tests cannot substitute for the open rendered, API-23,
    native-language or formal device evidence.

## 3. Authorized scope

### Stage A — contract and test design (authorized now)

Stage A may change documentation and add non-product inventory/contract-test
scaffolding only. It may:

- freeze the 15-type direction and payload catalogue;
- map each exact producer, consumer, field/type schema, size limit,
  authorization boundary and failure behavior;
- specify a versioned envelope and a legacy compatibility adapter;
- specify ready, metadata-only error and dispose handshakes;
- design an idempotent lifecycle registry for timers, observers and listeners;
- define origin/source/instance validation and fail-closed cases;
- define handshake states, deadlines, replay/deduplication behavior and forced
  teardown fallback;
- create synthetic, non-PII fixtures and source tests outside `www`; and
- record exact prerequisites and honest acceptance fields.

**Stage A starts MAH-4 but does not implement, load or wire a runtime.** It must
not change `www`, manifest records, Android assets, module behavior, message
behavior, timers, observers, listeners or screen layout.

### Stage B — runtime canary (strictly gated; not authorized to start yet)

Stage B may begin only after all of the following are evidenced:

1. MAH-3 has all 168 identity-bound rendered cases reviewed with no defect or
   deferral treated as a pass, `refactorGateReady=true`, and owner confirmation
   that the evidence is the intended before-refactor baseline.
2. Planning consumes the manifest-bound shared JavaScript runtime while
   preserving its required synchronous parser positions and business CSS/JS.
3. Planning passes its 4-viewports × 3-languages before/after comparison.
4. DSR is green as the access/timer canary and QMS is green as the
   timer/mobile-menu canary.
5. Inventory, security/export scanning, source-tree identity and Android
   package parity resolve every declared shared runtime asset.
6. Focused, modular, explicit offline and complete regression suites are green
   from the exact candidate tree.

After that gate, Stage B must be implemented as a small canary, not a broad
eleven-module rewrite. The compatibility adapter must preserve the 15 existing
flows while ready/error/dispose and tracked cleanup are proven on Planning,
DSR and QMS before further rollout.

## 4. Proposed protocol v1

The proposed canonical message shape is:

```json
{
  "channel": "saagar.module",
  "version": 1,
  "type": "ST_SET_DATE",
  "moduleId": "planning",
  "instanceId": "shell-issued-per-load-id",
  "messageId": "sender-issued-id",
  "replyTo": null,
  "payload": {}
}
```

Contract rules:

- `channel`, `version`, `type`, `moduleId`, `instanceId` and `messageId` are
  required; `replyTo` is required only for a correlated result.
- Business fields move under `payload`; receivers never merge arbitrary fields
  into global state.
- The shell issues a new unpredictable `instanceId` for every module load.
  Messages from a previous, closed or replaced instance fail closed.
- Receivers allow only the documented direction and payload schema for a type.
- Unknown channel, version, type, module, instance, source or disallowed origin
  is rejected and recorded with bounded metadata only.
- Error/audit metadata must not contain customer, staff, phone, financial-row,
  exported-file or storage-value content.
- `ST_AUDIT` business evidence is a separate data-policy concern. Stage B must
  not copy raw legacy `before`/`after` values into protocol diagnostics, and
  must not migrate them without an approved redaction/retention decision.
- The runtime remains classic, synchronous and offline compatible with API 23.
  It must not add `async`, `defer`, `type="module"`, remote assets or fetch.
- A legacy adapter may dual-read the existing top-level shape during the
  canary only by normalizing one source-validated legacy event into the active
  shell-issued module/instance context. It must assign one internal message id
  and enter one bounded per-instance deduplication cache before dispatch, so a
  legacy/v1 pair cannot execute twice. Legacy input never supplies or
  overrides trusted module/instance identity.
- `targetOrigin='*'` is not the target architecture. Stage B must derive and
  pin the expected local application origin only after external-route,
  Capacitor/API-23 behavior is evidenced. Exact `event.source` and active
  `instanceId` remain mandatory even where the platform requires a wildcard.
- Each payload type requires exact allowed keys and primitive/object types,
  bounded string/byte/item counts and safe rejection before side effects.
  URL-bearing messages accept only explicitly approved schemes; HTML/CSS,
  Blob/text and batch-report messages require conservative resource ceilings.

### Proposed control types

- `ST_INIT` — shell supplies the allowed module id, instance id, protocol
  version and bounded initial context after the frame is ready to receive.
- `ST_READY` — module confirms runtime and required boot hooks are installed;
  it does not claim visual or business-workflow acceptance.
- `ST_ERROR` — module reports a bounded code, phase and recoverability flag;
  production payloads exclude raw stack traces and business data.
- `ST_DISPOSE` — shell requests teardown before close, switch or reload.
- `ST_DISPOSED` — module acknowledges that its tracked cleanup pass ran.

These names remain non-live. Their exact payloads, correlation, state behavior
and failure cases are now locked by the non-product Stage-A oracle/tests.

The proposed state machine is `FRAME_LOADING -> INIT_SENT -> READY ->
DISPOSING -> DISPOSED/FORCED_CLOSED`. The shell sends `ST_INIT` after the iframe
`load` event, then accepts business messages only after one matching,
correlated `ST_READY`. Duplicate INIT/READY is idempotent only when every
identity field matches; mismatches fail closed. `ST_DISPOSE` begins a bounded
wait fixed by the tested contract, duplicate dispose is idempotent, and expiry
forces frame teardown so a broken module cannot trap navigation. The synthetic
Stage-A contract uses deterministic 5,000 ms READY and 1,500 ms
DISPOSE deadlines. The injected-clock tests prove arm/cancel/fire semantics,
not API-23 timing; `api23TimingAccepted=false` remains mandatory.

## 5. Proposed lifecycle contract

Each loaded module receives one registry scoped to its `instanceId`. The
registry must support wrappers for:

- timeouts and intervals;
- DOM/window event listeners;
- `MutationObserver` and other observer disconnectors;
- subscription/unsubscribe callbacks; and
- explicit module cleanup functions.

Disposal requirements:

1. Registration after disposal is rejected or immediately cleaned up.
2. `dispose(reason)` is idempotent: the first call performs cleanup and later
   calls return the same completed state without invoking handlers again.
3. Cleanup runs in reverse registration order, isolates individual failures and
   reports only bounded metadata.
4. Timer handles are cleared, observers disconnected and listeners removed.
5. The registry drops references after cleanup so a closed frame is not kept
   alive by the shared runtime.
6. `ST_DISPOSED` means the tracked registry pass completed; it is not proof that
   unregistered legacy resources do not exist.
7. Shell navigation must retain a bounded fail-safe if acknowledgement is not
   received. A broken module must not trap the user in a closing screen.
8. DSR and QMS require explicit before/after assertions for their 1 and 2
   recurring intervals respectively, plus reopen tests proving no duplicated
   work.
9. The canaries' current raw `setInterval` sites must be deliberately migrated
   to registry-owned calls (or individually wrapped with equivalent retained
   handles). The implementation must not claim cleanup by globally monkey-
   patching timer/event APIs or by tracking only newly created resources.

## 6. Exclusions

MAH-4 does not authorize:

- ETP, PHP, SQLite/storage semantics, schema migration or business-rule work;
- generalized access-context rollout or changed role grants;
- centralized sensitive-action reauthentication;
- deep Android Back behavior beyond cataloguing its future request/result
  contract;
- shared CSS/tokens, breakpoint consolidation or visual redesign;
- module HTML/CSS/JS splitting, shell slimming or fallback retirement;
- remote telemetry or transmission of customer/staff/business data;
- APK build, production signing, commit or push without separate approval; or
- deletion, reset or cleanup of the intentionally dirty working tree.

## 7. Acceptance and evidence language

Stage A exit required an internally consistent protocol catalogue with exact
producers, consumers, schemas, limits and authorization behavior; a tested
envelope/state-machine/lifecycle specification; synthetic contract tests; and
an accurate checkpoint. Names and directions alone do not complete Stage A.
That engineering-only exit is now satisfied by the schema-3 identity-bound
oracle and synthetic suite. It does **not** claim a runtime implementation.

Stage B engineering exit will require, at minimum:

- all 15 legacy message types and their configured current behavior are
  preserved;
- ready/error/dispose schemas and unknown-version/type rejection are tested;
- the current active frame, expected origin and instance id are all enforced;
- disposal is repeat-safe and tracked handles do not duplicate after reopen;
- Planning, DSR and QMS before/after rendered evidence is green;
- focused, modular, explicit offline and complete regression suites pass; and
- manifest/source/package identities match the exact tested candidate.

Source tests and localhost rendered review are engineering evidence only.
Neither upgrades `physicalDeviceAccepted`, `nativeLanguageAccepted`, API-23
same-origin evidence, owner UAT, legal approval, production signing or C3
formal acceptance. Those fields remain false until their own real evidence is
recorded.

## 8. Current decision

Stage A documentation/inventory/executable specification is complete. Keep
Stage B runtime wiring blocked behind the complete MAH-3 Planning/DSR/QMS
chain. Shared CSS remains later work. Do not load the oracle into `www` or
upgrade any device/API-23/origin/production acceptance field without its own
evidence.
