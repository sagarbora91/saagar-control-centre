# D5 Stock — Variance Triage, Reconciliation, and the First Modular Extraction

**Date:** 2026-08-04 (Asia/Kolkata)
**Baseline:** `main` = `origin/main` = `fc65889`; suite 260/260
**Scope authority:** `docs/V6-IMPROVEMENT-ROAD-PLAN.md` §4 wave D5; improvement inventory §4
**Migration authority:** `docs/MODULAR-HTML-MIGRATION-STRATEGY-2026-08-04.md`, **incremental variant selected by the owner 2026-08-04**
**Status:** drafted from source inspection; awaiting owner approval to implement

## 1. Purpose

D5 deepens the Stock register: **variance triage, brand drill-down, and guided
stock↔DSR↔QMS reconciliation before close/lock**.

Because the owner selected the incremental migration variant, D5 also carries
the **first modular extraction**: the stock module stops being a base64 payload
inside `www/index.html` and becomes real files under `www/modules/stock/`.

The extraction is sequenced **first**, so the feature work that follows is
ordinary file editing rather than base64 string surgery.

Out of scope: ETP-verified sales units (E2), any storage-engine change, and the
other ten modules.

## 2. Existing facts preserved

- Day blobs stay at `SK_PREFIX + store + '_' + date`; no key change, no new key.
- Opening/movement/closing capture, submit/lock/reopen stamps, the theft remark
  and manager-verification gate all keep their current behaviour.
- `preLockClosing()`, `theftRows()`, `closingSys()`, `totalPhys()` and the
  monthly variance/shrinkage view (P1-6) keep their current maths. D5 reads
  them; it does not redefine them.
- `data.closing[b].remarks` remains the reason slot that flows into the register
  and the print output.
- The read-only past-day rule and the SM-only lock rule are unchanged.

## 3. What the module does today

Source: `MODULES[id=stock]`, 178,323 chars, 132 functions, LF throughout.

| Capability | State |
|---|---|
| Variance maths per brand | `closingSys(b,data)` vs `totalPhys(c)`; `varClass`/`varText` for display |
| Pre-lock sign-off | `preLockClosing()` counts total/counted/gapped/unverified; `openPreLockSheet()` requires a free-text reason on every non-zero-variance brand |
| Theft | `theftRows()` + SM verification gate |
| Monthly view | Read-only month grid, repeat-offender flag at ≥N days |
| DSR cross-check | `renderDsrRecon()` — **one informational line**, stock sales vs DSR sales |

### Gaps D5 closes

1. **A variance has no structure.** It gets one free-text remark at lock time.
   There is no cause, no named owner, no next action, and no closure state — so
   nothing can be followed up, aggregated, or shown as still-open tomorrow.
2. **Reconciliation is informational and partial.** `renderDsrRecon()` prints a
   mismatch and does nothing about it. **QMS is not in the comparison at all**,
   despite the inventory asking for stock↔DSR↔QMS.
3. **No drill-down from a day's total variance to the offending brand** without
   leaving the day context.

## 4. Slices

### D5-M1 — Modular extraction of the stock module *(no behaviour change)*

Per the migration strategy §5, M0 then M1, scoped to one module.

- **M0 (harness):** capture `buildModuleSrc(mod)` output for all 11 modules as
  golden fixtures. The ten inject functions total 54,280 chars of pure string
  transform with small shell dependencies (`NEXT_STEPS`, `EMP_MASTER_KEY`,
  `MOBILE_CSS`, the `ST_*` constants), so they can be source-sliced into a test
  harness using the same technique `tests/d3-service-integration.test.mjs`
  already uses. Fixtures stay out of git; their hashes do not.
- **M1 (stock only):** write `buildModuleSrc(stock)` verbatim to
  `www/modules/stock/index.html`. The shell opens stock with
  `iframe.src = 'modules/stock/index.html'` while the other ten keep `srcdoc`.
  `MODULES[id=stock]` keeps its metadata and drops `html_b64`.

**Hybrid boot is deliberate.** Ten modules keep the proven path; one changes. If
the origin model breaks, exactly one module is affected and the revert is one
commit.

**Device gate — this is the riskiest step in the whole programme.**
`capacitor.config.json` sets `androidScheme: https`, `hostname: localhost`, so a
relative `src` should stay same-origin and `window.parent.*` should keep
resolving. That must be **proven on a real device** before D5-S1 begins.

**Finding worth recording:** `injectUniformCSS` is 32,442 chars of CSS injected
into *every* module at open. That single blob is the `shared/base.css` of the
target architecture, and it is the largest duplication win available in M2.

### D5-S1 — Variance triage record

Introduce `www/stock-variance-policy.js`, pure, no DOM or storage:

- **Cause taxonomy** (fixed, owner-approvable list): miscount, unrecorded sale,
  unrecorded transfer, GRN not posted, damage/defective, theft, system error,
  other-with-note.
- **Triage record** per brand-day: `cause`, `owner` (named employee), `nextAction`,
  `closedAt`/`closedBy`, `evidenceNote`.
- **State machine:** `open` → `investigating` → `closed`. A closed record needs a
  cause and a non-empty evidence note. `other` additionally requires the note.
- Stored additively on the day blob as `d5Triage[brand]`. **No new storage key.**

Existing free-text `remarks` keeps working; the triage record is additive, and a
day with only `remarks` reads as `open` with an unknown cause.

### D5-S2 — Guided stock↔DSR↔QMS reconciliation

Extend the one-line check into a pre-lock reconciliation panel:

- three counts side by side — **stock sales units**, **DSR sales count**, **QMS
  closed-sale count** — each with its source and its own "not entered yet" state;
- an explicit agreement/disagreement verdict per pair, never a single blended
  number;
- disagreements listed with the brand or queue entry that accounts for them
  where derivable;
- **advisory, not blocking, in D5.** It reports; it does not refuse the lock.
  Making it a gate is a separate owner decision (§8).

QMS data is read through the existing bridge rollup, read-only.

### D5-S3 — Brand drill-down

From a day's total variance, open the contributing brands ranked by absolute
variance, each linking to its triage record, **without losing the selected day
or store context**.

### Deferred from D5

Faster movement entry (reason-code picklists, last-entry reuse) from the
inventory. It is entry-speed work, independent of triage, and D5 is already
carrying the first migration slice. It should be its own slice once M1 has
proven itself.

## 5. Explicitly out of scope

- ETP-verified sales units — E2 supplies those; D5 must not pretend to have them.
- Any change to `storage-core.js`, DAT-02, or the persistence path.
- Migration of the other ten modules; M2–M6 of the strategy.
- Changing who may lock, unlock, or verify.

## 6. Risks

- **M1 origin model** — §4. Device-proven before anything depends on it.
- **`buildModuleSrc` drift** — once stock is a real file, a later change to an
  inject function would silently apply to ten modules and not to stock. M1 must
  land a test asserting the extracted file matches current inject output, so the
  divergence is caught rather than discovered.
- **Triage fatigue** — a cause/owner/action on every variance is more work per
  day. Mitigated by keeping it advisory in D5 and letting a zero-variance day
  need nothing at all.
- **Reconciliation reads three sources of differing reliability.** The panel must
  show three numbers with provenance, never one blended figure implying they are
  the same kind of fact.

## 7. Required evidence

- Pure policy tests: cause taxonomy, state machine, closure requirements, legacy
  `remarks`-only days, malformed records.
- Integration tests: extracted file matches inject output; module boots from
  `src`; `window.parent` bridge intact; triage persists and round-trips through
  backup/restore; reconciliation counts match their sources.
- Full permanent offline suite; every new test file added to `npm run
  test:offline` or CI skips it.
- Android debug packaging and APK checksum, verified by unpacking.
- **Device pass on the M1 hybrid boot before S1 starts.**

## 8. Open questions for the owner

1. **Cause list** (§D5-S1) — is the eight-value taxonomy right for this business?
   Anything missing, anything that should not be offered?
2. **Should reconciliation ever block the lock?** D5 keeps it advisory. Making a
   stock↔DSR disagreement refuse the close is a real control, and a real daily
   friction. Owner's call, not engineering's.
3. **Who owns a variance by default** — the counting CRO, the SM, or unassigned
   until someone claims it?

---

**Status:** AWAITING OWNER APPROVAL. No D5 implementation has begun.
