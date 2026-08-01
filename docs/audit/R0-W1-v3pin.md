# R0-W1 hygiene — v3 embedded-salt PIN format

**Programme:** Track A · R0 · post-Slice-D hygiene (follow-up to the Slice D adversarial P1, the orphaned-salt brick).
**Status:** SHIPPED. **COMMITTED + PUSHED `origin/main = e92f63d`** + seeded APK `Retail/SaagarCC-DemoData-R0-W1-V3Pin.apk`
(6.86 MB; packaged index.html SHA256 `f29b096e…` byte-exact vs seeded source, mojibake-clean).
**DEVICE-TEST PENDING — rides the same on-device pass as Slices A–D (this APK supersedes SliceD.apk as the test build).**
**Base:** `32672c1` (Slice D) → `e92f63d`. `www/index.html` only (+36/−7 net); all 4 blob lines byte-identical.

## What shipped
`"v3:<salt>:<digest>"` — the salt travels INSIDE the stored credential, so hash-and-salt can never diverge (the v2
brick class: `st_v2_pin_salt` lost while the hash survives ⇒ the correct PIN can never verify; with launch-lock armed
⇒ undismissable overlay — healed-on-detect in Slice D, now structurally impossible for v3 credentials).
- `pinMintSalt()` (crypto base36, no ':' possible) · `pinDigest(salt,pin)` (chain byte-identical to v2: 50000 ×
  simpleHash) · `pinHashV3(pin)` (fresh salt per mint — same PIN mints different hashes).
- **ONE format-aware compare `verifyPinHash(stored,pin)`** (v3 + v2-device-salt + legacy bare): admin (`verifyPin`),
  staff (`verifyStaffPin`), SM login (`SaagarAdminPinCheck`), launch lock, all money/export gates inherit through it.
- **Migrate-on-success:** v2/legacy → v3 on any successful entry (admin + staff, try/catch'd, old hash intact on write
  failure). `setStaffPin` + `promptNewPin` mint v3. No new storage keys; `PIN_SALT_KEY` kept (needed for not-yet-
  migrated v2 verifies, vestigial after); Slice D orphan-heal sites unchanged (they guard the remaining v2 era).

## Adversarial (4 skeptics + triage): 0 P0, 1 P1 folded, 2 P2
- **P1 (folded): the v2 verify branch reached `pinSalt()`, which MINTS+WRITES a fresh salt when absent** — a
  mid-session salt orphan followed by any verify attempt would plant a new salt and MASK the orphan from BOTH Slice D
  heal sites (paint IIFE + reEvalLaunchLock) ⇒ latent launch-lock brick. Fix: the v2 branch fails WITHOUT minting when
  the salt is absent, preserving the orphan for the heal. (Pre-existing v2-era behavior; this wave's "NEVER writes"
  comment was wrong about it — both corrected.) Re-verified: orphaned verify → no salt minted + hash intact + heal
  fires + overlay hidden; v2-with-salt still verifies + migrates; v3 indifferent to the salt key.
- **P2 accepted (DEVICE-TEST NOTE):** first v2→v3 migration via a non-setAdmin verify (SM login, re-auth gate,
  launch unlock) rewrites the stored hash, staling the persisted admin-session token (`adminToken()` binds to the
  exact stored string) ⇒ ONE silent drop to staff view at next boot, one extra unlock. Safe direction (de-escalation),
  one-time per device, same class as an ordinary PIN change. **Expect this once during the device test.**
- **P2 (folded):** stale v2-format comments (STAFF_PIN_KEY, verifyPinHash header) corrected.
- CLEAR sweeps: format/crypto (no ':' in any salt path, digits-only digests, no throw path — SaagarReauth's fail-open
  catch unreachable), consumers (every verify site single-counts into the Slice C lockout; blob fallback fail-closed
  vs v3), regression (diff = exactly the documented hunks).

## Harness (0 console errors)
23 core + 8 fold assertions: v3 format/verify/per-PIN-salt-distinctness; **v3 SURVIVES salt-key deletion** (the v2
brick state); v2 + legacy verify + migrate to v3; wrong-PIN never migrates; malformed v3 fail-closed without throw;
orphan-heal leaves v3 untouched + launch lock paints; staff v3 mint/verify/migrate; SM-login delegation true/false
with a v3 admin PIN in the real dsr iframe; fold: orphaned-v2 verify mints no salt + heal still fires.

## State after this wave
R0-W1 = A `019f5a8` · B `a68a1f0` · C `697a524` · D `32672c1` · v3-hygiene `e92f63d` — ALL device-test-pending.
**Test build = `SaagarCC-DemoData-R0-W1-V3Pin.apk`** (carries everything). Next: the owner's device-test reckoning
(the R0 go/no-go), then R0-W2 from `docs/audit/r0w2-specs/R0-W2-BUILD-CONTRACT.md` once the gate clears.
