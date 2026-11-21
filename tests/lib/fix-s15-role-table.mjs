// tests/lib/fix-s15-role-table.mjs
// The one agreed table: shell session -> module role. Module groups import this in their own tests so that
// every module is held to the same answers. Reference functions below ARE the rule; the tables are its output.
export const SHELL_ROLES = ['Store Manager', 'Cashier', 'CRO', 'Greeter', 'Technician', 'Assistant Technician', 'Trainee', 'Others'];

// What SaagarOwnerSession.read() returns today (index.html moduleAccessSnapshot): isManager = owner || role === 'Store Manager'.
const snap = (isOwner, role) => ({ version: 1, isOwner, role, isManager: isOwner || role === 'Store Manager' });
export const SESSIONS = [
  { name: 'Owner unlocked (shell role Store Manager)', read: snap(true, 'Store Manager') },
  { name: 'Owner unlocked (shell role Cashier)', read: snap(true, 'Cashier') },
  ...SHELL_ROLES.map((r) => ({ name: 'role ' + r, read: snap(false, r) })),
];
// Sessions the module cannot trust: module opened outside the shell, shell API missing, read() throws or returns junk.
export const BROKEN = [
  { name: 'no shell session API', read: undefined },
  { name: 'read() returns null', read: null },
  { name: 'read() returns a string', read: 'owner' },
  { name: 'read() throws', read: 'THROW' },
  { name: 'truthy but not true', read: { version: 1, isOwner: 'true', role: 'Store Manager', isManager: 1 } },
];

const ok = (s) => (s && typeof s === 'object' ? s : null);
const owner = (s) => !!ok(s) && s.isOwner === true;
const manager = (s) => !!ok(s) && (s.isOwner === true || s.isManager === true);

// Queue (QMS): module roles SM / Greeter / CRO / Admin
export function qmsRoleFor(read) {
  const s = ok(read);
  if (!s) return 'Greeter';
  if (owner(s)) return 'Admin';
  if (manager(s) && s.role === 'Store Manager') return 'SM';
  if (s.role === 'CRO') return 'CRO';
  return 'Greeter';                                  // Greeter, Trainee, and anything else: lowest module role
}
// Expense: module roles cashier / accounts / owner. The list is the CEILING the role dropdown may select.
export function expenseAllowedFor(read) {
  const s = ok(read);
  if (!s) return ['cashier'];
  if (owner(s)) return ['cashier', 'accounts', 'owner'];
  if (manager(s)) return ['cashier', 'accounts'];
  return ['cashier'];
}
// Modules whose only internal split is "manager workspace yes/no" (Stock SM mode, DSR SM screen, Leave approve/manage).
export const managerWorkspaceFor = (read) => manager(ok(read));
// Owner-only settings and exports (Service CSV and settings, tax feed lock): isOwner only.
export const ownerOnlyFor = (read) => owner(ok(read));

export const QMS_EXPECTED = {
  'Owner unlocked (shell role Store Manager)': 'Admin', 'Owner unlocked (shell role Cashier)': 'Admin',
  'role Store Manager': 'SM', 'role Cashier': 'Greeter', 'role CRO': 'CRO', 'role Greeter': 'Greeter',
  'role Technician': 'Greeter', 'role Assistant Technician': 'Greeter', 'role Trainee': 'Greeter', 'role Others': 'Greeter',
};
export const EXPENSE_EXPECTED = {
  'Owner unlocked (shell role Store Manager)': ['cashier', 'accounts', 'owner'], 'Owner unlocked (shell role Cashier)': ['cashier', 'accounts', 'owner'],
  'role Store Manager': ['cashier', 'accounts'], 'role Cashier': ['cashier'], 'role CRO': ['cashier'], 'role Greeter': ['cashier'],
  'role Technician': ['cashier'], 'role Assistant Technician': ['cashier'], 'role Trainee': ['cashier'], 'role Others': ['cashier'],
};
