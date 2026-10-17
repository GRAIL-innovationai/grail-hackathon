/* ============================================================
   Mathub app — the bridge to the phone (loaded only in the iOS and Android apps, right after boot.js)
   The app ships the whole site inside it and runs offline. This file:
   - marks the page as the app (<html data-app="ios" or "android">, window.MATHUB_APP)
   - sends the site's account calls (api/index.php) to https://mathub.space; Capacitor's
     native HTTP carries them, so the session cookie lives in the app, not in a browser
   - points the Python playground at the copy of Pyodide inside the app (no code is downloaded)
   - opens links to other sites in an in-app Safari sheet instead of replacing the app
   - window.Native: haptics, clipboard, share sheet, files in the app's own folder,
     local notifications, the status bar; each falls back to the web version off the phone
   Nothing here runs on mathub.space: the website's index.html never loads it.
   ============================================================ */
(function () {
  'use strict';
  var C = window.Capacitor;
  var native = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
  var platform = native && C.getPlatform ? C.getPlatform() : 'web';
  var API_BASE = 'https://mathub.space/';
  var html = document.documentElement;
  window.MATHUB_APP = { native: native, platform: platform, api: API_BASE, version: html.getAttribute('data-app-version') || '1.0' };
  html.setAttribute('data-app', platform);
  window.PYODIDE_URL = 'assets/pyodide/';

  /* ---------- account calls go to the server ---------- */
  var toServer = function (u) {
    if (typeof u !== 'string') return u;
    if (/^\/?api\//.test(u)) return API_BASE + u.replace(/^\//, '');
    if (u.indexOf(location.origin + '/api/') === 0) return API_BASE + u.slice(location.origin.length + 1);
    return u;
  };
  var webFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === 'string') input = toServer(input);
    else if (input && typeof Request !== 'undefined' && input instanceof Request) { var to = toServer(input.url); if (to !== input.url) input = new Request(to, input); }
    return webFetch.call(this, input, init);
  };
  var xopen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) { var a = Array.prototype.slice.call(arguments); a[1] = toServer(url); return xopen.apply(this, a); };

  /* ---------- plugins ---------- */
  var plugin = function (name) { if (!native) return null; try { return (C.Plugins && C.Plugins[name]) || (C.registerPlugin && C.registerPlugin(name)) || null; } catch (e) { return null; } };
  var P = {};
  ['Haptics', 'Clipboard', 'Share', 'Filesystem', 'LocalNotifications', 'Browser', 'StatusBar', 'SystemBars', 'App', 'SplashScreen', 'Keyboard', 'Purchases'].forEach(function (n) { P[n] = plugin(n); });
  var settings = function () { try { return JSON.parse(localStorage.getItem('studyhub-settings') || '{}'); } catch (e) { return {}; } };
  var reduceMotion = function () { return settings().motion === 'off' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };
  var DIR = 'DATA';   // the app's own Documents-like folder (Filesystem Directory.Data); nothing outside the app's container

  var Native = window.Native = {
    native: native,
    purchases: P.Purchases,   // RevenueCat (App Store and Google Play subscriptions); used by assets/app-native.js
    /* success | error | warning | light | medium | select */
    haptic: function (kind) {
      if (!P.Haptics || settings().haptics === false) return;
      try {
        if (kind === 'success' || kind === 'error' || kind === 'warning') P.Haptics.notification({ type: kind.toUpperCase() });
        else if (kind === 'select') P.Haptics.selectionChanged ? P.Haptics.selectionChanged() : P.Haptics.impact({ style: 'LIGHT' });
        else P.Haptics.impact({ style: kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
      } catch (e) {}
    },
    copy: function (text) {
      if (P.Clipboard) return P.Clipboard.write({ string: String(text) }).then(function () { return true; });
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(String(text)).then(function () { return true; });
      return Promise.reject(new Error('Copying is not available here.'));
    },
    paste: function () {
      if (P.Clipboard) return P.Clipboard.read().then(function (r) { return r && typeof r.value === 'string' ? r.value : ''; });
      if (navigator.clipboard && navigator.clipboard.readText) return navigator.clipboard.readText();
      return Promise.reject(new Error('Pasting is not available here. Press and hold in the box and choose Paste.'));
    },
    share: function (o) {
      if (P.Share) return P.Share.share({ title: o.title, text: o.text, url: o.url, dialogTitle: o.title });
      if (navigator.share) return navigator.share({ title: o.title, text: o.text, url: o.url });
      return Native.copy([o.text, o.url].filter(Boolean).join(' '));
    },
    /* writes a text file to the app's cache folder and opens the share sheet with it */
    shareFile: function (name, text, title) {
      if (P.Filesystem && P.Share) {
        return P.Filesystem.writeFile({ path: 'share/' + name, data: text, directory: 'CACHE', encoding: 'utf8', recursive: true })
          .then(function (r) { return P.Share.share({ title: title || name, files: [r.uri], dialogTitle: title || name }); });
      }
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); return Promise.resolve();
    },
    /* files in the app's own data folder (classes you made); in a browser, localStorage stands in */
    fs: {
      read: function (path) {
        if (P.Filesystem) return P.Filesystem.readFile({ path: path, directory: DIR, encoding: 'utf8' }).then(function (r) { return r.data; });
        var v = null; try { v = localStorage.getItem('mh-file:' + path); } catch (e) {}
        return v == null ? Promise.reject(new Error('File not found.')) : Promise.resolve(v);
      },
      write: function (path, text) {
        if (P.Filesystem) return P.Filesystem.writeFile({ path: path, data: text, directory: DIR, encoding: 'utf8', recursive: true }).then(function () { return true; });
        try { localStorage.setItem('mh-file:' + path, text); return Promise.resolve(true); } catch (e) { return Promise.reject(new Error('There is no room left to save this class.')); }
      },
      remove: function (path) {
        if (P.Filesystem) return P.Filesystem.deleteFile({ path: path, directory: DIR }).catch(function () {});
        try { localStorage.removeItem('mh-file:' + path); } catch (e) {} return Promise.resolve();
      },
      list: function (dir) {
        if (P.Filesystem) return P.Filesystem.readdir({ path: dir, directory: DIR }).then(function (r) { return (r.files || []).map(function (f) { return typeof f === 'string' ? f : f.name; }); }).catch(function () { return []; });
        var out = []; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf('mh-file:' + dir + '/') === 0) out.push(k.slice(('mh-file:' + dir + '/').length)); } } catch (e) {}
        return Promise.resolve(out);
      }
    },
    /* local notifications: only after the student turns reminders on, and only when they allow it */
    notify: {
      available: function () { return !!P.LocalNotifications; },
      permission: function () { return P.LocalNotifications ? P.LocalNotifications.checkPermissions().then(function (r) { return r.display; }) : Promise.resolve('denied'); },
      request: function () { return P.LocalNotifications ? P.LocalNotifications.requestPermissions().then(function (r) { return r.display; }) : Promise.resolve('denied'); },
      /* Android: reminders go in their own channel (named in the system settings) and are inexact, so the app needs no
         exact-alarm permission, which Google Play keeps for alarm-clock and calendar apps; a few minutes either way is fine */
      schedule: function (list) {
        if (!P.LocalNotifications || !list.length) return Promise.resolve();
        if (platform !== 'android') return P.LocalNotifications.schedule({ notifications: list });
        var ch = P.LocalNotifications.createChannel ? P.LocalNotifications.createChannel({ id: 'reminders', name: 'Exam and study reminders', description: 'Exams coming up in your classes, and the daily study reminder you set.', importance: 3, visibility: 1, vibration: true }).catch(function () {}) : Promise.resolve();
        return ch.then(function () { return P.LocalNotifications.schedule({ notifications: list.map(function (n) { return Object.assign({}, n, { channelId: 'reminders', isExactNotification: false }); }) }); });
      },
      pending: function () { return P.LocalNotifications ? P.LocalNotifications.getPending().then(function (r) { return r.notifications || []; }) : Promise.resolve([]); },
      cancel: function (ids) { return P.LocalNotifications && ids.length ? P.LocalNotifications.cancel({ notifications: ids.map(function (id) { return { id: id }; }) }) : Promise.resolve(); },
      onTap: function (fn) { if (P.LocalNotifications) P.LocalNotifications.addListener('localNotificationActionPerformed', function (e) { fn((e && e.notification && e.notification.extra) || {}); }); }
    },
    open: function (url) {
      if (P.Browser) return P.Browser.open({ url: url, presentationStyle: 'popover' });
      window.open(url, '_blank', 'noopener'); return Promise.resolve();
    },
    /* the clock and battery icons: light on dark pages, dark on light ones (Android: both system bars, drawn edge to edge) */
    statusBar: function (dark) { var bars = platform === 'android' && P.SystemBars ? P.SystemBars : P.StatusBar; if (!bars) return; try { bars.setStyle({ style: dark ? 'DARK' : 'LIGHT' }); } catch (e) {} },
    onResume: function (fn) { if (P.App) P.App.addListener('resume', fn); },
    reduceMotion: reduceMotion
  };

  if (!native) return;

  /* ---------- links to other sites open in an in-app Safari sheet; the app stays where it was ---------- */
  var external = function (href) { try { var u = new URL(href, location.href); return /^https?:$/.test(u.protocol) && u.origin !== location.origin ? u.href : null; } catch (e) { return null; } };
  /* pages that exist only on the website (the static study guides, security.txt) */
  var webOnly = function (href) { var m = /^\/?((?:learn|\.well-known)\/[^#]*)$/.exec(href || ''); return m ? API_BASE + m[1] : null; };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null; if (!a || a.hasAttribute('download')) return;
    var href = a.getAttribute('href'); if (/^mailto:|^tel:/i.test(href)) return;   // the system handles these
    var to = external(href) || webOnly(href); if (!to) return;
    e.preventDefault(); Native.open(to);
  }, true);
  /* ---------- downloads: an app web view (iOS or Android) cannot save files, so a file the page makes goes to the share sheet
     (Save to Files, AirDrop, Mail...) and a file on the server opens in the Safari sheet, which can save it ---------- */
  var b64 = function (blob) { return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1] || ''); }; fr.onerror = rej; fr.readAsDataURL(blob); }); };
  var saveFile = function (href, name) {
    name = String(name || 'mathub-file').replace(/[\/\\:*?"<>|]+/g, '-').slice(0, 80) || 'mathub-file';
    if (!P.Filesystem || !P.Share) return;
    webFetch(href).then(function (r) { return r.blob(); }).then(b64)
      .then(function (data) { return P.Filesystem.writeFile({ path: 'share/' + name, data: data, directory: 'CACHE', recursive: true }); })
      .then(function (r) { return P.Share.share({ title: name, files: [r.uri], dialogTitle: name }); })
      .catch(function () {});
  };
  var aclick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    var href = this.getAttribute('href') || '';
    if (this.hasAttribute('download') && /^(blob|data):/.test(href)) { saveFile(href, this.getAttribute('download')); return; }
    return aclick.apply(this, arguments);
  };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[download]') : null; if (!a) return;
    var href = a.getAttribute('href') || '';
    if (/^(blob|data):/.test(href)) { e.preventDefault(); saveFile(href, a.getAttribute('download')); }
    else if (/^https?:/.test(href)) { e.preventDefault(); Native.open(href); }
  }, true);
  var wopen = window.open;
  window.open = function (url) { var to = url && external(url); if (to) { Native.open(to); return null; } return wopen.apply(window, arguments); };

  /* ---------- Android back button and back gesture: close what is open, then go back a page, then leave the app ---------- */
  if (platform === 'android' && P.App) P.App.addListener('backButton', function (e) {
    var modals = document.querySelectorAll('.modal-backdrop'); var top = modals[modals.length - 1];
    if (top) { var x = top.querySelector('[data-action="close"]'); if (x) x.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return; }
    var shell = document.querySelector('.app'); if (shell && shell.classList.contains('nav-open')) { shell.classList.remove('nav-open'); return; }
    var h = location.hash; if (h && h !== '#/' && h !== '#') { if (e && e.canGoBack) history.back(); else location.hash = '#/'; return; }
    if (P.App.minimizeApp) P.App.minimizeApp(); else if (P.App.exitApp) P.App.exitApp();
  });

  /* ---------- the strip behind the status bar (styled in app.css) ---------- */
  var strip = function () { if (document.body && !document.querySelector('.app-statusbar')) { var d = document.createElement('div'); d.className = 'app-statusbar'; d.setAttribute('aria-hidden', 'true'); document.body.insertBefore(d, document.body.firstChild); } };
  if (document.body) strip(); else document.addEventListener('DOMContentLoaded', strip);

  /* ---------- status bar follows the theme ---------- */
  var paintBar = function () { var t = html.getAttribute('data-theme'); var dark = t === 'dark' || (!t && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); Native.statusBar(dark); };
  paintBar(); new MutationObserver(paintBar).observe(html, { attributes: true, attributeFilter: ['data-theme'] });
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintBar);
})();
