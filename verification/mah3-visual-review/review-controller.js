(function () {
  'use strict';

  var STATE_KEY = 'mah3_visual_review_state_v2';
  var ALLOWED_STATUS = ['not-run', 'pass', 'defect', 'deferred'];
  var model = null;
  var cases = [];
  var currentIndex = 0;
  var reviews = Object.create(null);
  var reviewerId = '';
  var loadSequence = 0;
  var activeReadyCaseId = '';
  var activeReadiness = null;
  var frame = document.getElementById('appFrame');

  function byId(id) { return document.getElementById(id); }
  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function currentCase() { return cases[currentIndex]; }
  function currentReview() {
    var item = currentCase();
    if (!reviews[item.id]) reviews[item.id] = { status: 'not-run', evidenceRef: '', note: '', geometry: null };
    return reviews[item.id];
  }

  function stateIdentity() {
    return {
      profileId: model.profile.profileId,
      profileSha256: model.profileSha256,
      sourceTreeSha256: model.fingerprint.treeSha256,
      runnerTreeSha256: model.runnerFingerprint.treeSha256
    };
  }

  function sameIdentity(value) {
    var expected = stateIdentity();
    return value && value.profileId === expected.profileId &&
      value.profileSha256 === expected.profileSha256 &&
      value.sourceTreeSha256 === expected.sourceTreeSha256 &&
      value.runnerTreeSha256 === expected.runnerTreeSha256;
  }

  function restoreState() {
    try {
      var parsed = JSON.parse(sessionStorage.getItem(STATE_KEY) || '{}');
      if (sameIdentity(parsed) && parsed.reviews && typeof parsed.reviews === 'object') {
        reviews = parsed.reviews;
        reviewerId = String(parsed.reviewerId || '').slice(0, 100);
        currentIndex = Math.max(0, Math.min(cases.length - 1, Number(parsed.currentIndex) || 0));
      }
    } catch (_) {}
  }

  function persistState() {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(Object.assign(stateIdentity(), {
        reviewerId: reviewerId,
        currentIndex: currentIndex,
        reviews: reviews
      })));
    } catch (_) {}
  }

  function setPill(element, text, tone) {
    element.textContent = text;
    element.className = 'pill' + (tone ? ' ' + tone : '');
  }

  function updateSummary() {
    var values = cases.map(function (item) { return reviews[item.id] || { status: 'not-run' }; });
    var reviewed = values.filter(function (item) { return item.status !== 'not-run'; }).length;
    var passed = values.filter(function (item) { return item.status === 'pass'; }).length;
    var issues = values.filter(function (item) { return item.status === 'defect' || item.status === 'deferred'; }).length;
    byId('reviewedCount').textContent = String(reviewed);
    byId('passCount').textContent = String(passed);
    byId('issueCount').textContent = String(issues);
    byId('remainingCount').textContent = String(cases.length - reviewed);
  }

  function updateReviewControls() {
    var review = currentReview();
    document.querySelectorAll('[data-status]').forEach(function (button) {
      button.classList.toggle('active', button.dataset.status === review.status);
    });
    byId('reviewerId').value = reviewerId;
    byId('evidenceRef').value = review.evidenceRef || '';
    byId('reviewNote').value = review.note || '';
    updateSummary();
  }

  function planningFixture() {
    return {
      calendar: {
        version: 1,
        festivals: [{
          id: 'mah3-synthetic-festival',
          name: 'Synthetic Festival A',
          start: '2026-08-10',
          end: '2026-08-12',
          targets: { titanworld: 100000, helios: 80000 },
          note: 'Synthetic non-PII review fixture',
          blackout: true,
          checklist: [
            { text: 'Synthetic stock preparation', done: true },
            { text: 'Synthetic team briefing', done: false }
          ]
        }]
      },
      qms: {
        customers: [{
          id: 'mah3-synthetic-sale',
          outcome: 'Purchase',
          closedAt: '2026-08-11T12:00:00.000Z',
          purchaseAmount: 45000
        }]
      }
    };
  }

  function prepareOrigin(item) {
    localStorage.clear();
    localStorage.setItem('saagar_ui_mode', item.uiMode);
    localStorage.setItem('saagar_lang', item.language);
    localStorage.setItem('saagar_selected_date', model.profile.matrix.selectedDate);
    localStorage.setItem('saagar_text_size', model.profile.matrix.textSize);
    if (item.surface === 'planning') {
      var fixture = planningFixture();
      localStorage.setItem('saagar_festival_calendar_v1', JSON.stringify(fixture.calendar));
      localStorage.setItem('retail_queue_management_v1', JSON.stringify(fixture.qms));
    }
  }

  function disableMotion(doc) {
    if (!doc || doc.getElementById('mah3-review-motion-guard')) return;
    var style = doc.createElement('style');
    style.id = 'mah3-review-motion-guard';
    style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}';
    (doc.head || doc.documentElement).appendChild(style);
  }

  function waitForLoad(targetFrame, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var complete = false;
      var timer = setTimeout(function () {
        if (complete) return;
        complete = true;
        targetFrame.removeEventListener('load', onLoad);
        reject(new Error('Nested module frame did not load within ' + timeoutMs + ' ms'));
      }, timeoutMs);
      function onLoad() {
        if (complete) return;
        complete = true;
        clearTimeout(timer);
        resolve();
      }
      targetFrame.addEventListener('load', onLoad, { once: true });
    });
  }

  async function prepareSurface(item, token) {
    var shellWindow = frame.contentWindow;
    var shellDocument = frame.contentDocument;
    if (!shellWindow || !shellDocument || typeof shellWindow.switchView !== 'function') {
      throw new Error('Shell view API unavailable');
    }

    if (item.kind === 'shell') {
      if (item.surface === 'shell-home') shellWindow.switchView('home');
      if (item.surface === 'settings-home') {
        shellWindow.switchView('config');
        if (typeof shellWindow.showSettingsHome === 'function') shellWindow.showSettingsHome();
      }
      if (item.surface === 'settings-detail') {
        shellWindow.switchView('config');
        if (typeof shellWindow.switchConfigTab === 'function') shellWindow.switchConfigTab('appearance');
      }
      shellWindow.dispatchEvent(new Event('resize'));
      return null;
    }

    if (typeof shellWindow.openModule !== 'function') throw new Error('Shell module API unavailable');
    var nestedFrame = shellDocument.getElementById('moduleFrame');
    if (!nestedFrame) throw new Error('Nested module frame unavailable');
    var loaded = waitForLoad(nestedFrame, 12000);
    shellWindow.openModule(item.surface);
    await loaded;
    if (token !== loadSequence || currentCase().id !== item.id) throw new Error('Stale module load superseded');
    disableMotion(nestedFrame.contentDocument);
    shellWindow.dispatchEvent(new Event('resize'));
    if (nestedFrame.contentWindow) nestedFrame.contentWindow.dispatchEvent(new Event('resize'));
    return nestedFrame;
  }

  async function waitForFonts(doc) {
    if (!doc || !doc.fonts || !doc.fonts.ready) return { supported: false, status: 'unsupported' };
    var timedOut = false;
    await Promise.race([
      doc.fonts.ready,
      delay(5000).then(function () { timedOut = true; })
    ]);
    return { supported: true, status: doc.fonts.status || 'unknown', timedOut: timedOut };
  }

  function nextPaint(win) {
    return new Promise(function (resolve) {
      if (!win || typeof win.requestAnimationFrame !== 'function') { setTimeout(resolve, 32); return; }
      win.requestAnimationFrame(function () { win.requestAnimationFrame(resolve); });
    });
  }

  function visible(element) {
    if (!element || !element.ownerDocument) return false;
    var style = element.ownerDocument.defaultView.getComputedStyle(element);
    var rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  }

  function selectorFor(element) {
    if (element.id) return '#' + element.id;
    var name = element.tagName.toLowerCase();
    var classes = Array.from(element.classList || []).slice(0, 2);
    return name + (classes.length ? '.' + classes.join('.') : '');
  }

  function hasScroller(element, axis) {
    var node = element;
    while (node && node.nodeType === 1) {
      var style = node.ownerDocument.defaultView.getComputedStyle(node);
      var overflow = axis === 'x' ? style.overflowX : style.overflowY;
      var scroll = axis === 'x' ? node.scrollWidth > node.clientWidth + 1 : node.scrollHeight > node.clientHeight + 1;
      if ((overflow === 'auto' || overflow === 'scroll') && scroll) return true;
      node = node.parentElement;
    }
    return false;
  }

  function intersectionArea(left, right) {
    var width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
    var height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
    return width * height;
  }

  function clippedByAncestor(element) {
    var rect = element.getBoundingClientRect();
    var node = element.parentElement;
    while (node && node !== element.ownerDocument.body) {
      var style = node.ownerDocument.defaultView.getComputedStyle(node);
      if (/hidden|clip/.test(style.overflowX + ' ' + style.overflowY)) {
        var parentRect = node.getBoundingClientRect();
        if (intersectionArea(rect, parentRect) < rect.width * rect.height * 0.8) return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function collectGeometry(doc, label) {
    var win = doc.defaultView;
    var viewportWidth = doc.documentElement.clientWidth || win.innerWidth;
    var viewportHeight = doc.documentElement.clientHeight || win.innerHeight;
    var rootScrollWidth = Math.max(doc.documentElement.scrollWidth, doc.body ? doc.body.scrollWidth : 0);
    var rootScrollHeight = Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0);
    var focusable = Array.from(doc.querySelectorAll('button,input:not([type="hidden"]),select,textarea,a[href],[tabindex]')).filter(visible);
    var horizontalControlLeaks = [];
    var clippedControls = [];
    var coveredVisibleControls = [];
    var verticalUnreachable = [];
    focusable.forEach(function (element) {
      var rect = element.getBoundingClientRect();
      if ((rect.left < -1 || rect.right > viewportWidth + 1) && !hasScroller(element, 'x')) horizontalControlLeaks.push(selectorFor(element));
      if (clippedByAncestor(element)) clippedControls.push(selectorFor(element));
      if (rect.bottom > viewportHeight + 1 && rootScrollHeight <= viewportHeight + 1 && !hasScroller(element, 'y')) verticalUnreachable.push(selectorFor(element));
      if (rect.right > 0 && rect.left < viewportWidth && rect.bottom > 0 && rect.top < viewportHeight) {
        var x = Math.max(1, Math.min(viewportWidth - 1, rect.left + rect.width / 2));
        var y = Math.max(1, Math.min(viewportHeight - 1, rect.top + rect.height / 2));
        var hit = doc.elementFromPoint(x, y);
        if (hit && hit !== element && !element.contains(hit) && !hit.contains(element)) coveredVisibleControls.push(selectorFor(element) + ' covered by ' + selectorFor(hit));
      }
    });

    var tapFloor = Array.from(doc.querySelectorAll('button,.btn,[role="button"],select,textarea,input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])')).filter(visible).filter(function (element) {
      var rect = element.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44;
    }).map(selectorFor);

    var localScrollLeaks = Array.from(doc.querySelectorAll('table,.tabs,.tab-nav,.tab-chips,.q-tabs,.view-tabs,.stage-chips,.store-nav')).filter(visible).filter(function (element) {
      return element.scrollWidth > element.clientWidth + 1 && !hasScroller(element, 'x');
    }).map(selectorFor);

    var overflowLeaks = Array.from(doc.body ? doc.body.querySelectorAll('*') : []).filter(function (element) {
      if (!visible(element) || element.clientWidth <= 0 || element.scrollWidth <= element.clientWidth + 2) return false;
      if (hasScroller(element, 'x')) return false;
      var style = win.getComputedStyle(element);
      return style.overflowX !== 'hidden' && style.overflowX !== 'clip';
    }).map(selectorFor);

    var fixed = Array.from(doc.body ? doc.body.querySelectorAll('*') : []).filter(function (element) {
      return visible(element) && /fixed|sticky/.test(win.getComputedStyle(element).position);
    });
    var fixedCollisionCandidates = [];
    var fixedControlOverlapCandidates = [];
    fixed.forEach(function (fixedElement, fixedIndex) {
      for (var other = fixedIndex + 1; other < fixed.length; other += 1) {
        if (fixedElement.contains(fixed[other]) || fixed[other].contains(fixedElement)) continue;
        if (intersectionArea(fixedElement.getBoundingClientRect(), fixed[other].getBoundingClientRect()) > 16) {
          fixedCollisionCandidates.push(selectorFor(fixedElement) + ' ↔ ' + selectorFor(fixed[other]));
        }
      }
      focusable.forEach(function (control) {
        if (fixedElement === control || fixedElement.contains(control) || control.contains(fixedElement)) return;
        var controlRect = control.getBoundingClientRect();
        if (intersectionArea(fixedElement.getBoundingClientRect(), controlRect) > Math.min(200, controlRect.width * controlRect.height * 0.25)) {
          fixedControlOverlapCandidates.push(selectorFor(fixedElement) + ' ↔ ' + selectorFor(control));
        }
      });
    });

    var rootOverflowPx = Math.max(0, rootScrollWidth - viewportWidth);
    var hardFailures = [];
    if (rootOverflowPx > 1) hardFailures.push(label + ':root-horizontal-overflow');
    if (horizontalControlLeaks.length) hardFailures.push(label + ':unreachable-horizontal-controls');
    if (clippedControls.length) hardFailures.push(label + ':clipped-controls');
    if (coveredVisibleControls.length) hardFailures.push(label + ':covered-visible-controls');
    if (verticalUnreachable.length) hardFailures.push(label + ':vertically-unreachable-controls');
    if (localScrollLeaks.length) hardFailures.push(label + ':uncontained-table-or-tab-scroll');
    if (overflowLeaks.length) hardFailures.push(label + ':uncontained-horizontal-overflow');

    return {
      label: label,
      path: win.location.pathname,
      title: doc.title,
      lang: doc.documentElement.lang || '',
      bccMobile: doc.documentElement.classList.contains('bcc-mobile'),
      viewportWidth: viewportWidth,
      viewportHeight: viewportHeight,
      rootScrollWidth: rootScrollWidth,
      rootScrollHeight: rootScrollHeight,
      rootOverflowPx: rootOverflowPx,
      hardFailures: hardFailures,
      horizontalControlLeaks: horizontalControlLeaks.slice(0, 20),
      clippedControls: clippedControls.slice(0, 20),
      coveredVisibleControls: coveredVisibleControls.slice(0, 20),
      verticallyUnreachableControls: verticalUnreachable.slice(0, 20),
      uncontainedOverflow: overflowLeaks.slice(0, 20),
      localScrollLeaks: localScrollLeaks.slice(0, 20),
      tapFloorCandidates: tapFloor.slice(0, 20),
      fixedCollisionCandidates: fixedCollisionCandidates.slice(0, 20),
      fixedControlOverlapCandidates: fixedControlOverlapCandidates.slice(0, 20)
    };
  }

  function blockingOverlays(doc) {
    var width = doc.documentElement.clientWidth;
    var height = doc.documentElement.clientHeight;
    return Array.from(doc.querySelectorAll('[role="dialog"],.modal,.overlay,.sheet,.drawer,#moduleLoadError')).filter(visible).filter(function (element) {
      if (element.id === 'moduleScreen') return false;
      var rect = element.getBoundingClientRect();
      return rect.width > width * 0.65 && rect.height > height * 0.45;
    }).map(selectorFor).slice(0, 20);
  }

  function readinessFor(item, nestedFrame, fontState) {
    var shellWindow = frame.contentWindow;
    var shellDocument = frame.contentDocument;
    var checks = [];
    function add(name, pass, observed) { checks.push({ name: name, pass: Boolean(pass), observed: observed }); }
    add('shell-path', shellWindow.location.pathname === '/app/index.html', shellWindow.location.pathname);
    add('outer-width', Math.abs(shellWindow.innerWidth - item.width) <= 1, shellWindow.innerWidth);
    add('outer-height', Math.abs(shellWindow.innerHeight - item.height) <= 1, shellWindow.innerHeight);
    add('shell-ui-mode', shellDocument.documentElement.classList.contains('bcc-mobile') === (item.uiMode === 'mobile'), shellDocument.documentElement.className);
    add('language-storage', localStorage.getItem('saagar_lang') === item.language, localStorage.getItem('saagar_lang'));
    add('shell-fonts', !fontState.shell.timedOut && fontState.shell.status !== 'loading', fontState.shell);
    add('blocking-shell-overlays', blockingOverlays(shellDocument).length === 0, blockingOverlays(shellDocument));

    if (item.kind === 'module') {
      var nestedWindow = nestedFrame && nestedFrame.contentWindow;
      var nestedDocument = nestedFrame && nestedFrame.contentDocument;
      var expectedPath = '/app/modules/' + item.surface + '/index.html';
      add('active-module', shellWindow.activeModuleId === item.surface, shellWindow.activeModuleId || '');
      add('module-screen-visible', visible(shellDocument.getElementById('moduleScreen')), selectorFor(shellDocument.getElementById('moduleScreen')));
      add('module-loader-hidden', !visible(shellDocument.getElementById('loader')), shellDocument.getElementById('loader') && shellDocument.getElementById('loader').className);
      add('module-path', Boolean(nestedWindow) && nestedWindow.location.pathname === expectedPath, nestedWindow && nestedWindow.location.pathname);
      add('module-ui-mode', Boolean(nestedDocument) && nestedDocument.documentElement.classList.contains('bcc-mobile') === (item.uiMode === 'mobile'), nestedDocument && nestedDocument.documentElement.className);
      add('module-fonts', fontState.module && !fontState.module.timedOut && fontState.module.status !== 'loading', fontState.module);
    } else if (item.surface === 'shell-home') {
      add('home-surface', shellWindow.activeView === 'home', shellWindow.activeView);
    } else {
      var home = shellDocument.getElementById('settingsHome');
      var detail = shellDocument.getElementById('settingsDetail');
      add('settings-view', shellWindow.activeView === 'config', shellWindow.activeView);
      if (item.surface === 'settings-home') {
        add('settings-home-visible', visible(home), visible(home));
        add('settings-detail-state', item.uiMode === 'desktop' ? visible(detail) : !visible(detail), visible(detail));
      } else {
        add('settings-detail-visible', visible(detail), visible(detail));
        add('settings-home-state', item.uiMode === 'desktop' ? visible(home) : !visible(home), visible(home));
      }
    }
    return { passed: checks.every(function (check) { return check.pass; }), checks: checks };
  }

  function runGeometry(token) {
    var item = currentCase();
    if (token !== loadSequence) throw new Error('Stale geometry request');
    var shellDocument = frame.contentDocument;
    var nestedFrame = item.kind === 'module' ? shellDocument.getElementById('moduleFrame') : null;
    var outer = collectGeometry(shellDocument, 'shell');
    var moduleGeometry = nestedFrame && nestedFrame.contentDocument ? collectGeometry(nestedFrame.contentDocument, item.surface) : null;
    var settingsFailures = [];
    if (item.surface === 'settings-home' || item.surface === 'settings-detail') {
      activeReadiness.checks.filter(function (check) { return check.name.startsWith('settings-') && !check.pass; }).forEach(function (check) {
        settingsFailures.push('shell:' + check.name);
      });
    }
    var result = {
      capturedAt: new Date().toISOString(),
      loadToken: token,
      caseId: item.id,
      advisoryOnly: true,
      readiness: activeReadiness,
      outer: outer,
      module: moduleGeometry,
      hardFailures: outer.hardFailures.concat(moduleGeometry ? moduleGeometry.hardFailures : [], settingsFailures),
      warningCount: outer.tapFloorCandidates.length + outer.fixedCollisionCandidates.length + outer.fixedControlOverlapCandidates.length +
        (moduleGeometry ? moduleGeometry.tapFloorCandidates.length + moduleGeometry.fixedCollisionCandidates.length + moduleGeometry.fixedControlOverlapCandidates.length : 0)
    };
    currentReview().geometry = result;
    persistState();
    renderGeometry(result);
    return result;
  }

  function renderGeometry(result) {
    if (!result) {
      setPill(byId('geometryState'), 'Not run', '');
      byId('geometryOutput').textContent = 'Waiting for the current case to load and settle.';
      return;
    }
    var failures = result.hardFailures || [];
    setPill(byId('geometryState'), failures.length ? failures.length + ' hard finding(s)' : (result.warningCount ? 'Review warnings' : 'No hard finding'), failures.length ? 'bad' : (result.warningCount ? 'warn' : 'good'));
    byId('geometryOutput').textContent = JSON.stringify(result, null, 2);
  }

  async function loadCase(index) {
    currentIndex = (index + cases.length) % cases.length;
    var token = ++loadSequence;
    activeReadyCaseId = '';
    activeReadiness = null;
    persistState();
    var item = currentCase();
    var review = currentReview();
    byId('caseSelect').value = item.id;
    byId('surfaceFact').textContent = item.surface;
    byId('viewportFact').textContent = item.width + ' × ' + item.height;
    byId('modeFact').textContent = item.uiMode;
    byId('languageFact').textContent = item.language;
    byId('caseTitle').textContent = item.surface + ' · ' + item.viewportId + ' · ' + item.language;
    byId('frameStage').style.width = item.width + 'px';
    byId('frameStage').style.height = item.height + 'px';
    updateReviewControls();
    renderGeometry(review.geometry);
    setPill(byId('loadState'), 'Loading shell', 'warn');

    try { prepareOrigin(item); }
    catch (error) {
      setPill(byId('loadState'), 'Origin setup failed', 'bad');
      byId('geometryOutput').textContent = String(error && error.stack || error);
      return;
    }

    frame.onload = async function () {
      try {
        if (token !== loadSequence || currentCase().id !== item.id) return;
        disableMotion(frame.contentDocument);
        setPill(byId('loadState'), item.kind === 'module' ? 'Opening module' : 'Preparing surface', 'warn');
        var nestedFrame = await prepareSurface(item, token);
        var fontState = {
          shell: await waitForFonts(frame.contentDocument),
          module: nestedFrame ? await waitForFonts(nestedFrame.contentDocument) : null
        };
        await delay(2100);
        await nextPaint(frame.contentWindow);
        if (nestedFrame) await nextPaint(nestedFrame.contentWindow);
        if (token !== loadSequence || currentCase().id !== item.id) return;
        activeReadiness = readinessFor(item, nestedFrame, fontState);
        activeReadyCaseId = activeReadiness.passed ? item.id : '';
        runGeometry(token);
        setPill(byId('loadState'), activeReadiness.passed ? 'Ready for manual review' : 'Readiness failed', activeReadiness.passed ? 'good' : 'bad');
      } catch (error) {
        if (token !== loadSequence) return;
        setPill(byId('loadState'), 'Case setup failed', 'bad');
        byId('geometryOutput').textContent = String(error && error.stack || error);
      }
    };
    frame.src = item.src + '?mah3_case=' + encodeURIComponent(item.id) + '&cache=' + Date.now();
  }

  function evidenceRows() {
    return cases.map(function (item) {
      var review = reviews[item.id] || { status: 'not-run', evidenceRef: '', note: '', geometry: null };
      return Object.assign({}, item, {
        manualStatus: review.status,
        evidenceRef: String(review.evidenceRef || '').slice(0, 200),
        note: String(review.note || '').slice(0, 500),
        geometry: review.geometry || null
      });
    });
  }

  function evidenceDocument() {
    var rows = evidenceRows();
    var missingReview = rows.filter(function (row) { return row.manualStatus === 'not-run'; });
    var missingGeometry = rows.filter(function (row) { return !row.geometry; });
    var missingEvidence = rows.filter(function (row) { return row.manualStatus !== 'not-run' && !row.evidenceRef.trim(); });
    var undocumented = rows.filter(function (row) { return (row.manualStatus === 'defect' || row.manualStatus === 'deferred') && !row.note.trim(); });
    var readinessFailures = rows.filter(function (row) { return row.geometry && row.geometry.readiness && !row.geometry.readiness.passed; });
    var hardGeometry = rows.reduce(function (count, row) { return count + (row.geometry && row.geometry.hardFailures ? row.geometry.hardFailures.length : 0); }, 0);
    var defects = rows.filter(function (row) { return row.manualStatus === 'defect'; }).length;
    var deferred = rows.filter(function (row) { return row.manualStatus === 'deferred'; }).length;
    var captureComplete = Boolean(reviewerId.trim()) && !missingReview.length && !missingGeometry.length && !missingEvidence.length && !undocumented.length;
    var visualBaselinePassed = captureComplete && defects === 0 && deferred === 0 && readinessFailures.length === 0 && hardGeometry === 0;
    var identity = stateIdentity();
    return {
      schemaVersion: 1,
      evidenceId: 'mah3-visual-review-' + new Date().toISOString().replace(/[:.]/g, '-'),
      profileId: identity.profileId,
      profileSha256: identity.profileSha256,
      sourceTreeSha256: identity.sourceTreeSha256,
      runnerTreeSha256: identity.runnerTreeSha256,
      reviewerId: reviewerId.trim(),
      generatedAt: new Date().toISOString(),
      environment: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        locale: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        devicePixelRatio: window.devicePixelRatio,
        visualViewportScale: window.visualViewport ? window.visualViewport.scale : null,
        selectedDate: model.profile.matrix.selectedDate,
        textSize: model.profile.matrix.textSize,
        seedProfile: model.profile.matrix.seedProfile,
        animations: model.profile.matrix.animations
      },
      summary: {
        totalCases: rows.length,
        manuallyReviewedCases: rows.length - missingReview.length,
        missingGeometry: missingGeometry.length,
        missingEvidenceReferences: missingEvidence.length,
        defects: defects,
        deferred: deferred,
        undocumentedIssueCases: undocumented.length,
        readinessFailures: readinessFailures.length,
        hardGeometryFindings: hardGeometry,
        captureComplete: captureComplete,
        visualBaselinePassed: visualBaselinePassed,
        refactorGateReady: visualBaselinePassed
      },
      coverageLimits: {
        class: model.profile.matrix.coverageClass,
        allModuleReviewStatesCovered: false,
        planningCanaryFixtureCovered: true
      },
      acceptanceLimits: {
        physicalDeviceAccepted: false,
        nativeLanguageAccepted: false,
        productionAccepted: false
      },
      cases: rows
    };
  }

  function downloadEvidence(evidence) {
    var blob = new Blob([JSON.stringify(evidence, null, 2) + '\n'], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = evidence.evidenceId + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function importEvidenceFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var evidence = JSON.parse(String(reader.result || ''));
        if (!sameIdentity(evidence) || evidence.schemaVersion !== 1 || !Array.isArray(evidence.cases)) throw new Error('Evidence identity does not match this exact profile/source/runner');
        var expectedIds = cases.map(function (item) { return item.id; });
        if (evidence.cases.length !== expectedIds.length || evidence.cases.some(function (item, index) { return item.id !== expectedIds[index]; })) throw new Error('Evidence case matrix does not match');
        var imported = Object.create(null);
        evidence.cases.forEach(function (item) {
          var status = ALLOWED_STATUS.includes(item.manualStatus) ? item.manualStatus : 'not-run';
          imported[item.id] = {
            status: status,
            evidenceRef: String(item.evidenceRef || '').slice(0, 200),
            note: String(item.note || '').slice(0, 500),
            geometry: item.geometry && item.geometry.caseId === item.id ? item.geometry : null
          };
        });
        reviews = imported;
        reviewerId = String(evidence.reviewerId || '').slice(0, 100);
        persistState();
        updateReviewControls();
        loadCase(currentIndex);
      } catch (error) {
        alert('Import rejected: ' + String(error && error.message || error));
      }
    };
    reader.readAsText(file);
  }

  function bindControls() {
    byId('caseSelect').addEventListener('change', function (event) { loadCase(cases.findIndex(function (item) { return item.id === event.target.value; })); });
    byId('previousCase').addEventListener('click', function () { loadCase(currentIndex - 1); });
    byId('nextCase').addEventListener('click', function () { loadCase(currentIndex + 1); });
    byId('rerunGeometry').addEventListener('click', function () {
      try {
        if (activeReadyCaseId !== currentCase().id) throw new Error('Current case is not readiness-green');
        runGeometry(loadSequence);
      } catch (error) { alert(String(error && error.message || error)); }
    });
    byId('exportEvidence').addEventListener('click', function () { downloadEvidence(evidenceDocument()); });
    byId('importEvidence').addEventListener('click', function () { byId('importFile').click(); });
    byId('importFile').addEventListener('change', function (event) { if (event.target.files && event.target.files[0]) importEvidenceFile(event.target.files[0]); event.target.value = ''; });
    byId('reviewerId').addEventListener('input', function (event) { reviewerId = event.target.value.slice(0, 100); persistState(); });
    byId('evidenceRef').addEventListener('input', function (event) { currentReview().evidenceRef = event.target.value.slice(0, 200); persistState(); });
    byId('reviewNote').addEventListener('input', function (event) { currentReview().note = event.target.value.slice(0, 500); persistState(); });
    document.querySelectorAll('[data-status]').forEach(function (button) {
      button.addEventListener('click', function () {
        var status = button.dataset.status;
        var review = currentReview();
        if (status !== 'not-run' && activeReadyCaseId !== currentCase().id) { alert('Wait for this exact case to become readiness-green before reviewing it.'); return; }
        if (status !== 'not-run' && !review.evidenceRef.trim()) { alert('Add an evidence or screenshot reference before marking this case.'); return; }
        if ((status === 'defect' || status === 'deferred') && !review.note.trim()) { alert('Add a generic review note before marking a defect or deferral.'); return; }
        review.status = status;
        persistState();
        updateReviewControls();
      });
    });
  }

  async function start() {
    var response = await fetch('/profile.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Baseline profile request failed: ' + response.status);
    model = await response.json();
    cases = model.cases;
    if (!Array.isArray(cases) || cases.length !== 168) throw new Error('Evidence matrix is incomplete');
    byId('identity').textContent = model.profile.profileId + ' · profile ' + model.profileSha256.slice(0, 12) + '… · www ' + model.fingerprint.treeSha256.slice(0, 12) + '… · runner ' + model.runnerFingerprint.treeSha256.slice(0, 12) + '…';
    cases.forEach(function (item, index) {
      var option = document.createElement('option');
      option.value = item.id;
      option.textContent = String(index + 1).padStart(3, '0') + ' · ' + item.surface + ' · ' + item.viewportId + ' · ' + item.language;
      byId('caseSelect').appendChild(option);
    });
    restoreState();
    bindControls();
    updateSummary();
    loadCase(currentIndex);
  }

  start().catch(function (error) {
    setPill(byId('loadState'), 'Runner failed', 'bad');
    byId('geometryOutput').textContent = String(error && error.stack || error);
  });
})();
