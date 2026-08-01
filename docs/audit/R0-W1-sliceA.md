# R0-W1 Slice A — Named identity + JML enforcement + access logging

**Programme:** Track A · R0 (Data Safety & Access Control) · Wave R0-W1 (Named Access) · **Slice A of 4.**
**Status:** SHIPPED. **COMMITTED + PUSHED `origin/main = 019f5a8`** + seeded APK `Retail/SaagarCC-DemoData-R0-W1-SliceA.apk` (6.84 MB; packaged index.html SHA256 byte-exact vs seeded source, mojibake-clean, 11 blobs byte-identical). **DEVICE-TEST PENDING (auth wave — recommend on-device pass before production trust).**
**Base:** `origin/main = 2f20a64` (Wave 13-lite) → `019f5a8`. File: `www/index.html` only (+70/−15); all 11 module blobs byte-identical; no storage-core/sqlite/photo-store contact.

> **DEVIATION NOTE:** The Execution Plan gates all of R0 on the owner's device-test reckoning (step 0.3). The owner
> explicitly chose to start R0-W1 now. Slice A is the **light-device-risk** slice (auth UI/logic only, fail-open by
> construction, harness-verifiable end-to-end) and the plan's `deviceRiskGate` marks it **safe to ship pre-device-test**.
> **R0-W2 (encryption/storage rewrite) remains hard-gated on the device test — not started.** Even Slice A, being auth,
> warrants an on-device pass before production trust.

## Scope (recommended-first micro-wave; SEC-02 + SEC-05 + SEC-07)
Reconcile verdicts: SEC-02/03/04/05/07 PARTIAL (Wave-6 foundation exists), P1-37/P1-51 OPEN. Slice A HARDENS the delta.

**SEC-02 — named identity / no generic 'admin':**
- `auditLog` actor now = `ownerName()` when `isAdmin` (fallback `'Owner'` when blank), plus a new `actorRole` field. Owner
  actions attribute to the person, not the literal 'Admin'.
- Admin state pill relabeled `Unlocked · <owner name>`.
- NEW opt-in owner policy key `saagar_staff_login_required_v1` (`STAFF_LOGIN_REQ_KEY`), **default OFF**. When ON,
  `staffSignInPick` refuses selecting a staffer with no sign-in PIN (the "— Shared / nobody —" option is unaffected → never
  blocks the device). Toggle in Settings → Staff sign-in card.

**SEC-05 — Joiner-Mover-Leaver enforcement:**
- `empActiveById(id)` (reads `getEmployeeMaster`; **fail-open** → TRUE for unknown/legacy/unreadable id; STAFF-ONLY, never
  the owner path) gates `verifyStaffPin` + `signInStaff`.
- `toggleEmpActive(deactivate)` + `archiveEmpRow` **immediately sign out a live session**; `archiveEmpRow` also clears the
  staff PIN (true revocation) behind a leaver-checklist `confirm()`.
- NEW `unarchiveEmpRow` (a real Restore path for a re-joiner) + boot re-validation (`init`: sign out an activeStaff that is
  no longer active — belt-and-suspenders).

**SEC-07 — access logging + minimal masking:**
- `SENSITIVE_VIEWS=['payroll','tax']`; guarded `auditLog('access.open',{module,role,admin})` in `openModule`, guarded
  `auditLog('access.denied',{module,role})` in `ensureModuleAccess`. Logging is side-effect-only (never changes the
  allow/deny decision) and try/catch-wrapped.
- `amountsHidden()` role-aware when no explicit Privacy-eye setting: a role with no money module (payroll/expense/dsr)
  default-masks Home ₹ tiles; **owner exempt**; explicit toggle wins; fail-open → SHOW on error. Deep in-iframe salary
  masking deferred to Track B.

## Storage
`saagar_staff_login_required_v1` → `appControlKeys()` (backup) + `APP_RE` already covers `saagar_` (factory reset + safety
backup) + restore control-fallthrough (accepted; NOT restoreBlockedKeys — it's a policy, not a secret). No other new key.
(The lockout/attempt key that would need the restoreBlockedKeys + out-of-appControlKeys rule-bend belongs to Slice C, not A.)

## Process
7-agent reconcile + slicing synthesis (7 decisions D1-D7) → Slice A build by hand → harness verify → 5-skeptic adversarial
(fail-open/lockout obsessed).

**Adversarial: 0 P0, 0 P1, 4 P2 — all HOLD. Folded 3 fixes (covering all 4 P2s), re-verified:**
1. **Root-hardened `auditLog` + `auditStats` + `logActivity`** to `Array.isArray(x)?x:[]` so a corrupted (non-array-but-truthy)
   store can NEVER make `.unshift` throw and abort a caller — closes the pre-existing unguarded-`logActivity` gap (P2 #1) AND
   the "revocation-after-unwrapped-auditLog" gap (P2 #3) at the source. Verified: tax module opens + `access.open` logs on a
   deliberately corrupted `st_v4_audit_log`/`st_v3_activity_log`.
2. **Archived-row Restore path** (P2 #2, confirmed): an archived (leaver) row now shows **Restore** (`unarchiveEmpRow`), not a
   silent no-op "Activate". Verified: archive→blocked, restore→eligible again.
3. **Boot re-validation** (P2 #4): `init` signs out an `activeStaff` that is no longer active (covers the auto-lock-'Never' +
   skipped-immediate-signout edge). Done in `init`, not `applyMode` (avoids `signOutStaff`→`applyMode` recursion).

## Harness verification (0 console errors)
Owner audit actor = "Sagar Sanjay Bora" (not 'Admin') + actorRole; staff/shared attribution; new key whitelisted +
restore-accepted; `empActiveById` fail-open on unknown id + blocks deactivated; deactivate refuses sign-in + immediate
live-revoke; reactivate idempotent; policy blocks no-PIN staffer while "Shared" always works; `access.open`/`access.denied`
logged; masking fires only for money-less roles (owner exempt, explicit override wins); corrupted-store hardening (module
opens + logs); unarchive restores; fresh-boot + normal-module regression clean; all 11 blobs byte-identical.

## Remaining R0-W1 slices (per slicing.json)
- **Slice B** — shared re-auth primitive + export/money-action re-auth (SEC-04 + P1-51). Device-test before ship.
- **Slice C** — PIN policy: min-length + escalating-backoff lockout + forced-change (SEC-03). The real brick-risk; needs the
  out-of-appControlKeys attempt-key rule-bend (owner sign-off) + a dedicated device-test.
- **Slice D** — app-launch PIN lock (P1-37). The R0 go/no-go; CANNOT be validated on harness alone — hard device gate.

## On ship (owner go)
`git add www/index.html` → commit → push → seeded APK. Then update this doc + a `saagar-r0w1-slicea` memory + MEMORY.md +
HANDOFF.md. Recommend an on-device pass of the auth flows before production trust even though Slice A is harness-clean.
