# MAH-4 message and lifecycle inventory — 2026-08-06

> **Reconciled 2026-08-07.** The section below is the authoritative current
> inventory. It supersedes conflicting counts or completion language in the
> retained start-day narrative later in this file.

## 0. Reconciled evidence — authoritative current inventory

- Scanner mode is
  `direct-entry-script-tags-plus-explicit-dynamic-local-loader-inventory`.
  It covers each entry HTML plus 33 unique directly referenced local scripts,
  then separately freezes five dynamic loader groups, ten owner-to-script
  routes, nine unique dynamic scripts and one PDF worker. It is not a general
  JavaScript parser.
- Current vocabulary is 15 active business-message types versus 17 lexical
  `ST_*` tokens. The non-product Stage-A oracle adds five proposed control
  types; none is loaded by `www`.
- The direct-entry graph has 74 syntactic/classified sends and 68 configured
  sends after six constant-empty `ST_OPEN_MODULE` paths are excluded. All are
  wildcard: 74/74 syntactic and 68/68 configured.
- Dynamically loaded `www/integration-bridge.js` adds one configured wildcard
  `ST_OPEN_MODULE`, giving aggregate totals 75 syntactic / 69 configured / 75
  wildcard. The shell-realm self-post fails the active-iframe source guard, so
  aggregate accepted configured behavior remains 68. That rejection is
  source-derived evidence, not rendered acceptance.
- Direct entry-linked message assets are exactly `www/app-i18n.js` and
  `www/sqlite-store.js`. `www/integration-bridge.js` is a separately catalogued
  dynamic message asset. `storage-core.js` was a comment-only false positive.
- Trust is callback-local: the shell router source-guards its nine inbound
  business types but not origin; `sqlite-store.js` receives `ST_AUDIT` without
  source/origin checks; `app-i18n.js` and common module language/UI/date/feature
  receivers are unguarded; only Stock, Service, DSR and Expense source-guard
  `ST_ACCESS_CONTEXT`; Service's `ST_WA_SENT` and edit-mode receivers are
  unguarded. No discovered direct listener checks `event.origin`.

| Qualified static call-site bucket | Timeouts | Intervals | MutationObservers | Event listeners | Resize listeners |
|---|---:|---:|---:|---:|---:|
| Raw shell inline, including dormant generator | 28 | 2 | 2 | 29 | 2 |
| Active shell inline | 21 | 2 | 0 | 16 | 1 |
| Dormant shell inline | 7 | 0 | 2 | 13 | 1 |
| Unique direct-loaded lifecycle assets | 15 | 2 | 2 | 19 | 0 |
| Active shell plus direct-loaded assets | 36 | 4 | 2 | 34 | 1 |
| Raw module entry-inline totals | 110 | 3 | 22 | 183 | 11 |
| Direct-effective module totals, execution-context weighted | 121 | 3 | 33 | 223 | 11 |
| Application-class dynamic assets | 3 | 2 | 0 | 5 | 0 |

These are static call sites, not simultaneous resources or cleanup proof. The
three `#moduleFrame` load hooks split into one per-open one-shot shell hook and
two shell-owned bind-once persistent hooks in Integration Bridge and WhatsApp
Share. Module disposal does not own or clean those persistent shell hooks.

The Stage-A executable specification is
`scripts/lib/mah4-protocol-contract.mjs`, tested by
`tests/mah4-protocol-contract.test.mjs`, and identity-bound in baseline-profile
schema 3. It changes no product byte or current behavior.

## 1. Scope and evidence basis

This is the Stage-A, read-only inventory for **MAH-4 — Message Envelope &
Lifecycle Contracts**. It records the behavior visible in the current source;
it does not authorize or claim a runtime implementation.

- Repository: `V:\Co work\Projects\Retail\saagar-control-centre`
- Branch: `main`
- HEAD at audit start: `c04bc98255a78d45b08ac449d88365b22d033f28`
- Product sources inspected: `www/index.html`, all 11 manifest module entry
  files, `www/app-i18n.js`, `www/integration-bridge.js` and
  `www/module-manifest.js`.
- Automated inventory source: `scripts/audit-modular-architecture.mjs`.
- The working tree was intentionally dirty before this inventory. No existing
  file or product byte was changed for this document.

Counts below are lexical source positions. They are not a claim that every
timer, observer or message producer is simultaneously live.

## 2. Semantic protocol catalogue: 15 active types

The current bridge uses unversioned, top-level objects. There is no common
`channel`, protocol version, module id, per-load instance id, message id,
correlation id or nested payload envelope.

### Shell -> module: 6

| Type | Current producer -> consumer | Current top-level fields after `type` | Receiver validation |
|---|---|---|---|
| `ST_ACCESS_CONTEXT` | Shell access-change notifier -> duplicated access bridge in Stock, Service, DSR and Expense | none; the receiver re-reads direct parent state | The four access bridges require `event.source === window.parent`; no origin, version, module or instance check |
| `ST_LANG` | Shell language application -> `app-i18n.js`, transitively loaded by every module | `lang` | The shared language listener checks only type and the `en`/`mr`/`hi` value; it does not check source or origin |
| `ST_OPEN_FEATURE` | Shell deep-link routing -> duplicated mobile boot receiver in every module | `target` | No source or origin check |
| `ST_SET_DATE` | Shell date rail -> duplicated mobile boot receiver in every module | `date` | No source or origin check |
| `ST_UI_MODE` | Shell mode broadcaster -> duplicated mobile boot receiver in every module | `mode` | No source or origin check |
| `ST_WA_SENT` | Shell WhatsApp composer -> Service follow-up logger | `recordId`, `text` | Service checks only the type; it does not check source or origin |

All six current shell sends use `postMessage(..., '*')`.

### Module -> shell: 9

| Type | Current producer -> shell consumer | Current top-level fields after `type` |
|---|---|---|
| `ST_AUDIT` | Common audit bridge in all 11 modules -> main `auditLog()` handler and the separate `sqlite-store.js` mirror listener | `action`, `detail`, `before`, `after` |
| `ST_BACK_HOME` | Common module Home control in all 11 modules -> `showMainView()` | none |
| `ST_OPEN_MODULE` | Non-empty next-step controls in QMS, DSR, Grooming, Service and Expense -> `navigateToModule()` | `id`; shell also accepts optional `date` |
| `ST_PRINT` | CRO Audit, Expense, Leave, Payroll, QMS, Service, Stock and Tax -> `stPrintBridge()` | `title`, `css`, `html`, `orientation`, `fileBase` |
| `ST_REPORT` | Payroll and QMS -> `SaagarReport.preview()` or `generate()` | `reportType`, `opts` |
| `ST_REPORT_BATCH` | Payroll -> `SaagarReport.batchSlips()` | `mode`, `slips`, `fileBase` |
| `ST_SHARE` | DSR, Expense, Grooming, Leave, Payroll, QMS, Service, Stock and Tax -> `stShareBridge()` | `file` or `text`, `fileName`, `title`, `exportId`, `scopeId`, `scopeLabel`, `rowCount`, `purposeId` |
| `ST_WA` | Service and Tax -> shell WhatsApp composer | `module`, `recordId`, `templateId` |
| `ST_WA_LINK` | CRO Audit, DSR, Payroll and QMS -> controlled WhatsApp opener | `url`, `scopeId`, `purposeId` |

All nine current module sends use wildcard target origin. The main shell router
groups these nine exact action types and rejects them unless `event.source`
equals the current `#moduleFrame.contentWindow`. That is a useful source
boundary, but it is not a complete protocol boundary:

The reproducible MAH-4 scanner records **74 active literal `postMessage` call
sites**, all 74 using wildcard target origin. It excludes the dormant shell
generator block from that active count.

- the shell does not pin `event.origin`;
- it does not validate a protocol version, sending module id or per-load
  instance id;
- the same iframe element is navigated between module documents, so the check
  identifies the frame, not a particular module load; and
- payload validation is type-specific and permissive rather than an exact,
  shared schema check.

In addition, `sqlite-store.js` independently listens for `ST_AUDIT` and does
not source- or origin-check that event before mirroring storage changes. A
future contract must validate both consumers or centralize dispatch; hardening
only the visible main router would leave a second unguarded side effect.

`ST_AUDIT` currently transports the raw `before` and `after` values in
addition to bounded length metadata. A future metadata-only error/audit
contract must not silently preserve that data exposure under a new envelope.

## 3. Why lexical inspection reports 17, not 15

A whole-source `ST_[A-Z0-9_]+` scan finds 17 distinct tokens. The semantic
catalogue above contains the 15 types that are actively posted and consumed.
The two additional lexical tokens are not live message flows:

| Token | Current meaning | Protocol status |
|---|---|---|
| `ST_BACK` | Appears in a shell comment describing a possible future deep-Back acknowledgement | Not sent and not received |
| `ST_READ_ONLY` | Payroll-local Boolean state used to freeze past-date writes | Not a message |

Therefore, “17 `ST_*` tokens” is a lexical inventory result; “15 active
message types” is the current protocol result. Tests and plans must retain
that distinction.

## 4. Direct-linked `app-i18n.js` dependency gap

Every one of the 11 module HTML files directly loads `../../app-i18n.js`. The current
file is 93,658 bytes with SHA-256
`0718b9c4025111d330a9cd42f08f68834da7d4d5a87d802351f51ed720c146f0`.
Its `ST_LANG` receiver is therefore part of every module's effective message
surface even though the listener is not textually present in each module
entry file.

Manifest schema 1 binds only each module's entry HTML through `bytes` and
`sha256`. It does not declare or hash shared dependencies such as
`../../app-i18n.js`. The generic architecture inventory discovers the link,
and the MAH-3 whole-`www` source-tree fingerprint can detect aggregate drift,
but neither is a manifest-level dependency binding. Consequently:

- an entry-only message scan under-reports `ST_LANG` receivers;
- an entry hash alone cannot establish the exact language runtime consumed by
  that module; and
- any future shared message runtime would have the same gap until shared
  assets become manifest-bound and are resolved by inventory,
  security/export and Android package-parity checks.

This is a prerequisite gap, not authorization to introduce manifest schema 2
during MAH-4 Stage A.

## 5. Direct parent API coupling outside `postMessage`

The message catalogue is not the complete shell/module contract. All 11
modules retain direct same-origin parent coupling through the common storage
shim (`SaagarStore`) and pending deep-link state (`__stTargetPending`), plus
module-specific APIs:

| Module(s) | Direct parent APIs visible in current source |
|---|---|
| Stock | `SaagarAdminPinCheck`, `SaagarOwnerSession`, `SaagarReauth` |
| Service | `SaagarEvidence`, `SaagarLegal`, `SaagarOwnerSession`, `SaagarReauth`, `SaagarReport`, `SaagarServicePersistence`, `SaagarServiceWorkboardPolicy`, parent `localStorage` |
| QMS | `SaagarLegal`, `SaagarQmsPersistence`, `SaagarQmsPolicy`, `WA_CFG`, `qmsArchiveLookup`, parent `localStorage` |
| DSR | `SaagarAdminPinCheck`, `SaagarDsrCompletionPolicy`, `SaagarOwnerSession`, `SaagarReauth` |
| Expense | `SaagarOwnerSession`, `SaagarReauth`, `SaagarShare`, `shareText` |
| Payroll | `SaagarReauth`, `JSZip` |
| Tax | `SaagarEvidence`, `ensureJSZip`, `JSZip` |
| CRO Audit | `WA_CFG` |
| Grooming, Leave, Planning | no additional specialized API beyond the common parent dependencies |

This list intentionally excludes `postMessage` itself. A future envelope does
not make modules independent of the shell while these direct APIs remain.
Changing or removing them is separate, behavior-sensitive work.

## 6. Non-`ST_*` Service orphan

Service contains a legacy “Tweaks host protocol” outside the `ST_*` catalogue:

- it listens for `__activate_edit_mode` and `__deactivate_edit_mode` without a
  source or origin check; and
- it posts `{ type: '__edit_mode_available' }` to `window.parent` with target
  origin `'*'` during boot.

No other current `www` HTML or JavaScript file contains
`__edit_mode_available`, so there is no in-repository consumer for that
announcement. Likewise, no current `www` sender for the two activation types
was found. These tokens must be catalogued as an orphan legacy host protocol,
not added to either the 15 active `ST_*` flows or the 17-token lexical count.
Removal or compatibility handling requires a deliberate product decision and
rendered evidence; the inventory alone does not authorize deletion.

## 7. Historical start-day lifecycle subset

The qualified table in section 0 is authoritative. This smaller entry-inline
subset is retained to explain the start-day investigation:

| Scope | `setTimeout` positions | `setInterval` positions | `MutationObserver` positions | resize-listener positions |
|---|---:|---:|---:|---:|
| Shell | 28 | 2 | 2 | 2 |
| All 11 module entry files | 110 | 3 | 22 | not frozen by the current module inventory |
| QMS subset | 8 | 2 | 2 | — |
| DSR subset | 11 | 1 | 2 | — |

Every module contains two duplicated common-runtime observer positions. There
is no central registry that owns timers, observers, listeners, subscriptions
and explicit cleanup callbacks per module instance.

### QMS recurring work

QMS creates two unconditional recurring intervals at module evaluation:

1. `tick` every 1,000 ms updates the displayed clock.
2. A 45,000 ms callback conditionally calls `renderAll()` when the document is
   visible, the active view is Live Queue or Dashboard, no modal is open and
   no form control has focus.

Neither interval handle is retained and QMS contains no corresponding
`clearInterval`. The callbacks cease only when the browser destroys the old
iframe document; the module cannot acknowledge that cleanup and a reopen test
cannot inspect a tracked registry today.

### DSR recurring work

DSR's 20,000 ms bridge-rehydrate interval is more locally controlled:

- `_rehydrateTimer` prevents duplicate starts;
- `startBridgeRehydrate()` runs on entry to the staff panel; and
- `stopBridgeRehydrate()` clears the handle on the module's `logout()` path.

That stop path is not called by the shell when the iframe is closed or switched.
DSR also has a one-second recursive `setTimeout` clock chain. It stops
rescheduling after `st.screen` leaves `staff`, but has no retained timeout
handle for shell-directed disposal. Its `pagehide` and hidden
`visibilitychange` hooks flush pending record writes; they do not implement a
general timer/listener/observer teardown contract.

### Shell mount and unmount behavior

- The shell owns one persistent `#moduleFrame` element.
- `openModule()` waits 50 ms, then navigates that same iframe to the manifest
  `src`. The historical `srcdoc = buildModuleSrc(mod)` branch remains in
  source, but it is dormant for every valid schema-1 manifest record because
  `src` is required and `html_b64` is absent.
- A one-shot iframe `load` listener hides the loader and sends current date,
  language and access state. A DOM `load` event is the only positive boot
  signal; there is no module `READY` acknowledgement.
- Switching modules replaces the iframe URL/document. Closing to Home removes
  `src` and assigns an empty `srcdoc`.
- Neither path sends a disposal request, waits for cleanup, receives a disposal
  acknowledgement or associates cleanup with a per-load instance id.
- Current correctness therefore relies on browser document teardown. There is
  no protocol evidence that registered work was released before navigation,
  and no bounded acknowledgement/fail-safe distinction because no handshake
  exists.

## 8. Safe work now versus blocked runtime work

### Safe during MAH-4 Stage A

- Maintain this source-derived type, payload, producer and consumer catalogue.
- Specify exact schemas for the proposed versioned envelope and
  `ST_INIT`/`ST_READY`/`ST_ERROR`/`ST_DISPOSE`/`ST_DISPOSED` control messages.
- Design fail-closed source, origin, module and instance validation rules.
- Design an idempotent lifecycle registry and reverse-order cleanup behavior.
- Add synthetic, non-PII contract fixtures and tests outside `www`.
- Add source assertions that distinguish the 15 active flows, 17 lexical
  tokens, transitive receivers, direct parent APIs and orphan protocols.
- Define reopen assertions for DSR's one interval and QMS's two intervals.

### Blocked until the MAH-3 gate is genuinely satisfied

- Editing or loading a shared runtime in `www`.
- Changing wildcard target origins or live receiver validation.
- Wrapping, relocating or removing current timers, observers or listeners.
- Adding the versioned envelope, legacy adapter, ready/error/dispose handshake
  or lifecycle registry to a live module.
- Changing the manifest schema or shared-asset loading path.
- Planning, DSR or QMS MAH-4 runtime canaries, and any eleven-module rollout.
- Shared CSS extraction, module splitting, shell slimming or fallback removal.

The blocking prerequisite remains the complete MAH-3 chain: identity-bound
168-case rendered baseline with `refactorGateReady=true`, Planning shared
runtime and 12-case comparison, DSR access/timer canary, QMS
timer/mobile-menu canary, shared-asset inventory/security/package parity, and
green focused, modular, offline and complete regressions from the exact tree.

## 9. Acceptance status

- Reconciled source/profile inventory: **complete for the direct plus explicitly
  catalogued dynamic-local Stage-A scope**.
- Stage-A executable specification: **engineering-complete; product runtime is
  not implemented or loaded**.
- Verification: **focused MAH-4 37/37, combined modular 58/58, explicit offline
  256/256 and complete regression glob 347/347 passed**.
- Runtime envelope implemented: **no**.
- Product-runtime lifecycle registry implemented or loaded: **no**.
- MAH-3 rendered baseline: **0/168** at this checkpoint.
- Browser, API-23, native-language, physical-device and production acceptance:
  **not established by this source inventory**.
