/* ═══════════════════════════════════════════════════════════════════════════
   SAAGAR REPORT ENGINE — enterprise-grade, data-driven A4 PDF reports (offline)
   ───────────────────────────────────────────────────────────────────────────
   Pipeline:  module data (existing shell aggregators) → a CLEAN, purpose-built
   A4 HTML page node → html2canvas(page) → jsPDF.addImage (one image per A4 page)
   → Blob → OS share sheet. It NEVER screenshots the live module UI, so there is
   no chrome, no whitespace, no shrink-to-fit, no blank pages, and the layout is
   the designed document — readable at full A4 size.
   Libs (all local/offline): html2canvas.min.js + jspdf.umd.min.js.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ---------- formatters / helpers ---------- */
  function inr(n) { return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN'); }
  function num(n) { return Math.round(Number(n) || 0).toLocaleString('en-IN'); }
  function pct(n) { return (Math.round(Number(n) || 0)) + '%'; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function dash(v) { return (v == null || v === '' || (typeof v === 'number' && isNaN(v))) ? '—' : v; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function G(name, fb) { try { return (typeof window[name] === 'function') ? window[name] : fb; } catch (e) { return fb; } }
  function todayIsoSafe() { try { return todayIso(); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  function curDate() { try { if (typeof repDate !== 'undefined' && repDate) return repDate; } catch (e) {} return todayIsoSafe(); }
  function curMonth() { try { if (typeof repMonth !== 'undefined' && repMonth) return repMonth; } catch (e) {} return todayIsoSafe().slice(0, 7); }
  function ownerNm() { try { return ownerName() || ''; } catch (e) { return ''; } }
  function J(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function longDate(d) { try { return new Date((d || todayIsoSafe()) + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); } catch (e) { return d || ''; } }
  function monthLong(m) { try { return new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); } catch (e) { return m || ''; } }
  function stamp() { try { return new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }

  /* ---------- design-system CSS (offline font stacks; mirrors the app) ---------- */
  function CSS(W) {
    return ''
      + ":root{--navy:#0d2340;--navy2:#13325c;--gold:#b8923a;--ink:#1a2433;--mut:#64748b;--line:#e3e8f0;--bg:#f7f9fc;--green:#1b8f5a;--amber:#b7791f;--red:#c0392b;--redbg:#fdecea}"
      + "*{box-sizing:border-box;margin:0;padding:0}"
      + "body{background:#fff;font-family:'DM Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}"
      + ".page{width:794px;min-height:1123px;background:#fff;padding:40px 44px 60px;position:relative}"
      + ".page.land{width:1123px;min-height:794px;padding:34px 40px 52px}"
      + ".tnum{font-variant-numeric:tabular-nums}"
      + ".lh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid var(--navy);padding-bottom:13px}"
      + ".brand{font-family:'DM Serif Display',Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;color:var(--navy);line-height:1}"
      + ".brand small{display:block;font-family:'DM Sans',system-ui,sans-serif;font-size:9px;font-weight:700;letter-spacing:3px;color:var(--gold);margin-top:5px}"
      + ".addr{font-size:10px;color:var(--mut);margin-top:6px}"
      + ".lh-r{text-align:right}.rtitle{font-size:15px;font-weight:800;color:var(--navy);letter-spacing:.3px}"
      + ".rsub{font-size:11.5px;color:var(--mut);font-weight:500;margin-top:3px}.rsub.b{font-weight:700;color:var(--ink)}"
      + ".chip{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.5px;padding:3px 11px;border-radius:20px;margin-top:7px;background:#e6f5ec;color:var(--green);border:1px solid #bfe6cf}"
      + ".chip.draft{background:#fef3e0;color:var(--amber);border-color:#f0d9ad}"
      + ".rgen{font-size:9.5px;color:#94a3b8;margin-top:6px}"
      + ".att{margin:15px 0 4px;border:1.5px solid #f3c5be;background:var(--redbg);border-radius:10px;padding:11px 16px}"
      + ".att.clear{border-color:#bfe6cf;background:#edf9f1}"
      + ".att h3{font-size:11px;font-weight:800;letter-spacing:1.4px;color:var(--red);text-transform:uppercase;margin-bottom:7px}"
      + ".att.clear h3{color:var(--green);margin-bottom:0}"
      + ".att ul{list-style:none;display:grid;gap:5px}.att li{font-size:12.5px;color:#3a2420;font-weight:500;padding-left:17px;position:relative}"
      + ".att li::before{content:'\\25CF';position:absolute;left:2px;color:var(--red);font-size:8px;top:4px}"
      + ".kpis{display:grid;gap:10px;margin:15px 0 4px}"
      + ".kpi{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:11px 13px}"
      + ".kpi .lab{font-size:9px;font-weight:700;letter-spacing:.5px;color:var(--mut);text-transform:uppercase}"
      + ".kpi .val{font-size:20px;font-weight:800;color:var(--navy);margin-top:5px;line-height:1.05}"
      + ".kpi .sub{font-size:10px;font-weight:600;margin-top:3px}.up{color:var(--green)}.down{color:var(--red)}.neu{color:var(--mut)}"
      + ".kpi.hero{background:var(--navy);border-color:var(--navy)}.kpi.hero .lab{color:#b9c6dc}.kpi.hero .val{color:#fff}.kpi.hero .sub{color:#9fe3c0}"
      + ".grid{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-top:16px}"
      + ".card{border:1px solid var(--line);border-radius:10px;overflow:hidden}.card.full{grid-column:1/-1}"
      + ".ch{background:#f1f5fb;border-bottom:1px solid var(--line);padding:8px 13px;font-size:11px;font-weight:800;letter-spacing:.4px;color:var(--navy);text-transform:uppercase;display:flex;justify-content:space-between;align-items:center}"
      + ".tag{font-size:9.5px;font-weight:700;padding:1px 8px;border-radius:20px}.tag.ok{background:#e6f5ec;color:var(--green)}.tag.warn{background:#fef3e0;color:var(--amber)}.tag.bad{background:var(--redbg);color:var(--red)}"
      + ".cb{padding:11px 13px}.cb.p0{padding:0}"
      + "table{width:100%;border-collapse:collapse}"
      + "th{background:var(--navy);color:#fff;font-size:9.5px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;padding:7px 10px;text-align:left}th.r,td.r{text-align:right}th.c,td.c{text-align:center}"
      + "td{font-size:11.5px;padding:5px 10px;border-bottom:1px solid var(--line);color:var(--ink)}"
      + "tr:nth-child(even) td{background:#fafbfd}"
      + "td.net{font-weight:800;color:var(--navy)}"
      + "tr.tot td{font-weight:800;background:#eef2f8 !important;border-top:2px solid var(--navy);color:var(--navy)}"
      + "tr.flag td{background:#fdf3f1 !important;font-weight:600}"
      + ".kv{display:grid;grid-template-columns:1fr auto;gap:7px 10px;font-size:12px}.kv .k{color:var(--mut);font-weight:500}.kv .v{font-weight:700;text-align:right}.kv .v.big{font-size:14px;color:var(--navy)}"
      + ".pill{font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px}.pill.ok{background:#e6f5ec;color:var(--green)}.pill.bad{background:var(--redbg);color:var(--red)}.pill.warn{background:#fef3e0;color:var(--amber)}"
      + ".empty{padding:40px;text-align:center;color:var(--mut);font-size:13px;font-weight:600}"
      + ".statline{margin-top:10px;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:9px 14px;font-size:11.5px;display:flex;gap:22px;flex-wrap:wrap}.statline b{color:var(--navy)}"
      + ".sign{display:flex;justify-content:space-between;margin-top:18px;padding:0 20px}.sigbox{text-align:center;font-size:11px;color:var(--mut)}.sigbox .ln{width:190px;border-top:1.3px solid var(--ink);margin-bottom:6px}.sigbox b{color:var(--ink);display:block;font-size:12px}"
      + ".foot{position:absolute;left:44px;right:44px;bottom:22px;border-top:1px solid var(--line);padding-top:8px;display:flex;justify-content:space-between;font-size:9.5px;color:#94a3b8}"
      + ".page.land .foot{left:40px;right:40px;bottom:18px}";
  }

  /* ---------- shared layout primitives (HTML strings) ---------- */
  function lhead(title, sub, period, opt) {
    opt = opt || {};
    var chip = opt.chip ? '<div class="chip ' + (opt.chipClass || '') + '">' + esc(opt.chip) + '</div>' : '';
    return '<div class="lh"><div>'
      + '<div class="brand">Saagar Traders<small>BUSINESS CONTROL CENTRE</small></div>'
      + (opt.addr ? '<div class="addr">' + esc(opt.addr) + '</div>' : '')
      + '</div><div class="lh-r">'
      + '<div class="rtitle">' + esc(title) + '</div>'
      + (sub ? '<div class="rsub">' + esc(sub) + '</div>' : '')
      + '<div class="rsub b">' + esc(period) + '</div>'
      + chip
      + '<div class="rgen">' + (ownerNm() ? 'Prepared for ' + esc(ownerNm()) + ' · ' : '') + 'Generated ' + esc(stamp()) + '</div>'
      + '</div></div>';
  }
  function foot(pageNo, pageTot) {
    var pg = (pageNo != null && pageTot != null) ? (' · Page ' + pageNo + ' of ' + pageTot) : '';
    return '<div class="foot"><span>Saagar Traders · Latur · Confidential — for owner review</span>'
      + '<span>Business Control Centre' + pg + '</span></div>';
  }
  function kpiRow(items, cols) {
    return '<div class="kpis" style="grid-template-columns:repeat(' + (cols || items.length) + ',1fr)">'
      + items.map(function (k) {
        return '<div class="kpi' + (k.hero ? ' hero' : '') + '"><div class="lab">' + esc(k.label) + '</div>'
          + '<div class="val tnum">' + k.value + '</div>'
          + (k.sub ? '<div class="sub ' + (k.subClass || 'neu') + '">' + k.sub + '</div>' : '') + '</div>';
      }).join('') + '</div>';
  }
  function attn(flags) {
    if (!flags || !flags.length) return '<div class="att clear"><h3>✅ All clear — nothing needs you today</h3></div>';
    return '<div class="att"><h3>⛔ Needs your attention today</h3><ul>'
      + flags.map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ul></div>';
  }
  function card(title, tag, body, full) {
    var t = tag ? '<span class="tag ' + tag.cls + '">' + esc(tag.txt) + '</span>' : '';
    return '<div class="card' + (full ? ' full' : '') + '"><div class="ch">' + esc(title) + t + '</div>'
      + '<div class="cb' + (body.p0 ? ' p0' : '') + '">' + (body.html != null ? body.html : body) + '</div></div>';
  }
  function kvList(pairs) {
    return '<div class="kv">' + pairs.map(function (p) {
      return '<span class="k">' + esc(p[0]) + '</span><span class="v ' + (p[2] || '') + '">' + p[1] + '</span>';
    }).join('') + '</div>';
  }
  function dataTable(cols, rows, opt) {
    opt = opt || {};
    var head = '<thead><tr>' + cols.map(function (c) { return '<th class="' + (c.align || '') + '">' + esc(c.label) + '</th>'; }).join('') + '</tr></thead>';
    var body = rows.map(function (rw) {
      var cls = rw.__flag ? ' class="flag"' : '';
      return '<tr' + cls + '>' + cols.map(function (c) {
        var v = rw[c.key]; v = (c.fmt ? c.fmt(v, rw) : (v == null ? '—' : v));
        return '<td class="' + (c.align || '') + (c.cell || '') + '">' + v + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var tot = '';
    if (opt.totals) {
      tot = '<tr class="tot">' + cols.map(function (c) {
        var v = opt.totals[c.key];
        return '<td class="' + (c.align || '') + '">' + (v == null ? '' : v) + '</td>';
      }).join('') + '</tr>';
    }
    return '<table>' + head + '<tbody>' + body + tot + '</tbody></table>';
  }

  /* ---------- shared data helpers ---------- */
  var DEN = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
  function denoTotal(map) { var t = 0; if (map) DEN.forEach(function (d) { t += d * (Number(map[d]) || 0); }); return t; }
  function cashDetail(date) {
    var st = J('tanishq_statements', {}) || {}; var rec = st[date] || null;
    var rows = J('gm_expenses', []); var cashIn = 0, cashOut = 0, receipts = [], payments = [];
    (Array.isArray(rows) ? rows : []).forEach(function (e) {
      if (!e || e.void) return;
      if (String(e.date || e.entryDate || e.expenseDate || '').slice(0, 10) !== date) return;
      if (!/cash/i.test(e.mode || e.paymentMode || '')) return;
      var amt = Number(e.amount || e.total || 0) || 0;
      if (String(e.type || 'expense').toLowerCase() === 'income') { cashIn += amt; receipts.push({ cat: e.category || 'Income', desc: e.description || e.desc || '', who: e.vendor || e.source || '', amount: amt }); }
      else { cashOut += amt; payments.push({ cat: e.category || 'Expense', desc: e.description || e.desc || '', who: e.vendor || (e.source === 'petty' ? 'Petty cash' : '') || '', amount: amt }); }
    });
    var opening = rec ? (Number(rec.openingBalance) || 0) : 0;
    var counted = rec ? denoTotal(rec.physDeno) : 0;
    var bankDep = rec ? denoTotal(rec.bankDeno) : 0;
    var expected = opening + cashIn - cashOut;
    return { rec: rec, opening: opening, cashIn: cashIn, cashOut: cashOut, receipts: receipts, payments: payments, counted: counted, bankDep: bankDep, expected: expected, variance: counted - expected, physDeno: (rec && rec.physDeno) || {}, bankDeno: (rec && rec.bankDeno) || {}, balanced: Math.abs(counted - expected) < 1, closed: !!(rec && rec.closed), approved: !!(rec && rec.approved), filledBy: (rec && rec.filledBy) || '', approvedBy: (rec && rec.approvedBy) || '', mismatchReason: (rec && rec.mismatchReason) || '' };
  }
  function storeList() {
    try { var s = window.SaagarMasters && SaagarMasters.stores(); if (s && s.length) return s.map(function (x) { return { code: x.code, key: x.key, name: x.name }; }); } catch (e) {}
    return [{ code: 'WLMHW', key: 'titanworld', name: 'Titan World' }, { code: 'HEMW', key: 'helios', name: 'Helios' }];
  }
  function stockDetailStore(s, date) {
    var blob = J('saagar_stock_' + s.key + '_' + date, null) || J('saagar_stock_' + s.code + '_' + date, null);
    if (!blob || typeof blob !== 'object') return { store: s.name, posted: false };
    var opening = blob.opening || {}, mov = blob.movements || {}, closing = blob.closing || {};
    var brands = Object.keys(opening); if (!brands.length) brands = Object.keys(mov);
    var rows = [], T = { sysOpen: 0, inward: 0, grn: 0, outward: 0, sales: 0, theft: 0, closingSys: 0, closingPhys: 0 };
    function phys(o) { if (!o) return null; var v = ['display', 'storage', 'defective', 'yLoc'].reduce(function (a, f) { var n = Number(o[f]); return a + (isNaN(n) ? 0 : n); }, 0); var any = ['display', 'storage', 'defective', 'yLoc'].some(function (f) { return o[f] != null && o[f] !== ''; }); return any ? v : null; }
    brands.forEach(function (b) {
      var op = opening[b] || {}, m = mov[b] || {}, cl = closing[b] || {};
      var sysOpen = Number(op.systemStock) || 0, inward = Number(m.inward) || 0, grn = Number(m.grn) || 0, outward = Number(m.outward) || 0, sales = Number(m.sales) || 0, theft = Number(m.theft) || 0;
      var closingSys = sysOpen + inward + grn - outward - sales - theft;
      var cp = phys(cl);
      var variance = (cp == null) ? null : cp - closingSys;
      var status = (cp == null) ? 'Pending' : (variance === 0 ? 'OK' : 'Mismatch');
      rows.push({ brand: b, sysOpen: sysOpen, inward: inward, grn: grn, outward: outward, sales: sales, theft: theft, closingSys: closingSys, closingPhys: cp, variance: variance, status: status, __flag: (theft > 0 || (variance != null && variance !== 0)) });
      T.sysOpen += sysOpen; T.inward += inward; T.grn += grn; T.outward += outward; T.sales += sales; T.theft += theft; T.closingSys += closingSys; T.closingPhys += (cp || 0);
    });
    return { store: s.name, code: s.code, posted: true, rows: rows, totals: T, openingLocked: !!blob.openingLocked, movementsSubmitted: !!blob.movementsSubmitted, closingLocked: !!blob.closingLocked };
  }

  /* ---------- per-report builders → { orientation, pages:[innerHtml,...] } ---------- */
  var BUILDERS = {

    /* ===== ⭐ OWNER DAILY BRIEF (portrait, 1 page) ===== */
    ownerBrief: function (o) {
      var date = o.date || curDate();
      var b = G('buildTodayBrief', function () { return {}; })(date);
      var qms = G('computeQmsDay', function () { return { byCro: [] }; })(date);
      var dsr = G('computeDsrDay', function () { return {}; })(date);
      var cash = cashDetail(date);
      var aging = G('computeServiceAging', function () { return {}; })();
      var tax = G('computeTaxStatus', function () { return { upcoming: [] }; })();
      var leave = G('computeLeaveDay', function () { return { items: [] }; })(date);
      var stores = storeList().map(function (s) { return stockDetailStore(s, date); });

      // exceptions (red flags)
      var flags = [];
      if (cash.rec && !cash.balanced) flags.push('<b>Cash ' + (cash.variance < 0 ? 'short' : 'over') + ' ' + inr(Math.abs(cash.variance)) + '</b> (counted ' + inr(cash.counted) + ' vs expected ' + inr(cash.expected) + ')');
      if (cash.rec && !cash.closed) flags.push('<b>Cash sheet not closed</b> for ' + longDate(date).split(',')[0]);
      stores.forEach(function (st) {
        if (!st.posted) { flags.push('<b>' + esc(st.store) + ' stock not posted</b> today'); return; }
        var theft = st.totals.theft, varc = st.rows.filter(function (r) { return r.variance != null && r.variance !== 0; }).length;
        if (theft > 0) flags.push('<b>' + esc(st.store) + ' theft</b> — ' + theft + ' unit(s) flagged');
        else if (varc > 0) flags.push('<b>' + esc(st.store) + ' stock variance</b> on ' + varc + ' brand(s)');
      });
      if ((b.qmsSales || 0) === 0 && (b.qmsWalkins || 0) > 0) flags.push('<b>Zero sales</b> despite ' + b.qmsWalkins + ' walk-ins');
      if ((b.qmsWalkins || 0) >= 10 && (b.qmsConversion || 0) < 20) flags.push('<b>Low conversion ' + (b.qmsConversion || 0) + '%</b> on ' + b.qmsWalkins + ' walk-ins');
      if ((aging.b16 || 0) > 0) flags.push('<b>Service backlog</b> — ' + aging.b16 + ' case(s) aged 16+ days');
      if ((b.taxOverdue || 0) > 0) flags.push('<b>' + b.taxOverdue + ' overdue tax item(s)</b>' + (tax.upcoming[0] && tax.upcoming[0].status === 'Overdue' ? ' — ' + esc(tax.upcoming[0].item) : ''));
      if ((b.groomingTodayChecks || 0) > 0 && (b.groomingTodayAvg || 0) < 60) flags.push('<b>Grooming low</b> — store avg ' + b.groomingTodayAvg + '%');
      if (b.backupDays != null && b.backupDays > 7) flags.push('<b>Backup overdue</b> — ' + b.backupDays + ' days');

      // KPI strip
      var kpis = kpiRow([
        { label: 'Net Sales', value: inr(b.qmsSales), sub: (dsr.salesCnt ? num(dsr.salesCnt) + ' bills (DSR)' : ''), subClass: 'neu', hero: true },
        { label: 'Conversion', value: pct(b.qmsConversion) },
        { label: 'Walk-ins → Buy', value: num(b.qmsWalkins) + ' → ' + num(b.qmsPurchases), sub: ((b.qmsWalkins || 0) - (b.qmsPurchases || 0)) + ' not converted', subClass: 'neu' },
        { label: 'Cash', value: cash.rec ? inr(cash.counted) : '—', sub: cash.rec ? (cash.balanced ? 'Reconciled' : 'Mismatch') : 'Not counted', subClass: cash.rec ? (cash.balanced ? 'up' : 'down') : 'neu' },
        { label: 'Open Service', value: num(b.serviceOpen), sub: (aging.b16 || 0) + ' aged 16d+', subClass: (aging.b16 || 0) > 0 ? 'down' : 'neu' }
      ], 5);

      // sales by CRO
      var croRows = (qms.byCro || []).slice(0, 8).map(function (c) {
        return { cro: esc(c.cro), walkins: c.walkins, purchases: c.purchases, conv: c.walkins ? Math.round(c.purchases / c.walkins * 100) + '%' : '—', sales: inr(c.sales) };
      });
      var croTable = croRows.length ? dataTable(
        [{ key: 'cro', label: 'CRO' }, { key: 'walkins', label: 'Walk-ins', align: 'r' }, { key: 'purchases', label: 'Purchases', align: 'r' }, { key: 'conv', label: 'Conv %', align: 'r' }, { key: 'sales', label: 'Sales ₹', align: 'r' }],
        croRows,
        { totals: { cro: 'Total', walkins: num(qms.total), purchases: num(qms.purchases), conv: pct(qms.conversion), sales: inr(qms.sales) } }
      ) : '<div class="empty">No walk-ins recorded today</div>';

      // cash card
      var cashCard = cash.rec ? kvList([
        ['Opening cash', inr(cash.opening)], ['+ Cash receipts', inr(cash.cashIn)], ['− Cash payments', inr(cash.cashOut)],
        ['Expected closing', inr(cash.expected), 'big'], ['Counted (physical)', inr(cash.counted)],
        ['Variance', cash.balanced ? '<span class="pill ok">₹0 · Balanced</span>' : '<span class="pill bad">' + inr(cash.variance) + '</span>'],
        ['Status', cash.closed ? (cash.approved ? 'Locked & approved' : 'Closed, awaiting approval') : 'Open']
      ]) : '<div class="empty">Cash sheet not filled for ' + longDate(date).split(',')[0] + '</div>';

      // stock card
      var stockPairs = [];
      stores.forEach(function (st) {
        if (!st.posted) { stockPairs.push([st.store, '<span class="pill bad">Not posted</span>']); return; }
        var theft = st.totals.theft, varc = st.rows.filter(function (r) { return r.variance != null && r.variance !== 0; }).length;
        stockPairs.push([st.store, theft > 0 ? '<span class="pill bad">' + theft + ' units theft</span>' : varc > 0 ? '<span class="pill warn">' + varc + ' brand variance</span>' : '<span class="pill ok">Posted · no variance</span>']);
      });
      stockPairs.push(['Sales units (day)', num(stores.reduce(function (a, s) { return a + (s.posted ? s.totals.sales : 0); }, 0))]);
      var stockAlerts = stores.reduce(function (a, s) { return a + (s.posted ? (s.totals.theft > 0 ? 1 : 0) : 1); }, 0);

      // staff card
      var leaveStr = leave.items.length ? leave.items.map(function (l) { return esc(l.name) + ' (' + esc(l.type) + ')'; }).join(', ') : 'None';
      var staffCard = kvList([
        ['Present today', num(dsr.present)], ['On leave', leaveStr],
        ['Grooming average', (b.groomingTodayChecks ? b.groomingTodayAvg + '% · ' + b.groomingTodayPass + '/' + b.groomingTodayChecks + ' pass' : '—')],
        ['Expenses today', inr(b.expenseTodayAmount) + ' · ' + num(b.expenseToday) + ' entries']
      ]);

      // compliance/service card
      var nextTax = (tax.upcoming || [])[0];
      var compCard = kvList([
        ['Tax overdue', (b.taxOverdue || 0) > 0 ? '<span class="pill bad">' + b.taxOverdue + (nextTax && nextTax.status === 'Overdue' ? ' · ' + esc(nextTax.item) : '') + '</span>' : '<span class="pill ok">0</span>'],
        ['Due this week', num(b.taxDueWeek)],
        ['Open service cases', num(b.serviceOpen)],
        ['Aged 16+ days', (aging.b16 || 0) > 0 ? '<span class="pill bad">' + aging.b16 + '</span>' : '0'],
        ['Last data backup', (b.backupDays == null ? '—' : b.backupDays === 0 ? 'Today' : b.backupDays + ' days ago')]
      ]);

      var page = lhead('DAILY OWNER BRIEF', 'Titan World + Helios · Latur', longDate(date))
        + attn(flags) + kpis
        + '<div class="grid">'
        + card('Sales & Conversion — by CRO', null, { p0: true, html: croTable }, true)
        + card('Cash Position', cash.rec ? (cash.balanced ? { cls: 'ok', txt: 'Reconciled' } : { cls: 'bad', txt: 'Mismatch' }) : { cls: 'warn', txt: 'Pending' }, cashCard)
        + card('Stock — Both Stores', stockAlerts ? { cls: 'bad', txt: stockAlerts + ' alert' } : { cls: 'ok', txt: 'Clean' }, kvList(stockPairs))
        + card('Staff & Grooming', (b.groomingTodayAvg || 100) < 80 ? { cls: 'warn', txt: b.groomingTodayAvg + '% avg' } : { cls: 'ok', txt: (b.groomingTodayAvg || 0) + '% avg' }, staffCard)
        + card('Compliance & Service', ((b.taxOverdue || 0) > 0 || (aging.b16 || 0) > 0) ? { cls: 'bad', txt: 'Action' } : { cls: 'ok', txt: 'Clear' }, compCard)
        + '</div>' + foot(1, 1);
      return { orientation: 'portrait', pages: [page] };
    },

    /* ===== DAILY CASH STATEMENT (portrait, 1 page) ===== */
    cashStatement: function (o) {
      var date = o.date || curDate();
      var c = cashDetail(date);
      if (!c.rec) {
        return { orientation: 'portrait', pages: [lhead('DAILY CASH STATEMENT', 'Saagar Traders', longDate(date)) + '<div class="empty" style="margin-top:60px">Cash statement not filled for this date.<br>Opening carry-forward: ' + inr(c.opening) + '</div>' + foot(1, 1)] };
      }
      var statusTxt = c.closed ? (c.approved ? 'Locked & approved' : 'Closed · awaiting approval') : 'Open';
      var kpis = kpiRow([
        { label: 'Opening', value: inr(c.opening) }, { label: 'Cash Receipts', value: inr(c.cashIn) },
        { label: 'Cash Payments', value: inr(c.cashOut) }, { label: 'Expected Closing', value: inr(c.expected), hero: true },
        { label: 'Counted', value: inr(c.counted), sub: c.balanced ? 'Balanced' : inr(c.variance), subClass: c.balanced ? 'up' : 'down' }
      ], 5);
      // denomination table
      var denoRows = DEN.filter(function (d) { return (Number(c.physDeno[d]) || 0) || (Number(c.bankDeno[d]) || 0); }).map(function (d) {
        var pc = Number(c.physDeno[d]) || 0, bc = Number(c.bankDeno[d]) || 0;
        return { d: inr(d), pc: pc, pv: inr(d * pc), bc: bc, bv: inr(d * bc) };
      });
      var denoTbl = denoRows.length ? dataTable(
        [{ key: 'd', label: 'Denom' }, { key: 'pc', label: 'Phys count', align: 'r' }, { key: 'pv', label: 'Phys value', align: 'r' }, { key: 'bc', label: 'Bank count', align: 'r' }, { key: 'bv', label: 'Bank value', align: 'r' }],
        denoRows, { totals: { d: 'Total', pc: '', pv: inr(c.counted), bc: '', bv: inr(c.bankDep) } }) : '<div class="empty">No denominations counted</div>';
      function ledgerTbl(list, label) {
        if (!list.length) return '<div class="empty">No ' + label + ' today</div>';
        return dataTable([{ key: 'cat', label: 'Category' }, { key: 'desc', label: 'Description' }, { key: 'who', label: 'Vendor / Source' }, { key: 'amount', label: 'Amount ₹', align: 'r', fmt: inr }],
          list.map(function (x) { return { cat: esc(x.cat), desc: esc(x.desc || '—'), who: esc(x.who || '—'), amount: x.amount }; }),
          { totals: { cat: 'Total', desc: '', who: '', amount: inr(list.reduce(function (a, x) { return a + x.amount; }, 0)) } });
      }
      var recoCard = kvList([
        ['Expected closing cash', inr(c.expected), 'big'], ['Counted physical cash', inr(c.counted)],
        ['Variance', c.balanced ? '<span class="pill ok">₹0 · Balanced</span>' : '<span class="pill bad">' + inr(c.variance) + '</span>'],
        ['Deposited to bank', inr(c.bankDep)], ['Retained in drawer', inr(c.counted - c.bankDep)],
        ['Filled by', esc(c.filledBy || '—')], ['Approved by', esc(c.approvedBy || (c.closed ? 'Pending' : '—'))]
      ]);
      if (!c.balanced && c.mismatchReason) recoCard += '<div style="margin-top:8px;font-size:11px;color:var(--red)"><b>Mismatch reason:</b> ' + esc(c.mismatchReason) + '</div>';

      var page = lhead('DAILY CASH STATEMENT', 'Saagar Traders · Latur', longDate(date), { chip: statusTxt, chipClass: c.balanced && c.closed ? '' : 'draft' })
        + kpis
        + '<div class="grid">'
        + card('Denomination Count', null, { p0: true, html: denoTbl }, true)
        + card('Cash Receipts', { cls: 'ok', txt: inr(c.cashIn) }, { p0: true, html: ledgerTbl(c.receipts, 'receipts') })
        + card('Cash Payments', { cls: 'warn', txt: inr(c.cashOut) }, { p0: true, html: ledgerTbl(c.payments, 'payments') })
        + card('Reconciliation', c.balanced ? { cls: 'ok', txt: 'Balanced' } : { cls: 'bad', txt: 'Mismatch' }, recoCard, true)
        + '</div>'
        + '<div style="margin-top:8px;font-size:10px;color:#94a3b8">Card / UPI / Bank entries appear in the P&L, not in cash reconciliation.</div>'
        + foot(1, 1);
      return { orientation: 'portrait', pages: [page] };
    },

    /* ===== DAILY STOCK CLOSING REGISTER (landscape, 1 page per store) ===== */
    stockRegister: function (o) {
      var date = o.date || curDate();
      var stores = storeList().map(function (s) { return stockDetailStore(s, date); });
      var cols = [
        { key: 'brand', label: 'Brand' }, { key: 'sysOpen', label: 'Opening (sys)', align: 'r' }, { key: 'inward', label: 'Inward', align: 'r' },
        { key: 'grn', label: 'GRN', align: 'r' }, { key: 'outward', label: 'Outward', align: 'r' }, { key: 'sales', label: 'Sales', align: 'r' },
        { key: 'theft', label: 'Theft', align: 'r', fmt: function (v) { return v > 0 ? '<b style="color:#c0392b">' + v + '</b>' : '—'; } },
        { key: 'closingSys', label: 'Closing-Sys', align: 'r' }, { key: 'closingPhys', label: 'Closing-Phys', align: 'r', fmt: function (v) { return v == null ? '—' : v; } },
        { key: 'variance', label: 'Variance', align: 'r', fmt: function (v) { return v == null ? '—' : v === 0 ? '—' : '<b style="color:#c0392b">' + (v > 0 ? '+' : '') + v + '</b>'; } },
        { key: 'status', label: 'Status', align: 'c', fmt: function (v) { var c = v === 'OK' ? 'ok' : v === 'Mismatch' ? 'bad' : 'warn'; return '<span class="pill ' + c + '">' + v + '</span>'; } }
      ];
      var pages = stores.map(function (st, i) {
        var inner = lhead('STOCK CLOSING REGISTER', st.store + (st.code ? ' (' + st.code + ')' : ''), longDate(date), { chip: st.posted ? (st.closingLocked ? 'Closing locked' : 'Open') : 'Not posted', chipClass: st.posted ? '' : 'draft', addr: 'Daily inventory integrity — system vs physical' });
        if (!st.posted) return inner + '<div class="empty" style="margin-top:60px">' + esc(st.store) + ' stock not posted for this date.</div>' + foot(i + 1, stores.length);
        var T = st.totals, varBrands = st.rows.filter(function (r) { return r.variance != null && r.variance !== 0; }).length;
        inner += kpiRow([
          { label: 'Brands', value: num(st.rows.length) }, { label: 'Opening (sys)', value: num(T.sysOpen) },
          { label: 'Sales units', value: num(T.sales) }, { label: 'Theft units', value: num(T.theft), sub: T.theft > 0 ? 'flagged' : 'clean', subClass: T.theft > 0 ? 'down' : 'up', hero: true },
          { label: 'Variance brands', value: num(varBrands), sub: varBrands ? 'check' : 'none', subClass: varBrands ? 'down' : 'up' }
        ], 5);
        inner += dataTable(cols, st.rows, {
          totals: { brand: 'TOTAL (' + st.rows.length + ')', sysOpen: num(T.sysOpen), inward: num(T.inward), grn: num(T.grn), outward: num(T.outward), sales: num(T.sales), theft: num(T.theft), closingSys: num(T.closingSys), closingPhys: num(T.closingPhys), variance: '', status: '' }
        });
        return inner + foot(i + 1, stores.length);
      });
      return { orientation: 'landscape', pages: pages };
    },

    /* ===== DSR — DAILY SALES REGISTER (portrait) ===== */
    dsrRegister: function (o) {
      var date = o.date || curDate();
      var d = G('computeDsrDay', function () { return { staff: [], present: 0, salesAmt: 0, salesCnt: 0 }; })(date);
      var recs = [], pre = 'saagar_dsr_' + date + '_';
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(pre) === 0) { var r = J(k, {}) || {}; r.__name = r.staffName || k.slice(pre.length).replace(/_/g, ' '); recs.push(r); } }
      if (!d.present) return { orientation: 'portrait', pages: [lhead('DAILY SALES REGISTER', 'Saagar Traders · Latur', longDate(date)) + '<div class="empty" style="margin-top:60px">No sales register submitted for this date.</div>' + foot()] };
      var avg = d.salesCnt ? Math.round(d.salesAmt / d.salesCnt) : 0;
      var kpis = kpiRow([
        { label: 'Net Sales', value: inr(d.salesAmt), hero: true }, { label: 'Bills', value: num(d.salesCnt) },
        { label: 'Staff Present', value: num(d.present) },
        { label: 'Top Performer', value: esc((d.staff[0] && d.staff[0].name) || '—'), sub: d.staff[0] ? inr(d.staff[0].salesAmt) : '', subClass: 'neu' },
        { label: 'Avg / Bill', value: inr(avg) }
      ], 5);
      var staffRows = d.staff.map(function (s) { var r = recs.filter(function (x) { return x.__name === s.name; })[0] || {}; return { name: esc(s.name), role: esc(s.role || '—'), cnt: s.salesCnt, amt: inr(s.salesAmt), subm: r.submitted ? ('✓ ' + (r.submitTime || '')) : '✗' }; });
      var staffTbl = dataTable([{ key: 'name', label: 'Staff' }, { key: 'role', label: 'Role' }, { key: 'cnt', label: 'Bills', align: 'r' }, { key: 'amt', label: 'Sales ₹', align: 'r' }, { key: 'subm', label: 'Submitted', align: 'c' }], staffRows, { totals: { name: 'Total', role: '', cnt: num(d.salesCnt), amt: inr(d.salesAmt), subm: '' } });
      var bills = []; recs.forEach(function (r) { (Array.isArray(r.sales) ? r.sales : []).forEach(function (s) { var a = Number(s.amount) || 0; if (a > 0) bills.push({ billNo: esc(s.billNo || '—'), staff: esc(r.__name), product: esc(s.product || '—'), customer: esc(s.customer || '—'), source: (/qms/i.test(s.source || '') ? 'QMS' : 'Manual'), amount: a }); }); });
      var billTbl = bills.length ? dataTable([{ key: 'billNo', label: 'Bill No' }, { key: 'staff', label: 'Staff' }, { key: 'product', label: 'Product' }, { key: 'customer', label: 'Customer' }, { key: 'source', label: 'Source', align: 'c' }, { key: 'amount', label: 'Amount ₹', align: 'r', fmt: inr }], bills, { totals: { billNo: 'Total', staff: '', product: '', customer: '', source: '', amount: inr(bills.reduce(function (a, b) { return a + b.amount; }, 0)) } }) : '<div class="empty">No bills recorded</div>';
      var nps = []; recs.forEach(function (r) { (Array.isArray(r.nonpurch) ? r.nonpurch : []).forEach(function (n) { nps.push({ customer: esc(n.customer || n.name || '—'), mobile: esc(n.mobile || '—'), reason: esc(n.reason || '—') }); }); });
      var npTbl = nps.length ? dataTable([{ key: 'customer', label: 'Customer' }, { key: 'mobile', label: 'Mobile' }, { key: 'reason', label: 'Reason' }], nps) : '<div class="empty">No lost walk-ins logged</div>';
      var page = lhead('DAILY SALES REGISTER', 'Staff sales & activity · Latur', longDate(date)) + kpis
        + '<div class="grid">'
        + card('Staff Sales Summary', null, { p0: true, html: staffTbl }, true)
        + card('Bill-Level Detail', { cls: 'ok', txt: num(bills.length) + ' bills' }, { p0: true, html: billTbl }, true)
        + card('Lost Walk-ins (Non-Purchase)', nps.length ? { cls: 'warn', txt: num(nps.length) } : { cls: 'ok', txt: '0' }, { p0: true, html: npTbl }, true)
        + '</div>' + foot();
      return { orientation: 'portrait', pages: [page] };
    },

    /* ===== QMS — DAILY QUEUE & CONVERSION (landscape) ===== */
    qmsReport: function (o) {
      var date = o.date || curDate();
      var q = G('computeQmsDay', function () { return { byCro: [], total: 0 }; })(date);
      var st = J('retail_queue_management_v1', {}) || {}; var custs = Array.isArray(st.customers) ? st.customers : [], cros = Array.isArray(st.cros) ? st.cros : [];
      var nameOf = function (id) { var c = cros.filter(function (x) { return x.id === id; })[0]; return c ? c.name : 'Unassigned'; };
      var day = custs.filter(function (c) { return String(c.entryTime || '').slice(0, 10) === date; });
      if (!q.total) return { orientation: 'landscape', pages: [lhead('QUEUE & CONVERSION REPORT', 'Saagar Traders · Latur', longDate(date)) + '<div class="empty" style="margin-top:50px">No queue activity recorded for this date.</div>' + foot()] };
      var top = (q.byCro || []).slice().sort(function (a, b) { return (b.purchases / Math.max(1, b.walkins)) - (a.purchases / Math.max(1, a.walkins)); })[0];
      var kpis = kpiRow([
        { label: 'Walk-ins', value: num(q.total) }, { label: 'Purchases', value: num(q.purchases) },
        { label: 'Conversion', value: pct(q.conversion), hero: true }, { label: 'Sales ₹', value: inr(q.sales) },
        { label: 'Non-Purchase', value: num(q.nonPurchase) },
        { label: 'Top CRO', value: esc((top && top.cro) || '—'), sub: top ? pct(Math.round(top.purchases / Math.max(1, top.walkins) * 100)) : '', subClass: 'neu' }
      ], 6);
      var croRows = (q.byCro || []).map(function (c) { return { cro: esc(c.cro), walkins: c.walkins, purchases: c.purchases, conv: c.walkins ? Math.round(c.purchases / c.walkins * 100) + '%' : '—', sales: inr(c.sales), __flag: (c.walkins >= 3 && c.purchases / c.walkins < 0.2) }; });
      var croTbl = dataTable([{ key: 'cro', label: 'CRO' }, { key: 'walkins', label: 'Walk-ins', align: 'r' }, { key: 'purchases', label: 'Purchases', align: 'r' }, { key: 'conv', label: 'Conv %', align: 'r' }, { key: 'sales', label: 'Sales ₹', align: 'r' }], croRows, { totals: { cro: 'Total', walkins: num(q.total), purchases: num(q.purchases), conv: pct(q.conversion), sales: inr(q.sales) } });
      var lr = {}; day.filter(function (c) { return /non.?purchase/i.test(c.outcome || ''); }).forEach(function (c) { var k = c.lostReason || 'Not specified'; if (!lr[k]) lr[k] = { reason: k, count: 0, val: 0 }; lr[k].count++; lr[k].val += Number(c.lostValue) || 0; });
      var lrRows = Object.keys(lr).map(function (k) { return lr[k]; }).sort(function (a, b) { return b.count - a.count; }).map(function (x) { return { reason: esc(x.reason), count: x.count, val: inr(x.val) }; });
      var lrTbl = lrRows.length ? dataTable([{ key: 'reason', label: 'Reason' }, { key: 'count', label: 'Count', align: 'r' }, { key: 'val', label: 'Est. Lost ₹', align: 'r' }], lrRows) : '<div class="empty">No lost-sale reasons logged</div>';
      var pb = day.filter(function (c) { return c.outcome === 'Purchase'; }).map(function (c) { return { q: esc(c.queueNo || '—'), name: esc(c.name || '—'), bill: esc(c.billNo || '—'), cat: esc(c.purchaseCategory || '—'), pay: esc(c.paymentMode || '—'), cro: esc(nameOf(c.assignedCroId)), amt: inr(Number(c.purchaseAmount) || 0) }; });
      var pbTbl = pb.length ? dataTable([{ key: 'q', label: 'Queue' }, { key: 'name', label: 'Customer' }, { key: 'bill', label: 'Bill' }, { key: 'cat', label: 'Category' }, { key: 'pay', label: 'Pay' }, { key: 'cro', label: 'CRO' }, { key: 'amt', label: 'Amount ₹', align: 'r' }], pb, { totals: { q: 'Total', name: '', bill: '', cat: '', pay: '', cro: '', amt: inr(q.sales) } }) : '<div class="empty">No purchase bills</div>';
      var page = lhead('QUEUE & CONVERSION REPORT', 'Walk-in funnel · Latur', longDate(date)) + kpis
        + '<div class="grid">'
        + card('CRO Performance', null, { p0: true, html: croTbl })
        + card('Lost Sales — by reason', lrRows.length ? { cls: 'warn', txt: num(q.nonPurchase) } : { cls: 'ok', txt: '0' }, { p0: true, html: lrTbl })
        + card('Purchase Bills', { cls: 'ok', txt: num(pb.length) }, { p0: true, html: pbTbl }, true)
        + '</div>' + foot();
      return { orientation: 'landscape', pages: [page] };
    },

    /* ===== CRO — DAILY AUDIT SCORECARD (landscape) ===== */
    croAudit: function (o) {
      var date = o.date || curDate();
      var all = J('cro_audits_v3', []); var list = Array.isArray(all) ? all.filter(function (a) { return String(a.date || '').slice(0, 10) === date; }) : [];
      if (!list.length) return { orientation: 'landscape', pages: [lhead('CRO DAILY AUDIT SCORECARD', 'Saagar Traders · Latur', longDate(date)) + '<div class="empty" style="margin-top:50px">No CRO audits recorded for this date.</div>' + foot()] };
      var TASKS = [['t1', 'Open Stk'], ['t2', 'Display'], ['t3', 'Sale Rec'], ['t4', 'Non-Pur'], ['t5', 'NPS'], ['t6', 'Reviews'], ['t7', 'Mktg'], ['t8', 'Close Stk'], ['t9', 'Groom'], ['t10', 'Disc.']];
      function pts(a, t) { return (a.tasks && a.tasks[t] && a.tasks[t].pts != null) ? a.tasks[t].pts : 0; }
      var sm = list[0].sm || '', store = list[0].store || '';
      var avg = Math.round(list.reduce(function (s, a) { return s + (Number(a.total) || 0); }, 0) / list.length);
      var top = list.slice().sort(function (a, b) { return (Number(b.total) || 0) - (Number(a.total) || 0); })[0];
      var needs = list.filter(function (a) { return (Number(a.total) || 0) < 60; }).length;
      var groomAvg = Math.round(list.reduce(function (s, a) { return s + (Number(a.tasks && a.tasks.t9 && a.tasks.t9.groomingPct) || 0); }, 0) / list.length);
      var kpis = kpiRow([
        { label: 'CROs Audited', value: num(list.length) }, { label: 'Avg Score', value: avg + '/100', hero: true },
        { label: 'Top CRO', value: esc((top && top.cro) || '—'), sub: top ? (top.total + '/100') : '', subClass: 'up' },
        { label: 'Needs Attention', value: num(needs), sub: needs ? '< 60' : 'none', subClass: needs ? 'down' : 'up' },
        { label: 'Avg Grooming', value: groomAvg + '%' }
      ], 5);
      var sorted = list.slice().sort(function (a, b) { return (Number(b.total) || 0) - (Number(a.total) || 0); });
      var sumRows = sorted.map(function (a) { var weak = '—', low = 99; TASKS.forEach(function (t) { var p = pts(a, t[0]); if (p < low) { low = p; weak = t[1]; } }); return { cro: esc(a.cro), score: (Number(a.total) || 0) + '/100', grade: esc(a.grade || '—'), groom: ((a.tasks && a.tasks.t9 && a.tasks.t9.groomingPct) || 0) + '%', weak: weak + ' (' + low + ')', __flag: (Number(a.total) || 0) < 60 }; });
      var sumTbl = dataTable([{ key: 'cro', label: 'CRO' }, { key: 'score', label: 'Score', align: 'r' }, { key: 'grade', label: 'Grade' }, { key: 'groom', label: 'Grooming', align: 'r' }, { key: 'weak', label: 'Weakest Task' }], sumRows);
      var mcols = [{ key: 'cro', label: 'CRO' }].concat(TASKS.map(function (t) { return { key: t[0], label: t[1], align: 'r' }; })).concat([{ key: 'tot', label: 'Total', align: 'r' }]);
      var mrows = sorted.map(function (a) { var row = { cro: esc(a.cro), tot: (Number(a.total) || 0) }; TASKS.forEach(function (t) { row[t[0]] = pts(a, t[0]); }); return row; });
      var mtot = { cro: 'Avg' }; TASKS.forEach(function (t) { mtot[t[0]] = Math.round(mrows.reduce(function (s, r) { return s + r[t[0]]; }, 0) / mrows.length); }); mtot.tot = avg;
      var matrix = dataTable(mcols, mrows, { totals: mtot });
      var page = lhead('CRO DAILY AUDIT SCORECARD', (store || 'Saagar Traders') + ' · Auditor ' + esc(sm || '—'), longDate(date)) + kpis
        + '<div style="margin-top:14px">' + card('Scorecard Summary', needs ? { cls: 'bad', txt: needs + ' below 60' } : { cls: 'ok', txt: 'All passing' }, { p0: true, html: sumTbl }, true) + '</div>'
        + '<div style="margin-top:12px">' + card('Task Breakdown — points / 10', null, { p0: true, html: matrix }, true) + '</div>'
        + foot();
      return { orientation: 'landscape', pages: [page] };
    },

    /* ===== PAYROLL — SALARY REGISTER (landscape) ===== */
    payrollRegister: function (o) {
      var p = J('payroll_suite_v1_2026', {}) || {}, meta = p.meta || {}, rows = Array.isArray(p.rows) ? p.rows : [];
      var period = (meta.month || '') + ' ' + (meta.year || '');
      if (!rows.length) return { orientation: 'landscape', pages: [lhead('PAYROLL — SALARY REGISTER', 'Saagar Traders', period) + '<div class="empty" style="margin-top:50px">No employees in payroll.</div>' + foot()] };
      var T = { gross: 0, ot: 0, pt: 0, pf: 0, esic: 0, adv: 0, net: 0 };
      var rr = rows.map(function (r, i) {
        var gross = Number(r.grossPayable != null ? r.grossPayable : (r.gross || 0)) || 0, pt = Number(r.pt) || 0, pf = Number(r.pf) || 0, es = Number(r.esic) || 0, adv = Number(r.advance) || 0, net = Number(r.net != null ? r.net : (r.netPay || 0)) || 0;
        var ot = Math.max(0, Math.round(net + pt + pf + es + adv - gross)); // OT is in net but not in base gross → derive so Net = Gross+OT−deductions
        T.gross += gross; T.ot += ot; T.pt += pt; T.pf += pf; T.esic += es; T.adv += adv; T.net += net;
        return { sr: i + 1, empId: esc(r.empId || '—'), name: esc(r.name || '—'), desig: esc(r.designation || '—'), gross: inr(gross), ot: inr(ot), pt: inr(pt), pf: inr(pf), esic: inr(es), adv: inr(adv), net: inr(net) };
      });
      var status = (meta.run && meta.run.status) || ((p.runs && Object.keys(p.runs).length) ? 'locked' : 'draft'), locked = /lock/i.test(status);
      var kpis = kpiRow([
        { label: 'Employees', value: num(rows.length) }, { label: 'Gross + OT', value: inr(T.gross + T.ot) },
        { label: 'Total Deductions', value: inr(T.pt + T.pf + T.esic + T.adv) }, { label: 'Total Advance', value: inr(T.adv) },
        { label: 'Net Payable', value: inr(T.net), hero: true }
      ], 5);
      var tbl = dataTable([
        { key: 'sr', label: 'Sr', align: 'c' }, { key: 'empId', label: 'Emp ID' }, { key: 'name', label: 'Employee' }, { key: 'desig', label: 'Designation' },
        { key: 'gross', label: 'Gross', align: 'r' }, { key: 'ot', label: 'OT', align: 'r' }, { key: 'pt', label: 'PT', align: 'r' }, { key: 'pf', label: 'PF (EE)', align: 'r' }, { key: 'esic', label: 'ESIC (EE)', align: 'r' }, { key: 'adv', label: 'Advance', align: 'r' }, { key: 'net', label: 'Net Pay', align: 'r', cell: ' net' }
      ], rr, { totals: { sr: '', empId: '', name: 'TOTAL (' + rows.length + ')', desig: '', gross: inr(T.gross), ot: inr(T.ot), pt: inr(T.pt), pf: inr(T.pf), esic: inr(T.esic), adv: inr(T.adv), net: inr(T.net) } });
      var page = lhead('PAYROLL — SALARY REGISTER', 'Saagar Traders · Latur', period, { chip: locked ? '🔒 LOCKED — FINAL' : '⚠ DRAFT', chipClass: locked ? '' : 'draft', addr: 'Prepared by ' + esc(meta.preparedBy || '—') + ' · Approved by ' + esc(meta.approvedBy || '—') })
        + kpis + tbl
        + '<div class="statline"><span><b>Statutory (employee deductions):</b></span><span>PT <b>' + inr(T.pt) + '</b></span><span>PF (EE) <b>' + inr(T.pf) + '</b></span><span>ESIC (EE) <b>' + inr(T.esic) + '</b></span><span>Net paid to staff <b>' + inr(T.net) + '</b></span></div>'
        + '<div class="sign"><div class="sigbox"><div class="ln"></div>Prepared By<b>' + esc(meta.preparedBy || '—') + '</b></div><div class="sigbox"><div class="ln"></div>Checked By<b>' + esc(meta.checkedBy || '—') + '</b></div><div class="sigbox"><div class="ln"></div>For Saagar Traders<b>' + esc(meta.approvedBy || '—') + '</b></div></div>'
        + foot();
      return { orientation: 'landscape', pages: [page] };
    },

    /* ===== PAYROLL — SALARY SLIP (portrait, per employee) ===== */
    payrollSlip: function (o) {
      var p = J('payroll_suite_v1_2026', {}) || {}, meta = p.meta || {}, rows = Array.isArray(p.rows) ? p.rows : [];
      var r = o.empId ? rows.filter(function (x) { return x.empId === o.empId; })[0] : (o.empIndex != null ? rows[o.empIndex] : rows[0]);
      var period = (meta.month || '') + ' ' + (meta.year || '');
      if (!r) return { orientation: 'portrait', pages: [lhead('SALARY SLIP', 'Saagar Traders', period) + '<div class="empty" style="margin-top:60px">Employee not found.</div>' + foot()] };
      var gross = Number(r.grossPayable != null ? r.grossPayable : (r.gross || 0)) || 0, pt = Number(r.pt) || 0, pf = Number(r.pf) || 0, es = Number(r.esic) || 0, adv = Number(r.advance) || 0, net = Number(r.net != null ? r.net : 0) || 0, ded = pt + pf + es + adv, ot = Math.max(0, Math.round(net + ded - gross));
      var info = kvList([
        ['Employee', esc(r.name || '—')], ['Employee ID', esc(r.empId || '—')], ['Designation', esc(r.designation || '—')], ['Pay Period', period],
        ['Bank', esc(r.bankName || '—')], ['A/C No.', esc(r.accountNo || '—')], ['IFSC', esc(r.ifsc || '—')], ['Payment Mode', esc(r.paidMode || r.payMode || '—')],
        ['Days absent', num(r.absent || 0)], ['Half / Leave days', num(r.halfDay || 0) + ' / ' + num(r.leavesApplied || 0)]
      ]);
      var earn = kvList([['Gross Salary (payable)', inr(gross)], ['Overtime', inr(ot)], ['Total Earnings', inr(gross + ot), 'big']]);
      var dedB = kvList([['Professional Tax', inr(pt)], ['PF (Employee)', inr(pf)], ['ESIC (Employee)', inr(es)], ['Advance', inr(adv)], ['Total Deductions', inr(ded), 'big']]);
      var page = lhead('SALARY SLIP', 'Saagar Traders · Latur', 'For ' + period, { addr: 'Ref GM/SAL/' + (r.empId || '') + '/' + period })
        + '<div class="grid">' + card('Employee & Attendance', null, info, true)
        + card('Earnings', { cls: 'ok', txt: inr(gross + ot) }, earn) + card('Deductions', { cls: 'warn', txt: inr(ded) }, dedB) + '</div>'
        + '<div style="margin-top:16px;text-align:center;background:#0d2340;color:#fff;border-radius:12px;padding:16px"><div style="font-size:11px;letter-spacing:1px;opacity:.8">NET PAY (TAKE HOME)</div><div style="font-size:30px;font-weight:800;margin-top:4px" class="tnum">' + inr(net) + '</div></div>'
        + (r.salaryRemark ? '<div style="margin-top:10px;font-size:11px;color:#64748b">Remark: ' + esc(r.salaryRemark) + '</div>' : '')
        + (r.paidRef ? '<div style="margin-top:6px;font-size:11px;color:#64748b">Payment: ' + esc(r.paidMode || '') + ' · Ref ' + esc(r.paidRef) + (r.paidDate ? ' · ' + esc(r.paidDate) : '') + '</div>' : '')
        + '<div class="sign"><div class="sigbox"><div class="ln"></div>Employee<b>' + esc(r.name || '') + '</b></div><div class="sigbox"><div class="ln"></div>For Saagar Traders<b>' + esc(meta.approvedBy || 'Authorised') + '</b></div></div>'
        + foot();
      return { orientation: 'portrait', pages: [page] };
    },

    /* ===== LEAVE REGISTER (landscape, month) ===== */
    leaveRegister: function (o) {
      var month = o.month || curMonth();
      var d = J('leavedesk_v3', {}) || {}, by = (d && d.leaves) || {}, emps = Array.isArray(d.employees) ? d.employees : [];
      var empMap = {}; emps.forEach(function (e) { empMap[(e.name || '').toLowerCase()] = e; });
      var seen = {}, out = [];
      Object.keys(by).filter(function (dk) { return dk.slice(0, 7) === month; }).sort().forEach(function (dk) {
        var arr = by[dk]; if (!Array.isArray(arr)) return;
        arr.forEach(function (l) { if (!l || !l.name) return; var key = (l.name + '|' + (l.leaveFrom || dk) + '|' + (l.leaveTo || dk) + '|' + (l.type || '')).toLowerCase(); if (seen[key]) { seen[key].days++; return; } var lt = l.type === 'half_day_am' ? 'Half (AM)' : l.type === 'half_day_pm' ? 'Half (PM)' : 'Full day'; var rec = { name: l.name, type: lt, half: /half/i.test(lt), from: l.leaveFrom || dk, to: l.leaveTo || dk, category: l.category || '', reason: l.reason || '', approvedBy: l.approvedBy || '', days: 1 }; seen[key] = rec; out.push(rec); });
      });
      if (!out.length) return { orientation: 'landscape', pages: [lhead('LEAVE REGISTER', 'Saagar Traders', monthLong(month)) + '<div class="empty" style="margin-top:50px">No leave recorded for this month.</div>' + foot()] };
      var totDays = 0, full = 0, half = 0, names = {};
      var rr = out.map(function (r, i) { var ld = r.half ? r.days * 0.5 : r.days; totDays += ld; if (r.half) half++; else full++; names[r.name.toLowerCase()] = 1; var e = empMap[r.name.toLowerCase()] || {}; return { sr: i + 1, empId: esc(e.empId || '—'), name: esc(r.name), dept: esc(e.department || '—'), from: esc(r.from), to: esc(r.to), type: esc(r.type), days: r.days, ld: ld, cat: esc(r.category || '—'), reason: esc(r.reason || '—'), approvedBy: esc(r.approvedBy || '—') }; });
      var kpis = kpiRow([
        { label: 'Applications', value: num(out.length) }, { label: 'Leave Days (payroll)', value: totDays, hero: true },
        { label: 'Full-day', value: num(full) }, { label: 'Half-day', value: num(half) }, { label: 'Employees', value: num(Object.keys(names).length) }
      ], 5);
      var tbl = dataTable([
        { key: 'sr', label: 'Sr', align: 'c' }, { key: 'empId', label: 'Emp ID' }, { key: 'name', label: 'Employee' }, { key: 'dept', label: 'Dept' },
        { key: 'from', label: 'From' }, { key: 'to', label: 'To' }, { key: 'type', label: 'Type' }, { key: 'days', label: 'Days', align: 'r' }, { key: 'ld', label: 'Leave-Days', align: 'r' }, { key: 'cat', label: 'Category' }, { key: 'reason', label: 'Reason' }, { key: 'approvedBy', label: 'Approved By' }
      ], rr, { totals: { sr: '', empId: '', name: 'TOTAL (' + out.length + ')', dept: '', from: '', to: '', type: '', days: '', ld: totDays, cat: '', reason: '', approvedBy: '' } });
      return { orientation: 'landscape', pages: [lhead('LEAVE REGISTER', 'Saagar Traders · Latur', monthLong(month)) + kpis + tbl + foot()] };
    },

    /* ===== GROOMING — DAILY AUDIT (portrait) ===== */
    groomingDaily: function (o) {
      var date = o.date || curDate(); var g = G('computeGroomingDay', function () { return { checks: 0, pass: 0, avg: 0, list: [] }; })(date);
      var arr = J('saagar_grooming_' + date, []) || [];
      if (!g.checks) return { orientation: 'portrait', pages: [lhead('DAILY GROOMING AUDIT', 'Saagar Traders', longDate(date)) + '<div class="empty" style="margin-top:60px">No grooming audit recorded for this date.</div>' + foot()] };
      var perfect = arr.filter(function (r) { return Number(r.pct) === 100; }).length, below = arr.filter(function (r) { return (Number(r.pct) || 0) < 80; }).length;
      var kpis = kpiRow([
        { label: 'CROs Checked', value: num(g.checks) }, { label: 'Passed ≥80%', value: num(g.pass), subClass: 'up' },
        { label: 'Below 80%', value: num(below), subClass: below ? 'down' : 'up' }, { label: 'Perfect 100%', value: num(perfect) }, { label: 'Day Average', value: g.avg + '%', hero: true }
      ], 5);
      var rows = arr.slice().sort(function (a, b) { return (Number(a.pct) || 0) - (Number(b.pct) || 0); }).map(function (r) { var failed = (Array.isArray(r.items) ? r.items.filter(function (i) { return i && !i.passed; }).map(function (i) { return i.label; }) : []).filter(Boolean); return { name: esc(r.name || '—'), gender: r.gender === 'f' ? 'Female' : 'Male', pct: (Number(r.pct) || 0) + '%', passed: (r.checked != null ? r.checked : '—') + ' / ' + (r.total != null ? r.total : '—'), time: esc(r.time || '—'), failed: failed.length ? esc(failed.join(', ')) : 'All passed', __flag: (Number(r.pct) || 0) < 80 }; });
      var tbl = dataTable([{ key: 'name', label: 'CRO' }, { key: 'gender', label: 'Gender' }, { key: 'pct', label: 'Score', align: 'r' }, { key: 'passed', label: 'Passed', align: 'c' }, { key: 'time', label: 'Time' }, { key: 'failed', label: 'Failed Parameters' }], rows);
      return { orientation: 'portrait', pages: [lhead('DAILY GROOMING AUDIT', 'Titan World + Helios · Latur', longDate(date)) + kpis + '<div style="margin-top:14px">' + card('CRO Grooming Checks', below ? { cls: 'warn', txt: below + ' below 80%' } : { cls: 'ok', txt: 'All ≥80%' }, { p0: true, html: tbl }, true) + '</div>' + foot()] };
    },

    /* ===== GROOMING — MONTHLY TREND (portrait) ===== */
    groomingMonthly: function (o) {
      var month = o.month || curMonth(); var gm = G('computeGroomingMonth', function () { return { days: [], totalChecks: 0, avg: 0, daysWithData: 0 }; })(month);
      var cm = {};
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('saagar_grooming_' + month) === 0) { var arr = J(k, []); (Array.isArray(arr) ? arr : []).forEach(function (r) { var nm = (r.name || '').trim(); if (!nm) return; var key = nm.toLowerCase(); if (!cm[key]) cm[key] = { name: nm, gender: r.gender, sum: 0, n: 0, best: 0, low: 100, pass: 0 }; var pc = Number(r.pct) || 0; cm[key].sum += pc; cm[key].n++; cm[key].best = Math.max(cm[key].best, pc); cm[key].low = Math.min(cm[key].low, pc); if (pc >= 80) cm[key].pass++; }); } }
      var cros = Object.keys(cm).map(function (k) { var c = cm[k]; return { name: c.name, gender: c.gender, n: c.n, avg: Math.round(c.sum / c.n), best: c.best, low: c.low, cons: Math.round(c.pass / c.n * 100) }; }).sort(function (a, b) { return b.avg - a.avg; });
      if (!cros.length) return { orientation: 'portrait', pages: [lhead('MONTHLY GROOMING TREND', 'Saagar Traders', monthLong(month)) + '<div class="empty" style="margin-top:60px">No grooming audits recorded for this month.</div>' + foot()] };
      var best = cros[0];
      var kpis = kpiRow([
        { label: 'CROs', value: num(cros.length) }, { label: 'Check-ins', value: num(gm.totalChecks) }, { label: 'Month Average', value: gm.avg + '%', hero: true },
        { label: 'Best CRO', value: esc(best.name), sub: best.avg + '%', subClass: 'up' }, { label: 'Days Audited', value: num(gm.daysWithData) }
      ], 5);
      var rows = cros.map(function (c, i) { return { rank: i + 1, name: esc(c.name), gender: c.gender === 'f' ? 'F' : 'M', n: c.n, avg: c.avg + '%', best: c.best + '%', low: c.low + '%', cons: c.cons + '%', __flag: c.avg < 80 }; });
      var tbl = dataTable([{ key: 'rank', label: 'Rank', align: 'c' }, { key: 'name', label: 'CRO' }, { key: 'gender', label: 'G', align: 'c' }, { key: 'n', label: 'Check-ins', align: 'r' }, { key: 'avg', label: 'Avg', align: 'r' }, { key: 'best', label: 'Best', align: 'r' }, { key: 'low', label: 'Low', align: 'r' }, { key: 'cons', label: 'Consistency', align: 'r' }], rows);
      return { orientation: 'portrait', pages: [lhead('MONTHLY GROOMING TREND', 'Saagar Traders · Latur', monthLong(month)) + kpis + '<div style="margin-top:14px">' + card('CRO Leaderboard', null, { p0: true, html: tbl }, true) + '</div>' + '<div style="margin-top:10px;font-size:11px;color:#64748b">Month average ' + gm.avg + '% across ' + gm.totalChecks + ' check-ins · ' + gm.daysWithData + ' days audited.</div>' + foot()] };
    }
  };

  var META = {
    ownerBrief: { title: 'Daily Owner Brief', scope: 'daily', icon: '📊' },
    cashStatement: { title: 'Daily Cash Statement', scope: 'daily', icon: '💵' },
    stockRegister: { title: 'Stock Closing Register', scope: 'daily', icon: '📦' },
    dsrRegister: { title: 'Daily Sales Register (DSR)', scope: 'daily', icon: '🧾' },
    qmsReport: { title: 'Queue & Conversion (QMS)', scope: 'daily', icon: '🎯' },
    croAudit: { title: 'CRO Audit Scorecard', scope: 'daily', icon: '✅' },
    payrollRegister: { title: 'Payroll — Salary Register', scope: 'monthly', icon: '💼' },
    payrollSlip: { title: 'Payroll — Salary Slip', scope: 'monthly', icon: '🧾' },
    leaveRegister: { title: 'Leave Register', scope: 'monthly', icon: '🌴' },
    groomingDaily: { title: 'Grooming — Daily Audit', scope: 'daily', icon: '✨' },
    groomingMonthly: { title: 'Grooming — Monthly Trend', scope: 'monthly', icon: '📈' }
  };

  /* ---------- render: page HTML → html2canvas → jsPDF (one image per A4 page) ---------- */
  function pdfLib() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if (window.jsPDF) return window.jsPDF;
    return null;
  }
  function renderPages(pages, orientation) {
    var portrait = orientation !== 'landscape';
    var W = portrait ? 794 : 1123, H = portrait ? 1123 : 794;
    var JsPDF = pdfLib();
    if (!window.html2canvas || !JsPDF) return Promise.reject(new Error('PDF libs not loaded (html2canvas/jsPDF)'));
    var ifr = document.createElement('iframe');
    ifr.setAttribute('aria-hidden', 'true');
    ifr.style.cssText = 'position:fixed;left:-12000px;top:0;width:' + W + 'px;height:' + H + 'px;border:0;background:#fff;visibility:hidden';
    document.body.appendChild(ifr);
    var idoc = ifr.contentDocument || ifr.contentWindow.document;
    idoc.open(); idoc.write('<!doctype html><html><head><meta charset="utf-8"><style>' + CSS(W) + '</style></head><body></body></html>'); idoc.close();
    var pdf = new JsPDF({ unit: 'pt', format: 'a4', orientation: portrait ? 'portrait' : 'landscape', compress: true });
    var pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    var idx = 0;
    function step() {
      if (idx >= pages.length) { try { document.body.removeChild(ifr); } catch (e) {} return pdf.output('blob'); }
      idoc.body.innerHTML = '<div class="page' + (portrait ? '' : ' land') + '">' + pages[idx] + '</div>';
      var node = idoc.querySelector('.page');
      return sleep(70).then(function () {
        return window.html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true, width: W, windowWidth: W, height: node.scrollHeight, logging: false });
      }).then(function (canvas) {
        var data = canvas.toDataURL('image/jpeg', 0.92);
        var imgH = pw * canvas.height / canvas.width; // image height when scaled to page width
        if (idx > 0) pdf.addPage('a4', portrait ? 'portrait' : 'landscape');
        if (imgH <= ph + 2) {
          pdf.addImage(data, 'JPEG', 0, 0, pw, imgH, undefined, 'FAST'); // fits one page, top-aligned
        } else if (imgH <= ph * 1.12) {
          var sw = pw * (ph / imgH), sx = (pw - sw) / 2; // barely over → gentle ≤12% shrink to one page (no near-empty 2nd page)
          pdf.addImage(data, 'JPEG', sx, 0, sw, ph, undefined, 'FAST');
        } else {
          var slices = Math.ceil((imgH - 2) / ph); // genuinely long → slice into A4 pages 1:1 (no shrink)
          for (var s = 0; s < slices; s++) {
            if (s > 0) pdf.addPage('a4', portrait ? 'portrait' : 'landscape');
            pdf.addImage(data, 'JPEG', 0, -s * ph, pw, imgH, undefined, 'FAST'); // jsPDF clips to page bounds
          }
        }
        idx++; return step();
      });
    }
    return Promise.resolve().then(step);
  }

  /* ---------- public API ---------- */
  function buildModel(type, opts) {
    var b = BUILDERS[type]; if (!b) throw new Error('Unknown report: ' + type);
    return b(opts || {});
  }
  function filename(type, opts) {
    var d = (opts && opts.date) || curDate();
    return 'Saagar_' + type + '_' + d + '.pdf';
  }
  function shareBlob(blob, fname) {
    var c = (function () { try { return capsShare(); } catch (e) { return null; } })();
    if (c) {
      return new Promise(function (res) { var fr = new FileReader(); fr.onloadend = function () { res(String(fr.result).split(',')[1]); }; fr.readAsDataURL(blob); })
        .then(function (b64) { return c.FS.writeFile({ path: fname, data: b64, directory: 'CACHE' }); })
        .then(function () { return c.FS.getUri({ directory: 'CACHE', path: fname }); })
        .then(function (r) { return c.Share.share({ title: fname, text: 'Saagar Traders — ' + fname, files: [r.uri], dialogTitle: 'Share report via WhatsApp' }); })
        .then(function () { try { toast('Pick WhatsApp in the share menu'); } catch (e) {} })
        .catch(function (e) { var m = (e && e.message) || String(e); if (!/cancel/i.test(m)) { try { toast('Share failed: ' + m); } catch (_) {} } });
    }
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    try { toast('Report downloaded'); } catch (e) {}
    return Promise.resolve();
  }

  window.SaagarReport = {
    build: function (type, opts) { var m = buildModel(type, opts); return renderPages(m.pages, m.orientation); },
    generate: function (type, opts) {
      try { toast('Preparing report…'); } catch (e) {}
      var self = this;
      return new Promise(function (res) { setTimeout(res, 40); }).then(function () {
        return self.build(type, opts).then(function (blob) { return shareBlob(blob, filename(type, opts)); });
      }).catch(function (e) { try { toast('Could not build report: ' + (e && e.message || e)); } catch (_) {} });
    },
    list: function () { return Object.keys(META).map(function (k) { return { type: k, title: META[k].title, scope: META[k].scope, icon: META[k].icon }; }); },
    _buildModel: buildModel // for tests
  };
})();
