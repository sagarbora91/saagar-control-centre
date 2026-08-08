/* Shared Retail ETP browser runtime facade. Offline-only; no network capability. */
(function(root,factory){var api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SaagarEtpImportRuntimeFactory=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  var REPORTS=['R003','R013','R022','R025'],CHUNK_ROWS=500;
  function failure(code,stage,detail){return {ok:false,code:code,stage:stage||'RUNTIME',detail:detail||null};}
  function snake(value){return String(value).replace(/([a-z0-9])([A-Z])/g,'$1_$2').toLowerCase();}
  function bytesOf(value){return value instanceof Uint8Array?value:new Uint8Array(value);}
  function readFile(file){
    if(!file)return Promise.reject(new Error('ETP_FILE_REQUIRED'));
    if(typeof file.arrayBuffer==='function')return file.arrayBuffer().then(bytesOf);
    return new Promise(function(resolve,reject){if(typeof root.FileReader!=='function')return reject(new Error('ETP_FILE_READER_UNAVAILABLE'));var reader=new root.FileReader();reader.onerror=function(){reject(new Error('ETP_FILE_READ_FAILED'));};reader.onload=function(){resolve(bytesOf(reader.result));};reader.readAsArrayBuffer(file);});
  }
  function hex(buffer){var out='',view=new Uint8Array(buffer);for(var i=0;i<view.length;i++){var h=view[i].toString(16);out+=h.length<2?'0'+h:h;}return out;}
  function digest(cryptoApi,bytes){if(!cryptoApi||!cryptoApi.subtle||typeof cryptoApi.subtle.digest!=='function')return Promise.reject(new Error('ETP_DIGEST_UNAVAILABLE'));return cryptoApi.subtle.digest('SHA-256',bytes).then(hex);}
  function utf8(value){if(typeof root.TextEncoder==='function')return new root.TextEncoder().encode(String(value));var text=unescape(encodeURIComponent(String(value))),bytes=new Uint8Array(text.length);for(var i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i);return bytes;}
  function generationId(cryptoApi){if(!cryptoApi||typeof cryptoApi.getRandomValues!=='function')return '';var bytes=new Uint8Array(16);cryptoApi.getRandomValues(bytes);return 'etp_'+hex(bytes);}
  function allAllowedFields(profile){var seen={},forbidden=/(?:^|_)(?:workbook|worksheet|filename|file_label|file_path|source_name|source_bytes|blob|base64|customer|consumer|mobile|phone|email|address|name|aadhaar|pan|dob)(?:$|_)/i;Object.keys(profile.REPORTS).forEach(function(id){Object.keys(profile.REPORTS[id].fields).forEach(function(raw){var field=snake(profile.REPORTS[id].fields[raw]);if(!forbidden.test(field))seen[field]=true;});});return Object.keys(seen).sort();}
  function create(options){
    options=options||{};var profile=options.profile,loader=options.loader,lifecycle=options.lifecyclePolicy,coordinatorApi=options.coordinatorApi,nativeApi=options.nativeApi,reconciliation=options.reconciliationPolicy,cryptoApi=options.crypto||root.crypto;
    if(!profile||!loader||!lifecycle||!coordinatorApi||!nativeApi||!reconciliation)return failure('ETP_RUNTIME_DEPENDENCY_INVALID','CREATE');
    var allowedFields=allAllowedFields(profile),allowedSet={};allowedFields.forEach(function(field){allowedSet[field]=true;});
    var madeStore=nativeApi.create({lifecyclePolicy:lifecycle,plugin:options.plugin,allowedFactFields:allowedFields});
    if(!madeStore||!madeStore.ok)return failure(madeStore&&madeStore.code||'ETP_NATIVE_UNAVAILABLE','CREATE');
    var preparedFiles=null,parsedReports=null;
    var pipeline={
      preflight:async function(value){
        if(!value||!Array.isArray(value.files)||value.files.length!==4)return failure('ETP_FOUR_REPORTS_REQUIRED','PREFLIGHT');
        var seen={},items=[];
        for(var i=0;i<value.files.length;i++){
          var selected=String(value.files[i]&&value.files[i].selectedReportId||'').toUpperCase();
          if(REPORTS.indexOf(selected)<0||seen[selected]||!value.files[i].file)return failure('ETP_REPORT_SELECTION_INVALID','PREFLIGHT');
          seen[selected]=true;var bytes;try{bytes=await readFile(value.files[i].file);}catch(error){return failure(String(error&&error.message||'ETP_FILE_READ_FAILED'),'PREFLIGHT');}
          items.push({selectedReportId:selected,fileLabel:String(value.files[i].file.name||selected+'.xlsx'),bytes:bytes});
        }
        preparedFiles=items;return {ok:true,items:items};
      },
      parse:async function(value){
        if(!preparedFiles)return failure('ETP_PREFLIGHT_STATE_MISSING','PARSE');
        var reports={};
        for(var i=0;i<preparedFiles.length;i++){
          var item=preparedFiles[i],loaded=await loader.load({bytes:item.bytes,fileLabel:item.fileLabel,selectedReportId:item.selectedReportId,expectedStoreCode:value.scope.storeCode,datePolicy:options.datePolicy});
          if(!loaded.ok)return loaded;
          loaded.sourceSha256=await digest(cryptoApi,item.bytes);
          loaded.headerSignatureSha256=await digest(cryptoApi,utf8(loaded.signatureKey));
          reports[loaded.reportId]=loaded;
        }
        if(!REPORTS.every(function(id){return !!reports[id];}))return failure('ETP_FOUR_REPORTS_REQUIRED','PARSE');
        parsedReports=reports;return {ok:true,reports:reports};
      },
      validate:async function(value){
        var reports=value&&value.parsed&&value.parsed.reports;if(!reports||reports!==parsedReports)return failure('ETP_PARSE_STATE_INVALID','VALIDATE');
        var manifest={scopeKey:[value.scope.storeCode,value.scope.financialYear,value.scope.periodStart+'..'+value.scope.periodEnd].join('|'),generationId:options.currentGenerationId(),reports:[]},chunks=[];
        for(var r=0;r<REPORTS.length;r++){
          var id=REPORTS[r],loaded=reports[id],factRows=[];
          for(var n=0;n<loaded.rows.length;n++){
            var row=loaded.rows[n];if(row.businessDate<value.scope.periodStart||row.businessDate>value.scope.periodEnd)return failure('ETP_ROW_OUTSIDE_SELECTED_PERIOD','VALIDATE',{reportId:id,row:n+2});
            var fact={};Object.keys(row.fields).forEach(function(key){var field=snake(key);if(allowedSet[field])fact[field]=row.fields[key];});factRows.push(fact);
          }
          if(!factRows.length)return failure('ETP_ZERO_ACTIVITY_CONFIRMATION_REQUIRED','VALIDATE',{reportId:id});
          manifest.reports.push({reportId:id,sourceSha256:loaded.sourceSha256,headerSignatureSha256:loaded.headerSignatureSha256,rowCount:factRows.length});
          for(var at=0;at<factRows.length;at+=CHUNK_ROWS)chunks.push({reportId:id,chunkIndex:Math.floor(at/CHUNK_ROWS),rows:factRows.slice(at,at+CHUNK_ROWS)});
        }
        return {ok:true,manifest:manifest,chunks:chunks,reports:reports};
      },
      reconcile:async function(value){
        var reports=value.validated.reports,left=reports.R022.rows.map(function(row){return row.fields;}),right=reports.R025.rows.map(function(row){return row.fields;});
        var rule={ruleId:'REC_002',ruleVersion:'retail_2026_08_08',owner:'Accountant / MIS owner',label:'Revenue vs SDB Variantwise Sales',severity:'CRITICAL',sourceReports:{left:'R022',right:'R025'},keys:[{name:'invoice',leftField:'invoiceNumber',rightField:'invoiceNumber'},{name:'date',leftField:'invoiceDate',rightField:'invoiceDate'}],transaction:{leftField:'transactionTypeRaw',rightField:'transactionTypeRaw',signs:{INV:1,SR:-1,BC:-1}},measures:[{name:'quantity',leftField:'invoiceQuantity',rightField:'quantity',scale:3,toleranceUnits:0},{name:'netValue',leftField:'netValue',rightField:'netValue',scale:2,toleranceUnits:100}],filters:[]};
        var coverage={left:{status:'COMPLETE',periodStart:value.scope.periodStart,declaredPeriodEnd:value.scope.periodEnd,evidenceId:reports.R022.sourceSha256,zeroActivityConfirmed:false},right:{status:'COMPLETE',periodStart:value.scope.periodStart,declaredPeriodEnd:value.scope.periodEnd,evidenceId:reports.R025.sourceSha256,zeroActivityConfirmed:false}};
        return reconciliation.compareReports(left,right,rule,coverage);
      }
    };
    var currentGeneration='';options.currentGenerationId=function(){return currentGeneration;};
    var made=coordinatorApi.create({lifecyclePolicy:lifecycle,pipeline:pipeline,store:madeStore.adapter});if(!made||!made.ok)return failure(made&&made.code||'ETP_COORDINATOR_UNAVAILABLE','CREATE');
    async function run(request){currentGeneration=generationId(cryptoApi);if(!currentGeneration)return failure('ETP_ENTROPY_UNAVAILABLE','SELECT');preparedFiles=null;parsedReports=null;var result=await made.coordinator.run(Object.assign({},request,{generationId:currentGeneration}));if(!result.ok&&result.detail&&result.detail.code&&/^(?:ETP_|XLSX_|RETAIL_)/.test(result.detail.code))return Object.assign({},result,{coordinatorCode:result.code,code:result.detail.code});return result;}
    return {ok:true,runtime:Object.freeze({run:run,confirm:made.coordinator.confirm})};
  }
  function bootstrap(){
    try{
      if(!root.readXlsxFile||!root.fflate||typeof root.fflate.unzipSync!=='function')return failure('ETP_BROWSER_BUNDLE_UNAVAILABLE','BOOTSTRAP');
      var loader=root.SaagarEtpRetailXlsxLoader.create({readWorkbook:function(bytes,settings){return root.readXlsxFile(bytes,settings);},unzipParts:function(bytes){return root.fflate.unzipSync(bytes);}});
      return create({profile:root.SaagarEtpRetailProfile,loader:loader,lifecyclePolicy:root.SaagarEtpStoreLifecyclePolicy,coordinatorApi:root.SaagarEtpImportCoordinator,nativeApi:root.SaagarEtpNativeStore,reconciliationPolicy:root.SaagarEtpReconciliationPolicy,plugin:root.Capacitor&&root.Capacitor.Plugins&&root.Capacitor.Plugins.SaagarEtpStore,crypto:root.crypto,datePolicy:{earliestDate:'2024-04-01',asOfDate:new Date().toISOString().slice(0,10),maxFutureDays:2}});
    }catch(_){return failure('ETP_RUNTIME_BOOTSTRAP_FAILED','BOOTSTRAP');}
  }
  var boot=bootstrap();if(boot.ok)root.SaagarEtpImportRuntime=boot.runtime;else root.SaagarEtpImportRuntimeStatus=Object.freeze(boot);
  return Object.freeze({VERSION:1,REPORTS:Object.freeze(REPORTS.slice()),create:create,bootstrap:bootstrap});
});
