# Saagar Control Centre — Owner Communication: Phase 0 Closure & Phase 1 Programme

**To:** Owner  
**Date:** 2026-08-02  
**Re:** Phase 0 code-complete; Phase 1 ready to design; parallel execution starting this week  
**From:** Engineering

---

## Executive Summary

**Phase 0 (encrypted storage, owner access, legal minimum)** is code-complete, merged to production main, and ready for device acceptance. **All 210 regression tests passing.** Device test can start this week once you supply nominations (devices, provider account, team roles).

**Phase 1 (module deepening + ETP verification layer)** is designed and ready to build. Engineering can start D1 (Home "Today" view) design review immediately and E1 (import layer) design freeze once you supply sample ETP exports and approvals.

**Both tracks run in parallel.** Device test doesn't block Phase 1 design. Phase 1 build can begin as soon as Phase 0 closes (~2026-08-26).

**What you need to do:** Fill a form, supply two sample reports, and approve three designs. **Total owner time: ~2 hours over 3 weeks.**

---

## Phase 0: Status and next steps

### What Phase 0 is

**Safe encrypted storage + automatic backup + legal compliance + owner access controls.** Built over the last 4 months through R0 (data safety, 4 waves) and R1 (legal minimum).

| Feature | Status |
|---|---|
| Fail-closed storage recovery (if database corrupts) | ✅ Shipped |
| Owner entry PIN + per-module staff PINs | ✅ Shipped |
| Automatic off-device encrypted backup to Drive/OneDrive | ✅ Shipped |
| Storage performance acceptance gate (DAT-02) | ✅ Shipped |
| 210 permanent regression tests (all green) | ✅ Shipped |
| Android 6+ support (minSdk 23; all your devices covered) | ✅ Shipped |
| Production release signing infrastructure | ✅ Built |

**Not yet:** Device-tested, legally approved, staff-trained, or production-signed.

### What happens next

**Device acceptance:** 69 functional test cases + 4 critical drills on two real devices.

| Test | Proves |
|---|---|
| **69 functional cases** (QMS, Service, DSR, Stock, Expense, Grooming, CRO, Payroll, Leave, Tax, Planning, Reports, Security, Legal, Core) | Every module works end-to-end on real Android devices |
| **DAT-02 drill** (5 encrypted saves in < 3 seconds total, UI frame gap < 250ms) | Storage performance acceptable; no ANR |
| **BKP-03 drill** (automatic encrypted backup lands in Drive/OneDrive, verified by SHA-256) | Off-device delivery works; backup is ciphertext only |
| **Cross-device restore** (backup file transfers to a second device, decrypts with passphrase, data recovers exactly) | Data survives device loss; passphrase recovery works |
| **Legacy migration** (if you have old plaintext data, it encrypts safely on upgrade) | No data loss in the transition |

**Parallel with device test:**
- Legal/privacy review of the policy pack (draft ready for counsel)
- Security posture verification (root/debug/ADB controls, screenshot protection)
- Staff UAT (named staff run QMS, Service, export, rights, backup, restore workflows)
- Incident rehearsal (tabletop breach + wiped-device recovery drill)
- Production key custody (two custodians, recovery process, stored outside Git)

**Total timeline:** Device test 5–7 days (assuming ≤2 defects); legal/security/UAT in parallel over 2–3 weeks. **Realistic Phase 0 closure: 2026-08-26.**

### What you do RIGHT NOW

**Fill one form.** Takes 15 minutes.

**Document:** `verification/PHASE-0-DEVICE-ACCEPTANCE-NOMINATIONS-FORM-2026-08-02.md`

**Form fields:**
- Primary Android device (model, API version, RAM, free storage)
- Oldest API-23 device (backup/lower-bound device)
- Google Drive or OneDrive account (test-only folder)
- Two recovery passphrase custodians (names, roles, contact info)
- Tester, evidence owner, legal reviewer, security reviewer, signing custodians

**Passphrase:** After you name the custodians, we'll send a 12+ character passphrase via Slack DM or WhatsApp (NOT email, NOT Git). Each custodian keeps a written copy in a drawer/safe.

**Submit to:** [Engineering team Slack or email]

**Timeline:** Form received → validation → device test starts within 3 business days (target: 2026-08-12).

---

## Phase 1: Vision and prerequisites

### What Phase 1 is

**Three series, 18 months of improvement work, one wave at a time.**

| Series | Waves | Theme | Business impact |
|---|---|---|---|
| **D — Deepen** | D1–D12 | Faster daily work, better exceptions, manager clarity | Staff do QMS/DSR/stock 20% faster; managers see exceptions before they escalate |
| **E — ETP verification** | E1–E6 | Import retail truth, verify declarations, compute targets, track incentive | DSR automated from ETP; CRO reconciliation objective; incentive computed from data, not declared |
| **F — New functions** | F1–F15 | Compliance, intelligence, controls | Banking recon closes ₹96.6L open-items gap; PAN capture on ≥₹2L bills; staff scorecard from verified data |

### Sequence

1. **D1** (Home "Today" view) — First wave, brings the most value upfront
2. **E1–E6** (ETP layer) — Foundation for everything; must be solid
3. **D2–D12** (other modules) — Deepening in parallel with ETP
4. **F-cycle** (new functions) — After E lands (late 2026 / early 2027)

### What's ready for owner approval RIGHT NOW

#### D1: Home "Today" View — ALREADY SHIPPED, no approval needed

> **Correction (2026-08-04).** This section was written in error. D1 was built and
> shipped on 2026-07-30 in commit `4177701` ("Complete D1-D3 and native SQLite
> scale fix"), together with D2 and D3. The design document this section pointed
> at has been deleted, and the eight approval questions below are moot — those
> decisions were made when D1 was built. Nothing here needs owner action.
>
> The description is kept for reference so you can see what shipped. The first
> wave actually needing your input is **D4 (DSR)**, covered separately.

**What shipped:** Home screen shows a role-aware card stack:
- **Due follow-ups** (QMS: next 3 follow-ups, with estimated value)
- **Open service jobs** (count ready for pickup, count awaiting parts)
- **Cash health** (opening, deposits, expected closing vs target)
- **Stock exceptions** (variance %, items below reorder point)
- **Leave gaps** (days next week with coverage issues)
- **Backup health** (last verified date, escalation status)
- **Attention centre** (top 3 alerts: tax due, audits pending, filing status)
- **Store context badge** (WLMHW or HEMW, impossible to miss, on every screen)
- **Reauth explanation** (when a PIN is asked, explains why + how to recover)

**Why:** Managers spend 5–10 minutes every morning navigating 11 modules to know what to do. D1 gives them the answer in 10 seconds. Owner sees health of the system (backup status, exceptions) without asking.

**What we need from you:** Nothing. D1 shipped on 2026-07-30.

#### E1–E6: ETP Verification Layer (prerequisites, not full design yet)
**Document:** `docs/PHASE-1-PREREQUISITES-CHECKLIST-2026-08-02.md`

**The idea:** Import retail truth from ETP (Titan's reporting system). Every day at store close:
- Manager exports 4 reports from Titan (R022 revenue, R025 sales detail, R013 CRO performance, R003 discounts)
- App imports them, validates them, reconciles them
- DSR, CRO reconciliation, and incentive computation all become objective, data-driven

**Why:** Today, DSR is declared daily and CRO reconciliation is manual. ETP is the single source of truth; everything should derive from it.

**What we need from you (to unblock E1 design):**

| Input | Why | Owner supplies |
|---|---|---|
| **Sample exports** (one day's R022/R025/R013/R003 from WLMHW + HEMW) | Freeze the schema; verify ID leading-zero handling | Files → kept secure, headers extracted only |
| **Dictionary approvals** (field mappings, transaction types, tender modes) | Reconcile ETP codes to app codes; quarantine unknown values | Name an approval owner; sign off on both-store dictionaries |
| **R022↔R025 reconciliation rule** (grain, tolerance, fail-closed vs quarantine) | The cross-validation gate (most valuable fraud check) | Decide: fail batch if totals don't match, or quarantine for review? |
| **Date policy** (earliest business date, future-day skew tolerance) | Validate invoices at import; reject data outside the window | E.g., "earliest 2024-09-16, allow 0 days future skew" |
| **Unknown code handling** (fail-closed vs quarantine) | Decide: reject unknown transaction/tender types, or flag for approval? | Policy choice (recommend fail-closed; quarantine adds workflow) |
| **XLSX parser** (which library, license, security review) | Select the entry point for all external data | Which parser: SheetJS? XLSX? Any constraints? |
| **Incentive scheme source** (Titan scheme doc OR custom bands) | E5 (incentive wave) needs the formula before design | Provide the scheme table (from %, to %, rate %) |

**Once supplied, engineering can:**
1. Freeze E1 schema (header signatures, column whitelists, grain)
2. Design E2–E6 (computed DSR views, CRO reconciliation state machine, targets, incentive, monitoring)
3. Begin build

**Timeline:** Exports + approvals received → E1 schema frozen → build begins ~2026-08-26 (after Phase 0 closes).

---

## Your action plan (3 steps, 3 weeks)

### Week 1: Phase 0 nominations (15 min)
**By 2026-08-05:**
- [ ] Download `verification/PHASE-0-DEVICE-ACCEPTANCE-NOMINATIONS-FORM-2026-08-02.md`
- [ ] Fill all fields (devices, provider, custodians, team roles)
- [ ] Submit form + passphrase via Slack/WhatsApp (separate secure channel)

**Result:** Device test scheduled for 2026-08-12.

### Week 2–3: Phase 1 inputs (1–2 hours total)
**By 2026-08-15 (not blocking, but helpful early):**
- [ ] ~~Review and approve the D1 design~~ — not required; D1 shipped 2026-07-30
- [ ] Supply ETP sample exports (R022/R025/R013/R003 from both WLMHW + HEMW)
- [ ] Approve dictionary owner + reconciliation rule
- [ ] Approve date policy + unknown code handling
- [ ] Confirm XLSX parser preference
- [ ] Confirm incentive scheme source

**Result:** E1 schema frozen; Phase 1 build can start 2026-08-26.

### Weeks 3–4: Device test + reviews (parallel, no action required)
**2026-08-12 → 2026-08-26:**
- Tester runs 69 cases + 4 drills (device-side work; you observe)
- Legal reviews policy pack
- Security verifies posture checks
- Staff complete UAT
- Incident rehearsal runs
- Phase 0 acceptance gates close

---

## Parallel execution: What's happening when

```
TODAY (2026-08-02)
    │
    ├─ Phase 0 track ─────────────────────────────────────────────────────────
    │  ├─ Owner: Submit form [by 2026-08-05]
    │  ├─ Eng: Validate, schedule
    │  ├─ Device test: 69 cases + 4 drills [2026-08-12 → 2026-08-19]
    │  ├─ Legal/security/UAT reviews [parallel, 2026-08-12 → 2026-08-23]
    │  └─ Phase 0 acceptance signed [2026-08-26]
    │
    └─ Phase 1 track ─────────────────────────────────────────────────────────
       ├─ Owner: Supply D1 approval + E1 inputs [by 2026-08-15]
       ├─ Eng: Review D1, freeze E1 schema [2026-08-02 → 2026-08-23]
       ├─ D1 build [2026-08-26 → 2026-09-10]
       └─ E1 build [2026-09-10 → 2026-10-31] (after D1 ships)
```

**Key insight:** Device test and Phase 1 design happen at the same time. Phase 1 build doesn't start until Phase 0 closes, but all prep is done in parallel.

---

## Reference documents (all on GitHub)

### Phase 0 (you act on these)
- `docs/PHASE-0-OWNER-HANDOFF-SUMMARY-2026-08-02.md` — 2-page summary
- `verification/PHASE-0-DEVICE-ACCEPTANCE-NOMINATIONS-FORM-2026-08-02.md` — **← FILL THIS**
- `verification/PHASE-0-DEVICE-TEST-READINESS-CHECKLIST-2026-08-02.md` — Joint tracking
- `verification/PHASE-0-CLOSURE-STATUS-AND-EVIDENCE-PACK-2026-08-02.md` — Detailed acceptance gates (69 cases + 4 drills + legal/ops)
- `verification/DEVICE-TEST-SCRIPT-BKP03-DAT02-RESTORE.md` — Exact drill steps

### Phase 1 (you review/approve these)
- `docs/PHASE-1-PREREQUISITES-CHECKLIST-2026-08-02.md` — All Phase 1 blockers
  (its "D1 design approved" gate is stale for the same reason — D1 shipped)
- `docs/audit/D4-DSR-CHANGE-CONTRACT-2026-08-04.md` — the wave actually in progress
- (E1–E6 detailed designs will follow once E1 prerequisites are supplied)

### Engineering reference (for transparency)
- `docs/V6-IMPROVEMENT-ROAD-PLAN.md` — Full D/E/F programme (12 D waves, 6 E waves, 15 F candidates)
- E1 work in progress on branch `agent/e1-etp-import` (147 files, import foundation + tests)

---

## FAQ

### Q: Will Phase 0 delay Phase 1?
**A:** No. Phase 1 design happens in parallel. D1 design can be approved immediately; E1 design can freeze schema once exports are supplied. Phase 1 build waits for Phase 0 to close (~2026-08-26), but that's only 3 weeks away.

### Q: What if device test finds defects?
**A:** We fix them. Any P0/P1 (crash, data loss, control failure) halts the pass; we fix it and re-test affected cases. P2 (visual/usability) is logged for review. Phase 0 still closes, but with the fix applied.

### Q: Do I need to approve all of Phase 1 before starting?
**A:** No. D1 can be approved now; E1 inputs can arrive later (before 2026-08-15 is ideal but not blocking). Phase 1 engineering is staged — D1 builds first, E1 designs while D1 ships, E1 builds after D1 closes.

### Q: What if I don't have older Android devices for testing?
**A:** We test on what you have. If you only have Android 12 devices, we test on Android 12. The "oldest API-23 class device" is for lower-bound proof, but not critical if you have no old devices. Tell us what you have.

### Q: Can staff use the app during device test?
**A:** No. Device test resets the devices, wipes data, restores backups. Don't use the devices for real work during 2026-08-12 → 2026-08-26.

### Q: Will Phase 1 work with my current ETP setup?
**A:** Almost certainly yes. We're designing for your exact ETP exports (R022, R025, R013, R003). The sample exports confirm schema and ID handling. If ETP changes, we adjust the parser.

### Q: What happens to my backup data during device test?
**A:** It's preserved. The cross-device restore drill reads a backup, restores it to a second device, and verifies the data is intact. No data loss — the whole point of testing the backup.

---

## Next step: Send the form

**Download and fill:** `verification/PHASE-0-DEVICE-ACCEPTANCE-NOMINATIONS-FORM-2026-08-02.md`

**Submit to:** [Engineering contact / Slack channel]

**Passphrase:** Send separately via Slack DM or WhatsApp (not email, not Git).

**Timeline:** Once received, we validate and schedule device test within 3 business days.

---

## Summary: What you're authorizing

✅ **Phase 0 device acceptance** — 69 functional cases + 4 critical drills, two devices, both stores isolated, backup/restore proven, encryption verified.

✅ **Phase 1 programme** — D-series (faster daily work), E-series (ETP truth), F-series (new compliance/intelligence).

✅ **Parallel execution** — Device test + Phase 1 design/prep at the same time; Phase 1 build starts 2026-08-26.

**Your time commitment:** 15 min (form) + 45 min (D1 approval) + 30 min (E1 inputs) = ~1.5 hours over 3 weeks.

**Question?** Reach out before filling the form. All docs are in GitHub; reference links are above.

---

**Engineering Team**  
Saagar Control Centre  
2026-08-02
