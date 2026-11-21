# A3-02 Tooling Remediation — Step 1

**Date:** 2026-08-10 (Asia/Kolkata)
**Scope:** `scripts/audit/audits/a3.mjs` only. **No product file was touched.**
**Status:** step 1 COMPLETE. Steps 2 (re-freeze + re-baseline) and 3 (product
`data-action`) not started.

Triggered by the committed baseline `6ea1718`, where A3-02 was `unmeasured` with
23 conflicting capability IDs and 206 unresolved action bindings. Investigation
showed the 206 were overwhelmingly **audit defects, not product defects**.

---

## 1. Five defects found and fixed

| # | Defect | Evidence it was real |
|---|---|---|
| 1 | `attribute()` read values with `(["'])([^"']*)\1`, so any value containing the other quote returned `''` | `onclick="llKey('1')"` → `""`. Almost every real handler takes a string argument, so almost every handler was invisible. `handlerStrippedAttributes` two lines below already used the correct alternation. |
| 2 | `matchingBrace()` did not skip comments | The comment in `getBrands` holds 7 apostrophes (`Stock's`, `'titanworld'`, `'helios'`). An odd count opened a phantom string that consumed the scan; `matchingBrace` returned -1 and `handlerRegistry` silently dropped the function. `printMonthlyReg`, `onLeaveFormChange`, `printCompliance`, `showFormStep`, `addFollowUp`, `reportStatutoryMemberCsv` were all defined yet missing from the registry. |
| 3 | `eventBinding()` treated member methods and literals as handler names | Unknown-name frequency: `getElementById` 15, `null` 12, `querySelector` 11, `click` 3, `openHub` 2, `generate` 1. None is a handler. |
| 4 | Bindingless `<select>`/`<textarea>` counted as visible actions, while bindingless non-button `<input>` was excluded | 45 ordinary form fields (`<select id="emFirm"></select>`) reported as unbound actions. The two cases are the same class: a value read at submit. |
| 5 | Alias attribution was segment-wide, not scoped to the assignment | `var b = document.getElementById('st-v5-home-fab')` made **every** later `b.addEventListener(...)` in that segment attach to the FAB. `b` is reused constantly, so unrelated anonymous handlers were attributed to it and reported unresolved. |

Fix 3 keeps the signal: qualified calls are recorded in `binding.qualifiedCalls`,
so a change to `SaagarReport.openHub()` is still visible to before/after
comparison. Fix 5 scopes an alias from its own assignment until the identifier is
assigned again, and an assignment to anything other than a document lookup
invalidates the alias instead of silently keeping a stale element.

### Effect

| Metric | Baseline `6ea1718` | After step 1 |
|---|---:|---:|
| Unresolved action bindings | 206 | **6** |
| Conflicting capability IDs | 23 | **25** |
| Capabilities | 669 | 630 |

Capabilities fell because bindingless form controls are correctly no longer
actions. **Conflicts rose because the parser can now see outcomes it previously
could not** — the earlier 23 was itself an artefact of the blind parser. This
vindicates the sequencing: fixing the 23 before the tooling would have fixed the
wrong list.

## 2. A3-02 verdict rule narrowed — owner decision, 2026-08-10

A3-02 previously went `unmeasured` if **any** of overflow, ID conflicts, empty
categories, actionless modules **or unresolved action bindings** was non-zero.

Binding resolution is heuristic static discovery over inline handlers, aliases
and delegation, and cannot be completed without full JavaScript lexing. Requiring
zero unresolved bindings made a mandatory gate permanently unsatisfiable and
masked the ID-stability signal the check exists to provide.

The verdict is now decided by **ID stability and uniqueness only**. Unresolved
bindings are reported as bounded evidence and as `metric.unresolvedActionBindings`,
and never veto the verdict. This is sound because capability IDs derive from tag,
type, key and stable attributes — **never from the handler** — so an unresolved
binding cannot change an ID.

Still blocking, surfaced in the new `metric.blockingCauses`:
`CAPABILITY_INVENTORY_LIMIT_EXCEEDED`, `CAPABILITY_ID_CONFLICT`,
`CAPABILITY_CATEGORY_EMPTY`, `MODULE_ACTION_INVENTORY_EMPTY`.

This is a deliberate loosening of a mandatory gate, so it carries a guard test
(§4) proving the gate still closes on ID ambiguity.

### Evidence-crowding fix

The baseline reported 23 conflicts in the metric but surfaced only 10 rows,
because unresolved rows consumed the shared 200-row evidence cap — the
verdict-deciding evidence was being hidden by non-deciding evidence. Unresolved
rows are now capped at 50 with an explicit
`UNRESOLVED_ACTION_BINDING_EVIDENCE_TRUNCATED` marker.

## 3. The 6 remaining unresolved bindings — accepted, documented

| Count | Location | Cause |
|---:|---|---|
| 2 | `payroll` L1579 `reportStatutoryMemberCsv()`, `tax` L1003 `printCompliance()` | `matchingBrace` cannot lex regex literals. `const q=v=>'"'+String(v).replace(/"/g,'""')` — the `"` inside `/"/g` opens a phantom string. Distinguishing regex from division needs real JS lexing. |
| 3 | `payroll` L1679-1681 `<button data-v=...>` | Bound by event delegation on a parent. Not statically resolvable by design. |
| 1 | `cro_audit` L955 `cro-dup-btn` | Bound from JavaScript by a pattern the selector index does not model. |

None is a product defect. All six are reported as evidence and none blocks the
verdict.

## 4. Tests

Two tests added; suite **55 → 57**, all passing, zero fail/cancelled/skipped/todo.

1. **`A3 resolves quoted-argument handlers, comment apostrophes, member calls and bindingless form controls`**
   — covers fixes 1-4 on a synthetic surface: a handler with a quoted argument,
   a handler declared after an apostrophe comment, a member call, and a
   bindingless `<select>`/`<textarea>`; asserts a *bound* select is still an action.
2. **`A3-02 is vetoed by capability id ambiguity but never by an unresolved binding`**
   — the guard for the rule change. Asserts an unresolvable handler never enters
   `blockingCauses` yet is still evidence; that two same-identity elements with
   different outcomes DO veto; and that a conflict survives an evidence array
   flooded with 80 unresolved bindings.

## 5. State

- Changed: `scripts/audit/audits/a3.mjs`, `tests/whole-app-audit-runner.test.mjs`,
  `docs/audit/AUDIT-PROGRAM-v1.md` (A3-02 catalogue entry).
- **No product file changed**; the product fingerprint still equals anchor `88ba118`.
- Nothing committed. The tooling freeze `7871e57` and baseline `6ea1718` remain
  the published state, and this work supersedes neither until a new freeze.

## 6. Recommended resequencing

The approved order was: re-freeze + re-baseline, *then* fix the conflicts. That
runs the expensive baseline twice, because step 3 changes product bytes and
immediately invalidates the baseline just taken.

**Fix the 25 conflicts first, then re-freeze and re-baseline once.** A3-02 can
only reach `pass` once `conflictingIds` is 0, so a baseline taken before the
product fix necessarily records A3-02 as `unmeasured` again.
