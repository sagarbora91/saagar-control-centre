# D1 Build Start — Home "Today" View

**Date:** 2026-08-02  
**Wave:** D1 (first D-series wave, Phase 1)  
**Baseline:** Phase 0 merged, 210/210 tests passing  
**Status:** IMPLEMENTATION STARTING NOW

---

## 1. Build checklist (Definition of Done)

- [ ] Storage keys registered in STORAGE_RULES
- [ ] Home dashboard shell created (card layout, styling)
- [ ] Card components implemented (Card 1–7)
- [ ] Role-aware visibility wired (owner, manager, staff)
- [ ] Store context badge component (permanent header)
- [ ] Reauth explanation modal
- [ ] 12 offline policy tests passing
- [ ] 8 integration tests passing
- [ ] Seeded APK built (debug, unsigned)
- [ ] CORE-D1-01 through CORE-D1-12 device cases pass
- [ ] Merge to main
- [ ] Ship date: **2026-08-23** (3 weeks)

---

## 2. Exact files to create/modify

### Storage schema (NEW)
**File:** `src/storage/storage-rules.js`

```javascript
// Add to STORAGE_RULES object:

d1_dashboard_config: {
  grain: 'app',
  kind: 'config',
  backup: true,
  compress: false,
  description: 'Home dashboard card order and visibility preferences'
},

d1_store_context: {
  grain: 'app',
  kind: 'config',
  backup: true,
  compress: false,
  description: 'Last-selected store context (WLMHW or HEMW)'
}
```

**Verification:** After edit, run offline tests for STORAGE_RULES compliance (should pass existing suite).

---

### Home dashboard component (NEW)
**File:** `src/screens/home/HomeDashboard.tsx`

**Scope:**
- Import card components (Due follow-ups, Open jobs, Cash health, Stock exceptions, Leave gaps, Backup health, Attention centre)
- Layout: vertical stack with store badge in header
- Today's date display
- Pull-to-refresh handler
- Role-aware card visibility
- Storage persistence (d1_store_context, d1_dashboard_config)

**Props:**
```typescript
interface HomeDashboardProps {
  role: 'owner' | 'manager' | 'staff';
  store: 'WLMHW' | 'HEMW';
  onRefresh: () => Promise<void>;
}
```

**State:**
- `selectedStore` (from d1_store_context)
- `visibleCards` (from d1_dashboard_config)
- `isRefreshing` (boolean)
- `todayDate` (ISO string, re-derived on app open)

---

### Card components (NEW)
**Directory:** `src/screens/home/cards/`

1. **DueFollowupsCard.tsx**
   - Source: QMS follow-ups with due_date ≤ today
   - Show: Top 3 by due_date (oldest first)
   - Fields: Customer name, reason, estimated value, days overdue
   - Action: [View all →] → QMS list
   - Visible: Owner, managers (staff: own only)
   - Hide if: No due follow-ups

2. **OpenServiceJobsCard.tsx**
   - Source: Repair register (status NOT IN Delivered, Returned_Without_Repair)
   - Show: Ready for pickup count, awaiting parts count
   - Fields: Job counts, oldest job age
   - Action: [View →] → Service workboard
   - Visible: All roles (staff: own assignments only)
   - Hide if: No open jobs

3. **CashHealthCard.tsx**
   - Source: DSR daily register + petty cash
   - Show: Opening ₹, deposits ₹, expected ₹, target ₹, variance %
   - Color: 🟢 ≤2%, 🟡 2–5%, 🔴 >5%
   - Action: [Details →] → Expense cash card
   - Visible: Owner, managers (staff: daily cash only)
   - Hide if: No daily record yet
   - Refresh: Hourly during session

4. **StockExceptionsCard.tsx**
   - Source: EOD stock closing vs opening + movements
   - Show: Variance ₹ and %, count of low-stock items
   - Color: 🟢 ≤0.5%, 🟡 0.5–2%, 🔴 >2%
   - Action: [Review →] → Stock variance triage
   - Visible: Owner, managers
   - Hide if: Stock not yet closed
   - Refresh: One-time after EOD close

5. **LeaveGapsCard.tsx**
   - Source: Leave calendar (next 7 days) vs capacity
   - Show: Days with coverage issues, staff count gaps
   - Action: [View week →] → Leave manager
   - Visible: Owner, managers (staff: own leave only)
   - Hide if: No gaps detected
   - Refresh: Weekly sync

6. **BackupHealthCard.tsx**
   - Source: BKP-03 state (read-only from backup module)
   - Show: Status emoji + verified-through date + days pending
     - ✅ "Good" if ≤24h
     - ⚠ "Warning" if 24–36h
     - 🔴 "Alert" if >36h
   - Action: [Settings →] → Backup & restore
   - Visible: Owner only (staff: not visible)
   - Hide if: BKP-03 not set up
   - Refresh: Every 6 hours during session

7. **AttentionCentreCard.tsx**
   - Source: All modules (legal, tax, security, ops)
   - Show: Top 3 alerts by priority + age
   - Actions: Dismiss (per alert), Snooze (3 days), View all →
   - Visible: Owner, managers
   - Hide if: No alerts

---

### Store context badge (NEW)
**File:** `src/components/StoreContextBadge.tsx`

**Props:**
```typescript
interface StoreContextBadgeProps {
  store: 'WLMHW' | 'HEMW';
  onTap?: () => void;
}
```

**Render:**
- Large badge in header: "WLMHW" or "HEMW"
- Color: WLMHW = blue, HEMW = green (or owner choice)
- Tappable: opens store-selection menu
- Persists: survives screen nav, app close/relaunch

---

### Reauth explanation modal (NEW)
**File:** `src/components/ReauthExplanationModal.tsx`

**Props:**
```typescript
interface ReauthExplanationModalProps {
  action: 'export' | 'delete' | 'settings' | 'admin';
  onCancel: () => void;
  onConfirm: (pin: string) => void;
}
```

**Text patterns:**
- Export: "Exporting financial data requires your PIN."
- Delete: "Deleting records requires your PIN."
- Settings: "Changing security settings requires your PIN."
- Admin: "Admin actions require owner re-auth."

---

### Offline tests (NEW)
**File:** `tests/d1-dashboard-policy.test.mjs`

**Test cases (12 total):**

```javascript
test('CORE-D1-P1: Storage STORAGE_RULES includes d1_dashboard_config and d1_store_context', () => {
  // Verify keys exist, backup=true for both, grain='app'
});

test('CORE-D1-P2: Card visibility follows role rule: owner sees all, manager sees 1–5,7, staff sees 1,2,7 filtered', () => {
  // Mock role, verify card array
});

test('CORE-D1-P3: Store context persists to d1_store_context on select', () => {
  // Save, close, relaunch, verify store context restored exactly
});

test('CORE-D1-P4: Dashboard config persists to d1_dashboard_config on change', () => {
  // Change card order, close, relaunch, verify order restored
});

test('CORE-D1-P5: Backup health card reads from backup module state (read-only)', () => {
  // Mock backup state, verify card renders without write
});

test('CORE-D1-P6: Reauth explanation modal shows correct text for each action', () => {
  // Test all 4 action types, verify text patterns
});

test('CORE-D1-P7: Today date is derived at app open, not stale', () => {
  // Mock time, verify date recalculates
});

test('CORE-D1-P8: Attention centre shows top 3 by priority/age, not all', () => {
  // Mock 10 alerts, verify 3 shown in order
});

test('CORE-D1-P9: Cash card variance color logic: green ≤2%, yellow 2–5%, red >5%', () => {
  // Test boundary values
});

test('CORE-D1-P10: Stock card variance color logic: green ≤0.5%, yellow 0.5–2%, red >2%', () => {
  // Test boundary values
});

test('CORE-D1-P11: Card hide logic: due-follow-ups hidden if none due, jobs hidden if none open, etc.', () => {
  // Mock empty data, verify cards not rendered
});

test('CORE-D1-P12: Store context badge tappable; opens store-selection menu', () => {
  // Mock menu, verify interaction
});
```

---

### Integration tests (NEW)
**File:** `tests/d1-dashboard-integration.test.mjs`

**Test cases (8 total):**

```javascript
test('CORE-D1-I1: Home screen opens without crash after app launch', () => {
  // Full render cycle, no errors
});

test('CORE-D1-I2: Due follow-ups card reads from QMS module, counts match', () => {
  // Query QMS, render card, verify count
});

test('CORE-D1-I3: Open service jobs card reads from Service module, counts match', () => {
  // Query Service, verify job counts
});

test('CORE-D1-I4: Cash health card sums Expense + Petty Cash correctly', () => {
  // Query both, verify total matches card sum
});

test('CORE-D1-I5: Stock exceptions card derives from closing snapshot, variance matches', () => {
  // Query stock, verify variance calculation
});

test('CORE-D1-I6: Leave gaps card reads from Leave calendar, coverage counts match', () => {
  // Query Leave, verify gap detection
});

test('CORE-D1-I7: Backup health card reads from backup module state, escalation levels correct', () => {
  // Mock backup timestamps, verify emoji/threshold logic
});

test('CORE-D1-I8: Store switch persists across app close/relaunch', () => {
  // Switch to HEMW, close app, relaunch, verify HEMW shown
});
```

---

## 3. Implementation sequence

### Week 1: Foundation
- [ ] Storage keys registered (STORAGE_RULES)
- [ ] Home dashboard shell (card layout HTML + CSS)
- [ ] Card component stubs (render empty for now)
- [ ] Store context badge component
- [ ] Reauth explanation modal
- [ ] Role-aware visibility wired

**Deliverable:** App opens to Home, store badge visible, 7 empty cards shown per role, reauth modal works.

### Week 2: Logic + Tests
- [ ] Each card queries source module (QMS, Service, DSR, Stock, Leave, Backup, Alerts)
- [ ] Data binding (card state ← module state)
- [ ] Color logic (cash variance, stock variance)
- [ ] Hide logic (if no data, card not rendered)
- [ ] Pull-to-refresh handler
- [ ] Offline tests written (12 passing)
- [ ] Integration tests written (8 passing)

**Deliverable:** All cards populated with real data; 20 tests passing.

### Week 3: Device acceptance
- [ ] Seeded APK built (debug, unsigned, D1 data preloaded)
- [ ] CORE-D1-01 through CORE-D1-12 device cases run
- [ ] Owner acceptance demo
- [ ] Merge to main
- [ ] Tag release: D1-ready (git tag d1-ready-v1)

**Deliverable:** D1 shipped, merged to main, ready for Phase 1 Wave D2.

---

## 4. Device test cases (CORE-D1-01 through -12)

**Device:** Seeded APK on primary device (WLMHW store, owner role)

| Case | Action | Expected | Pass? |
|---|---|---|---|
| CORE-D1-01 | Open app | Home screen loads; today's date shown; store badge = WLMHW; no crash | |
| CORE-D1-02 | Tap store badge | Menu appears; select HEMW; badge switches to HEMW | |
| CORE-D1-03 | Scroll home | All 7 cards visible; no missing data in any card | |
| CORE-D1-04 | Verify Card 1 count | Due follow-ups card shows top 3 by due_date; count matches QMS | |
| CORE-D1-05 | Verify Card 2 count | Open jobs card shows ready + awaiting counts; match Service module | |
| CORE-D1-06 | Verify Card 3 variance | Cash card shows variance color correct (green/yellow/red); matches DSR | |
| CORE-D1-07 | Tap reauth trigger (e.g., export) | Reauth modal appears; text explains action; PIN entry works | |
| CORE-D1-08 | Close app and relaunch | Store context persists (HEMW shown); dashboard config same | |
| CORE-D1-09 | Switch role to staff | Cards 3, 4, 6 hidden; Cards 1, 2, 7 filtered (own data only) | |
| CORE-D1-10 | Pull to refresh | All card data updates; no duplicates or stale data | |
| CORE-D1-11 | Navigate to another module and back | Store badge persists; card data same | |
| CORE-D1-12 | Check backup health escalation | If backup >36h overdue, card shows 🔴 Alert; [Settings →] tappable | |

---

## 5. Rollout plan

**Merge to main:** Week 3 (2026-08-23)  
**Next wave:** D2 (module-specific refinement, starts immediately after D1 ships)

---

**Status:** READY TO CODE

All design decisions locked. Proceed with Week 1 foundation work.

