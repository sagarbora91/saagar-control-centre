# Phase 1 Prerequisites Checklist

**Prepared:** 2026-08-02 (Asia/Calcutta)  
**Status:** BLOCKED AT ENTRY — awaiting owner decisions and sample exports  
**Scope:** D1–D3 + E1–E6 waves (deepening modules + ETP verification layer)

---

## Blocking gates (must close before Phase 1 engineering starts)

### Phase 0 closure ✋ PENDING
- [ ] Phase 0 device acceptance complete (69 cases + 4 drills, all passing)
- [ ] Legal/privacy approval of R1 policy pack
- [ ] Security posture verified
- [ ] Staff UAT complete
- [ ] Incident rehearsal complete
- [ ] Production key custody established

**Blocker reason:** Phase 1 builds on Phase 0's controls; can't claim them live until Phase 0 is accepted.

---

### Sample exports from both stores ✋ PENDING
- [ ] **WLMHW (Titan World, Latur):** real export files received for R022, R025, R013, R003
  - [ ] Files remain outside Git (no customer data in repo)
  - [ ] Header signatures extracted and recorded for detection
  - [ ] ID/leading-zero handling verified
  
- [ ] **HEMW (Helios):** real export files received for R022, R025, R013, R003
  - [ ] Files remain outside Git
  - [ ] Header signatures extracted and recorded
  - [ ] ID/leading-zero handling verified

**Blocker reason:** E1 import layer must detect and parse real exports from both stores; cannot freeze schema/headers without real samples.

---

### Report dictionaries approved ✋ PENDING
- [ ] **Dictionary owner named** (person with authority to approve mappings)
- [ ] **WLMHW dictionary approved:** all fields, transaction types, tender modes, PII whitelist, grain definitions, version stamp
- [ ] **HEMW dictionary approved:** same for the second store
- [ ] **Versions locked:** dictionaries cannot change once E1 begins parsing; any revision becomes a new version

**Blocker reason:** Every field and transaction type must be known before E1 writes to the database; unknown codes are quarantined.

---

### R022↔R025 reconciliation rule approved ✋ PENDING
- [ ] **Decision owner named** (person who approves the reconciliation logic)
- [ ] **Common grain defined:** invoice-level? line-level? How to match R022 rows to R025 rows?
- [ ] **Exact comparison fields approved:** which fields must match exactly, which can differ (e.g., net vs gross, tax vs tax-inclusive)?
- [ ] **Tolerance approved:** e.g., ₹0–₹1 per row, ₹10 aggregate, zero tolerance for unknown codes?
- [ ] **Rounding rules approved:** how to handle decimal drift in conversions?
- [ ] **Duplicate treatment approved:** how to handle exact duplicate rows (delete? count once? flag for review)?
- [ ] **Refusal behavior approved:** if R022 totals ≠ R025 totals, does the whole import batch fail or is it a warning?

**Blocker reason:** The cross-validation gate (§2 ground rule 10 in the road map) is the most valuable fraud/error check; must be crystal-clear before code.

---

### Date policy approved ✋ PENDING
- [ ] **Earliest supported business date** — before this date, no ETP data is accepted (e.g., "2024-09-16 for WLMHW, 2024-10-01 for HEMW")
- [ ] **Allowed future-day skew** — how many days into the future can an invoice date be without rejection? (e.g., "0 days" = no future dates, "3 days" = allow 3-day buffer for timezone differences)
- [ ] **Business day derivation** — INVOICEDATE is the business day, never STORETIMESTAMP (owner confirms this understanding)

**Blocker reason:** Data quality gates must be deterministic; all dates must be validated against these rules before import lands.

---

### Transaction/tender handling approved ✋ PENDING
- [ ] **Unknown transaction types** — does the import batch fail entirely (reject-closed) or are unknown types retained as "no-effect warnings pending approval"?
- [ ] **Unknown tender codes** — same question: fail-closed or quarantine-and-flag?
- [ ] **Approval workflow for unknowns** — if quarantine, who approves the unknown code? How does it enter the dictionary?

**Blocker reason:** Fail-closed is safest; quarantine requires a manual approval workflow that doesn't exist yet. Owner chooses.

---

### XLSX parser selected ✋ PENDING
- [ ] **Parser library chosen** (SheetJS? XLSX? Native Android?)
- [ ] **License checked** (open-source OK? Commercial OK?)
- [ ] **Security review done** (no RCE, no data exfil from malformed files)
- [ ] **APK size impact** (library adds how many MB?)
- [ ] **Memory footprint tested** (can it parse a 20 MB export on a 2 GB device?)
- [ ] **Malformed file handling** (what happens if the XLSX is truncated, corrupted, or has wrong schema?)
- [ ] **Android API-23 compatibility** (tested on the minimum SDK)

**Blocker reason:** XLSX parsing is the entry point for all external data; must be secure and stable before production.

---

### D1 design approved ✋ PENDING
- [ ] **D1 design note reviewed** — Home "Today" view with attention centre, ETP tile, backup health, manager clarity
- [ ] **Screen inventory** — all cards, metrics, controls listed
- [ ] **Storage keys** — all new keys registered in STORAGE_RULES for backup/restore
- [ ] **Offline tests drafted** — 12+ test cases for D1 logic
- [ ] **Owner approves scope** — are all the "Today" cards valuable? Any missing?

**Blocker reason:** D1 is the first wave; its approval gates the sequence.

---

### E1 design finalized ✋ PENDING
- [ ] **Header signatures frozen** (per the sample exports above)
- [ ] **Column whitelists finalized** (exactly which columns per report? which are dropped?)
- [ ] **FY derivation logic locked** (invoice date → FY, NEVER invoice year)
- [ ] **Normaliser rules approved** (YYYYMMDD→ISO date, IDs as TEXT, sign assignment from TRANS_TYPE)
- [ ] **Staged-write + atomic-swap mechanism** designed
- [ ] **Separate sealed store schema** (ETP store, own file, own persist cycle)
- [ ] **STORAGE_RULES split documented** (what's in bcc.sqlite, what's excluded from backup, why)

**Blocker reason:** E1 is load-bearing for the entire programme; its architecture cannot change after first build.

---

### Incentive scheme band source confirmed ✋ PENDING
- [ ] **Decision:** Titan scheme document OR owner-defined custom bands?
- [ ] **If Titan source:** which Titan ledger account/field?
- [ ] **If owner-defined:** percentage tiers (from %, to %, rate %) provided as a table
- [ ] **Clawback rules approved:** restatement → clawback, no silent reversal

**Blocker reason:** E5 (incentive) gets golden-case tests; cannot design those without knowing the band formula.

---

## Inputs required from owner RIGHT NOW

**To unblock Phase 1:**

| Input | Owner supplies | Engineering uses for |
|---|---|---|
| Sample exports (R022/R025/R013/R003 from both stores) | Files → kept secure, headers extracted only | Freeze E1 schema, detection logic |
| Dictionary approval owner name | Name + role | Authority on field/transaction mappings |
| Report dictionaries (WLMHW + HEMW) | Vetted/stamped dictionaries | Quarantine unknown codes |
| R022↔R025 reconciliation rules | Grain, tolerance, fail-closed vs quarantine | The cross-validation gate (most valuable) |
| Date policy (earliest date, future skew) | YYYY-MM-DD + days | Validate invoice dates at import |
| Transaction/tender handling | Fail-closed OR quarantine-and-flag | Quarantine workflow if applicable |
| XLSX parser preference | Library name + license | E1 build dependency |
| D1 design approval | Nod on Home "Today" cards | Scope freeze for first wave |
| E1 design sign-off | Nod on architecture | Begin E1 build |
| Incentive scheme source | Titan doc ref OR custom bands | E5 golden-case tests |
| Phase 0 completion evidence | Dated evidence summary | Unblock Phase 1 build start |

---

## Work that's already done (no owner decision needed)

✅ D1–D3 engineering complete (screens, logic, offline tests exist — ready for use once approved)  
✅ E1 foundation work drafted (no-write version exists; ready for review)  
✅ D/E/F road map + 12-wave sequence designed  
✅ STORAGE_RULES split designed (ETP facts separate, backup/restore rules explicit)  
✅ Ground rules (12 non-negotiable) documented  
✅ Blueprint cross-check protocol designed  

---

## Decision sequence

**Phase 0 ← (runs in parallel)**
- Owner submits Phase 0 nominations
- Device test runs (69 cases + 4 drills)
- Legal, security, UAT reviews complete
- Phase 0 acceptance signed

**Then Phase 1 ← (cannot start until Phase 0 closed)**
1. Owner supplies sample exports + approvals
2. Engineering freezes E1 schema + builds E1
3. D1 wave ships
4. E1 wave ships
5. D2–D12 waves in sequence

---

## No customer data in Git

**Critical rule:** Sample exports are reviewed for headers/signatures only. No customer names, balances, PINs, passphrases, provider URIs, or signing keys may be placed in Git or shared evidence.

Metadata only: row counts, aggregate totals (anonymised), column names, date ranges.

---

## Next steps

1. **Phase 0 owner:** submit nominations form (parallel)
2. **Phase 1 owner:** review this checklist, gather inputs, supply sample exports
3. **Engineering:** await Phase 0 closure + Phase 1 inputs, then freeze E1 and begin D1

Estimated Phase 1 engineering start: **2026-08-26** (if Phase 0 passes on schedule).
