/*
 * Build-time-only wiring for the synthetic ETP demo layer.
 *
 * The demo implementation lives in build-overrides/demo/ and is NEVER part of
 * www/ (production). scripts/build-seeded-apk.mjs injects the loader, the three
 * exact source patches below and the demo file into the GENERATED Android assets
 * only, and restores a clean generated tree afterwards. Owner decision given in
 * chat, 2026-11-11 (D-A, D-B): production carries no demo route.
 *
 * Every "before" string is code (no comment text) and must occur exactly once in
 * the production www file it targets.
 */
export const DEMO_SOURCE_RELATIVE = 'build-overrides/demo/etp-demo-operational.js';
export const DEMO_PUBLIC_NAME = 'etp-demo-operational.js';
export const DEMO_LOADER_STATEMENT =
  "document.write('<scr'+'ipt src=\"etp-demo-operational.js\"><\\/scr'+'ipt>');";

const ANCHOR_E7 =
  "      document.getElementById('etpE7Refresh').addEventListener('click', refreshServiceVerification);\n";

export const DEMO_FILE_PATCHES = Object.freeze([
  Object.freeze({
    file: 'shared/module-bridge.js',
    before: "    etpReadGateway: getter(function () { var gateway = parentValue('SaagarEtpModuleGateway'); return gateway && gateway.readFacade; }),\n",
    after: "    etpReadGateway: getter(function () { var demo = parentValue('SaagarEtpDemoOperational'), gateway = parentValue('SaagarEtpModuleGateway'); return demo && demo.syntheticOnly === true && demo.readGateway ? demo.readGateway : gateway && gateway.readFacade; }),\n"
  }),
  Object.freeze({
    file: 'etp-operational-shell-composer.js',
    before: "    var r=rec(options)&&dependencies(options.root),scope=r&&typeof options.getScope==='function'?cleanScope(options.getScope()):null,roots=options&&options.roots;\n",
    after:
      "    var suppliedRoot=rec(options)&&options.root,demo=suppliedRoot&&suppliedRoot.SaagarEtpDemoOperational;\n" +
      "    if(demo&&demo.syntheticOnly===true&&typeof demo.composeRetail==='function')return demo.composeRetail({root:suppliedRoot,roots:options.roots,getScope:options.getScope});\n" +
      "    var r=dependencies(suppliedRoot),scope=r&&typeof options.getScope==='function'?cleanScope(options.getScope()):null,roots=options&&options.roots;\n"
  }),
  Object.freeze({
    file: 'modules/etp/index.html',
    before: ANCHOR_E7,
    after:
      ANCHOR_E7 +
      "      var demoService=serviceBridge();\n" +
      "      if(demoService&&demoService.demoSynthetic===true&&demoService.defaultScope){\n" +
      "        document.getElementById('etpE7ServiceUnit').value=demoService.defaultScope.serviceUnitId;\n" +
      "        document.getElementById('etpE7PeriodId').value=demoService.defaultScope.periodId;\n" +
      "        document.getElementById('etpE7PeriodStart').value=demoService.defaultScope.periodStart;\n" +
      "        document.getElementById('etpE7PeriodEnd').value=demoService.defaultScope.periodEnd;\n" +
      "      }\n"
  })
]);

/** Replace the single occurrence of patch.before; throw on 0 or 2+ occurrences. */
export function applyDemoPatch(source, patch) {
  const text = String(source);
  const first = text.indexOf(patch.before);
  if (first < 0) throw new Error(`demo patch ${patch.file}: anchor not found`);
  if (first !== text.lastIndexOf(patch.before)) {
    throw new Error(`demo patch ${patch.file}: anchor is not unique`);
  }
  return text.slice(0, first) + patch.after + text.slice(first + patch.before.length);
}
