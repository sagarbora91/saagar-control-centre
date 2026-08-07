# MAH-4 Stage B runtime completion — 2026-08-07

**Status:** Product runtime rollout complete; physical API-23 evidence and raw
legacy audit migration remain explicitly open.

## Completed

- The shell and all eleven external modules now load the integrity-bound MAH-4
  runtime and complete the correlated `ST_INIT` / `ST_READY` lifecycle.
- DSR, QMS, Planning, and the remaining eight modules use the same host and
  disposal path. Module switching waits for `ST_DISPOSED` or the fail-safe
  deadline before removing the frame.
- `ST_ERROR` implements the Stage A phase policy: initialization errors close;
  recoverable runtime/disposal errors retain their current state; fatal errors
  close immediately.
- Production deadlines remain exactly 5,000 ms for READY and 1,500 ms for
  disposal. Deterministic clocks are injectable only through host construction
  for executable tests.
- Instance identities require `crypto.getRandomValues`; exact source, origin,
  module, instance, version and reply correlation remain enforced.
- The real shell rendered all eleven module READY states. A browser fixture
  rendered passing READY timeout, initialization error, recoverable runtime
  error, and disposal timeout cases. Evidence is in
  `verification/MAH4-STAGE-B-RENDERED-RUNTIME-EVIDENCE-2026-08-07.json`.

## Evidence boundaries

- API-23-compatible classic-script, entropy and exact-deadline tests pass in the
  host environment.
- No API-23 device or emulator was available. Physical API-23 timing/entropy
  acceptance therefore remains pending and is not inferred from compatibility
  tests.
- Existing owner-reported APK smoke remains owner-reported only.
- Raw legacy `ST_AUDIT` is unchanged and blocked pending its redaction,
  retention and migration policy decision.
- No commit, push, APK build, physical-device acceptance, native-language
  acceptance or production acceptance occurred.

## Exact identity

- Branch: `agent/c1-mah4-foundation`
- HEAD: `f33b923cb08648e531f00d96300405e30d8b0440`
- Working tree: intentionally dirty
- `www` files: 65
- `www` bytes: 7,745,257
- `www` tree SHA-256:
  `b203cd01094cdd9f352f5723298a78c7e5874f6e3e5ec1ad6bde2935182ea507`
- `www/shared/mah4-runtime.js`: 8,180 bytes; SHA-256
  `1b1a7d7e2e789c5638a7c56ff3495e7a34ddf5db63cf958ef923ef801c8066b5`

## Verification

- MAH-3: 19/19
- MAH-4: 45/45
- Modular: 71/71
- Offline suite: passed
- Complete repository glob: 368/368
- `git diff --check`: no whitespace errors; line-ending notices only
