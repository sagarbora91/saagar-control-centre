# bug-service — bug audit

**Target:** service.html
**Findings:** 5

**Coverage notes:** VERIFIED CORRECT (no re-audit needed): (1) DB load is crash-guarded (try/catch + Array.isArray, does not overwrite a bad value) lines 2098-2101. (2) genId() derives next seq from MAX existing numeric suffix, so it is collision-safe after a mid-list delete lines 2376-2387. (3) todayStr() uses LOCAL y/m/d (not toISOString), correct for IST date filing line 2229. (4) This module is NOT date-partitioned and never writes on a past view (readOnlyGuard on openNew/doSave/closeCase/delCase/quickStage/addFollowUp; applyReadOnlyUI disables inputs) — the ~60s bridge tick reads saagar_wsf_v2 read-only and cannot desync with user writes here; the 00:30 new-day rule does not apply to this module. (5) SERVICE_DELIVERED idempotency (wsc_<id> dedupe) lives in integration-bridge.js (lines 169-183, 432-443), NOT in this file — this module only writes the case record; bridge bounds emission on closedAt and skips zero/invalid finalAmt, so re-close does not inflate expense totals. (6) escapeHtml() is applied to every user value going into innerHTML (renderList) and into the shell print doc (buildIntakeHtml/buildProformaHtml) — stored-XSS path is closed. (7) csvCell() has both RFC-4180 quoting and formula-injection guard (line 3019). (8) closeCase() correctly requires all 5 acks + collectDate + finalAmt>0. (9) warranty auto follow-up de-dups on f.auto==='warranty' (no duplicate stacking). (10) addFollowUp mutates the STORED case by id (not via readForm), so follow-ups can't be wiped by a stale form.

NEEDS LIVE RUNTIME CHECK (could not confirm statically): (a) Whether the bridge actually records Rs 1 for a '1,200' finalAmt end-to-end (svc-money-comma-finalamt) — confirmed the parse math and the raw storage, but the ledger row is produced by integration-bridge.js which I only read, did not execute. (b) Whether #f-fa on the Android WebView keyboard actually lets a comma through with inputmode=decimal (on some soft keyboards the comma is available); on desktop it definitely is. (c) srcdoc boot cost / large-DB ANR: DB is a single localStorage array JSON.parsed once at load (line 2099) and renderDash slices/reverses the whole array each render — for a very large case count this is O(n) per keystroke via onSearch->renderDash, but PAGE_SIZE=5 caps DOM nodes; needs a device test with a big seeded DB to confirm no jank. No whole-blob re-parse on the ~60s tick inside this iframe (the bridge does that in the parent).

---

## [P1] svc-money-comma-finalamt — Comma-formatted Final Amount parses to a tiny number — closes case + feeds ledger with wrong money
- **Module/area:** service | **Confidence:** high
- **Location:** closeCase() line 3310 (`if (!(parseFloat(del.finalAmt) > 0))`), readDelivery() line 2996 (`finalAmt: g('f-fa')`), input #f-fa line 1981 (plain text field, inputmode=decimal). Downstream: integration-bridge.js line 178 `parseFloat(c.delivery.finalAmt)`.
- **Defect:** #f-fa is a free-text input (not type=number), so a user entering the amount in natural Indian style '1,200' is stored verbatim as del.finalAmt='1,200'. closeCase()'s guard does `parseFloat('1,200')` === 1, which passes `> 0`, so the case closes. The raw string is saved. The shell bridge then emits SERVICE_DELIVERED with amount = parseFloat('1,200') = 1, so the central Expense/income ledger records Rs 1 instead of Rs 1,200 — while the printed Proforma Invoice (line 3543, raw string) shows the correct 'Rs 1,200'. Owner-visible desync: invoice says 1,200, books say 1. Same defect affects #f-advpaid (advance) and the cash denomination reconciliation (calcDeno line 2285).
- **Evidence:** line 1981 `<input class="field-input" id="f-fa" placeholder="Rs 0.00" inputmode="decimal" ...>` ; line 3310 `if (!(parseFloat(del.finalAmt) > 0)) { ... }` ; bridge line 178 `var wamt=parseFloat(c.delivery.finalAmt); if(!(wamt>0)) return;`
- **Impact:** Silent money loss / ledger desync whenever staff type a thousands separator in the Final Amount. Books under-report service income; balance-due math is wrong.
- **Fix hint:** Add a rupee-parse helper that strips commas/spaces/currency before parseFloat (e.g. `Number(String(v).replace(/[^0-9.\-]/g,''))`) and use it for finalAmt/advancePaid/subTotal/gst everywhere they are validated or summed in this file. (Cannot change the bridge here, but sanitising the stored value fixes the bridge read too.) Additive only; no storage-core edits.

## [P1] svc-manual-subtotal-comma — Comma in manually-typed Sub-Total collapses the printed/estimate TOTAL to a wrong figure
- **Module/area:** service | **Confidence:** high
- **Location:** calcTotal() lines 2924-2932; subtotal input #f-st line 1839 (text field, oninput sets subTotalDirty=true).
- **Defect:** When the user manually edits the Sub-Total (subTotalDirty=true), calcTotal reads `const base = parseFloat(stEl.value || 0) || 0`. Entering '12,500' yields base=12 (parseFloat stops at the comma). GST and f-tot are then computed on 12, so f-tot shows '12.00' and estTotal is saved/printed/summed as 12. The Job Card (line 3497) and dashboard 'Est. Revenue' (line 2527) therefore show a grossly wrong total that the owner sees. Auto-filled subtotals are safe (toFixed produces no commas); only manual entry with a separator triggers it.
- **Evidence:** line 2928 `const base = parseFloat(stEl.value || 0) || 0;` ; line 1839 `<input class="tot-input" id="f-st" placeholder="0.00" oninput="subTotalDirty=true;cpDebounced()">`
- **Impact:** Owner sees and saves a wrong estimate total (e.g. Rs 12 instead of Rs 12,500) on any case where the sub-total is typed with a thousands separator; dashboard revenue is also understated.
- **Fix hint:** Same rupee-parse sanitiser as svc-money-comma-finalamt for f-st and f-gst in calcTotal(); or strip non-numeric on blur of #f-st. Additive only.

## [P2] svc-stale-subtotal-on-delete — Deleting the last estimate line leaves a stale non-zero Sub-Total / TOTAL
- **Module/area:** service | **Confidence:** high
- **Location:** calcTotal() line 2927 (`if (sub > 0 && !subTotalDirty) stEl.value = sub.toFixed(2)`); delRow() line 2908.
- **Defect:** calcTotal only pushes the recomputed line-item sum into #f-st when `sub > 0`. Repro: new order (subTotalDirty=false), add one line unit=500 -> f-st becomes '500.00'. Delete that row (delRow -> calcTotal): now sub=0, so `sub > 0` is false and f-st is NOT cleared — it stays '500.00', GST and f-tot stay 500. Saving records estTotal=500 with zero line items. The estimate no longer matches its (now empty) line items.
- **Evidence:** line 2927 `if (sub > 0 && !subTotalDirty) stEl.value = sub.toFixed(2);` — no else-branch to clear when sub===0
- **Impact:** A case can be saved/printed with an estimate total that has no backing line items after the user removed them, over-stating the estimate and dashboard revenue.
- **Fix hint:** In calcTotal, when not subTotalDirty, always write the computed sum: `if (!subTotalDirty) stEl.value = sub > 0 ? sub.toFixed(2) : '';` (so an emptied table zeroes the sub-total). Additive.

## [P2] svc-warranty-followup-not-updated-on-reclose — Editing warranty months and re-closing does not update the auto warranty follow-up date
- **Module/area:** service | **Confidence:** high
- **Location:** scheduleWarrantyFollowUp() lines 3788-3805 (idempotency guard line 3798 `if (c.followUps.some(f => f && f.auto === 'warranty')) return;`).
- **Defect:** The auto warranty/battery follow-up is created once on first close and guarded so re-closing never stacks duplicates — correct for de-dup. But if the case is reopened, the warranty months (or collectDate) changed, and the case re-closed, the existing auto follow-up's dueDate is NOT recomputed (the guard returns before push). The reminder keeps the stale expiry from the first close, so the 'Follow-up due' chip and reminder fire on the wrong date.
- **Evidence:** line 3798 `if (c.followUps.some(f => f && f.auto === 'warranty')) return;   // idempotent`
- **Impact:** Corrected warranty duration after an initial close is silently ignored by the follow-up reminder; owner may call the customer on the wrong warranty-expiry date. Low frequency (requires re-close with a changed warranty).
- **Fix hint:** When an auto=='warranty' follow-up already exists, update its dueDate/remarks in place from the recomputed `till` instead of early-returning. Still additive (same c.followUps array/shape).

## [P3] svc-invoice-seq-global-not-year-scoped — GST invoice number WS-YYYY-NNN uses a global counter — year prefix and sequence drift apart
- **Module/area:** service | **Confidence:** medium
- **Location:** assignInvoiceNo() lines 3623-3630.
- **Defect:** The invoice sequence is a single global counter `saagar_invoice_seq_v1` that is never reset per year, but the printed number pastes the CURRENT year: `'WS-' + new Date().getFullYear() + '-' + pad(seq)`. So the first 2027 invoice is not WS-2027-001 but WS-2027-<continuing seq> (e.g. WS-2027-058), and NNN keeps climbing across years. Uniqueness is preserved, but the number is misleading and NNN loses its per-year meaning. It also shares the exact format of case IDs (genId line 2386, 'WS-YYYY-NNN'), so an invoice number can coincidentally equal an unrelated case ID string.
- **Evidence:** lines 3625-3627 `let seq = parseInt(localStorage.getItem('saagar_invoice_seq_v1') || '0', 10); ... c.invoiceNo = 'WS-' + new Date().getFullYear() + '-' + String(seq).padStart(3, '0');`
- **Impact:** Cosmetic/traceability only — invoice numbers stay unique so no data corruption, but the year-NNN pairing is not what a reader expects and NNN never restarts.
- **Fix hint:** If per-year sequencing is desired, key the counter by year (e.g. `saagar_invoice_seq_v1_<year>`); otherwise keep a running number without the year segment so it does not imply a per-year reset. Additive localStorage key only.

