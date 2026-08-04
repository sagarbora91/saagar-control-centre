# D4 DSR Entry Speed & Completion Meter — Change Contract

**Date:** 2026-08-04 (Asia/Kolkata)
**Baseline:** `main` at `73d5026`; permanent offline suite 212/213
**Scope authority:** `docs/V6-IMPROVEMENT-ROAD-PLAN.md` §4, wave D4
**Status:** drafted from source inspection; awaiting owner approval to implement

## 1. Purpose

D4 deepens the existing local-first DSR module. Road-plan scope is
"DSR entry speed, completion meter, data-quality prompts", explicitly
**narrowed** — declaration entry and verification move to E3 and are out of
scope here.

This contract does not authorize PHP/server work, ETP ingestion, a new storage
engine, changes to the submit/lock/audit authority model, or acceptance of any
device-only gate.

## 2. Existing facts preserved

- Canonical DSR records remain per-staff-per-day under `SK_DSR` (`recKey()`).
- Submit-and-lock authority, SM audit, unlock-for-correction, and the
  bridge re-emit path remain in force.
- `prefillOpeningFromPrev()` (prior closing → today's opening, 7-day lookback)
  remains the entry-speed mechanism; D4 does not replace it.
- Read-only past-view and `_noRecord` rendering remain unchanged.
- No new PII storage key is introduced, and no new storage key at all. (§4.6 adds
  one optional **field** to the existing day record, per the owner's ruling.)

## 3. Defects found in the current module

Source: `MODULES[id=dsr]` payload, 172,043 bytes.

### 3.1 The completion meter is dishonest (primary D4 defect)

`updateProgress()` builds a nine-element `checks` array; **five entries are the
literal `true`**:

| # | Section | Current check |
|---|---|---|
| 1 | daystart | `true` — hardcoded |
| 2 | opening | real — all active stock categories non-empty |
| 3 | inout | `true` — hardcoded |
| 4 | sales | `true` — hardcoded |
| 5 | nonpurch | `true` — hardcoded |
| 6 | tasks | real — every `TASK_LIST` item entered |
| 7 | marketing | `true` — hardcoded |
| 8 | cleaning | real — `cp1.done && cp2.done` |
| 9 | closing | real — all active stock categories non-empty |

Consequence: a brand-new empty record renders **"5/9 sections · 56%"** in the
header meter and lights five tab dots green. The meter is not a measure of
completion; it is a constant floor of 56%.

### 3.2 Meter and submit gate disagree

`getMissingForSubmit()` requires `cleaning.cp1.done && cp1.photo` (and cp2).
`updateProgress()` checks only `.done`. A record with both checkpoints marked
done and no photos shows **9/9 · 100%** and is then refused at submit.

### 3.3 The submit refusal discards the reason

`submitDay()` calls `getMissingForSubmit(rec)`, which returns a precise,
already-worded list of what is missing — then ignores it:

```js
if (miss.length > 0) { closeModal(); toast('Complete all sections first','err'); return; }
```

The staff member is told to "complete all sections" with no indication of which.
This is the "data-quality prompts" gap in the road-plan scope.

### 3.4 Unguarded progress-bar nodes

`updateProgress()` dereferences `el('pbar-fill').style` and
`el('pbar-lbl').textContent` without a null check, while its own helper
`updateStaffMeter()` is fully try/guarded. Any render path where the progress
bar is absent throws inside `renderCurrentTab()`.

### 3.5 Carry-forward is silent

`prefillOpeningFromPrev()` copies the previous day's closing counts into today's
opening fields with no marking. Staff cannot distinguish a carried number from
one they entered, so a stale carry is indistinguishable from a fresh count.

## 4. Changes proposed

### 4.1 Honest per-section completion (new pure policy)

Introduce `www/dsr-completion-policy.js` exporting a pure
`sectionStatus(rec, ctx)` that returns, for each of the nine sections, one of:

- `complete` — the section's own evidence is present;
- `incomplete` — the section requires entry and has none;
- `not_applicable` — the section carries no completion obligation.

Sections 1/3/4/5/7 (daystart, inout, sales, nonpurch, marketing) are today's
hardcoded `true`. Each is classified explicitly rather than assumed:

| Section | Proposed rule |
|---|---|
| daystart | `complete` when the day has been started (an in/out `in` entry exists) |
| inout | `complete` when the last entry resolves (no dangling `out`) |
| sales | `complete` when bills exist **or** the day is explicitly acknowledged as a no-sales day (see §4.6) |
| nonpurch | `not_applicable` — no per-day obligation exists in the record |
| marketing | `not_applicable` — same reason |

`not_applicable` sections are excluded from the denominator. The meter reads
`done / applicable`, so an empty record reads honestly (`0/7`), and an
acknowledged zero-sale day can still reach 100%.

**This changes a number the owner currently sees.** Existing records will read
lower than before. That is the correction, not a regression.

### 4.2 Meter and submit gate share one source

`getMissingForSubmit()` is re-expressed over the same policy so the two can no
longer disagree. The submit rule itself is unchanged — same five requirements,
same wording — only its derivation moves.

### 4.3 Submit refusal names what is missing

The refusal path renders the existing `getMissingForSubmit()` strings in the
modal instead of the generic toast. Wording is reused verbatim; no new copy.

### 4.4 Guard the progress-bar nodes

`el('pbar-fill')`/`el('pbar-lbl')` become null-safe, matching
`updateStaffMeter()`'s existing discipline.

### 4.5 Mark carried-forward opening values

Fields populated by `prefillOpeningFromPrev()` are labelled as carried from the
prior day's closing, with the source date. The value is unchanged and remains
freely editable; only its provenance becomes visible. The marking is derived at
render time from the same lookback — **no new persisted field**.

### 4.6 Explicit no-sales acknowledgement (owner ruling, 2026-08-04)

The owner ruled that a day with no sales must be **affirmed, not assumed**. An
empty sales list is only complete once the staff member has explicitly confirmed
it, so "I forgot to enter the bills" and "there were genuinely no bills" stop
looking identical.

- The sales tab's empty state previously read *"Zero sales today? That's fine —
  leave this empty."* It now states that a no-sales day must be confirmed, and
  offers a **Confirm no sales today** button (with an undo).
- Confirming writes `d4NoSales = { at, by }` onto the existing day record — a new
  **field**, not a new storage key. This amends §2's "no new persisted field"
  statement; the acknowledgement is an affirmative human act and cannot be
  derived.
- The acknowledgement is only consulted when the sales list is empty. Recording a
  bill makes the section complete on its own merits.
- The control is unavailable on a submitted or past-view record, and refuses
  while bills exist.
- The confirmation records its time and the staff member, so an auditor can see
  when the day was declared empty.

**A submitted day is exempt.** Records sealed before this rule existed carry no
acknowledgement and never can; the meter must not retroactively fail evidence
that was already accepted. `unlockForCorrection()` clears `submitted`, which
correctly re-arms the requirement for anyone reopening the day.

Applicable sections therefore rise from six to seven.

## 5. Explicitly out of scope

- Declaration entry and verification (E3).
- Any ETP-derived number; D4 introduces no verified-sales concept.
- Changing what submit requires, who may unlock, or the audit trail.
- Storage-engine or `STORAGE_RULES` changes.
- The staff/SM login and PIN paths.

## 6. Risks

- **Visible metric change.** Owner and staff will see lower completion
  percentages than yesterday for the same data. Needs an owner heads-up before
  the device pass, not after.
- **A new daily step for staff.** Every genuinely empty sales day now needs one
  extra tap before the day can be submitted. Staff should be told before the
  device pass, or it will read as a bug.
- **`not_applicable` is still a judgement for nonpurch and marketing.** The
  owner's ruling covered sales. The same "affirm, don't assume" argument could be
  extended to a day with no non-purchasers or no marketing activity; that would
  be two more acknowledgements and has not been asked for.
- The DSR module has no store tag on its records; nothing in D4 changes that,
  and the meter must not be described as store-isolated.

## 7. Required evidence before engineering checkpoint

- Pure policy tests: section classification across empty/partial/complete
  records, `not_applicable` exclusion from the denominator, meter/submit
  agreement, cleaning photo parity, carry-forward provenance derivation.
- Integration tests: patcher determinism and two-run idempotency, guarded
  progress nodes, submit-refusal rendering, legacy record compatibility.
- Full permanent offline suite.
- Android debug packaging and APK checksum.

No real-device, UAT, legal/owner, signing, or release row may be marked passed
by these automated checks.

## 8. Owner decisions

**Resolved 2026-08-04 — zero-sale days.** Asked whether a day with genuinely no
sales should require an explicit "no sales today" acknowledgement or count as not
applicable, the owner ruled: **require the acknowledgement.** Implemented per
§4.6.

**Still open — nonpurch and marketing.** The ruling addressed sales. Whether a day
with no non-purchasers or no marketing activity should likewise be affirmed has
not been asked, and both remain `not_applicable` (§6).
