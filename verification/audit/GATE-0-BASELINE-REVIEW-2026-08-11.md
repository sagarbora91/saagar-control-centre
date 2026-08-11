# Gate 0 — Pre-Migration Baseline Review

**Date:** 2026-08-11 (Asia/Kolkata)
**Roadmap:** `docs/MODULAR-MIGRATION-ROADMAP-2026-08-10.md`
**Status:** **Gate 0 CLOSED.** Phase 1 unblocked, pending owner authorization.

| Field | Value |
|---|---|
| Product anchor | `8f96480ec6ddfc99016af43a7369f57a06cb9fd6` |
| Target / tooling | `b9f04b5e33d045ad0ca6b7cc9acd25e2d5a186cb` |
| Product fingerprint | `f9b7dee47a7be2f6536c40e40393325392516f01584e1b613ccc26f60866d1c7` (296 files) |
| Evidence | `verification/audit/2026-08-11-113428-b9f04b5` — 18 files, manifest-verified byte-identical |
| Result | `complete-with-findings-or-gaps` |
| Checks | **24 pass / 19 fail / 15 unmeasured / 0 n/a** |
| Findings | 19 · Mandatory unmeasured 13 · Open external gates 10 |

Run from a clean detached linked worktree at the frozen commit; the dirty primary
worktree was never the audit target.

---

## 1. Gate 0's purpose is satisfied

**A3-02 `pass` — 655 capabilities, 0 conflicting IDs, `blockingCauses: []`.**

This is the whole point of the gate. The capability inventory is the acceptance
oracle: the one metric that must come out **exactly identical** after migration.
A frozen "before" now exists at the commit the migration starts from, so the
post-migration comparison can prove whether anything broke.

That was impossible three baselines ago. At `88ba118` A3-02 was `unmeasured` on
23 conflicting IDs — one ID could map to several different behaviours — so a
before/after comparison would have compared nothing meaningful.

## 2. Movement since the previous baseline

| | `57507ef` (anchor `f4da822`) | **Gate 0** (`b9f04b5`) |
|---|---:|---:|
| Pass | 22 | **24** |
| Fail | 21 | **19** |
| Unmeasured | 15 | 15 |
| Findings | 21 | **19** |
| A4 | 3 pass / 3 fail | **4 pass / 2 fail** |
| A11 | 1 pass / 4 fail | **2 pass / 3 fail** |

Two checks moved from fail to pass: **A4-03** (the storage classification
contradiction, genuinely fixed) and **A11-04** (the controlling-baseline identity,
after the handoff was pointed at the correct anchor). No check regressed.

## 3. State of the five P0s at Gate 0

| Finding | At Gate 0 |
|---|---|
| A4-03 | **pass** |
| A4-02 | fail — 73 unclassified, down from 98; the remainder are runtime-computed filenames |
| A8-02 | fail — 2 bypasses, down from 9; both are guard shapes the analyser cannot prove |
| A8-03 | fail — signed fail-open design; remedy is Phase 3 (re-auth onto the DOM keypad) |
| A8-05 | fail — 47 wildcard `postMessage`; remedy is Phase 1 (shared origin helper + receiver validation) |

Dispositions and reasoning: `docs/audit/P0-DECISIONS-2026-08-10.md`.

## 4. What the baseline says the migration must fix

These are the checks Phase 1 and Phase 2 own, captured here so the "after" run
has something concrete to be measured against:

| Check | Gate 0 state | Phase |
|---|---|---|
| A2-01 | 39 byte-identical duplicate function groups, 10 files | 1 |
| A2-02 | 42 near-copy groups, 1,997 similarity edges | 1 |
| A2-03 | 13 duplicate CSS blocks across all 11 modules | 1 |
| A2-04 | 6 domain constants duplicated across 17 files | 1 |
| A2-05 | 16 authority gaps | 1 |
| A8-05 | 47 wildcard `postMessage` calls | 1 |
| A1-02 | undeclared `parent.*` / global dependencies | 2 |
| A1-07 | shared-asset fan-out, `app-i18n.js` across all 11 modules | 2 |
| A6-04/05 | rendered-UI evidence absent | 3 |

## 5. Unchanged and carried

- **A9-01/02/05** `unmeasured` — `AUDIT_BUILD_GRADLE_UNAVAILABLE`. The receipt-v2
  isolated `GRADLE_USER_HOME` forces a wrapper download, and
  `services.gradle.org` fails the TLS handshake here with schannel
  `CRYPT_E_NO_REVOCATION_CHECK`. A networked host alone will not fix it.
- **A5-05** `unmeasured` — 5 of 6 mutation domains; the storage mutation is
  detected but its run takes ~150 s against a 120 s capture timeout.
- **A6/A10 device and rendered-UI gates**, and the conservative A7/A8
  static-discovery gates — all deliberate.
- **10 open external gates** — device, UAT, language, legal, signing, release.

## 6. Non-claims

24 passing checks are not acceptance. 19 fails and 15 unmeasured remain open
remediation gates. No two-build reproducibility evidence exists. No device, UAT,
legal, signing or release acceptance exists. Gate 0 establishes a comparable
"before" — nothing more, and that is exactly what it is for.

## 7. Next

Phase 1 — shared spine. Owns all five A2 failures plus A8-05, ends with a
two-device pass, a re-anchor and a re-baseline. It may not begin without owner
authorization (closure addendum, step 16).
