# ETP report-engine bridge: pack format, version 1

Contract id `SCC_ETP_BRIDGE_V1`, `schemaVersion` 1. This document is for the engine side (the ETP Reporting Engine exporter) and for anyone
reading the tablet verifier. It describes the file the engine writes and exactly how the tablet checks it.
It contains no key, no signature and no sample pack. Owner decisions are quoted from chat, 2026-11-12.

## 1. Purpose and scope

- One pack holds one store and one period: exactly four reports, `R003`, `R013`, `R022` and `R025`, with the columns the tablet already
  accepts from the four-report Excel import, plus the engine's own totals (owner decision Q6).
- The only store accepted today is `WLMHW`. `HEMW` is blocked on this path (Q5). The service store `AW330` is refused.
- The pack carries no customer data: no names, mobile numbers, addresses, PAN, Aadhaar, dates of birth, e-mail, workbook names or file names.
- The tablet never goes online. The pack travels by USB cable, OTG stick or a synced folder (Q9).
- In Wave 6 the tablet verifies a pack, holds it in memory and compares it with the four-report Excel import. Nothing from a pack is
  published, stored, or used in any calculation. The engine is not yet an approved source (Q2). Where the engine and the tablet differ because
  of a business rule, the engine's figure counts (Q3); that is shown beside the tablet's figure and changes no calculation in this wave.

## 2. Status

This is a proposal that becomes frozen only when the owner approves it. Until then the first real engine pack may force a correction.
`GATE-ETP-BRIDGE-TRUST` (key ceremony and device verification) is closed: the shipped tablet app contains no trusted public key, so it
refuses every pack with `ETP_BRIDGE_TRUST_GATE_CLOSED`. The owner creates the real signing key himself (Q1); Wave 6 uses a throwaway test
key that exists only in memory while the tablet's own tests run.

## 3. Container

One file, extension `.scc-etp`. All integers are big-endian. The file name is a hint only and is never trusted or shown.
Suggested name: `WLMHW_2026-27_2026-08-01_2026-08-31_G01.scc-etp`.

| Offset | Size | Field | Rule |
|---|---|---|---|
| 0 | 8 | magic | ASCII `SCCETP1` followed by a line feed: `53 43 43 45 54 50 31 0A` |
| 8 | 8 | key id | first 8 bytes of SHA-256 of the 65 byte public key point (`04 X Y`). A routing hint; it is repeated inside the signed manifest |
| 16 | 1 | signature algorithm | `0x01` = ECDSA P-256 with SHA-256, IEEE P1363 signature. Any other value is refused |
| 17 | 64 | signature | `r` (32 bytes) then `s` (32 bytes) |
| 81 | 4 | manifest length `M` | 1 to 262,144 |
| 85 | `M` | manifest | canonical JSON text (section 5) |
| 85+`M` | 4 times | section | a 4 byte length, then that many bytes. Sections come in the fixed order `R003`, `R013`, `R022`, `R025` |
| end | 0 | trailing bytes | none: the last section ends exactly at the end of the file |

The header is 81 bytes. The smallest possible file is 102 bytes (header, a 1 byte manifest, four empty sections).

### Limits (checked before any content is decoded)

| Limit | Value |
|---|---|
| whole file | 33,554,432 bytes (32 MiB) |
| manifest | 262,144 bytes |
| rows per report | 50,000 |
| one row line | 16,384 bytes |
| one text cell | 4,096 characters |
| days in `byDay` | 366 |
| JSON nesting in the manifest | 8 levels |
| engine figures | 32 |
| trusted keys on the tablet | 2 |

The tablet's file picker checks the size before it reads the file, so an oversize file is never loaded.

## 4. Signing

- Algorithm: ECDSA, curve P-256, hash SHA-256. The signature is the 64 byte IEEE P1363 form (`r` then `s`), as the engine's update-release
  verifier already uses. In .NET: `ECDsa.SignData(bytes, HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation)`.
- Signed bytes: the 18 ASCII bytes `SCC-ETP-BRIDGE-v1` plus a line feed, followed by the manifest bytes exactly as they sit in the file.
  The prefix means a bridge signature can never pass as a signature of another product, and the reverse.
- The manifest holds the SHA-256 of every data section, so the one signature covers the whole pack.
- Key id: the first 8 bytes of SHA-256 of the 65 byte uncompressed point, written as 16 lower-case hex characters.
- The manifest bytes are never re-serialised by anyone. The tablet checks the signature first and parses afterwards.
- A pack is identified by the SHA-256 of its manifest bytes, never by its signature (ECDSA signatures are malleable: `(r, s)` and `(r, n - s)`
  both verify).
- The private key is never logged, never written beside the pack, and never stored in either repository. The tablet holds only the
  public key, compiled into the app after the key ceremony.

## 5. Manifest

UTF-8 text with no byte order mark, written in this canonical form. The tablet re-creates the canonical text from what it parsed and
requires it to be byte-identical to what it received:

- object keys sorted ascending by UTF-16 code unit; arrays keep their order; no whitespace anywhere;
- numbers only as non-negative integers up to 9,007,199,254,740,991, with no sign, fraction or exponent; decimals are strings;
- strings use only the characters `A-Z a-z 0-9 space . _ : | / + -` and are at most 120 characters, so no escape sequence ever occurs;
- `true`, `false` and `null` where stated; nesting at most 8 levels.

A duplicate key, a re-ordered key, extra whitespace, `1.0`, `1e0`, `A` or any other non-canonical form changes the round trip and is
refused with `ETP_BRIDGE_MANIFEST_INVALID`. Reference implementation:

```js
function canon(value) {
  if (value === null) return 'null';
  var type = typeof value;
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'number') {
    if (!Number.isSafeInteger(value) || value < 0 || (value === 0 && 1 / value < 0)) throw new TypeError('number');
    return String(value);
  }
  if (type === 'string') {
    if (!/^[A-Za-z0-9 ._:|\/+-]{0,120}$/.test(value)) throw new TypeError('string');
    return '"' + value + '"';
  }
  if (Array.isArray(value)) return '[' + value.map(canon).join(',') + ']';
  if (type === 'object') {
    return '{' + Object.keys(value).sort().map(function (key) {
      if (!/^[A-Za-z0-9 ._:|\/+-]{0,120}$/.test(key)) throw new TypeError('key');
      return '"' + key + '":' + canon(value[key]);
    }).join(',') + '}';
  }
  throw new TypeError('type');
}
```

### Top-level keys (exactly these, no others)

| Key | Rule |
|---|---|
| `contract` | `SCC_ETP_BRIDGE_V1` |
| `createdAtUtc` | `YYYY-MM-DDTHH:MM:SSZ`, a real date and time |
| `engine` | object `{migrationLevel: 4 digits, product: "ETP-Reporting-Engine", version: "major.minor.patch"}` (1 to 3 digits, 1 to 3 digits, 1 to 4 digits) |
| `engineFigures` | array of 0 to 32 figures (section 7) |
| `engineGeneration` | integer 1 to 99,999 |
| `exportId` | 32 lower-case hex characters |
| `exportedByRole` | must be `OWNER` (Q7: export by the Owner only) |
| `finalisedThrough` | ISO date, at least `scope.periodEnd` and not after the `createdAtUtc` date |
| `keyId` | 16 lower-case hex characters; must equal the key id in the file header |
| `paymentType25RowCount` | integer; informational. The `PAYMENTTYPE25` column itself is never in a pack (gate `GATE-PAYMENTTYPE25` stays open) |
| `reports` | object with exactly the keys `R003`, `R013`, `R022`, `R025` |
| `schemaVersion` | integer 1 |
| `scope` | object `{financialYear, periodEnd, periodStart, scopeKey, storeCode}` |
| `supersedesExportId` | 32 lower-case hex characters, or `null` |
| `tenderDictionaryVersion` | must equal the dictionary id built into the tablet (`retail-etp-tender-v1` today) |

`scope`: `storeCode` must be exactly `WLMHW` (no trimming, no case change). `financialYear` is `YYYY-YY` with the second part equal to the
first plus one (modulo 100). `periodStart` and `periodEnd` are real ISO dates, both inside that financial year (April to March) and at most
366 days apart. `scopeKey` must equal `storeCode|financialYear|periodStart..periodEnd` exactly, for example
`WLMHW|2026-27|2026-08-01..2026-08-31`. Period policy: `periodStart` is not before `2024-04-01`, and `periodEnd` is at most 2 days after
today's date on the tablet.

### Per-report block (`reports.R003` and the other three), exactly these keys

| Key | Rule |
|---|---|
| `bytes` | integer; must equal the length of that report's section |
| `columns` | array of the report's column names, exactly as in section 6 and in that order |
| `engineTotals` | object `{byDay, sums}` (section 7) |
| `rowCount` | integer 0 to 50,000: the number of lines in the section |
| `sha256` | 64 lower-case hex characters: SHA-256 of the raw section bytes |
| `sourceFileCount` | integer 0 to 13 (informational) |
| `sourceSetSha256` | 64 hex characters: SHA-256 of the engine's source-file SHA-256 values, sorted ascending, joined with `|`. This is how the tablet derives its own source hash, so the two can be compared. Informational |
| `zeroActivity` | boolean; true exactly when `rowCount` is 0 |

## 6. Data sections

Each section is the report's rows as JSON lines, in UTF-8 with no byte order mark. Every line, including the last, ends with one line feed
(never a carriage return). There are no blank lines. A report with no rows is an empty section (length 0) with `rowCount` 0 and
`zeroActivity` true.

Every line is a flat JSON object whose keys are exactly the report's columns, in this order, each written once. Every value is a JSON string or
`null`: never a number, boolean, array or object. The tablet checks the exact shape of each line before it decodes any value, so a duplicate,
re-ordered or extra key, or a nested value, is refused.

| Report | Columns, in order |
|---|---|
| `R003` | `invoice_date`, `transaction_type_raw`, `net_amount`, `scheme_discount`, `user_discount` |
| `R013` | `invoice_date`, `invoice_number`, `transaction_type_raw`, `quantity`, `net_amount`, `cro_number` |
| `R022` | `invoice_date`, `invoice_number`, `transaction_type_raw`, `invoice_quantity`, `net_value`, `cash_amount`, `card_amount`, `bhim_upi_amount`, `phonepe_amount`, `paytm_amount`, `razorpay_amount`, `bharatpe_amount`, `cheque_amount`, `others_amount`, `payment_type24_amount` |
| `R025` | `invoice_date`, `invoice_number`, `transaction_type_raw`, `quantity`, `net_amount`, `brand`, `cluster`, `gender`, `scheme_discount`, `user_discount`, `tax_amount` |

These are the tablet's analytics projections. A column name that could identify a person or a file (names, mobile, phone, e-mail, address,
Aadhaar, PAN, date of birth, workbook, filename and similar) is refused as `ETP_BRIDGE_FIELD_FORBIDDEN`. `payment_type25_amount` is not a pack column.

Value rules:

- `invoice_date`: `YYYY-MM-DD`, a real date, inside `[periodStart, periodEnd]`. A row outside the period refuses the whole pack; the
  tablet does not drop it.
- `transaction_type_raw`: exactly `INV`, `SR` or `BC`. Other case forms and look-alike letters are refused.
- Money columns: a decimal string with exactly two places, for example `12500.00`. Quantity columns (`quantity`, `invoice_quantity`): exactly
  three places, for example `1.000`. Grammar: optional `-`, then `0` or a non-zero digit followed by digits, a point, and the fixed number of
  digits. `-0.00` is not canonical. A value has at most 11 digits in all, and is never null.
- Text columns (`invoice_number`, `cro_number`, `brand`, `cluster`, `gender`): a string up to 4,096 characters without control characters,
  or `null`. Leading zeros in numbers are kept (they are text).
- Sales returns (`SR`) and other signed types carry the value as the engine holds it. The pack does not apply a sign rule.
- Rows should be sorted by the engine so that the same data always gives the same bytes (suggested order: `invoice_date`, `invoice_number`).
  The tablet does not require an order.

## 7. Totals and figures

`reports.<id>.engineTotals` is `{byDay, sums}`.

- `sums` has exactly the report's measure columns as keys and a decimal string for each, with the same scale as the rows. Measure columns:
  R003 `net_amount`, `scheme_discount`, `user_discount`; R013 `quantity`, `net_amount`; R022 `invoice_quantity`, `net_value` and the ten
  payment columns; R025 `quantity`, `net_amount`, `scheme_discount`, `user_discount`, `tax_amount`.
- A sum is the plain arithmetic sum of the row values as written. There is no sign rule and no business rule in the pack's integrity check.
  A sum may have up to 16 digits.
- `byDay` is an array in ascending date order with one entry per date that has at least one row: `{date, rowCount, sums}` with `sums` as above.
- The tablet recomputes every sum and every day from the rows, using exact integer arithmetic. Any difference, even one paisa or one
  thousandth, refuses the pack with `ETP_BRIDGE_TOTALS_MISMATCH`. This is integrity, not a business rule.

`engineFigures` carries figures the engine computes by its own rules (for example the invoice count with ETP decision 41 applied). Each entry has
exactly the keys `date` (an ISO date or `null`), `figureId` (`A-Z 0-9 _ .`, up to 48 characters), `kind` (`COUNT`, `MONEY_UNITS` or
`QUANTITY_UNITS`), `reportId` (one of the four), `ruleRef` (up to 64 characters of `A-Za-z0-9._:-`) and `value` (an integer string, `-0` not
allowed). The tablet shows an engine figure next to its own and never refuses a pack because a figure differs; a malformed entry is a schema
fault. Wave 6 compares one figure, `R022.INVOICE_COUNT` (proposed, to be checked against ETP decision 41). No figure feeds any calculation.

## 8. Refusal behaviour

A pack is accepted completely or not at all. The tablet runs the checks in this order and stops at the first failure, with one stable code
per failure. A result never contains pack text. Every code has a fixed plain sentence on the tablet.

| Order | Code | Meaning |
|---|---|---|
| 0 | `ETP_BRIDGE_TRUST_GATE_CLOSED` | the app holds no trusted key: this is the shipped state, and it applies to every pack |
| 0 | `ETP_BRIDGE_TRUST_ANCHOR_INVALID` | the key list inside the app is malformed |
| 1 | `ETP_BRIDGE_CRYPTO_UNAVAILABLE` | the device cannot verify ECDSA P-256 signatures |
| 2 | `ETP_BRIDGE_INPUT_INVALID` | the input is not a file of bytes |
| 3 | `ETP_BRIDGE_FILE_TOO_LARGE` | more than 32 MiB |
| 4 | `ETP_BRIDGE_FRAME_INVALID` | too short, a length that runs past the end, or trailing bytes |
| 4 | `ETP_BRIDGE_MAGIC_INVALID` | the first 8 bytes are not the magic |
| 4 | `ETP_BRIDGE_SIGNATURE_ALGORITHM_UNSUPPORTED` | the algorithm byte is not 1 |
| 5 | `ETP_BRIDGE_KEY_UNKNOWN` | the key id is not one of the trusted keys |
| 6 | `ETP_BRIDGE_SIGNATURE_INVALID` | the signature does not verify over the domain prefix and the manifest bytes |
| 6 | `ETP_BRIDGE_CRYPTO_FAILED` | the device's crypto call failed for another reason |
| 7 | `ETP_BRIDGE_MANIFEST_INVALID` | not ASCII text, too deeply nested, not JSON, or not in canonical form |
| 8 | `ETP_BRIDGE_CONTRACT_UNSUPPORTED` | `contract` is not `SCC_ETP_BRIDGE_V1` |
| 8 | `ETP_BRIDGE_VERSION_UNSUPPORTED` | `schemaVersion` is not 1 |
| 9 | `ETP_BRIDGE_SCHEMA_INVALID` | a missing, unexpected or badly formed key or value |
| 9 | `ETP_BRIDGE_ROW_LIMIT_EXCEEDED` | a `rowCount` above 50,000 |
| 9 | `ETP_BRIDGE_KEY_ID_MISMATCH` | the manifest `keyId` differs from the header key id |
| 9 | `ETP_BRIDGE_FIELD_FORBIDDEN` | a key or column name that could identify a person or a file |
| 9 | `ETP_BRIDGE_COLUMNS_MISMATCH` | `columns` differ from the report's column list |
| 10 | `ETP_BRIDGE_EXPORT_ROLE_REFUSED` | `exportedByRole` is not `OWNER` |
| 10 | `ETP_BRIDGE_STORE_HEMW_BLOCKED` | the store is `HEMW` |
| 10 | `ETP_BRIDGE_STORE_REFUSED` | any store other than `WLMHW`, including `AW330` and every look-alike |
| 10 | `ETP_BRIDGE_PERIOD_INVALID` | dates, financial year, scope key, earliest date, future date or creation date not valid |
| 10 | `ETP_BRIDGE_PERIOD_INCOMPLETE` | `finalisedThrough` is earlier than `periodEnd` |
| 10 | `ETP_BRIDGE_TENDER_DICTIONARY_MISMATCH` | another payment dictionary than the one built into the tablet |
| 11 | `ETP_BRIDGE_HASH_MISMATCH` | a section's length or SHA-256 differs from the manifest |
| 12 | `ETP_BRIDGE_ROW_INVALID` | a line breaks the row grammar or a value rule |
| 12 | `ETP_BRIDGE_ROW_OUT_OF_PERIOD` | a row is dated outside the period |
| 12 | `ETP_BRIDGE_ROW_COUNT_MISMATCH` | the number of lines differs from `rowCount`, or `zeroActivity` disagrees |
| 13 | `ETP_BRIDGE_TOTALS_MISMATCH` | the recomputed sums or day figures differ from the engine totals in even one unit |
| any | `ETP_BRIDGE_INTERNAL_ERROR` | something unexpected; never an exception, never a partial result |

The tablet's own screen adds a few codes of its own (for example when the role is not allowed, or when there is no Excel import to compare
with); they are not part of the pack format.

## 9. What the engine must guarantee before it exports

- Every day of the period is finalised (`finalisedThrough` is at least `periodEnd`), and the period lies in one financial year.
- The store is `WLMHW`. `HEMW` and `AW330` are never exported (Q5).
- The exporter is run by the Owner role (Q7).
- Rows come from a positive allow-list of the columns in section 6, not from `SELECT *`.
- Totals are plain sums of the exported rows, computed from the same rows in the same run.
- The engine had imported and checked its own sources: a pack must not be built over stale data.
- Corrections are a higher `engineGeneration` with `supersedesExportId` set. Wave 6 does not store generations, so replay and rollback
  rules are decided in the publication wave.

## 10. Conformance

- The tablet repository builds test packs with `scripts/lib/etp-bridge-pack-builder.mjs` and writes a set to a folder outside the repository
  with `scripts/generate-etp-bridge-packs.mjs --output <folder>`. Each pack is signed with a throwaway key pair that is created in memory,
  is non-extractable and is never written. The builder uses the verifier's own canonical function, domain prefix, limits and column lists.
- The engine team's equivalent: the engine's reader reads the tablet's test packs, and the engine's writer output verifies against a trust
  anchor registered in a test build of the tablet verifier. No real key and no signed sample pack is stored in either repository
  (ECDSA signatures are randomised, so there is no byte-for-byte golden file).
- The shipped tablet app refuses every pack, including these, because it contains no trusted key.

## 11. Change control

Any change to a field is a new `schemaVersion`. The tablet refuses an unknown contract with `ETP_BRIDGE_CONTRACT_UNSUPPORTED` and an unknown
schema version with `ETP_BRIDGE_VERSION_UNSUPPORTED`. The contract text should be recorded with the same hash in both repositories when the
owner approves the freeze.

## 12. Open owner items

- Q1: the bridge signing key is created by the owner (private key on the office PC with a passphrase, backup on a USB stick in his custody).
- Q2: the engine becomes an approved source only after compare mode matches the Excel imports for one full month of WLMHW.
- Q12: the engine-side exporter is built after engine 1.15.0 ships.
- Whether incentives and payroll follow Q3 (the engine's figure where a business rule differs) is not decided; Wave 6 changes no calculation.
- The row grain in version 1 has no item number, so a match proves sums and per-invoice sums, not one-to-one line equality.

## 13. How the tablet uses a verified pack in Wave 6 (facade, roles, compare)

Files: `www/etp-bridge-facade.js` (global `SaagarEtpBridgeFacade`), `www/etp-bridge-compare.js` (global `SaagarEtpBridgeCompare`). The ETP module reaches the
facade only through the shell bridge getter `SaagarModuleBridge.etpBridgeGateway`. The facade has exactly six keys: `VERSION`, `CODES`, `status`, `stage`,
`compare`, `discard`. It has no publish, confirm, import, export or row-returning member.
The four bridge files (`etp-bridge-trust.js`, `etp-bridge-pack-verifier.js`, `etp-bridge-compare.js`, `etp-bridge-facade.js`) are not shell script tags: they load on demand
through `www/etp-chain-loader.js` the first time the ETP module asks the bridge. Until they are loaded, and whenever loading fails, the gateway answers
`ETP_BRIDGE_UNAVAILABLE` (closed). In the APK build each of the four files is wrapped in a function scope so that Babel helper functions never become page globals.

**GATE-ETP-BRIDGE-TRUST.** Every entry point checks the verifier's gate first. While the shipped trust list is empty (every shipped build) the gate is closed:
`stage` and `compare` return `ETP_BRIDGE_TRUST_GATE_CLOSED` before the Owner session is read, before any file is touched and before any PIN keypad is shown.
Nothing stored, sent, typed or contained in a pack can open the gate. The gate is registered as open in the audit register (`scripts/audit/config.mjs`, `OPEN_GATES`); registering it does not open it.

**Roles (owner decision Q7, given in chat, 2026-11-12).** The role comes only from the Owner session snapshot, never from the request or the pack.
The Owner may use the bridge with no prompt. A Store Manager who can open the ETP module (`roleCanOpen('etp')`) is asked once for the Owner PIN through the
existing reauthentication, which must answer exactly `true`. Every other role is refused and no keypad is shown. A role or gate change between `stage` and
`compare` discards the staged pack and refuses the call. `compare` never asks for a second PIN. Export is engine-side and is not in this wave.

**Staging.** A verified pack is held in the facade's memory only: one slot, 10 minutes, discarded on a new `stage`, on `discard`, on a role or gate change and on
expiry. Nothing is written to storage, the native store, the receipt registry or the import history, and no source field is recorded. The XLSX import stays the only
source for a store and period (owner decision Q4). HEMW (Q5) and the service store AW330 are refused; the store must be exactly `WLMHW`.

**Compare mode.** `compare` reads the published four-report XLSX rows through the existing gateway, page by page, and runs the pure compare module: rows are matched
as a multiset inside (date, invoice, type) (R003: date and type), money is compared in exact paise and quantity in exact thousandths with zero tolerance, and the
union of days of both sides is checked. The outcome is `MATCH`, `DIFFERENCES` or `CANNOT_COMPARE`; an incomplete, fenced or missing XLSX generation is never a match.
Engine figures are shown beside the result as business-rule differences and are never applied to any calculation (owner decision Q3; Wave 6 changes no calculation).
The result always carries `appliedToCalculations:false` and `publishes:false`.

**Audit.** The shell audit log receives `etp.bridge.import.attempt`, `.refused`, `.staged`, `etp.bridge.compare.run` and `.result` with fixed codes and enum words
only: no file name, no pack text, no totals and no amounts.

**Not in Wave 6 (deferred).** Verification inside a Worker, persisted compare evidence for owner decision Q2, replay or rollback memory, a `sourceKind` on receipts,
and any publication of pack data to operational consumers.
