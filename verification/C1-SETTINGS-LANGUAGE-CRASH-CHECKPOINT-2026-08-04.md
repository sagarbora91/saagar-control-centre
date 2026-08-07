# C1 Settings + language crash checkpoint — 2026-08-04

## Resume identity and safety

- Repository: `V:\Co work\Projects\Retail\saagar-control-centre`
- Branch: `main`
- HEAD: `c04bc98255a78d45b08ac449d88365b22d033f28`
- Working tree: intentionally dirty; preserve every existing/user-owned change.
- No commit or push was performed. Do not reset, discard, delete, commit or push
  without Sagar's explicit approval.
- `package-lock.json` was not changed. PHP remains excluded.

## Saved implementation

- Settings dual-layout protection:
  - phone/compact desktop uses the home/detail stack through 980 px;
  - wide desktop uses persistent master/detail from 981 px;
  - desktop detail forms override the global three-column grid with two columns;
  - viewport changes re-evaluate the Settings presentation;
  - saved layout and text-size preferences are re-applied after authoritative
    storage hydration.
- Shared language runtime: `www/app-i18n.js`.
  - Loaded by the shell and all 11 external modules.
  - Marathi and Hindi exact-phrase dictionaries plus conservative composed-label
    translation; unknown phrases remain English.
  - Dynamic UI is handled with a `MutationObserver`.
  - Editable values, contenteditable content and ordinary table-body business
    data are not translated; buttons in table rows remain eligible.
  - `ST_LANG` broadcasts changes to the open module and module load replays the
    saved language.
  - Shell language/layout/text preferences are re-applied after authoritative
    storage hydration to avoid startup reverting to English/Mobile.
- Settings language heading no longer renders the duplicate `भाषा / भाषा` form.
- Module registry bytes/SHA-256 and
  `verification/module-build-golden-hashes.json` were refreshed after adding the
  shared module script.

## Verification evidence saved before power loss

- Settings focused suite: 8/8 passed before the final authoritative-hydration
  assertion was added; rerun it first on resume.
- Language focused suite: 4/4 passed after the latest dictionary expansion.
- Offline regression: 256/256 passed after module metadata refresh, before the
  final dictionary and authoritative-hydration additions.
- Full regression: 289/289 passed after module metadata refresh, before those
  final additions.
- Live in-app browser at 425×680:
  - Settings phone home and Appearance detail rendered correctly;
  - Marathi Settings home/detail rendered correctly and remained navigable;
  - saved Desktop preference returned after reload once authoritative hydration
    was handled;
  - Stock module navigation translated to Marathi while brand/business values
    stayed unchanged.
- This is browser engineering evidence only. It is not physical-device or
  wide-desktop acceptance.

## Resume verification and language audit — 2026-08-06

- Repository identity was rechecked before editing: branch `main`, HEAD
  `c04bc98255a78d45b08ac449d88365b22d033f28`, intentionally dirty tree.
- Final verification on the resumed edited state:
  - Settings focused suite: 8/8 passed.
  - Language focused suite: 4/4 passed.
  - Offline regression: 256/256 passed (including the C1, mobile, Settings and
    language pre-gates).
  - Complete test glob: 289/289 passed.
- The shared Marathi and Hindi dictionaries now each contain 860 unique exact
  phrases, with no duplicate English keys. The focused guard is raised to 850
  and pins representative DSR, Service, Stock and Tax translations.
- A deterministic static-candidate audit found 1,155 translated candidates out
  of 1,641 (70.4%) across shell and modules. This is a planning signal, not a
  product acceptance percentage: the denominator still includes proper names,
  abbreviations, export formats, example values and domain/legal wording that
  should not be translated blindly.
- The resumed pass added bounded navigation, form and action vocabulary while
  continuing to exclude editable content, table-body business data, generated
  templates, proper names and unreviewed legal prose.
- A live wide-browser attempt could not run because the browser safety policy
  rejected the local `127.0.0.1` URL. The permanent responsive source tests are
  green, but no new wide-desktop visual evidence is claimed.
- No seeded APK was built. No commit or push was performed. `package-lock.json`
  remains untouched and PHP remains excluded.

## Remaining actions

1. Inspect Settings at a real wide desktop viewport (>=1280 px) and compact
   desktop/tablet viewport. Record visible navigation, overflow and detail-form
   evidence; source-contract tests alone are not visual acceptance.
2. Have a fluent Marathi/Hindi reviewer approve remaining Service, Payroll, QMS,
   Tax and legal/domain wording. Do not claim full module translation from the
   70.4% static-candidate audit.
3. Run one physical-device C1 smoke covering Settings phone navigation, language
   switching, one dense module, Android Back and rotation. Record device/API and
   observations; do not convert owner-reported smoke into formal acceptance.
4. Build a fresh seeded APK only when review distribution is needed, then repeat
   package/signature/demo-seed checks.
5. Commit or push only after Sagar explicitly approves the intended dirty-tree
   scope.
