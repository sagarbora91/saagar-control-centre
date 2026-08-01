# ETP WLMHW source inventory - 2026-08-02

## Scope and privacy

This is a metadata-only inventory of the four E1 source workbooks in:

`V:\Co work\Titan\audit-program-designer\Retail\TITAN ALL REPORT.zip`

The archive was opened read-only. Only the four workbook entries were copied
temporarily to `C:\tmp` for inspection with the bundled spreadsheet runtime.
Only sheet/header structure and aggregate counts were emitted. No customer,
staff, invoice, tender, or transaction row was written to the repository or
included in logs. The temporary workbook copies and inspection scripts were
removed after verification; the original archive remains unchanged.

## Structural inventory

| Report | Source workbook role | Bytes | SHA-256 | Header columns | Data rows | Business-date header | Coverage |
|---|---|---:|---|---:|---:|---|---|
| R022 | Revenue Report | 788,306 | `cf4a8c97c66091a08ddca70efd95eb4624b4d9f0b5fdfdea6486d63e1f486499` | 46 | 4,398 | `INVOICEDATE` | 2024-09-16 to 2026-07-01 |
| R025 | SDB Variantwise Sales | 1,005,635 | `020be0c8ff230d25ded58d86cc6665f8ccebd6e60760c3b5ca7febc1e981415f` | 41 | 5,065 | `INVDATE` | 2024-09-16 to 2026-07-01 |
| R013 | CRO Wise Sales | 695,825 | `5361cfdc7e6b52e21755d6dbcfee80c3fe2062dea6e3f201f7f8f8e3aa6f84ec` | 28 | 5,065 | `INVDATE` | 2024-09-16 to 2026-07-01 |
| R003 | All Discount Type | 990,964 | `4d932c0df81ed43f0b8d7b81aea495988025eef93d840571a54c0789ddc5fabd` | 34 | 5,150 | `INVOICE_DATE` | 2024-09-16 to 2026-07-01 |

All four workbooks have one inspected sheet named `Sheet0`. Every non-empty
data row reported store code `WLMHW`. The only observed `TRANS_TYPE` values
were `INV`, `SR`, and `BC`. No inspected row had a blank store code, blank
business date, or invalid `YYYYMMDD` business date.

This evidence supports the consolidated plan's partial-comparison warning:
the WLMHW archive begins on 16 September 2024, so FY 2024-25 before that date
is not covered and must never display as zero activity.

## Header observations relevant to E1 controls

- Exact detection cannot treat spacing variants as interchangeable. For
  example, the observed R022 value field is `NETVALUE`, not `NET VALUE`.
- The invoice/business-date header is report-specific in this WLMHW set:
  `INVOICEDATE` for R022, `INVDATE` for R025/R013, and `INVOICE_DATE` for R003.
  `STORETIMESTAMP` is also present in several reports and must never substitute
  for the invoice date.
- WLMHW privacy fields that must be dropped before any app write include:
  `CUSTOMERNAME`, `CUSTOMERNUMBER`, `CONTACTNO`, `ENCIRCLE`, `ULPNUMBER`,
  `ULP_NO`, and `CRO_NAME`.
- Tender amount `GIFTCARD` is distinct from prohibited card-number fields such
  as `GIFTCARDNO` or `CARDNUMBER`.
- `CRO_NUMBER` may be considered for the approved CRO identifier mapping;
  `CRO_NAME` must not be persisted by the ETP fact importer.

## Gate outcome

WLMHW discovery can continue using these files as provisional source evidence.
No equivalent HEMW R022/R025/R013/R003 raw export set has been found, so:

- no both-store header schema is frozen;
- no HEMW adapter or store alias is invented;
- no R022/R025 reconciliation rule or tolerance is approved;
- no XLSX parser dependency is selected; and
- no production import, persistence, or E2-E6 metric view is accepted.

PHP/platform work remains excluded.
