// Helper for the svc1 page tests: reads the Service page text (or the file named by SVC1_PAGE_PATH, so
// the same tests can be pointed at the pre-wave page to prove they fail there) and cuts out the glue block.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const pagePath = process.env.SVC1_PAGE_PATH
  ? path.resolve(process.env.SVC1_PAGE_PATH)
  : path.resolve(here, '../../www/modules/service/index.html');
export const page = fs.readFileSync(pagePath, 'utf8');
export const pageBytes = fs.readFileSync(pagePath);

export const GLUE_START = '// ─── STORES GLUE';
export const GLUE_END = 'renderDash();\napplyReadOnlyUI();\nsvsMount();\n</script>';

export const STORE_FILES = [
  'service-stores-store', 'service-stores-fifo', 'service-stores-masters', 'service-stores-docs',
  'service-stores-core', 'service-stores-masters-ui', 'service-stores-ui'
];

export function glueBlock(source = page) {
  const a = source.indexOf(GLUE_START);
  const b = source.indexOf(GLUE_END);
  if (a < 0 || b < a) return '';
  return source.slice(a, b);
}

export function withoutGlue(source = page) {
  const g = glueBlock(source);
  return g ? source.replace(g, '') : source;
}

export function staticMarkup(source = page) {
  return source.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
}

// Run the glue block in a vm context with fake page globals. `extra` can override any global.
export function glueEnv(extra = {}) {
  const log = { toasts: [], warns: [], shown: [] };
  const els = { 'svs-root': { id: 'svs-root' }, 'svs-job-host': { id: 'svs-job-host' } };
  const g = Object.assign({
    console: { warn: (...a) => log.warns.push(a.join(' ')), log() {}, error() {} },
    document: { getElementById: id => els[id] || null },
    DB: [],
    editId: null,
    viewDate: '2026-11-13',
    svcInvoiceLocked: c => !!(c && c.status === 'closed' && c.invoiceNo),
    svcD3Reauth: async () => true,
    isPastView: () => false,
    todayStr: () => '2026-11-13',
    toast: m => log.toasts.push(String(m)),
    showView: id => log.shown.push(id)
  }, extra);
  if (!extra.byId) g.byId = id => (g.DB || []).find(c => c.id === id);
  g.window = extra.window || {};
  const ctx = vm.createContext(g);
  vm.runInContext(glueBlock() + '\nthis.__api = { svsUi, svsSession, svsCaseView, svsCore, svsHost, svsMount, svsShowStores, svsRefreshJob, svsContextChanged, svsBlocksDelete };', ctx);
  return { ctx, api: ctx.__api, log, els };
}
