# MAH-4 API-23 and audit migration closeout — 2026-08-07

**Status:** The two remaining MAH-4 runtime items are complete. This is
engineering evidence from an API-23 emulator, not owner physical-device or
production acceptance.

## API-23 runtime evidence

- Installed Android 23 x86_64 system image and created clean AVD
  `saagar_api23_evidence`.
- Device facts: Android API 23, Android 6.0, x86_64.
- Built the current debug APK successfully and installed it on the AVD.
- APK: 6,634,087 bytes; SHA-256
  `df9752c3a4e53234bb9a722bca0b750581a0cb98152f23a2699cddbbf54ccd27`.
- The real app activity and WebView rendered successfully.
- The first runtime probe found API-23 WebView did not implement `padStart`.
  The MAH-4 instance encoder was corrected to classic hexadecimal padding.
- Final Android instrumentation: 2/2 passed.
- Secure entropy: `crypto.getRandomValues=true`; 1,000 generated instance IDs,
  1,000 unique; 18 ms elapsed.
- READY deadline measured: 5,008 ms for the exact 5,000 ms configuration.
- Disposal deadline measured: 1,502 ms for the exact 1,500 ms configuration.

The stock API-23 WebView log also exposed pre-existing syntax/polyfill failures
in application scripts outside the MAH-4 runtime, including arrow-function
syntax and `Array.from`. Therefore this closes the requested MAH-4 API-23
timing/entropy gate only; it does not claim whole-application API-23 production
acceptance.

## Raw legacy audit retirement

- All eleven module audit bridges now call the correlated MAH-4 runtime.
- Raw storage keys and raw `before`/`after` values are not transmitted.
- The canonical payload contains only action, SHA-256 storage-key fingerprint,
  and bounded before/after byte counts.
- SHA-256 uses Web Crypto and fails closed when unavailable. Tests compare
  repeated runtime results against canonical Node SHA-256 digests.
- Pre-INIT audit metadata is queued and sent only after instance binding.
- The shell accepts audit metadata only through the exact-source, exact-origin,
  correlated host.
- The old `sqlite-store.js` audit payload mirror was removed. Module writes
  already persist through `SaagarStore`; audit is no longer a data transport.
- Raw legacy messages remain rejected permanently. They are retired, not
  normalized or retained.

## Final source identity

- Branch: `agent/c1-mah4-foundation`
- HEAD: `f33b923cb08648e531f00d96300405e30d8b0440`
- Working tree: intentionally dirty
- `www` files: 65
- `www` bytes: 7,745,833
- `www` tree SHA-256:
  `e809d4e74b4a10b580d4860040b5eaa1d89316ecfb64ab6b0b6e6baab5e6dcd2`
- `www/shared/mah4-runtime.js`: 10,062 bytes; SHA-256
  `5561f54e7307676f44d2aa0b607f6c69a49e0d48c44d15d61b7cddbb9af7d9ec`

## Verification

- Android API-23 instrumentation: 2/2
- MAH-3: 19/19
- MAH-4: 46/46
- Complete repository glob: 369/369
- `git diff --check`: no whitespace errors; line-ending notices only

No commit or push was performed. The debug APK was built only to obtain the
requested API-23 engineering evidence.
