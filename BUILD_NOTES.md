# Saagar Control Centre — V5 Build Notes

**File**: `index_v5.html` (147 KB, drop-in replacement for `assets/public/index.html`)
**Internal version**: V5 · **APK build**: 1.2 · **App ID**: `com.saagartraders.bcc`
**Date**: 2026-05-17

---

## Critical analysis of the V1.1 APK (what the audit found)

### Architecture — working well, kept intact

* Single-shell-embeds-modules design is clever and offline-first. The 7 standalone HTMLs sit base64-encoded inside one `MODULES` array, decoded into an iframe on demand. Zero network calls, zero server.
* Daily auto-backup via Capacitor Filesystem writes to `Documents/SaagarBCC-Backups/` (90-day retention).
* postMessage bridge (`ST_BACK_HOME`, `ST_AUDIT`) is the right pattern. Every storage write inside a module is captured in `st_v4_audit_log` with before/after, actor and timestamp.
* Restore takes a rollback snapshot (`st_v4_restore_rollback_*`) *before* writing, so a bad restore is recoverable.
* Backup is whitelist-driven — only known Saagar keys leave the device. Other apps' localStorage is never exported.
* Admin PIN gates Payroll and Tax modules; staff view stays locked by default.
* Common Employee Master (`saagar_employee_master_v1`) feeds Payroll, Leave, and provides autocomplete in Grooming/Service/Cash.

### Problems found (all fixed in V5)

1. **UI dissonance.** The shell used Inter + radial glass-morphic gradients while every module inside used DM Serif Display + DM Sans + navy/gold. Worst of all, `injectUniformCSS` was **backwards** — it forced Inter onto modules instead of fixing the shell. → V5 adopts DM Serif/DM Sans + the navy `#0d2340` / gold `#b8922a` palette site-wide, and `injectUniformCSS` now *reinforces* the modules' own design language instead of overriding it.

2. **Desktop tabs on a phone app.** Top-row tabs ("Dashboard / Modules / Config") are a desktop pattern. → V5 uses a 4-tab bottom-nav (Home / Modules / Reports / Settings) with inline-SVG icons and a thumb-zone safe-area for Android gesture nav.

3. **Dev-speak labels.** "Whitelisted Saagar Traders keys", "Storage rules", "Detected app keys" appeared in user-facing dialogs. → All renamed to plain language ("Saagar Traders app data", "Stored data summary", "Detected staff").

4. **No daily aggregator.** Module Health was per-module but nothing told you what happened *today* across all modules. → New `buildTodayBrief()` rolls up stock-today, service-open, service-new, expenses+amount, cash-sheet status, grooming pass-rate, leaves today, tax-overdue/due-week, and backup-age into one card on Home.

5. **No reports tab.** The data was there — grooming pass rates, service ages, expense rollups, employee performance — but nothing surfaced it. → New Reports tab with 6 cards: Today's Snapshot, Employee Performance, Grooming Trend (30-day bar), Service Aging (0–3 / 4–7 / 8–15 / 16+ days), Expense Summary (this month by firm), Tax Compliance Status. Each card has a "Share to WhatsApp" button that builds plain text and uses native share.

6. **No employee performance view.** With grooming records (per-name pct), service records (ackBy/techName/delTech), and cash statements (filledBy), you could rank staff by activity — but nothing did. → V5 computes per-employee monthly groom %, service jobs handled, and cash statements filled, sorted by activity, with green/amber/red coloring.

7. **"Pending Attention" mixed good news with action items.** The V4 list said things like "Stock posted today ✓" right next to "5 overdue tax items" — created noise. → V5 attention list is action-items-only and capped at 6. Good news lives in the brief pills above.

8. **INTERNET permission was unnecessary.** App is fully offline, but `AndroidManifest.xml` declares `INTERNET`. → Removed in build steps below. (No code in shell or any module makes a network call.)

9. **No "restore yesterday" shortcut.** Auto-backup writes a daily file but the user had to know it was there. → Backup tab now shows the last auto-backup timestamp and folder; manual restore picker accepts those same daily files unchanged.

10. **Live clock on small screens wasted prime real estate.** The clock was 60px tall, top-right, taking space better used for today's headline numbers. → Removed. Date + greeting line is enough.

11. **4-char PIN is weak.** FNV-1a is not cryptographic. → Left as-is for now (offline-only threat model) but flagged for Phase-2: replace with Capacitor BiometricAuth + Argon2 fallback.

### What V5 does *not* change (deliberate)

* Same `MODULES` array schema → existing build pipeline works unchanged.
* Same localStorage keys (`saagar_*`, `gm_*`, `payroll_suite_v1_2026`, `leavedesk_v3`, `taxcal_v2`, etc.) → **existing user data is preserved verbatim**.
* Same `ST_BACK_HOME` / `ST_AUDIT` postMessage protocol → modules need no re-encoding.
* Same external script references (`auto-backup.js`, `html2pdf.bundle.min.js`, `whatsapp-share.js`) → keep these three files alongside `index.html`.
* Same Capacitor plugins (`@capacitor/filesystem`, `@capacitor/share`) → no plugin install needed.
* Same Admin PIN system, same protected-modules logic, same employee-master sync semantics.

---

## What changed at a glance

| Area | V1.1 | V5 |
|---|---|---|
| Font system | Inter (everywhere, forced) | DM Serif Display headings + DM Sans body (unified with modules) |
| Palette | Radial glass-morph blue-purple | Navy `#0d2340` + gold `#b8922a` (matches the skill) |
| Nav | Top tabs | Bottom nav (4 tabs) |
| Home headline | Live clock | Time-aware greeting + Today's Brief |
| Cross-module rollups | None | Reports tab (6 cards) |
| Attention list | Mixed signal | Action items only, capped at 6 |
| WhatsApp share | Per-module only | + One-tap "Share today's brief" + per-report sharing |
| Owner name | Hardcoded "Sagar" | Editable, persists in `st_v5_owner_name` |
| Plain-language labels | "Whitelisted app keys", "Storage rules" | "App data", "Stored data summary" |
| Internal version | V4 | V5 (visible pill + about page) |

---

## Drop-in build instructions

The V5 shell is a drop-in replacement. Your existing pipeline that base64-encoded modules into the V1.1 APK works unchanged.

### Step 1 — Replace the shell

```
src/index.html                 ← REPLACE with index_v5.html (rename to index.html)
src/auto-backup.js             ← keep as-is
src/whatsapp-share.js          ← keep as-is
src/html2pdf.bundle.min.js     ← keep as-is
```

The placeholder marker in the file is:

```js
const MODULES = /*__MODULES_INJECT__*/ [];
```

Your existing pipeline must replace `/*__MODULES_INJECT__*/ []` with the JSON array. Each entry needs:

```js
{ id, title, short, category, icon, priority, file,
  subtitle, summary, bytes, sha256, html_b64 }
```

### Step 2 — Manifest cleanup (optional but recommended)

In `android/app/src/main/AndroidManifest.xml`, the INTERNET permission can be removed since the app is fully offline:

```xml
<!-- Remove this line: -->
<uses-permission android:name="android.permission.INTERNET" />
```

This is a small but real privacy/Play Store hygiene win — Play Store flags unused permissions.

### Step 3 — Bump version

In `android/app/build.gradle`:

```gradle
versionCode 2          // was 1
versionName "1.2"      // was "1.0"
```

### Step 4 — Build

```bash
npx cap sync android
cd android && ./gradlew assembleRelease
```

Output APK: `android/app/build/outputs/apk/release/app-release.apk`

### Step 5 — Install over V1.1

The new APK preserves all existing user data because it uses identical localStorage keys. No migration script needed. Install via `adb install -r app-release.apk` or just open the APK on the device.

---

## Verification checklist (after install)

* [ ] Home opens to the Today's Brief card with date + 3 stat tiles
* [ ] Tap bottom-nav "Modules" → 7 module cards visible with category filter
* [ ] Tap bottom-nav "Reports" → 6 expandable cards, Today's Snapshot is auto-open
* [ ] Tap bottom-nav "Settings" → 5 subtabs (Staff master / Data & backup / Admin / Diagnostics / About)
* [ ] About tab shows shell version V5, APK build 1.2, 7 modules
* [ ] Existing modules open with the back-home FAB visible
* [ ] Existing data (employees, payroll rows, service jobs, expenses) all still present
* [ ] Tap "Share" on Today's Brief → Capacitor Share sheet opens
* [ ] Settings → Diagnostics → "Run diagnostics" returns 12 green checks
* [ ] Settings → Admin → Unlock with the existing PIN (unchanged from V1.1)

---

## Phase-2 roadmap (not built yet — recommendations only)

These are flagged because the V5 architecture is ready for them; they're independent and can be added incrementally:

### A) Local notifications (high value, low effort)

Add `@capacitor/local-notifications`, fire a 9 AM daily reminder if `buildTodayBrief().stockToday === 0`:

```bash
npm install @capacitor/local-notifications
npx cap sync android
```

```js
// in a new notify.js
import { LocalNotifications } from '@capacitor/local-notifications';
await LocalNotifications.schedule({
  notifications: [{
    title: 'Stock not posted yet',
    body:  'Tap to open Stock Register',
    id: 1,
    schedule: { on: { hour: 9, minute: 0 }, allowWhileIdle: true, repeats: true }
  }]
});
```

Similar nudges for cash sheet (12 PM) and grooming (10 AM).

### B) Biometric unlock (replaces 4-char PIN for admin)

Add `capacitor-native-biometric`:

```bash
npm install capacitor-native-biometric
```

Wrap `unlockAdmin()` so fingerprint or face unlock succeeds before the PIN prompt fires. PIN stays as fallback.

### C) Encrypted backups

The current backup JSON is plaintext. For B2B retention, AES-GCM encrypt with a device-specific passphrase the owner sets once. WebCrypto API is available in the Capacitor WebView.

### D) App shortcuts on launcher long-press

Android shortcuts pointing directly to common actions: "New service job", "Today's grooming", "Cash sheet". Edit `android/app/src/main/res/xml/shortcuts.xml`.

### E) Multi-store filter at the shell level

Currently every module knows its own store. If you ever run more than 2 firms together, a top-bar segmented control ("Titan World / Helios / Both") filtering down into modules would scale. The architecture supports it — modules already read firm codes (`GM`, `SAT`, `STB`, `AS`).

### F) Migrate the shell from raw HTML to Lit/Stencil

The shell is ~2,600 lines; once it grows past ~4,000 it'll get hard to maintain. Not urgent, but a webcomponents framework would help. Modules stay as standalone HTMLs regardless.

---

## File inventory

* `index_v5.html` — the new shell. 2,591 lines. ~148 KB.
* `auto-backup.js`, `html2pdf.bundle.min.js`, `whatsapp-share.js` — keep your existing copies.
* `BUILD_NOTES.md` — this file.

The V5 shell has been validated end-to-end in a headless DOM (jsdom): 0 errors, all 4 views render, all 6 report cards generate, diagnostics returns 12 passing checks, snapshot text generation works.
