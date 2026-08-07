# C1 Settings Navigation Redesign Checkpoint

**Date:** 2026-08-04 (Asia/Kolkata)

**Pushed baseline:** `c04bc98255a78d45b08ac449d88365b22d033f28`

**Working tree:** intentionally dirty and uncommitted; commit/push require owner approval

**Scope:** Settings information architecture and responsive navigation; PHP excluded

## Outcome

The inaccessible horizontal Settings tab rail has been removed. Settings now
uses an Android-style information architecture:

- a vertical Settings home grouped into App, Business setup, Access & security,
  Data & system, and Privacy & app;
- eleven exact routes: Appearance & language, People, Organisation, Shared
  masters, Roles & access, Security & PINs, Data & backup, Sync, Diagnostics,
  Privacy & rights, and About;
- a search field and bounded live summaries on every category row;
- phone navigation as Settings home -> category detail -> Settings home;
- Android hardware/gesture Back consumes an open Settings detail before leaving
  Settings; and
- desktop navigation as persistent master list plus detail pane.

The change is presentational and navigational. Existing security, role, staff,
backup, restore, storage, reset, sync, diagnostics, legal/privacy, About and
master-data handlers remain in place. Legacy `data-sub` route markers remain as
inert audit-compatibility attributes; the old `#configTabs` navigation element
and `.subtab` row are absent.

## Crash recovery

The system crash left `www/index.html` as a 714,657-byte all-null file. No Git
reset or checkout was used. The file was recovered from the last synchronized
Android source asset at
`android/app/src/main/assets/public/index.html`:

- recovered bytes: 708,206;
- recovered SHA-256 before the Settings edit:
  `363551EA70B3F22B2D230423AE6C54C59AED427D2BD6E7F61CFAAB7FAAC6BD4F`;
- every C1/mobile companion asset matched the working source byte-for-byte; and
- C1 12/12 plus mobile 6/6 passed immediately after recovery and before the
  Settings edit.

This recovery preserved the uncommitted C1 extraction and mobile remediation.
No user-owned audit document or `package-lock.json` was overwritten.

## Implementation inventory

| File | Change |
|---|---|
| `www/index.html` | Vertical route home, exact detail registry, search, summaries, stack navigation, Back handling and existing detail surfaces |
| `www/settings-navigation.css` | Desktop master/detail and phone home/detail layouts, 44-pixel Back target, local form/table containment |
| `tests/settings-navigation-architecture.test.mjs` | Permanent 6-test navigation, route, Back, compatibility and sensitive-handler contract |
| `package.json` | Adds `test:settings`; includes it in `pretest:offline` |

## Verification

| Gate | Result |
|---|---:|
| Focused Settings suite | 6/6 passed |
| Focused C1 suite | 12/12 passed |
| Focused mobile suite | 6/6 passed |
| Targeted privacy/PIN compatibility rerun | 22/22 passed |
| Full `tests/*.test.mjs` suite | 283/283 passed |
| Explicit offline suite | 256/256 passed after all three focused pre-gates |
| Two-year seeded runtime | 1/1 passed |
| Gradle seeded debug assembly | passed |
| Clean source/generated seed flags after packaging | `false` / `false` |

Automated browser rendering was attempted after restarting the local preview
server, but the in-app browser security policy blocked control of the localhost
page. No alternate browser-control mechanism was used to bypass that policy.
Therefore this checkpoint does not claim a new rendered viewport pass for the
Settings redesign.

## Review APK

- Path: `V:\Co work\Projects\Retail\SaagarCC-C1-DemoData-2Years-v2.9.apk`
- Bytes: 6,793,233
- SHA-256: `CAA15D9409ED5B9973E42CD67B1ACD213F656399454A2E38D79738237DEB1341`
- Profile: `two-year-review-v1`, 730 days, 25 synthetic working-day walk-ins,
  WLMHW/HEMW labels, synthetic only
- Identity: package `com.saagartraders.bcc`, version 2.9, versionCode 209,
  minSdk 23, targetSdk 34, debug signing

The APK is for owner review only. Synthetic store labels are not authenticated
store-isolation evidence and seeded data must not be used for production
acceptance.

## Owner smoke still required

On the named APK, record the result of these checks:

1. Open Settings at a narrow phone width and confirm all eleven category rows
   are reachable by vertical scrolling; no horizontal category rail exists.
2. Search for `backup`, open Data & backup, and return with the visible Back
   control. Repeat using Android hardware/gesture Back.
3. Open Appearance & language and change Mobile/Desktop, language and text size;
   confirm the Settings row summary updates.
4. Open People, Organisation, Shared masters, Roles & access, Security & PINs,
   Sync, Diagnostics, Privacy & rights and About; confirm each header and
   existing controls are reachable without changing or deleting real data.
5. On a desktop/wide layout, confirm the vertical master list and selected
   detail remain visible together.
6. Exercise font scale, keyboard, rotation, safe insets and gesture navigation
   on the intended Android device.

An informal owner report may be recorded as owner-reported smoke. It must not
be promoted to formal device acceptance without device identity, date, named
observer, observed results and evidence links required by C3.

## Claims deliberately not made

- No physical-device layout, API-23, accessibility, keyboard/inset, rotation or
  gesture-navigation pass is claimed.
- No backup/restore/reset drill, DAT-02 pass, UAT, legal approval, production
  signing or release is claimed.
- C2/E1-E6 remains blocked on representative raw R022, R025, R013 and R003
  exports and the controlling dictionary/reconciliation/parser decisions.
- No commit or push was performed.
