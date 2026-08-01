# Bug (live-observed) — payroll/tax Admin-PIN gate uses `prompt()` — session 2026-07-03

## B-LIVE-1 — `unlockAdmin()` calls `window.prompt()`, which is unsupported in this WebView/preview — **P1 (needs device verification; possibly preview-only)**

**Where:** shell `index.html`
- `ensureModuleAccess(id)` (index.html:2173) → for `payroll`/`tax`, when not admin and
  `protectedModulesEnabled()` is true, calls `unlockAdmin()`.
- `unlockAdmin()` uses `const pin = prompt('Enter Admin PIN');` (index.html:2148). Also
  `setAdminPin`/`changeAdminPin` (2136/2139/2160), factory reset (5366), archive (5486) all use `prompt()`.

**Observed:** In the seeded demo (`protectedModulesEnabled()===true`, `isAdmin===false`), opening
**payroll** or **tax** threw `"prompt() is not supported"` in the headless preview browser, so the
module never opened. I had to set `isAdmin=true` + stub `window.prompt` to audit them.

**Why it may matter on device:** Capacitor's `BridgeWebChromeClient` normally implements `onJsPrompt`
(shows a native dialog), so `prompt()` likely WORKS on a real device — making this a **preview-only**
limitation. BUT: the device test for all waves is still pending, and if this WebView build does NOT
surface a native prompt (some WebView configs return `null` / throw), then **payroll, tax, factory
reset, archive, and Admin-PIN set/change are all unreachable** — a latent P0. Cannot be settled in a
browser; must be verified on the actual APK.

**Recommendation (audit-only, no fix yet):** verify on device that opening payroll/tax with protected
modules enabled shows a native PIN prompt. If it does not, migrate these flows off `window.prompt`/
`confirm` to the app's own in-DOM modal (the shell already has `openModal`/bottom-sheet infra) — an
additive change, no new libs. Log here for the fix phase.

**Confidence:** medium (definite in preview; device behaviour unconfirmed).

## Note — harness bypass used for the layout audit
To audit payroll/tax layout I set `isAdmin=true` and stubbed `window.prompt` in the running page only
(scratch copy). No app files changed. This does not affect any finding except enabling module open.
