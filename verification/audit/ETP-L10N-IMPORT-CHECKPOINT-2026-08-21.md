# ETP localization import checkpoint — 2026-08-21

**Status:** ETP-4 steps 1 and 2 are complete. **Step 3 (identity regeneration) is NOT done and the tree is red on 19 identity assertions.** Do not build an APK or run the controlled audit from this state.

## What was done

**Owner approval:** Sagar approved all 119 rows on 2026-08-21. Record:
`verification/audit/approvals/ETP-LOCALIZATION-APPROVAL-2026-08-21.json`, reviewed CSV SHA-256
`f073bf322427996c6bbb44828dc46693ade97333b83f52b47fa588a55c1b7bb1`.

### Step 1 — wording imported

`www/app-i18n.js` gained **102** phrase triples, inserted at the head of `PHRASES` under a labelled
banner naming the approved CSV hash. Localization here is a global exact-phrase table
(`['english','marathi','hindi']`), and every module including `etp` loads it via
`src="../../app-i18n.js"`, so the ETP module picks the wording up without further wiring.

Row disposition, all 119 now carry `reviewer = Sagar (sagarbora91)`:

| Decision | Rows | Meaning |
|---|---:|---|
| `translate` | 104 | 102 newly added, 2 already present with identical wording |
| `preserve-literal` | 12 | code-only strings, correctly not translated |
| `approved-not-imported-shared-phrase` | 3 | see below |

CSV after marking: SHA-256 `fb24951db077b49c3f75e03bceda219edd91eb16ae22d9b9ef353f446fed24c7`.
All 119 `english_sha256` values still verify, all rows keep 14 columns, `row_sha256` untouched.

### The three not imported — this needs an owner decision

The dictionary is **global**. These three English phrases already carry Phase 4A owner-approved
wording, and the ETP package proposed different wording. Importing it would silently re-word other
surfaces, which is outside what was reviewed:

| Row | English | Existing (kept) | ETP package proposed | Also used by |
|---|---|---|---|---|
| ETP-L10N-006 | Import | mr `आयात` / hi `आयात` | mr `आयात करा` | shell |
| ETP-L10N-016 | Store | mr `दुकान` / hi `स्टोर` | mr `स्टोअर` | shell, grooming, stock |
| ETP-L10N-022 | To | mr `पर्यंत` / hi `तक` | mr `ला` / hi `को` | cro_audit |

Existing wording was kept. ETP renders these using the Phase 4A translations. If the ETP wording is
preferred, that is a **cross-module wording change** and should be approved as such.

This is a structural limit worth recording: a global exact-phrase table cannot express
module-specific wording for a shared word. Scoped overrides would be a design change, not a fix.

### Step 2 — focused tests green

- `npm run test:etp` — **155/155 pass**
- `npm run test:language` — **10/10 pass**

`tests/language-localization.test.mjs` pins the dictionary size; the golden moved `2009 -> 2111`
(+102, exactly the import). `www/app-i18n.js` passes `node --check`.

## Step 3 — NOT done. What is red and why

Adding phrases to a shared asset invalidates identity and inventory pins:

| Suite | Result |
|---|---|
| `test:manifest` | 8/8 pass |
| `test:mah3` | 15 pass, **4 fail** |
| `test:mah4` | 43 pass, **3 fail** |
| `test:modular` | 74 pass, **12 fail** |

`app-i18n.js` is pinned in `MH1-MODULAR-PROTECTION-PROFILE.json`,
`MAH3-SHARED-RUNTIME-BASELINE-PROFILE.json` and `MAH4-MESSAGE-LIFECYCLE-BASELINE-PROFILE.json`.

**These are identity and inventory drift failures, not functional defects.** The product parses and
its focused behavioural suites pass.

### A wrong turn, recorded so it is not repeated

`refresh-mah3-stage-b-identity.mjs`, `refresh-mah4-baseline.mjs`,
`refresh-mah4-runtime-identities.mjs` and `refresh-module-golden-identities.mjs` were run. They

- did **not** fix any of the 19 failures;
- broke MAH-3 with `MAH-3 evidence matrix must match the exact 168-case contract`; and
- rewrote three historical canary evidence files dated 2026-08-07
  (`MAH3-DSR/PLANNING/QMS-CANARY-EVIDENCE`).

All of that was reverted with `git checkout`. The working tree contains only the three intended
changes. **Running those four scripts is not the regeneration path for a shared-asset change.**

Per `SCC-STAGE-2-FOUNDATION-SPEC-2026-08-16.md` §6.3 the real path is: regenerate
`module-manifest.js`, `module-build-golden-hashes.json`, MAH-3 and MAH-4 profiles; **bump the MAH-4
`www` byte total deliberately**; run the full offline suite and the audit self-test; re-anchor;
re-baseline. The byte-total bump is a deliberate manual step and was not attempted.

## Two owner gates ahead, neither self-approvable

Among the 12 `test:modular` failures:

- `modular capability delta ledger exactly matches the frozen A3 comparison`
- `capability review remains fail-closed until the owner explicitly approves it`
- `Phase 1 audit exit closes owned authority gates and records exact capability review`

The 107-delta capability approval is bound to the pre-import identity. A **new owner capability
approval** is required, exactly as the 107-row approval was. Separately, ETP-4 step 4 needs a fresh
rendered-language matrix and an identity-bound visual approval, which the wording import invalidated
by changing product bytes.

## Resume point

1. Regenerate identities by the §6.3 path, including the deliberate MAH-4 byte-total bump.
2. Re-run `test:modular`, `test:mah3`, `test:mah4`, `test:manifest` to green.
3. Obtain a new owner capability approval for the regenerated delta.
4. Capture one rendered-language matrix; obtain identity-bound visual approval.
5. Build one seeded APK; run physical ETP fixture acceptance.
6. Run the final controlled audit or comparison; update the handoff.

Steps 1 and 2 above are engineering. Steps 3 and 4 are owner gates. Step 5 needs a device.

**Do not** build an APK, run the controlled audit, or claim any gate closure from the current red
state.
