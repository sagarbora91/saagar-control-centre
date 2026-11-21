(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarServiceBillingUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Billing screens for one service job (Service wave 2): the "Billing for this job" card, the "Billing at delivery" strip
     and every dialog opened from them. Screens only: each write goes through the billing facade given by host.billing().
     No storage, no network, no messages, no timers. The role is read fresh from host.session() at every guard.
     Every control carries data-svcs-action (ids start svb-); row context rides in data-svs-key; listeners are delegated. */

  var SBU_VERSION = 1;
  var SBU_LABEL_MAX = 170;
  var SBU_MAX_EST_LINES = 40;
  var SBU_SELLER_STATE = '27';
  var SBU_APPROVAL_DAYS = 7;
  var SBU_NO_SESSION = Object.freeze({ ok: false, isOwner: false, isManager: false, role: '', tier: 'none', actorName: '' });
  var SBU_HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  var SBU_PAY = [{ v: 'Cash', l: 'pay_cash' }, { v: 'UPI', l: 'pay_upi' }, { v: 'Card', l: 'pay_card' }, { v: 'Bank', l: 'pay_bank' }];
  var SBU_METHODS = [
    { v: 'IN_PERSON', l: 'm_person', via: 'in_person' }, { v: 'CALL', l: 'm_call', via: 'call' },
    { v: 'WHATSAPP', l: 'm_whatsapp', via: 'whatsapp' }, { v: 'SIGNED', l: 'm_signed', via: 'other' }, { v: 'OTHER', l: 'k_other', via: 'other' }
  ];
  var SBU_REASONS = [
    { v: 'RETURN', l: 'cn_r_return' }, { v: 'PRICE', l: 'cn_r_price' }, { v: 'SERVICE', l: 'cn_r_service' }, { v: 'OTHER', l: 'k_other' }
  ];
  var SBU_STATES = {
    '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
    '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
    '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh',
    '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
    '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar', '36': 'Telangana', '37': 'Andhra Pradesh',
    '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction'
  };
  var SBU_PRINT = {
    bill: 'serviceBillSummary', taxinvoice: 'serviceTaxInvoiceV2', receipt: 'serviceReceipt', credit: 'serviceCreditNote',
    refund: 'serviceRefundVoucher', day: 'serviceDaySummary', sheet: 'serviceWarrantySheet'
  };
  /* The adapter table: every call into the billing facade goes through callB or syncB with a name from here. */
  var SBU_BX = Object.freeze({
    status: 'status', can: 'can', getJob: 'getJob', saveEstimate: 'saveEstimate', recordApproval: 'recordApproval', estimateView: 'estimateView',
    prepareBill: 'prepareBill', previewBill: 'previewBill', issueBill: 'issueBill', addCcptNumber: 'addCcptNumber', cancelBill: 'cancelBill',
    issueCreditNote: 'issueCreditNote', returnCreditedStock: 'returnCreditedStock', takeReceipt: 'takeReceipt', takeCounterReceipt: 'takeCounterReceipt', refund: 'refund', reverseReceipt: 'reverseReceipt',
    issueNoChargeSheet: 'issueNoChargeSheet', cancelNoChargeSheet: 'cancelNoChargeSheet', voidJob: 'voidJob', getBill: 'getBill',
    unreceiptedCounterSales: 'unreceiptedCounterSales', printData: 'printData', jobHasRecords: 'jobHasRecords', closeCheck: 'closeCheck',
    taxRoute: 'taxRoute', jobBilled: 'jobBilled', jobNoCharge: 'jobNoCharge', activeInvoiceNo: 'activeInvoiceNo'
  });

  var SBU_ERR = Object.freeze({
    SVB_CORE_MISSING: 'Billing is not available in this build. Nothing was changed.',
    SVB_ROLE_DENIED: 'Your role cannot do this. Ask the Store Manager or the Owner.',
    SVB_OWNER_ONLY: 'Only the Owner can do this. Unlock Owner mode in the app header, then try again.',
    SVB_PIN_DENIED: 'Owner approval was not given. Nothing was changed.',
    SVB_PAST_VIEW: 'You are viewing a past date. Billing cannot be changed.',
    SVB_ACCESS_CHANGED: 'Your access changed. Nothing was saved.',
    SVB_JOB_NOT_SAVED: 'Save this service order first. Billing starts once it has a job number.',
    SVB_JOB_UNKNOWN: 'That job number was not found.',
    SVB_JOB_VOIDED: 'This job was voided. Billing cannot be changed.',
    SVB_BUSY: 'Another save is in progress. Wait a moment.',
    SVB_INTEGRITY: 'The billing records failed their check. Posting is stopped. Tell the Owner.',
    SVB_PRINT_UNAVAILABLE: 'Printing is not available in this build.',
    SVB_MONEY_INVALID: 'Enter an amount in rupees, for example 149.50.',
    SVB_QTY_INVALID: 'Enter a whole number from {min} to {max}.',
    SVB_FIELD_REQUIRED: 'This field is required.',
    SVB_REASON_SHORT: 'Type a reason of at least 5 characters.',
    SVB_DATE_FUTURE: 'The date cannot be in the future.',
    SVB_DATE_OLD: 'Enter a date within the last 7 days.',
    SVB_TIME_INVALID: 'Enter a valid time.',
    SVB_NO_LINES: 'Add at least one line.',
    SVB_PICK_REQUIRED: 'Pick an item from the list.',
    SVB_TAX_MISSING: 'Tax details missing: this item cannot be used on an estimate or counter sale yet.',
    SVB_DUP_LINE: 'This part is already on another line. Combine the quantities.',
    SVB_PRICE_ZERO: 'Enter a price above zero.',
    SVB_DISCOUNT_BIG: 'The discount cannot be more than the line amount.',
    SVB_TOTAL_ZERO: 'The estimate total must be above zero.',
    SVB_TOO_MANY_LINES: 'An estimate can have at most 40 lines.',
    SVB_TAXCODE: 'Enter 4, 6 or 8 digits.',
    SVB_RATE: 'Enter a rate from 0 to 100.',
    SVB_BASIS: 'Choose how the price was quoted.',
    SVB_CONFIRM_TICK: 'Tick the box to confirm the customer agreed.',
    SVB_NC_TICK: 'Tick the box to confirm.',
    SVB_REF_REQUIRED: 'Type the UPI, card or bank reference (3 to 30 characters).',
    SVB_OVER_DUE: 'The amount is more than the balance due ({amount}).',
    SVB_GSTIN: 'Enter a valid GST number (15 characters).',
    SVB_STATE_MISMATCH: 'The state does not match the GST number.',
    SVB_CCPT_REQUIRED: 'Enter the CCPT invoice number.',
    SVB_PRICE_MISSING: 'Enter a price for {code}.',
    SVB_CREDIT_NONE: 'Choose at least one line to credit.',
    SVB_REFUND_OVER: 'The refund cannot be more than the money paid ({amount}).',
    SVB_ADV_OVER: 'The refund cannot be more than {amount}.',
    ADVANCE_EXCEEDS_BILL: 'The advance held is more than this bill by {amount}. Refund the extra first.',
    SVB_WARR_REF: 'Enter the warranty reference.',
    SVB_ABOVE_LIMIT: 'This discount is above the limit. The Owner must approve it.',
    SVB_OVERRIDE_NEEDED: 'The bill is higher than the approved amount. Record a new approval, or ask the Owner to override.',
    SVB_INTERNAL: 'Something went wrong. Nothing was changed. Code: {code}.',
    BILL_HAS_PAYMENTS: 'Money was taken against this bill. Refund it first or issue a credit note.',
    CCPT_NUMBER_USED: 'This CCPT number is already on another bill.',
    DUPLICATE_CCPT_INVOICE: 'This CCPT number is already on another bill.',
    NOT_SAME_DAY: 'A bill can be cancelled only on the day it was made. Issue a credit note instead.',
    CANCEL_SAME_DAY_ONLY: 'A bill can be cancelled only on the day it was made. Issue a credit note instead.',
    NOTHING_DUE: 'Nothing is due on this bill.',
    NO_CHARGE_CONFLICT: 'A bill or an advance already exists on this job. Cancel or refund it first.',
    ESTIMATE_NOT_APPROVED: "The estimate is not approved yet. Record the customer's approval first.",
    NO_APPROVAL: "The estimate is not approved yet. Record the customer's approval first.",
    BILL_EXISTS: 'This job already has a bill.',
    INVOICE_ALREADY_ISSUED: 'This job already has a bill.',
    JOB_HAS_MONEY: 'This job has money or a bill on it. Ask the Owner to void it.',
    VOID_BLOCKED: 'This job cannot be voided yet. Clear the lines shown first.',
    TAX_DETAILS_MISSING: 'Tax details are missing for this item. Add the HSN or SAC code and the GST rate in the master first.',
    SESSION_REQUIRED: 'Your session could not be read. Go back to Home and sign in again.',
    NOT_ALLOWED: 'Your role cannot do this. Ask the Store Manager or the Owner.',
    BILLING_BLOCKED: 'The billing records failed their safety check. Nothing can be posted. Restore your latest backup.',
    JOB_VOIDED: 'This job was voided. Billing cannot be changed.',
    JOB_LOCKED: 'This job already has a bill or a no-charge sheet. Cancel it first or use a credit note.',
    NO_CHANGE: 'Nothing changed since the last saved version.',
    SVCS_REV_CONFLICT: 'Another screen saved first. Check again and retry.',
    SVCS_DUPLICATE_REF: 'This was already saved with other details. Close the dialog and start again.'
  });
  var SBU_LIMIT_CODES = { ABOVE_MANAGER_LIMIT: 1, DISCOUNT_ABOVE_LIMIT: 1, DISCOUNT_LIMIT: 1, PIN_REQUIRED: 1, DISCOUNT_NOT_ALLOWED: 1 };
  var SBU_OVERRIDE_CODES = { REAPPROVAL_REQUIRED: 1, REAPPROVAL_NEEDED: 1 };
  var SBU_OWNER_KEYS = {
    markNotBilledCcpt: 1, cancelBill: 1, creditNote: 1, refundAdvance: 1, voidJob: 1, confirmOld: 1, settings: 1, approvalOverride: 1,
    changeCcpt: 1, reverseRefund: 1, cancelNoCharge: 1, migrate: 1
  };

  var SBU_TEXT = Object.freeze({
    title: 'Billing for this job',
    billing_btn: 'Billing',
    loading: 'Loading...',
    saving: 'Saving...',
    close: 'Close',
    cancel: 'Cancel',
    done: 'Done',
    back: 'Back',
    remove: 'Remove',
    more: 'More',
    retry: 'Check again',
    discard_ask: 'Discard what you typed?',
    discard: 'Discard',
    keep_editing: 'Keep editing',
    staff_note: 'Billing is done by the front desk or the Store Manager.',
    past_note: 'You are viewing a past date. Billing cannot be changed.',
    void_note: 'This job was voided. Reason: {reason}.',
    voided_chip: 'Voided',
    not_ccpt_chip: 'Not billed in CCPT',
    not_ccpt_note: 'Not billed in CCPT: the app prints the tax invoice.',
    chip_none: 'No estimate yet',
    chip_estimate: 'Waiting for approval',
    chip_reapprove: 'New approval needed',
    chip_approved: 'Approved',
    chip_billed: 'Bill issued',
    chip_ccpt: 'CCPT number missing',
    chip_paid: 'Paid in full',
    chip_cancelled: 'Bill cancelled',
    chip_nocharge: 'No-charge warranty',
    next_none: 'Next: build the estimate from the parts and labour lists.',
    next_estimate: "Next: record the customer's approval.",
    next_reapprove: 'The estimate went up. The customer must approve again.',
    next_approved: 'Next: issue the bill when the work is done.',
    next_balance: 'Next: take the balance of {amount}.',
    next_ccpt: 'Add the CCPT invoice number.',
    next_paid: 'Paid in full. You can deliver and close the job.',
    next_cancelled: 'The bill was cancelled. Issue a new bill when ready.',
    next_nocharge: 'No bill is made for this job. You can deliver and close it.',
    b_estimate: 'Build estimate',
    b_estimate_change: 'Change estimate',
    b_approval: 'Record approval',
    b_advance: 'Take advance',
    b_bill: 'Issue bill',
    b_balance: 'Take balance',
    b_ccpt: 'Add CCPT number',
    b_notccpt: 'Not billed in CCPT',
    b_nocharge: 'Issue no-charge job sheet',
    b_nocharge_cancel: 'Cancel no-charge job sheet',
    b_cancel: 'Cancel bill',
    b_credit: 'Credit note and refund',
    b_refund: 'Refund advance',
    b_void: 'Void job',
    b_print_bill: 'Print bill summary',
    b_print_tax: 'Print tax invoice',
    b_print_nc: 'Print no-charge job sheet',
    b_print: 'Print',
    b_goto: 'Go to billing',
    b_stores: 'Open Stores',
    f_estimate: 'Estimate',
    f_held: 'Advance held',
    f_bill: 'Bill',
    f_paid: 'Paid',
    f_due: 'Balance due',
    s_estimate: 'Estimate',
    s_approval: 'Approval',
    s_advance: 'Advance',
    s_bill: 'Bill',
    s_balance: 'Balance',
    e_estimate: 'No estimate yet.',
    e_approval: 'Not approved yet.',
    e_advance: 'No advance taken.',
    e_bill: 'No bill yet.',
    e_balance: 'No balance taken.',
    sum_estimate: 'Version {n}: {k} lines, total {amount}.',
    sum_other: 'Contains lines that are not from the masters.',
    sum_approval: 'Approved {date} by {name} ({method}) for {amount}.',
    sum_approval_old: 'Approved the old way on {date} for {amount}. Record the approval again for the new estimate.',
    sum_bill: '{no}  CCPT {ccpt}  total {amount}  discount {amount2}',
    ccpt_none: 'not added',
    sync_note: 'The job sheet table above follows this estimate. Press Save Order to keep it.',
    typed_adv: 'An advance typed here is not a receipt. Use Take advance to record it.',
    strip_title: 'Billing at delivery',
    strip_nobill: 'No bill yet. Issue the bill in Billing for this job (step 7).',
    strip_due: 'Bill {no}: total {amount}, paid {paid}, balance due {due}.',
    strip_paid: 'Bill {no}: total {amount}, paid in full.',
    strip_nocharge: 'No-charge warranty job. No bill is needed.',
    close_due: 'Take the balance first: {amount} is still due on bill {no}.',
    close_nobill: 'Issue the bill first, or mark the job as no-charge warranty.',
    close_unknown: 'Billing could not be checked. Nothing was closed.',
    no_nocheck: 'Could not check billing. Nothing was deleted.',
    delete_blocked: '{job} has money or a bill on it. Ask the Owner to void it instead of deleting it.',
    old_way_closed: 'This job was closed without a bill. CCPT issues the tax invoice. Use Proforma for a printout.',
    no_billing: 'Billing is not available. No invoice number can be issued.',
    open_fail: 'Billing could not open: {error}',
    est_title: 'Estimate',
    est_new: 'New version',
    est_changing: 'Changing version {n}. The customer must approve again if the total goes up.',
    add_part: 'Add part',
    add_labour: 'Add labour',
    add_other: 'Add other line',
    k_part: 'Part',
    k_labour: 'Labour',
    k_other: 'Other',
    f_item_part: 'Part item',
    f_item_labour: 'Labour item',
    f_desc: 'Description',
    f_taxcode: 'HSN or SAC code',
    f_rate: 'GST rate (%)',
    f_qty: 'Qty',
    f_basis: 'Price basis',
    f_price: 'Unit price (Rs)',
    f_discount: 'Discount (Rs)',
    f_line_total: 'Line total',
    basis_incl: 'Price includes tax',
    basis_excl: 'Price is before tax',
    basis_pick: 'Choose...',
    tax_pending: 'Tax details missing',
    tax_pending_hint: 'Ask the Store Manager or the Owner to add the tax code and rate in Stores, Parts and labour.',
    hsn: 'HSN {code}',
    sac: 'SAC {code}',
    on_hand: 'On hand',
    pick_none: 'No matching item.',
    est_reason: 'Reason for the change',
    est_note: 'Note',
    est_save: 'Save estimate',
    est_gst_note: 'GST is shown for a customer in Maharashtra. A GST-registered customer from another state gets IGST on the bill. The total stays the same.',
    est_saved: 'Estimate version {n} saved: {amount}.',
    est_result: 'Saved. The customer must approve this estimate.',
    est_approve_now: 'Record approval now',
    t_taxable: 'Taxable value',
    t_gst: 'CGST + SGST',
    t_cgst: 'CGST',
    t_sgst: 'SGST',
    t_igst: 'IGST',
    t_discount: 'Discount',
    t_roundoff: 'Round-off',
    t_est_total: 'Estimate total',
    t_bill_total: 'Bill total',
    t_setoff: 'Advance set off',
    t_balance: 'Balance to pay',
    appr_title: 'Customer approval',
    appr_version: 'Estimate version {n}, total {amount}',
    appr_how: 'How did the customer approve?',
    appr_by: 'Taken by',
    appr_date: 'Date',
    appr_time: 'Time',
    appr_amount: 'Approved amount',
    appr_note: 'Note',
    appr_evidence: 'Message time or slip number',
    appr_tick: 'The customer agreed to {amount}.',
    appr_save: 'Save approval',
    appr_saved: 'Approval recorded for version {n}: {amount}.',
    legacy_fail: 'The old job sheet field could not be updated. The approval itself is saved.',
    r_advance: 'Take advance',
    r_balance: 'Take balance',
    r_counter: 'Counter sale receipt',
    r_ctx_adv: 'Estimate total {amount}. Advance already held {held}.',
    r_ctx_bal: 'Bill {no}. Total {amount}. Paid {paid}. Balance due {due}.',
    r_ctx_sale: 'Sale {no}, {amount}. The amount is fixed by the sale.',
    r_amount: 'Amount (Rs)',
    r_fill_due: 'Fill balance due',
    r_mode: 'Paid by',
    r_ref: 'Reference',
    r_on: 'Received on',
    r_today: 'Today, {date}',
    r_note: 'Note',
    r_over_est: 'This is more than the estimate total. Check before you save.',
    r_save: 'Save receipt',
    r_saved: 'Receipt {no} saved: {amount} by {mode}.',
    r_saved_toast: 'Receipt {no} saved.',
    r_posted: 'Posted to the cash book.',
    r_not_posted: 'The receipt is saved. The cash book entry could not be made. Tell the Owner.',
    b_print_receipt: 'Print receipt',
    bill_title: 'Bill',
    bill_left_off: 'Left off the bill because no part was issued: {list}. Issue the parts in Stores first if they belong on this bill.',
    bill_not_on_est: 'Issued but not on the estimate: {list}. They are on this bill at the master price.',
    bill_qty: 'Qty {n}',
    bill_rate: 'Rate {amount}',
    bill_rate_incl: 'Rate {amount} incl. GST',
    bill_rate_excl: 'Rate {amount} + GST',
    pv_without_disc: 'The figures below are without the discount.',
    pv_before_change: 'The figures below are from before your last change.',
    pv_wait: 'Calculating...',
    pv_na: 'not available',
    bill_discount: 'Bill discount (Rs)',
    bill_disc_reason: 'Reason for the discount',
    bill_cust: 'The customer has a GST number',
    bill_gstin: 'GST number',
    bill_state: 'State',
    bill_ccpt: 'CCPT invoice number',
    bill_ccpt_hint: 'Type the invoice number from CCPT exactly as printed.',
    bill_not_ccpt: 'This job is not billed in CCPT. This bill is the tax invoice.',
    bill_not_ccpt_tick: 'This job is not billed in CCPT (Owner only)',
    bill_not_ccpt_reason: 'Reason',
    bill_not_ccpt_hint: 'Use this only for work that CCPT does not bill. The app will print its own tax invoice for this job.',
    bill_override: 'Reason to bill above the approved amount',
    bill_review: 'Review bill',
    bill_ask_owner: 'Ask the Owner',
    bill_done: 'Bill {no} issued. Balance to pay {amount}.',
    bill_review_line: 'Job {job}: {k} lines, total {amount}, discount {disc}, advance set off {adv}, balance {bal}, CCPT {ccpt}.',
    bill_price_changed: 'Price changed from {was}',
    cc_title: 'Add CCPT number',
    cc_change_title: 'Change CCPT number',
    cc_now: 'Number now: {no}',
    cc_reason: 'Why does the number change?',
    pin_ccpt: 'Change CCPT number of {bill} from {was} to {now}',
    rv_title: 'Reverse a receipt',
    rv_pick: 'Receipt of today',
    rvf_title: 'Reverse a refund',
    rvf_pick: 'Refund of today',
    rvf_none: 'No refund of today can be reversed here.',
    rv_none: 'Nothing of today can be reversed here. After today, use a refund.',
    rv_save: 'Reverse',
    rv_done: '{no} was reversed.',
    pin_rv_refund: 'Reverse refund {no} of {amount}',
    cc_save: 'Save number',
    cb_title: 'Cancel bill',
    cb_text: 'The number {no} stays used and is marked cancelled. This works on the day the bill was made. After that, issue a credit note.',
    cb_summary: 'Bill {no}, total {amount}, paid so far {paid}.',
    cb_confirm: 'Cancel this bill',
    cb_keep: 'Keep the bill',
    cb_reason: 'Reason',
    cb_done: 'Bill {no} cancelled.',
    cn_title: 'Credit note and refund',
    cn_summary: 'Bill {no}, total {amount}, paid so far {paid}, already credited {credited}.',
    cn_reason: 'Reason',
    cn_details: 'Details',
    cn_all: 'Credit everything left on this bill',
    cn_billed: 'Billed {n}',
    cn_credited: 'Already credited {n}',
    cn_qty: 'Credit qty',
    cn_reduce: 'Reduce price by (Rs, before tax)',
    cn_total: 'Credit total',
    cn_refund: 'Refund now',
    cn_refund_amount: 'Refund amount (Rs)',
    cn_save: 'Issue credit note',
    cn_done: 'Credit note {no} issued.',
    cn_refund_done: 'Refund {no}: {amount} by {mode}.',
    cn_stock: 'Stock: {result}',
    rs_title: 'Parts to put back in stock:',
    rs_row: 'Credit note {no}: {n} x {code}',
    b_restock: 'Put back in stock',
    rs_done: 'The parts of credit note {no} are back in stock.',
    b_print_cn: 'Print credit note',
    b_print_refund: 'Print refund voucher',
    ar_title: 'Refund advance',
    ar_pick: 'Advance receipt',
    ar_row: '{no}  {date}  {amount}',
    ar_save: 'Refund advance',
    ar_done: 'Refund {no} made: {amount}.',
    ar_refundable: 'You can refund up to {amount}.',
    void_title: 'Void job',
    void_adv: 'Advance held {amount}. Refund it first.',
    void_parts: 'Parts still with this job: {n} pieces. Return them in Stores first.',
    void_bill: 'A bill is active. Cancel it or issue a credit note first.',
    void_save: 'Void this job',
    void_done: 'Job {job} voided.',
    nc_title: 'No-charge warranty',
    nc_labour: 'Labour on the sheet (no charge): {list}',
    nc_text: 'No bill is made. Parts for this job are issued as warranty. The customer gets a no-charge job sheet.',
    nc_ref: 'Warranty reference',
    nc_ref_hint: 'The warranty card or Titan job number.',
    nc_note: 'Note',
    nc_tick: 'The watch is in warranty and this work is covered.',
    nc_save: 'Mark no-charge',
    nc_done: 'No-charge job sheet issued.',
    ncc_title: 'Cancel no-charge job sheet',
    ncc_save: 'Cancel the job sheet',
    ncc_done: 'No-charge job sheet cancelled.',
    pin_discount: 'Approve discount of {amount} on job {job}. The Store Manager limit is {limit}.',
    pin_notccpt: 'Mark job {job} as not billed in CCPT. The app will print the tax invoice for it.',
    pin_override: 'Approve a bill above the approved amount on job {job}: {amount}.',
    pin_cancel: 'Cancel bill {no} for job {job}: total {amount}. The number stays used.',
    pin_credit: 'Issue credit note on bill {no}: credit {amount}, refund {refund}.',
    pin_refund: 'Refund advance receipt {no} on job {job}: {amount}.',
    pin_void: 'Void job {job}. It cannot be edited or billed afterwards.',
    pin_nc_cancel: 'Cancel the no-charge job sheet on job {job}.',
    cs_receipt_done: 'Counter receipt {no} saved.',
    cs_nothing: 'That counter sale has no receipt due.',
    cn_not_refunded: 'Credit not refunded: the credit note is issued but the refund failed.',
    pay_cash: 'Cash',
    pay_upi: 'UPI',
    pay_card: 'Card',
    pay_bank: 'Bank Transfer',
    m_person: 'In person',
    m_call: 'Phone call',
    m_whatsapp: 'WhatsApp',
    m_signed: 'Signed form',
    cn_r_return: 'Part returned by the customer',
    cn_r_price: 'Price correction',
    cn_r_service: 'Service not done or not needed',
    prev: 'Previous',
    next: 'Next',
    page: 'Page',
    of: 'of',
    reversed: 'Reversed',
    cancelled: 'Cancelled',
    next_balance_plain: 'Next: take the balance.'
  });

  function t(id) { return Object.prototype.hasOwnProperty.call(SBU_TEXT, id) ? SBU_TEXT[id] : id; }

  /* ---------- small pure helpers (own shapes; calc owns the real arithmetic) ---------- */

  function esc(v) {
    return asText(v).replace(/[&<>"'`]/g, function (c) { return SBU_HTML[c]; });
  }
  function attr(v) { return esc(v); }
  function num(n) { return '<span class="svs-num">' + esc(n) + '</span>'; }
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  function asText(v) { return v === null || v === undefined ? '' : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function trim(v) { return asText(v).replace(/^\s+|\s+$/g, ''); }
  function fill(str, vars) {
    return asText(str).replace(/\{([a-z0-9]+)\}/g, function (m, k) { return vars && vars[k] !== undefined ? asText(vars[k]) : m; });
  }
  function pick(o, names) {
    var i;
    for (i = 0; o && i < names.length; i++) { if (o[names[i]] !== undefined && o[names[i]] !== null) return o[names[i]]; }
    return undefined;
  }
  function inList(list, v) { return Array.isArray(list) && list.indexOf(v) >= 0; }
  function cls() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }

  /* Indian grouping: the last three digits, then pairs. null, NaN or a fraction gives a dash. */
  function money(paise) {
    if (!isInt(paise)) return '-';
    var a = Math.abs(paise);
    var whole = String(Math.floor(a / 100));
    var cents = String(a % 100);
    var tail = whole.slice(-3);
    var rest = whole.slice(0, -3);
    var groups = [];
    while (rest.length > 2) { groups.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
    if (rest) groups.unshift(rest);
    groups.push(tail);
    return (paise < 0 ? '-' : '') + 'Rs ' + groups.join(',') + '.' + (cents.length < 2 ? '0' : '') + cents;
  }
  /* Rupee text to whole paise by text only (no floats); at most 7 whole digits. */
  function parsePaise(text, opts) {
    var s = trim(text).replace(/,/g, '').replace(/^(rs\.?|\u20b9)\s*/i, '');
    var m = /^(\d{1,7})(\.(\d{1,2}))?$/.exec(s);
    var paise;
    if (!m) return { ok: false, code: 'SVB_MONEY_INVALID' };
    paise = parseInt(m[1], 10) * 100 + (m[3] ? parseInt((m[3] + '0').slice(0, 2), 10) : 0);
    if (paise === 0 && !(opts && opts.allowZero)) return { ok: false, code: 'SVB_MONEY_INVALID' };
    return { ok: true, paise: paise };
  }
  function parseQty(text, opts) {
    var min = opts && isInt(opts.min) ? opts.min : 1;
    var max = opts && isInt(opts.max) ? opts.max : 100000;
    var s = trim(text);
    var q = /^\d{1,6}$/.test(s) ? parseInt(s, 10) : -1;
    if (q < min || q > max) return { ok: false, code: 'SVB_QTY_INVALID', min: min, max: max };
    return { ok: true, qty: q };
  }
  /* A percent such as 18 or 12.5 to basis points, text only. */
  function parseRateBp(text) {
    var m = /^(\d{1,3})(\.(\d{1,2}))?$/.exec(trim(text));
    var bp;
    if (!m) return { ok: false, code: 'SVB_RATE' };
    bp = parseInt(m[1], 10) * 100 + (m[3] ? parseInt((m[3] + '0').slice(0, 2), 10) : 0);
    if (bp > 10000) return { ok: false, code: 'SVB_RATE' };
    return { ok: true, bp: bp };
  }
  function rupeeText(p) {
    if (!isInt(p)) return '';
    var a = Math.abs(p);
    return (p < 0 ? '-' : '') + Math.floor(a / 100) + '.' + (a % 100 < 10 ? '0' : '') + (a % 100);
  }
  function rateText(bp) {
    if (!isInt(bp)) return '';
    return Math.floor(bp / 100) + (bp % 100 ? '.' + (bp % 100 < 10 ? '0' : '') + (bp % 100) : '');
  }
  function validIso(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asText(s));
    var d;
    if (!m) return false;
    d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  /* India day (UTC+5:30) of an ISO instant; a bare date passes through. */
  function istDay(at) {
    var s = asText(at);
    var ms;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    ms = Date.parse(s);
    return isFinite(ms) ? new Date(ms + 19800000).toISOString().slice(0, 10) : '';
  }
  function fmtAt(at) {
    var s = asText(at);
    var ms;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    ms = Date.parse(s);
    return isFinite(ms) ? new Date(ms + 19800000).toISOString().slice(0, 16).replace('T', ' ') : s;
  }
  function dayShift(iso, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)).toISOString().slice(0, 10) : iso;
  }

  /* ---------- minimal DOM helpers (selector forms: #id, [attr], [attr="v"]) ---------- */

  function qsa(container, sel) {
    var list;
    if (!container || typeof container.querySelectorAll !== 'function') return [];
    try { list = container.querySelectorAll(sel); } catch (e) { return []; }
    return Array.prototype.slice.call(list || []);
  }
  function qs(container, sel) {
    var hits = qsa(container, sel);
    return hits.length ? hits[0] : null;
  }
  function getAttr(el, name) { return el && typeof el.getAttribute === 'function' ? el.getAttribute(name) : null; }
  function fieldValue(el) {
    var raw;
    if (!el) return '';
    if (el.type === 'checkbox') return el.checked === true;
    raw = el.value;
    return raw === undefined || raw === null ? '' : String(raw);
  }
  /* Copy every [data-svs-field] under container into data (lines by data-svs-line, block by data-svs-block). */
  function captureFields(container, data) {
    var els = qsa(container, '[data-svs-field]');
    var i, name, li, v, idx;
    for (i = 0; i < els.length; i++) {
      name = getAttr(els[i], 'data-svs-field');
      li = getAttr(els[i], 'data-svs-line');
      v = fieldValue(els[i]);
      if (!name) continue;
      if (li !== null && li !== '') {
        idx = parseInt(li, 10);
        if (!data.lines) data.lines = [];
        if (!data.lines[idx]) data.lines[idx] = {};
        data.lines[idx][name] = v;
      } else {
        data[name] = v;
      }
    }
    return data;
  }

  /* ---------- rights (the UI mirror of plan 2.11; core.can is the authority) ---------- */

  function tierOf(s) {
    var ok = !!s && s.ok === true;
    if (!ok) return 'none';
    return s.isOwner === true ? 'owner' : (s.isManager === true ? 'manager' : 'staff');
  }
  function normaliseSession(s) {
    var tier;
    if (!isObj(s) || s.ok !== true) return SBU_NO_SESSION;
    tier = tierOf(s);
    return Object.freeze({ ok: true, isOwner: tier === 'owner', isManager: tier === 'owner' || tier === 'manager', role: asText(s.role), tier: tier, actorName: asText(s.actorName) });
  }
  function rightsFor(session, cfg) {
    var s = normaliseSession(session);
    var own = s.tier === 'owner';
    var mgr = own || s.tier === 'manager';
    var staff = s.tier === 'staff';
    var desk = staff && cfg && inList(cfg.billingRoles, s.role) && s.role !== 'Store Manager';
    var est = staff && cfg && inList(cfg.estimateRoles, s.role);
    var view = mgr || desk;
    return {
      tier: s.tier, owner: own, manager: mgr, desk: desk === true, estimateStaff: est === true,
      viewJobStatus: s.tier !== 'none', viewBilling: view, buildEstimate: mgr || desk || est === true, addOtherLine: mgr, editPrice: mgr, giveDiscount: mgr,
      recordApproval: mgr || desk || est === true, takeReceipt: view, issueBill: view, addCcptNo: view, viewDay: mgr, viewLists: mgr, viewCost: mgr,
      markNoCharge: mgr, markNotBilledCcpt: own, cancelBill: own, creditNote: own, refundAdvance: own, voidJob: own, confirmOld: own, settings: own,
      approvalOverride: own, changeCcpt: own, reverseReceipt: mgr, reverseRefund: own, cancelNoCharge: own, migrate: own
    };
  }
  var SBU_WRITE_KEYS = ['buildEstimate', 'addOtherLine', 'editPrice', 'giveDiscount', 'recordApproval', 'takeReceipt', 'issueBill', 'addCcptNo', 'markNoCharge',
    'markNotBilledCcpt', 'cancelBill', 'creditNote', 'refundAdvance', 'voidJob', 'confirmOld', 'settings', 'approvalOverride', 'changeCcpt', 'reverseReceipt',
    'reverseRefund', 'cancelNoCharge', 'migrate'];

  /* ---------- state (memory only) ---------- */

  var H = null;
  var S = freshState();

  function freshState() {
    return {
      busy: false, counter: 0, tok: 0, dialog: null, layer: null, binds: [], navBtn: null, status: null,
      cfg: { discountLimitPaise: 0, billingRoles: [], estimateRoles: [] }, job: null, jobId: '', picks: {}, pickTok: 0, prevTok: 0, model: null, cardError: ''
    };
  }
  function nowIso() {
    var v = H && typeof H.nowIso === 'function' ? H.nowIso() : '';
    return v ? String(v) : new Date().toISOString();
  }
  function nowMs() {
    var ms = Date.parse(nowIso());
    return isFinite(ms) ? ms : new Date().getTime();
  }
  function today() {
    var v = H && typeof H.today === 'function' ? H.today() : '';
    return validIso(v) ? v : istDay(nowIso());
  }
  function readSession() {
    var raw = null;
    try { if (H && typeof H.session === 'function') raw = H.session(); } catch (e) { raw = null; }
    return normaliseSession(raw);
  }
  function rights() { return rightsFor(readSession(), S.cfg); }
  function isPast() {
    try { return !!(H && typeof H.isPast === 'function' && H.isPast()); } catch (e) { return false; }
  }
  function toast(msg) {
    try { if (H && typeof H.toast === 'function') H.toast(String(msg)); } catch (e) { /* the toast is a courtesy */ }
  }
  function newRef() {
    S.counter += 1;
    return 'svb-' + nowMs().toString(36) + '-' + S.counter;
  }
  function fail(code, detail) { return { ok: false, code: code, detail: detail }; }
  function thrown(e) { return fail('SVB_INTERNAL', { message: String(e && e.message ? e.message : e) }); }
  function hostObj() { return H; }
  function facade() {
    var b = null;
    try { b = H && typeof H.billing === 'function' ? H.billing() : null; } catch (e) { b = null; }
    return b && typeof b === 'object' ? b : null;
  }
  function calcLib() {
    var c = null;
    try { c = H && typeof H.calc === 'function' ? H.calc() : (typeof SaagarServiceBillingCalc !== 'undefined' ? SaagarServiceBillingCalc : null); } catch (e) { c = null; }
    return c && typeof c.computeBill === 'function' ? c : null;
  }
  function storesCore() {
    var c = null;
    try { c = H && typeof H.core === 'function' ? H.core() : null; } catch (e) { c = null; }
    return c && typeof c === 'object' ? c : null;
  }
  function normalise(r) {
    if (r && r.ok === true) return r;
    return { ok: false, code: r && r.code ? String(r.code) : 'SVB_INTERNAL', message: r && r.message, detail: r && r.detail };
  }
  /* A facade call; sync or promise replies both work; nothing throws out. */
  function callB(name, args) {
    var b = facade();
    var m = SBU_BX[name];
    var out;
    if (!b || !m || typeof b[m] !== 'function') return Promise.resolve(fail('SVB_CORE_MISSING'));
    try { out = b[m].apply(b, args || []); } catch (e) { return Promise.resolve(thrown(e)); }
    return Promise.resolve(out).then(normalise, function (e2) { return thrown(e2); });
  }
  /* A synchronous facade question: the raw answer, or null when it cannot be answered now (callers fail closed). */
  function syncB(name, args) {
    var b = facade();
    var m = SBU_BX[name];
    var out;
    if (!b || !m || typeof b[m] !== 'function') return null;
    try { out = b[m].apply(b, args || []); } catch (e) { return null; }
    if (out && typeof out.then === 'function') return null;
    return out === undefined ? null : out;
  }
  function makeCtx(session, stepUp, clientRef) { return { session: session, stepUp: stepUp || null, clientRef: clientRef || '' }; }

  function errText(r) {
    var code = r && r.code ? String(r.code) : 'SVB_INTERNAL';
    var d = r && r.detail;
    var b = facade();
    var msg;
    if (code === 'SVB_QTY_INVALID') return fill(SBU_ERR.SVB_QTY_INVALID, { min: r.min, max: r.max });
    if (code === 'SVB_OVER_DUE' || code === 'SVB_REFUND_OVER' || code === 'SVB_ADV_OVER') return fill(SBU_ERR[code], { amount: money(r.amountPaise) });
    if (code === 'SVB_PRICE_MISSING') return fill(SBU_ERR[code], { code: r.itemCode || '' });
    // Stage E (D-flows-3): name the excess in rupees; without the figure, the bill layer's own sentence
    if (code === 'ADVANCE_EXCEEDS_BILL') return d && isInt(d.excessPaise) && d.excessPaise > 0 ? fill(SBU_ERR[code], { amount: money(d.excessPaise) }) : (typeof r.message === 'string' && r.message ? r.message : fill(SBU_ERR.SVB_INTERNAL, { code: code }));
    if (SBU_LIMIT_CODES[code] === 1 && code !== 'DISCOUNT_NOT_ALLOWED') return SBU_ERR.SVB_ABOVE_LIMIT;
    if (SBU_OVERRIDE_CODES[code] === 1) return SBU_ERR.SVB_OVERRIDE_NEEDED;
    if (code === 'SVB_INTERNAL') return fill(SBU_ERR.SVB_INTERNAL, { code: d && d.message ? code + ' ' + String(d.message).slice(0, 120) : code });
    if (Object.prototype.hasOwnProperty.call(SBU_ERR, code)) return SBU_ERR[code];
    msg = b && isObj(b.MESSAGES) && typeof b.MESSAGES[code] === 'string' ? b.MESSAGES[code] : '';
    // a code of a lower layer (bill or money) comes with its own sentence: show it, never the bare code
    if (!msg && r && typeof r.message === 'string' && r.message.length > 3) msg = r.message.slice(0, 300);
    return msg || fill(SBU_ERR.SVB_INTERNAL, { code: code });
  }

  /* Owner step-up (pattern P): the caller has done the cheap checks; here: Owner check, PIN, session again, then the work.
     The one copy (A2-02): the Billing area passes its own PIN asker as ask; without one the host's reauth asks. */
  function ownerStep(label, work, ref, ask) {
    var first = readSession();
    var asked;
    if (first.ok !== true) return Promise.resolve(fail('SVB_ROLE_DENIED'));
    if (first.isOwner !== true) return Promise.resolve(fail('SVB_OWNER_ONLY'));
    if (typeof ask !== 'function' && (!H || typeof H.reauth !== 'function')) return Promise.resolve(fail('SVB_PIN_DENIED'));
    try { asked = Promise.resolve(typeof ask === 'function' ? ask(String(label).slice(0, SBU_LABEL_MAX)) : H.reauth(String(label).slice(0, SBU_LABEL_MAX))); } catch (e) { return Promise.resolve(fail('SVB_PIN_DENIED')); }
    return asked.then(function (ok) { return ok === true; }, function () { return false; }).then(function (ok) {
      var again;
      if (!ok) return fail('SVB_PIN_DENIED');
      again = readSession();
      if (again.ok !== true || again.isOwner !== true) return fail('SVB_OWNER_ONLY');
      return work(makeCtx(again, { ok: true, at: nowMs() }, ref || newRef()));
    });
  }
  /* One exclusive action at a time; a second press is refused with SVB_BUSY and never reaches the facade. */
  function exclusive(fn) {
    var p, f;
    if (S.busy) {
      f = fail('SVB_BUSY');
      showFailure(f);
      return Promise.resolve(f);
    }
    setBusy(true);
    try { p = Promise.resolve(fn()); } catch (e) { p = Promise.resolve(thrown(e)); }
    return p.then(function (r) { setBusy(false); return r; }, function (e2) {
      var f2 = thrown(e2);
      setBusy(false);
      showFailure(f2);
      return f2;
    });
  }
  function setBusy(on) {
    S.busy = on;
    if (S.dialog) {
      if (on) dialogCapture();
      S.dialog.busy = on;
      renderDialog(false);
    }
    renderCards();
  }
  /* Checks shared by every write: session, past view, one named right, ledger. Returns a failure or null. */
  function writeGate(rightKey) {
    var s = readSession();
    var R;
    if (s.ok !== true) return fail('SVB_ROLE_DENIED');
    if (isPast()) return fail('SVB_PAST_VIEW');
    if (rightKey) {
      R = rightsFor(s, S.cfg);
      if (!R[rightKey]) return fail(SBU_OWNER_KEYS[rightKey] === 1 && R.tier !== 'none' ? 'SVB_OWNER_ONLY' : 'SVB_ROLE_DENIED');
    }
    if (!integrityOk()) return fail('SVB_INTEGRITY');
    return null;
  }
  function integrityOk() {
    var st = S.status;
    return !(st && ((st.integrity && st.integrity.ok === false) || st.billingBlocked === true || st.blocked === true));
  }

  /* ---------- html builders (every dynamic value goes through esc or attr) ---------- */

  function btn(action, label, o) {
    var h = '<button type="button" class="' + attr(cls('svs-btn', o && o.cls)) + '" data-svcs-action="' + attr(action) + '"';
    if (o && o.key !== undefined && o.key !== null) h += ' data-svs-key="' + attr(o.key) + '"';
    if (o && o.focus) h += ' data-svs-focus="1"';
    if (o && (o.disabled || S.busy)) h += ' disabled';
    if (o && o.title) h += ' title="' + attr(o.title) + '"';
    return h + '>' + esc(label) + '</button>';
  }
  function optionsHtml(options, current) {
    return options.map(function (o) {
      return '<option value="' + attr(o.v) + '"' + (asText(o.v) === asText(current) ? ' selected' : '') + '>' + esc(o.l) + '</option>';
    }).join('');
  }
  var idScope = '';
  function scoped(prefix, build) {
    var before = idScope;
    idScope = prefix;
    try { return build(); } finally { idScope = before; }
  }
  /* A labelled field. o: name, label, value, kind (text|select|check|date|time), options, mode, max, req, err, hint, line, ro, focus, enter, ph, caps, cls */
  function fld(o) {
    var id = 'svb-f-' + idScope + o.name.replace(/[^a-z0-9]/gi, '-') + (o.line !== undefined ? '-' + o.line : '');
    var common = ' id="' + attr(id) + '" data-svs-field="' + attr(o.name) + '"';
    var kind = o.kind || 'text';
    var control, label, hint, err;
    if (o.line !== undefined) common += ' data-svs-line="' + attr(o.line) + '"';
    if (o.focus) common += ' data-svs-focus="1"';
    if (o.enter) common += ' data-svs-enter="' + attr(o.enter) + '"';
    if (o.req) common += ' aria-required="true"';
    if (o.err) common += ' aria-invalid="true" aria-describedby="' + attr(id) + '-err"';
    if (o.ro) common += ' readonly';
    if (S.busy) common += ' disabled';
    if (kind === 'select') {
      control = '<select class="svs-input"' + common + '>' + optionsHtml(o.options || [], o.value) + '</select>';
    } else if (kind === 'check') {
      control = '<input type="checkbox" class="svs-check"' + common + (o.value ? ' checked' : '') + '>';
    } else {
      control = '<input type="' + (kind === 'date' || kind === 'time' ? kind : 'text') + '" class="svs-input"' + common + ' value="' + attr(o.value === undefined ? '' : o.value) + '"' +
        (o.max ? ' maxlength="' + attr(o.max) + '"' : '') + (o.mode ? ' inputmode="' + attr(o.mode) + '"' : '') + (o.ph ? ' placeholder="' + attr(o.ph) + '"' : '') +
        (o.caps ? ' autocapitalize="characters"' : '') + ' autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="' + (o.enter ? 'done' : 'next') + '">';
    }
    label = '<label for="' + attr(id) + '">' + esc(o.label) + '</label>';
    hint = o.hint ? '<div class="svs-hint">' + esc(o.hint) + '</div>' : '';
    err = o.err ? '<div class="svs-field-err" id="' + attr(id) + '-err" role="alert">' + esc(o.err) + '</div>' : '';
    if (kind === 'check') return '<div class="' + attr(cls('svs-field', 'svs-field-check', o.cls)) + '">' + control + label + hint + err + '</div>';
    return '<div class="' + attr(cls('svs-field', o.cls)) + '">' + label + control + hint + err + '</div>';
  }
  function badge(kind, label) { return '<span class="' + attr('svs-badge svs-badge-' + kind) + '">' + esc(label) + '</span>'; }
  function notice(kind, text) { return '<div class="' + attr('svs-note svs-note-' + kind) + '">' + esc(text) + '</div>'; }
  function emptyHtml(text, extraHtml) { return '<div class="svs-empty">' + esc(text) + (extraHtml || '') + '</div>'; }
  function pagerHtml(prefix, page, pages, total, label) {
    var h = '<div class="svs-pager">';
    if (page > 1) h += btn(prefix + '-page-prev', t('prev'), { cls: 'svs-btn-quiet' });
    h += '<span class="svs-pageof">' + esc(t('page')) + ' ' + num(page) + ' ' + esc(t('of')) + ' ' + num(Math.max(1, pages)) + '</span>';
    if (page < pages) h += btn(prefix + '-page-next', t('next'), { cls: 'svs-btn-quiet' });
    if (label) h += '<span class="svs-total">' + esc(label) + ' ' + num(total) + '</span>';
    return h + '</div>';
  }
  function setHtml(el, html) { if (el) el.innerHTML = html; }

  /* ---------- dialog layer (one dialog at a time; area dialogs pass o.build and o.actions) ---------- */

  function ensureLayer() {
    var doc, layer, host;
    if (S.layer) return S.layer;
    doc = docOf();
    if (!doc) return null;
    layer = doc.createElement('div');
    layer.id = 'svb-layer';
    layer.setAttribute('data-no-i18n', '');
    host = doc.body || doc.documentElement;
    if (host && typeof host.appendChild === 'function') host.appendChild(layer);
    S.layer = layer;
    bindContainer(layer, 'layer');
    listen(layer, 'focusin', function (ev) {
      var el = ev && ev.target;
      try { if (el && typeof el.scrollIntoView === 'function' && S.dialog) el.scrollIntoView({ block: 'center' }); } catch (e) { /* best effort */ }
    });
    return layer;
  }
  function activeElement() {
    try {
      var doc = docOf();
      return doc && doc.activeElement ? doc.activeElement : null;
    } catch (e) { return null; }
  }
  function focusEl(el) {
    try { if (el && typeof el.focus === 'function') el.focus(); } catch (e) { /* focus is best effort */ }
  }
  function setViewportVar(layer) {
    var w, v;
    try {
      w = docOf() ? docOf().defaultView : null;
      if (w && w.visualViewport && layer && layer.style && typeof layer.style.setProperty === 'function') {
        v = Math.round(w.visualViewport.height) + 'px';
        layer.style.setProperty('--svs-vh', v);
        layer.style.setProperty('--svb-vh', v);
      }
    } catch (e) { /* optional */ }
  }
  function openDialog(kind, data, o) {
    var d = { kind: kind, data: data || {}, errors: {}, error: '', info: '', dirty: false, discard: false, clientRef: newRef(), opener: activeElement(), busy: false, opts: o || {}, result: null };
    S.dialog = d;
    renderDialog(true);
    return d;
  }
  function closeDialog() {
    var d = S.dialog;
    S.dialog = null;
    if (S.layer) S.layer.innerHTML = '';
    if (d && d.opener) focusEl(d.opener);
  }
  function dialogCapture() {
    if (S.dialog && S.layer && !S.dialog.result) captureFields(S.layer, S.dialog.data);
  }
  function renderDialog(focusFirst) {
    var layer = ensureLayer();
    var d = S.dialog;
    var builder, v, foot, alertHtml, infoHtml, target;
    if (!layer) return;
    if (!d) { layer.innerHTML = ''; return; }
    builder = d.opts && typeof d.opts.build === 'function' ? d.opts.build : DIALOGS[d.kind];
    if (!builder) { layer.innerHTML = ''; S.dialog = null; return; }
    v = scoped('d-', function () { return builder(d); });
    foot = d.discard
      ? '<div class="svs-discard" role="alert"><span>' + esc(t('discard_ask')) + '</span> ' + btn('svb-dialog-discard', t('discard'), { cls: 'svs-btn-danger' }) + ' ' + btn('svb-dialog-keep', t('keep_editing'), { cls: 'svs-btn-primary', focus: true }) + '</div>'
      : v.footer;
    alertHtml = '<div class="svs-alert" id="svb-dlg-alert" role="alert">' + (d.error ? esc(d.error) : '') + '</div>';
    infoHtml = d.info ? '<div class="svs-note svs-note-ok" role="status">' + esc(d.info) + '</div>' : '';
    layer.innerHTML = '<div class="svs-overlay" data-svs-overlay="1"><div class="' + attr(cls('svs-dialog', v.wide ? 'svs-dialog-wide' : '')) + '" role="dialog" aria-modal="true" aria-labelledby="svb-dlg-title"' + (d.busy ? ' aria-busy="true"' : '') + '>' +
      '<div class="svs-dlg-head"><div><h3 id="svb-dlg-title" class="svs-dlg-title">' + esc(v.title) + '</h3>' + (v.subHtml ? '<div class="svs-dim">' + v.subHtml + '</div>' : '') + '</div>' +
      btn('svb-dialog-close', t('close'), { cls: 'svs-btn-quiet' }) + '</div>' +
      '<div class="svs-dlg-body">' + alertHtml + infoHtml + v.body + '</div><div class="svs-dlg-foot">' + foot + '</div></div></div>';
    setViewportVar(layer);
    if (focusFirst) {
      target = qs(layer, '[data-svs-focus="1"]');
      focusEl(target);
    }
  }
  /* Keep the typed values, show a new message in the open dialog. */
  function dialogMessage(text, kind) {
    var d = S.dialog;
    if (!d) return;
    dialogCapture();
    d.info = kind === 'info' ? text : '';
    d.error = kind === 'info' ? '' : text;
    renderDialog(false);
  }
  function requestClose() {
    var d = S.dialog;
    if (!d) return;
    if (d.dirty && !d.discard && !d.result) {
      dialogCapture();
      d.discard = true;
      renderDialog(true);
      return;
    }
    closeDialog();
  }
  function showFailure(r) {
    var text = errText(r);
    var d = S.dialog;
    if (d) {
      dialogCapture();
      d.error = text;
      d.info = '';
      renderDialog(false);
    } else if (H && H.jobHost && S.jobId) {
      S.cardError = text;
      renderCards();
    }
    toast(text);
  }

  /* ---------- reading the job (the facade's getJob view, read defensively) ---------- */

  function num0(o, paths) {
    var i, j, cur, ok;
    for (i = 0; i < paths.length; i++) {
      cur = o;
      ok = true;
      for (j = 0; j < paths[i].length; j++) {
        if (cur === null || cur === undefined || typeof cur !== 'object') { ok = false; break; }
        cur = cur[paths[i][j]];
      }
      if (ok && isInt(cur)) return cur;
    }
    return null;
  }
  function billNoOf(b) { return b ? asText(pick(b, ['no', 'invoiceNo'])) : ''; }
  function billTotalOf(b) { return b ? num0(b, [['totalPaise'], ['totals', 'totalPaise'], ['bill', 'totals', 'totalPaise']]) : null; }
  function billDiscountOf(b) {
    var n = b ? num0(b, [['discountPaise'], ['discount', 'totalPaise'], ['totals', 'billDiscountPaise'], ['bill', 'totals', 'billDiscountPaise']]) : null;
    return n === null ? 0 : n;
  }
  /* The facade shows the estimate as {state, latest:{version, bill:{lines, totals}}, ...}; older shapes carry the same fields on the estimate itself. */
  function estLatest(e) { return e && isObj(e.latest) ? e.latest : e; }
  function estVersion(e) {
    var l = estLatest(e);
    return l && isInt(l.version) ? l.version : (e && isInt(e.version) ? e.version : 0);
  }
  function estTotalOf(e) { var l = estLatest(e); return l ? num0(l, [['totalPaise'], ['totals', 'totalPaise'], ['bill', 'totals', 'totalPaise']]) : null; }
  function estLinesOf(e) {
    var l = estLatest(e);
    var ls = l ? (l.lines || (l.bill && l.bill.lines)) : null;
    return Array.isArray(ls) ? ls : [];
  }
  function ncSheetOn(job) {
    var nc = job && job.noCharge;
    return stateOf(job) === 'no_charge' || nc === true || (isObj(nc) && (nc.sheet === true || !!nc.id));
  }
  function stateOf(job) {
    var s = asText(job && job.state).toLowerCase();
    if (job && job.voided === true) return 'voided';
    if (s === 'draft' || s === 'reapproval_needed') return 'estimate';
    if (s === 'void') return 'voided';
    if (s === 'none' || s === 'estimate' || s === 'approved' || s === 'billed' || s === 'paid' || s === 'cancelled' || s === 'no_charge' || s === 'voided') return s;
    return 'none';
  }
  function actionOk(job, names) {
    var a = job && isObj(job.actions) ? job.actions : {};
    var i;
    for (i = 0; i < names.length; i++) { if (a[names[i]] === true) return true; }
    return false;
  }
  function activeBill(job) {
    var b = job && isObj(job.bill) ? job.bill : null;
    if (!b || asText(b.status).toUpperCase() === 'CANCELLED') return null;
    return b;
  }
  function isNotInCcpt(b) { return !!b && (asText(b.mode) === 'NOT_IN_CCPT' || (isObj(b.notInCcpt) && !!b.notInCcpt)); }
  function methodLabel(m) {
    var i;
    for (i = 0; i < SBU_METHODS.length; i++) { if (SBU_METHODS[i].v === asText(m).toUpperCase() || SBU_METHODS[i].via === asText(m)) return t(SBU_METHODS[i].l); }
    return asText(m);
  }
  function takenByName(a) {
    var v = pick(a, ['takenByName', 'takenBy', 'by']);
    if (isObj(v)) return asText(v.name);
    return asText(v);
  }
  function needsReapproval(job) {
    var e = job && job.estimate;
    var a = job && job.approval;
    var st = asText(job && job.state).toLowerCase();
    if (st === 'reapproval_needed') return true;
    if (isObj(e) && asText(e.state).toUpperCase() === 'REAPPROVAL_NEEDED') return true;
    return stateOf(job) === 'estimate' && !!a && isObj(a) && isInt(a.version) && isObj(e) && estVersion(e) > a.version;
  }

  /* ---------- the card model: one pass over getJob, shared by the card and the delivery strip ---------- */

  function chipOf(job, state, R) {
    var b = activeBill(job);
    if (state === 'billed') return b && !isNotInCcpt(b) && !asText(b.ccptInvoiceNo) && asText(b.mode) !== 'NOT_IN_CCPT' ? 'chip_ccpt' : 'chip_billed';
    if (state === 'estimate') return needsReapproval(job) ? 'chip_reapprove' : 'chip_estimate';
    return { none: 'chip_none', approved: 'chip_approved', paid: 'chip_paid', cancelled: 'chip_cancelled', no_charge: 'chip_nocharge', voided: 'voided_chip' }[state] || 'chip_none';
  }
  function nextOf(job, state, R) {
    var b = activeBill(job);
    var due = isInt(job.duePaise) ? job.duePaise : 0;
    if (state === 'billed') {
      if (b && !isNotInCcpt(b) && !asText(b.ccptInvoiceNo) && R.addCcptNo) return t('next_ccpt');
      return R.viewBilling ? fill(t('next_balance'), { amount: money(due) }) : t('next_balance_plain');
    }
    if (state === 'estimate' && needsReapproval(job)) return t('next_reapprove');
    return t({ none: 'next_none', estimate: 'next_estimate', approved: 'next_approved', paid: 'next_paid', cancelled: 'next_cancelled', no_charge: 'next_nocharge' }[state] || 'next_none');
  }
  function primaryOf(job, state, R) {
    var b = activeBill(job);
    var due = isInt(job.duePaise) ? job.duePaise : 0;
    var want = null;
    if (state === 'none') want = ['svb-job-estimate-open', 'b_estimate', 'buildEstimate', ['buildEstimate']];
    else if (state === 'estimate') want = ['svb-job-approval-open', 'b_approval', 'recordApproval', ['recordApproval']];
    else if (state === 'approved' || state === 'cancelled') want = ['svb-job-bill-open', 'b_bill', 'issueBill', ['issueBill']];
    else if (state === 'billed') {
      if (b && !isNotInCcpt(b) && !asText(b.ccptInvoiceNo) && R.addCcptNo && actionOk(job, ['addCcptNo', 'addCcptNumber'])) want = ['svb-job-ccptno-open', 'b_ccpt', 'addCcptNo', ['addCcptNo', 'addCcptNumber']];
      else if (due > 0) want = ['svb-job-balance-open', 'b_balance', 'takeReceipt', ['takeBalance']];
    } else if (state === 'paid' && b && R.viewBilling) want = ['svb-job-print-bill', isNotInCcpt(b) ? 'b_print_tax' : 'b_print_bill', 'viewBilling', null];
    else if (state === 'no_charge' && R.viewBilling) want = ['svb-job-print-nocharge', 'b_print_nc', 'viewBilling', null];
    if (!want || !R[want[2]]) return null;
    if (want[3] && !actionOk(job, want[3])) return null;
    return { id: want[0], label: t(want[1]) };
  }
  function paintCard(model) {
    var host = H && H.jobHost;
    if (!host) return;
    host.innerHTML = model.cardHtml || '';
  }
  function paintStrip(model) {
    var host = H && H.closeHost;
    if (!host) return;
    host.innerHTML = model.stripHtml || '';
  }
  function cardShell(inner) {
    return '<div class="svb-card" role="group" aria-label="' + attr(t('title')) + '"><div class="svb-card-head"><h4 class="svs-h3">' + esc(t('title')) + '</h4>' + inner;
  }
  function textCard(kind, text, chipHtml) {
    return cardShell('<span class="svb-chip-row">' + (chipHtml || '') + '</span></div>' + notice(kind, text)) + '</div>';
  }
  function printBtns(job, R) {
    var h = '';
    var b = job && job.bill;
    var nc = ncSheetOn(job);
    if (!R.viewBilling) return '';
    if (b && billNoOf(b)) h += btn('svb-job-print-bill', isNotInCcpt(b) ? t('b_print_tax') : t('b_print_bill'), { cls: 'svs-btn-quiet' });
    if (nc) h += btn('svb-job-print-nocharge', t('b_print_nc'), { cls: 'svs-btn-quiet' });
    return h;
  }
  function receiptRowHtml(r, R) {
    var line = esc(asText(r.no)) + '  ' + esc(fmtAt(pick(r, ['docDate', 'at']))) + '  ' + esc(asText(r.payMode)) + '  ' + esc(money(r.amountPaise));
    var rev = asText(r.status).toUpperCase() === 'REVERSED';
    return '<div class="svb-rcpt-row' + (rev ? ' svb-neg' : '') + '"><span class="svs-code">' + line + '</span>' + (rev ? ' ' + badge('off', t('reversed')) : '') +
      (R.viewBilling && r.no && !rev ? ' ' + btn('svb-job-print-receipt', t('b_print'), { key: r.no, cls: 'svs-btn-quiet' }) : '') + '</div>';
  }
  function factHtml(label, value) {
    return '<div class="svb-fact"><span class="svb-fact-label">' + esc(label) + '</span><span class="svb-fact-value">' + esc(value) + '</span></div>';
  }
  function stepHtml(no, label, mainHtml, actHtml) {
    return '<div class="svb-step"><span class="svb-step-no">' + esc(no) + '</span><div class="svb-step-main"><b>' + esc(label) + '</b> ' + mainHtml + '</div><div class="svb-step-act">' + (actHtml || '') + '</div></div>';
  }
  function approvalSummary(job) {
    var a = job.approval;
    var e = job.estimate;
    if (!isObj(a)) return esc(t('e_approval'));
    if (a.legacy === true || a.old === true) return esc(fill(t('sum_approval_old'), { date: fmtAt(pick(a, ['at', 'approvedAt'])), amount: money(pick(a, ['amountPaise'])) }));
    return esc(fill(t('sum_approval'), { date: fmtAt(pick(a, ['approvedAt', 'at'])), name: takenByName(a), method: methodLabel(pick(a, ['method', 'via'])), amount: money(a.amountPaise) })) +
      (needsReapproval(job) && isObj(e) ? ' ' + badge('warn', t('chip_reapprove')) : '');
  }
  function estimateSummary(job, R) {
    var e = job.estimate;
    var lines, other, i;
    if (!isObj(e)) return esc(t('e_estimate'));
    lines = estLinesOf(e);
    other = false;
    for (i = 0; i < lines.length; i++) { if (asText(lines[i].kind).toUpperCase() === 'OTHER') other = true; }
    return esc(fill(t('sum_estimate'), { n: estVersion(e), k: lines.length || num0(e, [['lineCount']]) || 0, amount: money(estTotalOf(e)) })) + (other ? ' ' + esc(t('sum_other')) : '');
  }
  function billSummary(job) {
    var b = job.bill;
    if (!isObj(b)) return esc(t('e_bill'));
    return esc(fill(t('sum_bill'), { no: billNoOf(b), ccpt: asText(b.ccptInvoiceNo) || t('ccpt_none'), amount: money(billTotalOf(b)), amount2: money(billDiscountOf(b)) })) +
      (isNotInCcpt(b) ? ' ' + esc(t('not_ccpt_note')) : '') + (asText(b.status).toUpperCase() === 'CANCELLED' ? ' ' + badge('bad', t('cancelled')) : '');
  }
  function restockHtml(job, pastOrLocked) {
    var seen = {};
    var rows = arr(job.pendingReturns).filter(function (x) { return isObj(x) && asText(x.cnNo) && isInt(x.pendingQty) && x.pendingQty > 0; });
    if (!rows.length) return '';
    return '<div class="svb-more"><b>' + esc(t('rs_title')) + '</b> ' + rows.map(function (x) {
      var first = !seen[x.cnNo];
      seen[x.cnNo] = true;
      return '<span class="svs-code">' + esc(fill(t('rs_row'), { no: asText(x.cnNo), n: x.pendingQty, code: asText(x.partCode) })) + '</span> ' +
        (first && !pastOrLocked ? btn('svb-cn-restock', t('b_restock'), { key: asText(x.cnNo) }) : '');
    }).join(' ') + '</div>';
  }
  function restock(cnNo) {
    var no = asText(cnNo);
    if (!no) return Promise.resolve(fail('SVB_INTERNAL'));
    return exclusive(function () {
      return callB('returnCreditedStock', [{ cnNo: no }, makeCtx(readSession(), null, newRef())]).then(function (r) {
        if (!r.ok) { showFailure(r); return r; }
        toast(fill(t('rs_done'), { no: no }));
        refreshJob();
        return r;
      });
    });
  }
  function buildFull(job, cj, R, pastOrLocked) {
    var state = stateOf(job);
    var b = activeBill(job);
    var due = isInt(job.duePaise) ? job.duePaise : 0;
    var held = isInt(job.heldPaise) ? job.heldPaise : 0;
    var chips = badge(state === 'billed' && chipOf(job, state, R) === 'chip_ccpt' ? 'warn' : (state === 'paid' || state === 'approved' ? 'ok' : 'info'), t(chipOf(job, state, R))) + (isNotInCcpt(job.bill) ? ' ' + badge('info', t('not_ccpt_chip')) : '');
    var prim = pastOrLocked ? null : primaryOf(job, state, R);
    var plain = !R.viewBilling && !R.buildEstimate && !R.recordApproval;
    var h = cardShell('<span class="svb-chip-row">' + chips + '</span></div>');
    var recs, afterBill, stepsAct, more, i, nudge, sync, receipts;
    h += '<div class="svb-next">' + esc(plain ? t('staff_note') : nextOf(job, state, R)) + '</div>';
    if (pastOrLocked) h += '<div class="svb-primary-bar">' + printBtns(job, R) + '</div>';
    else if (prim) h += '<div class="svb-primary-bar">' + btn(prim.id, prim.label, { cls: 'svs-btn-primary' }) + '</div>';
    if (!R.viewBilling) return h + '</div>';
    h += '<div class="svb-money">' + factHtml(t('f_estimate'), job.estimate ? money(estTotalOf(job.estimate)) + ' (v' + asText(estVersion(job.estimate)) + ')' : '-') + factHtml(t('f_held'), money(held)) +
      factHtml(t('f_bill'), b ? money(billTotalOf(b)) : '-') + factHtml(t('f_paid'), money(isInt(job.paidPaise) ? job.paidPaise : 0)) + factHtml(t('f_due'), b ? money(due) : '-') + '</div>';
    stepsAct = function (id, label, rightKey, names) {
      return !pastOrLocked && R[rightKey] && actionOk(job, names) ? btn(id, label, {}) : '';
    };
    receipts = arr(job.receipts);
    afterBill = [];
    recs = [];
    for (i = 0; i < receipts.length; i++) {
      if (asText(receipts[i].kind || receipts[i].series).toUpperCase().indexOf('SRC') === 0) afterBill.push(receipts[i]); else recs.push(receipts[i]);
    }
    nudge = '';
    if (cj && isInt(cj.typedAdvancePaise) && cj.typedAdvancePaise > 0 && recs.length === 0 && !pastOrLocked) nudge = '<div class="svb-legacy-note">' + esc(t('typed_adv')) + '</div>';
    h += stepHtml(1, t('s_estimate'), estimateSummary(job, R), stepsAct('svb-job-estimate-open', job.estimate ? t('b_estimate_change') : t('b_estimate'), 'buildEstimate', ['buildEstimate']));
    h += stepHtml(2, t('s_approval'), approvalSummary(job), stepsAct('svb-job-approval-open', t('b_approval'), 'recordApproval', ['recordApproval']));
    h += stepHtml(3, t('s_advance'), (recs.length ? recs.map(function (r) { return receiptRowHtml(r, R); }).join('') : esc(t('e_advance'))) + nudge, stepsAct('svb-job-advance-open', t('b_advance'), 'takeReceipt', ['takeAdvance']));
    h += stepHtml(4, t('s_bill'), billSummary(job), (stepsAct('svb-job-bill-open', t('b_bill'), 'issueBill', ['issueBill']) || '') +
      (b && R.viewBilling ? btn('svb-job-print-bill', isNotInCcpt(b) ? t('b_print_tax') : t('b_print_bill'), { cls: 'svs-btn-quiet' }) : '') +
      stepsAct('svb-job-ccptno-open', t('b_ccpt'), 'addCcptNo', ['addCcptNo', 'addCcptNumber']) +
      (b && asText(b.ccptInvoiceNo) ? stepsAct('svb-job-ccptchange-open', t('cc_change_title'), 'changeCcpt', ['changeCcptNo']) : ''));
    h += stepHtml(5, t('s_balance'), afterBill.length ? afterBill.map(function (r) { return receiptRowHtml(r, R); }).join('') : esc(t('e_balance')), stepsAct('svb-job-balance-open', t('b_balance'), 'takeReceipt', ['takeBalance']));
    more = (pastOrLocked ? '' : stepsAct('svb-job-ncsheet-open', t('b_nocharge'), 'markNoCharge', ['markNoCharge', 'issueNoChargeSheet']) +
      stepsAct('svb-job-notccpt-open', t('b_notccpt'), 'markNotBilledCcpt', ['markNotBilledCcpt', 'markNotInCcpt']) +
      stepsAct('svb-job-nccancel-open', t('b_nocharge_cancel'), 'cancelNoCharge', ['cancelNoChargeSheet', 'cancelNoCharge']) +
      stepsAct('svb-job-cancel-open', t('b_cancel'), 'cancelBill', ['cancelBill']) + stepsAct('svb-job-credit-open', t('b_credit'), 'creditNote', ['creditNote']) +
      stepsAct('svb-job-refund-open', t('b_refund'), 'refundAdvance', ['refundAdvance']) + stepsAct('svb-job-void-open', t('b_void'), 'voidJob', ['voidJob']) +
      (R.reverseReceipt && reversible(job, false).length ? btn('svb-job-reverse-open', t('rv_title'), {}) : '') +
      (R.reverseRefund && reversible(job, true).length ? btn('svb-job-reverse-refund-open', t('rvf_title'), {}) : '')) + (ncSheetOn(job) && R.viewBilling ? btn('svb-job-print-nocharge', t('b_print_nc'), { cls: 'svs-btn-quiet' }) : '');
    if (more) h += '<div class="svb-more"><b>' + esc(t('more')) + '</b> ' + more + '</div>';
    // Stage E round 2 (A): pieces a credit note took back that are not in stock yet; one press puts back all pieces of that note
    h += restockHtml(job, pastOrLocked);
    if (job.estimate && !pastOrLocked) h += '<div class="svb-legacy-note">' + esc(t('sync_note')) + '</div>';
    return h + '</div>';
  }
  function stripFor(job, R, hidden) {
    var b, due, st;
    if (hidden || !R.viewBilling) return '';
    st = stateOf(job);
    b = activeBill(job);
    due = isInt(job.duePaise) ? job.duePaise : 0;
    if (st === 'voided') return '';
    if (st === 'no_charge') return stripShell(esc(t('strip_nocharge')) + '<div class="svb-strip-act">' + btn('svb-job-print-nocharge', t('b_print_nc'), {}) + '</div>');
    if (!b) {
      if (!job.estimate && !arr(job.receipts).length && !isObj(job.approval)) return '';
      return stripShell(esc(t('strip_nobill')) + '<div class="svb-strip-act">' + btn('svb-job-goto-billing', t('b_goto'), {}) + '</div>');
    }
    if (due > 0) {
      return stripShell(esc(fill(t('strip_due'), { no: billNoOf(b), amount: money(billTotalOf(b)), paid: money(isInt(job.paidPaise) ? job.paidPaise : 0), due: money(due) })) +
        '<div class="svb-strip-act">' + (R.takeReceipt && actionOk(job, ['takeBalance']) ? btn('svb-job-balance-open', t('b_balance'), {}) : '') + btn('svb-job-print-bill', isNotInCcpt(b) ? t('b_print_tax') : t('b_print_bill'), {}) + '</div>');
    }
    return stripShell(esc(fill(t('strip_paid'), { no: billNoOf(b), amount: money(billTotalOf(b)) })) + '<div class="svb-strip-act">' + btn('svb-job-print-bill', isNotInCcpt(b) ? t('b_print_tax') : t('b_print_bill'), {}) + '</div>');
  }
  function stripShell(inner) {
    return '<div class="svb-card svb-strip"><h4 class="svs-h3">' + esc(t('strip_title')) + '</h4><div>' + inner + '</div></div>';
  }
  /* The old job-sheet fields follow the estimate (page glue does the writing; here only the model). */
  function syncModel(job, past) {
    var e, b, lines, out;
    if (past) return null;
    e = job && job.estimate;
    b = job ? activeBill(job) : null;
    if (!job || !isObj(e)) return { on: false, lines: [], advanceText: null, finalText: null, finalLocked: false, noCharge: false, hint: '' };
    lines = estLinesOf(e).map(function (l) {
      var qty = isInt(l.qty) && l.qty > 0 ? l.qty : 1;
      var total = isInt(l.totalPaise) ? l.totalPaise : 0;
      return { desc: asText(pick(l, ['name', 'desc', 'description'])) + ' x ' + qty, amountText: rupeeText(total) };
    });
    out = { on: true, lines: lines, advanceText: rupeeText(isInt(job.heldPaise) ? job.heldPaise : 0), finalText: null, finalLocked: false, noCharge: stateOf(job) === 'no_charge', hint: t('sync_note') };
    if (b && isInt(billTotalOf(b))) { out.finalText = rupeeText(billTotalOf(b)); out.finalLocked = true; }
    return out;
  }

  var SBU_BASE_MODEL = { kind: 'blank', cardHtml: '', stripHtml: '' };
  function loadStatus() {
    return callB('status', []).then(function (r) {
      if (r.ok) {
        S.status = r;
        if (isObj(r.config)) {
          S.cfg = {
            discountLimitPaise: isInt(r.config.discountLimitPaise) ? r.config.discountLimitPaise : 0,
            billingRoles: arr(r.config.billingRoles).slice(), estimateRoles: arr(r.config.estimateRoles).slice()
          };
        }
      } else {
        S.status = { ok: false, integrity: { ok: false }, blocked: true, code: r.code };
      }
      return r;
    });
  }
  function buildModel(id) {
    var s = readSession();
    var past = isPast();
    var cj = null;
    var R;
    if (!facade()) return Promise.resolve(SBU_BASE_MODEL);
    if (s.tier === 'none') return Promise.resolve(SBU_BASE_MODEL);
    R = rightsFor(s, S.cfg);
    if (!id) return Promise.resolve({ kind: 'text', cardHtml: textCard('info', SBU_ERR.SVB_JOB_NOT_SAVED), stripHtml: '' });
    try { cj = H.job(id); } catch (e) { cj = null; }
    if (!cj) return Promise.resolve({ kind: 'text', cardHtml: textCard('warn', SBU_ERR.SVB_JOB_UNKNOWN), stripHtml: '' });
    return callB('getJob', [id, makeCtx(s, null, '')]).then(function (r) {
      var job, state, locked, h, mk;
      if (!r.ok || !isObj(r.job)) {
        return { kind: 'error', cardHtml: cardShell('<span class="svb-chip-row"></span></div>' + notice('bad', errText(r)) + '<div class="svb-primary-bar">' + btn('svb-blocked-retry', t('retry'), {}) + '</div>') + '</div>', stripHtml: '' };
      }
      job = r.job;
      state = stateOf(job);
      if (!integrityOk()) {
        return { kind: 'integrity', job: job, cj: cj, cardHtml: buildFull(job, cj, R, true).replace('<div class="svb-next">', notice('bad', SBU_ERR.SVB_INTEGRITY) + '<div class="svb-next">'), stripHtml: '' };
      }
      if (state === 'voided' || (cj && cj.voided === true)) {
        h = buildFull(job, cj, R, true).replace('<div class="svb-next">', notice('bad', fill(t('void_note'), { reason: asText(pick(job, ['voidReason']) || (job.void && job.void.reason) || (cj && cj.voidReason) || '') })) + '<div class="svb-next">');
        return { kind: 'voided', job: job, cj: cj, cardHtml: h, stripHtml: '' };
      }
      if (past) {
        return { kind: 'past', job: job, cj: cj, cardHtml: buildFull(job, cj, R, true).replace('<div class="svb-next">', notice('warn', t('past_note')) + '<div class="svb-next">'), stripHtml: '' };
      }
      locked = false;
      mk = { kind: 'full', job: job, cj: cj, cardHtml: buildFull(job, cj, R, locked), stripHtml: stripFor(job, R, false), sync: syncModel(job, past) };
      return mk;
    });
  }
  function renderCards() {
    var m = S.model;
    if (H && H.jobHost && m && S.jobId) {
      /* a busy flag changes which buttons are disabled: rebuild from the last model */
      var R = rights();
      if (m.job && (m.kind === 'full')) { m.cardHtml = buildFull(m.job, m.cj, R, false); m.stripHtml = stripFor(m.job, R, false); }
      paintCard(m);
      paintStrip(m);
    }
  }
  /* Draw the card and the strip for the form's current job. A later call wins over an earlier slower one. */
  function refreshJob() {
    var tok, id;
    if (!H || !H.jobHost) return Promise.resolve();
    S.tok += 1;
    tok = S.tok;
    id = '';
    try { id = H.currentJobId ? asText(H.currentJobId()) : ''; } catch (e) { id = ''; }
    S.jobId = id;
    return loadStatus().then(function () { return buildModel(id); }).then(function (m) {
      if (tok !== S.tok) return;
      S.model = m;
      S.cardError = '';
      S.job = m.job ? { id: id, job: m.job, cj: m.cj } : null;
      paintCard(m);
      paintStrip(m);
      if (m.sync !== undefined && H && typeof H.syncLegacy === 'function') {
        try { H.syncLegacy(m.sync || { on: false, lines: [], advanceText: null, finalText: null, finalLocked: false, noCharge: false, hint: '' }); } catch (e2) { toast(fill(SBU_ERR.SVB_INTERNAL, { code: 'SVB_INTERNAL' })); }
      }
    }, function (e3) {
      if (tok === S.tok) { S.model = SBU_BASE_MODEL; paintCard(SBU_BASE_MODEL); paintStrip(SBU_BASE_MODEL); }
      return thrown(e3);
    });
  }

  /* ---------- the hooks the page calls, each one fails closed ---------- */

  function closeGate(jobId) {
    var r;
    if (!facade()) return null;
    r = syncB('closeCheck', [asText(jobId)]);
    if (!isObj(r) || r.ok !== true) return { ok: false, message: t('close_unknown') };
    if (r.legacy === true || r.mayClose === true) return null;
    if (isInt(r.dueNowPaise) && r.dueNowPaise > 0) return { ok: false, message: fill(t('close_due'), { amount: money(r.dueNowPaise), no: asText(r.billNo) }) };
    return { ok: false, message: t('close_nobill') };
  }
  function allowsZeroFinal(jobId) { return flag(syncB('jobNoCharge', [asText(jobId)]), ['noCharge', 'value', 'on']); }
  function jobBilled(jobId) { return flag(syncB('jobBilled', [asText(jobId)]), ['billed', 'value', 'has']); }
  function jobNoCharge(jobId) { return allowsZeroFinal(jobId); }
  function flag(r, keys) {
    var i;
    if (r === true) return true;
    if (!isObj(r) || r.ok !== true) return false;
    for (i = 0; i < keys.length; i++) { if (r[keys[i]] === true) return true; }
    return false;
  }
  /* True when the job must not be deleted; false only when billing says there is nothing on it, or billing is not in this build. */
  function blocksDelete(jobId) {
    var id = asText(jobId && typeof jobId === 'object' ? jobId.id : jobId);
    var r;
    if (!facade()) return false;
    r = syncB('jobHasRecords', [id]);
    if (isObj(r) && r.ok === true && r.has === false) return false;
    toast(isObj(r) && r.ok === true && r.has === true ? fill(t('delete_blocked'), { job: id }) : t('no_nocheck'));
    return true;
  }
  /* The list button "Mark approved": true when billing handled it (the approval form or the estimate builder opened). */
  function openApproval(jobId) {
    var id = asText(jobId);
    if (!H || !facade()) return false;
    try { if (H.job && H.job(id) && H.job(id).status === 'closed') return false; } catch (e) { return false; }
    S.jobId = id;
    return startApproval(id);
  }
  function startApproval(id) {
    var s = readSession();
    var R = rightsFor(s, S.cfg);
    if (s.tier === 'none' || !R.recordApproval) { toast(SBU_ERR.SVB_ROLE_DENIED); return true; }
    callB('getJob', [id, makeCtx(s, null, '')]).then(function (r) {
      if (!r.ok) { showFailure(r); return r; }
      S.job = { id: id, job: r.job, cj: H.job ? H.job(id) : null };
      if (!isObj(r.job.estimate)) return openEstimate();
      return openApprovalDialog();
    });
    return true;
  }
  /* The old "GST Tax Invoice" button: true when billing handled it, false only for an old invoice that keeps its old reprint. */
  function taxInvoiceRoute(jobId) {
    var id = asText(jobId);
    var r, s, route, g;
    if (!facade()) return false;
    r = syncB('taxRoute', [id]);
    if (!isObj(r) || r.ok !== true) { toast(t('no_billing')); return true; }
    route = r.route;
    if (route === 'legacy') return false;
    if (route === 'old_way_closed') { toast(t('old_way_closed')); return true; }
    s = readSession();
    if (route === 'issue') {
      g = writeGate('issueBill');
      if (g) { showFailure(g); return true; }
      S.jobId = id;
      startBill(id, false);
      return true;
    }
    if (route === 'summary') { printDoc('bill', { invoiceNo: activeNoFor(id) }); return true; }
    if (route === 'tax_invoice') { printDoc('taxinvoice', { invoiceNo: activeNoFor(id) }); return true; }
    if (route === 'no_charge') { printDoc('sheet', { jobId: id }); return true; }
    toast(t('no_billing'));
    return true;
  }
  function activeNoFor(id) {
    var r = syncB('activeInvoiceNo', [id]);
    if (typeof r === 'string') return r;
    return isObj(r) ? asText(pick(r, ['no', 'invoiceNo', 'value'])) : '';
  }

  /* ---------- printing (through the page's print helper, else printData and the report engine) ---------- */

  function printDoc(kind, args) {
    var type = SBU_PRINT[kind];
    var s = readSession();
    var rep = null;
    var f, opts, k;
    if (s.ok !== true) { f = fail('SVB_ROLE_DENIED'); showFailure(f); return Promise.resolve(f); }
    if (!rightsFor(s, S.cfg).viewBilling) { f = fail('SVB_ROLE_DENIED'); showFailure(f); return Promise.resolve(f); }
    if (H && typeof H.print === 'function') {
      try {
        return Promise.resolve(H.print(type, args)).then(function (r) {
          if (r && r.ok === false) { showFailure(r); return r; }
          return { ok: true };
        }, function (e) { var x = thrown(e); showFailure(x); return x; });
      } catch (e2) { f = thrown(e2); showFailure(f); return Promise.resolve(f); }
    }
    try { rep = H && typeof H.report === 'function' ? H.report() : null; } catch (e3) { rep = null; }
    if (!rep || typeof rep.preview !== 'function') { f = fail('SVB_PRINT_UNAVAILABLE'); showFailure(f); return Promise.resolve(f); }
    return callB('printData', [type, args, makeCtx(s, null, '')]).then(function (r) {
      var data;
      if (!r.ok) { showFailure(r); return r; }
      data = r.svcData !== undefined ? r.svcData : r.data;
      opts = { svcData: data };
      for (k in args) { if (Object.prototype.hasOwnProperty.call(args, k)) opts[k] = args[k]; }
      try { rep.preview(type, opts); } catch (e4) { var x2 = thrown(e4); showFailure(x2); return x2; }
      return { ok: true };
    });
  }

  /* ---------- dialogs ---------- */

  var DIALOGS = {};

  function footHtml(d, action, label, cancelAction, o) {
    var cancel = btn(cancelAction, o && o.cancelLabel ? o.cancelLabel : t('cancel'), { cls: 'svs-btn-quiet' });
    var extra = o && o.extra ? o.extra : '';
    return extra + btn(action, d.busy ? t('saving') : label, { cls: o && o.danger ? 'svs-btn-danger' : 'svs-btn-primary', focus: false }) + ' ' + cancel;
  }
  function resultFoot(items) { return items.join(' '); }
  function fieldErr(d, name) { return d.errors[name] || ''; }
  function setErrors(errors) {
    var d = S.dialog;
    if (!d) return;
    d.errors = errors || {};
    renderDialog(false);
  }
  function jobOfDialog() { return S.job && isObj(S.job.job) ? S.job.job : {}; }
  function jobLabel() {
    var cj = S.job && S.job.cj;
    return cj && cj.label ? cj.label : (S.jobId || '');
  }
  /* The job must still exist, not be voided, and the right must still hold. Returns a failure or null. */
  function jobGate(rightKey) {
    var g = writeGate(rightKey);
    var j = jobOfDialog();
    if (g) return g;
    if (!S.jobId) return fail('SVB_JOB_NOT_SAVED');
    if (stateOf(j) === 'voided' || (S.job && S.job.cj && S.job.cj.voided === true)) return fail('SVB_JOB_VOIDED');
    return null;
  }
  function refuse(g) {
    showFailure(g);
    return Promise.resolve(g);
  }
  /* Load the job fresh, then run next(job). Used before every dialog that needs current figures. */
  function withFreshJob(next) {
    var s = readSession();
    var id = S.jobId;
    if (!id) return refuse(fail('SVB_JOB_NOT_SAVED'));
    return callB('getJob', [id, makeCtx(s, null, '')]).then(function (r) {
      if (!r.ok || !isObj(r.job)) { showFailure(r); return r; }
      S.job = { id: id, job: r.job, cj: S.job && S.job.cj ? S.job.cj : (H.job ? H.job(id) : null) };
      return next(r.job);
    });
  }
  function selectedOption(list, v) {
    var i;
    for (i = 0; i < list.length; i++) { if (list[i].v === v) return list[i]; }
    return list[0];
  }
  function payFields(d, withRef, ro) {
    var dd = d.data;
    return fld({ name: 'payMode', label: t('r_mode'), kind: 'select', value: dd.payMode, options: SBU_PAY.map(function (o) { return { v: o.v, l: t(o.l) }; }) }) +
      (dd.payMode !== 'Cash' && withRef ? fld({ name: 'payRef', label: t('r_ref'), value: dd.payRef, max: 30, err: fieldErr(d, 'payRef'), req: true }) : '');
  }
  function checkPay(dd, errors) {
    var ref = trim(dd.payRef);
    if (SBU_PAY.every(function (o) { return o.v !== dd.payMode; })) dd.payMode = 'Cash';
    if (dd.payMode !== 'Cash' && (ref.length < 3 || ref.length > 30)) errors.payRef = SBU_ERR.SVB_REF_REQUIRED;
    return dd.payMode === 'Cash' ? '' : ref;
  }

  /* ---- estimate ---- */

  function blankLine(kind) {
    return { kind: kind, code: '', name: '', search: '', hsn: '', rateBp: null, rate: '', basis: '', masterBasis: null, masterPaise: null, price: '', qty: '1', picked: false, taxPending: false };
  }
  function fromStoredLine(l) {
    var kind = asText(l.kind).toUpperCase();
    var L = blankLine(kind === 'LABOUR' || kind === 'OTHER' ? kind : 'PART');
    var basis = asText(pick(l, ['priceBasis']));
    L.code = asText(l.code);
    L.name = asText(pick(l, ['name', 'desc', 'description']));
    L.hsn = asText(pick(l, ['hsnSac', 'hsn', 'sac']));
    L.rateBp = isInt(l.rateBp) ? l.rateBp : null;
    L.rate = rateText(L.rateBp);
    L.basis = basis;
    L.masterBasis = basis === 'INCL' || basis === 'EXCL' ? basis : null;
    L.masterPaise = isInt(l.unitPricePaise) ? l.unitPricePaise : null;
    L.price = isInt(l.unitPricePaise) ? rupeeText(l.unitPricePaise) : '';
    L.qty = isInt(l.qty) ? String(l.qty) : '1';
    L.search = L.code;
    L.picked = L.kind !== 'OTHER' && !!L.code;
    return L;
  }
  function lineToCalc(L) {
    var q, p, r;
    if (!L) return null;
    q = parseQty(L.qty, { min: 1, max: L.kind === 'PART' ? 100000 : 999 });
    if (!q.ok) return null;
    if (L.kind === 'OTHER') {
      p = parsePaise(L.price, { allowZero: true });
      r = parseRateBp(L.rate);
      if (!p.ok || !r.ok || !/^(\d{4}|\d{6}|\d{8})$/.test(trim(L.hsn)) || (L.basis !== 'INCL' && L.basis !== 'EXCL') || !trim(L.name)) return null;
      return { kind: 'OTHER', code: '', name: trim(L.name), hsnSac: trim(L.hsn), rateBp: r.bp, priceBasis: L.basis, unitPricePaise: p.paise, qty: q.qty, discountPaise: 0, noCharge: false, ref: '' };
    }
    if (!L.picked || !isInt(L.rateBp) || !isInt(L.masterPaise) || (L.basis !== 'INCL' && L.basis !== 'EXCL')) return null;
    return { kind: L.kind, code: L.code, name: L.name, hsnSac: L.hsn, rateBp: L.rateBp, priceBasis: L.basis, unitPricePaise: L.masterPaise, qty: q.qty, discountPaise: 0, noCharge: false, ref: '' };
  }
  /* The live estimate figures; null when a line is unfinished or calc is not loaded. */
  function estimateFigures(lines) {
    var c = calcLib();
    var calcLines = [];
    var i, x, r;
    if (!c || !lines.length) return null;
    for (i = 0; i < lines.length; i++) {
      x = lineToCalc(lines[i]);
      if (!x) return null;
      calcLines.push(x);
    }
    try { r = c.computeBill({ lines: calcLines, billDiscountPaise: 0, sellerStateCode: SBU_SELLER_STATE, recipientStateCode: SBU_SELLER_STATE, recipientGstin: '' }); } catch (e) { return null; }
    return r && r.ok === true ? r : null;
  }
  function totalsHtml(r, labels) {
    var tt = r && r.totals;
    var rows = '';
    function row(label, v, grand) { return '<div class="svb-totals-row' + (grand ? ' svb-totals-grand' : '') + '"><span class="svb-row-label">' + esc(label) + '</span><span class="svb-row-value">' + esc(money(v)) + '</span></div>'; }
    if (!tt) return '<div class="svb-totals">' + row(labels.grand, null, true) + '</div>';
    rows += row(t('t_taxable'), tt.taxablePaise);
    if (isInt(tt.igstPaise) && tt.igstPaise > 0) rows += row(t('t_igst'), tt.igstPaise);
    else if (labels.split) rows += row(t('t_cgst'), tt.cgstPaise) + row(t('t_sgst'), tt.sgstPaise);
    else rows += row(t('t_gst'), tt.taxPaise);
    if (labels.discount) rows += row(t('t_discount'), (tt.lineDiscountPaise || 0) + (tt.billDiscountPaise || 0));
    rows += row(t('t_roundoff'), tt.roundOffPaise);
    rows += row(labels.grand, tt.totalPaise, true);
    return '<div class="svb-totals">' + rows + '</div>';
  }
  function estLineHtml(d, L, i) {
    var master = L.kind !== 'OTHER';
    var head = '<div class="svb-line-head">' + badge('info', t('k_' + L.kind.toLowerCase())) + ' ' + btn('svb-est-line-remove', t('remove'), { key: i, cls: 'svs-btn-quiet' }) + '</div>';
    var grid = '';
    var lp = lineToCalc(L);
    var e = function (n) { return d.errors['lines.' + i + '.' + n] || ''; };
    var q = L.kind === 'PART' ? '100000' : '999';
    if (master) {
      grid += fld({ name: 'search', label: t(L.kind === 'PART' ? 'f_item_part' : 'f_item_labour'), value: L.search, max: 40, line: i, err: e('search'), req: true, focus: L.search === '' });
      grid += '<div class="svb-pick-box" id="svb-pick-' + i + '"></div>';
      if (L.picked) {
        grid += '<div class="svb-ro">' + esc(L.name) + '</div><div class="svb-ro">' + esc(fill(t(L.kind === 'PART' ? 'hsn' : 'sac'), { code: L.hsn })) + ' / ' + esc(rateText(L.rateBp)) + '%</div>';
        if (L.masterBasis === null) grid += fld({ name: 'basis', label: t('f_basis'), kind: 'select', value: L.basis, line: i, err: e('basis'), options: [{ v: '', l: t('basis_pick') }, { v: 'INCL', l: t('basis_incl') }, { v: 'EXCL', l: t('basis_excl') }] });
        grid += '<div class="svb-ro">' + esc(t('f_price')) + ': ' + esc(money(L.masterPaise)) + '</div>';
      }
    } else {
      grid += fld({ name: 'name', label: t('f_desc'), value: L.name, max: 60, line: i, err: e('name'), req: true }) +
        fld({ name: 'hsn', label: t('f_taxcode'), value: L.hsn, max: 8, mode: 'numeric', line: i, err: e('hsn'), req: true }) +
        fld({ name: 'rate', label: t('f_rate'), value: L.rate, max: 6, mode: 'decimal', line: i, err: e('rate'), req: true }) +
        fld({ name: 'basis', label: t('f_basis'), kind: 'select', value: L.basis, line: i, err: e('basis'), options: [{ v: '', l: t('basis_pick') }, { v: 'INCL', l: t('basis_incl') }, { v: 'EXCL', l: t('basis_excl') }] }) +
        fld({ name: 'price', label: t('f_price'), value: L.price, max: 12, mode: 'decimal', ph: '0.00', line: i, err: e('price'), req: true });
    }
    grid += fld({ name: 'qty', label: t('f_qty'), value: L.qty, max: String(q).length, mode: 'numeric', line: i, err: e('qty'), req: true });
    return '<div class="svb-line">' + head + '<div class="svb-line-grid">' + grid + '</div><div class="svb-line-total">' + esc(t('f_line_total')) + ' ' + esc(lp ? money(lineTotal(lp)) : '-') + '</div></div>';
  }
  function lineTotal(x) {
    var c = calcLib();
    var r;
    try { r = c.computeBill({ lines: [x], billDiscountPaise: 0, sellerStateCode: SBU_SELLER_STATE, recipientStateCode: SBU_SELLER_STATE, recipientGstin: '' }); } catch (e) { return null; }
    return r && r.ok === true ? r.totals.totalPaise : null;
  }
  DIALOGS.estimate = function (d) {
    var dd = d.data;
    var R = rights();
    var body, foot, n;
    if (d.result) {
      return {
        title: t('est_title'), subHtml: esc(jobLabel()), wide: true,
        body: notice('ok', t('est_result')) + '<div class="svb-result">' + esc(fill(t('est_saved'), { n: d.result.version, amount: money(d.result.amountPaise) })) + '</div>',
        footer: resultFoot([d.result.needs ? btn('svb-job-approval-open', t('est_approve_now'), { cls: 'svs-btn-primary' }) : '', btn('svb-est-cancel', t('done'), { cls: 'svs-btn-quiet' })])
      };
    }
    n = dd.lines.length;
    body = '<div class="svs-dim">' + esc(dd.changing ? fill(t('est_changing'), { n: dd.version }) : t('est_new')) + '</div><div class="svb-est-add">' +
      btn('svb-est-add-part', t('add_part'), {}) + ' ' + btn('svb-est-add-labour', t('add_labour'), {}) + (R.addOtherLine ? ' ' + btn('svb-est-add-other', t('add_other'), {}) : '') + '</div>';
    body += dd.lines.map(function (L, i) { return estLineHtml(d, L, i); }).join('');
    if (d.errors.lines) body += '<div class="svs-field-err" role="alert">' + esc(d.errors.lines) + '</div>';
    body += '<div id="svb-est-totals">' + totalsHtml(estimateFigures(dd.lines), { grand: t('t_est_total'), split: false, discount: false }) + '</div>';
    body += '<div class="svs-hint">' + esc(t('est_gst_note')) + '</div>';
    if (dd.changing && dd.approved) body += fld({ name: 'reason', label: t('est_reason'), value: dd.reason, max: 80, err: fieldErr(d, 'reason'), req: true });
    body += fld({ name: 'note', label: t('est_note'), value: dd.note, max: 80, enter: 'svb-est-save' });
    foot = footHtml(d, 'svb-est-save', t('est_save'), 'svb-est-cancel');
    return { title: t('est_title'), subHtml: esc(jobLabel()), wide: true, body: body, footer: foot };
  };
  function openEstimate() {
    var g = jobGate('buildEstimate');
    var j, e, data;
    if (g) return refuse(g);
    j = jobOfDialog();
    e = isObj(j.estimate) ? j.estimate : null;
    data = { lines: e ? estLinesOf(e).map(fromStoredLine) : [], note: '', reason: '', version: e ? estVersion(e) : 0, changing: !!e, approved: isObj(j.approval) };
    openDialog('estimate', data);
    return Promise.resolve({ ok: true });
  }
  function estAddLine(kind) {
    var d = S.dialog;
    if (!d || d.kind !== 'estimate') return { ok: true };
    dialogCapture();
    if (kind === 'OTHER' && !rights().addOtherLine) return fail('SVB_ROLE_DENIED');
    if (d.data.lines.length >= SBU_MAX_EST_LINES) { d.errors = { lines: SBU_ERR.SVB_TOO_MANY_LINES }; renderDialog(false); return fail('SVB_TOO_MANY_LINES'); }
    d.data.lines.push(blankLine(kind));
    d.dirty = true;
    d.errors = {};
    renderDialog(true);
    return { ok: true };
  }
  function estRemoveLine(key) {
    var d = S.dialog;
    var i = parseInt(key, 10);
    if (!d || !isInt(i) || !d.data.lines[i]) return { ok: true };
    dialogCapture();
    d.data.lines.splice(i, 1);
    d.dirty = true;
    d.errors = {};
    renderDialog(false);
    return { ok: true };
  }
  function validateEstimate(d) {
    var dd = d.data;
    var errors = {};
    var lines = [];
    var seen = {};
    var i, L, q, p, r, fig, bad;
    function le(n, code, extra) { errors['lines.' + i + '.' + n] = errText({ code: code, min: extra && extra.min, max: extra && extra.max }); bad = true; }
    if (!dd.lines.length) errors.lines = SBU_ERR.SVB_NO_LINES;
    if (dd.lines.length > SBU_MAX_EST_LINES) errors.lines = SBU_ERR.SVB_TOO_MANY_LINES;
    for (i = 0; i < dd.lines.length; i++) {
      L = dd.lines[i];
      q = parseQty(L.qty, { min: 1, max: L.kind === 'PART' ? 100000 : 999 });
      if (!q.ok) le('qty', 'SVB_QTY_INVALID', q);
      if (L.kind === 'OTHER') {
        if (!trim(L.name)) le('name', 'SVB_FIELD_REQUIRED');
        if (!/^(\d{4}|\d{6}|\d{8})$/.test(trim(L.hsn))) le('hsn', 'SVB_TAXCODE');
        r = parseRateBp(L.rate);
        if (!r.ok) le('rate', 'SVB_RATE');
        if (L.basis !== 'INCL' && L.basis !== 'EXCL') le('basis', 'SVB_BASIS');
        p = parsePaise(L.price);
        if (!p.ok) le('price', trim(L.price) === '0' || /^0+(\.0+)?$/.test(trim(L.price)) ? 'SVB_PRICE_ZERO' : 'SVB_MONEY_INVALID');
      } else {
        if (!L.picked || !L.code) le('search', 'SVB_PICK_REQUIRED');
        else {
          if (L.taxPending) le('search', 'SVB_TAX_MISSING');
          if (L.masterBasis === null && L.basis !== 'INCL' && L.basis !== 'EXCL') le('basis', 'SVB_BASIS');
          if (seen[L.kind + ':' + L.code]) le('search', 'SVB_DUP_LINE');
          seen[L.kind + ':' + L.code] = true;
        }
      }
      lines.push(L);
    }
    if (dd.changing && dd.approved && trim(dd.reason).length < 5) { errors.reason = SBU_ERR.SVB_REASON_SHORT; bad = true; }
    if (!errors.lines && !bad) {
      fig = estimateFigures(lines);
      if (fig && fig.totals.totalPaise <= 0) errors.lines = SBU_ERR.SVB_TOTAL_ZERO;
    }
    return { ok: Object.keys(errors).length === 0, errors: errors, figures: fig };
  }
  function estimatePayload(d) {
    var dd = d.data;
    return {
      jobId: S.jobId, note: trim(dd.note),
      reason: dd.changing && dd.approved ? trim(dd.reason) : '',
      lines: dd.lines.map(function (L) {
        var o;
        if (L.kind === 'OTHER') {
          return { kind: 'OTHER', name: trim(L.name), qty: parseQty(L.qty, { max: 999 }).qty, unitPricePaise: parsePaise(L.price).paise, priceBasis: L.basis, hsnSac: trim(L.hsn), rateBp: parseRateBp(L.rate).bp };
        }
        o = { kind: L.kind, code: L.code, qty: parseQty(L.qty, { max: L.kind === 'PART' ? 100000 : 999 }).qty };
        if (L.masterBasis === null) o.priceBasis = L.basis;
        return o;
      })
    };
  }
  function estSave() {
    var d = S.dialog;
    var g, v, payload;
    if (!d || d.kind !== 'estimate' || d.result) return Promise.resolve({ ok: true });
    dialogCapture();
    g = jobGate('buildEstimate');
    if (g) return refuse(g);
    v = validateEstimate(d);
    if (!v.ok) { setErrors(v.errors); toast(v.errors.lines || SBU_ERR.SVB_FIELD_REQUIRED); return Promise.resolve(fail('SVB_FIELD_REQUIRED')); }
    payload = estimatePayload(d);
    return exclusive(function () {
      return callB('saveEstimate', [payload, makeCtx(readSession(), null, d.clientRef)]).then(function (r) {
        var est, total, version, needs, appr;
        if (!r.ok) { showFailure(r); return r; }
        est = r.estimate || r.view || {};
        version = isInt(est.version) ? est.version : (isInt(r.version) ? r.version : (d.data.version + 1));
        total = estTotalOf(est);
        if (total === null) total = v.figures ? v.figures.totals.totalPaise : null;
        appr = jobOfDialog().approval;
        needs = typeof r.needsApproval === 'boolean' ? r.needsApproval : !(isObj(appr) && isInt(appr.amountPaise) && isInt(total) && total <= appr.amountPaise);
        toast(fill(t('est_saved'), { n: version, amount: money(total) }));
        d.result = { version: version, amountPaise: total, needs: needs };
        d.dirty = false;
        renderDialog(true);
        refreshJob();
        return r;
      });
    });
  }
  function searchMasters(kind, text, idx) {
    var c = storesCore();
    var q = trim(text);
    var s = readSession();
    var name = kind === 'LABOUR' ? 'listLabour' : 'listParts';
    var tok;
    S.pickTok += 1;
    tok = S.pickTok;
    if (!q || !c || typeof c[name] !== 'function') { showPicks(idx, kind, []); return; }
    Promise.resolve().then(function () { return c[name]({ text: q, active: 'true', state: 'all', offset: 0, limit: 50 }, makeCtx(s, null, '')); }).then(function (r) {
      if (tok !== S.pickTok) return;
      showPicks(idx, kind, r && r.ok ? rank(r.rows, q).filter(function (x) { return x.active !== false; }) : []);
    }, function () { showPicks(idx, kind, []); });
  }
  function rank(rows, text) {
    var q = trim(text).toLowerCase();
    var out = { a: [], b: [], c: [] };
    arr(rows).forEach(function (r) {
      var code = asText(r.code).toLowerCase();
      if (code === q) out.a.push(r);
      else if (code.indexOf(q) === 0) out.b.push(r);
      else if (code.indexOf(q) >= 0 || asText(r.name).toLowerCase().indexOf(q) >= 0) out.c.push(r);
    });
    return out.a.concat(out.b, out.c).slice(0, 8);
  }
  function showPicks(idx, kind, rows) {
    var box = S.layer ? qs(S.layer, '#svb-pick-' + idx) : null;
    var R = rights();
    S.picks[idx] = rows;
    if (!box) return;
    if (!rows.length) { setHtml(box, '<div class="svs-hint">' + esc(t('pick_none')) + '</div>'); return; }
    setHtml(box, '<div class="svs-pick" role="list">' + rows.map(function (r) {
      var pending = r.taxPending === true;
      var price = kind === 'LABOUR' ? r.ratePaise : r.sellPricePaise;
      return '<button type="button" class="svs-btn svs-pick-row" role="listitem" data-svcs-action="svb-est-pick" data-svs-key="' + attr(idx + '|' + r.code) + '"' + (pending ? ' disabled' : '') + '>' +
        '<b class="svs-code">' + esc(r.code) + '</b> ' + esc(r.name) + (kind === 'PART' && isInt(r.onHand) ? ' <span class="svs-dim">' + esc(t('on_hand')) + ' ' + num(r.onHand) + '</span>' : '') +
        (isInt(price) ? ' <span class="svs-dim">' + esc(money(price)) + '</span>' : '') + (pending ? ' ' + badge('warn', t('tax_pending')) : '') + '</button>' + (pending ? '<div class="svs-hint">' + esc(t('tax_pending_hint')) + '</div>' : '');
    }).join('') + (rows.some(function (r) { return r.taxPending === true; }) && (R.manager) ? btn('svb-job-stores-open', t('b_stores'), { cls: 'svs-btn-quiet' }) : '') + '</div>');
  }
  function pickMaster(key) {
    var d = S.dialog;
    var parts = asText(key).split('|');
    var i = parseInt(parts[0], 10);
    var rows, row, L;
    if (!d || d.kind !== 'estimate' || !d.data.lines[i]) return { ok: true };
    rows = arr(S.picks[i]);
    row = rows.filter(function (r) { return r.code === parts.slice(1).join('|'); })[0];
    if (!row) return fail('SVB_PICK_REQUIRED');
    if (row.taxPending === true) return fail('SVB_TAX_MISSING');
    dialogCapture();
    L = d.data.lines[i];
    L.code = row.code;
    L.name = row.name;
    L.search = row.code;
    L.hsn = asText(L.kind === 'LABOUR' ? row.sac : row.hsn);
    L.rateBp = isInt(row.gstRateBp) ? row.gstRateBp : null;
    L.masterPaise = L.kind === 'LABOUR' ? (isInt(row.ratePaise) ? row.ratePaise : null) : (isInt(row.sellPricePaise) ? row.sellPricePaise : null);
    L.masterBasis = row.priceIncludesTax === true ? 'INCL' : (row.priceIncludesTax === false ? 'EXCL' : null);
    L.basis = L.masterBasis === null ? '' : L.masterBasis;
    L.picked = true;
    L.taxPending = false;
    d.dirty = true;
    d.errors = {};
    renderDialog(false);
    return { ok: true };
  }

  /* ---- approval ---- */

  function istHm(ms) { return new Date(ms + 19800000).toISOString().slice(11, 16); }
  DIALOGS.approval = function (d) {
    var dd = d.data;
    var body, foot;
    if (d.result) {
      return { title: t('appr_title'), subHtml: esc(jobLabel()), body: notice('ok', fill(t('appr_saved'), { n: d.result.version, amount: money(d.result.amountPaise) })), footer: btn('svb-appr-cancel', t('done'), { cls: 'svs-btn-primary' }) };
    }
    body = '<div class="svb-ro">' + esc(fill(t('appr_version'), { n: dd.version, amount: money(dd.amountPaise) })) + '</div>' +
      fld({ name: 'method', label: t('appr_how'), kind: 'select', value: dd.method, options: SBU_METHODS.map(function (m) { return { v: m.v, l: t(m.l) }; }) }) +
      fld({ name: 'takenBy', label: t('appr_by'), value: dd.takenBy, max: 40, err: fieldErr(d, 'takenBy'), req: true, focus: true }) +
      fld({ name: 'date', label: t('appr_date'), kind: 'date', value: dd.date, err: fieldErr(d, 'date') }) +
      fld({ name: 'time', label: t('appr_time'), kind: 'time', value: dd.time, err: fieldErr(d, 'time') }) +
      '<div class="svb-ro">' + esc(t('appr_amount')) + ': ' + esc(money(dd.amountPaise)) + '</div>' +
      fld({ name: 'evidence', label: t('appr_evidence'), value: dd.evidence, max: 60, err: fieldErr(d, 'evidence') }) +
      fld({ name: 'note', label: t('appr_note'), value: dd.note, max: 80 }) +
      fld({ name: 'tick', label: fill(t('appr_tick'), { amount: money(dd.amountPaise) }), kind: 'check', value: dd.tick, err: fieldErr(d, 'tick'), enter: 'svb-appr-save' });
    foot = footHtml(d, 'svb-appr-save', t('appr_save'), 'svb-appr-cancel');
    return { title: t('appr_title'), subHtml: esc(jobLabel()), body: body, footer: foot };
  };
  function openApprovalDialog() {
    var g = jobGate('recordApproval');
    var j, e, ms;
    if (g) return refuse(g);
    j = jobOfDialog();
    e = isObj(j.estimate) ? j.estimate : null;
    if (!e) return openEstimate();
    ms = nowMs();
    openDialog('approval', { method: 'IN_PERSON', takenBy: readSession().actorName, date: istDay(nowIso()), time: istHm(ms), date0: istDay(nowIso()), time0: istHm(ms), evidence: '', note: '', tick: false, version: estVersion(e), amountPaise: estTotalOf(e) });
    return Promise.resolve({ ok: true });
  }
  function apprSave() {
    var d = S.dialog;
    var dd, errors, g, at, ms, now, payload, method;
    if (!d || d.kind !== 'approval' || d.result) return Promise.resolve({ ok: true });
    dialogCapture();
    dd = d.data;
    errors = {};
    g = jobGate('recordApproval');
    if (g) return refuse(g);
    now = nowMs();
    if (!trim(dd.takenBy)) errors.takenBy = SBU_ERR.SVB_FIELD_REQUIRED;
    if (!validIso(dd.date)) errors.date = SBU_ERR.SVB_FIELD_REQUIRED;
    else if (dd.date > istDay(nowIso())) errors.date = SBU_ERR.SVB_DATE_FUTURE;
    else if (dd.date < dayShift(istDay(nowIso()), -SBU_APPROVAL_DAYS)) errors.date = SBU_ERR.SVB_DATE_OLD;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(asText(dd.time))) errors.time = SBU_ERR.SVB_TIME_INVALID;
    if (!errors.date && !errors.time) {
      ms = Date.parse(dd.date + 'T' + dd.time + ':00+05:30');
      if (!isFinite(ms)) errors.time = SBU_ERR.SVB_TIME_INVALID;
      else if (ms > now) errors.date = SBU_ERR.SVB_DATE_FUTURE;
      else if (now - ms > SBU_APPROVAL_DAYS * 86400000) errors.date = SBU_ERR.SVB_DATE_OLD;
    }
    if (dd.method === 'OTHER' && trim(dd.evidence).length < 3) errors.evidence = SBU_ERR.SVB_FIELD_REQUIRED;
    if (dd.tick !== true) errors.tick = fill(SBU_ERR.SVB_CONFIRM_TICK, {});
    if (Object.keys(errors).length) { setErrors(errors); toast(errors.tick || SBU_ERR.SVB_FIELD_REQUIRED); return Promise.resolve(fail('SVB_FIELD_REQUIRED')); }
    at = new Date(ms).toISOString();
    method = selectedOption(SBU_METHODS, dd.method);
    payload = { jobId: S.jobId, version: dd.version, method: method.v, takenByName: trim(dd.takenBy), approvedAt: at, evidence: trim(dd.evidence), amountPaise: dd.amountPaise, note: trim(dd.note) };
    // Stage E round 4 (R-flows-1): a date and time left as offered mean "now", to the second (never before the estimate just saved)
    if (dd.date === dd.date0 && dd.time === dd.time0) delete payload.approvedAt;
    return exclusive(function () {
      return callB('recordApproval', [payload, makeCtx(readSession(), null, d.clientRef)]).then(function (r) {
        if (!r.ok) { showFailure(r); return r; }
        toast(fill(t('appr_saved'), { n: dd.version, amount: money(dd.amountPaise) }));
        d.result = { version: dd.version, amountPaise: dd.amountPaise };
        d.dirty = false;
        hostCall(['setLegacyApproval', 'setCaseApproval'], [S.jobId, { at: at, via: method.via, by: trim(dd.takenBy), amount: Number(rupeeText(dd.amountPaise)) }], t('legacy_fail'));
        renderDialog(true);
        refreshJob();
        return r;
      });
    });
  }
  /* A page helper that mirrors a result onto the old job sheet; a failure is shown, never hidden, and never undoes the record. */
  function hostCall(names, args, failText) {
    var i;
    for (i = 0; H && i < names.length; i++) {
      if (typeof H[names[i]] === 'function') {
        try { H[names[i]].apply(H, args); } catch (e) { toast(failText || fill(SBU_ERR.SVB_INTERNAL, { code: 'SVB_INTERNAL' })); }
        return true;
      }
    }
    return false;
  }

  /* ---- receipts (advance, balance, counter sale) ---- */

  DIALOGS.receipt = function (d) {
    var dd = d.data;
    var body, foot, ctx, amt, est, titleKey, sub;
    titleKey = dd.mode === 'balance' ? 'r_balance' : (dd.mode === 'counter' ? 'r_counter' : 'r_advance');
    /* a counter sale belongs to no job: no job label under its title */
    sub = dd.mode === 'counter' ? '' : esc(jobLabel());
    if (d.result) {
      body = notice('ok', fill(t('r_saved'), { no: d.result.no, amount: money(d.result.amountPaise), mode: d.result.payMode }));
      if (d.result.posted === true) body += notice('ok', t('r_posted'));
      else if (d.result.posted === false) body += notice('warn', t('r_not_posted'));
      return { title: t(titleKey), subHtml: sub, body: body, footer: resultFoot([btn('svb-rcpt-print', t('b_print_receipt'), { key: d.result.no, cls: 'svs-btn-primary' }), btn('svb-rcpt-done', t('done'), { cls: 'svs-btn-quiet' })]) };
    }
    if (dd.mode === 'balance') ctx = fill(t('r_ctx_bal'), { no: dd.billNo, amount: money(dd.totalPaise), paid: money(dd.paidPaise), due: money(dd.duePaise) });
    else if (dd.mode === 'counter') ctx = fill(t('r_ctx_sale'), { no: dd.saleNo, amount: money(dd.saleAmount) });
    else ctx = fill(t('r_ctx_adv'), { amount: money(dd.estimatePaise), held: money(dd.heldPaise) });
    body = '<div class="svs-dim">' + esc(ctx) + '</div>';
    body += fld({ name: 'amount', label: t('r_amount'), value: dd.amount, max: 12, mode: 'decimal', ph: '0.00', err: fieldErr(d, 'amount'), req: true, focus: dd.mode !== 'counter', ro: dd.mode === 'counter' });
    if (dd.mode === 'balance') body += btn('svb-rcpt-fill-due', t('r_fill_due'), { cls: 'svs-btn-quiet' });
    amt = parsePaise(dd.amount, { allowZero: true });
    est = dd.mode === 'advance' && amt.ok && isInt(dd.estimatePaise) && amt.paise > dd.estimatePaise;
    if (est) body += notice('warn', t('r_over_est'));
    body += payFields(d, true);
    body += '<div class="svb-ro">' + esc(t('r_on')) + ': ' + esc(fill(t('r_today'), { date: today() })) + '</div>';
    body += fld({ name: 'note', label: t('r_note'), value: dd.note, max: 60, enter: 'svb-rcpt-save' });
    foot = footHtml(d, 'svb-rcpt-save', t('r_save'), 'svb-rcpt-cancel');
    return { title: t(titleKey), subHtml: sub, body: body, footer: foot };
  };
  function openReceipt(mode, o) {
    var gate = mode === 'counter' ? writeGate(null) : jobGate('takeReceipt');
    if (gate) return refuse(gate);
    if (mode === 'counter') {
      openDialog('receipt', { mode: 'counter', saleNo: o.saleNo, saleAmount: o.amountPaise, amount: rupeeText(o.amountPaise), payMode: 'Cash', payRef: '', note: '' });
      return Promise.resolve({ ok: true });
    }
    return withFreshJob(function (j) {
      var b = activeBill(j);
      var typed = S.job && S.job.cj && isInt(S.job.cj.typedAdvancePaise) ? S.job.cj.typedAdvancePaise : 0;
      var due = isInt(j.duePaise) ? j.duePaise : 0;
      var held = isInt(j.heldPaise) ? j.heldPaise : 0;
      var g = jobGate('takeReceipt');
      if (g) return refuse(g);
      if (mode === 'balance' && (!b || due <= 0)) return refuse(fail('NOTHING_DUE'));
      openDialog('receipt', {
        mode: mode, amount: mode === 'advance' && typed > 0 && held === 0 ? rupeeText(typed) : '', payMode: 'Cash', payRef: '', note: '', billNo: billNoOf(b), totalPaise: billTotalOf(b),
        paidPaise: isInt(j.paidPaise) ? j.paidPaise : 0, duePaise: due, heldPaise: held, estimatePaise: isObj(j.estimate) ? estTotalOf(j.estimate) : null
      });
      return { ok: true };
    });
  }
  function rcptSave() {
    var d = S.dialog;
    var dd, errors, p, ref, g, payload, call;
    if (!d || d.kind !== 'receipt' || d.result) return Promise.resolve({ ok: true });
    dialogCapture();
    dd = d.data;
    errors = {};
    g = dd.mode === 'counter' ? writeGate(null) : jobGate('takeReceipt');
    if (g) return refuse(g);
    p = parsePaise(dd.amount);
    if (!p.ok) errors.amount = SBU_ERR.SVB_MONEY_INVALID;
    else if (dd.mode === 'balance' && p.paise > dd.duePaise) errors.amount = fill(SBU_ERR.SVB_OVER_DUE, { amount: money(dd.duePaise) });
    else if (dd.mode === 'counter' && p.paise !== dd.saleAmount) errors.amount = SBU_ERR.SVB_MONEY_INVALID;
    ref = checkPay(dd, errors);
    if (Object.keys(errors).length) { setErrors(errors); toast(errors.amount || errors.payRef); return Promise.resolve(fail('SVB_FIELD_REQUIRED')); }
    if (dd.mode === 'counter') { call = 'takeCounterReceipt'; payload = { saleNo: dd.saleNo, amountPaise: p.paise, payMode: dd.payMode, payRef: ref, note: trim(dd.note) }; }
    else { call = 'takeReceipt'; payload = { jobId: S.jobId, kind: dd.mode, amountPaise: p.paise, payMode: dd.payMode, payRef: ref, note: trim(dd.note) }; }
    return exclusive(function () {
      return callB(call, [payload, makeCtx(readSession(), null, d.clientRef)]).then(function (r) {
        var rc;
        if (!r.ok) { showFailure(r); return r; }
        rc = r.receipt || r.doc || r.view || {};
        d.result = { no: asText(pick(rc, ['no']) || pick(r, ['no'])), amountPaise: p.paise, payMode: dd.payMode, posted: typeof r.posted === 'boolean' ? r.posted : (typeof rc.posted === 'boolean' ? rc.posted : undefined) };
        d.dirty = false;
        toast(fill(t('r_saved_toast'), { no: d.result.no }));
        renderDialog(true);
        refreshJob();
        return r;
      });
    });
  }

  /* ---- bill ---- */

  function billLinesOf(draft) {
    var out = [];
    arr(draft.parts).forEach(function (x) { out.push({ group: 'parts', code: asText(pick(x, ['partCode', 'code'])), name: asText(pick(x, ['name', 'description', 'desc'])), qty: x.qty, discount: rupeeText(isInt(x.discountPaise) ? x.discountPaise : 0), unit: pick(x, ['unitPricePaise']), raw: x }); });
    arr(draft.labour).forEach(function (x) { out.push({ group: 'labour', code: asText(pick(x, ['code', 'labourCode'])), name: asText(pick(x, ['name', 'description', 'desc'])), qty: x.qty, discount: rupeeText(isInt(x.discountPaise) ? x.discountPaise : 0), unit: pick(x, ['unitPricePaise']), raw: x }); });
    arr(draft.other).forEach(function (x) { out.push({ group: 'other', code: '', name: asText(pick(x, ['name', 'description'])), qty: x.qty, discount: rupeeText(isInt(x.discountPaise) ? x.discountPaise : 0), unit: pick(x, ['unitPricePaise']), raw: x }); });
    return out;
  }
  function listText(v) {
    return arr(v).map(function (x) { return isObj(x) ? asText(pick(x, ['code', 'name', 'partCode'])) + (isInt(x.qty) ? ' x ' + x.qty : '') : asText(x); }).join(', ');
  }
  function stateOptions() {
    return Object.keys(SBU_STATES).map(function (k) { return { v: k, l: k + ' ' + SBU_STATES[k] }; });
  }
  function zeroOk(text) { return trim(text) === '' ? { ok: true, paise: 0 } : parsePaise(text, { allowZero: true }); }
  function discountSum(dd) {
    var sum = 0;
    var p;
    dd.lines.forEach(function (L) { p = zeroOk(L.discount); if (p.ok) sum += p.paise; });
    p = zeroOk(dd.billDiscount);
    if (p.ok) sum += p.paise;
    return sum;
  }
  // A figure of the bill preview that is not there yet ("Calculating...") or could not be worked out ("not available"); never "-".
  function pvWait(d) { return d.data.pvFailed ? t('pv_na') : t('pv_wait'); }
  // One bill line: name, quantity, rate and line amount, all from the bill layer's preview (the screen does no money arithmetic).
  function billLineText(d, L, pl) {
    // the name the screen already knows stays (a refused preview never blanks it); the rate says whether it includes GST,
    // from the bill layer's own priceBasis, never guessed
    var nm = asText(pick(pl, ['name', 'description'])) || L.name;
    var rk = pl.priceBasis === 'INCL' ? 'bill_rate_incl' : (pl.priceBasis === 'EXCL' ? 'bill_rate_excl' : 'bill_rate');
    return (L.code ? L.code + ' ' : '') + nm + ', ' + fill(t('bill_qty'), { n: L.qty }) + ', ' + fill(t(rk), { amount: isInt(pl.unitPricePaise) ? money(pl.unitPricePaise) : pvWait(d) }) +
      ', ' + t('f_line_total') + ' ' + (isInt(pl.totalPaise) ? money(pl.totalPaise) : pvWait(d));
  }
  function mna(v) { return isInt(v) ? money(v) : t('pv_na'); }
  // Stage E round 5 (F-1): a refused preview keeps the last accepted figures on screen, says why, and says what the figures are
  function pvRefusalHtml(d, strict) {
    var r = d.data.pvRefused;
    var code = r && r.code ? String(r.code) : '';
    var disc = SBU_LIMIT_CODES[code] === 1 || /^DISCOUNT_/.test(code);
    if (!r) return '';
    return '<div class="svs-alert svb-pv-msg" role="status">' + esc(errText(r) + (!strict && d.data.preview ? ' ' + t(disc ? 'pv_without_disc' : 'pv_before_change') : '')) + '</div>';
  }
  function previewTotalsHtml(d, strict) {
    var pv = strict && d.data.pvRefused ? null : d.data.preview;
    var tt = pv && pv.totals;
    var rows = pvRefusalHtml(d, strict);
    function row(label, v, grand) { return '<div class="svb-totals-row' + (grand ? ' svb-totals-grand' : '') + '"><span class="svb-row-label">' + esc(label) + '</span><span class="svb-row-value">' + esc(isInt(v) ? money(v) : (strict && d.data.pvRefused ? t('pv_na') : pvWait(d))) + '</span></div>'; }
    // Stage E round 4 (R-flows-2): the box keeps its id before the first preview, so the preview can fill it in the edit view
    if (!tt) return '<div class="svb-totals" id="svb-bill-totals">' + rows + row(t('t_bill_total'), null, true) + '</div>';
    rows += row(t('t_taxable'), tt.taxablePaise);
    if (isInt(tt.igstPaise) && tt.igstPaise > 0) rows += row(t('t_igst'), tt.igstPaise); else rows += row(t('t_cgst'), tt.cgstPaise) + row(t('t_sgst'), tt.sgstPaise);
    rows += row(t('t_discount'), (tt.lineDiscountPaise || 0) + (tt.billDiscountPaise || 0)) + row(t('t_roundoff'), tt.roundOffPaise) + row(t('t_bill_total'), tt.totalPaise, true);
    rows += row(t('t_setoff'), pv.setOff && isInt(pv.setOff.advancePaise) ? pv.setOff.advancePaise : 0) + row(t('t_balance'), isInt(pv.balanceDuePaise) ? pv.balanceDuePaise : null, true);
    return '<div class="svb-totals" id="svb-bill-totals">' + rows + '</div>';
  }
  DIALOGS.bill = function (d) {
    var dd = d.data;
    var R = rights();
    var body = '';
    var foot, pvLines, notes, pvr;
    if (d.result) {
      body = notice('ok', fill(t('bill_done'), { no: d.result.no, amount: money(d.result.balance) }));
      return {
        title: t('bill_title'), subHtml: esc(jobLabel()), wide: true, body: body,
        footer: resultFoot([btn('svb-bill-print', dd.notIn ? t('b_print_tax') : t('b_print_bill'), { key: d.result.no, cls: 'svs-btn-primary' }), isInt(d.result.balance) && d.result.balance > 0 ? btn('svb-job-balance-open', t('b_balance'), {}) : '', btn('svb-bill-done', t('done'), { cls: 'svs-btn-quiet' })])
      };
    }
    if (dd.loading) return { title: t('bill_title'), subHtml: esc(jobLabel()), wide: true, body: '<div class="svs-dim" role="status">' + esc(t('loading')) + '</div>', footer: btn('svb-bill-cancel', t('cancel'), { cls: 'svs-btn-quiet' }) };
    if (dd.view === 'review') {
      // Stage E round 5: the review never shows figures of an older preview; after a refusal it says why and "not available"
      pvr = dd.pvRefused ? null : dd.preview;
      body = '<div class="svb-result">' + esc(fill(t('bill_review_line'), { job: S.jobId, k: dd.lines.length, amount: mna(pvr && pvr.totals ? pvr.totals.totalPaise : null), disc: money(discountSum(dd)), adv: mna(pvr && pvr.setOff ? pvr.setOff.advancePaise : 0), bal: mna(pvr ? pvr.balanceDuePaise : null), ccpt: dd.notIn ? '-' : trim(dd.ccpt) })) + '</div>' + previewTotalsHtml(d, true);
      if (dd.notIn) body += notice('info', t('bill_not_ccpt'));
      foot = footHtml(d, 'svb-bill-save', t('b_bill'), 'svb-bill-back', { cancelLabel: t('back'), extra: (d.askOwner || d.needOverride) ? btn('svb-bill-ask-owner', t('bill_ask_owner'), { cls: 'svs-btn-gold' }) + ' ' : '' });
      return { title: t('bill_title'), subHtml: esc(jobLabel()), wide: true, body: body, footer: foot };
    }
    notes = '';
    if (arr(dd.leftOff).length) notes += notice('warn', fill(t('bill_left_off'), { list: listText(dd.leftOff) }));
    if (arr(dd.notOnEstimate).length) notes += notice('warn', fill(t('bill_not_on_est'), { list: listText(dd.notOnEstimate) }));
    body = notes;
    pvLines = dd.preview && Array.isArray(dd.preview.lines) ? dd.preview.lines : [];
    dd.lines.forEach(function (L, i) {
      var pl = pvLines[i] || {};
      var grid = '<div class="svb-ro" id="svb-bill-ln-' + i + '">' + esc(billLineText(d, L, pl)) + '</div>';
      if (R.giveDiscount) grid += fld({ name: 'discount', label: t('f_discount'), value: L.discount, max: 12, mode: 'decimal', line: i, err: d.errors['lines.' + i + '.discount'] || '' });
      body += '<div class="svb-line"><div class="svb-line-grid">' + grid + '</div></div>';
    });
    if (R.giveDiscount) {
      body += fld({ name: 'billDiscount', label: t('bill_discount'), value: dd.billDiscount, max: 12, mode: 'decimal', err: fieldErr(d, 'billDiscount') });
      body += fld({ name: 'discountReason', label: t('bill_disc_reason'), value: dd.discountReason, max: 80, err: fieldErr(d, 'discountReason') });
    }
    body += fld({ name: 'hasGst', label: t('bill_cust'), kind: 'check', value: dd.hasGst });
    if (dd.hasGst) {
      body += fld({ name: 'gstin', label: t('bill_gstin'), value: dd.gstin, max: 15, caps: true, err: fieldErr(d, 'gstin'), req: true }) +
        fld({ name: 'state', label: t('bill_state'), kind: 'select', value: dd.state, options: stateOptions(), err: fieldErr(d, 'state') });
    }
    if (R.markNotBilledCcpt) body += fld({ name: 'notIn', label: t('bill_not_ccpt_tick'), kind: 'check', value: dd.notIn });
    if (dd.notIn) body += '<div class="svs-hint">' + esc(t('bill_not_ccpt_hint')) + '</div>' + notice('info', t('bill_not_ccpt')) + fld({ name: 'notInReason', label: t('bill_not_ccpt_reason'), value: dd.notInReason, max: 80, err: fieldErr(d, 'notInReason'), req: true });
    else body += fld({ name: 'ccpt', label: t('bill_ccpt'), value: dd.ccpt, max: 40, hint: t('bill_ccpt_hint'), err: fieldErr(d, 'ccpt'), req: true });
    if (d.needOverride) body += fld({ name: 'override', label: t('bill_override'), value: dd.override, max: 80, err: fieldErr(d, 'override'), req: true });
    body += previewTotalsHtml(d);
    foot = footHtml(d, 'svb-bill-review', t('bill_review'), 'svb-bill-cancel', { extra: (d.askOwner || d.needOverride) ? btn('svb-bill-ask-owner', t('bill_ask_owner'), { cls: 'svs-btn-gold' }) + ' ' : '' });
    return { title: t('bill_title'), subHtml: esc(jobLabel()), wide: true, body: body, footer: foot };
  };
  function startBill(jobId, notIn) {
    var g = jobGate(notIn ? 'markNotBilledCcpt' : 'issueBill');
    var s = readSession();
    var d;
    if (g) return refuse(g);
    S.jobId = asText(jobId) || S.jobId;
    d = openDialog('bill', { loading: true, view: 'edit', lines: [], billDiscount: '', discountReason: '', hasGst: false, gstin: '', state: SBU_SELLER_STATE, ccpt: '', notIn: notIn === true, notInReason: '', override: '', note: '', preview: null, draft: null });
    callB('prepareBill', [S.jobId, makeCtx(s, null, '')]).then(function (r) {
      var draft, jb;
      if (S.dialog !== d) return;
      if (!r.ok) { closeDialog(); showFailure(r); return; }
      // Stage E (D-gaps-1): the bill layer answers with the lines under input
      draft = isObj(r.draft) ? r.draft : (isObj(r.input) ? r.input : r);
      d.data.loading = false;
      d.data.draft = draft;
      d.data.lines = billLinesOf(draft);
      d.data.leftOff = draft.leftOff || r.leftOff;
      d.data.notOnEstimate = draft.notOnEstimate || r.notOnEstimate;
      if (asText(draft.ccptSuggestion)) d.data.ccpt = asText(draft.ccptSuggestion);
      jb = jobOfDialog();
      if (isObj(jb.bill) && isNotInCcpt(jb.bill)) d.data.notIn = true;
      renderDialog(true);
      billPreview();
    });
    return true;
  }
  function billPayload(dd) {
    var parts = [];
    var labour = [];
    var other = [];
    dd.lines.forEach(function (L) {
      var disc = zeroOk(L.discount);
      var dp = disc.ok ? disc.paise : 0;
      if (L.group === 'parts') parts.push({ partCode: L.code, qty: L.qty, discountPaise: dp });
      else if (L.group === 'labour') labour.push({ code: L.code, qty: L.qty, discountPaise: dp });
      else other.push({ name: L.name, qty: L.qty, unitPricePaise: L.unit, priceBasis: asText(L.raw.priceBasis), hsnSac: asText(L.raw.hsnSac), rateBp: L.raw.rateBp, discountPaise: dp });
    });
    var bd = zeroOk(dd.billDiscount);
    var gst = dd.hasGst === true ? asText(dd.gstin).toUpperCase().replace(/\s+/g, '') : '';
    return {
      jobId: S.jobId, parts: parts, labour: labour, other: other, billDiscountPaise: bd.ok ? bd.paise : 0, discountReason: trim(dd.discountReason),
      recipientGstin: gst, recipientStateCode: dd.hasGst === true ? asText(dd.state) : SBU_SELLER_STATE, mode: dd.notIn === true ? 'NOT_IN_CCPT' : 'CCPT_BILLED',
      notInCcptReason: dd.notIn === true ? trim(dd.notInReason) : '', ccptInvoiceNo: dd.notIn === true ? '' : trim(dd.ccpt), approvalOverrideReason: trim(dd.override), note: trim(dd.note)
    };
  }
  /* Ask the facade for the live figures; the latest answer wins. */
  function billPreview() {
    var d = S.dialog;
    var tok;
    if (!d || d.kind !== 'bill' || d.data.loading) return Promise.resolve();
    S.prevTok += 1;
    tok = S.prevTok;
    return callB('previewBill', [billPayload(d.data), makeCtx(readSession(), null, '')]).then(function (r) {
      var box;
      if (tok !== S.prevTok || S.dialog !== d) return;
      // Stage E round 5 (F-1): a refusal keeps the last accepted preview (labelled) and its line names; no figures at all says "not available"
      if (r.ok) {
        d.data.preview = r;
        d.data.pvRefused = null;
        d.data.lines.forEach(function (L, i) { var nm = Array.isArray(r.lines) && r.lines[i] ? asText(pick(r.lines[i], ['name', 'description'])) : ''; if (nm) L.name = nm; });
      } else d.data.pvRefused = r;
      d.data.pvFailed = !d.data.preview;
      box = S.layer ? qs(S.layer, '#svb-bill-totals') : null;
      if (box && d.data.view !== 'review') {
        box.innerHTML = previewTotalsHtml(d).replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '');
        // the line rows follow the same answer (name, rate, line amount), without redrawing the fields being typed in
        d.data.lines.forEach(function (L, i) {
          var el = qs(S.layer, '#svb-bill-ln-' + i);
          if (el) el.innerHTML = esc(billLineText(d, L, (d.data.preview && Array.isArray(d.data.preview.lines) ? d.data.preview.lines[i] : null) || {}));
        });
      } else if (d.data.view === 'review') renderDialog(false);
    });
  }
  function validateBill(d) {
    var dd = d.data;
    var errors = {};
    var c = calcLib();
    var gst, v, anyDisc, p;
    dd.lines.forEach(function (L, i2) {
      p = zeroOk(L.discount);
      if (!p.ok) errors['lines.' + i2 + '.discount'] = SBU_ERR.SVB_MONEY_INVALID;
      else if (isInt(L.unit) && isInt(L.qty) && p.paise > L.unit * L.qty) errors['lines.' + i2 + '.discount'] = SBU_ERR.SVB_DISCOUNT_BIG;
    });
    p = zeroOk(dd.billDiscount);
    if (!p.ok) errors.billDiscount = SBU_ERR.SVB_MONEY_INVALID;
    anyDisc = discountSum(dd) > 0;
    if (anyDisc && trim(dd.discountReason).length < 5) errors.discountReason = SBU_ERR.SVB_REASON_SHORT;
    if (dd.hasGst) {
      gst = asText(dd.gstin).toUpperCase().replace(/\s+/g, '');
      v = c && typeof c.validateGstin === 'function' ? c.validateGstin(gst) : null;
      if (!/^[0-9]{2}[A-Z0-9]{13}$/.test(gst) || (v && v.ok !== true)) errors.gstin = SBU_ERR.SVB_GSTIN;
      else if (gst.slice(0, 2) !== dd.state) errors.state = SBU_ERR.SVB_STATE_MISMATCH;
    }
    if (dd.notIn) { if (trim(dd.notInReason).length < 5) errors.notInReason = SBU_ERR.SVB_REASON_SHORT; }
    else if (!trim(dd.ccpt)) errors.ccpt = SBU_ERR.SVB_CCPT_REQUIRED;
    if (d.needOverride && trim(dd.override).length < 5) errors.override = SBU_ERR.SVB_REASON_SHORT;
    return errors;
  }
  function billReview() {
    var d = S.dialog;
    var errors, g;
    if (!d || d.kind !== 'bill' || d.data.loading) return Promise.resolve({ ok: true });
    dialogCapture();
    g = jobGate(d.data.notIn ? 'markNotBilledCcpt' : 'issueBill');
    if (g) return refuse(g);
    errors = validateBill(d);
    if (Object.keys(errors).length) { setErrors(errors); toast(errors.ccpt || errors.gstin || errors.discountReason || SBU_ERR.SVB_FIELD_REQUIRED); return Promise.resolve(fail('SVB_FIELD_REQUIRED')); }
    d.errors = {};
    return billPreview().then(function () {
      if (S.dialog !== d) return { ok: true };
      d.data.view = 'review';
      renderDialog(true);
      return { ok: true };
    });
  }
  function billBack() {
    var d = S.dialog;
    if (!d || d.kind !== 'bill') return { ok: true };
    d.data.view = 'edit';
    renderDialog(true);
    return { ok: true };
  }
  /* Issue the bill. forcePin repeats it through the Owner PIN after the facade asked for one. */
  function billSave(forcePin) {
    var d = S.dialog;
    var dd, payload, limit, sum, needPin, label, work, errors, g;
    if (!d || d.kind !== 'bill' || d.result || d.data.loading) return Promise.resolve({ ok: true });
    dialogCapture();
    dd = d.data;
    g = jobGate(dd.notIn ? 'markNotBilledCcpt' : 'issueBill');
    if (g) return refuse(g);
    errors = validateBill(d);
    if (Object.keys(errors).length) { d.data.view = 'edit'; setErrors(errors); return Promise.resolve(fail('SVB_FIELD_REQUIRED')); }
    payload = billPayload(dd);
    limit = isInt(S.cfg.discountLimitPaise) ? S.cfg.discountLimitPaise : 0;
    sum = discountSum(dd);
    needPin = forcePin === true || sum > limit || dd.notIn === true || (d.needOverride === true && trim(dd.override) !== '');
    if (dd.notIn) label = fill(t('pin_notccpt'), { job: S.jobId });
    else if (d.needOverride) label = fill(t('pin_override'), { job: S.jobId, amount: money(dd.preview && dd.preview.totals ? dd.preview.totals.totalPaise : null) });
    else label = fill(t('pin_discount'), { amount: money(sum), job: S.jobId, limit: money(limit) });
    work = function (ctx) {
      return callB('issueBill', [payload, ctx]).then(function (r) {
        var inv, no;
        if (!r.ok) {
          if (SBU_LIMIT_CODES[r.code] === 1) d.askOwner = true;
          if (SBU_OVERRIDE_CODES[r.code] === 1) { d.needOverride = true; d.data.view = 'edit'; }
          showFailure(r);
          return r;
        }
        inv = r.invoice || r.bill || r.view || {};
        no = billNoOf(inv) || asText(r.no);
        d.result = { no: no, balance: isInt(inv.balanceDuePaise) ? inv.balanceDuePaise : (isInt(r.balanceDuePaise) ? r.balanceDuePaise : null) };
        if (d.result.balance === null && dd.preview) d.result.balance = dd.preview.balanceDuePaise;
        d.dirty = false;
        hostCall(['setLegacyInvoiceNo', 'setCaseInvoice'], [S.jobId, no], null);
        toast(fill(t('bill_done'), { no: no, amount: money(d.result.balance) }));
        renderDialog(true);
        refreshJob();
        return r;
      });
    };
    return exclusive(function () {
      if (!needPin) return work(makeCtx(readSession(), null, d.clientRef));
      return ownerStep(label, work, d.clientRef).then(function (r) { if (!r.ok && !r.detail && (r.code === 'SVB_PIN_DENIED' || r.code === 'SVB_OWNER_ONLY' || r.code === 'SVB_ROLE_DENIED')) showFailure(r); return r; });
    });
  }

  /* ---- add a CCPT number ---- */

  /* Adding a number to a bill that has none: billing staff, no PIN. Changing a number already there: Owner, reason, Owner PIN (plan 2.11). */
  DIALOGS.ccpt = function (d) {
    var ch = d.data.change === true;
    var body = '<div class="svs-dim">' + esc(d.data.billNo) + (ch ? ' - ' + esc(fill(t('cc_now'), { no: d.data.was })) : '') + '</div>' +
      fld({ name: 'ccpt', label: t('bill_ccpt'), value: d.data.ccpt, max: 40, hint: t('bill_ccpt_hint'), err: fieldErr(d, 'ccpt'), req: true, focus: true, enter: ch ? '' : 'svb-cc-save' }) +
      (ch ? fld({ name: 'reason', label: t('cc_reason'), value: d.data.reason, max: 80, err: fieldErr(d, 'reason'), req: true, enter: 'svb-cc-change-save' }) : '');
    return { title: t(ch ? 'cc_change_title' : 'cc_title'), subHtml: esc(jobLabel()), body: body,
      footer: ch ? footHtml(d, 'svb-cc-change-save', t('cc_save'), 'svb-cc-cancel', { danger: true }) : footHtml(d, 'svb-cc-save', t('cc_save'), 'svb-cc-cancel') };
  };
  function openCcpt(change) {
    var g = jobGate(change ? 'changeCcpt' : 'addCcptNo');
    var b, was;
    if (g) return refuse(g);
    b = activeBill(jobOfDialog());
    if (!b) return refuse(fail('SVB_JOB_UNKNOWN'));
    was = asText(b.ccptInvoiceNo);
    if (!change && was) return openCcpt(true);
    openDialog('ccpt', change ? { billNo: billNoOf(b), ccpt: was, was: was, reason: '', change: true } : { billNo: billNoOf(b), ccpt: '' });
    return Promise.resolve({ ok: true });
  }
  /* Change: Owner, reason, Owner PIN. The add save below never writes on a change dialog. */
  function ccptChangeSave() {
    var d = S.dialog;
    var v, rs;
    if (!d || d.kind !== 'ccpt' || d.data.change !== true) return Promise.resolve({ ok: true });
    dialogCapture();
    v = trim(d.data.ccpt);
    rs = trim(d.data.reason);
    if (!v) { setErrors({ ccpt: SBU_ERR.SVB_CCPT_REQUIRED }); return Promise.resolve(fail('SVB_CCPT_REQUIRED')); }
    if (rs.length < 5) { setErrors({ reason: SBU_ERR.SVB_REASON_SHORT }); return Promise.resolve(fail('SVB_FIELD_REQUIRED')); }
    return ownerWrite(d, 'changeCcpt', fill(t('pin_ccpt'), { bill: d.data.billNo, was: d.data.was, now: v }), function (ctx) {
      return callB('addCcptNumber', [{ invoiceNo: d.data.billNo, ccptInvoiceNo: v, reason: rs }, ctx]);
    }, function () { closeDialog(); toast(t('cc_change_title') + ': ' + v); refreshJob(); });
  }
  function ccptSave() {
    var d = S.dialog;
    var v, g;
    if (!d || d.kind !== 'ccpt' || d.data.change === true) return Promise.resolve({ ok: true });
    dialogCapture();
    g = jobGate('addCcptNo');
    if (g) return refuse(g);
    v = trim(d.data.ccpt);
    if (!v) { setErrors({ ccpt: SBU_ERR.SVB_CCPT_REQUIRED }); return Promise.resolve(fail('SVB_CCPT_REQUIRED')); }
    return exclusive(function () {
      return callB('addCcptNumber', [{ invoiceNo: d.data.billNo, ccptInvoiceNo: v, reason: 'CCPT number added' }, makeCtx(readSession(), null, d.clientRef)]).then(function (r) {
        if (!r.ok) { showFailure(r); return r; }
        closeDialog();
        toast(fill(t('cc_title'), {}) + ': ' + v);
        refreshJob();
        return r;
      });
    });
  }

  /* ---- reverse a wrong receipt of today (Store Manager or Owner) or a refund of today (Owner PIN), plan 2.11 ---- */

  DIALOGS.reverse = function (d) {
    var dd = d.data;
    var rf = dd.refund === true;
    var save = rf ? 'svb-rv-refund-save' : 'svb-rv-save';
    var body = fld({ name: 'no', label: t(rf ? 'rvf_pick' : 'rv_pick'), kind: 'select', value: dd.no, options: dd.rows.map(function (r) { return { v: r.no, l: r.no + '  ' + money(r.amountPaise) }; }) }) +
      fld({ name: 'reason', label: t('cb_reason'), value: dd.reason, max: 80, err: fieldErr(d, 'reason'), req: true, enter: save });
    return { title: t(rf ? 'rvf_title' : 'rv_title'), subHtml: esc(jobLabel()), body: body, footer: footHtml(d, save, t('rv_save'), 'svb-rv-cancel', { danger: true }) };
  };
  /* Live receipts (refund false) or refunds (refund true) of today on the job; the right is checked by the caller. */
  function reversible(j, refund) {
    var td = today();
    var out = [];
    arr(refund ? j.refunds : j.receipts).forEach(function (r) {
      var no = asText(r.no);
      if (!no || (no.indexOf('SRF') === 0) !== refund || asText(r.status).toUpperCase() === 'REVERSED' || asText(r.docDate).slice(0, 10) !== td) return;
      out.push({ no: no, amountPaise: r.amountPaise });
    });
    return out;
  }
  function openReverse(refund) {
    var g = jobGate(refund ? 'reverseRefund' : 'reverseReceipt');
    if (g) return refuse(g);
    return withFreshJob(function (j) {
      var rows = reversible(j, refund);
      if (!rows.length) { toast(t(refund ? 'rvf_none' : 'rv_none')); return fail('NOTHING_DUE'); }
      openDialog('reverse', { rows: rows, no: rows[0].no, reason: '', refund: refund });
      return { ok: true };
    });
  }
  function reverseInput(d, refund) {
    var no, rs, row;
    if (!d || d.kind !== 'reverse' || (d.data.refund === true) !== refund) return null;
    dialogCapture();
    no = asText(d.data.no);
    rs = trim(d.data.reason);
    row = d.data.rows.filter(function (r) { return r.no === no; })[0];
    if (!row) return { stop: refuse(fail('SVB_JOB_UNKNOWN')) };
    if (rs.length < 5) { setErrors({ reason: SBU_ERR.SVB_REASON_SHORT }); return { stop: Promise.resolve(fail('SVB_FIELD_REQUIRED')) }; }
    return { no: no, reason: rs, row: row, done: function () { closeDialog(); toast(fill(t('rv_done'), { no: no })); refreshJob(); } };
  }
  /* A refund of today: Owner and Owner PIN (plan 2.11). */
  function reverseRefundSave() {
    var d = S.dialog;
    var x = reverseInput(d, true);
    if (!x) return Promise.resolve({ ok: true });
    if (x.stop) return x.stop;
    return ownerWrite(d, 'reverseRefund', fill(t('pin_rv_refund'), { no: x.no, amount: money(x.row.amountPaise) }), function (ctx) {
      return callB('reverseReceipt', [{ no: x.no, reason: x.reason }, ctx]);
    }, x.done);
  }
  /* A receipt of today: Store Manager or Owner, no PIN. */
  function reverseSave() {
    var d = S.dialog;
    var x = reverseInput(d, false);
    var g, no, rs, done;
    if (!x) return Promise.resolve({ ok: true });
    if (x.stop) return x.stop;
    no = x.no; rs = x.reason; done = x.done;
    g = jobGate('reverseReceipt');
    if (g) return refuse(g);
    return exclusive(function () {
      return callB('reverseReceipt', [{ no: no, reason: rs }, makeCtx(readSession(), null, d.clientRef)]).then(function (r) {
        if (!r.ok) { showFailure(r); return r; }
        done();
        return r;
      });
    });
  }

  /* ---- cancel bill, void job, cancel no-charge sheet (reason + Owner PIN) ---- */

  DIALOGS.cancelbill = function (d) {
    var dd = d.data;
    var body = '<div class="svs-dim">' + esc(fill(t('cb_summary'), { no: dd.billNo, amount: money(dd.totalPaise), paid: money(dd.paidPaise) })) + '</div>' + '<div class="svs-hint">' + esc(fill(t('cb_text'), { no: dd.billNo })) + '</div>';
    if (!dd.sameDay) return { title: t('cb_title'), subHtml: esc(jobLabel()), body: body + notice('warn', SBU_ERR.NOT_SAME_DAY), footer: btn('svb-cbill-cancel', t('close'), { cls: 'svs-btn-quiet' }) };
    body += fld({ name: 'reason', label: t('cb_reason'), value: dd.reason, max: 80, err: fieldErr(d, 'reason'), req: true, focus: true, enter: 'svb-cbill-confirm' });
    return { title: t('cb_title'), subHtml: esc(jobLabel()), body: body, footer: footHtml(d, 'svb-cbill-confirm', t('cb_confirm'), 'svb-cbill-cancel', { danger: true, cancelLabel: t('cb_keep') }) };
  };
  function openCancelBill() {
    var g = jobGate('cancelBill');
    if (g) return refuse(g);
    return withFreshJob(function (j) {
      var b = activeBill(j);
      if (!b) return refuse(fail('SVB_JOB_UNKNOWN'));
      openDialog('cancelbill', { billNo: billNoOf(b), totalPaise: billTotalOf(b), paidPaise: isInt(j.paidPaise) ? j.paidPaise : 0, reason: '', sameDay: istDay(pick(b, ['at', 'docDate', 'issuedAt'])) === istDay(nowIso()) });
      return { ok: true };
    });
  }
  function ownerWrite(d, rightKey, label, call, onOk) {
    var g = jobGate(rightKey);
    if (g) return refuse(g);
    return exclusive(function () {
      return ownerStep(label, function (ctx) {
        return callB('getJob', [S.jobId, ctx]).then(function (jr) {
          if (jr.ok && isObj(jr.job) && stateOf(jr.job) === 'voided') return fail('SVB_JOB_VOIDED');
          return call(ctx).then(function (r) {
            if (!r.ok) { showFailure(r); return r; }
            onOk(r);
            return r;
          });
        });
      }, d.clientRef).then(function (r) {
        if (!r.ok && !r.detail && (r.code === 'SVB_PIN_DENIED' || r.code === 'SVB_OWNER_ONLY' || r.code === 'SVB_ROLE_DENIED' || r.code === 'SVB_JOB_VOIDED')) showFailure(r);
        return r;
      });
    });
  }
  function cancelBillSave() {
    var d = S.dialog;
    var dd, reason;
    if (!d || d.kind !== 'cancelbill') return Promise.resolve({ ok: true });
    dialogCapture();
    dd = d.data;
    reason = trim(dd.reason);
    if (reason.length < 5) { setErrors({ reason: SBU_ERR.SVB_REASON_SHORT }); return Promise.resolve(fail('SVB_REASON_SHORT')); }
    return ownerWrite(d, 'cancelBill', fill(t('pin_cancel'), { no: dd.billNo, job: S.jobId, amount: money(dd.totalPaise) }), function (ctx) {
      return callB('cancelBill', [{ invoiceNo: dd.billNo, reason: reason }, ctx]);
    }, function () {
      closeDialog();
      toast(fill(t('cb_done'), { no: dd.billNo }));
      hostCall(['setLegacyInvoiceNo', 'setCaseInvoice'], [S.jobId, ''], null);
      refreshJob();
    });
  }
  DIALOGS.voidjob = function (d) {
    var dd = d.data;
    var lines = '';
    var body;
    if (dd.held > 0) lines += notice('bad', fill(t('void_adv'), { amount: money(dd.held) }));
    if (dd.pieces > 0) lines += notice('bad', fill(t('void_parts'), { n: dd.pieces }));
    if (dd.activeBill) lines += notice('bad', t('void_bill'));
    if (lines) return { title: t('void_title'), subHtml: esc(jobLabel()), body: lines + '<div class="svs-hint">' + esc(SBU_ERR.VOID_BLOCKED) + '</div>', footer: btn('svb-void-cancel', t('close'), { cls: 'svs-btn-quiet' }) };
    body = fld({ name: 'reason', label: t('cb_reason'), value: dd.reason, max: 80, err: fieldErr(d, 'reason'), req: true, focus: true, enter: 'svb-void-save' });
    return { title: t('void_title'), subHtml: esc(jobLabel()), body: body, footer: footHtml(d, 'svb-void-save', t('void_save'), 'svb-void-cancel', { danger: true }) };
  };
  function openVoid() {
    var g = jobGate('voidJob');
    if (g) return refuse(g);
    return withFreshJob(function (j) {
      var c = storesCore();
      var parts = null;
      var pieces = 0;
      try { parts = c && typeof c.jobParts === 'function' ? c.jobParts(S.jobId) : null; } catch (e) { parts = null; }
      if (parts && typeof parts.then === 'function') return Promise.resolve(parts).then(function (p) { return finishVoidOpen(j, p); }, function () { return finishVoidOpen(j, null); });
      return finishVoidOpen(j, parts);
    });
  }
  function finishVoidOpen(j, parts) {
    var pieces = parts && parts.ok === true && isInt(parts.totalNet) ? parts.totalNet : (parts === null || (parts && parts.ok !== true) ? 0 : 0);
    var b = activeBill(j);
    openDialog('voidjob', { reason: '', held: isInt(j.heldPaise) ? j.heldPaise : 0, pieces: pieces, activeBill: !!b });
    return { ok: true };
  }
  function voidSave() {
    var d = S.dialog;
    var reason;
    if (!d || d.kind !== 'voidjob') return Promise.resolve({ ok: true });
    dialogCapture();
    reason = trim(d.data.reason);
    if (reason.length < 5) { setErrors({ reason: SBU_ERR.SVB_REASON_SHORT }); return Promise.resolve(fail('SVB_REASON_SHORT')); }
    return ownerWrite(d, 'voidJob', fill(t('pin_void'), { job: S.jobId }), function (ctx) { return callB('voidJob', [{ jobId: S.jobId, reason: reason }, ctx]); }, function () {
      closeDialog();
      toast(fill(t('void_done'), { job: S.jobId }));
      hostCall(['legacyVoid', 'setCaseVoid'], [S.jobId, { at: nowIso(), reason: reason }], null);
      refreshJob();
    });
  }
  DIALOGS.nccancel = function (d) {
    var body = fld({ name: 'reason', label: t('cb_reason'), value: d.data.reason, max: 80, err: fieldErr(d, 'reason'), req: true, focus: true, enter: 'svb-ncc-save' });
    return { title: t('ncc_title'), subHtml: esc(jobLabel()), body: body, footer: footHtml(d, 'svb-ncc-save', t('ncc_save'), 'svb-ncc-cancel', { danger: true }) };
  };
  function openNcCancel() {
    var g = jobGate('cancelNoCharge');
    if (g) return refuse(g);
    return withFreshJob(function (j) {
      var nc = j.noCharge;
      var id = isObj(nc) ? asText(pick(nc, ['id', 'sheetId'])) : '';
      if (!id) return refuse(fail('SVB_JOB_UNKNOWN'));
      openDialog('nccancel', { reason: '', sheetId: id });
      return { ok: true };
    });
  }
  function ncCancelSave() {
    var d = S.dialog;
    var reason;
    if (!d || d.kind !== 'nccancel') return Promise.resolve({ ok: true });
    dialogCapture();
    reason = trim(d.data.reason);
    if (reason.length < 5) { setErrors({ reason: SBU_ERR.SVB_REASON_SHORT }); return Promise.resolve(fail('SVB_REASON_SHORT')); }
    return ownerWrite(d, 'cancelNoCharge', fill(t('pin_nc_cancel'), { job: S.jobId }), function (ctx) { return callB('cancelNoChargeSheet', [{ sheetId: d.data.sheetId, reason: reason }, ctx]); }, function () {
      closeDialog();
      toast(t('ncc_done'));
      refreshJob();
    });
  }

  /* ---- no-charge warranty job sheet (Store Manager or Owner, no PIN) ---- */

  DIALOGS.nocharge = function (d) {
    var dd = d.data;
    var body = '<div class="svs-hint">' + esc(t('nc_text')) + '</div>' +
      fld({ name: 'ref', label: t('nc_ref'), value: dd.ref, max: 30, hint: t('nc_ref_hint'), err: fieldErr(d, 'ref'), req: true, focus: true }) +
      fld({ name: 'note', label: t('nc_note'), value: dd.note, max: 80, err: fieldErr(d, 'note'), req: true }) +
      fld({ name: 'tick', label: t('nc_tick'), kind: 'check', value: dd.tick, err: fieldErr(d, 'tick'), enter: 'svb-nc-save' });
    if (ncLabour().length) body += '<div class="svs-dim">' + esc(fill(t('nc_labour'), { list: listText(ncLabour()) })) + '</div>';
    return { title: t('nc_title'), subHtml: esc(jobLabel()), body: body, footer: footHtml(d, 'svb-nc-save', t('nc_save'), 'svb-nc-cancel') };
  };
  // Stage E round 4 (R-gaps-2): the sheet lists the labour done at no charge: the labour lines of the job's latest estimate
  // (codes from the masters). The warranty parts are added by the bill layer from the issues.
  function ncLabour() {
    var j = jobOfDialog();
    return estLinesOf(isObj(j.estimate) ? j.estimate : null).filter(function (l) { return isObj(l) && asText(l.kind).toUpperCase() === 'LABOUR' && isInt(l.qty) && l.qty > 0; })
      .map(function (l) { return { code: asText(l.code), name: asText(l.name).slice(0, 80), qty: l.qty }; });
  }
  function openNoCharge() {
    var g = jobGate('markNoCharge');
    if (g) return refuse(g);
    openDialog('nocharge', { ref: '', note: '', tick: false });
    return Promise.resolve({ ok: true });
  }
  function ncSave() {
    var d = S.dialog;
    var dd, errors, g, note;
    if (!d || d.kind !== 'nocharge') return Promise.resolve({ ok: true });
    dialogCapture();
    dd = d.data;
    errors = {};
    g = jobGate('markNoCharge');
    if (g) return refuse(g);
    if (trim(dd.ref).length < 3 || trim(dd.ref).length > 30) errors.ref = SBU_ERR.SVB_WARR_REF;
    if (trim(dd.note).length < 5) errors.note = SBU_ERR.SVB_REASON_SHORT;
    if (dd.tick !== true) errors.tick = SBU_ERR.SVB_NC_TICK;
    if (Object.keys(errors).length) { setErrors(errors); toast(errors.ref || errors.note || errors.tick); return Promise.resolve(fail('SVB_FIELD_REQUIRED')); }
    note = ('Warranty ref ' + trim(dd.ref) + '. ' + trim(dd.note)).slice(0, 200);
    return exclusive(function () {
      return callB('issueNoChargeSheet', [{ jobId: S.jobId, labour: ncLabour(), note: note }, makeCtx(readSession(), null, d.clientRef)]).then(function (r) {
        if (!r.ok) { showFailure(r); return r; }
        closeDialog();
        toast(t('nc_done'));
        refreshJob();
        return r;
      });
    });
  }

  /* ---- credit note and refund (Owner PIN) ---- */

  function creditedOf(view, lineNo) {
    var qty = 0;
    var taxable = 0;
    arr(view.credits).concat(arr(view.creditNotes)).forEach(function (c) {
      var cr = isObj(c.credit) ? c.credit : c;
      arr(cr.lines).forEach(function (l) { if (l.lineNo === lineNo) { qty += isInt(l.qty) ? l.qty : 0; taxable += isInt(l.taxablePaise) ? l.taxablePaise : 0; } });
    });
    return { qty: qty, taxablePaise: taxable };
  }
  function creditRequest(dd) {
    var lines = [];
    var stock = [];
    var bad = null;
    if (dd.all) return { ok: true, request: { kind: 'FULL' }, mode: 'FULL', stock: [] };
    dd.rows.forEach(function (row, i) {
      var v = trim(row.value);
      var q, p;
      if (v === '') return;
      if (dd.reason === 'PRICE') {
        p = parsePaise(v, { allowZero: true });
        if (!p.ok || p.paise > row.taxablePaise) { bad = bad || { field: 'lines.' + i + '.value', code: 'SVB_MONEY_INVALID' }; return; }
        if (p.paise > 0) lines.push({ lineNo: row.lineNo, taxablePaise: p.paise });
      } else {
        q = parseQty(v, { min: 0, max: Math.max(0, row.remaining) });
        if (!q.ok) { bad = bad || { field: 'lines.' + i + '.value', code: 'SVB_QTY_INVALID', min: 0, max: Math.max(0, row.remaining) }; return; }
        if (q.qty > 0) {
          lines.push({ lineNo: row.lineNo, qty: q.qty });
          if (dd.reason === 'RETURN' && row.kind === 'PART') stock.push({ lineNo: row.lineNo, qty: q.qty });
        }
      }
    });
    if (bad) return { ok: false, bad: bad };
    if (!lines.length) return { ok: false, bad: { field: 'lines', code: 'SVB_CREDIT_NONE' } };
    return { ok: true, request: { kind: 'LINES', lines: lines }, mode: 'PARTIAL', stock: stock };
  }
  function creditPreview(dd) {
    var c = calcLib();
    var req = creditRequest(dd);
    var r;
    if (!c || typeof c.computeCreditNote !== 'function' || !req.ok || !isObj(dd.billRecord)) return null;
    try { r = c.computeCreditNote(dd.billRecord, req.request, dd.priors); } catch (e) { return null; }
    return r && r.ok === true ? r : null;
  }
  DIALOGS.credit = function (d) {
    var dd = d.data;
    var body, foot, pv;
    if (d.result) {
      body = notice('ok', fill(t('cn_done'), { no: d.result.no }));
      if (d.result.refundNo) body += notice('ok', fill(t('cn_refund_done'), { no: d.result.refundNo, amount: money(d.result.refundPaise), mode: d.result.refundMode }));
      if (d.result.refundError) body += notice('warn', d.result.refundError);
      if (d.result.stock) body += '<div class="svs-dim">' + esc(fill(t('cn_stock'), { result: d.result.stock })) + '</div>';
      return { title: t('cn_title'), subHtml: esc(jobLabel()), wide: true, body: body, footer: resultFoot([btn('svb-cn-print', t('b_print_cn'), { key: d.result.no, cls: 'svs-btn-primary' }), d.result.refundNo ? btn('svb-cn-print-refund', t('b_print_refund'), { key: d.result.refundNo }) : '', btn('svb-cn-done', t('done'), { cls: 'svs-btn-quiet' })]) };
    }
    body = '<div class="svs-dim">' + esc(fill(t('cn_summary'), { no: dd.billNo, amount: money(dd.totalPaise), paid: money(dd.paidPaise), credited: money(dd.creditedPaise) })) + '</div>' +
      fld({ name: 'reason', label: t('cn_reason'), kind: 'select', value: dd.reason, options: SBU_REASONS.map(function (o) { return { v: o.v, l: t(o.l) }; }), focus: true }) +
      fld({ name: 'details', label: t('cn_details'), value: dd.details, max: 80, err: fieldErr(d, 'details'), req: true }) +
      fld({ name: 'all', label: t('cn_all'), kind: 'check', value: dd.all });
    if (!dd.all) {
      dd.rows.forEach(function (row, i) {
        body += '<div class="svb-line"><div class="svb-line-grid"><div class="svb-ro">' + esc(row.name) + '</div><div class="svb-ro">' + esc(fill(t('cn_billed'), { n: row.qty })) + ' / ' + esc(fill(t('cn_credited'), { n: row.credited })) + '</div>' +
          fld({ name: 'value', label: dd.reason === 'PRICE' ? t('cn_reduce') : t('cn_qty'), value: row.value, max: 12, mode: dd.reason === 'PRICE' ? 'decimal' : 'numeric', line: i, err: d.errors['lines.' + i + '.value'] || '' }) + '</div></div>';
      });
    }
    if (d.errors.lines) body += '<div class="svs-field-err" role="alert">' + esc(d.errors.lines) + '</div>';
    pv = creditPreview(dd);
    body += '<div class="svb-totals"><div class="svb-totals-row svb-totals-grand"><span class="svb-row-label">' + esc(t('cn_total')) + '</span><span class="svb-row-value" id="svb-cn-total">' + esc(pv ? money(pv.totalPaise) : '-') + '</span></div></div>';
    body += '<h4 class="svs-h3">' + esc(t('cn_refund')) + '</h4>' + fld({ name: 'refundAmount', label: t('cn_refund_amount'), value: dd.refundAmount, max: 12, mode: 'decimal', err: fieldErr(d, 'refundAmount') }) + payFields(d, true);
    foot = footHtml(d, 'svb-cn-save', t('cn_save'), 'svb-cn-cancel', { danger: true });
    return { title: t('cn_title'), subHtml: esc(jobLabel()), wide: true, body: body, footer: foot };
  };
  function openCredit() {
    var g = jobGate('creditNote');
    if (g) return refuse(g);
    return withFreshJob(function (j) {
      var b = isObj(j.bill) ? j.bill : null;
      var no = billNoOf(b);
      if (!no) return refuse(fail('SVB_JOB_UNKNOWN'));
      return callB('getBill', [no, makeCtx(readSession(), null, '')]).then(function (r) {
        var view, rec, rows, credited;
        if (!r.ok) { showFailure(r); return r; }
        view = r.invoice || r.bill || r.view || {};
        rec = isObj(view.bill) && Array.isArray(view.bill.lines) ? view.bill : (isObj(view.record) ? view.record : null);
        rows = (rec ? rec.lines : arr(view.lines)).map(function (l) {
          var c = creditedOf(view, l.lineNo);
          return { lineNo: l.lineNo, name: asText(pick(l, ['name', 'description'])), kind: asText(l.kind).toUpperCase(), qty: isInt(l.qty) ? l.qty : 0, credited: c.qty, remaining: (isInt(l.qty) ? l.qty : 0) - c.qty, taxablePaise: (isInt(l.taxablePaise) ? l.taxablePaise : 0) - c.taxablePaise, value: '', noCharge: l.noCharge === true };
        }).filter(function (x) { return !x.noCharge; });
        credited = isInt(view.creditedPaise) ? view.creditedPaise : 0;
        openDialog('credit', {
          billNo: no, totalPaise: billTotalOf(b), paidPaise: isInt(j.paidPaise) ? j.paidPaise : 0, creditedPaise: credited, reason: 'RETURN', details: '', all: false, rows: rows,
          refundAmount: '', payMode: 'Cash', payRef: '', billRecord: rec, priors: arr(view.credits).concat(arr(view.creditNotes)).map(function (c) { return isObj(c.credit) ? c.credit : c; }).filter(function (c) { return isObj(c) && c.ok === true; }),
          refundableCap: isInt(j.refundablePaise) ? j.refundablePaise : (isInt(j.paidPaise) ? j.paidPaise : 0)
        });
        return { ok: true };
      });
    });
  }
  function creditMerge(d) {
    var cap = {};
    var i;
    if (!S.layer) return;
    captureFields(S.layer, cap);
    d.data.reason = cap.reason !== undefined ? cap.reason : d.data.reason;
    for (i = 0; cap.lines && i < cap.lines.length; i++) { if (cap.lines[i] && d.data.rows[i]) d.data.rows[i].value = cap.lines[i].value; }
    ['details', 'refundAmount', 'payMode', 'payRef'].forEach(function (k) { if (cap[k] !== undefined) d.data[k] = cap[k]; });
    if (cap.all !== undefined) d.data.all = cap.all;
  }
  function creditSave() {
    var d = S.dialog;
    var dd, errors, req, rf, refund, g, pv, payload, label, ref;
    if (!d || d.kind !== 'credit' || d.result) return Promise.resolve({ ok: true });
    dialogCapture();
    creditMerge(d);
    dd = d.data;
    errors = {};
    g = jobGate('creditNote');
    if (g) return refuse(g);
    if (trim(dd.details).length < 5) errors.details = SBU_ERR.SVB_REASON_SHORT;
    req = creditRequest(dd);
    if (!req.ok) errors[req.bad.field] = errText({ code: req.bad.code, min: req.bad.min, max: req.bad.max });
    rf = parsePaise(dd.refundAmount === '' ? '0' : dd.refundAmount, { allowZero: true });
    if (!rf.ok) errors.refundAmount = SBU_ERR.SVB_MONEY_INVALID;
    else if (rf.paise > dd.refundableCap) errors.refundAmount = fill(SBU_ERR.SVB_REFUND_OVER, { amount: money(dd.refundableCap) });
    ref = rf.ok && rf.paise > 0 ? checkPay(dd, errors) : '';
    if (Object.keys(errors).length) { setErrors(errors); toast(errors.lines || errors.details || errors.refundAmount || errors.payRef || SBU_ERR.SVB_FIELD_REQUIRED); return Promise.resolve(fail('SVB_FIELD_REQUIRED')); }
    refund = rf.paise > 0 ? { amountPaise: rf.paise, payMode: dd.payMode, payRef: ref } : null;
    payload = { invoiceNo: dd.billNo, mode: req.mode, reasonClass: dd.reason, reason: trim(dd.details), request: req.request, stock: req.stock, note: '', refund: refund };
    pv = creditPreview(dd);
    label = fill(t('pin_credit'), { no: dd.billNo, amount: money(pv ? pv.totalPaise : null), refund: money(rf.paise) });
    return ownerWrite(d, 'creditNote', label, function (ctx) { return callB('issueCreditNote', [payload, ctx]); }, function (r) {
      var cn = r.creditNote || r.note || r.view || {};
      var rfd = r.refund || {};
      d.result = { no: asText(pick(cn, ['no']) || pick(r, ['no'])), refundNo: asText(rfd.no), refundPaise: isInt(rfd.amountPaise) ? rfd.amountPaise : (refund ? refund.amountPaise : 0), refundMode: asText(rfd.payMode || (refund && refund.payMode)),
        refundError: r.creditNotRefunded === true ? t('cn_not_refunded') + ' ' + errText(isObj(r.refundFailed) ? r.refundFailed : { code: 'SVB_INTERNAL' }) : '', stock: asText(r.stockResult || (isObj(r.stock) ? r.stock.result : '')) };
      d.dirty = false;
      toast(fill(t('cn_done'), { no: d.result.no }));
      renderDialog(true);
      refreshJob();
    });
  }

  /* ---- refund an advance (Owner PIN) ---- */

  DIALOGS.advref = function (d) {
    var dd = d.data;
    var body, foot;
    if (d.result) {
      return { title: t('ar_title'), subHtml: esc(jobLabel()), body: notice('ok', fill(t('ar_done'), { no: d.result.no, amount: money(d.result.amountPaise) })), footer: resultFoot([btn('svb-ar-print', t('b_print_refund'), { key: d.result.no, cls: 'svs-btn-primary' }), btn('svb-ar-cancel', t('done'), { cls: 'svs-btn-quiet' })]) };
    }
    body = '<div class="svs-dim">' + esc(fill(t('ar_refundable'), { amount: money(dd.refundable) })) + '</div>' +
      fld({ name: 'advanceNo', label: t('ar_pick'), kind: 'select', value: dd.advanceNo, options: dd.advances.map(function (a) { return { v: a.no, l: fill(t('ar_row'), { no: a.no, date: fmtAt(pick(a, ['docDate', 'at'])), amount: money(a.amountPaise) }) }; }), focus: true }) +
      fld({ name: 'amount', label: t('cn_refund_amount'), value: dd.amount, max: 12, mode: 'decimal', err: fieldErr(d, 'amount'), req: true }) + payFields(d, true) +
      fld({ name: 'reason', label: t('cb_reason'), value: dd.reason, max: 80, err: fieldErr(d, 'reason'), req: true, enter: 'svb-ar-save' });
    foot = footHtml(d, 'svb-ar-save', t('ar_save'), 'svb-ar-cancel', { danger: true });
    return { title: t('ar_title'), subHtml: esc(jobLabel()), body: body, footer: foot };
  };
  function openAdvRefund() {
    var g = jobGate('refundAdvance');
    if (g) return refuse(g);
    return withFreshJob(function (j) {
      var advances = arr(j.receipts).filter(function (r) { return asText(r.kind || r.series).toUpperCase().indexOf('SAR') === 0 && asText(r.status).toUpperCase() !== 'REVERSED' && (!isInt(r.refundablePaise) || r.refundablePaise > 0); });
      var refundable = isInt(j.refundablePaise) ? j.refundablePaise : (isInt(j.heldPaise) ? j.heldPaise : 0);
      if (!advances.length || refundable <= 0) return refuse(fail('NOTHING_DUE'));
      openDialog('advref', { advances: advances, advanceNo: advances[0].no, amount: '', payMode: 'Cash', payRef: '', reason: '', refundable: refundable });
      return { ok: true };
    });
  }
  function advRefundSave() {
    var d = S.dialog;
    var dd, errors, p, ref, g, payload;
    if (!d || d.kind !== 'advref' || d.result) return Promise.resolve({ ok: true });
    dialogCapture();
    dd = d.data;
    errors = {};
    g = jobGate('refundAdvance');
    if (g) return refuse(g);
    p = parsePaise(dd.amount);
    if (!p.ok) errors.amount = SBU_ERR.SVB_MONEY_INVALID;
    else if (p.paise > dd.refundable) errors.amount = fill(SBU_ERR.SVB_ADV_OVER, { amount: money(dd.refundable) });
    ref = checkPay(dd, errors);
    if (trim(dd.reason).length < 5) errors.reason = SBU_ERR.SVB_REASON_SHORT;
    if (Object.keys(errors).length) { setErrors(errors); toast(errors.amount || errors.payRef || errors.reason); return Promise.resolve(fail('SVB_FIELD_REQUIRED')); }
    payload = { jobId: S.jobId, advanceNo: dd.advanceNo, amountPaise: p.paise, payMode: dd.payMode, payRef: ref, reason: trim(dd.reason) };
    return ownerWrite(d, 'refundAdvance', fill(t('pin_refund'), { no: dd.advanceNo, job: S.jobId, amount: money(p.paise) }), function (ctx) { return callB('refund', [payload, ctx]); }, function (r) {
      var rc = r.refund || r.receipt || r.view || {};
      d.result = { no: asText(pick(rc, ['no']) || pick(r, ['no'])), amountPaise: p.paise };
      d.dirty = false;
      toast(fill(t('ar_done'), { no: d.result.no, amount: money(p.paise) }));
      renderDialog(true);
      refreshJob();
    });
  }

  /* ---------- counter-sale receipt (Stores calls this right after a sale) ---------- */

  /* The sale just made (Stores passes its document): the receipt opens for exactly that sale, for everyone the role table lets take a
     counter receipt (billing staff, store staff, Manager, Owner). The facade checks the amount against the sale. Only the Owner and
     the Manager may read the list of unreceipted sales, so the list is the fallback for them alone. */
  function saleAmount(doc) {
    return isObj(doc) && isInt(doc.amountPaise) && doc.amountPaise > 0 ? doc.amountPaise : null;
  }
  function afterCounterSale(saleNo, doc) {
    var no = asText(saleNo);
    var s = readSession();
    var g, R;
    if (!H || !no) return Promise.resolve(fail('SVB_JOB_UNKNOWN'));
    if (!facade()) { toast(SBU_ERR.SVB_CORE_MISSING); return Promise.resolve(fail('SVB_CORE_MISSING')); }
    g = writeGate(null);
    if (g) return refuse(g);
    return loadStatus().then(function () {
      var can, amt;
      R = rights();
      can = syncB('can', ['COUNTER_RECEIPT', s]);
      if (!R.takeReceipt && !(isObj(can) && can.ok === true)) return refuse(fail('SVB_ROLE_DENIED'));
      amt = saleAmount(doc);
      if (amt !== null) return openReceipt('counter', { saleNo: no, amountPaise: amt });
      if (!R.viewLists) { toast(t('cs_nothing')); return fail('SVB_JOB_UNKNOWN'); }
      return callB('unreceiptedCounterSales', [makeCtx(readSession(), null, '')]).then(function (r) {
        var row = null;
        if (!r.ok) { showFailure(r); return r; }
        arr(r.rows || r.sales).forEach(function (x) { if (asText(x.no || x.saleNo) === no) row = x; });
        if (!row || asText(row.state).toUpperCase() === 'RECEIPT_REVERSED' || !isInt(row.amountPaise)) {
          toast(t('cs_nothing'));
          return fail('SVB_JOB_UNKNOWN');
        }
        return openReceipt('counter', { saleNo: no, amountPaise: row.amountPaise });
      });
    });
  }

  /* ---------- the action table ---------- */

  function printFromJob(kind) {
    var j = jobOfDialog();
    var b = j.bill;
    if (kind === 'sheet') return printDoc('sheet', { jobId: S.jobId });
    if (!isObj(b) || !billNoOf(b)) return refuse(fail('SVB_JOB_UNKNOWN'));
    return printDoc(isNotInCcpt(b) ? 'taxinvoice' : 'bill', { invoiceNo: billNoOf(b) });
  }
  function closeAnd() { requestClose(); return { ok: true }; }
  function viaJob(fn) { return function () { return withFreshJob(function () { return fn(); }); }; }
  var ACT = {
    'svb-open-billing': function () {
      if (H && typeof H.showBilling === 'function') { H.showBilling(); return { ok: true }; }
      toast(fill(t('open_fail'), { error: 'no view' }));
      return fail('SVB_CORE_MISSING');
    },
    'svb-blocked-retry': function () { refreshJob(); return { ok: true }; },
    'svb-job-estimate-open': viaJob(function () { return openEstimate(); }),
    'svb-job-approval-open': viaJob(function () { return openApprovalDialog(); }),
    'svb-job-advance-open': function () { return openReceipt('advance'); },
    'svb-job-bill-open': viaJob(function () { var r = startBill(S.jobId, false); return r === true ? { ok: true } : r; }),
    'svb-job-balance-open': function () { return openReceipt('balance'); },
    'svb-job-ccptno-open': viaJob(function () { return openCcpt(false); }),
    'svb-job-ccptchange-open': viaJob(function () { return openCcpt(true); }),
    'svb-job-reverse-open': viaJob(function () { return openReverse(false); }),
    'svb-job-reverse-refund-open': viaJob(function () { return openReverse(true); }),
    'svb-job-notccpt-open': viaJob(function () { var r = startBill(S.jobId, true); return r === true ? { ok: true } : r; }),
    'svb-job-ncsheet-open': function () { return openNoCharge(); },
    'svb-job-nccancel-open': function () { return openNcCancel(); },
    'svb-job-cancel-open': function () { return openCancelBill(); },
    'svb-job-credit-open': function () { return openCredit(); },
    'svb-cn-restock': function (key) { return restock(key); },
    'svb-job-refund-open': function () { return openAdvRefund(); },
    'svb-job-void-open': function () { return openVoid(); },
    'svb-job-print-bill': function () { return printFromJob('bill'); },
    'svb-job-print-receipt': function (key) { return printDoc('receipt', { receiptNo: key }); },
    'svb-job-print-nocharge': function () { return printFromJob('sheet'); },
    'svb-job-goto-billing': function () { if (H && typeof H.gotoBilling === 'function') H.gotoBilling(); return { ok: true }; },
    'svb-job-stores-open': function () { if (H && typeof H.showStores === 'function') { closeDialog(); H.showStores(); } return { ok: true }; },
    'svb-est-add-part': function () { return estAddLine('PART'); },
    'svb-est-add-labour': function () { return estAddLine('LABOUR'); },
    'svb-est-add-other': function () { return estAddLine('OTHER'); },
    'svb-est-pick': function (key) { return pickMaster(key); },
    'svb-est-line-remove': function (key) { return estRemoveLine(key); },
    'svb-est-save': function () { return estSave(); },
    'svb-est-cancel': closeAnd,
    'svb-appr-save': function () { return apprSave(); },
    'svb-appr-cancel': closeAnd,
    'svb-rcpt-save': function () { return rcptSave(); },
    'svb-rcpt-cancel': closeAnd,
    'svb-rcpt-fill-due': function () {
      var d = S.dialog;
      if (!d || d.kind !== 'receipt') return { ok: true };
      dialogCapture();
      d.data.amount = rupeeText(d.data.duePaise);
      d.dirty = true;
      renderDialog(true);
      return { ok: true };
    },
    'svb-rcpt-print': function (key) { return printDoc('receipt', { receiptNo: key }); },
    'svb-rcpt-done': function () { closeDialog(); return { ok: true }; },
    'svb-bill-review': function () { return billReview(); },
    'svb-bill-back': function () { return billBack(); },
    'svb-bill-ask-owner': function () { return billSave(true); },
    'svb-bill-save': function () { return billSave(false); },
    'svb-bill-cancel': closeAnd,
    'svb-bill-print': function (key) { return printDoc(S.dialog && S.dialog.data.notIn ? 'taxinvoice' : 'bill', { invoiceNo: key }); },
    'svb-bill-done': function () { closeDialog(); return { ok: true }; },
    'svb-cc-save': function () { return ccptSave(); },
    'svb-cc-change-save': function () { return ccptChangeSave(); },
    'svb-cc-cancel': closeAnd,
    'svb-rv-save': function () { return reverseSave(); },
    'svb-rv-refund-save': function () { return reverseRefundSave(); },
    'svb-rv-cancel': closeAnd,
    'svb-cbill-confirm': function () { return cancelBillSave(); },
    'svb-cbill-cancel': closeAnd,
    'svb-cn-save': function () { return creditSave(); },
    'svb-cn-cancel': closeAnd,
    'svb-cn-print': function (key) { return printDoc('credit', { noteNo: key }); },
    'svb-cn-print-refund': function (key) { return printDoc('refund', { voucherNo: key }); },
    'svb-cn-done': function () { closeDialog(); return { ok: true }; },
    'svb-ar-save': function () { return advRefundSave(); },
    'svb-ar-cancel': closeAnd,
    'svb-ar-print': function (key) { return printDoc('refund', { voucherNo: key }); },
    'svb-void-save': function () { return voidSave(); },
    'svb-void-cancel': closeAnd,
    'svb-nc-save': function () { return ncSave(); },
    'svb-nc-cancel': closeAnd,
    'svb-ncc-save': function () { return ncCancelSave(); },
    'svb-ncc-cancel': closeAnd,
    'svb-dialog-close': closeAnd,
    'svb-dialog-discard': function () { closeDialog(); return { ok: true }; },
    'svb-dialog-keep': function () {
      if (S.dialog) { S.dialog.discard = false; renderDialog(true); }
      return { ok: true };
    }
  };
  function actionFn(action) {
    var d = S.dialog;
    if (Object.prototype.hasOwnProperty.call(ACT, action)) return ACT[action];
    if (d && d.opts && isObj(d.opts.actions) && typeof d.opts.actions[action] === 'function') return d.opts.actions[action];
    return null;
  }
  function dispatch(action, key, el) {
    var fn = actionFn(action);
    var out;
    if (!fn) return Promise.resolve(fail('SVB_INTERNAL', { message: 'unknown action' }));
    try { out = fn(key === undefined || key === null ? '' : String(key), el); } catch (e) {
      var f = thrown(e);
      showFailure(f);
      return Promise.resolve(f);
    }
    return Promise.resolve(out === undefined ? { ok: true } : out).then(function (r) { return r; }, function (e2) {
      var f2 = thrown(e2);
      showFailure(f2);
      return f2;
    });
  }

  /* ---------- events (delegated; attached to this file's own containers) ---------- */

  function actionTarget(start, container) {
    var n, steps;
    for (n = start, steps = 0; n && steps < 40; steps++, n = n.parentNode) {
      if (getAttr(n, 'data-svcs-action')) return n;
      if (n === container) break;
    }
    return null;
  }
  function isChoiceInput(el) {
    var tag = el && typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
    if (tag === 'SELECT') return true;
    return tag === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio');
  }
  function onClick(ev, where, container) {
    var target = ev && ev.target;
    var hit, act;
    if (!target) return;
    hit = actionTarget(target, container);
    if (hit) {
      if (hit.disabled === true) return;
      act = getAttr(hit, 'data-svcs-action');
      if (!actionFn(act)) return;
      if (!isChoiceInput(hit) && typeof ev.preventDefault === 'function') ev.preventDefault();
      dispatch(act, getAttr(hit, 'data-svs-key'), hit);
      return;
    }
    if (where === 'layer' && getAttr(target, 'data-svs-overlay') !== null && S.dialog && !S.dialog.dirty && !S.busy) closeDialog();
  }
  function refreshEstTotals() {
    var d = S.dialog;
    var box;
    if (!d || d.kind !== 'estimate' || !S.layer) return;
    box = qs(S.layer, '#svb-est-totals');
    if (box) box.innerHTML = totalsHtml(estimateFigures(d.data.lines), { grand: t('t_est_total'), split: false, discount: false });
  }
  function updateCreditTotal(d) {
    var box = S.layer ? qs(S.layer, '#svb-cn-total') : null;
    var pv;
    creditMerge(d);
    pv = creditPreview(d.data);
    if (box) box.textContent = pv ? money(pv.totalPaise) : '-';
  }
  function dialogInput(el, name, ev) {
    var d = S.dialog;
    var li, idx, val, choice, L;
    if (!d || d.result) return;
    d.dirty = true;
    li = getAttr(el, 'data-svs-line');
    idx = li === null || li === '' ? undefined : parseInt(li, 10);
    val = fieldValue(el);
    choice = isChoiceInput(el);
    if (d.opts && typeof d.opts.onInput === 'function') { d.opts.onInput(name, el, ev); return; }
    if (d.kind === 'estimate') {
      L = idx !== undefined ? d.data.lines[idx] : null;
      if (L && name === 'search') {
        L.search = val;
        L.picked = false;
        L.code = '';
        searchMasters(L.kind, val, idx);
        return;
      }
      if (L) L[name] = val;
      if (choice) { dialogCapture(); renderDialog(false); } else refreshEstTotals();
      return;
    }
    if (d.kind === 'receipt') { if (choice) { dialogCapture(); renderDialog(false); } return; }
    if (d.kind === 'bill') {
      if (choice) { dialogCapture(); renderDialog(false); }
      // Stage E round 5 (F-2): the discount reason and the GST number change what the bill layer accepts: ask again
      if (name === 'discount' || name === 'billDiscount' || name === 'discountReason' || name === 'gstin' || choice) { dialogCapture(); billPreview(); }
      return;
    }
    if (d.kind === 'credit') {
      if (name === 'reason' || name === 'all') { dialogCapture(); creditMerge(d); renderDialog(false); return; }
      if (name === 'value') updateCreditTotal(d);
    }
  }
  function onInput(ev, where) {
    var el = ev && ev.target;
    var name;
    if (!el) return;
    name = getAttr(el, 'data-svs-field');
    if (!name || where !== 'layer') return;
    if (ev.type === 'change' && (el.type === 'text' || el.type === 'textarea' || el.type === 'date' || el.type === 'time')) return;
    dialogInput(el, name, ev);
  }
  function pickByEnter(el) {
    var li = getAttr(el, 'data-svs-line');
    var idx = li === null || li === '' ? NaN : parseInt(li, 10);
    var rows = arr(S.picks[idx]);
    var want = trim(fieldValue(el)).toLowerCase();
    var row = rows[0];
    var i;
    if (!rows.length) return false;
    for (i = 0; i < rows.length; i++) { if (asText(rows[i].code).toLowerCase() === want) row = rows[i]; }
    pickMaster(idx + '|' + row.code);
    return true;
  }
  function focusTrap(ev) {
    var items = qsa(S.layer, '[data-svcs-action],[data-svs-field]').filter(function (x) { return x.disabled !== true; });
    var first, last, cur;
    if (!items.length) return;
    first = items[0];
    last = items[items.length - 1];
    cur = activeElement();
    if (ev.shiftKey && (cur === first || !cur)) { ev.preventDefault(); focusEl(last); } else if (!ev.shiftKey && cur === last) { ev.preventDefault(); focusEl(first); }
  }
  function onKeydown(ev, where, container) {
    var key = ev && ev.key;
    var el = ev && ev.target;
    var name, go, box, picks, pos, to;
    if (!key || !el) return;
    if (key === 'Tab' && where === 'layer' && S.dialog) { focusTrap(ev); return; }
    if (key === 'Enter') {
      name = getAttr(el, 'data-svs-field');
      if (!name || el.type === 'textarea') return;
      if (name === 'search') { if (pickByEnter(el) && typeof ev.preventDefault === 'function') ev.preventDefault(); return; }
      go = getAttr(el, 'data-svs-enter');
      if (go) {
        if (typeof ev.preventDefault === 'function') ev.preventDefault();
        dispatch(go, '', el);
      }
      return;
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      box = el.parentNode && el.parentNode.parentNode ? el.parentNode.parentNode : container;
      picks = qsa(box, '.svs-pick-row');
      if (!picks.length) return;
      pos = picks.indexOf(el);
      to = pos < 0 ? (key === 'ArrowDown' ? 0 : picks.length - 1) : pos + (key === 'ArrowDown' ? 1 : -1);
      if (picks[to]) { if (typeof ev.preventDefault === 'function') ev.preventDefault(); focusEl(picks[to]); }
    }
  }
  function stopEvent(ev) {
    ['preventDefault', 'stopPropagation', 'stopImmediatePropagation'].forEach(function (m) { if (typeof ev[m] === 'function') ev[m](); });
  }
  /* Escape keeps the user inside the module: with a billing dialog open it closes (or asks to discard); otherwise it does nothing here. */
  function onEscape(ev) {
    if (!ev || (ev.key !== 'Escape' && ev.keyCode !== 27)) return;
    if (!S.dialog) return;
    stopEvent(ev);
    requestClose();
  }
  function listen(el, type, fn, capture) {
    var cap = capture === true;
    if (!el || typeof el.addEventListener !== 'function') return;
    el.addEventListener(type, fn, cap);
    S.binds.push({ el: el, type: type, fn: fn, capture: cap });
  }
  function bindContainer(el, where) {
    listen(el, 'click', function (ev) { onClick(ev, where, el); });
    if (where === 'strip') return;
    listen(el, 'keydown', function (ev) { onKeydown(ev, where, el); });
    listen(el, 'input', function (ev) { onInput(ev, where, el); });
    listen(el, 'change', function (ev) { onInput(ev, where, el); });
  }

  /* ---------- the Billing button, mount and the public API ---------- */

  function docOf() {
    var h = H;
    var el = h && (h.root || h.jobHost || h.closeHost);
    return el && el.ownerDocument ? el.ownerDocument : (typeof document !== 'undefined' ? document : null);
  }
  function createNavButton() {
    var doc = docOf();
    var b, anchor;
    if (!doc || typeof doc.querySelector !== 'function') return null;
    b = doc.querySelector('[data-svcs-action="svb-open-billing"]');
    if (!b) {
      anchor = doc.querySelector('[data-action="new-service-order"]');
      if (!anchor || !anchor.parentNode) return null;
      b = doc.createElement('button');
      b.setAttribute('type', 'button');
      b.setAttribute('class', 'btn btn-ghost svs-open-btn svb-open-btn');
      b.setAttribute('data-svcs-action', 'svb-open-billing');
      b.setAttribute('data-no-i18n', '');
      b.setAttribute('hidden', '');
      b.textContent = t('billing_btn');
      anchor.parentNode.insertBefore(b, anchor);
    }
    listen(b, 'click', function (ev) {
      if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      dispatch('svb-open-billing', '', b);
    });
    S.navBtn = b;
    return b;
  }
  function updateNav() {
    var b = S.navBtn;
    var show = !!facade() && rights().viewBilling === true;
    if (!b) return;
    if (show) b.removeAttribute('hidden'); else b.setAttribute('hidden', '');
  }
  function mount(host) {
    var doc, w, vv;
    if (!host || typeof host !== 'object') return false;
    if (H) unmount();
    H = host;
    if (host.jobHost) bindContainer(host.jobHost, 'job');
    if (host.closeHost) bindContainer(host.closeHost, 'strip');
    ensureLayer();
    doc = docOf();
    if (doc) listen(doc, 'keydown', onEscape, true);
    w = doc ? doc.defaultView : null;
    vv = w ? (w.visualViewport || w) : null;
    if (vv) listen(vv, 'resize', function () { setViewportVar(S.layer); });
    createNavButton();
    loadStatus().then(function () { updateNav(); });
    return true;
  }
  function unmount() {
    var i, b, layer;
    for (i = 0; i < S.binds.length; i++) {
      b = S.binds[i];
      try { b.el.removeEventListener(b.type, b.fn, b.capture === true); } catch (e) { /* element already gone */ }
    }
    layer = S.layer;
    if (layer && layer.parentNode && typeof layer.parentNode.removeChild === 'function') layer.parentNode.removeChild(layer);
    S = freshState();
    H = null;
  }
  var SBU_DIALOG_RIGHT = {
    estimate: 'buildEstimate', approval: 'recordApproval', receipt: 'takeReceipt', bill: 'issueBill', ccpt: 'addCcptNo', cancelbill: 'cancelBill', credit: 'creditNote',
    advref: 'refundAdvance', voidjob: 'voidJob', nocharge: 'markNoCharge', nccancel: 'cancelNoCharge'
  };
  function dialogRight(d) {
    if (d.opts && d.opts.right) return d.opts.right;
    if (d.kind === 'receipt' && d.data && d.data.mode === 'counter') return '';
    if (d.kind === 'bill' && d.data && d.data.notIn) return 'markNotBilledCcpt';
    return SBU_DIALOG_RIGHT[d.kind] || '';
  }
  /* Role, date or Owner mode changed: re-read the rights; close a dialog whose right is gone; redraw. */
  function onContextChange() {
    if (!H) return Promise.resolve();
    return loadStatus().then(function () {
      var d = S.dialog;
      var need;
      if (d) {
        need = dialogRight(d);
        if (need && !rights()[need]) {
          closeDialog();
          toast(SBU_ERR.SVB_ACCESS_CHANGED);
        }
      }
      updateNav();
      return refreshJob();
    });
  }
  function clickEl(el) {
    var a = getAttr(el, 'data-svcs-action');
    if (!a) return Promise.resolve(fail('SVB_INTERNAL'));
    return dispatch(a, getAttr(el, 'data-svs-key'), el);
  }
  function phrases() {
    var seen = {};
    var out = [];
    var k;
    for (k in SBU_TEXT) { if (Object.prototype.hasOwnProperty.call(SBU_TEXT, k) && !seen[SBU_TEXT[k]]) { seen[SBU_TEXT[k]] = true; out.push(SBU_TEXT[k]); } }
    for (k in SBU_ERR) { if (Object.prototype.hasOwnProperty.call(SBU_ERR, k) && !seen[SBU_ERR[k]]) { seen[SBU_ERR[k]] = true; out.push(SBU_ERR[k]); } }
    return out.sort();
  }

  /* The members the Billing area file uses; frozen. */
  var SBU_KIT = Object.freeze({
    esc: esc, attr: attr, num: num, money: money, parsePaise: parsePaise, parseQty: parseQty, fill: fill, btn: btn, fld: fld, notice: notice, badge: badge,
    emptyHtml: emptyHtml, pagerHtml: pagerHtml, openDialog: openDialog, closeDialog: closeDialog, renderDialog: renderDialog, requestClose: requestClose,
    dialogMessage: dialogMessage, showFailure: showFailure, ownerStep: ownerStep, exclusive: exclusive, writeGate: writeGate, rights: rights, readSession: readSession,
    billing: facade, host: hostObj, errText: errText, today: today, fmtAt: fmtAt, istDay: istDay, validIso: validIso,
    print: function (kind, args) { return printDoc(Object.prototype.hasOwnProperty.call(SBU_PRINT, kind) ? kind : rawKind(kind), args || {}); }
  });
  function rawKind(type) {
    var k;
    for (k in SBU_PRINT) { if (Object.prototype.hasOwnProperty.call(SBU_PRINT, k) && SBU_PRINT[k] === type) return k; }
    return 'bill';
  }

  return Object.freeze({
    version: SBU_VERSION,
    mount: mount,
    unmount: unmount,
    refreshJob: refreshJob,
    onContextChange: onContextChange,
    openApproval: openApproval,
    taxInvoiceRoute: taxInvoiceRoute,
    closeGate: closeGate,
    allowsZeroFinal: allowsZeroFinal,
    blocksDelete: blocksDelete,
    jobBilled: jobBilled,
    jobNoCharge: jobNoCharge,
    afterCounterSale: afterCounterSale,
    click: clickEl,
    phrases: phrases,
    kit: SBU_KIT,
    internals: Object.freeze({
      esc: esc, attr: attr, money: money, parsePaise: parsePaise, parseQty: parseQty, parseRateBp: parseRateBp, rightsFor: rightsFor, errorText: errText, dispatch: dispatch,
      actions: Object.keys(ACT), TEXT: SBU_TEXT, ERR: SBU_ERR, BX: SBU_BX, state: function () { return S; }, rupeeText: rupeeText, estimateFigures: estimateFigures
    })
  });
});
