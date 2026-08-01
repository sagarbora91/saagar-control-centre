import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const policy = require('../www/etp-import-foundation.e1-reviewed.js');
const datePolicy = { earliestDate: '2020-04-01', asOfDate: '2026-08-02', maxFutureDays: 2 };
const schemas = {
  R022: ['TRANS_TYPE','STORE_CODE','INVNUMBER','INVOICEDATE','NETVALUE','ENCIRCLE','CUSTOMERNAME'],
  R025: ['TRANS_TYPE','STORE_CODE','INVNUMBER','ITEMNUMBER','INVDATE','QTY','NETVALUE'],
  R013: ['TRANS_TYPE','STORE_CODE','INVNUMBER','CRO_NUMBER','INVDATE','NETVALUE','CRO_NAME'],
  R003: ['TRANS_TYPE','STORE_CODE','INVOICE_NUMBER','INVOICE_DATE','NETVALUE']
};
const adapters = {
  R022:{businessDateHeader:'INVOICEDATE',dropHeaders:['CUSTOMERNAME'],requiredIdentifiers:['invoiceNumber'],requiredMeasures:['netValue'],fields:{TRANS_TYPE:'transactionTypeRaw',STORE_CODE:'storeCode',INVNUMBER:'invoiceNumber',INVOICEDATE:'invoiceDateRaw',NETVALUE:'netValue',ENCIRCLE:'encircleAmount'}},
  R025:{businessDateHeader:'INVDATE',dropHeaders:[],requiredIdentifiers:['invoiceNumber','itemNumber'],requiredMeasures:['quantity','netValue'],fields:{TRANS_TYPE:'transactionTypeRaw',STORE_CODE:'storeCode',INVNUMBER:'invoiceNumber',ITEMNUMBER:'itemNumber',INVDATE:'invoiceDateRaw',QTY:'quantity',NETVALUE:'netValue'}},
  R013:{businessDateHeader:'INVDATE',dropHeaders:['CRO_NAME'],requiredIdentifiers:['invoiceNumber','croNumber'],requiredMeasures:['netValue'],fields:{TRANS_TYPE:'transactionTypeRaw',STORE_CODE:'storeCode',INVNUMBER:'invoiceNumber',CRO_NUMBER:'croNumber',INVDATE:'invoiceDateRaw',NETVALUE:'netValue'}},
  R003:{businessDateHeader:'INVOICE_DATE',dropHeaders:[],requiredIdentifiers:['invoiceNumber'],requiredMeasures:['netValue'],fields:{TRANS_TYPE:'transactionTypeRaw',STORE_CODE:'storeCode',INVOICE_NUMBER:'invoiceNumber',INVOICE_DATE:'invoiceDateRaw',NETVALUE:'netValue'}}
};
function prepare(id,row){ const detected=policy.detectReport(Object.keys(row),schemas); return policy.preparePersistableRow(id,row,adapters,detected,datePolicy); }
test('reduced synthetic fixtures are explicitly four-report policy coverage, not source acceptance',()=>{ for(const id of policy.REPORT_IDS) assert.equal(policy.detectReport(schemas[id],schemas).reportId,id); });
test('approved known PII is dropped and its canary never becomes persistable',()=>{ const out=prepare('R022',{TRANS_TYPE:'INV',STORE_CODE:'WLMHW',INVNUMBER:'0001',INVOICEDATE:'20240916',NETVALUE:'100',ENCIRCLE:'25',CUSTOMERNAME:'PRIVATE-CANARY'}); assert.equal(out.ok,true); assert.equal(out.persistableRow.fields.encircleAmount,'25'); assert.doesNotMatch(JSON.stringify(out.persistableRow),/PRIVATE-CANARY|CUSTOMERNAME/); });
test('unknown and unapproved known PII still fail closed',()=>{ const unknown={...schemas,R022:[...schemas.R022,'SURPRISE']}; const row={TRANS_TYPE:'INV',STORE_CODE:'WLMHW',INVNUMBER:'1',INVOICEDATE:'20240916',NETVALUE:'1',ENCIRCLE:'0',CUSTOMERNAME:'x',SURPRISE:'x'}; const out=policy.preparePersistableRow('R022',row,adapters,policy.detectReport(Object.keys(row),unknown),datePolicy); assert.equal(out.ok,false); assert.ok(out.fatalErrors.some(e=>e.code==='FIELD_NOT_WHITELISTED')); });
test('bare ENCIRCLE is not an identifier while ENCIRCLE identifier aliases are PII',()=>{ assert.equal(policy.isForbiddenPiiHeader('ENCIRCLE'),false); assert.equal(policy.isForbiddenPiiHeader('ENCIRCLE NO'),true); assert.equal(policy.isForbiddenPiiHeader('ENCIRCLE_NUMBER'),true); });
test('rows bind to the exact detected signature',()=>{ const row={TRANS_TYPE:'INV',STORE_CODE:'WLMHW',INVNUMBER:'1',INVOICEDATE:'20240916',NETVALUE:'1',ENCIRCLE:'0',CUSTOMERNAME:'x'}; const wrong=policy.detectReport(schemas.R003,schemas); const out=policy.preparePersistableRow('R022',row,adapters,wrong,datePolicy); assert.ok(out.fatalErrors.some(e=>e.code==='HEADER_SIGNATURE_MISMATCH')); });
test('report-specific identifiers and measures are mandatory and nonblank',()=>{ const row={TRANS_TYPE:'INV',STORE_CODE:'WLMHW',INVNUMBER:'1',ITEMNUMBER:'',INVDATE:'20240916',QTY:'1',NETVALUE:'10'}; const out=prepare('R025',row); assert.ok(out.fatalErrors.some(e=>e.code==='REQUIRED_FIELD_MISSING'&&e.field==='itemNumber')); });
test('R013 CRO identifier is covered while CRO name is dropped',()=>{ const out=prepare('R013',{TRANS_TYPE:'SR',STORE_CODE:'WLMHW',INVNUMBER:'9',CRO_NUMBER:'0007',INVDATE:'20260701',NETVALUE:'50',CRO_NAME:'PRIVATE-CANARY'}); assert.equal(out.ok,true); assert.equal(out.persistableRow.fields.croNumber,'0007'); assert.doesNotMatch(JSON.stringify(out.persistableRow),/PRIVATE-CANARY/); });
test('historical and future plausibility limits are deterministic',()=>{ const base={TRANS_TYPE:'INV',STORE_CODE:'WLMHW',INVOICE_NUMBER:'1',INVOICE_DATE:'20240916',NETVALUE:'1'}; assert.equal(prepare('R003',{...base,INVOICE_DATE:'00010101'}).fatalErrors.some(e=>e.code==='INVOICE_DATE_TOO_OLD'),true); assert.equal(prepare('R003',{...base,INVOICE_DATE:'20260804'}).ok,true); assert.equal(prepare('R003',{...base,INVOICE_DATE:'20260805'}).fatalErrors.some(e=>e.code==='INVOICE_DATE_TOO_FAR_FUTURE'),true); assert.ok(policy.preparePersistableRow('R003',base,adapters,policy.detectReport(Object.keys(base),schemas),{}).fatalErrors.some(e=>e.code==='DATE_POLICY_INVALID')); });
