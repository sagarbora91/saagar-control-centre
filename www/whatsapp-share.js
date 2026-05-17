/* ═══════════════════════════════════════════════════════════════════════════
   SAAGAR TRADERS — BUSINESS CONTROL CENTRE (V4)
   WHATSAPP / PDF SHARE — APK build addition
   ───────────────────────────────────────────────────────────────────────────
   Goal:
     Wherever a "Print" option exists (the shell Print button AND every
     module's own internal print buttons), let the user instead turn that
     exact print output into a PDF and send it on WhatsApp.

   How it works (fully offline):
     1. html2pdf.bundle.min.js (bundled locally) renders the open module's
        page to a real PDF — same content you would have printed.
     2. The PDF is written to the app cache, then handed to Android's native
        Share sheet via the Capacitor Share plugin.
     3. The user taps WhatsApp in that sheet and picks a contact. (Android
        does not allow an app to push a file straight into WhatsApp without
        the share sheet — this is the correct, reliable way.)

   Coverage:
     - Shell toolbar gets a "📲 WhatsApp" button next to "⎙ Print".
     - Every module loads in the same-origin iframe, so this script also
       intercepts each module's own window.print() and offers a small
       chooser: [🖨 Print] or [📲 Share to WhatsApp (PDF)].

   Browser fallback (desktop preview, no Capacitor):
     The PDF is generated and downloaded, with a note that WhatsApp sharing
     is active inside the installed APK.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function dateStamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function sanitize(s) {
    return String(s || 'Saagar').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_').slice(0, 60) || 'Saagar';
  }

  function notify(msg) {
    try { if (typeof window.toast === 'function') { window.toast(msg); return; } } catch (e) {}
    console.log('[whatsapp-share]', msg);
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onloadend = function () {
        var s = String(r.result || '');
        var i = s.indexOf(',');
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function caps() {
    var C = window.Capacitor;
    if (C && C.Plugins && C.Plugins.Share && C.Plugins.Filesystem) {
      return { Share: C.Plugins.Share, FS: C.Plugins.Filesystem };
    }
    return null;
  }

  /* Generate a PDF (Blob) from a document body, sized to the content. */
  function buildPdf(doc) {
    if (!window.html2pdf) {
      return Promise.reject(new Error('PDF engine not loaded'));
    }
    var el = doc.body || doc.documentElement;
    var w = Math.max(el.scrollWidth, 760);
    var opt = {
      margin: [12, 12, 14, 12],
      image: { type: 'jpeg', quality: 0.96 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: w, logging: false },
      jsPDF: { unit: 'pt', format: 'a4', orientation: w > 900 ? 'landscape' : 'portrait' },
      pagebreak: { mode: ['css', 'legacy', 'avoid-all'] }
    };
    return window.html2pdf().set(opt).from(el).toPdf().get('pdf').then(function (pdf) {
      return pdf.output('blob');
    });
  }

  /* Share a PDF blob: native share sheet in the app, download in a browser. */
  function shareBlob(blob, filename) {
    var c = caps();
    if (c) {
      return blobToBase64(blob).then(function (b64) {
        return c.FS.writeFile({ path: filename, data: b64, directory: 'CACHE' });
      }).then(function () {
        return c.FS.getUri({ directory: 'CACHE', path: filename });
      }).then(function (res) {
        return c.Share.share({
          title: filename,
          text: 'Saagar Traders — ' + filename,
          files: [res.uri],
          dialogTitle: 'Share PDF via WhatsApp'
        });
      }).then(function () {
        notify('Pick WhatsApp in the share menu');
      }).catch(function (e) {
        // user cancelling the share sheet also lands here — keep it quiet-ish
        var m = (e && e.message) ? e.message : String(e);
        if (/cancel/i.test(m)) return;
        notify('Share failed: ' + m);
      });
    }
    // Browser fallback
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    notify('PDF downloaded — WhatsApp share is active in the installed app');
    return Promise.resolve();
  }

  function activeModuleName(doc) {
    var t = document.getElementById('activeTitle');
    var name = (t && t.textContent && t.textContent.trim())
      || (doc && doc.title)
      || 'Saagar_Report';
    return sanitize(name) + '-' + dateStamp() + '.pdf';
  }

  /* Public: called by the shell "📲 WhatsApp" button and by the in-module
     chooser. mode:'share' (default) makes & shares a PDF; mode:'print'
     falls back to the original print. */
  window.SaagarShareCurrent = function (opt) {
    opt = opt || {};
    var frame = document.getElementById('moduleFrame');
    var doc = frame && (frame.contentDocument || (frame.contentWindow && frame.contentWindow.document));
    var win = frame && frame.contentWindow;
    if (!doc) { notify('Open a module first, then share its print output'); return; }
    removeChooser(doc);
    if (opt.mode === 'print') {
      try { (win && win.__saagarOrigPrint ? win.__saagarOrigPrint() : win.print()); }
      catch (e) { notify('Print is not available here'); }
      return;
    }
    notify('Preparing PDF for WhatsApp…');
    setTimeout(function () {
      buildPdf(doc)
        .then(function (blob) { return shareBlob(blob, activeModuleName(doc)); })
        .catch(function (e) { notify('Could not create PDF: ' + (e && e.message || e)); });
    }, 60);
  };

  /* In-module chooser overlay (injected into the iframe document). */
  function removeChooser(doc) {
    try {
      var ex = doc.getElementById('__saagarShareChooser');
      if (ex) ex.parentNode.removeChild(ex);
    } catch (e) {}
  }

  function showChooser(doc) {
    try {
      removeChooser(doc);
      var wrap = doc.createElement('div');
      wrap.id = '__saagarShareChooser';
      wrap.setAttribute('style',
        'position:fixed;inset:0;z-index:2147483647;background:rgba(10,20,35,.55);' +
        'display:flex;align-items:center;justify-content:center;font-family:Arial,Helvetica,sans-serif');
      wrap.innerHTML =
        '<div style="background:#fff;border-radius:16px;max-width:340px;width:86%;padding:22px;' +
        'box-shadow:0 20px 50px rgba(0,0,0,.35);text-align:center">' +
        '<div style="font-size:17px;font-weight:800;color:#0d2340;margin-bottom:6px">Send this page</div>' +
        '<div style="font-size:13px;color:#5b6a82;margin-bottom:18px">Turn what you would print into a PDF and share it.</div>' +
        '<button id="__sgShare" style="display:block;width:100%;padding:13px;margin-bottom:10px;border:0;' +
        'border-radius:10px;background:#1f9d4f;color:#fff;font-size:15px;font-weight:800">📲 Share to WhatsApp (PDF)</button>' +
        '<button id="__sgPrint" style="display:block;width:100%;padding:12px;margin-bottom:10px;border:1px solid #cbd6e4;' +
        'border-radius:10px;background:#fff;color:#0d2340;font-size:14px;font-weight:700">🖨 Print instead</button>' +
        '<button id="__sgCancel" style="display:block;width:100%;padding:10px;border:0;background:transparent;' +
        'color:#8fa0b6;font-size:13px;font-weight:700">Cancel</button>' +
        '</div>';
      doc.body.appendChild(wrap);
      doc.getElementById('__sgShare').onclick = function () { removeChooser(doc); window.SaagarShareCurrent({ mode: 'share' }); };
      doc.getElementById('__sgPrint').onclick = function () { removeChooser(doc); window.SaagarShareCurrent({ mode: 'print' }); };
      doc.getElementById('__sgCancel').onclick = function () { removeChooser(doc); };
      wrap.addEventListener('click', function (ev) { if (ev.target === wrap) removeChooser(doc); });
    } catch (e) {
      // If injection fails for any reason, just share directly.
      window.SaagarShareCurrent({ mode: 'share' });
    }
  }

  /* Intercept each module's own window.print() so existing in-module
     Print buttons offer the WhatsApp/PDF choice. Modules load via srcdoc
     (same origin) so this is safe and direct. */
  function hookFrame() {
    var frame = document.getElementById('moduleFrame');
    if (!frame || frame.__saagarBound) return;
    frame.__saagarBound = true;
    frame.addEventListener('load', function () {
      try {
        var win = frame.contentWindow;
        var doc = frame.contentDocument || (win && win.document);
        if (!win || !doc || win.__saagarPrintHooked) return;
        win.__saagarPrintHooked = true;
        win.__saagarOrigPrint = win.print ? win.print.bind(win) : function () {};
        win.print = function () { showChooser(doc); };
      } catch (e) { /* ignore */ }
    });
  }

  function init() {
    hookFrame();
    // The shell may build its toolbar after load; ensure the frame hook is set.
    var tries = 0;
    var iv = setInterval(function () {
      hookFrame();
      if (++tries > 20 || (document.getElementById('moduleFrame') && document.getElementById('moduleFrame').__saagarBound)) {
        clearInterval(iv);
      }
    }, 500);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
