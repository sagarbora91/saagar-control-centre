/* ETP report-engine bridge: trust anchor (GATE-ETP-BRIDGE-TRUST).
   The shipped key list is EMPTY. With no key every engine pack is refused and the gate stays closed.
   The owner adds at most two keys himself after the key ceremony: {keyId, publicKeyHex}.
   Nothing else may add a key: not storage, a URL, a message, a pack or a setting. */
(function (root) {
  'use strict';

  var TRUST_VERSION = 1;
  var GATE_ID = 'GATE-ETP-BRIDGE-TRUST';
  var CONTRACT = 'SCC_ETP_BRIDGE_V1';
  var MAX_KEYS = 2;
  var KEY_ID = /^[0-9a-f]{16}$/;
  var POINT = /^04[0-9a-f]{128}$/;
  var KEYS = Object.freeze([]);

  function plainEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    var names = Object.keys(entry).sort();
    return names.length === 2 && names[0] === 'keyId' && names[1] === 'publicKeyHex' &&
      typeof entry.keyId === 'string' && KEY_ID.test(entry.keyId) &&
      typeof entry.publicKeyHex === 'string' && POINT.test(entry.publicKeyHex);
  }
  function wellFormed(list) {
    if (!Array.isArray(list) || list.length > MAX_KEYS) return false;
    var seen = {};
    for (var i = 0; i < list.length; i += 1) {
      if (!plainEntry(list[i]) || seen[list[i].keyId] === true) return false;
      seen[list[i].keyId] = true;
    }
    return true;
  }
  function gate() {
    if (KEYS.length === 0) return Object.freeze({ id: GATE_ID, open: false, state: 'CLOSED', code: 'ETP_BRIDGE_TRUST_ANCHOR_ABSENT' });
    if (!wellFormed(KEYS)) return Object.freeze({ id: GATE_ID, open: false, state: 'CLOSED', code: 'ETP_BRIDGE_TRUST_ANCHOR_INVALID' });
    return Object.freeze({ id: GATE_ID, open: true, state: 'OPEN', code: null });
  }

  var TRUST = Object.freeze({ VERSION: TRUST_VERSION, GATE_ID: GATE_ID, CONTRACT: CONTRACT, keys: KEYS, gate: gate });

  if (typeof module === 'object' && module && module.exports) { module.exports = TRUST; return; }
  if (!root) return;
  /* Defined once and never replaced. If the name is already taken, nothing is overwritten and the
     verifier reads whatever is there through its own checks, so a hostile earlier definition closes the gate. */
  if (Object.prototype.hasOwnProperty.call(root, 'SaagarEtpBridgeTrust')) return;
  try {
    Object.defineProperty(root, 'SaagarEtpBridgeTrust', { value: TRUST, writable: false, configurable: false, enumerable: true });
  } catch (_) { /* the gate then stays closed */ }
})(typeof globalThis !== 'undefined' ? globalThis : this);
