# MAH-4 post-Stage-A crash checkpoint — 2026-08-07

**Captured:** 2026-08-07 14:07:56 +05:30 (Asia/Kolkata)

**Purpose:** crash-safe resume pointer after MAH-4 Stage A completion

**Evidence authority:**
`verification/MAH4-MESSAGE-LIFECYCLE-STAGE-A-CHECKPOINT-2026-08-07.md`

## 1. Exact repository state

- Repository: `V:\Co work\Projects\Retail\saagar-control-centre`
- Branch: `main`
- HEAD: `c04bc98255a78d45b08ac449d88365b22d033f28`
- `HEAD...origin/main`: `0/0`
- Staging area: empty
- Working tree: intentionally dirty; preserve every existing user-owned and
  earlier-phase change.
- `package-lock.json`: absent from both HEAD and the worktree. Do not create,
  delete or replace it while resuming this checkpoint without a deliberate
  dependency decision.
- No reset, checkout, deletion, commit, push, APK build or product-runtime edit
  was performed during the MAH-4 completion work.

The current tracked `www/index.html` and `www/modules/stock/index.html` changes,
and all current untracked `www` assets, predate MAH-4. Do not overwrite or
remove them. MAH-4 changed no `www/**` byte.

## 2. Completed state

MAH-4 **Stage A is engineering-complete** as an identity-bound, non-product
source inventory and executable specification:

- profile schema `3`, ID
  `mah4-message-lifecycle-stage-a-2026-08-07`;
- frozen `www` identity: 63 files, 7,752,655 bytes, tree SHA-256
  `be92d6c9202052866d02aa33590160c27a804c638267c6f21717e00e89d78d95`;
- 15 active business-message types versus 17 lexical `ST_*` tokens;
- five proposed control types, none loaded by product runtime;
- direct sends `74 syntactic / 68 configured`;
- dynamic-aware aggregate `75/69`, with accepted configured behavior remaining
  `68` because Integration Bridge's extra route fails the active-frame source
  guard; and
- exact 20-contract envelope, payload, authorization, correlation, state,
  deadline, deduplication, compatibility and tracked-cleanup oracle behavior.

Raw legacy `ST_AUDIT` migration remains blocked. The canonical form remains
metadata-only.

## 3. Last verified evidence

Observed from this exact dirty tree on 2026-08-07:

| Gate | Result |
|---|---:|
| Protocol oracle | **20/20 passed** |
| Focused MAH-4 | **37/37 passed** |
| Combined modular | **58/58 passed** |
| Explicit offline | **256/256 passed** |
| Complete test glob | **347/347 passed** |

The final focused MAH-4 rerun passed 37/37 after the checkpoint and handoff
updates. `git diff --check` passed with line-ending warnings only. The staging
area remained empty, and the MAH-4 profile revalidated the exact product-tree,
oracle and protocol-test identities.

## 4. Gates that remain false

- MAH-4 oracle loaded by `www`: `false`
- MAH-4 product runtime implemented: `false`
- MAH-3 rendered review: `0/168`
- `refactorGateReady`: `false`
- Planning shared-runtime canary: not wired or accepted
- DSR and QMS canaries: not run
- API-23 deadline acceptance: `false`
- API-23 instance-entropy acceptance: `false`
- Expected-origin acceptance: `false`
- Parser limitations accepted for Stage B: `false`
- Browser, physical-device, UAT, native-language, signing and production
  acceptance: not established

Do not convert source tests, synthetic deadlines or owner-reported smoke into
formal device acceptance.

## 5. Exact resume order

1. Read this file, the Stage-A evidence checkpoint, and
   `docs/audit/HANDOFF.md`.
2. Recheck branch, HEAD, status and staging before editing. Preserve the dirty
   tree and all user-owned files.
3. Do not redo MAH-4 Stage A or regenerate its profile unless an intentional
   source/oracle/test change invalidates the bound identity.
4. Resume **MAH-3 rendered review** with `npm run review:mah3`; the immediate
   target is the identity-bound 168-case review, not MAH-4 runtime wiring.
5. After the rendered gate, complete Planning's 12 comparison cases, then the
   DSR access/timer and QMS timer/mobile-menu canaries with shared-asset,
   security and package-parity verification.
6. Rerun focused, modular, offline and complete regressions on that exact
   candidate tree.
7. Begin MAH-4 Stage B only after every preceding gate is genuinely satisfied.

Do not load the Stage-A oracle into `www`, change manifest schema, begin shared
CSS extraction, module splitting, shell slimming, ETP or PHP work from this
checkpoint.

## 6. Canonical MAH-4 files

- `scripts/audit-mah4-message-lifecycle.mjs`
- `scripts/lib/mah4-contract-source.mjs`
- `scripts/lib/mah4-protocol-contract.mjs`
- `tests/mah4-contract-source.test.mjs`
- `tests/mah4-message-lifecycle-baseline.test.mjs`
- `tests/mah4-protocol-contract.test.mjs`
- `verification/MAH4-MESSAGE-LIFECYCLE-BASELINE-PROFILE.json`
- `verification/MAH4-MESSAGE-LIFECYCLE-INVENTORY-2026-08-06.md`
- `verification/MAH4-MESSAGE-LIFECYCLE-STAGE-A-CHECKPOINT-2026-08-07.md`
- `docs/audit/MAH4-MESSAGE-LIFECYCLE-CHANGE-CONTRACT-2026-08-06.md`
- `docs/audit/HANDOFF.md`
