# Device test script — BKP-03 delivery · DAT-02 five-save · cross-device restore

**Purpose:** close the three physical-device gates left PENDING by
`verification/BKP03-DAT02-API23-2026-07-29.md` and `verification/R0-R1-CLOSEOUT-2026-07-29.md`.
**Build under test:** `Retail/SaagarCC-DemoData-v2.9.apk` — versionCode 209, versionName 2.9, `com.saagartraders.bcc`,
minSdk 23, targetSdk 34, at-rest encryption ON, `allowBackup=false`, **demo-seeded**, **debug-signed**.
**Run on BOTH accepted devices** (primary + the older API-23-class device). Record every row; a blank row is a fail.

---

## 0. Before you start (do not skip)

1. **Take a fresh off-device backup of any device holding real data.** Drills C and D are destructive.
   Settings → Backup & restore → **Back up → Share to Drive** → save to Drive. Confirm the file exists in Drive.
2. Note the tester name, device model, Android version, and free storage for each device.
3. Have ready: a Drive/OneDrive account signed in on the device, and a **recovery passphrase of at least 12 characters**
   (the app rejects shorter). Write it down — a `.sccbak` cannot be opened without it.
4. Expect **Admin PIN + fresh re-authentication prompts** on every export/share action. That is the R0-W4 control
   working, not a fault.

> **Where everything lives:** Settings → **Backup & restore** (buttons: Create encrypted backup · Set up automatic
> off-device backup · Run automatic backup now · Back up → Share to Drive · Restore from file · Restore from device
> backup) and the **Storage performance acceptance (DAT-02)** card directly beneath it.

---

## Drill A — DAT-02 five-save storage performance

**Gate:** five real encrypted saves must meet all three p95 limits.
**Thresholds (from `www/persistence-acceptance.js`, authoritative):** samples **5** · export p95 **≤ 150 ms** ·
visible frame gap p95 **≤ 250 ms** · total save p95 **≤ 3000 ms**.

| # | Step | Expected | Result |
|---|---|---|---|
| A1 | Open the app, let it finish loading, leave it in the foreground | App idle, no spinner | |
| A2 | Settings → Backup & restore → **Run DAT-02 device test** | Runs five saves, then shows accepted/rejected with the three p95 numbers | |
| A3 | Record the three p95 values verbatim | export ___ ms · frame ___ ms · total ___ ms | |
| A4 | Verdict shown by the app | **ACCEPTED** on both devices | |
| A5 | Repeat A2 once more (stability) | Same verdict, comparable numbers | |

**⚠ Data-volume caveat — read before accepting.** The roadmap criterion is five saves **at the agreed real data
volume**. This APK carries the *demo* seed, which is smaller than a mature shop dataset (the encryption work sized a
real DB at roughly 10–15 MB). A pass on demo data does **not** by itself satisfy DAT-02. Do one of:
- **(preferred)** run A1–A5 on a device carrying representative real shop data, or
- confirm in writing that the demo volume ≥ your real volume, or
- restore a real `.sccbak` onto the test device first (Drill C), then run Drill A.

Record which option you used: ________________

**If a device fails:** stop and report the numbers. Per the verification record, a failure on either device reopens the
worker/storage-engine rewrite — it is not a tuning exercise. Also note honestly: `db.export()` is still synchronous;
passing this gate does **not** mean the export moved off the main thread.

---

## Drill B — BKP-03 automatic off-device backup (provider delivery)

**Gate:** a real provider/account delivery, plus proof it fails closed when the provider is unavailable.

| # | Step | Expected | Result |
|---|---|---|---|
| B1 | Settings → Backup & restore → **Set up automatic off-device backup** | Android folder picker opens (Storage Access Framework) | |
| B2 | Pick a Drive/OneDrive folder; grant access | App reports the folder is connected; status box shows the folder label | |
| B3 | Enter the recovery passphrase (≥ 12 chars) | Accepted; short passphrases rejected | |
| B4 | Tap **Run automatic backup now** | Completes; status shows a successful dated delivery | |
| B5 | Open Drive/OneDrive on a computer and locate the file | A `.sccbak` file is present in the chosen folder | |
| B6 | Open that file in a text/hex viewer | **Unreadable ciphertext** — no names, amounts, or JSON visible | |
| B7 | Confirm nothing else was written | No plaintext `.json` companion, no raw `.sqlite` alongside it | |
| B8 | Repeat **Run automatic backup now** several times over the retention window | Old copies pruned on the daily/weekly/monthly pattern, not endlessly accumulating | |
| B9 | **Failure path:** turn off Wi-Fi/data (or revoke the folder permission in Android settings), then Run automatic backup now | Fails **closed** with a clear message; no partial/plaintext file appears | |
| B10 | Leave it failing and re-open the app after 36 h (or advance device date) | The 36-hour backup-failure escalation state is displayed | |
| B11 | Restore connectivity/permission and run again | Recovers; escalation state clears | |

**Record explicitly (stated limitation):** automatic delivery runs *on first app use of the day and during long
sessions*. **Android does not run this while the app is closed.** Confirm the owner understands and accepts this:
________________

**Privacy check (B12):** the provider URI stays in native Android preferences; the app should only ever display a
folder label, never a full path/account string. Confirm no account identifier is shown in the UI: ________

---

## Drill C — Cross-device `.sccbak` restore

**Gate:** a portable backup restores onto a *different* device with its passphrase, and the device-bound private
snapshot is correctly refused there.

| # | Step | Expected | Result |
|---|---|---|---|
| C1 | On device 1: Settings → **Create encrypted backup**; save/share the `.sccbak` off-device | File created; PIN + re-auth demanded | |
| C2 | Move that file to device 2 (Drive, cable — not the app's private folder) | File present on device 2 | |
| C3 | On device 2: Settings → **Restore from file** → pick the `.sccbak` | Passphrase prompt appears | |
| C4 | Enter a **wrong** passphrase | Refused clearly; nothing restored | |
| C5 | Enter the correct passphrase | Preview appears: source device, store, date, version, control totals | |
| C6 | Compare preview totals against device 1 | Totals match | |
| C7 | Accept the restore | Staged restore runs; readback verification passes; owner acceptance totals shown | |
| C8 | Spot-check real data (a DSR day, a customer, a payroll month) | Matches device 1 | |
| C9 | **Tamper test:** edit one byte of a copy of the `.sccbak`, then restore it | Rejected/quarantined — never partially applied | |
| C10 | **Device-bound check:** try to use device 1's *private* snapshot (not the `.sccbak`) on device 2 | Refused with a clear reason — private snapshots are device-bound by design | |
| C11 | Confirm rollback path exists | After C7, a verified rollback backup is present | |

---

## Drill D — Legacy migration (only if a device still holds pre-encryption data)

| # | Step | Expected | Result |
|---|---|---|---|
| D1 | Install this build over a device with plaintext DATA history | App opens, all data intact | |
| D2 | Let it run; check Settings → Diagnostics | Encryption state reports `encrypted-keystore…`; DB migrated to ciphertext | |
| D3 | Confirm sidecar/legacy cleanup | Old plaintext artifacts removed as designed | |

---

## Evidence to paste back

Copy this block, filled in, into `verification/R0-R1-CLOSEOUT-2026-07-29.md` (PENDING table) and
`verification/BKP03-DAT02-API23-2026-07-29.md`:

```
Device test — build 2.9 (vc209), <date>, tester <name>
Device 1: <model>, Android <ver>   Device 2: <model>, Android <ver>
DAT-02  device 1: export p95 __ms / frame __ms / total __ms → ACCEPTED|REJECTED  (data volume: demo|real|restored-real)
DAT-02  device 2: export p95 __ms / frame __ms / total __ms → ACCEPTED|REJECTED  (data volume: demo|real|restored-real)
BKP-03  provider delivery: PASS|FAIL   ciphertext verified: yes|no   pruning: PASS|FAIL
BKP-03  fail-closed + 36h escalation: PASS|FAIL
BKP-03  closed-app limitation acknowledged by owner: yes|no
Restore cross-device: PASS|FAIL   wrong-passphrase refused: yes|no   tamper rejected: yes|no
Private snapshot correctly refused on device 2: yes|no
Legacy migration (if applicable): PASS|FAIL|N/A
Notes / anomalies:
```

---

## What these drills do NOT prove

State plainly in any sign-off:

- **Not a production release.** This APK is debug-signed. Production signing, key custody (two named custodians) and
  the signed-release verification are separate PENDING gates.
- **No protection on a rooted or running device.** Encryption protects data copied *off* the device.
- **Key fragility is real.** Uninstall, factory reset, or a lock-screen credential change destroys the hardware key and
  makes the on-device ciphertext unrecoverable — the off-device `.sccbak` is then the only recovery. This is exactly
  why Drill B/C matter.
- **DAT-02 says nothing about threading.** `db.export()` remains synchronous.
- **Still separately pending:** root/debug/ADB posture matrix on a *production-signed* build, staff UAT, legal/owner
  approval of the policy pack, and the timed incident rehearsal.
