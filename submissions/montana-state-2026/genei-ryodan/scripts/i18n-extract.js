#!/usr/bin/env node
/* ============================================================
   Mathub — the interface's words, for translating:  node scripts/i18n-extract.js
   Reads the interface scripts, index.html and the API's messages, and keeps every piece of text a student can see
   in i18n/catalog.json, each with a number that never changes (new words get new numbers; words no longer in the
   code are marked gone, not removed, so translations are never lost). Text is cut the way the browser sees it:
   at tags, with ${…} in a template as {1}, {2}… (an icon or other markup in between cuts it instead).
   Then: translate the new numbers in i18n/<lang>.tsv and run node scripts/build-i18n.js.
   Course material (notes, questions, flashcards, hints) is not the interface and stays in its own language.
   ============================================================ */
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..'); const OUT = path.join(ROOT, 'i18n', 'catalog.json');
// the interface; not the course material (*-data.js, *-quiz.js, ladders.js, courses-index.js), the admin panel, the apps' own files,
// class-pack checks (classpacks.js, for authors), What's new (changelog.js) or the legal text (policy.js: a note says it is in English)
const FILES = ['app.js', 'home.js', 'welcome.js', 'auth.js', 'tutor.js', 'bo-float.js', 'talk.js', 'create.js', 'forum.js', 'social.js', 'gami.js', 'quests.js', 'realm.js',
  'tools.js', 'utils.js', 'ambient.js', 'focus.js', 'today.js', 'planner.js', 'gpa.js', 'report.js', 'pwa.js', 'resources.js', 'requests.js', 'classpacks.js', 'readiness.js',
  'mistakes.js', 'cheatsheet.js', 'mynotes.js', 'blitz.js', 'recap.js', 'tour.js', 'motion.js', 'pixel.js', 'geek.js', 'lesson.js', 'reader.js', 'board-draw.js',
  'calc-tools.js', 'precalc-tools.js', 'physics-tools.js', 'phonetics.js', 'pylab.js', 'teach.js', 'boot.js'];
const ATTRS = /\b(?:aria-label|title|placeholder|alt|aria-description|aria-roledescription|data-tip)\s*=\s*"([^"]*)"/g;
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', middot: '·', mdash: '—', ndash: '–', times: '×', rarr: '→', larr: '←', copy: '©', deg: '°', minus: '−', le: '≤', ge: '≥' };
const decode = s => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] != null ? ENT[e] : m);
const norm = s => decode(s).replace(/[\s ]+/g, ' ').trim();

/* ---------- a small JavaScript reader: strings and templates (nested), past comments and regular expressions ---------- */
function lex(src) {
  const out = []; let i = 0; const n = src.length; let prev = '';
  const regexOK = () => !prev || !/[\w$)\]]$/.test(prev) || /^(return|typeof|case|in|of|delete|void|throw|new|else|do|yield|await)$/.test(prev);
  function tpl() {
    const quasis = [], exprs = []; let cur = '';
    while (i < n) {
      const c = src[i];
      if (c === '\\') { const e = src[i + 1]; cur += e === 'n' ? '\n' : e === 'u' ? String.fromCharCode(parseInt(src.substr(i + 2, 4), 16)) : e; i += e === 'u' ? 6 : 2; continue; }
      if (c === '`') { i++; quasis.push(cur); return { quasis, exprs }; }
      if (c === '$' && src[i + 1] === '{') { i += 2; quasis.push(cur); cur = ''; const s0 = i; const toks = expr(); exprs.push({ text: src.slice(s0, i - 1), toks }); continue; }
      cur += c; i++;
    }
    quasis.push(cur); return { quasis, exprs };
  }
  function expr() {
    const toks = []; let depth = 0; const save = prev; prev = '(';
    while (i < n) {
      const c = src[i];
      if (c === '}' && depth === 0) { i++; prev = save; return toks; }
      if (c === '{') depth++; else if (c === '}') depth--;
      const t = one(); if (t) toks.push(t);
    }
    return toks;
  }
  function one() {
    const c = src[i];
    if (/\s/.test(c)) { i++; return null; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; return null; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; return null; }
    if (c === '"' || c === "'") { let j = i + 1, s = ''; while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') { const e = src[j + 1]; s += e === 'n' ? '\n' : e === 'u' ? String.fromCharCode(parseInt(src.substr(j + 2, 4), 16)) : e; j += e === 'u' ? 6 : 2; continue; } s += src[j]; j++; } i = j + 1; prev = 'str'; return { k: 'str', v: s }; }
    if (c === '`') { i++; const t = tpl(); prev = 'str'; return { k: 'tpl', v: t }; }
    if (c === '/' && regexOK()) { let j = i + 1, cls = false; while (j < n) { const d = src[j]; if (d === '\\') { j += 2; continue; } if (d === '[') cls = true; else if (d === ']') cls = false; else if ((d === '/' && !cls) || d === '\n') break; j++; } j++; while (/[a-z]/i.test(src[j] || '')) j++; i = j; prev = 'x'; return null; }
    if (/[\w$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; prev = src.slice(i, j); i = j; return { k: 'id', v: prev }; }
    i++; prev = c; return { k: 'p', v: c };
  }
  while (i < n) { const t = one(); if (t) out.push(t); }
  return out;
}

/* ---------- what counts as words a person reads ---------- */
const CODEY = [/^[#.[]?[\w$-]+(\.[\w$-]+)*$/, /^(\/[\w-]|\?|&)/, /[{};]\s*$/, /^[\w-]+\s*:\s*[^ ]+;/, /\b(px|rem|em|vh|vw|deg|ms)\b.*[;:]/, /^[\w-]+=/, /=>|===|!==|&&|\|\||\(\)|\$\{/,
  /serif|sans-serif|monospace|system-ui/, /^[\w.+-]+@[\w-]+\.\w+$/, /^(image|application|text|audio|video)\//, /^[A-Z_]{3,}$/, /^\W+$/, /^[\w-]+\.(js|css|json|php|png|svg|jpg|woff2|pdf|html|md|txt)$/i];
function readable(s) {
  if (/^(https?:|mailto:|tel:|data:|blob:|\.\/|api\/|assets\/|#\/)/.test(s)) return false;
  const t = s.replace(/\{\d+\}/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/[A-Za-z]{2}/.test(t)) return false;
  if (CODEY.some(r => r.test(t))) { if (/^[A-Z][a-z]+( [A-Za-z][a-z]+){0,3}[.!?…]?$/.test(t)) return true; return false; }   // "Save", "Log in", "Next exam" are words; "bo-pop", "click" are not
  if (/^[a-z][\w-]*$/.test(t)) return false;
  if (/api\/|#\/|\?r=|^use strict$|\(\?:/.test(s)) return false;
  if (!/ /.test(s.replace(/\{\d+\}/g, '')) && /[&=\/:._-]/.test(s.replace(/\{\d+\}/g, '')) && /\{\d+\}/.test(s)) return false;   // a query, a path, a key with a value in it
  if (/(^|[\s,>(])[.#][a-z][\w-]*|\[[\w-]+(=|\])|^\(prefers|^:scope|^(translate|rotate|scale|rgba?|hsla?|var|calc)\(|^[a-z]+:[a-z]+$/.test(s)) return false;   // selectors, CSS, event names
  const toks = t.split(' '); if (toks.every(w => /^[a-z][a-z0-9-]*$/.test(w)) && toks.some(w => /-|^(sm|lg|xs|on|off|btn|primary|ghost|small|muted|row|col|open|live|hidden)$/.test(w))) return false;   // a list of class names
  if (/\b[A-Z]{3,}\b[^a-z]*\b[A-Z]{3,}\b/.test(t) && !/[a-z]{3}/.test(t.replace(/\b[A-Z]{3,}\b/g, ''))) return false;   // what goes to Bo (THE PAGE, IN VIEW NOW), not to the page
  if (/<|>/.test(t) && !/\s[<>]\s/.test(t)) return false;
  return true;
}
const found = new Map();   // key → Set(files)
const add = (k, f) => { if (!k || k.length > 1200 || !readable(k)) return; (found.get(k) || found.set(k, new Set()).get(k)).add(f); };
function fromHtml(html, f) {
  let m; ATTRS.lastIndex = 0; while ((m = ATTRS.exec(html))) add(norm(m[1]), f);
  for (const piece of html.replace(/<!--[\s\S]*?-->/g, '').split(/<[^>]*>/)) add(norm(piece), f);
}
// a ${…} that is markup (an icon, Bo, a tag, a list mapped to markup) cuts the text; anything else is a value: {1}, {2}…
const isMarkup = e => /^(icon|bo|App\.bobcatSvg|bobcatSvg|App\.icon|ic)\(/.test(e.text.trim()) || /\.map\(/.test(e.text) || e.toks.some(t => (t.k === 'str' && /<\/?[a-z]/i.test(t.v)) || (t.k === 'tpl' && t.v.quasis.some(q => /<\/?[a-z]/i.test(q))));
function walk(toks, f) {
  for (const t of toks) {
    if (t.k === 'str') fromHtml(t.v, f);
    else if (t.k === 'tpl') {
      let flat = '', n = 0;
      t.v.quasis.forEach((q, k) => { flat += q; if (k < t.v.exprs.length) flat += isMarkup(t.v.exprs[k]) ? '<x>' : `{${++n}}`; });
      // renumber within each piece, so each piece's values start at {1}
      let m; ATTRS.lastIndex = 0; while ((m = ATTRS.exec(flat))) { let k = 0; add(norm(m[1]).replace(/\{\d+\}/g, () => `{${++k}}`), f); }
      for (const piece of flat.split(/<[^>]*>/)) { let k = 0; add(norm(piece).replace(/\{\d+\}/g, () => `{${++k}}`), f); }
      t.v.exprs.forEach(e => walk(e.toks, f));
    }
  }
}
/* text joined with +: 'Could not import: ' + e.message → "Could not import: {1}" */
function operand(toks, i) {   // the end (exclusive) of one operand starting at i, or -1
  const t = toks[i]; if (!t) return -1;
  if (t.k === 'p' && (t.v === '-' || t.v === '!')) return operand(toks, i + 1);
  let j;
  if (t.k === 'str' || t.k === 'tpl') j = i + 1;
  else if (t.k === 'id') j = i + 1;
  else if (t.k === 'p' && t.v === '(') { j = close(toks, i); if (j < 0) return -1; }
  else return -1;
  for (;;) {   // .name, (…), […] after it
    const u = toks[j]; if (!u || u.k !== 'p') return j;
    if (u.v === '.' && toks[j + 1] && toks[j + 1].k === 'id') j += 2;
    else if (u.v === '(' || u.v === '[') { const c = close(toks, j); if (c < 0) return j; j = c; }
    else return j;
  }
}
function close(toks, i) { const o = toks[i].v, c = o === '(' ? ')' : ']'; let d = 0; for (let j = i; j < toks.length; j++) { const t = toks[j]; if (t.k !== 'p') continue; if (t.v === o) d++; else if (t.v === c) { d--; if (!d) return j + 1; } } return -1; }
function chains(toks, f) {
  for (let i = 0; i < toks.length; i++) {
    const p = toks[i - 1]; if (p && p.k === 'p' && (p.v === '+' || p.v === '.')) continue;
    const parts = []; let j = i, ok = true;
    for (;;) { const e = operand(toks, j); if (e < 0) { ok = false; break; } parts.push(toks.slice(j, e)); const n = toks[e]; if (n && n.k === 'p' && n.v === '+' && !(toks[e + 1] && toks[e + 1].k === 'p' && toks[e + 1].v === '+')) j = e + 1; else break; }
    if (!ok || parts.length < 2) continue;
    // each part: its words, or a value {0}; (c ? 'post' : 'comment') gives one line for each choice
    let flats = [''];
    for (const x of parts) {
      let alts = [x.length === 1 && x[0].k === 'str' ? x[0].v : x.length === 1 && x[0].k === 'tpl' && !x[0].v.exprs.length ? x[0].v.quasis[0] : '{0}'];
      if (x[0].k === 'p' && x[0].v === '(') { const q = x.findIndex(t => t.k === 'p' && t.v === '?'), c = x.findIndex(t => t.k === 'p' && t.v === ':'); if (q > 0 && c > q + 1 && x.length === c + 3 && c === q + 2 && x[q + 1].k === 'str' && x[c + 1].k === 'str') alts = [x[q + 1].v, x[c + 1].v]; }
      flats = flats.flatMap(fl => alts.map(a => fl + a)).slice(0, 8);
    }
    for (const flat of flats) {
      if (!/[A-Za-z]{2}/.test(flat.replace(/\{0\}/g, ''))) continue;
      for (const piece of flat.split(/<[^>]*>/)) { let k = 0; add(norm(piece).replace(/\{0\}/g, () => `{${++k}}`), f); }
    }
  }
  for (const t of toks) if (t.k === 'tpl') t.v.exprs.forEach(e => chains(e.toks, f));
}
for (const f of FILES) { const p = path.join(ROOT, 'assets', f); if (fs.existsSync(p)) { const toks = lex(fs.readFileSync(p, 'utf8')); walk(toks, f); chains(toks, f); } }
fromHtml(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split('<body>')[1] || '', 'index.html');
add('Mathub · Free study hub for Montana State classes', 'index.html');
// the API's messages (shown in toasts and forms): mh_fail('…') and 'error' => '…'
for (const f of fs.readdirSync(path.join(ROOT, 'api')).filter(x => x.endsWith('.php'))) {
  const src = fs.readFileSync(path.join(ROOT, 'api', f), 'utf8'); let m;
  const re = /(?:mh_fail|mh_json_error|'error'\s*=>|'message'\s*=>|'hint'\s*=>)\s*\(?\s*'((?:[^'\\]|\\.)*)'/g;
  while ((m = re.exec(src))) add(norm(m[1].replace(/\\'/g, "'")), 'api/' + f);
}

// words the code builds in ways this reader cannot follow, written out by hand (one per line): i18n/extra.txt
try { fs.readFileSync(path.join(ROOT, 'i18n', 'extra.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && l[0] !== '#').forEach(k => (found.get(k) || found.set(k, new Set()).get(k)).add('extra')); } catch (e) {}

/* ---------- keep the numbers: old words keep theirs, new words get the next ones ---------- */
let cat = []; try { cat = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
const byKey = new Map(cat.map(e => [e.en, e])); let next = cat.reduce((a, e) => Math.max(a, e.id), 0) + 1; let added = 0;
for (const e of cat) e.gone = !found.has(e.en);
for (const [k, files] of found) { const e = byKey.get(k); if (e) { e.files = [...files]; delete e.gone; } else { cat.push({ id: next++, en: k, files: [...files] }); added++; } }
cat.forEach(e => { if (!e.gone) delete e.gone; });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, '[\n' + cat.map(e => JSON.stringify(e)).join(',\n') + '\n]\n');
console.log(`i18n/catalog.json: ${cat.filter(e => !e.gone).length} pieces of text (${added} new, ${cat.filter(e => e.gone).length} no longer used)`);
