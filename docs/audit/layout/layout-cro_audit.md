# layout-cro_audit — layout audit

**Target:** cro_audit.html
**Findings:** 9

**Coverage notes:** Coverage: statically walked every inner screen from the module HTML + JS builders — New Audit (session form .frow/.fg, 10 task cards: .rgroup qual buttons, .metric-grp/.mrow/.minp for NPS/reviews/mktg/grooming, .wm-prog week/month rows, DSR .ctx-banner, task hints), Score Summary (.sc-grid), sticky Submit deck + completion meter, Dashboard (period toggle/nav, .kpi-strip, .cpc CRO cards, week-by-week breakdown, .thr task-average rows), History (.hi-filters 4 fields, .stat-grid, .hi-item rows), Settings (KPI target .frow form + scoring ref), and the result .modal (.res-big, .mpills, .trr rows, print button). Cross-referenced the exact per-module shell block html.bcc-mobile[data-mod=\"cro_audit\"] at shell index.html:6297-6308 and the storage/registry entries (cro_s_v3, cro_audits_v3).

Key structural facts: This module is unusually well-covered — its OWN @media(max-width:640px)/(560px)/(380px) collapses fire by WIDTH in BOTH modes AND the shell per-module block covers sc-grid/rgroup/kpi-strip/stat-grid/frow/hi-filters/fg/mrow/minp/header padding/modal max-width and hides the bar wrappers. There are NO on-screen <table> elements (the only <table> is inside the print document posted to the shell's ST_PRINT preview, a separate context), so table-scroll checklist items 3 are N/A on-screen. No fixed px min-widths on cards/modals that overflow 360 (.fg 160px collapses; .thr-bwrap/.sb-bar are hidden on mobile; module ships *{min-width:0} at <=640). The modal has max-height:90/92vh + overflow-y:auto and its footer print button lives inside the scroll region, so no unreachable-footer P0. The shell auto-hides both FABs when the .modal overlay is open (modalUp() matches class~=\"modal\"), so no FAB-over-dialog issue. No P0/P1 found — the module degrades gracefully.

NEEDS LIVE-BROWSER/DEVICE CONFIRMATION: (1) cro_audit-01 — exact pixel overlap of the shell back-home FAB (bottom:76px,right:14px,42px) over the sticky .submit-dk green button on a real 360/412 phone, and whether the shell's body padding-bottom shifts it; verify a real tap on the button's right edge. (2) cro_audit-05 — whether .ph header actually wraps to two rows at 360 (making the top:54px sticky score-banner overlap); depends on real font metrics for 'Saagar Traders' + date + badge. (3) cro_audit-06 — real long-CRO-name behavior in the modal title bar. (4) The 1280xMobile combo (cro_audit-03) assumes a user can force Mobile display on a 1280 viewport; confirm that path exists via Settings > Display. All fixes proposed are CSS-only/additive and obey the read-only/offline/no-new-lib constraints; none touch storage-core.js/sqlite-store.js/photo-store.js.

---

## [P2] cro_audit-01 — Back-home FAB overlaps the sticky 'Save & Submit Audit' deck on mobile
- **Module/area:** cro_audit | **Confidence:** medium | **Combo:** 360xMobile,412xMobile
- **Location:** cro_audit.html @media(max-width:640px) .submit-dk (lines 373-374) vs shell index.html #st-v5-home-fab (line 6031/6039)
- **Defect:** On the New-Audit screen the module pins the submit deck with .submit-dk{position:sticky;bottom:0;z-index:40} at <=640px (fires by width in BOTH modes). The shell's injected back-home FAB is position:fixed;bottom:76px;right:14px;z-index:2147483647 on mobile (<=600px). The FAB (42px) floats over the right edge of the pinned deck, sitting on top of the right portion of the full-width green 'Save & Submit Audit' button.
- **Evidence:** .submit-dk{position:sticky;bottom:0;z-index:40; ...} (module) ; #st-v5-home-fab{position:fixed;bottom:76px;right:14px;...;z-index:2147483647} (shell @media max-width:600px)
- **Impact:** The primary submit button is partially covered by the home FAB. The button is full-width so its center/left remains tappable, but the right ~50px is obscured and a mis-tap navigates Home instead of submitting. Workaroundable, not blocking.
- **Fix hint:** Add mobile bottom padding/right-margin inside the sticky .submit-dk (e.g. padding-right so the button's tappable area clears the 14px+42px FAB zone), or right-align the submit button content away from the FAB. Do NOT touch the FAB (shell-owned). CSS-only.

## [P2] cro_audit-02 — All metric/progress bars force-hidden on mobile despite module trying to keep them
- **Module/area:** cro_audit | **Confidence:** high | **Combo:** 360xMobile,412xMobile,1280xMobile
- **Location:** shell index.html:6306 vs cro_audit.html convergence @media(max-width:640px) line 470
- **Defect:** The module's own convergence block explicitly restores the metric-row bars, week/month bars, score-banner bar and dashboard task bars on phones: '.mbar-wrap,.wm-bar-wrap,.sb-bar,.thr-bwrap{display:block;flex:1;min-width:48px;width:auto}' (line 470). The shell per-module rule overrides with '!important': html.bcc-mobile[data-mod="cro_audit"] .mbar-wrap,.sb-bar,.thr-bwrap,.wm-bar-wrap{display:none !important}. The !important wins, so in Mobile display every inline progress bar (NPS/reviews/mktg/grooming metric rows, week/month wm-rows, score-banner sb-bar, dashboard thr task-average bars) is hidden.
- **Evidence:** html.bcc-mobile[data-mod="cro_audit"] .mbar-wrap,html.bcc-mobile[data-mod="cro_audit"] .sb-bar,html.bcc-mobile[data-mod="cro_audit"] .thr-bwrap,html.bcc-mobile[data-mod="cro_audit"] .wm-bar-wrap{display:none !important}
- **Impact:** Meaningful visual degradation: the at-a-glance bar feedback the module was built around is gone on phones (the numeric % / value labels remain, so no data loss). Because the shell rule is scoped to html.bcc-mobile, the SAME screen in Desktop-display-at-360 (module @media wins) DOES show the bars — an inconsistency between the two narrow combos.
- **Fix hint:** Reconcile intent: either drop the shell's display:none for .mbar-wrap/.wm-bar-wrap/.thr-bwrap and let the module's flexed bars show, or accept the hide and remove the now-dead module convergence rule. Coordinate in shell MOBILE_CSS since the module rule cannot beat !important. Visual-only.

## [P2] cro_audit-04 — Rating buttons and score chips stay 4/5-across at 360 in Desktop display (mismatch combo)
- **Module/area:** cro_audit | **Confidence:** medium | **Combo:** 360xDesktop
- **Location:** cro_audit.html .rgroup line 113 / .sc-grid line 183; module @media(max-width:640px) lines 380,389
- **Defect:** The shell's 2-col collapse for .rgroup and .sc-grid is scoped to html.bcc-mobile only. In Desktop-display-at-360 (bcc-mobile OFF, width 360) the module's own @media(max-width:640px) keeps .rgroup at repeat(4,1fr) (line 380) and .sc-grid at repeat(5,1fr) (line 389). So four rating buttons ('Not Done / Below Exp. / Met Exp. / Exceeded') and five score chips are crammed across ~300px of usable width.
- **Evidence:** .rgroup{grid-template-columns:repeat(4,1fr)} (module @media 640) ; .sc-grid{grid-template-columns:repeat(5,1fr)} (module @media 640) — shell 2-col rule is html.bcc-mobile-only
- **Impact:** The four rating buttons at ~70px each with multi-word labels ('Below Exp.') and the five sc-chips at ~58px are very cramped/near-truncation at 360 Desktop. Still legible (font shrinks at <=380px) and tappable, but tight. Only affects the Desktop-at-360 mismatch combo.
- **Fix hint:** In the module @media(max-width:380px) block, drop .rgroup to repeat(2,1fr) and .sc-grid to repeat(2-3,1fr) so the narrow Desktop combo matches the mobile collapse. Visual-only.

## [P2] cro_audit-05 — Sticky score-banner (top:54px) can overlap a wrapped header at narrow widths
- **Module/area:** cro_audit | **Confidence:** low | **Combo:** 360xMobile,360xDesktop
- **Location:** cro_audit.html .ph line 37 (sticky top:0, flex-wrap:wrap) + .score-banner line 43 (sticky top:54px; ≤560 top:52px line 323)
- **Defect:** The header .ph is position:sticky;top:0 with flex-wrap:wrap, and the score-banner is position:sticky;top:54px (52px under 560px) with a hard-coded offset. If the header's right block (date + 'STORE MANAGER' badge) wraps under the brand on a narrow phone, .ph grows taller than 52-54px and the sticky score-banner will overlap the bottom of the header instead of sitting beneath it.
- **Evidence:** .ph{...display:flex;...flex-wrap:wrap;...position:sticky;top:0;} ; .score-banner{...position:sticky;top:54px;...} ; @media(max-width:560px){.score-banner{...top:52px}}
- **Impact:** Potential overlap of the sticky score banner over the wrapped header row on very narrow phones. Likely borderline at 360 (may fit on one row after the ≤640 padding reduction), so needs live confirmation.
- **Fix hint:** Make the score-banner offset robust (e.g. keep header on one line at 360 via smaller brand/badge, or set score-banner top via a larger safe value / not rely on a fixed px that assumes single-row header). Visual-only.

## [P2] cro_audit-06 — Long CRO name in modal title has no wrap/ellipsis and can crowd the close button
- **Module/area:** cro_audit | **Confidence:** medium | **Combo:** 360xMobile,412xMobile
- **Location:** cro_audit.html .mhead line 291 / .mtitle line 292 / m-title set line 1298 ('Audit — '+a.cro)
- **Defect:** .mhead is display:flex;justify-content:space-between holding .mtitle ('Audit — {cro name}') and the ✕ .mclose button. .mtitle has no max-width, overflow, or text-overflow:ellipsis. A long Chief Retail Officer name makes the title grow and can push against / wrap around the 44px close button in the fixed navy header bar on a 360-wide modal (modal is max-width:none;width:100% on mobile).
- **Evidence:** .mhead{...display:flex;align-items:center;justify-content:space-between;} ; .mtitle{font-family:var(--font-serif);font-size:16px;color:var(--gold-light);} (no ellipsis) ; document.getElementById('m-title').textContent=`Audit — ${a.cro}`
- **Impact:** Cosmetic-to-minor: title may wrap to two lines or crowd the ✕, but the close button stays reachable (fixed min 44px) and the modal body scrolls. Low real-world severity.
- **Fix hint:** Add min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap to .mtitle (and flex:1) so long names truncate rather than push the close button. Visual-only.

## [P3] cro_audit-03 — Mobile-scoped layout collapses fire on wide viewport (1280xMobile) making the whole module full-width and squashed
- **Module/area:** cro_audit | **Confidence:** high | **Combo:** 1280xMobile
- **Location:** shell index.html:6298-6307 (html.bcc-mobile[data-mod="cro_audit"] rules, no width guard)
- **Defect:** All the shell per-module mobile rules are gated only on the class, not width: .wrap{max-width:none}, .kpi-strip/.stat-grid{1col}, .sc-grid{2col}, .rgroup{2col}, .frow/.hi-filters{column}, .minp{90px}. At 1280xMobile (Mobile display forced on a wide screen) these all fire while the module's own @media(max-width:640px) does NOT. Result: content spans the full 1280px (860px cap removed), KPI/stat tiles stack to a single very wide column, forms become full-width single-column, and rating/score grids drop to 2 across as oversized tiles.
- **Evidence:** html.bcc-mobile[data-mod="cro_audit"] .wrap{max-width:none !important;...} ; html.bcc-mobile[data-mod="cro_audit"] .kpi-strip,...{grid-template-columns:1fr !important}
- **Impact:** Cosmetically poor / wasteful on a wide screen in Mobile mode, but fully usable and no clipping/overflow. Low real-world frequency (users on 1280 normally get Desktop display).
- **Fix hint:** Optionally cap width even in mobile (e.g. keep a max-width on .wrap) or width-guard the per-module collapses so a 1280 Mobile view stays multi-column. Non-blocking; can defer.

## [P3] cro_audit-07 — Month week-by-week breakdown row packs 5 status chips + label into an inline flex that only wraps
- **Module/area:** cro_audit | **Confidence:** high | **Combo:** 360xMobile,412xMobile
- **Location:** cro_audit.html buildWeekBreakdown rows, inline style lines 1614-1622
- **Defect:** Each week-breakdown row is an inline-styled flex (flex-wrap:wrap) containing a 70px 'Week N' label, a flex:1 '{n} audits · Avg {x}/100' line, and five .wm-tag chips ('Sur 18/18', 'Rate 40%', 'NPS 85', 'Rev 7/7', 'Mktg 28/28'). No per-module shell rule targets this ad-hoc structure; it relies purely on flex-wrap.
- **Evidence:** <div style="display:flex;align-items:center;gap:9px;...flex-wrap:wrap"><div style="min-width:70px;...">Week ${wn}</div>...<span class="wm-tag ...">Sur ${wd.surveys}/${wT_sur}</span> (x5)
- **Impact:** At 360 the five tags wrap onto 2-3 lines, making the row tall and slightly noisy but readable and non-overlapping. Purely cosmetic density.
- **Fix hint:** Optional: give the tag group its own wrap container with consistent gap, or shorten tag text. Non-blocking.

## [P3] cro_audit-08 — DSR context banner ₹ amounts have no wrap guard on the value pills
- **Module/area:** cro_audit | **Confidence:** medium | **Combo:** 360xMobile,412xMobile
- **Location:** cro_audit.html .ctx-line line 146 + renderCroContext line 1909-1912 (fmtINR)
- **Defect:** The operational-context banner renders 'DSR sales <b>N</b> (₹12,34,567) · QMS closed ...' inside .ctx-line (font 12px, line-height 1.5). Long Indian-format rupee amounts sit inside inline <b> with ctx-dot separators; the line relies on normal text wrapping with no explicit break control on the amount token.
- **Evidence:** .ctx-line{font-size:12px;color:var(--g700);line-height:1.5;} ; line.innerHTML='...DSR sales <b>'+dsrSales+'</b> ('+fmtINR(dsrAmt)+')...'
- **Impact:** A very long ₹ amount can force an awkward wrap mid-phrase, but the banner grows vertically (block, not fixed height) so nothing clips. Cosmetic only.
- **Fix hint:** Optional white-space handling on the amount span; low priority. Non-blocking.

## [P3] cro_audit-09 — 16px input font-size floor mildly inflates the dense metric-row number inputs on mobile
- **Module/area:** cro_audit | **Confidence:** high | **Combo:** 360xMobile,412xMobile,1280xMobile
- **Location:** cro_audit.html .minp line 134 (base 14px) raised to 16px by module @media line 363/382 + shell MOBILE_CSS input{font-size:16px}
- **Defect:** The metric inputs (.minp) are designed at 70px wide / 14px font for a compact inline scoring table. On mobile the module and shell both bump inputs to 16px (iOS no-zoom) and the shell sets .minp width:90px + 44px min-height. The bars beside them are hidden (see cro_audit-02), so the row is just name + a chunky 90px/16px/44px input + % label.
- **Evidence:** html.bcc-mobile[data-mod="cro_audit"] .minp{width:90px !important;min-height:40px} + uniform floor min-height:44px !important + .minp{font-size:16px}
- **Impact:** The dense metric 'table' feel is lost on mobile — inputs become large touch controls. This is the intended accessibility trade-off (16px stops focus-zoom, 44px tap target) and is fully usable; noting per checklist item 10.
- **Fix hint:** No action needed — this is the deliberate control-floor behavior. Listed for completeness.

