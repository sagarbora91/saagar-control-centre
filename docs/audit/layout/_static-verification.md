# Live verification of uncertain static layout findings — session 2026-07-03

Spot-checks of static Lane-L P1s in the live harness (360×Mobile) to confirm/refute before ranking.

## qms-L01 — "two hamburgers overlap top-left" → **REFUTED (false positive)**
Static agent claimed the module's own `.qms-menu-btn` and the shell-injected `#st-v5-qms-menu` both
render, overlapping. Live check: the module hamburger `.qms-menu-btn` computes to `display:none`
(hidden by the shell rule `html.bcc-mobile[data-mod="qms"] .qms-menu-btn{display:none !important}`,
MOBILE_CSS index.html:6244). Only the shell hamburger is visible (left:10, right:54). **No overlap.**
The agent didn't account for the injected hide rule. → Drop qms-L01, or downgrade to "verify none of
the module's other menu affordances leak." My earlier live qms sweep also showed the drawer working.

## payroll-L02 (slip preview) & payroll-L03 (HR-letter preview) — **CONFIRMED (CSS corroborated)**
- `#pane-slips .slip-preview{display:...flex;flex-direction:column;align-items:center;overflow:auto;max-height:80vh}`
  (payroll.html:390) centers a `.gmslip{width:210mm}` (~794px) child → on a <794px viewport the child
  is horizontally centered inside an `overflow:auto` box; the LEFT overflow is unreachable (browsers
  cannot scroll past a center-aligned flex item's leading edge). Left portion of the A4 slip is clipped.
- `#hr-preview-wrap` (payroll.html:1084) inline `align-items:center;justify-content:center;overflow:auto`
  with the 210mm HR letter → same left-clip.
- The mobile @media only adds `padding:8px` (line 572), which does NOT fix the centering-overflow.
- Fix direction (fix-phase): change these preview wrappers to `align-items:flex-start` (or
  `justify-content:flex-start`) so the A4 surface scrolls from its left edge. Module-CSS, additive.
Confidence: high.

## Note
These two verifications illustrate the pattern: static Lane-L findings are mostly sound but include
occasional false positives (rules hidden/overridden by the injection pipeline). Every static layout P1
will get the same confirm/refute pass in Phase 3/4 before/after fixing (plan mandates re-verify in the
same harness). Findings not yet live-checked are marked by their agent-reported confidence.
