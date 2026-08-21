# Retail ETP completion phases

**Program boundary:** This is a separate post-Phase-4 product workstream. Phase 4
and all Phase 4 subphases remain complete.

**Current product:** The Retail parser, four-report reconciliation, encrypted
native generation store, import coordinator and import overlay exist. ETP is not
a modular module, no application screen consumes `readVerified`, and no physical
four-file publication has been completed.

## Non-negotiable architecture

- Add a Reports-owned `www/modules/etp/index.html` as the twelfth modular module.
- Keep all eighteen `www/etp-*.js` engines loaded once in the parent shell.
- Do not move, duplicate or re-bootstrap the parser, Web Worker, native adapter,
  receipt registry, encryption or publication lifecycle inside the iframe.
- Expose only a narrow parent gateway: controlled import, confirmation, verified
  paged reads and sanitized status/history. Never expose the raw native plugin,
  unrestricted `readFacts`, workbook bytes, raw rows, filenames or PII.
- Keep ETP exclusively under Reports and absent from Settings.
- Owner/admin may import and publish after fresh reauthentication. Store Manager
  may read accepted in-scope views. Other roles fail closed unless explicitly
  granted later.
- Retain PAYMENTTYPE25 quarantine in core v1. Mapping it requires a separately
  approved versioned contract change and re-import.

## ETP-0 — Frozen boundary and crash checkpoint

Deliverables:

- Phase plan and immutable `retail-etp-core-v1` boundary recorded.
- Existing Phase 4 closure documentation committed separately from ETP code.
- Current untracked old-identity rendered evidence excluded from every ETP commit.

Exit: clean, recoverable documentation checkpoint; no product change.

## ETP-1 — Modular shell and safe query contracts

Deliverables:

- `www/modules/etp/index.html` using the standard bridge/runtime/MAH4 stages.
- Twelfth canonical manifest entry and all hard-coded module authorities updated.
- Reports card routes to `openModule('etp')`; Settings has no ETP route.
- Parent ETP module gateway with fail-closed role/store/scope checks.
- Sanitized current status, accepted receipt, bounded history and verified paged
  read methods. Screens never call the native store directly.
- Deterministic synthetic four-XLSX generator and parser/reconciliation tests.

Exit:

- Existing ETP core tests remain green.
- Modular manifest and lifecycle tests recognize exactly twelve modules.
- Unauthorized access, missing receipt, restore fence and generation mismatch
  return no facts.
- Four generated fixtures are byte-reproducible and pass the production parser
  and REC-002/REC-003/REC-004 happy path.

## ETP-2 — Import, status, coverage and history

Deliverables:

- Existing four-file import workflow rendered inside the ETP module.
- Recognition summary, selected scope, four-report coverage and REC-002 result.
- Owner reauthorization and atomic publication retained unchanged.
- Persistent accepted status and bounded import history recover after relaunch.
- Restore-fenced scopes show `Re-import required`; stale facts never render.

Exit:

- Wrong, duplicate, missing or mismatched reports fail closed.
- Re-import preserves the prior accepted generation until the new generation is
  fully accepted.
- No workbook bytes, raw rows, filenames or PII enter portable control storage.

## ETP-3 — Verified Retail reports and exceptions

Deliverables:

- Paged R022 Revenue/Tender, R025 Sales Detail, R013 CRO Attribution and R003
  Discount views, all supplied only by the verified-reader gateway.
- Coverage and reconciliation screen with REC-002, R003/R013 exception counts and
  a visible PAYMENTTYPE25 quarantine warning.
- `READY`, `READY WITH WARNINGS` and `NOT READY` states.
- No report export in this first release.

Exit:

- Pagination cannot mix scope or generation.
- REC-002 failure produces `NOT READY` and no apparently complete totals.
- R003/R013 never add revenue, and PAYMENTTYPE25 is never silently classified.
- Opening, filtering and paging reports performs no writes.

Targets, incentives and broader E3-E6 operations are explicitly deferred until
their business authorities exist; they are not required to complete this bounded
four-report Retail module.

## ETP-4 — One-time identity regeneration and acceptance

After product code freezes once:

1. Regenerate manifest, golden module identities, MAH3/MAH4 profiles and capability
   ledger once.
2. Run focused ETP/modular/security/language suites, then the full offline suite
   once.
3. Generate a new signed/rendered identity and build one seeded APK.
4. Push four deterministic synthetic XLSX files to Android Downloads and manually
   select each through the OEM document provider.
5. Validate, reauthenticate, publish, relaunch and read verified facts on the
   physical device. Interruption must preserve the previous generation; safe
   low-storage refusal must leave no partial publication.
6. Repeat with one untouched same-store/same-period production set for WLMHW and
   HEMW when authorized. Synthetic fixtures cannot close production publication.

The chooser currently reads selected bytes immediately and does not persist URI
permission. Acceptance therefore tests OEM selection, publication, relaunch and
verified readback—not retained access to the source document. Adding retained URI
access would be a separate native requirement.

## Stop rules

- No repeated whole-app audits or APK builds before the ETP product identity is
  frozen.
- No favorable rerun selection.
- No PAYMENTTYPE25 guess.
- No production data in Git, synthetic fixtures, logs or borrowed devices.
- No claim that Phase 4 reopened; this workstream has its own ETP-1 through ETP-4
  checkpoints.
