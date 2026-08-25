import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const api = require('../www/shared/module-rendered-components.js');
const html = fs.readFileSync(new URL('../www/modules/expense/index.html', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../www/shared/module-rendered-components.js', import.meta.url), 'utf8');

test('Expense adopts the frozen responsive, component and table foundations', () => {
  for (const asset of ['module-brand-tokens.css','module-responsive.css','module-components.css','module-table.css','module-ui-runtime.js','module-table-runtime.js','module-rendered-components.js'])
    assert.match(html, new RegExp(`../../shared/${asset.replaceAll('.', '\\.')}`));
  assert.match(html, /<body[^>]*data-saagar-ui[^>]*data-saagar-width="auto"/);
  assert.match(html, /SaagarUiFoundation\.configure\(document\.body,\{mode:'auto'\}\)/);
  assert.match(html, /SaagarRenderedComponents\.observe\(document\.body,ExpenseRenderedPolicy\)/);
});

test('every generated Expense table has an explicit reviewed strategy', () => {
  const tables = [...html.matchAll(/<table[^>]*data-saagar-table-strategy="(cards|priority|grid)"[^>]*data-saagar-table-workflow="([^"]+)"[^>]*>/g)]
    .map(match => [match[2], match[1]]);
  assert.deepEqual(tables, [
    ['ledger','grid'], ['vendors','cards'], ['budgets','cards'],
    ['cross-module','grid'], ['month-summary','cards'], ['firm-profit-loss','cards'],
    ['audit','grid'], ['receivables','cards']
  ]);
  const printTables=[...html.matchAll(/<table[^>]*data-saagar-print-table-strategy="priority"[^>]*data-saagar-table-workflow="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(printTables,['statement-inflows','statement-outflows','statement-reconciliation']);
  assert.equal((html.match(/<table/g) || []).length, tables.length+printTables.length);
  for (const workflow of ['ledger','cross-module','audit'])
    assert.match(html, new RegExp(`data-saagar-table-workflow="${workflow}"[^>]*data-saagar-grid-reason="[^"]+"`));
});

test('render helper safely escapes hostile values and contains no execution sink', () => {
  assert.equal(api.escapeText(`<img src=x onerror='pwn()'> & "x"`), '&lt;img src=x onerror=&#39;pwn()&#39;&gt; &amp; &quot;x&quot;');
  assert.match(html, /function esc\(s\)[^{]*\{ return String\(s==null\?'':s\)\.replace\(\/\[&<>"'\]\//);
  assert.doesNotMatch(runtime, /innerHTML|insertAdjacentHTML|\beval\s*\(|new Function/);
  assert.equal(Object.isFrozen(api), true);
});

test('generated buttons use audited markup and risky values use delegated arguments', () => {
  const controls = [...html.matchAll(/<button\b[^>]*data-action="([^"]+)"[^>]*>/g)];
  assert.ok(controls.length >= 50);
  for (const [, action] of controls) assert.match(action, /^[a-z][a-z0-9-]{0,63}$/);
  assert.match(runtime, /setAttribute\('data-saagar-audited-control','row-action-v1'\)/);
  assert.match(runtime, /setAttribute\('type','button'\)/);
  assert.match(html, /data-action="approve-ledger-entry" data-saagar-args="'\+jargs\(e\.id\)\+'"/);
  assert.match(html, /data-action="void-ledger-entry" data-saagar-args="'\+jargs\(e\.id\)\+'"/);
  assert.match(html, /onclick="closeDay\(\)"/);
  assert.match(html, /onclick="genTaxFeed\(\)"/);
});

test('rendered DOM audit applies the declared table strategy and control contract', () => {
  const attributes = new Map([
    ['data-saagar-table-strategy','grid'],
    ['data-saagar-table-workflow','ledger'],
    ['data-saagar-grid-reason','financial comparison']
  ]);
  const table = {
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, String(value))
  };
  const controlAttributes = new Map([['data-action','approve-ledger-entry']]);
  const control = {
    getAttribute: name => controlAttributes.get(name) ?? null,
    setAttribute: (name, value) => controlAttributes.set(name, String(value))
  };
  let applied;
  globalThis.SaagarTableFoundation = Object.freeze({
    applyStrategy: (node, strategy, options) => { applied = { node, strategy, options }; }
  });
  const policy = api.createPolicy({ 'approve-ledger-entry': { handler: 'approveEntry', args: 1 } }, {
    ledger: { strategy: 'grid', reason: 'financial comparison' }
  });
  controlAttributes.set('onclick', "approveEntry('safe')");
  const result = api.enhance({
    querySelectorAll: selector => selector.startsWith('table') ? [table] : [control]
  }, policy);
  assert.deepEqual(applied, { node: table, strategy: 'grid', options: { reason: 'financial comparison' } });
  assert.equal(controlAttributes.get('type'), 'button');
  assert.equal(controlAttributes.get('data-saagar-audited-control'), 'row-action-v1');
  assert.deepEqual(result, { tables: 1, controls: 1, rejected: 0 });
  const forgedAttributes = new Map([['data-action','valid-but-forged'],['onclick','approveEntry(1)']]);
  const forged = { getAttribute: name => forgedAttributes.get(name) ?? null, setAttribute: (name,value) => forgedAttributes.set(name,String(value)) };
  const rejected = api.enhance({ querySelectorAll: selector => selector.startsWith('table') ? [] : [forged] }, policy);
  assert.equal(rejected.rejected, 1);
  assert.equal(forgedAttributes.get('disabled'), 'disabled');
  const chainedAttributes = new Map([['data-action','approve-ledger-entry'],['onclick',"approveEntry('safe');globalThis.pwned=1"]]);
  const chained = { getAttribute:name=>chainedAttributes.get(name)??null,setAttribute:(name,value)=>chainedAttributes.set(name,String(value)) };
  const chainedResult = api.enhance({ querySelectorAll: selector => selector.startsWith('table') ? [] : [chained] }, policy);
  assert.equal(chainedResult.rejected,1);
  assert.equal(chainedAttributes.get('disabled'),'disabled');
  delete globalThis.SaagarTableFoundation;
});

test('inline argument encoder survives HTML attribute parsing and click compilation', () => {
  const hostileValues = [
    `store');globalThis.pwned=1;//`, `Travel');globalThis.pwned=2;//`,
    `wsc');globalThis.pwned=3;//`, `id');globalThis.pwned=4;//&quot;`
  ];
  for (const hostile of hostileValues) {
    const markup = `<button onclick="capture('${api.encodeInlineString(hostile)}')">go</button>`;
    const parsedAttribute = markup.match(/onclick="([^"]*)"/)[1]
      .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    let received;
    globalThis.pwned = 0;
    Function('capture', parsedAttribute)(value => { received = value; });
    assert.equal(received, hostile);
    assert.equal(globalThis.pwned, 0);
  }
  delete globalThis.pwned;
  assert.throws(() => api.encodeInlineString(Object.create({ toString(){ globalThis.pwned=9; } })), /primitive/);
  assert.equal(globalThis.pwned, undefined);
});

test('all persisted and cross-module inline arguments use jsq, never text escaping', () => {
  for (const expression of ['e.id','t.id','s.code','store','src','r.id']) {
    assert.match(html, new RegExp(`jargs\\(${expression.replace('.', '\\.')}\\)`));
  }
  assert.match(html, /jsq\(c\)/);
  assert.doesNotMatch(html, /onclick="[^"]*\\'\+esc\((?:s\.code|store)\)/);
  assert.doesNotMatch(html, /(?:onclick|onchange)="[^"]*\\'\+(?:e\.id|t\.id|c|src|r\.id)\+/);
});

test('capture-phase delegated click revalidates hostile opaque keys before exact dispatch', () => {
  const hostile = `store');globalThis.pwned=1;//`;
  const attributes = new Map([
    ['data-action','filter-statement-store'],
    ['data-saagar-args',api.encodeArgs([hostile])]
  ]);
  const control = { getAttribute: name => attributes.get(name) ?? null, setAttribute: (name,value) => attributes.set(name,String(value)) };
  let listener,received;
  const scope = {
    addEventListener: (name,fn,capture) => { assert.equal(name,'click');assert.equal(capture,true);listener=fn; },
    removeEventListener: () => {}, contains: node => node===control,
    querySelectorAll: selector => selector.startsWith('table') ? [] : [control]
  };
  const policy = api.createPolicy({ 'filter-statement-store': { handler:'setSST',args:1,delegated:true } }, {});
  globalThis.SaagarTableFoundation=Object.freeze({applyStrategy(){}});
  api.enhance(scope,policy);
  const connection = api.connect(scope,policy,{ setSST: value => { received=value; } });
  listener({ target:{ closest:()=>control }, preventDefault(){}, stopImmediatePropagation(){} });
  assert.equal(received,hostile);
  attributes.set('data-saagar-args',api.encodeArgs(['safe','extra']));
  listener({ target:{ closest:()=>control }, preventDefault(){}, stopImmediatePropagation(){} });
  assert.equal(attributes.get('disabled'),'disabled');
  connection.disconnect();connection.disconnect();
  delete globalThis.SaagarTableFoundation;
});

test('new, outside, mutated, unverified or pre-rejected controls cannot dispatch', () => {
  const policy=api.createPolicy({safe:{handler:'capture',args:1,delegated:true}},{});
  let listener,calls=0;
  const scope={addEventListener:(n,fn)=>{listener=fn;},removeEventListener(){},contains:node=>node.inside===true};
  api.connect(scope,policy,{capture(){calls++;}});
  function control(attrs,inside=true){const values=new Map(Object.entries(attrs));return {inside,getAttribute:n=>values.get(n)??null,setAttribute:(n,v)=>values.set(n,String(v)),values};}
  const fresh=control({'data-action':'safe','data-saagar-args':api.encodeArgs(['x']),'data-saagar-audited-control':'row-action-v1'});
  listener({target:{closest:()=>fresh},preventDefault(){},stopImmediatePropagation(){}});
  assert.equal(calls,0,'newly inserted control cannot beat asynchronous observation');
  const outside=control({'data-action':'safe','data-saagar-args':api.encodeArgs(['x']),'data-saagar-audited-control':'row-action-v1'},false);
  listener({target:{closest:()=>outside},preventDefault(){},stopImmediatePropagation(){}});
  assert.equal(calls,0);
  const mutated=control({'data-action':'safe','data-saagar-args':api.encodeArgs(['before'])});
  globalThis.SaagarTableFoundation=Object.freeze({applyStrategy(){}});
  api.enhance({querySelectorAll:selector=>selector.startsWith('table')?[]:[mutated]},policy);
  mutated.values.set('data-saagar-args',api.encodeArgs(['after']));
  listener({target:{closest:()=>mutated},preventDefault(){},stopImmediatePropagation(){}});
  assert.equal(calls,0,'argument mutation cannot beat asynchronous invalidation');
  delete globalThis.SaagarTableFoundation;
});

test('hostile cross-module mode and legacy ledger source remain inert DOM text', () => {
  const hostile=`bank\" onclick=\"globalThis.pwned=1`;
  const escBody=html.match(/function esc\(s\)\{([^\r\n]*)\}/)[1];
  const tokenBody=html.match(/function badgeToken\(s\)\{([^\r\n]*)\}/)[1];
  const escape=Function('s',escBody),token=Function('s',tokenBody);
  const modeMarkup='<span class="bdg '+token(hostile)+'">'+escape(hostile)+'</span>';
  const sourceMarkup='<span class="bdg src">'+escape(hostile)+'</span>';
  assert.equal(token(hostile),'auto');
  assert.doesNotMatch(modeMarkup,/ class="[^"]*" onclick=/);
  assert.doesNotMatch(sourceMarkup,/ class="[^"]*" onclick=/);
  assert.match(modeMarkup,/&quot; onclick=&quot;/);
  assert.match(sourceMarkup,/&quot; onclick=&quot;/);
  assert.match(html,/badgeToken\(i\.mode\).*esc\(i\.mode\)/);
  assert.match(html,/bdg src">'\+esc\(e\.source\)/);
});

test('policy rejects prototype pollution and is deeply immutable', () => {
  assert.throws(() => api.createPolicy(Object.create({ forged: 'go' }), {}), /plain object/);
  assert.throws(() => api.createPolicy({}, Object.create({ forged: { strategy: 'cards' } })), /plain object/);
  const policy = api.createPolicy({ safe: { handler: 'go', args: 1 } }, { ledger: { strategy: 'cards' } });
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.actions), true);
  assert.equal(Object.isFrozen(policy.workflows), true);
});

test('API-23 has primary flex fallbacks for Expense layout grids', () => {
  assert.match(html, /html\.saagar-legacy-webview \.kgrid/);
  assert.match(html, /display:-webkit-flex;display:flex/);
  assert.match(html, /-webkit-flex-wrap:wrap;flex-wrap:wrap/);
  assert.doesNotMatch(runtime, /\.padStart\(|\.includes\(/);
  assert.match(runtime, /attributeOldValue:true/);
  assert.match(runtime, /oldValue===target\.getAttribute/);
});
