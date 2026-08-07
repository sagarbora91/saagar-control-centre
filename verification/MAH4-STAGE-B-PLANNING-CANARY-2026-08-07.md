# MAH-4 Stage B Planning runtime canary — 2026-08-07

**Status:** Stage B has started. The Planning lifecycle canary is implemented
and browser-verified. This is not the eleven-module rollout and is not device
acceptance.

## Implemented scope

- Added the synchronous offline `www/shared/mah4-runtime.js` browser runtime.
- Manifest schema 2 now integrity-binds both shared runtimes.
- The shell creates a CSPRNG instance identity for Planning, sends exact-origin
  `ST_INIT`, requires correlated `ST_READY`, and waits for correlated
  `ST_DISPOSED` before removing the frame.
- READY and disposal deadlines remain 5,000 ms and 1,500 ms respectively.
- Planning owns a reverse-order, idempotent lifecycle registry for registered
  timers, intervals, listeners and observers.
- Frame errors, repeated loads and deadline failures close fail-safe.
- Android seeded-build verification now byte-compares the MAH-4 runtime too.

## Explicit boundaries

- Only Planning is wired. The other ten modules do not load the Stage B runtime.
- Four control messages are active: `ST_INIT`, `ST_READY`, `ST_DISPOSE`, and
  `ST_DISPOSED`. `ST_ERROR` remains pending.
- Legacy business messages remain on their existing compatibility path.
- Raw legacy `ST_AUDIT` migration remains blocked.
- API-23 timing/entropy, physical-device, native-language, production signing
  and production acceptance remain false.

## Exact identity and evidence

- `www` files: 65
- `www` bytes: 7,742,661
- `www` tree SHA-256:
  `d8fb2508768cc9b15f7ba0a36a3d2642fdbe46080f9a345593e4af3e0d960259`
- MAH-4 runtime: 7,033 bytes; SHA-256
  `3f45b576eb2aa59ecebb545d510a0665ce134e7e20d4acac530204a343bd5bd9`
- Browser shell/iframe markers reached `READY:planning` after correlation and
  `DISPOSED:planning` after the rendered Home action; the module screen was
  hidden only after disposal completed.

## Verification

- MAH-3: 19/19
- MAH-4: 42/42
- Modular: 68/68
- Offline: 256/256
- Complete glob: 365/365
- `git diff --check`: no whitespace errors; line-ending notices only

No commit, push or APK build was performed. The working tree remains
intentionally dirty.

## Next Stage B action

Add deterministic `ST_ERROR` runtime handling and executable timeout/error
browser cases for the Planning canary. Only after those pass should the
lifecycle runtime expand module-by-module, with DSR and QMS first because their
timer/menu behavior already has exact canary evidence.
