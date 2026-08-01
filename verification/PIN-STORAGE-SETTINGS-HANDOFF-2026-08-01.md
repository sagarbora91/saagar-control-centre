# PIN, Owner access, and Settings storage handoff - 2026-08-01

## Repository state

- Repository: `V:\Co work\Projects\Retail\saagar-control-centre`
- Branch: `agent/storage-recovery-p0`
- HEAD: `4177701f8fe4cab46de1ff2e7597ccb52e0cda5a`
- Upstream: none configured for this branch
- Status: implementation is local, uncommitted, and unpushed
- PHP/platform scope: not started and still explicitly excluded
- User-owned `docs/audit/**` and root `package-lock.json` were preserved.

This handoff continues the secure-storage P0 work recorded in
`verification/STORAGE-RECOVERY-P0-HANDOFF-2026-07-30.md`. It does not replace
that recovery evidence.

## Module 1 - Owner access and per-module entry PINs

Engineering implementation is complete and locally verified.

Implemented:

- The shell role selector now exposes an explicit `Owner` choice. Leaving
  Owner mode for a staff role locks Owner mode cleanly.
- Owner state is recomputed from the PIN-bound authoritative SQLite value as
  the first action after `SaagarStore.whenReady`, before business rendering.
- Settings now contains `Security & PINs` with Owner PIN status/actions and
  one entry-PIN switch for each of the 11 canonical modules.
- The versioned `st_v3_module_pin_policy_v1` policy defaults every module to
  OFF. A module requires an entry PIN only when its own switch is ON and an
  Owner PIN exists. The old global protected-modules flag is inert.
- Module-entry approval is verify-only and one-use. It does not enable Owner
  mode, change the active role, or persist an elevated session. Role access is
  checked before the optional module PIN.
- The policy is included in portable backup and strict restore validation.
- Embedded modules receive a frozen, read-only Owner/role snapshot with no
  PIN, PIN hash, session token, customer data, or storage access.
- Service and Expense now ship a token-compatible Owner check in their raw
  embedded payloads and refresh Owner-only controls on context changes.
- Stock and DSR use the shell Owner/Store Manager context for their Manager
  workspaces and revoke an open Manager workspace after a role downgrade.
- The legacy Stock/DSR `Gold` password fallback was removed from the raw
  embedded APK payload, not only hidden at runtime. Their clean-source runtime
  guard now fails if that legacy credential is ever reintroduced.
- Service's Owner-only watch-photo policy now checks authorization inside the
  mutation handler, so a stale UI handler or programmatic call cannot change
  it after Owner revocation.
- Existing action-specific `SaagarReauth` gates in Stock, Service, DSR,
  Expense, and Payroll were preserved.

Re-encoded module metadata:

| Module | UTF-8 bytes | SHA-256 |
|---|---:|---|
| Stock | 186846 | `80937586309e85a71d728e33a1385e6d54a65caf1a34fd4b71dd458092893f98` |
| DSR | 176123 | `78ea9af570b398840cc1095cb34446e167c8fc1575ae74c3cbf7287d27dd44b0` |
| Service | 230809 | `da07905acff6c7adadb0b7d6dd88900d13e20f8c08e95738f60baa87ccf79a27` |
| Expense | 157721 | `f6ad9efa9d7d7085c201ec3ce071de26b9215910e2598395e5a3eaa3f191f442` |

`..\_extracted_modules\*.html` contains non-authoritative working copies and
is stale after this re-encode. Future module edits must freshly decode the
live `www/index.html` registry and must update `bytes`, `sha256`, and
`html_b64` together.

## Module 2 - Windows-style Settings storage card

Engineering implementation is complete and locally verified.

Implemented:

- Native `storageInfo()` returns the existing lightweight device/storage
  snapshot. It does not open SQLite, count rows, or run `quick_check`.
- `SaagarStore.refreshStorageInfo()` exposes only `totalBytes`,
  `availableBytes`, and `nativeStoreBytes`. Missing plugins and failures
  resolve to `null` without changing authority or recovery state.
- Request generations prevent an older measurement from replacing a newer
  one. Factory reset invalidates any in-flight measurement.
- `storage-capacity-policy.js` derives used/free capacity from Android's
  available bytes, clamps invalid values, and formats byte units.
- Settings > Data & backup starts with a responsive, accessible drive-style
  capacity bar. It shows whole-device used/available space and separately
  labels the SAAGAR SQLite database plus journal files.
- The database figure deliberately excludes photos, exports, and backup files
  so it is not presented as total SAAGAR app storage.

## Automated and build evidence

- Focused PIN/Owner, raw-payload, live-context, action-reauth, metadata, and
  Service handler set: **41/41 passed**.
- Focused storage policy/runtime/card set: **13/13 passed**.
- Permanent offline suite (`npm run test:offline`): **210/210 passed**.
- Shell inline-script parsing and embedded module byte/SHA verification passed.
- `git diff --check` passed; only repository line-ending conversion warnings
  were emitted.
- `npm run build:apk` passed, including Capacitor sync, native override,
  Java compilation, and Android debug assembly.
- Debug APK:
  `android/app/build/outputs/apk/debug/app-debug.apk`
- APK size: **7,623,213 bytes**
- APK SHA-256:
  `ABF1C83E25BFA44546F179B265F65D441BF98547A9BB1A0618AD2323147A1898`
- APK built: **2026-08-01 19:52:15 +05:30**

## Acceptance still pending

No device-only acceptance row is marked passed by this handoff. Required real
device checks still include:

1. Install/upgrade and verify Owner selection, correct/incorrect PIN behavior,
   lockout feedback, switching back to every staff role, and restart restore.
2. Confirm all 11 module-entry switches are OFF on first authoritative launch,
   then enable selected switches and verify one-use prompts without session
   elevation.
3. Verify Stock/DSR Manager entry and live downgrade revocation, plus
   Service/Expense Owner-control removal, on the packaged WebView.
4. Confirm the device used/available bar and SAAGAR database value against the
   Android device storage screen on at least one supported API-23+ device.
5. Run the formal DAT-02, backup/restore/interruption, two-device, production
   signing, and release gates required by the consolidated plan.

The earlier owner report that the seeded APK worked remains valid only for the
previous crash symptoms and artifact. It is not device evidence for this new
PIN or storage-card build.

## Next action

Review the local diff and install the debug APK for the device checks above.
Do not commit or push until the owner explicitly approves these reviewed
changes. Do not begin PHP/platform work.
