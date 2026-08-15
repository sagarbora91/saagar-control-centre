# Phase 4A localization batch 04 review

This is a machine-translated, human-review-required batch containing the next
100 currently measured A6-03 phrases after approved batches 01 through 03. Each
row represents one source occurrence. Marathi and Hindi drafts were produced
from the exact English rows using the connected Google translation endpoint;
this provenance does not constitute fluent review or approval.

Every row remains `pending-fluent-review`, the reviewer column is blank, and no
row has entered `www/app-i18n.js`.

## Identity

- Current A6-03 measurement before this draft: 862 bypass occurrences.
- Current candidate set represented by the worklist after dictionary filtering:
  862 rows and 862 occurrences.
- Selected batch: 100 rows and 100 occurrences.
- Master worklist SHA-256:
  `c38edae4f95a08ae6d0d319a52824593377afd623ff303c36b8d739b00f33564`
- Approved batch 01 CSV SHA-256:
  `6ed3534f0ee88f0909bb0004e8c761e54c4d084b7b954ad49c13c9b15fdf958f`
- Approved batch 02 CSV SHA-256:
  `1714079428cafa681d1ab51a2f947c8f473a84b790e59a3cd23349a8e0ae788a`
- Approved batch 03 CSV SHA-256:
  `9732d776cff4f38c5c17767552097d09c425dc272bed3f6dfa7c08ea8fc5ed2d`
- Batch 04 draft CSV SHA-256:
  `c1ea35c49a5bd7223d6f318887816f22880545ea371fcdc18f218ca309bea7de`
- Governed tooling:
  `18dcb9e5db5d33ac23433c54e36e10b9b2d571c7`
- Controlled baseline manifest SHA-256:
  `5153d6dee330cf2fb16b6fc4d6a0d11df77aa4544b47a10d5909ad7453c7771f`

## Selection and validation

The selection reproduced the governed A6-03 dictionary acceptance rules against
the current 1,150-phrase dictionary, removed every row already present in
batches 01 through 03, and then selected deterministically by occurrence count,
source path, source line and English text. The resulting current candidate count
equals the governed A6-03 measurement of 862.

All 100 English values retain their master-worklist SHA-256 binding. The batch
contains 100 unique hashes, no blank Marathi/Hindi drafts, 100 pending decisions
and 100 blank reviewer fields.

## Independent review warnings

The independent integrity audit passed the batch identity but found drafts that
need particular fluent-review attention before approval:

- Preserve the exact technical literal `.sccbak` in both languages. Two Hindi
  drafts currently shorten it to `.scbak`.
- Preserve the literal filenames `backup-*.json` and `latest.json`; the Hindi
  draft currently translates those filenames.
- Review the accounting meaning of `Reconciliation`; the drafts use terms closer
  to interpersonal conciliation than ledger reconciliation.
- The English candidate `x.checked=true)">Select all` contains an analyzer/code
  fragment before the visible label. Do not approve it as ordinary translated UI
  without an explicit reviewer disposition.
- Review `Restore verified`, `Restore engine unavailable`, `Share blocked`, and
  `Free device space and retry`; the flagged Marathi/Hindi drafts are awkward or
  change the intended grammar.

These warnings do not alter the draft. Corrections should be made directly in
the `mr`/`hi` cells while preserving the English value and `text_sha256` binding.

## Reviewer action

Review all 100 Marathi and Hindi drafts against the English wording and source
context. Corrections must identify the exact English phrase and replacement
wording. Technical abbreviations and proper names may remain unchanged only when
that is the natural reviewed UI form.

Suggested approval sentence after review:

> I, Sagar (sagarbora91), reviewed all 100 rows in
> PHASE-4A-A6-LOCALIZATION-BATCH-04-DRAFT-2026-08-15.csv. I approve the exact
> Marathi and Hindi wording for import with decision translate and reviewer
> sagarbora91.

After explicit approval, the batch will be marked reviewed, imported, measured,
tested, committed and pushed as an independent crash-safe checkpoint.
