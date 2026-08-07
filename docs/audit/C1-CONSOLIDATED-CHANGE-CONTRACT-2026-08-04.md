# C1 Consolidated Change Contract

**Status:** engineering complete; owner review and formal acceptance pending

**Baseline:** D5 pushed at `c04bc98255a78d45b08ac449d88365b22d033f28`

## Included

- Complete external-file migration for all eleven Android modules.
- Retirement of the D2/D3/D4 base64 patchers and their patcher-only test.
- Permanent byte/hash and offline-asset guards for every module.
- D6-D12 non-ETP controls described in the consolidated strategy.
- Phone layout remediation for the shell and all eleven modules, including
  44-pixel touch targets, contained rails/tables, coordinated fixed actions,
  and preservation of the existing desktop layout.
- One seeded C1 review APK and one consolidated owner test cycle.

## Boundaries

- Existing canonical module data stays authoritative; C1 writes only additive
  control metadata.
- ETP parsing, sealed persistence, schema freeze, verified sales, incentive,
  and verified coaching remain C2.
- Device acceptance, recovery drills, UAT, legal approval, signing, and release
  remain C3.
- PHP work is excluded.

## Acceptance state

Automated source/build gates pass. Physical-device review is pending and must
not be upgraded to formal acceptance without the evidence catalogue. Detailed
evidence is in `verification/C1-CONSOLIDATED-ENGINEERING-CHECKPOINT-2026-08-04.md`
and `verification/C1-MOBILE-LAYOUT-REMEDIATION-2026-08-04.md`.
