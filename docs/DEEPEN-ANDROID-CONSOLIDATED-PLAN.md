# Saagar Control Centre Android Deepening

## Consolidated Delivery and Acceptance Plan

| Field | Value |
|---|---|
| Document status | Draft for owner approval |
| Prepared | 2026-07-29 |
| Product scope | Saagar Control Centre Android application only |
| Current controlled baseline | v2.9, versionCode 209 |
| Baseline source | `49d531bfff27e30dc1c1fcd06cc6b26dde1ff798` |
| Seeded UAT APK | `SaagarCC-DemoData-v2.9.apk` |
| Seeded APK SHA-256 | `D6A09597070D3A689BDED8EF91E4676D225B54A616E48F126F9899D11D440E96` |
| Current automated regression | 54 of 54 passing |
| Controlled device catalogue | 69 module-wise cases plus four recovery/device drills |
| Server/PHP work | Deliberately deferred and outside this plan |

This document converts the twelve improvement ideas in `Deepen the Android app.md`
into an approval-ready programme. It does not change the current acceptance
status recorded in `docs/audit/HANDOFF.md`. Until this plan is approved, the
handoff remains the controlling release record.

---

## 1. Executive decision

The programme will be delivered in four controlled phases:

1. Close, prove, and freeze the current v2.9 release.
2. Improve frontline speed and daily clarity.
3. Strengthen controls, finance, and workforce workflows.
4. Add management insight, reporting polish, and programme closure.

The former D1-D12 waves remain traceable as internal work packages. They will
not become twelve separate APK programmes. This reduces repeated build,
acceptance, documentation, and version overhead while preserving module-level
control.

Phase 0 is blocking. Improvement design and disposable prototypes may proceed
in parallel, but improvement code must not be merged into `main` until the v2.9
acceptance evidence is complete and the baseline is frozen.

The intended result is not simply a larger application. It is a faster, clearer,
safer application whose records remain explainable, recoverable, role-controlled,
and verifiably tied to the source from which each APK was built.

---

## 2. Current state and authority order

### 2.1 Confirmed current state

- The latest controlled source baseline is commit
  `49d531bfff27e30dc1c1fcd06cc6b26dde1ff798`.
- The local automated suite contains 54 tests and is currently green.
- The seeded v2.9 APK is a debug-signed UAT artefact. It is not a production
  acceptance or production signing proof.
- The current application already contains substantial Today, attention,
  quick-action, tax, backup, service, receivables, stock, leave, and
  cross-module briefing behaviour.
- The current programme is not yet production accepted.
- Provider delivery, cross-device restore, legacy migration, DAT-02 on two
  devices, security posture, legal/owner review, incident rehearsal, and
  production key custody remain controlled acceptance gates.

### 2.2 Authority order

When documents appear to disagree, use this order:

1. Observed source code, automated tests, exact build output, and device evidence.
2. `docs/audit/HANDOFF.md` for present release status and unresolved gates.
3. The current master software blueprint for module and workflow description.
4. This document for the approved future delivery sequence.
5. `Deepen the Android app.md` as the originating improvement backlog.

Any newly discovered conflict must be recorded in the verification log and
resolved before release approval.

---

## 3. Non-negotiable product and control guardrails

Every phase and work package must preserve the following:

- **Local-first operation:** core store work must remain usable without a
  dependable network connection.
- **One canonical owner per fact:** a business fact must have one source of
  truth. Other modules may consume or summarize it but must not silently create
  competing records.
- **No silent auto-merge:** duplicate suggestions may assist the user, but the
  application must not silently combine customers, transactions, service jobs,
  staff, or financial records.
- **Deterministic persistence:** a confirmed save must persist exactly once and
  survive relaunch, unless an explicit error is shown.
- **Migration safety:** every new or changed storage key requires a schema
  decision, backward-compatible migration, rollback treatment, and a test.
- **Role and store boundaries:** users see only the information and actions
  required for their role and assigned store context.
- **Privacy by design:** notices, consent, mobile-number handling, staff
  information, coaching information, retention, and deletion behaviour remain
  explicit and reviewable.
- **Controlled exports:** every new report or share route must pass through the
  existing export-control policy and denial tests.
- **Recovery completeness:** new data must be included in backup, restore,
  reset, tamper, wrong-passphrase, and cross-device tests where applicable.
- **Explainable controls:** overrides, corrections, approvals, unlocks, and
  status changes require actor, time, reason, and before/after context.
- **No security downgrade:** convenience features must not weaken
  reauthentication, fail-closed export behaviour, key handling, or private
  snapshot protection.
- **Exact build provenance:** an accepted APK must map to one clean source
  commit and one recorded checksum.
- **No hidden server dependency:** PHP, server sync, and a remote control plane
  are outside this programme.

---

## 4. Consolidated roadmap

| Phase | Outcome | Included work | Controlled release output | Blocking exit |
|---|---|---|---|---|
| Phase 0 — Close and freeze v2.9 | Prove that the current release is complete, recoverable, legally operable, secure enough for its agreed use, and tied to an exact build | 69-case seeded test pass, BKP-03, DAT-02, cross-device restore, legacy migration, owner/legal/security/device acceptance, production signing readiness | Accepted and tagged v2.9 baseline plus complete evidence set | All acceptance gates closed or explicitly rejected by the owner; no open P0/P1 defect |
| Phase 1 — Frontline speed and daily clarity | Reduce daily operating effort without weakening customer, consent, role, or audit controls | D1-D4 | One phase release candidate and one accepted release | Module evidence complete, agreed outcome metrics met, full regression green |
| Phase 2 — Controls, finance, and workforce | Improve stock, cash, expense, payroll, leave, and tax control quality | D5-D9 | One phase release candidate and one accepted release | Financial and workforce controls reconcile, migration/recovery/export tests pass |
| Phase 3 — Insight, reporting, and closure | Improve coaching, planning, explainable management insight, reporting, and final programme consistency | D10-D12 | One final deepening release and closure evidence | Full device catalogue, recovery drills, security/legal review, documentation, and owner acceptance complete |

The team works one module slice at a time inside a phase. Consolidation changes
the number of controlled releases, not the discipline of module-level design,
testing, evidence, and approval.

---

## 5. Phase 0 — Close and freeze v2.9

### 5.1 Objective

Establish a trusted production baseline before expanding functionality. Phase 0
is evidence and acceptance work, with targeted defect fixes only when a gate
fails.

### 5.2 Entry conditions

- Source commit, package identity, versionName, versionCode, APK checksum, and
  automated test result are recorded.
- Two representative API 23-or-higher Android devices are nominated.
- The approved off-device provider folder/account is nominated.
- Recovery-passphrase custodians are named.
- The device tester, evidence owner, business owner, privacy/legal reviewer,
  and production signing-key custodian are named.
- The 69-case catalogue and the four device drills have a common result format.

### 5.3 Workstream A — Freeze identity and evidence

1. Confirm that the tested APK and source commit are unchanged.
2. Record device model, Android version, installation state, tester, date/time,
   APK checksum, and test-data state for every device session.
3. Keep the source seed disabled in production-oriented source and builds.
4. Do not build an acceptance APK from a dirty working tree.
5. If any source, build configuration, signing configuration, or embedded asset
   changes, issue a new build identity and rerun the affected evidence.

### 5.4 Workstream B — Run the complete module catalogue

Run all 69 seeded module-wise cases against the nominated APK and devices.

- Execute in the controlled catalogue order.
- Capture actual result, evidence reference, tester, device, and outcome.
- Stop release acceptance on any P0 or P1 defect.
- Log P2 and P3 defects with an owner and disposition.
- Do not convert an untested case to “pass” on the basis of code inspection.
- Rerun the affected module and mandatory smoke set after every fix.

### 5.5 Workstream C — Run the four device and recovery drills

#### Drill A — DAT-02 repeated-save integrity

- Perform five controlled saves on each of the two nominated devices.
- Confirm each save persists exactly once after relaunch.
- Confirm there is no duplicate, missing, stale, or cross-store record.
- Capture the final record state and application behaviour for every attempt.

#### Drill B — BKP-03 provider delivery and retention

- Generate the encrypted off-device backup through the approved route.
- Confirm actual arrival in the nominated provider folder/account.
- Confirm retention, naming, timestamp, checksum/identity, and operator access.
- Simulate provider or delivery failure.
- Confirm visible failure status, escalation behaviour, and recovery procedure.

#### Drill C — Cross-device restore and rejection paths

- Restore the approved encrypted backup to the second device.
- Reconcile representative totals and record counts before and after restore.
- Confirm rejection of a wrong passphrase.
- Confirm rejection of tampered content.
- Confirm rejection of a private or otherwise non-importable snapshot.
- Confirm that a failed restore does not damage the existing local data.

#### Drill D — Legacy migration and API 23-class operation

- Install or load the approved legacy fixture on the representative older/API
  23-class device.
- Run the supported migration path.
- Confirm record integrity, role/store context, reports, backup, and relaunch.
- Record unsupported legacy states explicitly instead of silently discarding
  data.

### 5.6 Workstream D — Legal, security, operations, and signing

- Confirm privacy contact, notices, consent language, retention rules, and
  staff-data handling for the current build.
- Confirm the API-22 policy remains explicit: the supported floor is API 23,
  and API 22 is unsupported rather than partially or silently supported.
- Conduct staff UAT using representative roles and store contexts.
- Conduct the incident/recovery rehearsal with named operators.
- Confirm device posture and operational security requirements.
- Assign recovery-passphrase custody and production signing-key custody to
  separate named roles where practical.
- Document the production signing process and prove that it fails closed when
  required key material is unavailable or incorrect.

### 5.7 Defect and fix rule

Only a fix needed to pass the controlled v2.9 acceptance gate belongs in Phase
0. A feature improvement discovered during testing is added to the relevant
D1-D12 work package and does not expand the baseline release.

Every Phase 0 fix requires:

- a defect record and severity;
- a minimal source change;
- a permanent regression test where technically possible;
- the full 54-test suite;
- affected module cases and mandatory smoke cases;
- a new exact-commit APK identity and checksum; and
- an updated verification log.

### 5.8 Exit gate

Phase 0 closes only when:

- all 69 controlled cases have evidence-backed results;
- all four drills pass on their nominated devices and routes;
- no P0 or P1 defect remains open;
- every accepted P2/P3 exception has an owner-approved disposition;
- privacy/legal, security, staff UAT, incident rehearsal, recovery custody, and
  signing evidence are complete;
- the final APK maps to an exact clean commit and checksum;
- the handoff, verification log, release register, and master blueprint reflect
  the accepted state; and
- the owner records the release decision and the baseline is tagged.

---

## 6. Phase 1 — Frontline speed and daily clarity

### 6.1 Outcome

Make high-frequency daily work faster and clearer for store staff while
preserving customer choice, consent, role visibility, store boundaries, and
traceability.

### 6.2 Included work packages

#### D1 — Today gap hardening

The current application already has a Today brief, quick actions, KPI cards,
attention items, tax/backup indicators, and cross-module summaries. D1 must not
rebuild these features.

D1 is limited to measured gaps:

- role-specific and store-specific relevance;
- a persistent, unambiguous current-store indicator;
- clearer reauthentication reason, cancel, expiry, denial, and retry paths;
- accuracy checks for every summary against its canonical module;
- performance and rendering checks on representative devices; and
- removal of duplicate or low-value attention signals.

#### D2 — QMS fast front desk

- Shorten the common queue/walk-in path.
- Preserve no-mobile handling, consent, notice, duplicate suggestion, and
  customer-choice behaviour.
- Keep duplicate resolution human-controlled.
- Preserve exactly-once save and relaunch behaviour.

#### D3 — Service workboard

- Define canonical service statuses and permitted transitions.
- Make due, overdue, pickup, escalation, and owner information clear.
- Add checklists only where they reduce missed steps.
- Permit controlled override with actor, reason, and timestamp.
- Keep service records as the canonical source for service status.

#### D4 — DSR speed and quality

- Reduce end-of-day entry and correction effort.
- Extend the existing correction, unlock, and audit model rather than creating a
  second route.
- Make incomplete or inconsistent fields visible before finalization.
- Preserve store/date ownership and financial reconciliation.

### 6.3 Phase boundaries

- No new cloud dependency or remote live dashboard.
- No silent customer merge.
- No role-wide exposure of customer, staff, or financial details.
- No change to legal notices or consent without owner/privacy approval.
- No “fast path” may bypass reauthentication, export policy, or final-save
  validation.

### 6.4 Exit gate

- Each D1-D4 change contract is approved.
- Agreed baseline and target metrics are recorded.
- Focused module tests and mandatory core smoke tests pass.
- The complete automated regression is green.
- Privacy, role/store, persistence, backup/restore, reset, and export effects are
  tested.
- The phase APK is built from one clean commit, inspected, checksummed, and
  accepted by representative frontline users.

---

## 7. Phase 2 — Controls, finance, and workforce

### 7.1 Outcome

Improve control quality and exception handling across stock, expenses, cash,
receivables, payroll, leave, and tax without pretending that the application is
a full ERP, HRMS, or tax-filing platform.

### 7.2 Included work packages

#### D5 — Stock control

- Improve variance, count, pending-action, and ageing visibility.
- Preserve the present aggregate brand/group control-register boundary.
- Do not expand into SKU-level, serial-level, purchase-order, or warehouse ERP
  behaviour without a separately approved scope.

#### D6 — Expense, cash, and receivables

- Improve incomplete-entry, mismatch, overdue, approval, and closure cues.
- Keep recorded operational expenses distinct from tax-ready expenses.
- A missing tax document may prevent “tax ready” status but must not silently
  prevent the underlying operational expense from being recorded.
- Preserve reconciliation, correction, and audit context.

#### D7 — Payroll control

- Add a clear pre-lock checklist and exception view.
- Preserve the controlled lock/unlock route.
- Permit owner override only with reason, actor, time, and retained before/after
  evidence.
- Keep payroll visibility limited to authorized roles.

#### D8 — Leave and capacity

- Improve pending approvals, overlap, capacity, and handover visibility.
- Keep approval responsibility explicit.
- In this local application, “access removal” means local application-user
  deactivation only. It must not be represented as remote account revocation,
  device management, or organization-wide access removal.

#### D9 — Tax readiness

- Make missing evidence, classification, exception, and period readiness clear.
- Keep operational records separate from tax readiness and filing status.
- Treat output as preparation support, not professional tax advice or filing
  confirmation.
- Preserve export controls and owner/CA review boundaries.

### 7.3 Phase boundaries

- No full accounting ledger, banking integration, tax filing, HRMS, biometric
  attendance, or remote identity-management expansion.
- No financial status may be inferred from an unrelated module without a
  documented canonical-source rule.
- Every new financial or workforce field must have migration, retention,
  role-visibility, backup, restore, reset, and export treatment.

### 7.4 Exit gate

- D5-D9 change contracts are approved and implemented one module slice at a
  time.
- Representative totals, variances, approvals, corrections, and locks
  reconcile.
- No financial total or status changes solely because a dashboard/report is
  opened.
- Role, privacy, export denial, migration, backup, restore, and reset tests pass.
- The phase regression and device acceptance set pass.
- The phase APK maps to an exact commit and receives owner acceptance.

---

## 8. Phase 3 — Insight, reporting, and programme closure

### 8.1 Outcome

Add explainable management insight and better planning without turning
coaching, forecasting, or the bounded integration bus into automated judgement
or an immutable audit system.

### 8.2 Included work packages

#### D10 — Grooming and CRO coaching

- Improve coaching prompts, follow-up, and limited trend visibility.
- Keep evaluation human-reviewed and evidence-aware.
- Limit individual-level visibility to authorized roles.
- Do not create automatic disciplinary decisions, hidden ranking, or
  unexplained scores.

#### D11 — Festival and campaign planning

- Improve reusable planning, responsibility, readiness, and follow-up.
- Keep templates configurable rather than hard-coded as permanent policy.
- If forecasts are added, make them rule-based, labelled, and explainable.
- Show assumptions and allow authorized human adjustment.

#### D12 — Reports, cross-module polish, and closure

- Remove duplicated reports and conflicting labels.
- Confirm every report uses its documented canonical source.
- Improve report filters, empty/error states, totals, print/share behaviour, and
  export-control consistency.
- Improve cross-module navigation and operational traceability.
- Describe the integration bridge honestly: it is bounded, best-effort,
  eventually consistent operational context, not an immutable audit trail.
- Complete the full P2/P3 sweep and programme documentation.

### 8.3 Phase boundaries

- No opaque employee scoring.
- No automated disciplinary action.
- No machine-learning forecast claim without a separately approved design,
  dataset, evaluation, and governance plan.
- No representation of the integration bus as permanent evidence.
- No new report may bypass export authorization or expose broader data than its
  source module permits.

### 8.4 Exit gate

- D10-D12 change contracts, human-review rules, and visibility rules are
  approved.
- Reports reconcile to canonical modules.
- Forecasts and prompts are explainable and user-adjustable where applicable.
- The complete automated suite, all relevant module cases, the mandatory core
  smoke set, and the final full device catalogue pass.
- Recovery, security, legal/privacy, staff UAT, incident, signing, provenance,
  and documentation evidence are refreshed for the final release.
- The handoff and master blueprint describe the final implemented product.

---

## 9. D1-D12 traceability map

| Work package | Consolidated phase | Primary result |
|---|---|---|
| D1 Today | Phase 1 | Existing Today experience hardened for role, store, reauthentication, accuracy, and performance |
| D2 QMS | Phase 1 | Faster controlled front-desk flow |
| D3 Service | Phase 1 | Canonical, actionable service workboard |
| D4 DSR | Phase 1 | Faster and safer end-of-day completion/correction |
| D5 Stock | Phase 2 | Clear aggregate stock-control exceptions and closure |
| D6 Expense/cash/receivables | Phase 2 | Better financial completeness, reconciliation, and follow-up |
| D7 Payroll | Phase 2 | Stronger pre-lock and controlled override process |
| D8 Leave/capacity | Phase 2 | Clearer approvals, overlaps, handovers, and local deactivation |
| D9 Tax | Phase 2 | Explainable tax-readiness preparation |
| D10 Grooming/CRO | Phase 3 | Human-reviewed coaching and follow-up |
| D11 Festival planning | Phase 3 | Configurable, explainable campaign planning |
| D12 Reports/polish | Phase 3 | Consistent reports, operational traceability, and final closure |

---

## 10. Mandatory change contract for every work package

No work package enters implementation until a short change contract records:

1. Business owner and decision maker.
2. Current behaviour, observed problem, and proposed delta.
3. In-scope and explicitly out-of-scope behaviour.
4. Canonical data owner and all consuming modules.
5. Storage keys, schema version, defaults, migration, and rollback.
6. Roles, store boundaries, field visibility, and privacy impact.
7. Legal notice, consent, retention, correction, and deletion impact.
8. Export, share, print, and report routes.
9. Backup, restore, reset, tamper, and wrong-passphrase coverage.
10. Integration-bridge events, identifiers, TTL, idempotency, and failure
    behaviour.
11. Performance budget on representative devices.
12. Baseline metric, owner-approved target, guard metrics, and measurement
    method.
13. Rollback method or feature-disable route.
14. Automated test IDs, device-case IDs, evidence owner, and acceptance owner.

The contract may state “no impact,” but the reviewer must confirm that decision;
the field may not be omitted.

---

## 11. Delivery pipeline

Use the following sequence for each module slice and consolidated phase:

1. Reconfirm the exact opening baseline and run the current automated suite.
2. Resolve any P0/P1 defect before adding feature scope.
3. Approve the work-package change contract and a short UX/control design.
4. Implement through the repository’s controlled source/extract/embed pipeline.
5. Add permanent tests for new behaviour and every corrected defect.
6. Run focused tests, the complete automated suite, and source consistency
   checks.
7. Commit the release-candidate source before building the controlled APK.
8. Build from that exact clean commit.
9. Record commit, versionName, versionCode, signing class, checksum, package
   inspection, and seed status.
10. Run focused module device cases plus the mandatory core smoke set.
11. Obtain module-owner and representative-user acceptance.
12. Update the verification log, handoff, release register, and master
    blueprint.
13. Commit documentation/evidence references, push the accepted state, and tag
    the release.

If a post-build source or configuration change is required, the APK is
invalidated and steps 6-13 repeat.

### 11.1 Branch policy

- Freeze and tag the Phase 0 accepted baseline.
- Use one controlled branch per improvement phase, for example
  `phase/deepen-1-frontline`.
- Keep module slices small and reviewable within the phase branch.
- Merge the phase to `main` only after its acceptance gate passes.
- Do not mix unrelated maintenance, documentation, or experimental changes into
  the release candidate.

---

## 12. Verification strategy

### 12.1 Verification layers

| Layer | Purpose | Minimum requirement |
|---|---|---|
| Static/source checks | Protect source consistency, keys, imports, and controlled generation | Required for every implementation slice |
| Automated regression | Protect known offline and control behaviour | Never below the accepted 54-test baseline unless a replacement is approved and coverage is documented; new behaviour adds tests |
| Focused module device cases | Prove the changed workflow on representative devices | Required for each work package |
| Mandatory core smoke | Catch cross-module release breakage | Launch, role entry, store context, save/relaunch, export denial, backup-health state, and no data loss |
| Phase acceptance | Prove consolidated behaviour and metrics | Required before merge/release |
| Final programme acceptance | Re-prove complete operational and recovery posture | Full catalogue, four drills, security/privacy/legal, UAT, incident rehearsal, signing, and provenance |

### 12.2 Severity and release rule

- **P0:** data loss/corruption, security or privacy exposure, unusable launch,
  broken recovery, or materially wrong financial result. Release stops.
- **P1:** a core workflow cannot be completed, a control can be bypassed, or
  widespread incorrect behaviour has no safe workaround. Release stops.
- **P2:** important defect with a safe workaround or limited exposure. Must be
  fixed or explicitly accepted with owner, reason, and due disposition.
- **P3:** minor usability, wording, or cosmetic defect. Record and schedule by
  value.

An automated pass does not replace device evidence. A device pass does not
replace source provenance, recovery, or legal/control evidence.

---

## 13. Outcome and guard metrics

### 13.1 Metric rule

This plan does not invent numerical targets. For each work package:

1. Record the current baseline using representative tasks or records.
2. Agree the measurement method.
3. Obtain the business owner’s target before implementation.
4. Measure on the same device/workflow conditions after implementation.
5. Reject a speed improvement if a guard metric worsens.

### 13.2 Candidate outcome metrics

| Area | Candidate measure |
|---|---|
| Today | Time to identify and open the next required action; irrelevant-alert rate |
| QMS | Median common-entry time; incomplete entry rate; duplicate-review quality |
| Service | Missed follow-ups; overdue pickups; time to identify next action |
| DSR | End-of-day completion time; corrections after finalization |
| Stock | Time to identify and close variance; unresolved-age trend |
| Expense/cash/receivables | Incomplete records; reconciliation time; overdue closure |
| Payroll | Pre-lock exceptions; post-lock corrections; controlled override rate |
| Leave | Approval latency; unresolved overlap/capacity exceptions |
| Tax | Tax-ready completeness; missing-evidence age; owner/CA clarification cycles |
| Grooming/CRO | Follow-up completion; evidence gaps; reviewer correction rate |
| Festival planning | Readiness completion; overdue actions; plan-versus-actual variance |
| Reports | Reconciliation failures; export-denial failures; time to obtain a trusted result |

### 13.3 Mandatory guard metrics

- Zero data-loss or data-corruption defects.
- Zero silent duplicate confirmed saves.
- Zero materially incorrect financial totals.
- Zero export-policy bypasses.
- Zero unauthorized cross-role or cross-store disclosures.
- Zero accepted restore that should have failed tamper/passphrase/private-snapshot
  validation.
- Confirmed saves persist exactly once after relaunch.
- The automated regression does not fall below its accepted baseline.
- Representative-device performance does not regress beyond the
  owner-approved tolerance.

---

## 14. Version, build, seed, and release policy

- The present evidence baseline remains v2.9/versionCode 209.
- Work-package completion does not create a separate controlled product release.
- Use one controlled versionCode increment for each consolidated improvement
  phase, with versionName approved at the phase gate.
- Before Phase 1 implementation, centralize versionName/versionCode so that the
  build process does not depend on a forgotten hard-coded edit.
- Internal installable test builds must still have unique, documented build
  identity. They are not accepted releases.
- A seeded debug APK is for controlled UAT only.
- Production-oriented source and production builds must keep demo/source
  seeding disabled.
- Production signing is a separate fail-closed control with named key custody.
- Do not claim production acceptance from a debug signature.
- Every controlled APK record must contain the exact commit, clean-tree state,
  versionName, versionCode, signing class, APK SHA-256, test set, device set,
  and acceptance decision.
- If production packaging requires a changed build identity, record the new
  identity and repeat the applicable parity and acceptance evidence.

---

## 15. Roles and decision rights

| Role | Required decision or evidence |
|---|---|
| Business owner | Approves programme sequence, work-package scope, metric targets, accepted exceptions, and release decision |
| Module/process owner | Confirms current workflow, canonical source, acceptance cases, and business outcome |
| Engineering owner | Designs and implements the smallest compliant change; supplies source, migration, tests, build, and rollback evidence |
| Test/evidence owner | Controls case execution, evidence naming, defect linkage, device record, and verification log completeness |
| Privacy/legal reviewer | Approves notices, consent, retention, staff/customer data handling, and legal minimum |
| Security/recovery owner | Approves device posture, backup/restore controls, incident rehearsal, and recovery procedure |
| Signing-key custodian | Controls production key access and signing evidence; does not approve their own product release |
| Representative users | Perform role-appropriate UAT and record observed workflow outcome |

One person may hold more than one role in a small team, but the document must
state this explicitly. Where practical, production signing, evidence review, and
final business approval should not all be performed by the same person.

---

## 16. Principal risks and controls

| Risk | Control |
|---|---|
| Feature work hides an unproven baseline defect | Phase 0 blocks feature merge; targeted fixes only |
| D1 duplicates the existing Today implementation | Treat D1 as measured gap hardening, not a rebuild |
| Cross-module aggregation leaks role/store data or slows older devices | Contract every source, apply visibility at source and presentation, set a measured performance budget |
| New storage keys break migration or restore | Mandatory schema, migration, rollback, backup/restore/reset tests |
| Operational integration events are mistaken for permanent audit evidence | Label bridge data as bounded, best-effort context; retain canonical audit in owning modules |
| Twelve work packages create version and evidence sprawl | Three improvement releases with module-level gates |
| Employee coaching becomes opaque or punitive | Human-reviewed evidence, limited visibility, no automatic discipline |
| Faster entry bypasses controls | Preserve consent, reauthentication, validation, exactly-once save, and export denial |
| Financial convenience changes canonical totals | Canonical-source contract and reconciliation tests |
| Build and source evidence drift | Commit before build; clean tree; exact checksum; invalidate after change |
| Scope expands into ERP, HRMS, cloud sync, or tax filing | Enforce explicit phase boundaries and separate approval for expansions |
| Acceptance becomes a test-count exercise | Require device, recovery, legal, security, UAT, provenance, and outcome evidence |

---

## 17. Definition of Done

### 17.1 Work-package Done

A work package is Done only when:

- its change contract and design are approved;
- implementation and migration are complete;
- permanent tests and focused device cases pass;
- role/store, privacy, persistence, export, recovery, reset, and performance
  impacts are evidenced;
- baseline and after metrics are recorded;
- no unresolved P0/P1 defect remains;
- accepted P2/P3 issues have a documented disposition; and
- module documentation and evidence references are updated.

### 17.2 Phase Done

A phase is Done only when:

- every included work package is Done;
- the complete regression and phase device acceptance set pass;
- one exact-commit APK is inspected and checksummed;
- representative users and the business owner accept it;
- the handoff, verification log, release register, and blueprint are current;
- the accepted source is pushed and tagged; and
- rollback/recovery instructions are usable.

### 17.3 Programme Done

The Android deepening programme is Done only when:

- Phases 0-3 have passed their gates;
- the final 69-case catalogue and four recovery/device drills pass;
- privacy/legal, security, staff UAT, incident rehearsal, recovery custody, and
  production signing are accepted;
- the final application, reports, source, APK, handoff, verification log, and
  master blueprint agree; and
- the owner records final production acceptance.

---

## 18. Deliberate exclusions

The following are not part of this plan:

- PHP/server platform work;
- cloud synchronization or remote administration;
- a full ERP, warehouse, SKU/serial inventory, accounting ledger, HRMS,
  biometric attendance, banking, tax-filing, or MDM platform;
- silent automated customer/record merge;
- opaque employee ranking or automated disciplinary action;
- an immutable-audit claim for the bounded integration bridge;
- machine-learning claims without a separate governed proposal;
- production acceptance based only on an emulator, automated tests, or a
  debug-signed APK; and
- uncontrolled feature additions discovered during acceptance testing.

These may be considered later only through a separate scope, architecture,
risk, cost, and acceptance decision.

---

## 19. Immediate action plan and approval request

### 19.1 Decisions requested

The owner is asked to approve:

1. The four-phase structure and the blocking Phase 0 gate.
2. D1-D12 as internal work packages within three improvement releases.
3. Android-only scope with PHP/server work deferred.
4. One controlled version increment per consolidated improvement phase.
5. The mandatory change contract, verification layers, role separation, and
   exact-build provenance rules.

### 19.2 First actions after approval

1. Nominate the two devices, provider route, passphrase custodians, tester,
   evidence owner, legal/privacy reviewer, security/recovery owner, and signing
   custodian.
2. Freeze the v2.9 source/APK identity and open the Phase 0 evidence register.
3. Run the 69 seeded cases and four device drills.
4. Log and fix only gate-blocking defects, then rerun affected evidence.
5. Complete legal minimum, security/device, staff UAT, incident, and signing
   acceptance.
6. Update the handoff and master blueprint, record the owner decision, and tag
   the accepted baseline.
7. Measure Phase 1 baseline tasks and approve D1-D4 change contracts.
8. Open the Phase 1 branch only after the Phase 0 exit gate passes.

No implementation phase should start from assumptions that can be settled by
the Phase 0 evidence.

---

## 20. Source references

- `docs/audit/HANDOFF.md`
- `docs/Deepen the Android app.md`
- `verification/DEVICE-TEST-SCRIPT-BKP03-DAT02-RESTORE.md`
- `www/index.html`
- `www/integration-bridge.js`
- `build-overrides/apply-overrides.js`
- `package.json`
- `SaagarCC-DemoData-v2.9.apk`
- `V:\Co work\Projects\Retail\Developer Documentation\Saagar_Control_Centre_Master_Software_Blueprint_v2.9_2026-07-29.docx`

---

## 21. Approval record

| Decision | Name | Date | Notes |
|---|---|---|---|
| Programme structure approved |  |  |  |
| Phase 0 execution authorized |  |  |  |
| PHP/server exclusion confirmed |  |  |  |
| Version/release policy approved |  |  |  |
| Final plan status changed to Approved |  |  |  |
