(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaagarServiceStoresUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Stores screens (Service Phase 1). Screens only: every write goes through the core facade given by host.core().
     No storage, no network, no messages, no timers. The role is read fresh from host.session() at every guard.
     Every control carries data-svcs-action; row context rides in data-svs-key; listeners are delegated. */

  var UI_VERSION = 1;
  var PAGE_STOCK = 25;
  var PAGE_LIST = 20;
  var PAGE_LEDGER = 50;
  var PAGE_OPEN = 25;
  var MAX_LINES = 100;
  var QTY_MAX = 100000;
  var STEP_UP_LABEL_MAX = 170;
  var NO_SESSION = Object.freeze({ ok: false, isOwner: false, isManager: false, role: '', tier: 'none', actorName: '' });
  var HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  var SHELL_STORE_ROLES = ['Cashier', 'CRO', 'Greeter', 'Technician', 'Assistant Technician', 'Trainee', 'Others'];

  /* One table: every failure code of every layer (store, FIFO, masters, documents) and of this file, in English. */
  var ERR = Object.freeze({
    ABOVE_MANAGER_LIMIT: "This is above the Store Manager limit. The Owner must approve it.",
    ACTIVE_NOT_EDITABLE: "Use deactivate or reactivate to change the active state.",
    ALREADY_ACTIVE: "This item is already active.",
    ALREADY_INACTIVE: "This item is already inactive.",
    ALREADY_REVERSED: "This entry was already reversed.",
    AMOUNT_MISMATCH: "The amount does not match quantity times price.",
    ARGS_INVALID: "The request was not complete.",
    ASOF_INVALID: "The as-of date is not valid.",
    AT_BEFORE_LAST: "The time is earlier than the last stock entry.",
    AT_INVALID: "The time is not a valid date and time.",
    BACKDATE_NOT_ALLOWED: "Entries are always dated today.",
    BAD_AMOUNT: "The amount is not valid.",
    BAD_QTY: "The quantity is not valid.",
    BIN_INVALID: "The bin may use up to 20 letters, digits, spaces, dot, slash, underscore and hyphen.",
    CANNOT_REVERSE_REVERSAL: "A reversal cannot be reversed. Post the action again.",
    CODE_CHANGE_NOT_ALLOWED: "A code can never be changed after it is created.",
    COST_INVALID: "The unit cost must be a whole number of paise from 0 to 100,000,000.",
    COST_REQUIRED: "Enter a unit cost above zero (without GST).",
    DEBT_ALREADY_SETTLED: "The shortfall created by this entry was already covered by a later receipt.",
    DEPENDENCY_MISSING: "The stock check needed for this action is not available.",
    DEPS_INVALID: "Stores is not ready. Close and open the Service module again.",
    DIRECTION_INVALID: "The direction must be up or down.",
    DOC_NOT_FOUND: "That posting was not found.",
    DUPLICATE_LINE: "The same part appears twice. Combine the lines.",
    DUPLICATE_REF: "This was already saved. Check the list before posting again.",
    DUPLICATE_SUPPLIER_INVOICE: "This supplier invoice was already received.",
    FLAG_INVALID: "A flag is not known or is not yes or no.",
    GROUP_INVALID: "The group must be 1 to 40 characters, with no control characters, and must not start with = or @.",
    GROUP_REQUIRED: "A group is required.",
    GST_RATE_FRACTION_WARNING: "This GST rate is below 1 percent. Check that it was not typed as a fraction.",
    GST_RATE_INVALID: "GST rate must be blank or between 0 and 100 percent with at most 2 decimals.",
    HAS_MOVEMENTS: "This item has stock movements. It can be deactivated but not deleted.",
    HAS_REFERENCES: "This item is used in another record. It can be deactivated but not deleted.",
    HSN_INVALID: "HSN must be blank or 4, 6 or 8 digits.",
    INPUT_INVALID: "Some details are missing or not valid.",
    INSUFFICIENT_STOCK: "Not enough stock. Nothing was posted.",
    INTERNAL_ERROR: "Something went wrong. Nothing was changed.",
    ISSUE_HAS_RETURNS: "This issue has returns. Reverse the returns first.",
    ISSUE_LINE_NOT_FOUND: "The issue line being returned was not found for this job.",
    ISSUE_NOT_FOUND: "The issue to return was not found.",
    ISSUE_NOT_JOB: "That entry is not an issue to a job.",
    ISSUE_REVERSED: "That issue has been reversed.",
    JOB_CLOSED: "This job is closed. Parts cannot be issued or returned on it.",
    JOB_IS_STUB: "This job is a placeholder (stub). Check the job details later.",
    JOB_NOT_FOUND: "The service job was not found.",
    KIND_INVALID: "The kind of master is not known.",
    LAYER_PARTLY_CONSUMED: "Part of this stock layer has already been used. Reverse the later entries first.",
    LEDGER_BAD_RECORD: "A stock ledger record is malformed.",
    LEDGER_GAP: "The stock ledger has a missing or repeated sequence number.",
    LEDGER_MISMATCH: "A stock ledger record does not match its recomputed cost layers.",
    LEDGER_ORDER: "The stock ledger times go backwards.",
    LINES_REQUIRED: "Add at least one line.",
    MASTER_FULL: "The master has reached its size limit.",
    MOVEMENT_NOT_FOUND: "The entry to reverse was not found.",
    NAME_DUPLICATE_WARNING: "Another active item has the same name.",
    NAME_INVALID: "The name must be 1 to 80 characters, with no control characters, and must not start with = or @.",
    NAME_REQUIRED: "A name is required.",
    NEGATIVE_OVERRIDE_USED: "Stock went below zero by the Owner override.",
    NOT_ALLOWED: "Your role cannot do this in the store.",
    NOT_COUNTER_SALEABLE: "This part is not marked as counter saleable.",
    NOT_FOUND: "This item was not found.",
    NOT_REVERSIBLE: "This posting cannot be reversed. Use a return or an adjustment.",
    NO_CHANGE: "Nothing changed.",
    OLD_NOTE_REQUIRED: "Write a note of at least 5 characters.",
    OLD_NOT_FOUND: "The old part entry was not found.",
    OLD_TRANSITION_INVALID: "An old part cannot move that way.",
    OPENING_AFTER_ACTIVITY: "Opening stock can only be set before any other entry for the part.",
    OPENING_ALREADY_SET: "Opening stock was already set for this part. Use an adjustment.",
    OPENING_EXISTS: "This part already has an opening stock entry.",
    OPENING_NOT_REVERSIBLE: "Opening stock cannot be reversed. Post an adjustment.",
    OPENING_PROPOSAL_OPEN: "Another opening proposal already holds this part.",
    OVERRIDE_NOTE_REQUIRED: "Type a note of at least 3 characters to explain the override.",
    PART_CODE_DUPLICATE: "This code already exists.",
    PART_CODE_INVALID: "The part code is not valid. Use letters, digits, dot, slash, underscore or hyphen.",
    PART_CODE_REQUIRED: "A code is required.",
    PART_CODE_SCIENTIFIC: "This code looks like a number that Excel changed to scientific form. Type it as text.",
    PART_CODE_ZERO_VARIANT: "Another code is the same except for leading zeros.",
    PART_HAS_MOVEMENTS: "This part already has stock movements. Opening stock cannot be set now.",
    PART_INACTIVE: "This part is switched off. Switch it on in Parts and labour first.",
    PART_MISMATCH: "The part does not match the issue.",
    PART_NOT_FOUND: "This part was not found.",
    PART_UNKNOWN: "This part code is not in the parts master.",
    PAST_VIEW: "You are viewing a past date. Stock cannot be changed.",
    PAYMODE_INVALID: "Choose Cash, UPI, Card or Other.",
    PIN_REQUIRED: "Owner approval was not given. Nothing was changed.",
    PRICE_BASIS_INVALID: "Price includes tax must be yes or no.",
    PRICE_BASIS_REQUIRED: "Choose whether the price includes tax.",
    PRICE_INVALID: "The price must be a whole number of paise from 0 to 1,000,000,000.",
    PRICE_ZERO_WARNING: "The price is zero.",
    PURPOSE_INVALID: "The purpose is not known.",
    QTY_INVALID: "Quantity must be a whole number from 1 to 100000.",
    REASON_INVALID: "Choose a valid reason.",
    REASON_REQUIRED: "Type a reason of at least 5 characters.",
    REASON_SIGN_MISMATCH: "This reason does not match increasing or decreasing stock.",
    REAUTH_REQUIRED: "Owner PIN confirmation is required for this action.",
    REF_INVALID: "A reference field is not allowed or not valid.",
    REF_REQUIRED: "A required reference (GRN, line, job or sale) is missing.",
    REORDER_INVALID: "Reorder numbers must be whole numbers from 0 to 100000.",
    REORDER_QTY_ZERO_WARNING: "A reorder level is set but the reorder quantity is zero.",
    RETURN_DEBT_SETTLED: "This return reaches a shortfall that a later receipt already covered. Use an adjustment.",
    RETURN_EXCEEDS_ISSUE: "More is being returned than was issued.",
    RETURN_JOB_MISMATCH: "The job does not match the issue.",
    RETURN_REASON_INVALID: "Choose why the part is being returned.",
    REVERSAL_BLOCKED: "Some of this stock has already been used, so it cannot be reversed.",
    REV_CONFLICT: "Another screen changed this item. Reload and try again.",
    ROLE_DENIED: "Your role cannot do this. Ask the Store Manager or the Owner.",
    SAC_INVALID: "SAC must be blank or 4 or 6 digits.",
    SELF_APPROVAL: "You cannot approve a request you made yourself.",
    APPROVER_NAME_REQUIRED: "Sign in with your own staff name first. A Store Manager approval must show who approved it.",
    PROPOSER_NAME_MISSING: "This request was sent without a staff name, so only the Owner can approve it.",
    SESSION_INVALID: "Your session could not be read. Sign in again.",
    SESSION_REQUIRED: "Your session could not be read. Sign in again.",
    SIGNOFF_EMPTY: "No old parts are waiting for sign-off.",
    SIGNOFF_MONTH_OPEN: "A month can be signed off only after it has ended.",
    STATE_INVALID: "This entry is not in a state where this can be done.",
    STOCK_ON_HAND_WARNING: "This code has stock on hand. It is now inactive; the stock is still counted.",
    SUPPLIER_INVOICE_DATE_INVALID: "The supplier invoice date is not valid.",
    SUPPLIER_INVOICE_REQUIRED: "Enter the supplier invoice number.",
    SVCS_ACK_NOT_ALLOWED: "Nothing can be acknowledged right now.",
    SVCS_ACTOR_INVALID: "No signed-in user was found. Sign in again.",
    SVCS_ARGS_INVALID: "The request was not valid. Check the entries and try again.",
    SVCS_BLOCKED: "Stores data failed its safety check. Nothing can be posted. Restore your latest backup.",
    SVCS_BODY_FORBIDDEN_FIELD: "This entry has a field that is not allowed.",
    SVCS_BODY_NOT_CANONICAL: "A value in this entry cannot be stored.",
    SVCS_CHAIN_BREAK: "Stores data failed its safety check. Nothing can be posted. Restore your latest backup.",
    SVCS_CLOCK_BACK: "The tablet clock is earlier than the last posting. Fix the clock or ask the Owner.",
    SVCS_DOC_TOO_LARGE: "This posting is too large. Split it.",
    SVCS_DUPLICATE_REF: "This was already saved. Check the list before posting again.",
    SVCS_FIFO_MISMATCH: "Stores data failed its safety check. Nothing can be posted. Restore your latest backup.",
    SVCS_HEAD_AHEAD: "Stores data failed its safety check. Nothing can be posted. Restore your latest backup.",
    SVCS_HEAD_BEHIND: "A save was not finished. Reopen Stores and check before posting again.",
    SVCS_HEAD_INVALID: "Stores data failed its safety check. Nothing can be posted. Restore your latest backup.",
    SVCS_HEAD_MISSING: "Stores data failed its safety check. Nothing can be posted. Restore your latest backup.",
    SVCS_HEAD_WRITE_FAILED: "Could not confirm the save. Reopen Stores and check before posting again.",
    SVCS_OWNER_REQUIRED: "Only the Owner can do this, after the PIN check.",
    SVCS_PREFIX_VIOLATION: "The save was stopped because stored data changed unexpectedly. Reopen Stores.",
    SVCS_READBACK_MISMATCH: "Could not confirm the save. Reopen Stores and check before posting again.",
    SVCS_REV_CONFLICT: "Stores changed on another screen. Reload and try again.",
    SVCS_SEQ_GAP: "Stores data failed its safety check. Nothing can be posted. Restore your latest backup.",
    SVCS_SERIES_GAP: "Stores data failed its safety check. Nothing can be posted. Restore your latest backup.",
    SVCS_SERIES_MISMATCH: "The posting number changed. Reload and try again.",
    SVCS_SERIES_TOO_LONG: "The number would be too long.",
    SVCS_SHARD_MISSING: "Stores data failed its safety check. Nothing can be posted. Restore your latest backup.",
    SVCS_SHARD_NOT_ARRAY: "Stores data failed its safety check. Nothing can be posted. Restore your latest backup.",
    SVCS_SHARD_UNREADABLE: "Stores data failed its safety check. Nothing can be posted. Restore your latest backup.",
    SVCS_STORAGE_UNAVAILABLE: "Storage is not ready yet. Wait a moment and try again.",
    SVCS_WATERMARK_AHEAD: "This data is older than what this device last saw. Ask the Owner.",
    SVCS_WATERMARK_FORK: "This data differs from what this device last saw. Ask the Owner.",
    SVCS_WATERMARK_WRITE_FAILED: "The device check mark could not be saved.",
    SVCS_WRITE_FAILED: "Could not confirm the save. Reopen Stores and check before posting again.",
    SVS_ACCESS_CHANGED: "Your access changed. Nothing was saved.",
    SVS_BAD_REPLY: "Something went wrong. Nothing was changed. Code: {code}.",
    SVS_BLOCKED_PAGE: "The stock data failed its safety check. Nothing can be posted.",
    SVS_BUSY: "Another save is in progress. Wait a moment.",
    SVS_CORE_MISSING: "Stores is not available in this build. Nothing was changed.",
    SVS_DATE_FUTURE: "The date cannot be in the future.",
    SVS_DATE_INVALID: "Enter a valid date.",
    SVS_DUPLICATE_LINE: "This part is already on another line. Combine the quantities.",
    SVS_FIELD_REQUIRED: "This field is required.",
    SVS_INTEGRITY: "The stock ledger failed its check. Posting is stopped. Tell the Owner.",
    SVS_INTERNAL: "Something went wrong. Nothing was changed. Code: {code}.",
    SVS_JOB_CLOSED: "This order is closed. Parts cannot be issued or returned.",
    SVS_JOB_HAS_PARTS: "Parts are still issued to this order. Return them to stores first.",
    SVS_JOB_INVOICED: "A tax invoice is issued for this order. Parts cannot be issued or returned. Ask the Owner.",
    SVS_JOB_NOT_SAVED: "Save this service order first. Parts can be issued once it has a job number.",
    SVS_JOB_UNKNOWN: "That job number was not found.",
    SVS_MONEY_INVALID: "Enter an amount in rupees, for example 149.50.",
    SVS_NOTE_SHORT: "Type a note of at least 5 characters.",
    SVS_OWNER_ONLY: "Only the Owner can do this. Unlock Owner mode in the app header, then try again.",
    SVS_PART_REQUIRED: "Pick a part from the list.",
    SVS_PAST_VIEW: "You are viewing a past date. Stock cannot be changed.",
    SVS_PIN_DENIED: "Owner approval was not given. Nothing was changed.",
    SVS_PRINT_UNAVAILABLE: "Printing is not available in this build.",
    SVS_QTY_INVALID: "Enter a whole number from {min} to {max}.",
    SVS_REASON_SHORT: "Type a reason of at least 5 characters.",
    SVS_ROLE_DENIED: "Your role cannot do this. Ask the Store Manager or the Owner.",
    TAX_DETAILS_MISSING: "Tax details missing: this item cannot be used on an estimate or counter sale yet.",
    TEMPLATE_CUSTOMER_COLUMN: "The header has a column for personal details. Remove it.",
    TEMPLATE_DUPLICATE_IN_FILE: "The same code appears more than once in the pasted rows.",
    TEMPLATE_EMPTY: "Nothing was pasted.",
    TEMPLATE_FORMULA_LIKE: "A text cell must not start with = or @.",
    TEMPLATE_HAS_ERRORS: "The pasted rows have errors. Fix them and check again.",
    TEMPLATE_HEADER_MISMATCH: "The first line must be exactly the header shown.",
    TEMPLATE_NOTHING_TO_CREATE: "Every code in the pasted rows already exists. Nothing to create.",
    TEMPLATE_QUOTE_UNBALANCED: "A quote mark is not closed on this line.",
    TEMPLATE_ROW_WIDTH: "This row does not have the same number of columns as the header.",
    TEMPLATE_TOO_LARGE: "The pasted text is too large.",
    TEMPLATE_TOO_MANY_ROWS: "Too many rows. Paste at most 200 rows at a time.",
    TOO_MANY_LINES: "One posting can hold at most 100 lines.",
    UNIT_INVALID: "This unit is not allowed for this kind of item.",
    UNIT_PRICE_INVALID: "Selling price must be zero or more.",
    WRITEOFF_OWNER_ONLY: "Write-offs can only be approved by the Owner.",
    WRITE_FAILED: "The change could not be saved. Nothing was changed."
  });

  /* Every fixed English phrase of the Stores screens (no HTML characters inside; numbers go in their own spans). */
  var TEXT = Object.freeze({
    add_line: 'Add line',
    add_part: 'Add part',
    adj_all: 'All adjustments',
    adj_approved: 'Adjustment approved and posted.',
    adj_empty: 'Nothing is waiting for approval.',
    adj_limit: 'Store Manager adjustment limit (Rs)',
    adj_limit_hint: 'Zero means every adjustment needs the Owner PIN. Write-offs always need the Owner.',
    adj_new: 'Propose adjustment',
    adj_note_info: 'A proposal never changes stock until it is approved.',
    adj_proposed: 'Adjustment proposal {id} saved. It changes no stock until it is approved.',
    adj_send: 'Send for approval',
    adj_state_posted: 'Approved',
    adj_state_proposed: 'Waiting',
    adj_state_rejected: 'Rejected',
    adj_state_withdrawn: 'Withdrawn',
    adj_title: 'Stock adjustment',
    adj_waiting: 'Waiting for approval',
    all_groups: 'All groups',
    apply: 'Apply',
    approve: 'Approve',
    approve_now: 'Approve now',
    approve_owner: 'Approve (Owner)',
    back: 'Back',
    badge_low: 'Low',
    badge_off: 'Off',
    badge_ok: 'OK',
    badge_out: 'Out',
    balance: 'Balance',
    bill_chargeable: 'Chargeable',
    bill_warranty: 'Warranty (no charge)',
    billing: 'Billing',
    bin_claim: 'Claim bin',
    bin_scrap: 'Scrap bin',
    blocked_restore: 'Restore your latest backup. No data can be changed here until the check passes.',
    cancel: 'Cancel',
    ccpt_hint: 'Optional. The number of the invoice made in the billing software.',
    ccpt_invoice: 'Billing software invoice number',
    check_again: 'Check again',
    chip_ledger_bad: 'Ledger check failed',
    chip_ledger_ok: 'Ledger OK',
    chip_past: 'Past date: read-only',
    chip_view_only: 'View only',
    claim_ref: 'Claim reference',
    clear: 'Clear',
    clear_search: 'Clear search',
    close: 'Close',
    closed_core: 'Stores is not available in this build. Nothing was changed.',
    closed_session: 'Your session could not be read. Stores is closed. Go back to Home and sign in again.',
    condition_note: 'Condition note',
    counted_qty: 'Counted quantity',
    cs_empty: 'No counter sales today.',
    cs_notice: 'Counter sale money is taken as a receipt in Billing and goes to the cash book.',
    cs_save: 'Record counter sale',
    cs_saved: 'Counter sale recorded: {qty} x {code}.',
    cs_today: 'Counter sales today',
    decrease: 'decrease',
    diagnostics: 'Diagnostics (select and copy by hand)',
    dir_down: 'Decrease',
    dir_down_only: 'This reason can only decrease stock.',
    dir_up: 'Increase',
    dir_up_only: 'This reason can only increase stock.',
    direction: 'Direction',
    discard: 'Discard',
    discard_ask: 'Discard what you typed?',
    edit: 'Edit',
    err_stock_onhand: 'Not enough stock. On hand: {n}.',
    fifo_cost: 'FIFO cost',
    fifo_value: 'FIFO value',
    first_state: 'First state',
    fix_entries: 'Some entries need fixing. Nothing was saved.',
    from: 'From',
    grn_empty: 'No goods received yet. Press New goods receipt when a parcel arrives.',
    grn_new: 'New goods receipt',
    grn_save: 'Save receipt',
    grn_saved: 'Receipt {no} saved: {lines} lines, {pieces} pieces.',
    grn_title: 'New goods receipt',
    grn_view_title: 'Goods receipt',
    group: 'Group',
    gst: 'GST',
    hsn: 'HSN',
    in: 'In',
    increase: 'increase',
    inv_invalid: 'Use letters, digits, slash, dot, underscore or hyphen only, with no spaces.',
    inv_qty_low: 'The invoice quantity cannot be less than the quantity received.',
    issued: 'Issued',
    job_add_estimate: 'Add it to the estimate yourself.',
    job_empty: 'No parts issued to this order yet.',
    job_issue: 'Issue part',
    job_issue_save: 'Issue to job',
    job_issued: 'Issued {qty} x {code} to {job}.',
    job_no: 'Job number',
    job_no_hint: 'Optional. Leave blank for a part that is not tied to a job.',
    job_old_hint: 'A faulty part taken off the watch goes to Old parts, not back to stock.',
    job_pieces: 'pieces with this job',
    job_register_old: 'Register old part',
    job_return_save: 'Return to stock',
    job_returned: 'Returned {qty} x {code} from {job}.',
    job_staff_note: 'Parts are issued by the Store Manager.',
    job_sub: 'Issued from stock to this order',
    job_title: 'Parts from stores',
    keep_editing: 'Keep editing',
    last_posting: 'Last posting on this data:',
    ledger: 'Ledger',
    ledger_empty: 'No movements in this period.',
    ledger_title: 'Stock ledger',
    line: 'Line',
    lines: 'Lines',
    lines_word: 'lines',
    loading: 'Loading...',
    masters_missing: 'Parts and labour is not available in this build.',
    month: 'Month',
    month_hint: 'Only a month that has ended can be signed off.',
    move: 'Move',
    move_to: 'Move to',
    next: 'Next',
    not_set: 'Not set',
    note: 'Note',
    of: 'of',
    old_desc: 'Description of the old part',
    old_empty: 'No old parts registered yet.',
    old_filter_all: 'All old parts',
    old_filter_open: 'Not finished',
    old_held: 'Held for claim',
    old_move_info: 'Choosing Customer Returned means the part leaves the premises with the customer. No name is typed into Stores.',
    old_move_note_hint: 'At least 5 characters when moving to Scrap pending or back to Held for claim.',
    old_move_title: 'Move old part',
    old_moved: 'Old part moved.',
    old_new: 'Register old part',
    old_part_opt: 'Part code (optional)',
    old_returned: 'Customer Returned',
    old_saved: 'Old part registered.',
    old_scrap_pending: 'Scrap pending Owner sign-off',
    old_scrapped: 'Scrapped',
    old_signoff: 'Scrap sign-off',
    old_signoff_owner: 'Scrap sign-off (Owner)',
    old_title: 'Register old part',
    on_hand: 'On hand',
    open_all_set: 'Every active part has opening stock.',
    open_dated_today: 'Opening stock is dated today.',
    open_keep_note: 'Entries are kept only until you leave Stores.',
    open_no_parts: 'No active parts yet. Add parts in Parts and labour first.',
    open_nothing: 'Type a counted quantity and a cost for at least one part.',
    open_once: 'This can be done only once per part.',
    open_pending: 'Waiting for approval',
    open_post_btn: 'Post opening stock',
    open_post_title: 'Post opening stock',
    open_posted: 'Opening stock posted: {n} parts, {pieces} pieces.',
    open_propose: 'Send for approval',
    open_review: 'Review and post',
    open_send_btn: 'Send for approval',
    open_send_info: 'The Owner approves it with the PIN. Stock does not change until then.',
    open_send_title: 'Send opening stock for approval',
    open_sent: 'Opening stock sent for approval: {n} parts.',
    open_set_for: 'Opening stock is set for',
    open_view_only: 'Opening stock is entered by the Store Manager or the Owner.',
    open_without: 'parts still without opening stock',
    out: 'Out',
    override_btn: 'Issue anyway (Owner)',
    override_cost: 'Cost per piece (Rs, without GST)',
    override_cost_hint: 'Needed only when this part was never received. Otherwise the latest receipt cost is used.',
    override_info: 'The Owner can issue beyond stock with the PIN and a note of at least 3 characters. Stock will go negative.',
    override_owner_only: 'Only the Owner can issue beyond stock.',
    page: 'Page',
    part: 'Part',
    parts_total: 'Matching parts',
    parts_word: 'parts',
    pay_card: 'Card',
    pay_cash: 'Cash',
    pay_mode: 'Pay mode',
    pay_other: 'Other',
    pay_upi: 'UPI',
    pick_none: 'No matching part.',
    pieces: 'Pieces',
    pieces_word: 'pieces',
    pin_ack: 'Acknowledge restored Stores data on this device',
    pin_adj_generic: 'Approve stock adjustment {id}',
    pin_adj_many: 'Approve stock adjustment {no}: {n} lines, value {amount}',
    pin_adj_one: 'Approve stock adjustment {no}: {dir} {qty} of {code} ({reason}), value {amount}',
    pin_clock: 'Post with the tablet clock behind the last posting. The entry keeps the time of the last posting.',
    pin_open_post: 'Post opening stock: {n} parts, {pieces} pieces, value {amount}. Once per part.',
    pin_override: 'Issue beyond stock: {qty} of {code} to {job}. On hand {n}. Stock will go negative.',
    pin_reverse_adj: 'Reverse adjustment {no}. Stock will change back.',
    pin_reverse_cs: 'Reverse counter sale {no}. Stock will go back up.',
    pin_reverse_grn: 'Reverse goods receipt {no}: {pieces} pieces, value {amount}. Stock will go down.',
    pin_settings: 'Change Stores settings: Store Manager adjustment limit {amount}, {n} store roles',
    pin_signoff: 'Sign off scrap for {month}: {n} old parts will be marked scrapped',
    prev: 'Prev',
    print_adj: 'Print adjustment register',
    print_grn: 'Print receipt',
    print_ledger: 'Print ledger',
    print_old: 'Print old parts register',
    print_reorder: 'Print reorder list',
    print_stock: 'Print stock list',
    qty: 'Quantity',
    qty_invoiced: 'Quantity on invoice',
    qty_invoiced_hint: 'Optional. A smaller received quantity is recorded as short.',
    qty_received: 'Quantity received',
    qty_short: 'Short',
    reason: 'Reason',
    reason_count: 'Count correction',
    reason_damaged: 'Damaged',
    reason_found: 'Found',
    reason_hint: 'At least 5 characters.',
    reason_lost: 'Lost',
    reason_write_off: 'Write-off',
    reason_wrong_receipt: 'Wrong receipt',
    record: 'record',
    register: 'Register',
    reject: 'Reject',
    reject_info: 'Rejecting changes no stock.',
    reject_title: 'Reject proposal',
    rejected_done: 'Proposal rejected. No stock was changed.',
    remove: 'Remove',
    reorder_empty: 'Nothing is at or below its reorder level.',
    reorder_level: 'Reorder level',
    reorder_qty: 'Reorder quantity',
    restore_banner_text: 'This data is older than, or differs from, what this device last saw. A restore may have happened. Check it is intended before posting again.',
    restore_banner_title: 'Restored data found',
    ret_cancelled: 'Job cancelled',
    ret_unused: 'Not used',
    ret_wrong: 'Issued by mistake',
    return: 'Return',
    return_from_issue: 'Return from issue',
    return_reason: 'Why is it returned',
    returned: 'Returned',
    reverse: 'Reverse',
    reverse_confirm: 'Reverse',
    reverse_grn_warn: 'Reversing a receipt takes the stock out again. If part of it was already used, it cannot be reversed.',
    reverse_owner: 'Reverse (Owner)',
    reverse_title: 'Reverse document',
    reverse_warn: 'A reversal keeps the original entry and posts the opposite entry.',
    reversed_done: '{no} was reversed.',
    search: 'Search',
    search_ph: 'Search code or description',
    sell_price: 'Selling price',
    serial_ref: 'Serial or reference',
    settings_note: 'These settings are saved with the Owner PIN. Store roles may receive goods, issue parts, make counter sales and propose adjustments.',
    settings_save: 'Save settings',
    settings_saved: 'Stores settings saved.',
    show: 'Show',
    signoff_confirm: 'Sign off scrap',
    signoff_done: 'Scrap signed off.',
    signoff_empty: 'No scrap is waiting for sign-off.',
    signoff_title: 'Monthly scrap sign-off',
    starting: 'Stores is still starting. Try again in a moment.',
    status_posted: 'Posted',
    status_reversed: 'Reversed',
    stock_empty: 'No parts yet. Add a part in Parts and labour, then set opening stock.',
    stock_no_match: 'No parts match this search.',
    store_roles: 'Store roles',
    store_roles_hint: 'Tick the shell roles that may move stock. The Owner and the Store Manager always can.',
    stores: 'Stores',
    stores_sub: 'Service spares stock',
    stream: 'stream',
    supplier: 'Supplier',
    supplier_invoice: 'Invoice',
    supplier_invoice_date: 'Supplier invoice date',
    supplier_invoice_no: 'Supplier invoice number',
    tab_adjust: 'Adjustments',
    tab_counter: 'Counter sale',
    tab_masters: 'Parts and labour',
    tab_old: 'Old parts',
    tab_opening: 'Opening stock',
    tab_receive: 'Receive goods',
    tab_reorder: 'Reorder',
    tab_settings: 'Settings',
    tab_stock: 'Stock',
    tabs_label: 'Stores sections',
    tax_missing: 'Tax details missing',
    to: 'To',
    type_adjust: 'Adjustment',
    type_counter: 'Counter sale',
    type_issue: 'Issue',
    type_opening: 'Opening',
    type_other: 'Entry',
    type_receipt: 'Receipt',
    type_return: 'Return',
    type_reversal: 'Reversal',
    unit_cost: 'Unit cost',
    unit_cost_ex: 'Cost per piece (Rs, excluding GST)',
    unit_cost_opt: 'Cost per piece (Rs, optional)',
    unit_cost_opt_hint: 'Only for an increase. Blank uses the latest receipt cost.',
    unit_price: 'Unit price (Rs)',
    value: 'Value',
    view: 'View',
    view_all: 'All parts',
    view_low: 'Low or out',
    view_off: 'Switched off',
    with_job: 'With job',
    withdraw: 'Withdraw',
    withdrawn: 'Proposal withdrawn.',
    wm_ack: 'Acknowledge restore',
    wm_ask_owner: 'Ask the Owner to confirm that this restore is intended.',
    wm_done: 'Restore acknowledged. Stores was reopened.',
    wm_reason: 'Reason for acknowledging',
    wm_reason_hint: 'At least 5 characters. The Owner PIN is asked next.'
  });
  function t(id) { return Object.prototype.hasOwnProperty.call(TEXT, id) ? TEXT[id] : id; }

  /* ---------- small pure helpers ---------- */

  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"'`]/g, function (c) { return HTML_ESC[c]; });
  }
  function attr(v) { return esc(v); }
  function num(n) { return '<span class="svs-num">' + esc(n) + '</span>'; }
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  function fill(str, vars) {
    return String(str).replace(/\{([a-z]+)\}/g, function (m, k) { return vars && vars[k] !== undefined ? String(vars[k]) : m; });
  }
  function firstOf(o, names) {
    var i;
    for (i = 0; i < names.length; i++) {
      if (o && o[names[i]] !== undefined && o[names[i]] !== null) return o[names[i]];
    }
    return undefined;
  }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function asText(v) { return v === null || v === undefined ? '' : String(v); }

  /* Indian digit grouping on the rupee part; always two decimals; null or NaN gives a dash. */
  function money(paise) {
    if (!isInt(paise)) return '-';
    var neg = paise < 0;
    var a = Math.abs(paise);
    var rupees = String(Math.floor(a / 100));
    var cents = a % 100;
    if (rupees.length > 3) {
      var head = rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
      rupees = head + ',' + rupees.slice(-3);
    }
    return (neg ? '-' : '') + 'Rs ' + rupees + '.' + (cents < 10 ? '0' : '') + cents;
  }

  /* Rupee text to integer paise without floats. */
  function parsePaise(text, opts) {
    var s = asText(text).replace(/,/g, '').replace(/^\s+|\s+$/g, '').replace(/^(rs\.?|\u20b9)\s*/i, '');
    var m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(s);
    if (!m) return { ok: false, code: 'SVS_MONEY_INVALID' };
    var frac = m[2] === undefined ? '00' : (m[2] + '0').slice(0, 2);
    var paise = parseInt(m[1], 10) * 100 + parseInt(frac, 10);
    if (paise === 0 && !(opts && opts.allowZero)) return { ok: false, code: 'SVS_MONEY_INVALID' };
    return { ok: true, paise: paise };
  }
  function parseQty(text, opts) {
    var min = opts && isInt(opts.min) ? opts.min : 1;
    var max = opts && isInt(opts.max) ? opts.max : QTY_MAX;
    var s = asText(text).replace(/^\s+|\s+$/g, '');
    if (!/^\d{1,6}$/.test(s)) return { ok: false, code: 'SVS_QTY_INVALID', min: min, max: max };
    var q = parseInt(s, 10);
    if (q < min || q > max) return { ok: false, code: 'SVS_QTY_INVALID', min: min, max: max };
    return { ok: true, qty: q };
  }

  function validIso(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asText(s));
    if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  function addDays(iso, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)).toISOString().slice(0, 10);
  }
  /* IST day of an ISO instant (UTC+5:30); a bare date passes through. */
  function istDay(at) {
    var s = asText(at);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var ms = Date.parse(s);
    if (!isFinite(ms)) return '';
    return new Date(ms + 19800000).toISOString().slice(0, 10);
  }
  function fmtAt(at) {
    var s = asText(at);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var ms = Date.parse(s);
    if (!isFinite(ms)) return s;
    return new Date(ms + 19800000).toISOString().slice(0, 16).replace('T', ' ');
  }
  function monthOf(iso) { return asText(iso).slice(0, 7); }
  function svsPrevMonth(iso) {
    var y = +asText(iso).slice(0, 4);
    var m = +asText(iso).slice(5, 7);
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
    return y + '-' + (m < 10 ? '0' : '') + m;
  }

  /* ---------- minimal DOM helpers (only selector forms: #id, [attr], [attr="v"]) ---------- */

  function qsa(container, sel) {
    if (!container || typeof container.querySelectorAll !== 'function') return [];
    var list;
    try { list = container.querySelectorAll(sel); } catch (e) { return []; }
    return Array.prototype.slice.call(list || []);
  }
  function qs(container, sel) {
    if (!container || typeof container.querySelector !== 'function') return null;
    try { return container.querySelector(sel); } catch (e) { return null; }
  }
  function getAttr(el, name) {
    return el && typeof el.getAttribute === 'function' ? el.getAttribute(name) : null;
  }
  function fieldValue(el) {
    if (!el) return '';
    if (el.type === 'checkbox') return !!el.checked;
    return el.value === undefined || el.value === null ? '' : String(el.value);
  }
  /* Copy every [data-svs-field] under container into data (lines by data-svs-line). */
  function captureFields(container, data) {
    var els = qsa(container, '[data-svs-field]');
    var i;
    for (i = 0; i < els.length; i++) {
      var name = getAttr(els[i], 'data-svs-field');
      var li = getAttr(els[i], 'data-svs-line');
      var v = fieldValue(els[i]);
      if (!name) continue;
      if (li !== null && li !== '') {
        var idx = parseInt(li, 10);
        if (!data.lines) data.lines = [];
        if (!data.lines[idx]) data.lines[idx] = {};
        data.lines[idx][name] = v;
      } else {
        data[name] = v;
      }
    }
    return data;
  }

  /* ---------- rights (mirror of the single role table; the docs layer is the authority) ---------- */

  function tierOf(s) {
    if (!s || s.ok !== true) return 'none';
    if (s.isOwner === true) return 'owner';
    if (s.isManager === true) return 'manager';
    return 'staff';
  }
  function normaliseSession(s) {
    if (!s || typeof s !== 'object' || s.ok !== true) return NO_SESSION;
    var tier = tierOf(s);
    return Object.freeze({
      ok: true,
      isOwner: tier === 'owner',
      isManager: tier === 'owner' || tier === 'manager',
      role: asText(s.role),
      tier: tier,
      actorName: asText(s.actorName)
    });
  }
  function rightsFor(session, cfg) {
    var s = normaliseSession(session);
    var tier = s.tier;
    var own = tier === 'owner';
    var mgr = own || tier === 'manager';
    var any = tier !== 'none';
    var roles = cfg && Array.isArray(cfg.storeRoles) ? cfg.storeRoles : [];
    var storeClass = tier === 'staff' && roles.indexOf(s.role) >= 0;
    var post = mgr || storeClass;
    var limit = cfg && isInt(cfg.adjustLimitPaise) ? cfg.adjustLimitPaise : 0;
    return {
      tier: tier,
      owner: own,
      manager: mgr,
      storeClass: storeClass,
      viewQty: any,
      viewCost: mgr,
      viewLedger: mgr,
      editMasters: mgr,
      openingPropose: post,
      openingPost: own,
      openingReject: mgr,
      receive: post,
      issue: post,
      returnPart: post,
      counterSale: post,
      reverseCounter: mgr,
      reverseCounterAnyDay: own,
      reverseDoc: own,
      proposeAdj: post,
      approveAdj: own,
      approveAdjMgr: tier === 'manager' && limit > 0,
      adjustLimitPaise: limit,
      rejectProposal: mgr,
      oldPartRegister: post,
      oldPartMove: mgr,
      scrapSignoff: own,
      settings: own,
      acknowledge: own,
      override: own
    };
  }
  var OWNER_KEYS = { openingPost: 1, approveAdj: 1, reverseDoc: 1, scrapSignoff: 1, settings: 1, acknowledge: 1, override: 1 };

  /* ---------- state (memory only) ---------- */

  var H = null;
  var S = freshState();

  function blankCs() {
    return { partCode: '', partName: '', partSearch: '', masterPricePaise: null, qty: '1', price: '', payMode: 'CASH', ccpt: '', note: '' };
  }
  function freshState() {
    return {
      tab: 'stock', active: false, busy: false, tok: 0, counter: 0,
      status: null, cfg: { adjustLimitPaise: 0, storeRoles: [] },
      dialog: null, pickRows: {}, groups: [], csError: '',
      f: { stock: { text: '', group: '', view: 'all', page: 1 }, grn: { page: 1 }, adj: { state: 'PROPOSED' }, old: { state: 'OPEN' }, open: { page: 1, text: '' } },
      cs: blankCs(), set: null, wmReason: '',
      job: { mode: null, form: {}, id: '', error: '' },
      opening: { rows: {}, parts: null, asAt: '' },
      masters: null, mastersEl: null, layer: null, binds: [], vv: null
    };
  }

  /* ---------- host and core access ---------- */

  function nowIso() {
    var v = H && typeof H.nowIso === 'function' ? H.nowIso() : '';
    return v ? String(v) : new Date().toISOString();
  }
  function nowMs() {
    var ms = Date.parse(nowIso());
    return isFinite(ms) ? ms : new Date().getTime();
  }
  function todayIso() {
    var v = H && typeof H.today === 'function' ? H.today() : '';
    return validIso(v) ? v : istDay(nowIso());
  }
  function readSession() {
    var s = null;
    try { s = H && typeof H.session === 'function' ? H.session() : null; } catch (e) { s = null; }
    return normaliseSession(s);
  }
  function rights() { return rightsFor(readSession(), S.cfg); }
  function isPast() {
    try { return !!(H && typeof H.isPast === 'function' && H.isPast()); } catch (e) { return false; }
  }
  function coreObj() {
    var c = null;
    try { c = H && typeof H.core === 'function' ? H.core() : null; } catch (e) { c = null; }
    return c && typeof c === 'object' ? c : null;
  }
  function toast(msg) {
    try { if (H && typeof H.toast === 'function') H.toast(String(msg)); } catch (e) { /* the toast is a courtesy */ }
  }
  function newRef() {
    S.counter += 1;
    return 'svs-' + nowMs().toString(36) + '-' + S.counter;
  }
  function fail(code, detail) { return { ok: false, code: code, detail: detail }; }
  function thrown(e) { return fail('SVS_INTERNAL', { message: String(e && e.message ? e.message : e) }); }

  function normalise(r) {
    if (Array.isArray(r)) return { ok: true, rows: r, states: r };
    if (r && r.ok === true) return r;
    return { ok: false, code: (r && r.code) ? String(r.code) : 'SVS_BAD_REPLY', message: r && r.message, detail: r && r.detail };
  }
  /* Call a core method; sync or promise replies both work; nothing throws out. */
  function callCore(name, args) {
    var c = coreObj();
    if (!c || typeof c[name] !== 'function') return Promise.resolve(fail('SVS_CORE_MISSING'));
    var out;
    try { out = c[name].apply(c, args || []); } catch (e) { return Promise.resolve(thrown(e)); }
    return Promise.resolve(out).then(normalise, function (e) { return thrown(e); });
  }
  /* A posting. Same as callCore, plus the Owner route for a tablet clock behind the last posting (SVCS_CLOCK_BACK). */
  function callWrite(name, args) {
    return callCore(name, args).then(function (r) {
      if (r.ok || r.code !== 'SVCS_CLOCK_BACK') return r;
      return clockOverride(name, args || [], r);
    });
  }
  /* The Owner override for a clock that is behind: the Owner PIN, then the same write again with clockOverride on.
     Anyone else, a cancelled PIN or a role change keeps the first refusal ("Fix the clock or ask the Owner"). */
  function clockOverride(name, args, first) {
    var s = readSession();
    var last = args.length ? args[args.length - 1] : null;
    if (s.ok !== true || s.isOwner !== true || !last || typeof last !== 'object' || last.clockOverride === true) return Promise.resolve(first);
    return ownerStep(t('pin_clock'), function (ctx) {
      var again = args.slice(0, args.length - 1);
      var c2 = makeCtx(ctx.session, ctx.stepUp, last.clientRef || ctx.clientRef);
      c2.clockOverride = true;
      again.push(c2);
      return callCore(name, again);
    }).then(function (r) { return r.ok || (r.code !== 'SVS_PIN_DENIED' && r.code !== 'SVS_OWNER_ONLY' && r.code !== 'SVS_ROLE_DENIED') ? r : first; });
  }
  function makeCtx(session, stepUp, clientRef) {
    return { session: session, stepUp: stepUp || null, clientRef: clientRef || '' };
  }
  function errText(r) {
    var code = r && r.code ? String(r.code) : 'SVS_BAD_REPLY';
    var d = r && r.detail;
    if (code === 'SVS_QTY_INVALID') return fill(ERR.SVS_QTY_INVALID, { min: r.min, max: r.max });
    if (code === 'INSUFFICIENT_STOCK' && d) {
      var have = isInt(d.available) ? d.available : (isInt(d.onHand) ? d.onHand : (isInt(d.balance) ? d.balance : null));
      if (have !== null) return fill(t('err_stock_onhand'), { n: have < 0 ? 0 : have });
    }
    if (code === 'SVS_INTERNAL' || code === 'SVS_BAD_REPLY') {
      var extra = d && d.message ? ' ' + String(d.message).slice(0, 160) : '';
      return fill(ERR.SVS_INTERNAL, { code: code }) + extra;
    }
    if (!ERR[code]) return fill(ERR.SVS_BAD_REPLY, { code: code });
    return ERR[code];
  }

  /* Owner step-up (pattern P): the caller has done the cheap checks; here: PIN, then re-read the session, then the work.
     reauth must resolve exactly true; a rejection or anything else is a refusal and the core is not called. */
  function ownerStep(label, work, ref) {
    var first = readSession();
    if (first.ok !== true) return Promise.resolve(fail('SVS_ROLE_DENIED'));
    if (first.isOwner !== true) return Promise.resolve(fail('SVS_OWNER_ONLY'));
    if (!H || typeof H.reauth !== 'function') return Promise.resolve(fail('SVS_PIN_DENIED'));
    var asked;
    try { asked = Promise.resolve(H.reauth(String(label).slice(0, STEP_UP_LABEL_MAX))); } catch (e) { return Promise.resolve(fail('SVS_PIN_DENIED')); }
    return asked.then(function (ok) { return ok === true; }, function () { return false; }).then(function (ok) {
      if (!ok) return fail('SVS_PIN_DENIED');
      var again = readSession();
      if (again.ok !== true || again.isOwner !== true) return fail('SVS_OWNER_ONLY');
      return work(makeCtx(again, { ok: true, at: nowMs() }, ref || newRef()));
    });
  }

  /* One exclusive action at a time: a second press while busy is refused with SVS_BUSY. */
  function exclusive(fn) {
    if (S.busy) {
      var b = fail('SVS_BUSY');
      showFailure(b);
      return Promise.resolve(b);
    }
    S.busy = true;
    var p;
    try { p = Promise.resolve(fn()); } catch (e) { p = Promise.resolve(thrown(e)); }
    return p.then(function (r) { S.busy = false; return r; }, function (e) {
      S.busy = false;
      var f = thrown(e);
      showFailure(f);
      return f;
    });
  }

  /* Checks shared by every write: a readable session, not a past view, one named right. Returns a failure or null. */
  function writeGate(rightKey) {
    var s = readSession();
    if (s.ok !== true) return fail('SVS_ROLE_DENIED');
    if (isPast()) return fail('SVS_PAST_VIEW');
    if (rightKey) {
      var R = rightsFor(s, S.cfg);
      if (!R[rightKey]) return fail(OWNER_KEYS[rightKey] && R.tier !== 'none' ? 'SVS_OWNER_ONLY' : 'SVS_ROLE_DENIED');
    }
    /* A failed ledger check stops every write except settings and the restore acknowledgement (forced clicks included). */
    if (!integrityOk() && rightKey !== 'settings' && rightKey !== 'acknowledge') return fail('SVS_INTEGRITY');
    return null;
  }

  /* ---------- html builders (every dynamic value goes through esc or attr) ---------- */

  function cls() {
    var out = [];
    var i;
    for (i = 0; i < arguments.length; i++) { if (arguments[i]) out.push(arguments[i]); }
    return out.join(' ');
  }
  function btn(action, label, o) {
    o = o || {};
    var h = '<button type="button" class="' + attr(cls('svs-btn', o.cls)) + '" data-svcs-action="' + attr(action) + '"';
    if (o.key !== undefined && o.key !== null) h += ' data-svs-key="' + attr(o.key) + '"';
    if (o.focus) h += ' data-svs-focus="1"';
    if (o.disabled) h += ' disabled';
    if (o.title) h += ' title="' + attr(o.title) + '"';
    return h + '>' + esc(label) + '</button>';
  }
  function optionsHtml(options, current) {
    var h = '';
    var i;
    for (i = 0; i < options.length; i++) {
      h += '<option value="' + attr(options[i].v) + '"' + (String(options[i].v) === String(current) ? ' selected' : '') + '>' + esc(options[i].l) + '</option>';
    }
    return h;
  }
  /* A labelled field. o: name, label, value, kind (text|select|textarea|check|date), options, mode, max, req, err, hint, line, ro, focus, enter, ph, caps */
  function fld(o) {
    var id = 'svs-f-' + idScope + o.name.replace(/[^a-z0-9]/gi, '-') + (o.line !== undefined ? '-' + o.line : '');
    var common = ' id="' + attr(id) + '" data-svs-field="' + attr(o.name) + '"';
    if (o.line !== undefined) common += ' data-svs-line="' + attr(o.line) + '"';
    if (o.focus) common += ' data-svs-focus="1"';
    if (o.enter) common += ' data-svs-enter="' + attr(o.enter) + '"';
    if (o.req) common += ' aria-required="true"';
    if (o.err) common += ' aria-invalid="true" aria-describedby="' + attr(id) + '-err"';
    if (o.ro) common += ' readonly';
    var kind = o.kind || 'text';
    var control;
    if (kind === 'select') {
      control = '<select class="svs-input"' + common + '>' + optionsHtml(o.options || [], o.value) + '</select>';
    } else if (kind === 'textarea') {
      control = '<textarea class="svs-input" rows="2"' + common + (o.max ? ' maxlength="' + attr(o.max) + '"' : '') + '>' + esc(o.value) + '</textarea>';
    } else if (kind === 'check') {
      control = '<input type="checkbox" class="svs-check"' + common + (o.value ? ' checked' : '') + '>';
    } else {
      control = '<input type="' + (kind === 'date' ? 'date' : 'text') + '" class="svs-input"' + common + ' value="' + attr(o.value === undefined ? '' : o.value) + '"' +
        (o.max ? ' maxlength="' + attr(o.max) + '"' : '') +
        (o.mode ? ' inputmode="' + attr(o.mode) + '"' : '') +
        (o.ph ? ' placeholder="' + attr(o.ph) + '"' : '') +
        (o.caps ? ' autocapitalize="characters"' : '') +
        ' autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="' + (o.enter ? 'done' : 'next') + '">';
    }
    var label = '<label for="' + attr(id) + '">' + esc(o.label) + '</label>';
    var hint = o.hint ? '<div class="svs-hint">' + esc(o.hint) + '</div>' : '';
    var err = o.err ? '<div class="svs-field-err" id="' + attr(id) + '-err" role="alert">' + esc(o.err) + '</div>' : '';
    if (kind === 'check') return '<div class="' + attr(cls('svs-field', 'svs-field-check', o.cls)) + '">' + control + label + hint + err + '</div>';
    return '<div class="' + attr(cls('svs-field', o.cls)) + '">' + label + control + hint + err + '</div>';
  }
  function badge(kind, label) {
    return '<span class="' + attr('svs-badge svs-badge-' + kind) + '">' + esc(label) + '</span>';
  }
  function notice(kind, text) {
    return '<div class="' + attr('svs-note svs-note-' + kind) + '">' + esc(text) + '</div>';
  }
  function emptyHtml(text, extraHtml) {
    return '<div class="svs-empty">' + esc(text) + (extraHtml || '') + '</div>';
  }
  function pagerHtml(prefix, page, pages, total, labelKey) {
    var h = '<div class="svs-pager">';
    if (page > 1) h += btn(prefix + '-page-prev', t('prev'), { cls: 'svs-btn-quiet' });
    h += '<span class="svs-pageof">' + esc(t('page')) + ' ' + num(page) + ' ' + esc(t('of')) + ' ' + num(Math.max(1, pages)) + '</span>';
    if (page < pages) h += btn(prefix + '-page-next', t('next'), { cls: 'svs-btn-quiet' });
    if (labelKey) h += '<span class="svs-total">' + esc(t(labelKey)) + ' ' + num(total) + '</span>';
    return h + '</div>';
  }
  function pagesOf(total, size) { return Math.max(1, Math.ceil((isInt(total) ? total : 0) / size)); }

  /* ids of fields are prefixed per area while its markup is built, so two areas never share an id */
  var idScope = '';
  function scoped(prefix, build) {
    var before = idScope;
    idScope = prefix;
    try { return build(); } finally { idScope = before; }
  }
  function byIdIn(container, id) { return qs(container, '#' + id); }
  function setHtml(el, html) { if (el) el.innerHTML = html; }

  /* ---------- part search (shared by receipt, counter sale, adjustment, old part and job forms) ---------- */

  function rankParts(rows, text) {
    var q = asText(text).replace(/^\s+|\s+$/g, '').toLowerCase();
    var exact = [];
    var prefix = [];
    var word = [];
    var i;
    for (i = 0; i < arr(rows).length; i++) {
      var r = rows[i];
      var code = asText(r.code).toLowerCase();
      var name = asText(r.name).toLowerCase();
      if (code === q) exact.push(r);
      else if (code.indexOf(q) === 0) prefix.push(r);
      else if (code.indexOf(q) >= 0 || name.indexOf(q) >= 0) word.push(r);
    }
    return exact.concat(prefix).concat(word).slice(0, 8);
  }
  function partResultsHtml(rows, action, line, showPrice) {
    if (!rows.length) return '<div class="svs-hint">' + esc(t('pick_none')) + '</div>';
    var h = '<div class="svs-pick" role="list">';
    var i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      h += '<button type="button" class="svs-btn svs-pick-row" role="listitem" data-svcs-action="' + attr(action) + '" data-svs-key="' + attr((line === undefined ? '' : line) + '|' + r.code) + '">' +
        '<b class="svs-code">' + esc(r.code) + '</b> ' + esc(r.name) + ' <span class="svs-dim">' + esc(t('on_hand')) + ' ' + num(isInt(r.onHand) ? r.onHand : 0) + '</span>' +
        (showPrice && isInt(r.sellPricePaise) ? ' <span class="svs-dim">' + esc(money(r.sellPricePaise)) + '</span>' : '') + '</button>';
    }
    return h + '</div>';
  }
  /* Search the parts master for a pick list. cb gets the ranked rows (max 8). */
  function searchParts(text, cb) {
    var q = asText(text).replace(/^\s+|\s+$/g, '');
    if (!q) { cb([]); return; }
    var s = readSession();
    callCore('listParts', [{ text: q, active: 'true', state: 'all', offset: 0, limit: 50 }, makeCtx(s, null, '')]).then(function (r) {
      cb(r.ok ? rankParts(r.rows, q) : []);
    });
  }

  /* ---------- dialog layer (one dialog at a time) ---------- */

  function ensureLayer() {
    if (S.layer) return S.layer;
    var doc = H && H.root && H.root.ownerDocument ? H.root.ownerDocument : (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    var layer = doc.createElement('div');
    layer.id = 'svs-layer';
    layer.setAttribute('data-no-i18n', '');
    var host = doc.body || doc.documentElement;
    if (host && typeof host.appendChild === 'function') host.appendChild(layer);
    S.layer = layer;
    bindContainer(layer, 'layer');
    return layer;
  }
  function activeElement() {
    try {
      var doc = H && H.root && H.root.ownerDocument ? H.root.ownerDocument : null;
      return doc && doc.activeElement ? doc.activeElement : null;
    } catch (e) { return null; }
  }
  function focusEl(el) {
    try { if (el && typeof el.focus === 'function') el.focus(); } catch (e) { /* focus is best effort */ }
  }
  function setViewportVar(layer) {
    try {
      var w = H && H.root && H.root.ownerDocument ? H.root.ownerDocument.defaultView : null;
      if (w && w.visualViewport && layer && layer.style && typeof layer.style.setProperty === 'function') {
        layer.style.setProperty('--svs-vh', Math.round(w.visualViewport.height) + 'px');
      }
    } catch (e) { /* optional */ }
  }

  function openDialog(kind, data, o) {
    var d = {
      kind: kind, data: data || {}, errors: {}, error: '', dirty: false, discard: false,
      clientRef: newRef(), opener: activeElement(), busy: false, opts: o || {}
    };
    S.dialog = d;
    renderDialog(true);
    return d;
  }
  function closeDialog() {
    var d = S.dialog;
    S.dialog = null;
    var layer = S.layer;
    if (layer) layer.innerHTML = '';
    if (d && d.opener) focusEl(d.opener);
  }
  function dialogCapture() {
    if (S.dialog && S.layer) captureFields(S.layer, S.dialog.data);
  }
  function dialogTitleId() { return 'svs-dlg-title'; }
  function renderDialog(focusFirst) {
    var layer = ensureLayer();
    if (!layer) return;
    var d = S.dialog;
    if (!d) { layer.innerHTML = ''; return; }
    var builder = DIALOGS[d.kind];
    if (!builder) { layer.innerHTML = ''; S.dialog = null; return; }
    var v = scoped('d-', function () { return builder(d); });
    var foot = d.discard
      ? '<div class="svs-discard" role="alert"><span>' + esc(t('discard_ask')) + '</span> ' + btn('svs-dialog-discard', t('discard'), { cls: 'svs-btn-danger' }) + ' ' + btn('svs-dialog-keep', t('keep_editing'), { cls: 'svs-btn-primary', focus: true }) + '</div>'
      : v.footer;
    var alertHtml = '<div class="svs-alert" id="svs-dlg-alert" role="alert">' + (d.error ? esc(d.error) : '') + '</div>';
    var infoHtml = d.info ? '<div class="svs-note svs-note-ok" role="status">' + esc(d.info) + '</div>' : '';
    layer.innerHTML = '<div class="svs-overlay" data-svs-overlay="1"><div class="' + attr(cls('svs-dialog', v.wide ? 'svs-dialog-wide' : '')) + '" role="dialog" aria-modal="true" aria-labelledby="' + dialogTitleId() + '">' +
      '<div class="svs-dlg-head"><div><h3 id="' + dialogTitleId() + '" class="svs-dlg-title">' + esc(v.title) + '</h3>' + (v.subHtml ? '<div class="svs-dim">' + v.subHtml + '</div>' : '') + '</div>' +
      btn('svs-dialog-close', t('close'), { cls: 'svs-btn-quiet' }) + '</div>' +
      '<div class="svs-dlg-body">' + alertHtml + infoHtml + v.body + '</div>' +
      '<div class="svs-dlg-foot">' + foot + '</div></div></div>';
    setViewportVar(layer);
    if (focusFirst) {
      var target = qs(layer, '[data-svs-focus="1"]');
      focusEl(target);
    }
  }
  /* Keep the typed values, show a new message in the open dialog. */
  function dialogMessage(text, kind) {
    var d = S.dialog;
    if (!d) return;
    dialogCapture();
    if (kind === 'info') { d.info = text; d.error = ''; } else { d.error = text; d.info = ''; }
    renderDialog(false);
  }
  function requestClose() {
    var d = S.dialog;
    if (!d) return;
    if (d.dirty && !d.discard) {
      dialogCapture();
      d.discard = true;
      renderDialog(true);
      return;
    }
    closeDialog();
  }

  /* ---------- failure display ---------- */

  function setAlert(text) {
    var el = H && H.root ? byIdIn(H.root, 'svs-alert') : null;
    if (el) setHtml(el, esc(text));
  }
  function showFailure(r) {
    var text = errText(r);
    if (S.dialog) {
      var d = S.dialog;
      dialogCapture();
      d.error = text;
      d.info = '';
      renderDialog(false);
    } else if (S.job.mode) {
      S.job.error = text;
      renderJobPanel();
    } else {
      setAlert(text);
    }
    toast(text);
  }
  function clearAlert() { setAlert(''); }

  /* ---------- the Stores view: shell, tabs, status, blocked page ---------- */

  var TAB_LIST = [
    { id: 'stock', action: 'svs-tab-stock', label: 'tab_stock', need: 'viewQty' },
    { id: 'receive', action: 'svs-tab-receive', label: 'tab_receive', need: 'receive' },
    { id: 'counter', action: 'svs-tab-counter', label: 'tab_counter', need: 'counterSale' },
    { id: 'adjust', action: 'svs-tab-adjust', label: 'tab_adjust', need: 'proposeAdj' },
    { id: 'oldparts', action: 'svs-tab-oldparts', label: 'tab_old', need: 'oldPartRegister' },
    { id: 'reorder', action: 'svs-tab-reorder', label: 'tab_reorder', need: 'viewQty' },
    { id: 'masters', action: 'svs-tab-masters', label: 'tab_masters', need: 'editMasters' },
    { id: 'opening', action: 'svs-tab-opening', label: 'tab_opening', need: 'openingPropose' },
    { id: 'settings', action: 'svs-tab-settings', label: 'tab_settings', need: 'settings' }
  ];
  var WRITE_KEYS = ['openingPropose', 'openingPost', 'openingReject', 'receive', 'issue', 'returnPart', 'counterSale', 'reverseCounter',
    'reverseCounterAnyDay', 'reverseDoc', 'proposeAdj', 'approveAdj', 'approveAdjMgr', 'rejectProposal', 'oldPartRegister', 'oldPartMove', 'scrapSignoff'];

  function integrityOk() { return !(S.status && S.status.integrity && S.status.integrity.ok === false); }
  /* Rights as the screen may use them: write rights vanish in a past view or when the ledger check failed. */
  function shownRights() {
    var R = rights();
    if (isPast() || !integrityOk()) {
      var i;
      for (i = 0; i < WRITE_KEYS.length; i++) R[WRITE_KEYS[i]] = false;
    }
    return R;
  }
  function tabsFor(R) {
    var out = [];
    var i;
    for (i = 0; i < TAB_LIST.length; i++) {
      if (R[TAB_LIST[i].need]) out.push(TAB_LIST[i]);
    }
    return out;
  }
  function chipsHtml(R) {
    var h = '';
    if (S.status) h += integrityOk() ? badge('ok', t('chip_ledger_ok')) : badge('bad', t('chip_ledger_bad') + (S.status.integrity && S.status.integrity.code ? ' ' + S.status.integrity.code : ''));
    if (R.tier === 'staff' && !R.storeClass) h += badge('info', t('chip_view_only'));
    if (isPast()) h += badge('warn', t('chip_past'));
    return h;
  }
  function headHtml(R) {
    return '<div class="svs-head"><div><h2 id="svs-title" class="svs-title">' + esc(t('stores')) + '</h2><div class="svs-dim">' + esc(t('stores_sub')) + '</div></div>' +
      '<div class="svs-chips">' + chipsHtml(R) + '</div></div>';
  }
  function closedHtml(textKey) {
    return headHtml(rightsFor(NO_SESSION, S.cfg)) + notice('bad', t(textKey));
  }

  /* Render the whole Stores view (status first, then tabs and the current tab). */
  function renderStores() {
    var rootEl = H && H.root;
    if (!rootEl) return;
    var tok = ++S.tok;
    var sess = readSession();
    if (!coreObj()) { rootEl.innerHTML = closedHtml('closed_core'); return; }
    if (sess.ok !== true) { rootEl.innerHTML = closedHtml('closed_session'); return; }
    callCore('status', []).then(function (st) {
      if (tok !== S.tok) return;
      S.status = st.ok ? st : null;
      if (!st.ok) { rootEl.innerHTML = headHtml(rights()) + notice('bad', errText(st)) + '<div class="svs-bar">' + btn('svs-blocked-retry', t('check_again'), { cls: 'svs-btn-primary' }) + '</div>'; return; }
      if (st.blocked === true) { renderBlocked(st); return; }
      if (st.ready === false) { rootEl.innerHTML = headHtml(rights()) + notice('info', t('starting')) + '<div class="svs-bar">' + btn('svs-blocked-retry', t('check_again'), { cls: 'svs-btn-primary' }) + '</div>'; return; }
      return callCore('settings', []).then(function (cfg) {
        if (tok !== S.tok) return;
        if (cfg.ok) {
          var c = cfg.config || cfg.settings || cfg;
          S.cfg = {
            adjustLimitPaise: isInt(c.adjustLimitPaise) ? c.adjustLimitPaise : 0,
            storeRoles: arr(c.storeRoles).slice()
          };
        }
        renderShellAndTab();
      });
    });
  }
  function renderShellAndTab() {
    var rootEl = H && H.root;
    if (!rootEl) return;
    var R = shownRights();
    var sess = readSession();
    if (sess.ok !== true) { rootEl.innerHTML = closedHtml('closed_session'); return; }
    var tabs = tabsFor(rights());
    if (!tabs.length) { rootEl.innerHTML = headHtml(R) + notice('bad', t('closed_session')); return; }
    var current = null;
    var i;
    for (i = 0; i < tabs.length; i++) { if (tabs[i].id === S.tab) current = tabs[i]; }
    if (!current) { current = tabs[0]; S.tab = current.id; }
    var tabHtml = '<div class="svs-tabs" role="tablist" aria-label="' + attr(t('tabs_label')) + '">';
    for (i = 0; i < tabs.length; i++) {
      var on = tabs[i].id === S.tab;
      tabHtml += '<button type="button" class="' + attr(cls('svs-tab', on ? 'is-active' : '')) + '" role="tab" aria-selected="' + (on ? 'true' : 'false') + '" tabindex="' + (on ? '0' : '-1') + '" data-svcs-action="' + attr(tabs[i].action) + '">' + esc(t(tabs[i].label)) + '</button>';
    }
    tabHtml += '</div>';
    var banner = '';
    if (!integrityOk()) banner = '<div class="svs-note svs-note-bad" role="alert">' + esc(ERR.SVS_INTEGRITY) + '</div>';
    if (isPast()) banner += notice('warn', ERR.SVS_PAST_VIEW);
    rootEl.innerHTML = headHtml(R) + tabHtml + '<div id="svs-status" class="svs-status" role="status" aria-live="polite"></div>' +
      '<div id="svs-alert" class="svs-alert" role="alert"></div>' + banner + '<div id="svs-body" class="svs-body" role="tabpanel"></div>';
    renderTab(R);
  }
  function setStatusLine(text) {
    var el = H && H.root ? byIdIn(H.root, 'svs-status') : null;
    if (el) setHtml(el, esc(text));
  }
  function renderTab(R) {
    var body = byIdIn(H.root, 'svs-body');
    if (!body) return;
    var fn = TABS[S.tab];
    if (fn) fn(body, R || shownRights());
  }
  function svsSwitchTab(id) {
    if (S.dialog) return;
    S.tab = id;
    renderShellAndTab();
  }

  /* ---------- blocked page and restore acknowledgement ---------- */

  var WATERMARK_CODES = { SVCS_WATERMARK_AHEAD: 1, SVCS_WATERMARK_FORK: 1 };
  function diagnosticsText(st) {
    var lines = ['Stores diagnostics', 'FY ' + asText(st && st.fy)];
    var probs = arr(st && st.problems);
    var i;
    for (i = 0; i < probs.length; i++) {
      var p = probs[i];
      lines.push(asText(p.code) + ' stream=' + asText(p.stream) + ' key=' + asText(p.key) + ' record=' + asText(p.n));
    }
    return lines.join('\n');
  }
  function renderBlocked(st) {
    var rootEl = H.root;
    var R = rights();
    var probs = arr(st.problems);
    var onlyWatermark = probs.length > 0;
    var i;
    for (i = 0; i < probs.length; i++) { if (!WATERMARK_CODES[probs[i].code]) onlyWatermark = false; }
    var list = '';
    for (i = 0; i < probs.length; i++) {
      var p = probs[i];
      list += '<div class="svs-row" role="listitem"><b class="svs-code">' + esc(p.code) + '</b> <span class="svs-dim">' + esc(ERR[p.code] || '') + '</span> ' +
        esc(t('stream')) + ' ' + esc(p.stream) + ' ' + esc(t('record')) + ' ' + num(isInt(p.n) ? p.n : 0) + '</div>';
    }
    var last = st.integrity && st.integrity.lastEntryAt ? '<div class="svs-dim">' + esc(t('last_posting')) + ' ' + esc(fmtAt(st.integrity.lastEntryAt)) + '</div>' : '';
    var ack = '';
    if (onlyWatermark) {
      ack = '<div class="svs-note svs-note-warn"><b>' + esc(t('restore_banner_title')) + '</b><div>' + esc(t('restore_banner_text')) + '</div>' + last;
      if (R.acknowledge) {
        ack += scoped('bl-', function () { return fld({ name: 'wmReason', label: t('wm_reason'), value: S.wmReason, max: 200, req: true, hint: t('wm_reason_hint') }); }) +
          btn('svs-wm-ack', t('wm_ack'), { cls: 'svs-btn-primary' });
      } else {
        ack += '<div>' + esc(t('wm_ask_owner')) + '</div>';
      }
      ack += '</div>';
    }
    rootEl.innerHTML = headHtml(R) + '<div class="svs-note svs-note-bad" role="alert"><b>' + esc(ERR.SVS_BLOCKED_PAGE) + '</b><div>' + esc(t('blocked_restore')) + '</div></div>' +
      ack + '<div class="svs-list" role="list">' + list + '</div>' +
      '<div class="svs-field"><label for="svs-diag">' + esc(t('diagnostics')) + '</label><textarea id="svs-diag" class="svs-input svs-diag" rows="6" readonly>' + esc(diagnosticsText(st)) + '</textarea></div>' +
      '<div class="svs-bar">' + btn('svs-blocked-retry', t('check_again')) + '</div>' +
      '<div id="svs-alert" class="svs-alert" role="alert"></div>';
  }
  function acknowledgeRestore() {
    var g = writeGate('acknowledge');
    if (g) { showFailure(g); return Promise.resolve(g); }
    var box = H.root ? byIdIn(H.root, 'svs-f-bl-wmReason') : null;
    if (box) S.wmReason = fieldValue(box);
    var reason = asText(S.wmReason).replace(/^\s+|\s+$/g, '');
    if (reason.length < 5) { var f = fail('SVS_REASON_SHORT'); showFailure(f); return Promise.resolve(f); }
    if (reason.length > 200) reason = reason.slice(0, 200);
    return exclusive(function () {
      return ownerStep(t('pin_ack'), function (ctx) {
        return callCore('acknowledgeRestore', [{ reason: reason }, ctx]);
      }).then(function (r) {
        if (!r.ok) { showFailure(r); return r; }
        S.wmReason = '';
        toast(t('wm_done'));
        return callCore('reopen', []).then(function () { renderStores(); return r; });
      });
    });
  }

  /* ---------- tabs ---------- */

  function paiseText(p) {
    if (!isInt(p) || p < 0) return '';
    var c = p % 100;
    return Math.floor(p / 100) + '.' + (c < 10 ? '0' : '') + c;
  }
  var DOC_TYPE_LABEL = {
    OPN: 'type_opening', OPENING: 'type_opening', GRN: 'type_receipt', RECEIPT: 'type_receipt',
    ISS: 'type_issue', ISSUE: 'type_issue', RET: 'type_return', RETURN: 'type_return',
    CSL: 'type_counter', COUNTER: 'type_counter', ADJ: 'type_adjust', ADJUST: 'type_adjust', REV: 'type_reversal', REVERSAL: 'type_reversal'
  };
  var OLD_LABEL = {
    HELD_FOR_CLAIM: 'old_held', CUSTOMER_RETURNED: 'old_returned', SCRAP_PENDING: 'old_scrap_pending', SCRAPPED: 'old_scrapped'
  };
  var OLD_BIN = { HELD_FOR_CLAIM: 'bin_claim', SCRAP_PENDING: 'bin_scrap' };
  var ADJ_REASONS = [
    { v: 'FOUND', l: 'reason_found', dir: 'up' },
    { v: 'COUNT_CORRECTION', l: 'reason_count', dir: 'both' },
    { v: 'WRONG_RECEIPT', l: 'reason_wrong_receipt', dir: 'both' },
    { v: 'DAMAGED', l: 'reason_damaged', dir: 'down' },
    { v: 'LOST', l: 'reason_lost', dir: 'down' },
    { v: 'WRITE_OFF', l: 'reason_write_off', dir: 'down' }
  ];
  var WRITEOFF_REASONS = { DAMAGED: 1, LOST: 1, WRITE_OFF: 1 };
  var PAY_MODES = [{ v: 'CASH', l: 'pay_cash' }, { v: 'UPI', l: 'pay_upi' }, { v: 'CARD', l: 'pay_card' }, { v: 'OTHER', l: 'pay_other' }];
  var RETURN_REASONS = [{ v: 'UNUSED', l: 'ret_unused' }, { v: 'WRONG_PART', l: 'ret_wrong' }, { v: 'JOB_CANCELLED', l: 'ret_cancelled' }];

  function tOptions(list) {
    var out = [];
    var i;
    for (i = 0; i < list.length; i++) out.push({ v: list[i].v, l: t(list[i].l) });
    return out;
  }
  function loadingHtml() { return '<div class="svs-dim" role="status">' + esc(t('loading')) + '</div>'; }

  /* A list region is refreshed on its own so the controls above it keep focus. */
  function regionLoad(id, seqKey, loader, paint) {
    var el = H && H.root ? byIdIn(H.root, id) : null;
    if (!el) return;
    S[seqKey] = (S[seqKey] || 0) + 1;
    var mine = S[seqKey];
    var tab = S.tab;
    el.innerHTML = loadingHtml();
    loader().then(function (r) {
      if (mine !== S[seqKey] || tab !== S.tab) return;
      var target = byIdIn(H.root, id);
      if (!target) return;
      if (!r.ok) { target.innerHTML = '<div class="svs-note svs-note-bad" role="alert">' + esc(errText(r)) + '</div>'; return; }
      paint(target, r);
    });
  }

  /* ---------- Stock ---------- */

  function stockQuery() {
    var f = S.f.stock;
    var q = { text: f.text, group: f.group, active: 'true', state: 'all', offset: (f.page - 1) * PAGE_STOCK, limit: PAGE_STOCK };
    if (f.view === 'low') q.state = 'low';
    if (f.view === 'off') q.active = 'false';
    return q;
  }
  function badgeFor(r) {
    if (r.active === false) return badge('off', t('badge_off'));
    var on = isInt(r.onHand) ? r.onHand : 0;
    if (on <= 0) return badge('bad', t('badge_out'));
    if (isInt(r.reorderLevel) && r.reorderLevel > 0 && on <= r.reorderLevel) return badge('warn', t('badge_low'));
    return badge('ok', t('badge_ok'));
  }
  function stockRowHtml(r, R) {
    var on = isInt(r.onHand) ? r.onHand : 0;
    var h = '<div class="svs-row" role="listitem" data-svs-key="' + attr(r.code) + '">' +
      '<div class="svs-c svs-c-code"><b class="svs-code">' + esc(r.code) + '</b></div>' +
      '<div class="svs-c svs-c-name">' + esc(r.name) + (r.group ? ' <span class="svs-dim">' + esc(r.group) + '</span>' : '') + '</div>' +
      '<div class="svs-c svs-c-num"><span class="svs-lbl">' + esc(t('on_hand')) + '</span> <span class="' + attr(cls('svs-num', on < 0 ? 'svs-neg' : '')) + '">' + esc(on) + '</span></div>' +
      '<div class="svs-c svs-c-num"><span class="svs-lbl">' + esc(t('reorder_level')) + '</span> ' + num(isInt(r.reorderLevel) ? r.reorderLevel : 0) + '</div>';
    if (R.viewCost) h += '<div class="svs-c svs-c-num"><span class="svs-lbl">' + esc(t('fifo_value')) + '</span> <span class="svs-num">' + esc(money(r.valuePaise)) + '</span></div>';
    h += '<div class="svs-c svs-c-act">' + badgeFor(r);
    if (R.viewLedger) h += ' ' + btn('svs-stock-ledger', t('ledger'), { key: r.code, cls: 'svs-btn-quiet' });
    if (R.editMasters) h += ' ' + btn('svs-stock-edit-part', t('edit'), { key: r.code, cls: 'svs-btn-quiet' });
    return h + '</div></div>';
  }
  function tabStock(body, R) {
    var f = S.f.stock;
    var groupOpts = [{ v: '', l: t('all_groups') }];
    var i;
    for (i = 0; i < S.groups.length; i++) groupOpts.push({ v: S.groups[i], l: S.groups[i] });
    body.innerHTML = '<div class="svs-bar">' +
      fld({ name: 'f-stock-text', label: t('search'), value: f.text, ph: t('search_ph'), caps: true, cls: 'svs-grow' }) +
      fld({ name: 'f-stock-group', kind: 'select', label: t('group'), options: groupOpts, value: f.group }) +
      fld({ name: 'f-stock-view', kind: 'select', label: t('show'), options: [{ v: 'all', l: t('view_all') }, { v: 'low', l: t('view_low') }, { v: 'off', l: t('view_off') }], value: f.view }) +
      '<div class="svs-bar-btns">' + (R.editMasters ? btn('svs-stock-add-part', t('add_part'), { cls: 'svs-btn-primary' }) : '') + btn('svs-stock-print', t('print_stock')) + '</div></div>' +
      '<div id="svs-stock-list" class="svs-list" role="list"></div><div id="svs-stock-foot"></div>';
    refreshStockList();
  }
  function refreshStockList() {
    var s = readSession();
    var R = shownRights();
    var q = stockQuery();
    regionLoad('svs-stock-list', 'seqStock', function () { return callCore('listParts', [q, makeCtx(s, null, '')]); }, function (target, r) {
      var rows = arr(r.rows);
      var total = isInt(r.total) ? r.total : rows.length;
      S.groups = arr(r.groups).slice();
      var sel = byIdIn(H.root, 'svs-f-f-stock-group');
      if (sel) {
        var go = [{ v: '', l: t('all_groups') }];
        var gi;
        for (gi = 0; gi < S.groups.length; gi++) go.push({ v: S.groups[gi], l: S.groups[gi] });
        setHtml(sel, optionsHtml(go, S.f.stock.group));
      }
      var h = '';
      var i;
      for (i = 0; i < rows.length; i++) h += stockRowHtml(rows[i], R);
      if (!rows.length) {
        var anyFilter = S.f.stock.text || S.f.stock.group || S.f.stock.view !== 'all';
        h = anyFilter ? emptyHtml(t('stock_no_match'), btn('svs-stock-search-clear', t('clear_search'), { cls: 'svs-btn-quiet' })) :
          emptyHtml(t('stock_empty'), R.editMasters ? ' ' + btn('svs-stock-add-part', t('add_part')) : '');
      }
      target.innerHTML = h;
      var pages = pagesOf(total, PAGE_STOCK);
      if (S.f.stock.page > pages) S.f.stock.page = pages;
      var totals = r.totals || {};
      var foot = pagerHtml('svs-stock', S.f.stock.page, pages, total, 'parts_total');
      foot += '<div class="svs-sum">' + num(isInt(totals.parts) ? totals.parts : total) + ' ' + esc(t('parts_word')) + ', ' + num(isInt(totals.pieces) ? totals.pieces : 0) + ' ' + esc(t('pieces_word'));
      if (R.viewCost && isInt(totals.valuePaise)) foot += ', ' + esc(t('fifo_value')) + ' <span class="svs-num">' + esc(money(totals.valuePaise)) + '</span>';
      foot += '</div>';
      setHtml(byIdIn(H.root, 'svs-stock-foot'), foot);
    });
  }

  /* ---------- Receive goods ---------- */

  function tabReceive(body, R) {
    body.innerHTML = '<div class="svs-bar">' + (R.receive ? btn('svs-grn-new', t('grn_new'), { cls: 'svs-btn-primary' }) : '') + '</div>' +
      '<div id="svs-grn-list" class="svs-list" role="list"></div><div id="svs-grn-foot"></div>';
    var s = readSession();
    var page = S.f.grn.page;
    regionLoad('svs-grn-list', 'seqGrn', function () {
      return callCore('listReceipts', [{ offset: (page - 1) * PAGE_LIST, limit: PAGE_LIST }, makeCtx(s, null, '')]);
    }, function (target, r) {
      var rows = arr(r.rows);
      var total = isInt(r.total) ? r.total : rows.length;
      var h = '';
      var i;
      S.grnRows = {};
      for (i = 0; i < rows.length; i++) {
        var x = rows[i];
        x.valuePaise = firstOf(x, ['totalPaise', 'valuePaise']);
        S.grnRows[x.no] = x;
        var reversed = x.reversed === true || x.status === 'REVERSED';
        h += '<div class="svs-row" role="listitem" data-svs-key="' + attr(x.no) + '">' +
          '<div class="svs-c svs-c-code"><b class="svs-code">' + esc(x.no) + '</b></div>' +
          '<div class="svs-c">' + esc(fmtAt(firstOf(x, ['date', 'docDate', 'at']))) + ' <span class="svs-dim">' + esc(t('supplier_invoice')) + ' ' + esc(x.supplierInvoiceNo) + '</span></div>' +
          '<div class="svs-c svs-c-num"><span class="svs-lbl">' + esc(t('lines')) + '</span> ' + num(isInt(x.lineCount) ? x.lineCount : arr(x.lines).length) + ' <span class="svs-lbl">' + esc(t('pieces')) + '</span> ' + num(isInt(x.pieces) ? x.pieces : 0) + '</div>';
        if (R.viewCost) h += '<div class="svs-c svs-c-num"><span class="svs-lbl">' + esc(t('value')) + '</span> <span class="svs-num">' + esc(money(firstOf(x, ['totalPaise', 'valuePaise']))) + '</span></div>';
        h += '<div class="svs-c svs-c-act">' + (reversed ? badge('off', t('status_reversed')) : badge('ok', t('status_posted'))) + ' ' + btn('svs-grn-view', t('view'), { key: x.no, cls: 'svs-btn-quiet' });
        if (!reversed && rights().manager && integrityOk() && !isPast()) {
          h += ' ' + (rights().reverseDoc ? btn('svs-grn-reverse', t('reverse'), { key: x.no, cls: 'svs-btn-quiet' }) : btn('svs-grn-reverse', t('reverse_owner'), { key: x.no, cls: 'svs-btn-quiet is-locked' }));
        }
        h += '</div></div>';
      }
      if (!rows.length) h = emptyHtml(t('grn_empty'));
      target.innerHTML = h;
      var pages = pagesOf(total, PAGE_LIST);
      setHtml(byIdIn(H.root, 'svs-grn-foot'), pagerHtml('svs-grn', page, pages, total, ''));
    });
  }

  /* ---------- Counter sale ---------- */

  function csFormHtml() {
    return scoped('cs-', csFormInner);
  }
  function csFormInner() {
    var c = S.cs;
    var pickInfo = c.partCode ? '<div class="svs-picked"><b class="svs-code">' + esc(c.partCode) + '</b> ' + esc(c.partName) + '</div>' : '';
    return '<div id="svs-cs-form" class="svs-form">' +
      '<div class="svs-alert" role="alert">' + esc(S.csError) + '</div>' +
      fld({ name: 'partSearch', label: t('part'), value: c.partSearch, ph: t('search_ph'), caps: true, req: true, focus: true }) +
      '<div id="svs-cs-results" data-svs-results="cs"></div>' + pickInfo +
      '<div class="svs-bar">' +
      fld({ name: 'qty', label: t('qty'), value: c.qty, mode: 'numeric', max: 6, req: true }) +
      fld({ name: 'price', label: t('unit_price'), value: c.price, mode: 'decimal', max: 12, req: true }) +
      fld({ name: 'payMode', kind: 'select', label: t('pay_mode'), options: tOptions(PAY_MODES), value: c.payMode }) +
      '</div>' +
      fld({ name: 'ccpt', label: t('ccpt_invoice'), value: c.ccpt, max: 40, hint: t('ccpt_hint') }) +
      fld({ name: 'note', label: t('note'), value: c.note, max: 200, enter: 'svs-cs-save' }) +
      '<div class="svs-bar-btns">' + btn('svs-cs-save', t('cs_save'), { cls: 'svs-btn-primary' }) + btn('svs-cs-clear', t('clear')) + '</div></div>';
  }
  function paintCsForm() {
    var wrap = H && H.root ? byIdIn(H.root, 'svs-cs-wrap') : null;
    if (wrap) wrap.innerHTML = csFormHtml();
  }
  function tabCounter(body, R) {
    var h = notice('info', t('cs_notice'));
    h += R.counterSale ? '<div id="svs-cs-wrap">' + csFormHtml() + '</div>' : '';
    h += '<h3 class="svs-h3">' + esc(t('cs_today')) + '</h3><div id="svs-cs-list" class="svs-list" role="list"></div>';
    body.innerHTML = h;
    var s = readSession();
    var today = todayIso();
    regionLoad('svs-cs-list', 'seqCs', function () { return callCore('listCounterSales', [{ date: today }, makeCtx(s, null, '')]); }, function (target, r) {
      var rows = arr(r.rows);
      var out = '';
      var i;
      S.csRows = {};
      for (i = 0; i < rows.length; i++) {
        var x = rows[i];
        var line = arr(x.lines)[0] || x;
        var reversed = x.reversed === true || x.status === 'REVERSED';
        S.csRows[asText(x.no)] = istDay(firstOf(x, ['docDate', 'date', 'at']));
        var q = firstOf(line, ['qty']);
        var price = firstOf(line, ['unitPricePaise']);
        out += '<div class="svs-row" role="listitem" data-svs-key="' + attr(x.no) + '">' +
          '<div class="svs-c svs-c-code"><b class="svs-code">' + esc(x.no) + '</b> <span class="svs-dim">' + esc(fmtAt(x.at || x.date)) + '</span></div>' +
          '<div class="svs-c">' + esc(firstOf(line, ['partCode', 'code'])) + (arr(x.lines).length > 1 ? ' <span class="svs-dim">+' + esc(arr(x.lines).length - 1) + '</span>' : '') + '</div>' +
          '<div class="svs-c svs-c-num">' + num(isInt(q) ? q : 0) + ' x ' + esc(money(price)) + '</div>' +
          '<div class="svs-c">' + esc(x.payMode) + ' <span class="svs-dim">' + esc(firstOf(x, ['by', 'actorName'])) + '</span></div>' +
          '<div class="svs-c svs-c-act">' + (reversed ? badge('off', t('status_reversed')) : badge('ok', t('status_posted')));
        if (!reversed && R.reverseCounter) out += ' ' + btn('svs-cs-reverse', t('reverse'), { key: x.no, cls: 'svs-btn-quiet' });
        out += '</div></div>';
      }
      if (!rows.length) out = emptyHtml(t('cs_empty'));
      target.innerHTML = out;
    });
  }

  /* ---------- Adjustments ---------- */

  function proposalLines(row) { return arr(row.lines); }
  function proposalHasWriteoff(row) {
    var ls = proposalLines(row);
    var i;
    for (i = 0; i < ls.length; i++) { if (WRITEOFF_REASONS[ls[i].reason]) return true; }
    return row.reasonClass === 'WRITEOFF';
  }
  /* The proposer is this session: same name and tier; with no staff name, the same tier and role (as the docs layer reads it). */
  function sameActor(row, s) {
    var by = asText(row && row.by);
    var tier = asText(row && row.proposedTier);
    if (tier !== '' && tier !== s.tier) return false;
    return by === s.actorName && (by !== '' || asText(row && row.proposedRole) === s.role);
  }
  /* Why a Store Manager cannot approve this adjustment within the limit; '' when he can. */
  function mgrApproveBlock(row, s) {
    if (!row || row.needsOwner !== false || proposalHasWriteoff(row)) return 'SVS_OWNER_ONLY';
    if (s.actorName === '') return 'APPROVER_NAME_REQUIRED';
    var by = asText(row.by);
    if (by !== '' && by === s.actorName) return 'SELF_APPROVAL';
    if (by === '' && asText(row.proposedTier) !== 'owner') return 'PROPOSER_NAME_MISSING';
    return '';
  }
  function tabAdjust(body, R) {
    body.innerHTML = '<div class="svs-bar">' + (R.proposeAdj ? btn('svs-adj-new', t('adj_new'), { cls: 'svs-btn-primary' }) : '') +
      fld({ name: 'f-adj-state', kind: 'select', label: t('show'), options: [{ v: 'PROPOSED', l: t('adj_waiting') }, { v: 'ALL', l: t('adj_all') }], value: S.f.adj.state }) +
      '<div class="svs-bar-btns">' + btn('svs-adj-print', t('print_adj')) + '</div></div>' +
      '<div id="svs-adj-list" class="svs-list" role="list"></div>';
    refreshAdjustList(R);
  }
  function refreshAdjustList(R) {
    var s = readSession();
    var st = S.f.adj.state;
    regionLoad('svs-adj-list', 'seqAdj', function () { return callCore('listAdjustments', [{ state: st === 'ALL' ? 'all' : st }, makeCtx(s, null, '')]); }, function (target, r) {
      var rows = arr(r.rows);
      var out = '';
      var i;
      S.adjRows = {};
      for (i = 0; i < rows.length; i++) {
        var x = rows[i];
        x.id = firstOf(x, ['proposalId', 'id']);
        x.by = firstOf(x, ['proposedBy', 'by']);
        S.adjRows[x.id] = x;
        var state = x.state || x.status || 'PROPOSED';
        var ls = proposalLines(x);
        var first = ls[0] || {};
        var desc = ls.length === 1 ? (first.partCode + ' ' + (first.qtyDelta > 0 ? '+' : '') + first.qtyDelta) : ls.length + ' ' + t('lines_word');
        out += '<div class="svs-row" role="listitem" data-svs-key="' + attr(x.id) + '">' +
          '<div class="svs-c svs-c-code"><b class="svs-code">' + esc(x.no || x.id) + '</b></div>' +
          '<div class="svs-c">' + esc(desc) + (ls.length === 1 ? ' <span class="svs-dim">' + esc(first.reason) + '</span>' : '') + (x.note ? ' <span class="svs-dim">' + esc(x.note) + '</span>' : '') + '</div>';
        if (R.viewCost) out += '<div class="svs-c svs-c-num"><span class="svs-lbl">' + esc(t('value')) + '</span> <span class="svs-num">' + esc(money(x.valuePaise)) + '</span></div>';
        out += '<div class="svs-c svs-dim">' + esc(x.by) + ' ' + esc(fmtAt(x.at)) + '</div>' +
          '<div class="svs-c svs-c-act">' + badge(state === 'POSTED' ? 'ok' : (state === 'PROPOSED' ? 'warn' : 'off'), t('adj_state_' + String(state).toLowerCase()));
        if (state === 'PROPOSED') {
          var block = R.approveAdjMgr ? mgrApproveBlock(x, s) : 'SVS_OWNER_ONLY';
          var within = R.approveAdjMgr && block === '';
          if (R.approveAdj || within) out += ' ' + btn('svs-adj-approve', t('approve'), { key: x.id, cls: 'svs-btn-primary' });
          else if (R.manager && integrityOk() && !isPast()) out += ' ' + btn('svs-adj-approve', t('approve_owner'), { key: x.id, cls: 'is-locked', title: ERR[block] || ERR.SVS_OWNER_ONLY });
          if (R.rejectProposal) out += ' ' + btn('svs-adj-reject', t('reject'), { key: x.id, cls: 'svs-btn-quiet' });
          if (R.proposeAdj && (R.owner || sameActor(x, s))) out += ' ' + btn('svs-adj-withdraw', t('withdraw'), { key: x.id, cls: 'svs-btn-quiet' });
        } else if (state === 'POSTED' && R.reverseDoc && x.no && x.reversed !== true) {
          out += ' ' + btn('svs-adj-reverse', t('reverse'), { key: x.no, cls: 'svs-btn-quiet' });
        }
        out += '</div></div>';
      }
      if (!rows.length) out = emptyHtml(t('adj_empty'));
      target.innerHTML = out;
    });
  }

  /* ---------- Old parts ---------- */

  function oldOpen(state) { return state === 'HELD_FOR_CLAIM' || state === 'SCRAP_PENDING'; }
  function tabOldParts(body, R) {
    var opts = [{ v: 'OPEN', l: t('old_filter_open') }, { v: 'ALL', l: t('old_filter_all') }];
    var k;
    for (k in OLD_LABEL) { if (Object.prototype.hasOwnProperty.call(OLD_LABEL, k)) opts.push({ v: k, l: t(OLD_LABEL[k]) }); }
    body.innerHTML = '<div class="svs-bar">' + (R.oldPartRegister ? btn('svs-old-new', t('old_new'), { cls: 'svs-btn-primary' }) : '') +
      fld({ name: 'f-old-state', kind: 'select', label: t('show'), options: opts, value: S.f.old.state }) +
      '<div class="svs-bar-btns">' + (R.scrapSignoff ? btn('svs-old-signoff', t('old_signoff'), { cls: 'svs-btn' }) : (rights().manager ? btn('svs-old-signoff', t('old_signoff_owner'), { cls: 'is-locked' }) : '')) +
      btn('svs-old-print', t('print_old')) + '</div></div>' +
      '<div id="svs-old-list" class="svs-list" role="list"></div>';
    refreshOldList(R);
  }
  function refreshOldList(R) {
    var s = readSession();
    var f = S.f.old.state;
    regionLoad('svs-old-list', 'seqOld', function () { return callCore('listOldParts', [{}, makeCtx(s, null, '')]); }, function (target, r) {
      var rows = [];
      var all = arr(r.rows);
      var i;
      for (i = 0; i < all.length; i++) all[i].no = firstOf(all[i], ['oldNo', 'no']);
      for (i = 0; i < all.length; i++) {
        var st = all[i].state;
        if (f === 'ALL' || (f === 'OPEN' && oldOpen(st)) || f === st) rows.push(all[i]);
      }
      var out = '';
      for (i = 0; i < rows.length; i++) {
        var x = rows[i];
        out += '<div class="svs-row" role="listitem" data-svs-key="' + attr(x.no) + '">' +
          '<div class="svs-c svs-c-code"><b class="svs-code">' + esc(x.no) + '</b> <span class="svs-dim">' + esc(fmtAt(firstOf(x, ['date', 'at']))) + '</span></div>' +
          '<div class="svs-c">' + esc(x.jobId ? x.jobId : '-') + '</div>' +
          '<div class="svs-c">' + esc(x.partCode ? x.partCode + ' ' : '') + esc(x.partText) + '</div>' +
          '<div class="svs-c svs-c-num">' + num(isInt(x.qty) ? x.qty : 1) + '</div>' +
          '<div class="svs-c svs-c-act">' + badge(oldOpen(x.state) ? 'warn' : 'off', t(OLD_LABEL[x.state] || 'old_held')) + (OLD_BIN[x.state] ? ' <span class="svs-dim">' + esc(t(OLD_BIN[x.state])) + '</span>' : '');
        if (R.oldPartMove && (x.state === 'HELD_FOR_CLAIM' || x.state === 'SCRAP_PENDING')) out += ' ' + btn('svs-old-move', t('move'), { key: x.no, cls: 'svs-btn-quiet' });
        out += '</div></div>';
      }
      if (!rows.length) out = emptyHtml(t('old_empty'));
      target.innerHTML = out;
      S.oldRows = all;
    });
  }

  /* ---------- Reorder ---------- */

  function tabReorder(body) {
    body.innerHTML = '<div class="svs-bar"><div class="svs-bar-btns">' + btn('svs-reorder-print', t('print_reorder')) + '</div></div><div id="svs-reorder-list" class="svs-list" role="list"></div>';
    var s = readSession();
    regionLoad('svs-reorder-list', 'seqReorder', function () { return callCore('reorderList', [makeCtx(s, null, '')]); }, function (target, r) {
      var rows = arr(r.rows);
      var out = '';
      var i;
      for (i = 0; i < rows.length; i++) {
        var x = rows[i];
        var code = firstOf(x, ['code', 'partCode']);
        var rq = firstOf(x, ['reorderQty']);
        out += '<div class="svs-row" role="listitem" data-svs-key="' + attr(code) + '">' +
          '<div class="svs-c svs-c-code"><b class="svs-code">' + esc(code) + '</b></div>' +
          '<div class="svs-c">' + esc(firstOf(x, ['name', 'desc'])) + '</div>' +
          '<div class="svs-c svs-c-num"><span class="svs-lbl">' + esc(t('on_hand')) + '</span> ' + num(isInt(x.onHand) ? x.onHand : 0) + '</div>' +
          '<div class="svs-c svs-c-num"><span class="svs-lbl">' + esc(t('reorder_level')) + '</span> ' + num(isInt(x.reorderLevel) ? x.reorderLevel : 0) + '</div>' +
          '<div class="svs-c svs-c-num"><span class="svs-lbl">' + esc(t('reorder_qty')) + '</span> ' + (isInt(rq) && rq > 0 ? num(rq) : esc(t('not_set'))) + '</div></div>';
      }
      if (!rows.length) out = emptyHtml(t('reorder_empty'));
      target.innerHTML = out;
    });
  }

  /* ---------- Parts and labour (masters UI) ---------- */

  function mastersApi() { return typeof SaagarServiceMastersUi !== 'undefined' && SaagarServiceMastersUi ? SaagarServiceMastersUi : null; }
  function mastersEnv() {
    return {
      core: coreObj(),
      readSession: readSession,
      session: readSession,
      reauth: function (label) { return H && typeof H.reauth === 'function' ? H.reauth(label) : Promise.resolve(false); },
      toast: toast,
      esc: esc,
      now: function () { return new Date(); },
      isPast: isPast,
      onChange: function () { S.groups = []; }
    };
  }
  function tabMasters(body) {
    var api = mastersApi();
    if (!api || typeof api.mount !== 'function') { body.innerHTML = notice('bad', t('masters_missing')); return; }
    var doc = H.root.ownerDocument;
    if (!S.mastersEl) S.mastersEl = doc.createElement('div');
    S.mastersEl.id = 'svs-masters-host';
    body.innerHTML = '';
    body.appendChild(S.mastersEl);
    if (!S.masters) {
      try { S.masters = api.mount(S.mastersEl, mastersEnv()) || {}; } catch (e) { S.masters = null; body.innerHTML = notice('bad', errText(thrown(e))); return; }
    } else if (typeof S.masters.refresh === 'function') {
      try { S.masters.refresh(); } catch (e2) { /* the masters screen reports its own problems */ }
    }
  }
  function gotoMasters(kind, code) {
    var R = rights();
    if (!R.editMasters) { showFailure(fail('SVS_ROLE_DENIED')); return; }
    S.tab = 'masters';
    renderShellAndTab();
    var m = S.masters;
    if (!m) return;
    try {
      if (code && typeof m.openEdit === 'function') m.openEdit(kind, code);
      else if (typeof m.openNew === 'function') m.openNew(kind);
    } catch (e) { showFailure(thrown(e)); }
  }

  /* ---------- Settings (Owner) ---------- */

  function tabSettings(body, R) {
    if (!R.settings) { body.innerHTML = notice('bad', ERR.SVS_OWNER_ONLY); return; }
    body.innerHTML = scoped('st-', function () { return settingsHtml(); });
  }
  function settingsHtml() {
    var cur = S.cfg;
    var h = '<div id="svs-settings-form" class="svs-form">' + notice('info', t('settings_note')) +
      fld({ name: 'limit', label: t('adj_limit'), value: paiseText(cur.adjustLimitPaise), mode: 'decimal', max: 12, hint: t('adj_limit_hint') }) +
      '<div class="svs-sub">' + esc(t('store_roles')) + '</div><div class="svs-hint">' + esc(t('store_roles_hint')) + '</div>';
    var i;
    for (i = 0; i < SHELL_STORE_ROLES.length; i++) {
      h += fld({ name: 'role-' + i, kind: 'check', label: SHELL_STORE_ROLES[i], value: cur.storeRoles.indexOf(SHELL_STORE_ROLES[i]) >= 0 });
    }
    h += '<div class="svs-bar-btns">' + btn('svs-settings-save', t('settings_save'), { cls: 'svs-btn-primary' }) + '</div></div>';
    return h;
  }
  function svsSaveSettings() {
    var g = writeGate('settings');
    if (g) { showFailure(g); return Promise.resolve(g); }
    var form = byIdIn(H.root, 'svs-settings-form');
    var d = captureFields(form, {});
    var p = parsePaise(d.limit === '' ? '0' : d.limit, { allowZero: true });
    if (!p.ok || p.paise > 100000000) { var f = fail('SVS_MONEY_INVALID'); showFailure(f); return Promise.resolve(f); }
    var roles = [];
    var i;
    for (i = 0; i < SHELL_STORE_ROLES.length; i++) { if (d['role-' + i] === true) roles.push(SHELL_STORE_ROLES[i]); }
    return exclusive(function () {
      return ownerStep(fill(t('pin_settings'), { amount: money(p.paise), n: roles.length }), function (ctx) {
        return callWrite('setConfig', [{ adjustLimitPaise: p.paise, storeRoles: roles }, ctx]);
      }).then(function (r) {
        if (!r.ok) { showFailure(r); return r; }
        S.cfg = { adjustLimitPaise: p.paise, storeRoles: roles };
        toast(t('settings_saved'));
        renderShellAndTab();
        return r;
      });
    });
  }

  var TABS = {
    stock: tabStock, receive: tabReceive, counter: tabCounter, adjust: tabAdjust, oldparts: tabOldParts,
    reorder: tabReorder, masters: tabMasters, opening: tabOpening, settings: tabSettings
  };

  /* ---------- Opening stock: propose (store-class, Manager, Owner), approve and post (Owner with PIN) ---------- */

  function loadAllParts(s) {
    var out = [];
    function page(off) {
      return callCore('listParts', [{ text: '', group: '', active: 'true', state: 'all', offset: off, limit: 200 }, makeCtx(s, null, '')]).then(function (r) {
        if (!r.ok) return r;
        var rows = arr(r.rows);
        var i;
        for (i = 0; i < rows.length; i++) out.push(rows[i]);
        var total = isInt(r.total) ? r.total : out.length;
        if (!rows.length || out.length >= total || out.length >= 5000) return { ok: true, rows: out };
        return page(off + 200);
      });
    }
    return page(0);
  }
  function openingLockedCodes() {
    var locked = {};
    var props = arr(S.opening.proposals);
    var i;
    var j;
    for (i = 0; i < props.length; i++) {
      if ((props[i].state || 'PROPOSED') !== 'PROPOSED') continue;
      var ls = arr(props[i].lines);
      for (j = 0; j < ls.length; j++) locked[ls[j].partCode] = true;
    }
    return locked;
  }
  function openingCandidates() {
    var locked = openingLockedCodes();
    var q = asText(S.f.open.text).toLowerCase();
    var parts = arr(S.opening.parts);
    var out = [];
    var i;
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.openingSet === true || locked[p.code]) continue;
      if (q && asText(p.code).toLowerCase().indexOf(q) < 0 && asText(p.name).toLowerCase().indexOf(q) < 0) continue;
      out.push(p);
    }
    return out;
  }
  function tabOpening(body, R) {
    body.innerHTML = '<div id="svs-open-status" class="svs-sum">' + loadingHtml() + '</div><div id="svs-open-pending"></div><div id="svs-open-bar"></div><div id="svs-open-rows"></div>';
    var s = readSession();
    var mine = (S.seqOpen = (S.seqOpen || 0) + 1);
    var tab = S.tab;
    loadAllParts(s).then(function (pr) {
      if (mine !== S.seqOpen || tab !== S.tab) return null;
      if (!pr.ok) { setHtml(byIdIn(H.root, 'svs-open-status'), '<div class="svs-note svs-note-bad" role="alert">' + esc(errText(pr)) + '</div>'); return null; }
      S.opening.parts = pr.rows;
      return callCore('listOpening', [makeCtx(s, null, '')]).then(function (lr) {
        if (mine !== S.seqOpen || tab !== S.tab) return null;
        S.opening.proposals = lr.ok ? arr(lr.rows || lr.proposals) : [];
        S.opening.proposals.forEach(function (p) { p.id = firstOf(p, ['proposalId', 'id']); p.by = firstOf(p, ['proposedBy', 'by']); });
        paintOpening(R);
        return null;
      });
    });
  }
  function proposalTotals(p) {
    var ls = arr(p.lines);
    var pieces = 0;
    var value = 0;
    var i;
    for (i = 0; i < ls.length; i++) {
      pieces += isInt(ls[i].qty) ? ls[i].qty : 0;
      value += (isInt(ls[i].qty) ? ls[i].qty : 0) * (isInt(ls[i].unitCostPaise) ? ls[i].unitCostPaise : 0);
    }
    return { parts: ls.length, pieces: pieces, valuePaise: isInt(p.valuePaise) ? p.valuePaise : value };
  }
  function paintOpening(R) {
    if (!H || !H.root || !byIdIn(H.root, 'svs-open-status')) return;
    var parts = arr(S.opening.parts);
    var setCount = 0;
    var i;
    for (i = 0; i < parts.length; i++) { if (parts[i].openingSet === true) setCount++; }
    var statusHtml;
    if (!parts.length) statusHtml = esc(t('open_no_parts'));
    else statusHtml = esc(t('open_set_for')) + ' ' + num(setCount) + ' ' + esc(t('of')) + ' ' + num(parts.length) + ' ' + esc(t('parts_word')) + '. ' + esc(t('open_dated_today'));
    setHtml(byIdIn(H.root, 'svs-open-status'), statusHtml);

    var me = readSession();
    var pend = '';
    var props = arr(S.opening.proposals);
    for (i = 0; i < props.length; i++) {
      var p = props[i];
      if ((p.state || 'PROPOSED') !== 'PROPOSED') continue;
      var tot = proposalTotals(p);
      pend += '<div class="svs-row" role="listitem" data-svs-key="' + attr(p.id) + '">' +
        '<div class="svs-c svs-c-code"><b class="svs-code">' + esc(p.id) + '</b></div>' +
        '<div class="svs-c svs-c-num">' + num(tot.parts) + ' ' + esc(t('parts_word')) + ', ' + num(tot.pieces) + ' ' + esc(t('pieces_word')) +
        (R.viewCost ? ', ' + esc(t('value')) + ' <span class="svs-num">' + esc(money(tot.valuePaise)) + '</span>' : '') + '</div>' +
        '<div class="svs-c svs-dim">' + esc(p.by) + ' ' + esc(fmtAt(p.at)) + '</div><div class="svs-c svs-c-act">' + badge('warn', t('adj_state_proposed'));
      if (R.openingPost) pend += ' ' + btn('svs-open-approve', t('approve'), { key: p.id, cls: 'svs-btn-primary' });
      else if (R.manager && integrityOk() && !isPast()) pend += ' ' + btn('svs-open-approve', t('approve_owner'), { key: p.id, cls: 'is-locked' });
      if (R.openingReject) pend += ' ' + btn('svs-open-reject', t('reject'), { key: p.id, cls: 'svs-btn-quiet' });
      if (R.openingPropose && (R.owner || sameActor(p, me))) pend += ' ' + btn('svs-open-withdraw', t('withdraw'), { key: p.id, cls: 'svs-btn-quiet' });
      pend += '</div></div>';
    }
    setHtml(byIdIn(H.root, 'svs-open-pending'), pend ? '<h3 class="svs-h3">' + esc(t('open_pending')) + '</h3><div class="svs-list" role="list">' + pend + '</div>' : '');

    var barHtml = '';
    if (parts.length && R.openingPropose) {
      barHtml = notice('info', t('open_keep_note')) +
        '<div class="svs-bar">' + fld({ name: 'f-open-text', label: t('search'), value: S.f.open.text, ph: t('search_ph'), caps: true, cls: 'svs-grow' }) +
        '<div class="svs-bar-btns">' + btn('svs-open-propose', t('open_propose'), { cls: 'svs-btn-primary' }) +
        (R.openingPost ? btn('svs-open-post', t('open_review'), { cls: 'svs-btn-gold' }) : '') + '</div></div>' +
        '<div class="svs-alert" id="svs-open-alert" role="alert"></div>';
    }
    setHtml(byIdIn(H.root, 'svs-open-bar'), barHtml);
    paintOpeningRows(R);
  }
  function paintOpeningRows(R) {
    var el = H && H.root ? byIdIn(H.root, 'svs-open-rows') : null;
    if (!el) return;
    var parts = arr(S.opening.parts);
    var cands = openingCandidates();
    var entry = '';
    var i;
    if (!parts.length) {
      entry = '';
    } else if (!R.openingPropose) {
      entry = notice('info', t('open_view_only')) + '<div class="svs-sum">' + num(cands.length) + ' ' + esc(t('open_without')) + '</div>';
    } else if (!cands.length) {
      entry = emptyHtml(t('open_all_set'));
    } else {
      var pages = pagesOf(cands.length, PAGE_OPEN);
      if (S.f.open.page > pages) S.f.open.page = pages;
      if (S.f.open.page < 1) S.f.open.page = 1;
      var from = (S.f.open.page - 1) * PAGE_OPEN;
      var slice = cands.slice(from, from + PAGE_OPEN);
      entry = '<div class="svs-list" role="list">';
      for (i = 0; i < slice.length; i++) {
        var c = slice[i];
        var cur = S.opening.rows[c.code] || { qty: '', cost: '' };
        var er = (S.opening.errors && S.opening.errors[c.code]) || {};
        entry += '<div class="svs-row" role="listitem" data-svs-key="' + attr(c.code) + '">' +
          '<div class="svs-c svs-c-code"><b class="svs-code">' + esc(c.code) + '</b></div><div class="svs-c">' + esc(c.name) + '</div>' +
          '<div class="svs-c svs-c-in"><label for="svs-oq-' + attr(from + i) + '">' + esc(t('counted_qty')) + '</label>' +
          '<input type="text" class="svs-input" id="svs-oq-' + attr(from + i) + '" data-svs-field="o-qty" data-svs-key="' + attr(c.code) + '" value="' + attr(cur.qty) + '" inputmode="numeric" maxlength="6" autocomplete="off"' + (er.qty ? ' aria-invalid="true"' : '') + '></div>' +
          '<div class="svs-c svs-c-in"><label for="svs-oc-' + attr(from + i) + '">' + esc(t('unit_cost_ex')) + '</label>' +
          '<input type="text" class="svs-input" id="svs-oc-' + attr(from + i) + '" data-svs-field="o-cost" data-svs-key="' + attr(c.code) + '" value="' + attr(cur.cost) + '" inputmode="decimal" maxlength="12" autocomplete="off"' + (er.cost ? ' aria-invalid="true"' : '') + '></div></div>';
      }
      entry += '</div>' + pagerHtml('svs-open', S.f.open.page, pages, cands.length, '');
    }
    el.innerHTML = entry;
  }
  /* Read every typed opening row; skip blank and zero rows; refuse bad ones. */
  function collectOpening() {
    var rows = S.opening.rows;
    var parts = {};
    var list = arr(S.opening.parts);
    var i;
    for (i = 0; i < list.length; i++) parts[list[i].code] = list[i];
    var lines = [];
    var errors = {};
    var firstError = null;
    var pieces = 0;
    var value = 0;
    var code;
    for (code in rows) {
      if (!Object.prototype.hasOwnProperty.call(rows, code)) continue;
      var r = rows[code];
      var qtxt = asText(r.qty).replace(/^\s+|\s+$/g, '');
      if (qtxt === '') continue;
      var q = parseQty(qtxt, { min: 0, max: QTY_MAX });
      if (!q.ok) { errors[code] = { qty: true }; if (!firstError) firstError = { code: code, err: q }; continue; }
      if (q.qty === 0) continue;
      var c = parsePaise(r.cost);
      if (!c.ok) { errors[code] = { cost: true }; if (!firstError) firstError = { code: code, err: c }; continue; }
      if (!parts[code]) continue;
      lines.push({ partCode: code, qty: q.qty, unitCostPaise: c.paise });
      pieces += q.qty;
      value += q.qty * c.paise;
    }
    lines.sort(function (a, b) { return a.partCode < b.partCode ? -1 : (a.partCode > b.partCode ? 1 : 0); });
    return { lines: lines, errors: errors, firstError: firstError, pieces: pieces, valuePaise: value };
  }
  function openingReview(mode) {
    var g = writeGate(mode === 'post' ? 'openingPost' : 'openingPropose');
    if (g) { showFailure(g); return g; }
    var c = collectOpening();
    S.opening.errors = c.errors;
    if (c.firstError) {
      paintOpening(shownRights());
      var msg = c.firstError.code + ': ' + errText(c.firstError.err);
      setHtml(byIdIn(H.root, 'svs-open-alert'), esc(msg));
      toast(msg);
      return fail(c.firstError.err.code);
    }
    if (!c.lines.length) {
      paintOpening(shownRights());
      setHtml(byIdIn(H.root, 'svs-open-alert'), esc(t('open_nothing')));
      toast(t('open_nothing'));
      return fail('LINES_REQUIRED');
    }
    openDialog('open-confirm', { mode: mode, lines: c.lines, pieces: c.pieces, valuePaise: c.valuePaise });
    return { ok: true };
  }
  function openingConfirm() {
    var d = S.dialog;
    if (!d || d.kind !== 'open-confirm') return Promise.resolve(fail('SVS_BAD_REPLY'));
    var mode = d.data.mode;
    var g = writeGate(mode === 'post' ? 'openingPost' : 'openingPropose');
    if (g) { showFailure(g); return Promise.resolve(g); }
    var lines = d.data.lines;
    var payload = { lines: lines.map(function (l) { return { partCode: l.partCode, qty: l.qty, unitCostPaise: l.unitCostPaise }; }), note: '' };
    return exclusive(function () {
      function done(r, text) {
        if (!r.ok) { showFailure(r); return r; }
        var i;
        for (i = 0; i < lines.length; i++) delete S.opening.rows[lines[i].partCode];
        S.opening.errors = {};
        closeDialog();
        toast(text);
        renderShellAndTab();
        return r;
      }
      if (mode === 'post') {
        var label = fill(t('pin_open_post'), { n: lines.length, pieces: d.data.pieces, amount: money(d.data.valuePaise) });
        return ownerStep(label, function (ctx) {
          return callWrite('proposeOpening', [payload, ctx]).then(function (pr) {
            if (!pr.ok) return pr;
            var id = pr.proposalId || (pr.doc && pr.doc.id) || pr.id;
            var ctx2 = makeCtx(ctx.session, ctx.stepUp, ctx.clientRef + '-a');
            return callWrite('approveOpening', [id, ctx2]);
          });
        }, d.clientRef).then(function (r) { return done(r, fill(t('open_posted'), { n: lines.length, pieces: d.data.pieces })); });
      }
      return callWrite('proposeOpening', [payload, makeCtx(readSession(), null, d.clientRef)]).then(function (r) {
        return done(r, fill(t('open_sent'), { n: lines.length }));
      });
    });
  }
  function openingApprove(id) {
    var g = writeGate('openingPost');
    if (g) { showFailure(g); return Promise.resolve(g); }
    var p = null;
    var props = arr(S.opening.proposals);
    var i;
    for (i = 0; i < props.length; i++) { if (props[i].id === id) p = props[i]; }
    var tot = p ? proposalTotals(p) : { parts: 0, pieces: 0, valuePaise: 0 };
    return exclusive(function () {
      return ownerStep(fill(t('pin_open_post'), { n: tot.parts, pieces: tot.pieces, amount: money(tot.valuePaise) }), function (ctx) {
        return callWrite('approveOpening', [id, ctx]);
      }).then(function (r) {
        if (!r.ok) { showFailure(r); return r; }
        toast(fill(t('open_posted'), { n: tot.parts, pieces: tot.pieces }));
        renderShellAndTab();
        return r;
      });
    });
  }
  function openingWithdraw(id) {
    var g = writeGate('openingPropose');
    if (g) { showFailure(g); return Promise.resolve(g); }
    return exclusive(function () {
      return callWrite('withdrawOpening', [id, makeCtx(readSession(), null, newRef())]).then(function (r) {
        if (!r.ok) { showFailure(r); return r; }
        toast(t('withdrawn'));
        renderShellAndTab();
        return r;
      });
    });
  }

  /* ---------- dialogs ---------- */

  function trim(v) { return asText(v).replace(/^\s+|\s+$/g, ''); }
  function lineErr(d, i, name) { return d.errors['lines.' + i + '.' + name] || ''; }
  function setDialogErrors(errors) {
    var d = S.dialog;
    if (!d) return;
    d.errors = errors;
    d.error = t('fix_entries');
    d.info = '';
    renderDialog(false);
  }
  function cancelFooter(saveHtml) {
    return saveHtml + ' ' + btn('svs-dialog-close', t('cancel'));
  }
  function pickedHtml(L) {
    if (!L.partCode) return '';
    var tax = isInt(L.gstRateBp) || L.hsn ? t('hsn') + ' ' + (L.hsn || '-') + ', ' + t('gst') + ' ' + (isInt(L.gstRateBp) ? (L.gstRateBp / 100) + '%' : '-') : t('tax_missing');
    return '<div class="svs-picked"><b class="svs-code">' + esc(L.partCode) + '</b> ' + esc(L.partName) + ' <span class="svs-dim">' + esc(tax) + '</span></div>';
  }
  /* i undefined = a flat form (fields live directly on the dialog data), else line i */
  function partFieldHtml(d, L, i, labelKey, req) {
    var flat = i === undefined;
    return fld({ name: 'partSearch', label: t(labelKey || 'part'), value: L.partSearch, line: i, caps: true, req: req !== false, ph: t('search_ph'), err: flat ? d.errors.partSearch : lineErr(d, i, 'partSearch') }) +
      '<div data-svs-results="' + (flat ? 'D' : 'L' + attr(i)) + '"></div>' + pickedHtml(L);
  }

  var DIALOGS = {};

  /* --- stock ledger (read only) --- */
  DIALOGS.ledger = function (d) {
    var D = d.data;
    var R = rights();
    var res = D.result;
    var body = '<div class="svs-bar">' + fld({ name: 'from', kind: 'date', label: t('from'), value: D.from, err: d.errors.from }) + fld({ name: 'to', kind: 'date', label: t('to'), value: D.to }) +
      '<div class="svs-bar-btns">' + btn('svs-ledger-apply', t('apply')) + '</div></div>';
    if (!res) {
      body += loadingHtml();
    } else if (!res.ok) {
      body += '<div class="svs-note svs-note-bad" role="alert">' + esc(errText(res)) + '</div>';
    } else {
      body += '<div class="svs-sum">' + esc(t('on_hand')) + ' ' + num(isInt(res.onHand) ? res.onHand : 0) + (R.viewCost ? ', ' + esc(t('fifo_value')) + ' <span class="svs-num">' + esc(money(res.valuePaise)) + '</span>' : '') + '</div>';
      var rows = arr(res.rows);
      var out = '';
      var i;
      for (i = 0; i < rows.length; i++) {
        var x = rows[i];
        var type = asText(firstOf(x, ['docType', 'type', 'k']));
        var inQ = firstOf(x, ['inQty', 'qtyIn']);
        var outQ = firstOf(x, ['outQty', 'qtyOut']);
        var bal = firstOf(x, ['balanceQty', 'balQty', 'balance']);
        var unit = firstOf(x, ['unitCostPaise']);
        var val = firstOf(x, ['valuePaise']);
        if (val === undefined) { val = isInt(x.valueInPaise) && x.valueInPaise > 0 ? x.valueInPaise : (isInt(x.valueOutPaise) ? x.valueOutPaise : undefined); }
        out += '<div class="' + attr(cls('svs-row', x.reversed ? 'is-reversed' : '')) + '" role="listitem">' +
          '<div class="svs-c">' + esc(fmtAt(x.at || x.date)) + '</div>' +
          '<div class="svs-c">' + esc(t(DOC_TYPE_LABEL[type] || 'type_other')) + ' <span class="svs-dim">' + esc(firstOf(x, ['docNo', 'ref'])) + (x.jobId ? ' ' + esc(x.jobId) : '') + '</span>' + (x.reversed ? ' ' + badge('off', t('status_reversed')) : '') + '</div>' +
          '<div class="svs-c svs-c-num"><span class="svs-lbl">' + esc(t('in')) + '</span> ' + num(isInt(inQ) ? inQ : 0) + ' <span class="svs-lbl">' + esc(t('out')) + '</span> ' + num(isInt(outQ) ? outQ : 0) + ' <span class="svs-lbl">' + esc(t('balance')) + '</span> ' + num(isInt(bal) ? bal : 0) + '</div>';
        if (R.viewCost) out += '<div class="svs-c svs-c-num"><span class="svs-lbl">' + esc(t('unit_cost')) + '</span> ' + esc(money(unit)) + ' <span class="svs-lbl">' + esc(t('value')) + '</span> ' + esc(money(val)) + '</div>';
        out += '<div class="svs-c svs-dim">' + esc(firstOf(x, ['actor', 'by'])) + (x.note ? ' ' + esc(x.note) : '') + '</div></div>';
      }
      if (!rows.length) out = emptyHtml(t('ledger_empty'));
      body += '<div class="svs-list" role="list">' + out + '</div>';
      var total = isInt(res.total) ? res.total : rows.length;
      body += pagerHtml('svs-ledger', D.page, pagesOf(total, PAGE_LEDGER), total, '');
    }
    return {
      title: t('ledger_title'), subHtml: '<b class="svs-code">' + esc(D.code) + '</b> ' + esc(D.name), body: body, wide: true,
      footer: btn('svs-ledger-print', t('print_ledger')) + ' ' + btn('svs-ledger-close', t('close'), { cls: 'svs-btn-primary', focus: true })
    };
  };
  function loadLedger() {
    var d = S.dialog;
    if (!d || d.kind !== 'ledger') return Promise.resolve({ ok: false });
    var D = d.data;
    var s = readSession();
    var q = { from: D.from, to: D.to, offset: (D.page - 1) * PAGE_LEDGER, limit: PAGE_LEDGER };
    return callCore('ledger', [D.code, q, makeCtx(s, null, '')]).then(function (r) {
      if (S.dialog !== d) return r;
      D.result = r;
      if (r.ok && r.part) D.name = asText(r.part.name || r.part.desc || D.name);
      renderDialog(false);
      return r;
    });
  }
  function openLedger(code) {
    var R = rights();
    if (!R.viewLedger) { showFailure(fail('SVS_ROLE_DENIED')); return Promise.resolve(fail('SVS_ROLE_DENIED')); }
    var today = todayIso();
    openDialog('ledger', { code: code, name: '', from: addDays(today, -90), to: today, page: 1, result: null });
    return loadLedger();
  }

  /* --- goods receipt --- */
  function blankGrnLine() { return { partCode: '', partName: '', partSearch: '', hsn: '', gstRateBp: null, qtyInvoiced: '', qtyReceived: '', cost: '' }; }
  function grnTotals(D) {
    var pieces = 0;
    var value = 0;
    var n = 0;
    var i;
    for (i = 0; i < D.lines.length; i++) {
      var q = parseQty(D.lines[i].qtyReceived);
      var c = parsePaise(D.lines[i].cost);
      if (D.lines[i].partCode) n++;
      if (q.ok) {
        pieces += q.qty;
        if (c.ok) value += q.qty * c.paise;
      }
    }
    return { lines: n, pieces: pieces, valuePaise: value };
  }
  function grnTotalHtml(D) {
    var tt = grnTotals(D);
    return esc(t('lines')) + ' ' + num(tt.lines) + ', ' + esc(t('pieces')) + ' ' + num(tt.pieces) + ', ' + esc(t('value')) + ' <span class="svs-num">' + esc(money(tt.valuePaise)) + '</span>';
  }
  DIALOGS.grn = function (d) {
    var D = d.data;
    var body = '<div class="svs-form">' +
      fld({ name: 'supplierName', label: t('supplier'), value: D.supplierName, max: 60, req: true, err: d.errors.supplierName }) +
      fld({ name: 'supplierInvoiceNo', label: t('supplier_invoice_no'), value: D.supplierInvoiceNo, max: 40, req: true, caps: true, focus: true, err: d.errors.supplierInvoiceNo }) +
      fld({ name: 'supplierInvoiceDate', kind: 'date', label: t('supplier_invoice_date'), value: D.supplierInvoiceDate, req: true, err: d.errors.supplierInvoiceDate }) +
      fld({ name: 'note', label: t('note'), value: D.note, max: 200 });
    var i;
    for (i = 0; i < D.lines.length; i++) {
      var L = D.lines[i];
      body += '<div class="svs-line"><div class="svs-line-head"><b>' + esc(t('line')) + ' ' + num(i + 1) + '</b>' +
        (D.lines.length > 1 ? btn('svs-grn-line-remove', t('remove'), { key: i, cls: 'svs-btn-quiet' }) : '') + '</div>' +
        partFieldHtml(d, L, i) +
        '<div class="svs-bar">' +
        fld({ name: 'qtyInvoiced', label: t('qty_invoiced'), value: L.qtyInvoiced, line: i, mode: 'numeric', max: 6, err: lineErr(d, i, 'qtyInvoiced'), hint: t('qty_invoiced_hint') }) +
        fld({ name: 'qtyReceived', label: t('qty_received'), value: L.qtyReceived, line: i, mode: 'numeric', max: 6, req: true, err: lineErr(d, i, 'qtyReceived') }) +
        fld({ name: 'cost', label: t('unit_cost_ex'), value: L.cost, line: i, mode: 'decimal', max: 12, req: true, err: lineErr(d, i, 'cost'), enter: i === D.lines.length - 1 ? 'svs-grn-line-add' : '' }) +
        '</div></div>';
    }
    body += btn('svs-grn-line-add', t('add_line'), { cls: 'svs-btn-quiet' }) + '<div id="svs-grn-total" class="svs-sum">' + grnTotalHtml(D) + '</div></div>';
    return { title: t('grn_title'), body: body, wide: true, footer: btn('svs-grn-save', t('grn_save'), { cls: 'svs-btn-primary' }) + ' ' + btn('svs-grn-cancel', t('cancel')) };
  };
  function validateGrn(D) {
    var errors = {};
    var any = false;
    var name = trim(D.supplierName);
    if (!name || name.length > 60) { errors.supplierName = ERR.SVS_FIELD_REQUIRED; any = true; }
    var inv = trim(D.supplierInvoiceNo);
    if (!inv) { errors.supplierInvoiceNo = ERR.SVS_FIELD_REQUIRED; any = true; } else if (!/^[A-Za-z0-9\/._-]{1,40}$/.test(inv)) { errors.supplierInvoiceNo = t('inv_invalid'); any = true; }
    var date = trim(D.supplierInvoiceDate);
    if (!date) { errors.supplierInvoiceDate = ERR.SVS_FIELD_REQUIRED; any = true; } else if (!validIso(date) || date < '2020-01-01') { errors.supplierInvoiceDate = ERR.SVS_DATE_INVALID; any = true; } else if (date > todayIso()) { errors.supplierInvoiceDate = ERR.SVS_DATE_FUTURE; any = true; }
    var lines = [];
    var seen = {};
    if (!D.lines.length) { any = true; }
    if (D.lines.length > MAX_LINES) { any = true; errors.supplierName = errors.supplierName || ERR.TOO_MANY_LINES; }
    var i;
    for (i = 0; i < D.lines.length; i++) {
      var L = D.lines[i];
      var bad = false;
      if (!L.partCode) { errors['lines.' + i + '.partSearch'] = ERR.SVS_PART_REQUIRED; bad = true; } else if (seen[L.partCode]) { errors['lines.' + i + '.partSearch'] = ERR.SVS_DUPLICATE_LINE; bad = true; }
      seen[L.partCode] = true;
      var rq = parseQty(L.qtyReceived);
      if (!rq.ok) { errors['lines.' + i + '.qtyReceived'] = errText(rq); bad = true; }
      var inq = null;
      if (trim(L.qtyInvoiced) !== '') {
        var iq = parseQty(L.qtyInvoiced);
        if (!iq.ok) { errors['lines.' + i + '.qtyInvoiced'] = errText(iq); bad = true; } else if (rq.ok && iq.qty < rq.qty) { errors['lines.' + i + '.qtyInvoiced'] = t('inv_qty_low'); bad = true; } else inq = iq.qty;
      }
      var cp = parsePaise(L.cost);
      if (!cp.ok) { errors['lines.' + i + '.cost'] = errText(cp); bad = true; }
      if (bad) any = true;
      else lines.push({ partCode: L.partCode, qtyInvoiced: inq, qtyReceived: rq.qty, unitCostPaise: cp.paise });
    }
    return { errors: errors, payload: any ? null : { supplierName: name, supplierInvoiceNo: inv, supplierInvoiceDate: date, lines: lines, note: trim(D.note) } };
  }
  function grnSave() {
    var d = S.dialog;
    if (!d || d.kind !== 'grn') return Promise.resolve(fail('SVS_BAD_REPLY'));
    dialogCapture();
    var g = writeGate('receive');
    if (g) { showFailure(g); return Promise.resolve(g); }
    var v = validateGrn(d.data);
    if (!v.payload) { setDialogErrors(v.errors); return Promise.resolve(fail('SVS_FIELD_REQUIRED')); }
    return exclusive(function () {
      return callWrite('receiveGoods', [v.payload, makeCtx(readSession(), null, d.clientRef)]).then(function (r) {
        if (!r.ok) { showFailure(r); return r; }
        var doc = r.doc || r;
        var pieces = 0;
        var i;
        for (i = 0; i < v.payload.lines.length; i++) pieces += v.payload.lines[i].qtyReceived;
        closeDialog();
        toast(fill(t('grn_saved'), { no: asText(doc.no), lines: v.payload.lines.length, pieces: pieces }));
        if (S.tab === 'receive') renderShellAndTab();
        return r;
      });
    });
  }

  /* --- view a receipt (read only) --- */
  DIALOGS['grn-view'] = function (d) {
    var D = d.data;
    var R = rights();
    var body;
    if (!D.result) body = loadingHtml();
    else if (!D.result.ok) body = '<div class="svs-note svs-note-bad" role="alert">' + esc(errText(D.result)) + '</div>';
    else {
      var doc = D.result.doc || D.result;
      body = '<div class="svs-sum">' + esc(t('supplier')) + ' ' + esc(doc.supplierName) + ', ' + esc(t('supplier_invoice_no')) + ' ' + esc(doc.supplierInvoiceNo) + ', ' + esc(fmtAt(doc.supplierInvoiceDate)) + '</div>';
      var ls = arr(doc.lines);
      var i;
      var pieces = 0;
      var value = 0;
      body += '<div class="svs-list" role="list">';
      for (i = 0; i < ls.length; i++) {
        var L = ls[i];
        var rcv = isInt(L.qtyReceived) ? L.qtyReceived : 0;
        pieces += rcv;
        value += rcv * (isInt(L.unitCostPaise) ? L.unitCostPaise : 0);
        body += '<div class="svs-row" role="listitem"><div class="svs-c svs-c-code"><b class="svs-code">' + esc(L.partCode) + '</b></div>' +
          '<div class="svs-c svs-c-num"><span class="svs-lbl">' + esc(t('qty_invoiced')) + '</span> ' + (isInt(L.qtyInvoiced) ? num(L.qtyInvoiced) : '-') + ' <span class="svs-lbl">' + esc(t('qty_received')) + '</span> ' + num(rcv) + ' <span class="svs-lbl">' + esc(t('qty_short')) + '</span> ' + num(isInt(L.qtyShort) ? L.qtyShort : 0) + '</div>' +
          (R.viewCost ? '<div class="svs-c svs-c-num">' + esc(money(L.unitCostPaise)) + '</div>' : '') + '</div>';
      }
      body += '</div><div class="svs-sum">' + esc(t('pieces')) + ' ' + num(pieces) + (R.viewCost ? ', ' + esc(t('value')) + ' <span class="svs-num">' + esc(money(value)) + '</span>' : '') + '</div>';
    }
    return {
      title: t('grn_view_title'), subHtml: '<b class="svs-code">' + esc(D.no) + '</b>', body: body, wide: true,
      footer: btn('svs-grn-print', t('print_grn'), { key: D.no }) + ' ' + btn('svs-grn-view-close', t('close'), { cls: 'svs-btn-primary', focus: true })
    };
  };

  /* --- reverse a receipt, a counter sale or an adjustment --- */
  DIALOGS.reverse = function (d) {
    var D = d.data;
    var confirmId = D.mode === 'cs' ? 'svs-cs-reverse-confirm' : (D.mode === 'adj' ? 'svs-adj-reverse-confirm' : 'svs-grn-reverse-confirm');
    var body = '<div class="svs-form">' + notice('warn', D.mode === 'grn' ? t('reverse_grn_warn') : t('reverse_warn')) +
      fld({ name: 'reason', kind: 'textarea', label: t('reason'), value: D.reason, max: 200, req: true, focus: true, err: d.errors.reason, hint: t('reason_hint') }) + '</div>';
    return { title: t('reverse_title'), subHtml: '<b class="svs-code">' + esc(D.no) + '</b>', body: body, footer: cancelFooter(btn(confirmId, t('reverse_confirm'), { cls: 'svs-btn-danger', key: D.no })) };
  };
  function reverseOpen(mode, no) {
    var rowInfo = mode === 'grn' ? (S.grnRows || {})[no] : null;
    /* A counter sale's day comes from the list the user saw; an unknown sale counts as an older one (Owner PIN). */
    var day = mode === 'cs' && S.csRows && Object.prototype.hasOwnProperty.call(S.csRows, no) ? S.csRows[no] : '';
    openDialog('reverse', { mode: mode, no: no, day: day, reason: '', pieces: rowInfo && isInt(rowInfo.pieces) ? rowInfo.pieces : 0, valuePaise: rowInfo ? rowInfo.valuePaise : null });
    return { ok: true };
  }
  function reverseConfirm(mode) {
    var d = S.dialog;
    if (!d || d.kind !== 'reverse') return Promise.resolve(fail('SVS_BAD_REPLY'));
    dialogCapture();
    var D = d.data;
    var needOwner = mode !== 'cs';
    var R = rights();
    if (mode === 'cs' && !R.reverseCounter) { var g0 = fail('SVS_ROLE_DENIED'); showFailure(g0); return Promise.resolve(g0); }
    var g = writeGate(needOwner ? 'reverseDoc' : 'reverseCounter');
    if (g) { showFailure(g); return Promise.resolve(g); }
    var reason = trim(D.reason);
    if (reason.length < 5 || reason.length > 200) { setDialogErrors({ reason: ERR.SVS_REASON_SHORT }); return Promise.resolve(fail('SVS_REASON_SHORT')); }
    var sameDay = !!D.day && D.day === todayIso();
    var needPin = needOwner || !sameDay;
    var finish = function (r) {
      if (!r.ok) { showFailure(r); return r; }
      closeDialog();
      toast(fill(t('reversed_done'), { no: D.no }));
      renderShellAndTab();
      return r;
    };
    return exclusive(function () {
      if (!needPin) return callWrite('reverseDoc', [D.no, reason, makeCtx(readSession(), null, d.clientRef)]).then(finish);
      var label = mode === 'grn' ? fill(t('pin_reverse_grn'), { no: D.no, pieces: D.pieces, amount: money(D.valuePaise) }) :
        (mode === 'adj' ? fill(t('pin_reverse_adj'), { no: D.no }) : fill(t('pin_reverse_cs'), { no: D.no }));
      return ownerStep(label, function (ctx) { return callWrite('reverseDoc', [D.no, reason, ctx]); }, d.clientRef).then(finish);
    });
  }

  /* --- propose an adjustment --- */
  function blankAdjLine() { return { partCode: '', partName: '', partSearch: '', direction: 'down', qty: '1', reason: 'COUNT_CORRECTION', cost: '' }; }
  function adjReasonDef(code) {
    var i;
    for (i = 0; i < ADJ_REASONS.length; i++) { if (ADJ_REASONS[i].v === code) return ADJ_REASONS[i]; }
    return null;
  }
  DIALOGS.adj = function (d) {
    var D = d.data;
    if (D.savedId) {
      var R = rights();
      return {
        title: t('adj_title'), body: notice('ok', fill(t('adj_proposed'), { id: D.savedId })),
        footer: (R.approveAdj ? btn('svs-adj-approve', t('approve_now'), { key: D.savedId, cls: 'svs-btn-primary', focus: true }) + ' ' : '') + btn('svs-dialog-close', t('close'))
      };
    }
    var body = '<div class="svs-form">' + notice('info', t('adj_note_info'));
    var i;
    for (i = 0; i < D.lines.length; i++) {
      var L = D.lines[i];
      body += '<div class="svs-line"><div class="svs-line-head"><b>' + esc(t('line')) + ' ' + num(i + 1) + '</b>' +
        (D.lines.length > 1 ? btn('svs-adj-line-remove', t('remove'), { key: i, cls: 'svs-btn-quiet' }) : '') + '</div>' + partFieldHtml(d, L, i) +
        '<div class="svs-bar">' +
        fld({ name: 'direction', kind: 'select', label: t('direction'), options: [{ v: 'up', l: t('dir_up') }, { v: 'down', l: t('dir_down') }], value: L.direction, line: i, err: lineErr(d, i, 'direction') }) +
        fld({ name: 'qty', label: t('qty'), value: L.qty, line: i, mode: 'numeric', max: 6, req: true, err: lineErr(d, i, 'qty') }) +
        fld({ name: 'reason', kind: 'select', label: t('reason'), options: tOptions(ADJ_REASONS), value: L.reason, line: i, err: lineErr(d, i, 'reason') }) +
        fld({ name: 'cost', label: t('unit_cost_opt'), value: L.cost, line: i, mode: 'decimal', max: 12, err: lineErr(d, i, 'cost'), hint: t('unit_cost_opt_hint') }) + '</div></div>';
    }
    body += btn('svs-adj-line-add', t('add_line'), { cls: 'svs-btn-quiet' }) +
      fld({ name: 'note', kind: 'textarea', label: t('note'), value: D.note, max: 200, req: true, err: d.errors.note, focus: !D.lines[0].partSearch }) + '</div>';
    return { title: t('adj_title'), body: body, wide: true, footer: btn('svs-adj-save', t('adj_send'), { cls: 'svs-btn-primary' }) + ' ' + btn('svs-adj-cancel', t('cancel')) };
  };
  function validateAdj(D) {
    var errors = {};
    var any = false;
    var note = trim(D.note);
    if (note.length < 5) { errors.note = ERR.SVS_NOTE_SHORT; any = true; }
    var lines = [];
    var seen = {};
    var i;
    if (!D.lines.length) any = true;
    for (i = 0; i < D.lines.length; i++) {
      var L = D.lines[i];
      var bad = false;
      if (!L.partCode) { errors['lines.' + i + '.partSearch'] = ERR.SVS_PART_REQUIRED; bad = true; } else if (seen[L.partCode]) { errors['lines.' + i + '.partSearch'] = ERR.SVS_DUPLICATE_LINE; bad = true; }
      seen[L.partCode] = true;
      var q = parseQty(L.qty);
      if (!q.ok) { errors['lines.' + i + '.qty'] = errText(q); bad = true; }
      var def = adjReasonDef(L.reason);
      if (!def) { errors['lines.' + i + '.reason'] = ERR.REASON_INVALID; bad = true; } else if (def.dir === 'up' && L.direction !== 'up') { errors['lines.' + i + '.direction'] = t('dir_up_only'); bad = true; } else if (def.dir === 'down' && L.direction !== 'down') { errors['lines.' + i + '.direction'] = t('dir_down_only'); bad = true; }
      var cost = null;
      if (trim(L.cost) !== '' && L.direction === 'up') {
        var cp = parsePaise(L.cost);
        if (!cp.ok) { errors['lines.' + i + '.cost'] = errText(cp); bad = true; } else cost = cp.paise;
      }
      if (bad) any = true;
      else lines.push({ partCode: L.partCode, qtyDelta: L.direction === 'up' ? q.qty : -q.qty, reason: L.reason, unitCostPaise: cost });
    }
    return { errors: errors, payload: any ? null : { lines: lines, note: note } };
  }
  function adjSave() {
    var d = S.dialog;
    if (!d || d.kind !== 'adj') return Promise.resolve(fail('SVS_BAD_REPLY'));
    dialogCapture();
    var g = writeGate('proposeAdj');
    if (g) { showFailure(g); return Promise.resolve(g); }
    var v = validateAdj(d.data);
    if (!v.payload) { setDialogErrors(v.errors); return Promise.resolve(fail('SVS_FIELD_REQUIRED')); }
    return exclusive(function () {
      return callWrite('proposeAdjustment', [v.payload, makeCtx(readSession(), null, d.clientRef)]).then(function (r) {
        if (!r.ok) { showFailure(r); return r; }
        var id = asText(r.proposalId || (r.doc && r.doc.id) || r.id);
        toast(fill(t('adj_proposed'), { id: id }));
        if (rights().approveAdj) {
          d.data.savedId = id;
          d.dirty = false;
          renderDialog(true);
        } else {
          closeDialog();
        }
        if (S.tab === 'adjust') renderShellAndTab();
        return r;
      });
    });
  }
  function adjApprove(id) {
    var R = rights();
    var gate = writeGate(R.approveAdj ? 'approveAdj' : 'approveAdjMgr');
    if (gate) {
      // a Store Manager above the limit (or a write-off) gets the plain Owner-only text
      if (R.manager && !R.owner) gate = fail('SVS_OWNER_ONLY');
      showFailure(gate);
      return Promise.resolve(gate);
    }
    if (!R.owner) {
      var row = S.adjRows ? S.adjRows[id] : null;
      var why = mgrApproveBlock(row, readSession());
      if (why) {
        var oo = fail(why);
        showFailure(oo);
        return Promise.resolve(oo);
      }
    }
    var finish = function (r) {
      if (!r.ok) { showFailure(r); return r; }
      if (S.dialog && S.dialog.kind === 'adj') closeDialog();
      toast(t('adj_approved'));
      renderShellAndTab();
      return r;
    };
    return exclusive(function () {
      if (!R.owner) return callWrite('approveAdjustment', [id, makeCtx(readSession(), null, newRef())]).then(finish);
      return ownerStep(adjustmentLabel(id), function (ctx) { return callWrite('approveAdjustment', [id, ctx]); }, S.dialog && S.dialog.clientRef).then(finish);
    });
  }
  /* Build the PIN label from the proposal rows of the last list load. */
  function adjustmentLabel(id) {
    var row = S.adjRows ? S.adjRows[id] : null;
    if (!row) return fill(t('pin_adj_generic'), { id: id });
    var ls = arr(row.lines);
    if (ls.length === 1) {
      var l = ls[0];
      return fill(t('pin_adj_one'), { no: id, dir: l.qtyDelta >= 0 ? t('increase') : t('decrease'), qty: Math.abs(l.qtyDelta), code: l.partCode, reason: asText(l.reason), amount: money(isInt(row.valuePaise) ? row.valuePaise : null) });
    }
    return fill(t('pin_adj_many'), { no: id, n: ls.length, amount: money(isInt(row.valuePaise) ? row.valuePaise : null) });
  }
  function proposalDecision(kind, id, verb) {
    var m = (kind === 'open' ? 'Opening' : 'Adjustment');
    return callWrite(verb + m, [id, makeCtx(readSession(), null, newRef())]);
  }
  function adjWithdraw(id) {
    var g = writeGate('proposeAdj');
    if (g) { showFailure(g); return Promise.resolve(g); }
    return exclusive(function () {
      return proposalDecision('adj', id, 'withdraw').then(function (r) {
        if (!r.ok) { showFailure(r); return r; }
        toast(t('withdrawn'));
        renderShellAndTab();
        return r;
      });
    });
  }

  /* --- reject a proposal (reason, no PIN, stock unchanged) --- */
  DIALOGS.reject = function (d) {
    var D = d.data;
    var body = '<div class="svs-form">' + notice('info', t('reject_info')) +
      fld({ name: 'reason', kind: 'textarea', label: t('reason'), value: D.reason, max: 200, req: true, focus: true, err: d.errors.reason, hint: t('reason_hint') }) + '</div>';
    return { title: t('reject_title'), subHtml: '<b class="svs-code">' + esc(D.id) + '</b>', body: body, footer: cancelFooter(btn(D.target === 'open' ? 'svs-open-reject-confirm' : 'svs-adj-reject-confirm', t('reject'), { cls: 'svs-btn-danger', key: D.id })) };
  };
  function rejectConfirm(target) {
    var d = S.dialog;
    if (!d || d.kind !== 'reject') return Promise.resolve(fail('SVS_BAD_REPLY'));
    dialogCapture();
    var g = writeGate('rejectProposal');
    if (g) { showFailure(g); return Promise.resolve(g); }
    var reason = trim(d.data.reason);
    if (reason.length < 5 || reason.length > 200) { setDialogErrors({ reason: ERR.SVS_REASON_SHORT }); return Promise.resolve(fail('SVS_REASON_SHORT')); }
    return exclusive(function () {
      return callWrite(target === 'open' ? 'rejectOpening' : 'rejectAdjustment', [d.data.id, reason, makeCtx(readSession(), null, d.clientRef)]).then(function (r) {
        if (!r.ok) { showFailure(r); return r; }
        closeDialog();
        toast(t('rejected_done'));
        renderShellAndTab();
        return r;
      });
    });
  }

  /* --- old part register --- */
  var OLD_FIRST_STATES = ['HELD_FOR_CLAIM', 'CUSTOMER_RETURNED', 'SCRAP_PENDING'];
  var OLD_NEXT_DEFAULT = { HELD_FOR_CLAIM: ['CUSTOMER_RETURNED', 'SCRAP_PENDING'], SCRAP_PENDING: ['HELD_FOR_CLAIM', 'CUSTOMER_RETURNED'], CUSTOMER_RETURNED: [], SCRAPPED: [] };
  function oldStateOptions(list) {
    var out = [];
    var i;
    for (i = 0; i < list.length; i++) out.push({ v: list[i], l: t(OLD_LABEL[list[i]]) });
    return out;
  }
  function blankOld(jobId) {
    return { jobId: jobId || '', partCode: '', partName: '', partSearch: '', partText: '', qty: '1', serialRef: '', state: 'HELD_FOR_CLAIM', claimRef: '', note: '' };
  }
  DIALOGS.old = function (d) {
    var D = d.data;
    var ids = H && typeof H.jobIds === 'function' ? arr(H.jobIds()) : [];
    var listHtml = '<datalist id="svs-old-jobs">';
    var i;
    for (i = 0; i < ids.length && i < 200; i++) listHtml += '<option value="' + attr(ids[i]) + '"></option>';
    listHtml += '</datalist>';
    var jobField = fld({ name: 'jobId', label: t('job_no'), value: D.jobId, max: 24, caps: true, err: d.errors.jobId, hint: t('job_no_hint') }).replace('<input ', '<input list="svs-old-jobs" ');
    var body = '<div class="svs-form">' + jobField + listHtml +
      fld({ name: 'partText', label: t('old_desc'), value: D.partText, max: 60, req: true, focus: true, err: d.errors.partText }) +
      partFieldHtml(d, D, undefined, 'old_part_opt', false) +
      '<div class="svs-bar">' + fld({ name: 'qty', label: t('qty'), value: D.qty, mode: 'numeric', max: 6, err: d.errors.qty }) +
      fld({ name: 'state', kind: 'select', label: t('first_state'), options: oldStateOptions(OLD_FIRST_STATES), value: D.state }) + '</div>' +
      fld({ name: 'serialRef', label: t('serial_ref'), value: D.serialRef, max: 40 }) +
      fld({ name: 'claimRef', label: t('claim_ref'), value: D.claimRef, max: 30 }) +
      fld({ name: 'note', label: t('condition_note'), value: D.note, max: 80, enter: 'svs-old-save' }) + '</div>';
    return { title: t('old_title'), body: body, footer: btn('svs-old-save', t('register'), { cls: 'svs-btn-primary' }) + ' ' + btn('svs-old-cancel', t('cancel')) };
  };
  function oldSave() {
    var d = S.dialog;
    if (!d || d.kind !== 'old') return Promise.resolve(fail('SVS_BAD_REPLY'));
    dialogCapture();
    var g = writeGate('oldPartRegister');
    if (g) { showFailure(g); return Promise.resolve(g); }
    var D = d.data;
    var errors = {};
    var job = trim(D.jobId).toUpperCase();
    if (job && H && typeof H.job === 'function') {
      var info = null;
      try { info = H.job(job); } catch (e) { info = null; }
      if (!info) errors.jobId = ERR.SVS_JOB_UNKNOWN;
    }
    var text = trim(D.partText);
    if (!text && !D.partCode) errors.partText = ERR.SVS_FIELD_REQUIRED;
    var q = parseQty(D.qty);
    if (!q.ok) errors.qty = errText(q);
    if (OLD_FIRST_STATES.indexOf(D.state) < 0) errors.state = ERR.OLD_TRANSITION_INVALID;
    var keys = Object.keys(errors);
    if (keys.length) { setDialogErrors(errors); return Promise.resolve(fail('SVS_FIELD_REQUIRED')); }
    var payload = { jobId: job, partCode: D.partCode || '', partText: text, qty: q.qty, serialRef: trim(D.serialRef), state: D.state, claimRef: trim(D.claimRef), note: trim(D.note) };
    return exclusive(function () {
      return callWrite('registerOldPart', [payload, makeCtx(readSession(), null, d.clientRef)]).then(function (r) {
        if (!r.ok) { showFailure(r); return r; }
        closeDialog();
        toast(t('old_saved'));
        if (S.tab === 'oldparts') renderShellAndTab();
        else renderJobPanel();
        return r;
      });
    });
  }

  /* --- move an old part --- */
  DIALOGS['old-move'] = function (d) {
    var D = d.data;
    var body = '<div class="svs-form">' + notice('info', t('old_move_info')) +
      fld({ name: 'to', kind: 'select', label: t('move_to'), options: oldStateOptions(D.targets), value: D.to, focus: true, err: d.errors.to }) +
      fld({ name: 'claimRef', label: t('claim_ref'), value: D.claimRef, max: 30 }) +
      fld({ name: 'note', label: t('note'), value: D.note, max: 200, err: d.errors.note, hint: t('old_move_note_hint'), enter: 'svs-old-move-save' }) + '</div>';
    return { title: t('old_move_title'), subHtml: '<b class="svs-code">' + esc(D.no) + '</b> ' + esc(t(OLD_LABEL[D.from] || 'old_held')), body: body, footer: btn('svs-old-move-save', t('move'), { cls: 'svs-btn-primary' }) + ' ' + btn('svs-dialog-close', t('cancel')) };
  };
  function oldMoveOpen(no) {
    var g = writeGate('oldPartMove');
    if (g) { showFailure(g); return Promise.resolve(g); }
    var row = null;
    var rows = arr(S.oldRows);
    var i;
    for (i = 0; i < rows.length; i++) { if (rows[i].no === no) row = rows[i]; }
    if (!row) { var nf = fail('OLD_NOT_FOUND'); showFailure(nf); return Promise.resolve(nf); }
    return callCore('oldPartNextStates', [row.state]).then(function (r) {
      var list = r.ok ? arr(r.states || r.rows) : (OLD_NEXT_DEFAULT[row.state] || []);
      if (!list.length) list = OLD_NEXT_DEFAULT[row.state] || [];
      list = list.filter(function (x) { return x !== 'SCRAPPED' && OLD_LABEL[x]; });
      if (!list.length) { var inv = fail('OLD_TRANSITION_INVALID'); showFailure(inv); return inv; }
      openDialog('old-move', { no: no, from: row.state, to: list[0], targets: list, claimRef: asText(row.claimRef), note: '' });
      return { ok: true };
    });
  }
  function oldMoveSave() {
    var d = S.dialog;
    if (!d || d.kind !== 'old-move') return Promise.resolve(fail('SVS_BAD_REPLY'));
    dialogCapture();
    var g = writeGate('oldPartMove');
    if (g) { showFailure(g); return Promise.resolve(g); }
    var D = d.data;
    var note = trim(D.note);
    if ((D.to === 'SCRAP_PENDING' || D.to === 'HELD_FOR_CLAIM') && note.length < 5) { setDialogErrors({ note: ERR.OLD_NOTE_REQUIRED }); return Promise.resolve(fail('OLD_NOTE_REQUIRED')); }
    return exclusive(function () {
      return callWrite('moveOldPart', [D.no, { to: D.to, note: note, claimRef: trim(D.claimRef) }, makeCtx(readSession(), null, d.clientRef)]).then(function (r) {
        if (!r.ok) { showFailure(r); return r; }
        closeDialog();
        toast(t('old_moved'));
        renderShellAndTab();
        return r;
      });
    });
  }

  /* --- monthly scrap sign-off (Owner, PIN) --- */
  function scrapMonthOf(row) {
    var m = firstOf(row, ['scrapMonth', 'month']);
    return m ? asText(m) : monthOf(istDay(firstOf(row, ['decidedAt', 'registeredAt', 'date'])));
  }
  function signoffRows(month) {
    var all = arr(S.oldRows);
    var out = [];
    var i;
    for (i = 0; i < all.length; i++) { if (all[i].state === 'SCRAP_PENDING' && scrapMonthOf(all[i]) === month) out.push(all[i]); }
    return out;
  }
  DIALOGS['old-signoff'] = function (d) {
    var D = d.data;
    var items = signoffRows(D.month);
    var months = [];
    var mm = svsPrevMonth(todayIso() + '');
    var mi;
    for (mi = 0; mi < 12; mi++) { months.push({ v: mm, l: mm }); mm = svsPrevMonth(mm + '-01'); }
    if (D.month && !months.some(function (x) { return x.v === D.month; })) months.unshift({ v: D.month, l: D.month });
    var body = '<div class="svs-form">' + fld({ name: 'month', kind: 'select', label: t('month'), options: months, value: D.month, err: d.errors.month, focus: true, hint: t('month_hint') });
    var i;
    if (!items.length) body += emptyHtml(t('signoff_empty'));
    for (i = 0; i < items.length; i++) {
      var on = D.sel[items[i].no] !== false;
      body += '<div class="svs-row" role="listitem"><div class="svs-field svs-field-check"><input type="checkbox" class="svs-check" id="svs-so-' + attr(i) + '" data-svs-field="so-pick" data-svs-key="' + attr(items[i].no) + '"' + (on ? ' checked' : '') + '>' +
        '<label for="svs-so-' + attr(i) + '"><b class="svs-code">' + esc(items[i].no) + '</b> ' + esc(items[i].partCode ? items[i].partCode + ' ' : '') + esc(items[i].partText) + ' ' + esc(t('qty')) + ' ' + esc(items[i].qty) + '</label></div></div>';
    }
    body += fld({ name: 'note', label: t('note'), value: D.note, max: 200 }) + '</div>';
    return { title: t('signoff_title'), body: body, footer: btn('svs-old-signoff-confirm', t('signoff_confirm'), { cls: 'svs-btn-primary', disabled: !items.length }) + ' ' + btn('svs-dialog-close', t('cancel')) };
  };
  function signoffOpen() {
    var R = rights();
    if (!R.scrapSignoff) { var f = fail(R.manager ? 'SVS_OWNER_ONLY' : 'SVS_ROLE_DENIED'); showFailure(f); return Promise.resolve(f); }
    var g = writeGate('scrapSignoff');
    if (g) { showFailure(g); return Promise.resolve(g); }
    openDialog('old-signoff', { month: svsPrevMonth(todayIso()), note: '', sel: {} });
    return Promise.resolve({ ok: true });
  }
  function signoffConfirm() {
    var d = S.dialog;
    if (!d || d.kind !== 'old-signoff') return Promise.resolve(fail('SVS_BAD_REPLY'));
    dialogCapture();
    var D = d.data;
    var g = writeGate('scrapSignoff');
    if (g) { showFailure(g); return Promise.resolve(g); }
    var month = trim(D.month);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) { setDialogErrors({ month: ERR.SVS_DATE_INVALID }); return Promise.resolve(fail('SVS_DATE_INVALID')); }
    if (month >= monthOf(todayIso())) { setDialogErrors({ month: ERR.SIGNOFF_MONTH_OPEN }); return Promise.resolve(fail('SIGNOFF_MONTH_OPEN')); }
    var items = signoffRows(month);
    var nos = [];
    var i;
    var boxes = qsa(S.layer, '[data-svs-field="so-pick"]');
    var sel = {};
    for (i = 0; i < boxes.length; i++) sel[getAttr(boxes[i], 'data-svs-key')] = fieldValue(boxes[i]) === true;
    for (i = 0; i < items.length; i++) { if (sel[items[i].no] !== false) nos.push(items[i].no); }
    if (!nos.length) { setDialogErrors({ month: ERR.SIGNOFF_EMPTY }); return Promise.resolve(fail('SIGNOFF_EMPTY')); }
    return exclusive(function () {
      return ownerStep(fill(t('pin_signoff'), { month: month, n: nos.length }), function (ctx) {
        return callWrite('signOffScrap', [{ month: month, oldNos: nos, note: trim(D.note) }, ctx]);
      }, d.clientRef).then(function (r) {
        if (!r.ok) { showFailure(r); return r; }
        closeDialog();
        toast(t('signoff_done'));
        renderShellAndTab();
        return r;
      });
    });
  }

  /* --- opening stock review --- */
  DIALOGS['open-confirm'] = function (d) {
    var D = d.data;
    var post = D.mode === 'post';
    var body = '<div class="svs-form"><div class="svs-sum">' + num(D.lines.length) + ' ' + esc(t('parts_word')) + ', ' + num(D.pieces) + ' ' + esc(t('pieces_word')) + ', ' + esc(t('value')) + ' <span class="svs-num">' + esc(money(D.valuePaise)) + '</span>. ' +
      esc(post ? t('open_once') : t('open_send_info')) + '</div></div>';
    return {
      title: post ? t('open_post_title') : t('open_send_title'), body: body,
      footer: btn('svs-open-confirm', post ? t('open_post_btn') : t('open_send_btn'), { cls: 'svs-btn-primary', focus: true }) + ' ' + btn('svs-open-cancel', t('back'))
    };
  };

  /* ---------- the job panel: issue and return (inside #svs-job-host of the job form) ---------- */

  function curJobId() {
    var id = '';
    try { id = H && typeof H.currentJobId === 'function' ? H.currentJobId() : ''; } catch (e) { id = ''; }
    return asText(id);
  }
  function jobInfo(id) {
    var j = null;
    try { j = H && typeof H.job === 'function' ? H.job(id) : null; } catch (e) { j = null; }
    return j && typeof j === 'object' ? j : null;
  }
  function jobInvoiced(j) { return j.locked === true || (j.status === 'closed' && !!j.invoiceNo); }
  /* The first matching state of the panel table: past, invoiced, closed, staff, ledger check failed, else usable. */
  function jobPanelNote(j, R) {
    if (isPast()) return 'SVS_PAST_VIEW';
    if (jobInvoiced(j)) return 'SVS_JOB_INVOICED';
    if (j.status !== 'open') return 'SVS_JOB_CLOSED';
    var raw = rights();
    if (!raw.issue && !raw.returnPart && !raw.oldPartRegister) return 'staff';
    if (!integrityOk()) return 'SVS_INTEGRITY';
    return '';
  }
  function jobShellHtml(inner) {
    return '<div class="svs-job"><h3 class="svs-h3">' + esc(t('job_title')) + '</h3><div class="svs-dim">' + esc(t('job_sub')) + '</div>' + inner + '</div>';
  }
  function renderJobPanel() {
    var el = H && H.jobHost;
    if (!el) return;
    if (!coreObj()) { el.innerHTML = ''; return; }
    var sess = readSession();
    if (sess.ok !== true) { el.innerHTML = ''; return; }
    var id = curJobId();
    if (!id) { el.innerHTML = jobShellHtml(notice('info', ERR.SVS_JOB_NOT_SAVED)); return; }
    var j = jobInfo(id);
    if (!j) { el.innerHTML = jobShellHtml(notice('bad', ERR.SVS_JOB_UNKNOWN)); return; }
    var mine = (S.jobTok = (S.jobTok || 0) + 1);
    var ensure = S.status ? Promise.resolve(null) : callCore('status', []).then(function (st) { if (st.ok) S.status = st; return null; });
    ensure.then(function () {
      return callCore('jobParts', [id, makeCtx(sess, null, '')]);
    }).then(function (r) {
      if (mine !== S.jobTok || !H || !H.jobHost) return;
      var R = shownRights();
      var note = jobPanelNote(j, R);
      var inner = '';
      if (note === 'staff') inner += notice('info', t('job_staff_note'));
      else if (note) inner += notice(note === 'SVS_INTEGRITY' ? 'bad' : 'warn', ERR[note]);
      if (!r.ok) {
        el.innerHTML = jobShellHtml(inner + '<div class="svs-note svs-note-bad" role="alert">' + esc(errText(r)) + '</div>');
        return;
      }
      var rows = arr(r.rows);
      S.job.parts = rows;
      var list = '';
      var i;
      for (i = 0; i < rows.length; i++) {
        var x = rows[i];
        list += '<div class="svs-row" role="listitem" data-svs-key="' + attr(x.partCode) + '">' +
          '<div class="svs-c svs-c-code"><b class="svs-code">' + esc(x.partCode) + '</b></div><div class="svs-c">' + esc(x.name) + '</div>' +
          '<div class="svs-c svs-c-num"><span class="svs-lbl">' + esc(t('issued')) + '</span> ' + num(isInt(x.issued) ? x.issued : 0) + ' <span class="svs-lbl">' + esc(t('returned')) + '</span> ' + num(isInt(x.returned) ? x.returned : 0) + ' <span class="svs-lbl">' + esc(t('with_job')) + '</span> ' + num(isInt(x.net) ? x.net : 0) + '</div>';
        if (R.viewCost && x.valuePaise !== null && x.valuePaise !== undefined) list += '<div class="svs-c svs-c-num"><span class="svs-lbl">' + esc(t('fifo_cost')) + '</span> ' + esc(money(x.valuePaise)) + '</div>';
        list += '<div class="svs-c svs-dim">' + esc(fmtAt(x.lastAt)) + '</div>';
        if (!note && R.returnPart && isInt(x.net) && x.net > 0) list += '<div class="svs-c svs-c-act">' + btn('svs-job-return-open', t('return'), { key: x.partCode, cls: 'svs-btn-quiet' }) + '</div>';
        list += '</div>';
      }
      if (!rows.length) list = emptyHtml(t('job_empty'));
      var foot = '<div class="svs-sum">' + num(isInt(r.totalNet) ? r.totalNet : 0) + ' ' + esc(t('job_pieces')) + (R.viewCost && isInt(r.totalValuePaise) ? ', ' + esc(t('fifo_cost')) + ' <span class="svs-num">' + esc(money(r.totalValuePaise)) + '</span>' : '') + '</div>';
      var btns = '<div class="svs-bar-btns">';
      if (!note && R.issue) btns += btn('svs-job-issue-open', t('job_issue'), { cls: 'svs-btn-primary' });
      if ((!note || note === 'SVS_JOB_CLOSED' || note === 'SVS_JOB_INVOICED') && R.oldPartRegister && !isPast()) btns += btn('svs-job-register-old', t('job_register_old'), { cls: 'svs-btn-quiet' });
      btns += '</div><div class="svs-hint">' + esc(t('job_old_hint')) + '</div>';
      var form = '';
      if (!note && S.job.mode === 'issue') form = scoped('job-', function () { return jobIssueFormHtml(R); });
      if (!note && S.job.mode === 'return') form = scoped('job-', jobReturnFormHtml);
      el.innerHTML = jobShellHtml(inner + '<div class="svs-list" role="list">' + list + '</div>' + foot + btns + form);
    });
  }
  function jobIssueFormHtml(R) {
    var F = S.job.form;
    var info = F.partCode ? '<div class="svs-picked"><b class="svs-code">' + esc(F.partCode) + '</b> ' + esc(F.partName) + '<div class="svs-dim">' + esc(t('on_hand')) + ' ' + num(isInt(F.onHand) ? F.onHand : 0) +
      (R.viewCost && isInt(F.sellPricePaise) ? '. ' + esc(t('sell_price')) + ' <span class="svs-num">' + esc(money(F.sellPricePaise)) + '</span>' : '') + '. ' + esc(t('job_add_estimate')) + '</div></div>' : '';
    var override = '';
    if (S.job.override) {
      override = '<div class="svs-note svs-note-warn">' + esc(R.override ? t('override_info') : t('override_owner_only')) + '</div>' +
        (R.override ? fld({ name: 'overrideCost', label: t('override_cost'), value: F.overrideCost, mode: 'decimal', max: 12, hint: t('override_cost_hint') }) +
          btn('svs-job-issue-override', t('override_btn'), { cls: 'svs-btn-danger' }) : '');
    }
    return '<div id="svs-job-form" class="svs-form svs-job-form">' +
      '<div class="svs-alert" role="alert">' + esc(S.job.error) + '</div>' +
      fld({ name: 'partSearch', label: t('part'), value: F.partSearch, caps: true, req: true, ph: t('search_ph'), focus: true }) +
      '<div data-svs-results="job"></div>' + info +
      '<div class="svs-bar">' + fld({ name: 'qty', label: t('qty'), value: F.qty, mode: 'numeric', max: 6, req: true, enter: 'svs-job-issue-save' }) +
      fld({ name: 'billing', kind: 'select', label: t('billing'), options: [{ v: 'CHARGEABLE', l: t('bill_chargeable') }, { v: 'WARRANTY', l: t('bill_warranty') }], value: F.billing }) + '</div>' +
      fld({ name: 'note', label: t('note'), value: F.note, max: 80, enter: 'svs-job-issue-save' }) + override +
      '<div class="svs-bar-btns">' + btn('svs-job-issue-save', t('job_issue_save'), { cls: 'svs-btn-primary' }) + btn('svs-job-issue-cancel', t('cancel')) + '</div></div>';
  }
  function outstandingIssues(code) {
    var rows = arr(S.job.parts);
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].partCode === code) {
        return arr(rows[i].issues).filter(function (x) { return isInt(x.outstanding) && x.outstanding > 0; });
      }
    }
    return [];
  }
  function jobReturnFormHtml() {
    var F = S.job.form;
    var issues = outstandingIssues(F.partCode);
    var opts = [];
    var i;
    for (i = 0; i < issues.length; i++) opts.push({ v: issues[i].movementId, l: asText(issues[i].docNo) + ' / ' + asText(issues[i].lineNo) + ' (' + issues[i].outstanding + ')' });
    return '<div id="svs-job-form" class="svs-form svs-job-form">' +
      '<div class="svs-alert" role="alert">' + esc(S.job.error) + '</div>' +
      '<div class="svs-picked"><b class="svs-code">' + esc(F.partCode) + '</b> ' + esc(F.partName) + '</div>' +
      (opts.length > 1 ? fld({ name: 'issueMovementId', kind: 'select', label: t('return_from_issue'), options: opts, value: F.issueMovementId }) : '') +
      '<div class="svs-bar">' + fld({ name: 'qty', label: t('qty'), value: F.qty, mode: 'numeric', max: 6, req: true, focus: true, enter: 'svs-job-return-save' }) +
      fld({ name: 'returnReason', kind: 'select', label: t('return_reason'), options: tOptions(RETURN_REASONS), value: F.returnReason }) + '</div>' +
      fld({ name: 'note', label: t('note'), value: F.note, max: 80, enter: 'svs-job-return-save' }) +
      '<div class="svs-bar-btns">' + btn('svs-job-return-save', t('job_return_save'), { cls: 'svs-btn-primary' }) + btn('svs-job-return-cancel', t('cancel')) + '</div></div>';
  }
  function jobCapture() {
    var f = H && H.jobHost ? byIdIn(H.jobHost, 'svs-job-form') : null;
    if (f) captureFields(f, S.job.form);
  }
  /* The checks every job write repeats at click time. Returns a failure or null. */
  function jobGate(rightKey) {
    var g = writeGate(rightKey);
    if (g) return g;
    var id = curJobId();
    if (!id) return fail('SVS_JOB_NOT_SAVED');
    var j = jobInfo(id);
    if (!j) return fail('SVS_JOB_UNKNOWN');
    if (jobInvoiced(j)) return fail('SVS_JOB_INVOICED');
    if (j.status !== 'open') return fail('SVS_JOB_CLOSED');
    if (!integrityOk()) return fail('SVS_INTEGRITY');
    return null;
  }
  function jobFormClose() {
    S.job.mode = null;
    S.job.form = {};
    S.job.error = '';
    S.job.override = false;
    S.job.ref = '';
    renderJobPanel();
  }
  function jobIssueOpen() {
    var g = jobGate('issue');
    if (g) { showFailure(g); return g; }
    var j = jobInfo(curJobId());
    S.job.mode = 'issue';
    S.job.error = '';
    S.job.override = false;
    S.job.ref = newRef();
    S.job.form = { partCode: '', partName: '', partSearch: '', onHand: null, sellPricePaise: null, qty: '1', note: '', overrideCost: '', billing: j && j.paymentStatus === 'no_charge_warranty' ? 'WARRANTY' : 'CHARGEABLE' };
    renderJobPanel();
    return { ok: true };
  }
  function jobReturnOpen(code) {
    var g = jobGate('returnPart');
    if (g) { showFailure(g); return g; }
    var issues = outstandingIssues(code);
    if (!issues.length) { var f = fail('RETURN_EXCEEDS_ISSUE'); showFailure(f); return f; }
    var name = '';
    var rows = arr(S.job.parts);
    var i;
    for (i = 0; i < rows.length; i++) { if (rows[i].partCode === code) name = asText(rows[i].name); }
    S.job.mode = 'return';
    S.job.error = '';
    S.job.ref = newRef();
    S.job.form = { partCode: code, partName: name, issueMovementId: issues[0].movementId, qty: '1', returnReason: 'UNUSED', note: '' };
    renderJobPanel();
    return { ok: true };
  }
  function jobFail(r) {
    S.job.error = errText(r);
    if (r.code === 'INSUFFICIENT_STOCK' && S.job.mode === 'issue') S.job.override = true;
    renderJobPanel();
    toast(S.job.error);
  }
  function jobIssueSave(override) {
    jobCapture();
    var g = jobGate('issue');
    if (g) { jobFail(g); return Promise.resolve(g); }
    var F = S.job.form;
    var id = curJobId();
    if (!F.partCode) { var f1 = fail('SVS_PART_REQUIRED'); jobFail(f1); return Promise.resolve(f1); }
    var q = parseQty(F.qty);
    if (!q.ok) { jobFail(q); return Promise.resolve(q); }
    var note = trim(F.note);
    if (override && note.length < 3) { var f2 = fail('OVERRIDE_NOTE_REQUIRED'); jobFail(f2); return Promise.resolve(f2); }
    var payload = { jobId: id, billing: F.billing === 'WARRANTY' ? 'WARRANTY' : 'CHARGEABLE', lines: [{ partCode: F.partCode, qty: q.qty, allowNegative: override === true }], note: note };
    /* A part that was never received has no cost to price the stock owed: the Owner types one (the docs layer ignores it otherwise). */
    if (override === true && trim(F.overrideCost) !== '') {
      var oc = parsePaise(F.overrideCost);
      if (!oc.ok || oc.paise <= 0) { var f3 = fail('COST_REQUIRED'); jobFail(f3); return Promise.resolve(f3); }
      payload.lines[0].unitCostPaise = oc.paise;
    }
    var label = fill(t('pin_override'), { qty: q.qty, code: F.partCode, job: id, n: isInt(F.onHand) ? F.onHand : 0 });
    var done = function (r) {
      if (!r.ok) { jobFail(r); return r; }
      toast(fill(t('job_issued'), { qty: q.qty, code: F.partCode, job: id }));
      jobFormClose();
      return r;
    };
    return exclusive(function () {
      if (override === true) return ownerStep(label, function (ctx) { return callWrite('issueToJob', [payload, ctx]); }, S.job.ref).then(done);
      return callWrite('issueToJob', [payload, makeCtx(readSession(), null, S.job.ref)]).then(done);
    });
  }
  function jobReturnSave() {
    jobCapture();
    var g = jobGate('returnPart');
    if (g) { jobFail(g); return Promise.resolve(g); }
    var F = S.job.form;
    var id = curJobId();
    var issues = outstandingIssues(F.partCode);
    var chosen = null;
    var i;
    for (i = 0; i < issues.length; i++) { if (String(issues[i].movementId) === String(F.issueMovementId)) chosen = issues[i]; }
    if (!chosen) chosen = issues[0];
    if (!chosen) { var f1 = fail('RETURN_EXCEEDS_ISSUE'); jobFail(f1); return Promise.resolve(f1); }
    var q = parseQty(F.qty, { min: 1, max: chosen.outstanding });
    if (!q.ok) { jobFail(q); return Promise.resolve(q); }
    var reasonOk = false;
    for (i = 0; i < RETURN_REASONS.length; i++) { if (RETURN_REASONS[i].v === F.returnReason) reasonOk = true; }
    if (!reasonOk) { var f2 = fail('RETURN_REASON_INVALID'); jobFail(f2); return Promise.resolve(f2); }
    var payload = { jobId: id, lines: [{ issueMovementId: chosen.movementId, qty: q.qty, returnReason: F.returnReason }], note: trim(F.note) };
    return exclusive(function () {
      return callWrite('returnFromJob', [payload, makeCtx(readSession(), null, S.job.ref)]).then(function (r) {
        if (!r.ok) { jobFail(r); return r; }
        toast(fill(t('job_returned'), { qty: q.qty, code: F.partCode, job: id }));
        jobFormClose();
        return r;
      });
    });
  }
  function jobRegisterOld() {
    var g = writeGate('oldPartRegister');
    if (g) { showFailure(g); return g; }
    openDialog('old', blankOld(curJobId()));
    return { ok: true };
  }

  /* ---------- printing (through the report engine; the module computes the rows) ---------- */

  function printReport(type, args) {
    var rep = null;
    try { rep = H && typeof H.report === 'function' ? H.report() : null; } catch (e) { rep = null; }
    if (!rep || typeof rep.preview !== 'function') { var f = fail('SVS_PRINT_UNAVAILABLE'); showFailure(f); return Promise.resolve(f); }
    var s = readSession();
    if (s.ok !== true) { var d = fail('SVS_ROLE_DENIED'); showFailure(d); return Promise.resolve(d); }
    return callCore('reportData', [type, args, makeCtx(s, null, '')]).then(function (r) {
      if (!r.ok) { showFailure(r); return r; }
      var data = r.svcData !== undefined ? r.svcData : (r.data !== undefined ? r.data : r);
      var opts = { svcData: data };
      var k;
      for (k in args) { if (Object.prototype.hasOwnProperty.call(args, k)) opts[k] = args[k]; }
      try { rep.preview(type, opts); } catch (e2) { var x = thrown(e2); showFailure(x); return x; }
      return { ok: true };
    });
  }

  /* ---------- part picking (shared) ---------- */

  function resultKeyOf(kind, idx) {
    if (kind === 'cs') return 'cs';
    if (kind === 'job') return 'job';
    return idx === '' || idx === undefined || idx === null ? 'D' : 'L' + idx;
  }
  function doPartSearch(resultKey, text, action, line, container, showPrice) {
    var seqKey = 'pk_' + resultKey;
    S[seqKey] = (S[seqKey] || 0) + 1;
    var mine = S[seqKey];
    searchParts(text, function (rows) {
      if (mine !== S[seqKey]) return;
      S.pickRows[resultKey] = rows;
      var el = qs(container, '[data-svs-results="' + resultKey + '"]');
      if (el) el.innerHTML = trim(text) ? partResultsHtml(rows, action, line, showPrice) : '';
    });
  }
  function findPicked(resultKey, code) {
    var rows = arr(S.pickRows[resultKey]);
    var i;
    for (i = 0; i < rows.length; i++) { if (rows[i].code === code) return rows[i]; }
    return null;
  }
  function splitKey(key) {
    var s = asText(key);
    var bar = s.indexOf('|');
    return bar < 0 ? { idx: '', code: s } : { idx: s.slice(0, bar), code: s.slice(bar + 1) };
  }
  function applyPartToLine(L, row, withCost) {
    L.partCode = row.code;
    L.partName = asText(row.name);
    L.partSearch = row.code;
    L.hsn = asText(row.hsn);
    L.gstRateBp = isInt(row.gstRateBp) ? row.gstRateBp : null;
    if (withCost && !trim(L.cost) && rights().viewCost && isInt(row.lastCostPaise)) L.cost = paiseText(row.lastCostPaise);
  }
  function pickInDialog(kind, key) {
    var d = S.dialog;
    if (!d || d.kind !== kind) return fail('SVS_BAD_REPLY');
    var k = splitKey(key);
    var row = findPicked(resultKeyOf('dlg', kind === 'old' ? '' : k.idx), k.code);
    if (!row) return fail('PART_UNKNOWN');
    dialogCapture();
    if (kind === 'old') {
      applyPartToLine(d.data, row, false);
      if (!trim(d.data.partText)) d.data.partText = asText(row.name);
    } else {
      var L = d.data.lines[parseInt(k.idx, 10)];
      if (!L) return fail('SVS_BAD_REPLY');
      applyPartToLine(L, row, kind === 'grn');
    }
    d.dirty = true;
    renderDialog(false);
    var next = kind === 'grn' ? qs(S.layer, '#svs-f-d-qtyReceived-' + k.idx) : (kind === 'adj' ? qs(S.layer, '#svs-f-d-qty-' + k.idx) : null);
    focusEl(next);
    return { ok: true };
  }
  function pickCs(key) {
    var k = splitKey(key);
    var row = findPicked('cs', k.code);
    if (!row) return fail('PART_UNKNOWN');
    captureCs();
    var c = S.cs;
    c.partCode = row.code;
    c.partName = asText(row.name);
    c.partSearch = row.code;
    c.masterPricePaise = isInt(row.sellPricePaise) ? row.sellPricePaise : null;
    if (!trim(c.price) && isInt(row.sellPricePaise)) c.price = paiseText(row.sellPricePaise);
    S.csError = row.flags && row.flags.counterSaleable === false ? ERR.NOT_COUNTER_SALEABLE : '';
    paintCsForm();
    focusEl(qs(H.root, '#svs-f-cs-qty'));
    return { ok: true };
  }
  function pickJob(key) {
    var k = splitKey(key);
    var row = findPicked('job', k.code);
    if (!row) return fail('PART_UNKNOWN');
    jobCapture();
    var F = S.job.form;
    F.partCode = row.code;
    F.partName = asText(row.name);
    F.partSearch = row.code;
    F.onHand = isInt(row.onHand) ? row.onHand : 0;
    F.sellPricePaise = isInt(row.sellPricePaise) ? row.sellPricePaise : null;
    S.job.override = false;
    S.job.error = '';
    renderJobPanel();
    return { ok: true };
  }

  /* ---------- counter sale ---------- */

  function captureCs() {
    var f = H && H.root ? byIdIn(H.root, 'svs-cs-form') : null;
    if (f) captureFields(f, S.cs);
  }
  function csFail(r) {
    S.csError = errText(r);
    paintCsForm();
    toast(S.csError);
    return r;
  }
  function csSave() {
    captureCs();
    var g = writeGate('counterSale');
    if (g) { showFailure(g); return Promise.resolve(g); }
    var c = S.cs;
    if (!c.partCode) return Promise.resolve(csFail(fail('SVS_PART_REQUIRED')));
    var q = parseQty(c.qty);
    if (!q.ok) return Promise.resolve(csFail(q));
    var p = parsePaise(c.price, { allowZero: true });
    if (!p.ok) return Promise.resolve(csFail(p));
    var note = trim(c.note);
    if (isInt(c.masterPricePaise) && p.paise !== c.masterPricePaise && note.length < 5) return Promise.resolve(csFail(fail('SVS_NOTE_SHORT')));
    var payload = { lines: [{ partCode: c.partCode, qty: q.qty, unitPricePaise: p.paise }], payMode: c.payMode, ccptInvoiceNo: trim(c.ccpt), amountPaise: q.qty * p.paise, note: note };
    if (!S.csRef) S.csRef = newRef();
    return exclusive(function () {
      return callWrite('counterSale', [payload, makeCtx(readSession(), null, S.csRef)]).then(function (r) {
        if (!r.ok) return csFail(r);
        toast(fill(t('cs_saved'), { qty: q.qty, code: c.partCode }));
        csReceiptHook(r);
        S.cs = blankCs();
        S.csError = '';
        S.csRef = '';
        renderShellAndTab();
        return r;
      });
    });
  }
  /* Billing (wave 2) opens the counter receipt dialog for the sale just made; without it nothing happens. */
  function csReceiptHook(r) {
    try {
      var w = H && H.root && H.root.ownerDocument ? H.root.ownerDocument.defaultView : null;
      var ui = w ? w.SaagarServiceBillingUI : null;
      var no = r && r.doc && r.doc.no ? String(r.doc.no) : '';
      if (ui && typeof ui.afterCounterSale === 'function' && no) ui.afterCounterSale(no, r.doc);
    } catch (e) { toast(fill(ERR.SVS_INTERNAL, { code: 'SVS_INTERNAL' })); }
  }
  function csClear() {
    S.cs = blankCs();
    S.csError = '';
    S.csRef = '';
    paintCsForm();
    return { ok: true };
  }

  /* ---------- the action table ---------- */

  function stepPage(bucket, delta, after) {
    bucket.page = Math.max(1, (bucket.page || 1) + delta);
    after();
    return { ok: true };
  }
  function openStoresView() {
    if (!H) return fail('SVS_CORE_MISSING');
    if (typeof H.showStores === 'function') { H.showStores(); return { ok: true }; }
    var w = null;
    try { w = H.root && H.root.ownerDocument ? H.root.ownerDocument.defaultView : null; } catch (e) { w = null; }
    if (w && typeof w.showView === 'function') { w.showView('stores'); return { ok: true }; }
    show();
    return { ok: true };
  }
  function retryOpen() {
    return callCore('reopen', []).then(function () { renderStores(); return { ok: true }; });
  }
  function fillDates() {
    var d = S.dialog;
    if (!d || d.kind !== 'ledger') return fail('SVS_BAD_REPLY');
    dialogCapture();
    var D = d.data;
    if (!validIso(D.from) || !validIso(D.to) || D.from > D.to) { setDialogErrors({ from: ERR.SVS_DATE_INVALID }); return fail('SVS_DATE_INVALID'); }
    d.errors = {};
    D.page = 1;
    D.result = null;
    renderDialog(false);
    return loadLedger();
  }
  function ledgerPage(delta) {
    var d = S.dialog;
    if (!d || d.kind !== 'ledger') return fail('SVS_BAD_REPLY');
    d.data.page = Math.max(1, d.data.page + delta);
    d.data.result = null;
    renderDialog(false);
    return loadLedger();
  }
  function grnOpen() {
    var g = writeGate('receive');
    if (g) { showFailure(g); return g; }
    openDialog('grn', { supplierName: 'Titan', supplierInvoiceNo: '', supplierInvoiceDate: '', note: '', lines: [blankGrnLine()] });
    return { ok: true };
  }
  function lineAdd(kind) {
    var d = S.dialog;
    if (!d || d.kind !== kind) return fail('SVS_BAD_REPLY');
    dialogCapture();
    if (d.data.lines.length >= MAX_LINES) { dialogMessage(ERR.TOO_MANY_LINES); return fail('TOO_MANY_LINES'); }
    d.data.lines.push(kind === 'grn' ? blankGrnLine() : blankAdjLine());
    d.dirty = true;
    renderDialog(false);
    focusEl(qs(S.layer, '#svs-f-d-partSearch-' + (d.data.lines.length - 1)));
    return { ok: true };
  }
  function lineRemove(kind, key) {
    var d = S.dialog;
    if (!d || d.kind !== kind) return fail('SVS_BAD_REPLY');
    dialogCapture();
    var i = parseInt(key, 10);
    if (d.data.lines.length > 1 && i >= 0 && i < d.data.lines.length) d.data.lines.splice(i, 1);
    d.errors = {};
    renderDialog(false);
    return { ok: true };
  }
  function grnViewOpen(no) {
    var d = openDialog('grn-view', { no: no, result: null });
    var s = readSession();
    return callCore('getDoc', [no, makeCtx(s, null, '')]).then(function (r) {
      if (S.dialog !== d) return r;
      d.data.result = r;
      renderDialog(false);
      return r;
    });
  }
  function adjOpen() {
    var g = writeGate('proposeAdj');
    if (g) { showFailure(g); return g; }
    openDialog('adj', { lines: [blankAdjLine()], note: '', savedId: '' });
    return { ok: true };
  }
  function rejectOpen(target, id) {
    var g = writeGate('rejectProposal');
    if (g) { showFailure(g); return g; }
    openDialog('reject', { target: target, id: id, reason: '' });
    return { ok: true };
  }
  function oldOpenNew() {
    var g = writeGate('oldPartRegister');
    if (g) { showFailure(g); return g; }
    openDialog('old', blankOld(''));
    return { ok: true };
  }
  function printFor(kind) {
    var today = todayIso();
    var R = rights();
    if (kind === 'stock') return printReport('svcStockList', { group: S.f.stock.group, includeZero: true });
    if (kind === 'reorder') return printReport('svcReorderList', { group: '' });
    if (kind === 'adj') return printReport('svcAdjustmentRegister', { month: monthOf(today), from: monthOf(today) + '-01', to: today });
    if (kind === 'old') return printReport('svcDefectiveRegister', { month: monthOf(today), from: monthOf(today) + '-01', to: today });
    return Promise.resolve(R.viewCost ? { ok: true } : fail('SVS_ROLE_DENIED'));
  }
  function cancelOrClose() { requestClose(); return { ok: true }; }

  var ACT = {
    'svs-open-stores': function () { return openStoresView(); },
    'svs-tab-stock': function () { svsSwitchTab('stock'); },
    'svs-tab-receive': function () { svsSwitchTab('receive'); },
    'svs-tab-counter': function () { svsSwitchTab('counter'); },
    'svs-tab-adjust': function () { svsSwitchTab('adjust'); },
    'svs-tab-oldparts': function () { svsSwitchTab('oldparts'); },
    'svs-tab-reorder': function () { svsSwitchTab('reorder'); },
    'svs-tab-masters': function () { svsSwitchTab('masters'); },
    'svs-tab-opening': function () { svsSwitchTab('opening'); },
    'svs-tab-settings': function () { svsSwitchTab('settings'); },
    'svs-blocked-retry': function () { return retryOpen(); },
    'svs-wm-ack': function () { return acknowledgeRestore(); },
    'svs-settings-save': function () { return svsSaveSettings(); },

    'svs-stock-add-part': function () { gotoMasters('part'); },
    'svs-stock-edit-part': function (k) { gotoMasters('part', k); },
    'svs-stock-print': function () { return printFor('stock'); },
    'svs-stock-search-clear': function () { S.f.stock = { text: '', group: '', view: 'all', page: 1 }; renderShellAndTab(); },
    'svs-stock-page-prev': function () { return stepPage(S.f.stock, -1, refreshStockList); },
    'svs-stock-page-next': function () { return stepPage(S.f.stock, 1, refreshStockList); },
    'svs-stock-ledger': function (k) { return openLedger(k); },
    'svs-ledger-apply': function () { return fillDates(); },
    'svs-ledger-print': function () {
      var d = S.dialog;
      if (!d || d.kind !== 'ledger') return fail('SVS_BAD_REPLY');
      if (!rights().viewLedger) { var f = fail('SVS_ROLE_DENIED'); showFailure(f); return f; }
      return printReport('svcPartLedger', { partCode: d.data.code, from: d.data.from, to: d.data.to });
    },
    'svs-ledger-close': function () { closeDialog(); },
    'svs-ledger-page-prev': function () { return ledgerPage(-1); },
    'svs-ledger-page-next': function () { return ledgerPage(1); },

    'svs-grn-new': function () { return grnOpen(); },
    'svs-grn-line-add': function () { return lineAdd('grn'); },
    'svs-grn-line-remove': function (k) { return lineRemove('grn', k); },
    'svs-grn-pick-part': function (k) { return pickInDialog('grn', k); },
    'svs-grn-save': function () { return grnSave(); },
    'svs-grn-cancel': function () { return cancelOrClose(); },
    'svs-grn-view': function (k) { return grnViewOpen(k); },
    'svs-grn-view-close': function () { closeDialog(); },
    'svs-grn-print': function (k) {
      if (!rights().viewCost) { var f = fail('SVS_ROLE_DENIED'); showFailure(f); return f; }
      return printReport('svcGoodsReceipt', { grnNo: asText(k) });
    },
    'svs-grn-reverse': function (k) {
      var R = rights();
      if (!R.reverseDoc) { var f = fail(R.manager ? 'SVS_OWNER_ONLY' : 'SVS_ROLE_DENIED'); showFailure(f); return f; }
      var g = writeGate('reverseDoc');
      if (g) { showFailure(g); return g; }
      return reverseOpen('grn', k);
    },
    'svs-grn-reverse-confirm': function () { return reverseConfirm('grn'); },
    'svs-grn-page-prev': function () { return stepPage(S.f.grn, -1, renderShellAndTab); },
    'svs-grn-page-next': function () { return stepPage(S.f.grn, 1, renderShellAndTab); },

    'svs-cs-pick-part': function (k) { return pickCs(k); },
    'svs-cs-save': function () { return csSave(); },
    'svs-cs-clear': function () { return csClear(); },
    'svs-cs-reverse': function (k) {
      var g = writeGate('reverseCounter');
      if (g) { showFailure(g); return g; }
      return reverseOpen('cs', k);
    },
    'svs-cs-reverse-confirm': function () { return reverseConfirm('cs'); },

    'svs-adj-new': function () { return adjOpen(); },
    'svs-adj-line-add': function () { return lineAdd('adj'); },
    'svs-adj-line-remove': function (k) { return lineRemove('adj', k); },
    'svs-adj-pick-part': function (k) { return pickInDialog('adj', k); },
    'svs-adj-save': function () { return adjSave(); },
    'svs-adj-cancel': function () { return cancelOrClose(); },
    'svs-adj-approve': function (k) { return adjApprove(k); },
    'svs-adj-reject': function (k) { return rejectOpen('adj', k); },
    'svs-adj-reject-confirm': function () { return rejectConfirm('adj'); },
    'svs-adj-withdraw': function (k) { return adjWithdraw(k); },
    'svs-adj-reverse': function (k) {
      var R = rights();
      if (!R.reverseDoc) { var f = fail(R.manager ? 'SVS_OWNER_ONLY' : 'SVS_ROLE_DENIED'); showFailure(f); return f; }
      var g = writeGate('reverseDoc');
      if (g) { showFailure(g); return g; }
      return reverseOpen('adj', k);
    },
    'svs-adj-reverse-confirm': function () { return reverseConfirm('adj'); },
    'svs-adj-print': function () { return printFor('adj'); },

    'svs-old-new': function () { return oldOpenNew(); },
    'svs-old-pick-part': function (k) { return pickInDialog('old', k); },
    'svs-old-save': function () { return oldSave(); },
    'svs-old-cancel': function () { return cancelOrClose(); },
    'svs-old-move': function (k) { return oldMoveOpen(k); },
    'svs-old-move-save': function () { return oldMoveSave(); },
    'svs-old-signoff': function () { return signoffOpen(); },
    'svs-old-signoff-confirm': function () { return signoffConfirm(); },
    'svs-old-print': function () { return printFor('old'); },
    'svs-reorder-print': function () { return printFor('reorder'); },

    'svs-open-propose': function () { return openingReview('propose'); },
    'svs-open-post': function () { return openingReview('post'); },
    'svs-open-confirm': function () { return openingConfirm(); },
    'svs-open-cancel': function () { closeDialog(); },
    'svs-open-approve': function (k) {
      var R = rights();
      if (!R.openingPost) { var f = fail(R.manager ? 'SVS_OWNER_ONLY' : 'SVS_ROLE_DENIED'); showFailure(f); return f; }
      return openingApprove(k);
    },
    'svs-open-reject': function (k) { return rejectOpen('open', k); },
    'svs-open-reject-confirm': function () { return rejectConfirm('open'); },
    'svs-open-withdraw': function (k) { return openingWithdraw(k); },
    'svs-open-page-prev': function () { return stepPage(S.f.open, -1, function () { paintOpeningRows(shownRights()); }); },
    'svs-open-page-next': function () { return stepPage(S.f.open, 1, function () { paintOpeningRows(shownRights()); }); },

    'svs-job-issue-open': function () { return jobIssueOpen(); },
    'svs-job-pick-part': function (k) { return pickJob(k); },
    'svs-job-issue-save': function () { return jobIssueSave(false); },
    'svs-job-issue-cancel': function () { jobFormClose(); },
    'svs-job-issue-override': function () {
      var R = rights();
      if (!R.override) { var f = fail('SVS_OWNER_ONLY'); jobFail(f); return f; }
      return jobIssueSave(true);
    },
    'svs-job-return-open': function (k) { return jobReturnOpen(k); },
    'svs-job-return-save': function () { return jobReturnSave(); },
    'svs-job-return-cancel': function () { jobFormClose(); },
    'svs-job-register-old': function () { return jobRegisterOld(); },

    'svs-dialog-discard': function () { closeDialog(); },
    'svs-dialog-keep': function () { if (S.dialog) { S.dialog.discard = false; renderDialog(true); } },
    'svs-dialog-close': function () { requestClose(); }
  };

  function dispatch(action, key, el) {
    var fn = Object.prototype.hasOwnProperty.call(ACT, action) ? ACT[action] : null;
    if (!fn) return Promise.resolve(fail('SVS_BAD_REPLY', { code: 'unknown action' }));
    var out;
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

  /* ---------- events (delegated; attached to the UI's own containers) ---------- */

  function actionTarget(start, container) {
    var n = start;
    var guard = 0;
    while (n && guard < 40) {
      if (getAttr(n, 'data-svcs-action')) return n;
      if (n === container) return null;
      n = n.parentNode;
      guard++;
    }
    return null;
  }
  function isChoiceInput(el) {
    var tag = el && typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
    return tag === 'SELECT' || (tag === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio'));
  }
  function onClick(ev, where, container) {
    var target = ev && ev.target;
    if (!target) return;
    var hit = actionTarget(target, container);
    if (hit) {
      if (hit.disabled === true) return;
      var act = getAttr(hit, 'data-svcs-action');
      /* Controls this file does not own (the masters screen's svcm- ids) keep their default: a tick box must still tick. */
      if (!Object.prototype.hasOwnProperty.call(ACT, act)) return;
      if (!isChoiceInput(hit) && typeof ev.preventDefault === 'function') ev.preventDefault();
      dispatch(act, getAttr(hit, 'data-svs-key'), hit);
      return;
    }
    if (where === 'layer' && getAttr(target, 'data-svs-overlay') !== null && S.dialog && !S.dialog.dirty) closeDialog();
  }
  function formIdOf(el, container) {
    var n = el;
    var guard = 0;
    while (n && n !== container && guard < 14) {
      var id = n.id;
      if (id === 'svs-cs-form' || id === 'svs-settings-form' || id === 'svs-job-form') return id;
      n = n.parentNode;
      guard++;
    }
    return '';
  }
  function dialogInput(el, name, ev) {
    var d = S.dialog;
    if (!d) return;
    d.dirty = true;
    var li = getAttr(el, 'data-svs-line');
    var idx = li === null || li === '' ? undefined : parseInt(li, 10);
    var val = fieldValue(el);
    if (name === 'partSearch') {
      var holder = idx === undefined ? d.data : (d.data.lines && d.data.lines[idx]);
      if (!holder) return;
      holder.partSearch = val;
      holder.partCode = '';
      holder.partName = '';
      var action = d.kind === 'grn' ? 'svs-grn-pick-part' : (d.kind === 'adj' ? 'svs-adj-pick-part' : 'svs-old-pick-part');
      doPartSearch(resultKeyOf('dlg', idx === undefined ? '' : idx), val, action, idx === undefined ? '' : idx, S.layer, false);
      return;
    }
    if (d.kind === 'grn' && (name === 'qtyReceived' || name === 'cost')) {
      if (d.data.lines[idx]) d.data.lines[idx][name] = val;
      setHtml(qs(S.layer, '#svs-grn-total'), grnTotalHtml(d.data));
      return;
    }
    if (d.kind === 'adj' && name === 'reason' && idx !== undefined) {
      dialogCapture();
      var def = adjReasonDef(d.data.lines[idx].reason);
      if (def && def.dir === 'up') d.data.lines[idx].direction = 'up';
      if (def && def.dir === 'down') d.data.lines[idx].direction = 'down';
      renderDialog(false);
      return;
    }
    if (d.kind === 'old-signoff' && (name === 'month' || name === 'so-pick') && ev && ev.type === 'change') {
      if (name === 'month') { dialogCapture(); renderDialog(false); }
      return;
    }
  }
  function rootInput(el, name, container) {
    var val = fieldValue(el);
    var form = formIdOf(el, container);
    if (name === 'f-stock-text') { S.f.stock.text = val; S.f.stock.page = 1; refreshStockList(); return; }
    if (name === 'f-stock-group') { S.f.stock.group = val; S.f.stock.page = 1; refreshStockList(); return; }
    if (name === 'f-stock-view') { S.f.stock.view = val; S.f.stock.page = 1; refreshStockList(); return; }
    if (name === 'f-adj-state') { S.f.adj.state = val; refreshAdjustList(shownRights()); return; }
    if (name === 'f-old-state') { S.f.old.state = val; refreshOldList(shownRights()); return; }
    if (name === 'f-open-text') { S.f.open.text = val; S.f.open.page = 1; paintOpeningRows(shownRights()); return; }
    if (name === 'o-qty' || name === 'o-cost') {
      var code = getAttr(el, 'data-svs-key');
      if (!code) return;
      if (!S.opening.rows[code]) S.opening.rows[code] = { qty: '', cost: '' };
      S.opening.rows[code][name === 'o-qty' ? 'qty' : 'cost'] = val;
      return;
    }
    if (name === 'wmReason') { S.wmReason = val; return; }
    if (form === 'svs-cs-form') {
      if (name === 'partSearch') {
        S.cs.partSearch = val;
        S.cs.partCode = '';
        S.cs.partName = '';
        doPartSearch('cs', val, 'svs-cs-pick-part', '', container, true);
      } else if (Object.prototype.hasOwnProperty.call(S.cs, name)) {
        S.cs[name] = val;
      }
    }
  }
  function jobInput(el, name) {
    var val = fieldValue(el);
    if (!Object.prototype.hasOwnProperty.call(S.job.form, name) && name !== 'partSearch' && name !== 'issueMovementId') return;
    S.job.form[name] = val;
    if (name === 'partSearch') {
      S.job.form.partCode = '';
      S.job.form.partName = '';
      doPartSearch('job', val, 'svs-job-pick-part', '', H.jobHost, rights().viewCost);
    }
  }
  function onInput(ev, where, container) {
    var el = ev && ev.target;
    if (!el) return;
    var name = getAttr(el, 'data-svs-field');
    if (!name) return;
    if (ev.type === 'change' && (el.type === 'text' || el.type === 'textarea')) return;
    if (where === 'layer') dialogInput(el, name, ev);
    else if (where === 'job') jobInput(el, name);
    else rootInput(el, name, container);
  }
  function pickByEnter(el, where) {
    var li = getAttr(el, 'data-svs-line');
    var idx = li === null || li === '' ? '' : li;
    var key = where === 'job' ? 'job' : (where === 'layer' ? resultKeyOf('dlg', idx) : 'cs');
    var rows = arr(S.pickRows[key]);
    if (!rows.length) return false;
    var want = trim(fieldValue(el)).toLowerCase();
    var row = rows[0];
    var i;
    for (i = 0; i < rows.length; i++) { if (asText(rows[i].code).toLowerCase() === want) row = rows[i]; }
    var k = idx + '|' + row.code;
    if (where === 'job') pickJob(k);
    else if (where === 'layer') pickInDialog(S.dialog ? S.dialog.kind : '', k);
    else pickCs(k);
    return true;
  }
  function focusTrap(ev) {
    var items = qsa(S.layer, '[data-svcs-action],[data-svs-field]').filter(function (x) { return x.disabled !== true; });
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    var cur = activeElement();
    if (ev.shiftKey && (cur === first || !cur)) { ev.preventDefault(); focusEl(last); } else if (!ev.shiftKey && cur === last) { ev.preventDefault(); focusEl(first); }
  }
  function onKeydown(ev, where, container) {
    var key = ev && ev.key;
    var el = ev && ev.target;
    if (!key || !el) return;
    if (key === 'Tab' && where === 'layer' && S.dialog) { focusTrap(ev); return; }
    if (key === 'Enter') {
      var fieldName = getAttr(el, 'data-svs-field');
      if (!fieldName || el.type === 'textarea') return;
      if (fieldName === 'partSearch') {
        if (pickByEnter(el, where)) { if (typeof ev.preventDefault === 'function') ev.preventDefault(); }
        return;
      }
      var go = getAttr(el, 'data-svs-enter');
      if (go) {
        if (typeof ev.preventDefault === 'function') ev.preventDefault();
        dispatch(go, '', el);
      }
      return;
    }
    if ((key === 'ArrowLeft' || key === 'ArrowRight') && getAttr(el, 'role') === 'tab') {
      var tabs = qsa(container, '[role="tab"]');
      var at = tabs.indexOf(el);
      if (at < 0) return;
      var nextTab = tabs[(at + (key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      if (nextTab) { focusEl(nextTab); dispatch(getAttr(nextTab, 'data-svcs-action'), '', nextTab); }
      return;
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      var box = el.parentNode && el.parentNode.parentNode ? el.parentNode.parentNode : container;
      var picks = qsa(box, '.svs-pick-row');
      if (!picks.length) return;
      var pos = picks.indexOf(el);
      var to = pos < 0 ? (key === 'ArrowDown' ? 0 : picks.length - 1) : pos + (key === 'ArrowDown' ? 1 : -1);
      if (picks[to]) { if (typeof ev.preventDefault === 'function') ev.preventDefault(); focusEl(picks[to]); }
    }
  }
  /* Escape keeps the user inside the module: it closes the open dialog or cancels the job form and goes no further. */
  function onEscape(ev) {
    if (!ev || (ev.key !== 'Escape' && ev.keyCode !== 27)) return;
    if (S.dialog) {
      stopEvent(ev);
      requestClose();
      return;
    }
    if (S.job.mode) {
      stopEvent(ev);
      jobFormClose();
      return;
    }
    /* The parts and labour screen's inline form or paste box: stay in the module and keep what was typed (Cancel closes it). */
    var mv = storesActive() && S.tab === 'masters' && S.masters && S.masters.state ? S.masters.state.view : '';
    if (mv === 'form' || mv === 'bulk') stopEvent(ev);
  }
  function stopEvent(ev) {
    if (typeof ev.preventDefault === 'function') ev.preventDefault();
    if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
  }
  function listen(el, type, fn, capture) {
    if (!el || typeof el.addEventListener !== 'function') return;
    el.addEventListener(type, fn, capture === true);
    S.binds.push({ el: el, type: type, fn: fn, capture: capture === true });
  }
  function bindContainer(el, where) {
    listen(el, 'click', function (ev) { onClick(ev, where, el); });
    listen(el, 'keydown', function (ev) { onKeydown(ev, where, el); });
    listen(el, 'input', function (ev) { onInput(ev, where, el); });
    listen(el, 'change', function (ev) { onInput(ev, where, el); });
  }

  /* ---------- mount and the public API ---------- */

  function createStoresButton() {
    var doc = H.root.ownerDocument;
    if (!doc || typeof doc.querySelector !== 'function') return false;
    var b = doc.querySelector('[data-svcs-action="svs-open-stores"]');
    if (!b) {
      var anchor = doc.querySelector('[data-action="new-service-order"]');
      if (!anchor || !anchor.parentNode) return false;
      b = doc.createElement('button');
      b.setAttribute('type', 'button');
      b.setAttribute('class', 'btn btn-ghost svs-open-btn');
      b.setAttribute('data-svcs-action', 'svs-open-stores');
      b.setAttribute('data-no-i18n', '');
      b.textContent = t('stores');
      anchor.parentNode.insertBefore(b, anchor);
    }
    listen(b, 'click', function (ev) {
      if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      dispatch('svs-open-stores', '', b);
    });
    return true;
  }
  function mount(host) {
    if (!host || !host.root) return false;
    if (H) unmount();
    H = host;
    bindContainer(host.root, 'root');
    if (host.jobHost) bindContainer(host.jobHost, 'job');
    var doc = host.root.ownerDocument;
    if (doc) listen(doc, 'keydown', onEscape, true);
    var w = doc ? doc.defaultView : null;
    var vv = w ? (w.visualViewport || w) : null;
    if (vv) listen(vv, 'resize', function () {
      setViewportVar(S.layer);
      var cur = activeElement();
      if (cur && typeof cur.scrollIntoView === 'function' && S.dialog) { try { cur.scrollIntoView({ block: 'center' }); } catch (e) { /* best effort */ } }
    });
    createStoresButton();
    return true;
  }
  function unmount() {
    var i;
    for (i = 0; i < S.binds.length; i++) {
      var b = S.binds[i];
      try { b.el.removeEventListener(b.type, b.fn, b.capture === true); } catch (e) { /* element already gone */ }
    }
    var layer = S.layer;
    if (layer && layer.parentNode && typeof layer.parentNode.removeChild === 'function') layer.parentNode.removeChild(layer);
    S = freshState();
    H = null;
  }
  function inActiveView(el) {
    if (!el) return false;
    if (typeof el.closest !== 'function') return true;
    var v = el.closest('.view');
    return !!(v && v.classList && v.classList.contains('active'));
  }
  function storesActive() { return !!(H && H.root && S.active && inActiveView(H.root)); }
  function show() {
    if (!H || !H.root) return;
    S.active = true;
    S.status = null;
    renderStores();
  }
  function refreshJob() { renderJobPanel(); }
  var DIALOG_RIGHT = { grn: 'receive', adj: 'proposeAdj', reject: 'rejectProposal', old: 'oldPartRegister', 'old-move': 'oldPartMove', 'old-signoff': 'scrapSignoff', ledger: 'viewLedger' };
  function dialogRight(d) {
    if (d.kind === 'reverse') return d.data.mode === 'cs' ? 'reverseCounter' : 'reverseDoc';
    if (d.kind === 'open-confirm') return d.data.mode === 'post' ? 'openingPost' : 'openingPropose';
    return DIALOG_RIGHT[d.kind] || '';
  }
  function onContextChange() {
    if (!H) return;
    if (S.dialog) {
      var need = dialogRight(S.dialog);
      if (need && !shownRights()[need]) {
        closeDialog();
        toast(ERR.SVS_ACCESS_CHANGED);
      }
    }
    if (storesActive()) renderStores();
    if (H.jobHost && inActiveView(H.jobHost)) renderJobPanel();
  }
  /* Delete guard: true when parts are still issued to the job. Fails closed: a core that cannot answer counts as "has parts". */
  function jobHasParts(jobId) {
    var c = coreObj();
    if (!c) return false;
    if (typeof c.jobHasParts !== 'function') return true;
    try {
      var r = c.jobHasParts(String(jobId));
      if (r && typeof r.then === 'function') return true;
      return !(r && r.ok === true && r.has === false);
    } catch (e) { return true; }
  }
  function clickEl(el) {
    var a = getAttr(el, 'data-svcs-action');
    if (!a) return Promise.resolve(fail('SVS_BAD_REPLY'));
    return dispatch(a, getAttr(el, 'data-svs-key'), el);
  }
  function phrases() {
    var seen = {};
    var out = [];
    var k;
    for (k in TEXT) { if (Object.prototype.hasOwnProperty.call(TEXT, k) && !seen[TEXT[k]]) { seen[TEXT[k]] = true; out.push(TEXT[k]); } }
    for (k in ERR) { if (Object.prototype.hasOwnProperty.call(ERR, k) && !seen[ERR[k]]) { seen[ERR[k]] = true; out.push(ERR[k]); } }
    return out.sort();
  }

  return Object.freeze({
    version: UI_VERSION,
    mount: mount,
    unmount: unmount,
    show: show,
    refreshJob: refreshJob,
    onContextChange: onContextChange,
    jobHasParts: jobHasParts,
    click: clickEl,
    phrases: phrases,
    internals: Object.freeze({
      esc: esc, attr: attr, money: money, parsePaise: parsePaise, parseQty: parseQty, rightsFor: rightsFor, errorText: errText,
      rankParts: rankParts, dispatch: dispatch, actions: Object.keys(ACT), TEXT: TEXT, ERR: ERR, state: function () { return S; },
      validateGrn: validateGrn, validateAdj: validateAdj, collectOpening: collectOpening, addDays: addDays, istDay: istDay
    })
  });
});
