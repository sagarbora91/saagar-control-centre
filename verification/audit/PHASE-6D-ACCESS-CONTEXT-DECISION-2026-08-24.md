# Phase 6D access-context decision — 2026-08-24

## Decision

Phase 6D makes no module permission change. The current access-context boundary is retained and
frozen module by module. Four modules have named consumers of shell access context; the other eight
remain disabled. There is no blanket enablement.

| Module | `accessContext` | Decision evidence |
|---|---:|---|
| Stock | `true` | The shared runtime authorizes the manager workspace from shell Owner/Store Manager context and revokes it after downgrade. |
| Service | `true` | Owner-context changes refresh the module's Owner controls through `renderDash()`. |
| QMS | `false` | No named permission consumer exists in the access runtime. Workflow and customer-selector integration are not authorization. |
| DSR | `true` | The shared runtime authorizes the manager workspace and logs it out after shell-context downgrade. |
| Expense | `true` | Owner-context changes refresh the module's Owner controls through `render()`. |
| Grooming | `false` | No named permission consumer exists; next-step navigation is not authorization. |
| CRO Audit | `false` | No named permission consumer exists. |
| Payroll | `false` | No named permission consumer exists. |
| Leave | `false` | No named permission consumer exists. |
| Tax | `false` | No named permission consumer exists. |
| Planning | `false` | No named permission consumer exists. |
| ETP | `false` | The parent-owned ETP gateway, not the iframe access bridge, is the authorization boundary. |

## ETP boundary

ETP deliberately remains `accessContext:false` and has no `st-v5-module-access-bridge`. The shell
denies all default staff roles except Store Manager before the module-PIN path. The parent gateway
then authorizes each operation independently and fails closed:

- import requires Owner authority or successful import reauthentication;
- confirmation requires successful publication reauthentication;
- reads require Owner authority or a Store Manager who is also allowed to open ETP;
- the module-facing read facade is frozen and exposes only `listScopes`, `inspectScope` and
  `loadSummary`, not import, confirmation, raw verified reads, native plugins, runtime or storage.

Enabling the child iframe's generic access-context stage would duplicate and blur this parent-owned
boundary. It would not add authorization to the gateway and is therefore rejected.

## Verification contract

`tests/phase6d-access-context-decision.test.mjs` checks the actual HTML runtime configurations and
bridge markers for all twelve modules, pins the four named runtime consumers, proves the ETP shell
and gateway boundary from source, and fixes the enabled count at four. Any blanket change from
`false` to `true`, any missing enabled bridge, or any ETP access bridge fails the focused test.

This is source-level engineering evidence only. It does not claim rendered, physical-device, UAT,
production, publication or release acceptance. No module, runtime, gateway, manifest, permission,
business logic, persistence or workflow was changed by this decision record.
