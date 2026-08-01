# layout-planning — layout audit

**Target:** planning.html
**Findings:** 6

**Coverage notes:** Scope: planning.html is a single-screen module — one add/edit form card (top) plus a JS-rendered list of festival cards, each with a header (name/badges/Edit/Delete), optional note, a 3-item KPI row, a target progress bar, and a per-card checklist with an add-row. Edit reuses the top form (no separate modal); the only dialog is native confirm() for delete (unstyled, not a layout concern). No tables anywhere, so checklist items 3 (table scroll wrappers) and 6 (sticky headers) do not apply. No fixed-px modal/card widths exist; the only hard px width is .kpi>div{min-width:96px} (finding L-planning-03).\n\nConfirmed statically: (1) module has ZERO @media queries; (2) planning (M11) has NO per-module MOBILE_CSS block per the pipeline doc — it relies only on base bcc-mobile rules; (3) the base containment rule matches class=\"grid\" via [class*=grid] but only applies min-width:0/max-width:100%, so it does NOT collapse the 2-col form grid (L-planning-01, the highest-value defect). The module authors no bcc-mobile-scoped CSS, so there is no mobile-rule-leaking-to-desktop (checklist #9) from the module itself; the desktop-vs-mobile deltas here come entirely from the shell's unconditional 44px/16px floors and the width media queries (920/640) which fire in both modes.\n\nNEEDS LIVE BROWSER / DEVICE CONFIRMATION: exact date-input clipping in a ~161px 2-col cell with the forced 16px font + 44px height at 360/412 (L-01); real-world overflow of a ₹1cr+ amount in the 96px KPI column (L-03); whether the transient bottom toast actually collides with the shell back-home FAB stack and body padding-bottom (L-05); mobile-keyboard coverage of the lower-card checklist input (L-04) — none observable headless. The 44px floor bloat on .btn.xs / per-row ✕ (L-02) is deterministic from CSS and needs only an eyeball for acceptability. All fix hints are additive module-CSS/JS only; the clean fix for L-01 (collapse grid to 1fr via a module @media) lives in the module's own CSS. No fix touches storage-core.js / sqlite-store.js / photo-store.js, adds libraries, or changes storage. English-only app, so no localization flagged.

---

## [P1] L-planning-01 — Form grid stays 2-column at 360px — no @media and MOBILE_CSS containment does not change columns
- **Module/area:** planning | **Confidence:** high | **Combo:** 360xMobile,412xMobile,360xDesktop
- **Location:** planning.html <style> .grid (line 16); form card div.grid (lines 46-54)
- **Defect:** The add/edit form uses `.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}` and the module contains ZERO @media rules. Planning (M11) has no per-module MOBILE_CSS block. The only base bcc-mobile rule that touches it is the containment rule `html.bcc-mobile .contain,[class*=grid],.wrap,.content>*{min-width:0;box-sizing:border-box;max-width:100%}` which matches class="grid" but only sets min-width/max-width — it does NOT override grid-template-columns. So the two date pickers (Start/End) and the two number targets (Titan World / Helios) render side-by-side in ~161px cells at 360px (body padding 14px both sides → ~332px usable, minus 10px gap → ~161px each).
- **Evidence:** .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}  — no @media in module; MOBILE_CSS `[class*=grid]{min-width:0;box-sizing:border-box;max-width:100%}` does not alter columns
- **Impact:** At 360x/412x Mobile and 360 Desktop each date/number cell is only ~161px wide while the shell control floor forces min-height:44px and font-size:16px on the inputs. type=date fields show the localized date plus a calendar-picker glyph; at 161px/16px the displayed date can clip and the pair feels cramped. Core flow still works (usable, workaroundable) so P1 not P0, but this is the primary responsive miss for the module — nothing collapses the grid to 1 column on a phone.
- **Fix hint:** Add a module @media(max-width:640px){.grid{grid-template-columns:1fr}} (module CSS is editable; additive, no libraries). Since M11 has no per-module mobile block, this in-module rule is the cleanest offline fix. Verify the 1fr collapse across 360/412 Mobile.

## [P2] L-planning-02 — 44px control-height floor bloats compact .btn.xs and per-row ✕ delete buttons
- **Module/area:** planning | **Confidence:** high | **Combo:** all
- **Location:** planning.html .btn.xs (line 20); card header Edit/Delete row (line 141); checklist ✕ button (line 138); checklist Add button (line 148)
- **Defect:** `.btn.xs{padding:5px 9px;font-size:11.5px}` is intentionally a compact micro-button. The shell control floor `button,.btn{min-height:44px !important}` (uniform CSS) overrides this. Every Edit/Delete in the card header, the green Add on the checklist row, and — most visibly — the per-line ✕ delete on EACH checklist item is forced to 44px tall. The ✕ button also hits the 44px min-width path.
- **Evidence:** .btn.xs{padding:5px 9px;font-size:11.5px}  vs uniform floor `button,.btn... min-height:44px !important`; per-row `<button class="btn xs red" ...>✕</button>`
- **Impact:** Each checklist row (`.chk{padding:6px 0;font-size:13px}`) is a single ~13px text line, but its trailing ✕ becomes a 44x44 block, making every checklist item ~44px tall and the whole list visually bloated / misaligned (checkbox + text vertically centered against an oversized button). Header Edit+Delete become tall pills. Degraded density but fully functional. Applies in both modes because the floor is unconditional; most noticeable on Mobile where lists are long.
- **Fix hint:** No safe module-only override beats the shell !important floor without touching shared CSS; document as an accepted consequence of the global 44px floor, or (if the shell allows a per-module relax) add `html[data-mod="planning"] .chk .btn.xs{min-height:0 !important}` in the shell MOBILE/uniform layer — but that edits shared CSS, so leave to shell owners. Do NOT edit storage-core/sqlite/photo-store.

## [P2] L-planning-03 — Long ₹ target/actual amounts can overflow narrow KPI columns (min-width:96px, no wrap/ellipsis)
- **Module/area:** planning | **Confidence:** medium | **Combo:** 360xMobile,412xMobile
- **Location:** planning.html .kpi>div{flex:1;min-width:96px} / .kpi b{font-size:16px} (line 30); render KPI block (lines 143-145)
- **Defect:** KPI figures render via inr() as `₹1,23,45,678`-style strings inside `.kpi b{font-size:16px}` within `.kpi>div{flex:1;min-width:96px}`. There is no overflow/ellipsis/word-break handling. A ₹ amount is a single unbroken token (commas do not create break opportunities), so a large target/actual (a jeweller's festival target can easily be ₹1 crore+) exceeds 96px at 16px and cannot wrap. The sub `<span>` 'Target (TW ₹… · HE ₹…)' packs two more amounts.
- **Evidence:** .kpi>div{flex:1;min-width:96px} .kpi b{display:block;font-size:16px...}  — no overflow-wrap; inr() returns unbroken '₹'+toLocaleString
- **Impact:** On a 360 phone the three KPI columns (Target / Actual / % of target) sit in a flex-wrap row; a long amount overflows its .kpi b box and can push layout or get visually clipped against the neighbouring column. Non-fatal (numbers still largely legible, row can wrap) so P2.
- **Fix hint:** In module CSS add `.kpi b{overflow-wrap:anywhere}` and/or reduce min-width, and let the TW/HE sub-span wrap. Additive CSS only. Confirm with a ₹1,23,45,678 target on 360 Mobile.

## [P3] L-planning-04 — Bottom checklist 'Add prep item' input can be covered by the mobile keyboard with no scroll-into-view
- **Module/area:** planning | **Confidence:** low | **Combo:** 360xMobile,412xMobile
- **Location:** planning.html checklist add row (line 148): <input id="ck_..." ...><button ...>Add</button>
- **Defect:** Each festival card ends with an `.row` containing the 'Add a prep item' input. With several festivals rendered, the input on a lower card sits well down the page; there is no scrollIntoView on focus. The soft keyboard on Android can overlay it.
- **Evidence:** <input id="ck_'+f.id+'" placeholder="Add a prep item ..." style="flex:1"> — no scrollIntoView on focus
- **Impact:** On Mobile the user may not see what they type when adding a checklist item on a lower card until they manually scroll. Minor, common-to-many-forms nuisance; the page itself scrolls so it is recoverable. P3.
- **Fix hint:** Optional: add a focus handler that calls el.scrollIntoView({block:'center'}) on the ck_ inputs. Additive JS, offline-safe. Needs on-device confirmation (headless cannot show the keyboard).

## [P3] L-planning-05 — Toast is position:fixed bottom-center z-index:9 — may sit under/over the shell back-home FAB
- **Module/area:** planning | **Confidence:** low | **Combo:** 360xMobile,412xMobile
- **Location:** planning.html .toast (lines 33-34); toast div (line 63)
- **Defect:** `.toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);...z-index:9}`. The shell injects a back-home FAB and (in mobile) other bottom chrome; body also gets `padding-bottom:72px/80px` from uniform/mobile CSS. The toast ignores that safe area and anchors at bottom:18px with a low z-index of 9.
- **Evidence:** .toast{position:fixed;left:50%;bottom:18px;...z-index:9}
- **Impact:** The 'Saved' / 'Deleted' toast is transient and centered, so collision with a corner FAB is unlikely to fully hide it, but on narrow screens it can visually overlap bottom chrome or render beneath a higher-z shell element. Cosmetic. P3.
- **Fix hint:** Raise toast to bottom:calc(80px+18px) or a higher z-index in module CSS if it visibly clashes on device. Additive. Confirm against the live shell FAB stack.

## [P3] L-planning-06 — Blackout-checkbox label row: long label text wraps around an inline checkbox, slightly ragged on narrow widths
- **Module/area:** planning | **Confidence:** low | **Combo:** 360xMobile
- **Location:** planning.html blackout row (line 53): div.full.row > label > input[checkbox] + long text
- **Defect:** The leave-blackout control is `<label><input type=checkbox ...>Leave blackout — warn before approving staff leave in this window</label>` inside `.full.row`. The checkbox is inline inside a block label; the long sentence wraps to 2-3 lines at 360. Checkbox is excluded from the shell min-height:44px floor (input:not([type=checkbox])) and min-width:44px is not !important, so wrapping is purely cosmetic.
- **Evidence:** <div class="full row"><label style="margin:0"><input type="checkbox" id="f_black" style="width:auto;margin-right:6px">Leave blackout — warn before approving staff leave in this window</label></div>
- **Impact:** On 360 the label text wraps under/around the checkbox; the checkbox stays with the first line, which is acceptable but can look slightly ragged. Functional. P3.
- **Fix hint:** Optional: make the label a flex container with align-items:flex-start and give the text flex:1;min-width:0. Additive CSS. Verify on 360 Mobile.

