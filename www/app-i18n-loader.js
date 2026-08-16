/* Loads the full translation dictionary only when a native language is active. */
(function(root,document){
  'use strict';
  var KEY='saagar_lang';
  var source=(document.currentScript&&document.currentScript.src||'').replace(/app-i18n-loader\.js(?:\?.*)?$/,'app-i18n.js');
  var requested=readLanguage();
  var loading=null;
  var stub;

  function validLanguage(lang){ return lang==='mr'||lang==='hi'||lang==='en'; }
  function readLanguage(){
    try{ var lang=root.localStorage.getItem(KEY); if(validLanguage(lang)) return lang; }catch(e){}
    return 'en';
  }
  function applyEnglish(){ try{ document.documentElement.lang='en'; }catch(e){} return 'en'; }
  function load(lang){
    requested=validLanguage(lang)?lang:readLanguage();
    if(root.SaagarI18n&&root.SaagarI18n!==stub){ return Promise.resolve(root.SaagarI18n.apply(requested)); }
    if(requested==='en'&&!loading) return Promise.resolve(applyEnglish());
    if(loading) return loading;
    loading=new Promise(function(resolve,reject){
      var script=document.createElement('script');
      script.src=source;
      script.onload=function(){
        if(root.SaagarI18n&&root.SaagarI18n!==stub){ resolve(root.SaagarI18n.apply(requested)); return; }
        reject(new Error('I18N_RUNTIME_UNAVAILABLE'));
      };
      script.onerror=function(){ reject(new Error('I18N_RUNTIME_LOAD_FAILED')); };
      (document.head||document.documentElement).appendChild(script);
    });
    return loading;
  }
  stub=Object.freeze({
    apply:function(lang){ lang=validLanguage(lang)?lang:readLanguage(); return lang==='en'?applyEnglish():load(lang); },
    setLanguage:function(lang){
      if(!validLanguage(lang)) return readLanguage();
      try{ root.localStorage.setItem(KEY,lang); }catch(e){}
      stub.apply(lang);
      return lang;
    },
    getLanguage:readLanguage,
    translate:function(text,lang){ if(validLanguage(lang)&&lang!=='en') load(lang); return String(text==null?'':text); },
    stats:function(){ return {mr:0,hi:0}; }
  });
  root.SaagarI18n=stub;
  try{ root.addEventListener('message',function(event){
    var data=event&&event.data;
    if(data&&data.type==='ST_LANG'&&validLanguage(data.lang)) stub.apply(data.lang);
  }); }catch(e){}
  try{ root.addEventListener('storage',function(event){ if(!event||event.key===KEY) stub.apply(readLanguage()); }); }catch(e){}
  stub.apply(requested);
})(window,document);
