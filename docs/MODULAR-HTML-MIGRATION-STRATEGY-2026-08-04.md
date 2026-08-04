# Modular HTML Migration — Strategy and Execution Plan

**Date:** 2026-08-04 (Asia/Kolkata)
**Baseline:** `main` = `origin/main` = `bb03238`; suite 260/260
**Status:** DRAFT FOR OWNER APPROVAL — no migration work authorised yet
**Owner-set sequence:** finish remaining waves → push → test and fix → **migrate** → **ETP** → **PHP**

---

## 1. What we have today (measured, not assumed)

`www/index.html` is a single file of **3,087,060 characters**.

| Part | Size | Share |
|---|---|---|
| `MODULES` array (base64 payloads) | 2,403,322 chars | **77.9%** |
| Shell (chrome, storage wiring, reports, settings) | 683,738 chars | 22.1% |
| Decoded module HTML behind that base64 | 1,798,468 bytes | — |

Eleven modules live **inside** that file as base64 strings:

| Module | Bytes | | Module | Bytes |
|---|---|---|---|---|
| payroll | 261,714 | | expense | 157,721 |
| service | 230,809 | | cro_audit | 134,348 |
| tax | 224,415 | | grooming | 82,019 |
| stock | 186,846 | | planning | 12,448 |
| dsr | 181,149 | | | |
| qms | 166,462 | | | |
| leave | 160,537 | | | |

### How a module runs today

1. `openModule(id)` looks up the record in `MODULES`.
2. `buildModuleSrc(mod)` base64-decodes the payload, then applies **ten chained string injections** at runtime — `injectLegacyManagerPasswordGuard`, `injectBackHome`, `injectModuleHideCSS`, `injectEmployeeAssist`, `injectModuleAuditBridge`, `injectModuleAccessBridge`, `injectUniformCSS`, `injectMobileMode`, `injectSafetyNet`, `injectIframeShim`.
3. The result is assigned to `iframe.srcdoc`.
4. The module talks to the shell over **17** `ST_*` `postMessage` types plus direct `window.parent.<Global>` access (`SaagarReauth`, `SaagarDsrCompletionPolicy`, `SaagarServiceWorkboardPolicy`, …).

Changing a module means **string-patching base64-embedded HTML** from a build script (`scripts/apply-d2-qms.mjs`, `apply-d3-service.mjs`, `apply-d4-dsr.mjs`), which decodes, patches, re-encodes and regenerates `bytes` + `sha256`.

---

## 2. Why this is fragile — the evidence

This is not theoretical. Every item below was hit and fixed in this repository.

| Failure | Evidence |
|---|---|
| String anchors silently match the wrong place | The D4 carried-value anchor matched the **closing**-stock grid as well as opening; only a uniqueness guard caught it |
| Guards that defeat themselves | Twice in D4 an idempotency guard tested for a token that its own injected code contained |
| Injected code carries the *patcher file's* line endings | `apply-d2-qms` and `apply-d3-service` produced different bundles on Windows vs Linux checkouts |
| Silent byte loss invisible to git | All three patchers dropped one byte per run from the `MODULES` line; git normalises `index.html` LF-on-commit / CRLF-on-checkout, so `git status` stayed clean while the file really changed |
| Injected-set drift | The D4 helper list and its verification list diverged; the patcher refused to run |
| Shared code duplicated with no source of truth | The design palette appears in 10 of 11 modules; `toast()` in 7; `esc()` in 5 |
| Whole-app parse cost at boot | 3 MB parsed before first paint; the app has crashed on device three times in ~three days during storage work |

**The pattern:** the architecture forces every change through fragile textual surgery, and the packaging format hides the damage from the tools that would normally catch it.

D5–D12 are eight more waves through that same machinery.

---

## 3. Target architecture

```
www/
  index.html                    shell only — target < 150 KB
  shell/
    shell.css  shell.js
  shared/
    tokens.css                  the design palette — ONE copy
    base.css
    helpers.js                  esc, fmtAmt, toast, date utils — ONE copy
    module-bridge.js            the ST_* protocol, both sides
  modules/
    stock/    index.html  module.js  module.css
    service/  …
    …11 modules
  policy/                       existing www/*-policy.js
  vendor/                       sql-wasm, jspdf, jszip, pdf.js …
```

Modules load with `iframe.src = 'modules/<id>/index.html'` — real files, real URLs, individually openable, individually testable, individually diffable.

### The origin question — the single riskiest assumption

`srcdoc` iframes inherit the parent origin, which is why `window.parent.SaagarReauth` works today. `src` iframes take the origin of their URL.

`capacitor.config.json` sets `androidScheme: "https"`, `hostname: "localhost"`, so the app runs at `https://localhost` and a **relative** `src` resolves to the same origin. `window.parent.*` should keep working unchanged.

**"Should" is not good enough.** M1 below exists to prove this on a real device before anything else moves. If it fails, the whole `window.parent` contract must convert to `postMessage`, which is a materially larger job — and we would know that on day one instead of at the end.

---

## 4. The safety mechanism — an equivalence oracle

The reason this migration can be made fool-proof is that **the correct output already exists in the running system**.

For any module, `buildModuleSrc(mod)` returns the exact HTML that runs today, injections and all. That string *is* the file we need to write.

So migration is a **mechanical extraction**, not a rewrite:

```
file written to www/modules/<id>/index.html  ===  buildModuleSrc(mod) output
```

That gives a machine-checkable oracle for every step:

- **M1** — files are byte-identical to `buildModuleSrc()` output. Assertable.
- **M2/M3** — after de-duplication and splitting, the *rendered* DOM and the module's public function set must match the M1 snapshot. Assertable in `vm`/jsdom against golden snapshots captured at M0.

No step in this plan asks anyone to eyeball a 3 MB file and judge whether it still works.

---

## 5. Migration phases

Each phase is independently shippable, independently device-testable, and independently revertible.

### M0 — Harness and golden snapshots *(no product change)*

- Capture `buildModuleSrc()` output for all 11 modules as golden fixtures (kept out of git — they contain the full payloads; store hashes in git).
- Boot each module in a DOM harness; snapshot the rendered structure, the global function set, and every `ST_*` message it emits during a scripted interaction.
- Land the snapshot comparator as a test.

**Exit:** the oracle exists and passes against today's build. **Nothing in `www/` has changed.**

### M1 — Extract to real files, zero content change *(highest risk, deliberately isolated)*

- Write each module's `buildModuleSrc()` output verbatim to `www/modules/<id>/index.html`.
- Shell switches `srcdoc = buildModuleSrc(mod)` → `src = 'modules/' + id + '/index.html'`.
- `MODULES` keeps its metadata (id, title, icon, category) and **drops `html_b64`**.
- The ten inject functions are deleted from the runtime path — their output is now baked into the files.

**Exit:** every module opens on a real device; `window.parent.*` still resolves; all 11 golden snapshots match; `index.html` drops from 3.09 MB to ~684 KB.

**This is the device gate.** If the origin model breaks, it breaks here, in one revertible commit, before any restructuring depends on it.

### M2 — De-duplicate shared assets *(one module per commit)*

- Extract the palette and base CSS to `shared/tokens.css` / `shared/base.css`; each module `<link>`s them.
- Extract genuinely-common helpers to `shared/helpers.js`. **Only where the implementations are identical** — where they differ, the difference is either a bug to fix explicitly or a genuine variation to keep local. No silent unification.
- Extract the `ST_*` protocol into `shared/module-bridge.js` used by both sides.

**Exit:** snapshots still match per module; the palette exists once; expected 15–25% total payload reduction.

### M3 — Split module internals *(one module per commit)*

- `index.html` (markup) + `module.js` (behaviour) + `module.css` (styling) per module.
- Largest first — payroll (262 KB), service (231 KB), tax (224 KB) — since they gain the most.

**Exit:** no module's inline `<script>` exceeds a set budget; snapshots match.

### M4 — Slim the shell

- Extract shell CSS and JS out of `index.html` into `shell/`.
- Target: `index.html` under 150 KB.

**Exit:** boot-time parse drops from ~3 MB to ~150 KB plus one module on demand.

### M5 — Retire the patcher machinery

- Delete `scripts/apply-d2-qms.mjs`, `apply-d3-service.mjs`, `apply-d4-dsr.mjs`, `extract-modules.js`.
- Delete the base64 encode/decode/sha256 path and `tests/patcher-eol-independence.test.mjs` (its subject is gone).
- Module edits become **ordinary file edits**.

**Exit:** no base64 payload anywhere in the tree.

### M6 — Lock the gains

Tests that make regression impossible rather than merely unlikely:

- no `html_b64` in `www/index.html`;
- `index.html` under its size budget;
- no module inline `<script>` over budget;
- shared helpers defined exactly once across the tree;
- every module directory has the required file set;
- every module's `src` path resolves and is relative (no absolute or remote URLs — the APK ships without INTERNET permission).

---

## 6. Crash-proofing — explicitly

Migration is necessary but not sufficient. These land alongside it.

| Measure | Phase | Why |
|---|---|---|
| Boot parse 3 MB → ~150 KB + one module | M4 | The largest single ANR/OOM contributor on low-memory devices |
| Per-module error boundary — failure shows a recoverable card, never a white screen | M1 | Extends the existing `hideModuleLoadError` affordance |
| Module load watchdog with a real timeout and a retry path | M1 | Replaces the current fixed-timer loader heuristic |
| Structured module-error reporting to the shell (metadata only) | M2 | Today a module failure is close to invisible |
| Per-module memory release on close | M3 | `__moduleSrcCache` currently holds built strings for the session |
| Device matrix run on the oldest API-23 device each phase | every | Where memory pressure actually shows up |

### What this migration does **not** fix — stated plainly

- **`storage-core.js` is untouched.** DAT-02's synchronous `db.export()` remains synchronous. The storage engine is deliberately out of scope — the standing rule from three prior crashes is that storage changes go last, micro-incrementally, device-tested each step.
- It does not change any business logic, and must not.
- It does not remove the need for the Phase 0 device pass.

---

## 7. Programme sequence — as directed

| Stage | Content | Blocked by |
|---|---|---|
| **A** | **D5–D12** — 8 remaining D-series waves, built continuously on the current architecture | nothing |
| **B** | Push; full regression; consolidated release notes | A complete |
| **C** | **Device test and error fixing** — Phase 0's 69 cases + 4 drills + 9 operational gates, plus D4–D12 device cases | owner nominations form |
| **D** | **Modular HTML migration** — M0 → M6 | C green |
| **E** | **ETP / E-series** — E1 import → E6 monitoring (+ optional E7) | D complete; **7 owner inputs** |
| **F** | **PHP platform / Track B** | E complete; fresh owner direction |

Stage C is the real gate: migrating from a baseline that has never been device-accepted would mean debugging two unknowns at once.

---

## 8. Effort and risk

| Stage | Rough size | Risk |
|---|---|---|
| A — D5–D12 | 8 waves; D4 took ~1 day of engineering | Low per wave; the patcher-fragility tax recurs 8× |
| C — device pass | 69 cases + 4 drills + 9 gates | Owner-time bound, not engineering bound |
| D — migration | M0–M6; ~11 modules × 3 phases + shell | **M1 carries essentially all of it**; M2–M6 are mechanical and individually verified |
| E — ETP | 6–7 waves | High design risk; needs real exports before schema freeze |

**Rollback:** every phase is one or a few commits on a branch, merged only after its device gate. M1 is a single revert. M2/M3 are per-module, so a bad module reverts alone.

---

## 9. One recommendation, then it is your call

**Concern, stated once:** building D5–D12 through the base64 patcher machinery means eight more waves paying the fragility tax documented in §2 — and every one of those waves is then carried through the migration a second time. Migrating first, or migrating each module as its wave touches it, would make D5–D12 cheaper and safer.

**Option — incremental migration (my recommendation).** Fold M1 for a single module into the wave that already touches it: D5 touches stock, so stock becomes a real file as part of D5. Migration is then amortised across work already planned, there is no big-bang step, and each wave after the first is cheaper than the last. By D12 the migration is finished, with no separate Stage D.

**Your stated order is fully workable** and has a real advantage: it migrates once, from a frozen and device-accepted feature set, instead of against a moving target. The plan above is written for your order and stands as-is.

If you want the incremental variant, the only change is that M1 is scheduled per module inside Stage A instead of as a Stage D block. Everything else — the oracle, the phases, the guard rails — is identical.

---

## 10. What is needed to start

**Stage A (now, unblocked):** approval to begin D5 (stock variance triage) on the current architecture.

**Stage D (later):** approval of this document, plus one decision — big-bang Stage D, or incremental per §9.

**Not needed yet:** ETP exports, PHP direction. Both are stages E and F.

---

**Status:** AWAITING OWNER APPROVAL. No migration work has begun and none is authorised by this document.
