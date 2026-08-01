# Wave 13-lite — DECISIONS (orchestrator resolutions)

Base HEAD `78c9d7f`. Source of truth = `synthesis.json` (7 decisions, per-file plan, edit order, collisions,
regressionRisks) in this dir. Below are the orchestrator's resolutions of the 8 `openQuestionsForOwner` — all
adopted as recommended. These are additive engineering choices; none changes the deliverable, so they are
resolved here (not surfaced), with two caveats flagged to the user in the ship report.

## Ownership
- `www/index.html` (P1-36 i18n, P1-38 attention, P1-39 text-size) — **orchestrator, by hand** (highest blast
  radius; 4 shared regions each need ONE combined edit; recipe says index.html = orchestrator).
- `www/saagar-report.js` (P1-45 lost-walkin, P1-47 weekly) — **one owner agent**, then orchestrator diff-audit + `node --check`.

## Resolutions
| OQ | Question | Resolution |
|---|---|---|
| 1 | Marathi/Hindi wording + which tokens stay English | **Ship best-effort translations of the ~40 chrome labels; English is default + fallback.** Keep acronyms English (CRO, GST, DSR, QMS, PF/ESIC/PT). **CAVEAT surfaced to user:** strings are best-effort pending native review; refining = editing the `I18N` dict. The mechanism is the deliverable. |
| 2 | Back up language/text-size, or per-device like `saagar_ui_mode`? | **Back them up** (add all 3 keys to `appControlKeys()`), per the wave hard rule "every new top-level key → appControlKeys". Backed-up prefs are harmless (restore re-validates via the getters). **CAVEAT surfaced:** this deviates from the per-device `ui_mode` precedent; flip = drop the two literals from `appControlKeys()` (they stay APP_RE-wiped). |
| 3 | High-sev attention governance | **Adopt:** high-sev (SB.exceptions sev==='high') items are dismissable **today-only** and snooze **capped to 1 day**; med/low get 1d/3d/1wk. Preserves the daily-return safety net. |
| 4 | Home bell repoint to Attention Centre modal | **Adopt** (grep-confirmed sole caller `openAttention()@1160`). |
| 5 | Text-size Large factor | **1.12** (safer against horizontal overflow than 1.2). |
| 6 | Weekly window + comparison | **Mon–Sun ISO week** containing the report date; **week-to-date vs same-point-last-week** comparison; all week math via a LOCAL `isoOf()` (never `toISOString` — IST off-by-one). |
| 7 | Lost-walkin scope | **Monthly-only** this wave; include ALL non-purchase; callable = 10-digit mobile present (deduped newest-first); no-number rows counted + disclosed but excluded from the call list. Weekly variant + ₹-lost column deferred. |
| 8 | Defer `pack('weekly')` + month-pack auto-add of lost-walkin | **Defer both** (minimize blast radius). |

## New keys (all index.html, ONE combined `appControlKeys()@2123` edit)
- `saagar_lang` — raw 'en'|'mr'|'hi' (default 'en'). appControlKeys ✓ · APP_RE `saagar_` ✓ · restore control-fallthrough ok ✓ · getLang() re-validates.
- `st_v5_attn_state_v1` — JSON `{v:1,dismissed:{id:'YYYY-MM-DD'},snoozed:{id:'YYYY-MM-DD'}}` (default `{dismissed:{},snoozed:{}}`). appControlKeys ✓ · APP_RE `st_v\d+_` ✓ · restore ok ✓ · attnLoadState() normalizes + GCs.
- `saagar_text_size` — raw 'normal'|'large' (default 'normal'). appControlKeys ✓ · APP_RE `saagar_` ✓ · restore ok ✓ · getTextSize() re-validates.

## Non-negotiables for implementation (from regressionRisks)
- NEVER touch the base64 `MODULES[]` lines in index.html — byte-diff vs pristine must show them unchanged.
- `applyLang` uses `textContent` only (XSS-inert); null-skip leaves English DOM intact.
- Keep the ~12 `renderHome` `items.push()` sites + all `escapeHtml()` byte-identical; wrap attention filtering in try/catch.
- saagar-report.js: pure appends to BUILDERS/META/GROUPS/TAGS; META count must be exactly +2; do NOT reshape `qmsReport`.
- Verify each file against `_v6_tools/wave13_pristine/` before harness.
