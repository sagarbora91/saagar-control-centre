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
    assertExactKeys(input, ['schemaVersion', 'modules'], ['schemaVersion', 'modules'], 'manifest');
    if (input.schemaVersion !== 1) fail('schemaVersion must be 1');
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
    return Object.freeze({ schemaVersion: 1, modules: Object.freeze(modules) });
  }

  var RAW_MANIFEST = /*__SAAGAR_MODULE_MANIFEST_START__*/{
    "schemaVersion": 1,
    "modules": [
      {"id":"stock","title":"Stock Register","short":"Stock","category":"Operations","icon":"📦","priority":"High control","file":"modules/stock/index.html","subtitle":"Daily opening, inward, sale, transfer, return, physical and closing stock control.","summary":"Inventory movement and variance control for store operations.","bytes":245505,"sha256":"ed68caabc751169a709724f61ac020f5c22e29848ec6bc1e6c80f971f639fdaf","source_title":"Saagar Traders — Daily Stock Register v3","src":"modules/stock/index.html"},
      {"id":"service","title":"Watch Service Centre","short":"Service","category":"Operations","icon":"⌚","priority":"Live tracking","file":"modules/service/index.html","subtitle":"Job cards, repair stages, customer tracking, delivery and billing support.","summary":"End-to-end watch repair and service-centre workflow.","bytes":282830,"sha256":"e0db7a13391e05be952c47c451748644f3c571a1b9ddf4457445607ca0c98be4","source_title":"Watch Service Centre — Saagar Traders","src":"modules/service/index.html"},
      {"id":"qms","title":"Queue Management","short":"Queue","category":"Operations","icon":"🎯","priority":"Live floor","file":"modules/qms/index.html","subtitle":"Walk-in capture, CRO rotation, lead closure (sale / service / non-purchase) and follow-ups.","summary":"Front-desk queue + CRO rotation. Closures auto-fill the Daily Staff Register.","bytes":214499,"sha256":"66beddf0dd7d7638d3171ad03b7cae9a6eef71727610e633b497ad479d24d806","src":"modules/qms/index.html"},
      {"id":"dsr","title":"CRO Login","short":"CRO Login","category":"Operations","icon":"📋","priority":"Daily accountability","file":"modules/dsr/index.html","subtitle":"Per-CRO daily log: opening, in/out, sales, non-purchase, tasks, marketing, cleaning (photo), closing, SM audit.","summary":"CRO daily accountability hub; receives QMS auto-fill; rolls counts up to Stock.","bytes":229752,"sha256":"a67e37ccb6e6c484ae6d4b8f27ee32cde623838171a57a518c177cdfabf7faca","src":"modules/dsr/index.html"},
      {"id":"expense","title":"Expense Manager — Central Ledger","short":"Expense","category":"Finance","icon":"₹","priority":"Approval safe","file":"modules/expense/index.html","subtitle":"Central financial ledger: income/expense, auto-locked daily cash statement, cross-module feeds, maker-checker.","summary":"Single master ledger with auto cash reconciliation and WSC/Payroll/Stock/QMS integration.","bytes":209977,"sha256":"c1e7986e4e29b91901dd29b4b0ebcd457e0f5fa5836a28b8d76bb4abeeff11fa","source_title":"Tanishq Gold Mart · Expense Manager","src":"modules/expense/index.html"},
      {"id":"grooming","title":"Grooming Checklist","short":"Grooming","category":"Staff","icon":"✅","priority":"Daily discipline","file":"modules/grooming/index.html","subtitle":"Daily staff presentation checklist, scoring and monthly records.","summary":"Readiness and staff grooming compliance tracker.","bytes":130194,"sha256":"fcc935c6ac50c19746b6bb8bb6b5766beb3a0517cf17d10ddba041fe00f7a188","source_title":"Saagar Traders — Grooming Checklist","src":"modules/grooming/index.html"},
      {"id":"cro_audit","title":"Store Manager","short":"Store Manager","category":"Staff","icon":"🎖️","priority":"Daily rubric","file":"modules/cro_audit/index.html","subtitle":"10-task daily CRO performance rubric with store/CRO/SM selectors, dashboard trends and targets.","summary":"Daily 10-point CRO scoring; pulls grooming score; trend dashboard.","bytes":182489,"sha256":"ca03b8645ce2fb1b208bcd69a224379a6563ebf92c2ced434952f268858fd5b4","src":"modules/cro_audit/index.html"},
      {"id":"payroll","title":"Saagar Traders — Payroll","short":"Payroll","category":"Staff","icon":"💰","priority":"Payroll safe","file":"modules/payroll/index.html","subtitle":"Saagar Traders Payroll Suite — attendance, salary days, deductions, statutory, PDF/Excel payslips. Data key unchanged.","summary":"Latest Saagar Traders payroll (single-file, offline). Same payroll_suite_v1_2026 data as before.","bytes":310105,"sha256":"f20c555b7e88c1214ec07b6134b7dfe782356ef7396b6d0e4a45f0c958e676a6","source_title":"Gold Mart Group — Payroll Suite","src":"modules/payroll/index.html"},
      {"id":"leave","title":"Staff Leave Calendar","short":"Leave","category":"Planning","icon":"🗓️","priority":"Capacity view","file":"modules/leave/index.html","subtitle":"Leave planning, holiday visibility and staff availability calendar.","summary":"Team leave management and availability control.","bytes":208655,"sha256":"d0e303d489c0e87f6abfaf4637e37515ec4b5cbcd10043f060297916c8f5c2fe","source_title":"Staff Leave Manager","src":"modules/leave/index.html"},
      {"id":"tax","title":"Tax Compliance Calendar","short":"Compliance","category":"Compliance","icon":"🛡️","priority":"Deadline control","file":"modules/tax/index.html","subtitle":"GST, TDS and statutory compliance due-date operating calendar.","summary":"Indian statutory deadline tracker with compliance status controls.","bytes":272538,"sha256":"35749a744b2bd88caca0aca80b26a0a257a4a3d63d3fe886c9c17c11fee9f5f9","source_title":"Compliance Operating System — Indian Firms v2","src":"modules/tax/index.html"},
      {"id":"planning","title":"Festival & Season Planner","short":"Planning","category":"Planning","icon":"🎊","priority":"Seasonal targets","file":"modules/planning/index.html","subtitle":"Festival targets, pre-season prep checklists and staff leave-blackout windows.","summary":"Plan peak seasons — targets vs QMS actuals, prep checklists and leave-freeze dates.","bytes":60724,"sha256":"85bdf7c272a33a8ac761aafb5d0560fbae7f063eeb280af4f4cc4e129c574d1f","src":"modules/planning/index.html"}
    ]
  }/*__SAAGAR_MODULE_MANIFEST_END__*/;

  var manifest = validate(RAW_MANIFEST);
  var byId = Object.create(null);
  manifest.modules.forEach(function (module) { byId[module.id] = module; });
  Object.freeze(byId);

  return Object.freeze({
    schemaVersion: manifest.schemaVersion,
    modules: manifest.modules,
    ids: EXPECTED_IDS,
    get: function (id) { return byId[String(id)] || null; },
    has: function (id) { return !!byId[String(id)]; },
    validate: validate
  });
});
