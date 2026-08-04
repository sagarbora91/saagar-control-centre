# Agent Resume Prompt — Saagar Control Centre

**Generated:** 2026-08-04 · **State captured at:** `origin/main` = `62132c4`
**Use:** paste §1 to a fresh agent (Codex or otherwise) as its opening prompt.
Regenerate this file whenever the baseline moves.

---

## 1. THE PROMPT — copy everything in this block

```
You are resuming work on the Saagar Control Centre, an offline-first Android app
for a two-store retail jewellery business (Titan World "WLMHW" and Helios "HEMW"
in Latur, India). Repo root: V:\Co work\Projects\Retail\saagar-control-centre
GitHub: https://github.com/sagarbora91/saagar-control-centre

DO NOT WRITE ANY CODE UNTIL YOU HAVE COMPLETED THE AUDIT IN PART A AND REPORTED
ITS RESULTS. The last agent that skipped verification rebuilt a feature that had
already shipped three days earlier.

=== PART A — AUDIT FIRST (mandatory, read-only) ===

A1. Verify the baseline. Run:
      git -C "<repo>" fetch origin
      git -C "<repo>" log --oneline -8
      git -C "<repo>" status --short
      git -C "<repo>" rev-parse HEAD
      git ls-remote --heads origin main
    EXPECTED: HEAD == origin/main == 62132c4cd4d31d0cf8317d51a4abd9ce77c4edac,
    working tree clean. If it differs, STOP and report — someone has moved on.

A2. Verify the test suite. Run:
      node --test "tests/*.test.mjs"
      npm run test:offline
    EXPECTED: 260/260 and 257/257 respectively, zero failures.
    NOTE: test:offline lists files EXPLICITLY in package.json. A new test file
    that is not added to that list is silently skipped by CI. Always check.

A3. Read these four documents IN THIS ORDER before forming any plan:
      1. docs/audit/HANDOFF.md            <- single resume point; read the top
                                             sections only. Everything below the
                                             "HISTORICAL RECORD" fence is stale
                                             by design — do not act on it.
      2. docs/V6-IMPROVEMENT-ROAD-PLAN.md <- D/E/F waves, live sequence, phase
                                             count, and the section 4b orphan gap
      3. docs/MODULAR-HTML-MIGRATION-STRATEGY-2026-08-04.md
      4. docs/audit/D5-STOCK-CHANGE-CONTRACT-2026-08-04.md  <- the next wave

A4. Verify the claims you just read, do not trust them:
    - confirm D1-D4 really shipped:  git log --oneline 4177701 -1  and  9b54a44 -1
    - confirm the module count and sizes with your own measurement of
      www/index.html's MODULES array (expect 11 modules, ~77.9% of the file is
      base64)
    - confirm which modules already have real extracted files under www/modules/
      (expect NONE yet — the first extraction is D5's M1)

A5. REPORT the audit before doing anything else. State: actual HEAD, actual test
    counts, whether the four documents agree with the repository, and any
    discrepancy you found. If a document contradicts the code, THE CODE WINS and
    the document is a bug to fix.

=== PART B — WHERE THE PROJECT STANDS ===

SHIPPED AND MERGED:
  Phase 0  encrypted storage, owner access, storage recovery, R1 legal minimum
  D1 Home "Today" view (shell)     D2 QMS      D3 Service      D4 DSR
  Suite 260/260. Debug APK 6,593,846 bytes, SHA-256
  8fe8167b983e8c59a99ae9ed671e7ca0e29234c745e8a98a132391560792fdea

NOT ACCEPTED — engineering-complete is NOT the same as accepted:
  No device pass, no staff UAT, no legal approval, no production signing.
  Phase 0 needs 69 functional cases + 4 drills + 9 operational gates.
  D4 needs its 8 device cases, listed as D4-01..08 in
  docs/audit/D4-DSR-CHANGE-CONTRACT-2026-08-04.md section 9.
  All of it waits on the owner's nominations form, outstanding since 2026-08-02.

NEXT WAVE: D5 (stock). Contract drafted, implementation NOT started.
  D5 carries the FIRST modular extraction (M1) because the owner chose the
  incremental migration variant on 2026-08-04.

PROGRAMME SHAPE: ~4 waves done, ~20 remaining before PHP.
  Stage A build + incremental migration  13 phases
  Stage C device acceptance               1
  Stage E ETP / E-series                  6-7
  Stage F PHP / Track B                   unscoped, deferred

BLOCKED ON THE OWNER, NOT ON ENGINEERING:
  1. Phase 0 nominations form -> unblocks every device gate
  2. ETP sample exports from BOTH stores -> unblocks the entire E-series
  3. Three D5 questions: the variance cause taxonomy; whether stock-DSR
     reconciliation should ever BLOCK the lock (currently advisory); who owns a
     variance by default

=== PART C — ARCHITECTURE YOU MUST UNDERSTAND BEFORE EDITING ===

www/index.html is ONE file of 3,087,060 characters.
  - 77.9% of it is eleven base64-encoded module payloads in a MODULES array
  - modules: stock service qms dsr expense grooming cro_audit payroll leave tax
    planning
  - a module boots by base64-decoding, running TEN chained string injections
    (buildModuleSrc), then assigning to iframe.srcdoc
  - shell<->module contract: 17 ST_* postMessage types PLUS direct
    window.parent.<Global> access (SaagarReauth, SaagarDsrCompletionPolicy, ...)

CHANGING A MODULE TODAY means running a deterministic patcher script
(scripts/apply-d2-qms.mjs, apply-d3-service.mjs, apply-d4-dsr.mjs) that decodes
the base64, string-patches it, re-encodes, and regenerates bytes + sha256.

THIS IS THE FRAGILITY THE MIGRATION EXISTS TO REMOVE. Defects already hit here,
all fixed 2026-08-04 — expect them if you touch a patcher:
  - a string anchor matching the wrong place (the D4 anchor also matched the
    CLOSING stock grid, not just opening)
  - an idempotency guard testing for a token its own injected code contains
  - Function.prototype.toString() carrying the PATCHER FILE's line endings into
    the payload, so output depended on how git checked the script out
  - all three patchers silently dropping one byte per run from the MODULES line;
    git normalises index.html LF-on-commit/CRLF-on-checkout so git status stayed
    clean while the file really changed

=== PART D — HOUSE RULES, NON-NEGOTIABLE ===

1. READ THE REAL CODE BEFORE PLANNING. Extract the module payload and read it.
   Do not design from the road plan's one-line description.
2. WRITE A CHANGE CONTRACT FIRST, in docs/audit/, following
   D4-DSR-CHANGE-CONTRACT-2026-08-04.md. Include what exists today, the defects
   found, what changes, what is out of scope, risks, and open owner questions.
3. PURE POLICY IN ITS OWN FILE under www/, no DOM/storage/clock, with its own
   tests. See www/dsr-completion-policy.js.
4. STORAGE IS RADIOACTIVE. storage-core.js has crashed the app three times in
   about three days. Storage changes go LAST, micro-incremental, device-tested
   each step. D5 must not touch it. Never add a new storage KEY when an additive
   FIELD on an existing record will do.
5. NEVER claim something works because the build succeeded. Unpack the APK and
   verify the change is actually inside it.
6. ADD EVERY NEW TEST FILE to npm run test:offline in package.json.
7. THE ANDROID BUILD NEEDS THE BUNDLED JDK 17 — system Java is 8 and cannot run
   Gradle 8.2.1:
     JAVA_HOME="V:/Co work/Projects/Retail/.android-build/jdk17/jdk-17.0.19+10" \
       npm run build:apk
8. NO NETWORK. The APK ships with the INTERNET permission removed. Every asset
   path must be relative and local. No CDN, ever.
9. NEVER put customer data, PINs, passphrases, provider URIs, or signing material
   in git, logs, or any evidence document. Metadata only.
10. ASK the owner rather than deciding: anything that changes what staff must do
    daily, any money rule, any retention or legal rule.

=== PART E — WHAT TO DO NEXT ===

After reporting the Part A audit, propose a plan for D5, which has two halves:

  D5-M1  Extract the stock module to real files (www/modules/stock/index.html)
         and switch ONLY stock to iframe.src, leaving the other ten on srcdoc.
         The correct file content already exists in the running system:
         buildModuleSrc(stockModule) returns exactly what runs today, so this is
         a MECHANICAL EXTRACTION, byte-assertable, not a rewrite.
         RISK: srcdoc iframes inherit the parent origin (this is why
         window.parent.SaagarReauth resolves); src iframes do not.
         capacitor.config.json sets androidScheme https / hostname localhost so a
         relative src SHOULD stay same-origin — that must be PROVEN ON A REAL
         DEVICE before anything depends on it.

  D5-S1..S3  Variance triage record (cause/owner/next action/closure), guided
         stock<->DSR<->QMS reconciliation (advisory, three numbers with
         provenance, never one blended figure), and brand drill-down.
         S1 needs the three owner answers listed in Part B first.

ALSO FLAG TO THE OWNER, from road plan section 4b: there are 11 modules but only
8 are covered by remaining waves. qms, service and dsr shipped before the
incremental decision and have NO future wave to ride on. The three apply-d*.mjs
patchers exist for exactly those three modules, so while they survive the whole
base64 fragility class stays alive. Recommendation on record: a dedicated
M1-catchup phase for those three right after D5 proves the extraction, then
delete all three patchers so D6-D12 need no patcher machinery at all.
```

---

## 2. Files to keep current so any agent can resume

Update these **in this order**; each depends on the one above it.

| Order | File | Update when | Must always state |
|---|---|---|---|
| 1 | `docs/audit/HANDOFF.md` | **every merge to main** | current `origin/main` SHA, both test counts, current APK + SHA-256, completed vs remaining inventory, phase count, what blocks each item |
| 2 | `docs/V6-IMPROVEMENT-ROAD-PLAN.md` | a wave ships, or sequence changes | per-wave Status column with its commit; the live sequence; §4b migration coverage |
| 3 | `docs/audit/D<N>-<MODULE>-CHANGE-CONTRACT-<date>.md` | one per wave, before building | what exists today, defects found, changes, out-of-scope, risks, evidence, **open owner questions** |
| 4 | `docs/MODULAR-HTML-MIGRATION-STRATEGY-2026-08-04.md` | a migration phase completes | which of M0–M6 are done; whether the origin model was device-proven |
| 5 | `docs/AGENT-RESUME-PROMPT-2026-08-04.md` *(this file)* | baseline SHA or test counts move | the expected SHA and counts in Part A — they are the audit's tripwire |
| 6 | `package.json` → `test:offline` | any new test file | the list is explicit; omissions are skipped silently |
| 7 | `verification/PHASE-0-*.md` | a device gate closes | which of the 69 cases / 4 drills / 9 gates passed, with named person and date |

### The rule that matters most

**The handoff's header facts are the tripwire.** When they went stale on
2026-08-04 — claiming baseline `49d531b`, 54 tests, and an uncommitted D1
checkpoint — an agent read them, believed them, and rebuilt D1 from scratch even
though D1 had shipped three days earlier. The rebuild also deleted the working
Home screen, and the tests did not catch it because they were regex checks
against JS source rather than DOM assertions.

If a document and the repository disagree, **the repository is right and the
document is a defect**. Fix the document in the same session.

### Known documentation debt

- `docs/PHASE-1-PREREQUISITES-CHECKLIST-2026-08-02.md` still carries a
  "D1 design approved ✋ PENDING" gate. D1 shipped 2026-07-30. Its E-series gates
  are all genuinely still open, so the file is not wholesale wrong — just that
  one section.
- 16 remote branches, most stale. `agent/d1-d3-native-sqlite` and
  `agent/storage-recovery-p0` are fully merged and safe to delete.
  **`agent/e1-etp-import` must be kept** — it holds the E1 draft.
- No `.gitattributes` rule for `*.mjs` or `index.html`. This is the root cause of
  the line-ending defect class. Pinning them to LF would prevent recurrence but
  rewrites endings across the working tree on next checkout — do it deliberately,
  as its own change, never as a side effect.
