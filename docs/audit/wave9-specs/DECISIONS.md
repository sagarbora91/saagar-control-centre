# Wave 9 orchestrator decisions (resolving synthesis open questions)

1. theftVerified is DAY-LEVEL {by,at}|null (P1-7 owns). The Monthly report (P1-6) shows '✓ SM verified'
   on every theft row of a verified day — accepted; per-row verification is out of scope.
2. The audited re-open sheet (mandatory reason) applies to ALL unlocks including OPENING unlock —
   accepted for consistency. reopenLog entries carry section 'opening'|'closing'|'movements'.
3. No demo-seed.js edit this wave. Seeded data may fire the new theft/cash exceptions on first open —
   accepted as demo material.

Implementation owners:
- stock.html owner: Phases A(P1-5) -> B(P1-7) -> C(P1-6) -> D(P1-8) -> E(one-pass normaliseImportData).
- integration-bridge.js owner: dsrStoreCode/dsrDaySales helpers -> consumeDsrToStock salesCount ->
  buildExceptions inserts (P1-40 replace QMS block, P1-7 theft block, P1-43 cash block).
Orchestrator (me) owns: embed, mojiscan, harness verify, adversarial workflow, ship.

PERMANENT COPY BANS (EOD wizard regex filters in index.html):
- area 'QMS' exception msg must never match /open lead/i (L3070)
- area 'Cash' exception msg must never contain 'mismatch' in any casing (L3084)
