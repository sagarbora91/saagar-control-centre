# Phase 4C.1 crash checkpoint — 2026-08-17

Status: engineering candidate preserved and pushed; formal timing/evidence freeze is still pending.

## Resume authority

- Main branch: `agent/modular-phase1-shared-spine-v2`
- Main checkpoint before the candidate: `5dba679e3e8b23bfea9de439e0fc0c082259ef51`
- Governed audit tooling: `667ab0d2bc83f8f6347976548f30f5a1ccf6b12a`
- Candidate branch: `agent/p4c-a10-derived-i18n-lazy`
- Candidate source commit: `a07c8bc58619079d85c2daaf0efd65d58d7b514c`
- Candidate identity commit / resume commit: `202c48fe1cd5c76540dba4dfca4504732b8f884e`
- Remote candidate ref was verified at the resume commit above.

## Completed and preserved

- Rejected dynamic-loader and broad-preload candidates were not merged.
- The accepted candidate keeps `app-i18n.js` statically loaded and preserves the synchronous `SaagarI18n` API.
- English startup skips construction of derived Marathi/Hindi dictionaries and word maps; the first native-language operation constructs them once synchronously.
- Existing PHRASES content, module HTML loading order, offline behavior, CSP posture and API-23 compatibility remain unchanged.
- Independent semantic review passed; all 2,009 English phrase keys are unique and `stats()` remains equivalent.
- Candidate validation passed: language 10/10, direct offline 262/262, focused review 4/4.
- Identity/profile regeneration passed 31/31.
- Product fingerprint: `08734dfbb1d82f69849a4d8857cf1c311c0c0054f5a1b46bca41d42d2c15969e` (339 files, 10,980,804 bytes).
- MAH-3 www tree: `f2f081cd1e620901ab00fd36da42594fdc3ff58d5edd355082c36da74e609a59`.
- Capability inventory: 660 capabilities, inventory SHA-256 `64978e85086a9f194742f2a579099802203bd475271b3af756dcc703a412eaa6`.
- Capability comparison remains exactly 107 deltas with SHA-256 `6179252efa5110d96c46be8544f275c46dfb5f14f8d46f4b46a194fc6f2a6420`.

## Historical diagnostics — do not reuse as closure evidence

- Dynamic-loader candidate `8d62d42` had one full timing pass and one full timing fail and also failed governance/API review.
- Preload candidate `c7dfcbd` failed the governed A10-02 timing gate.
- Prior APK, rendered UI evidence, 29a baseline/comparisons and target-bound approvals are historical if this candidate is adopted.
- The untracked Phase 4C UI attestation on main is bound to the prior product fingerprint `47c1e9c0...`; do not commit or use it for the candidate.

## Exact remaining Phase 4C.1 sequence

1. Merge resume commit `202c48fe1cd5c76540dba4dfca4504732b8f884e` into main and run the complete 510-test product suite once.
2. Run two consecutive full shell-first paired timing captures against the frozen anchor and the exact candidate under tooling `667ab0d`; require A10-01 <= +5% and A10-02 <= +10% in both runs.
3. If either timing run fails, preserve the result and stop. Do not retry-select a favorable sample.
4. After two passes only, capture the signed 72-cell rendered UI matrix once and rebuild/test the exact seeded APK once on API-23.
5. Create timing baseline/current evidence carriers, run the governed baseline, then run the unapproved comparison.
6. Obtain renewed identity-bound fluent-language and capability approvals, then rerun the same comparison target with the approval envelope.
7. Preserve the approved 18-file evidence set, update HANDOFF, commit and push.

## Deferred Phase 4C.2 boundary

SM-T875 is unavailable. A10-04, A10-05, physical update/OEM ETP, production ETP, UAT/legal, production signing and release approval remain explicitly deferred-not-waived. Emulator evidence must not be substituted for those gates.
