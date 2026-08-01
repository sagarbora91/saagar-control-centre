# layout-stock — layout audit

**Target:** stock.html
**Findings:** 8

**Coverage notes:** Static CSS/DOM audit only; no live browser/device render was performed, so exact pixel heights, wrap points, and specificity outcomes below need on-device confirmation.

KEY CROSS-REFERENCE (shell): the stock per-module MOBILE_CSS block lives at audit-www/index.html:6192-6209 and treats .rtbl as a horizontally-scrolling table (font/padding shrink + fixed input widths). The module ALSO ships its own @media(max-width:640px) card-conversion for .rtbl (stock.html:397-413) that turns rows into stacked cards. These are two different mobile strategies for the SAME element and both are active in Mobile display at <=640px — this is the root of L01/L02 and the single most important thing to verify live: does the register render as cards (module intent) with the shell's input width/min-height overrides applied, or does something regress? Confirm on a 360px device in Mobile mode.

Combos reasoned about: 360xMobile and 412xMobile = card view + shell overrides (L01/L02 the main real issues). 1280xDesktop = clean wide sticky-column tables, the design target, no issues found. 1280xMobile mismatch = tabular (module @640 does NOT fire) but shell shrinks fonts to 9-11px on a wide screen (L05, cosmetic) and inputs stay sub-44px (L02). 360xDesktop mismatch = module @640 card view fires (class-independent) AND the module @640 modal fix fires, so modals and cards are fine even though the shell bcc-mobile block is dormant; the shell uniform @920 table rule is inert against the card display:block layout.

Could NOT statically verify: (1) whether CSS :has() (.rtbl td:has(> .done-cb), stock.html:162) is supported by the target Android WebView version — if not, the Done cell loses its 44px tap padding on desktop; needs device check. (2) Exact modal footer reachability with the soft keyboard open (L03) — needs device. (3) Whether the shell input-width overrides actually visually win over the card rule as computed here (L01/L02 specificity) — confirm in DevTools on device.

No P0 found: no content is clipped without scroll, no action button is unreachable in the shipped screens, and all forms submit. The register table always lives inside .tbl-wrap{overflow-x:auto} and/or converts to cards, so there is no no-scroll overflow. Read-only audit — no files were edited.

---

## [P1] stock-L01 — Register tables get TWO conflicting mobile treatments (card-conversion vs shell scroll-table) that fight in Mobile mode
- **Module/area:** stock | **Confidence:** high | **Combo:** 360xMobile, 412xMobile
- **Location:** stock.html @media(max-width:640px) lines 397-413 (.rtbl card conversion) vs shell MOBILE_CSS index.html:6202-6208 (html.bcc-mobile[data-mod="stock"] .rtbl ...)
- **Defect:** The module's own @media(max-width:640px) block turns every .rtbl register into stacked cards (.rtbl{display:block}, thead/tfoot{display:none}, tbody tr{display:block; card box}, td{display:flex;justify-content:space-between} with td::before{content:attr(data-label)}). The shell's per-module block instead treats .rtbl as a horizontally-scrolling TABLE and sizes its cells/inputs (.rtbl{font-size:11px!important}, .rtbl thead th{font-size:9px!important}, .rtbl td .ni{width:48px!important;min-height:0!important}). In Mobile mode at width <=640 BOTH fire simultaneously: the card layout renders, but the shell's higher-specificity input rules (html.bcc-mobile[data-mod=stock] .rtbl td .ni = (0,4,2)) override the card rule (.rtbl tbody td input = (0,1,3)), forcing inputs back to a fixed 48/80px box with min-height:0 instead of the card rule's flex:1 1 auto / min-height:40px. Net: inputs sit as narrow right-aligned boxes and lose their intended full-width touch sizing inside the card row.
- **Evidence:** MODULE: `.rtbl tbody td input, .rtbl tbody td select, .rtbl tbody td textarea { flex: 1 1 auto; min-width: 0; width: auto !important; min-height: 40px; text-align: right; }`  SHELL: `html.bcc-mobile[data-mod="stock"] .rtbl td .ni{width:48px !important;min-height:0 !important;font-size:11px !important}`
- **Impact:** In the primary Mobile display at phone widths the data-entry inputs in Opening/Movements/Closing cards are cramped fixed-width boxes rather than the intended comfortable card fields; two layout systems partially cancel. Functional but visibly inconsistent and hard to tap accurately.
- **Fix hint:** Decide ONE mobile treatment for .rtbl. Since the module already ships a full card conversion at <=640, gate the shell's stock .rtbl scroll-table rules so they do NOT set td-input width/min-height when the card layout is active (e.g. drop the .ni/.si/.cro-sel width+min-height:0 overrides from the shell stock block, or scope them to a non-card wrapper). Keep changes additive in the shell MOBILE_CSS string only.

## [P2] stock-L02 — In-table number inputs fall below the 44px tap floor in Mobile mode (shell stock override sets min-height:0 !important)
- **Module/area:** stock | **Confidence:** high | **Combo:** 360xMobile, 412xMobile, 1280xMobile
- **Location:** shell MOBILE_CSS index.html:6207-6208 (html.bcc-mobile[data-mod="stock"] .rtbl td .ni / .si / .cro-sel min-height:0 !important)
- **Defect:** The global control floor html body input{min-height:44px !important} (index.html:6141-6151, specificity (0,0,3)) is meant to guarantee 44px tap targets. The shell's stock override html.bcc-mobile[data-mod="stock"] .rtbl td .ni{min-height:0 !important} has specificity (0,4,2) and WINS, so the number/select inputs inside register cells collapse to their padding height (~28-30px) in Mobile mode. The module's own card rule wanted min-height:40px, but as shown in stock-L01 the shell rule also beats that. Result: sub-44px controls in the densest, most-tapped part of the app.
- **Evidence:** `html.bcc-mobile[data-mod="stock"] .rtbl td .ni{width:48px !important;min-height:0 !important;font-size:11px !important}` overrides `html body input:not([type=hidden])...{min-height:44px !important}`
- **Impact:** Physical-count/movement entry inputs are shorter than the accessibility tap floor on phones; more mis-taps during the core daily-count flow. Width-independent in Mobile mode (also affects the 1280xMobile mismatch).
- **Fix hint:** Raise the shell stock override to min-height:40px (or drop min-height:0 so the 44px floor applies) for .rtbl td .ni/.si/.cro-sel; the 48/80px width caps can stay. Shell-only additive edit.

## [P2] stock-L03 — Modal box has no max-height / internal scroll — tall modal on a short viewport can push footer buttons off-screen
- **Module/area:** stock | **Confidence:** medium | **Combo:** 360xMobile, 412xMobile
- **Location:** stock.html .modal-box lines 299 & 388-391 (@640) — no max-height, no overflow
- **Defect:** .modal-box sets min-width/max-width and padding but never max-height or overflow-y. .modal-overlay is display:flex;align-items:center. The two shipped modals (SM Login #sm-auth-modal, Delete-confirm #del-confirm-modal) are short, so today they fit. But the pattern is unsafe: on a landscape phone or with a large system font, a centered modal taller than the viewport is clipped top and bottom with NO way to scroll to the footer buttons (Login/Cancel, Delete/Cancel). The mobile keyboard opening on the password/DELETE input further shrinks the usable height.
- **Evidence:** `.modal-box { background: var(--paper); border-radius: var(--radius-lg); padding: 28px 28px 24px; min-width: 300px; max-width: 400px; ... }` and @640 `.modal-box { min-width: 0; width: 100%; max-width: 420px; padding: 22px 18px 18px; }` — neither sets max-height/overflow.
- **Impact:** Edge-case only for the current two modals (both short), but a real risk when the keyboard is up on a small landscape screen: the action buttons can sit below the fold with no scroll. Low likelihood today, hence P2.
- **Fix hint:** Add max-height:calc(100vh - 28px);overflow-y:auto to .modal-box (module CSS, additive) so any modal internally scrolls and its footer stays reachable. Purely presentational.

## [P2] stock-L04 — Store-nav and tab-nav strips: 44px min-height on buttons inside an overflow-x:auto row is fine, but the strips can double-stack under the sticky module header + shell chrome
- **Module/area:** stock | **Confidence:** medium | **Combo:** 360xMobile
- **Location:** stock.html .hdr (position:sticky;top:0;z-index:200) line 28, .store-nav/.tab-nav lines 39-41
- **Defect:** The module has its own sticky navy .hdr (z-index 200) plus two non-sticky scrolling nav rows (.store-nav, .tab-nav). These stack below the sticky header normally. In Mobile mode the shell also injects body{padding-bottom:80px} and a back-home FAB. The header is sticky but the nav strips are not, so on scroll the tab strip scrolls away — acceptable. The concern is purely that at 360 the .hdr wraps (shell forces .hdr{flex-wrap:wrap} at 6200) so the brand + store-badge + mode toggle can wrap to two lines, growing the sticky header height and eating vertical space, but no content is hidden. No clipping, just tighter.
- **Evidence:** `.hdr { ... position: sticky; top: 0; z-index: 200; }` + shell `html.bcc-mobile[data-mod="stock"] .hdr{flex-wrap:wrap !important;gap:8px !important}`
- **Impact:** Minor vertical-space cost and a slightly tall wrapped sticky header at 360 in Mobile mode. No content lost.
- **Fix hint:** Optional: on stock mobile keep .hdr-left / .hdr-right on one line (min-width:0 + ellipsis on .brand) to avoid the wrap. Cosmetic; shell-side.

## [P3] stock-L05 — Sticky brand identity column: sticky left:0 cells inside the card view are un-pinned by the module but the shell scroll-table override keeps table mode active at wide Mobile widths
- **Module/area:** stock | **Confidence:** medium | **Combo:** 1280xMobile
- **Location:** stock.html .rtbl thead th.tl / tbody td.brand-td sticky rules lines 122-131; card override lines 405 (.name-cell position:static !important)
- **Defect:** On desktop the wide registers pin the Brand column (position:sticky;left:0) so identity stays visible while scrolling. The mobile card view neutralises this via .rtbl td.name-cell{position:static !important}. This is correct for the card layout. But in the 1280xMobile mismatch (bcc-mobile ON, width 1280) the module's @640 card rule does NOT fire, so the table stays tabular with the sticky brand column, while the shell shrinks fonts to 11px/9px. The sticky column still works; the only oddity is very small text on a wide screen. No breakage.
- **Evidence:** `.rtbl thead th.tl, .rtbl tfoot td.tl { position: sticky; left: 0; z-index: 3; ... }` and card override `.rtbl td.name-cell{position:static !important;...}` only inside @media(max-width:640px).
- **Impact:** Cosmetic: unusually small register text on a wide screen when the app is forced into Mobile mode at desktop width. Sticky column still functions.
- **Fix hint:** No action needed; note only. If desired, the shell stock font-shrink rules could be gated to also require a narrow width, but that reintroduces width coupling — leave as-is.

## [P3] stock-L06 — Long brand names in the navy card header (.name-cell) have no wrap/ellipsis guard against the absolutely-positioned delete affordance space
- **Module/area:** stock | **Confidence:** low | **Combo:** 360xMobile, 412xMobile
- **Location:** stock.html card rule line 405 (.rtbl td.name-cell padding:10px 44px 10px 12px)
- **Defect:** In the mobile card view the brand name becomes the navy card header with padding-right:44px reserved for a gm-del-cell delete button (.rtbl td.gm-del-cell absolute top/right). Stock's registers do not actually render a gm-del-cell (that markup is from a shared card pattern), so the 44px right padding is just dead space here. A very long brand name (e.g. a long custom brand added in Settings) wraps normally inside the header — acceptable — but the reserved 44px gutter with no button looks like wasted space. Purely cosmetic; brand names are short/upper-case in practice.
- **Evidence:** `.rtbl td.name-cell { ... padding: 10px 44px 10px 12px !important; ... }` — 44px right gutter reserved for a delete cell the stock registers never emit.
- **Impact:** Cosmetic dead gutter on the right of each card header in Mobile mode; long custom brand names wrap (no clipping).
- **Fix hint:** Cosmetic only. If tidying, reduce name-cell right padding when no gm-del-cell is present for stock. Not worth a change on its own.

## [P3] stock-L07 — Summary status/variance pills use inline hardcoded font-size:11px which the 11px text floor lands on exactly — safe, but the inline-styled colored spans bypass class-based theming
- **Module/area:** stock | **Confidence:** low | **Combo:** 360xMobile
- **Location:** stock.html renderSummary lines 1486-1512 (inline style="color:...;font-size:11px" status spans) and scard-val inline colors 1527-1535
- **Defect:** Summary rows and KPI cards inject inline style font-size:11px and inline colors on status spans ('Pending'/'Match'/'Gap(...)') and scard-val numbers. The global text floor is max(11px,1em) so 11px is exactly at the floor and not raised. In the mobile card view these status/variance cells become flex rows with a data-label prefix; the colored inline span sits right-aligned. No overflow because values are short. The only latent issue: a large 'Gap (+12345)' style variance string plus its data-label 'STATUS' in a narrow 360 card row relies on flex space-between and could wrap, but text wraps gracefully. No clipping.
- **Evidence:** `statusH = '<span style="color:var(--amber);font-size:11px;font-weight:600;">⏳ Pending</span>';` and `<div class="scard-val" style="color:var(--red)">${tSales}</div>`
- **Impact:** None functional; inline styling is just less maintainable. Long variance strings wrap rather than clip.
- **Fix hint:** No layout fix required. (Would only matter if variance magnitudes grew huge.)

## [P3] stock-L08 — Brand-list settings card uses a fixed max-height:260px inner scroll that can trap the add-row/reset button below a long list on short screens
- **Module/area:** stock | **Confidence:** low | **Combo:** 360xMobile, 412xMobile
- **Location:** stock.html #brand-list inline style max-height:260px;overflow-y:auto line 722, within .set-card
- **Defect:** The Settings 'Brand List' card renders #brand-list with an inline max-height:260px;overflow-y:auto, then the add-row input and 'Reset to defaults' button below it. On mobile the set-grid is single-column so the card is full width; the inner 260px scroll keeps the list bounded and the add/reset controls visible below — this is actually the correct behavior. The only nit: with the shell 16px input font and 44px control floor, the add-row (which the shell forces flex-direction:column at 6201) stacks the input above the +Add button, making the card taller, but everything stays reachable via the page scroll. No defect, documented for completeness.
- **Evidence:** `<div id="brand-list" style="...max-height:260px;overflow-y:auto;"></div>` + shell `html.bcc-mobile[data-mod="stock"] .add-row{flex-direction:column !important}`
- **Impact:** None; the bounded inner scroll is intentional and keeps controls reachable.
- **Fix hint:** No change needed.

