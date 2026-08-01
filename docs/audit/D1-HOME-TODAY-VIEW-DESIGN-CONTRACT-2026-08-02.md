# D1 — Home "Today" View: Design Contract

**Prepared:** 2026-08-02 (Asia/Kolkata)  
**Wave:** D1 (first module-deepening wave)  
**Module:** Core / Home shell  
**Baseline:** Phase 0 merged, 210/210 tests green  
**Status:** DESIGN FOR OWNER APPROVAL

---

## 1. Executive summary

**D1 replaces the static home screen with a role-aware "Today" card stack.** Every time the app opens, the owner sees:
- **Store context** (impossible to miss — large badge showing WLMHW or HEMW)
- **5–7 "Today" cards** (due follow-ups, open service jobs, cash/stock exceptions, leave gaps, tax due, backup health)
- **Attention centre** (dismissible alerts from various modules)
- **Reauth explanation** (why a PIN is being asked; how to recover if forgotten)

**Why:** Reduces the need for managers to navigate 11 modules just to know what to do first. Shows health of the system (backup status, exceptions) without asking.

**Audience:** Owner + managers (daily), staff (occasional). Each role sees different cards (owner sees ₹ figures, staff sees only their own tasks).

---

## 2. Scope (what's in D1)

### Screens (new/modified)
- **Home dashboard** (replaces empty home, now shows card stack)
- **Attention centre** (already exists; D1 refines it to surface top 3 alerts)
- **Reauth explanation modal** (shows why re-auth is needed, how to recover)
- **Backup health tile** (links to Settings → Backup & restore)
- **Store context badge** (permanent, on every screen's header)

### Logic (new)
- Role-aware card visibility (owner sees all, staff sees only their own)
- Today's date context (all cards are "as of today"; no stale data)
- Exception prioritization (which cards surface first?)
- Card refresh cadence (refresh on app open? Every 30 min? On manual pull-to-refresh?)

### Storage (new keys)
- `d1_dashboard_config` — card preferences (which cards shown, order)
- `d1_today_context` — cached today's date, role, store
- `d1_backup_health_state` — last backup status, time, escalation state (read-only from backup module)

### No storage-core change
- All data is *read-only* views over existing modules (QMS follow-ups, Service jobs, DSR daily cash, Stock exceptions, Leave calendar, Tax due, Backup state)
- No new fact table
- No new import

---

## 3. Mockup: Home dashboard card stack

```
┌─────────────────────────────────────────┐
│   ☰ (menu)    WLMHW    👤 (owner)      │  ← Store context badge (bright, unmissable)
├─────────────────────────────────────────┤
│  Today — Friday, 2 August 2026          │
├─────────────────────────────────────────┤
│  📌 DUE FOLLOW-UPS                      │  ← Card 1
│  • Sagar's battery warranty (Est: ₹2.2k)│
│  • Shilpa's gold repair (3 days overdue)│
│  [View all →]                           │
├─────────────────────────────────────────┤
│  🛠  OPEN SERVICE JOBS                  │  ← Card 2
│  • 5 jobs ready for pickup              │
│  • 2 jobs awaiting parts                │
│  [View →]                               │
├─────────────────────────────────────────┤
│  💰 CASH HEALTH                         │  ← Card 3
│  • Opening: ₹12,500                     │
│  • Deposits so far: ₹89,450              │
│  • Expected closing: ₹1,02,000 (target: ₹1,00,000)  │
│  [Details →]                            │
├─────────────────────────────────────────┤
│  📦 STOCK EXCEPTIONS                    │  ← Card 4
│  • Variance: ₹-2,340 (0.4% shrinkage)   │
│  • 2 items below reorder point           │
│  [Review →]                             │
├─────────────────────────────────────────┤
│  🏥 LEAVE GAPS                          │  ← Card 5
│  • Monday: 2 staff approved, 1 gap       │
│  • Tuesday: full coverage                │
│  [View week →]                          │
├─────────────────────────────────────────┤
│  ⚠  BACKUP HEALTH ✅ GOOD               │  ← Card 6
│  Verified through 2 Aug · 0 days pending │
│  [Settings →]                           │
├─────────────────────────────────────────┤
│  🔔 ATTENTION [3]                       │  ← Card 7 (or modal on first open)
│  • Tax deadline: 31 Aug (29 days)        │
│  • Store review pending (CRO audit)      │
│  • GST filing in draft                   │
│  [View all →]                           │
├─────────────────────────────────────────┤
│  [Refresh ↻]                             │
└─────────────────────────────────────────┘
```

---

## 4. Card specifications

### Card 1: Due follow-ups
- **Source data:** QMS follow-ups with due_date <= today
- **Count:** Top 3 by due_date (oldest first)
- **Fields shown:** Customer name, follow-up reason, estimated value, days overdue (if applicable)
- **Action:** [View all →] navigates to QMS follow-up list
- **Hide if:** No follow-ups due
- **Role visibility:** Owner + managers (staff sees only their own)
- **Refresh:** On app open; manual refresh

### Card 2: Open service jobs
- **Source data:** Repair register with status NOT IN (Delivered, Returned_Without_Repair)
- **Count:** Number ready for pickup + number awaiting parts
- **Fields shown:** Total job count, breakdown by status, oldest job age
- **Action:** [View →] navigates to Service workboard
- **Hide if:** No open jobs
- **Role visibility:** All (but staff sees only their own assignments)
- **Refresh:** On app open; manual refresh

### Card 3: Cash health
- **Source data:** Petty cash + DSR daily register
- **Count:** Opening balance, deposits, expected closing, target, variance
- **Fields shown:** Opening ₹, deposits ₹, expected ₹, target ₹, variance %
- **Color:** 🟢 Green if variance ≤ 2%, 🟡 Yellow if 2–5%, 🔴 Red if > 5%
- **Action:** [Details →] navigates to Expense cash card (D6)
- **Hide if:** No daily record yet (before EOD close)
- **Role visibility:** Owner + managers (staff sees daily cash only)
- **Refresh:** On app open; hourly during active session; manual refresh

### Card 4: Stock exceptions
- **Source data:** Closing stock snapshot (EOD) vs opening + today's movements
- **Count:** Variance ₹ and %, items below reorder point
- **Fields shown:** Variance amount/%, count of low-stock items, largest variance category
- **Color:** 🟢 Green if ≤ 0.5% variance, 🟡 Yellow if 0.5–2%, 🔴 Red if > 2%
- **Action:** [Review →] navigates to Stock variance triage (D5)
- **Hide if:** Stock not yet closed for the day
- **Role visibility:** Owner + managers
- **Refresh:** After EOD close (one-time); manual refresh

### Card 5: Leave gaps
- **Source data:** Leave calendar for next 7 days vs capacity requirements
- **Count:** Days with coverage issues (< required headcount) + count of staff missing
- **Fields shown:** Today + next 6 days; gaps per day; expected impact
- **Action:** [View week →] navigates to Leave manager calendar (D8)
- **Hide if:** No gaps detected
- **Role visibility:** Owner + managers (staff sees only their own leave)
- **Refresh:** On app open; weekly sync

### Card 6: Backup health
- **Source data:** Backup module state (BKP-03 last delivery + DAT-02 last test)
- **Count:** Status emoji + verified-through date + days pending
- **Fields shown:**
  - ✅ "Good" if BKP-03 delivered within 24 hours
  - ⚠ "Warning" if 24–36 hours (escalation clock running)
  - 🔴 "Alert" if > 36 hours (critical action needed)
  - Date verified through (from BKP-03 batch period-end)
  - Days pending (today - verified date)
- **Action:** [Settings →] navigates to Backup & restore settings (Phase 0)
- **Hide if:** BKP-03 not yet set up
- **Role visibility:** Owner (staff does not see)
- **Refresh:** On app open; every 6 hours during active session

### Card 7: Attention centre (top 3 alerts)
- **Source data:** All modules (legal, tax, security, operational)
- **Count:** Top 3 by priority + age
- **Fields shown:** Alert type, message, days until due/after due, action link
- **Actions:** Dismiss (per alert), Snooze (3 days), View all →
- **Examples:**
  - "Tax deadline: 31 Aug (29 days)"
  - "Store review pending (CRO audit due)"
  - "GST filing in draft (review before submission)"
- **Hide if:** No alerts
- **Role visibility:** Owner + managers
- **Refresh:** On app open; manual refresh

---

## 5. Role-aware visibility

### Owner sees
- All cards (1–7)
- ₹ amounts (cash, follow-up value, variance)
- All-store data (no store filter)
- Staff assignments (who's on leave)
- All alerts

### Managers see
- Cards 1–5, 7 (not backup health)
- ₹ amounts for their store only
- Their team's follow-ups and jobs
- Relevant alerts (store-scoped)

### Staff see
- Cards 1, 2, 7 (highly filtered)
- No ₹ amounts (except their own cash handling)
- Only their own follow-ups, jobs, leave
- Alerts affecting them

---

## 6. Store context (on every screen)

**Design:**
- Large badge in header: "WLMHW" or "HEMW"
- Color-coded: WLMHW = blue, HEMW = green (or owner's choice)
- Tappable: opens store-selection menu
- Persists: survives screen navigation, app close/relaunch

**Why:** Staff can easily confirm which store they're looking at. Multi-store mistakes (entering cash for the wrong store) are costly.

---

## 7. Reauth explanation

**Trigger:** When a sensitive action (export, PIN change, delete data) asks for re-auth.

**Modal content:**
```
┌──────────────────────────────────┐
│ Re-authentication required       │
├──────────────────────────────────┤
│ Why?                             │
│ Exporting financial data         │
│ requires your PIN to confirm.    │
│                                  │
│ Forgot your PIN?                 │
│ • Owner PIN: Contact the owner   │
│ • Staff PIN: Request via manager │
│                                  │
│ Enter your PIN:                  │
│ [●●●●]                           │
│                                  │
│ [Cancel]  [Confirm]              │
└──────────────────────────────────┘
```

**Text patterns (reusable):**
- Export: "Exporting financial data requires your PIN."
- Data delete: "Deleting records requires your PIN."
- Settings change: "Changing security settings requires your PIN."
- Admin action: "Admin actions require owner re-auth."

**Why:** Reduces friction (explains intent) while maintaining security (PIN is still required).

---

## 8. Storage keys for backup/restore

| Key | Type | Backed up? | Purpose |
|---|---|---|---|
| `d1_dashboard_config` | JSON | ✅ Yes | Card order, visibility preferences (owner choice) |
| `d1_today_context` | String | ❌ No | Cached today date (re-derived at app open) |
| `d1_backup_health_state` | JSON | ❌ No | Read-only cache from backup module (read at app open) |
| `d1_store_context` | String | ✅ Yes | Last-used store (owner preference) |

**Rule:** Only `d1_dashboard_config` and `d1_store_context` go into backup. The rest are cache/transient.

**STORAGE_RULES update:**
```javascript
STORAGE_RULES: {
  ...existing_rules,
  d1_dashboard_config: {
    grain: 'app',
    kind: 'config',
    backup: true,
    compress: false,
    description: 'Home dashboard card order and visibility'
  },
  d1_store_context: {
    grain: 'app',
    kind: 'config',
    backup: true,
    compress: false,
    description: 'Last-selected store (WLMHW or HEMW)'
  }
}
```

---

## 9. Test cases (from the 69-case catalogue)

**CORE-D1-01:** Home screen opens without crash; today's date is current  
**CORE-D1-02:** Store badge shows correct store; tapping switches store  
**CORE-D1-03:** All cards render without missing data (follow-ups, jobs, cash, stock, leave, backup, alerts)  
**CORE-D1-04:** Card counts match underlying module counts (off-by-one detection)  
**CORE-D1-05:** Reauth explanation modal appears on sensitive action; PIN entry works  
**CORE-D1-06:** After app close/relaunch, store context and dashboard config persist exactly once  
**CORE-D1-07:** Owner sees ₹ amounts; staff sees no ₹; managers see their store's ₹ only  
**CORE-D1-08:** Backup health tile updates on schedule (every 6 hours during active session)  
**CORE-D1-09:** Attention centre shows top 3 alerts, not all; dismiss/snooze work  
**CORE-D1-10:** Pull-to-refresh updates all card data without duplicating  
**CORE-D1-11:** Cards hide correctly when data is empty (no open jobs = card 2 hidden)  
**CORE-D1-12:** Store context persists across module navigation (no lost context)  

---

## 10. Offline regression tests

**New test suite:** `tests/d1-dashboard-policy.test.mjs` (target: 12 passing)

- Card visibility logic (role + data combination)
- Store context persistence (app open/close, module nav)
- Storage key sync (STORAGE_RULES compliance, backup/restore)
- Backup health state reading (read-only, no write)
- Reauth explanation text (patterns matched)
- Date logic (today's date is correct, time zone agnostic)
- Attention centre prioritization (top 3 by priority/age)
- Exception counts (cash variance, stock variance, leave gaps)

---

## 11. Offline integration tests

**New test suite:** `tests/d1-dashboard-integration.test.mjs` (target: 8 passing)

- Home screen renders after app open (no crash)
- Follow-ups card reads from QMS module correctly
- Service jobs card reads from Service module correctly
- Cash card sums Expense + Petty Cash correctly
- Stock card derives from closing snapshot correctly
- Leave card reads from Leave calendar correctly
- Backup health card reads from backup module correctly
- Store switch persists across relaunch

---

## 12. Implementation sequence

**Week 1:**
- [ ] Storage keys defined + STORAGE_RULES updated
- [ ] Card rendering logic implemented (HTML + CSS)
- [ ] Role-aware visibility wired
- [ ] Store context badge component

**Week 2:**
- [ ] Offline tests written (12 passing)
- [ ] Integration tests written (8 passing)
- [ ] Reauth explanation modal
- [ ] Backup health tile + refresh cadence

**Week 3:**
- [ ] Seeded APK built + device cases (CORE-D1-01..12)
- [ ] Owner demo + acceptance
- [ ] Merge to main

---

## 13. Owner approval checklist

Before D1 build begins, owner must confirm:

- [ ] **Home screen mockup approved** — card layout, order, styling
- [ ] **Card content approved** — which metrics shown per card? Any missing?
- [ ] **Store context badge approved** — size, placement, color (WLMHW blue, HEMW green?)
- [ ] **Role visibility approved** — what does staff see vs manager vs owner?
- [ ] **Reauth explanation text approved** — is the language clear?
- [ ] **Backup health escalation approved** — 24h warning threshold, 36h critical threshold OK?
- [ ] **Card refresh cadence approved** — on open only? Every hour? Manual only?
- [ ] **Storage keys approved** — which cards are backed up? Which are transient?

---

## 14. Design review checklist (before code)

- [ ] Mockup aligns with Phase 0 (no new storage-core changes)
- [ ] Test cases are specific (not vague)
- [ ] Storage keys are registered in STORAGE_RULES
- [ ] Role visibility rules are unambiguous
- [ ] Card hide logic is clear (when exactly does a card disappear?)
- [ ] Backup/restore behavior is tested (config persists, cache does not)
- [ ] Design matches the module-wise test catalogue (CORE-01..06 still pass)
- [ ] Blueprint cross-check done (existing Home screen patterns reviewed)

---

**Status:** AWAITING OWNER APPROVAL

Once approved, D1 build can start immediately after Phase 0 device acceptance closes (~2026-08-26).
