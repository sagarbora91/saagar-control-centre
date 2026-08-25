(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  try {
    var api = factory();
    Object.defineProperty(root, 'SaagarModuleManifest', {
      value: api,
      enumerable: true,
      writable: false,
      configurable: false
    });
  } catch (error) {
    try {
      Object.defineProperty(root, 'SaagarModuleManifestError', {
        value: 'INVALID_MANIFEST',
        enumerable: false,
        writable: false,
        configurable: false
      });
    } catch (_) {}
    try { console.error('Saagar module manifest rejected:', error); } catch (_) {}
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var EXPECTED_IDS = Object.freeze([
    'stock',
    'service',
    'qms',
    'dsr',
    'expense',
    'grooming',
    'cro_audit',
    'payroll',
    'leave',
    'tax',
    'planning',
    'etp'
  ]);
  var REQUIRED_FIELDS = Object.freeze([
    'id', 'title', 'short', 'category', 'icon', 'priority', 'file',
    'subtitle', 'summary', 'bytes', 'sha256', 'src'
  ]);
  var OPTIONAL_FIELDS = Object.freeze(['source_title']);
  var ALLOWED_FIELDS = Object.freeze(REQUIRED_FIELDS.concat(OPTIONAL_FIELDS));
  var SHARED_REQUIRED_FIELDS = Object.freeze(['id', 'version', 'file', 'bytes', 'sha256']);
  var BLOCKED_KEYS = Object.freeze(['__proto__', 'prototype', 'constructor']);
  var HEX_64 = /^[a-f0-9]{64}$/;
  var MODULE_ID = /^[a-z][a-z0-9_]{1,31}$/;
  var CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

  function fail(message) {
    throw new Error('Invalid Saagar module manifest: ' + message);
  }

  function isPlainObject(value) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function ownKeys(value) {
    return Object.getOwnPropertyNames(value);
  }

  function assertObject(value, label) {
    if (!isPlainObject(value)) fail(label + ' must be a plain object');
    ownKeys(value).forEach(function (key) {
      if (BLOCKED_KEYS.indexOf(key) >= 0) fail(label + ' contains blocked key ' + key);
    });
  }

  function assertExactKeys(value, required, allowed, label) {
    var keys = ownKeys(value);
    required.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) fail(label + ' is missing ' + key);
    });
    keys.forEach(function (key) {
      if (allowed.indexOf(key) < 0) fail(label + ' contains unknown field ' + key);
    });
  }

  function cleanString(value, label) {
    if (typeof value !== 'string' || !value.length) fail(label + ' must be a non-empty string');
    if (value !== value.trim()) fail(label + ' must not have surrounding whitespace');
    if (CONTROL_CHARACTER.test(value)) fail(label + ' contains control characters');
    if (typeof value.normalize === 'function' && value !== value.normalize('NFC')) {
      fail(label + ' must use NFC Unicode');
    }
    return value;
  }

  function freezeModule(value, index, seen) {
    var label = 'modules[' + index + ']';
    assertObject(value, label);
    assertExactKeys(value, REQUIRED_FIELDS, ALLOWED_FIELDS, label);

    var id = cleanString(value.id, label + '.id');
    if (!MODULE_ID.test(id)) fail(label + '.id is not canonical');
    if (id !== EXPECTED_IDS[index]) fail(label + '.id must be ' + EXPECTED_IDS[index]);

    var expectedPath = 'modules/' + id + '/index.html';
    var file = cleanString(value.file, label + '.file');
    var src = cleanString(value.src, label + '.src');
    if (file !== expectedPath || src !== expectedPath || file !== src) {
      fail(label + ' must use the canonical local module path');
    }
    if (/^(?:[a-z]+:|\/\/)|[\\?#%]|(?:^|\/)\.\.?\//i.test(src)) {
      fail(label + '.src must be a relative local POSIX path');
    }
    if (!Number.isSafeInteger(value.bytes) || value.bytes <= 0) {
      fail(label + '.bytes must be a positive safe integer');
    }
    if (typeof value.sha256 !== 'string' || !HEX_64.test(value.sha256)) {
      fail(label + '.sha256 must be lowercase SHA-256 hex');
    }

    var title = cleanString(value.title, label + '.title');
    var short = cleanString(value.short, label + '.short');
    var category = cleanString(value.category, label + '.category');
    var icon = cleanString(value.icon, label + '.icon');
    var priority = cleanString(value.priority, label + '.priority');
    var subtitle = cleanString(value.subtitle, label + '.subtitle');
    var summary = cleanString(value.summary, label + '.summary');
    var sourceTitle;
    if (Object.prototype.hasOwnProperty.call(value, 'source_title')) {
      sourceTitle = cleanString(value.source_title, label + '.source_title');
    }

    [['id', id], ['path', src], ['title', title], ['short', short], ['sha256', value.sha256]]
      .forEach(function (entry) {
        var kind = entry[0];
        var candidate = entry[1];
        if (seen[kind][candidate]) fail('duplicate ' + kind + ' ' + candidate);
        seen[kind][candidate] = true;
      });

    var module = {
      id: id,
      title: title,
      short: short,
      category: category,
      icon: icon,
      priority: priority,
      file: file,
      subtitle: subtitle,
      summary: summary,
      bytes: value.bytes,
      sha256: value.sha256
    };
    if (sourceTitle !== undefined) module.source_title = sourceTitle;
    module.src = src;
    return Object.freeze(module);
  }

  function validate(input) {
    assertObject(input, 'manifest');
    assertExactKeys(input, ['schemaVersion', 'sharedAssets', 'modules'], ['schemaVersion', 'sharedAssets', 'modules'], 'manifest');
    if (input.schemaVersion !== 2) fail('schemaVersion must be 2');
    if (!Array.isArray(input.sharedAssets) || input.sharedAssets.length !== 33) fail('sharedAssets must contain exactly thirty-three entries');
    if (!Array.isArray(input.modules)) fail('modules must be an array');
    if (input.modules.length !== EXPECTED_IDS.length) {
      fail('modules must contain exactly ' + EXPECTED_IDS.length + ' entries');
    }
    var seen = {
      id: Object.create(null),
      path: Object.create(null),
      title: Object.create(null),
      short: Object.create(null),
      sha256: Object.create(null)
    };
    var modules = input.modules.map(function (module, index) {
      return freezeModule(module, index, seen);
    });
    var expectedShared = [
      { id: 'module-bridge', file: 'shared/module-bridge.js' },
      { id: 'module-runtime', file: 'shared/module-runtime.js' },
      { id: 'mah4-runtime', file: 'shared/mah4-runtime.js' },
      { id: 'module-uniform-css', file: 'shared/module-uniform.css' },
      { id: 'module-back-css', file: 'shared/module-back.css' },
      { id: 'module-employee-css', file: 'shared/module-employee.css' }
      ,{ id: 'module-mobile-common-css', file: 'shared/module-mobile-common.css' }
      ,{ id: 'module-brand-tokens-css', file: 'shared/module-brand-tokens.css' }
      ,{ id: 'module-responsive-css', file: 'shared/module-responsive.css' }
      ,{ id: 'module-ui-runtime', file: 'shared/module-ui-runtime.js' }
      ,{ id: 'module-table-css', file: 'shared/module-table.css' }
      ,{ id: 'module-table-runtime', file: 'shared/module-table-runtime.js' }
      ,{ id: 'module-components-css', file: 'shared/module-components.css' }
      ,{ id: 'module-rendered-components', file: 'shared/module-rendered-components.js' }
      ,{ id: 'stock-ui-css', file: 'modules/stock/stock-ui.css' }
      ,{ id: 'payroll-ui-css', file: 'modules/payroll/payroll-ui.css' }
      ,{ id: 'grooming-ui-css', file: 'modules/grooming/grooming-ui.css' }
      ,{ id: 'service-ui-css', file: 'modules/service/service-ui.css' }
      ,{ id: 'leave-ui-css', file: 'modules/leave/leave-ui.css' }
      ,{ id: 'cro-audit-ui-css', file: 'modules/cro_audit/cro-audit-ui.css' }
      ,{ id: 'tax-ui-css', file: 'modules/tax/tax-ui.css' }
      ,{ id: 'dsr-ui-css', file: 'modules/dsr/dsr-ui.css' }
      ,{ id: 'qms-view', file: 'modules/qms/qms-view.js' }
      ,{ id: 'qms-ui-css', file: 'modules/qms/qms-ui.css' }
      ,{ id: 'module-delete-cell-css', file: 'shared/module-delete-cell.css' }
      ,{ id: 'etp-verified-presentation', file: 'etp-verified-presentation.js' }
      ,{ id: 'etp-verified-analytics', file: 'etp-verified-analytics.js' }
      ,{ id: 'etp-analytics-consumer', file: 'etp-analytics-consumer.js' }
      ,{ id: 'etp-cro-reconciliation', file: 'etp-cro-reconciliation.js' }
      ,{ id: 'etp-target-planning', file: 'etp-target-planning.js' }
      ,{ id: 'etp-exception-monitor', file: 'etp-exception-monitor.js' }
      ,{ id: 'etp-incentive-control', file: 'etp-incentive-control.js' }
      ,{ id: 'etp-operations-consumer', file: 'etp-operations-consumer.js' }
    ];
    var frozenShared = input.sharedAssets.map(function(shared, index){
      var label='sharedAssets['+index+']', expected=expectedShared[index];
      assertObject(shared,label); assertExactKeys(shared,SHARED_REQUIRED_FIELDS,SHARED_REQUIRED_FIELDS,label);
      if(cleanString(shared.id,label+'.id')!==expected.id || shared.version!==1 || cleanString(shared.file,label+'.file')!==expected.file) fail('invalid shared runtime identity');
      if(!Number.isSafeInteger(shared.bytes)||shared.bytes<=0||typeof shared.sha256!=='string'||!HEX_64.test(shared.sha256)) fail('invalid shared runtime integrity');
      return Object.freeze({id:shared.id,version:1,file:shared.file,bytes:shared.bytes,sha256:shared.sha256});
    });
    return Object.freeze({ schemaVersion: 2, sharedAssets: Object.freeze(frozenShared), modules: Object.freeze(modules) });
  }

  var RAW_MANIFEST = /*__SAAGAR_MODULE_MANIFEST_START__*/{
  "schemaVersion": 2,
  "sharedAssets": [
    {
      "id": "module-bridge",
      "version": 1,
      "file": "shared/module-bridge.js",
      "bytes": 2656,
      "sha256": "768a25b0ea4bdd76c826b72a9ea99d78a16bf08aa0d47ec170d827d3b9114c43"
    },
    {
      "id": "module-runtime",
      "version": 1,
      "file": "shared/module-runtime.js",
      "bytes": 20392,
      "sha256": "e4c907a922ff7e944da250905b8c022132609fa871683b0816bf8aeb4f6dba47"
    },
    {
      "id": "mah4-runtime",
      "version": 1,
      "file": "shared/mah4-runtime.js",
      "bytes": 10068,
      "sha256": "458410440a3748c4b8a59726e25f8eb59d61588f79fdc1f0ae3fc235aa2d48e5"
    },
    {
      "id": "module-uniform-css",
      "version": 1,
      "file": "shared/module-uniform.css",
      "bytes": 6715,
      "sha256": "b90c167b7e61f6cf6f5abd010345052b52130221feecaa17e8065405d1c67fc8"
    },
    {
      "id": "module-back-css",
      "version": 1,
      "file": "shared/module-back.css",
      "bytes": 1967,
      "sha256": "c2de8d36022ef12c7828a9902731ad602e4e34de78772174892798533203bec3"
    },
    {
      "id": "module-employee-css",
      "version": 1,
      "file": "shared/module-employee.css",
      "bytes": 325,
      "sha256": "128dec9007df4bbb1234a21ed99c29582f2a08c47ce807ab5d73f8fc85bc0fd8"
    },
    {
      "id": "module-mobile-common-css",
      "version": 1,
      "file": "shared/module-mobile-common.css",
      "bytes": 26137,
      "sha256": "b8ae67010cb906861df2e858079106a1d76a122ccc6f2748b9090a843d7f67f2"
    },
    {
      "id": "module-brand-tokens-css",
      "version": 1,
      "file": "shared/module-brand-tokens.css",
      "bytes": 1479,
      "sha256": "89e5bcff9ea1b67ea1063d8caa80123e12367e23a1f9ab575ffa234ed8162f85"
    },
    {
      "id": "module-responsive-css",
      "version": 1,
      "file": "shared/module-responsive.css",
      "bytes": 1692,
      "sha256": "050413e0a6bd9969610c904775c77166576230d05cac3ab1c1d2bc0051aad05a"
    },
    {
      "id": "module-ui-runtime",
      "version": 1,
      "file": "shared/module-ui-runtime.js",
      "bytes": 2733,
      "sha256": "d4e5a0618905bf9e1127ea0c68439a477641df34bfdc0fdf4115aa0f4c9c0f30"
    },
    {
      "id": "module-table-css",
      "version": 1,
      "file": "shared/module-table.css",
      "bytes": 4094,
      "sha256": "b3004d7d944bdaa06ecdc35d95ff4e35891ae0482a16b4dae4c69130e8091990"
    },
    {
      "id": "module-table-runtime",
      "version": 1,
      "file": "shared/module-table-runtime.js",
      "bytes": 4827,
      "sha256": "cb8f46ab93b299469bf894179c1482980c59adb4634864d81510148000596e96"
    },
    {
      "id": "module-components-css",
      "version": 1,
      "file": "shared/module-components.css",
      "bytes": 5923,
      "sha256": "c2e64460d16f6852d82cd3ac74bb597c31c88ae1ac3f3b02fe58044c5ea089b6"
    },
    {
      "id": "module-rendered-components",
      "version": 1,
      "file": "shared/module-rendered-components.js",
      "bytes": 11387,
      "sha256": "22e393c60d0e656cf1aade9cfaf8108944aa2aedc87c074ebf9f9be5f07649ab"
    },
    {
      "id": "stock-ui-css",
      "version": 1,
      "file": "modules/stock/stock-ui.css",
      "bytes": 32833,
      "sha256": "0c661d393cef898f5e3d30bb55f21d575e52ec34640ffecea80a5f43b5828a4a"
    },
    {
      "id": "payroll-ui-css",
      "version": 1,
      "file": "modules/payroll/payroll-ui.css",
      "bytes": 50046,
      "sha256": "771aef10af6c75e176c1be930555992d99d6251ba9663062620f47b031f462c2"
    },
    {
      "id": "grooming-ui-css",
      "version": 1,
      "file": "modules/grooming/grooming-ui.css",
      "bytes": 20736,
      "sha256": "65a211ec63c7f383f18414a2edd145dfae98d13d3ae1b8540f226ea3df8b8201"
    },
    {
      "id": "service-ui-css",
      "version": 1,
      "file": "modules/service/service-ui.css",
      "bytes": 47207,
      "sha256": "3204554d562a4ef78df74dd4ab02dc288247acd6e8da0db8406c69cead8832dc"
    },
    {
      "id": "leave-ui-css",
      "version": 1,
      "file": "modules/leave/leave-ui.css",
      "bytes": 33346,
      "sha256": "bcf60690b54f04464195c8a5ab5229bc24860a97e711f4b407cbfa11b4f52828"
    },
    {
      "id": "cro-audit-ui-css",
      "version": 1,
      "file": "modules/cro_audit/cro-audit-ui.css",
      "bytes": 30980,
      "sha256": "fee92fd1f3c3f0cfc4c0ef13f7ced5772fa305a6a61b383e45a33600b8c8b42a"
    },
    {
      "id": "tax-ui-css",
      "version": 1,
      "file": "modules/tax/tax-ui.css",
      "bytes": 43128,
      "sha256": "acd9a5fa82f71c7e864fc27333f3f668aef65b7cb83a0c8f4ac55c71cdf9a352"
    },
    {
      "id": "dsr-ui-css",
      "version": 1,
      "file": "modules/dsr/dsr-ui.css",
      "bytes": 47602,
      "sha256": "701dbfcad1c431bbaf60b9159d7fc85433bd1825b048149db37e83b39574b747"
    },
    {
      "id": "qms-view",
      "version": 1,
      "file": "modules/qms/qms-view.js",
      "bytes": 4711,
      "sha256": "ef3f136937c3674980996b3da6fb67b6f27d008c0be7627c4e7c490185d25a6b"
    },
    {
      "id": "qms-ui-css",
      "version": 1,
      "file": "modules/qms/qms-ui.css",
      "bytes": 24920,
      "sha256": "d775c662072958c3697a7b2a36ec45fd27cfb011cb5dae8dc0d0edc817ac73c4"
    },
    {
      "id": "module-delete-cell-css",
      "version": 1,
      "file": "shared/module-delete-cell.css",
      "bytes": 311,
      "sha256": "240ace998628aa92a455791534ed300d8bde3af557405468a4916f980e0ade5b"
    },
    {
      "id": "etp-verified-presentation",
      "version": 1,
      "file": "etp-verified-presentation.js",
      "bytes": 24310,
      "sha256": "d7ad933716c4a85b2b4ac5f94f0c4aa5cc769dca3e4c0b2e2d154ca344572b5d"
    },
    {
      "id": "etp-verified-analytics",
      "version": 1,
      "file": "etp-verified-analytics.js",
      "bytes": 11412,
      "sha256": "5fb9eda540b062a4209c00186f9dbbe91637ad8f47b35a0846686a48c2eca1ce"
    },
    {
      "id": "etp-analytics-consumer",
      "version": 1,
      "file": "etp-analytics-consumer.js",
      "bytes": 4850,
      "sha256": "a069996397f4720aeeb392544f35232939039dde6e69f61572df9a3223ef48a0"
    },
    {
      "id": "etp-cro-reconciliation",
      "version": 1,
      "file": "etp-cro-reconciliation.js",
      "bytes": 12226,
      "sha256": "a0c057dbc972915db0d403f8fab90f76935f21253c38a5f366003f7b5d953cd4"
    },
    {
      "id": "etp-target-planning",
      "version": 1,
      "file": "etp-target-planning.js",
      "bytes": 15967,
      "sha256": "87d4c98e685063ed1a8ddf541a7da53c5469d324588ec72513333c8df3dd5ede"
    },
    {
      "id": "etp-exception-monitor",
      "version": 1,
      "file": "etp-exception-monitor.js",
      "bytes": 15570,
      "sha256": "a51e2b4f9c47e4c79ea2ae27d3d9fe1f01bc9e26bf9eed5979605ee4c9984b8e"
    },
    {
      "id": "etp-incentive-control",
      "version": 1,
      "file": "etp-incentive-control.js",
      "bytes": 8501,
      "sha256": "b832edf6ed7da38807bbd8103c05793f069bce9ecd7a123435ce3f71272ff327"
    },
    {
      "id": "etp-operations-consumer",
      "version": 1,
      "file": "etp-operations-consumer.js",
      "bytes": 1633,
      "sha256": "59cef49ac2ce4b4836d9fdc49b9b8412da1da5429f0227da21d6ecbda33993e9"
    }
  ],
  "modules": [
    {
      "id": "stock",
      "title": "Stock Register",
      "short": "Stock",
      "category": "Operations",
      "icon": "📦",
      "priority": "High control",
      "file": "modules/stock/index.html",
      "subtitle": "Daily opening, inward, sale, transfer, return, physical and closing stock control.",
      "summary": "Inventory movement and variance control for store operations.",
      "bytes": 167716,
      "sha256": "548d1f4f5e1b1b4b9b04f14ec73c73537fb7ca470094055afb34379ff229392d",
      "source_title": "Saagar Traders — Daily Stock Register v3",
      "src": "modules/stock/index.html"
    },
    {
      "id": "service",
      "title": "Watch Service Centre",
      "short": "Service",
      "category": "Operations",
      "icon": "⌚",
      "priority": "Live tracking",
      "file": "modules/service/index.html",
      "subtitle": "Job cards, repair stages, customer tracking, delivery and billing support.",
      "summary": "End-to-end watch repair and service-centre workflow.",
      "bytes": 192878,
      "sha256": "492689a8d982e3bfc648cb12e9cb60c189f2034675bf3c11742bdef3d199c56c",
      "source_title": "Watch Service Centre — Saagar Traders",
      "src": "modules/service/index.html"
    },
    {
      "id": "qms",
      "title": "Queue Management",
      "short": "Queue",
      "category": "Operations",
      "icon": "🎯",
      "priority": "Live floor",
      "file": "modules/qms/index.html",
      "subtitle": "Walk-in capture, CRO rotation, lead closure (sale / service / non-purchase) and follow-ups.",
      "summary": "Front-desk queue + CRO rotation. Closures auto-fill the Daily Staff Register.",
      "bytes": 149652,
      "sha256": "927790da02217cc920c87573cd1cd7494736342655949acd2e55b8bc2e6eb6aa",
      "src": "modules/qms/index.html"
    },
    {
      "id": "dsr",
      "title": "CRO Login",
      "short": "CRO Login",
      "category": "Operations",
      "icon": "📋",
      "priority": "Daily accountability",
      "file": "modules/dsr/index.html",
      "subtitle": "Per-CRO daily log: opening, in/out, sales, non-purchase, tasks, marketing, cleaning (photo), closing, SM audit.",
      "summary": "CRO daily accountability hub; receives QMS auto-fill; rolls counts up to Stock.",
      "bytes": 142125,
      "sha256": "f692513e0ae4ca2c23f3d81d1c255e8a292a74b2d67280e0c0b93421f767e9f9",
      "src": "modules/dsr/index.html"
    },
    {
      "id": "expense",
      "title": "Expense Manager — Central Ledger",
      "short": "Expense",
      "category": "Finance",
      "icon": "₹",
      "priority": "Approval safe",
      "file": "modules/expense/index.html",
      "subtitle": "Central financial ledger: income/expense, auto-locked daily cash statement, cross-module feeds, maker-checker.",
      "summary": "Single master ledger with auto cash reconciliation and WSC/Payroll/Stock/QMS integration.",
      "bytes": 168863,
      "sha256": "d668b8381edf654c54467ac39e1832de2e5b440186d037a9efbe981b2419b99c",
      "source_title": "Tanishq Gold Mart · Expense Manager",
      "src": "modules/expense/index.html"
    },
    {
      "id": "grooming",
      "title": "Grooming Checklist",
      "short": "Grooming",
      "category": "Staff",
      "icon": "✅",
      "priority": "Daily discipline",
      "file": "modules/grooming/index.html",
      "subtitle": "Daily staff presentation checklist, scoring and monthly records.",
      "summary": "Readiness and staff grooming compliance tracker.",
      "bytes": 64778,
      "sha256": "6ae521a672e18bc85fb89649b7928b2bb94b6c3a380e4cb9ffe651d2cdd4d396",
      "source_title": "Saagar Traders — Grooming Checklist",
      "src": "modules/grooming/index.html"
    },
    {
      "id": "cro_audit",
      "title": "Store Manager",
      "short": "Store Manager",
      "category": "Staff",
      "icon": "🎖️",
      "priority": "Daily rubric",
      "file": "modules/cro_audit/index.html",
      "subtitle": "10-task daily CRO performance rubric with store/CRO/SM selectors, dashboard trends and targets.",
      "summary": "Daily 10-point CRO scoring; pulls grooming score; trend dashboard.",
      "bytes": 109254,
      "sha256": "e2ee0550b4019b43af08ecce96d9fd32a5c820b8268b5889944904ceb2749db2",
      "src": "modules/cro_audit/index.html"
    },
    {
      "id": "payroll",
      "title": "Saagar Traders — Payroll",
      "short": "Payroll",
      "category": "Staff",
      "icon": "💰",
      "priority": "Payroll safe",
      "file": "modules/payroll/index.html",
      "subtitle": "Saagar Traders Payroll Suite — attendance, salary days, deductions, statutory, PDF/Excel payslips. Data key unchanged.",
      "summary": "Latest Saagar Traders payroll (single-file, offline). Same payroll_suite_v1_2026 data as before.",
      "bytes": 219484,
      "sha256": "4f2fe1c64fc6262e510d37db15ab24f1ec0e9f57a3d9a56d1f038863a409102f",
      "source_title": "Gold Mart Group — Payroll Suite",
      "src": "modules/payroll/index.html"
    },
    {
      "id": "leave",
      "title": "Staff Leave Calendar",
      "short": "Leave",
      "category": "Planning",
      "icon": "🗓️",
      "priority": "Capacity view",
      "file": "modules/leave/index.html",
      "subtitle": "Leave planning, holiday visibility and staff availability calendar.",
      "summary": "Team leave management and availability control.",
      "bytes": 136545,
      "sha256": "2a5e6cea877d8bbbf233f72f096fd3b2d591614efb7cf90b4150f48fadd19e90",
      "source_title": "Staff Leave Manager",
      "src": "modules/leave/index.html"
    },
    {
      "id": "tax",
      "title": "Tax Compliance Calendar",
      "short": "Compliance",
      "category": "Compliance",
      "icon": "🛡️",
      "priority": "Deadline control",
      "file": "modules/tax/index.html",
      "subtitle": "GST, TDS and statutory compliance due-date operating calendar.",
      "summary": "Indian statutory deadline tracker with compliance status controls.",
      "bytes": 191063,
      "sha256": "9da8a3b4107342d99efbed44395c5372f03d7594da342115d2d27d8ac4ffa8a1",
      "source_title": "Compliance Operating System — Indian Firms v2",
      "src": "modules/tax/index.html"
    },
    {
      "id": "planning",
      "title": "Festival & Season Planner",
      "short": "Planning",
      "category": "Planning",
      "icon": "🎊",
      "priority": "Seasonal targets",
      "file": "modules/planning/index.html",
      "subtitle": "Festival targets, pre-season prep checklists and staff leave-blackout windows.",
      "summary": "Plan peak seasons — targets vs QMS actuals, prep checklists and leave-freeze dates.",
      "bytes": 14670,
      "sha256": "dad7b6707f30cb5c8d94cddab3d218779118b817d896bc2d668a77e753a6bffb",
      "src": "modules/planning/index.html"
    },
    {
      "id": "etp",
      "title": "Retail ETP Reports",
      "short": "Retail ETP",
      "category": "Reports",
      "icon": "📊",
      "priority": "Verified reporting",
      "file": "modules/etp/index.html",
      "subtitle": "Secure Retail ETP import, verified reports, coverage history and reconciliation controls.",
      "summary": "Reports-owned shell for governed R003, R013, R022 and R025 workflows.",
      "bytes": 37489,
      "sha256": "c7a19c4e33c934f8fb93246c7939836e8f8b9a6d1b7b3e1401c905c8c5d60b2f",
      "src": "modules/etp/index.html"
    }
  ]
}/*__SAAGAR_MODULE_MANIFEST_END__*/;

  var manifest = validate(RAW_MANIFEST);
  var byId = Object.create(null);
  manifest.modules.forEach(function (module) { byId[module.id] = module; });
  Object.freeze(byId);

  return Object.freeze({
    schemaVersion: manifest.schemaVersion,
    sharedAssets: manifest.sharedAssets,
    modules: manifest.modules,
    ids: EXPECTED_IDS,
    get: function (id) { return byId[String(id)] || null; },
    getShared: function (id) { for(var i=0;i<manifest.sharedAssets.length;i++)if(manifest.sharedAssets[i].id===id)return manifest.sharedAssets[i];return null; },
    has: function (id) { return !!byId[String(id)]; },
    validate: validate
  });
});
