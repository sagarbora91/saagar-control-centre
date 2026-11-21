// Harness for the Service Stores masters UI tests.
// The fake core below follows the facade contract of the plan (section 2.13) for the calls the masters UI makes.
// It sits on the REAL masters file and the REAL store file (via the masters test environment), so payload shapes,
// codes and refusals are the real ones. Every call is recorded, and any method can be replaced to inject a failure.
import { createRequire } from 'node:module';
import { masters as M, makeEnv, part, labour, OWNER, MANAGER, STAFF, NONE } from './svc1-masters-env.mjs';
import { FakeHost, settle } from './svc1-mui-dom.mjs';

const require = createRequire(import.meta.url);
export const Ui = require('../../www/service-stores-masters-ui.js');
export { M, part, labour, OWNER, MANAGER, STAFF, NONE, settle, FakeHost };

export function plainEscape(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const WITH_RIGHTS = (rows) => rows;

// opts.taxTotal: also return taxPendingTotal and honour q.taxPending (the real core does neither today).
export function makeFakeCore(env, hooks, opts) {
  const o = opts || {};
  const calls = [];
  const movements = new Set();
  const refs = new Set();
  const deps = {
    hasMovements: (code) => movements.has(code),
    isReferenced: () => false,
    onHand: () => 0
  };
  const ctx2 = (ctx) => ({
    session: ctx && ctx.session,
    stepUp: ctx && ctx.stepUp,
    clientRef: ctx && ctx.clientRef,
    now: () => new Date(env.clock.ms())
  });
  const record = (name, args) => { calls.push({ name, args: JSON.parse(JSON.stringify(args)) }); };
  // Part rows follow the core's partRow(): no created/updated/deactivate fields. Labour rows are the raw masters rows.
  const view = (row) => {
    if (row.reorderLevel === undefined) return row;
    const { createdAt, createdBy, updatedAt, updatedBy, deactivatedAt, deactivatedBy, deactivateReason, source, batchId, ...rest } = row;
    return { ...rest, taxPending: M.isTaxPending(row), onHand: 0, openingSet: false, valuePaise: null, lastCostPaise: null };
  };
  const lister = (kind) => (q, ctx) => {
    record(kind === 'part' ? 'listParts' : 'listLabour', [q, ctx]);
    const sess = ctx && ctx.session;
    if (!M.rights(sess).view) return { ok: false, code: 'SESSION_REQUIRED' };
    const all = M.loadMasters(env.store);
    if (!all.ok) return all;
    const rows = kind === 'part' ? all.parts : all.labour;
    const filtered = M.filterRows(rows, {
      q: q.text || '',
      group: q.group || '',
      active: q.active === 'true' ? true : (q.active === 'false' ? false : 'all'),
      taxPending: o.taxTotal && q.taxPending === 'true' ? true : 'all'
    });
    const page = filtered.slice(q.offset || 0, (q.offset || 0) + (q.limit || 50)).map(view);
    return {
      ok: true,
      rows: WITH_RIGHTS(page),
      total: filtered.length,
      groups: M.groupsOf(rows),
      ...(o.taxTotal ? { taxPendingTotal: filtered.filter((r) => M.isTaxPending(r)).length } : {}),
      totals: { parts: rows.length, pieces: 0, valuePaise: null }
    };
  };
  const core = {
    calls,
    movements,
    deps,
    listParts: lister('part'),
    listLabour: lister('labour'),
    savePart(input, ctx) {
      record('savePart', [input, ctx]);
      return saveRow('part', input, ctx);
    },
    saveLabour(input, ctx) {
      record('saveLabour', [input, ctx]);
      return saveRow('labour', input, ctx);
    },
    setPartActive(code, active, reason, ctx) {
      record('setPartActive', [code, active, reason, ctx]);
      return M.setActive(env.store, ctx2(ctx), 'part', code, active, reason, deps);
    },
    setLabourActive(code, active, reason, ctx) {
      record('setLabourActive', [code, active, reason, ctx]);
      return M.setActive(env.store, ctx2(ctx), 'labour', code, active, reason, deps);
    },
    removePart(code, reason, ctx) {
      record('removePart', [code, reason, ctx]);
      return M.removeUnused(env.store, ctx2(ctx), 'part', code, reason, deps);
    },
    removeLabour(code, reason, ctx) {
      record('removeLabour', [code, reason, ctx]);
      return M.removeUnused(env.store, ctx2(ctx), 'labour', code, reason, deps);
    },
    planBulk(kind, text, ctx) {
      record('planBulk', [kind, text, ctx]);
      return M.planBulkCreate(env.store, ctx2(ctx), kind, text);
    },
    commitBulk(plan, ctx) {
      record('commitBulk', [plan, ctx]);
      return M.commitBulkCreate(env.store, ctx2(ctx), plan);
    },
    getPart(code, ctx) {
      record('getPart', [code, ctx]);
      if (!M.rights(ctx && ctx.session).view) return { ok: false, code: 'SESSION_REQUIRED' };
      const r = M.getRow(env.store, 'part', code);
      if (!r.ok) return { ok: false, code: 'PART_UNKNOWN' };
      return { ok: true, part: view(r.row), hasMovements: movements.has(r.row.code) };
    },
    history(kind, code, ctx) {
      record('history', [kind, code, ctx]);
      if (!M.rights(ctx && ctx.session).edit) return { ok: false, code: 'ROLE_DENIED' };
      return M.historyFor(env.store, kind, code);
    },
    ledger(code, q, ctx) {
      record('ledger', [code, q, ctx]);
      return { ok: true, rows: [], total: movements.has(code) ? 1 : 0 };
    }
  };
  function saveRow(kind, input, ctx) {
    if (input && input.mode === 'edit') {
      return M.editRow(env.store, ctx2(ctx), kind, input.code, input, input.expectedRev, input.reason);
    }
    return M.createRow(env.store, ctx2(ctx), kind, input);
  }
  if (hooks) Object.assign(core, hooks);
  return core;
}

// Builds a controller with a session that tests can switch, a PIN stub and spies.
export function makeHarness(options = {}) {
  const env = makeEnv(options.env || {});
  const state = { session: options.session || OWNER, reads: 0, reauthCalls: [], reauthResult: true, toasts: [], changes: 0, past: false };
  const core = options.core || makeFakeCore(env, options.hooks, options.coreOpts);
  const uiEnv = {
    core,
    masters: M,
    readSession() { state.reads += 1; return typeof state.session === 'function' ? state.session() : state.session; },
    reauth(label) {
      state.reauthCalls.push(label);
      const r = state.reauthResult;
      if (typeof r === 'function') return r(label);
      return Promise.resolve(r);
    },
    toast(msg) { state.toasts.push(msg); },
    esc: plainEscape,
    now() { return new Date(env.clock.ms()); },
    onChange() { state.changes += 1; },
    isPast() { return state.past; }
  };
  if (options.noMasters) delete uiEnv.masters;
  const ctl = Ui.create(uiEnv);
  const host = new FakeHost();
  const paint = () => { host.innerHTML = ctl.render(); };
  ctl.attach(paint);
  return {
    env, state, core, ctl, host, uiEnv, paint,
    seed(code, extra) { const r = M.createRow(env.store, env.ctx(OWNER, { clientRef: env.ref() }), 'part', part(code, extra)); if (!r.ok) throw new Error('seed ' + code + ' ' + r.code); return r.row; },
    seedLabour(code, extra) { const r = M.createRow(env.store, env.ctx(OWNER, { clientRef: env.ref() }), 'labour', labour(code, extra)); if (!r.ok) throw new Error('seed ' + code + ' ' + r.code); return r.row; },
    async load() { await ctl.refresh(); paint(); },
    async act(action, payload) { await ctl.dispatch(action, payload); paint(); },
    // Fill form fields the way a person would (one dispatch per field) and return nothing.
    async fill(values) {
      for (const [name, value] of Object.entries(values)) await ctl.dispatch('svcm-field', { name, value });
    },
    last(name) { const c = core.calls.filter((x) => x.name === name); return c[c.length - 1] || null; },
    count(name) { return core.calls.filter((x) => x.name === name).length; }
  };
}
