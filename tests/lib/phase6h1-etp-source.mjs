/* Deterministic reversal of the additive Phase 6H.1 ETP analytics wiring. */
export function restorePrePhase6h1EtpIndex(source) {
  return String(source)
    .replace("    .etp-e2-views{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 12px}.etp-e2-views .action[aria-pressed=\"true\"]{border-color:var(--navy);background:var(--navy);color:#fff}.etp-e2-banner{border-left:5px solid #247a52}.etp-e2-banner h3{color:#1d6946}\n", '')
    .replace(/      <div class="etp-e2-views"[^\n]+\n/, '');
}
export function restorePrePhase6h1GatewaySource(source) {
  return String(source)
    .replace('  var ANALYTICS_PAGE_LIMIT = 200;\n  var ANALYTICS_MAX_PAGES = 250;\n', '')
    .replace(/  var ANALYTICS_PROJECTIONS = Object\.freeze\(\{[\s\S]*?\n  \}\);\n/, '')
    .replace(', analyticsApi = options.analyticsApi', '')
    .replace('var seen = Object.create(null), projected = [], allowed = ANALYTICS_PROJECTIONS[reportId];', 'var seen = Object.create(null), projected = [], allowed = PROJECTIONS[reportId];')
    .replace(/\n    async function analyticsRows\([\s\S]*?\n    \/\* Phase-6D baseline was:/, '\n    /* Phase-6D baseline was:')
    .replace("    Object.defineProperty(readFacade, 'loadAnalytics', { value: loadAnalytics, enumerable: false, writable: false, configurable: false });\n", '')
    .replace(', analyticsApi: root && root.SaagarEtpVerifiedAnalytics', '');
}

export function restorePrePhase6h1PresentationSource(source) {
  return String(source)
    .replace(/  function valueOrDash\([\s\S]*?(?=  function renderVerified\()/, '')
    .replace(",viewButtons=Array.prototype.slice.call(root.querySelectorAll('[data-etp-analytics-view]'))", '')
    .replace("var busy=false,rerun=false,activeView='DAY',filters=", 'var busy=false,rerun=false,filters=')
    .replace('buttons.concat(viewButtons).forEach', 'buttons.forEach')
    .replace(/if\(typeof gateway\.loadAnalytics==='function'\)\{[\s\S]*?\}else if\(typeof gateway\.queryReport==='function'\)/, "if(typeof gateway.queryReport==='function')")
    .replace("loading(content,'Loading verified '+activeView+' analytics…');", "loading(content,'Loading bounded verified projections…');")
    .replace(/viewButtons\.forEach\(function\(button\)\{[\s\S]*?(?=return freeze\(\{ok:true,refresh:refresh,setFilters:setFilters\}\);\})/, '')
    .replace('return freeze({VERSION:3,', 'return freeze({VERSION:2,')
    .replace(',safeAnalytics:safeAnalytics,renderAnalytics:renderAnalytics', '');
}
