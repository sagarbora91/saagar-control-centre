# Saagar Control Centre Android Deepening

## Consolidated Approval and Execution Plan

| Document control | Value |
|---|---|
| Status | Draft for owner approval |
| Prepared | 2026-07-29 |
| Scope | Saagar Control Centre Android application |
| Current baseline | v2.9 / versionCode 209 |
| Source commit | `49d531bfff27e30dc1c1fcd06cc6b26dde1ff798` |
| Automated baseline | 54 of 54 permanent offline tests passing |
| Device catalogue | 69 module-wise cases plus four recovery/device drills |
| Server/PHP work | Deferred and excluded |

### Controlled v2.9 artefacts

| Artefact | Purpose | SHA-256 |
|---|---|---|
| `V:\Co work\Projects\Retail\SaagarCC-BKP03-DAT02-v2.9-debug.apk` | Clean-seed engineering verification for BKP-03, DAT-02, and API-23 controls | `614C8E191AED36467FE49B7E792EC70F21F4970E36312754C30B114D193EC06C` |
| `V:\Co work\Projects\Retail\SaagarCC-DemoData-v2.9.apk` | Seeded module-wise functional testing and recovery/device drills | `D6A09597070D3A689BDED8EF91E4676D225B54A616E48F126F9899D11D440E96` |

Both artefacts are debug-signed and are not production releases.

This plan consolidates the D1-D12 ideas in `Deepen the Android app.md`. It does
not alter the current acceptance status in `docs/audit/HANDOFF.md`. Until this
plan is approved, the handoff remains the controlling release record.

---

## 1. Approval decision

Deliver the remaining Android work in four controlled phases:

1. **Phase 0 - Close and freeze v2.9.**
2. **Phase 1 - Frontline speed and daily clarity.**
3. **Phase 2 - Controls, finance, and workforce.**
4. **Phase 3 - Management insight, reporting, and final closure.**

D1-D12 remain traceable work packages, but they will not become twelve
independent APK programmes. Each work package still receives its own design,
data/control contract, tests, evidence, and module acceptance. The consolidation
reduces formal releases to three improvement releases after v2.9 acceptance.

Phase 0 is blocking. Design studies and disposable prototypes may proceed in
parallel, but improvement code must not be merged into `main` until Phase 0 has
passed and the accepted v2.9 baseline has been frozen.

---

## 2. Objective

Deepen the existing application so that store work becomes faster and clearer
without weakening:

- local/offline operation;
- exactly-once persistence;
- role and store boundaries;
- privacy, notices, and consent;
- correction and override traceability;
- controlled exports;
- backup, restore, migration, and reset;
- release provenance; or
- production signing controls.

The outcome is a better-controlled application, not simply a larger one.

---

## 3. Confirmed current position

- `main` and `origin/main` are recorded at
  `49d531bfff27e30dc1c1fcd06cc6b26dde1ff798`.
- v2.9 uses versionCode 209, minSdk 23, and target API 34.
- API 22 is explicitly unsupported. It is not a partial-support or fail-open
  exception.
- The permanent offline regression suite is green at 54 of 54.
- The seeded functional/device catalogue contains 69 cases.
- Today, quick actions, KPI cards, attention items, tax/backup indicators, and
  cross-module brief behaviour already exist.
- BKP-03, DAT-02, and API-23 engineering work is source-complete, but the
  controlled physical-device evidence remains open.
- Provider delivery/retention, cross-device restore, legacy migration,
  two-device DAT-02, security posture, legal/owner evidence, staff UAT,
  incident rehearsal, recovery custody, and production signing remain release
  gates.
- Production release acceptance has not occurred.
- PHP/server platform work is deferred and is not authorized by this plan.

### Authority order

When evidence or documents disagree, resolve them in this order:

1. Observed source, exact build output, automated results, and device evidence.
2. `docs/audit/HANDOFF.md` for current release status and open gates.
3. The latest master software blueprint for module/workflow description.
4. This approved plan for future delivery sequence.
5. `Deepen the Android app.md` as the originating idea backlog.

Every conflict must be recorded and resolved before release approval.

---

## 4. Non-negotiable guardrails

1. **Local-first:** core store operations must work without dependable network
   access.
2. **Canonical ownership:** every business fact has one owning module. Other
   modules may read or summarize it but must not create a competing truth.
3. **No silent merge:** the application may suggest duplicates but must not
   silently merge customers, staff, service jobs, transactions, or financial
   records.
4. **Exactly-once persistence:** a confirmed save persists once and survives
   relaunch, or the user receives an explicit failure.
5. **Migration safety:** every changed storage key has a schema, default,
   migration, rollback treatment, and test.
6. **Role/store privacy:** information and actions remain limited by role and
   assigned store context.
7. **Legal clarity:** notices, consent, mobile-number handling, retention,
   correction, and deletion impacts are reviewed.
8. **Controlled output:** every report, export, share, or print route passes
   through the export policy and denial tests.
9. **Recovery completeness:** new data participates correctly in backup,
   restore, reset, tamper, wrong-passphrase, and cross-device behaviour.
10. **Explainable control:** corrections, overrides, unlocks, approvals, and
    status changes retain actor, time, reason, and before/after context.
11. **No security downgrade:** speed improvements do not weaken
    reauthentication, private snapshots, export denial, or key handling.
12. **Exact provenance:** every accepted APK maps to one clean commit, build
    identity, signing class, and checksum.
13. **Metadata-only evidence:** Git, logs, screenshots, and verification records
    must not contain customer data, provider URIs, PINs, passphrases, backup
    keys, production signing material, or other secrets.
14. **No hidden platform expansion:** PHP, cloud sync, remote administration,
    and MDM are outside this programme.

---

## 5. Consolidated roadmap

| Phase | Purpose | Work included | Formal output | Exit condition |
|---|---|---|---|---|
| 0 - Close/freeze v2.9 | Establish a trusted production baseline | 69 cases, four drills, targeted fixes, legal/security/UAT/incident/signing acceptance | Accepted v2.9 baseline, complete evidence, release record, tag | Every blocking gate closed; no open P0/P1 |
| 1 - Frontline speed | Make high-frequency daily work faster and clearer | D1-D4 | One controlled phase release | Module and core tests pass; agreed outcomes achieved; owner accepts |
| 2 - Controls/finance/workforce | Improve operational and financial control quality | D5-D9 | One controlled phase release | Reconciliation, migration, privacy, recovery, and export gates pass |
| 3 - Insight/reporting/closure | Improve coaching, planning, reports, consistency, and final acceptance | D10-D12 | One final deepening release | Full regression, catalogue, drills, legal/security/UAT/signing, and documentation close |

Consolidation changes the number of releases, not the evidence required for each
module.

---

## 6. Phase 0 - Close and freeze v2.9

### 6.1 Purpose

Prove the current release before expanding it. Only a correction required to
pass a current v2.9 gate belongs in this phase. Improvement ideas discovered
during testing are assigned to D1-D12.

### 6.2 Entry checklist

- [ ] Confirm source commit, package identity, versionName, versionCode, and APK
      checksums.
- [ ] Nominate two representative Android 6/API-23-or-higher devices, including
      the oldest supported class available.
- [ ] Nominate the approved provider folder/account.
- [ ] Nominate a 12-or-more-character recovery passphrase under controlled
      custody.
- [ ] Name the business owner, tester, evidence owner, privacy/legal reviewer,
      security/recovery owner, and production signing-key custodian.
- [ ] Fix evidence naming, device-session metadata, and defect severity rules.
- [ ] Confirm screenshots and logs will be redacted and metadata-only.

### 6.3 Freeze identity

1. Record each device model, Android version, installation state, tester,
   date/time, APK checksum, and test-data state.
2. Use the seeded APK only for the controlled functional and device-drill work
   for which it was prepared.
3. Use clean-seed source/builds for engineering and production-oriented checks.
4. Keep `DEMO_SEED_ENABLED=false` in production-oriented source/builds.
5. Never build an acceptance APK from a dirty working tree.
6. If source, configuration, embedded assets, signing, or build identity
   changes, invalidate the prior APK evidence and rerun affected gates.

### 6.4 Run the 69-case catalogue

- Use the controlled CORE/QMS/SVC/DSR/STK/EXP/GRM/CRO/PAY/LEV/TAX/PLN/RPT/SEC/LEG
  test IDs.
- Record expected result, actual result, device, tester, date/time, evidence
  reference, and outcome.
- Stop acceptance on a P0 or P1 defect.
- Do not mark a device case passed from code inspection alone.
- After a fix, rerun the affected module, mandatory core smoke, and all relevant
  recovery/control cases.

### 6.5 Run the four device drills

#### Drill A - DAT-02 five-save gate

Run five complete encrypted saves on both nominated devices at the agreed
representative real-data volume.

For each device require:

- export p95 at or below 150 ms;
- visible frame-gap p95 at or below 250 ms;
- total-save p95 at or below 3000 ms;
- no save error;
- no application-not-responding event;
- each confirmed save present exactly once after relaunch; and
- no duplicate, missing, stale, or cross-store record.

A failure on either accepted device reopens the worker/storage-engine rewrite
before acceptance can continue.

#### Drill B - BKP-03 provider delivery and retention

- Generate the encrypted off-device backup through the owner-approved Storage
  Access Framework provider route.
- Confirm actual arrival in the nominated provider folder/account.
- Confirm daily, `latest`, weekly, and monthly `.sccbak` outputs.
- Confirm timestamp, bytes/identity, naming, retention, provider-side GFS
  pruning, rename/fallback behaviour, and operator access.
- Simulate provider/delivery failure.
- Confirm visible failure, retry/escalation behaviour, and recovery procedure.
- Do not claim closed-app background execution; current scope runs at first
  active use of a new day and during active sessions.

#### Drill C - Cross-device restore and rejection

- Restore an approved portable `.sccbak` to the second/fresh device.
- Reconcile representative control totals and counts before and after restore.
- Confirm clear rejection of a wrong passphrase.
- Confirm clear rejection of tampered content.
- Confirm that device-bound private snapshots reject on the other device.
- Confirm that a failed restore leaves existing local data unharmed.

#### Drill D - Legacy migration and oldest supported device

- Load the approved legacy fixture on the representative API-23-class device.
- Execute the supported migration route.
- Confirm record integrity, role/store context, reports, relaunch, backup, and
  restore.
- Record unsupported legacy states explicitly; do not silently discard data.

### 6.6 Legal, security, operations, and signing

- Confirm current privacy contact, notices, consent language, retention rules,
  and staff/customer data handling.
- Confirm the API-22 policy: minimum supported Android level is API 23; API 22
  cannot install v2.9.
- Conduct role- and store-representative staff UAT.
- Conduct the incident/recovery rehearsal with named operators.
- Confirm device posture and operational security requirements.
- Record recovery-passphrase custody.
- Record production signing-key custody.
- Prove release signing fails closed when the required key material is absent or
  incorrect.
- Create the signed production release only after key custody and all preceding
  gates are complete.

### 6.7 Defect correction rule

Every Phase 0 correction requires:

- a linked defect and severity;
- the smallest safe source change;
- a permanent regression test where technically possible;
- the full permanent automated suite;
- affected device cases and mandatory smoke;
- a new exact-commit APK identity and checksum; and
- an updated verification log.

### 6.8 Phase 0 exit gate

- [ ] All 69 cases have evidence-backed results.
- [ ] All four drills pass on the nominated devices/routes.
- [ ] No P0 or P1 remains open.
- [ ] Every accepted P2/P3 has an owner, reason, and disposition.
- [ ] Legal/privacy, security, UAT, incident, recovery-custody, and signing
      evidence is complete.
- [ ] The final APK maps to an exact clean commit and checksum.
- [ ] The handoff, verification log, release register, and master blueprint
      agree.
- [ ] The owner records the release decision.
- [ ] The accepted baseline is pushed and tagged.

---

## 7. Phase 1 - Frontline speed and daily clarity

### 7.1 D1 - Today gap hardening

Today already has a brief, quick actions, KPI cards, attention items, tax and
backup indicators, and cross-module summaries. D1 is not a rebuild.

Implement only measured gaps:

- role- and store-specific relevance;
- a persistent, unambiguous current-store indicator;
- clearer reauthentication purpose, cancel, expiry, denial, and retry paths;
- summary reconciliation to each canonical module;
- representative-device performance checks; and
- removal of duplicated or low-value attention signals.

### 7.2 D2 - QMS fast front desk

- Shorten the common queue/walk-in route.
- Preserve no-mobile handling, notices, consent, and customer choice.
- Preserve human-controlled duplicate review; never silently merge.
- Preserve exactly-once save and relaunch.

### 7.3 D3 - Service workboard

- Define canonical service statuses and permitted transitions.
- Make due, overdue, pickup, escalation, and owner information clear.
- Use checklists only where they reduce missed steps.
- Allow controlled override with actor, reason, and timestamp.
- Keep service records as the canonical service-status source.

### 7.4 D4 - DSR speed and quality

- Reduce end-of-day entry and correction effort.
- Extend the existing correction/unlock/audit model; do not create a parallel
  route.
- Show incomplete or inconsistent fields before finalization.
- Preserve store/date ownership and financial reconciliation.

### 7.5 Phase 1 boundaries

- No cloud dependency or remote live dashboard.
- No silent customer merge.
- No widened customer, staff, or financial visibility.
- No legal-notice/consent change without owner/privacy approval.
- No fast path around reauthentication, export control, validation, or final
  save.

### 7.6 Phase 1 exit

- D1-D4 change contracts and metric targets approved.
- Focused module tests and mandatory core smoke pass.
- Full permanent regression passes.
- Role/store, privacy, persistence, migration, backup/restore/reset, export, and
  performance effects pass.
- One exact-commit phase APK is inspected, checksummed, and accepted by
  representative frontline users and the owner.

---

## 8. Phase 2 - Controls, finance, and workforce

### 8.1 D5 - Stock

- Improve count, variance, pending-action, and ageing visibility.
- Preserve the aggregate brand/group control-register boundary.
- Do not expand into SKU/serial, purchase-order, warehouse, or ERP behaviour
  without separate approval.

### 8.2 D6 - Expense, cash, and receivables

- Improve incomplete-entry, mismatch, overdue, approval, and closure cues.
- Keep “operationally recorded” separate from “tax ready.”
- Missing tax evidence may prevent tax-ready status but must not silently block
  recording the underlying operational expense.
- Preserve reconciliation, correction, actor, reason, and before/after context.

### 8.3 D7 - Payroll

- Add a clear pre-lock checklist and exception view.
- Preserve controlled lock/unlock.
- Allow owner override only with actor, reason, time, and retained before/after
  evidence.
- Limit payroll data to authorized roles.

### 8.4 D8 - Leave and capacity

- Improve pending approval, overlap, capacity, and handover visibility.
- Keep approval responsibility explicit.
- “Access removal” means local application-user deactivation only. Do not
  represent it as remote revocation, MDM, or organization-wide access removal.

### 8.5 D9 - Tax readiness

- Make missing evidence, classification, exceptions, and period readiness
  clear.
- Keep operational recording separate from tax readiness and filing status.
- Treat output as preparation support, not tax advice or filing confirmation.
- Preserve export controls and owner/CA review.

### 8.6 Phase 2 boundaries

- No accounting ledger, banking integration, tax filing, HRMS, biometric
  attendance, or remote identity-management expansion.
- No status inferred from another module without a documented canonical-source
  rule.
- Every new financial/workforce field requires schema, migration, retention,
  role, backup, restore, reset, and export treatment.

### 8.7 Phase 2 exit

- D5-D9 contracts and targets approved.
- Representative totals, variances, approvals, corrections, and locks
  reconcile.
- Opening a dashboard/report cannot mutate canonical financial state.
- Role/privacy, export denial, migration, backup/restore/reset, automated
  regression, and device acceptance pass.
- One exact-commit phase APK is inspected, checksummed, and accepted.

---

## 9. Phase 3 - Insight, reporting, and closure

### 9.1 D10 - Grooming and CRO coaching

- Improve human-reviewed coaching prompts and follow-up.
- Keep individual visibility limited to authorized roles.
- Retain evidence and reviewer context.
- Do not create hidden ranking, automatic disciplinary decisions, or
  unexplained scoring.

### 9.2 D11 - Festival and campaign planning

- Improve reusable planning, ownership, readiness, and follow-up.
- Keep templates configurable rather than hard-coded as permanent policy.
- Keep forecasts rule-based, labelled, explainable, and adjustable by authorized
  users.

### 9.3 D12 - Reports, cross-module polish, and closure

- Remove duplicate reports and conflicting labels.
- Reconcile each report to a documented canonical source.
- Improve filters, empty/error states, totals, print/share, and export-control
  consistency.
- Improve cross-module navigation and operational traceability.
- Describe the integration bridge accurately: bounded to 2,000 events, recent
  producer activity at 7 days, bus retention at 14 days, best-effort, and
  eventually consistent. It is not an immutable audit trail.
- Complete the P2/P3 defect sweep and final documentation.

### 9.4 Phase 3 boundaries

- No opaque employee scoring or automated disciplinary action.
- No machine-learning claim without a separate dataset, evaluation, risk, and
  governance proposal.
- No permanent-audit claim for the bounded integration bridge.
- No report may bypass export authorization or widen source-module visibility.

### 9.5 Phase 3 exit

- D10-D12 contracts, targets, review rules, and visibility rules approved.
- Reports reconcile to canonical modules.
- Prompts/forecasts are explainable and human-controlled.
- Full automated regression, relevant module tests, mandatory smoke, and final
  69-case catalogue pass.
- The four recovery/device drills, legal/privacy, security, UAT, incident,
  signing, provenance, handoff, verification log, release register, and master
  blueprint are refreshed and accepted.

---

## 10. D1-D12 traceability

| Work package | Phase | Intended result |
|---|---|---|
| D1 Today | 1 | Existing Today experience hardened for role, store, reauthentication, accuracy, and performance |
| D2 QMS | 1 | Faster controlled front-desk work |
| D3 Service | 1 | Canonical, actionable service workboard |
| D4 DSR | 1 | Faster, safer end-of-day completion and correction |
| D5 Stock | 2 | Clear aggregate stock exceptions and closure |
| D6 Expense/cash/receivables | 2 | Better completeness, reconciliation, and follow-up |
| D7 Payroll | 2 | Stronger pre-lock and controlled override |
| D8 Leave/capacity | 2 | Clear approvals, overlap, handover, and local deactivation |
| D9 Tax | 2 | Explainable tax-readiness preparation |
| D10 Grooming/CRO | 3 | Human-reviewed coaching and follow-up |
| D11 Festival planning | 3 | Configurable, explainable campaign planning |
| D12 Reports/polish | 3 | Consistent reporting, operational traceability, and final closure |

---

## 11. Mandatory change contract

Before implementation, every work package must record:

1. Business owner and final decision maker.
2. Current behaviour, measured problem, and proposed change.
3. In-scope and explicitly excluded behaviour.
4. Canonical data owner and consuming modules.
5. Storage keys, schema/version, defaults, migration, and rollback.
6. Roles, store boundaries, field visibility, and privacy impact.
7. Notice, consent, retention, correction, and deletion impact.
8. Export, share, print, and report routes.
9. Backup, restore, reset, tamper, and wrong-passphrase coverage.
10. Integration events, identifiers, TTL, idempotency, and failure behaviour.
11. Representative-device performance budget.
12. Baseline measure, approved target, guard metrics, and measurement method.
13. Rollback or feature-disable route.
14. Automated test IDs, device-case IDs, evidence owner, and acceptance owner.

“No impact” is a permitted answer only after review; a field may not be omitted.

---

## 12. Delivery pipeline

Use this sequence for each module slice and phase:

1. Reconfirm the exact opening baseline and run the permanent automated suite.
2. Resolve any P0/P1 before adding feature scope.
3. Approve the change contract and short UX/control design.
4. Implement through the controlled source/extract/embed process.
5. Add permanent tests for new behaviour and corrected defects.
6. Run focused tests, full regression, and source-consistency checks.
7. Commit the release-candidate source before building.
8. Build from that exact clean commit.
9. Record commit, versionName, versionCode, signing class, checksum, package
   inspection, and seed status.
10. Run focused device cases and mandatory core smoke.
11. Obtain module-owner and representative-user provisional acceptance.
12. Merge the verified phase without unrelated changes.
13. Build the final controlled APK from the resulting exact clean `main` commit.
14. Repeat provenance/package checks, mandatory smoke, and final owner
    acceptance.
15. Update verification log, handoff, release register, and master blueprint.
16. Commit/push the accepted documentation and tag the release.

Any post-build source, configuration, asset, or signing change invalidates the
APK and repeats the applicable steps.

### Branch policy

- Freeze/tag the accepted Phase 0 baseline.
- Use one controlled branch per improvement phase, such as
  `phase/deepen-1-frontline`.
- Keep module slices small and independently reviewable.
- Do not mix unrelated maintenance, documentation, or experiments into a phase
  candidate.
- Final release acceptance applies to the exact `main` commit used for the final
  APK, not merely to a pre-merge branch build.

---

## 13. Verification strategy

| Layer | Purpose | Requirement |
|---|---|---|
| Static/source | Protect controlled generation, keys, imports, and invariants | Every implementation slice |
| Permanent regression | Protect established offline/control behaviour | Never below the accepted 54-test baseline unless an approved replacement documents equal/better coverage; add tests for new behaviour |
| Focused module device | Prove the changed workflow | Every work package |
| Mandatory core smoke | Detect cross-module breakage | Launch, role entry, store context, save/relaunch, export denial, backup-health state, no data loss |
| Phase acceptance | Prove consolidated behaviour and outcomes | Before final merge/release |
| Programme acceptance | Re-prove operational/recovery posture | Full catalogue, four drills, legal/security/UAT/incident/signing/provenance |

### Severity

- **P0:** data loss/corruption, privacy/security exposure, unusable launch,
  broken recovery, or materially wrong financial result. Stop release.
- **P1:** core workflow cannot complete, a control is bypassed, or widespread
  incorrect behaviour has no safe workaround. Stop release.
- **P2:** important but safely work-aroundable/limited defect. Fix or obtain
  explicit owner disposition.
- **P3:** minor usability, wording, or cosmetic issue. Record and prioritize.

Automated success never substitutes for device, recovery, legal, security, or
provenance evidence.

---

## 14. Metrics

### Metric rule

Do not invent numerical targets.

For each work package:

1. Measure the current workflow under representative conditions.
2. Agree the measurement method.
3. Obtain the owner’s target before implementation.
4. Measure the revised workflow under the same conditions.
5. Reject an apparent speed gain if a guard metric worsens.

### Candidate outcomes

| Area | Candidate measure |
|---|---|
| Today | Time to find/open next action; irrelevant-alert rate |
| QMS | Common-entry time; incomplete rate; duplicate-review quality |
| Service | Missed follow-ups; overdue pickups; time to next action |
| DSR | End-of-day completion time; post-finalization corrections |
| Stock | Time to identify/close variance; unresolved age |
| Expense/cash/receivables | Incomplete records; reconciliation time; overdue closure |
| Payroll | Pre-lock exceptions; post-lock corrections; override rate |
| Leave | Approval latency; unresolved overlap/capacity exceptions |
| Tax | Readiness completeness; missing-evidence age; clarification cycles |
| Grooming/CRO | Follow-up completion; evidence gaps; reviewer correction |
| Festival | Readiness completion; overdue actions; plan/actual variance |
| Reports | Reconciliation failures; denial failures; time to trusted result |

### Guard metrics

- Zero data loss/corruption.
- Zero silent duplicate confirmed saves.
- Zero materially wrong financial totals.
- Zero export-policy bypass.
- Zero unauthorized cross-role/cross-store disclosure.
- Zero invalid restore accepted.
- Confirmed saves persist exactly once after relaunch.
- Permanent regression does not fall below the accepted baseline.
- Performance remains inside the approved representative-device budget.

---

## 15. Version, build, and release policy

- Preserve the present evidence identity at v2.9/versionCode 209.
- A work-package completion is not a formal release.
- Use one controlled versionCode increment per consolidated improvement phase.
- Approve versionName at each phase gate.
- Before Phase 1, centralize versionName/versionCode; the release process must
  not rely on a forgotten hard-coded edit in `apply-overrides.js`.
- Internal installable builds still need unique documented identity but are not
  accepted releases.
- A seeded/debug APK is controlled UAT material only.
- Production-oriented source/builds keep demo seeding disabled.
- Production signing remains fail-closed under named key custody.
- Never infer production acceptance from a debug signature.
- Every controlled APK record includes clean-tree state, exact commit,
  versionName, versionCode, signing class, SHA-256, seed state, test set, device
  set, and acceptance decision.
- If production packaging changes build identity, issue the new identity and
  repeat parity and applicable acceptance evidence.

---

## 16. Roles and decision rights

| Role | Responsibility |
|---|---|
| Business owner | Approves sequence, scope, targets, exceptions, and release |
| Module/process owner | Confirms workflow, canonical source, cases, and outcome |
| Engineering owner | Implements smallest compliant change and supplies migration, test, build, and rollback evidence |
| Test/evidence owner | Controls cases, device metadata, defect links, and verification log |
| Privacy/legal reviewer | Approves notices, consent, retention, and data handling |
| Security/recovery owner | Approves posture, backup/restore, incident, and recovery procedure |
| Signing-key custodian | Controls production key access and signing evidence |
| Representative users | Conduct role-appropriate UAT |

One person may hold multiple roles in a small team, but this must be explicit.
Where practical, signing, evidence review, and final business approval should
not all be performed by one person.

---

## 17. Risks and controls

| Risk | Control |
|---|---|
| New features conceal an unproven v2.9 defect | Blocking Phase 0; targeted fixes only |
| D1 repeats existing Today work | Gap-hardening scope based on measured current behaviour |
| Aggregation leaks data or slows older devices | Canonical-source/visibility contract and performance budget |
| New keys break migration/restore | Mandatory schema, migration, rollback, recovery, and reset tests |
| Bridge data is mistaken for permanent audit | Explicit bounded/best-effort wording; canonical audit remains in owning module |
| Twelve packages create release sprawl | Three improvement releases with module-level evidence |
| Coaching becomes opaque/punitive | Human review, evidence, restricted visibility, no automatic discipline |
| Fast paths bypass controls | Mandatory consent, reauthentication, validation, save, and export checks |
| Financial convenience changes totals | Canonical ownership and reconciliation tests |
| Source/APK evidence drifts | Commit before build; clean tree; exact checksum; invalidate on change |
| Scope expands into ERP/HRMS/cloud/tax filing | Explicit exclusions and separate approval |
| Acceptance becomes only a test count | Device, recovery, legal, security, UAT, incident, signing, and outcome gates |

---

## 18. Definition of Done

### Work package Done

- Approved change contract and design.
- Implementation and migration complete.
- Permanent tests and focused device cases pass.
- Role/store, privacy, persistence, export, recovery, reset, and performance
  effects pass.
- Before/after metric recorded.
- No unresolved P0/P1.
- P2/P3 disposition recorded.
- Module documentation/evidence updated.

### Phase Done

- Every included work package is Done.
- Full regression and phase device set pass.
- Final APK maps to the exact clean `main` commit and checksum.
- Representative users and owner accept.
- Handoff, verification log, release register, and blueprint agree.
- Source/documentation are pushed and release is tagged.
- Rollback/recovery instructions are usable.

### Programme Done

- Phases 0-3 pass.
- Final 69-case catalogue and all four drills pass.
- Legal/privacy, security, staff UAT, incident, recovery custody, and production
  signing pass.
- Application, source, APK, reports, handoff, verification log, release
  register, and master blueprint agree.
- Owner records final production acceptance.

---

## 19. Deliberate exclusions

- PHP/server platform work.
- Cloud synchronization, remote administration, or MDM.
- Full ERP, warehouse/SKU/serial inventory, accounting ledger, banking, tax
  filing, HRMS, or biometric attendance.
- Silent record/customer merge.
- Opaque employee ranking or automated disciplinary action.
- Immutable-audit claims for the integration bridge.
- Machine-learning claims without a separate governed proposal.
- Production acceptance based only on emulator tests, automated tests, or a
  debug APK.
- Uncontrolled feature additions discovered during acceptance.

Any excluded item requires separate scope, architecture, risk, cost, and
acceptance approval.

---

## 20. Immediate approval and action

### Decisions requested

- [ ] Approve the four-phase structure and blocking Phase 0.
- [ ] Approve D1-D12 as work packages within three improvement releases.
- [ ] Confirm Android-only scope and continued PHP/server deferral.
- [ ] Approve one controlled version increment per improvement phase.
- [ ] Approve the change contract, verification, role, evidence, and exact-build
      rules.

### Actions after approval

1. Nominate devices, provider route, passphrase custodians, tester, evidence
   owner, legal/privacy reviewer, security/recovery owner, and signing
   custodian.
2. Freeze v2.9 source/APK identity and open the Phase 0 evidence register.
3. Run the 69 seeded cases and four device drills.
4. Correct only gate-blocking defects and rerun affected evidence.
5. Complete legal minimum, security/device, staff UAT, incident, recovery
   custody, and signing acceptance.
6. Update the handoff and master blueprint, record the decision, push, and tag
   the accepted baseline.
7. Measure Phase 1 baselines and approve D1-D4 change contracts.
8. Open the Phase 1 branch only after Phase 0 closes.

---

## 21. Source references

- `docs/audit/HANDOFF.md`
- `docs/Deepen the Android app.md`
- `verification/DEVICE-TEST-SCRIPT-BKP03-DAT02-RESTORE.md`
- `www/index.html`
- `www/integration-bridge.js`
- `build-overrides/apply-overrides.js`
- `package.json`
- `V:\Co work\Projects\Retail\SaagarCC-BKP03-DAT02-v2.9-debug.apk`
- `V:\Co work\Projects\Retail\SaagarCC-DemoData-v2.9.apk`
- `V:\Co work\Projects\Retail\Developer Documentation\Saagar_Control_Centre_Master_Software_Blueprint_v2.9_2026-07-29.docx`

---

## 22. Approval record

| Decision | Name | Date | Notes |
|---|---|---|---|
| Programme structure approved |  |  |  |
| Phase 0 execution authorized |  |  |  |
| PHP/server exclusion confirmed |  |  |  |
| Version/release policy approved |  |  |  |
| Plan status changed to Approved |  |  |  |
