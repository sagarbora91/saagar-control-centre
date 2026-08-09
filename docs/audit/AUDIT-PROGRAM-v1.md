# SAAGAR Control Centre — Whole-App Audit Program v1

**Created:** 2026-08-09 (Asia/Kolkata)
**Purpose:** one repeatable audit run before Modular HTML remediation and the same frozen audit after it.
**Status:** specification ready for runner implementation; baseline not yet run.

## 1. Scope and authority

### 1.1 Product scope

- Product anchor: `88ba11842613f29173f436a39ca60f12b33e5085`.
- Android/offline application, native overrides, web application, tests, build controls and current authoritative documentation.
- Includes `retail-etp-core-v1` for R003/R013/R022/R025.
- Excludes PHP/server work, Service ETP and unbuilt E2–E6 presentation.
- External real workbooks are identified only by safe hash and aggregate metadata. The audit never copies workbook bytes, rows, headers or raw PII.

### 1.2 Authority order

Code is authoritative for what the app currently does. Approved contracts, dictionaries and source evidence are authoritative for what it must do. Any disagreement is a finding; neither side silently overrides the other.

Documents are classified as `current-authority`, `superseded-checkpoint` or `historical-evidence`. Historical claims are evaluated against their stated date and scope, not against current HEAD.

## 2. Immutable identity model

Every run records:

- `productBaselineSha`;
- `auditToolingSha`;
- `auditProgramVersion`;
- runner path, byte count and SHA-256;
- tracked-tree and product-tree SHA-256;
- module manifest SHA-256;
- toolchain and OS versions;
- exact command and options;
- start/end timestamps and elapsed time.

The product fingerprint covers product-relevant tracked paths and excludes only audit control/evidence paths. The tooling commit must prove its product fingerprint equals the fingerprint at `88ba118`.

If the runner changes, increment its version and rerun the pre-migration baseline. Results from different runner versions are not directly comparable.

## 3. Preconditions and isolation

The runner refuses to start unless:

1. the audit target is a clean Git worktree at an exact commit;
2. the requested product anchor exists and is an ancestor of the tooling SHA;
3. the target product fingerprint matches the declared anchor for a baseline run, or the recorded migration target for a comparison run;
4. the complete declared test registry is available;
5. Node, JDK, Gradle, OS and relevant browser/device identities are recorded.

Audit output is written outside the audited worktree. Mutation, build and browser probes run only inside disposable worktrees or disposable copies. The runner verifies the audited tree hash before and after every probe.

No audit output may contain a suspected secret value, raw PII, workbook bytes, workbook rows, raw storage values or raw parser/native exceptions.

## 4. Result and severity contract

Every stable check reports exactly one result:

| Result | Meaning |
|---|---|
| `pass` | Measured and satisfies its decision rule. |
| `fail` | Measured and violates its decision rule. |
| `unmeasured` | Evidence could not be obtained; never equivalent to pass. |
| `na` | Genuinely outside declared scope, with a reason. |

Informational checks pass only when their measurement completes successfully; their metrics do not independently block work.

| Severity | Meaning |
|---|---|
| `P0` | Data loss, security exposure or silent corruption. Blocks remediation/migration until resolved. |
| `P1` | Plausible correctness or safety-net failure. Blocks the affected migration wave. |
| `P2` | Correctness/maintainability debt with a known safe workaround. |
| `P3` | Cosmetic or low-risk clarity debt. |
| `INFO` | Measurement only. |

An `unmeasured` mandatory check remains an open gate even when it has no defect severity.

## 5. Output contract

The external run directory is `<YYYY-MM-DD>-<HHMMSS>-<short-product-sha>` and contains:

```text
RUN.json
A1-architecture.json
A2-duplication.json
A3-capabilities.json
A4-storage.json
A5-tests.json
A6-ui.json
A7-protocol.json
A8-security.json
A9-build.json
A10-performance.json
A11-documentation.json
OPEN-GATES.json
FINDINGS.json
SUMMARY.md
```

Each check emits stable fields:

```json
{
  "id": "A4-02",
  "title": "Persistent artifact classification",
  "result": "fail",
  "severity": "P0",
  "mandatory": true,
  "metric": { "unclassifiedArtifacts": 1 },
  "rule": "Every persistent artifact has one authoritative classification",
  "evidence": [{ "path": "www/example.js", "line": 42, "code": "UNCLASSIFIED_STORAGE" }],
  "notes": ""
}
```

Evidence strings and arrays are bounded and deterministically sorted. JSON is the authority; `SUMMARY.md` is generated and never hand-edited.

## 6. Audit catalogue

### A1 — Architecture and coupling

- **A1-01:** manifest/filesystem module parity, paths, bytes and SHA-256; any mismatch is P0.
- **A1-02:** parent/global dependency census; an undeclared dependency is P1.
- **A1-03:** complete message inventory; informational.
- **A1-04:** local script/style dependency resolution; missing or remote dependency is P0.
- **A1-05:** direct business-module-to-business-module reference; any is P1.
- **A1-06:** shell/module coupling matrix; informational.
- **A1-07:** shared application asset fan-out. Fail P1 when an application-owned shared asset is consumed by at least three modules and no test references its path or basename. Vendor assets are informational.

Primary artefact: deterministic blast-radius matrix.

### A2 — Duplication and ownership

- **A2-01:** byte-identical function bodies of at least 160 normalized characters repeated in three or more product files; P2.
- **A2-02:** near-copy bodies use whitespace/comment removal, identifier normalization and SHA-256; at least 240 normalized characters and 90% token similarity across three or more product files is P2.
- **A2-03:** identical CSS declaration blocks containing at least six declarations and appearing in three or more module files is P2.
- **A2-04:** duplicated approved domain constants across two or more authority sites is P1; mere use sites are informational.
- **A2-05:** each shared concept must have one declared authority; none or more than one authority is P1.

### A3 — Semantic capability inventory

- **A3-01:** internal function inventory; informational and expected to change.
- **A3-02:** stable semantic capabilities covering routes, visible actions, permissions, persisted outcomes and failure posture; measurement failure P1.
- **A3-03:** DOM host/reference reconciliation; a definite missing host is P0.
- **A3-04:** defined-never-referenced candidates; informational.
- **A3-05:** documented capability without implementation is P1.

The migration gate is semantic capability equivalence by stable `capabilityId`, not equality of function names or handler structure. Owner-approved capability changes must appear in the comparison allowlist.

### A4 — Data and storage integrity

- **A4-01:** persistent-artifact census including literal/computed keys, native tables, Keystore aliases, files, ETP generations and device-local evidence.
- **A4-02:** every artifact must be exactly one of `portable`, `device-local`, `re-derivable-excluded` or `forbidden`, with owner and restore/reset behavior; missing/ambiguous classification is P0.
- **A4-03:** classification/use contradiction is P0.
- **A4-04:** restorable device-local evidence is P0.
- **A4-05:** definite read/write field mismatch is P1.
- **A4-06:** bypass of the declared storage/device gateway is P1.

ETP facts are intentionally `re-derivable-excluded`; their control receipt and scope registry may be portable metadata.

### A5 — Tests and guard rails

- **A5-01:** test inventory and exact registry membership; informational.
- **A5-02:** critical paths covered only by source-text assertions are P1.
- **A5-03:** every test file must be in the committed test registry with command, environment class and approved exclusion rationale; an unregistered file is P1.
- **A5-04:** money, storage, auth, backup/restore, export and ETP publication each require at least one behavioral test; absence is P0.
- **A5-05:** one deterministic mutation per critical invariant must be detected in a disposable worktree; an undetected mutation is P1; inability to run is `unmeasured`.

Raw test count and assertion ratios are supporting metrics, not standalone quality gates.

### A6 — UI, responsive behavior, i18n and accessibility

- **A6-01:** shared design-token divergence is P2.
- **A6-02:** discovered surface × viewport × language matrix; informational.
- **A6-03:** static user-facing string bypass of localization is P1 after excluding business data, proper names and approved technical labels.
- **A6-04:** rendered interactive targets must be at least 44×44 CSS pixels; normal text contrast at least 4.5:1 and large text at least 3:1. Without a rendered browser measurement the result is `unmeasured`.
- **A6-05:** each mandatory matrix cell requires identity-bound rendered evidence; absent cells are `unmeasured`, never pass.

Browser evidence does not establish physical-device or native-language acceptance.

### A7 — Protocol stability

- **A7-01:** complete message sender/receiver inventory; informational.
- **A7-02:** sent-never-handled or handled-never-sent business/control message is P1 unless explicitly classified historical/test-only.
- **A7-03:** conflicting payload shapes for one type are P1.
- **A7-04:** packaged shell/modules must be manifest/hash bound and reject an unsupported protocol version; absence is P1. Network-style negotiation is not required because all files ship in one APK.
- **A7-05:** undeclared parent/global contract use is P1.

### A8 — Security and privacy

- **A8-01:** PII flow to an unapproved sink is P0.
- **A8-02:** export path bypassing export policy is P0.
- **A8-03:** auth/PIN control that fails open is P0.
- **A8-04:** secret scan reports only rule, file, line and one-way fingerprint; any verified credential/signing secret in tracked files is P0.
- **A8-05:** reachable unapproved remote request/navigation in shipped runtime is P0. Controlled share intents, SVG namespaces, data/blob URLs and comment or licence URLs are not network behavior.

### A9 — Build and release reproducibility

- **A9-01:** two isolated builds under the same recorded toolchain compare raw APK SHA-256 and normalized entry-name/content hashes. Normalized mismatch is P1; raw-only mismatch is P2 and records timestamp/signing metadata.
- **A9-02:** version/build identity disagreement is P0.
- **A9-03:** committed production seed enablement is P0.
- **A9-04:** module manifest byte/hash mismatch is P0.
- **A9-05:** release signing that does not fail closed without secrets is P0.

### A10 — Performance and resources

- **A10-01:** shell bytes/lines/parse time; pre-run informational, post-run must not increase by more than 5% and shell bytes must decrease.
- **A10-02:** per-module bytes/open time; post-run p95 may not regress by more than 10% under the identical environment.
- **A10-03:** total shipped application asset bytes; post-run may not increase by more than 5% without an owner-approved reason.
- **A10-04:** DAT-02 five-save device gate; `unmeasured` without qualifying physical evidence.
- **A10-05:** close/reopen retained-memory delta; post-close retained delta must return within 10% of the pre-open baseline after two collection cycles. `unmeasured` without a compatible instrumentation source.

### A11 — Documentation currency

- **A11-01:** paths cited by current-authority documents must resolve; P1.
- **A11-02:** cited SHAs must exist; missing current-authority SHA is P1; unavailable external historical SHA is recorded separately.
- **A11-03:** current-authority test counts must equal measured counts; P1.
- **A11-04:** current controlling baseline must equal its declared exact SHA; P1.
- **A11-05:** direct contradictions among current-authority documents are P1.

## 7. Comparison rules

The post-migration comparison is valid only with the identical audit program and runner version, or after rerunning the baseline with the new version.

Mandatory rules:

- every mandatory baseline-measured check remains measurable;
- semantic capability IDs and outcomes remain equivalent except explicit owner-approved deltas;
- no new P0/P1 finding;
- migration-scope P0/P1 findings are zero unless explicitly owner-waived;
- storage classification gaps are zero;
- critical-control behavioral coverage cannot regress;
- duplication decreases;
- coupling and untested blast radius do not increase;
- performance comparisons use identical environment identities and the A10 tolerances;
- open physical/device/UAT/signing gates remain open until real evidence.

## 8. Consolidation

After the baseline:

1. flatten findings into `FINDINGS.json`;
2. cluster by file and concept;
3. document conflicts and trade-offs;
4. sequence remediation by dependency;
5. convert automatable findings into permanent guard rails;
6. write `docs/audit/AUDIT-CONSOLIDATED-STRATEGY-<date>.md` under separate owner approval.

The audit measures and recommends. It does not remediate product code.

## 9. Execution sequence

1. Commit this reviewed program and the current handoff above `88ba118`.
2. Implement all A1–A11 checks and runner contract.
3. Test and freeze the tooling in a separate commit.
4. Verify the tooling commit has the identical product fingerprint as `88ba118`.
5. Run the complete audit from an isolated clean snapshot.
6. Commit and push immutable baseline evidence separately.
7. Consolidate findings.
8. Begin Modular HTML remediation only after separate owner authorization.
9. Re-run this exact audit after migration and apply §7.

## 10. Explicit non-claims

This audit is not physical-device acceptance, staff UAT, fluent-language review, legal approval, penetration testing, production signing or release acceptance. Any unavailable evidence is reported `unmeasured` or in `OPEN-GATES.json`; it is never converted into a pass.
