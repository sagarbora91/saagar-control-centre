# Two-year seeded Android review APK — 2026-07-30

> **Superseded artifact notice:** device review reproduced back-date and six-second
> scale crashes in this whole-file-persistence build. Do not use the checksum
> below. The current native incremental SQLite APK and pending device retest are
> recorded in
> `verification/NATIVE-INCREMENTAL-SQLITE-CRASH-CHECKPOINT-2026-07-30.md`.

## Result

A separate debug-signed APK was built from the uncommitted D1+D2+D3 working
tree with deterministic synthetic data covering 730 days back plus today
(731 calendar dates).

- Artifact: `V:\Co work\Projects\Retail\SaagarCC-DemoData-2Years-D1-D3-v2.9.apk`
- Size: 7,562,722 bytes
- SHA-256: `4545DA621EB13AB540F3631D8D0C24A8CBC8A09B44C0F16B1A9549F14E948CF4`
- Identity: version 2.9, versionCode 209, minSdk 23, targetSdk 34
- Review profile: `two-year-review-v1`
- Stores represented: WLMHW and HEMW
- Queue target: 25 synthetic walk-ins per working day, with the latest 90
  days retained in the live QMS blob and older closed visits written to the
  QMS archive file.

This is a review artifact, not a production release.

## Seed coverage

The deterministic long-history path seeds Organisation/employee masters, QMS,
DSR, Service, Expense/Cash, Grooming, CRO audit, Payroll, Leave, Tax/GST, and
Stock data. The two-year additions include:

- 24 locked historical payroll snapshots;
- monthly budget and completed-month tax-feed history;
- Service cases across received, awaiting approval, in progress, ready, and on
  hold, plus delivered cases, readiness states, overdue examples, and exact
  repeat-repair examples;
- both-store Stock history at the beginning and end of the review period; and
- a machine-readable synthetic profile containing date range and record
  counters.

All generated contact numbers are structurally ten digits but begin with `1`,
so they do not resemble routable Indian mobile numbers. A persistent
navy-and-gold banner says `SYNTHETIC DEMO DATA` and `DO NOT CONTACT`.

## Build separation and package inspection

`npm run build:apk:seeded-2y` syncs the normal source, modifies only the
generated Android `index.html`, builds the seeded APK, copies it to the
artifact path above, and restores the generated file in a `finally` block.

Direct ZIP inspection of the copied APK confirmed:

- `DEMO_SEED_ENABLED = true`;
- generated defaults of 730 days and 25 walk-ins;
- the `two-year-review-v1` profile and synthetic-data banner; and
- packaged `demo-seed.js` is byte-identical to `www/demo-seed.js`
  (76,037 bytes; SHA-256
  `DF1C3A98FC200D4000FF26A0114F35558162957429AFBA5DA7BFA4F9AF3B0BA6`).

After the seeded build, both `www/index.html` and the generated Android
`index.html` were confirmed back at `DEMO_SEED_ENABLED = false` with their
ordinary 365/50 fallback defaults. A subsequent ordinary debug build restores
`android/app/build/outputs/apk/debug/app-debug.apk` as the non-seeded local
build; the copied artifact above remains the authoritative seeded APK.

## Automated evidence

- Seed-profile policy/package regressions: 5/5 passed.
- Full 730-day isolated runtime smoke: 1/1 passed in about 2.1 seconds.
  It verified 731 dates, exactly 730 days of span, separate live/archive QMS
  partitions, non-routable contacts, all five open Service stages, repeat and
  readiness cases, 24 locked payroll months, at least 23 monthly tax feeds,
  731 cash statements, and both-store boundary Stock keys.
- Permanent offline suite: 149/149 passed.
- Seeded Android debug packaging: passed twice with a byte-stable copied APK.

## Acceptance boundary

No physical-device acceptance has been claimed. The following remain pending:

- first-launch seed duration, memory use, ANR behavior, and QMS archive-file
  write/rename on representative Android devices;
- layout, navigation, keyboard, rotation/relaunch, and process-kill behavior at
  seeded volume;
- staff review of plausibility and usability of the synthetic scenarios;
- backup/restore/reset drills with the seeded volume; and
- every production signing, legal/owner, security, provider-delivery, and
  release gate already listed in the consolidated plan.

The two store names are review data labels. They do not prove authenticated
staff-to-store authorization or cross-store privacy isolation. No PHP/platform
work was started. Nothing was committed or pushed.


## Superseding native SQLite artifact

The current review artifact is 7,617,377 bytes with SHA-256
`77111CE3E9967C224340C10B4CE70B5487678E3080CEA7CEB96A5DF7F1FABEBD`.
Local evidence is 159/159 offline tests, 1/1 full 730-day seed runtime, Android
compile/assembly success, and direct APK inspection. No physical-device pass is
claimed; use the linked crash checkpoint for the mandatory retest.

## Current native artifact device smoke - 2026-07-30

The owner subsequently reported that the current native SQLite artifact,
SHA-256
`77111CE3E9967C224340C10B4CE70B5487678E3080CEA7CEB96A5DF7F1FABEBD`,
works correctly on the review device. The earlier back-date and delayed module
close symptoms were not reported again. See
`verification/NATIVE-INCREMENTAL-SQLITE-CRASH-CHECKPOINT-2026-07-30.md` for
the evidence boundary and the controlled device work that remains pending.
