# Phase 6C Planning source proof — 2026-08-24

**Status:** source proof complete; independent visible-browser gate pending.

## Implemented boundary

- `www/shared/module-mobile-legacy.css`: 24,977 bytes, SHA-256
  `acc970dbe54fb99b0dfa25a2807fb3626ba11130fcd87969ca336d8000efa443`, 191 balanced top-level
  rules.
- Planning: 14,760 bytes, SHA-256
  `1e537c757f468a4639d2062489996367dd1a4d703913b5943c089a7e8541ac07`.
- Cascade: existing common CSS, legacy CSS link carrying `st-v5-mobile-css`, mobile boot.
- Dedicated preparation tooling uses the frozen eleven-module allowlist and is idempotent in an
  isolated two-run fixture.
- Manifest, golden and API-23 shared-asset identities bind the new source.

## Independent source review

Re-inlining the shared asset reconstructs Planning's checkpoint source byte-for-byte, including
SHA-256 `8fd35c2046b49034f0bb293b513dbf51a69e76054ebe12a4f0b8915a330aef4c`.
The ten other legacy modules were not migrated. ETP remains 34,473 bytes, SHA-256
`b2973563b988779468471950bb777c6323580e90ac6011c9038581845b9cfa12`, with zero imports of the
legacy asset.

The historical MAH3 receipt continues to bind the reconstructed inline source. Tests do not
rewrite that receipt to imply the new external-asset build has been visually reviewed.

## Verification

- focused source, manifest, API-23, MAH3 and modular suite: **49/49**
- `npm run test:phase0`: **69/69**
- preparation rerun: byte-identical/idempotent
- `git diff --check`: clean

## Remaining gate

Complete an independent visible-browser Planning before/after comparison at 360x800, 412x915,
800x600 and 1365x768, with the Phase 6 boundary widths where applicable. Until that passes, do
not migrate the remaining ten legacy modules and do not claim Phase 6C closure.
