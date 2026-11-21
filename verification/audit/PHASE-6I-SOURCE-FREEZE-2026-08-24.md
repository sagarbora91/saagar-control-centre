# Phase 6I source-freeze record — 2026-08-24

Phase 6I produces a reviewable source candidate; it is not formal approval or a production
release. Phase 6J remains the final testing, owner-approval, signing and release phase.

## Cleanup and architecture

- The manifest freezes twelve external same-origin iframe routes: Stock, Service, QMS, DSR,
  Expense, Grooming, CRO Audit, Payroll, Leave, Tax, Planning and Retail ETP.
- All eleven production imports of `shared/module-mobile-legacy.css` were removed. Its live
  rules were consolidated in original cascade order into `shared/module-mobile-common.css`;
  the temporary production asset was deleted.
- Its exact Phase 6C bytes survive only in the test fixture used for historical proof.
- QMS and Payroll retain two bounded inline deltas because they are live responsive behavior,
  not dead patches. No current module references the deleted asset.
- `ARCHITECTURE.md` records the twelve-route model and Retail ETP hybrid boundary: iframe
  presentation, bounded parent gateway and separate sealed native fact store.

## Access, storage, schema, roles and operator boundary

- Access stays parent-authorized and fail-closed; sensitive Payroll/Tax routes retain their
  device-security and role gates.
- Operational state remains in `bcc.sqlite`. Re-derivable ETP facts stay outside portable
  backup; restore fences verified reads until re-import. Non-re-derivable ETP control state
  remains durable.
- Manifest schema v2 freezes twelve modules and 33 shared assets. Manifest, golden and MAH-4
  identities were regenerated from final bytes.
- Operators must treat ETP not-ready, reconciliation-failure and restore-fence states as hard
  stops. E7 service-centre verification is explicitly deferred.

## Machine evidence and handoff

`PHASE-6I-SOURCE-FREEZE-2026-08-24.json` contains the deterministic WWW-tree SHA-256,
manifest identity, legacy inventory, Phase 6A–6I focused-test ownership and E7 deferral.
`tests/phase6i-source-freeze.test.mjs` recomputes it.

Start Phase 6J only from the clean, remote-matched source commit. Phase 6J must obtain an
owner-approved version/versionCode and explicit production-signing authority; neither is
inferred by this freeze.
