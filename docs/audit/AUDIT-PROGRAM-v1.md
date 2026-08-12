# SAAGAR Control Centre — Whole-App Audit Program v1

**Created:** 2026-08-09 (Asia/Kolkata)
**Purpose:** one repeatable audit run before Modular HTML remediation and the same frozen audit after it.
**Status:** runner implemented; final verification/tooling freeze/baseline pending.

## 1. Scope and authority

### 1.1 Product scope

- Product anchor: `8f96480ec6ddfc99016af43a7369f57a06cb9fd6` (see §1.3 for anchor history).
- Android/offline application, native overrides, web application, tests, build controls and current authoritative documentation.
- Includes `retail-etp-core-v1` for R003/R013/R022/R025.
- Excludes PHP/server work, Service ETP and unbuilt E2–E6 presentation.
- External real workbooks are identified only by safe hash and aggregate metadata. The audit never copies workbook bytes, rows, headers or raw PII.

### 1.3 Product anchor history

| Anchor | From | Reason |
|---|---|---|
| `88ba11842613f29173f436a39ca60f12b33e5085` | 2026-08-09 | Original frozen pre-migration snapshot. |
| `f4da822378047b2fca5178953de079fa60d2d894` | 2026-08-10 | Re-anchored after 38 inert `data-action` attributes disambiguated 25 conflicting A3-02 capability IDs. |
| `fccd115cfefe136ce541331700b5a43b8269e898` | 2026-08-10 | Re-anchored after the SEC-08 fail-closed fix at `www/index.html:6358`, where a throwing `authorize()` fell through to `window.open`. |
| `8f96480ec6ddfc99016af43a7369f57a06cb9fd6` | 2026-08-10 | Re-anchored for the migration roadmap. This is the Gate 0 anchor: the frozen pre-migration snapshot the post-migration comparison is measured against. |

The anchor is the frozen **pre-migration** product snapshot, and the tooling and baseline gates require an exact product-fingerprint match against it, so any product change forces an explicit re-anchor decision rather than silent drift.

Re-anchoring on 2026-08-10 was justified because the change is migration **preparation**, not migration: at `88ba118` the acceptance oracle was broken — A3-02 was `unmeasured` on 23 conflicting capability IDs, so one ID could map to several different behaviours and a before/after comparison could not have proved anything. The new anchor is the same product with a working oracle (A3-02 `pass`, 0 conflicts).

Baseline evidence taken against `88ba118` (`verification/audit/2026-08-10-115208-7871e57`, run status `complete-with-findings-or-gaps`) remains valid history for that commit but is **superseded** as the comparison baseline. Comparison runs must use evidence produced against the current anchor.

### 1.2 Authority order

`docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2026-08-09.md` is the controlling authority for runner closure until baseline evidence is committed. Where it narrows, tightens or supersedes anything in this document, the addendum wins; this document governs only what the addendum leaves untouched. Once baseline evidence is committed, this document resumes sole authority. The addendum is a required audit-tooling input — a missing addendum is `AUDIT_TOOLING_FILESET_MISMATCH` — and, like this document, it is an audit-control path excluded from the product fingerprint.

Code is authoritative for what the app currently does. Approved contracts, dictionaries and source evidence are authoritative for what it must do. Any disagreement is a finding; neither side silently overrides the other.

Documents are classified as `current-authority`, `superseded-checkpoint` or `historical-evidence`. Historical claims are evaluated against their stated date and scope, not against current HEAD.

## 2. Immutable identity model

Every run records:

- `productBaselineSha`, `targetSha` and mode (`baseline` or `comparison`);
- `auditToolingSha` and the complete audit-tooling fileset fingerprint (file count, total bytes and tree SHA-256);
- `auditProgramVersion`, fixed for this program as `saagar-whole-app-audit-v1.0.0`;
- runner path, byte count and SHA-256;
- tracked-tree, worktree and product-tree SHA-256;
- module manifest SHA-256;
- toolchain and OS versions;
- a sanitized semantic invocation: command name and normalized options, with target/output paths replaced and external inputs represented only by safe metadata;
- start/end timestamps and elapsed time.

The product fingerprint covers product-relevant tracked paths and excludes only audit control/evidence paths. The tooling commit must prove its product fingerprint equals the fingerprint at the product anchor.

If the runner changes, increment its version and rerun the pre-migration baseline. Results from different runner versions are not directly comparable.

## 3. Preconditions and isolation

The runner refuses to start unless:

1. the target root is a clean, detached, linked Git worktree rather than the primary worktree;
2. `HEAD` exactly equals `--target-sha`;
3. `--run-tests` is present and the complete declared offline suite can produce valid, fully passing per-suite summaries;
4. the product anchor exists and is an ancestor of both the tooling commit and target; a baseline target must retain the anchor's exact product fingerprint;
5. `--audit-tooling-sha` exists, is an ancestor of the target, and its complete declared tooling fileset and fingerprint exactly match the tooling bytes at the target;
6. the output directory is absent or empty and physically outside every repository worktree; its final 7-12 hexadecimal characters are an exact prefix of `targetSha`.

Browser, timing and physical-device evidence are optional inputs, not startup preconditions. When qualifying evidence is absent or cannot be authorized, the applicable A6/A10 check is `unmeasured`; it is never inferred to pass.

Audit output is written outside the audited worktree. A5 mutation capture and the two A9 builds are runner-controlled: the runner creates fresh disposable detached worktrees at the exact target and verifies identity and cleanup. No ambient `node_modules` junction exists and there is no fallback to one: each disposable worktree installs its own dependencies with `npm ci --ignore-scripts --no-audit --no-fund`. A bounded dependency-closure identity (`fileCount`, `totalBytes`, `sha256` — aggregates only, never paths or contents) is measured after install, before Gradle and after the build, and all three must match. Each build runs under its own isolated `GRADLE_USER_HOME`, threaded through the build command so the build actually uses it, with a bounded Gradle distribution identity taken before and after. Both builds must agree exactly on the receipt-v2 record; disagreement fails `toolchainMatch`. Each build must start without an `android` directory, bootstrap it with the fixed `npm run add:android` command, and bind post-bootstrap/post-build hashes and configuration into its receipt. The audited tree fingerprint is checked before and after the controlled probes.

There are no public `--mutation-evidence` or `--build-evidence` inputs. External or hand-authored JSON cannot authorize A5 or A9; their pass paths require module-private runner provenance. Probe failure produces a bounded `unmeasured` supporting artifact, not a false pass.

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

### 4.1 Conservative static-discovery rule (A7 and A8)

A7 and A8 decide over static discovery that cannot prove it saw everything. For those checks the absence of a heuristic hit is not evidence of compliance:

| Observation | Result |
|---|---|
| Definite violation found | `fail` |
| No violation **and** explicit complete discovery authority | `pass` |
| No violation, no complete discovery authority | `unmeasured` |

A heuristically clean run never reports `pass` on its own. `pass` requires the check to declare explicit complete discovery authority (`metric.staticDiscoveryComplete === true`); anything less is `unmeasured` and remains an open gate. Comparison follows the same rule: C-07 treats a message contract as matching only when both sides are `pass` **and** both declare complete discovery authority.

A7-01 may use the runner-bound `a7-message-contract-census-v2` authority for its narrower inventory claim. Every supported sender/receiver site is included, and dynamic sites are retained as hash-bound unresolved contract rows; that authority does not upgrade A7-02, A7-03, A7-05 or any A8 absence claim. A7-04 is exempt because it decides over a closed, hash-bound set rather than heuristic discovery. A8-05 is also fail-closed: a discovered remote-capable call whose target cannot be validated is measured policy non-compliance (`fail`), not heuristic absence.

## 5. Output contract

The external run directory is `<YYYY-MM-DD>-<HHMMSS>-<7-to-12-character-targetSha-prefix>`. It contains exactly 18 files: `EVIDENCE-MANIFEST.json` plus these 17 authenticated artifacts:

```text
EVIDENCE-MANIFEST.json
RUN.json
A1-architecture.json
A2-duplication.json
A3-capabilities.json
A4-storage.json
A5-tests.json
A5-MUTATIONS.json
A6-ui.json
A7-protocol.json
A8-security.json
A9-build.json
A9-BUILD-COMPARISON.json
A10-performance.json
A11-documentation.json
OPEN-GATES.json
FINDINGS.json
SUMMARY.md
```

`EVIDENCE-MANIFEST.json` declares exactly the other 17 files and authenticates each by byte count and SHA-256. No extra file is accepted when baseline evidence is loaded.

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

Evidence strings and arrays are bounded. Central deterministic ordering is applied where it is stated, not universally: check `evidence` arrays are the only arrays that are centrally sorted **and deduplicated and length-bounded** together; `checks` is sorted by check id, and `findings` and `mandatoryUnmeasured` are sorted by id, without deduplication. Any other array in the output keeps the order its producing check assigns, which may be meaningful (for example measurement or discovery order) and is not normalised. JSON is the authority; `SUMMARY.md` is generated and never hand-edited.

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
- **A3-02:** stable semantic capabilities covering routes, visible actions, permissions, persisted outcomes and failure posture; measurement failure P1. The verdict is decided by **ID stability and uniqueness only** — a duplicate ID carrying a different outcome, an empty category, an actionless module or an overflowed inventory makes the inventory unmeasurable, and `metric.blockingCauses` names exactly which applied. **Unresolved action bindings do not decide the verdict**; they are reported as bounded evidence (`ACTION_HANDLER_BINDING_UNRESOLVED`) and as `metric.unresolvedActionBindings`. Binding resolution is heuristic static discovery over inline handlers, aliases and delegation and cannot be completed without full JavaScript lexing, so requiring zero unresolved bindings made a mandatory gate permanently unsatisfiable and masked the ID-stability signal the check exists to provide. Owner decision, 2026-08-10. Capability IDs derive from tag, type, key and stable attributes and never from the handler, so an unresolved binding cannot affect ID identity.
- **A3-03:** DOM host/reference reconciliation; a definite missing host is P0.
- **A3-04:** defined-never-referenced candidates; informational.
- **A3-05:** documented capability without implementation is P1.

The migration gate is semantic capability equivalence by stable `capabilityId`, not equality of function names or handler structure. A changed capability is accepted only through the identity-bound `capabilityApprovals` entries defined in Section 7.

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

For each registered mutation, the frozen helper runs exactly `node --test --test-reporter=tap <registered-test-file>`. Detection requires a non-zero exit and the exact registered TAP subtest line `not ok <number> - <expectedAssertion>`, with `AssertionError` or `ERR_ASSERTION` in that subtest's failure block and no setup/module/syntax failure. A generic command failure, a differently named failing test or external JSON is not mutation detection.

### A6 — UI, responsive behavior, i18n and accessibility

- **A6-01:** shared design-token divergence is P2.
- **A6-02:** discovered surface × viewport × language matrix; informational.
- **A6-03:** static user-facing string bypass of localization is P1 after excluding business data, proper names and approved technical labels.
- **A6-04:** rendered interactive targets must be at least 44×44 CSS pixels; normal text contrast at least 4.5:1 and large text at least 3:1. Without a rendered browser measurement the result is `unmeasured`.
- **A6-05:** each mandatory matrix cell requires identity-bound rendered evidence; absent cells are `unmeasured`, never pass.

Browser evidence does not establish physical-device or native-language acceptance.

The external-evidence trust policy is currently closed (`trustedSignerCount: 0`). Therefore A6 rendered evidence and A10 browser/device attestations remain `unmeasured` even if structurally valid external JSON is supplied; no such file can authorize a pass until a controlled signer/trust root is separately provisioned and frozen.

### A7 — Protocol stability

- **A7-01:** bounded, hash-bound message sender/receiver inventory, including represented unresolved sites; the frozen runner binds the complete supported-syntax census used by C-07.
- **A7-02:** sent-never-handled or handled-never-sent business/control message is P1 unless explicitly classified historical/test-only.
- **A7-03:** conflicting payload shapes for one type are P1.
- **A7-04:** packaged shell/modules must be manifest/hash bound and reject an unsupported protocol version; absence is P1. Network-style negotiation is not required because all files ship in one APK.
- **A7-05:** undeclared parent/global contract use is P1.

### A8 — Security and privacy

- **A8-01:** PII flow to an unapproved sink is P0.
- **A8-02:** export path bypassing export policy is P0.
- **A8-03:** auth/PIN control that fails open is P0.
- **A8-04:** secret scan reports only rule, file, line and one-way fingerprint; any verified credential/signing secret in tracked files is P0.
- **A8-05:** reachable unapproved remote request/navigation in shipped runtime is P0. A discovered remote-capable call with an unresolved target also fails closed until the target is structurally validated. Controlled share intents, SVG namespaces, data/blob URLs and comment or licence URLs are not network behavior.

### A9 — Build and release reproducibility

- **A9-01:** two isolated builds under the same recorded toolchain compare raw APK SHA-256 and normalized entry-name/content hashes. Normalized mismatch is P1; raw-only mismatch is P2 and records timestamp/signing metadata.
- **A9-02:** version/build identity disagreement is P0.
- **A9-03:** committed production seed enablement is P0.
- **A9-04:** module manifest byte/hash mismatch is P0.
- **A9-05:** release signing that does not fail closed without secrets is P0.

A9-01/02/05 consume only the runner-controlled two-build comparison and its post-bootstrap/post-override receipts. Ignored ambient `android/**` files and external comparison JSON are never authoritative.

### A10 — Performance and resources

- **A10-01:** shell bytes/lines/parse time; pre-run informational, post-run must not increase by more than 5% and shell bytes must decrease.
- **A10-02:** per-module bytes/open time; post-run p95 may not regress by more than 10% under the identical environment.
- **A10-03:** total shipped application asset bytes; post-run must not increase by more than 5%.
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

Comparison approval is not a generic allowlist. If supplied, it must be one identity-bound JSON envelope with this exact semantic schema:

```json
{
  "format": "SAAGAR_AUDIT_COMPARISON_APPROVALS",
  "schemaVersion": 1,
  "identity": {
    "auditProgramVersion": "saagar-whole-app-audit-v1.0.0",
    "auditToolingSha": "<40-hex frozen tooling commit>",
    "baselineManifestSha256": "<64-hex baseline EVIDENCE-MANIFEST hash>",
    "baselineTargetSha": "<40-hex baseline target>",
    "productBaselineSha": "8f96480ec6ddfc99016af43a7369f57a06cb9fd6",
    "targetSha": "<40-hex comparison target>"
  },
  "migrationScope": {
    "checkIds": ["A3-02"],
    "reason": "<non-empty migration reason>",
    "approvedBy": "<owner identity>"
  },
  "capabilityApprovals": [
    {
      "capabilityId": "<stable capabilityId>",
      "change": "added | removed | changed",
      "reason": "<non-empty reason>",
      "approvedBy": "<owner identity>"
    }
  ],
  "findingWaivers": [
    {
      "checkId": "A3-02",
      "severity": "P0 | P1",
      "findingSha256": "<64-hex hash of the exact current finding>",
      "reason": "<non-empty reason>",
      "approvedBy": "<owner identity>"
    }
  ]
}
```

`migrationScope.checkIds` must contain unique valid A1-01 through A11-99 identifiers. Capability approvals must exactly match a current `capabilityId` plus `added`, `removed` or `changed`; duplicates and stale entries fail. A finding waiver is valid only for a persistent in-scope P0/P1 whose severity and deterministic hash of `{id,result,severity,metric,evidence}` match the current finding; duplicates, stale entries and identity mismatch fail.

Mandatory comparison rules:

- every mandatory baseline-measured check remains measurable;
- semantic capability IDs and outcomes remain equivalent except exact valid `capabilityApprovals`;
- no new P0/P1 finding;
- persistent migration-scope P0/P1 findings have exact valid `findingWaivers` and do not regress beyond that waiver;
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
4. Verify the tooling commit has the identical product fingerprint as the product anchor.
5. Run the complete audit from an isolated clean snapshot.
6. Commit and push immutable baseline evidence separately.
7. Consolidate findings.
8. Begin Modular HTML remediation only after separate owner authorization.
9. Re-run this exact audit after migration and apply §7.

### 9.1 Baseline command after tooling freeze

Run this from the clean detached linked worktree whose `HEAD` is the frozen tooling commit. It is executable PowerShell and derives identity from that exact `HEAD`, so this document does not embed a self-referential tooling SHA:

```powershell
$targetSha = (git rev-parse HEAD).Trim()
$auditOutput = Join-Path ([System.IO.Path]::GetTempPath()) ((Get-Date -Format 'yyyy-MM-dd-HHmmss') + '-' + $targetSha.Substring(0, 12))
node scripts/audit/run.mjs `
  --root (Get-Location).Path `
  --output $auditOutput `
  --product-baseline 8f96480ec6ddfc99016af43a7369f57a06cb9fd6 `
  --target-sha $targetSha `
  --audit-tooling-sha $targetSha `
  --mode baseline `
  --run-tests
```

The baseline command deliberately has no build- or mutation-evidence flags. The runner performs both captures internally. Omitting browser/device evidence is permitted and produces explicit `unmeasured` gates under the closed trust policy.

### 9.2 Comparison command

The comparison run uses the migration target's exact `HEAD` for `--target-sha`, reuses the frozen audit tooling commit for `--audit-tooling-sha`, points `--baseline-evidence` at the committed 18-file baseline directory, uses a fresh output name ending in the comparison target prefix, and sets `--mode comparison --run-tests`. The runner proves the frozen tooling commit is an ancestor and that all tooling bytes still match it. Optional `--comparison-approval` is accepted only when it matches the Section 7 schema and exact baseline/current identity. Optional UI/performance inputs remain subject to the closed external-evidence trust policy.

In outline, after setting `$targetSha`, `$auditToolingSha`, `$baselineEvidence` and a fresh external `$auditOutput`:

```powershell
node scripts/audit/run.mjs --root (Get-Location).Path --output $auditOutput --product-baseline 8f96480ec6ddfc99016af43a7369f57a06cb9fd6 --target-sha $targetSha --audit-tooling-sha $auditToolingSha --mode comparison --baseline-evidence $baselineEvidence --run-tests
```

## 10. Explicit non-claims

This audit is not physical-device acceptance, staff UAT, fluent-language review, legal approval, penetration testing, production signing or release acceptance. Any unavailable evidence is reported `unmeasured` or in `OPEN-GATES.json`; it is never converted into a pass.
