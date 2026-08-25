# SAAGAR Whole-App Audit Comparison

- Product baseline: `8f96480ec6ddfc99016af43a7369f57a06cb9fd6`
- Target commit: `9b54d5bd003672434a7dac8be81efadd6b67f947`
- Audit tooling: `937542f8b81099eed48ba8c4d21d1cd6382f5ad3`
- Audit version: `saagar-whole-app-audit-v1.0.0`
- Product fingerprint: `c4f15b902d21a70ca71a1c8fecf5cc8085b45131c7c301853876104bd7f0cb25`
- Result: **complete-with-findings-or-gaps**
- Findings: 11
- Mandatory unmeasured checks: 12
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
| A7 — Protocol stability | 2 | 2 | 1 | 0 |
| A8 — Security and privacy | 0 | 3 | 2 | 0 |
| A9 — Build and release reproducibility | 2 | 0 | 3 | 0 |
| A10 — Performance and resources | 1 | 0 | 4 | 0 |
| A11 — Documentation currency | 3 | 2 | 0 | 0 |

This is engineering audit evidence. It is not physical-device, UAT, legal, signing or release acceptance.
