# R0-W1 Slice D — App-launch PIN lock (P1-37) — R0-W1 COMPLETE

**Programme:** Track A · R0 (Data Safety & Access Control) · Wave R0-W1 (Named Access) · **Slice D of 4 — the wave is
now COMPLETE.** **THIS SLICE IS THE R0 GO/NO-GO** — it cannot be validated on harness alone; the owner's on-device
pass is the hard gate for all of R0 (and unlocks R0-W2).
**Status:** SHIPPED. **COMMITTED + PUSHED `origin/main = 32672c1`** + seeded APK `Retail/SaagarCC-DemoData-R0-W1-SliceD.apk`
(6.86 MB; packaged index.html SHA256 `90164b12…` byte-exact vs seeded source, mojibake-clean).
**Base:** `697a524` (Slice C) → `32672c1`. `www/index.html` only (+154/−2); all 4 blob lines byte-identical.

## What shipped
Full-screen DOM keypad overlay `#st-v5-launch-lock` — **deliberately ZERO prompt()** (sidesteps the Slice B WebView
suppression risk entirely):
- **Paint early, decide late:** raw-literal IIFE right after the boot splash paints the overlay synchronously at parse
  when `st_v2_admin_pin_hash` present AND `st_v2_launch_lock='1'`; `reEvalLaunchLock` re-decides under
  `SaagarStore.whenReady` (+8s backstop) against authoritative MEM/DB — hides on a restore-blocked-PIN device (fail-open),
  shows + focuses when genuinely armed.
- **Verify-only** on the admin PIN (`verifyPin`) — dismissing NEVER touches `isAdmin`. In-memory per-process unlock;
  every cold boot re-locks. COLD START only (resume re-lock = SEC-04 idle-lock's job).
- **Slice C inheritance:** `pinLockRemaining('admin')` checked BEFORE verify; live "Try again in Xs" countdown in-overlay;
  `recordPinFail/Success` — same admin scope as unlock/re-auth, ≤300s, never permanent.
- **Containment:** hardware Back = minimize/exit (`handleHardwareBack` step 0); ALL shell keyboard shortcuts dead while
  locked (bubble-handler first-line guard); capture-phase keydown owns digits/Enter/Backspace/Tab; full-screen at max
  z-index, later DOM sibling than the splash (wins the z-tie); no Esc/tap-outside dismissal.
- **Settings:** admin-gated "Lock app at launch" card; `setLaunchLock` refuses ON without a PIN; honest copy that the
  admin PIN is the only credential and forgetting it means resetting app data.
- **Storage:** `st_v2_launch_lock` → appControlKeys + boolean-ish restore validator ('1'/'0'/'true'/'false'/boolean —
  only '1' arms; everything else reads OFF = fail-open); APP_RE `st_v\d+_` covers it; NOT restoreBlockedKeys (deliberate:
  restored ON + restore-blocked PIN = `hasAdminPin()` false = opens straight through).

## Adversarial (6 skeptics + triage, 464K tok): 0 P0, 1 P1, 2 P2 — folded + re-verified
Brick/bypass/boot-race/regression/storage hunts all CLEAR. Folded:
- **P1 — ORPHANED-SALT BRICK:** if `st_v2_pin_salt` is lost while the `v2:` hash survives (partial WebView storage
  eviction), `pinSalt()` silently regenerates → the correct PIN can never verify again → with the lock armed, an
  **undismissable overlay**. (Pre-existing flaw in Slice C's admin unlock; Slice D escalated blast radius from
  "admin locked" to "app unopenable.") **Fix:** heal-on-detect in `reEvalLaunchLock` (orphaned hash dropped +
  `security.pinHashOrphaned` audited — all PIN sites fail open on no-PIN) + mirrored condition in the paint IIFE.
  Verified: orphan → healed + hidden; valid hash+salt → untouched + lock shows. **Follow-up for a later pass:** embed
  the salt in the stored record (`v3:<salt>:<digest>`) so hash+salt can never diverge.
- **P2:** empty OK/Enter burns no lockout attempt ("Enter your Admin PIN" message). **P2:** overlay scrollable on
  short/landscape viewports (`overflow-y:auto` + flex-start + auto margins).
Deferred P2 polish (owner backlog): overlay a11y (aria-live/labels), forgotten-PIN copy naming the Android
clear-storage route, text-size/i18n on the overlay (consistent with splash), keypad pressed-state.

## Harness (0 console errors)
16 assertion groups: default hidden; fail-open no-PIN (incl. flag-ON restore scenario); armed paint-early on cold load;
literal sync; wrong PIN counts admin scope once; lockout blocks verify + live countdown; correct PIN dismisses WITHOUT
elevating; splash-hide isolation; flag-off re-eval hides; hardware-back minimizes + modal untouched; Ctrl+S dead;
physical keys + Enter; toggle refuses ON without PIN; storage placement + validator; fold re-verify (orphan heal both
directions, empty-submit guard, scroll fix).

## DEVICE-ONLY LIST (the R0 go/no-go — cannot be proven on harness)
1. Overlay paints before/with first frame on the real WebView cold boot; no shell flash; no soft-keyboard pop.
2. Hardware/gesture Back while locked actually minimizes; double-press timing.
3. Resume-from-background locked/unlocked states; process-kill → re-lock; mid-lockout process death → countdown resumes.
4. Tap latency on the slow shop phone during the splash→lock handoff.
5. APK orientation-lock status (decides landscape-P2 reachability); TalkBack pass.
6. Full A+B+C+D auth flow on-device: onboarding, prompt() rendering (Slice B DT1-DT12), lockout ladder auto-expiry,
   SM login via SaagarAdminPinCheck, launch lock end-to-end.

## R0-W1 wave summary (COMPLETE)
| Slice | Commit | Content |
|---|---|---|
| A | `019f5a8` | Named identity + JML + access logging (SEC-02/05/07) |
| B | `a68a1f0` | SaagarReauth + 3 export gates + 14 money gates (SEC-04+P1-51) |
| C | `697a524` | PIN policy + escalating-backoff lockout + SM-login fix (SEC-03) |
| D | `32672c1` | App-launch PIN lock (P1-37) |

**Next:** the owner's DEVICE-TEST reckoning on the Slice D APK (exercises all four slices). R0-W2 (encryption) stays
HARD-GATED on it; its full recon + honest build contract is banked at `docs/audit/r0w2-specs/R0-W2-BUILD-CONTRACT.md`
(headline: key-file custody is defense-in-depth not extraction-resistance without a Keystore rule-bend; auto-backup's
plaintext Documents snapshots make R0-W3 a co-requisite of any honest "encrypted at rest" claim).
