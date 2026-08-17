# Phase 4C.1 crash checkpoint — 2026-08-17

Status: engineering candidate merged and pushed; the two-run timing stop condition was reached. Phase 4C.1 is paused for owner disposition and no further automatic run is authorized.

## Owner-mandated no-repeat policy

- Do not redo a valid expensive run unless tracked inputs changed or the prior run
  is documented as technically invalid.
- Use one producer per artifact. Additional agents may review or work on disjoint
  tasks, but may not repeat the same test, capture, build or audit.
- Run cheap static, schema and identity checks before browser timing, rendered UI,
  APK or full-audit work.
- Freeze the product before evidence. State the invalidation impact before making
  any post-freeze change.
- Phase 4C.1 permits at most two consecutive formal timing runs. If either fails,
  preserve it and stop for Sagar's decision; do not rerun or create another
  candidate automatically.
- Run the full 510-test suite once for the frozen candidate unless its inputs
  change or the run is technically invalid.
- Phase 4C.2 external gates must not reopen the completed Modular HTML
  implementation or block work on the functioning ETP Reports module.

## Resume authority

- Main branch: `agent/modular-phase1-shared-spine-v2`
- Main checkpoint before the candidate: `5dba679e3e8b23bfea9de439e0fc0c082259ef51`
- Governed audit tooling: `667ab0d2bc83f8f6347976548f30f5a1ccf6b12a`
- Candidate branch: `agent/p4c-a10-derived-i18n-lazy`
- Candidate source commit: `a07c8bc58619079d85c2daaf0efd65d58d7b514c`
- Candidate identity commit / resume commit: `202c48fe1cd5c76540dba4dfca4504732b8f884e`
- Frozen merged product target: `ad2d643dfa371c05779aafc52e0c2ecf618c1a42`
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
- The complete frozen-candidate product suite passed 510/510 once. It was not repeated.

## Formal timing stop result

Both authorized runs used the same 30-sample alternating shell-first protocol,
baseline `29a094757fbc5386d379ee73e71a30228b348308`, current
`ad2d643dfa371c05779aafc52e0c2ecf618c1a42`, and tooling
`667ab0d2bc83f8f6347976548f30f5a1ccf6b12a`.

| Run | A10-01 shell p95 | Delta | Verdict | A10-02 module p95 | Delta | Verdict |
|---|---:|---:|---|---:|---:|---|
| 1 | 1318.1 -> 1246.9 ms | -5.402% | PASS | 508.4 -> 468.5 ms | -7.848% | PASS |
| 2 | 1070.2 -> 1151.1 ms | +7.559% | FAIL | 515.0 -> 531.2 ms | +3.146% | PASS |

Preserved external evidence:

- `V:\Co work\Projects\Retail\.audit-drafts\phase4c1-browser-timing-ad2d643-run1-667ab0d-20260817`
- `V:\Co work\Projects\Retail\.audit-drafts\phase4c1-browser-timing-ad2d643-run2-667ab0d-20260817`
- Run 1 baseline/current file SHA-256: `237ce5ecc1c6116eb18e85b61090b4455cc4f258e445ee2db5acf4ef2b8f7b01` / `7bd5ce867b4de5eebb3bfb963e314ca8f60c375e3c38945fb9eacc88abde4939`.
- Run 2 baseline/current file SHA-256: `27622975770cd1ca240d45805c975d02696b7bc433f08fc09d0026119e6a7321` / `2652656f78906609ebfee1149e969f0a94191a3662a25eb5bed22628494ad86b`.

Per the owner-mandated policy, run 2's A10-01 failure ends automatic execution.
Do not run a third measurement, create another performance candidate, or start
rendered UI/APK/baseline/comparison work without Sagar's explicit disposition.

## Historical diagnostics — do not reuse as closure evidence

- Dynamic-loader candidate `8d62d42` had one full timing pass and one full timing fail and also failed governance/API review.
- Preload candidate `c7dfcbd` failed the governed A10-02 timing gate.
- Prior APK, rendered UI evidence, 29a baseline/comparisons and target-bound approvals are historical if this candidate is adopted.
- The untracked Phase 4C UI attestation on main is bound to the prior product fingerprint `47c1e9c0...`; do not commit or use it for the candidate.

## Exact remaining Phase 4C.1 sequence

1. Obtain Sagar's explicit disposition for the preserved A10-01 timing failure.
2. If Sagar accepts a recorded open A10-01 exception, do not rerun timing; proceed once with the remaining evidence sequence while keeping A10-01 open.
3. If Sagar instead authorizes remediation, define one bounded change and its invalidation cost before editing; no speculative candidate is authorized by this checkpoint.
4. Rendered UI, APK, baseline and comparison work remains intentionally not started after the failed timing stop.

## Deferred Phase 4C.2 boundary

SM-T875 is unavailable. A10-04, A10-05, physical update/OEM ETP, production ETP, UAT/legal, production signing and release approval remain explicitly deferred-not-waived. Emulator evidence must not be substituted for those gates.
