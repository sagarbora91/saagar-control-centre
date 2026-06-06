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

  // 1-year scale (DAYS >= 300) uses the chunked + Queue-split path below so it can't freeze / OOM the phone.
  // Smaller seeds (6-month harness, light builds) keep the proven one-shot path untouched.
  var BIG = ((typeof window !== 'undefined' && window.__SEED_DAYS) || 180) >= 300;

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
  };  /* ── end __runSeed (6-month / light path — unchanged, proven by _6mo_qa) ── */

  /* ════════════════════════════════════════════════════════════════════════════
     __runSeedBig — 1-YEAR path (DAYS >= 300).  The light seed above builds the whole dataset in ONE
     synchronous burst; at 365 days @ 50 walk-ins that is ~15k Queue customers (~8 MB blob) generated in
     a single block — which froze the phone (ANR force-close) last time.  This path instead:
       • GENERATES progressively, yielding to the UI between chunks (progress overlay) so the main thread
         never blocks long enough to trip Android's ~5 s "app not responding" watchdog;
       • SPLITS the Queue into a small LIVE blob (last 90 days) + a durable archive FILE for the rest —
         the realistic post-archival shape, so the full ~8 MB never sits in RAM at once;
       • writes each module in its OWN bulk (one DB export apiece) then releases the generated objects,
         keeping the memory peak well under the 1-year OOM ceiling;
       • adds coverage the light seed lacks (Queue rotations, follow-ups, OPEN walk-ins for today).
     ════════════════════════════════════════════════════════════════════════════ */
  async function __runSeedBig() {
    var LS = localStorage;
    function set(k, v) { try { LS.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} }
    function yieldUI() { return new Promise(function (r) { setTimeout(r, 0); }); }
    function writeBulk(fn) { try { if (window.SaagarStore && typeof window.SaagarStore.bulk === 'function') return Promise.resolve(window.SaagarStore.bulk(fn)); } catch (e) {} try { fn(); } catch (e) {} return Promise.resolve(); }

    /* ── progress overlay (covers the on-device first-boot seed; removed at the end) ── */
    var ov = null, bar = null, lbl = null;
    try {
      ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:linear-gradient(135deg,#0d2340,#18385f);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:DM Sans,Arial,sans-serif';
      ov.innerHTML = '<div style="font-size:40px;font-weight:800;letter-spacing:2px;margin-bottom:8px">ST</div><div style="opacity:.85;margin-bottom:18px">Preparing one year of demo data…</div><div style="width:240px;height:8px;background:rgba(255,255,255,.18);border-radius:5px;overflow:hidden"><div id="__seedBar" style="height:100%;width:0%;background:#d4a843;transition:width .2s"></div></div><div id="__seedLbl" style="opacity:.7;font-size:12px;margin-top:10px">starting…</div>';
      document.body.appendChild(ov); bar = ov.querySelector('#__seedBar'); lbl = ov.querySelector('#__seedLbl');
    } catch (e) {}
    function prog(pct, msg) { try { if (bar) bar.style.width = Math.round(pct) + '%'; if (lbl && msg) lbl.textContent = msg; } catch (e) {} }

    /* ── deterministic RNG + helpers (mirror __runSeed) ── */
    var _s = 1234567;
    function rnd() { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; }
    function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
    function pick(a) { return a[Math.floor(rnd() * a.length)]; }
    function r2(n) { return Math.round(n * 100) / 100; }
    function uid(p) { return p + '_' + (_s = (_s * 16807) % 2147483647).toString(36); }
    var FIRSTN = ['Amol', 'Sunita', 'Rohit', 'Sneha', 'Prakash', 'Vaishali', 'Ganesh', 'Pooja', 'Nilesh', 'Swati', 'Sachin', 'Rupali', 'Mahesh', 'Anita', 'Kiran', 'Deepak', 'Manisha', 'Suraj', 'Jyoti', 'Ramesh', 'Vandana', 'Sagar', 'Komal', 'Vishal'];
    var LASTN = ['Patil', 'Deshmukh', 'Kulkarni', 'Jadhav', 'Pawar', 'Shinde', 'Bora', 'Joshi', 'Kale', 'Gaikwad', 'More', 'Salunke', 'Mane', 'Chavan', 'Sawant', 'Nikam'];
    var DAYS = (window.__SEED_DAYS) || 365, WALK = (window.__SEED_WALK) || 50, KEEP_DAYS = 90;
    var today = new Date(); today.setHours(12, 0, 0, 0);
    function dayN(k) { var d = new Date(today); d.setDate(d.getDate() - k); d.setHours(12, 0, 0, 0); return d; }
    function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    var DATES = []; for (var k = DAYS; k >= 0; k--) DATES.push(dayN(k));
    var DSTR = DATES.map(ymd), TODAY = ymd(today);
    var keepCutoff = ymd(dayN(KEEP_DAYS));                 // YYYY-MM-DD; entryTime date >= this stays LIVE
    var MONTHNAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var curMonth = MONTHNAMES[today.getMonth()], curYear = today.getFullYear(), curYM = curYear + '-' + String(today.getMonth() + 1).padStart(2, '0');
    function isWeekend(d) { return d.getDay() === 0; }

    /* ════════ MASTERS (identical shapes to __runSeed) ════════ */
    var FIRM_T = 'Titan World', FIRM_H = 'Helios';
    var EMP = [
      ['Lakshay Verma', 'M', 'CRO', FIRM_T, 16000, 'S'], ['Anjali Deshpande', 'F', 'CRO', FIRM_T, 15000, 'S'], ['Rohan Patil', 'M', 'CRO', FIRM_T, 14500, 'S'],
      ['Sneha Kulkarni', 'F', 'CRO', FIRM_T, 14000, 'S'], ['Vikas Shinde', 'M', 'CRO', FIRM_H, 15500, 'S'], ['Pooja Joshi', 'F', 'CRO', FIRM_H, 13500, 'S'],
      ['Karan Mehta', 'M', 'CRO', FIRM_T, 14000, 'S'], ['Divya Rao', 'F', 'CRO', FIRM_H, 13000, 'S'], ['Imran Shaikh', 'M', 'Technician', FIRM_T, 18000, 'S'],
      ['Sandeep Gaikwad', 'M', 'Technician', FIRM_H, 17000, 'S'], ['Meera Nair', 'F', 'Technician', FIRM_T, 16500, 'S'], ['Nisha Bora', 'F', 'Cashier', FIRM_T, 12000, 'B'],
      ['Arjun Pawar', 'M', 'Cashier', FIRM_H, 11500, 'B'], ['Kavya Iyer', 'F', 'Store Manager', FIRM_H, 20000, 'S'], ['Manish Jain', 'M', 'Store Manager', FIRM_T, 22000, 'S']
    ].map(function (e, i) {
      return { name: e[0], gender: e[1], role: e[2], firm: 'Saagar Traders', store: e[3], monthlySalary: e[4], salaryType: e[5],
        employeeId: 'EMP' + String(i + 1).padStart(3, '0'), department: (e[2] === 'CRO' || e[2] === 'Greeter' ? 'Sales' : (e[2] === 'Technician' || e[2] === 'Assistant Technician' ? 'Service' : 'Admin')),
        bankName: ['HDFC', 'SBI', 'ICICI', 'Axis'][i % 4], accountNo: '5010' + String(100000000 + i * 7654321).slice(0, 10), ifsc: 'HDFC000' + (1000 + i),
        active: true, joiningDate: '2024-0' + ((i % 8) + 1) + '-10', phone: '90' + String(11000000 + i * 137).slice(0, 8) };
    });
    var CRO_EMP = EMP.filter(function (e) { return e.role === 'CRO'; });
    var CRO_NAMES = CRO_EMP.map(function (e) { return e.name; });
    var TECHS = EMP.filter(function (e) { return e.role === 'Technician'; }).map(function (e) { return e.name; });
    var SM_NAME = 'Manish Jain';
    var BR_T = ['CLASSIC', 'RAGA', 'EDGE', 'XYLYS', 'FASTTRACK', 'SONATA', 'NEBULA', 'OCTANE'];
    var BR_H = ['SEIKO', 'CITIZEN', 'FOSSIL', 'GUESS', 'POLICE', 'G-SHOCK'];
    var VEND = [{ name: 'Rajesh Wholesale', gstin: '27ABCDE1234F1Z5' }, { name: 'Speedy Transport', gstin: '' }, { name: 'Maharashtra Power', gstin: '27PQRSX5678G1Z2' }, { name: 'CleanPro Services', gstin: '' }, { name: 'Latur Stationers', gstin: '27LMNOP9012H1Z9' }, { name: 'AdWorks Media', gstin: '27ADWOR3456J1Z1' }];
    var qCros = CRO_EMP.map(function (e, i) { return { id: 'cro_' + (i + 1), name: e.name, code: 'CRO-' + String(i + 1).padStart(2, '0'), active: true }; });
    await writeBulk(function () {
      set('saagar_employee_master_v1', EMP);
      set('saagar_master_brands', BR_T.concat(BR_H).map(function (n) { return { name: n }; }));
      set('saagar_brands', { titanworld: BR_T.slice(), helios: BR_H.slice() });
      set('saagar_cros', CRO_NAMES.slice());
      set('saagar_master_vendors', VEND);
      set('gm_vendors', VEND.map(function (v) { return { name: v.name, gstin: v.gstin }; }));
      set('saagar_org_master_v1', { firms: [{ code: 'SAT', name: 'Saagar Traders', pan: 'ABCDE1234F', gstin: '27ABCDE1234F1Z5', address: 'Latur, Maharashtra', active: true }], branches: [{ code: 'WLMHW', name: 'Titan World', firmCode: 'SAT', channel: 'Titan World', region: 'WEST-2', rso: 'Lakshay', active: true }, { code: 'HEMW', name: 'Helios', firmCode: 'SAT', channel: 'Helios', region: 'WEST-2', rso: 'Lakshay', active: true }], stores: [{ name: 'Titan World', storeKey: 'titanworld' }, { name: 'Helios', storeKey: 'helios' }] });
    });
    prog(6, 'masters ready');

    /* ════════ QUEUE — chunked generation + LIVE/ARCHIVE split ════════ */
    var CATS = ['Watch', 'Smart Watch', 'Wall Clock', 'Accessory'], PAYM = ['Cash', 'Card', 'UPI', 'Mixed'];
    var OPEN_STATUS = ['New Entry', 'Allocated', 'In Discussion', 'Awaiting Closure'];
    var qLive = [], qArchive = [], followups = [], dsrByDay = {};
    var billSeq = 5000, jobSeq = 3000, total = 0, qIndex = 0;
    for (var di = 0; di < DSTR.length; di++) {
      var ds = DSTR[di];
      if (isWeekend(new Date(ds + 'T12:00:00'))) continue;
      var isToday = (ds === TODAY), live = (ds >= keepCutoff);
      var count = WALK ? ri(Math.max(1, WALK - 5), WALK + 5) : ri(7, 12);
      for (var c = 0; c < count; c++) {
        var cro = qCros[(di + c) % qCros.length];
        // today: ~30% still open (drives Live Queue + dashboard active cards); all other days closed
        var isOpen = isToday && (c % 10 < 3);
        var roll = rnd(), outcome = isOpen ? null : (roll < 0.72 ? 'Purchase' : 'Non Purchase');
        var id = uid('cust');
        var entry = ds + 'T06:' + String(10 + (c % 45)).padStart(2, '0') + ':00.000Z';
        var exit = ds + 'T07:' + String(10 + (c % 45)).padStart(2, '0') + ':00.000Z';
        var cust = { id: id, queueNo: 'Q-' + String(c + 1).padStart(3, '0'), entryTime: entry, name: pick(FIRSTN) + ' ' + pick(LASTN), mobile: '98' + String(20000000 + ri(0, 9999999)).slice(0, 8), visitType: 'Purchase', customerType: rnd() < 0.5 ? 'New' : 'Repeat', source: 'Walk-in', peopleCount: 1, priority: 'Normal', assignedCroId: cro.id, expectedCroId: cro.id, allocatedTime: entry, notes: '' };
        if (isOpen) {
          cust.status = pick(OPEN_STATUS); cust.outcome = null; cust.exitTime = (cust.status === 'Awaiting Closure') ? exit : null;
          if (cust.status === 'In Discussion') cust.attendStart = entry;
        } else {
          cust.status = 'Closed'; cust.exitTime = exit; cust.outcome = outcome; cust.closedAt = exit; cust.closedBy = 'SM';
          if (outcome === 'Purchase') {
            cust.purchaseAmount = ri(2, 60) * 500; cust.billNo = 'INV-' + (billSeq++); cust.purchaseCategory = pick(CATS); cust.paymentMode = pick(PAYM);
            (dsrByDay[ds] = dsrByDay[ds] || {}); (dsrByDay[ds][cro.name] = dsrByDay[ds][cro.name] || []).push({ amount: cust.purchaseAmount, billNo: cust.billNo, product: cust.purchaseCategory, customer: cust.name, mobile: cust.mobile, type: 'sale', source: 'qms', sourceRef: id, _confirmed: false });
          } else { cust.lostReason = pick(['Price', 'Just Browsing', 'Out of Stock', 'Comparing']); cust.lostValue = ri(2, 40) * 500; }
        }
        if (live) {
          qLive.push(cust);
          // follow-ups: ~12% of recent closed leads get a follow-up task (covers the Follow-ups screen)
          if (cust.status === 'Closed' && rnd() < 0.12) {
            var fuStat = pick(['Pending', 'Pending', 'Done', 'Converted', 'Lost']);
            var due = ymd(dayN(Math.max(0, KEEP_DAYS - di - ri(-3, 3))));
            followups.push({ id: uid('fu'), customerId: id, queueNo: cust.queueNo, customerName: cust.name, mobile: cust.mobile, croId: cro.id, dueDate: due, mode: pick(['Phone Call', 'WhatsApp', 'In Store', 'SMS']), notes: pick(['Check delivery', 'Festival offer', 'Strap follow-up', '']), status: fuStat, createdAt: cust.closedAt, closedAt: fuStat === 'Pending' ? null : exit, closedBy: fuStat === 'Pending' ? null : 'CRO' });
          }
        } else { qArchive.push(cust); }
        qIndex++;
      }
      if (di % 25 === 0) { prog(6 + (di / DSTR.length) * 34, 'queue ' + Math.round(di / DSTR.length * 100) + '%'); await yieldUI(); }
    }
    // rotations for the last 8 working days (today = Active) — covers the Rotation screen
    var rotations = [], built = 0;
    for (var rd = 0; rd < DSTR.length && built < 8; rd++) {
      var rds = DSTR[DSTR.length - 1 - rd]; if (isWeekend(new Date(rds + 'T12:00:00'))) continue;
      var items = qCros.map(function (q, oi) { return { croId: q.id, order: oi + 1, status: 'Available', active: true, addedAt: rds + 'T09:00:00.000Z' }; });
      rotations.push({ id: uid('rot'), date: rds, createdAt: rds + 'T09:00:00.000Z', createdBy: 'SM', status: rds === TODAY ? 'Active' : 'Closed', currentCroId: qCros[built % qCros.length].id, priorityCroId: null, closedAt: rds === TODAY ? null : rds + 'T21:00:00.000Z', items: items, turnEvents: [] });
      built++;
    }
    await writeBulk(function () {
      set('retail_queue_management_v1', { settings: { storeName: 'Saagar Traders', queuePrefix: 'Q', waitAlertMins: 10, autoAllocate: true, requireBillForPurchase: true, requireJobForService: true, allowGreeterClose: false, smCanGiveNextOpportunity: true, lockEditsAfterEOD: true }, role: 'SM', cros: qCros, rotations: rotations, customers: qLive, followups: followups, audit: [], lastBackup: null });
    });
    // archive the older closed customers to the durable file (the realistic post-archival state).
    var archived = qArchive.length, wroteArchive = false;
    try {
      var C = window.Capacitor, FS = C && C.Plugins && C.Plugins.Filesystem;
      if (FS && qArchive.length) {
        await FS.writeFile({ path: 'saagar_qms_archive.json.tmp', data: JSON.stringify(qArchive), directory: 'DATA', encoding: 'utf8', recursive: true });
        await FS.rename({ from: 'saagar_qms_archive.json.tmp', to: 'saagar_qms_archive.json', directory: 'DATA' });
        wroteArchive = true;
      }
    } catch (e) {}
    if (!wroteArchive && qArchive.length) {                 // no Filesystem (e.g. plain browser) → fold back into live so nothing is lost
      await writeBulk(function () { var blob = JSON.parse(LS.getItem('retail_queue_management_v1')); blob.customers = qArchive.concat(blob.customers); set('retail_queue_management_v1', blob); });
    }
    qArchive = null; followups = null;                       // release
    prog(42, 'queue: ' + qLive.length + ' live · ' + archived + ' archived');
    await yieldUI();

    /* ════════ DSR (saagar_dsr_<date>_<Name>) — full year of day-keys ════════ */
    var dsrStaff = {};
    for (var ph = 0; ph < DSTR.length; ph += 30) {
      await writeBulk(function () {
        for (var j = ph; j < Math.min(ph + 30, DSTR.length); j++) {
          var ds = DSTR[j]; if (isWeekend(new Date(ds + 'T12:00:00'))) continue;
          var perCro = dsrByDay[ds] || {};
          CRO_NAMES.forEach(function (name) {
            var sales = (perCro[name] || []).slice();
            if (!sales.length && rnd() < 0.5) return;
            if (rnd() < 0.25) sales.push({ billNo: 'TW-' + ri(1000, 9999), product: pick(BR_T), amount: ri(2, 30) * 500, customer: pick(FIRSTN) + ' ' + pick(LASTN) });
            dsrStaff[name] = 1;
            set('saagar_dsr_' + ds + '_' + name.replace(/\s+/g, '_'), { date: ds, staffName: name, role: 'cro', loginTime: '10:0' + (j % 9) + ':00', submitTime: j % 5 ? '19:30:00' : null, opening: {}, closing: {}, inout: [], sales: sales, nonpurch: [], tasks: { cust: ri(4, 12), follow: ri(0, 5), disp: ri(0, 3), clean_floor: 1, additional: '' }, marketing: { calls: ri(2, 8), whatsapp: ri(2, 8), door: ri(0, 3), instore: ri(0, 4) }, cleaning: { cp1: { done: true, photo: null, time: '10:15:00' }, cp2: { done: j % 5 !== 0, photo: null, time: '19:20:00' } }, submitted: j % 5 !== 0, audit: null });
          });
        }
      });
      prog(42 + (ph / DSTR.length) * 18, 'staff register ' + Math.round(ph / DSTR.length * 100) + '%'); await yieldUI();
    }
    await writeBulk(function () { set('saagar_dsr_staff', Object.keys(dsrStaff)); });
    dsrByDay = null; prog(60, 'staff register done'); await yieldUI();

    /* ════════ SERVICE (saagar_wsf_v2) — scale with the year: ~1200 cases ════════ */
    var WSC = [], BRANDS_ALL = BR_T.concat(BR_H, ['Titan', 'Casio', 'Fossil', 'Rolex (genuine?)']);
    var SVC_OPEN = 90, SVC_CLOSED = Math.round(DSTR.length * 3.2), SVC_TOTAL = SVC_OPEN + SVC_CLOSED;
    var svcRecent = Math.min(21, DSTR.length - 1);
    for (var sidx = 0; sidx < SVC_TOTAL; sidx++) {
      var open = sidx >= SVC_CLOSED;
      var di2 = open ? (DSTR.length - 1 - ri(0, svcRecent)) : ri(0, DSTR.length - 1);
      var ds2 = DSTR[di2], closed = !open, amt = ri(2, 30) * 100;
      var wc = { id: 'WS-' + curYear + '-' + String(sidx + 1).padStart(4, '0'), status: closed ? 'closed' : 'open', prog: closed ? 100 : ri(20, 80), createdAt: ds2 + 'T09:30:00.000Z', dateRec: ds2, custName: pick(FIRSTN) + ' ' + pick(LASTN), custMobile: '97' + String(10000000 + ri(0, 9999999)).slice(0, 8), brand: pick(BRANDS_ALL), model: pick(['Edge', 'Raga', 'Classic', 'G-Shock', 'Chronograph', 'Automatic']), advisor: pick(CRO_NAMES), techName: pick(TECHS), ackBy: pick(CRO_NAMES), subTotal: String(amt), gst: '0', estTotal: String(amt), lineItems: [{ desc: pick(['Battery', 'Full Service', 'Glass', 'Strap', 'Polish']), qty: '1', unit: String(amt), total: String(amt) }] };
      if (closed) { wc.closedAt = ds2 + 'T17:00:00.000Z'; wc.delivery = { finalAmt: String(amt), payMode: pick(['Cash', 'UPI', 'Card']), delTechName: wc.techName, delCustSig: wc.custName }; }
      WSC.push(wc);
      if (sidx % 400 === 399) await yieldUI();
    }
    await writeBulk(function () { set('saagar_wsf_v2', WSC); });
    WSC = null; prog(66, 'service book done'); await yieldUI();

    /* ════════ EXPENSE (all tabs) — full-year ledger + daily cash statements ════════ */
    var gmExp = [], stmts = {}, prevClosePhys = 0, FIRMS_EXP = ['Saagar Traders', 'Helios by Saagar'];
    function deno(t) { var D = [2000, 500, 200, 100, 50, 20, 10], o = {}, r = t; D.forEach(function (x) { var n = Math.floor(r / x); if (n > 0) { o[x] = n; r -= n * x; } }); if (r > 0) o['10'] = (o['10'] || 0) + Math.ceil(r / 10); return o; }
    function denoTotal(o) { var t = 0; for (var kk in o) t += (+kk) * o[kk]; return t; }
    for (var ei = 0; ei < DSTR.length; ei++) {
      var ds = DSTR[ei];
      var cashIn = ri(8, 30) * 1000;
      gmExp.push({ id: uid('e'), type: 'income', date: ds, amount: cashIn, category: 'Retail Sale', mode: 'Cash', vendor: '', firm: 'Saagar Traders', description: 'Counter sales', notes: '', billPhoto: null, source: null, sourceRef: null, void: false, createdAt: ds + 'T20:00:00.000Z', createdBy: 'cashier', editLog: [] });
      gmExp.push({ id: uid('e'), type: 'income', date: ds, amount: ri(5, 20) * 1000, category: 'Retail Sale', mode: pick(['Card', 'UPI']), vendor: '', firm: pick(FIRMS_EXP), description: 'Digital sales', notes: '', billPhoto: null, source: null, sourceRef: null, void: false, createdAt: ds + 'T20:05:00.000Z', createdBy: 'cashier', editLog: [] });
      if (ei % 3 === 0) gmExp.push({ id: uid('e'), type: 'expense', date: ds, amount: ri(10, 50) * 1000, category: 'Inventory', mode: 'Bank', vendor: pick(VEND).name, firm: 'Saagar Traders', description: 'Stock purchase', notes: '', billPhoto: 'data:image/png;base64,iVBORw0KGgo=', source: null, sourceRef: null, void: false, createdAt: ds + 'T11:00:00.000Z', createdBy: 'owner', editLog: [] });
      var cashOut = ri(3, 12) * 100;
      gmExp.push({ id: uid('e'), type: 'expense', date: ds, amount: cashOut, category: pick(['Utilities', 'Transport', 'Miscellaneous']), mode: 'Cash', vendor: pick(VEND).name, firm: 'Saagar Traders', description: pick(['Tea/snacks', 'Auto fare', 'Cleaning', 'Sundry']), notes: '', billPhoto: null, source: null, sourceRef: null, void: false, createdAt: ds + 'T18:00:00.000Z', createdBy: 'cashier', editLog: [] });
      var pettyOut = ri(1, 5) * 100;
      gmExp.push({ id: uid('e'), type: 'expense', date: ds, amount: pettyOut, category: 'Miscellaneous', mode: 'Cash', vendor: '', firm: 'Saagar Traders', description: 'Petty: ' + pick(['stationery', 'courier', 'refreshments']), notes: '', billPhoto: null, source: 'petty', sourceRef: uid('pty'), void: false, createdAt: ds + 'T16:00:00.000Z', createdBy: 'cashier', editLog: [] });
      var opening = ei === 0 ? 10000 : prevClosePhys, expectedClose = opening + cashIn - cashOut - pettyOut;
      if (expectedClose < 0) expectedClose = ri(2, 8) * 1000;
      var phys = deno(expectedClose); prevClosePhys = denoTotal(phys);
      stmts[ds] = { date: ds, openingBalance: opening, physDeno: phys, bankDeno: {}, closed: true, closedAt: ds + 'T21:00:00.000Z', closedBy: 'cashier', approved: true, approvedBy: 'owner', approvedAt: ds + 'T21:05:00.000Z', reopenReason: null, mismatchReason: null, monthLocked: false, filledBy: 'cashier', total: expectedClose };
      if (ei % 60 === 59) await yieldUI();
    }
    var incM = 0, expM = 0; gmExp.forEach(function (e) { if (e.date.slice(0, 7) !== curYM) return; if (e.type === 'income') incM += e.amount; else expM += e.amount; });
    var taxFeed = {}; taxFeed[curYM] = { month: curYM, income: incM, expense: expM, net: incM - expM, gstRate: 3, gstEstimate: Math.round(incM * 0.03), byCategory: {}, generatedAt: TODAY + 'T21:10:00.000Z', by: 'owner' };
    await writeBulk(function () {
      set('gm_settings', { migratedV2: true, gstRate: 3 }); set('gm_expenses', gmExp); set('tanishq_statements', stmts);
      set('gm_petty', { float: 5000, history: [{ at: DSTR[0] + 'T09:00:00.000Z', by: 'owner', add: 5000 }] });
      var b = {}; b[curYM] = { Inventory: 600000, Rent: 60000, Utilities: 25000, Marketing: 30000, Transport: 15000, Miscellaneous: 10000 }; set('gm_budgets', b);
      set('gm_tax_feed', taxFeed); set('gm_audit', [{ id: uid('a'), at: TODAY + 'T21:10:00.000Z', by: 'owner', action: 'month.lock', detail: curYM + ' tax feed generated' }]);
    });
    gmExp = null; stmts = null; prog(76, 'expense ledger done'); await yieldUI();

    /* ════════ GROOMING (saagar_grooming_<date>) ════════ */
    var CRIT_M = ['Short / well-trimmed hair', 'Natural hair colour only', 'Hair gel applied—no oil', 'Sideburns ≤ mid-ear', 'Uniform well-fitted', 'Clean & ironed', 'No loose threads/buttons/fade', 'Sleeves not rolled', 'Name badge visible', 'Hand gloves worn', 'Shoes black & polished', 'Belt black & visible', 'Watch simple', 'Max one ring/hand', 'Nails clean & trimmed'];
    var CRIT_F = ['Neat bun', 'Black band & pins', 'Hair off face', 'Natural colour—no oil', 'Uniform well-fitted', 'Clean & ironed', 'No loose threads/buttons/fade', 'Name badge visible', 'Shoes black & polished', 'Belt black & visible', 'One pair studs/small hoops', 'Watch simple', 'Nails clean & trimmed', 'Lipstick nude only', 'Nail polish nude only'];
    for (var gp = 0; gp < DSTR.length; gp += 30) {
      await writeBulk(function () {
        for (var j = gp; j < Math.min(gp + 30, DSTR.length); j++) {
          var ds = DSTR[j]; if (isWeekend(new Date(ds + 'T12:00:00')) || j % 2) continue;
          var arr = CRO_EMP.map(function (e) {
            var g = e.gender === 'F' ? 'f' : 'm', crit = g === 'f' ? CRIT_F : CRIT_M, checked = ri(11, 15);
            return { name: e.name, gender: g, pct: Math.round(checked / 15 * 100), checked: checked, total: 15, date: ds, time: '10:' + String(ri(5, 40)).padStart(2, '0') + ' am', items: crit.map(function (lbl, i) { return { label: lbl, passed: i < checked }; }) };
          });
          set('saagar_grooming_' + ds, arr);
        }
      });
      await yieldUI();
    }
    prog(82, 'grooming done'); await yieldUI();

    /* ════════ CRO DAILY AUDIT (cro_audits_v3) ════════ */
    set('cro_s_v3', { surveys: 80, npsScore: 85, rate: 40, reviews: 30, mktg: 120 });
    var audits = [];
    for (var ai = 0; ai < DSTR.length; ai++) {
      var ds = DSTR[ai]; if (isWeekend(new Date(ds + 'T12:00:00'))) continue;
      CRO_EMP.forEach(function (e, ci) {
        if ((ci + ai) % 2 !== 0) return;
        var t = { t1: { pts: pick([4, 7, 10]) }, t2: { pts: pick([7, 10]) }, t3: { pts: pick([4, 7, 10]) }, t4: { pts: pick([4, 7, 10]) }, t5: (function () { var bills = ri(30, 60), coll = Math.round(bills * 0.4), rate = Math.round(coll / bills * 100), nps = ri(80, 92), rp = Math.min(Math.round(rate / 40 * 5), 5), sp = Math.min(Math.round(nps / 85 * 5), 5); return { billsCount: bills, npsCollected: coll, responseRate: rate, npsScore: nps, pts: rp + sp }; })(), t6: { reviewsCount: ri(1, 3), pts: pick([7, 10]) }, t7: { activityCount: ri(3, 6), pts: pick([8, 10]) }, t8: { pts: pick([4, 7, 10]) }, t9: (function () { var p = ri(70, 95); return { groomingPct: p, pts: Math.round(p / 10) }; })(), t10: { pts: pick([7, 10]) } };
        var tot = 0; for (var key in t) tot += t[key].pts || 0;
        var grade = tot >= 90 ? 'Outstanding' : tot >= 75 ? 'Good' : tot >= 60 ? 'Satisfactory' : tot >= 45 ? 'Below Exp.' : 'Poor';
        audits.unshift({ id: 'a' + (1748000000000 + audits.length), date: ds, store: e.firm === FIRM_H ? 'Helios, Latur' : 'Titan World, Latur', cro: e.name, sm: SM_NAME, total: tot, grade: grade, tasks: t, submittedAt: ds + 'T20:00:00.000Z' });
      });
      if (ai % 60 === 59) await yieldUI();
    }
    await writeBulk(function () { set('cro_audits_v3', audits); });
    audits = null; prog(88, 'CRO audits done'); await yieldUI();

    /* ════════ PAYROLL (payroll_suite_v1_2026) — current month, approved ════════ */
    function daysInMonth(mName, y) { return new Date(y, MONTHNAMES.indexOf(mName) + 1, 0).getDate(); }
    function ptFor(g, gender, mName) { if (gender === 'F') return g <= 25000 ? 0 : (mName === 'February' ? 300 : 200); return g <= 7500 ? 0 : g < 10000 ? 175 : (mName === 'February' ? 300 : 200); }
    var totalDays = daysInMonth(curMonth, curYear);
    var payRows = EMP.map(function (e, i) {
      var absent = ri(0, 3), halfDay = ri(0, 2), late = ri(0, 6), noThumb = ri(0, 1), leavesApplied = ri(0, 2);
      var lateDed = Math.floor(late / 3) * 0.5, totalDed = absent + halfDay * 0.5 + noThumb * 0.5 + lateDed;
      var extraDays = totalDed <= 5.5 ? 4 : totalDed < 7 ? 2 : 0;
      var finalPresent = Math.max(0, totalDays - totalDed), raw = finalPresent + leavesApplied + extraDays;
      var salaryDays = Math.min(totalDays, raw), otDays = Math.max(0, raw - totalDays);
      var gross = e.monthlySalary, grossPayable = gross * salaryDays / totalDays, basic, hra, washing;
      if (e.salaryType === 'S') { basic = 0.5 * grossPayable; hra = 0.8 * basic; washing = 0.1 * basic; } else { basic = grossPayable; hra = 0; washing = 0; }
      var pfApplicable = e.salaryType === 'S', esicApplicable = true, pt = ptFor(grossPayable, e.gender, curMonth);
      var pfEE = pfApplicable ? 0.12 * Math.min(basic, 15000) : 0;
      var esicEE = (esicApplicable && grossPayable <= 21000) ? 0.0075 * (grossPayable - washing) : 0;
      var netPayable = grossPayable - pt - pfEE - esicEE, otAmount = gross / totalDays * otDays, advance = 0, finalPay = netPayable + otAmount - advance;
      return { id: i + 2, firm: 'GM', empId: 'GM' + String(i + 1).padStart(3, '0'), name: e.name, phone: e.phone, designation: e.role, joiningDate: e.joiningDate, uan: '', esicIp: '', bankName: pick(['HDFC', 'SBI', 'ICICI', 'Axis']), accountNo: '5010' + String(100000000 + i * 7654321).slice(0, 10), ifsc: 'HDFC000' + (1000 + i), idProof: '', active: true, absent: absent, halfDay: halfDay, late: late, noThumb: noThumb, leavesApplied: leavesApplied, remarks: '', signature: 'Signed', gross: gross, salaryType: e.salaryType, gender: e.gender, pfApplicable: pfApplicable, esicApplicable: esicApplicable, salaryAmount: 0, advance: 0, salaryRemark: '', pf: r2(pfEE), esic: r2(esicEE), pt: pt, net: r2(finalPay), grossPayable: r2(grossPayable) };
    });
    await writeBulk(function () {
      set('payroll_suite_v1_2026', { meta: { title: 'SAAGAR TRADERS — PAYROLL', month: curMonth, year: curYear, holidays: 0, totalDaysOverride: '', preparedBy: 'Nisha Bora', checkedBy: 'Kavya Iyer', approvedBy: 'Manish Jain', firmName: 'SAAGAR TRADERS', firmAddr: 'Main Road, Latur - 413512.', firmContact: 'Tel : 02382-000000', signatory: 'Manish Jain', rules: { pt: { maleExempt: 7500, maleMid: 10000, maleMidAmt: 175, stdAmt: 200, febAmt: 300, femaleExempt: 25000 }, pf: { rateEE: 12, rateER: 13, wageCap: 15000 }, esic: { rateEE: 0.75, rateER: 3.25, wageCeiling: 21000 } }, run: { status: 'approved', approvedBy: 'Manish Jain', approvedAt: TODAY + 'T21:00:00.000Z', formulaVersion: '4.0' } }, rows: payRows, advances: [], runs: {}, nextId: payRows.length + 2 });
    });

    /* ════════ LEAVE (leavedesk_v3) — a year of approved leaves ════════ */
    var slug = function (n) { return 'emp_' + n.toLowerCase().replace(/[^a-z0-9]/g, ''); };
    var leaveCats = ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Compensatory Off'], leaves = {};
    for (var li = 0; li < DSTR.length; li++) {
      var ds = DSTR[li]; if (isWeekend(new Date(ds + 'T12:00:00'))) continue;
      if (li % 4 !== 0 && ds !== TODAY) continue;
      var who = EMP[(li * 3) % EMP.length];
      (leaves[ds] = leaves[ds] || []).push({ id: uid('lv'), name: who.name, staffName: who.name, type: rnd() < 0.7 ? 'full_day' : (rnd() < 0.5 ? 'half_day_am' : 'half_day_pm'), category: pick(leaveCats), reason: pick(['family function', 'medical', 'personal', '']), approvedBy: SM_NAME, leaveFrom: ds, leaveTo: ds });
    }
    await writeBulk(function () { set('leavedesk_v3', { employees: EMP.map(function (e) { return { id: slug(e.name), name: e.name, empId: e.employeeId, department: e.department }; }), leaves: leaves, agendas: {} }); });

    /* ════════ TAX / GST (taxcal_v2) ════════ */
    function plusDays(n) { var d = new Date(today); d.setDate(d.getDate() + n); return ymd(d); }
    await writeBulk(function () {
      set('taxcal_v2', { firms: [{ id: 'firm_1', name: 'Saagar Traders', pan: 'ABCDE1234F', gstin: '27ABCDE1234F1Z5', entity: 'proprietorship', type: 'both', notes: '' }], activeFirmId: 'firm_1', fyStartYear: Math.max(2026, curYear), compliance: { firm_1: (function () { var o = {}; o[Math.max(2026, curYear)] = { gstr3b_prev: { done: true, dueDate: plusDays(-20), filedOn: plusDays(-19), notes: 'Filed' }, gstr1_ovd: { done: false, dueDate: plusDays(-3) }, gstr3b_wk: { done: false, dueDate: plusDays(2) }, tds_wk: { done: false, dueDate: plusDays(5) }, ptrc_mo: { done: false, dueDate: plusDays(12) }, advtax_mo: { done: false, dueDate: plusDays(18) } }; return o; })() } });
    });
    prog(92, 'payroll · leave · tax done'); await yieldUI();

    /* ════════ STOCK (saagar_stock_<store>_<date>) — full year ════════ */
    var STORES = [['titanworld', BR_T.slice(0, 6)], ['helios', BR_H.slice(0, 5)]];
    for (var sp = 0; sp < DSTR.length; sp += 30) {
      await writeBulk(function () {
        for (var j = sp; j < Math.min(sp + 30, DSTR.length); j++) {
          var ds = DSTR[j]; if (isWeekend(new Date(ds + 'T12:00:00'))) continue;
          STORES.forEach(function (st) {
            var brands = st[1], opening = {}, movements = {}, closing = {};
            brands.forEach(function (b) {
              var croName = pick(CRO_NAMES), sysStock = ri(40, 120);
              opening[b] = { display: ri(20, 60), storage: ri(10, 40), defective: ri(0, 2), yLoc: ri(0, 2), systemStock: sysStock, remarks: '', croName: croName, time: '09:' + String(ri(5, 30)).padStart(2, '0'), verified: true, countDone: true };
              var inward = ri(0, 12), grn = ri(0, 8), outward = ri(0, 4), sales = ri(0, 6), closingSys = sysStock + inward + grn - outward - sales;
              movements[b] = { inward: inward, outward: outward, sales: sales, grn: grn };
              var cDef = ri(0, 1), cY = ri(0, 1), rem = Math.max(0, closingSys - cDef - cY), cDisp = Math.round(rem * 0.6);
              closing[b] = { display: cDisp, storage: rem - cDisp, defective: cDef, yLoc: cY, remarks: '', croName: croName, time: '18:' + String(ri(5, 30)).padStart(2, '0'), verified: true, countDone: true };
            });
            set('saagar_stock_' + st[0] + '_' + ds, { _v: 2, openingLocked: true, closingLocked: true, movementsSubmitted: true, opening: opening, movements: movements, closing: closing });
          });
        }
      });
      prog(92 + (sp / DSTR.length) * 6, 'stock register ' + Math.round(sp / DSTR.length * 100) + '%'); await yieldUI();
    }

    /* ════════ misc + mark seeded ════════ */
    await writeBulk(function () { set('gm_role', 'owner'); set('saagar_owner_name', 'Sagar'); set('saagar_demo_seeded', 'v3_1yr'); });
    try { console.log('[demo-seed] BIG ' + DSTR.length + ' days · ' + qLive.length + ' live + ' + archived + ' archived QMS · ' + SVC_TOTAL + ' service · ' + payRows.length + ' payroll'); } catch (e) {}
    prog(100, 'done'); await yieldUI();
    try { if (ov && ov.parentNode) { ov.style.transition = 'opacity .3s'; ov.style.opacity = '0'; setTimeout(function () { try { ov.parentNode.removeChild(ov); } catch (e) {} }, 320); } } catch (e) {}
    try { var ev = document.createEvent('Event'); ev.initEvent('storage', false, false); window.dispatchEvent(ev); } catch (e) {}
    try { if (typeof window.renderHome === 'function') window.renderHome(); } catch (e) {}
  }  /* ── end __runSeedBig ── */

  /* dispatch: 1-year → chunked + Queue-split (can't freeze/OOM the phone); else the proven light path.
     HASW guards `window` so this ALSO runs in the windowless vm test sandbox (seed_run / backup roundtrip),
     and the catch fallback is window-free so a thrown dispatch still seeds via the light path. */
  var HASW = (typeof window !== 'undefined');
  try {
    if (BIG) { __runSeedBig(); }
    else if (HASW && window.SaagarStore && typeof window.SaagarStore.bulk === 'function') { window.SaagarStore.bulk(__runSeed); }
    else { __runSeed(); try { if (HASW && window.SaagarStore && typeof window.SaagarStore.flush === 'function') window.SaagarStore.flush(); } catch (e) {} }
  } catch (e) { try { __runSeed(); } catch (_) {} }
})();
