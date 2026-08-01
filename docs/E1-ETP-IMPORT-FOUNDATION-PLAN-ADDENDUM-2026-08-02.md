# E1 import-foundation plan addendum - 2026-08-02

This addendum records the continuation state that could not be appended to
`SAAGAR-ANDROID-MASTER-CONSOLIDATED-PLAN.md` because the Windows workspace ACL
continued to reject safe `apply_patch` updates to existing files. It does not
supersede that plan or widen E1-0 scope.

## Reviewed no-write policy outcome

The five policy-review findings from the crash checkpoint are implemented in a
reviewed replacement candidate and verified with reduced synthetic fixtures:

- approved known PII has explicit per-report drop lists and is removed before
  persistable output; unknown fields and unapproved PII still fail closed;
- bare `ENCIRCLE` is treated as an eligible amount/flag while `ENCIRCLE NO` and
  `ENCIRCLE_NUMBER` remain prohibited identifiers;
- each adapter declares non-empty required identifiers and measures, maps its
  transaction type, and prepares a row only against the exact detected header
  signature;
- caller-supplied `earliestDate`, `asOfDate`, and bounded `maxFutureDays`
  enforce deterministic historical/future plausibility; and
- reduced synthetic R022/R025/R013/R003 coverage is labelled as policy coverage,
  not full WLMHW or HEMW source acceptance.

Replacement candidate files:

- `www/etp-import-foundation.e1-reviewed.js`
- `tests/e1-etp-import-foundation.reviewed-v2.test.mjs`

The first test attempt,
`tests/e1-etp-import-foundation.reviewed.test.mjs`, is superseded and must be
excluded from any commit. Existing crash drafts and the original canonical
candidate also remain unmodified and non-commit-ready until safe patch access
is restored and the replacement is deliberately promoted.

## Verification

- replacement syntax: passed;
- reviewed focused policy tests: 8/8 passed;
- reviewed plus prior canonical focused tests: 18/18 passed;
- normal local-time offline suite: 209/210, reproducing only the known ENG-02
  UTC/Asia-Calcutta midnight filename expectation;
- offline suite with `TZ=UTC`: 210/210 passed.

## Gates unchanged

No parser, SQLite persistence, import UI, schema freeze, runtime integration,
APK, or PHP work was started. HEMW source evidence, parser/API-23 evaluation,
both-store dictionaries, R022/R025 reconciliation, and centralized build
identity remain mandatory blockers. Synthetic tests do not establish complete
WLMHW or any HEMW acceptance.

The owner's report that the latest pre-E1 APK works fine remains owner-reported
smoke evidence only. It is not formal device acceptance and no device-only gate
is passed by this addendum.
