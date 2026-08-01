# D3 Service Workboard - Change Contract

**Date:** 2026-07-30 (Asia/Kolkata)
**Baseline:** `main` / `origin/main` at `49d531b`
**Source state:** uncommitted D1/D2 working tree; no commit or push authorised
**Scope authority:** `docs/SAAGAR-ANDROID-MASTER-CONSOLIDATED-PLAN.md` section 8.6
**Implementation authority:** owner instruction to proceed without ETP reports
**Status:** approved for local implementation; device and owner acceptance pending

## 1. Purpose

D3 deepens the existing local-first Service module without depending on ETP
sales reports. It must make the position of every service item understandable,
prevent uncontrolled stage changes, prove pickup readiness, provide customer-
safe wording, and consolidate operational exceptions.

This contract does not authorize PHP/server work, live synchronization, cloud
delivery status, a new storage engine, or acceptance of any device-only gate.

## 2. Existing facts preserved

- Canonical Service cases remain in `saagar_wsf_v2`.
- Received/after-service photos remain in the existing `SaagarEvidence`
  IndexedDB owner; case rows retain reference booleans only.
- Existing legal notice, consent/guardian capture, controlled WhatsApp,
  print/share/export, read-only past-view, close, invoice, follow-up, and bridge
  routes remain in force.
- Existing case IDs, legacy stages, free-text employee names, and closed cases
  remain readable.
- The earlier P1 comma-money corrections are already present and are not
  reimplemented.

## 3. Canonical workboard states

| Canonical state | Legacy input accepted | Meaning |
|---|---|---|
| `received` | `received` | Item is logged and awaits assessment. |
| `estimate_waiting` | `awaiting_approval` | Assessment/estimate exists and customer decision is pending. |
| `repair` | `in_progress` | Approved service/repair work is in progress. |
| `ready` | `ready` | Work is complete and the item is awaiting pickup. |
| `on_hold` | `on_hold` | Progress is paused for a recorded operational reason. |
| `delivered` | closed case | Item has been handed over and the case is closed. |

`pickup_overdue` is a derived workboard lane, not a stored stage. A ready case
is pickup-overdue when its recorded promised/expected delivery date is before
the explicit workboard `asOf` date. This avoids an arbitrary hidden day
threshold.

Legacy stage values are normalized when read and are rewritten only when the
case is next intentionally mutated. No bulk migration runs on load.

## 4. Controlled transitions

Normal forward/resume transitions:

- received -> estimate waiting, repair, or on hold;
- estimate waiting -> repair or on hold;
- repair -> estimate waiting, ready, or on hold;
- on hold -> received, estimate waiting, or repair.

A transition outside this set is an override. Overrides require:

- the existing owner reauthentication control;
- a non-empty actor;
- a bounded reason;
- before/after stage, timestamp, and override flag in the case audit trail.

Closed/delivered cases cannot be changed through the workboard. Delivery remains
the existing `closeCase()` operation.

The form's stage field becomes display-only so a form save cannot bypass the
controlled workboard transition.

## 5. Readiness contract

Before entering or refreshing `ready`, the case must record:

- item condition checked;
- payment expectation status:
  `estimate_approved`, `advance_recorded`, `pay_at_pickup`, or
  `no_charge_warranty`;
- promised/expected pickup date;
- customer notification status:
  `pending`, `notified`, `declined`, or `unreachable`; and
- actor and timestamp.

`pending` and `unreachable` are honest statuses, not claims that notification
was delivered. They keep the case actionable in the exception panel.

Closing a case requires canonical `ready` plus a valid readiness record, in
addition to the existing five delivery acknowledgements, collection date, and
positive final amount.

## 6. Customer-safe wording

The policy returns fixed wording for received, estimate waiting, repair, ready,
on hold, and delivered. It must never interpolate internal diagnosis, condition
notes, estimate notes, employee comments, payment amounts, mobile, address, or
other customer PII. Staff may read or copy this fixed wording; controlled
message delivery remains owned by the existing shell route.

## 7. Exception contract

The workboard derives metadata-minimized, explainable exceptions:

- service overdue against the promised date;
- ready/pickup overdue against the promised date;
- exact repeat repair using complete 10-digit mobile plus exact serial number,
  or complete mobile plus exact brand and model;
- missing received-condition photo;
- missing promised date; and
- ready notification pending or unreachable.

Exception output contains stable reason code, case ID, stage, due date, severity,
and operational owner label. It does not expose customer name, mobile, address,
diagnosis, or internal notes. Repeat repair is a review signal only and is not
an automatic defect or staff finding.

## 8. Persistence and audit

- New policy logic is pure and takes an explicit `asOf` date.
- A D3 transition clones the case array, adds the readiness/audit record, then
  performs one `localStorage.setItem` through a dedicated adapter.
- The in-memory DB changes only after that write succeeds.
- On failure the module reloads the last persisted array, rerenders, and shows a
  clear failure; it must not show transition success or send a ready notice.
- Transition audit is stored on the owning case as additive optional
  `d3Transitions[]`; readiness is stored as optional `d3Readiness`.
- No new PII storage key is introduced.

## 9. Existing Service defects included

The coherent D3 module change also closes:

- stale non-zero subtotal after deleting the last estimate line; and
- stale automatic warranty follow-up after warranty months/date changes and
  re-close.

The known narrow-layout Service findings will be corrected only where the D3
workboard touches the same CSS. Device evidence is still required.

## 10. Explicit boundaries and risks

- Existing Service records carry no authoritative store tag. The workboard is
  therefore combined/untagged and must not be described as WLMHW/HEMW isolated.
- Actor/adviser text is an operational label, not proof of authenticated current
  CRO identity.
- Notification status is locally recorded evidence; it is not cloud delivery
  confirmation.
- Existing delete, invoice sequence, and broader Service form behavior are not
  expanded unless required to keep this contract safe.
- E1/E2 and every verified-sales function remain blocked without both-store ETP
  samples.

## 11. Required evidence before engineering checkpoint

- Pure policy tests for normalization, lanes, transitions, readiness,
  customer-safe wording, repeat matching, and exception minimization.
- Integration tests for workboard rendering, numeric dispatch, override reauth,
  one-write success/failure behavior, close guard, legacy compatibility, patch
  idempotency, and the two included Service defects.
- Focused D3/legal/source tests.
- Full permanent offline suite.
- Android debug packaging and exact APK checksum.
- Independent repository review with P0/P1/P2 disposition.

No real-device, UAT, legal/owner, production-signing, or release row may be
marked passed by these automated checks.
## 12. Engineering verification — 2026-07-30

Implementation is complete in the uncommitted working tree:

- focused D3 policy/integration tests: **21/21 passed**;
- full permanent offline suite: **144/144 passed**;
- deterministic patch syntax and two-run idempotency: passed;
- missing-owned-helper recovery and embedded inline-script parsing: passed;
- `git diff --check`: passed with line-ending warnings only;
- embedded Service payload: 230,602 UTF-8 bytes, SHA-256
  `ffb40f919a20eedc0162185af881a918b7725b22f8e7b65d5463a4f1f8be5afa`;
- Android debug packaging: passed; version 2.9, versionCode 209, minSdk 23,
  targetSdk 34; and
- local review APK: 7,562,266 bytes, SHA-256
  `5062FC2253ED5E294B03C0E589306D9B5BBD664BCCD744F9A7CC0F7E5554C685`.

Engineering status is **complete**. Acceptance remains **partial/pending** for
the device, staff-UAT, owner/legal, backup/restore, signing, and release
evidence listed above. No PHP/platform work was started, and no commit or push
was made.
