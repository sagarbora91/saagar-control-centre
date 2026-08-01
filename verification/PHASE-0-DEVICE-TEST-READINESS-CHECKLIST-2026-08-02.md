# Phase 0 Device Test Readiness Checklist

**Prepared:** 2026-08-02 (Asia/Calcutta)  
**Status:** Pre-test preparation  
**Goal:** All items below must be ✅ before the 69-case functional pass begins.

---

## Owner preparations (must provide)

### Nominations
- [ ] **Nominations form completed** — `PHASE-0-DEVICE-ACCEPTANCE-NOMINATIONS-FORM-2026-08-02.md` submitted with all fields filled
  - [ ] Primary device model, Android API, RAM, storage
  - [ ] Oldest API-23 device model, Android API, RAM, storage
  - [ ] Backup provider (Drive/OneDrive) account and folder
  - [ ] Recovery passphrase custodians × 2 (names, roles, contact)
  - [ ] Tester, evidence owner, legal/security/signing roles named

### Passphrase
- [ ] **Recovery passphrase** (12+ chars) — supplied to engineering via **separate secure channel** (NOT in form or Git)
  - [ ] Custodian 1 has written copy
  - [ ] Custodian 2 has written copy
  - [ ] Engineering has received and stored securely

### Devices
- [ ] **Primary device** — reset, factory state, or any real data backed up
- [ ] **API-23 device** — reset, factory state, or any real data backed up
- [ ] Both devices have **≥ 2 GB free storage** (confirm before test starts)
- [ ] Both devices have **signed-in Google/Microsoft account** (for provider access)

### Backup provider
- [ ] **Drive/OneDrive folder created** (e.g., "SaagarCC-Test-2026")
- [ ] Folder is **empty** (no prior backups in the way)
- [ ] Folder is **owned by the nominated account** (not shared)
- [ ] **Ownership confirmed in the nominations form**

---

## Engineering preparations (we provide)

- [ ] **Seeded APK built and verified** — `SaagarCC-DemoData-v2.9.apk` (or current version)
  - [ ] SHA-256 checksum on record
  - [ ] Seed state confirmed: `DEMO_SEED_ENABLED=true`
  - [ ] Debug signature verified

- [ ] **Device test script ready** — `DEVICE-TEST-SCRIPT-BKP03-DAT02-RESTORE.md`
  - [ ] All four drill steps laid out (A: DAT-02, B: BKP-03, C: cross-device restore, D: legacy migration)
  - [ ] Thresholds defined (DAT-02: export p95 ≤150ms, frame ≤250ms, total ≤3000ms)

- [ ] **69-case functional catalogue ready** — `SEED-APK-MODULE-WISE-TEST-READINESS-2026-07-29.md`
  - [ ] All 15 module test cases (CORE/QMS/SVC/DSR/STK/EXP/GRM/CRO/PAY/LEV/TAX/PLN/RPT/SEC/LEG)
  - [ ] Evidence template defined (device, tester, date, expected, actual, screenshot ref)

- [ ] **Acceptance gates documented** — `PHASE-0-CLOSURE-STATUS-AND-EVIDENCE-PACK-2026-08-02.md`
  - [ ] 69 cases must all pass (or be blocked by a P0/P1 requiring fix)
  - [ ] All four drills must pass
  - [ ] Legal/privacy approval required
  - [ ] Security posture verified
  - [ ] Staff UAT complete
  - [ ] Incident/recovery rehearsal complete

---

## Test schedule

- [ ] **Test date scheduled** (within 3 business days of nominations received)
- [ ] **Estimated duration:** 
  - 69-case catalogue: 2–3 days (depending on defects found)
  - Four drills: 1–2 days (DAT-02 timing, BKP-03 delivery cycles, restore round-trips)
  - Any P0/P1 fixes: depends on issue
  - Total: plan for 5–7 days minimum, ~2 weeks realistic with fixes

---

## Stop-and-fix rules (if any P0/P1 surfaces)

- [ ] **P0/P1 halts the pass** — no new cases run
- [ ] **Targeted fix committed** to a feature branch
- [ ] **Affected cases + mandatory smoke cases rerun** on both devices
- [ ] **Result documented** before continuing to new cases
- [ ] **No skip or workaround** — P0/P1 is a blocker, not a note

---

## Evidence collection

- [ ] **Evidence owner assigned** (person who collects and files screenshots/logs)
- [ ] **Evidence template prepared:**
  - [ ] Device model + Android API
  - [ ] Tester name
  - [ ] Test date/time
  - [ ] Expected result
  - [ ] Actual result (PASS/FAIL/BLOCKED)
  - [ ] Screenshot/video reference (if applicable)
  - [ ] Logcat/console errors (if applicable)

---

## Parallel-track items (can run while device test happens)

These do NOT block device test start, but should be underway:

- [ ] **Legal/privacy review** of `legal/R1-LEGAL-MINIMUM-CONTROL-PACK.md` (draft policy pack)
- [ ] **Security review** of posture checks and production signing custody plan
- [ ] **Staff UAT scheduling** — identify 2–3 named staff who will test QMS, Service, denial, rights, backup, restore
- [ ] **Incident rehearsal scheduling** — timed breach tabletop + wiped-device recovery drill
- [ ] **Production keystore custody** — establish two-custodian protocol and recovery process (outside Git)

---

## Sign-off

When all ✅ boxes above are completed:

| Role | Name | Date | Signature |
|---|---|---|---|
| Owner | ________________ | __________ | ________________ |
| Tester (primary) | ________________ | __________ | ________________ |
| Evidence owner | ________________ | __________ | ________________ |
| Engineering lead | ________________ | __________ | ________________ |

---

## Quick reference

| Document | Purpose |
|---|---|
| `PHASE-0-DEVICE-ACCEPTANCE-NOMINATIONS-FORM-2026-08-02.md` | **← OWNER FILLS THIS FIRST** |
| `PHASE-0-DEVICE-TEST-READINESS-CHECKLIST-2026-08-02.md` | **← THIS DOCUMENT — Track readiness** |
| `PHASE-0-CLOSURE-STATUS-AND-EVIDENCE-PACK-2026-08-02.md` | Detailed acceptance gates (69 cases + 4 drills + legal/ops/signing) |
| `DEVICE-TEST-SCRIPT-BKP03-DAT02-RESTORE.md` | Exact step-by-step drill instructions |
| `SEED-APK-MODULE-WISE-TEST-READINESS-2026-07-29.md` | 69-case functional catalogue |
| `PHASE-0-ENGINEERING-PUBLISH-HANDOFF-2026-08-02.md` | What was built and tested offline |
