# E1 ETP import foundation change contract - 2026-08-01

## Slice decision

This contract authorizes **E1-0 discovery and control policy only**. It does not
authorize a production report schema, workbook parser, ETP fact database,
import UI, or publication of business metrics. Those items remain behind the
Phase 1 entry gates in the consolidated plan.

1. **Business owner and decision maker.** Saagar Traders' Owner is the business
   owner and final acceptance authority. Engineering may implement and test
   this bounded no-write policy slice, but may not approve unresolved report
   mappings or device acceptance.
2. **Current behaviour, problem, and delta.** The Android app has no controlled
   ETP import contract. The delta is a deterministic, pure policy layer for
   report/store identity, text-first normalization, dates/FY, transaction
   signs, privacy allowlisting, validation outcomes, and safe batch identity.
3. **Scope and exclusions.** In scope: pure functions and synthetic automated
   tests. Excluded: PHP/platform work, UI, file picking, XLSX/CSV parsing,
   persistence, `bcc.sqlite`, a sealed ETP store, reconciliation tolerances,
   tender mapping, report display, incentives, and schema freeze.
4. **Canonical source, grain, and consumers.** The controlling source is
   sections 6 and 8.3 of the consolidated Android plan. Candidate reports are
   R022, R025, R013, and R003, isolated by WLMHW/HEMW and FY/period. Exact
   report grains and consuming E2-E6 views remain unresolved until both-store
   samples and dictionaries are approved.
5. **Storage, defaults, migration, rollback, and re-import.** This slice writes
   no app key or file, changes no schema/default, and performs no migration or
   re-import. Rollback is removal of the new pure module and tests. The future
   ETP facts must use a separate sealed store and remain re-importable, but that
   lifecycle is not implemented here.
6. **Roles, stores, visibility, and privacy.** The policy recognizes only
   WLMHW and HEMW and never merges their identities. It grants no role access
   and renders no fields. Caller-supplied report allowlists are mandatory;
   unknown fields and explicit PII aliases are fatal before any row can become
   persistable.
7. **Notice, consent, retention, correction, and deletion.** Reviewed as no
   runtime impact for this no-write slice: it collects, retains, corrects, and
   deletes no personal or business data. Future import retention/deletion
   treatment remains a separate approval item.
8. **Export/share/print/report routes.** None are added or changed. The policy
   exposes no file bytes or business rows and is not wired to export, share,
   print, or report generation.
9. **Backup, restore, reset, tamper, and wrong-passphrase treatment.** None are
   changed because the slice persists nothing. Permanent fact-store exclusion,
   restore fencing, reset, tamper, and re-import tests remain required before
   the sealed-store slice can be accepted.
10. **Integration events, IDs, TTL, idempotency, and failures.** No events or
    external integration are introduced. Deterministic identities use approved
    store/report/FY/period plus a caller-supplied SHA-256 source hash. Unknown,
    ambiguous, or malformed inputs return stable fatal results and have no
    financial effect.
11. **Performance, memory, and package-size budget.** No workbook or data set is
    loaded by this slice. The policy must remain dependency-free, synchronous,
    bounded by caller input, and small enough to avoid a material APK-size
    change. Real XLSX memory, time, package-size, and API-23 device budgets must
    be measured and approved before selecting a parser.
12. **Baseline, target, guards, and method.** Baseline: no ETP policy exists.
    Target: deterministic results for all supported identities and explicit
    refusal for unknown/ambiguous/private input. Guards are Node unit tests,
    source-integrity parsing, and later real-sample fixtures. No device metric
    is claimed by this slice.
13. **Rollback/disable route.** The module is not loaded into production UI and
    has no feature flag or side effect. Reverting its file and tests fully
    disables it without data migration.
14. **Tests, device cases, fixtures, and owners.** Engineering owns synthetic
    automated fixtures for detection, normalization, signs, privacy, safe
    metadata, and identity. Real WLMHW and HEMW fixtures must be sanitized and
    approved before schema freeze. API-23 parser memory/time and end-to-end
    import remain device-only acceptance owned by the Owner; they cannot pass
    in this slice.
15. **Source/dictionary version and unresolved mappings.** A Titan/WLMHW raw
    archive candidate has been located outside the repository and remains
    read-only/provisional. No equivalent HEMW four-report export set has been
    located. Exact headers, store aliases, leading-zero handling, report
    allowlists, R022/R025 reconciliation grain/tolerance, transaction/tender
    dictionaries, period coverage, and restatement rules remain unresolved.
    Razorpay/AIRPAY mappings remain provisional as stated in the plan.

## Gate outcome

E1-0 may proceed because it is dependency-free and writes nothing. Production
E1 parsing, persistence, commit, UI, and schema freeze remain blocked until the
Phase 1 entry gates have evidence. No PHP/platform work is authorized.
