# Phase 4A localization batch 03 review

This batch contains the next 100 measured A6-03 phrases after approved batches
01 and 02. Each row represents one direct source occurrence. Marathi and Hindi
drafts were produced from the exact English rows using the connected Google
translation endpoint, then reviewed and explicitly approved by the authorized
fluent reviewer before import.

All 100 rows are recorded with decision `translate` and reviewer
`sagarbora91`, and the exact approved wording is imported into
`www/app-i18n.js`.

## Identity

- Current A6-03 measurement before this draft: 969 bypass occurrences.
- Current candidate set represented by the worklist after dictionary filtering:
  969 rows and 969 occurrences.
- Selected batch: 100 rows and 100 occurrences.
- Master worklist SHA-256:
  `c38edae4f95a08ae6d0d319a52824593377afd623ff303c36b8d739b00f33564`
- Approved batch 01 CSV SHA-256:
  `6ed3534f0ee88f0909bb0004e8c761e54c4d084b7b954ad49c13c9b15fdf958f`
- Approved batch 02 CSV SHA-256:
  `1714079428cafa681d1ab51a2f947c8f473a84b790e59a3cd23349a8e0ae788a`
- Batch 03 draft CSV SHA-256:
  `f4bb5d9eacfcd03656a5ff5e36007a28b2a20c3b5ad6917216623aaed0f3fed8`
- Batch 03 approved CSV SHA-256:
  `9732d776cff4f38c5c17767552097d09c425dc272bed3f6dfa7c08ea8fc5ed2d`
- Governed tooling:
  `18dcb9e5db5d33ac23433c54e36e10b9b2d571c7`
- Controlled baseline manifest SHA-256:
  `5153d6dee330cf2fb16b6fc4d6a0d11df77aa4544b47a10d5909ad7453c7771f`

## Selection and validation

The selection reproduced the governed A6-03 dictionary acceptance rules against
the current 1,050-phrase dictionary, removed every row already present in
batches 01 and 02, and then selected deterministically by occurrence count,
source path, source line and English text. The resulting current candidate count
equals the governed A6-03 measurement of 969.

All 100 English values retain their master-worklist SHA-256 binding. The batch
contains 100 unique hashes, no blank Marathi/Hindi drafts, 100 pending decisions
and 100 blank reviewer fields.

## Reviewer approval

Sagar supplied this approval on 2026-08-15, recorded exactly as received:

> , Sagar (sagarbora91), reviewed all 100 rows in
> PHASE-4A-A6-LOCALIZATION-BATCH-03-DRAFT-2026-08-15.csv. I approve the exact
> Marathi and Hindi wording for import with decision translate and reviewer
> sagarbora91.

The identity, username, exact file and affirmative approval are unambiguous; the
omitted initial `I` does not change the authorized decision.

## Import measurement

- Imported rows: 100.
- Direct source occurrences represented: 100.
- Localization dictionary: 1,050 to 1,150 phrases.
- A6-03 high-confidence bypasses: 969 to 862 (107 fewer).
- `npm run test:language`: 4 passed.
- `node --test tests/source-integrity.test.mjs`: 8 passed.

A6-03 remains open because 862 high-confidence bypass occurrences still require
reviewed localization or a justified disposition. This batch is an independent,
crash-safe progress checkpoint; it does not claim full A6-03 closure.
