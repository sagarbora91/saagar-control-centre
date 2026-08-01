# Wave 6 — Security & Multi-User (the last P0 cluster)

**Date:** 2026-07-04 · **Base:** `origin/main = 06ce538` (Wave 4) · **Status:** ✅ **COMMITTED + PUSHED
`origin/main = 7249df1`** (batched with Wave 5) · seeded APK `SaagarCC-DemoData-V6-Wave6.apk` (6.41 MB, verified
mojibake-clean: 0 U+FFFD, 0 W-1252 artefacts, 7502 emoji intact) built in Retail root · device-test pending.
The 5 remaining Security P0s
from the roadmap register + the audit-deferred SEC-PIN items. Specs by a 5-agent workflow → **implemented serially
by the orchestrator** (shell auth code = ONE file `www/index.html`, which the hard rule forbids parallel writers on)
→ **6-agent adversarial verify**. Additive-only, no new libs, offline. Builds ON the shipped SEC-PIN-01/02/04.

## The 5 features (all in the shell `index.html` auth surface)
| # | Feature | What | Verdict |
|---|---|---|---|
| SEC-PIN-05 | **Owner onboarding** | `unlockAdmin`'s no-PIN branch now requires a deliberate owner `confirm()` (+ optional owner name) instead of an opportunistic tap; first PIN create marks `OWNER_SETUP_KEY`; a first-run banner nudges the owner. | HOLDS |
| SEC-PIN-06 | **Role-switch PIN gate** | `setCurrentRole` blocks a non-admin **raising** to a higher-privilege role without the admin PIN (verify-only — staff stays staff; owner never blocked; lowering is free). `roleRank` from immutable defaults (not gameable). Role-access matrix editor is now `.adminOnly` + `isAdmin`-guarded. | WEAK→ see note |
| SEC-PIN-07 | **Admin auto-lock** | Admin auto-clears after idle (default 5 min, owner-configurable, "Never" opt-out) and on background/tab-hide (also signs the staffer out). The change-PIN re-verify half was already landed. | HOLDS |
| #28 | **Named-staff attribution** | Optional per-staff sign-in (from the Employee Master) with an optional per-person PIN (`pinHashV2`), so audit-log actions are attributed by name. **ATTRIBUTION ONLY — never touches `isAdmin`/`currentRole`.** Scoped additive layer, not a full login overhaul. | HOLDS |
| #30 | **Backup export gate + audit** | `exportBackup`/`shareBackup`/`exportMigration` now require the admin PIN + log a denied crumb; the shared writer `exportBackupConfirmed` also guards `isAdmin` (defence-in-depth vs a direct console call). Owner migration stays usable; the pre-reset safety backup untouched. | HOLDS |

**Cross-cutting hardening:** `restoreBlockedKeys` now also rejects `CURRENT_ROLE_KEY` + `ROLE_ACCESS_KEY` +
`STAFF_PIN_KEY` (a tampered backup can't pre-escalate the device role, open the matrix, or plant staff PINs).
New keys: `st_v2_owner_setup_v1`, `st_v2_admin_idle_min`, `saagar_staff_pins_v1`, `saagar_active_staff_v1`,
`saagar_role_switch_lock_v1` — all optional; absent ⇒ today's exact behavior.

## Adversarial verification (6 skeptic agents, each trying to BREAK one control)
- **5/6 HOLD** (SEC-PIN-05, SEC-PIN-07, #28, #30, cross-cutting-additive) at high confidence. No privilege bypass,
  no regression to SEC-PIN-01/02/04, genuinely additive.
- **SEC-PIN-06 = WEAK**, one real finding: `currentRole()` fails **open** — a missing/invalid `CURRENT_ROLE_KEY`
  resolves to `Store Manager` (all modules), and the gate lives only in `setCurrentRole`'s transition, so a
  **console-capable** staffer can `localStorage.removeItem('saagar_current_role_v1')` + reload to reach every
  non-protected module (no PIN, no crumb). **Decision:** the gate DOES close the actual SEC-PIN-06 threat (the
  casual unauthenticated dropdown-flip); the console-deletion vector is the same inherent limitation as SEC-PIN-03
  (an offline WebView with dev-tools can defeat any client gate — that staffer could also call `setAdmin(true)`).
  A fail-safe `currentRole()` default (`Others`) was **rejected** because it locks out fresh/existing installs
  (the "fresh device is never locked out" invariant) and the deletion vector re-opens via any self-heal. Instead:
  honest UI copy on the Current-role card ("roles are a convenience filter … not a security boundary; Payroll & Tax
  stay PIN-protected"), matching the SEC-PIN-03 posture. Payroll/Tax stay behind the independent `protectedModules` PIN.
- **Two cheap hardenings applied from the pass:** (a) `pagehide` now respects the owner's "Never" choice
  consistently with `visibilitychange`; (b) `exportBackupConfirmed` guards `isAdmin` so a direct console call to the
  shared writer is blocked + audited (all legit callers are post-gate, so no double-prompt).

## Verification
- **Browser harness (seeded):** shell boots **0 console errors** after all 20 edits + 3 fixes. Functional:
  staff attribution (audit actor = signed-in name), background auto-lock clears admin + signs staff out, export gate
  logs `backup.export.denied` (UI + direct), `restoreBlockedKeys` includes role/staff keys, `roleRank` correct,
  Settings security panel renders (staff picker 16 opts, auto-lock select, owner banner, matrix card `.adminOnly`).
- **Adversarial:** 6 agents, results above.
- Harness re-sync is **byte-safe** (`.NET ReadAllText/WriteAllText(UTF8)`), 0 mojibake — per [[harness-utf8-encoding-caution]].

## Roadmap status after Wave 6
**The register's entire P0 tier (32 items) is now cleared.** Remaining: 55 P1 + 32 P2 + 75 quick-wins, and the 6
cross-cutting themes (two-store topology being the biggest, and partly PHP/MariaDB-rebuild territory).
