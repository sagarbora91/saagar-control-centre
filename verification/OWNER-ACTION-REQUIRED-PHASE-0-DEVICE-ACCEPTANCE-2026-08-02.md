# ACTION REQUIRED: Phase 0 Device Acceptance

**To:** Owner  
**From:** Engineering  
**Date:** 2026-08-02  
**Re:** Phase 0 is code-complete; device test can start this week once you provide nominations.

---

## Summary

Phase 0 Android engineering is **done and merged to main**. The app now has:
- ✅ Fail-closed encrypted storage with automatic recovery
- ✅ Owner access controls + per-module PIN protection
- ✅ Automatic off-device backup (BKP-03)
- ✅ Storage performance acceptance gate (DAT-02)
- ✅ 210 permanent regression tests (all passing)

**Next step:** Device acceptance — 69 functional cases across 15 modules + 4 critical drills (backup, restore, legacy migration, performance).

**To start this week, we need 3 things from you:**

---

## 1. Fill out the nominations form (15 min)

**Document:** `verification/PHASE-0-DEVICE-ACCEPTANCE-NOMINATIONS-FORM-2026-08-02.md`

**What we need:**
- Primary test device (model, Android API)
- Oldest API-23 device (backup device for lower-bound testing)
- Google Drive or OneDrive folder for encrypted backups (test account only)
- Two people to hold the recovery passphrase (in case device is wiped)
- Names for tester, evidence owner, legal reviewer, security reviewer, signing custodians

**Why:** The test script needs real device models and real provider accounts to verify the app works end-to-end.

**Time:** 10–15 minutes to fill. Download the form, fill in the blanks, send back.

---

## 2. Prepare the devices (1 hour)

**Devices needed:**
- **Primary:** Any modern Android 6+ device you're happy to reset (we'll do a full device wipe during testing)
- **Oldest supported:** An Android 6.0–6.1 device, or older if you have one (minimum API 23)
- Both should have ≥ 2 GB free storage

**Backup your data first.** The device acceptance script includes a backup step before anything destructive happens, but confirm your own backup is safe.

**Sign in to Google or Microsoft.** The test will set up automatic encrypted backups to your Drive/OneDrive folder.

**Time:** 30 min to reset devices + 30 min to verify they're ready.

---

## 3. Create a test backup folder (5 min)

**Where:** Google Drive or OneDrive (your choice)

**What:** Create an empty folder named (e.g.) `SaagarCC-Test-2026` where the app will automatically deliver encrypted backups during testing.

**Important:** Use a test account, not your personal one. Do not share this folder with anyone else.

**Time:** 5 minutes.

---

## The recovery passphrase (separate, secure channel)

Once you have two recovery custodians named, we'll send you a **12+ character passphrase** (letters, numbers, symbols). Each custodian should write it down and store it **offline** (desk drawer, safe, not email or shared storage). This passphrase is the only way to recover data from a backup if the device is lost.

**Do not share the passphrase in email or Git.** We'll send it via Slack DM, WhatsApp, or phone call.

---

## Timeline

| Step | Owner time | Engineering time | Duration |
|---|---|---|---|
| **1. Submit nominations form** | ✅ 15 min | Validate | 1 day |
| **2. Prepare devices & folder** | ✅ 1 hour | Build seeded APK | 1–2 days |
| **3. Device test pass begins** | ✅ Tester runs 69 cases | Monitor, triage defects | 5–7 days |
| **4. Legal/security reviews** (parallel) | ✅ Review policy pack, posture | Collate evidence | 3–5 days |
| **5. Staff UAT & incident rehearsal** (parallel) | ✅ Named staff run workflows | Support | 2–3 days |
| **6. Production signing custody** (parallel) | ✅ Name custodians, secure keystore | Prepare release | 1–2 days |
| **7. Final acceptance** | ✅ Review evidence, sign off | Build production APK | 1 day |

**Realistic total:** 2–3 weeks, depending on how many issues surface (expect 0–5 P1s).

---

## What happens during device test

**69 functional cases** across these modules:
- Core (shell, roles, persistence, settings, diagnostics)
- QMS (queue, intake, consent, follow-ups)
- Service (jobs, evidence, workflow, financial close)
- DSR (daily register, sessions, corrections, EOD sharing)
- Stock (movements, lock/reopen, variance, cross-module bridge)
- Expense (lifecycle, budgets, GST, month-lock, cash)
- Grooming (checklists, accountability, reporting)
- CRO (audit, auto-fill, targets, exceptions)
- Payroll (input, deductions, statutory, lock/approval)
- Leave (application, capacity, blackout, register)
- Tax (feed, evidence, CA pack, ZIP)
- Planning (create, targets, checklists, learning notes)
- Reports (accuracy, CSV/PDF parity)
- Security (export denial, approval path, sensitive display)
- Legal (rights, incident, identity evidence)

**Four critical drills:**
- **DAT-02:** Five encrypted saves must complete in < 3 seconds (total), with < 250 ms UI frame gap
- **BKP-03:** Automatic encrypted backups land in your Drive/OneDrive every 6 hours, verified by SHA-256
- **Cross-device restore:** Backup file transfers to a second device, decrypts with passphrase, data recovers exactly
- **Legacy migration:** If there's old plaintext data, it migrates and encrypts safely

---

## What we have ready for you

All documents below are in `verification/` directory on GitHub (branch `main`):

| Document | What it is |
|---|---|
| `PHASE-0-DEVICE-ACCEPTANCE-NOMINATIONS-FORM-2026-08-02.md` | **← START HERE** — form to fill |
| `PHASE-0-DEVICE-TEST-READINESS-CHECKLIST-2026-08-02.md` | Checklist to track readiness (we'll use this to confirm everything is ready) |
| `PHASE-0-CLOSURE-STATUS-AND-EVIDENCE-PACK-2026-08-02.md` | Detailed gate definitions (what "pass" means for each of the 69 cases + 4 drills) |
| `DEVICE-TEST-SCRIPT-BKP03-DAT02-RESTORE.md` | Exact step-by-step instructions the tester will follow |
| `SEED-APK-MODULE-WISE-TEST-READINESS-2026-07-29.md` | Full 69-case functional catalogue |
| `PHASE-0-ENGINEERING-PUBLISH-HANDOFF-2026-08-02.md` | What was engineered and how it's verified offline |

---

## Parallel work (doesn't block device test)

While the device pass is running, we'll start on **Phase 1** (the improvement programme: faster daily work, ETP verification layer, new compliance/control functions). Phase 1 needs three owner decisions from you (which we'll send separately), but it won't block device acceptance.

---

## Next step: Send us the nominations form

1. Download: `PHASE-0-DEVICE-ACCEPTANCE-NOMINATIONS-FORM-2026-08-02.md`
2. Fill in all sections (all fields required)
3. **Passphrase:** provide separately via Slack/WhatsApp/phone (not in the form)
4. Send the completed form to: [engineering contact]

**Once received, we'll confirm readiness with you and schedule the test start date within 3 business days.**

---

## Questions?

If anything is unclear, ask before filling the form. The clearer your input, the smoother the test.

Contact: [Engineering team Slack channel or DM]
