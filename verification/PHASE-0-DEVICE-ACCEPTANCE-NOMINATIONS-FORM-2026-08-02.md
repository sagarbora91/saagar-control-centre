# SAAGAR Android — Phase 0 Device Acceptance Nominations Form

**Prepared:** 2026-08-02 (Asia/Calcutta)
**Due to:** Engineering team before device test start  
**Purpose:** Collect owner nominations required to begin the Phase 0 device acceptance run (69-case functional catalogue + four device drills).

---

## What this form does

Phase 0 engineering is code-complete and merged to main. The next step is **physical device testing**: 69 functional cases across 15 modules (QMS, Service, DSR, Stock, Expense, Grooming, CRO, Payroll, Leave, Tax, Planning, Reports, Security, Legal, Core) plus four critical drills (DAT-02 performance, BKP-03 backup delivery, cross-device restore, legacy migration).

**These drills cannot start without your nominations below.** The device, tester, and provider names are placeholders in our test script; you supply the real ones here.

---

## Section 1: Test devices

### Primary device

**Use for:** Main functional catalogue, DAT-02 five-save, BKP-03 provider delivery, cross-device restore source.

| Field | Your input |
|---|---|
| **Device model** (e.g., Samsung Galaxy A12, Xiaomi Redmi Note 10) | ________________ |
| **Android version** (must be 23 or higher) | Android _____ (API ___) |
| **RAM** (GB) | _____ GB |
| **Free storage available** (at start of test) | _____ GB |
| **Any special configuration?** (e.g., rooted, developer mode on) | ☐ None · ☐ Describe: ________________ |

### Oldest supported device (API 23 class)

**Use for:** Repeat of DAT-02, BKP-03, cross-device restore delivery, and legacy migration drill. Proves Phase 0 works on the minimum Android version (API 23).

| Field | Your input |
|---|---|
| **Device model** (e.g., older Redmi, Moto G series from 2019–2020) | ________________ |
| **Android version** (must be 23 or higher; preferably close to that floor) | Android _____ (API ___) |
| **RAM** (GB) | _____ GB |
| **Free storage available** (at start of test) | _____ GB |
| **Any special configuration?** | ☐ None · ☐ Describe: ________________ |

---

## Section 2: Backup provider and recovery custody

### Off-device backup provider

**Use for:** BKP-03 drill. The app will deliver encrypted `.sccbak` files to this folder. **Do not use a personal cloud account shared with others; create a dedicated test folder in Google Drive or OneDrive.**

| Field | Your input |
|---|---|
| **Provider class** | ☐ Google Drive · ☐ OneDrive · ☐ Other: ________________ |
| **Account holder name** (person, not email; e.g., "Sagar Bora") | ________________ |
| **Folder name** (path in the provider where backups will land; e.g., "SaagarCC-Test-2026") | ________________ |
| **Account ownership confirmed?** | ☐ Yes, I own this account and folder |
| **Folder is empty and ready?** | ☐ Yes |

### Recovery passphrase custodians

**Use for:** Cross-device restore drill (Section D of the device test script). Each custodian keeps a written copy of the passphrase outside this repo, outside email, outside shared storage. If the device is wiped, the custodian provides the passphrase to recover data.

**Required:** passphrase must be at least 12 characters (letters, numbers, symbols OK; share with us in a separate secure channel, NOT in this form or Git).

| Role | Custodian 1 | Custodian 2 |
|---|---|---|
| **Name** | ________________ | ________________ |
| **Role** (e.g., Owner, Manager, Admin) | ________________ | ________________ |
| **Contact** (phone or email, outside this repo) | ________________ | ________________ |
| **Passphrase kept where?** (e.g., "in my desk drawer", "in a password manager") | ________________ | ________________ |

**Passphrase itself:** SUPPLIED SEPARATELY via secure channel (Slack direct message, WhatsApp, phone call, or physical handoff). Do not paste it into this form.

---

## Section 3: Human roles and evidence ownership

### Tester and observers

| Role | Name | Title/Role | Contact |
|---|---|---|---|
| **Primary device tester** (person who will run the 69 cases + drills on the primary device) | ________________ | ________________ | ________________ |
| **Secondary device tester** (person who will run drills on the API-23 device) | ________________ | ________________ | ________________ |
| **Evidence owner** (person who records screenshots, timings, and results; files evidence) | ________________ | ________________ | ________________ |

### Approvers and gatekeepers

| Role | Name | Title/Role | Contact |
|---|---|---|---|
| **Privacy/legal reviewer** (person who confirms the privacy/policy pack is acceptable) | ________________ | ________________ | ________________ |
| **Security owner** (person who verifies posture checks and root/debug controls) | ________________ | ________________ | ________________ |
| **Production signing key custodian 1** (person who will hold/manage the prod keystore) | ________________ | ________________ | ________________ |
| **Production signing key custodian 2** (backup; recovery process) | ________________ | ________________ | ________________ |

---

## Section 4: Data and timeline

### Device test data volume

**Question:** DAT-02 drill requires five encrypted saves at "representative data volume." The seeded APK has demo data (~5–10 MB database). Real shop data is likely ~10–15 MB or larger.

| Option | Your choice |
|---|---|
| ☐ Run DAT-02 on demo data only (smaller, faster, but may not represent real load) | |
| ☐ Run DAT-02 on a device with real restored shop data (more representative) | If yes: When can real `.sccbak` be restored onto the test device? ________________ |
| ☐ Run DAT-02 on both (demo first as a smoke test, then real data for final gate) | |

### Timeline

| Milestone | Proposed date |
|---|---|
| **Nominations submitted to engineering** | ________________ |
| **Test devices ready** (both devices reset, ready to receive seeded APK) | ________________ |
| **Backup provider account set up and empty** | ________________ |
| **Recovery passphrase delivered to custodians** | ________________ |
| **Test pass begins** (69-case catalogue, starting with CORE-01..06) | ________________ |
| **Drills A–D complete** (if no P0/P1 defects encountered) | ________________ |
| **Evidence packaged and sent to legal/security reviewers** | ________________ |

---

## Section 5: Known constraints and acknowledgements

**Check each box to confirm you understand:**

- ☐ **The debug APK is not production-signed.** If Phase 0 passes, a new production-signed APK will be built only after production keystore custody is established outside Git.
- ☐ **Device drills are destructive.** We will reset the devices, perform wiped-device restore, and otherwise alter data. Ensure any real device data is backed up first (the device test script includes a pre-drill backup step).
- ☐ **BKP-03 runs only when the app is open or during active sessions.** Android does not run background jobs for the WebView while the app is closed. This is a design limitation, not a defect.
- ☐ **DAT-02 measures on the current data volume.** If demo data is used, a subsequent production acceptance may require re-running DAT-02 with real data.
- ☐ **Phase 0 acceptance gates are cumulative.** No P0/P1 defect can be accepted without a targeted fix and re-test of the affected cases. Phase 0 is not complete until all 69 cases, all four drills, legal approval, security posture, staff UAT, and incident rehearsal are evidenced.
- ☐ **Passphrases and signing keys stay outside Git.** Recovery passphrases and production keystore material must never be committed or emailed; they are communicated via separate secure channels.

---

## How to return this form

1. **Print or download** this form.
2. **Fill in all sections** (all fields are required).
3. **Passphrase:** supply in a **separate message** via Slack DM, WhatsApp, or phone call. Do NOT paste into this form or email.
4. **Send this completed form** to: [engineering contact / Slack channel]
5. **Timeline:** we will schedule the test pass start date within 3 business days of receiving this.

---

## Reference documents

If you have questions while filling this form, refer to:

- **Phase 0 closure checklist:** `verification/PHASE-0-CLOSURE-STATUS-AND-EVIDENCE-PACK-2026-08-02.md` (detailed acceptance gates)
- **Device test script:** `verification/DEVICE-TEST-SCRIPT-BKP03-DAT02-RESTORE.md` (exact drill steps)
- **69-case catalogue:** `verification/SEED-APK-MODULE-WISE-TEST-READINESS-2026-07-29.md` (all functional cases)
- **Phase 0 engineering handoff:** `verification/PHASE-0-ENGINEERING-PUBLISH-HANDOFF-2026-08-02.md` (what's implemented)

---

## Questions?

If anything in this form is unclear, ask before filling it out. The more specific your nominations, the smoother the test pass will run.
