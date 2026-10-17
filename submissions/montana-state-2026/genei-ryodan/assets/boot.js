/* ============================================================
   Mathub — first script on the page (loaded in <head>, before the styles paint).
   Kept in a file instead of inline so the Content-Security-Policy can forbid inline scripts.
   1. build id, theme and motion attributes before first paint (no flash of the wrong theme)
   2. MathJax configuration (MathJax itself loads from jsDelivr, pinned to 3.2.2)
   3. error reporting: uncaught errors go to the account server so they are fixed before students report them
   4. offline support: registers the service worker
   ============================================================ */
(function () {
  'use strict';
  var html = document.documentElement;
  window.MATHUB_BUILD = html.getAttribute('data-build') || 'dev';
  window.Courses = window.Courses || {};
  try {
    var s = JSON.parse(localStorage.getItem('studyhub-settings') || '{}');
    if (s.theme && s.theme !== 'system') html.setAttribute('data-theme', s.theme);
    var skin = s.skin || 'default'; if (skin !== 'default') html.setAttribute('data-skin', skin);
    html.setAttribute('data-motion', s.motion === 'off' ? 'off' : 'on');
    html.setAttribute('data-geek', s.geek !== true || s.motion === 'off' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'off' : 'on');
  } catch (e) {}
  window.MathJax = {
    tex: { inlineMath: [['$', '$'], ['\\(', '\\)']], displayMath: [['$$', '$$'], ['\\[', '\\]']], processEscapes: true },
    svg: { fontCache: 'global' },
    startup: { typeset: false },
    options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'input', 'select', 'option'] }
  };

  /* Error reporting. Sends only the message, the file and line, the first lines of the stack, the page (#/calc/notes, no query)
     and the build: no names, no answers, no account id. At most 8 different errors per page load. */
  var sent = 0, seen = {};
  var NOISE = /^Script error\.?$|ResizeObserver loop|Failed to fetch|NetworkError|Load failed|AbortError|The operation was aborted|cancelled|Non-Error promise rejection/i;
  function report(message, source, line, stack) {
    try {
      message = String(message || '').slice(0, 300);
      if (!message || NOISE.test(message) || sent >= 8 || !/^https?:$/.test(location.protocol) || navigator.onLine === false) return;
      if (source && source.indexOf(location.origin) !== 0) return;   // browser extensions and other sites are not ours to fix
      var key = message + '|' + source + '|' + line; if (seen[key]) return; seen[key] = 1; sent++;
      fetch('api/index.php?r=client_error', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'X-Requested-With': 'MatHub', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message, source: source || '', line: line || 0, stack: String(stack || '').slice(0, 1200), view: location.hash.split('?')[0], build: window.MATHUB_BUILD }) }).catch(function () {});
    } catch (e) {}
  }
  window.addEventListener('error', function (e) { if (e.target && e.target !== window) return; report(e.message, e.filename, e.lineno, e.error && e.error.stack); });
  window.addEventListener('unhandledrejection', function (e) { var r = e.reason; report(r && r.message ? r.message : String(r), '', 0, r && r.stack); });

  // Offline support: the service worker caches the site so notes, formulas, flashcards and tools open without a connection.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js?v=' + window.MATHUB_BUILD).then(function (reg) {
        reg.addEventListener('updatefound', function () { var nw = reg.installing; if (!nw) return; nw.addEventListener('statechange', function () { if (nw.state === 'installed' && navigator.serviceWorker.controller && window.App && window.App.toast) window.App.toast('Mathub was updated. Reload to get the newest version.', 6000); }); });
      }).catch(function () {});
    });
  }
})();
