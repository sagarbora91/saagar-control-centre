/* ═══════════════════════════════════════════════════════════════════════════
   SAAGAR CONTROL CENTRE — DEMO DATA SEEDER  (verification build only)
   ───────────────────────────────────────────────────────────────────────────
   Populates ~180 days (6 months) of cross-consistent dummy data across all 10 modules so the
   owner can click through every module + Report and confirm they work under load.
   • Runs ONCE on first launch (guarded by saagar_demo_seeded). Factory Reset sets
     that flag to 'cleared' so a reset device stays clean and never re-seeds.
   • Loads BEFORE integration-bridge.js so the bridge reconciles the seeded data.
   • Shapes come from the 10-module schema audit; field names are exact.
   To ship a clean (no-demo) build, simply omit this <script> from index.html.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  try {
    if (localStorage.getItem('saagar_demo_seeded')) return;       // already seeded or reset
  } catch (e) { return; }

  var __runSeed = function () {
  var LS = localStorage;
  function set(k, v) { try { LS.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} }
  var FIRSTN = ['Amol', 'Sunita', 'Rohit', 'Sneha', 'Prakash', 'Vaishali', 'Ganesh', 'Pooja', 'Nilesh', 'Swati', 'Sachin', 'Rupali', 'Mahesh', 'Anita', 'Kiran', 'Deepak', 'Manisha', 'Suraj', 'Jyoti', 'Ramesh', 'Vandana', 'Sagar', 'Komal', 'Vishal'];
  var LASTN = ['Patil', 'Deshmukh', 'Kulkarni', 'Jadhav', 'Pawar', 'Shinde', 'Bora', 'Joshi', 'Kale', 'Gaikwad', 'More', 'Salunke', 'Mane', 'Chavan', 'Sawant', 'Nikam'];

  /* ── deterministic RNG so re-seeds are identical ── */
  var _s = 1234567;
  function rnd() { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; }
  function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function r2(n) { return Math.round(n * 100) / 100; }

  /* ── date helpers: last N calendar days, noon-anchored so the YYYY-MM-DD is
        stable whether a module slices it as local or UTC ── */
  var DAYS = (typeof window !== 'undefined' && window.__SEED_DAYS) || 180;   // default 180 days (all harnesses calibrate to this); the 1-year TEST BUILD sets window.__SEED_DAYS=365
  var today = new Date(); today.setHours(12, 0, 0, 0);
  function dayN(k) { var d = new Date(today); d.setDate(d.getDate() - k); d.setHours(12, 0, 0, 0); return d; }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var DATES = [];                       // oldest → newest, DAYS+1 entries (incl today)
  for (var k = DAYS; k >= 0; k--) DATES.push(dayN(k));
  var DSTR = DATES.map(ymd);
  var TODAY = ymd(today);
  var MONTHNAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var curMonth = MONTHNAMES[today.getMonth()], curYear = today.getFullYear();
  var curYM = curYear + '-' + String(today.getMonth() + 1).padStart(2, '0');
  function isWeekend(d) { var g = d.getDay(); return g === 0; }   // treat Sunday as off

  /* ════════════════════ MASTERS ════════════════════ */
  // 15 employees. Roles: CRO (customer-facing, in rotation), Technician (service),
  // Cashier, RSO/SM. Names avoid the QMS demo-purge set (Rahul/Priya/Neha/Amit/Suresh).
  var FIRM_T = 'Titan World', FIRM_H = 'Helios';
  var EMP = [
    ['Lakshay Verma', 'M', 'CRO', FIRM_T, 16000, 'S'],
    ['Anjali Deshpande', 'F', 'CRO', FIRM_T, 15000, 'S'],
    ['Rohan Patil', 'M', 'CRO', FIRM_T, 14500, 'S'],
    ['Sneha Kulkarni', 'F', 'CRO', FIRM_T, 14000, 'S'],
    ['Vikas Shinde', 'M', 'CRO', FIRM_H, 15500, 'S'],
    ['Pooja Joshi', 'F', 'CRO', FIRM_H, 13500, 'S'],
    ['Karan Mehta', 'M', 'CRO', FIRM_T, 14000, 'S'],
    ['Divya Rao', 'F', 'CRO', FIRM_H, 13000, 'S'],
    ['Imran Shaikh', 'M', 'Technician', FIRM_T, 18000, 'S'],
    ['Sandeep Gaikwad', 'M', 'Technician', FIRM_H, 17000, 'S'],
    ['Meera Nair', 'F', 'Technician', FIRM_T, 16500, 'S'],
    ['Nisha Bora', 'F', 'Cashier', FIRM_T, 12000, 'B'],
    ['Arjun Pawar', 'M', 'Cashier', FIRM_H, 11500, 'B'],
    ['Kavya Iyer', 'F', 'Store Manager', FIRM_H, 20000, 'S'],
    ['Manish Jain', 'M', 'Store Manager', FIRM_T, 22000, 'S']
  ].map(function (e, i) {
    return { name: e[0], gender: e[1], role: e[2], firm: 'Saagar Traders', store: e[3], monthlySalary: e[4], salaryType: e[5],
      employeeId: 'EMP' + String(i + 1).padStart(3, '0'), department: (e[2] === 'CRO' || e[2] === 'Greeter' ? 'Sales' : (e[2] === 'Technician' || e[2] === 'Assistant Technician' ? 'Service' : 'Admin')),
      bankName: ['HDFC', 'SBI', 'ICICI', 'Axis'][i % 4], accountNo: '5010' + String(100000000 + i * 7654321).slice(0, 10), ifsc: 'HDFC000' + (1000 + i),
      active: true, joiningDate: '2024-0' + ((i % 8) + 1) + '-10', phone: '90' + String(11000000 + i * 137).slice(0, 8) };
  });
  var CRO_EMP = EMP.filter(function (e) { return e.role === 'CRO'; });   // 8 CROs
  var CRO_NAMES = CRO_EMP.map(function (e) { return e.name; });
  var TECHS = EMP.filter(function (e) { return e.role === 'Technician'; }).map(function (e) { return e.name; });
  var SM_NAME = 'Manish Jain';

  set('saagar_employee_master_v1', EMP);

  // Brands (subset is enough for a believable demo)
  var BR_T = ['CLASSIC', 'RAGA', 'EDGE', 'XYLYS', 'FASTTRACK', 'SONATA', 'NEBULA', 'OCTANE'];
  var BR_H = ['SEIKO', 'CITIZEN', 'FOSSIL', 'GUESS', 'POLICE', 'G-SHOCK'];
  set('saagar_master_brands', BR_T.concat(BR_H).map(function (n) { return { name: n }; }));
  set('saagar_brands', { titanworld: BR_T.slice(), helios: BR_H.slice() });
  set('saagar_cros', CRO_NAMES.slice());

  // Vendors
  var VEND = [
    { name: 'Rajesh Wholesale', gstin: '27ABCDE1234F1Z5' },
    { name: 'Speedy Transport', gstin: '' },
    { name: 'Maharashtra Power', gstin: '27PQRSX5678G1Z2' },
    { name: 'CleanPro Services', gstin: '' },
    { name: 'Latur Stationers', gstin: '27LMNOP9012H1Z9' },
    { name: 'AdWorks Media', gstin: '27ADWOR3456J1Z1' }
  ];
  set('saagar_master_vendors', VEND);
  set('gm_vendors', VEND.map(function (v) { return { name: v.name, gstin: v.gstin }; }));

  // Firms / Organisation master
  set('saagar_org_master_v1', {
    firms: [{ code: 'SAT', name: 'Saagar Traders', pan: 'ABCDE1234F', gstin: '27ABCDE1234F1Z5', address: 'Latur, Maharashtra', active: true }],
    branches: [
      { code: 'WLMHW', name: 'Titan World', firmCode: 'SAT', channel: 'Titan World', region: 'WEST-2', rso: 'Lakshay', active: true },
      { code: 'HEMW', name: 'Helios', firmCode: 'SAT', channel: 'Helios', region: 'WEST-2', rso: 'Lakshay', active: true }
    ],
    stores: [{ name: 'Titan World', storeKey: 'titanworld' }, { name: 'Helios', storeKey: 'helios' }]
  });

  /* ════════════════════ QMS  (retail_queue_management_v1) ════════════════════ */
  function uid(p) { return p + '_' + (_s = (_s * 16807) % 2147483647).toString(36); }
  var qCros = CRO_EMP.map(function (e, i) { return { id: 'cro_' + (i + 1), name: e.name, code: 'CRO-' + String(i + 1).padStart(2, '0'), active: true }; });
  var CATS = ['Watch', 'Smart Watch', 'Wall Clock', 'Accessory'];
  var PAYM = ['Cash', 'Card', 'UPI', 'Mixed'];
  var qCustomers = [];
  var dsrByDay = {};                    // dateStr -> croName -> [sales]
  DSTR.forEach(function (ds, di) {
    if (isWeekend(new Date(ds + 'T12:00:00'))) return;   // store closed Sundays (no walk-ins)
    var count = (typeof window !== 'undefined' && window.__SEED_WALK) ? ri(Math.max(1, window.__SEED_WALK - 5), window.__SEED_WALK + 5) : ri(7, 12);   // original ~9/day default; the 1-year TEST BUILD sets window.__SEED_WALK=50
    for (var c = 0; c < count; c++) {
      var cro = qCros[(di + c) % qCros.length];        // rotation
      var roll = rnd();
      // Purchase / Non-Purchase only — QMS 'Service' closes would make the bridge spawn extra
      // Watch-Service jobs, pushing Service past the requested 400/100/300. Service has its own seed.
      var outcome = roll < 0.72 ? 'Purchase' : 'Non Purchase';
      var id = uid('cust');
      var entry = ds + 'T06:' + String(10 + (c % 45)).padStart(2, '0') + ':00.000Z';
      var exit = ds + 'T07:' + String(10 + (c % 45)).padStart(2, '0') + ':00.000Z';
      var cust = { id: id, queueNo: 'Q-' + String(c + 1).padStart(3, '0'), entryTime: entry, name: pick(FIRSTN) + ' ' + pick(LASTN), mobile: '98' + String(20000000 + ri(0, 9999999)).slice(0, 8), visitType: outcome === 'Service' ? 'Service' : 'Purchase', customerType: rnd() < 0.5 ? 'New' : 'Repeat', source: 'Walk-in', peopleCount: 1, priority: 'Normal', status: 'Closed', assignedCroId: cro.id, expectedCroId: cro.id, allocatedTime: entry, exitTime: exit, outcome: outcome, closedAt: exit, closedBy: 'SM', notes: '' };
      if (outcome === 'Purchase') {
        cust.purchaseAmount = ri(2, 60) * 500;          // ₹1,000–30,000
        cust.billNo = 'INV-' + (5000 + qCustomers.length);
        cust.purchaseCategory = pick(CATS); cust.paymentMode = pick(PAYM);
        (dsrByDay[ds] = dsrByDay[ds] || {});
        (dsrByDay[ds][cro.name] = dsrByDay[ds][cro.name] || []).push({ amount: cust.purchaseAmount, billNo: cust.billNo, product: cust.purchaseCategory, customer: cust.name, mobile: cust.mobile, type: 'sale', source: 'qms', sourceRef: id, _confirmed: false });
      } else if (outcome === 'Service') {
        cust.jobCardNo = 'JC-' + (3000 + qCustomers.length); cust.serviceType = pick(['Battery', 'Repair', 'Strap', 'Polishing']); cust.advance = ri(0, 4) * 250;
      } else { cust.lostReason = pick(['Price', 'Just Browsing', 'Out of Stock', 'Comparing']); cust.lostValue = ri(2, 40) * 500; }
      qCustomers.push(cust);
    }
  });
  set('retail_queue_management_v1', {
    settings: { storeName: 'Saagar Traders', queuePrefix: 'Q', waitAlertMins: 10, autoAllocate: true, requireBillForPurchase: true, requireJobForService: true, allowGreeterClose: false, smCanGiveNextOpportunity: true, lockEditsAfterEOD: true },
    role: 'SM', cros: qCros, rotations: [], customers: qCustomers, followups: [], audit: [], lastBackup: null
  });

  /* ════════════════════ DSR  (saagar_dsr_<date>_<Name>) ════════════════════
     Mirror each CRO's QMS purchases for the day as QMS-sourced sales (source:'qms'
     + sourceRef so the bridge de-dups), plus the odd manual sale. Submitted on most
     days. (35-category stock left light — submit gate is UI-only, readers don't enforce.) */
  var dsrStaff = {};
  DSTR.forEach(function (ds, di) {
    if (isWeekend(new Date(ds + 'T12:00:00'))) return;   // no DSR on closed Sundays
    var perCro = dsrByDay[ds] || {};
    CRO_NAMES.forEach(function (name) {
      var sales = (perCro[name] || []).slice();
      if (!sales.length && rnd() < 0.5) return;     // CRO not on floor / no sales that day
      // occasional manual (non-QMS) counter sale
      if (rnd() < 0.25) sales.push({ billNo: 'TW-' + ri(1000, 9999), product: pick(BR_T), amount: ri(2, 30) * 500, customer: pick(FIRSTN) + ' ' + pick(LASTN) });
      var key = 'saagar_dsr_' + ds + '_' + name.replace(/\s+/g, '_');
      dsrStaff[name] = 1;
      set(key, {
        date: ds, staffName: name, role: 'cro', loginTime: '10:0' + (di % 9) + ':00', submitTime: di % 5 ? '19:30:00' : null,
        opening: {}, closing: {}, inout: [], sales: sales, nonpurch: [],
        tasks: { cust: ri(4, 12), follow: ri(0, 5), disp: ri(0, 3), clean_floor: 1, additional: '' },
        marketing: { calls: ri(2, 8), whatsapp: ri(2, 8), door: ri(0, 3), instore: ri(0, 4) },
        cleaning: { cp1: { done: true, photo: null, time: '10:15:00' }, cp2: { done: di % 5 !== 0, photo: null, time: '19:20:00' } },
        submitted: di % 5 !== 0, audit: null
      });
    });
  });
  set('saagar_dsr_staff', Object.keys(dsrStaff));

  /* ════════════════════ SERVICE  (saagar_wsf_v2)  — 600 cases, 80 open / 520 closed ════════════════════ */
  var WSC = []; var BRANDS_ALL = BR_T.concat(BR_H, ['Titan', 'Casio', 'Fossil', 'Rolex (genuine?)']);
  var SVC_OPEN = 80, SVC_CLOSED = 520, SVC_TOTAL = SVC_OPEN + SVC_CLOSED;   // 6-month service book
  var svcRecent = Math.min(21, DSTR.length - 1);      // open cases land in the last ~3 weeks -> realistic 0-21d aging
  for (var s = 0; s < SVC_TOTAL; s++) {
    var open = s >= SVC_CLOSED;                         // the last SVC_OPEN cases are still open
    var di2 = open ? (DSTR.length - 1 - ri(0, svcRecent)) : ri(0, DSTR.length - 1);
    var ds2 = DSTR[di2];
    var closed = !open;
    var amt = ri(2, 30) * 100;
    var wc = { id: 'WS-' + curYear + '-' + String(s + 1).padStart(3, '0'), status: closed ? 'closed' : 'open', prog: closed ? 100 : ri(20, 80),
      createdAt: ds2 + 'T09:30:00.000Z', dateRec: ds2, custName: pick(FIRSTN) + ' ' + pick(LASTN), custMobile: '97' + String(10000000 + ri(0, 9999999)).slice(0, 8),
      brand: pick(BRANDS_ALL), model: pick(['Edge', 'Raga', 'Classic', 'G-Shock', 'Chronograph', 'Automatic']), advisor: pick(CRO_NAMES), techName: pick(TECHS), ackBy: pick(CRO_NAMES),
      subTotal: String(amt), gst: '0', estTotal: String(amt), lineItems: [{ desc: pick(['Battery', 'Full Service', 'Glass', 'Strap', 'Polish']), qty: '1', unit: String(amt), total: String(amt) }] };
    if (closed) { wc.closedAt = ds2 + 'T17:00:00.000Z'; wc.delivery = { finalAmt: String(amt), payMode: pick(['Cash', 'UPI', 'Card']), delTechName: wc.techName, delCustSig: wc.custName }; }
    WSC.push(wc);
  }
  set('saagar_wsf_v2', WSC);

  /* ════════════════════ EXPENSE  (all tabs) ════════════════════ */
  set('gm_settings', { migratedV2: true, gstRate: 3 });
  var FIRMS_EXP = ['Saagar Traders', 'Helios by Saagar'];
  var gmExp = []; var stmts = {}; var prevClosePhys = 0;
  var EXP_CATS = ['Inventory', 'Rent', 'Utilities', 'Marketing', 'Transport', 'Repairs', 'Miscellaneous'];
  function deno(total) { var D = [2000, 500, 200, 100, 50, 20, 10]; var o = {}, r = total; D.forEach(function (x) { var n = Math.floor(r / x); if (n > 0) { o[x] = n; r -= n * x; } }); if (r > 0) o['10'] = (o['10'] || 0) + Math.ceil(r / 10); return o; }
  function denoTotal(o) { var t = 0; for (var k in o) t += (+k) * o[k]; return t; }
  DSTR.forEach(function (ds, di) {
    // income: a daily cash retail sale + a bank/UPI sale
    var cashIn = ri(8, 30) * 1000;
    gmExp.push({ id: uid('e'), type: 'income', date: ds, amount: cashIn, category: 'Retail Sale', mode: 'Cash', vendor: '', firm: 'Saagar Traders', description: 'Counter sales', notes: '', billPhoto: null, source: null, sourceRef: null, void: false, createdAt: ds + 'T20:00:00.000Z', createdBy: 'cashier', editLog: [] });
    gmExp.push({ id: uid('e'), type: 'income', date: ds, amount: ri(5, 20) * 1000, category: 'Retail Sale', mode: pick(['Card', 'UPI']), vendor: '', firm: pick(FIRMS_EXP), description: 'Digital sales', notes: '', billPhoto: null, source: null, sourceRef: null, void: false, createdAt: ds + 'T20:05:00.000Z', createdBy: 'cashier', editLog: [] });
    // expenses: a bank inventory expense (with bill photo) + a small cash utility
    if (di % 3 === 0) gmExp.push({ id: uid('e'), type: 'expense', date: ds, amount: ri(10, 50) * 1000, category: 'Inventory', mode: 'Bank', vendor: pick(VEND).name, firm: 'Saagar Traders', description: 'Stock purchase', notes: '', billPhoto: 'data:image/png;base64,iVBORw0KGgo=', source: null, sourceRef: null, void: false, createdAt: ds + 'T11:00:00.000Z', createdBy: 'owner', editLog: [] });
    var cashOut = ri(3, 12) * 100;
    gmExp.push({ id: uid('e'), type: 'expense', date: ds, amount: cashOut, category: pick(['Utilities', 'Transport', 'Miscellaneous']), mode: 'Cash', vendor: pick(VEND).name, firm: 'Saagar Traders', description: pick(['Tea/snacks', 'Auto fare', 'Cleaning', 'Sundry']), notes: '', billPhoto: null, source: null, sourceRef: null, void: false, createdAt: ds + 'T18:00:00.000Z', createdBy: 'cashier', editLog: [] });
    // petty disbursement (Cash expense, source petty)
    var pettyOut = ri(1, 5) * 100;
    gmExp.push({ id: uid('e'), type: 'expense', date: ds, amount: pettyOut, category: 'Miscellaneous', mode: 'Cash', vendor: '', firm: 'Saagar Traders', description: 'Petty: ' + pick(['stationery', 'courier', 'refreshments']), notes: '', billPhoto: null, source: 'petty', sourceRef: uid('pty'), void: false, createdAt: ds + 'T16:00:00.000Z', createdBy: 'cashier', editLog: [] });
    // cash statement for the day (balanced, closed, approved). Carry-forward chain.
    var opening = di === 0 ? 10000 : prevClosePhys;
    var expectedClose = opening + cashIn - cashOut - pettyOut;
    if (expectedClose < 0) expectedClose = ri(2, 8) * 1000;
    var phys = deno(expectedClose); prevClosePhys = denoTotal(phys);
    stmts[ds] = { date: ds, openingBalance: opening, physDeno: phys, bankDeno: {}, closed: true, closedAt: ds + 'T21:00:00.000Z', closedBy: 'cashier', approved: true, approvedBy: 'owner', approvedAt: ds + 'T21:05:00.000Z', reopenReason: null, mismatchReason: null, monthLocked: false,
      filledBy: 'cashier', total: expectedClose };   // legacy-compat fields for shell readers
  });
  set('gm_expenses', gmExp);
  set('tanishq_statements', stmts);
  set('gm_petty', { float: 5000, history: [{ at: DSTR[0] + 'T09:00:00.000Z', by: 'owner', add: 5000 }] });
  set('gm_budgets', (function () { var b = {}; b[curYM] = { Inventory: 600000, Rent: 60000, Utilities: 25000, Marketing: 30000, Transport: 15000, Miscellaneous: 10000 }; return b; })());
  // tax feed (month) so Month & Tax + Tax payable show numbers
  var incM = 0, expM = 0; gmExp.forEach(function (e) { if (e.date.slice(0, 7) !== curYM) return; if (e.type === 'income') incM += e.amount; else expM += e.amount; });
  var taxFeed = {}; taxFeed[curYM] = { month: curYM, income: incM, expense: expM, net: incM - expM, gstRate: 3, gstEstimate: Math.round(incM * 0.03), byCategory: {}, generatedAt: TODAY + 'T21:10:00.000Z', by: 'owner' };
  set('gm_tax_feed', taxFeed);
  set('gm_audit', [{ id: uid('a'), at: TODAY + 'T21:10:00.000Z', by: 'owner', action: 'month.lock', detail: curYM + ' tax feed generated' }]);

  /* ════════════════════ GROOMING  (saagar_grooming_<date>) ════════════════════ */
  var CRIT_M = ['Short / well-trimmed hair', 'Natural hair colour only', 'Hair gel applied—no oil', 'Sideburns ≤ mid-ear', 'Uniform well-fitted', 'Clean & ironed', 'No loose threads/buttons/fade', 'Sleeves not rolled', 'Name badge visible', 'Hand gloves worn', 'Shoes black & polished', 'Belt black & visible', 'Watch simple', 'Max one ring/hand', 'Nails clean & trimmed'];
  var CRIT_F = ['Neat bun', 'Black band & pins', 'Hair off face', 'Natural colour—no oil', 'Uniform well-fitted', 'Clean & ironed', 'No loose threads/buttons/fade', 'Name badge visible', 'Shoes black & polished', 'Belt black & visible', 'One pair studs/small hoops', 'Watch simple', 'Nails clean & trimmed', 'Lipstick nude only', 'Nail polish nude only'];
  DSTR.forEach(function (ds, di) {
    if (isWeekend(new Date(ds + 'T12:00:00')) || di % 2) return;   // grooming audited ~every other working day
    var arr = EMP.filter(function (e) { return e.role === 'CRO'; }).map(function (e) {
      var g = e.gender === 'F' ? 'f' : 'm'; var crit = g === 'f' ? CRIT_F : CRIT_M;
      var checked = ri(11, 15);
      var items = crit.map(function (lbl, i) { return { label: lbl, passed: i < checked }; });
      return { name: e.name, gender: g, pct: Math.round(checked / 15 * 100), checked: checked, total: 15, date: ds, time: '10:' + String(ri(5, 40)).padStart(2, '0') + ' am', items: items };
    });
    set('saagar_grooming_' + ds, arr);
  });

  /* ════════════════════ CRO DAILY AUDIT  (cro_audits_v3) ════════════════════ */
  set('cro_s_v3', { surveys: 80, npsScore: 85, rate: 40, reviews: 30, mktg: 120 });
  var audits = [];
  DSTR.forEach(function (ds, di) {
    if (isWeekend(new Date(ds + 'T12:00:00'))) return;
    // audit ~half the CROs each day (rotation), so it isn't 8×30
    CRO_EMP.forEach(function (e, ci) {
      if ((ci + di) % 2 !== 0) return;
      var t = { t1: { pts: pick([4, 7, 10]) }, t2: { pts: pick([7, 10]) }, t3: { pts: pick([4, 7, 10]) }, t4: { pts: pick([4, 7, 10]) },
        t5: (function () { var bills = ri(30, 60), coll = Math.round(bills * 0.4), rate = Math.round(coll / bills * 100), nps = ri(80, 92); var rp = Math.min(Math.round(rate / 40 * 5), 5), sp = Math.min(Math.round(nps / 85 * 5), 5); return { billsCount: bills, npsCollected: coll, responseRate: rate, npsScore: nps, pts: rp + sp }; })(),
        t6: { reviewsCount: ri(1, 3), pts: pick([7, 10]) }, t7: { activityCount: ri(3, 6), pts: pick([8, 10]) }, t8: { pts: pick([4, 7, 10]) },
        t9: (function () { var p = ri(70, 95); return { groomingPct: p, pts: Math.round(p / 10) }; })(), t10: { pts: pick([7, 10]) } };
      var total = 0; for (var key in t) total += t[key].pts || 0;
      var grade = total >= 90 ? 'Outstanding' : total >= 75 ? 'Good' : total >= 60 ? 'Satisfactory' : total >= 45 ? 'Below Exp.' : 'Poor';
      audits.unshift({ id: 'a' + (1748000000000 + audits.length), date: ds, store: e.firm === FIRM_H ? 'Helios, Latur' : 'Titan World, Latur', cro: e.name, sm: SM_NAME, total: total, grade: grade, tasks: t, submittedAt: ds + 'T20:00:00.000Z' });
    });
  });
  set('cro_audits_v3', audits);

  /* ════════════════════ PAYROLL  (payroll_suite_v1_2026) ════════════════════
     One month's attendance per employee; salary computed (mirrors calcGM) and the
     computed pf/esic/pt/net persisted on each row so the shell Reports + tax_payable
     read real numbers. Run status 'approved' so slips generate. */
  function daysInMonth(mName, y) { return new Date(y, MONTHNAMES.indexOf(mName) + 1, 0).getDate(); }
  function ptFor(g, gender, mName) { if (gender === 'F') return g <= 25000 ? 0 : (mName === 'February' ? 300 : 200); return g <= 7500 ? 0 : g < 10000 ? 175 : (mName === 'February' ? 300 : 200); }
  var totalDays = daysInMonth(curMonth, curYear);
  var payRows = EMP.map(function (e, i) {
    var absent = ri(0, 3), halfDay = ri(0, 2), late = ri(0, 6), noThumb = ri(0, 1), leavesApplied = ri(0, 2);
    var lateDed = Math.floor(late / 3) * 0.5; var totalDed = absent + halfDay * 0.5 + noThumb * 0.5 + lateDed;
    var extraDays = totalDed <= 5.5 ? 4 : totalDed < 7 ? 2 : 0;
    var finalPresent = Math.max(0, totalDays - totalDed); var raw = finalPresent + leavesApplied + extraDays;
    var salaryDays = Math.min(totalDays, raw); var otDays = Math.max(0, raw - totalDays);
    var gross = e.monthlySalary; var grossPayable = gross * salaryDays / totalDays;
    var basic, hra, washing;
    if (e.salaryType === 'S') { basic = 0.5 * grossPayable; hra = 0.8 * basic; washing = 0.1 * basic; } else { basic = grossPayable; hra = 0; washing = 0; }
    var pfApplicable = e.salaryType === 'S'; var esicApplicable = true;
    var pt = ptFor(grossPayable, e.gender, curMonth);
    var pfEE = pfApplicable ? 0.12 * Math.min(basic, 15000) : 0;
    var esicEE = (esicApplicable && grossPayable <= 21000) ? 0.0075 * (grossPayable - washing) : 0;
    var netPayable = grossPayable - pt - pfEE - esicEE;
    var otAmount = gross / totalDays * otDays; var advance = 0;
    var finalPay = netPayable + otAmount - advance;
    return { id: i + 2, firm: 'GM', empId: 'GM' + String(i + 1).padStart(3, '0'), name: e.name, phone: e.phone, designation: e.role, joiningDate: e.joiningDate,
      uan: '', esicIp: '', bankName: pick(['HDFC', 'SBI', 'ICICI', 'Axis']), accountNo: '5010' + String(100000000 + i * 7654321).slice(0, 10), ifsc: 'HDFC000' + (1000 + i), idProof: '', active: true,
      absent: absent, halfDay: halfDay, late: late, noThumb: noThumb, leavesApplied: leavesApplied, remarks: '', signature: 'Signed',
      gross: gross, salaryType: e.salaryType, gender: e.gender, pfApplicable: pfApplicable, esicApplicable: esicApplicable, salaryAmount: 0, advance: 0, salaryRemark: '',
      // computed outputs persisted for read-side consumers (shell Reports net, bridge tax_payable):
      pf: r2(pfEE), esic: r2(esicEE), pt: pt, net: r2(finalPay), grossPayable: r2(grossPayable) };
  });
  set('payroll_suite_v1_2026', {
    meta: { title: 'SAAGAR TRADERS — PAYROLL', month: curMonth, year: curYear, holidays: 0, totalDaysOverride: '', preparedBy: 'Nisha Bora', checkedBy: 'Kavya Iyer', approvedBy: 'Manish Jain',
      firmName: 'SAAGAR TRADERS', firmAddr: 'Main Road, Latur - 413512.', firmContact: 'Tel : 02382-000000', signatory: 'Manish Jain',
      rules: { pt: { maleExempt: 7500, maleMid: 10000, maleMidAmt: 175, stdAmt: 200, febAmt: 300, femaleExempt: 25000 }, pf: { rateEE: 12, rateER: 13, wageCap: 15000 }, esic: { rateEE: 0.75, rateER: 3.25, wageCeiling: 21000 } },
      run: { status: 'approved', approvedBy: 'Manish Jain', approvedAt: TODAY + 'T21:00:00.000Z', formulaVersion: '4.0' } },
    rows: payRows, advances: [], runs: {}, nextId: payRows.length + 2
  });

  /* ════════════════════ LEAVE  (leavedesk_v3) ════════════════════ */
  var slug = function (n) { return 'emp_' + n.toLowerCase().replace(/[^a-z0-9]/g, ''); };
  var leaveEmps = EMP.map(function (e) { return { id: slug(e.name), name: e.name, empId: e.employeeId, department: e.department }; });
  var leaves = {};
  // ~ a handful of approved leaves spread across the month (skip Sundays), incl. today
  var leaveCats = ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Compensatory Off'];
  DSTR.forEach(function (ds, di) {
    if (isWeekend(new Date(ds + 'T12:00:00'))) return;
    if (di % 4 !== 0 && ds !== TODAY) return;        // not every day
    var who = EMP[(di * 3) % EMP.length];
    var rec = { id: uid('lv'), name: who.name, staffName: who.name, type: rnd() < 0.7 ? 'full_day' : (rnd() < 0.5 ? 'half_day_am' : 'half_day_pm'), category: pick(leaveCats), reason: pick(['family function', 'medical', 'personal', '']), approvedBy: SM_NAME, leaveFrom: ds, leaveTo: ds };
    (leaves[ds] = leaves[ds] || []).push(rec);
  });
  set('leavedesk_v3', { employees: leaveEmps, leaves: leaves, agendas: {} });

  /* ════════════════════ TAX / GST  (taxcal_v2) — dueDate-bearing so Reports light up ════════════════════ */
  function plusDays(n) { var d = new Date(today); d.setDate(d.getDate() + n); return ymd(d); }
  set('taxcal_v2', {
    firms: [{ id: 'firm_1', name: 'Saagar Traders', pan: 'ABCDE1234F', gstin: '27ABCDE1234F1Z5', entity: 'proprietorship', type: 'both', notes: '' }],
    activeFirmId: 'firm_1', fyStartYear: Math.max(2026, curYear),
    compliance: { firm_1: (function () { var o = {}; o[Math.max(2026, curYear)] = {
      gstr3b_prev: { done: true, dueDate: plusDays(-20), filedOn: plusDays(-19), notes: 'Filed' },
      gstr1_ovd: { done: false, dueDate: plusDays(-3) },          // overdue
      gstr3b_wk: { done: false, dueDate: plusDays(2) },           // due this week
      tds_wk: { done: false, dueDate: plusDays(5) },              // due this week
      ptrc_mo: { done: false, dueDate: plusDays(12) },            // due this month (if room)
      advtax_mo: { done: false, dueDate: plusDays(18) }
    }; return o; })() }
  });

  /* ════════════════════ STOCK  (saagar_stock_<store>_<date>) ════════════════════
     Complete opening/movements/closing per brand, locked + submitted, physical == system
     (matched day). Internal store keys are lowercase titanworld / helios. */
  var STORES = [['titanworld', BR_T.slice(0, 6)], ['helios', BR_H.slice(0, 5)]];
  DSTR.forEach(function (ds) {
    if (isWeekend(new Date(ds + 'T12:00:00'))) return;   // no stock count on closed Sundays
    STORES.forEach(function (st) {
      var brands = st[1], opening = {}, movements = {}, closing = {};
      brands.forEach(function (b) {
        var croName = pick(CRO_NAMES), sysStock = ri(40, 120);
        opening[b] = { display: ri(20, 60), storage: ri(10, 40), defective: ri(0, 2), yLoc: ri(0, 2), systemStock: sysStock, remarks: '', croName: croName, time: '09:' + String(ri(5, 30)).padStart(2, '0'), verified: true, countDone: true };
        var inward = ri(0, 12), grn = ri(0, 8), outward = ri(0, 4), sales = ri(0, 6);
        movements[b] = { inward: inward, outward: outward, sales: sales, grn: grn };
        var closingSys = sysStock + inward + grn - outward - sales;
        var cDef = ri(0, 1), cY = ri(0, 1), rem = Math.max(0, closingSys - cDef - cY), cDisp = Math.round(rem * 0.6);
        closing[b] = { display: cDisp, storage: rem - cDisp, defective: cDef, yLoc: cY, remarks: '', croName: croName, time: '18:' + String(ri(5, 30)).padStart(2, '0'), verified: true, countDone: true };
      });
      set('saagar_stock_' + st[0] + '_' + ds, { _v: 2, openingLocked: true, closingLocked: true, movementsSubmitted: true, opening: opening, movements: movements, closing: closing });
    });
  });

  /* ════════════════════ misc shell state ════════════════════ */
  set('gm_role', 'owner');
  set('saagar_owner_name', 'Sagar');
  // mark seeded LAST so a crash mid-seed re-runs cleanly next launch
  set('saagar_demo_seeded', 'v2_6mo');
  try { console.log('[demo-seed] seeded ' + DSTR.length + ' days · ' + qCustomers.length + ' QMS · ' + WSC.length + ' service · ' + payRows.length + ' payroll · ' + audits.length + ' CRO audits'); } catch (e) {}
  };  /* ── end __runSeed ── */
  /* Option C (perf): run the WHOLE seed as ONE bulk write. The ~thousands of setItems would otherwise
     journal to the WAL + re-export the DB per write — that was ~60 s+ of frozen main thread on a phone
     (it force-closed). bulk() suspends per-write WAL/flush, runs the seed, then does ONE durable persist.
     Falls back to a plain run (+ flush when the engine is ON) when bulk() is unavailable / engine OFF. */
  try {
    if (window.SaagarStore && typeof window.SaagarStore.bulk === 'function') { window.SaagarStore.bulk(__runSeed); }
    else { __runSeed(); try { if (window.SaagarStore && typeof window.SaagarStore.flush === 'function') window.SaagarStore.flush(); } catch (e) {} }
  } catch (e) { try { __runSeed(); } catch (_) {} }
})();
