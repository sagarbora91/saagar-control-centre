# bug-report — bug audit

**Target:** saagar-report.js
**Findings:** 10

**Coverage notes:** VERIFIED-CORRECT (read the full 1694-line file):
- Null/empty guards are present and correct on every report builder: each has an early !data return with a header + {t:'empty'} block (cashStatement !c.rec, dsrRegister !d.present, qmsReport !q.total, croAudit !list.length, payrollRegister !items.length, statutorySummary !t, qmsEodSummary !k, leaveRegister/grooming/expense/tax/service all guarded). No builder indexes into undefined data before the guard.
- leaveRegister DOES exclude pending/rejected: line 584 `if (l.status && l.status !== 'approved') return;` — only status==='approved' or legacy status-less rows pass (documented as mirroring the LEAVE_APPROVED bridge guard). This requirement is MET.
- Rupee glyph: renders via embedded DMSans subset (fonts/DMSans-normal.js + -bold.js); setFonts() hard-asserts both weights before drawing so a missing subset fails loudly rather than emitting tofu (see bug-10 for the flip-side).
- Lakh grouping: toLocaleString('en-IN') gives correct Indian digit grouping (₹12,34,567). Correct.
- Pagination: autoTable rowPageBreak:'avoid' + pageBreak:'auto' + showHead:'everyPage' never splits a row mid-row; foot showFoot:'lastPage'; running header/footer drawn idempotently (DRAWN map) with literal 'Page x of y' in a final furniture pass. Money foot totals are pre-summed in the builder (T.*), NOT re-summed from truncated display strings, and raw[] carries exact numerics for the carry-forward — so page splits do not corrupt totals.
- Landscape: stockRegister/qmsReport/croAudit/payrollRegister/leaveRegister/qmsEodSummary all return orientation:'landscape'; renderDoc honours it and sets tighter L/R margins. Correct.
- SAN.text strips emoji/symbols so real data with a stray emoji won't corrupt the vector text. trunc caps long strings so linebreak overflow is bounded.
- batchSlips/ZIP: buildBatch('combined') = one PDF, {t:'pagebreak'} between slips (no trailing blank page via the _i<length-1 guard in renderDoc); buildBatch('zip') = one renderDoc per employee into JSZip loaded on demand (ensureZip appends jszip.min.js, offline-local, not in the core gate so a JSZip failure never blocks normal reports). ZIP filenames are sanitised. Correct.

NEEDS-RUNTIME (could not execute; confirm on device with 366-day / full seeded data):
1. bug-01 leave span persistence — how leavedesk_v3 stores a multi-day leave (per-day duplication vs single record) decides whether Leave-Days undercounts. Load a real ≥3-day approved leave and check the register total.
2. bug-05 carry-forward furniture — feed payrollRegister/leaveRegister enough rows to force a page break exactly before the foot row and confirm brought/carried-forward lines pair up on every page.
3. bug-07 serviceAging KPI-vs-table divergence — compare computeServiceAging bucket counts against the locally-recomputed open[] list on seeded service data (different closed-word/date-field rules).
4. bug-06 payroll mirror OT plug — build payrollRegister from the localStorage mirror (not live opts) after a real run and confirm the OT column matches actual overtime, not a back-solved residual.
5. bug-10 font load — pull one DMSans font file from the offline bundle and confirm the failure mode (whole-engine toast) matches, then verify both files are in the packaged manifest.
No P0 confirmed. Highest-value items are the two GST-invoice arithmetic inconsistencies (bug-02 high-confidence, bug-03 medium) and the leave-span undercount (bug-01) since all three touch owner/customer-facing figures.

---

## [P1] bug-01 — Multi-day leave collapses to 1 day unless duplicated under every date-key
- **Module/area:** leaveRegister | **Confidence:** medium
- **Location:** saagar-report.js:582-591 (leaveRegister builder)
- **Defect:** Leave-day counting relies on the SAME leave object appearing once under each calendar day-key in leavedesk_v3.leaves. The dedup key is name|leaveFrom|leaveTo|type; the FIRST occurrence creates rec.days=1, every subsequent day-key that repeats the same object does seen[key].days++. So a 3-day leave is only counted as 3 days IF the store writes it under all 3 date-keys. If leavedesk stores a span-leave ONCE (under leaveFrom only) with leaveFrom≠leaveTo, days stays 1 and the Leave-Days column + payroll KPI undercount the actual span. There is no from/to date-diff fallback to derive the true span, so the register silently disagrees with the roster.
- **Impact:** Payroll-facing leave-day totals can be materially wrong (a week-long leave shown as 1 day), understating deductions the owner relies on. Whether it triggers depends entirely on the leavedesk write pattern — needs runtime confirmation of how spans are persisted.
- **Fix hint:** When l.leaveFrom and l.leaveTo differ, compute inclusive day-span from the two ISO dates (local-midnight, floor) and use that as rec.days instead of the ++ counter; keep the ++ path only as a fallback for stores that do duplicate per-day. Additive logic in the builder only — no storage change.

## [P1] bug-02 — GST invoice CGST+SGST halves can display 1 rupee more/less than Total GST
- **Module/area:** serviceTaxInvoice | **Confidence:** high
- **Location:** saagar-report.js:821, 841-845
- **Defect:** gstAmt = sub*gstPct/100. CGST and SGST are each printed as inr(gstAmt/2), i.e. Math.round(gstAmt/2) TWICE and independently. When gstAmt is an odd rupee amount (e.g. 101), inr(50.5) rounds to ₹51 for BOTH halves → CGST+SGST shown = ₹102, while 'Total GST' printed as inr(gstAmt)=inr(101)=₹101 and 'Total Payable'=sub+gstAmt=₹101. The two halves shown on the tax invoice do not sum to the Total GST / Total Payable shown on the same invoice.
- **Impact:** A legal GST tax invoice can show internally inconsistent tax figures (halves sum ≠ total) by ±1 rupee. Small in value but it is a wrong money figure on a document handed to a customer / used for filing.
- **Fix hint:** Round one half and derive the other by subtraction: cgst = Math.round(gstAmt/2); sgst = Math.round(gstAmt) - cgst; then show inr(cgst)/inr(sgst) and Total GST = inr(cgst+sgst). No new libs, builder-only.

## [P1] bug-03 — Invoice Total Payable can use owner-entered finalAmt that doesn't reconcile with taxable+GST shown
- **Module/area:** serviceTaxInvoice | **Confidence:** medium
- **Location:** saagar-report.js:822, 843-845
- **Defect:** finalAmt = parseFloat(del.finalAmt) || (sub + gstAmt). If del.finalAmt is present but was entered/rounded to a value other than sub+gstAmt (e.g. rounded-off collection, or entered before GST%), the invoice prints Taxable Value (sub), Total GST (gstAmt) and a Total Payable (finalAmt) that do not add up. There is no guard that finalAmt ≈ sub+gstAmt.
- **Impact:** Tax invoice may show Taxable + GST ≠ Total Payable, an arithmetic inconsistency on a GST document. Depends on whether del.finalAmt is ever set independently of sub/gst — needs runtime confirmation of the delivery flow.
- **Fix hint:** Either always compute finalAmt = sub+gstAmt for the invoice, or when del.finalAmt differs by >₹1 add a rounding-adjustment line so the components reconcile to the printed total. Builder-only.

## [P2] bug-04 — Negative currency renders as '₹-500' (sign after the rupee symbol)
- **Module/area:** formatters (inr) — cashStatement, ownerBrief, ownerMonthly, expenseMonthly | **Confidence:** high
- **Location:** saagar-report.js:16 (inr), used at 150/193/219 (variance), 693/860/873/879 (surplus/net P&L)
- **Defect:** inr(n) = '₹' + Math.round(n).toLocaleString('en-IN'). For negatives toLocaleString yields '-500', so output is '₹-500' instead of '-₹500'. Appears wherever a shortfall/loss is shown: cash variance when short, Net P&L loss, operating surplus deficit, KPI negative subs.
- **Impact:** Cosmetic on money the owner sees — the figure and its magnitude are correct, only the minus/symbol order is non-standard. Not a wrong value, but reads oddly on cash-mismatch and loss lines.
- **Fix hint:** In inr(), format the absolute value and prefix the sign: var v=Math.round(Number(n)||0); return (v<0?'-':'')+'₹'+Math.abs(v).toLocaleString('en-IN'); Single-line change, no behaviour change for positives.

## [P2] bug-05 — Brought/Carried-forward lines skipped when the final page holds only the foot (or head) row
- **Module/area:** renderDoc carry-forward (payrollRegister, leaveRegister, dsr/qms bill tables) | **Confidence:** medium
- **Location:** saagar-report.js:1153-1164 (drawCarryAfter) + 1176-1182 (didDrawCell page tracking)
- **Defect:** carry.pageRows is populated only from didDrawCell where d.section==='body'. Page membership and rec.max/rec.min derive purely from body rows. If autoTable pushes the TOTAL (foot) row — or a repeated header — onto a fresh final page with no body rows on it, that page is absent from pageRows: no 'Brought forward' is drawn on it, yet the previous page still gets a 'Carried forward' equal to the grand total that then re-appears immediately as the foot TOTAL. Also, if a single body row is the only one on a trailing page, rec.min===rec.max and the brought/carried math still works, but the foot-only-page case produces a visually redundant/again-missing carry line.
- **Impact:** On large seeded datasets (366-day / many-employee registers) a page break landing right before the foot row yields a carried-forward line with no matching brought-forward on the last page — looks like a dropped continuation. Money totals in the foot remain correct; only the running-total furniture is off. Needs runtime repro with a body that fills to exactly the page boundary.
- **Fix hint:** After autoTable, also seed pageRows for doc.lastAutoTable pages that only carry head/foot (use lastAutoTable.startPageNumber..finalY page span), or suppress the 'Carried forward' on the second-to-last page when the next page has no body rows. Renderer-only.

## [P2] bug-06 — Payroll fallback OT is back-solved and can be silently wrong / hide sign errors
- **Module/area:** payrollRegister (fallback path), payrollSlip | **Confidence:** medium
- **Location:** saagar-report.js:403, 441
- **Defect:** In the localStorage fallback (shell Reports hub, no live opts.rows), overtime is derived as ot = Math.max(0, Math.round(net + pt + pf + esic + advance - gross)). This assumes net = gross + ot - (pt+pf+esic+advance) exactly. If the stored net was computed with any other component (rounding, special allowance, LOP already applied differently), the reconstructed OT absorbs the entire discrepancy, and the Math.max(0,...) clamps a negative residual to 0 — so Gross+OT and the OT column can misstate the earnings split while Net stays right. The live opts path (fromOpts) is exact; only the mirror path is affected.
- **Impact:** Salary register / slip built from the mirror (not opened live from payroll) can show an OT figure that is a plug rather than real overtime, misrepresenting the earnings breakdown to the owner. Net Pay stays correct. Depends on how faithfully net was mirrored — needs runtime check against a real payroll run.
- **Fix hint:** Prefer a stored r.ot when present in the mirror; only back-solve when no OT field exists, and label the reconstructed value (e.g. footnote) so a clamped/negative residual is visible rather than silently zeroed. Builder-only, additive.

## [P2] bug-07 — serviceAging table uses computeServiceAging KPI counts but its own recomputed open list — bucket vs row divergence possible
- **Module/area:** serviceAging | **Confidence:** medium
- **Location:** saagar-report.js:748-769
- **Defect:** The KPI tiles (Total Open, 0-3/4-7/8-15/16+) come from G('computeServiceAging'), but the detail table re-derives the open set locally by filtering saagar_wsf_v2 on a hardcoded closedW word list and re-ages with local-midnight/floor. If computeServiceAging uses a different closed-status definition or different date field precedence than the local filter, the KPI '16+' count and the number of rows flagged j.__days>15 in the table can disagree, and Total Open (KPI) may not equal open.length (table).
- **Impact:** Owner sees a header count of open/aged cases that does not match the rows listed below it — erodes trust and can hide or invent a backlog case. Real divergence depends on computeServiceAging's internal rules — needs runtime comparison on seeded service data.
- **Fix hint:** Drive both the KPI numbers and the table from ONE source: either surface computeServiceAging's own open list, or compute buckets locally from the same filtered 'open' array used for the table. Builder-only.

## [P2] bug-08 — cashDetail expected-closing ignores non-cash opening and never validates counted vs bank+drawer
- **Module/area:** cashStatement / cashDetail | **Confidence:** low
- **Location:** saagar-report.js:49-53, 216-220
- **Defect:** expected = opening + cashIn - cashOut, variance = counted - expected. Separately 'Retained in drawer' = inr(counted - bankDep). There is no cross-check that counted == bankDep + retained, and denoTotal silently coerces non-numeric denomination counts via Number(map[d])||0 (a stray string denom count becomes 0). So a corrupted physDeno/bankDeno entry quietly drops cash from the counted/deposited totals without flagging, changing the variance the owner reconciles against.
- **Impact:** A single malformed denomination value silently understates counted cash and can turn a balanced day into an apparent shortage (or mask a real one). Requires a non-numeric denom value in storage to trigger — low likelihood but it is the owner's cash-reconciliation figure.
- **Fix hint:** In denoTotal, distinguish missing (0) from non-numeric (NaN) and surface a 'denomination data unreadable' note; add an assert that bankDep ≤ counted and show a warning when counted-bankDep is negative. Builder/helper-only, no storage write.

## [P2] bug-10 — Font-embedding failure throws late (per-render) rather than degrading — a missing DMSans blanks every report
- **Module/area:** setFonts / renderDoc | **Confidence:** medium
- **Location:** saagar-report.js:972-977, 1226
- **Defect:** setFonts() throws 'DMSans normal+bold not registered' if either weight is missing. renderDoc calls it after constructing the doc; the throw propagates to build()/generate()/preview() which only toast('Could not build report'). Offline, if fonts/DMSans-normal.js or -bold.js fails to load, NO report renders at all (hard fail) and the only signal is a transient toast — there is no fallback to a core PDF font, so the rupee glyph requirement takes the whole engine down.
- **Impact:** A single missing/failed font asset in the offline bundle disables the entire report engine (all 20 report types) with only a toast, not a partial or plain-font PDF. Depends on asset-load reliability in the packaged APK — needs runtime confirmation the two font JS files always register.
- **Fix hint:** This is by-design (rupee correctness) but the failure is silent; keep the throw yet ensure the build gate that loads the fonts surfaces a persistent, explicit 'reports unavailable — font not loaded' state rather than a transient toast, and verify both font files are in the offline manifest. No code path should invent a substitute rupee.

## [P3] bug-09 — trunc() truncation can garble the last visible characters and drops width-0 guard
- **Module/area:** trunc (all tables using trunc) | **Confidence:** high
- **Location:** saagar-report.js:1139
- **Defect:** trunc(s,n) returns s.slice(0, n-2)+'...' when s.length>n. For very small n (n<=2) n-2 is <=0, so slice(0,0)+'...' yields just '...', losing the value entirely; and it counts JS string length, so a multi-codepoint name is cut mid-grapheme. Column truncation widths in builders are all comfortably >2 so the '...'-only case isn't hit today, but any future narrow column (n<=2) would silently blank the cell.
- **Impact:** No current wrong-data case (all call sites use n>=12); purely a latent trap for narrow columns and combining-character names. Trivial.
- **Fix hint:** Guard: if (n<=1) return s.slice(0,n); use Math.max(0,n-1)+'…' or keep at least one real char before the ellipsis. Helper-only.

