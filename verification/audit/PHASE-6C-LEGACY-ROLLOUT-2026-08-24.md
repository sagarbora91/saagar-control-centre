# Phase 6C legacy mobile rollout — 2026-08-24

**Status:** Phase 6C engineering closure complete; current and historical profiles are separately governed.

## Result

The 24,977-byte canonical legacy mobile authority now exists once at
`www/shared/module-mobile-legacy.css`. Exactly eleven legacy modules import it. Planning, Stock,
DSR, Expense, Grooming, CRO Audit, Leave and Tax have no residual delta. Service, QMS and Payroll
retain only their exact bounded module-owned delta after the shared link and before mobile boot.

The dedicated Phase 6C tool uses an explicit allowlist, frozen pre-extraction hashes, exact delta
reconstruction and isolated two-run idempotence proof. All eleven reconstructed sources equal
their pre-extraction bytes and hashes. Historical Phase 6B behavior/identity hashes remain
unchanged and are tested through reconstruction rather than being repinned.

ETP has zero imports of the legacy asset and remains 34,473 bytes, SHA-256
`b2973563b988779468471950bb777c6323580e90ac6011c9038581845b9cfa12`.

## Verification

- Phase 0: **70/70**
- security: **101/101**
- focused rollout/manifest/API-23/capability suite: green
- capability/Phase-1 focused suite: **8/8**
- rollout rerun: idempotent
- modular: **80/86**

The six modular failures are historical MAH3 whole-www/Planning canary and MAH4 Stage-B product
fingerprint receipts. Phase 6C legitimately changes the source tree, so those receipts are stale.
They remain preserved as historical evidence and were not modified to imply current review.

## Governed closure

The distinct current receipt is
`verification/audit/PHASE-6C-CURRENT-SOURCE-PROFILE-2026-08-24.json`. It binds the current WWW
fingerprint, manifest, eleven imports, three deltas, ETP exclusion and the machine-readable
Planning visual receipt. The historical MAH3/MAH4 validators explicitly reject the current tree
and pass only against byte-exact reconstructed pre-Phase6C authority; their evidence files remain
unchanged.

Registered modular tests pass **88/88**. The complete offline gate passes, including its final
**275/275** test group, and Phase 0 passes **72/72**. No APK, signing, device, Firebase,
publication or push action occurred during Phase 6C closure.
