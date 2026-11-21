# Whole-App Audit — Baseline #2 (post re-anchor)

**Date:** 2026-08-10 (Asia/Kolkata)
**Supersedes:** `verification/audit/2026-08-10-115208-7871e57` as the comparison baseline.

| Field | Value |
|---|---|
| Product anchor | `f4da822378047b2fca5178953de079fa60d2d894` (re-anchored from `88ba118`) |
| Target / tooling | `57507ef655bb1b712e297f9526e2a1afaa4fcae5` |
| Product fingerprint | `92a06d052a0a81d193f0a8461253b13eef503336d10d0b8474c21953687f46e6` (295 files) |
| Evidence | `verification/audit/2026-08-10-130643-57507ef` (18 files, manifest-verified) |
| Run status | `complete-with-findings-or-gaps` |
| Findings | 21 |
| Mandatory unmeasured | 13 (was 14) |
| Open external gates | 10 |

Run from a clean detached linked worktree at the frozen commit; the dirty
primary worktree was not audited.

---

## 1. The headline: A3-02 passes

```
A3-02: pass | conflictingIds 0 | unresolvedActionBindings 6 | blockingCauses []
```

**The migration acceptance oracle now works.** A3 moved from 3 pass / 2 unmeasured
to 4 pass / 1 unmeasured. The capability inventory is stable and unique, so a
post-migration re-run can be compared against this baseline and actually prove
whether anything broke — which was impossible at `88ba118`, where one capability
ID could map to several different behaviours.

The 6 remaining unresolved bindings are reported as evidence and, by the narrowed
rule, do not veto the verdict. Their causes are documented in
`A3-02-TOOLING-REMEDIATION-2026-08-10.md`: 2 blocked by regex-literal lexing,
3 delegated `data-v` buttons, 1 JS-bound control.

## 2. Result distribution — all 58 checks

| Audit | Pass | Fail | Unmeasured |
|---|---:|---:|---:|
| A1 Architecture | 5 | 2 | 0 |
| A2 Duplication | 0 | 5 | 0 |
| A3 Capability inventory | **4** | 0 | **1** |
| A4 Storage | 3 | 3 | 0 |
| A5 Tests | 4 | 0 | 1 |
| A6 UI | 1 | 2 | 2 |
| A7 Protocol | 1 | 2 | 2 |
| A8 Security | 0 | 3 | 2 |
| A9 Build | 2 | 0 | 3 |
| A10 Performance | 1 | 0 | 4 |
| A11 Documentation | 1 | 4 | 0 |
| **Total** | **22** | **21** | **15** |

## 3. Changes against baseline #1

| | #1 (`7871e57`) | #2 (`57507ef`) |
|---|---:|---:|
| A3-02 | unmeasured | **pass** |
| Mandatory unmeasured | 14 | **13** |
| Findings | 20 | 21 |
| A11 | 2 pass / 3 fail | 1 pass / 4 fail |

The single new finding is **A11-04 — Controlling product baseline identity**, and
it is the audit correctly catching an incomplete re-anchor: `docs/audit/HANDOFF.md`
lines 19 and 74 still declared `88ba118` while the runner declares `f4da822`
(2 `CONTROLLING_BASELINE_MISMATCH` rows, both in that one file). The program
document and `lib.mjs` were updated; the handoff was not.

This is a genuine documentation-currency defect at `57507ef` and is recorded as
such. It is corrected in the immediately following commit; the finding stands
for this commit rather than being retro-fitted, so the evidence stays honest.

## 4. Unchanged and still open

- **5 P0 findings**: A4-02 artefact classification, A4-03 storage classification
  contradiction, A8-02 export policy bypass, A8-03 fail-open auth/PIN,
  A8-05 unapproved remote runtime behaviour. All three A8 counts remain lower
  bounds (`staticDiscoveryComplete: false`).
- **A9-01/02/05 unmeasured** — `AUDIT_BUILD_GRADLE_UNAVAILABLE`. Unchanged and
  expected: `services.gradle.org` fails the TLS handshake here with schannel
  `CRYPT_E_NO_REVOCATION_CHECK`. Networked host alone is not sufficient; the
  proxy/TLS-inspection path must be fixed first.
- **A5-05 unmeasured** — 5 of 6 mutation domains; the `storage` mutation is
  detected but takes ~150 s against a 120 s capture timeout.
- **A6-04/05, A10-01/02/04/05, A3-05, A7-01/03, A8-01/04** — device, rendered-UI,
  timing and conservative static-discovery gates, all deliberate.
- **10 open external gates** — device, UAT, language, legal, signing, release.

## 5. Non-claims

22 passing checks are not acceptance. 21 fails and 15 unmeasured remain open
remediation gates. No two-build reproducibility evidence exists. No device, UAT,
legal, signing or release acceptance exists.

## 6. Next

1. The 5 P0 findings.
2. A2 duplication (all 5 checks fail) and A11 documentation currency.
3. Resolve the Gradle TLS path, then re-run to obtain A9 two-build evidence.
4. Modular HTML migration (M2/M3/M4/M6), then re-run this program and compare
   against **this** baseline — the capability inventory is now a usable oracle.
