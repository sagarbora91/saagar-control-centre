# layout-grooming — layout audit

**Target:** grooming.html
**Findings:** 6

**Coverage notes:** Scope covered: read grooming.html fully (1038 lines) and the live shell injection code in scratchpad/audit-www/index.html — injectUniformCSS global floors (6072-6163), MOBILE_CSS base + the grooming per-module block (6285-6296), injectBackHome FAB/next-chips stack (6027-6053). The three tabs (CRO Checklist form + open checklist, Daily Summary statgrid/cards/chips, Month-End Report .mt table) and the read-only past-date banner were each walked against all 12 checklist items across 360xMobile / 412xMobile / 1280xDesktop / 1280xMobile / 360xDesktop.

Key positives (no defect): grooming has NO modals/overlays (only a toast + confirm() dialogs + a permanently-hidden #grm-float-save), so checklist items 4 (modal footer off-screen) and 5/6 (sticky-header/modal collisions) mostly do not apply. .frow, .fg, .statgrid, .filter-bar are collapsed to 1-col/2-col by BOTH the module's own @media(max-width:640px/580px) AND the shell grooming block, so they behave in every combo. The .mt table gets overflow-x:auto from three independent sources (module wrapper .month-table-wrap, shell uniform @media<=920, shell bcc-mobile table rule) plus min-width:640px, so it scrolls rather than clips at 360. Inputs are date/month/text at font-size:16px (module @media) — no iOS zoom, no keyboard-occlusion form at the very bottom (pickers sit near the top of their tabs).

Could NOT verify statically (needs live browser/device): (1) grm-01 FAB/chip overlap — needs Mobile mode toggled at width>640 with a checklist open to confirm the pixel collision and whether the Open Queue chip is still tappable underneath; (2) grm-02 — needs a seeded long CRO name in the month report on a real 360px device to measure how much viewport the pinned column actually consumes and whether sticky box-shadow bleeds; (3) grm-03/grm-04 — need real multi-date / long-label data to see actual wrap height; (4) the sticky-column opaque-background bleed (line 184-187 comment) under Android WebView force-dark — the uniform CSS forces color-scheme:light, but verify the pinned cells' var(--paper) truly stays opaque over scrolling cells on-device. All findings respect read-only/offline/additive-CSS constraints; none require touching storage-core.js / sqlite-store.js / photo-store.js or any shell file.

---

## [P2] grm-01 — Floating Save FAB overlaps shell's 'Open Queue →' chip in Mobile display on wide viewports
- **Module/area:** grooming | **Confidence:** high | **Combo:** 1280xMobile
- **Location:** grooming.html #grm-float-save (CSS lines 214-218, 292) vs shell #st-v5-next-chips (index.html:6040)
- **Defect:** The module's #grm-float-save is repositioned to bottom-left ONLY inside its own @media(max-width:640px) block (line 292: left:14px;right:auto). Its default position is bottom:140px;right:22px (line 214). The shell injects #st-v5-next-chips at bottom:140px;right:22px containing grooming's 'Open Queue →' chip, and this chip is shown whenever html.bcc-mobile is present (index.html:6048 hides it only on :not(.bcc-mobile)). In the Mobile-display-on-wide off-combo (bcc-mobile ON at width>640), the module @media does NOT fire, so when a checklist is opened #grm-float-save.show renders at exactly bottom:140px/right:22px — directly on top of the injected Open Queue chip, occluding it.
- **Evidence:** #grm-float-save{position:fixed;bottom:140px;right:22px;...} (line 214); @media(max-width:640px){ #grm-float-save{left:14px;right:auto;} } (line 292); shell #st-v5-next-chips{position:fixed;bottom:140px;right:22px;...} (index.html:6040)
- **Impact:** On a wide viewport left in Mobile mode (e.g. foldable open / tablet / desktop toggled to Mobile), the green Save FAB and the navy Open Queue chip stack at the same coordinates; one hides the other. Save still works from the header/clbar Save button, so it is annoyance not blockage.
- **Fix hint:** Anchor #grm-float-save to bottom-left unconditionally (or gate the left:14px move on html.bcc-mobile instead of the width @media). Additive CSS only; do not touch the shell.

## [P2] grm-02 — Sticky CRO-Name column in Month report has no max-width; a long name eats the 360px viewport
- **Module/area:** grooming | **Confidence:** high | **Combo:** 360xMobile
- **Location:** grooming.html .mt th:nth-child(2)/.mt td:nth-child(2) (CSS lines 185, 189) + namecell (JS render line 919-924)
- **Defect:** The Month-End Report pins column 1 (#, fixed 52px via lines 184) and column 2 (CRO Name, position:sticky;left:52px, line 185) while the 8-col table scrolls horizontally (.mt{min-width:640px}, line 280). Column 1 is width-capped to 52px but column 2 has NO width/max-width cap. Its content is .namecell = a 28px avatar + the full CRO name with no word-break/ellipsis (rendered at line 922 with white-space default; .cltxt word-break from the @media does not apply here). A long name (e.g. 'Lakshminarayan Venkataraman') makes the pinned column very wide.
- **Evidence:** .mt th:nth-child(2),.mt td:nth-child(2){position:sticky;left:52px;z-index:2;background:var(--paper);box-shadow:1px 0 0 var(--gray-200);} (line 185) — no max-width; render: <div style="font-weight:600;font-size:13px;color:var(--navy)">${c.name}</div> (line 922)
- **Impact:** On a 360px phone the two pinned identity columns can consume most of the viewport width, leaving a thin strip for the actual score data that the user is scrolling to see. Table still scrolls, so it is degraded-but-usable.
- **Fix hint:** Cap .mt td:nth-child(2)/th:nth-child(2) with a max-width (e.g. 140px on mobile) plus white-space:nowrap;overflow:hidden;text-overflow:ellipsis on the inner name div, or allow word-break. Additive CSS only.

## [P3] grm-03 — 'Dates Present' cell can render many wrapping date-badges, ballooning a scrolled table row's height
- **Module/area:** grooming | **Confidence:** medium | **Combo:** 360xMobile
- **Location:** grooming.html .date-badge (CSS line 196) + render (JS line 912, 935)
- **Defect:** The last column 'Dates Present' emits one .date-badge per unique date the CRO was checked (line 912: c.dates.map(...)). With a full month of check-ins that is up to ~26 pill badges in a single <td>. The shell text floor forces .date-badge (class contains '-date', index.html:6133) to >=11px !important, and there is no column max-width, so on the horizontally-scrolling min-width:640px table this cell can wrap into a tall block, making that row much taller than its neighbours.
- **Evidence:** .date-badge{display:inline-block;...margin:1px 2px;} (line 196); const datesBadges = c.dates.map(d=>`<span class="date-badge">${d.slice(5)}</span>`).join(''); (line 912)
- **Impact:** Cosmetic row-height inflation in the month table when a CRO has many distinct check-in dates; other columns get lots of vertical whitespace. No data loss, no clipping.
- **Fix hint:** Give the Dates-Present td a sensible max-width and let it wrap tidily, or cap the number of badges shown with a '+N more'. Additive only.

## [P3] grm-04 — Daily-summary failed-parameter chips lack wrap in Mobile display between 641-920px
- **Module/area:** grooming | **Confidence:** medium | **Combo:** 1280xMobile
- **Location:** grooming.html .chip / .chips (CSS lines 153-159) vs module @media(max-width:640px) (lines 272-274)
- **Defect:** .chip has no word-break or max-width in the base rule; those are only added inside the module's own @media(max-width:640px) (.chip{max-width:100%}, .chip .cltxt,.chip{word-break:break-word}). The shell's grooming MOBILE_CSS block does NOT style .chip/.chips at all. So in the Mobile-on-mid-width off-combo (bcc-mobile ON, ~641-920px, e.g. an unfolded foldable or tablet held in Mobile mode) a long failed-parameter label such as 'No loose threads, missing buttons, or faded colour' renders as a single unbroken chip with no max-width. The parent .chips does flex-wrap, so it usually wraps chip-to-chip rather than overflowing, but a single very long chip could still push width.
- **Evidence:** .chip{display:flex;align-items:center;gap:4px;font-size:11px;padding:3px 9px;border-radius:20px;font-weight:500;} (line 154) — no wrap; wrap only in @media(max-width:640px){ .chip{max-width:100%;} .chip .cltxt,.chip{word-break:break-word;} } (lines 273-274)
- **Impact:** Edge-case only. At the real mobile widths (360/412) the module @media fires and chips wrap correctly; at 1280 there is plenty of room. The gap is a narrow mid-width band held in Mobile mode.
- **Fix hint:** Move the .chip{max-width:100%;word-break:break-word} rule out of the width @media (or duplicate under html.bcc-mobile[data-mod=grooming]) so it applies in Mobile mode regardless of width. Additive only.

## [P3] grm-05 — Completion meter and checklist rows rely solely on the module's own @media; not in shell grooming block
- **Module/area:** grooming | **Confidence:** low | **Combo:** 1280xMobile
- **Location:** grooming.html .grm-meter / .clgrp / .clitem / .clbar (CSS lines 86-118, 259-266) vs shell grooming block (index.html:6285-6296)
- **Defect:** The checklist body (.clgrp groups, .clitem rows, .clbar header with Change-CRO/Save actrow, and the .grm-meter progress bar) is styled for narrow screens ONLY by the module's own @media(max-width:640px) (lines 259-266: clbar align, cltxt word-break, clitem min-height). The shell's per-module grooming MOBILE_CSS (index.html:6285-6296) covers .wrap/.frow/.fg/.statgrid/.filter-bar/.mt/.cro-right but touches NONE of the checklist-body classes. This is fine at 360/412 (module @media fires) but means in the Mobile-on-wide off-combo (bcc-mobile ON, width>640) the checklist gets no mobile treatment — it simply uses the desktop layout, which at 1280 is fine. Flagged as a coverage gap to note, not a live break in the 4 primary combos.
- **Evidence:** Shell grooming block ends at html.bcc-mobile[data-mod="grooming"] .cro-right{...} (index.html:6296) with no .clitem/.clbar/.grm-meter rule; module handles them only in @media(max-width:640px){ .clitem{...} .cltxt{word-break:break-word} .clbar{align-items:flex-start} } (lines 259-266)
- **Impact:** No visible break in any of the four target combos: at 360/412 the module @media handles it; at 1280 desktop layout is appropriate. Purely a resilience gap if the app ever renders the checklist in Mobile mode at an intermediate width.
- **Fix hint:** Optionally mirror the key checklist row rules (clitem min-height, cltxt word-break, clbar wrap) into html.bcc-mobile[data-mod=grooming] so Mobile mode is width-independent, matching the pattern used for other modules. Additive only.

## [P3] grm-06 — Gender buttons (.gbtn) are onclick divs, so the 44px control floor never applies; they self-size only
- **Module/area:** grooming | **Confidence:** low | **Combo:** all
- **Location:** grooming.html .gbtn (CSS line 61) + markup (lines 333-334)
- **Defect:** Male/Female are <div class="gbtn" onclick=...> not <button>/[role=button], so the shell's interactive-control floor (index.html:6141-6151, which targets button/input/select/a.btn/[role=button]/.btn) does NOT reach them. They are usable because the module hard-codes min-height:44px inline (line 61) and the @media bumps to 46px (line 244). Noted only because it means their tap target depends entirely on module CSS with no shell safety net — if a future edit dropped the module min-height, the floor would not catch it. No live defect.
- **Evidence:** .gbtn{...min-height:44px;display:flex;align-items:center;justify-content:center;} (line 61); <div class="gbtn" id="bm" onclick="sg('m')">Male</div> (line 333)
- **Impact:** None currently. Buttons are 44-46px tall in every combo. Purely a note that these controls sit outside the shell's accessibility floor.
- **Fix hint:** Consider adding role="button" to .gbtn so it inherits the shell floor as a backstop (also improves a11y). Additive markup only; no behavior change.

