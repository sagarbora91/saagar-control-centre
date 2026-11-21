# Phase 4C.1 crash checkpoint — 2026-08-17

Status: Phase 4C.1 controlled execution is complete with the owner-directed A10-01 performance exception remaining open. Physical and release authorities remain Phase 4C.2 work.

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

### Owner disposition

Sagar explicitly directed: `proceed with A10-01 remaining open`.

This authorizes the one-time remaining evidence sequence using the preserved run
2 timing pair. It does not convert A10-01 to pass, waive its threshold, authorize
another timing run, or authorize another performance candidate. A10-01 must stay
visible as an open performance exception in the final evidence and handoff.

## Final Phase 4C.1 evidence

- Audited comparison target: `cc9a117c5245f352922da5c9f699daa16226bbf3`.
- Controlled baseline target: `537539f76aa333f760431acb9cb21cf3bedeab7d`.
- Baseline manifest SHA-256: `3a863511a04d5a7a9f16c4042d6ec7e42b1d92356ad52c8efbaec1ea6c57f23f`.
- Approved comparison: `verification/audit/2026-08-17-220000-cc9a117c5245`.
- Approved comparison manifest SHA-256: `f2741ee762fe39caa0ba8d99b6842611ca6cd98d573ebf70fa874399337bfd5a`.
- Capability approval envelope raw SHA-256: `fbce51a37b3026fc6ea2210d45cba054e5568f5fb2cfa289ffb13236ab7a0d3d`.
- Capability approval canonical SHA-256: `0da360ff9d41acc8f023b73d66c67b205a261ceee722842cd78af0cec8baa61e`.
- C-01 through C-07 and C-09 pass. C-02 contains 107 approved deltas, zero unapproved, invalid or stale approvals. C-03 confirms exact identity binding.
- C-08 alone fails because A10-01 is intentionally retained as the measured P2 open exception (`1070.2 -> 1151.1 ms`, `+7.559%`, threshold `+5%`).
- A10-02 passes (`515.0 -> 531.2 ms`, `+3.146%`, threshold `+10%`).
- A10-04/A10-05 remain mandatory physical-device measurements and are unmeasured.
- Signed rendered evidence SHA-256 `60fd8194776a932badf8b6f565c041f49646f18101acac329d578c7a15275b1e` passes A6-04/A6-05 across all 72 cells. Sagar's exact approval closes `GATE-NATIVE-LANGUAGE` only.
- Final seeded debug-UAT APK: `SaagarCC-Phase4C1-Seeded-2Y-v2.9-ad2d643-F7F18EA3.apk`, 7,010,364 bytes, SHA-256 `f7f18ea3e3a0bd1b42b7b390e567993ad46160e0aa844a126509c28a33754287`. API-23 install-replace, installed-hash equality, launch/focus and zero-fatal checks pass.

## Historical diagnostics — do not reuse as closure evidence

- Dynamic-loader candidate `8d62d42` had one full timing pass and one full timing fail and also failed governance/API review.
- Preload candidate `c7dfcbd` failed the governed A10-02 timing gate.
- Prior APK, rendered UI evidence, 29a baseline/comparisons and target-bound approvals are historical if this candidate is adopted.
- The untracked Phase 4C UI attestation on main is bound to the prior product fingerprint `47c1e9c0...`; do not commit or use it for the candidate.

## Exact remaining Phase 4C.1 sequence

1. Do not rerun or remediate A10-01 unless Sagar explicitly opens a new bounded task.
2. Execute the deferred physical-device pack when the SM-T875 becomes available; this is Phase 4C.2 and does not reopen Phase 4C.1.
3. Complete production ETP, staff UAT/legal, production signing and release approval under their named external authorities.

## Deferred Phase 4C.2 boundary

SM-T875 is unavailable. A10-04, A10-05, physical update/OEM ETP, production ETP, UAT/legal, production signing and release approval remain explicitly deferred-not-waived. Emulator evidence must not be substituted for those gates.
