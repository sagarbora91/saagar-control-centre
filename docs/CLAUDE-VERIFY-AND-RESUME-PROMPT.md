# Claude — Verify-Another-Agent's-Work and Resume

**Purpose:** paste §1 into a fresh Claude session after another agent (Codex or
otherwise) has worked the repository. It audits what they changed, then resumes.

**Maintenance:** the only value that must be updated is the **verified baseline
SHA** in the prompt. Set it to the last commit Claude authored and verified.
Current value: `62132c4`.

---

## 1. THE PROMPT — copy everything in this block

```
Resume work on the Saagar Control Centre.
Repo: V:\Co work\Projects\Retail\saagar-control-centre
GitHub: https://github.com/sagarbora91/saagar-control-centre

Another agent (Codex) has been working in this repository since I last verified
it. Your first job is to find out exactly what they changed and whether it is
sound. DO NOT BUILD ANYTHING until you have finished PART 1 and reported it.

Treat their work as unreviewed. Do not trust commit messages — re-derive every
claim from the code and the tests. Being thorough here is the job, not
pedantry: this repo has a history of green tests over a broken app.

=== PART 1 — FIND AND VERIFY WHAT CHANGED ===

VERIFIED BASELINE: 62132c4   (last commit I authored and verified;
                              at that point: suite 260/260, test:offline 257/257,
                              working tree clean, origin/main == local main)

1.1  Establish the delta.
       git -C "<repo>" fetch origin
       git -C "<repo>" status --short
       git -C "<repo>" log --oneline 62132c4..HEAD
       git -C "<repo>" diff --stat 62132c4..HEAD
       git ls-remote --heads origin
     Report: how many commits, which files, how many lines, any new branches.
     If HEAD == 62132c4, nothing was done — say so and skip to PART 3.

1.2  Re-run everything. Do not accept a claimed result.
       node --test "tests/*.test.mjs"
       npm run test:offline
       npm run test:security
     Compare against 260 / 257 / 101 at the baseline. A LOWER total than
     baseline means tests were deleted or silently dropped — investigate before
     anything else.

1.3  Check for the failure modes this repository actually produces:

     (a) TESTS GREEN, APP BROKEN. The known incident: an agent deleted the Home
         screen's DOM hosts while the JS still rendered into them, and the suite
         stayed green because those tests regex JS source, not the DOM.
         For every id="..." removed from www/index.html in the diff, confirm no
         surviving $('id') reference:
           git diff 62132c4..HEAD -- www/index.html | grep '^-.*id="'
         then grep each removed id for "$('<id>')" in the current file.

     (b) SILENTLY SKIPPED TESTS. npm run test:offline lists files EXPLICITLY in
         package.json. Any new tests/*.test.mjs not added to that list never
         runs in CI. Enumerate tests/ and diff against the script's list.

     (c) PATCHER DAMAGE. If any scripts/apply-d*.mjs changed, verify for each:
           - byte-level idempotency: copy www/index.html, run the patcher, diff.
             It must be a NO-OP on an already-patched bundle.
           - line-ending independence: node --test tests/patcher-eol-independence.test.mjs
           - the MODULES line terminator survives (a greedy \s* once ate the CR
             and dropped one byte per run, invisible to git because git
             normalises index.html LF-on-commit / CRLF-on-checkout)

     (d) UNDECLARED PAYLOAD DRIFT. If www/index.html changed, decode the MODULES
         array and confirm ONLY the module(s) the commit claims to touch have a
         different sha256. Also confirm every module's recorded bytes/sha256
         still match its own base64. All 11 must be self-consistent.

     (e) STORAGE. If www/storage-core.js changed at all, treat it as high risk
         and say so loudly. It has crashed the app three times in about three
         days. Storage changes go last, micro-incremental, device-tested.

     (f) NEW STORAGE KEYS. A new key must be registered in STORAGE_RULES or
         appControlKeys() or it silently vanishes from backup/restore. Prefer an
         additive FIELD on an existing record over a new key.

     (g) SECRETS AND PII. No customer data, PINs, passphrases, provider URIs or
         signing material in any changed file. Metadata only.

1.4  Check process, not just code:
     - Was a change contract written in docs/audit/ BEFORE the code? House rule.
     - Is new logic in a pure policy file under www/ with its own tests, or was
       it buried in a patcher?
     - Was any APK claim verified by unpacking, or merely by "build succeeded"?
     - Do docs/audit/HANDOFF.md and docs/V6-IMPROVEMENT-ROAD-PLAN.md still match
       the code? If not, the DOCUMENT is the defect — the repository is right.

1.5  REPORT before doing anything else, in this shape:
       - what changed (commits, files, scope)
       - what you verified and how
       - what is CORRECT and can be built on
       - what is WRONG or UNPROVEN, with the specific evidence
       - what you would fix first
     If everything is sound, say so plainly. Do not invent problems. If you
     cannot verify something, say it is unverified rather than assuming.

=== PART 2 — RECONCILE ===

If PART 1 found defects: propose fixes, smallest first, and get my go-ahead
before large changes. Fix stale documentation in the same session you find it.

If PART 1 was clean: update docs/audit/HANDOFF.md so its header facts (baseline
SHA, both test counts, current APK + SHA-256) match reality, and update the
verified-baseline marker in docs/CLAUDE-VERIFY-AND-RESUME-PROMPT.md to the new
HEAD.

=== PART 3 — RESUME ===

Read, in order, and trust the CODE over any of them if they disagree:
  docs/audit/HANDOFF.md                     (top sections only — everything below
                                             the HISTORICAL RECORD fence is stale
                                             by design)
  docs/V6-IMPROVEMENT-ROAD-PLAN.md          (waves, live sequence, phase count,
                                             §4b orphan gap)
  docs/MODULAR-HTML-MIGRATION-STRATEGY-2026-08-04.md
  docs/audit/D5-STOCK-CHANGE-CONTRACT-2026-08-04.md

State at baseline 62132c4 — re-verify, do not assume:
  SHIPPED: Phase 0, D1 (shell), D2 (qms), D3 (service), D4 (dsr). None ACCEPTED —
  no device pass, no UAT, no legal approval, no production signing.
  NEXT: D5 (stock) — contract drafted, implementation not started. D5 carries the
  first modular extraction (M1) because the owner chose the incremental variant.
  ~4 waves done, ~20 remaining before PHP.

House rules, non-negotiable:
  1. Read the real code before planning; extract the module payload and read it.
  2. Change contract in docs/audit/ before code.
  3. Pure policy in its own www/ file, no DOM/storage/clock, with its own tests.
  4. storage-core.js is radioactive — last, micro-incremental, device-tested.
  5. Never claim it works because the build succeeded; unpack the APK.
  6. Add every new test file to npm run test:offline.
  7. Android build needs the bundled JDK 17 (system Java is 8):
       JAVA_HOME="V:/Co work/Projects/Retail/.android-build/jdk17/jdk-17.0.19+10" \
         npm run build:apk
  8. No network — the APK ships without INTERNET permission; all paths relative.
  9. No secrets or PII in git, logs, or evidence documents.
 10. Ask the owner rather than deciding: anything changing daily staff work, any
     money rule, any retention or legal rule.

Then propose what to do next and wait for my go-ahead.

Three owner questions are still open and block D5-S1 (but not D5-M1):
  - the variance cause taxonomy
  - whether stock↔DSR reconciliation should ever BLOCK the lock (currently advisory)
  - who owns a variance by default
```

---

## 2. Keeping this prompt honest

The prompt's power is the **verified baseline SHA**. It must mean *"a human-
reviewed Claude session ended here with a green suite and a clean tree."*

- After a clean verification pass, advance it to the new HEAD.
- After finding defects, advance it only once they are fixed and green.
- **Never** advance it to a commit you did not verify — that silently launders
  unreviewed work into the trusted baseline, which is exactly what this prompt
  exists to prevent.

Baseline history:

| SHA | Date | Suite | Note |
|---|---|---|---|
| `62132c4` | 2026-08-04 | 260/260 | D1–D4 shipped; D5 contract drafted; agent resume prompt added |
