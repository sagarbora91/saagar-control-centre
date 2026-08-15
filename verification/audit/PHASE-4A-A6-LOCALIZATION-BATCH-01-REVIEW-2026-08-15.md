# Phase 4A localization batch 01 review

This batch contains the 24 highest-occurrence A6-03 phrases (80 source
occurrences) from the immutable worklist. Sagar explicitly reviewed and approved
every Marathi and Hindi value on 2026-08-15. The CSV records decision `translate`
and reviewer `sagarbora91` for all 24 rows.

## Identity

- Master worklist SHA-256:
  `c38edae4f95a08ae6d0d319a52824593377afd623ff303c36b8d739b00f33564`
- Pre-review draft CSV SHA-256:
  `6c0a0006d57edaa5e9964f6e018ebff569a64c33862e4e3051a0c4725962190a`
- Approved CSV SHA-256:
  `6ed3534f0ee88f0909bb0004e8c761e54c4d084b7b954ad49c13c9b15fdf958f`
- Governed tooling:
  `18dcb9e5db5d33ac23433c54e36e10b9b2d571c7`
- Controlled baseline:
  `verification/audit/2026-08-15-102206-18dcb9e5db5d`
- Baseline manifest SHA-256:
  `5153d6dee330cf2fb16b6fc4d6a0d11df77aa4544b47a10d5909ad7453c7771f`

## Reviewer approval

Sagar supplied this exact approval:

> I, Sagar (sagarbora91), reviewed all 24 rows in
> PHASE-4A-A6-LOCALIZATION-BATCH-01-DRAFT-2026-08-15.csv. I approve the exact
> Marathi and Hindi wording for import with decision `translate` and reviewer
> `sagarbora91`.

The batch remains bound to the immutable English/source/hash coordinates in the
master worklist. Its import and resulting A6-03 measurement are recorded in the
same crash-safe checkpoint.

## Import measurement

- Shared dictionary phrases: 926 before, 950 after.
- A6-03 high-confidence bypasses: 1,226 before, 1,145 after.
- Exact reduction: 81 occurrences. The reduction is one greater than the 80
  directly listed occurrences because an approved single-word dictionary entry
  also covered one composed static label through the existing word-map rule.
- A6-03 remains `fail`; later batches must address the remaining 1,145 without
  fabricated mappings or analyzer exclusions.
- `npm run test:language`: 4/4 pass.
- `node --test tests/source-integrity.test.mjs`: 8/8 pass.
- `git diff --check`: pass.
