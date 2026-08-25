# Phase 4A A6 localization worklist

This checkpoint converts the current A6-03 diagnostic into a reviewable external
worklist without claiming that any translation is complete.

- Source product commit: `fa1120c1a026d1525c2eb555a6aa8e29ce7e5b38`
- Governed tooling: `5a20fe5ebf534201cb24dd6602f6a9ed9a5c050c`
- Worklist: `verification/audit/PHASE-4A-A6-LOCALIZATION-WORKLIST-2026-08-14.csv`
- Worklist SHA-256: `c38edae4f95a08ae6d0d319a52824593377afd623ff303c36b8d739b00f33564`
- A6-03 occurrences: 1,226
- Unique case-insensitive English phrases: 1,105

Every row is initially `pending-fluent-review`; Marathi and Hindi are deliberately
blank. Blank cells must never be imported into `www/app-i18n.js` as English
fallbacks or fake translations.

## Review contract

For a genuine user-facing phrase, a fluent reviewer must:

1. preserve `english`, the source coordinates and `text_sha256` exactly;
2. enter natural Marathi in `mr` and natural Hindi in `hi`;
3. set `decision` to `translate`;
4. identify the reviewer in `reviewer`.

If a row is business data, a proper name, an approved technical label or analyser
noise, leave `mr` and `hi` blank and set `decision` to one of
`business-data`, `proper-name`, `technical-label` or `analyser-review`. Those
decisions require source inspection; they are not blanket exclusions.

## Import gate

No batch may enter the product until all of its rows have a non-pending decision,
every `translate` row has both reviewed translations, the English/fingerprint
binding is unchanged, and focused language/source-integrity tests pass. Each
imported batch must record its exact A6-03 occurrence reduction and be committed
and pushed independently.

After all product localization batches, regenerate the capability ledger and MAH
profiles, run the complete product suite, and only then freeze the target. The
trusted 72-cell A6-04/A6-05 rendered capture and fluent visual review remain
separate mandatory evidence.
