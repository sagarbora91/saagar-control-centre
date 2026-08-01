# Phase 0: Owner Handoff Summary

**To:** Owner  
**Date:** 2026-08-02  
**Re:** Phase 0 code-complete; ready for device acceptance  

---

## The one thing you need to do

**Fill out this form and return it:** `verification/PHASE-0-DEVICE-ACCEPTANCE-NOMINATIONS-FORM-2026-08-02.md`

**Takes 15 minutes.** Supplies device info, provider account, recovery custodians, and team roles.

---

## What Phase 0 is

**Encrypted storage + backup + legal minimum + owner access controls.** Built over R0 (4 waves) + R1 (legal). 210 permanent regression tests, all passing.

| Feature | Status |
|---|---|
| Fail-closed storage recovery | ✅ Built & tested |
| Owner entry PIN + per-module PINs | ✅ Built & tested |
| Automatic off-device encrypted backup (BKP-03) | ✅ Built & tested |
| Storage performance gate (DAT-02) | ✅ Built & tested |
| 210 permanent offline tests | ✅ All passing |
| Android 6+ support (minSdk 23) | ✅ Tested |

Not yet device-accepted. Not yet production-signed. Not yet staff-UAT approved.

---

## What you're authorizing next

**Device acceptance:** 69 functional test cases + 4 critical drills, on two real Android devices.

| Component | What it proves |
|---|---|
| **69 functional cases** (QMS, Service, DSR, Stock, Expense, Grooming, CRO, Payroll, Leave, Tax, Planning, Reports, Security, Legal, Core) | Every module works end-to-end on a real device |
| **DAT-02 drill** (5 encrypted saves under 3 sec total) | Storage performance is acceptable |
| **BKP-03 drill** (automatic backup to Drive/OneDrive) | Off-device backup delivers correctly |
| **Cross-device restore** (backup file transfers + passphrase recovery) | Data survives device loss |
| **Legacy migration** (if you have old plaintext data) | Old data migrates safely |

**Timeline:** 5–7 days for the 69 cases (assuming 0–2 defects requiring fix); 1–2 days for drills. Parallel: legal review, security posture, staff UAT, incident rehearsal.

---

## What we need from you (3 things)

### 1. Devices
- Primary device (anything Android 6+; will be reset)
- Oldest Android 6.0–6.1 device (or older API-23 class, for lower-bound proof)

### 2. Backup folder
- Google Drive or OneDrive account (test-only, not shared)
- Empty folder where encrypted backups will land during testing

### 3. Team assignments
- **Tester:** person who runs the 69 cases on primary device
- **Observer:** person who records evidence (screenshots, timings)
- **Recovery custodians × 2:** people who hold the passphrase (offline, not Git)
- **Legal reviewer:** person who approves the privacy policy
- **Security reviewer:** person who checks root/debug/ADB posture
- **Signing custodians × 2:** people who'll manage production keys

---

## How to get started

1. **Read:** `verification/OWNER-ACTION-REQUIRED-PHASE-0-DEVICE-ACCEPTANCE-2026-08-02.md` (this explains the full context)
2. **Download & fill:** `verification/PHASE-0-DEVICE-ACCEPTANCE-NOMINATIONS-FORM-2026-08-02.md` (all fields required)
3. **Send back:** to [engineering contact]
4. **Passphrase:** we'll send separately via Slack/WhatsApp (not email)

---

## Timeline

| Milestone | Target date |
|---|---|
| Nominations returned | 2026-08-05 |
| Readiness confirmed | 2026-08-06 |
| Device test begins | 2026-08-12 |
| Test pass complete (no defects) | 2026-08-19 |
| Legal/security reviews done | 2026-08-23 |
| Staff UAT done | 2026-08-23 |
| Phase 0 acceptance | 2026-08-26 |

(Assumes 0–1 defect fix; real-world plan for 2 weeks.)

---

## What happens after acceptance

**Production APK signed** with your keys, ready to release to Google Play.

**Phase 1** (improvement programme) ships in parallel:
- D-series: Faster daily work (QMS, Service, DSR, Stock, Expense, Payroll, Leave, Tax, Grooming, CRO, Planning)
- E-series: ETP verification layer (import retail data, reconcile declarations, compute targets, incentive)
- F-series: New compliance/control functions (banking recon, PAN capture, dead-stock tracking, staff scorecards)

---

## Questions?

Ask before submitting the form. All reference docs are in `verification/` on GitHub.

