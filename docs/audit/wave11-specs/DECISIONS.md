# Wave 11 orchestrator decisions (resolving synthesis open questions)

1. P1-21 empId: stamp the HUMAN code preferred, uid fallback — `if(__emp && (__emp.employeeId||__emp.id)!=null) record.empId = __emp.employeeId || __emp.id;`
   (register asked for "employeeId"; still optional-by-design, conditional assign, never null).
2. P1-48 demo-seed caveat (loadState reseeds whole state each open in demo builds) — ACCEPTED, document
   in WAVE11.md/changelog only; no code change.
3. Month-end pack for never-locked months renders the existing empty-note page — ACCEPTED (recommended;
   a pack()-level skip guard is more invasive and not wanted).
4. P1-20 Top-Failed panel APPLIES the P1-21 store filter (grmRecMatches) — ACCEPTED (synthesis mandate;
   the Month-End tab must be internally consistent under a filter).
5. Grooming exportCSV: quote ONLY the new Checked By cell; legacy 7 columns stay byte-identical —
   ACCEPTED. Full CSV-quoting fix deferred to a later hardening pass.
6. cro_audit pre-existing stored-XSS-shaped gap: renderMonthDash interpolates ${nm} UNESCAPED (L1763)
   while renderWeekDash escapes it (stEsc L1669). Owner 2 is editing adjacent lines anyway — FOLD the
   one-line stEsc(nm) fix as a documented bonus hardening (out-of-register, zero-risk).
7. buildTasks first-paint target text cosmetic beat — ACCEPTED as-is; skip the optional pass-through.

Owner assignments (5 parallel, one per file): grooming.html · cro_audit.html · payroll.html ·
integration-bridge.js · saagar-report.js. Orchestrator owns: the EXC_AREA_TO_MODULE shell edit
(ALREADY APPLIED: 'CRO':'cro_audit' at index.html L3013), embeds, mojiscan, harness, adversarial, ship.
Binding: synthesis.json owner_plans/collisions/contracts are the implementation source of truth;
saagar-report edits go to saagar-control-centre/www/saagar-report.js ONLY (the -demo copy is stale).
