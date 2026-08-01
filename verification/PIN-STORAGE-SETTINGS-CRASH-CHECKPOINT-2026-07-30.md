# PIN and Settings work — usage checkpoint (2026-07-30)

## Repository state

- Repository: `V:\Co work\Projects\Retail\saagar-control-centre`
- Branch: `agent/storage-recovery-p0`
- Base commit: `4177701f8fe4cab46de1ff2e7597ccb52e0cda5a`
- Commit/push: **not performed**
- PHP platform work: **not started**
- Existing untracked `docs/audit/**` files and `package-lock.json` are user-owned and remain untouched.

## Previously completed local module

The P0 secure-storage recovery implementation remains present in the working tree:

- authoritative SQLite recovery quarantine and stable reason codes
- stale-localStorage blocking while native authority is pending/unavailable
- timeout and late-result safeguards
- safe recovery UI and allowlisted diagnostics
- native transaction/open/query failure cleanup
- native storage byte counters
- focused recovery tests, full offline suite, and Android debug build

Evidence and APK details remain in:

- `verification/STORAGE-RECOVERY-P0-HANDOFF-2026-07-30.md`
- `verification/NATIVE-INCREMENTAL-SQLITE-CRASH-CHECKPOINT-2026-07-30.md`

No physical-device recovery acceptance has been claimed.

## PIN / Owner audit completed

Confirmed defects and required implementation points:

1. Owner state is read synchronously before authoritative SQLite hydration. The pre-ready quarantine makes that read false, and `doFirstRender()` never recomputes it after `SaagarStore.whenReady`.
2. The top role selector has no explicit Owner option, making Owner switching unclear.
3. The old module-entry policy is one global key, defaults to ON, and only protects Payroll/Tax.
4. Module-entry approval currently calls `unlockAdmin()`, changing the whole session to Owner instead of performing one-use verification.
5. Service and Expense test `st_v2_admin_mode === "true"` even though the shell now stores `tok:<hash>`, so a valid Owner session is not recognised inside those modules.
6. Stock and DSR retain module-local Manager Password handling and a legacy literal `Gold` fallback. The fallback must not survive; action-specific owner reauthentication must remain.
7. A genuinely forgotten existing Owner PIN cannot be reset safely without an authenticated recovery decision. No unauthenticated reset has been added.

## New isolated code completed

Added:

- `www/module-pin-policy.js`
- `tests/module-pin-policy.test.mjs`

Policy behavior:

- canonical 11 module IDs
- versioned `{version:1, modules:{...}}`
- every module-entry PIN switch defaults OFF
- malformed, future, and legacy global values stay all-off
- strict boolean normalization
- PIN requirement is effective only when the module is enabled and an Owner PIN exists

Focused result: **6/6 passed**.

Also prepared for the next Settings module:

- `www/storage-capacity-policy.js`
- `tests/storage-capacity-policy.test.mjs`

Storage policy behavior:

- uses Android `availableBytes` for actionable free space
- clamps invalid/over-range values
- derives used bytes and percentage safely
- formats B/KB/MB/GB/TB
- reports the secure database from `nativeStoreBytes` only

Focused result: **6/6 passed**.

## Not yet integrated

No production integration for the new PIN or storage policies has been applied to `www/index.html`, `www/storage-core.js`, or the native plugin during this checkpoint.

An `apply_patch` attempt to add the module-policy script include failed at the Windows sandbox ACL read step. It made **no file change**. Continue with count-checked exact replacements or a temporary patch plus `git apply`, preserving UTF-8 without BOM.

Next implementation order:

1. Load `module-pin-policy.js` before the shell script.
2. Recompute Owner session from authoritative storage as the first action after `whenReady`.
3. Add explicit Owner selection and clean switching back to staff roles.
4. Add a `Security & PINs` Settings tab with Owner PIN status and 11 module-entry toggles, all initially OFF.
5. Replace global Payroll/Tax entry protection with one-use per-module verification; do not elevate the session.
6. Add the new policy to portable control keys and strict restore validation.
7. Expose a read-only Owner/role bridge for embedded modules; repair Service/Expense token compatibility and remove Stock/DSR `Gold` fallback while preserving sensitive action reauthentication.
8. Add integration/static/runtime tests; register both new pure suites in `test:offline`.
9. Add lightweight native `storageInfo()` and `SaagarStore.refreshStorageInfo()`.
10. Add the Windows-style capacity card at the top of Settings → Data & backup.
11. Run focused tests, full offline tests, syntax checks, Android build, and update the master plan/handoff.

Device-only checks remain pending until there is real device evidence.
