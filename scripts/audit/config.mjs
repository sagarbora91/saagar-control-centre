export const CURRENT_AUTHORITY_DOCUMENTS = Object.freeze([
  'docs/audit/HANDOFF.md',
  'docs/audit/AUDIT-PROGRAM-v1.md',
  'docs/SAAGAR-ANDROID-MASTER-CONSOLIDATED-PLAN.md',
  'docs/ETP-RETAIL-VERIFIED-DATA-PATH-DECISION-REGISTER-2026-08-08.md',
  'verification/ETP-CORE-CONTRACT-CLOSURE-HANDOFF-2026-08-09.md',
  'verification/ETP-CORE-REAL-CONFORMANCE-2026-08-09.json',
  'verification/STORAGE-UPDATE-LARGE-RECORD-HOTFIX-HANDOFF-2026-08-08.md'
]);

export const CRITICAL_TEST_DOMAINS = Object.freeze({
  money: ['financial-golden', 'd5-stock-variance', 'etp-reconciliation'],
  storage: ['native-incremental-storage-runtime', 'native-storage-large-record-upgrade'],
  auth: ['d1-reauth', 'service-owner-setting-guard'],
  backupRestore: ['portable-backup', 'offdevice-backup', 'persistence-acceptance'],
  export: ['export-sinks', 'report-csv'],
  etpPublication: ['etp-import-coordinator', 'etp-import-runtime', 'etp-native-store']
});

export const OPEN_GATES = Object.freeze([
  { id: 'GATE-UPDATE-PHYSICAL', title: 'Owner physical update-in-place smoke for final APK hash', state: 'open' },
  { id: 'GATE-UPDATE-API23', title: 'Install-replace evidence for final APK hash', state: 'open' },
  { id: 'GATE-ETP-PHYSICAL', title: 'Physical API-23/OEM ETP import and document-provider evidence', state: 'open' },
  { id: 'GATE-ETP-INTERRUPTION', title: 'ETP process-death, disk-full, corruption, rotation and low-storage evidence', state: 'open' },
  { id: 'GATE-ETP-PRODUCTION', title: 'Real production native ETP publication acceptance', state: 'open' },
  { id: 'GATE-ETP-EXCEPTIONS', title: 'User-facing R003/R013 exception presentation', state: 'open' },
  { id: 'GATE-PAYMENTTYPE25', title: 'Approved PAYMENTTYPE25 mapping', state: 'open' },
  { id: 'GATE-NATIVE-LANGUAGE', title: 'Fluent Marathi/Hindi review', state: 'open' },
  { id: 'GATE-UAT', title: 'Staff/owner UAT and legal review', state: 'open' },
  { id: 'GATE-RELEASE', title: 'Production signing and release acceptance', state: 'open' }
]);

export const ALLOWED_REMOTE_LITERAL_CONTEXTS = Object.freeze([
  'http://www.w3.org/',
  'https://www.w3.org/',
  'https://wa.me/',
  'https://api.whatsapp.com/'
]);

