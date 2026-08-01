(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarAttentionPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clean(value) {
    return value == null ? '' : String(value).trim();
  }

  function severity(item) {
    if (item && (item.sev === 'high' || item.color === 'red')) return 3;
    if (item && (item.sev === 'med' || item.color === 'orange')) return 2;
    return 1;
  }

  function identity(item) {
    if (item && item.key) return 'key:' + clean(item.key).toLowerCase();
    const action = clean(item && item.action).toLowerCase().replace(/\s+/g, '');
    const title = clean(item && item.title).toLowerCase().replace(/\s+/g, ' ');
    return 'content:' + action + '|' + title;
  }

  function normalize(items) {
    const output = [];
    const positions = new Map();
    (Array.isArray(items) ? items : []).forEach(item => {
      if (!item || typeof item !== 'object') return;
      const id = identity(item);
      if (!positions.has(id)) {
        positions.set(id, output.length);
        output.push(Object.assign({}, item, { duplicateCount: 1 }));
        return;
      }
      const index = positions.get(id);
      const current = output[index];
      const currentScore = (Number(current.priority) || 0) * 10 + severity(current);
      const nextScore = (Number(item.priority) || 0) * 10 + severity(item);
      const duplicateCount = (current.duplicateCount || 1) + 1;
      output[index] = nextScore > currentScore
        ? Object.assign({}, item, { duplicateCount })
        : Object.assign({}, current, { duplicateCount });
    });
    return output;
  }

  function backupHealth(input) {
    const state = input && typeof input === 'object' ? input : {};
    const issues = [];
    let priority = 0;
    let localRepair = false;
    let high = false;

    if (state.failureEscalated) {
      issues.push('Private backup has failed beyond 36 hours; fix storage before relying on this phone.');
      priority = Math.max(priority, 112);
      localRepair = true;
      high = true;
    }
    if (state.plaintextWarning) {
      issues.push('A private plaintext fallback exists; restart after unlocking the phone.');
      priority = Math.max(priority, 110);
      localRepair = true;
      high = true;
    }
    if (state.legacyPurgeNeeded) {
      issues.push('Review and remove old shared-storage plaintext copies after confirming a fresh portable backup.');
      priority = Math.max(priority, 95);
      localRepair = true;
      high = true;
    }
    if (state.backupRecency === 'missing') {
      issues.push('No verified off-device backup exists; loss, reset, or uninstall can erase all data.');
      priority = Math.max(priority, 100);
      high = true;
    } else if (state.backupRecency === 'red') {
      issues.push('The verified off-device backup is over 7 days old.');
      priority = Math.max(priority, 100);
      high = true;
    } else if (state.backupRecency === 'amber') {
      const days = Number.isFinite(Number(state.backupDays)) ? Math.max(0, Math.floor(Number(state.backupDays))) : null;
      issues.push('The verified off-device backup is ' + (days == null ? 'several' : days) + ' days old; refresh it now.');
      priority = Math.max(priority, 80);
    }

    if (!issues.length) return null;
    const needsOffDevice = ['missing', 'red', 'amber'].includes(state.backupRecency);
    if (localRepair && needsOffDevice) {
      issues.push('After the local issue is resolved, share a fresh encrypted backup to the approved provider.');
    }

    let title = 'Backup health needs action';
    if (!high) title = 'Off-device backup is due soon';
    else if (!localRepair && state.backupRecency === 'missing') title = 'No off-device backup yet';
    else if (!localRepair && state.backupRecency === 'red') title = 'Off-device backup is overdue';

    return {
      key: 'backup-health',
      priority,
      sev: high ? 'high' : 'med',
      color: high ? 'red' : 'orange',
      em: high ? '⛑' : '⬇',
      title,
      msg: issues.join(' '),
      action: localRepair
        ? "switchView('config');switchConfigTab('backup')"
        : 'shareBackup()',
      cta: localRepair ? 'Review backup' : 'Share now',
      issueCount: issues.length
    };
  }

  return {
    normalize,
    backupHealth
  };
});
