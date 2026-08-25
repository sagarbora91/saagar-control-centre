# Phase 4A localization batch 02 review

This batch contains the next 100 highest-occurrence phrases not present in
approved batch 01 and covers 165 direct source occurrences. Marathi and Hindi
drafts were produced from the exact English rows using the connected Google
translation endpoint, then reviewed and explicitly approved by the authorized
fluent reviewer before import.

All 100 rows are recorded with decision `translate` and reviewer
`sagarbora91`, and the exact approved wording is imported into
`www/app-i18n.js`.

## Identity

- Master worklist SHA-256:
  `c38edae4f95a08ae6d0d319a52824593377afd623ff303c36b8d739b00f33564`
- Approved batch 01 CSV SHA-256:
  `6ed3534f0ee88f0909bb0004e8c761e54c4d084b7b954ad49c13c9b15fdf958f`
- Batch 02 draft CSV SHA-256:
  `243a457904e35b769ef3796d462a6c9fba06e0ebbc76446e8085e8dbdb743f17`
- Batch 02 approved CSV SHA-256:
  `1714079428cafa681d1ab51a2f947c8f473a84b790e59a3cd23349a8e0ae788a`
- Governed tooling:
  `18dcb9e5db5d33ac23433c54e36e10b9b2d571c7`
- Controlled baseline manifest SHA-256:
  `5153d6dee330cf2fb16b6fc4d6a0d11df77aa4544b47a10d5909ad7453c7771f`

## Reviewer approval

Sagar supplied this exact approval on 2026-08-15:

> I, Sagar (sagarbora91), reviewed all 100 rows in
> PHASE-4A-A6-LOCALIZATION-BATCH-02-DRAFT-2026-08-15.csv. I approve the exact
> Marathi and Hindi wording for import with decision translate and reviewer
> sagarbora91.

## Import measurement

- Imported rows: 100.
- Direct source occurrences represented: 165.
- Localization dictionary: 950 to 1,050 phrases.
- A6-03 high-confidence bypasses: 1,145 to 969 (176 fewer).
- `npm run test:language`: 4 passed.
- `node --test tests/source-integrity.test.mjs`: 8 passed.

A6-03 remains open because 969 high-confidence bypass occurrences still require
reviewed localization or a justified disposition. This batch is an independent,
crash-safe progress checkpoint; it does not claim full A6-03 closure.
