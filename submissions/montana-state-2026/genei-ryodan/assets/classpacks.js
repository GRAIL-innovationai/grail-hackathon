/* ============================================================
   Mathub — class packs
   A class pack is one JSON file that holds a whole class: the syllabus
   facts, calendar, exams, grading, topic notes, formulas, flashcards,
   practice sets and a question bank. The admin uploads it in the admin
   panel (#/admin/packs) and the class appears for everyone, with no new
   code on the server. The format is documented in packs/README.md.

   Packs are data only. Nothing in a pack runs as code:
   - text is cleaned to a small set of formatting tags (b, i, sub, sup,
     lists, tables, links to http/https/mailto) before it is shown;
   - question generators are built from declarative specs ("bank",
     "table", "calc", "calc-mc"), and calculated questions use the small
     expression language below (numbers, + − × ÷ ^, comparisons and a
     fixed list of math functions), never eval.
   This file runs in the browser and in Node (scripts/make-pack.js and
   the tests use validate() and buildQuiz()).
   ============================================================ */
(function (global) {
  'use strict';
  const FORMAT = 'mathub-class-pack';
  const BUILTIN = ['calc', 'physics', 'precalc', 'writ', 'csci', 'biob', 'kin', 'psyx'];
  /* letters then a course number, e.g. chmy121, m273, stat216, biob170h. The digits keep a pack id from ever matching a
     page name (#/forum) or a CSS class the stylesheet already uses. */
  const ID_RE = /^[a-z]{1,6}\d{2,4}[a-z]?$/;
  const KEY_RE = /^[a-z0-9][a-z0-9_.-]{0,40}$/i;          // section, topic, exam, card and category ids
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  const isDate = d => ISO_RE.test(d || '') && !isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
  const HEX_RE = /^#[0-9a-f]{6}$/i;
  const CAL_TYPES = ['lecture', 'lab', 'exam', 'review', 'holiday', 'admin'];
  /* the class views a pack can use; anything else in its NAV is dropped */
  const PACK_VIEWS = ['dashboard', 'calendar', 'notes', 'formulas', 'flashcards', 'textbook', 'practice', 'exam', 'planner', 'grades', 'scratchpad', 'forum', 'course', 'settings'];
  const ICON_NAMES = ['d20', 'wand', 'compass', 'orb', 'sword', 'potion', 'scroll', 'quill', 'crown', 'home', 'calendar', 'book', 'sigma', 'cards', 'list', 'file', 'chart', 'flask', 'calc', 'pen', 'link', 'info', 'search', 'flag', 'clock', 'bulb', 'fire', 'eye', 'target', 'chat', 'pin', 'bell', 'lock', 'shield', 'grid', 'users', 'award', 'gear', 'user', 'zap', 'mic', 'gem', 'trophy', 'path', 'sliders'];
  const DATA_KEYS = ['code', 'name', 'short', 'term', 'tagline', 'kind', 'quizNote', 'formulasNote', 'filterExample', 'COURSE', 'GRADING', 'EXAMS', 'CALENDAR', 'CALENDAR_NOTE', 'RECURRING', 'SEMESTER', 'VARIANTS', 'UNITS', 'SECTIONS', 'FORMULAS', 'FLASHCARDS', 'PRACTICE', 'CHECKLISTS', 'INFO', 'NAV'];
  const META_KEYS = ['format', 'version', 'id', 'color', 'archetype', 'resources', 'resourcesBlurb', 'guides', 'canvasMatch', 'QUIZ', 'notes'];
  const DEFAULT_HINT = 'Rule out the options that describe a different structure, process or idea first.';

  /* ============================================================
     Cleaning text
     ============================================================ */
  const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'br', 'code', 'kbd', 'small', 'span', 'p', 'ul', 'ol', 'li', 'a', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'h3', 'h4', 'h5', 'blockquote', 'hr', 'mark', 'abbr', 'dl', 'dt', 'dd', 'pre', 'del', 'ins', 'q', 'cite', 'caption']);
  const VOID = new Set(['br', 'hr']);
  /* elements removed together with everything inside them */
  const RAW = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'svg', 'math', 'textarea', 'title', 'noscript', 'xmp', 'select', 'noembed', 'noframes', 'applet', 'plaintext', 'frameset', 'head']);
  const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/y;
  const ATTR = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', tab: '\t', newline: '\n', nbsp: ' ', sol: '/', lpar: '(', rpar: ')', period: '.' };
  const decode = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, e) => { if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; } const v = NAMED[e.toLowerCase()]; return v !== undefined ? v : m; });
  /* a link target: http, https, mailto, or a path inside the site. Anything with another scheme (javascript:, data:…) becomes '' */
  function safeUrl(u) {
    const raw = decode(String(u || '')).trim(); const probe = raw.replace(/[\u0000-\u0020\u007f-\u009f]/g, '').toLowerCase();
    const m = /^([a-z][a-z0-9+.-]*):/.exec(probe); if (m && !['http', 'https', 'mailto'].includes(m[1])) return '';
    if (!m && /^[^\/?#]*:/.test(probe)) return '';
    return raw.replace(/["'<>`\s]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
  }
  /* straight double quotes become curly ones, so a pack sentence can never close an HTML attribute; {{ }} templates are left alone */
  const smart = t => t.indexOf('"') < 0 ? t : t.split(/(\{\{[\s\S]*?\}\})/).map((part, i) => i % 2 ? part : part.replace(/"/g, (q, at, s) => /^$|[\s(\[{\u2014\u2013-]$/.test(s.slice(Math.max(0, at - 1), at)) ? '\u201C' : '\u201D')).join('');
  function attrs(tag, str) {
    let out = ''; let m; ATTR.lastIndex = 0; const seen = new Set();
    while ((m = ATTR.exec(str))) {
      const k = m[1].toLowerCase(); if (seen.has(k)) continue; seen.add(k); const v = decode(m[2] ?? m[3] ?? m[4] ?? '');
      if (k === 'class') { const c = v.replace(/[^\w\s-]/g, '').trim(); if (c) out += ` class="${c}"`; }
      else if (k === 'title') out += ` title="${escAttr(v)}"`;
      else if (tag === 'a' && k === 'href') { const u = safeUrl(v); if (u) out += ` href="${escAttr(u)}"`; }
      else if ((tag === 'td' || tag === 'th') && (k === 'colspan' || k === 'rowspan') && /^\d{1,2}$/.test(v)) out += ` ${k}="${v}"`;
      else if (tag === 'ol' && k === 'start' && /^\d{1,4}$/.test(v)) out += ` start="${v}"`;
    }
    if (tag === 'a' && /href="(https?:|mailto:|\/\/)/.test(out)) out += ' target="_blank" rel="noopener noreferrer"';
    return out;
  }
  function safeHtml(s) {
    s = String(s);
    if (!/<[a-zA-Z!\/]/.test(s)) return smart(s);
    let out = '', i = 0; const n = s.length, stack = [];
    const text = t => smart(t.replace(/</g, '&lt;'));
    while (i < n) {
      const lt = s.indexOf('<', i);
      if (lt < 0) { out += text(s.slice(i)); break; }
      out += text(s.slice(i, lt));
      if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
      TAG.lastIndex = lt; const m = TAG.exec(s);
      if (!m) { out += '&lt;'; i = lt + 1; continue; }
      i = TAG.lastIndex; const close = !!m[1], name = m[2].toLowerCase();
      if (RAW.has(name)) { if (!close) { const re = new RegExp('</' + name + '\\s*>', 'ig'); re.lastIndex = i; const e = re.exec(s); i = e ? re.lastIndex : n; } continue; }
      if (!ALLOWED.has(name)) continue;                      // unknown tags are unwrapped: their text stays
      if (VOID.has(name)) { if (!close) out += `<${name}>`; continue; }
      if (close) { const at = stack.lastIndexOf(name); if (at < 0) continue; while (stack.length > at) out += `</${stack.pop()}>`; continue; }
      if (['li', 'p', 'tr', 'td', 'th', 'dt', 'dd'].includes(name) && stack[stack.length - 1] === name) out += `</${stack.pop()}>`;   // <li>one<li>two
      stack.push(name); out += '<' + name + attrs(name, m[3] || '') + '>';
    }
    while (stack.length) out += `</${stack.pop()}>`;          // close what the pack left open, so it cannot swallow the page around it
    return out;
  }
  /* TeX for $$ … $$ blocks: < and > would read as HTML, so they become \lt and \gt */
  const safeTex = s => String(s).replace(/</g, '\\lt ').replace(/>/g, '\\gt ').replace(/"/g, "''");
  const URL_KEYS = new Set(['url', 'link', 'u', 'href', 'site', 'canvas', 'webwork', 'textbookBase', 'pdf', 'syllabus']);
  const EXPR_KEYS = new Set(['let', 'where', 'answer', 'distractors', 'vars']);
  const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  /* clean every string in a pack (or a stub) by where it is used */
  function clean(v, key = '', ctx = {}) {
    if (typeof v === 'string') { if (URL_KEYS.has(key)) return safeUrl(v); if (key === 't' && !ctx.res) return safeTex(v); return safeHtml(v); }
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (Array.isArray(v)) return v.map(x => clean(x, key, ctx));
    if (v && typeof v === 'object') {
      const o = {}; const calcQ = ctx.quiz && (v.type === 'calc' || v.type === 'calc-mc');
      for (const k of Object.keys(v)) {
        if (BAD_KEYS.has(k)) continue;
        if (calcQ && EXPR_KEYS.has(k)) { o[k] = rawCopy(v[k]); continue; }   // expressions are compiled, never shown; their results are cleaned when filled in
        o[k] = clean(v[k], k, { res: ctx.res || k === 'resources', quiz: ctx.quiz || k === 'QUIZ' });
      }
      return o;
    }
    return typeof v === 'boolean' || v === null ? v : undefined;
  }
  const rawCopy = v => Array.isArray(v) ? v.map(rawCopy) : v && typeof v === 'object' ? Object.keys(v).filter(k => !BAD_KEYS.has(k)).reduce((o, k) => (o[k] = rawCopy(v[k]), o), {}) : v;

  /* ============================================================
     The expression language for calculated questions
     numbers, "strings", names, + - * / % ^, == != < <= > >=, && || !, a ? b : c, f(x, …)
     ============================================================ */
  const R2D = 180 / Math.PI;
  const fact = n => { if (n < 0 || n > 170 || n !== Math.floor(n)) return NaN; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
  const gcd = (a, b) => { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); while (b) [a, b] = [b, a % b]; return a; };
  const FN = Object.assign(Object.create(null), {
    abs: Math.abs, sqrt: Math.sqrt, cbrt: Math.cbrt, exp: Math.exp, ln: Math.log, log: Math.log10, log2: Math.log2, logb: (x, b) => Math.log(x) / Math.log(b),
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
    sind: x => Math.sin(x / R2D), cosd: x => Math.cos(x / R2D), tand: x => Math.tan(x / R2D), asind: x => Math.asin(x) * R2D, acosd: x => Math.acos(x) * R2D, atand: x => Math.atan(x) * R2D, atan2d: (y, x) => Math.atan2(y, x) * R2D,
    round: (x, n = 0) => { const f = 10 ** n; return Math.round(x * f) / f; }, sig: (x, n = 3) => x === 0 ? 0 : Number(Number(x).toPrecision(Math.max(1, Math.min(15, n)))),
    floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc, sign: Math.sign, min: Math.min, max: Math.max, pow: Math.pow, hypot: Math.hypot,
    clamp: (x, a, b) => Math.min(b, Math.max(a, x)), fact, comb: (n, k) => k < 0 || k > n ? 0 : Math.round(fact(n) / (fact(k) * fact(n - k))), perm: (n, k) => k < 0 || k > n ? 0 : Math.round(fact(n) / fact(n - k)),
    gcd, lcm: (a, b) => Math.abs(a * b) / gcd(a, b) || 0, sum: (...a) => a.reduce((s, x) => s + x, 0), mean: (...a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN,
    sd: (...a) => { if (a.length < 2) return NaN; const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); },
    str: x => String(x), fixed: (x, n = 2) => Number(x).toFixed(Math.max(0, Math.min(10, n)))
  });
  const CONST = Object.assign(Object.create(null), { pi: Math.PI, e: Math.E, true: true, false: false });
  function tokenize(src) {
    const s = String(src), out = []; let i = 0, m;
    while (i < s.length) {
      const c = s[i]; const rest = s.slice(i);
      if (/\s/.test(c)) { i++; continue; }
      if ((m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(rest))) { out.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) { out.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
      if (c === '"' || c === "'") { const j = s.indexOf(c, i + 1); if (j < 0) throw new Error(`a quote is not closed in: ${s}`); out.push({ t: 'str', v: s.slice(i + 1, j) }); i = j + 1; continue; }
      if ((m = /^(==|!=|<=|>=|&&|\|\||[-+*\/%^(),?:<>!])/.exec(rest))) { out.push({ t: 'op', v: m[0] }); i += m[0].length; continue; }
      throw new Error(`unexpected "${c}" in: ${s}`);
    }
    return out;
  }
  /* compile an expression to a function of a scope object. known (a Set) lists the names it may use */
  function compile(src, known) {
    const T = tokenize(src); let p = 0;
    const isOp = v => T[p] && T[p].t === 'op' && T[p].v === v;
    const eat = v => { if (!isOp(v)) throw new Error(`expected "${v}" in: ${src}`); p++; };
    const num = x => typeof x === 'number' ? x : Number(x);
    function ternary() { const c = or(); if (isOp('?')) { p++; const a = ternary(); eat(':'); const b = ternary(); return s => c(s) ? a(s) : b(s); } return c; }
    function or() { let l = and(); while (isOp('||')) { p++; const a = l, b = and(); l = s => a(s) || b(s); } return l; }
    function and() { let l = eq(); while (isOp('&&')) { p++; const a = l, b = eq(); l = s => a(s) && b(s); } return l; }
    function eq() { let l = cmp(); while (isOp('==') || isOp('!=')) { const o = T[p++].v, a = l, b = cmp(); l = o === '==' ? s => a(s) === b(s) : s => a(s) !== b(s); } return l; }
    function cmp() { let l = add(); while (isOp('<') || isOp('<=') || isOp('>') || isOp('>=')) { const o = T[p++].v, a = l, b = add(); l = o === '<' ? s => a(s) < b(s) : o === '<=' ? s => a(s) <= b(s) : o === '>' ? s => a(s) > b(s) : s => a(s) >= b(s); } return l; }
    function add() { let l = mul(); while (isOp('+') || isOp('-')) { const o = T[p++].v, a = l, b = mul(); l = o === '+' ? s => { const x = a(s), y = b(s); return typeof x === 'string' || typeof y === 'string' ? String(x) + String(y) : x + y; } : s => num(a(s)) - num(b(s)); } return l; }
    function mul() { let l = unary(); while (isOp('*') || isOp('/') || isOp('%')) { const o = T[p++].v, a = l, b = unary(); l = o === '*' ? s => num(a(s)) * num(b(s)) : o === '/' ? s => num(a(s)) / num(b(s)) : s => num(a(s)) % num(b(s)); } return l; }
    function unary() { if (isOp('-')) { p++; const a = unary(); return s => -num(a(s)); } if (isOp('+')) { p++; return unary(); } if (isOp('!')) { p++; const a = unary(); return s => !a(s); } return pow(); }
    function pow() { const b = atom(); if (isOp('^')) { p++; const e = unary(); return s => Math.pow(num(b(s)), num(e(s))); } return b; }
    function atom() {
      const t = T[p++]; if (!t) throw new Error(`the expression ends too early: ${src}`);
      if (t.t === 'num' || t.t === 'str') { const v = t.v; return () => v; }
      if (t.t === 'op' && t.v === '(') { const e = ternary(); eat(')'); return e; }
      if (t.t === 'id') {
        if (isOp('(')) {
          const f = FN[t.v]; if (!f) throw new Error(`unknown function ${t.v}() in: ${src}`); p++; const args = [];
          if (!isOp(')')) { do { args.push(ternary()); } while (isOp(',') && ++p); } eat(')');
          return s => f(...args.map(a => a(s)));
        }
        const name = t.v;
        if (known && !known.has(name) && !(name in CONST)) throw new Error(`unknown name "${name}" in: ${src}`);
        return s => Object.prototype.hasOwnProperty.call(s, name) ? s[name] : CONST[name];
      }
      throw new Error(`unexpected "${t.v}" in: ${src}`);
    }
    const fn = ternary(); if (p < T.length) throw new Error(`unexpected "${T[p].v}" in: ${src}`);
    return fn;
  }

  /* ============================================================
     Question generators from declarative specs
     ============================================================ */
  const rand = n => Math.floor(Math.random() * n);
  const pick = a => a[rand(a.length)];
  const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const uniq = a => a.filter((x, i) => a.indexOf(x) === i);
  const fmt = x => { if (typeof x !== 'number') return String(x); if (!Number.isFinite(x)) return '?'; const r = Math.round(x * 10000) / 10000; return Math.abs(r) >= 10000 ? r.toLocaleString('en-US') : String(r === 0 ? 0 : r); };
  const fmtWith = (x, f) => { if (typeof x !== 'number' || !f) return fmt(x); const m = /^(\d+)(s?)$/.exec(f); if (!m) return fmt(x); const n = +m[1]; return m[2] ? String(Number(x.toPrecision(Math.max(1, n)))) : x.toFixed(Math.min(10, n)); };
  /* fill {{name}}, {{name | 2}} (2 decimals), {{= expression}} and {{= expression | 3s}} (3 significant figures) */
  const TPL = /\{\{\s*([\s\S]*?)\s*\}\}/g;
  function splitFormat(body) { const at = body.lastIndexOf('|'); if (at > 0 && body[at - 1] !== '|' && /^\s*\d+s?\s*$/.test(body.slice(at + 1))) return [body.slice(0, at).trim(), body.slice(at + 1).trim()]; return [body, '']; }
  function compileTemplate(tpl, known) {
    const parts = []; let last = 0, m; TPL.lastIndex = 0; const s = String(tpl ?? '');
    while ((m = TPL.exec(s))) {
      parts.push(s.slice(last, m.index)); last = TPL.lastIndex;
      const [body, f] = splitFormat(m[1]);
      if (body[0] === '=') { const fn = compile(body.slice(1), known); parts.push(sc => fmtWith(fn(sc), f)); }
      else if (known && !known.has(body)) parts.push(m[0]);   // not one of ours (TeX braces, say): leave it
      else parts.push(sc => fmtWith(sc[body], f));
    }
    parts.push(s.slice(last));
    return sc => parts.map(x => typeof x === 'function' ? safeHtml(String(x(sc))) : x).join('');
  }
  const texNum = (x, f) => fmtWith(x, f).replace(/,/g, '{,}');
  const texUnit = u => u ? `\\ \\text{${String(u).replace(/[^A-Za-z0-9·/%°.\-\s²³μΩ]/g, '').replace(/%/g, '\\%')}}` : '';   // % starts a TeX comment
  function mc(topic, prompt, correct, distractors, explanation, hint, size = 5) {
    const c = String(correct); const ds = shuffle(uniq(distractors.map(String)).filter(d => d !== c)).slice(0, Math.max(1, size - 1));
    const options = shuffle([c].concat(ds));
    return { topic, type: 'mc', prompt, options, answer: options.indexOf(c), explanation, hint };
  }
  function choose(spec) {
    if (Array.isArray(spec)) return pick(spec);
    if (spec && typeof spec === 'object' && 'min' in spec) {
      const step = spec.step || 1, n = Math.floor((spec.max - spec.min) / step + 1e-9);
      return Number((spec.min + step * rand(n + 1)).toFixed(12));
    }
    return spec;
  }
  /* turns one QUIZ.questions entry into a generator function; ctx = { hint(topic) } */
  function makeGenerator(q, ctx) {
    const hintFor = it => it || q.hint || ctx.hint(q.topic);
    const size = Math.max(2, Math.min(6, q.options || 5));
    if (q.type === 'bank' || q.type === 'mc') {
      const items = q.type === 'mc' ? [[q.prompt, q.answer, q.distractors || [], q.explain || q.explanation || '', q.hint]] : q.items;
      const g = () => { const it = pick(items); return mc(q.topic, it[0], it[1], it[2] || [], it[3] || '', hintFor(it[4]), size); };
      g.bankSize = items.length; return g;
    }
    if (q.type === 'table') {
      const cols = q.columns.map(String); const rows = q.rows.map(r => Array.isArray(r) ? r.map(x => x == null ? '' : String(x)) : cols.map(c => r[c] == null ? '' : String(r[c])));
      const known = new Set(cols);
      const asks = q.asks.map(a => {
        const ai = cols.indexOf(a.answer); if (ai < 0) throw new Error(`table question: "${a.answer}" is not one of its columns`);
        const given = []; String(a.prompt).replace(TPL, (m, b) => { const i = cols.indexOf(splitFormat(b)[0]); if (i >= 0 && !given.includes(i)) given.push(i); return m; });
        return { a, ai, given, prompt: compileTemplate(a.prompt, known), explain: a.explain ? compileTemplate(a.explain, known) : null, size: Math.max(2, Math.min(6, a.options || q.options || 4)) };
      });
      const g = () => {
        const A = pick(asks); const usable = rows.filter(r => r[A.ai] && A.given.every(i => r[i])); if (!usable.length) throw new Error('table question: no row has the columns this question needs');
        const row = pick(usable); const sc = Object.create(null); cols.forEach((c, i) => { sc[c] = row[i]; });
        const alsoRight = rows.filter(r => A.given.every(i => r[i] === row[i])).map(r => r[A.ai]);
        const pool = uniq(rows.map(r => r[A.ai]).filter(v => v && !alsoRight.includes(v)));
        const explanation = A.explain ? A.explain(sc) : cols.map((c, i) => row[i] ? `<b>${safeHtml(c)}:</b> ${row[i]}` : '').filter(Boolean).join(' · ');
        return mc(q.topic, A.prompt(sc), row[A.ai], pool, explanation, hintFor(A.a.hint), A.size);
      };
      g.bankSize = rows.length * asks.length; return g;
    }
    if (q.type === 'calc' || q.type === 'calc-mc') {
      const vars = Object.entries(q.vars || {}); const known = new Set(); const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
      const named = k => { if (!NAME.test(k) || BAD_KEYS.has(k) || ['answer', 'true', 'false'].includes(k)) throw new Error(`"${k}" cannot be a variable name`); known.add(k); };
      vars.forEach(([k, v]) => { named(k); if (Array.isArray(v)) v.forEach(o => { if (o && typeof o === 'object') Object.keys(o).forEach(named); }); else if (!v || typeof v !== 'object' || !('min' in v) || !('max' in v) || !(v.max >= v.min) || (v.step != null && !(v.step > 0))) throw new Error(`variable "${k}" needs a list of values or { min, max, step }`); });
      if (!vars.length) throw new Error('a calculated question needs at least one variable in "vars"');
      const lets = Object.entries(q.let || {}).map(([k, src]) => { const f = compile(src, known); named(k); return [k, f]; });
      const where = q.where ? compile(q.where, known) : null;
      const answer = compile(q.answer, known); known.add('answer');
      const ds = (q.distractors || []).map(src => compile(src, known));
      const prompt = compileTemplate(q.prompt, known), explain = compileTemplate(q.explain || '', known);
      const draw = () => {
        for (let t = 0; t < 300; t++) {
          const sc = Object.create(null);
          for (const [k, v] of vars) { const x = choose(v); if (x && typeof x === 'object' && !Array.isArray(x)) Object.assign(sc, x); else sc[k] = x; }
          for (const [k, f] of lets) sc[k] = f(sc);
          if (where && !where(sc)) continue;
          let a = answer(sc); if (typeof a === 'number') { if (!Number.isFinite(a)) continue; if (q.round != null) a = FN.round(a, q.round); } sc.answer = a;
          if (q.type === 'calc' && typeof a !== 'number') throw new Error('a calc answer must be a number; use calc-mc for words');
          return sc;
        }
        throw new Error('no values satisfied the conditions after 300 tries; loosen "where" or the ranges');
      };
      if (q.type === 'calc') return () => { const sc = draw(); return { topic: q.topic, type: 'num', prompt: prompt(sc), answer: sc.answer, answerTex: texNum(sc.answer, q.decimals != null ? String(q.decimals) : '') + texUnit(q.unit), explanation: explain(sc), hint: hintFor(), tol: q.tol || undefined }; };
      const show = v => (q.format ? safeHtml(q.format) : '{}').replace('{}', escHtml(fmtWith(v, q.decimals != null ? String(q.decimals) : '')));
      return () => {
        for (let t = 0; t < 40; t++) {
          const sc = draw(); const c = show(sc.answer); const wrong = uniq(ds.map(f => f(sc)).filter(v => typeof v === 'string' || Number.isFinite(v)).map(show)).filter(x => x !== c);
          if (wrong.length) return mc(q.topic, prompt(sc), c, wrong, explain(sc), hintFor(), size);
        }
        throw new Error('the distractors kept matching the answer; check their expressions');
      };
    }
    throw new Error(`unknown question type "${q.type}"`);
  }
  /* QUIZ = { topics: { key: { unit, sec, label } }, ladders: { key: [3 hints] }, hint, questions: [ … ] } */
  function buildQuiz(Q) {
    const TOPICS = {}; Object.entries(Q.topics || {}).forEach(([k, v]) => { TOPICS[k] = { unit: Number(v.unit) || 1, sec: v.sec || k, label: v.label || k }; });
    const ladders = Q.ladders || {};
    const ctx = { hint: t => (ladders[t] && ladders[t][0]) || Q.hint || DEFAULT_HINT };
    const GENERATORS = [], BY_TOPIC = {}, problems = [];
    (Q.questions || []).forEach((q, i) => {
      try { const g = makeGenerator(q, ctx); g.topic = q.topic; g.spec = i; const w = Math.max(1, Math.min(5, q.weight || 1)); for (let k = 0; k < w; k++) { GENERATORS.push(g); (BY_TOPIC[q.topic] = BY_TOPIC[q.topic] || []).push(g); } }
      catch (e) { problems.push({ i, topic: q.topic, type: q.type, error: e.message }); }
    });
    const topicsForUnits = units => Object.keys(TOPICS).filter(t => units.includes(TOPICS[t].unit));
    function generateSet(topics, n) {
      const pool = topics.filter(t => BY_TOPIC[t]); if (!pool.length) return []; const out = []; const order = shuffle(pool); let guard = 0;
      // topics rotate by attempt, not by questions made, so a topic whose small bank has run dry is skipped instead of stalling the set
      while (out.length < n && guard++ < n * 25) { const t = order[guard % order.length]; let q; try { q = pick(BY_TOPIC[t])(); } catch (e) { continue; } if (!q || (q.type === 'mc' && q.options.length < 2)) continue; if (out.some(o => o.prompt === q.prompt)) continue; q.id = 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); out.push(q); }
      return out;
    }
    return { quiz: { TOPICS, GENERATORS, BY_TOPIC, generateSet, topicsForUnits, helpers: { fmt, shuffle } }, ladders, problems };
  }
  /* run every generator many times; returns the problems found */
  function exercise(built, runs = 60) {
    const out = built.problems.map(p => ({ q: p.i, topic: p.topic, error: p.error }));
    const seen = new Set();
    for (const g of built.quiz.GENERATORS) {
      if (seen.has(g)) continue; seen.add(g);
      for (let r = 0; r < runs; r++) {
        let q; try { q = g(); } catch (e) { out.push({ q: g.spec, topic: g.topic, error: e.message }); break; }
        const bad = !q || !q.prompt ? 'empty question' : q.type === 'mc' ? (q.options.length < 2 ? 'fewer than two options' : !(q.answer >= 0) ? 'answer missing from options' : '') : q.type === 'num' ? (!Number.isFinite(q.answer) ? 'answer is not a number' : '') : 'bad type';
        if (bad) { out.push({ q: g.spec, topic: g.topic, error: bad, sample: q && q.prompt }); break; }
      }
    }
    return out;
  }

  /* ============================================================
     Defaults, checks and the light stub
     ============================================================ */
  function defaultNav(P) {
    const has = (k, count) => (Array.isArray(P[k]) && P[k].length > 0) || P[count] > 0;   // a stub only carries the counts
    const quiz = P.QUIZ || P.hasQuiz;
    return [
      { label: 'Today', items: [['dashboard', 'Dashboard', 'home'], ['calendar', 'Calendar', 'calendar']] },
      { label: 'Learn', items: [['notes', 'Topic notes', 'book'], has('FORMULAS', 'formulaCount') && ['formulas', P.formulasTitle || 'Formulas & key terms', 'sigma'], has('FLASHCARDS', 'flashcardCount') && ['flashcards', 'Flashcards', 'cards'], ['textbook', 'Textbook & links', 'link']].filter(Boolean) },
      { label: 'Practice', items: [quiz && ['practice', 'Quizzer', 'list'], has('EXAMS') && ['exam', 'Exam prep', 'flag'], ['planner', 'Study planner', 'calendar']].filter(Boolean) },
      { label: 'Tools', items: [(P.GRADING || P.hasGrading) && ['grades', 'Grade calculator', 'calc'], ['scratchpad', 'Scratchpad', 'pen']].filter(Boolean) },
      { label: 'Community', items: [['forum', 'Discussions', 'chat']] },
      { label: 'Course', items: [['course', 'Syllabus & policies', 'info'], ['settings', 'Settings', 'sliders']] }
    ];
  }
  /* fill the fields the views expect, so a short pack still renders everywhere */
  function normalize(src) {
    const P = Object.assign({}, src);
    P.code = P.code || (P.COURSE && P.COURSE.code) || ''; P.name = P.name || (P.COURSE && P.COURSE.name) || P.code;
    P.short = P.short || P.code; P.term = P.term || (P.COURSE && P.COURSE.term) || '';
    const C = P.COURSE = Object.assign({ school: 'Montana State University', links: [], deadlines: [] }, P.COURSE || {});
    C.code = C.code || P.code; C.name = C.name || P.name; C.term = C.term || P.term;
    if (!C.textbook) C.textbook = { title: 'Course materials on Canvas', url: C.canvas || C.site || 'https://montana.instructure.com/' };
    ['EXAMS', 'CALENDAR', 'RECURRING', 'UNITS', 'SECTIONS', 'FORMULAS', 'FLASHCARDS', 'INFO'].forEach(k => { if (!Array.isArray(P[k])) P[k] = []; });
    ['PRACTICE', 'CHECKLISTS'].forEach(k => { if (!P[k] || typeof P[k] !== 'object' || Array.isArray(P[k])) P[k] = {}; });
    if (!P.SEMESTER && P.CALENDAR.length) { const ds = P.CALENDAR.map(e => e[0]).filter(d => ISO_RE.test(d)).sort(); P.SEMESTER = { start: ds[0], end: ds[ds.length - 1] }; }
    P.SECTIONS.forEach(s => { if (!s.label) s.label = String(s.id); if (!Array.isArray(s.formulas)) s.formulas = []; if (!Array.isArray(s.ideas)) s.ideas = Array.isArray(s.bullets) ? s.bullets : []; if (!Array.isArray(s.pitfalls)) s.pitfalls = []; });
    P.EXAMS.forEach((e, i) => { if (e.n == null) e.n = i + 1; if (!Array.isArray(e.sections)) e.sections = []; if (!Array.isArray(e.units)) e.units = []; });
    const nav = Array.isArray(P.NAV) && P.NAV.length ? P.NAV : defaultNav(P);
    P.NAV = nav.map(g => ({ label: String(g.label || ''), items: (g.items || []).filter(it => Array.isArray(it) && PACK_VIEWS.includes(it[0]) && (it[0] !== 'practice' || P.QUIZ || P.hasQuiz)).map(it => [it[0], String(it[1] || it[0]), ICON_NAMES.includes(it[2]) ? it[2] : 'file']) })).filter(g => g.items.length);
    if (!P.NAV.some(g => g.items.some(it => it[0] === 'dashboard'))) P.NAV.unshift({ label: 'Today', items: [['dashboard', 'Dashboard', 'home']] });
    P.INFO = P.INFO.map(x => Object.assign({}, x, { icon: ICON_NAMES.includes(x.icon) ? x.icon : 'info' }));
    return P;
  }
  const contrast = (a, b) => { const L = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }; const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  /* returns { errors, warnings, stats } for a parsed pack */
  function validate(raw) {
    const errors = [], warnings = []; const E = m => errors.push(m), W = m => warnings.push(m);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['This is not a class pack: the file should hold one JSON object.'], warnings, stats: {} };
    if (raw.format !== FORMAT) E(`"format" should be "${FORMAT}".`);
    if (raw.version !== 1) E('"version" should be 1.');
    if (!ID_RE.test(raw.id || '')) E(`"id" must be letters then a course number, all lowercase, like chmy121 or m273 (got "${raw.id || ''}").`);
    else if (BUILTIN.includes(raw.id)) E(`"${raw.id}" is a built-in class.`);
    ['code', 'name', 'term'].forEach(k => { if (!raw[k] || typeof raw[k] !== 'string') E(`"${k}" is required.`); });
    if (raw.short && String(raw.short).length > 14) W('"short" is long; it is the label in the sidebar switcher, so keep it under about 12 characters.');
    Object.keys(raw).forEach(k => { if (!DATA_KEYS.includes(k) && !META_KEYS.includes(k) && k !== 'formulasTitle') W(`Unknown key "${k}" is ignored.`); });
    const col = raw.color || {};
    if (!HEX_RE.test(col.light || '')) E('"color.light" must be a hex colour like #0F766E.');
    else if (contrast('#FFFFFF', col.light) < 4.5) W(`The light colour ${col.light} is pale for white text (contrast ${contrast('#FFFFFF', col.light).toFixed(1)}:1); dark text will be used on it. A deeper shade reads better.`);
    if (col.dark && !HEX_RE.test(col.dark)) E('"color.dark" must be a hex colour.');
    if (raw.archetype && (!raw.archetype.name || !ICON_NAMES.includes(raw.archetype.icon))) W('"archetype" needs a name and one of the icon names; the default is used.');
    const P = normalize(raw);
    const secIds = new Set(), units = new Set(P.UNITS.map(u => u.n));
    if (!P.SECTIONS.length) E('"SECTIONS" needs at least one topic.');
    P.SECTIONS.forEach((s, i) => { if (!KEY_RE.test(s.id || '')) E(`SECTIONS[${i}] needs an id of letters, digits, dashes or dots.`); else if (secIds.has(s.id)) E(`Section id "${s.id}" is used twice.`); secIds.add(s.id); if (!s.title) E(`Section "${s.id}" needs a title.`); if (!units.has(s.unit)) E(`Section "${s.id}" is in unit ${s.unit}, which is not in UNITS.`); if (!(s.ideas || s.bullets || []).length) W(`Section "${s.id}" has no notes ("ideas").`); });
    if (!P.UNITS.length) E('"UNITS" needs at least one unit.');
    P.UNITS.forEach(u => { if (typeof u.n !== 'number') E('Every unit needs a number "n".'); (u.sections || []).forEach(id => { if (!secIds.has(id)) E(`Unit ${u.n} lists section "${id}", which does not exist.`); }); });
    const exIds = new Set();
    P.EXAMS.forEach((e, i) => { if (!KEY_RE.test(e.id || '')) E(`EXAMS[${i}] needs an id.`); else if (exIds.has(e.id)) E(`Exam id "${e.id}" is used twice.`); exIds.add(e.id); if (!isDate(e.date)) E(`Exam "${e.id}" needs a real date as YYYY-MM-DD.`); if (e.endDate && !isDate(e.endDate)) E(`Exam "${e.id}" endDate must be YYYY-MM-DD.`); e.sections.forEach(s => { if (!secIds.has(s)) W(`Exam "${e.id}" covers section "${s}", which does not exist.`); }); e.units.forEach(u => { if (!units.has(u)) W(`Exam "${e.id}" covers unit ${u}, which does not exist.`); }); if (!e.name) E(`Exam "${e.id}" needs a name.`); });
    const variants = P.VARIANTS && Array.isArray(P.VARIANTS.options) ? new Set(P.VARIANTS.options.map(o => String(o.id))) : null;
    if (P.VARIANTS && (!variants || !variants.size)) E('"VARIANTS" needs options.'); else if (variants && !variants.has(String(P.VARIANTS.default))) E('"VARIANTS.default" must be one of its options.');
    if (variants) [...variants].forEach(v => { if (!KEY_RE.test(v)) E(`Variant id "${v}" must be letters or digits.`); });
    if (!P.CALENDAR.length) W('"CALENDAR" is empty: the calendar, Today and the current topic will be blank.');
    P.CALENDAR.forEach((e, i) => { if (!Array.isArray(e) || !isDate(e[0])) { E(`CALENDAR[${i}] must be ["YYYY-MM-DD", type, title, sectionId?, variantId?].`); return; } if (!CAL_TYPES.includes(e[1])) E(`CALENDAR[${i}] type "${e[1]}" must be one of ${CAL_TYPES.join(', ')}.`); if (!e[2]) E(`CALENDAR[${i}] needs a title.`); if (e[3] && !secIds.has(e[3])) W(`CALENDAR ${e[0]} points to section "${e[3]}", which does not exist.`); if (e[4] && (!variants || !variants.has(String(e[4])))) E(`CALENDAR ${e[0]} is tagged for variant "${e[4]}", which is not in VARIANTS.`); });
    P.EXAMS.forEach(e => { ['dates', 'dateLabels'].forEach(k => { if (e[k]) Object.keys(e[k]).forEach(v => { if (!variants || !variants.has(v)) E(`Exam "${e.id}" ${k} has variant "${v}", which is not in VARIANTS.`); else if (k === 'dates' && !isDate(e[k][v])) E(`Exam "${e.id}" date for "${v}" must be YYYY-MM-DD.`); }); }); });
    if (!P.GRADING || !Array.isArray(P.GRADING.categories) || !P.GRADING.categories.length) E('"GRADING.categories" is required (the grade calculator and GPA use it).');
    else {
      const cat = new Set(); let sum = 0; P.GRADING.categories.forEach(c => { if (!KEY_RE.test(c.id || '')) E('Every grading category needs an id.'); cat.add(c.id); sum += Number(c.weight) || 0; });
      if (Math.abs(sum - 100) > 0.01 && !P.GRADING.options) W(`Grading weights add to ${sum}, not 100.`);
      (P.GRADING.options || []).forEach(o => Object.keys(o.weights || {}).forEach(k => { if (!cat.has(k)) E(`Grading option "${o.label}" weights "${k}", which is not a category.`); }));
      if (!Array.isArray(P.GRADING.scale) || !P.GRADING.scale.length) E('"GRADING.scale" (letter cut-offs) is required.');
    }
    const cardIds = new Set();
    P.FLASHCARDS.forEach((c, i) => { if (!KEY_RE.test(c.id || '')) E(`FLASHCARDS[${i}] needs an id.`); else if (cardIds.has(c.id)) E(`Flashcard id "${c.id}" is used twice.`); cardIds.add(c.id); if (!c.f || !c.b) E(`Flashcard "${c.id}" needs a front (f) and a back (b).`); if (c.sec && !secIds.has(c.sec)) W(`Flashcard "${c.id}" points to section "${c.sec}", which does not exist.`); if (!units.has(c.unit)) W(`Flashcard "${c.id}" has unit ${c.unit}, which does not exist.`); });
    P.FORMULAS.forEach((g, i) => { if (!g.group || !Array.isArray(g.items)) E(`FORMULAS[${i}] needs a group name and items.`); else g.items.forEach(it => { if (!it.n || !(it.t || it.d || it.c)) E(`A formula in "${g.group}" needs a name (n) and one of t (TeX), d (definition) or c (code).`); }); });
    Object.entries(P.PRACTICE).forEach(([k, v]) => { if (!exIds.has(k)) W(`PRACTICE "${k}" is not an exam id.`); if (!v || !Array.isArray(v.problems)) E(`PRACTICE "${k}" needs problems.`); else v.problems.forEach((p, i) => { if (typeof p.n !== 'number') E(`PRACTICE "${k}" problem ${i + 1} needs a number n.`); if (!p.q || !p.s) E(`PRACTICE "${k}" problem ${i + 1} needs a question (q) and a solution (s).`); }); });
    Object.keys(P.CHECKLISTS).forEach(k => { if (!exIds.has(k)) W(`CHECKLISTS "${k}" is not an exam id.`); });
    (raw.NAV || []).forEach(g => (g.items || []).forEach(it => { if (Array.isArray(it) && !PACK_VIEWS.includes(it[0])) W(`NAV item "${it[0]}" is not available to uploaded classes and is left out.`); }));
    (raw.resources || []).forEach((r, i) => { if (!r.t || !r.u) E(`resources[${i}] needs a title (t) and a link (u).`); else if (!safeUrl(r.u)) W(`resources[${i}] link is not http, https or a Mathub path, so it is left out.`); });
    const stats = { sections: P.SECTIONS.length, units: P.UNITS.length, exams: P.EXAMS.length, calendar: P.CALENDAR.length, flashcards: P.FLASHCARDS.length, formulas: P.FORMULAS.reduce((n, g) => n + ((g.items || []).length), 0), practice: Object.values(P.PRACTICE).reduce((n, v) => n + ((v && v.problems) || []).length, 0), topics: 0, questions: 0, bankItems: 0 };
    if (!raw.QUIZ) W('No "QUIZ": the class gets no quizzer, daily challenge or mock exams.');
    else {
      const Q = raw.QUIZ; const tk = Object.keys(Q.topics || {}); stats.topics = tk.length; stats.questions = (Q.questions || []).length;
      if (!tk.length) E('"QUIZ.topics" is empty.');
      tk.forEach(k => { const t = Q.topics[k]; if (!KEY_RE.test(k)) E(`Quiz topic "${k}" must be letters, digits or dashes.`); if (!units.has(Number(t.unit))) E(`Quiz topic "${k}" is in unit ${t.unit}, which does not exist.`); if (t.sec && !secIds.has(t.sec)) W(`Quiz topic "${k}" points to section "${t.sec}", which does not exist.`); if (!t.label) E(`Quiz topic "${k}" needs a label.`); });
      const used = new Set();
      (Q.questions || []).forEach((q, i) => {
        const where = `QUIZ.questions[${i}] (${q.type || '?'}, ${q.topic || 'no topic'})`;
        if (!Q.topics || !Q.topics[q.topic]) E(`${where}: topic "${q.topic}" is not in QUIZ.topics.`); used.add(q.topic);
        if (q.type === 'bank') { if (!Array.isArray(q.items) || !q.items.length) E(`${where}: "items" is empty.`); else q.items.forEach((it, j) => { if (!Array.isArray(it) || it.length < 3 || !it[0] || it[1] == null || !Array.isArray(it[2]) || !it[2].length) E(`${where} item ${j + 1}: use [prompt, correct, [wrong answers], explanation, hint?].`); else { stats.bankItems++; if (it[2].map(String).includes(String(it[1]))) E(`${where} item ${j + 1}: a wrong answer repeats the correct one.`); if (!it[3]) W(`${where} item ${j + 1}: no explanation.`); } }); }
        else if (q.type === 'table') { if (!Array.isArray(q.columns) || !Array.isArray(q.rows) || !Array.isArray(q.asks) || !q.asks.length) E(`${where}: needs columns, rows and asks.`); else { stats.bankItems += q.rows.length * q.asks.length; if (q.rows.length < 3) W(`${where}: fewer than 3 rows leaves too few wrong answers.`); } }
        else if (q.type === 'calc' || q.type === 'calc-mc') { if (!q.prompt || !q.answer) E(`${where}: needs a prompt and an answer expression.`); if (q.type === 'calc-mc' && !(q.distractors || []).length) E(`${where}: calc-mc needs distractor expressions.`); if (!q.explain) W(`${where}: no explanation.`); }
        else if (q.type === 'mc') { if (!q.prompt || q.answer == null || !(q.distractors || []).length) E(`${where}: needs prompt, answer and distractors.`); }
        else E(`${where}: type must be bank, table, calc, calc-mc or mc.`);
      });
      tk.forEach(k => { if (!used.has(k)) W(`Quiz topic "${k}" has no questions.`); });
      { try { const built = buildQuiz(clean(raw.QUIZ, 'QUIZ', { quiz: true })); exercise(built, 40).forEach(p => E(`QUIZ.questions[${p.q}] (${p.topic}): ${p.error}`)); } catch (e) { E('The quiz could not be built: ' + e.message); } }
    }
    return { errors: uniq(errors), warnings: uniq(warnings), stats };
  }

  /* ============================================================
     Colours
     ============================================================ */
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
  function palette(color) {
    const L = HEX_RE.test(color && color.light || '') ? color.light : '#475569';
    const Dk = HEX_RE.test(color && color.dark || '') ? color.dark : mix(L, '#FFFFFF', 0.35);
    return {
      light: { accent: L, ink: contrast('#FFFFFF', L) >= 4.5 ? '#FFFFFF' : '#111827', soft: mix(L, '#FFFFFF', 0.88), line: mix(L, '#FFFFFF', 0.55), deep: mix(L, '#000000', 0.2) },
      dark: { accent: Dk, ink: mix(Dk, '#000000', 0.84), soft: mix(Dk, '#121826', 0.84), line: mix(Dk, '#121826', 0.55), deep: mix(Dk, '#000000', 0.12) },
      hero: [L, mix(L, '#000000', 0.35)], heroInk: mix(L, '#000000', 0.2)
    };
  }
  function css(id, color) {
    if (!ID_RE.test(id)) return '';
    const p = palette(color); const v = s => `--${id}-accent:${s.accent};--${id}-accent-ink:${s.ink};--${id}-accent-soft:${s.soft};--${id}-accent-line:${s.line};--${id}-accent-deep:${s.deep};`;
    const darkVars = v(p.dark) + `--chip-${id}:var(--${id}-accent);`;
    const use = `--accent:var(--${id}-accent);--accent-ink:var(--${id}-accent-ink);--accent-soft:var(--${id}-accent-soft);--accent-line:var(--${id}-accent-line);`;
    const hero = `background:linear-gradient(135deg,${p.hero[0]} 0%,${p.hero[1]} 100%)`;
    return `:root{${v(p.light)}--chip-${id}:${p.light.deep};}
:root[data-theme="dark"]{${darkVars}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${darkVars}}}
:root[data-course="${id}"]{${use}--accent-deep:var(--${id}-accent-deep);}
.course-card.${id},.resume-card.course-${id}{${use}}
.chip.course-${id}{background:var(--${id}-accent-soft);color:var(--chip-${id});}
.switch-btn[data-c="${id}"]::before{background:var(--${id}-accent);}
:root[data-skin][data-theme="dark"][data-course="${id}"] .hero-exam{${hero}}
:root[data-skin][data-theme="dark"][data-course="${id}"] .hero-exam .btn.primary{color:${p.heroInk}}
@media (prefers-color-scheme: dark){:root[data-skin]:not([data-theme="light"])[data-course="${id}"] .hero-exam{${hero}} :root[data-skin]:not([data-theme="light"])[data-course="${id}"] .hero-exam .btn.primary{color:${p.heroInk}}}`;
  }

  const API = { FORMAT, BUILTIN, ID_RE, PACK_VIEWS, CAL_TYPES, ICON_NAMES, DATA_KEYS, safeHtml, safeUrl, safeTex, clean, compile, compileTemplate, buildQuiz, exercise, normalize, validate, palette, css, contrast };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.MathubPacks = API;

  /* ============================================================
     In the browser: register the packs, load one when it is opened
     ============================================================ */
  const App = global.App; if (!App || typeof document === 'undefined') return;
  const Courses = global.Courses || (global.Courses = {});
  const LIST_KEY = 'mh-packs', DATA_KEY = id => 'mh-pack-' + id;
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };
  const api = (route, opts = {}) => fetch('api/index.php?r=' + route, Object.assign({ credentials: 'include', cache: 'no-store', headers: { 'X-Requested-With': 'MatHub' } }, opts)).then(r => r.json());
  const registered = new Set(); const bootAt = Date.now();
  const local = new Set();   // classes made in the app from a student's syllabus: on the device only, never in the server's list
  // packs shipped in packs/ (scripts/bundle-packs.js writes the listing): used when the account server cannot be reached, e.g. the static preview
  let bundledList = null; const bundled = () => bundledList || (bundledList = fetch('packs/index.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null));
  const FILE_RE = /^[a-z0-9]+\.mathub\.json$/;
  const fromFile = (id, file, v) => fetch('packs/' + file, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(data => { if (data && data.id === id) { lsSet(DATA_KEY(id), { v, data }); return data; } return null; }).catch(() => null);
  const STUB_KEYS = ['id', 'code', 'name', 'short', 'term', 'tagline', 'kind', 'quizNote', 'COURSE', 'EXAMS', 'CALENDAR', 'CALENDAR_NOTE', 'RECURRING', 'SEMESTER', 'VARIANTS', 'UNITS', 'NAV', 'SECTIONS', 'hasQuiz', 'hasGrading', 'quizTopics', 'sectionCount', 'flashcardCount', 'formulaCount'];
  const archOf = a => a && a.name && ICON_NAMES.includes(a.icon) ? { name: String(a.name).slice(0, 24), icon: a.icon, line: String(a.line || '').slice(0, 90) } : null;
  function addResources(id, S) {
    const R = global.MATHUB_RESOURCES; if (!R) return;
    R.GROUPS = R.GROUPS.filter(g => g.id !== id); R.ITEMS = R.ITEMS.filter(x => x.g !== id);
    const at = R.GROUPS.findIndex(g => g.id === 'wellbeing');
    R.GROUPS.splice(at < 0 ? R.GROUPS.length : at, 0, { id, title: `${S.name} · ${S.code}`, blurb: S.resourcesBlurb || `Links for ${S.code}: the class site, free readings and practice.` });
    if (S.hasQuiz) R.ITEMS.push({ g: id, t: `Mathub ${S.code} quizzer`, u: `#/${id}/practice`, d: 'Questions on every topic, with explanations.', k: 'tool', tags: ['mathub', 'practice'], top: true });
    (S.resources || []).forEach(r => { if (r && r.t && r.u) R.ITEMS.push({ g: id, t: String(r.t), u: r.u, d: String(r.d || ''), k: R.KINDS && R.KINDS[r.k] ? r.k : 'reference', tags: Array.isArray(r.tags) ? r.tags.map(String).slice(0, 6) : [], top: !!r.top }); });
  }
  function addGuides(id, ids) { (global.MATHUB_GUIDES || []).forEach(g => { if (Array.isArray(g.for)) { const i = g.for.indexOf(id); if (i >= 0) g.for.splice(i, 1); if ((ids || []).includes(g.id)) g.for.push(id); } }); }
  function styleFor(id, color) { let st = document.getElementById('pack-style-' + id); if (!st) { st = document.createElement('style'); st.id = 'pack-style-' + id; document.head.appendChild(st); } st.textContent = css(id, color); }
  /* a stub from classpack_list: the light fields, plus color, archetype, resources, guides, version and hidden */
  function register(raw, replaceOpen) {
    if (!raw || !ID_RE.test(raw.id) || BUILTIN.includes(raw.id)) return false;
    const S = clean(raw); const id = S.id; const C = Courses[id] && Courses[id].pack ? Courses[id] : (Courses[id] = {});
    if (App.D === C && C.loaded) { if (!replaceOpen) return false; App.forgetCourse(); }   // the open class keeps its copy, unless the page has only just loaded
    Object.keys(C).forEach(k => delete C[k]);
    const N = normalize(S); STUB_KEYS.forEach(k => { if (N[k] !== undefined) C[k] = N[k]; });
    Object.assign(C, { id, pack: true, packVersion: Number(raw.version) || 1, hidden: !!raw.hidden, preview: !!raw.preview, stub: true, loaded: false, files: [], archetype: archOf(S.archetype), packFile: typeof raw.file === 'string' && FILE_RE.test(raw.file) ? raw.file : '' });
    /* a class its teaching team built in #/teach opens for them as a preview, but stays out of every class list */
    const at = App.COURSE_ORDER.indexOf(id); if (C.preview) { if (at >= 0) App.COURSE_ORDER.splice(at, 1); } else if (at < 0) App.COURSE_ORDER.push(id);
    styleFor(id, raw.color); addResources(id, S); addGuides(id, raw.guides); if (App.addArchetype) App.addArchetype(id, C.archetype);
    App.applyVariant(C); registered.add(id); return true;
  }
  function unregister(id) {
    if (!registered.has(id)) return; registered.delete(id);
    const C = Courses[id]; if (C && C.pack) delete Courses[id];
    const i = App.COURSE_ORDER.indexOf(id); if (i >= 0) App.COURSE_ORDER.splice(i, 1);
    const st = document.getElementById('pack-style-' + id); if (st) st.remove();
    const R = global.MATHUB_RESOURCES; if (R) { R.GROUPS = R.GROUPS.filter(g => g.id !== id); R.ITEMS = R.ITEMS.filter(x => x.g !== id); }
    addGuides(id, []); lsDel(DATA_KEY(id));
  }
  /* merge the full pack into the class object (called by App.loadCourse) */
  function install(id, raw) {
    if (!raw || raw.id !== id) throw new Error('This class file does not match the class.');
    const P = normalize(clean(raw)); const C = Courses[id];
    DATA_KEYS.forEach(k => { if (P[k] !== undefined) C[k] = P[k]; });
    if (P.QUIZ) { const built = buildQuiz(P.QUIZ); C.quiz = built.quiz; global.MathubLadders = global.MathubLadders || {}; global.MathubLadders[id] = built.ladders; }
    else delete C.quiz;
    return C;
  }
  async function load(id) {
    const C = Courses[id]; if (!C || !C.pack) throw new Error('Unknown class.');
    const v = C.packVersion; const cached = lsGet(DATA_KEY(id)); let data = cached && cached.v === v ? cached.data : null;
    if (!data && C.packFile) data = await fromFile(id, C.packFile, v);   // listed from packs/index.json: read the pack's own file
    if (!data) {
      try { const j = await api(`classpack_get&id=${id}&v=${v}`); if (!j || !j.ok) throw new Error((j && j.error) || 'Could not load this class.'); data = j.pack; lsSet(DATA_KEY(id), { v: j.version || v, data }); }
      catch (e) { if (cached && cached.data) data = cached.data; else throw new Error(navigator.onLine === false ? 'You are offline and this class has not been saved on this device yet.' : (e.message || 'Could not load this class.')); }
    }
    return install(id, data);
  }
  const sig = list => (list || []).map(p => `${p.id}:${p.version}:${p.hidden ? 1 : 0}${p.preview ? 1 : 0}`).sort().join('|');
  let lastSig = '';
  /* fetch the list of packs, register new and changed ones, drop removed ones; re-render when the page on screen depends on it */
  async function sync() {
    let j; try { j = await api('classpack_list'); } catch (e) { j = null; }
    if (!j || !j.ok || !Array.isArray(j.packs)) { const b = await bundled(); if (!b || !Array.isArray(b.packs)) return false; j = { ok: true, packs: b.packs }; }   // no account server: the bundled packs
    lsSet(LIST_KEY, { packs: j.packs, at: Date.now() });
    const s = sig(j.packs); if (s === lastSig) return false; lastSig = s;
    const ids = new Set(j.packs.map(p => p.id)); const changed = [];
    [...registered].forEach(id => { if (!ids.has(id) && !local.has(id)) { if (App.D && App.D.id === id) App.forgetCourse(); unregister(id); changed.push(id); } });
    const early = Date.now() - bootAt < 20000;   // right after a page load nothing is in progress yet, so the open class can switch to the new version
    j.packs.forEach(p => { if (local.has(p.id)) return; const C = Courses[p.id]; if (!C || !C.pack || C.packVersion !== Number(p.version) || !!C.hidden !== !!p.hidden || !!C.preview !== !!p.preview) { if (register(p, early)) changed.push(p.id); } });
    if (!changed.length || document.readyState === 'loading' || !document.getElementById('view')) return changed.length > 0;
    const first = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
    if (!first || changed.includes(first)) App.rerender(); else App.rebuildNav();   // the start page lists the classes; a class that appeared or went away re-routes
    return true;
  }
  /* registered before the first render, from the copy saved on this device */
  const saved = lsGet(LIST_KEY); if (saved && Array.isArray(saved.packs)) { saved.packs.forEach(p => { try { register(p); } catch (e) {} }); lastSig = sig(saved.packs); }
  /* the light fields a class needs before it is opened, as mh_pack_stub() in api/packs.php and scripts/bundle-packs.js build them */
  const STUB_SRC = ['id', 'code', 'name', 'short', 'term', 'tagline', 'kind', 'quizNote', 'COURSE', 'EXAMS', 'CALENDAR', 'CALENDAR_NOTE', 'RECURRING', 'SEMESTER', 'VARIANTS', 'UNITS', 'NAV', 'color', 'archetype', 'resources', 'resourcesBlurb', 'guides', 'canvasMatch'];
  function stubOf(p) {
    const s = {}; STUB_SRC.forEach(k => { if (p[k] !== undefined) s[k] = p[k]; }); if (!s.short) s.short = p.code;
    s.SECTIONS = (p.SECTIONS || []).filter(x => x && typeof x === 'object').map(x => ({ id: String(x.id || ''), label: String(x.label || x.id || ''), title: String(x.title || ''), unit: x.unit != null ? x.unit : 1 }));
    const topics = p.QUIZ && p.QUIZ.topics;
    if (topics && Object.keys(topics).length) { s.hasQuiz = true; s.quizTopics = {}; Object.entries(topics).forEach(([k, t]) => { s.quizTopics[k] = { label: String((t && t.label) || k), sec: String((t && t.sec) || k), unit: (t && t.unit != null) ? t.unit : 1 }; }); }
    s.hasGrading = !!(p.GRADING && Array.isArray(p.GRADING.categories) && p.GRADING.categories.length);
    s.sectionCount = s.SECTIONS.length; s.flashcardCount = Array.isArray(p.FLASHCARDS) ? p.FLASHCARDS.length : 0;
    s.formulaCount = (p.FORMULAS || []).reduce((n, g) => n + (g && Array.isArray(g.items) ? g.items.length : 0), 0);
    return s;
  }
  App.packs = { register, unregister, load, install, sync, list: () => [...registered], api: API, local, stubOf };
  sync(); let lastSync = Date.now();
  const resync = () => { lastSync = Date.now(); return sync(); };
  global.addEventListener('hashchange', () => { const first = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]; if (ID_RE.test(first) && !Courses[first]) resync(); });   // e.g. the inbox link to a class added after this tab opened
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - lastSync > 10 * 60 * 1000) resync(); });
  /* the list depends on who is signed in: admins also get hidden packs, and a class built in #/teach is listed only for its
     students and teaching team, so the list is fetched again whenever a different person signs in or out */
  document.addEventListener('DOMContentLoaded', () => { let who = null; if (App.auth && App.auth.onChange) App.auth.onChange(() => { const u = App.auth.user; const w = u ? `${u.id || u.email}:${u.admin ? 1 : 0}` : '-'; if (who !== null && w !== who) { lastSig = ''; sync(); } who = w; }); });
})(typeof window !== 'undefined' ? window : globalThis);
