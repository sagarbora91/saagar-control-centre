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
    'planning'
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
    if (!Array.isArray(input.sharedAssets) || input.sharedAssets.length !== 9) fail('sharedAssets must contain exactly nine entries');
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
      ,{ id: 'module-delete-cell-css', file: 'shared/module-delete-cell.css' }
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
      "bytes": 2380,
      "sha256": "584dd7ea16488d1ee791d95a39c43101063d43b4843a40b66bba9400de61d396"
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
      "bytes": 10062,
      "sha256": "5561f54e7307676f44d2aa0b607f6c69a49e0d48c44d15d61b7cddbb9af7d9ec"
    },
    {
      "id": "module-uniform-css",
      "version": 1,
      "file": "shared/module-uniform.css",
      "bytes": 5651,
      "sha256": "55f3520beb1d38f31a53ead823515474d5e34a0f8fd4becc6ac348322ec85b64"
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
      "bytes": 1080,
      "sha256": "3eeee52dcb2070d8e58482040fb855857d5092aad22641a7852ae0af899c2e0b"
    },
    {
      "id": "module-brand-tokens-css",
      "version": 1,
      "file": "shared/module-brand-tokens.css",
      "bytes": 675,
      "sha256": "4043d4f67d83e6ed45a0dc8addfb6d6903fa5df5e1126ac296ffef743b1c951c"
    },
    {
      "id": "module-delete-cell-css",
      "version": 1,
      "file": "shared/module-delete-cell.css",
      "bytes": 311,
      "sha256": "240ace998628aa92a455791534ed300d8bde3af557405468a4916f980e0ade5b"
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
      "bytes": 220437,
      "sha256": "e7cdaa3ae1827a7aa8431b1c1afebfe1e1fc04465543fae77945e7bc6633101f",
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
      "bytes": 258648,
      "sha256": "0fbeac3998b69ecfa560614f8f0c96793212f9261b3bfc576b05d71706beebe8",
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
      "bytes": 192894,
      "sha256": "03a517313a2439790383c45c2db1725df2c27c9b426dd78661db63bffc4beca4",
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
      "bytes": 203937,
      "sha256": "f317e96f7c1dd2fb0be674b8f05a950888d9c7b0b95860dd98553a1b344875c6",
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
      "bytes": 184024,
      "sha256": "68a835aeb9bcc3cee3508b1d2faba4d83c26155153ac3cc01ccb1cee7c3f82e9",
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
      "bytes": 109216,
      "sha256": "e096a4e963b16ef317e9f4464626dec986c7d41be7147063dcda59ebeb486ce7",
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
      "bytes": 160820,
      "sha256": "04a7659452dbdd36c315d3eb98a222f8aadefc8ff4bfbff091e1343b00912c6a",
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
      "bytes": 288922,
      "sha256": "c9f12ed76515c5b37406dcafe098831c700238324d9a5d9bd5f9d3803140122e",
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
      "bytes": 187307,
      "sha256": "acfa2dd051d29419e5c28f814ec665b155da7d513128390337cd986f7a99adc3",
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
      "bytes": 251381,
      "sha256": "99f67a55ac22d791d4c84b18554731cb85bfd08e8d23e5d454c9f72c41880bda",
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
      "bytes": 39564,
      "sha256": "5788a6a12ff0e2073ab3d828061c80e2c2e50e80975d759403dc59fc92f9833f",
      "src": "modules/planning/index.html"
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
