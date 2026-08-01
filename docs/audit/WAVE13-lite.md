# V6 Wave 13-lite — Shell chrome + Reports (programme Phase 0, step 0.2)

**Status:** SHIPPED. **COMMITTED + PUSHED `origin/main = 2f20a64`** + seeded APK `Retail/SaagarCC-DemoData-V6-Wave13.apk` (6.84 MB; packaged index.html + saagar-report.js SHA256 byte-exact vs seeded source, mojibake-clean, 11 blobs byte-identical). Device-test PENDING.
**Base:** `origin/main = 78c9d7f` (Wave 12) → `2f20a64`. Committed files: `www/index.html` + `www/saagar-report.js`; `docs/` untracked.
**5 items across 2 PLAIN files (no module blobs this wave).** Additive-only; offline; no new libs. All 11 base64 blobs byte-identical vs pristine.

## Features
| Item | File | What |
|---|---|---|
| P1-36 | index.html | Shell-chrome i18n (English default · Marathi · Hindi). `data-i18n` attribute pass + `applyLang()` capturing each element's original English (`el.__i18nEn`) so en↔mr↔hi round-trips; `stT()` for JS-generated home labels; Language card in Settings; new key `saagar_lang`. textContent-only (XSS-inert). Scope = shell chrome ONLY (never module iframes). **Marathi/Hindi strings are best-effort — pending owner native review.** |
| P1-38 | index.html | Attention Centre — per-item dismiss (today-only, recurs next day) + snooze (1d/3d/1wk; red/high-sev capped to 1d) on the Home list, plus a full "Needs attention" modal with Restore. New key `st_v5_attn_state_v1`. id = `simpleHash(title)`; state self-GCs. |
| P1-39 | index.html | Text size (Normal/Large) — `html.st-textsize-large #mainContent{zoom:1.12}` (chrome scroller only; nav/topbar/iframe untouched). New key `saagar_text_size`. |
| P1-45 | saagar-report.js | Lost Walk-in Call Sheet (monthly) — QMS non-purchase, callable=10-digit mobile deduped newest-first; no-number counted+disclosed but excluded; index/table/note. |
| P1-47 | saagar-report.js | Weekly Business Summary (new scope 'weekly') — Mon–Sun ISO week, week-to-date vs same-span-last-week comparison, 5 KPI deltas (non-purchase inverted), trend + by-CRO tables. LOCAL `isoOf()` (no toISOString). |

## New keys (all index.html, ONE combined `appControlKeys()` edit)
`saagar_lang`, `st_v5_attn_state_v1`, `saagar_text_size` — all in appControlKeys (backed up), all match APP_RE (factory-reset + safety-backup), all restore-accepted (control fallthrough), each getter re-validates a tampered value. **Deviates from the per-device `saagar_ui_mode` precedent (backs prefs up); trivially flippable (drop 2 literals from appControlKeys).** See DECISIONS OQ2.

## Process
5 spec agents + synthesis (7 decisions) → DECISIONS.md → index.html by hand (orchestrator, 4 shared-region combined edits) + saagar-report.js owner agent (parallel) → syntax gate → seeded harness (all 5, 0 console errors) → 8-skeptic adversarial. **Survived a mid-wave device-battery interruption** — resumed cleanly (index.html edits intact on disk; the report-owner agent had written nothing so was re-run fresh).

## Bugs found & fixed (each re-verified in harness)
- **Harness (pre-adversarial):** `attnDaysAdd` used `toISOString()` → IST −5:30 shifted snooze back a day → immediate GC. Fixed to LOCAL date math. (non-red 3d→+3, red-capped 1d→+1 verified.)
- **Adversarial: 0 P0, 1 P1, 8 P2. Folded 4 (1 P1 + 3 P2), re-verified; 4 P2 accepted-as-documented.**
  - **P1 (confirmed):** `attnSnooze` still referenced the dead `__attnModalOpen` var (my earlier replace_all matched `openAttention(); }` same-line, but snooze's `}` was on the next line) → snoozing from inside the modal didn't refresh it. Fixed → `attnModalIsOpen()`. Verified: modal Active 8→7 live.
  - **P2:** `attnLoadState` now validates date VALUES (`/^\d{4}-\d{2}-\d{2}$/`) + clamps snooze horizon to today+31 → drops malformed/hostile far-future dates. Verified (garbage + 9999-12-31 dropped, valid kept).
  - **P2:** hero "Net today/for day" caption now routed through `stT()` (dict keys existed but were dead). Verified (mr: आजचा निव्वळ).
  - **P2:** weekly footnote now labels the actual compared sub-span (`weekLabel(pw.start, pw.days[nDays-1])`), not the full prior week. Verified ("same 2 days … 06 Jul – 07 Jul").
  - **Accepted (documented):** attnId title-hash un-sticks if an item's count changes intra-day (synthesis D2 deliberate choice — dismiss is same-day; a materially changed flag re-surfacing is defensible); attnId empty-title collision (no real item has an empty title); text-size body-level chrome (modals/toasts/FAB) not zoomed (documented "chrome scroller only" scope); text-size sticky-column vh cosmetic (self-heals via overflow).

## Harness verification (0 console errors)
i18n Home→मुख्यपृष्ठ→होम→Home full round-trip + `html lang` + persists; all 3 keys whitelisted + restore-accepted; attention dismiss/snooze/restore + modal + red-cap; text-size class toggle + persist; both new reports build (weekly 9 blocks/lost-walkin 4 blocks) + preview render 0 errors; config screen + 8 subtabs intact; Stock module loads; existing qmsReport renders (regression clean); 11 blobs byte-identical.

## On ship (owner go)
`git add www/index.html www/saagar-report.js` → commit → push → seeded APK `SaagarCC-DemoData-V6-Wave13.apk` (flip seed, cap sync, apply-overrides, gradlew assembleDebug --offline, SHA-verify packaged assets). Then update this file + `saagar-v6-wave13-lite` memory + MEMORY.md + HANDOFF.md. **45/52 P1 done after this — the V6 register close-out is complete; next the programme pivots to R0 (gated on the owner's device-test reckoning, Execution Plan step 0.3).**
