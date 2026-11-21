# SAAGAR Whole-App Audit Comparison

- Product baseline: `8f96480ec6ddfc99016af43a7369f57a06cb9fd6`
- Target commit: `11bb84abc74c5dd3073df6074b45f67b3fbb9597`
- Audit tooling: `b9f04b5e33d045ad0ca6b7cc9acd25e2d5a186cb`
- Audit version: `saagar-whole-app-audit-v1.0.0`
- Product fingerprint: `e0e7782035030948ef59e063ad2abb9c29ad91277cc5a2974d91f276ee7058bf`
- Result: **complete-with-findings-or-gaps**
- Findings: 12
- Mandatory unmeasured checks: 14
- Open external gates: 10

- Comparison: **comparison-failed-or-unmeasured**

| Audit | Pass | Fail | Unmeasured | N/A |
|---|---:|---:|---:|---:|
| A1 — Architecture and coupling | 7 | 0 | 0 | 0 |
| A2 — Duplication and ownership | 4 | 1 | 0 | 0 |
| A3 — Semantic capability inventory | 4 | 0 | 1 | 0 |
| A4 — Data and storage integrity | 5 | 1 | 0 | 0 |
| A5 — Tests and guard rails | 4 | 0 | 1 | 0 |
| A6 — UI, responsive behavior, i18n and accessibility | 1 | 2 | 2 | 0 |
| A7 — Protocol stability | 0 | 3 | 2 | 0 |
| A8 — Security and privacy | 0 | 2 | 3 | 0 |
| A9 — Build and release reproducibility | 2 | 0 | 3 | 0 |
| A10 — Performance and resources | 1 | 0 | 4 | 0 |
| A11 — Documentation currency | 2 | 3 | 0 | 0 |

This is engineering audit evidence. It is not physical-device, UAT, legal, signing or release acceptance.
