# MAH-1 modular architecture inventory — 2026-08-06

## Identity and method

- Repository: `V:\Co work\Projects\Retail\saagar-control-centre`
- Branch: `main`
- HEAD: `c04bc98255a78d45b08ac449d88365b22d033f28`
- Working tree: intentionally dirty; no commit or push performed.
- Reproduce: `node scripts/audit-modular-architecture.mjs`
- Inventory contains source metadata only. It does not copy module HTML or
  business/customer data.

## Shell snapshot

- `www/index.html`: 723,205 bytes; SHA-256
  `b4a09c805a8d718e14fa6d2431a50562439d425d212c27095ab5187058d294c7`.
- Module registry: 11 relative local sources; no active `html_b64` payloads.
- Runtime activity visible in source: 29 timeouts, 2 intervals,
  2 MutationObservers and 2 resize listeners.
- Responsive thresholds visible in source: 380, 420, 480, 560, 599, 600, 640,
  641, 720, 768, 900, 920 and 1100 px.
- The active path uses `iframe.src`; the historical `srcdoc/buildModuleSrc`
  fallback remains.

## Module snapshot

| Module | Bytes | Inline JS/CSS | Tables | Intervals | Live access context | Risk |
|---|---:|---:|---:|---:|---|---|
| Stock | 245,505 | 8 / 7 | 15 | 0 | Yes | High |
| Service | 282,830 | 8 / 6 | 6 | 0 | Yes | High |
| QMS | 214,499 | 7 / 7 | 14 | 2 | No | High |
| DSR | 229,752 | 8 / 6 | 2 | 1 | Yes | High |
| Expense | 209,977 | 8 / 6 | 11 | 0 | Yes | High |
| Grooming | 130,194 | 7 / 5 | 1 | 0 | No | Medium |
| CRO Audit | 182,489 | 8 / 5 | 1 | 0 | No | High |
| Payroll | 310,105 | 9 / 6 | 14 | 0 | No | High |
| Leave | 208,655 | 7 / 6 | 2 | 0 | No | High |
| Tax | 272,538 | 7 / 6 | 1 | 0 | No | High |
| Planning | 60,724 | 7 / 5 | 0 | 0 | No | Medium |

Every module loads `../../mobile-layout.css` and `../../app-i18n.js`. Expense,
Grooming, CRO Audit, Payroll, Leave, Tax and Planning also load the C1 control
desk CSS/runtime/policy. Stock additionally loads its variance policy.

## Protection differences that must remain explicit

- Only Stock, Service, DSR and Expense currently contain the live
  `ST_ACCESS_CONTEXT` bridge.
- QMS and DSR contain recurring intervals and therefore need explicit lifecycle
  cleanup in a later hardening phase.
- All modules duplicate iframe shim, audit bridge, mobile bootstrap, safety,
  employee-assist and Back/Home runtime blocks.
- Payroll, Stock, QMS and Expense have the highest table/navigation density.
- CRO Audit, Leave and Tax have known sticky/header/action containment risks.
- Phone-shell CSS previously depended only on width. MAH-1 now also requires
  `html.bcc-mobile`, protecting explicitly selected Desktop mode at narrow width.

## Evidence matrix

The machine-readable profile defines 14 surfaces × 4 viewports × 3 languages =
168 minimum visual cases:

- 360×800 phone, Mobile mode;
- 412×915 phone, Mobile mode;
- 800×600 compact landscape/tablet, Mobile mode;
- 1365×768 desktop, Desktop mode;
- English, Marathi and Hindi;
- shell Home, Settings home/detail and all eleven module landing surfaces.

`visualBaselinesCaptured=false` and `physicalDeviceAccepted=false` are permanent
honesty fields until real evidence exists. The earlier localhost browser run was
blocked by browser safety policy; no alternate-browser bypass was attempted.

## Later hardening candidates — not implemented in MAH-1

1. Versioned shared module runtime and ready/error protocol.
2. Lifecycle cleanup registry for timers, observers and listeners.
3. Unified live access snapshot for every module.
4. Fail-closed centralized sensitive-action reauthentication.
5. Deep Android Back request/result contract.
6. Storage ownership/schema manifest.
7. Shared responsive primitives and breakpoint consolidation.
8. Progressive module CSS/JS extraction and shell slimming.
