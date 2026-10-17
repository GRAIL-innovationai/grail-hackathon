/* ============================================================
   Mathub — the interface in English, Español and Русский (French, Italian, Portuguese and German are on the way).
   Loaded in <head> right after boot.js. The language is the one picked (Settings, the page footer, the welcome
   page), else the browser's first language that Mathub has, else English. For any language but English, its
   dictionary (assets/i18n/<lang>.js, built from i18n/<lang>.tsv by scripts/build-i18n.js) loads before the page,
   and the interface is shown in it as it is drawn: the text, the words in title, aria-label, placeholder and alt,
   confirm() / prompt() / alert(), the tab's title, dates and numbers. The code itself stays in English, so nothing
   it does changes with the language.
   Left as they are: course material (notes, questions, flashcards: the class's own language), what people write,
   what Bo says (he answers in the student's language), code and math.
   - An entry with {1}, {2} is a pattern: "{1} questions left" fits "12 questions left"; a value that is itself an
     entry is translated too ("Exam {1} is {2}" with "tomorrow").
   - {1|вопрос|вопроса|вопросов} picks the plural for the number in {1} (Intl.PluralRules: one, few, many, other);
     {1?días:día} is the first when the English had something in {1} (a plural "s"), else the second; {1|} leaves it out.
   - Text that fits no entry is tried in parts, at " · " (a title like "Quizzer · Mathub").
   - MathubI18n.t('…', a, b) (App.t) for words that never reach the page; MathubI18n.set('de') switches (and reloads).
   ============================================================ */
(function (global) {
  'use strict';
  // French, Italian, Portuguese and German are partly translated (i18n/fr.tsv …) and join the list when they are done
  var LANGS = [['en', 'English'], ['es', 'Español'], ['ru', 'Русский']];
  var CODES = LANGS.map(function (l) { return l[0]; });
  var KEY = 'studyhub-settings'; var html = document.documentElement;
  function stored() { try { var s = JSON.parse(localStorage.getItem(KEY) || '{}'); return s && s.lang; } catch (e) { return null; } }
  function pick() {
    var q = /[?&]lang=([a-z]{2,3})\b/.exec(location.search); if (q && (CODES.indexOf(q[1]) >= 0 || q[1] === 'qps')) return q[1];   // a link to the site in a language (qps: the test language of scripts/build-i18n.js --pseudo)
    var s = stored(); if (s && CODES.indexOf(s) >= 0) return s;
    var nav = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
    for (var i = 0; i < nav.length; i++) { var c = String(nav[i] || '').slice(0, 2).toLowerCase(); if (CODES.indexOf(c) >= 0) return c; }
    return 'en';
  }
  var lang = pick(); html.setAttribute('lang', lang); global.MATHUB_LANG = lang;

  var exact = Object.create(null), pats = [], byWord = Object.create(null), loose = [], ready = false;
  var ORDER = { ru: ['one', 'few', 'many', 'other'] }; var PR = null; try { PR = new Intl.PluralRules(lang); } catch (e) {}
  var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  var I = global.MathubI18n = {
    lang: lang, langs: LANGS, codes: CODES,
    name: function (c) { for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === c) return LANGS[i][1]; return c; },
    /* a dictionary arrives (assets/i18n/<lang>.js calls this) */
    add: function (code, dict) {
      if (code !== lang) return;
      Object.keys(dict).forEach(function (k) {
        var v = dict[k]; if (typeof v !== 'string' || !v) return;
        if (!/\{\d+\}/.test(k)) { exact[k] = v; return; }
        var parts = k.split(/\{(\d+)\}/), re = '^', lit = '', nums = [];
        for (var i = 0; i < parts.length; i++) { if (i % 2) { re += '(.*?)'; nums.push(+parts[i]); } else { re += esc(parts[i]); lit += parts[i]; } }
        var p = { re: new RegExp(re + '$'), v: v, nums: nums, len: lit.length, key: k }; pats.push(p);
        var words = lit.match(/[A-Za-z][A-Za-z'’]{2,}/g);
        if (!words) { loose.push(p); return; }
        var w = words.sort(function (a, b) { return b.length - a.length; })[0].toLowerCase(); (byWord[w] = byWord[w] || []).push(p);
      });
      Object.keys(byWord).forEach(function (w) { byWord[w].sort(function (a, b) { return b.len - a.len; }); }); loose.sort(function (a, b) { return b.len - a.len; });
      ready = true; start();
    },
    t: function (s) { var a = [].slice.call(arguments, 1); if (!ready || s == null) return a.length ? fillEn(String(s), a) : s; var key = String(s);
      if (a.length) { var v = exact[key]; if (v == null) for (var i = 0; i < pats.length; i++) if (pats[i].key === key) { v = pats[i].v; break; } return v == null ? fillEn(key, a) : fill(v, [null].concat(a.map(String)), 0); }
      var r = tr(norm(key), 0); return r == null ? s : r; },
    // the newest change to the preferences, so the account takes it (assets/auth.js sends it on the next page)
    set: function (code) { if (CODES.indexOf(code) < 0) return; try { var s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; s.lang = code; s.prefsUpdated = Date.now(); localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} if (code !== lang) location.reload(); },
    translate: function (root) { if (ready) walk(root || document.body); }
  };
  function fillEn(s, a) { return s.replace(/\{(\d+)\}/g, function (m, n) { return a[n - 1] != null ? a[n - 1] : m; }); }
  var norm = function (s) { return String(s).replace(/[\s ]+/g, ' ').trim(); };

  /* one piece of text in the language, or null */
  function tr(s, depth) {
    if (!s || !/[A-Za-z]/.test(s)) return null;
    var v = exact[s]; if (v != null) return v;
    var c = s.slice(-1); if (c === ':' && exact[s.slice(0, -1)] != null) return exact[s.slice(0, -1)] + (lang === 'fr' ? ' :' : ':');
    var seen = [], words = s.match(/[A-Za-z][A-Za-z'’]{2,}/g) || [];
    for (var i = 0; i < words.length; i++) { var l = byWord[words[i].toLowerCase()]; if (l && seen.indexOf(l) < 0) { seen.push(l); var r = tryAll(l, s, depth); if (r != null) return r; } }
    var r2 = tryAll(loose, s, depth); if (r2 != null) return r2;
    if (depth < 1 && s.indexOf(' · ') > 0) {   // a title or a line of facts: in parts
      var parts = s.split(' · '), any = false; var out = parts.map(function (p) { var t = tr(p, depth + 1); if (t != null) any = true; return t != null ? t : p; });
      if (any) return out.join(' · ');
    }
    return null;
  }
  function tryAll(list, s, depth) { for (var i = 0; i < list.length; i++) { var m = list[i].re.exec(s); if (m) return fill(list[i].v, m, depth); } return null; }
  function fill(tpl, m, depth) {
    return tpl.replace(/\{(\d+)(?:\|([^}]*)|\?([^:}]*):([^}]*))?\}/g, function (all, n, forms, yes, no) {
      var val = m[+n]; if (val == null) return all;
      if (forms != null) return plural(val, forms.split('|'));
      if (yes != null) return val.trim() ? yes : no;   // {1?días:día}: the English had a plural "s" (or a part) there, or not
      var t = val.trim(); if (depth < 2 && t && /[A-Za-z]/.test(t)) { var x = tr(t, depth + 1); if (x != null) return val.replace(t, x); }
      return val;
    });
  }
  function plural(val, forms) {
    var num = parseFloat(String(val).replace(/[^\d.\-]/g, '')); if (!isFinite(num)) num = 0;
    var cat = PR ? PR.select(num) : (num === 1 ? 'one' : 'other'); var order = ORDER[lang] || ['one', 'other'];
    var k = order.indexOf(cat); if (k < 0) k = order.indexOf('other'); if (k < 0 || k >= forms.length) k = forms.length - 1;
    return forms[k];
  }

  /* ---------- the page ---------- */
  var ATTRS = ['title', 'aria-label', 'placeholder', 'alt', 'aria-description', 'aria-roledescription', 'data-tip'];
  var SKIP = 'script,style,noscript,code,pre,textarea,kbd,samp,svg,math,mjx-container,[translate="no"],.notranslate,.bo-text,.bf-say,.bb-items,.fa-body,.fa-c-body,.ann-body,.inbox-body,[contenteditable="true"]';
  var done = new WeakMap();   // node → the text we last gave it (so our own change is not translated again)
  function doText(n) {
    var raw = n.nodeValue; if (!raw || done.get(n) === raw) return;
    var key = norm(raw); var t = key && key.length < 2000 ? tr(key, 0) : null;
    if (t != null && t !== key) { var lead = /^\s*/.exec(raw)[0], trail = /\s*$/.exec(raw)[0]; var out = lead + t + trail; done.set(n, out); n.nodeValue = out; }
    else done.set(n, raw);
  }
  function doAttrs(el) {
    if (!el.hasAttribute) return; var mem = done.get(el);
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i]; var v = el.getAttribute(a); if (!v || (mem && mem[a] === v)) continue;
      var t = tr(norm(v), 0); mem = mem || {}; if (t != null && t !== v) { mem[a] = t; el.setAttribute(a, t); } else mem[a] = v;
    }
    if (mem) done.set(el, mem);
    if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) && el.value) { var tv = tr(norm(el.value), 0); if (tv != null) el.value = tv; }
  }
  var skipped = function (el) { return el && el.closest && !!el.closest(SKIP); };
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!skipped(root.parentElement)) doText(root); return; }
    if (root.nodeType !== 1 || skipped(root)) return;
    doAttrs(root);
    var w = document.createTreeWalker(root, 5, { acceptNode: function (n) { return n.nodeType === 1 && n.matches(SKIP) ? 2 : 1; } });   // 5: elements and text; 2: leave out the subtree
    var n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  var watching = false;
  function start() {   // as soon as the dictionary is here: what is on the page, then everything added or changed after
    if (!ready || watching) return; watching = true;
    walk(document.head && document.head.querySelector('title')); if (document.body) walk(document.body);
    new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (r.type === 'childList') { for (var j = 0; j < r.addedNodes.length; j++) { var a = r.addedNodes[j]; if (a.nodeType === 3) { if (!skipped(a.parentElement)) doText(a); } else walk(a); } }
        else if (r.type === 'characterData') { if (!skipped(r.target.parentElement)) doText(r.target); }
        else if (r.type === 'attributes') { if (!skipped(r.target)) doAttrs(r.target); }
      }
    }).observe(html, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(['value']) });
  }

  /* dialogs, dates and numbers in the language too */
  if (lang !== 'en') {
    ['alert', 'confirm', 'prompt'].forEach(function (fn) { var f = global[fn]; if (typeof f !== 'function') return; global[fn] = function (msg) { var a = [].slice.call(arguments); if (typeof msg === 'string') a[0] = I.t(msg); return f.apply(global, a); }; });
    var isEn = function (l) { return l == null || l === 'en-US' || l === 'en' || (Array.isArray(l) && (!l.length || l[0] === 'en-US')); };
    var D = Date.prototype; [['toLocaleDateString'], ['toLocaleTimeString'], ['toLocaleString']].forEach(function (x) { var f = D[x[0]]; D[x[0]] = function (l, o) { return f.call(this, isEn(l) ? lang : l, o); }; });
    var nf = Number.prototype.toLocaleString; Number.prototype.toLocaleString = function (l, o) { return nf.call(this, isEn(l) ? lang : l, o); };
    // the dictionary, before the page is drawn (a script written into the page while it loads runs before the next one)
    document.write('<script src="assets/i18n/' + lang + '.js?v=' + encodeURIComponent(global.MATHUB_BUILD || '') + '"><\/script>');
    document.addEventListener('DOMContentLoaded', function () { if (ready) walk(document.body); });
  }
  // the picker at the foot of the page (index.html)
  document.addEventListener('DOMContentLoaded', function () { var p = document.getElementById('lang-pick'); if (!p) return; p.value = CODES.indexOf(lang) >= 0 ? lang : 'en'; p.addEventListener('change', function () { I.set(p.value); }); });
})(window);
