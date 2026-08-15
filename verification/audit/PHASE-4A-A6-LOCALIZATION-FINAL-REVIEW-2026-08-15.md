# Phase 4A final localization review

**Status:** PENDING FLUENT REVIEW. No row in this package has been imported,
no reviewer decision has been recorded, and no A6 or external acceptance gate
is closed by preparing this package.

This is the single final wording-review package for the currently measured
A6-03 localization universe. Sagar (`sagarbora91`) must review every Marathi
and Hindi value in the 854-row primary CSV. The attention CSV is a derived aid
for higher-risk rows; it does not replace the all-row review.

## Identity

- Pre-import product commit:
  `832c9b612af4739908ad04c4521e9999bd86e5e6`
- Corrected governed A6 tooling:
  `29a094757fbc5386d379ee73e71a30228b348308`
- Live A6 plaintext extraction SHA-256:
  `bb642bbb20f283e0c56fe761484b94b675ea76a71958e5629b76165d5cd736f8`
- Primary review CSV:
  `verification/audit/PHASE-4A-A6-LOCALIZATION-FINAL-REVIEW-DRAFT-2026-08-15.csv`
- Primary review CSV pre-review SHA-256:
  `06215985a5001b71c06358cda1d1ef02c10e51df9534433fd5171f024bdfdcf7`
- Primary review rows / direct occurrences / unique `text_sha256` bindings:
  **854 / 854 / 854**
- Derived attention CSV:
  `verification/audit/PHASE-4A-A6-LOCALIZATION-FINAL-REVIEW-ATTENTION-2026-08-15.csv`
- Derived attention CSV SHA-256:
  `afe375f8dd30f0540feeca9edcdc5506fab025b6c80dc16c371a5ef952d24011`
- Derived attention rows: **100** unique primary-CSV rows.

The primary CSV is the approval authority. Its English text, source
coordinates and `text_sha256` values bind every proposed Marathi/Hindi pair to
the extracted source. If any wording is edited, its pre-review SHA-256 changes
and the approval sentence below must be regenerated for the new exact bytes.

## Draft provenance and validation

- 799 rows reused machine-prepared wording only when both the English text and
  full SHA-256 identity matched the prior draft exactly.
- 55 newly exposed hashes received new machine translations.
- Eight safe-literal-preservation rows received ten exact, fail-closed
  substitutions for filenames, paths, extensions, sample identifiers or
  digits.
- Twenty-nine exact-hash rows received pre-review semantic wording corrections.
- The earlier technical-literal scan identified 66 language-cell observations
  across 56 rows. During the dedicated acronym-preservation pass, 61 language
  fields across 51 rows required changes; five flagged fields were already
  compliant after the preceding corrections. All formerly flagged exact
  technical literals are present in the current draft.
- The post-correction heuristic scan leaves six `missingTechnical` observations
  across four rows. They are inspected false positives: four observations arise
  because the heuristic captures a translated English sentence fragment ending
  in `.sccbak` even though the exact `.sccbak` literal is preserved, and two
  arise because Marathi correctly renders `3 / 5` and `31` as Devanagari
  numerals. They are retained in the attention CSV rather than hidden.
- All 854 rows have nonblank Marathi and Hindi drafts, decision
  `pending-fluent-review`, and a blank reviewer. The validation scan reported
  zero blank and zero malformed-encoding/length findings.

Machine preparation, exact-literal presence and automated validation are not
evidence of fluency or semantic correctness. They only make the review bounded
and identity-checkable.

## Focused attention guide

The derived attention CSV joins four review aids while retaining the current
English, Marathi, Hindi, source and hash bindings:

1. **Same as English:** 19 language-cell flags across 14 rows (14 Marathi and
   five Hindi). Codes, sample identifiers, abbreviations and business names may
   naturally remain unchanged, but the flag is not an approved exception.
2. **Formerly missing technical literal:** 66 language-cell flags across 56
   rows. These were heuristic warnings, not confirmed mistranslations. Exact
   acronym preservation is now present, but the reviewer must still decide
   whether the resulting Marathi/Hindi sentence is natural and retains the
   intended meaning.
3. **Safe literal preservation:** eight rows containing ten mechanical
   substitutions. Mechanical correctness does not approve the surrounding
   translation.
4. **Semantic wording correction:** 29 rows changed for accounting, backup,
   restore, payroll, stock, tax or operational meaning. These corrections are
   proposed wording and still require fluent review.
5. **Current heuristic false positive:** six language-cell observations across
   four rows covering the two `.sccbak` sentence-fragment matches and the two
   Marathi Devanagari-number matches described above.

The five categories overlap. Their union is 100 rows: four safe-literal rows
also carry same-as-English flags, and five semantic-correction rows also belong
to the formerly-missing-technical set. Review of those 100 rows alone is not
sufficient; every one of the 854 primary rows remains in scope.

## Reviewer action

1. Review all 854 English/Marathi/Hindi rows in the primary CSV against their
   source context.
2. Give additional attention to all 100 rows in the derived attention CSV.
3. Correct only the Marathi or Hindi wording when needed. Do not alter English,
   source coordinates, occurrence counts or `text_sha256` bindings.
4. After any correction, recompute the primary CSV SHA-256 and use approval
   wording bound to that new hash. Do not approve the hash below if the bytes
   changed.

If the exact primary CSV identified above is accepted unchanged, send this
exact approval:

> I, Sagar (sagarbora91), reviewed all 854 rows in
> PHASE-4A-A6-LOCALIZATION-FINAL-REVIEW-DRAFT-2026-08-15.csv, pre-review
> SHA-256 06215985a5001b71c06358cda1d1ef02c10e51df9534433fd5171f024bdfdcf7.
> My review included the 19 same-as-English language-cell flags across 14 rows,
> the 56 formerly flagged technical-literal rows, the 8 safe-literal-preservation
> rows, and the 29 semantic-correction rows summarized in
> PHASE-4A-A6-LOCALIZATION-FINAL-REVIEW-ATTENTION-2026-08-15.csv, SHA-256
> afe375f8dd30f0540feeca9edcdc5506fab025b6c80dc16c371a5ef952d24011.
> I approve the exact Marathi and Hindi wording in the 854-row primary CSV for
> import with decision translate and reviewer sagarbora91. This approval covers
> localization wording only; it does not approve A6-04/A6-05 rendered
> measurements or close GATE-NATIVE-LANGUAGE before the separate
> identity-bound rendered review.

## Post-approval work and non-claims

After valid approval, automation may mark the primary rows `translate` with
reviewer `sagarbora91`, import the exact approved wording, run focused and full
tests, rerun A6-03, record the approved CSV SHA-256 and import commit, and update
the crash checkpoint.

That later import can close the static A6-03 wording work only if the governed
measurement passes. A signed 72-cell rendered capture remains required for
A6-04/A6-05, followed by a separate fluent visual approval bound to the
post-import product and rendered-evidence identities before
`GATE-NATIVE-LANGUAGE` can close. This package does not establish
physical-device acceptance, staff UAT, legal approval, production signing or
release acceptance.
