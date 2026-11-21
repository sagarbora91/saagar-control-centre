import crypto from 'node:crypto';
import { undoFixWaveText } from './fix-wave-undo.mjs';

const INDEX_SHA256 = 'dc9a5832bcad119b5794df210bb95b40db15293b515f91b497045bd27d9d395c';
const MANIFEST_SHA256 = '4a2b046c3baa24434c11eb7c0ecffa8c2caac8617373a52bf75bdfd7f38fab78';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

// Phase 4C comment trim (owner decision given in chat, 2026-11-11): 21 whole-line comment edits that never move a line.
// Entries are [trimmedLine, originalLine]; the inverse is a whole-line map so it cannot hit another occurrence.
const SHELL_COMMENT_TRIM_INVERSE = new Map([
  ["  // Stable ids and...", "  // Stable ids and dismiss/snooze state are applied only after role filtering, so the cache and modal cannot reveal hidden-module items."],
  ["const STAFF_PIN_KEY        = \"saagar_staff_pins_v1\";      // #28: side-map {...", "const STAFF_PIN_KEY        = \"saagar_staff_pins_v1\";      // #28: side-map { empId: \"v3:<salt>:<digest>\" } of per-staff sign-in PINs (v2-era entries still verify + migrate to v3 on success)"],
  ["    // flag ON: gather...", "    // flag ON: gather photos + the on-disk QMS archive + evidence in parallel, then emit ONE self-contained bundle (async)"],
  ["    // that is intended...", "    // that is intended (proves minting works; W2-S2b reuses the same KEK). Production auto-boot mints nothing."],
  ["  // rec#10...", "  // rec#10: yesterday's QMS for the vs-delta. Anchor at NOON (not midnight) so the -1-day math is"],
  ["    // memory and its...", "    // memory and its next save() would re-write (un-archive) everything. The archive is already durable, so"],
  ["  // QMS: preserve...", "  // QMS: preserve untagged legacy data as explicitly organisation-wide; filter only when tags exist."],
  ["    // preview()...", "    // preview(); pack() builds; generate()/build() build; preview() builds + renders via pdf.js."],
  ["  // Expense...", "  // Expense: canonical day total excludes income and void rows before applying store scope."],
  ["  // Service: dateRec...", "  // Service: dateRec is the canonical intake date. Untagged rows stay visibly organisation-wide."],
  ["  // Cash /mismatch/i...", "  // Cash /mismatch/i (step 4) copy-ban discipline so other area-'Stock' hub items (e.g. the P1-7"],
  ["  // Grouped view...", "  // Grouped view only in the default state (All + no search); otherwise a single flat group."],
  ["    // immediately on...", "    // immediately on open, instead of waiting for the bridge's 60s cycle. publishOrg is additive"],
  ["/* Native print... */", "/* Native print from the preview (works on desktop / devices where window.print() is real). */"],
  ["      // Where a module...", "      // Where a module already exposes a tab switcher, best-effort call it by a few common names."],
  ["  // bcc.sqlite(+.bak/...", "  // bcc.sqlite(+.bak/.tmp) + WAL + 'migrated' marker + photos + native LS (and re-stamp the demo"],
  ["    // openHub() shows...", "    // openHub() shows the chooser UI with no libs of its own, but every action inside it needs"],
  ["  // bottom-nav keeps...", "  // bottom-nav keeps Home lit and CSS uses [data-view] to lay it out inline on wide screens."],
  ["  // Mirror the...", "  // Mirror the hero's date stepper into the Today header (calls the SAME date-nav fns)"],
  ["    // Firms (Phase 2)...", "    // Firms (Phase 2): push the Organisation master into Payroll (firmName) + Tax (firm list)"],
  ["  // Stock: canonical...", "  // Stock: canonical resolver de-duplicates internal-key and legacy-code aliases per store."],
]);

export function restorePrePhase6gShellAssets(input) {
  let index = undoFixWaveText('www/index.html', String(input.index));
  // Phase 4C startup defer (owner decision given in chat, 2026-11-11): 27 shell tags carry `defer` now.
  // No historical shell contains a `defer` script tag, so one global restore is exact for all 27.
  index = index.replaceAll('<script defer src="', '<script src="');
  // Phase 4C on-demand ETP chain (owner decision given in chat, 2026-11-12): loader tag and its one-property helper export.
  index = index
    .replace('<script src="etp-chain-loader.js"></script>\n', '')
    .replace("  window.__SaagarPdfLibs = { ensure: ensure, ready: ready, injectEtp: function(src){ return /^etp-[a-z0-9-]+\\.js$/.test(String(src)) ? injectOne(src) : Promise.reject(new Error('Blocked script')); } };", '  window.__SaagarPdfLibs = { ensure: ensure, ready: ready };');
  // Global search v1 (owner decision given in chat, 2026-11-12): deferred tag, top-bar button, Modules-box role guard.
  index = index
    .replace('<script src="shared/shell-search.js"></script>\n', '')
    .replace(/      <button data-action="open-global-search"[^\n]*\n/, '')
    .replace('    if(!m||!moduleVisibleForRole(f.module)) return false;\n', '    if(!m) return false;\n');
  // ETP report-engine bridge, tablet side (owner decisions given in chat, 2026-11-12): four synchronous tags after the operations consumer.
  index = index
    .replace('<script src="etp-bridge-trust.js"></script>\n', '')
    .replace('<script src="etp-bridge-pack-verifier.js"></script>\n', '')
    .replace('<script src="etp-bridge-compare.js"></script>\n', '')
    .replace('<script src="etp-bridge-facade.js"></script>\n', '');
  index = index.split('\n').map(line => {
    const cr = line.endsWith('\r'), key = cr ? line.slice(0, -1) : line;
    return SHELL_COMMENT_TRIM_INVERSE.has(key) ? SHELL_COMMENT_TRIM_INVERSE.get(key) + (cr ? '\r' : '') : line;
  }).join('\n');
  index = index
    // Phase 6J release-label approval is newer than the frozen pre-6G shell authority.
    // Matched on structure, not on the current build number, so later version changes do not break it.
    .replace(/<span class="version-pill">[^<]*<\/span>/, '<span class="version-pill">V5.5</span>')
    .replace(/<span id="aboutShell">[^<]*<\/span>/, '<span id="aboutShell">V5.5</span>')
    .replace(/<span id="aboutBuild">[^<]*<\/span>/, '<span id="aboutBuild">2.9</span>')
    // Commit 605002f: the seeded-build-guarded synthetic demo loader is newer than the pre-6G shell authority.
    .replace(/\/\* The operational ETP demo layer is parser-loaded only after the strict boolean\r?\n   seed guard\. Clean builds cannot construct synthetic authority or service facades\. \*\/\r?\ndocument\.write\('<scr'\+'ipt src="etp-demo-operational\.js"><\\\/scr'\+'ipt>'\);\r?\n/, '')
    .replace('<script src="etp-verified-analytics.js"></script>\n', '')
    .replace('<script src="etp-analytics-consumer.js"></script>\n', '')
    .replace('<script src="etp-cro-reconciliation.js"></script>\n', '')
    .replace('<script src="etp-operational-foundation.js"></script>\n', '')
    .replace('<script src="etp-operational-store.js"></script>\n', '')
    .replace('<script src="etp-operational-adapters.js"></script>\n', '')
    .replace('<script src="etp-operational-runtime.js"></script>\n', '')
    .replace('<script src="etp-e4-authority-intake.js"></script>\n', '')
    .replace('<script src="etp-e6-authority-intake.js"></script>\n', '')
    .replace('<script src="etp-e5-authority-intake.js"></script>\n', '')
    .replace('<script src="etp-e7-authority-intake.js"></script>\n', '')
    .replace('<script src="etp-e7-service-verifier.js"></script>\n', '')
    .replace('<script src="etp-e7-service-operational.js"></script>\n', '')
    .replace('<script src="etp-target-planning.js"></script>\n', '')
    .replace('<script src="etp-e3-orchestrator.js"></script>\n', '')
    .replace('<script src="etp-e3-presentation.js"></script>\n', '')
    .replace('<script src="etp-e4-orchestrator.js"></script>\n', '')
    .replace('<script src="etp-e4-presentation.js"></script>\n', '')
    .replace('<script src="etp-e6-presentation.js"></script>\n', '')
    .replace('<script src="etp-e5-presentation.js"></script>\n', '')
    .replace('<script src="etp-operational-i18n.js"></script>\n', '')
    .replace('<script src="etp-e5-payroll-bridge.js"></script>\n', '')
    .replace('<script src="etp-operational-gateway.js"></script>\n', '')
    .replace('<script src="etp-operational-mount.js"></script>\n', '')
    .replace('<script src="etp-e3-verified-join.js"></script>\n', '')
    .replace('<script src="etp-operational-bootstrap.js"></script>\n', '')
    .replace('<script src="etp-operational-shell-composer.js"></script>\n', '')
    .replace('<script src="etp-exception-monitor.js"></script>\n', '')
    .replace('<script src="etp-incentive-control.js"></script>\n', '')
    .replace('<script src="etp-operations-consumer.js"></script>\n', '')
    .replace(/\n      <!-- Phase 6H\.1: sanitized, read-only ETP E2 summary; never a declaration\. -->\n      <div class="card card-pad etp-e2-home" id="etpAnalyticsHome" aria-live="polite"><\/div>\n/, '')
    .replace('  try{ renderEtpAnalyticsHome(); }catch(e){} // Phase 6H.1: verified ETP only; never declaration totals.\n', '')
    .replace('      <div class="card card-pad etp-e6-home" id="etpExceptionHome" aria-live="polite"></div>\n', '')
    .replace('  try{ renderEtpExceptionHome(); }catch(e){} // Phase 6H.4: sanitized controlled-state summary; never raw evidence.\n', '')
    .replace(/function renderEtpExceptionHome\(\)\{[\s\S]*?\n\}\n(?=\/\* TODAY DETAIL)/, '')
    .replace(/var __etpHomeAnalyticsSeq=0;\nasync function renderEtpAnalyticsHome\(\)\{[\s\S]*?\n\}\n(?=\/\* TODAY DETAIL)/, '')
    .replace(/<script>try\{var __nativeAuthority[\s\S]*?<\/script>/,
      "<script>try{var __nativeAuthority=localStorage.getItem('saagar_native_store_migrated_v1')==='1';var __m=__nativeAuthority?null:localStorage.getItem('saagar_ui_mode');var __mob=(__m==='mobile')||(__m!=='desktop'&&(window.innerWidth||document.documentElement.clientWidth||0)<900);if(__mob)document.documentElement.classList.add('bcc-mobile');}catch(e){}</script>")
    .replace(/<link rel="stylesheet" href="shell-responsive\.css">\r?\n/, '')
    .replace(/\s*<button type="button" class="seg-btn" data-mode="auto"[^\n]+\r?\n/, '\n')
    .replace(/<script src="shared\/shell-responsive-runtime\.js"><\/script>\r?\n/, '')
    .replace(/function getUiModePreference\(\)[\s\S]*?(?=function applyUiModeToFrame\(\))/, "function getUiMode(){ try{ var m=safeGet(UI_MODE_KEY); if(m==='desktop'||m==='mobile') return m; }catch(e){} try{ return (window.innerWidth||document.documentElement.clientWidth||0) < 900 ? 'mobile' : 'desktop'; }catch(e){ return 'mobile'; } }\n")
    .replace(/function reflectUiModeUI\(\)\{[\s\S]*?function toggleUiMode\(\)\{[^\n]+\}\r?\n/, `function reflectUiModeUI(){ var m=getUiMode();
  try{ document.documentElement.classList.toggle('bcc-mobile', m==='mobile'); }catch(e){}
  try{ var ic=$('uiModeIcon'); if(ic) ic.textContent=(m==='mobile'?'📱':'🖥'); var b=$('uiModeBtn'); if(b) b.title='Layout: '+(m==='mobile'?'Mobile':'Desktop')+' — tap to switch'; }catch(e){}
  try{ var mic=$('moduleUiModeIcon'); if(mic) mic.textContent=(m==='mobile'?'📱':'🖥'); var mb=$('moduleUiModeBtn'); if(mb) mb.title='Layout: '+(m==='mobile'?'Mobile':'Desktop')+' — tap to switch'; }catch(e){}
  try{ var segs=document.querySelectorAll('#uiModeSeg .seg-btn'); for(var i=0;i<segs.length;i++){ segs[i].classList.toggle('active', segs[i].getAttribute('data-mode')===m); } }catch(e){}
}
function setUiMode(mode){ if(mode!=='mobile'&&mode!=='desktop') return; try{ safeSet(UI_MODE_KEY, mode); }catch(e){} reflectUiModeUI(); applyUiModeToFrame(); try{ if(activeView==='config') switchConfigTab(activeConfigTab||'appearance'); else syncSettingsLayoutClass(); }catch(e){} try{ toast((mode==='mobile'?'📱 Mobile':'🖥 Desktop')+' layout'); }catch(e){} }
function toggleUiMode(){ setUiMode(getUiMode()==='mobile'?'desktop':'mobile'); }
`)
    .replace(/\s*try\{ if\(window\.SaagarShellResponsive\)\{ window\.SaagarShellResponsive\.onChange[^\n]+\r?\n/, '\n');

  const manifest = undoFixWaveText('www/shell-asset-manifest.js', String(input.manifest))
    .replace(/,\r?\n\s*Object\.freeze\(\{ id: 'shell-search'[^\n]+/, '')
    .replace(/,\r?\n\s*Object\.freeze\(\{ id: 'shell-responsive-css'[^\n]+\r?\n\s*Object\.freeze\(\{ id: 'shell-responsive-runtime'[^\n]+/, '');

  if (sha256(index) !== INDEX_SHA256) throw new Error('Shell did not reconstruct to pre-Phase6G index authority');
  if (sha256(manifest) !== MANIFEST_SHA256) throw new Error('Shell manifest did not reconstruct to pre-Phase6G authority');
  return { index, manifest };
}
