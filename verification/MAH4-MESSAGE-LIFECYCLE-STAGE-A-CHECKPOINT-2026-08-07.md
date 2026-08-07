# MAH-4 message lifecycle Stage-A checkpoint — 2026-08-07

**Status:** Stage A is engineering-complete as a non-product executable
specification and frozen source inventory. Stage B product/runtime wiring is
blocked.

**Supersedes:**
`verification/MAH4-MESSAGE-LIFECYCLE-START-CHECKPOINT-2026-08-06.md` and
`verification/MAH4-MESSAGE-LIFECYCLE-CRASH-CHECKPOINT-2026-08-06.md` as the
active MAH-4 resume point.

## 1. Repository identity and preservation

- Repository: `V:\Co work\Projects\Retail\saagar-control-centre`
- Branch: `main`
- HEAD: `c04bc98255a78d45b08ac449d88365b22d033f28`
- `HEAD...origin/main`: `0/0`
- The intentionally dirty working tree was preserved. No reset, checkout,
  deletion, commit or push was performed.
- No MAH-4 change was made under `www/**`, Android project output or native
  runtime code. The current `www` tree still exactly matches the MAH-3 frozen
  identity below; its existing dirty files predate MAH-4.
- `package-lock.json` is absent from both HEAD and the worktree. MAH-4 did not
  create, modify or delete it; that baseline absence was preserved.
- No APK was assembled or signed. PHP, ETP, storage and unrelated business-rule
  runtime work remained outside scope.

## 2. Frozen source identity

The authoritative profile is
`verification/MAH4-MESSAGE-LIFECYCLE-BASELINE-PROFILE.json`:

| Item | Frozen value |
|---|---|
| Profile schema | `3` |
| Profile ID | `mah4-message-lifecycle-stage-a-2026-08-07` |
| `www` files | `63` |
| `www` bytes | `7,752,655` |
| `www` tree SHA-256 | `be92d6c9202052866d02aa33590160c27a804c638267c6f21717e00e89d78d95` |
| Shell bytes | `715,491` |
| Shell SHA-256 | `a79ab0cc1c42e732c151bd5a719d3b728fec68a6c20442b3bc718a3434c5e219` |
| Oracle bytes | `57,871` |
| Oracle SHA-256 | `c9d52eb4dda1fad4f726c74e8d54c39f434d1a4ec074d896787e4539b12aeb58` |
| Protocol-test bytes | `36,704` |
| Protocol-test SHA-256 | `51671394b65dd6a636508235b41239c115632576e7d7c2f90463eb6337690684` |

The profile binds both
`scripts/lib/mah4-protocol-contract.mjs` and
`tests/mah4-protocol-contract.test.mjs`; source or test drift invalidates the
frozen baseline.

## 3. Reconciled inventory

- Current runtime source has **15 active business-message types** and **17
  lexical `ST_*` tokens**. `ST_BACK` is comment-only and `ST_READ_ONLY` is a
  Payroll-local Boolean, not a message.
- The Stage-A oracle adds five proposed control types: `ST_INIT`, `ST_READY`,
  `ST_ERROR`, `ST_DISPOSE` and `ST_DISPOSED`. None is loaded by `www`.
- Direct-entry sends are **74 syntactic/classified** and **68 configured**; all
  use wildcard target origin.
- Explicit dynamic-local discovery adds Integration Bridge's one configured
  `ST_OPEN_MODULE` send, producing aggregate totals of **75 syntactic / 69
  configured**.
- That extra shell-realm route fails the active-iframe source guard. Accepted
  configured behavior therefore remains **68**, not 69.
- Direct-entry discovery covers 33 unique linked JavaScript assets. Direct
  message assets are `www/app-i18n.js` and `www/sqlite-store.js`; the dynamic
  message asset is `www/integration-bridge.js`.
- Dynamic inventory freezes five loader groups, ten owner-to-script routes,
  nine unique script assets, twelve literal references, five
  `createElement('script')` sinks, two `document.write` fallbacks, one worker,
  ten resources and 3,070,778 resource bytes. It has no direct-script overlap
  and does not claim to be a general JavaScript parser.
- There is no direct origin check in the current shell message boundary. The
  frozen profile records callback-local source guards and the remaining
  unsourced shared receivers without upgrading them into trust acceptance.
- Three `#moduleFrame` load hooks exist: one per-open one-shot shell hook and
  two shell-owned persistent bind-once hooks. Module disposal does not own the
  Integration Bridge or WhatsApp Share persistent hooks.

Lifecycle figures are qualified **static call sites**, not concurrent runtime
resources and not proof that cleanup currently happens:

| Source bucket | Timeouts | Intervals | Observers | Listeners | Resize listeners |
|---|---:|---:|---:|---:|---:|
| Raw shell inline | 28 | 2 | 2 | 29 | 2 |
| Active shell inline | 21 | 2 | 0 | 16 | 1 |
| Dormant shell inline | 7 | 0 | 2 | 13 | 1 |
| Unique direct assets | 15 | 2 | 2 | 19 | 0 |
| Active shell plus direct assets | 36 | 4 | 2 | 34 | 1 |
| Raw inline modules | 110 | 3 | 22 | 183 | 11 |
| Direct-effective modules | 121 | 3 | 33 | 223 | 11 |
| Application dynamic scripts | 3 | 2 | 0 | 5 | 0 |

## 4. Stage-A executable specification

`scripts/lib/mah4-protocol-contract.mjs` is a non-product executable
specification. It freezes 20 exact message contracts: 15 current business
types plus five controls, with eight shell-to-module and twelve
module-to-shell directions.

It now specifies and tests:

- exact envelopes, participant maps, module/instance identity, direction,
  source, origin, readiness and state checks;
- exact payload schemas, unknown-field rejection, sparse-array rejection,
  resource ceilings, safe filenames and strict `wa.me` URLs;
- all eight `ST_REPORT` variants and the exact Payroll `ST_REPORT_BATCH` slip;
- compatible `ST_SHARE` file-only, text-only and file-plus-fallback-text forms;
- mandatory synchronous external authorization for manifest, record and
  protected-sink decisions, using a detached immutable accepted envelope;
- metadata-only canonical `ST_AUDIT`; raw legacy `before`/`after` migration
  remains blocked until redaction and retention are decided;
- legacy identity binding, normalize-once acceptance, per-type format locking,
  dispatch-after-deduplication and bounded per-instance windows;
- exact INIT/READY and DISPOSE/DISPOSED correlation, capability echo,
  idempotence, stale-navigation rejection and a state-bound `ST_ERROR` policy;
- injected-scheduler synthetic deadlines of 5,000 ms for READY and 1,500 ms
  for DISPOSE, including arm, cancel and fire behavior;
- CSPRNG-formatted navigation instance IDs while keeping API-23 entropy
  acceptance false; and
- instance-owned synchronous timer/listener/observer/subscription cleanup in
  reverse order with failure isolation, reentrancy safety, repeat safety,
  immutable results and captured cleanup methods.

`ST_DISPOSED` in this oracle proves only that registered synchronous module
cleanup ran. It does not prove cleanup of unregistered or third-party work,
native work, garbage collection, forced-close work or the two persistent
shell-owned hooks.

The oracle's status is
`stage-a-engineering-complete-runtime-blocked` with
`stageAComplete=true`. This is a specification status, not a product-runtime or
acceptance claim.

## 5. Verification evidence

All results below were observed from the frozen dirty tree on 2026-08-07:

| Gate | Result |
|---|---:|
| Protocol oracle alone | **20/20 passed** |
| Focused `npm run test:mah4` | **37/37 passed** |
| Combined `npm run test:modular` | **58/58 passed** |
| Explicit offline suite | **256/256 passed** |
| Complete `tests/*.test.mjs` glob | **347/347 passed** |

The offline command's C1, mobile, Settings, language and modular pre-gates also
passed. Syntax checks for the protocol and inventory source passed. The MAH-4
profile test revalidated the exact 63-file product tree and bound oracle/test
identities. `git diff --check` passed with line-ending warnings only, and the
staging area remained empty.

These are source and synthetic engineering results. They are not rendered,
physical-device, native-language, API-23 or production evidence.

## 6. Gates deliberately left false

| Gate | Current state |
|---|---|
| Oracle loaded by `www` | `runtimeLoaded=false` |
| MAH-4 product runtime | `mah4RuntimeImplemented=false` |
| MAH-3 rendered review | `0/168`; `refactorGateReady=false` |
| Planning shared-runtime canary | not wired or accepted |
| DSR access/timer canary | not run |
| QMS timer/mobile-menu canary | not run |
| API-23 deadline acceptance | `api23TimingAccepted=false` |
| API-23 instance entropy acceptance | `api23InstanceEntropyAccepted=false` |
| Expected-origin decision | `expectedOriginAccepted=false` |
| Parser limitations accepted for Stage B | `false` |
| Raw `ST_AUDIT` legacy migration | blocked |
| Browser/rendered acceptance | not established |
| Physical-device/UAT acceptance | not established |
| Native Marathi/Hindi acceptance | not established |
| Production signing/release acceptance | not established |

No device-only test is marked passed. No owner smoke report is converted into
formal evidence.

## 7. Exact next action

Resume **MAH-3 rendered review**, not MAH-4 runtime coding:

1. complete the identity-bound 168-case rendered review and obtain
   `refactorGateReady=true`;
2. wire and review the Planning shared-runtime candidate and its 12 comparison
   cases;
3. run the DSR access/timer and QMS timer/mobile-menu canaries, including shared
   asset inventory, security and package-parity gates; and
4. rerun focused, modular, offline and complete regressions on that exact
   candidate tree.

Only then may MAH-4 Stage B propose loading the versioned envelope, legacy
adapter or lifecycle registry into product runtime. Do not load the Stage-A
oracle into `www`, change manifest schema, begin an eleven-module rollout, start
shared CSS/splitting/shell slimming, or infer authority for ETP/PHP work.
