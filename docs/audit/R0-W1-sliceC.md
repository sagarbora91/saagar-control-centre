# R0-W1 Slice C — PIN policy + escalating-backoff lockout (SEC-03)

**Programme:** Track A · R0 (Data Safety & Access Control) · Wave R0-W1 (Named Access) · **Slice C of 4** (the brick-risk slice).
**Status:** SHIPPED. **COMMITTED + PUSHED `origin/main = 697a524`** + seeded APK `Retail/SaagarCC-DemoData-R0-W1-SliceC.apk`
(6.85 MB; packaged index.html SHA256 `84ff1bd8…` byte-exact vs seeded source, mojibake-clean).
**DEVICE-TEST PENDING** (auth; the lockout counter is localStorage-only so more device-robust than B's prompt() path, but the SM-login fix + lock UX want an on-device look).
**Base:** `origin/main = a68a1f0` (Slice B) → `697a524`. File: `www/index.html` only.

## What shipped

**Owner sign-offs (2026-07-17):** attempt-key device-local (OUT of appControlKeys + IN restoreBlockedKeys — rule-bend);
lockout params **5 fails · 30s/1m/2m/5m ladder · cap 5 min**.

**Lockout core (layered AROUND verifyPin/verifyStaffPin — never rewrites them):**
- `pinPolicy()` — reads `st_v2_pin_policy_v1`, **clamps every field on every read** (minLen 4..12, maxFails 3..10,
  baseLockSec 10..300, maxLockSec **hard-capped 300**). A tampered/restored policy can never extend a lock past 5 min.
- `pinLockRemaining(scope)` / `recordPinFail(scope)` / `recordPinSuccess(scope)`. **FAIL-OPEN P0:** both lock-check and
  fail-count early-return unless the scope actually HAS a PIN → onboarding / PIN-cleared / restored-without-PIN devices
  can NEVER lock. Clock-tamper clamp (remaining > maxLockSec ⇒ treat expired; future lastFailAt ⇒ discard); 24h age-out.
  Ladder: `over>=3 ? maxLockSec : min(maxLockSec, baseLockSec*2^over)` ⇒ 30/60/120/300/300. Never permanent.
- Wired into the **4 interactive PIN sites**: `promptVerifyOnly` (so Slice B's `SaagarReauth` + all 3 export gates +
  role-raise inherit the admin lockout, **no double-count** — one user entry = one fail), `unlockAdmin` (onboarding
  branch stays counter-free), `changeAdminPin`, `staffSignInPick` (per-staffer `staff:<id>` scope, gate INSIDE the
  hasStaffPin branch). Lock checked BEFORE prompting (no prompt-then-deny); `promptVerifyOnly` returns false while
  locked, **never throws** (a throw would fail-open through SaagarReauth's catch and bypass the lock).

**Min-length:** the two hardcoded `<4` checks (promptNewPin, manageStaffPins) now read `pinPolicy().minLen` (default 4 =
byte-identical). SET time only, never at verify.

**UI (minimal):** owner clears a locked staffer from `manageStaffPins` (confirm dialog); locked staff show ` ⛔`
(else ` 🔑`) in the sign-in dropdown. No PIN-policy editing UI this slice (defaults apply; OPEN ITEM).

**Storage:** `st_v2_pin_attempts_v1` → restoreBlockedKeys + APP_RE (auto st_v\d+_) + DELIBERATELY NOT appControlKeys
(never exported — the rule-bend, closes lockout-injection). `st_v2_pin_policy_v1` → appControlKeys + APP_RE +
validateRestoreKeyValue shape-check (object-only; clamping lives in pinPolicy()).

## Adversarial (8 skeptics, 529K tok): 0 P0, 1 P1, 2 P2 — folded + re-verified
The lockout core survived every hunt (permalock, onboarding-brick, bypass, double-count, storage, regression,
state-machine all CLEAR). Folded:
- **P1 — dsr/stock blob `smPassOk` verified the admin PIN RAW, outside the lockout.** Two bugs: (1) un-throttled
  brute-force around Slice C's own control; (2) **pre-existing — SM login silently BROKEN on every v2-salted device**
  (`String(h>>>0)` can never equal a `"v2:"` stored value). Fix: new shell `window.SaagarAdminPinCheck(pw)` routes both
  blobs' `smPassOk` through `verifyPin` (correct v2+legacy+migration) + admin lockout + audit; original raw check kept as
  the fail-open fallback (older shell / standalone). Re-verified in-harness: `smPassOk('<v2 pin>')` now TRUE in both dsr &
  stock iframes (was structurally impossible), wrong tries count into admin scope, locked scope denies a correct PIN,
  version-skew falls back cleanly. **SM login now works on modern devices.**
- **P2 — `clearStaffPin` now clears the parked lockout counter** (a re-issued PIN starts fresh).
- **P2 (SKIPPED, pre-existing Wave-6)** — `changeAdminPin` onboarding double-flow (create PIN → immediately asked for it):
  cosmetic UX, counter-safe, risky to touch at ship. Left for a later pass.

## Harness (0 console errors) — 11 assertion groups + fold re-verify
No-PIN never locks (P0); 4 fails arm nothing, 5th arms ≤30s and BLOCKS the prompt (no prompt call); ladder exactly
[30,60,120,300,300]; success clears; clock-tamper + stale age-out; staff/admin scope isolation; SaagarReauth/exports
inherit admin lockout no double-count; restore rejects attempts + accepts+clamps policy; APP_RE covers both keys;
policy defaults {4,5,30,300}; smPassOk v2-correct→true (dsr+stock), wrong→count, locked→deny, skew→fallback; clearStaffPin clears.

## Regression footprint (vs HEAD a68a1f0)
Shell = the 11 Slice-C hunks + SaagarAdminPinCheck + clearStaffPin 1-liner. Blobs changed = **dsr, stock** (SM-login fix)
+ **expense** (the module-local `audit()` array-coercion — twin of the Slice A brick vector, superseded the spawned
task chip). Other 8 blobs byte-identical.

## Remaining
- **Slice D** — app-launch PIN lock (P1-37): DOM keypad overlay (no prompt()), reuses the admin PIN, opt-in
  `st_v2_launch_lock` default OFF, effective gate `hasAdminPin() && launchLockEnabled()`. **The R0 go/no-go — cannot be
  validated on harness alone; hard device gate.** After D, R0-W1 is complete and the whole wave wants an on-device pass.
