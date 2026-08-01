# Fix Plan (Phase 2)

Derived from `FINDINGS.md` (200 findings). Partitioning obeys the app's hard law:
**module fixes = edits to the EXTRACTED html (1 owner per file, parallel-safe) → embeds SERIALIZED one at a
time via `module_tool.js` (each embed rewrites index.html) → `node --check` + all-11-blob decode after each round.**
Shell / bridge / report / auto-backup / AndroidManifest each = **solo** edits. Injected-CSS
(`injectUniformCSS`/`injectMobileMode`) changes = **most dangerous → solo + full 11-module screenshot regression at all
4 combos.** Storage-core/sqlite/photo = **never touched.** No commit/push. No new libs. Additive only.

## Scope decision (honest)
- **Fix in full:** all **5 P0** + all **P1** (39 after dropping the refuted qms-L01) + a curated **high-value P2 layout
  batch** (the recurring `overflow-x:hidden` hero/banner clip, the shell header overlap, the 44px control-floor crowding).
- **Long-tail P2/P3 (~140):** fix the clearly-safe *additive* ones opportunistically inside each file's batch; **defer**
  genuinely risky or low-value ones with a one-line rationale (recorded in `CHANGELOG.md`; Phase 4 `VERIFICATION.md`
  lists found/fixed/deferred, which the plan explicitly permits). Rationale: this app has crashed 3× from over-eager
  edits — 140 low-severity edits to a working, unshipped-since-Wave-3 build is net-negative risk. P0/P1 is where the value is.
- **Storage-layer findings → report-only** (none require storage-core edits; the backup fixes are in auto-backup.js /
  shell validators, which are editable).

## Fix order (plan Phase 3): layout P0/P1 → bug P0/P1 → security P0/P1 → curated P2. But P0s FIRST regardless of lane.

## Batches

### BATCH 0 — P0 (highest priority, mixed files)
| Finding | File(s) | Fix |
|---|---|---|
| P0-1 dsr-bug-01 (crash) | `dsr.html` (+ defensively `integration-bridge.js`) | `normalizeRecord()` additively ensures `cleaning.cp1/cp2`, `marketing.*` shape |
| P0-2 dsr-bug-02 (race) | `dsr.html` (`_writeRecNow`) | re-read + merge bridge-owned `qms*` rows by `sourceRef` before setItem (no blind overwrite) |
| P0-3 bug-payroll-01 (dup key) | `payroll.html` (`lockRun`/`runBlockingErrors`) | BLOCK lock on snapshot-key collision (dup empId / blank identity) |
| P0-4 xss-cro-audit-history | `cro_audit.html` | wrap `a.cro/a.sm/a.store/remarks` in existing `stEsc()` at all sinks |
| P0-5 xss-grooming-names | `grooming.html` | add `esc()` helper; wrap `rec.name`/`c.name` in renderDaily + renderLeaderboard |

dsr + payroll + cro_audit + grooming are 4 separate module files → their extracted edits are parallel-safe; embeds serialized.

### BATCH 1 — P1 bugs, by module (extracted-file edits, parallel; embed serial)
- **dsr.html:** dsr-bug-03 (re-read after cache), dsr-bug-04 (calcTimeOut epoch/midnight), dsr-bug-05 (photo-blob ANR — lazy/guard), dsr-bug-06 (write `audit.score` alias so bridge reads it; **coordinate with bridge**)
- **payroll.html:** bug-payroll-02 (advance date-boundary), bug-payroll-03 (closeMonth lock downgrade guard)
- **cro_audit.html:** cro-dup-audit (duplicate-audit guard), cro-groom-stale (clear grooming% on CRO change)
- **service.html:** svc-money-comma-finalamt + svc-manual-subtotal-comma (strip commas before parse), bug-02/bug-03 (GST CGST+SGST rounding + finalAmt reconcile)
- **expense.html:** exp-bug-01 (edit/void vs 60s tick — merge), exp-bug-02 (`>0` amount guard)
- **stock.html:** stock-carryforward-early-return (continue 7-day lookback past unlocked days)
- **qms.html:** qms-bug-01 (rangeStats day-boundary — use local-date not ms)
- **leave.html:** leave-bug-01 (default `data.leaves/agendas` to `[]`), bug-01 (multi-day leave span)

### BATCH 2 — P1 layout (module CSS edits + shell)
- **payroll.html:** payroll-L01 (Attendance-Import modal `max-height`+scroll), payroll-L02/L03 (**CONFIRMED** — preview wrappers `align-items:flex-start` so 210mm scrolls from left)
- **qms.html / shell MOBILE_CSS:** qms-L02 (reset `--sidebar` to 0 in bcc-mobile), qms-L03 (auto-close drawer after nav tap — the injected boot script) — *injected-CSS/boot = solo + regression*
- **leave.html:** leave-01 (day-modal pending row wrap)
- **tax.html:** tax-01 (compliance capture row wrap/stack)
- **planning.html:** L-planning-01 (form grid → 1col at ≤412 via module @media or shell block)
- **dsr.html:** dsr-01 (table header/body alignment in 641–920 band)
- **stock.html + shell:** stock-L01 (resolve card-vs-scroll conflict — drop the shell input width/min-height override when card layout active)

### BATCH 3 — P1 security (solo files)
- **shell index.html:** SEC-PIN-01 (don't trust a plaintext admin bool — derive admin from a session check that requires the PIN), SEC-PIN-02 (stronger KDF: many-round hash + per-install salt; still offline, no libs — use a slow iterated hash), SEC-PIN-03 (note: true data-withholding needs encryption = out of scope w/o libs → document + at least gate the render), SEC-PIN-04 (restore must NOT import the admin-PIN-hash / admin flag from a backup file)
- **tax.html:** xss-tax-firm-list (escapeHtml the firm name/entity/PAN/GSTIN in renderFirmList)
- **shell restore/backup validators (index.html) + auto-backup.js:** bug-backup-1 (`saagar_invoice_seq_v1` number allowed), bug-backup-2 (`saagar_wsf_settings_v1` object allowed), **SEC-DATA-01** (abort restore if rollback `safeSet` returns false / readback null — index.html:5285), **SEC-DATA-02** (whitelist `saagar_bridge_config` in `appControlKeys()` + validator), **SEC-DATA-03** (surface hard warning if `written<keys.length`; offer rollback), **SEC-DATA-04** (size guard on imported JSON)
- **AndroidManifest.xml:** sec-apk-2 (`allowBackup="false"`), sec-apk-1 (debuggable: set `false` in source / note release-build strips it)

### BATCH 4 — curated P2 layout (injected-CSS = solo + regression)
- Recurring hero/banner `overflow-x:hidden` clip (shell Home hero, payroll `.hero`, tax `.cos-banner`): allow wrap/scroll on the inner stat row instead of hard clip.
- Shell top-bar brand↔role overlap at 360 (stack/shrink in bcc-mobile).
- 44px control-floor crowding in dense inline/table rows (relax min-height for `td`/inline-toolbar controls).
- Then per-module safe-additive P2s during each module's batch.

## Execution mechanics
1. **Pinpoint (parallel, read-only):** per-file agents emit exact find/replace specs from the extracted copies (proven Wave-1/2 pattern). *(Optional — many fix_hints are already exact.)*
2. **Apply (serialized per file):** edit the extracted `<id>.html`; module owner = one writer.
3. **Embed (STRICTLY serialized):** `node module_tool.js embed <id> <file>` — one at a time (each rewrites index.html).
4. **Gate:** `node --check` on shell inline JS proxy; all-11-blob decode; registries 11/11/11/11.
5. **Adversarial verify (parallel):** refute each fix; layout fixes re-checked in the browser harness at the catching combo.
6. **Log** every fix + every deferral to `CHANGELOG.md`.

## Checkpoints (waived by user — proceeding straight through, but deliverables still produced)
CHECKPOINT 2 (this file) · CHECKPOINT 3 (after layout wave) · Phase 4 `VERIFICATION.md`. **No commit/push/APK** until the
user explicitly asks.
