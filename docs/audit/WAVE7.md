# Wave 7 — Front-desk cluster (QMS + Service) — first P1 wave

**Date:** 2026-07-05 · **Base:** `origin/main = 7249df1` (Waves 5+6) · **Status:** ✅ **COMMITTED + PUSHED
`origin/main = b33f9c4`** · seeded APK `SaagarCC-DemoData-V6-Wave7.apk` (6.42 MB, packaged index.html SHA-verified
byte-exact + mojibake-clean) in Retail root · device-test pending. First wave of the P1 tier per
[P1_LINEUP.md](P1_LINEUP.md). Additive-only, no new libs, offline; blobs decoded→edited→re-encoded byte-verified.

## Build story
Specs from the p1-lineup workflow → 2 parallel impl agents (QMS owner = qms.html + integration-bridge.js;
Service owner = service.html) → orchestrator serially applied the 5 shell edits (index.html single-owner rule) →
seeded-harness functional pass → **9-agent adversarial verify** → 13 hardening fixes → re-verified → batch
commit/APK. (The impl workflow was interrupted mid-run by a connection drop; both agents had already finished
their edits — recovered by diff-audit against pristine blobs instead of a risky re-run.)

## The 8 features
| # | Feature | Where |
|---|---|---|
| P1-1 | Recovered-₹ capture on follow-up Convert + 'Follow-up Recovered ₹' report card (Today/7d/31d + top-5) | qms blob |
| P1-4 | 'No number given' walk-in (honest footfall; dedupe/pre-claim skipped; fu-on-close needs a mobile) | qms blob |
| P1-42 | Repeat-customer recognition: QMS entry banner + Type auto-pick (once per number); Service intake name autofill | both blobs (read-only master reads) |
| P1-2 | Archive lookup in Visit History via new read-only shell `qmsArchiveLookup` (null=unavailable vs []=empty) | qms blob + shell |
| P1-54 | Birthday/Anniversary: capture on walk-in form → bridge first-wins carry onto customer master → Home 'Greetings due today' card (wa.me wish; hidden when empty; Feb-29→Feb-28 in non-leap years) | qms blob + bridge + shell |
| P1-9 | 'Collected (this month)' tile — closed cases' delivery.finalAmt, LOCAL-month bucketing | service blob |
| P1-10 | stageLog[] transition log (real changes only; close-form changes logged; never on closed-case edits) + Avg TAT tile | service blob |
| P1-11 | Ready-for-pickup one-tap WhatsApp — composer opens with 'ready' template preselected, recipient locked; sent-log round-trip intact | service blob + shell composer templateId pass-through |

New optional fields (all inside existing keys; no key/shape changes): followups.{recoveredValue,recoveredBill,convertedAt};
customers.{noMobile,dob,anniv}; master byMobile.{dob,anniv}; service cases.stageLog[]. QMS + service round-trip whole
objects (no normalizer) → zero carry-trap; verified by reload round-trips.

## Verification
- **Harness (seeded, browser):** all 8 features end-to-end, incl. bridge dob-carry live test, P1-11 full chain
  (stage→ready→confirm→composer 'ready' preselected + real preview text), tile self-consistency (₹26,900),
  carry round-trips. **0 console errors** throughout.
- **Adversarial (9 skeptics):** **9/9 HOLD at high confidence — 0 P0, 0 P1**, 16 P2 + 32 notes.
- **13 hardening fixes applied from the pass** (all re-verified in harness):
  qms: finite-₹ clamp ('1e999'→Infinity→null vanish), fu-guard hoisted before outcome Object.assigns (phantom
  Sales-KPI), Clear resets the no-number toggle, one-shot Type flip (deliberate 'New' respected), archive
  null-vs-empty; shell: qmsArchiveLookup resolves null when engine-off/no-FS, Feb-29 greeting fold-down;
  bridge: first-wins dob/anniv (kills a 60s master-rewrite loop on conflicting dates); service: local-month
  bucketing for UTC closedAt, closeCase logs a close-form stage change, no stageLog on closed-case edits,
  quickStage notify gated on a real transition, stats-grid minmax(0,1fr)+overflow-wrap (₹ clip).
- **Documented, not fixed (accepted):** Recovered-₹ absent from print/CSV/EOD summary (spec-accepted screen-only);
  shared-mobile name/dob conflation (inherent to mobile-keyed master); blur-autofill race with Save click (name
  is still that mobile's registered name); MK_CUSTOMERS accrues blank-mobile rows (existence still useful);
  greetings use real today (not the past-date viewer); stageLog growth ~+452KB worst-case at 1200 cases (fine);
  seeded TAT shows flat 0.3d (seed artifact); stale MODULES bytes/sha256 metadata (systemic, inert, pre-existing).

## Roadmap position
P1 tier: 8 of 52 buildable items done. Next per the line-up: **Wave 8 — DSR** (P1-13 sale mobile+paymode,
P1-14 non-purchase follow-up pipeline, P1-15 EOD WhatsApp summary, P1-12 SM unlock-for-correction).
