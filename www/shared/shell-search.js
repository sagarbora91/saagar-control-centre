(function (root) {
  'use strict';
  if (root.SaagarShellSearch) return;

  /* Shell search, version 1: places only (modules, screens, reports, settings, quick actions).
     Built on first use from the shell registries. Nothing is stored, nothing is logged, and a
     locked module is always opened through the shell opener, which asks for the PIN. */

  var KINDS = ['module', 'screen', 'report', 'setting', 'action'];
  var MAX_HITS = 12;
  var MAX_RECENT = 5;
  var LOCK = '🔒';
  var ICONS = { screen: '▸', setting: '⚙', action: '⚡' };

  var STR = {
    title: { en: 'Search', mr: 'शोधा', hi: 'खोजें' },
    placeholder: { en: 'Search modules, screens, reports, settings', mr: 'मॉड्यूल, स्क्रीन, अहवाल, सेटिंग्ज शोधा', hi: 'मॉड्यूल, स्क्रीन, रिपोर्ट, सेटिंग्स खोजें' },
    module: { en: 'Modules', mr: 'मॉड्यूल्स', hi: 'मॉड्यूल' },
    screen: { en: 'Screens', mr: 'स्क्रीन', hi: 'स्क्रीन' },
    report: { en: 'Reports', mr: 'अहवाल', hi: 'रिपोर्ट' },
    setting: { en: 'Settings', mr: 'सेटिंग्ज', hi: 'सेटिंग्स' },
    action: { en: 'Quick actions', mr: 'जलद क्रिया', hi: 'त्वरित कार्य' },
    recent: { en: 'Recent', mr: 'अलीकडील', hi: 'हाल के' },
    empty: { en: 'No match. Try a module or report name.', mr: 'काहीही सापडले नाही. मॉड्यूल किंवा अहवालाचे नाव वापरून पहा.', hi: 'कोई परिणाम नहीं। मॉड्यूल या रिपोर्ट का नाम आज़माएँ।' },
    locked: { en: 'PIN required', mr: 'पिन आवश्यक', hi: 'पिन आवश्यक' },
    close: { en: 'Close', mr: 'बंद करा', hi: 'बंद करें' }
  };

  /* Quick actions resolve against the screen registry: [module, target, labels]. */
  var QUICK = [
    ['service', 'new', { en: 'New service case', mr: 'नवीन सर्व्हिस केस', hi: 'नया सर्विस केस' }],
    ['qms', 'walkin', { en: 'Add walk-in', mr: 'वॉक-इन नोंदवा', hi: 'वॉक-इन जोड़ें' }],
    ['expense', 'petty', { en: 'Petty cash', mr: 'किरकोळ रोकड', hi: 'छोटी नकद' }],
    ['payroll', 'advance', { en: 'Salary advance voucher', mr: 'पगार उचल व्हाउचर', hi: 'वेतन अग्रिम वाउचर' }]
  ];

  /* Report type to owning module. An empty string is an owner-level report with no module. */
  var REPORT_MODULE = {
    qmsReport: 'qms', qmsEodSummary: 'qms', lostWalkinCallSheet: 'qms', dsrRegister: 'dsr', croAudit: 'cro_audit',
    stockRegister: 'stock', cashStatement: 'expense', expenseMonthly: 'expense', leaveRegister: 'leave',
    payrollRegister: 'payroll', payrollSlip: 'payroll', statutorySummary: 'payroll', statutoryRegister: 'payroll',
    advanceVoucher: 'payroll', hrLetter: 'payroll', fnfSettlement: 'payroll', groomingDaily: 'grooming',
    groomingMonthly: 'grooming', taxReport: 'tax', serviceAging: 'service', serviceJobCard: 'service',
    serviceTaxInvoice: 'service', ownerBrief: '', ownerMonthly: '', weeklyBrief: '',
    svcStockList: 'service', svcPartLedger: 'service', svcReorderList: 'service', svcGoodsReceipt: 'service',
    svcDefectiveRegister: 'service', svcAdjustmentRegister: '',
    serviceBillSummary: 'service', serviceTaxInvoiceV2: 'service', serviceCreditNote: 'service', serviceReceipt: 'service',
    serviceRefundVoucher: 'service', serviceWarrantySheet: 'service', serviceUnbilledIssues: 'service',
    serviceDaySummary: '', serviceAdvancesHeld: '', serviceRevenue: ''
  };

  /* Romanised and Devanagari synonyms. Keys: module id, module:target, r:<report type>, s:<settings route>. */
  var SYN = {
    stock: 'maal saman stok sthak साठा स्टॉक माल सामान',
    service: 'repair sarvis seva ghadi mursat सर्व्हिस दुरुस्ती घड्याळ घड़ी मरम्मत',
    qms: 'walkin rang line grahak ग्राहक रांग कतार वॉकइन',
    dsr: 'cro login vikri bikri विक्री बिक्री',
    expense: 'kharch kharcha hisab rokad खर्च हिशोब रोकड नकद',
    grooming: 'grooming uniform safai सफाई गणवेश वर्दी',
    cro_audit: 'store manager audit tapasni janch तपासणी जांच',
    payroll: 'pagar pagaar vetan tankhwah पगार वेतन तनख्वाह',
    leave: 'chutti sutti raja hajeri छुट्टी सुट्टी रजा',
    tax: 'kar gst tds compliance जीएसटी टीडीएस कर',
    planning: 'yojana niyojan festival san tyohar सण त्योहार नियोजन',
    etp: 'etp retail report ahwal अहवाल रिपोर्ट',
    'payroll:advance': 'uchal pesha advance उचल पेशगी अग्रिम',
    'payroll:slip': 'pagar patti pavti slip पगार पावती पर्ची',
    'payroll:attendance': 'hajeri haziri upasthiti हजेरी उपस्थिति',
    'expense:cash': 'rokad rokad vahi daybook रोकड',
    'expense:petty': 'chillar kirkol rokad किरकोळ छोटी नकद',
    'qms:walkin': 'walkin grahak aala ग्राहक वॉकइन',
    'service:new': 'navin nayi case job नवीन नया केस',
    'stock:movement': 'aavak javak inward आवक जावक',
    's:backup': 'backup sathvan बॅकअप',
    's:security': 'pin suraksha सुरक्षा पिन',
    's:appearance': 'bhasha language भाषा',
    'r:cashStatement': 'rokad roj hisab रोकड'
  };

  var CSS = '.modal-backdrop.sgs-top{align-items:flex-start;padding:max(16px,6vh) 12px 12px}' +
    '.modal.sgs-sheet{width:min(640px,100%);max-width:640px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;border-radius:var(--radius-lg)}' +
    '.sgs-sheet .modal-head{display:none}' +
    '.sgs-sheet .modal-body{padding:0;display:flex;flex-direction:column;min-height:0;flex:1 1 auto}' +
    '.sgs-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--gray-200)}' +
    '.sgs-input{flex:1 1 auto;min-width:0;height:44px;padding:0 12px;font-size:16px;border:1px solid var(--gray-300);border-radius:var(--radius);background:var(--white)}' +
    '.sgs-input:focus{outline:2px solid var(--navy-light);outline-offset:1px}' +
    '.sgs-close{flex:0 0 auto;min-width:44px;height:44px;padding:0 12px;border-radius:var(--radius);background:var(--gray-100);color:var(--gray-700)}' +
    '.sgs-list{flex:1 1 auto;min-height:0;max-height:60vh;overflow:auto;overscroll-behavior:contain;padding:6px}' +
    '.sgs-group{padding:10px 8px 4px;font-size:12px;font-weight:700;color:var(--gray-500)}' +
    '.sgs-row{display:flex;align-items:center;gap:10px;min-height:56px;padding:6px 10px;border-radius:var(--radius);touch-action:manipulation;cursor:pointer;color:var(--gray-800)}' +
    '.sgs-row[aria-selected="true"]{background:var(--gold-pale);outline:1px solid var(--gold-light)}' +
    '.sgs-ic{flex:0 0 28px;text-align:center;font-size:18px}' +
    '.sgs-main{flex:1 1 auto;min-width:0}' +
    '.sgs-label{display:block;font-size:15px;font-weight:600;color:var(--navy)}' +
    '.sgs-sub{display:block;font-size:12px;color:var(--gray-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sgs-lock{flex:0 0 auto;font-size:14px}' +
    '.sgs-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
    '.sgs-empty{padding:20px 12px;color:var(--gray-600)}' +
    '.sgs-list mark{background:transparent;color:inherit;text-decoration:underline;text-decoration-color:var(--gold)}';

  /* Lower-case, NFKC, Devanagari digits to ASCII, joiners removed, everything else to single spaces. */
  function norm(value) {
    var s = String(value == null ? '' : value);
    if (typeof s.normalize === 'function') s = s.normalize('NFKC');
    s = s.toLowerCase()
      .replace(/[०-९]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x0966 + 48); })
      .replace(/[‌‍]/g, '')
      .replace(/[^a-z0-9ऀ-ॣॱ-ॿ]+/g, ' ');
    return s.replace(/^ +| +$/g, '');
  }

  function words(s) { return s ? s.split(' ') : []; }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function startsWord(text, w) {
    var ws = text.split(' '), i;
    for (i = 0; i < ws.length; i += 1) if (ws[i].indexOf(w) === 0) return 1;
    return 0;
  }

  function wordScore(e, w) {
    var best = 0, i, L;
    for (i = 0; i < e.ln.length; i += 1) {
      L = e.ln[i];
      if (L.indexOf(w) < 0) continue;
      if (startsWord(L, w)) return 100;
      best = 70;
    }
    if (best) return best;
    if (e.kw.indexOf(w) >= 0) best = startsWord(e.kw, w) ? 60 : 30;
    if (best < 40 && e.pn.indexOf(w) >= 0) best = 40;
    return best;
  }

  function create(env) {
    var index = null;
    var sig = '';
    var byId = {};
    var recent = [];
    var ui = null;

    function lang() { var l = env.lang(); return l === 'mr' || l === 'hi' ? l : 'en'; }
    function T(key) { var row = STR[key]; return row ? (row[lang()] || row.en) : ''; }
    function tr(text, l) { return l === 'en' ? String(text) : String(env.translate(text, l)); }
    function trio(en) { return { en: String(en), mr: tr(en, 'mr'), hi: tr(en, 'hi') }; }

    function signature() {
      var mods = env.modules(), parts = [lang(), env.admin() ? 1 : 0, env.role(), env.reports().length], i, id;
      for (i = 0; i < mods.length; i += 1) {
        id = mods[i].id;
        parts.push(id + (env.visible(id) ? 'v' : '-') + (env.pin(id) ? 'p' : '-'));
      }
      return parts.join('|');
    }

    function build() {
      var l = lang(), admin = env.admin(), out = [], vis = {}, lock = {}, short = {}, feats = env.features();
      var mods = env.modules(), routes = env.settings(), keys = env.settingKeys(), reps = env.reports();
      var i, m, id, f, k, q, hit;

      function add(kind, key, labels, parentEn, mod, extra, kwText, icon) {
        var parents = parentEn ? trio(parentEn) : null;
        var all = [labels.en, labels.mr, labels.hi];
        var e = {
          id: key, kind: kind, module: mod || '', label: labels[l] || labels.en, en: labels.en, icon: icon,
          locked: !!(mod && lock[mod]), target: extra.target || '', route: extra.route || '', type: extra.type || '',
          reportTitle: extra.title || '',
          parent: parents ? parents[l] : '',
          ln: [], kw: norm(kwText),
          pn: norm(parents ? parents.en + ' ' + parents.mr + ' ' + parents.hi : '')
        };
        for (var j = 0; j < all.length; j += 1) {
          var n = norm(all[j]);
          if (n && e.ln.indexOf(n) < 0) e.ln.push(n);
        }
        out.push(e);
      }

      for (i = 0; i < mods.length; i += 1) {
        m = mods[i];
        vis[m.id] = !!env.visible(m.id);
        lock[m.id] = vis[m.id] && !admin && !!env.pin(m.id);
        short[m.id] = m.short || m.title || m.id;
      }
      for (i = 0; i < mods.length; i += 1) {
        m = mods[i];
        if (!vis[m.id]) continue;
        add('module', 'm:' + m.id, trio(short[m.id]), '', m.id, {},
          [m.title, m.subtitle, m.category, m.id.replace(/_/g, ' '), SYN[m.id]].join(' '), m.icon || ICONS.screen);
      }
      for (i = 0; i < feats.length; i += 1) {
        f = feats[i];
        if (!vis[f.module]) continue;
        add('screen', 's:' + f.module + ':' + f.target, trio(f.label), short[f.module], f.module, { target: f.target },
          [(f.keywords || []).join(' '), SYN[f.module + ':' + f.target], SYN[f.module]].join(' '), ICONS.screen);
      }
      for (i = 0; i < reps.length; i += 1) {
        id = REPORT_MODULE[reps[i].type];
        if (typeof id !== 'string') { if (!admin) continue; id = ''; }
        if (id && !vis[id]) continue;
        add('report', 'r:' + reps[i].type, trio(reps[i].title), 'Reports', id || '', { type: reps[i].type, title: reps[i].title },
          [reps[i].type.replace(/([A-Z])/g, ' $1'), reps[i].scope, SYN['r:' + reps[i].type], id ? SYN[id] : ''].join(' '), reps[i].icon || ICONS.screen);
      }
      for (k in routes) {
        if (Object.prototype.hasOwnProperty.call(routes, k)) {
          add('setting', 't:' + k, trio(routes[k].title), 'Settings', '', { route: k },
            [routes[k].description, keys[k], SYN['s:' + k]].join(' '), ICONS.setting);
        }
      }
      for (i = 0; i < QUICK.length; i += 1) {
        q = QUICK[i];
        hit = null;
        for (k = 0; k < feats.length; k += 1) if (feats[k].module === q[0] && feats[k].target === q[1]) hit = feats[k];
        if (!hit || !vis[q[0]]) continue;
        add('action', 'a:' + q[0] + ':' + q[1], q[2], short[q[0]], q[0], { target: q[1] },
          [hit.label, (hit.keywords || []).join(' '), SYN[q[0] + ':' + q[1]]].join(' '), ICONS.action);
      }
      byId = {};
      for (i = 0; i < out.length; i += 1) byId[out[i].id] = out[i];
      return out;
    }

    function ensure() {
      var s = signature();
      if (!index || s !== sig) { index = build(); sig = s; }
      return index;
    }

    function project(e, score) {
      var alt = lang() !== 'en' && e.en !== e.label ? e.en : '';
      return {
        id: e.id, kind: e.kind, label: e.label, en: e.en, parent: e.parent, sub: [alt, e.parent].filter(Boolean).join(' · '),
        module: e.module, target: e.target, route: e.route, type: e.type, locked: e.locked, icon: e.icon, score: score
      };
    }

    function group(kind, heading, hits) { return { kind: kind, heading: heading, items: hits }; }

    function search(text, cached) {
      var q = norm(text), ws = words(q), list = cached && index ? index : ensure(), hits = [], groups = [], i, j, s, t, e, kind, part, kindOf;
      if (!ws.length) {
        part = [];
        for (i = 0; i < list.length; i += 1) if (list[i].kind === 'action') part.push(project(list[i], 0));
        if (part.length) groups.push(group('action', T('action'), part));
        part = [];
        for (i = 0; i < recent.length; i += 1) if (byId[recent[i]]) part.push(project(byId[recent[i]], 0));
        if (part.length) groups.push(group('recent', T('recent'), part));
        part = [];
        for (i = 0; i < list.length && part.length < 6; i += 1) if (list[i].kind === 'module') part.push(project(list[i], 0));
        if (part.length) groups.push(group('module', T('module'), part));
        for (i = 0; i < groups.length; i += 1) hits = hits.concat(groups[i].items);
        return { query: q, hits: hits, groups: groups };
      }
      for (i = 0; i < list.length; i += 1) {
        e = list[i];
        s = 0;
        for (j = 0; j < ws.length; j += 1) {
          t = wordScore(e, ws[j]);
          if (!t) { s = -1; break; }
          s += t;
        }
        if (s < 0) continue;
        if (e.ln.indexOf(q) >= 0) s += 50;
        if (e.kind === 'action') s -= 1;
        hits.push(project(e, s));
      }
      kindOf = function (h) { return KINDS.indexOf(h.kind); };
      hits.sort(function (a, b) {
        return (b.score - a.score) || (kindOf(a) - kindOf(b)) || String(a.parent + a.label).localeCompare(String(b.parent + b.label));
      });
      hits = hits.slice(0, MAX_HITS);
      for (i = 0; i < KINDS.length; i += 1) {
        kind = KINDS[i];
        part = hits.filter(function (h) { return h.kind === kind; });
        if (part.length) groups.push(group(kind, T(kind), part));
      }
      hits = [];
      for (i = 0; i < groups.length; i += 1) hits = hits.concat(groups[i].items);
      return { query: q, hits: hits, groups: groups };
    }

    function remember(id) {
      recent = [id].concat(recent.filter(function (x) { return x !== id; })).slice(0, MAX_RECENT);
    }

    /* Open the chosen place with the existing shell functions only. */
    function choose(id) {
      var e = byId[id], hasRow;
      if (!e) return;
      if (e.kind === 'report') {
        if (e.module && !env.ensureModuleAccess(e.module)) return;
        remember(id);
        teardown();
        try {
          env.openHub();
          hasRow = env.hubHasRow(e.type);
          if (hasRow) env.hubFilter(e.reportTitle);
        } catch (err) {
          env.closeModal();
          return 0;
        }
        return;
      }
      remember(id);
      env.closeModal();
      teardown();
      if (e.kind === 'module') env.navigateToModule(e.module);
      else if (e.kind === 'setting') { env.switchView('config'); env.switchConfigTab(e.route); }
      else env.navigateToFeature(e.module, e.target);
    }

    /* ── panel ── */
    function el(tag, cls) {
      var n = env.doc.createElement(tag);
      if (cls) n.className = cls;
      return n;
    }

    function mark(parent, text, ws) {
      var low = text.toLowerCase(), spans = [], i, at, merged = [], pos = 0, last;
      for (i = 0; i < ws.length; i += 1) {
        at = low.indexOf(ws[i]);
        if (at >= 0) spans.push([at, at + ws[i].length]);
      }
      spans.sort(function (a, b) { return a[0] - b[0]; });
      for (i = 0; i < spans.length; i += 1) {
        last = merged[merged.length - 1];
        if (last && spans[i][0] <= last[1]) last[1] = Math.max(last[1], spans[i][1]);
        else merged.push(spans[i]);
      }
      for (i = 0; i < merged.length; i += 1) {
        if (merged[i][0] > pos) parent.appendChild(env.doc.createTextNode(text.slice(pos, merged[i][0])));
        var m = el('mark');
        m.appendChild(env.doc.createTextNode(text.slice(merged[i][0], merged[i][1])));
        parent.appendChild(m);
        pos = merged[i][1];
      }
      if (pos < text.length) parent.appendChild(env.doc.createTextNode(text.slice(pos)));
    }

    function rowNode(hit, n, ws) {
      var r = el('div', 'sgs-row'), ic = el('span', 'sgs-ic'), main = el('span', 'sgs-main'), lab = el('span', 'sgs-label'), sub, lk, sr;
      r.id = 'sgs-o-' + n;
      r.setAttribute('role', 'option');
      r.setAttribute('tabindex', '-1');
      r.setAttribute('aria-selected', 'false');
      r.setAttribute('data-i', String(n));
      ic.textContent = hit.icon;
      mark(lab, hit.label, ws);
      main.appendChild(lab);
      if (hit.sub) { sub = el('span', 'sgs-sub'); sub.textContent = hit.sub; main.appendChild(sub); }
      r.appendChild(ic);
      r.appendChild(main);
      if (hit.locked) {
        lk = el('span', 'sgs-lock');
        lk.textContent = LOCK;
        sr = el('span', 'sgs-sr');
        sr.textContent = T('locked');
        r.appendChild(lk);
        r.appendChild(sr);
      }
      return r;
    }

    function paint() {
      var i, rows = ui.list.querySelectorAll('.sgs-row'), on;
      for (i = 0; i < rows.length; i += 1) {
        on = i === ui.active;
        rows[i].setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) {
          ui.input.setAttribute('aria-activedescendant', rows[i].id);
          if (typeof rows[i].scrollIntoView === 'function') rows[i].scrollIntoView({ block: 'nearest' });
        }
      }
      if (ui.active < 0) ui.input.removeAttribute('aria-activedescendant');
    }

    function render(text) {
      var res = search(text, true), ws = words(res.query), g, i, h, n = 0;
      ui.shown = [];
      clear(ui.list);
      if (!res.hits.length) {
        h = el('div', 'sgs-empty');
        h.textContent = T('empty');
        ui.list.appendChild(h);
      }
      for (g = 0; g < res.groups.length; g += 1) {
        h = el('div', 'sgs-group');
        h.setAttribute('role', 'presentation');
        h.textContent = res.groups[g].heading;
        ui.list.appendChild(h);
        for (i = 0; i < res.groups[g].items.length; i += 1) {
          ui.list.appendChild(rowNode(res.groups[g].items[i], n, ws));
          ui.shown.push(res.groups[g].items[i]);
          n += 1;
        }
      }
      ui.active = res.query && ui.shown.length ? 0 : -1;
      paint();
    }

    function move(step) {
      var n = ui.shown.length;
      if (!n) return;
      ui.active = Math.max(0, Math.min(n - 1, (ui.active < 0 ? (step > 0 ? -1 : n) : ui.active) + step));
      paint();
    }

    function onKey(e) {
      var k = e.key, d = env.doc;
      if (!ui) return;
      if (k === 'Escape') { e.preventDefault(); close(); return; }
      if (k === 'Tab') {
        e.preventDefault();
        (d.activeElement === ui.input ? ui.closeBtn : ui.input).focus();
        return;
      }
      if (k === 'ArrowDown') { e.preventDefault(); move(1); return; }
      if (k === 'ArrowUp') { e.preventDefault(); move(-1); return; }
      if ((k === 'Home' || k === 'End') && !ui.input.value && ui.shown.length) {
        e.preventDefault();
        ui.active = k === 'Home' ? 0 : ui.shown.length - 1;
        paint();
        return;
      }
      if (k === 'Enter') {
        if (e.isComposing || e.keyCode === 229) return;
        if (ui.active >= 0 && ui.shown[ui.active]) { e.preventDefault(); choose(ui.shown[ui.active].id); }
      }
    }

    function rowOf(node) {
      while (node && !(node.classList && node.classList.contains('sgs-row'))) node = node.parentNode;
      return node;
    }

    function fit() {
      var vv = env.win.visualViewport, h = vv && vv.height ? vv.height : env.win.innerHeight;
      if (ui && h) ui.list.style.maxHeight = Math.max(160, Math.floor(h - 150)) + 'px';
    }

    function teardown() {
      var u = ui, vv;
      if (!u) return;
      ui = null;
      if (u.obs) u.obs.disconnect();
      vv = env.win.visualViewport;
      if (vv && u.fit) vv.removeEventListener('resize', u.fit);
      u.bd.classList.remove('sgs-top');
      u.modal.classList.remove('sgs-sheet');
      u.modal.removeAttribute('role');
      u.modal.removeAttribute('aria-modal');
      u.modal.removeAttribute('data-no-i18n');
      clear(u.body);
      if (u.prev && typeof u.prev.focus === 'function' && env.doc.body && env.doc.body.contains(u.prev)) u.prev.focus();
    }

    function open() {
      var d = env.doc, bd, modal, body, title, panel, head, input, closeBtn, list, vv;
      if (ui) {
        if (env.modalOpen()) { ui.input.focus(); return; }
        teardown();
      }
      if (env.launchLocked() || env.moduleOpen() || env.modalOpen()) return;
      ensure();
      bd = d.getElementById('modalBackdrop');
      modal = d.querySelector('.modal');
      body = d.getElementById('modalBody');
      title = d.getElementById('modalTitle');
      if (!bd || !modal || !body) return;
      if (!d.getElementById('sgs-style')) {
        var st = el('style');
        st.id = 'sgs-style';
        st.textContent = CSS;
        (d.head || d.documentElement).appendChild(st);
      }
      panel = el('div', 'sgs-panel');
      head = el('div', 'sgs-head');
      input = el('input', 'sgs-input');
      input.type = 'search';
      input.setAttribute('inputmode', 'search');
      input.setAttribute('enterkeyhint', 'go');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('autocapitalize', 'off');
      input.setAttribute('spellcheck', 'false');
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-expanded', 'true');
      input.setAttribute('aria-controls', 'sgs-list');
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-label', T('title'));
      input.setAttribute('placeholder', T('placeholder'));
      closeBtn = el('button', 'sgs-close');
      closeBtn.type = 'button';
      closeBtn.textContent = T('close');
      list = el('div', 'sgs-list');
      list.id = 'sgs-list';
      list.setAttribute('role', 'listbox');
      list.setAttribute('data-no-i18n', '');
      head.appendChild(input);
      head.appendChild(closeBtn);
      panel.appendChild(head);
      panel.appendChild(list);
      if (title) title.textContent = T('title');
      clear(body);
      body.appendChild(panel);
      modal.classList.add('sgs-sheet');
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('data-no-i18n', '');
      bd.classList.add('sgs-top');
      ui = { bd: bd, modal: modal, body: body, input: input, closeBtn: closeBtn, list: list, shown: [], active: -1, prev: d.activeElement, obs: null, fit: null };
      /* Any other close path (Back, backdrop tap, Esc) hides the backdrop: tear the panel down then. */
      if (typeof env.win.MutationObserver === 'function') {
        ui.obs = new env.win.MutationObserver(function () { if (ui && !env.modalOpen()) teardown(); });
        ui.obs.observe(bd, { attributes: true, attributeFilter: ['class'] });
      }
      vv = env.win.visualViewport;
      ui.fit = fit;
      if (vv) vv.addEventListener('resize', fit);
      input.addEventListener('input', function () { if (ui) render(input.value); });
      panel.addEventListener('keydown', onKey);
      closeBtn.addEventListener('click', function () { close(); });
      list.addEventListener('mousedown', function (e) { if (rowOf(e.target)) e.preventDefault(); });
      list.addEventListener('click', function (e) {
        var r = rowOf(e.target), n = r ? Number(r.getAttribute('data-i')) : -1;
        if (ui && ui.shown[n]) choose(ui.shown[n].id);
      });
      list.addEventListener('mousemove', function (e) {
        var r = rowOf(e.target), n = r ? Number(r.getAttribute('data-i')) : -1;
        if (ui && n >= 0 && n !== ui.active) { ui.active = n; paint(); }
      });
      env.openModal();
      fit();
      render('');
      input.focus();
    }

    function close() {
      if (!ui) return;
      env.closeModal();
      teardown();
    }

    function onGlobalKey(e) {
      if (!(e.ctrlKey || e.metaKey) || String(e.key || '').toLowerCase() !== 'k') return;
      if (env.launchLocked() || env.moduleOpen() || env.previewOpen()) return;
      if (ui) { e.preventDefault(); close(); return; }
      if (env.modalOpen()) return;
      e.preventDefault();
      open();
    }

    return {
      normalise: norm,
      entries: function () { return ensure().map(function (e) { return project(e, 0); }); },
      query: function (text) { return search(text); },
      choose: choose,
      open: open,
      close: close,
      isOpen: function () { return !!ui; },
      onGlobalKey: onGlobalKey,
      reportModules: REPORT_MODULE
    };
  }

  /* The real shell. Every shell identifier is read here and nowhere else. */
  function shellEnv() {
    var d = root.document;
    return {
      win: root,
      doc: d,
      lang: function () { var i = root.SaagarI18n; return i && typeof i.getLanguage === 'function' ? i.getLanguage() : 'en'; },
      translate: function (t, l) { var i = root.SaagarI18n; return i && typeof i.translate === 'function' ? i.translate(t, l) : t; },
      modules: function () { var m = root.SaagarModuleManifest; return m && m.modules ? m.modules : []; },
      features: function () { return typeof FEATURE_INDEX !== 'undefined' ? FEATURE_INDEX : []; },
      settings: function () { return typeof SETTINGS_ROUTES !== 'undefined' ? SETTINGS_ROUTES : {}; },
      settingKeys: function () {
        var out = {}, rows = d.querySelectorAll('[data-settings-route]'), i;
        for (i = 0; i < rows.length; i += 1) out[rows[i].getAttribute('data-settings-route')] = rows[i].getAttribute('data-settings-search') || '';
        return out;
      },
      reports: function () { var r = root.SaagarReport; return r && typeof r.list === 'function' ? r.list() : []; },
      visible: function (id) { return typeof moduleVisibleForRole === 'function' && !!moduleVisibleForRole(id); },
      pin: function (id) { return typeof modulePinRequired === 'function' && !!modulePinRequired(id); },
      admin: function () { return typeof isAdmin !== 'undefined' && isAdmin === true; },
      role: function () { return typeof currentRole === 'function' ? String(currentRole()) : ''; },
      moduleOpen: function () { return typeof activeModuleId !== 'undefined' && !!activeModuleId; },
      launchLocked: function () { var n = d.getElementById('st-v5-launch-lock'); return !!(n && n.style.display !== 'none'); },
      previewOpen: function () { return d.documentElement.classList.contains('st-preview-open'); },
      modalOpen: function () { var b = d.getElementById('modalBackdrop'); return !!(b && !b.classList.contains('hidden')); },
      openModal: function () { openModal(); },
      closeModal: function () { closeModal(); },
      navigateToModule: function (id) { navigateToModule(id); },
      navigateToFeature: function (m, t) { navigateToFeature(m, t); },
      switchView: function (v) { switchView(v); },
      switchConfigTab: function (r) { switchConfigTab(r); },
      ensureModuleAccess: function (id) { return ensureModuleAccess(id) === true; },
      openHub: function () { root.SaagarReport.openHub(); },
      hubHasRow: function (type) { return /^[A-Za-z0-9]+$/.test(type) && !!d.querySelector('#hubList .hub-row[data-type="' + type + '"]'); },
      hubFilter: function (title) {
        var i = d.getElementById('hubSearch');
        if (i) i.value = title;
        root.SaagarReport.hubFilter(title);
      }
    };
  }

  var inst = create(shellEnv());
  if (root.document && typeof root.document.addEventListener === 'function') root.document.addEventListener('keydown', inst.onGlobalKey);

  Object.defineProperty(root, 'SaagarShellSearch', {
    value: Object.freeze({
      version: 1,
      open: inst.open,
      close: inst.close,
      isOpen: inst.isOpen,
      query: inst.query,
      entries: inst.entries,
      create: create
    }),
    enumerable: true, writable: false, configurable: false
  });
})(window);
