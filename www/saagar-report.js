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
  function expenseMonth(month) {
    var rows = J('gm_expenses', []); var inc = {}, exp = {}, incTot = 0, expTot = 0, firms = {};
    (Array.isArray(rows) ? rows : []).forEach(function (e) {
      if (!e || e.void) return; if (String(e.date || e.entryDate || e.expenseDate || '').slice(0, 7) !== month) return;
      var amt = Number(e.amount || e.total || 0) || 0, cat = e.category || 'Other';
      if (String(e.type || 'expense').toLowerCase() === 'income') { inc[cat] = (inc[cat] || 0) + amt; incTot += amt; }
      else { exp[cat] = (exp[cat] || 0) + amt; expTot += amt; var fk = e.firm || 'Unassigned'; if (!firms[fk]) firms[fk] = { firm: fk, amount: 0, count: 0 }; firms[fk].amount += amt; firms[fk].count++; }
    });
    return { inc: inc, exp: exp, incTot: incTot, expTot: expTot, net: incTot - expTot, firms: Object.keys(firms).map(function (k) { return firms[k]; }).sort(function (a, b) { return b.amount - a.amount; }) };
  }
  function monthQms(month) {
    var parts = String(month).split('-'), y = +parts[0], mo = +parts[1]; if (!y || !mo) return { sales: 0, purchases: 0, walkins: 0, conversion: 0 };
    var dim = new Date(y, mo, 0).getDate(), s = 0, p = 0, w = 0, fn = G('computeQmsDay', null);
    if (fn) for (var dd = 1; dd <= dim; dd++) { var q = fn(month + '-' + String(dd).padStart(2, '0')); s += q.sales || 0; p += q.purchases || 0; w += q.total || 0; }
    return { sales: s, purchases: p, walkins: w, conversion: w ? Math.round(p / w * 100) : 0 };
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
      var blocks = [{ t: 'header', title: 'STOCK CLOSING REGISTER', sub: 'Daily inventory integrity — system vs physical', period: longDate(date) }];
      stores.forEach(function (st, i) {
        if (i > 0) blocks.push({ t: 'spacer', h: 6 });
        blocks.push({ t: 'section', title: st.store + (st.code ? ' (' + st.code + ')' : ''), tag: st.posted ? (st.closingLocked ? { cls: 'ok', txt: 'Closing locked' } : { cls: 'warn', txt: 'Open' }) : { cls: 'bad', txt: 'Not posted' } });
        if (!st.posted) { blocks.push({ t: 'empty', text: st.store + ' stock not posted for this date.' }); return; }
        var T = st.totals, varBrands = st.rows.filter(function (r) { return r.variance != null && r.variance !== 0; }).length;
        blocks.push({ t: 'kpi', cols: 5, items: [
          { label: 'Brands', value: num(st.rows.length) },
          { label: 'Opening (sys)', value: num(T.sysOpen) },
          { label: 'Sales units', value: num(T.sales) },
          { label: 'Theft units', value: num(T.theft), sub: T.theft > 0 ? 'flagged' : 'clean', subClass: T.theft > 0 ? 'down' : 'up', hero: true },
          { label: 'Variance brands', value: num(varBrands), sub: varBrands ? 'check' : 'none', subClass: varBrands ? 'down' : 'up' }
        ] });
        blocks.push({ t: 'table',
          head: [['Brand', 'Open(sys)', 'Inward', 'GRN', 'Outward', 'Sales', 'Theft', 'Close-Sys', 'Close-Phys', 'Variance', 'Status']],
          body: st.rows.map(function (r) { return [trunc(r.brand, 22), num(r.sysOpen), num(r.inward), num(r.grn), num(r.outward), num(r.sales), r.theft > 0 ? num(r.theft) : '—', num(r.closingSys), r.closingPhys == null ? '—' : num(r.closingPhys), (r.variance == null || r.variance === 0) ? '—' : (r.variance > 0 ? '+' : '') + r.variance, r.status]; }),
          flagRows: st.rows.map(function (r) { return r.theft > 0 || (r.variance != null && r.variance !== 0); }),
          pills: [10],
          colStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 70, halign: 'right' }, 2: { cellWidth: 58, halign: 'right' }, 3: { cellWidth: 50, halign: 'right' }, 4: { cellWidth: 62, halign: 'right' }, 5: { cellWidth: 54, halign: 'right' }, 6: { cellWidth: 52, halign: 'right' }, 7: { cellWidth: 70, halign: 'right' }, 8: { cellWidth: 76, halign: 'right' }, 9: { cellWidth: 64, halign: 'right' }, 10: { cellWidth: 78, halign: 'center' } },
          foot: [['TOTAL (' + st.rows.length + ')', num(T.sysOpen), num(T.inward), num(T.grn), num(T.outward), num(T.sales), num(T.theft), num(T.closingSys), num(T.closingPhys), '', '']] });
      });
      return { orientation: 'landscape', blocks: blocks };
    },

    /* ===== DSR — DAILY SALES REGISTER (portrait) ===== */
    dsrRegister: function (o) {
      var date = o.date || curDate();
      var d = G('computeDsrDay', function () { return { staff: [], present: 0, salesAmt: 0, salesCnt: 0 }; })(date);
      var recs = [], pre = 'saagar_dsr_' + date + '_';
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(pre) === 0) { var r = J(k, {}) || {}; r.__name = r.staffName || k.slice(pre.length).replace(/_/g, ' '); recs.push(r); } }
      var hdr = { t: 'header', title: 'DAILY SALES REGISTER', sub: 'Staff sales & activity · Latur', period: longDate(date) };
      if (!d.present) return { orientation: 'portrait', blocks: [hdr, { t: 'empty', text: 'No sales register submitted for this date.' }] };
      var avg = d.salesCnt ? Math.round(d.salesAmt / d.salesCnt) : 0;
      var blocks = [hdr, { t: 'kpi', cols: 5, items: [
        { label: 'Net Sales', value: inr(d.salesAmt), hero: true },
        { label: 'Bills', value: num(d.salesCnt) },
        { label: 'Staff Present', value: num(d.present) },
        { label: 'Top Performer', value: (d.staff[0] && d.staff[0].name) || '—', sub: d.staff[0] ? inr(d.staff[0].salesAmt) : '' },
        { label: 'Avg / Bill', value: inr(avg) }
      ] }];
      blocks.push({ t: 'section', title: 'Staff Sales Summary' });
      blocks.push({ t: 'table',
        head: [['Staff', 'Role', 'Bills', 'Sales ₹', 'Submitted']],
        body: d.staff.map(function (s) { var r = recs.filter(function (x) { return x.__name === s.name; })[0] || {}; return [s.name, s.role || '—', num(s.salesCnt), inr(s.salesAmt), r.submitted ? ('Yes ' + (r.submitTime || '')) : '—']; }),
        money: [3],
        colStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 84 }, 2: { cellWidth: 48, halign: 'right' }, 3: { cellWidth: 90, halign: 'right' }, 4: { cellWidth: 96, halign: 'center' } },
        foot: [['Total', '', num(d.salesCnt), inr(d.salesAmt), '']] });
      var bills = []; recs.forEach(function (r) { (Array.isArray(r.sales) ? r.sales : []).forEach(function (s) { var a = Number(s.amount) || 0; if (a > 0) bills.push({ billNo: s.billNo || '—', staff: r.__name, product: s.product || '—', customer: s.customer || '—', source: (/qms/i.test(s.source || '') ? 'QMS' : 'Manual'), amount: a }); }); });
      var billSum = bills.reduce(function (a, b) { return a + b.amount; }, 0);
      blocks.push({ t: 'section', title: 'Bill-Level Detail', tag: { cls: 'ok', txt: num(bills.length) + ' bills' } });
      if (bills.length) {
        blocks.push({ t: 'table',
          head: [['Bill No', 'Staff', 'Product', 'Customer', 'Source', 'Amount ₹']],
          body: bills.map(function (b) { return [b.billNo, trunc(b.staff, 18), trunc(b.product, 26), trunc(b.customer, 22), b.source, inr(b.amount)]; }),
          raw: bills.map(function (b) { return [0, 0, 0, 0, 0, b.amount]; }),
          money: [5],
          colStyles: { 0: { cellWidth: 56 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 86 }, 4: { cellWidth: 50, halign: 'center' }, 5: { cellWidth: 80, halign: 'right' } },
          foot: [['Total', '', '', '', '', inr(billSum)]] });
      } else { blocks.push({ t: 'empty', text: 'No bills recorded.' }); }
      var nps = []; recs.forEach(function (r) { (Array.isArray(r.nonpurch) ? r.nonpurch : []).forEach(function (n) { nps.push({ customer: n.customer || n.name || '—', mobile: n.mobile || '—', reason: n.reason || '—' }); }); });
      blocks.push({ t: 'section', title: 'Lost Walk-ins (Non-Purchase)', tag: nps.length ? { cls: 'warn', txt: num(nps.length) } : { cls: 'ok', txt: '0' } });
      if (nps.length) { blocks.push({ t: 'table', head: [['Customer', 'Mobile', 'Reason']], body: nps.map(function (n) { return [trunc(n.customer, 30), n.mobile, trunc(n.reason, 44)]; }), colStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 96 }, 2: { cellWidth: 'auto' } } }); }
      else { blocks.push({ t: 'empty', text: 'No lost walk-ins logged.' }); }
      return { orientation: 'portrait', blocks: blocks };
    },

    /* ===== QMS — DAILY QUEUE & CONVERSION (landscape) ===== */
    qmsReport: function (o) {
      var date = o.date || curDate();
      var q = G('computeQmsDay', function () { return { byCro: [], total: 0 }; })(date);
      var st = J('retail_queue_management_v1', {}) || {}; var custs = Array.isArray(st.customers) ? st.customers : [], cros = Array.isArray(st.cros) ? st.cros : [];
      var nameOf = function (id) { var c = cros.filter(function (x) { return x.id === id; })[0]; return c ? c.name : 'Unassigned'; };
      var day = custs.filter(function (c) { return String(c.entryTime || '').slice(0, 10) === date; });
      var hdr = { t: 'header', title: 'QUEUE & CONVERSION REPORT', sub: 'Walk-in funnel · Latur', period: longDate(date) };
      if (!q.total) return { orientation: 'landscape', blocks: [hdr, { t: 'empty', text: 'No queue activity recorded for this date.' }] };
      var top = (q.byCro || []).slice().sort(function (a, b) { return (b.purchases / Math.max(1, b.walkins)) - (a.purchases / Math.max(1, a.walkins)); })[0];
      var blocks = [hdr, { t: 'kpi', cols: 6, items: [
        { label: 'Walk-ins', value: num(q.total) },
        { label: 'Purchases', value: num(q.purchases) },
        { label: 'Conversion', value: pct(q.conversion), hero: true },
        { label: 'Sales ₹', value: inr(q.sales) },
        { label: 'Non-Purchase', value: num(q.nonPurchase) },
        { label: 'Top CRO', value: (top && top.cro) || '—', sub: top ? pct(Math.round(top.purchases / Math.max(1, top.walkins) * 100)) : '' }
      ] }];
      var croFlags = [], croBody = (q.byCro || []).map(function (c, i) { croFlags[i] = (c.walkins >= 3 && c.purchases / c.walkins < 0.2); return [c.cro, num(c.walkins), num(c.purchases), (c.walkins ? Math.round(c.purchases / c.walkins * 100) + '%' : '—'), inr(c.sales)]; });
      blocks.push({ t: 'section', title: 'CRO Performance' });
      blocks.push({ t: 'table',
        head: [['CRO', 'Walk-ins', 'Purchases', 'Conv %', 'Sales ₹']],
        body: croBody, money: [4], flagRows: croFlags,
        colStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 96, halign: 'right' }, 2: { cellWidth: 96, halign: 'right' }, 3: { cellWidth: 84, halign: 'right' }, 4: { cellWidth: 130, halign: 'right' } },
        foot: [['Total', num(q.total), num(q.purchases), pct(q.conversion), inr(q.sales)]] });
      var lr = {}; day.filter(function (c) { return /non.?purchase/i.test(c.outcome || ''); }).forEach(function (c) { var k = c.lostReason || 'Not specified'; if (!lr[k]) lr[k] = { reason: k, count: 0, val: 0 }; lr[k].count++; lr[k].val += Number(c.lostValue) || 0; });
      var lrRows = Object.keys(lr).map(function (k) { return lr[k]; }).sort(function (a, b) { return b.count - a.count; });
      blocks.push({ t: 'section', title: 'Lost Sales — by reason', tag: lrRows.length ? { cls: 'warn', txt: num(q.nonPurchase) } : { cls: 'ok', txt: '0' } });
      if (lrRows.length) { blocks.push({ t: 'table', head: [['Reason', 'Count', 'Est. Lost ₹']], body: lrRows.map(function (x) { return [trunc(x.reason, 48), num(x.count), inr(x.val)]; }), money: [2], colStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 90, halign: 'right' }, 2: { cellWidth: 150, halign: 'right' } } }); }
      else { blocks.push({ t: 'empty', text: 'No lost-sale reasons logged.' }); }
      var pb = day.filter(function (c) { return c.outcome === 'Purchase'; }).map(function (c) { return { q: c.queueNo || '—', name: c.name || '—', bill: c.billNo || '—', cat: c.purchaseCategory || '—', pay: c.paymentMode || '—', cro: nameOf(c.assignedCroId), amt: Number(c.purchaseAmount) || 0 }; });
      var pbSum = pb.reduce(function (a, b) { return a + b.amt; }, 0);
      blocks.push({ t: 'section', title: 'Purchase Bills', tag: { cls: 'ok', txt: num(pb.length) } });
      if (pb.length) {
        blocks.push({ t: 'table',
          head: [['Queue', 'Customer', 'Bill', 'Category', 'Pay', 'CRO', 'Amount ₹']],
          body: pb.map(function (c) { return [c.q, trunc(c.name, 22), c.bill, trunc(c.cat, 18), trunc(c.pay, 12), trunc(c.cro, 18), inr(c.amt)]; }),
          raw: pb.map(function (c) { return [0, 0, 0, 0, 0, 0, c.amt]; }),
          money: [6],
          colStyles: { 0: { cellWidth: 50, halign: 'right' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 72 }, 3: { cellWidth: 104 }, 4: { cellWidth: 72 }, 5: { cellWidth: 112 }, 6: { cellWidth: 98, halign: 'right' } },
          foot: [['Total', '', '', '', '', '', inr(pbSum)]] });
      } else { blocks.push({ t: 'empty', text: 'No purchase bills.' }); }
      return { orientation: 'landscape', blocks: blocks };
    },

    /* ===== CRO — DAILY AUDIT SCORECARD (landscape) ===== */
    croAudit: function (o) {
      var date = o.date || curDate();
      var all = J('cro_audits_v3', []); var list = Array.isArray(all) ? all.filter(function (a) { return String(a.date || '').slice(0, 10) === date; }) : [];
      var hdr0 = { t: 'header', title: 'CRO DAILY AUDIT SCORECARD', sub: 'Saagar Traders · Latur', period: longDate(date) };
      if (!list.length) return { orientation: 'landscape', blocks: [hdr0, { t: 'empty', text: 'No CRO audits recorded for this date.' }] };
      var TASKS = [['t1', 'Open Stk'], ['t2', 'Display'], ['t3', 'Sale Rec'], ['t4', 'Non-Pur'], ['t5', 'NPS'], ['t6', 'Reviews'], ['t7', 'Mktg'], ['t8', 'Close Stk'], ['t9', 'Groom'], ['t10', 'Disc.']];
      function pts(a, t) { return (a.tasks && a.tasks[t] && a.tasks[t].pts != null) ? a.tasks[t].pts : 0; }
      var sm = list[0].sm || '', store = list[0].store || '';
      var avg = Math.round(list.reduce(function (s, a) { return s + (Number(a.total) || 0); }, 0) / list.length);
      var top = list.slice().sort(function (a, b) { return (Number(b.total) || 0) - (Number(a.total) || 0); })[0];
      var needs = list.filter(function (a) { return (Number(a.total) || 0) < 60; }).length;
      var groomAvg = Math.round(list.reduce(function (s, a) { return s + (Number(a.tasks && a.tasks.t9 && a.tasks.t9.groomingPct) || 0); }, 0) / list.length);
      var sorted = list.slice().sort(function (a, b) { return (Number(b.total) || 0) - (Number(a.total) || 0); });
      var blocks = [{ t: 'header', title: 'CRO DAILY AUDIT SCORECARD', sub: (store || 'Saagar Traders') + ' · Auditor ' + (sm || '—'), period: longDate(date) }];
      blocks.push({ t: 'kpi', cols: 5, items: [
        { label: 'CROs Audited', value: num(list.length) },
        { label: 'Avg Score', value: avg + '/100', hero: true },
        { label: 'Top CRO', value: (top && top.cro) || '—', sub: top ? (top.total + '/100') : '', subClass: 'up' },
        { label: 'Needs Attention', value: num(needs), sub: needs ? '< 60' : 'none', subClass: needs ? 'down' : 'up' },
        { label: 'Avg Grooming', value: groomAvg + '%' }
      ] });
      blocks.push({ t: 'section', title: 'Scorecard Summary', tag: needs ? { cls: 'bad', txt: needs + ' below 60' } : { cls: 'ok', txt: 'All passing' } });
      blocks.push({ t: 'table',
        head: [['CRO', 'Score', 'Grade', 'Grooming', 'Weakest Task']],
        body: sorted.map(function (a) { var weak = '—', low = 99; TASKS.forEach(function (t) { var p = pts(a, t[0]); if (p < low) { low = p; weak = t[1]; } }); return [a.cro, (Number(a.total) || 0) + '/100', a.grade || '—', ((a.tasks && a.tasks.t9 && a.tasks.t9.groomingPct) || 0) + '%', weak + ' (' + low + ')']; }),
        flagRows: sorted.map(function (a) { return (Number(a.total) || 0) < 60; }),
        colStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 70, halign: 'right' }, 2: { cellWidth: 70 }, 3: { cellWidth: 84, halign: 'right' }, 4: { cellWidth: 170 } } });
      blocks.push({ t: 'section', title: 'Task Breakdown — points / 10' });
      var mhead = ['CRO'].concat(TASKS.map(function (t) { return t[1]; })).concat(['Total']);
      var mcolStyles = { 0: { cellWidth: 86 } }; for (var ci = 1; ci <= 10; ci++) mcolStyles[ci] = { halign: 'right' }; mcolStyles[11] = { cellWidth: 50, halign: 'right' };
      var mtotRow = ['Avg']; TASKS.forEach(function (t) { mtotRow.push(String(Math.round(sorted.reduce(function (s, a) { return s + pts(a, t[0]); }, 0) / sorted.length))); }); mtotRow.push(String(avg));
      blocks.push({ t: 'table',
        head: [mhead],
        body: sorted.map(function (a) { var row = [a.cro]; TASKS.forEach(function (t) { row.push(num(pts(a, t[0]))); }); row.push(num(Number(a.total) || 0)); return row; }),
        flagRows: sorted.map(function (a) { return (Number(a.total) || 0) < 60; }),
        colStyles: mcolStyles,
        foot: [mtotRow] });
      return { orientation: 'landscape', blocks: blocks };
    },

    /* ===== PAYROLL — SALARY REGISTER (landscape) ===== */
    payrollRegister: function (o) {
      var p = J('payroll_suite_v1_2026', {}) || {}, meta = p.meta || {}, rows = Array.isArray(p.rows) ? p.rows : [];
      var period = (meta.month || '') + ' ' + (meta.year || '');
      if (!rows.length) return { orientation: 'landscape', blocks: [{ t: 'header', title: 'PAYROLL — SALARY REGISTER', sub: 'Saagar Traders · Latur', period: period }, { t: 'empty', text: 'No employees in payroll.' }] };
      var T = { gross: 0, ot: 0, pt: 0, pf: 0, esic: 0, adv: 0, net: 0 }, body = [], raw = [];
      rows.forEach(function (r, i) {
        var gross = Number(r.grossPayable != null ? r.grossPayable : (r.gross || 0)) || 0, pt = Number(r.pt) || 0, pf = Number(r.pf) || 0, es = Number(r.esic) || 0, adv = Number(r.advance) || 0, net = Number(r.net != null ? r.net : (r.netPay || 0)) || 0;
        var ot = Math.max(0, Math.round(net + pt + pf + es + adv - gross)); // OT is in net but not base gross → derive so Net = Gross+OT−deductions
        T.gross += gross; T.ot += ot; T.pt += pt; T.pf += pf; T.esic += es; T.adv += adv; T.net += net;
        body.push([String(i + 1), r.empId || '—', trunc(r.name || '—', 22), trunc(r.designation || '—', 16), inr(gross), inr(ot), inr(pt), inr(pf), inr(es), inr(adv), inr(net)]);
        raw.push([0, 0, 0, 0, gross, ot, pt, pf, es, adv, net]); // exact per-row numerics (OT rounded as printed) → Σraw == foot
      });
      var status = (meta.run && meta.run.status) || ((p.runs && Object.keys(p.runs).length) ? 'locked' : 'draft'), locked = /lock/i.test(status);
      var blocks = [{ t: 'header', title: 'PAYROLL — SALARY REGISTER', sub: 'Saagar Traders · Latur', period: period, chip: locked ? 'LOCKED — FINAL' : 'DRAFT', chipKind: locked ? 'locked' : 'draft' }];
      blocks.push({ t: 'kpi', cols: 5, items: [
        { label: 'Employees', value: num(rows.length) },
        { label: 'Gross + OT', value: inr(T.gross + T.ot) },
        { label: 'Total Deductions', value: inr(T.pt + T.pf + T.esic + T.adv) },
        { label: 'Total Advance', value: inr(T.adv) },
        { label: 'Net Payable', value: inr(T.net), hero: true }
      ] });
      blocks.push({ t: 'table',
        head: [['Sr', 'Emp ID', 'Employee', 'Designation', 'Gross', 'OT', 'PT', 'PF (EE)', 'ESIC', 'Advance', 'Net Pay']],
        body: body, raw: raw, money: [4, 5, 6, 7, 8, 9, 10],
        colStyles: { 0: { cellWidth: 24, halign: 'center' }, 1: { cellWidth: 56 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 92 }, 4: { cellWidth: 78, halign: 'right' }, 5: { cellWidth: 56, halign: 'right' }, 6: { cellWidth: 54, halign: 'right' }, 7: { cellWidth: 62, halign: 'right' }, 8: { cellWidth: 60, halign: 'right' }, 9: { cellWidth: 70, halign: 'right' }, 10: { cellWidth: 86, halign: 'right' } },
        foot: [['', '', 'TOTAL (' + rows.length + ')', '', inr(T.gross), inr(T.ot), inr(T.pt), inr(T.pf), inr(T.esic), inr(T.adv), inr(T.net)]] });
      blocks.push({ t: 'statline', spans: [['Statutory — PT', inr(T.pt)], ['PF (EE)', inr(T.pf)], ['ESIC (EE)', inr(T.esic)], ['Net paid to staff', inr(T.net)]] });
      blocks.push({ t: 'sign', boxes: [{ role: 'Prepared By', name: meta.preparedBy || '—' }, { role: 'Checked By', name: meta.checkedBy || '—' }, { role: 'For Saagar Traders', name: meta.approvedBy || '—' }] });
      return { orientation: 'landscape', blocks: blocks };
    },

    /* ===== PAYROLL — SALARY SLIP (portrait, per employee) ===== */
    payrollSlip: function (o) {
      var p = J('payroll_suite_v1_2026', {}) || {}, meta = p.meta || {}, rows = Array.isArray(p.rows) ? p.rows : [];
      var r = o.empId ? rows.filter(function (x) { return x.empId === o.empId; })[0] : (o.empIndex != null ? rows[o.empIndex] : rows[0]);
      var period = (meta.month || '') + ' ' + (meta.year || '');
      var hdr = { t: 'header', title: 'SALARY SLIP', sub: 'Saagar Traders · Latur', period: 'For ' + period };
      if (!r) return { orientation: 'portrait', blocks: [hdr, { t: 'empty', text: 'Employee not found.' }] };
      var gross = Number(r.grossPayable != null ? r.grossPayable : (r.gross || 0)) || 0, pt = Number(r.pt) || 0, pf = Number(r.pf) || 0, es = Number(r.esic) || 0, adv = Number(r.advance) || 0, net = Number(r.net != null ? r.net : 0) || 0, ded = pt + pf + es + adv, ot = Math.max(0, Math.round(net + ded - gross));
      var blocks = [hdr];
      blocks.push({ t: 'section', title: 'Employee & Attendance' });
      blocks.push({ t: 'kv', cols: 2, pairs: [
        ['Employee', r.name || '—'], ['Employee ID', r.empId || '—'], ['Designation', r.designation || '—'], ['Pay Period', period],
        ['Bank', r.bankName || '—'], ['A/C No.', r.accountNo || '—'], ['IFSC', r.ifsc || '—'], ['Payment Mode', r.paidMode || r.payMode || '—'],
        ['Days absent', num(r.absent || 0)], ['Half / Leave days', num(r.halfDay || 0) + ' / ' + num(r.leavesApplied || 0)]
      ] });
      blocks.push({ t: 'section', title: 'Earnings', tag: { cls: 'ok', txt: inr(gross + ot) } });
      blocks.push({ t: 'kv', cols: 2, pairs: [['Gross Salary (payable)', inr(gross)], ['Overtime', inr(ot)], ['Total Earnings', inr(gross + ot), 'big']] });
      blocks.push({ t: 'section', title: 'Deductions', tag: { cls: 'warn', txt: inr(ded) } });
      blocks.push({ t: 'kv', cols: 2, pairs: [['Professional Tax', inr(pt)], ['PF (Employee)', inr(pf)], ['ESIC (Employee)', inr(es)], ['Advance', inr(adv)], ['Total Deductions', inr(ded), 'big']] });
      blocks.push({ t: 'netbox', label: 'Net Pay (Take Home)', value: inr(net) });
      if (r.salaryRemark) blocks.push({ t: 'note', text: 'Remark: ' + r.salaryRemark });
      if (r.paidRef) blocks.push({ t: 'note', text: 'Payment: ' + (r.paidMode || '') + ' · Ref ' + r.paidRef + (r.paidDate ? ' · ' + r.paidDate : '') });
      blocks.push({ t: 'sign', boxes: [{ role: 'Employee', name: r.name || '' }, { role: 'For Saagar Traders', name: meta.approvedBy || 'Authorised' }] });
      return { orientation: 'portrait', blocks: blocks };
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
      var hdr = { t: 'header', title: 'LEAVE REGISTER', sub: 'Saagar Traders · Latur', period: monthLong(month) };
      if (!out.length) return { orientation: 'landscape', blocks: [hdr, { t: 'empty', text: 'No leave recorded for this month.' }] };
      var totDays = 0, full = 0, half = 0, names = {}, body = [], raw = [];
      out.forEach(function (r, i) { var ld = r.half ? r.days * 0.5 : r.days; totDays += ld; if (r.half) half++; else full++; names[r.name.toLowerCase()] = 1; var e = empMap[r.name.toLowerCase()] || {};
        body.push([String(i + 1), e.empId || '—', trunc(r.name, 20), trunc(e.department || '—', 12), r.from, r.to, r.type, num(r.days), fmtLD(ld), trunc(r.category || '—', 14), trunc(r.reason || '—', 26), trunc(r.approvedBy || '—', 16)]);
        raw.push([0, 0, 0, 0, 0, 0, 0, 0, ld, 0, 0, 0]); // leave-days fractional → float-exact carry
      });
      var blocks = [hdr, { t: 'kpi', cols: 5, items: [
        { label: 'Applications', value: num(out.length) },
        { label: 'Leave Days (payroll)', value: fmtLD(totDays), hero: true },
        { label: 'Full-day', value: num(full) },
        { label: 'Half-day', value: num(half) },
        { label: 'Employees', value: num(Object.keys(names).length) }
      ] }];
      blocks.push({ t: 'table',
        head: [['Sr', 'Emp ID', 'Employee', 'Dept', 'From', 'To', 'Type', 'Days', 'Leave-Days', 'Category', 'Reason', 'Appr. By']],
        body: body, raw: raw, money: [8], fmt: { 8: fmtLD },
        colStyles: { 0: { cellWidth: 22, halign: 'center' }, 1: { cellWidth: 52 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 64 }, 4: { cellWidth: 64 }, 5: { cellWidth: 64 }, 6: { cellWidth: 58 }, 7: { cellWidth: 40, halign: 'right' }, 8: { cellWidth: 64, halign: 'right' }, 9: { cellWidth: 74 }, 10: { cellWidth: 'auto' }, 11: { cellWidth: 80 } },
        foot: [['', '', 'TOTAL (' + out.length + ')', '', '', '', '', '', fmtLD(totDays), '', '', '']] });
      return { orientation: 'landscape', blocks: blocks };
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
    },

    /* ===== EXPENSE — MONTHLY P&L SUMMARY (portrait) ===== */
    expenseMonthly: function (o) {
      var month = o.month || curMonth(); var e = expenseMonth(month);
      if (!e.incTot && !e.expTot) return { orientation: 'portrait', pages: [lhead('MONTHLY EXPENSE & P&L', 'Saagar Traders', monthLong(month)) + '<div class="empty" style="margin-top:60px">No ledger entries for this month.</div>' + foot()] };
      var topExp = ''; var mv = 0; Object.keys(e.exp).forEach(function (k) { if (e.exp[k] > mv) { mv = e.exp[k]; topExp = k; } });
      var kpis = kpiRow([
        { label: 'Total Income', value: inr(e.incTot) }, { label: 'Total Expense', value: inr(e.expTot) },
        { label: 'Net P&L', value: inr(e.net), hero: true, subClass: e.net >= 0 ? 'up' : 'down', sub: e.net >= 0 ? 'profit' : 'loss' },
        { label: 'Net Margin', value: e.incTot ? Math.round(e.net / e.incTot * 100) + '%' : '—' }, { label: 'Top Expense', value: esc(topExp || '—') }
      ], 5);
      function catTbl(map, tot) { var arr = Object.keys(map).map(function (k) { return { k: k, v: map[k] }; }).sort(function (a, b) { return b.v - a.v; }); return arr.length ? dataTable([{ key: 'cat', label: 'Category' }, { key: 'amt', label: 'Amount ₹', align: 'r' }, { key: 'pc', label: '%', align: 'r' }], arr.map(function (x) { return { cat: esc(x.k), amt: inr(x.v), pc: tot ? Math.round(x.v / tot * 100) + '%' : '—' }; }), { totals: { cat: 'Total', amt: inr(tot), pc: '' } }) : '<div class="empty">None</div>'; }
      var firmTbl = e.firms.length ? dataTable([{ key: 'firm', label: 'Firm / Store' }, { key: 'count', label: 'Entries', align: 'r' }, { key: 'amount', label: 'Expense ₹', align: 'r', fmt: inr }], e.firms.map(function (f) { return { firm: esc(f.firm), count: f.count, amount: f.amount }; }), { totals: { firm: 'Total', count: '', amount: inr(e.expTot) } }) : '<div class="empty">—</div>';
      var page = lhead('MONTHLY EXPENSE & P&L', 'Saagar Traders · Latur', monthLong(month)) + kpis
        + '<div class="grid">'
        + card('Income by Category', { cls: 'ok', txt: inr(e.incTot) }, { p0: true, html: catTbl(e.inc, e.incTot) })
        + card('Expense by Category', { cls: 'warn', txt: inr(e.expTot) }, { p0: true, html: catTbl(e.exp, e.expTot) })
        + card('Expense by Firm / Store', null, { p0: true, html: firmTbl }, true)
        + '</div>' + foot();
      return { orientation: 'portrait', pages: [page] };
    },

    /* ===== TAX — COMPLIANCE DUE REPORT (portrait) ===== */
    taxReport: function (o) {
      var t = G('computeTaxStatus', function () { return { overdue: 0, dueWeek: 0, dueMonth: 0, done: 0, upcoming: [] }; })();
      var kpis = kpiRow([
        { label: 'Overdue', value: num(t.overdue), hero: true, subClass: t.overdue ? 'down' : 'up', sub: t.overdue ? 'act now' : 'clear' },
        { label: 'Due This Week', value: num(t.dueWeek) }, { label: 'Due This Month', value: num(t.dueMonth) },
        { label: 'Completed', value: num(t.done), subClass: 'up' }, { label: 'Upcoming', value: num((t.upcoming || []).length) }
      ], 5);
      var rows = (t.upcoming || []).slice(0, 40).map(function (u) { return { firm: esc(u.firm), item: esc(u.item), due: esc(u.due), status: u.status, __flag: u.status === 'Overdue' }; });
      var tbl = rows.length ? dataTable([{ key: 'firm', label: 'Firm' }, { key: 'item', label: 'Compliance Item' }, { key: 'due', label: 'Due Date', align: 'r' }, { key: 'status', label: 'Status', align: 'c', fmt: function (v) { var c = v === 'Overdue' ? 'bad' : v === 'This week' ? 'warn' : 'ok'; return '<span class="pill ' + c + '">' + v + '</span>'; } }], rows) : '<div class="empty">No upcoming compliance items.</div>';
      var page = lhead('TAX COMPLIANCE — DUE REPORT', 'Saagar Traders · Latur', longDate(curDate())) + kpis
        + '<div style="margin-top:14px">' + card('Upcoming & Overdue Filings', t.overdue ? { cls: 'bad', txt: t.overdue + ' overdue' } : { cls: 'ok', txt: 'On track' }, { p0: true, html: tbl }, true) + '</div>' + foot();
      return { orientation: 'portrait', pages: [page] };
    },

    /* ===== SERVICE — OPEN CASES AGING (portrait) ===== */
    serviceAging: function (o) {
      var a = G('computeServiceAging', function () { return { totalOpen: 0, b0_3: 0, b4_7: 0, b8_15: 0, b16: 0 }; })();
      var arr = J('saagar_wsf_v2', []); var closedW = ['delivered', 'closed', 'complete', 'completed', 'cancelled', 'canceled'];
      var open = (Array.isArray(arr) ? arr : []).filter(function (j) { var s = String(j.status || j.stage || '').toLowerCase(); return !closedW.some(function (w) { return s.indexOf(w) >= 0; }); });
      var now = Date.now();
      open.forEach(function (j) { var ds = String(j.bookingDate || j.dateRec || j.date || j.createdAt || '').slice(0, 10); var dt = ds ? new Date(ds) : null; j.__days = dt && !isNaN(+dt) ? Math.max(0, Math.round((now - +dt) / 86400000)) : 0; j.__date = ds; });
      open.sort(function (x, y) { return y.__days - x.__days; });
      var hdr = { t: 'header', title: 'SERVICE — OPEN CASES AGING', sub: 'Watch Service · Latur', period: longDate(curDate()) };
      var blocks = [hdr, { t: 'kpi', cols: 5, items: [
        { label: 'Total Open', value: num(a.totalOpen), hero: true },
        { label: '0–3 days', value: num(a.b0_3) },
        { label: '4–7 days', value: num(a.b4_7) },
        { label: '8–15 days', value: num(a.b8_15) },
        { label: '16+ days', value: num(a.b16), subClass: a.b16 ? 'down' : 'up', sub: a.b16 ? 'overdue' : 'ok' }
      ] }];
      blocks.push({ t: 'section', title: 'Open Cases (oldest first)', tag: a.b16 ? { cls: 'bad', txt: a.b16 + ' aged 16d+' } : { cls: 'ok', txt: 'none aged' } });
      if (!open.length) { blocks.push({ t: 'empty', text: 'No open service cases — all delivered.' }); return { orientation: 'portrait', blocks: blocks }; }
      blocks.push({ t: 'table',
        head: [['Order No', 'Customer', 'Watch', 'Received', 'Age (days)', 'Status']],
        body: open.map(function (j) { return [j.id || '—', trunc(j.custName || j.customer || j.name || '—', 24), trunc([j.brand, j.model].filter(Boolean).join(' ') || j.item || '—', 26), j.__date || '—', num(j.__days), j.status || 'open']; }),
        flagRows: open.map(function (j) { return j.__days > 15; }),
        pills: [5],
        colStyles: { 0: { cellWidth: 78 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 78, halign: 'right' }, 4: { cellWidth: 68, halign: 'right' }, 5: { cellWidth: 92, halign: 'center' } } });
      return { orientation: 'portrait', blocks: blocks };
    },

    /* ===== SERVICE — JOB CARD (portrait, per case) ===== */
    serviceJobCard: function (o) {
      var arr = J('saagar_wsf_v2', []); arr = Array.isArray(arr) ? arr : [];
      var j = o.id ? arr.filter(function (x) { return x.id === o.id; })[0] : (arr.filter(function (x) { return String(x.status || '').toLowerCase() !== 'closed'; })[0] || arr[0]);
      if (!j) return { orientation: 'portrait', pages: [lhead('WATCH SERVICE — JOB CARD', 'Saagar Traders', longDate(curDate())) + '<div class="empty" style="margin-top:60px">No service cases.</div>' + foot()] };
      var info = kvList([['Service Order', esc(j.id || '—')], ['Date Received', esc(j.dateRec || '—')], ['Advisor', esc(j.advisor || '—')], ['Expected Delivery', esc(j.expDel || '—')], ['Status', esc(j.status || 'open')]]);
      var cust = kvList([['Customer', esc(j.custName || '—')], ['Mobile', esc(j.custMobile || '—')], ['Email', esc(j.custEmail || '—')]]);
      var watch = kvList([['Brand', esc(j.brand || '—')], ['Model', esc(j.model || '—')], ['Reference No', esc(j.refNo || '—')], ['Serial No', esc(j.serialNo || '—')]]);
      var items = Array.isArray(j.lineItems) ? j.lineItems.filter(function (l) { return l && (l.desc || l.description); }) : [];
      var itemTbl = items.length ? dataTable([{ key: 'd', label: 'Description' }, { key: 'q', label: 'Qty', align: 'r' }, { key: 'u', label: 'Unit ₹', align: 'r' }, { key: 't', label: 'Total ₹', align: 'r' }], items.map(function (l) { return { d: esc(l.desc || l.description || '—'), q: l.qty || 1, u: inr(l.unit || 0), t: inr(l.total || 0) }; }), { totals: { d: 'Total Estimate', q: '', u: '', t: inr(j.estTotal || 0) } }) : '<div style="padding:11px 13px">Estimated Total: <b>' + inr(j.estTotal || 0) + '</b></div>';
      var page = lhead('WATCH SERVICE — JOB CARD', 'Service Order ' + esc(j.id || ''), longDate(j.dateRec || curDate()))
        + '<div class="grid">' + card('Case', null, info) + card('Customer', null, cust) + card('Watch Details', null, watch, true)
        + card('Estimate', { cls: 'ok', txt: inr(j.estTotal || 0) }, { p0: !!items.length, html: itemTbl }, true) + '</div>'
        + (j.diagnosis ? '<div style="margin-top:12px;font-size:11.5px"><b>Diagnosis:</b> ' + esc(j.diagnosis) + '</div>' : '')
        + '<div class="sign"><div class="sigbox"><div class="ln"></div>Customer Signature<b>' + esc(j.custName || '') + '</b></div><div class="sigbox"><div class="ln"></div>For Saagar Traders<b>' + esc(j.advisor || 'Authorised') + '</b></div></div>'
        + foot();
      return { orientation: 'portrait', pages: [page] };
    },

    /* ===== ⭐ OWNER MONTHLY BRIEF (portrait) ===== */
    ownerMonthly: function (o) {
      var month = o.month || curMonth();
      var e = expenseMonth(month), pay = G('computePayrollSummary', function () { return {}; })(), qm = monthQms(month);
      var gm = G('computeGroomingMonth', function () { return { avg: 0, totalChecks: 0, daysWithData: 0 }; })(month), ca = G('computeCroAuditMonth', function () { return { avg: 0, totalAudits: 0 }; })(month);
      var aging = G('computeServiceAging', function () { return { totalOpen: 0, b16: 0 }; })(), tax = G('computeTaxStatus', function () { return { overdue: 0, dueWeek: 0 }; })();
      var perf = (function () { try { return computeEmployeePerformance(month) || []; } catch (e) { return []; } })();
      var grossPay = Number(pay.gross) || 0;
      var opSurplus = qm.sales - e.expTot - grossPay; // revenue = actual retail sales (QMS), not the partial expense-ledger income
      var flags = [];
      if (opSurplus < 0) flags.push('<b>Costs exceed sales</b> — operating surplus ' + inr(opSurplus));
      if (qm.walkins >= 50 && qm.conversion < 25) flags.push('<b>Low monthly conversion</b> ' + qm.conversion + '%');
      if (tax.overdue > 0) flags.push('<b>' + tax.overdue + ' overdue tax filing(s)</b>');
      if (aging.b16 > 0) flags.push('<b>' + aging.b16 + ' service cases aged 16+ days</b>');
      if (gm.avg && gm.avg < 80) flags.push('<b>Grooming avg ' + gm.avg + '%</b> below standard');
      if (qm.sales && grossPay / qm.sales > 0.4) flags.push('<b>Payroll ' + Math.round(grossPay / qm.sales * 100) + '% of sales</b> — high cost ratio');
      var kpis = kpiRow([
        { label: 'Retail Sales', value: inr(qm.sales), hero: true }, { label: 'Conversion', value: pct(qm.conversion) },
        { label: 'Op. Surplus', value: inr(opSurplus), subClass: opSurplus >= 0 ? 'up' : 'down', sub: opSurplus >= 0 ? 'positive' : 'negative' },
        { label: 'Payroll (gross)', value: inr(grossPay) }, { label: 'Grooming avg', value: (gm.avg || 0) + '%' }, { label: 'Tax overdue', value: num(tax.overdue) }
      ], 6);
      var pnl = kvList([['Retail sales (QMS)', inr(qm.sales)], ['Ledger expenses', inr(e.expTot)], ['Payroll (gross)', inr(grossPay)], ['Operating surplus', inr(opSurplus), 'big'], ['Payroll % of sales', qm.sales ? Math.round(grossPay / qm.sales * 100) + '%' : '—']]);
      var sales = kvList([['Walk-ins (month)', num(qm.walkins)], ['Purchases', num(qm.purchases)], ['Conversion', pct(qm.conversion)], ['QMS sales ₹', inr(qm.sales)]]);
      var staff = kvList([['Headcount', num(pay.headcount || 0)], ['Payroll gross', inr(pay.gross || 0)], ['Payroll net', inr(pay.net || 0)], ['Payroll run', esc(pay.status || 'draft')], ['Grooming avg', (gm.avg || 0) + '% (' + gm.totalChecks + ' checks)'], ['CRO audit avg', (ca.avg || 0) + '/100 (' + ca.totalAudits + ' audits)']]);
      var svc = kvList([['Open service cases', num(aging.totalOpen)], ['Aged 16+ days', (aging.b16 || 0) > 0 ? '<span class="pill bad">' + aging.b16 + '</span>' : '0'], ['Tax overdue', (tax.overdue || 0) > 0 ? '<span class="pill bad">' + tax.overdue + '</span>' : '0'], ['Tax due this week', num(tax.dueWeek)]]);
      var topPerf = perf.slice(0, 8).map(function (r) { return { name: esc(r.name), firm: esc(r.firm || r.role || '—'), groom: (r.groomChecks ? r.groomPct + '%' : '—'), service: num(r.serviceJobs || 0), cash: num(r.cashStatements || 0) }; });
      var perfTbl = topPerf.length ? dataTable([{ key: 'name', label: 'Employee' }, { key: 'firm', label: 'Role / Firm' }, { key: 'groom', label: 'Grooming', align: 'r' }, { key: 'service', label: 'Service jobs', align: 'r' }, { key: 'cash', label: 'Cash sheets', align: 'r' }], topPerf) : '<div class="empty">No staff performance data.</div>';
      var page = lhead('OWNER MONTHLY BRIEF', 'Titan World + Helios · Latur', monthLong(month)) + attn(flags) + kpis
        + '<div class="grid">'
        + card('Profit & Loss', opSurplus >= 0 ? { cls: 'ok', txt: 'Surplus' } : { cls: 'bad', txt: 'Deficit' }, pnl)
        + card('Sales & Conversion', null, sales)
        + card('Staff & Quality', null, staff)
        + card('Service & Compliance', ((aging.b16 || 0) > 0 || (tax.overdue || 0) > 0) ? { cls: 'bad', txt: 'Action' } : { cls: 'ok', txt: 'Clear' }, svc)
        + card('Staff Performance — top contributors', null, { p0: true, html: perfTbl }, true)
        + '</div>' + foot();
      return { orientation: 'portrait', pages: [page] };
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
    groomingMonthly: { title: 'Grooming — Monthly Trend', scope: 'monthly', icon: '📈' },
    expenseMonthly: { title: 'Monthly Expense & P&L', scope: 'monthly', icon: '📒' },
    taxReport: { title: 'Tax Compliance — Due Report', scope: 'monthly', icon: '⚖️' },
    serviceAging: { title: 'Service — Open Cases Aging', scope: 'daily', icon: '🛠️' },
    serviceJobCard: { title: 'Service — Job Card', scope: 'daily', icon: '📋' },
    ownerMonthly: { title: 'Owner Monthly Brief', scope: 'monthly', icon: '📊' }
  };

  /* ============================================================================
     R6 — NATIVE VECTOR TEXT ENGINE  (jsPDF + jspdf-autotable)
     Builders that return { orientation, blocks:[...] } render here (crisp, small,
     selectable, row-safe pagination). Legacy renderPages() below still serves
     builders that still return { pages:[html] } — dual-path in SaagarReport.build.
     ============================================================================ */
  function renderCompress(){ try { return !(window.__R6_TEST_NOCOMPRESS); } catch (e) { return true; } }

  var PAL = {
    NAVY:[13,35,64], NAVY2:[19,50,92], GOLD:[184,146,58], INK:[26,36,51],
    MUT:[100,116,139], LINE:[227,232,240], BG:[247,249,252],
    WHITE:[255,255,255], FOOT:[110,124,148],
    GREEN:[27,143,90], AMBER:[183,121,31], RED:[192,57,43],
    OK_FILL:[224,242,231], WARN_FILL:[253,239,214], BAD_FILL:[251,228,224],
    ZEBRA:[237,241,247], TOTAL_FILL:[235,240,247], FLAG_FILL:[252,231,227],
    SECTION_FILL:[238,243,250], KPI_HERO_LAB:[200,212,232], KPI_HERO_SUB:[150,224,188]
  };
  var FZ = {
    brandMain:18, brandSub:7, addr:9, rTitle:12, rSub:9, rgen:8,
    sectionTitle:9.5, headerRow:8.5, tableBody:9.5,
    kpiLabel:7.5, kpiValue:15, kpiValueMin:10, kpiSub:8,
    attnHead:9.5, attnItem:9.5, kv:9.5, kvBig:11,
    statline:9, netLabel:11, netValue:28, sign:9, footer:8.5, note:8, empty:11, carry:9
  };
  function freshAT(){
    return {
      styles:{ font:'DMSans', fontSize:FZ.tableBody, cellPadding:{ top:3.5, right:3.5, bottom:3.5, left:4 }, textColor:PAL.INK, lineColor:PAL.LINE, lineWidth:0.5, overflow:'linebreak', valign:'top' },
      headStyles:{ font:'DMSans', fontStyle:'bold', fillColor:PAL.NAVY, textColor:PAL.WHITE, fontSize:FZ.headerRow, halign:'left', lineColor:PAL.NAVY, lineWidth:0, valign:'middle' },
      bodyStyles:{ fillColor:PAL.WHITE },
      alternateRowStyles:{ fillColor:PAL.ZEBRA },
      footStyles:{ font:'DMSans', fontStyle:'bold', fillColor:PAL.TOTAL_FILL, textColor:PAL.NAVY, lineColor:PAL.NAVY, lineWidth:0, halign:'right' },
      theme:'grid'
    };
  }
  function _fill(d,c){ d.setFillColor(c[0],c[1],c[2]); }
  function _stroke(d,c){ d.setDrawColor(c[0],c[1],c[2]); }
  function _txt(d,c){ d.setTextColor(c[0],c[1],c[2]); }
  function _setf(d,style,size){ d.setFont('DMSans', style||'normal'); d.setFontSize(size); }
  function _up(s){ return String(s==null?'':s).toUpperCase(); }
  function subColor(cls){ return cls==='up'?PAL.GREEN : (cls==='down'?PAL.RED : PAL.MUT); }
  function genLine(){ return (ownerNm()? 'Prepared for '+ownerNm()+' · ':'') + 'Generated '+stamp(); }

  var SAN = {
    text: function(s){ return String(s==null?'':s)
        .replace(/[\u{1F000}-\u{1FAFF}]/gu,'').replace(/[\u{2600}-\u{27BF}]/gu,'')
        .replace(/[✅⛔✔✖✗️⭐]/g,'')
        .replace(/≥/g,'>=').replace(/≤/g,'<=').replace(/…/g,'...')
        .replace(/\s+/g,' ').trim(); },
    flags: function(arr){ return (arr||[]).map(SAN.text).filter(Boolean); }
  };
  function setFonts(doc){
    doc.setFont('DMSans','normal');
    var fl = doc.getFontList();
    if(!(fl.DMSans && fl.DMSans.indexOf('normal')>=0 && fl.DMSans.indexOf('bold')>=0))
      throw new Error('R6 fatal: DMSans normal+bold not registered — rupee/bold would corrupt');
  }

  /* ---- running header / footer (idempotent per page) ---- */
  function drawChip(doc, x, yTop, label, kind){
    label = SAN.text(label); _setf(doc,'bold',8);
    var w = doc.getTextWidth(label) + (kind==='locked'?20:9) + 7, h=15;
    var f = kind==='draft'?PAL.AMBER : (kind==='ok'?PAL.GREEN : PAL.NAVY);
    _fill(doc,f); doc.roundedRect(x, yTop, w, h, 4,4,'F');
    var tx = x + (kind==='locked'?20:8);
    if(kind==='locked'){
      _fill(doc,PAL.WHITE); doc.rect(x+7, yTop+7, 7,5,'F');
      _stroke(doc,PAL.WHITE); doc.setLineWidth(1);
      doc.line(x+8.5,yTop+7,x+8.5,yTop+5); doc.line(x+8.5,yTop+5,x+12,yTop+5); doc.line(x+12,yTop+5,x+12,yTop+7);
    }
    _txt(doc,PAL.WHITE); _setf(doc,'bold',8); doc.text(label, tx, yTop+10.4);
    return x+w;
  }
  function drawRunningHeader(doc, pageW, M, hdr, cont){
    var L=M.left, R=pageW-M.right;
    _setf(doc,'bold',FZ.brandMain); _txt(doc,PAL.NAVY); doc.text('Saagar Traders', L, 44);
    _setf(doc,'bold',FZ.brandSub); _txt(doc,PAL.GOLD); doc.text('BUSINESS CONTROL CENTRE', L, 54, {charSpace:0.8});
    if(hdr.addr){ _setf(doc,'normal',FZ.addr); _txt(doc,PAL.MUT); doc.text(SAN.text(hdr.addr), L, 66); }
    else if(hdr.chip){ drawChip(doc, L, 60, hdr.chip, hdr.chipKind); }
    _txt(doc,PAL.NAVY); _setf(doc,'bold',FZ.rTitle);
    doc.text(SAN.text(hdr.title||'') + (cont?'  (continued)':''), R, 40, {align:'right'});
    if(hdr.sub){ _setf(doc,'normal',FZ.rSub); _txt(doc,PAL.MUT); doc.text(SAN.text(hdr.sub), R, 52, {align:'right'}); }
    if(hdr.period){ _setf(doc,'bold',FZ.rSub); _txt(doc,PAL.INK); doc.text(SAN.text(hdr.period), R, 63, {align:'right'}); }
    _setf(doc,'normal',FZ.rgen); _txt(doc,PAL.FOOT); doc.text(genLine(), R, 74, {align:'right'});
    _stroke(doc,PAL.GOLD); doc.setLineWidth(1.2); doc.line(L, 84, R, 84);
  }
  function drawFooter(doc, pageW, M, pg, tot){
    var pageH=doc.internal.pageSize.getHeight(), L=M.left, R=pageW-M.right, y=pageH-34;
    _stroke(doc,PAL.LINE); doc.setLineWidth(0.5); doc.line(L, y-10, R, y-10);
    _setf(doc,'normal',FZ.footer); _txt(doc,PAL.FOOT);
    doc.text('Saagar Traders · Latur · Confidential — for owner review', L, y);
    doc.text('Business Control Centre · Page ' + pg + ' of ' + tot, R, y, { align:'right' });   // literal total (known at final furniture pass) — no putTotalPages
  }

  /* ---- raw-draw content primitives ---- */
  function kpiTiles(doc, x, y, w, items, cols){
    cols = cols || items.length;
    var perRow = cols; if (w/cols < 92) perRow = Math.ceil(cols/2);
    var gap=8, rows=Math.ceil(items.length/perRow), tileW=(w-gap*(perRow-1))/perRow, tileH=46;
    for(var i=0;i<items.length;i++){
      var r=Math.floor(i/perRow), c=i%perRow, it=items[i];
      var tx=x+c*(tileW+gap), ty=y+r*(tileH+gap);
      _fill(doc, it.hero?PAL.NAVY:PAL.BG); doc.roundedRect(tx,ty,tileW,tileH,5,5,'F');
      if(!it.hero){ _stroke(doc,PAL.LINE); doc.setLineWidth(0.5); doc.roundedRect(tx,ty,tileW,tileH,5,5,'S'); }
      _setf(doc,'bold',FZ.kpiLabel); _txt(doc, it.hero?PAL.KPI_HERO_LAB:PAL.MUT);
      doc.text(_up(SAN.text(it.label)), tx+8, ty+14);
      var fs=FZ.kpiValue, val=SAN.text(String(it.value)); _setf(doc,'bold',fs);
      while(doc.getTextWidth(val) > tileW-14 && fs>FZ.kpiValueMin){ fs-=0.5; doc.setFontSize(fs); }
      _txt(doc, it.hero?PAL.WHITE:PAL.NAVY); doc.text(val, tx+8, ty+32);
      if(it.sub){ _setf(doc,'normal',FZ.kpiSub); _txt(doc, it.hero?PAL.KPI_HERO_SUB:subColor(it.subClass)); doc.text(SAN.text(String(it.sub)), tx+8, ty+42); }
    }
    return y + rows*tileH + (rows-1)*gap + 12;
  }
  function sectionTitle(doc, x, y, w, title, tag){
    y += 8;
    _fill(doc,PAL.GOLD); doc.rect(x, y-8, 3, 12, 'F');
    _setf(doc,'bold',FZ.sectionTitle); _txt(doc,PAL.NAVY); doc.text(_up(SAN.text(title)), x+9, y+1);
    if(tag && tag.txt){ _setf(doc,'bold',7.5);
      var tw=doc.getTextWidth(SAN.text(tag.txt))+12;
      var f = tag.cls==='warn'?PAL.WARN_FILL : (tag.cls==='bad'?PAL.BAD_FILL : PAL.OK_FILL);
      var tc = tag.cls==='warn'?PAL.AMBER : (tag.cls==='bad'?PAL.RED : PAL.GREEN);
      _fill(doc,f); doc.roundedRect(x+w-tw, y-8, tw, 12, 3,3,'F');
      _txt(doc,tc); doc.text(SAN.text(tag.txt), x+w-tw+6, y+0.5);
    }
    return y+8;
  }
  function kvBlock(doc, x, y, w, pairs, cols){
    cols = cols||2; var gap=12, colW=(w-gap*(cols-1))/cols, rowH=17, rows=Math.ceil(pairs.length/cols);
    for(var i=0;i<pairs.length;i++){
      var r=Math.floor(i/cols), c=i%cols, px=x+c*(colW+gap), py=y+r*rowH+11;
      var k=SAN.text(pairs[i][0]), v=SAN.text(String(pairs[i][1])), big=pairs[i][2]==='big';
      _setf(doc,'normal',FZ.kv); _txt(doc,PAL.MUT); doc.text(k, px, py);
      _setf(doc,'bold',big?FZ.kvBig:FZ.kv); _txt(doc,PAL.INK); doc.text(v, px+colW, py, {align:'right'});
      _stroke(doc,PAL.LINE); doc.setLineWidth(0.4); doc.line(px, py+4, px+colW, py+4);
    }
    return y + rows*rowH + 8;
  }
  function statLine(doc, x, y, w, spans){
    y+=4; var px=x;
    spans.forEach(function(s){
      _setf(doc,'normal',FZ.statline); _txt(doc,PAL.MUT);
      var lab=SAN.text(s[0])+': '; doc.text(lab, px, y+9); var lw=doc.getTextWidth(lab);
      _setf(doc,'bold',FZ.statline); _txt(doc,PAL.NAVY); var val=SAN.text(String(s[1])); doc.text(val, px+lw, y+9);
      px += lw + doc.getTextWidth(val) + 18;
    });
    return y+18;
  }
  function netBox(doc, x, y, w, label, value){
    var h=54; _fill(doc,PAL.NAVY); doc.roundedRect(x,y,w,h,6,6,'F');
    _setf(doc,'bold',FZ.netLabel); _txt(doc,PAL.KPI_HERO_LAB); doc.text(_up(SAN.text(label)), x+16, y+22);
    _setf(doc,'bold',FZ.netValue); _txt(doc,PAL.WHITE); doc.text(SAN.text(String(value)), x+w-16, y+38, {align:'right'});
    return y+h+10;
  }
  function signRow(doc, x, y, w, boxes){
    y+=26; var n=boxes.length, gap=22, bw=(w-gap*(n-1))/n;
    for(var i=0;i<n;i++){ var bx=x+i*(bw+gap);
      if(boxes[i].name){ _txt(doc,PAL.INK); _setf(doc,'bold',FZ.sign); doc.text(SAN.text(boxes[i].name), bx, y-4); }
      _stroke(doc,PAL.MUT); doc.setLineWidth(0.6); doc.line(bx, y, bx+bw-12, y);
      _setf(doc,'normal',FZ.sign); _txt(doc,PAL.MUT); doc.text(SAN.text(boxes[i].role||''), bx, y+12);
    }
    return y+20;
  }
  function noteLine(doc, x, y, w, text, color){
    _setf(doc,'normal',FZ.note); _txt(doc, color||PAL.MUT);
    var lines=doc.splitTextToSize(SAN.text(text), w); doc.text(lines, x, y+9); return y + lines.length*11 + 6;
  }
  function emptyMsg(doc, x, y, w, text){
    y+=40; _setf(doc,'normal',FZ.empty); _txt(doc,PAL.MUT); doc.text(SAN.text(text), x+w/2, y, {align:'center'}); return y+30;
  }
  function attnBanner(doc, M, y, w, flags, pageFurniture){
    var x=M.left, pageH=doc.internal.pageSize.getHeight();
    var clear=!flags||!flags.length, items=clear?['All clear - nothing needs you today']:flags;
    var mr=7, hy=y+13;
    if(clear){ _fill(doc,PAL.GREEN); doc.circle(x+mr, hy, mr, 'F'); _stroke(doc,PAL.WHITE); doc.setLineWidth(1.4); doc.line(x+mr-3,hy,x+mr-1,hy+3); doc.line(x+mr-1,hy+3,x+mr+3.5,hy-2.5); }
    else { _fill(doc,PAL.RED); doc.circle(x+mr, hy, mr, 'F'); _txt(doc,PAL.WHITE); _setf(doc,'bold',11); doc.text('!', x+mr, hy+3.6, {align:'center'}); }
    _setf(doc,'bold',FZ.attnHead); _txt(doc, clear?PAL.GREEN:PAL.RED);
    doc.text(clear?'ALL CLEAR':'NEEDS YOUR ATTENTION TODAY', x+mr*2+8, hy+3);
    y = hy + 14; var lh=FZ.attnItem*1.4;
    items.forEach(function(f){
      _setf(doc,'normal',FZ.attnItem); _txt(doc,PAL.INK);
      var lines=doc.splitTextToSize('• '+SAN.text(f), w-10);
      lines.forEach(function(ln){
        if(y+lh > pageH-M.bottom){ doc.addPage(); pageFurniture(); y=M.top; }
        _setf(doc,'normal',FZ.attnItem); _txt(doc,PAL.INK); doc.text(ln, x+4, y+9); y+=lh;
      });
    });
    return y+8;
  }

  /* ---- table support: formatting, pills, deterministic carry ---- */
  function formatCell(d, blk){
    if(d.cell && d.cell.text && d.cell.text.length){ d.cell.text = d.cell.text.map(function(t){ return SAN.text(t); }); }  // strip any stray emoji/symbol in real data
    if(d.section==='foot'){ d.cell.styles.halign=(d.column.index===0?'left':'right'); return; }
    if(d.section!=='body') return;
    if(blk.money && blk.money.indexOf(d.column.index)>=0){ d.cell.styles.halign='right'; d.cell.styles.fontStyle='bold'; d.cell.styles.textColor=PAL.NAVY; }
    if(blk.flagRows && blk.flagRows[d.row.index]) d.cell.styles.fillColor=PAL.FLAG_FILL;
    if(blk.pills && blk.pills.indexOf(d.column.index)>=0) d.cell.text=[];
  }
  function drawPill(d, blk){
    if(d.section!=='body' || !blk.pills || blk.pills.indexOf(d.column.index)<0) return;
    var src=(blk.body[d.row.index]||[])[d.column.index];
    var label=SAN.text(String(src==null?'':src)); if(!label) return;
    var doc=d.doc, fillc, tc;
    if(/\b(ok|done|filed|balanced|delivered|closed|paid)\b/i.test(label)){ fillc=PAL.OK_FILL; tc=PAL.GREEN; }
    else if(/\b(overdue|mismatch|bad|theft|aged|short)\b/i.test(label)){ fillc=PAL.BAD_FILL; tc=PAL.RED; }
    else { fillc=PAL.WARN_FILL; tc=PAL.AMBER; }
    _setf(doc,'bold',FZ.tableBody-0.5);
    var tw=doc.getTextWidth(label), pillW=Math.min(tw+12, d.cell.width-2), h=Math.min(d.cell.height-4, FZ.tableBody+5);
    var cx=d.cell.x+(d.cell.width-pillW)/2, cy=d.cell.y+(d.cell.height-h)/2;
    _fill(doc,fillc); doc.roundedRect(cx,cy,pillW,h,5,5,'F');
    _txt(doc,tc); doc.text(label, d.cell.x+d.cell.width/2, cy+h/2+2.6, {align:'center'});
  }
  function fmtLD(v){ v=Number(v)||0; return (v%1)? v.toFixed(1) : String(Math.round(v)); }
  function trunc(s, n){ s=String(s==null?'':s); return s.length>n ? s.slice(0, n-2)+'...' : s; }
  function fmtCarry(blk, ci, val){ var f=(blk.fmt&&blk.fmt[ci])||inr; return f(val); }
  function prepCarry(blk){
    blk._cum={};
    (blk.money||[]).forEach(function(ci){ var run=0, arr=[]; for(var r=0;r<blk.raw.length;r++){ run+=(Number(blk.raw[r][ci])||0); arr.push(run); } blk._cum[ci]=arr; });
  }
  function drawCarryLine(doc, M, y, label, blk, vals, cols){
    var pageW=doc.internal.pageSize.getWidth();
    _setf(doc,'bold',FZ.carry); _txt(doc,PAL.NAVY); doc.text(label, M.left+2, y);
    blk.money.forEach(function(ci,k){
      if(cols && cols[ci]!=null && cols[ci].x!=null){ doc.text(vals[k], cols[ci].x+cols[ci].width-3.5, y, {align:'right'}); }
      else { doc.text(vals[k], pageW-M.right, y, {align:'right'}); }
    });
  }
  function drawCarryAfter(doc, blk, carry, M){
    var pages=Object.keys(carry.pageRows).map(Number).sort(function(a,b){return a-b;});
    if(pages.length<2) return;
    var cols=(doc.lastAutoTable && doc.lastAutoTable.columns) || null;
    pages.forEach(function(absP, idx){
      var rec=carry.pageRows[absP]; doc.setPage(absP);
      if(idx>0){ var bf=blk.money.map(function(ci){ return fmtCarry(blk,ci, rec.min>0?blk._cum[ci][rec.min-1]:0); });
        drawCarryLine(doc, M, (M.top+16)-5, 'Brought forward', blk, bf, cols); }
      if(idx<pages.length-1){ var cf=blk.money.map(function(ci){ return fmtCarry(blk,ci, blk._cum[ci][rec.max]); });
        drawCarryLine(doc, M, rec.yBottom+13, 'Carried forward', blk, cf, cols); }
    });
  }
  function tableOpts(blk, startY, M, pageFurniture, carry){
    var o = freshAT();
    o.head=blk.head; o.body=blk.body; if(blk.foot) o.foot=blk.foot;
    o.startY=startY;
    o.margin={ top:(carry?M.top+16:M.top), bottom:(carry?78:M.bottom), left:M.left, right:M.right };
    o.showHead='everyPage'; o.showFoot=blk.foot?'lastPage':'never';
    o.rowPageBreak='avoid'; o.pageBreak='auto';
    if(blk.colStyles) o.columnStyles=blk.colStyles;
    o.didParseCell=function(d){ formatCell(d, blk); };
    o.didDrawCell=function(d){
      drawPill(d, blk);
      if(carry && d.section==='body'){
        var abs=d.doc.internal.getCurrentPageInfo().pageNumber;
        var rec=carry.pageRows[abs]||(carry.pageRows[abs]={min:1e9,max:-1,yBottom:0});
        if(d.row.index<rec.min) rec.min=d.row.index;
        if(d.row.index>rec.max) rec.max=d.row.index;
        var yb=d.cell.y+d.cell.height; if(yb>rec.yBottom) rec.yBottom=yb;
      }
    };
    o.didDrawPage=function(d){ pageFurniture(); };
    return o;
  }

  /* ---- the renderer ---- */
  function renderDoc(blocks, orientation){
    var portrait = orientation!=='landscape';
    var JsPDF=pdfLib(); if(!JsPDF) throw new Error('R6: jsPDF not loaded');
    var doc=new JsPDF({ unit:'pt', format:'a4', orientation:portrait?'portrait':'landscape', compress:renderCompress() });
    if(typeof doc.autoTable!=='function') throw new Error('R6: jspdf-autotable not loaded');
    setFonts(doc);
    var pageW=doc.internal.pageSize.getWidth();
    var M = portrait ? { top:96,bottom:56,left:44,right:44 } : { top:96,bottom:56,left:40,right:40 };
    var contentW=pageW-M.left-M.right;
    var hdr=null; for(var i=0;i<blocks.length;i++){ if(blocks[i].t==='header'){ hdr=blocks[i]; break; } } hdr=hdr||{};
    var DRAWN={};
    function pageFurniture(){                          // header only; footer drawn in final pass (needs total)
      var p=doc.internal.getCurrentPageInfo().pageNumber;
      if(DRAWN[p]) return; DRAWN[p]=true;
      drawRunningHeader(doc,pageW,M,hdr, p>1 && hdr.cont);
    }
    var y=M.top;
    blocks.forEach(function(blk, _i){
      switch(blk.t){
        case 'header': break;
        case 'spacer': y+=(blk.h||10); break;
        case 'attn': y=attnBanner(doc,M,y,contentW,blk.flags,pageFurniture); break;
        case 'kpi': y=kpiTiles(doc,M.left,y,contentW,blk.items,blk.cols); break;
        case 'section': y=sectionTitle(doc,M.left,y,contentW,blk.title,blk.tag); break;
        case 'kv': y=kvBlock(doc,M.left,y,contentW,blk.pairs,blk.cols); break;
        case 'statline': y=statLine(doc,M.left,y,contentW,blk.spans); break;
        case 'netbox': y=netBox(doc,M.left,y,contentW,blk.label,blk.value); break;
        case 'sign': y=signRow(doc,M.left,y,contentW,blk.boxes); break;
        case 'note': y=noteLine(doc,M.left,y,contentW,blk.text,blk.color); break;
        case 'empty': y=emptyMsg(doc,M.left,y,contentW,blk.text); break;
        case 'table':
          var carry=null; if(blk.money && blk.raw){ prepCarry(blk); carry={pageRows:{}}; }
          doc.autoTable(tableOpts(blk, y, M, pageFurniture, carry));
          if(carry) drawCarryAfter(doc, blk, carry, M);
          y=doc.lastAutoTable.finalY + 8;
          break;
      }
      if (_i < blocks.length - 1) y = maybeBreak(doc, y, M, pageFurniture);   // never add a trailing empty page after the last block
    });
    var tot=doc.internal.getNumberOfPages();
    for(var p=1;p<=tot;p++){
      doc.setPage(p);
      if(!DRAWN[p]){ DRAWN[p]=true; drawRunningHeader(doc,pageW,M,hdr, p>1 && hdr.cont); }
      drawFooter(doc,pageW,M,p,tot);
    }
    return doc;
  }
  function maybeBreak(doc, y, M, pageFurniture){
    var pageH=doc.internal.pageSize.getHeight();
    if(y > pageH - M.bottom - 8){ doc.addPage(); pageFurniture(); return M.top; }
    return y;
  }

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
    build: function (type, opts) {
      var m = buildModel(type, opts);
      if (m.blocks) return Promise.resolve(renderDoc(m.blocks, m.orientation).output('blob')); // R6 native vector path
      return renderPages(m.pages, m.orientation);                                                // legacy raster path (un-converted builders)
    },
    generate: function (type, opts) {
      try { toast('Preparing report…'); } catch (e) {}
      var self = this;
      return new Promise(function (res) { setTimeout(res, 40); }).then(function () {
        return self.build(type, opts).then(function (blob) { return shareBlob(blob, filename(type, opts)); });
      }).catch(function (e) { try { toast('Could not build report: ' + (e && e.message || e)); } catch (_) {} });
    },
    list: function () { return Object.keys(META).map(function (k) { return { type: k, title: META[k].title, scope: META[k].scope, icon: META[k].icon }; }); },
    forModule: function (id) { return ({ qms: 'qmsReport', dsr: 'dsrRegister', cro_audit: 'croAudit', payroll: 'payrollRegister', stock: 'stockRegister', expense: 'cashStatement', tax: 'taxReport', service: 'serviceAging', grooming: 'groomingDaily', leave: 'leaveRegister' })[id] || null; },
    openHub: function () {
      var el = function (i) { return document.getElementById(i); };
      var groups = { Daily: [], Monthly: [] };
      Object.keys(META).forEach(function (k) { (META[k].scope === 'monthly' ? groups.Monthly : groups.Daily).push({ type: k, t: META[k].title, i: META[k].icon }); });
      function btns(arr) { return arr.map(function (r) { return '<button onclick="SaagarReport.fromHub(\'' + r.type + '\')" style="display:flex;align-items:center;gap:9px;text-align:left;padding:11px 13px;border:1px solid #e3e8f0;border-radius:10px;background:#fff;font:600 13px inherit;color:#0d2340;cursor:pointer;width:100%"><span style="font-size:17px">' + r.i + '</span>' + esc(r.t) + '</button>'; }).join(''); }
      var body = '<div>'
        + '<div style="display:flex;gap:14px;margin-bottom:14px;flex-wrap:wrap;font-size:12px;color:#475569"><label>Date <input id="rptDate" type="date" value="' + curDate() + '" style="padding:6px 8px;border:1px solid #cbd6e4;border-radius:8px;font:inherit"></label><label>Month <input id="rptMonth" type="month" value="' + curMonth() + '" style="padding:6px 8px;border:1px solid #cbd6e4;border-radius:8px;font:inherit"></label></div>'
        + '<div style="font:800 11px inherit;letter-spacing:.5px;color:#64748b;text-transform:uppercase;margin:4px 0 8px">Daily reports</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' + btns(groups.Daily) + '</div>'
        + '<div style="font:800 11px inherit;letter-spacing:.5px;color:#64748b;text-transform:uppercase;margin:16px 0 8px">Monthly reports</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' + btns(groups.Monthly) + '</div>'
        + '<p style="font-size:11px;color:#8295ad;margin-top:14px">Tap a report → it builds a clean A4 PDF and opens the share sheet. Pick WhatsApp + the contact.</p></div>';
      if (el('modalTitle')) el('modalTitle').textContent = 'Generate Report (PDF)';
      if (el('modalBody')) el('modalBody').innerHTML = body;
      if (window.openModal) window.openModal();
    },
    fromHub: function (type) {
      var el = function (i) { return document.getElementById(i); };
      var d = (el('rptDate') && el('rptDate').value) || curDate(), m = (el('rptMonth') && el('rptMonth').value) || curMonth();
      if (window.closeModal) window.closeModal();
      return this.generate(type, { date: d, month: m });
    },
    _buildModel: buildModel, // for tests
    _renderDoc: function (type, opts) { var m = buildModel(type, opts); if (!m.blocks) throw new Error('not block-based: ' + type); return renderDoc(m.blocks, m.orientation); }, // test seam → jsPDF doc
    _renderBlocks: function (blocks, orientation) { return renderDoc(blocks, orientation); } // test seam → raw block list
  };
})();
