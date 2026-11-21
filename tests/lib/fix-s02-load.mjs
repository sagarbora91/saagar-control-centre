// Test helper for the S02 (reports) fix tests. Loads the real www/saagar-report.js into a vm context.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.S02_REPO_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REPORT_SOURCE = fs.readFileSync(path.join(ROOT, 'www/saagar-report.js'), 'utf8');

export const HUB_TYPES = ['ownerBrief', 'cashStatement', 'dsrRegister', 'qmsReport', 'croAudit', 'groomingDaily', 'stockRegister',
  'serviceAging', 'serviceJobCard', 'weeklyBrief', 'payrollRegister', 'payrollSlip', 'leaveRegister', 'groomingMonthly',
  'lostWalkinCallSheet', 'expenseMonthly', 'taxReport', 'ownerMonthly'];

export function roleOf(kind) {
  const roles = {
    owner: { session: { isOwner: true, role: 'Owner', isManager: true }, visible: () => true },
    manager: { session: { isOwner: false, role: 'Store Manager', isManager: true }, visible: () => true },
    cashier: { session: { isOwner: false, role: 'Cashier', isManager: false }, visible: (id) => id === 'expense' },
    greeter: { session: { isOwner: false, role: 'Greeter', isManager: false }, visible: (id) => id === 'qms' || id === 'grooming' },
    others: { session: { isOwner: false, role: 'Others', isManager: false }, visible: (id) => id === 'qms' },
    technician: { session: { isOwner: false, role: 'Technician', isManager: false }, visible: (id) => id === 'service' },
    cro: { session: { isOwner: false, role: 'CRO', isManager: false }, visible: (id) => id === 'qms' || id === 'dsr' || id === 'cro_audit' }
  };
  return roles[kind];
}

export function loadReport(opts = {}) {
  const store = {};
  Object.keys(opts.storage || {}).forEach((k) => { store[k] = typeof opts.storage[k] === 'string' ? opts.storage[k] : JSON.stringify(opts.storage[k]); });
  const calls = { toasts: [], openModal: 0, audits: [], ensure: [] };
  const els = {};
  const mk = (id) => ({ id, innerHTML: '', textContent: '', value: '', hidden: false, style: {}, classList: { add() {}, remove() {}, contains: () => false }, querySelector: () => null, querySelectorAll: () => [], getAttribute: () => '' });
  const document = {
    getElementById: (id) => (els[id] || (els[id] = mk(id))),
    querySelector: () => ({ classList: { add() {}, remove() {} } }),
    querySelectorAll: () => []
  };
  const ctx = {
    localStorage: { getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document, console, Blob, setTimeout, clearTimeout, URL,
    toast: (m) => { calls.toasts.push(String(m)); }
  };
  ctx.window = ctx;
  ctx.openModal = () => { calls.openModal += 1; };
  const role = opts.role ? roleOf(opts.role) : null;
  ctx.__session = role ? role.session : null;
  if (role) {
    ctx.SaagarOwnerSession = { read: () => ctx.__session };
    ctx.moduleVisibleForRole = role.visible;
    ctx.ensureModuleAccess = (id) => { calls.ensure.push(id); return opts.ensure === undefined ? true : (typeof opts.ensure === 'function' ? opts.ensure(id) : !!opts.ensure); };
    ctx.auditLog = (name, obj) => { calls.audits.push([name, obj]); };
  }
  Object.assign(ctx, opts.globals || {});
  vm.runInNewContext(REPORT_SOURCE, ctx, { filename: 'saagar-report.js' });
  return { R: ctx.SaagarReport, ctx, store, calls, els, html: (id) => (els[id] ? els[id].innerHTML : '') };
}

// jsPDF stand-in: records text(); unknown methods are no-ops.
export function fakeJsPdf(log) {
  return class FakeDoc {
    constructor() {
      this.internal = { pageSize: { getWidth: () => 595.28, getHeight: () => 841.89 }, getCurrentPageInfo: () => ({ pageNumber: 1 }), getNumberOfPages: () => 1 };
      this.lastAutoTable = { finalY: 0 };
      return new Proxy(this, { get(t, p) { if (p in t) return t[p]; return function () {}; } });
    }
    text(s, x, y, o) { log.push({ s: String(s), x, y, o: o || {} }); }
    getTextWidth(s) { return String(s).length * 5; }
    getFontList() { return { DMSans: ['normal', 'bold'] }; }
    autoTable() {}
  };
}
