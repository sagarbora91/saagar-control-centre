# Layout — LIVE browser sweep (objective) — session 2026-07-03

**Method:** seeded app (366 days) served from a scratch copy, driven in the preview browser. An
injected scanner (`__layoutScan`) walked each module iframe (same-origin srcdoc) reporting three
OBJECTIVE signals per screen: (1) page horizontal overflow `documentElement.scrollWidth > innerWidth`,
(2) elements with content wider than their box AND `overflow-x:hidden|clip` (clipped/unreachable
content), (3) positioned modal/overlay taller than the viewport with no internal scroll (unreachable
footer). A `__cleanSweep` opened each module fresh and clicked every safe tab/view-switch (no
destructive/modal-trigger buttons). Shell screens scanned on the top document.

**Combos covered (all 11 modules + shell):** 360×740 Mobile · 412×915 Mobile · 1280×800 Desktop ·
360×740 Desktop (mismatch). Admin gate bypassed (`isAdmin=true`) + `window.prompt` stubbed to open
payroll/tax (see BUG below).

## Headline result
The app's per-module mobile CSS is **thorough** — the overwhelming majority of inner screens/tabs are
clean across all 4 combos: no page overflow, no clipped tables, no unreachable modals. The V5.5
desktop regressions (clipped QMS sidebar, overlapping FABs) did **not** recur — QMS is clean at
desktop and its off-canvas drawer works at mobile. Real defects are a small, consistent set,
dominated by one recurring pattern (hero/banner rows clipped by `overflow-x:hidden`).

## Confirmed defects (objective, cross-combo)

### L-LIVE-1 — Shell top-bar: brand text overlaps the role selector at 360 mobile — **P2**
At 360px the app header renders "BUSINESS CONTROL CENTRE" brand text in the same horizontal band as
the "Store Manager" role `<select>` (role control occupies x72–212; brand text renders under it) →
visible overlap "CON**Store Manager**CENTRE". Always-visible chrome looks broken. Not a page-overflow
(z-overlap), so only the screenshot caught it. Desktop (wide) has room — mobile-only.
Evidence: screenshot `screenshots/shell-home-360-header-overlap` (Home, 360×Mobile). Combo: 360×Mobile (mobile display).

### L-LIVE-2 — Shell Home `.hero` KPI row clipped ~34px — **P2**
`div.app>main#mainContent>section#homeView>div.hero` : scrollW 366 > clientW 332, `overflow-x:hidden`.
The "Net today / Walk-ins / Cash / Expenses / Conversion / Grooming" KPI row exceeds the hero box by
~34px; rightmost content clipped. Combo: 360×Mobile.

### L-LIVE-3 — Payroll `.hero` banner clipped ~40px on EVERY pane, ALL combos — **P2**
`div.wp>div#pane-*>section.hero` : content wider than box by ~40px (`overflow-x:hidden`) on all 9 panes
(att/master/adv/gm/approval/slips/hr/reports/settings). Width-independent (~40px at 360, 412, and
1280) → a fixed intrinsic-width inner row (the `hero-r` stats block: "Working Days / Employees / …")
that neither wraps nor scrolls. Rightmost hero content cut off. Combos: 360×Mobile, 412×Mobile,
1280×Desktop, 360×Desktop (all).

### L-LIVE-4 — Tax `.cos-banner` clipped ~80px, ALL combos — **P2**
`div#cal-view>div#content>div.cos-banner` "Compliance Operating System…" : scrollW exceeds clientW by
~80px (`overflow-x:hidden`) at every width. Same class as L-LIVE-3. Combos: all 4.

### L-LIVE-5 — Service `.brand-sub` header subtitle clipped — **P3**
`header.header .brand-sub` "Watch Service Centre · Latur" : 244px content in a 168–214px box,
`overflow:hidden`, no ellipsis → hard truncation of the subtitle. Combos: all mobile widths (and 360 desktop).

### L-LIVE-6 — Planning festival grid: 5px page overflow + run-together headers — **P3**
`div.card>div.grid>div.full` "Name Dhanteras Diwali Akshaya Tritiya Raksha…" overflows the page by 5px
at 360×Mobile; the festival table header labels render with no separation (run together). M11 planning
has NO per-module MOBILE_CSS block, so it relies only on base rules — this is the one spot that shows.
Minor. Combo: 360×Mobile only (clean at 412 and desktop).

### L-LIVE-7 (minor) — Payroll back-home FAB overlaps last form-field icon — **P3**
On the HR Letters pane the shell back-home FAB (⌂, bottom-right, z70) sits over the calendar icon of
the last visible input ("Effective / Joining Date"). Page scrolls (padding-bottom:84px) so it's
reachable, but the FAB covers the field's picker button when scrolled to the bottom. Combo: mobile.
(Low confidence it's disruptive — needs device tap test.)

## Additional deep-screen checks (done live after the main sweep — all CLEAN at 360×Mobile)
- **service New-Order 12-step form:** no page overflow, step-rail reflows (`display:flex`), Wave-3
  warranty field renders. Only the header brand-name/brand-sub clip (variant of L-LIVE-5) recurs.
- **dsr day-sheet sections** (Opening / In-Out / Sales / Visitors / Walk-ins / Tasks / Marketing /
  Cleaning / Closing) walked after Manager login + Day-Start: **every section clean** (no overflow/clip/modal).

## Modals verified live at 360×Mobile (all fit/scroll — NOT defects)
- **leave** Add-Leave overlay: full form, Cancel / Submit for Approval reachable (ruled out a false P1).
- **qms** Close-Lead dialog (`.modal`, 617px in 686px vh): fields scroll internally, all reachable.
- **expense** Udhaar "Add credit": clean (no overflow/clip).

### L-LIVE-8 (observation) — qms Close-Lead modal footer vs injected floor-gate banner — **P3, verify on device**
With the QMS Close-Lead modal open, the shell-injected red "Floor gate — not cleared today" banner
stacks at the very bottom, near the modal's sticky action bar. The modal scrolls so the Save button is
reachable, but the banner sits close to / possibly over the footer button band. Needs a device tap test.
Combo: 360×Mobile.

## Coverage gaps in THIS live pass (delegated to static layout agents + user device test)
- Remaining module dialogs not opened live (service proforma/GST-invoice preview, payroll advance
  voucher & slip preview, cro_audit score modal, stock variance modal) — covered from code by the
  Lane-L static agents; final acceptance is the user's device test.

## Scanner-noise notes (so findings aren't misread)
- Intended horizontal scrollers (tab strips `.tabs`/`.tab-nav`, wrapped tables in `overflow-x:auto`)
  are NOT flagged (ancestor-scroller filter). Early `nav>button` "offenders" were false positives.
- `.sheet-actions` (payroll button row) initially mis-flagged as a "modal" via the substring "sheet";
  scanner tightened to word-boundary + positioned-element requirement.
- Transient all-zero `innerWidth` reads (iframe mid-show) are guarded (`vw<200 ⇒ invalid`, skipped).
