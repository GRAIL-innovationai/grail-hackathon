/* ============================================================
   Bo's drawings: what he sketches on his board, next to the steps.
   In a reply a drawing is a line of a board page, "draw: {JSON}" (the JSON may run on over several lines, or sit
   in a ``` block under it); on a call it comes from his draw_on_board tool. One of:
     graph       functions of x (and parametric curves), points, shaded areas, segments and vectors, asymptotes,
                 notes, tangent and secant lines, Riemann sums, and sliders (a, b, k…) the student can drag
     numberline  points (open or closed) and intervals, to infinity or not (also written "x > 2", "[1, 4)")
     figure      shapes in his own coordinates: polygons, segments, arrows, circles, angles (right angles too),
                 points, text and boxes; the same scale both ways
     unitcircle  the unit circle with the special angles, and exact coordinates for the ones he points at
     table       a small table of values (cells may hold $TeX$)
     bars        a bar chart or histogram
     pie         a pie chart with each slice's share
     scatter     data with the least-squares line, r and r², residuals and a prediction
     boxplot     box plots, from the data (outliers found) or from five numbers, up to four on one axis
     normal      a normal curve with a shaded region, its area, and the mean ± 1, 2, 3 SD marked
     tree        a probability tree, up to three levels
     venn        two or three sets, counts in the regions, any region shaded ("A ∩ B'", "A ∪ B", "A only")
     flow        a process or an algorithm: boxes and decisions in order, arrows that loop back
   It is data, never code: functions are read by App.compileExpr (no eval), counts and sizes are capped, every
   label is escaped, and anything that does not make sense is left out. A model does not always write clean JSON,
   so what he writes is read the way he meant it (json() below: smart quotes, unquoted keys, trailing commas,
   LaTeX with one backslash, a reply cut short…), and shapes are taken as he is likely to write them (points as
   [x, y] or {x, y}, ranges as [a, b] or {min, max}, "y = \frac{1}{x}", "x²", "sin^2 x"…). He "draws" it like a
   marker on a whiteboard (stroke by stroke), unless motion is reduced.
   App.boDraw: parse(text | object) → a clean spec or null; html(spec, animate) → markup; plain(spec) → words;
   json(text) → the object he meant, or null; depth(text) → how many brackets are still open; value(text) → a number.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const esc = App.esc || (s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]));
  const TYPES = ['graph', 'numberline', 'figure', 'unitcircle', 'table', 'bars', 'pie', 'scatter', 'boxplot', 'normal', 'tree', 'venn', 'flow'];
  const COLORS = ['blue', 'red', 'green', 'purple', 'orange', 'gray'];
  const COLOR_ALIAS = { grey: 5, black: 5, violet: 3, pink: 1, yellow: 4, gold: 4, teal: 2, cyan: 0, navy: 0, brown: 4, magenta: 3 };
  let uid = 0;

  /* ---------- JSON the way models write it ----------
     In a code fence, with “smart” or 'single' quotes, unquoted keys, trailing or missing commas, comments, = for :,
     Python's True and None, Infinity, bare values (1/2, pi/4, x^2 - 3), LaTeX with one backslash ("\frac", "\theta":
     in strict JSON those would be a form feed and a tab), {{ doubled braces }}, or cut off before the end. */
  const TEX = new Set('frac tfrac dfrac theta tau times tan tanh text textbf textit textrm to top triangle tilde beta bar binom big bigg bigl bigr bigcup bigcap bmod boxed nu neq ne nabla neg not notin ni rho right rightarrow rangle rm rfloor rceil rvert forall flat'.split(' '));
  const BARE = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
  const ENDQ = { '"': '"', "'": "'", '“': '”“"', '”': '”“"', '‘': '’‘\'', '’': '’‘\'' };
  function json(text) {
    if (text && typeof text === 'object') return Array.isArray(text) ? null : text;
    const s = typeof text === 'string' ? text : ''; if (!s || s.length > 20000) return null;
    let i = s.indexOf('{'); if (i < 0) return null;
    const out = [], stack = []; let prev = '';   // prev: what came last (open, key, colon, value, comma)
    const top = () => { for (let k = stack.length - 1; k >= 0; k--) if (stack[k] !== 'x') return stack[k]; return ''; };
    const keyDue = () => top() === '{' && (prev === 'open' || prev === 'comma');
    const token = (j, raw) => {
      if (prev === 'value') { out.push(','); prev = 'comma'; }
      if (keyDue()) { out.push(JSON.stringify(String(raw))); prev = 'key'; return; }
      if (top() === '{' && prev === 'key') out.push(':');
      out.push(j); prev = 'value';
    };
    const close = () => {
      if (prev === 'comma') out.pop(); else if (prev === 'key') out.push(':null'); else if (prev === 'colon') out.push('null');
      out.push(stack.pop() === '{' ? '}' : ']'); prev = 'value';
    };
    const readStr = () => {
      const ends = ENDQ[s[i]]; let o = ''; i++;
      while (i < s.length) {
        const ch = s[i];
        if (ch === '\\') {
          const n = s[i + 1]; if (n === undefined) { i++; break; }
          if (n === '\\' || n === '"' || n === "'" || n === '/') { o += n; i += 2; continue; }
          if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(s.substr(i + 2, 4))) { o += String.fromCharCode(parseInt(s.substr(i + 2, 4), 16)); i += 6; continue; }
          const w = (/^[a-z]+/.exec(s.slice(i + 1, i + 16)) || [''])[0];
          if ('bfnrt'.includes(n) && !TEX.has(w)) { o += n === 'n' ? '\n' : n === 't' ? '\t' : ''; i += 2; continue; }
          o += '\\'; i++; continue;   // LaTeX: the backslash stays
        }
        if (ends.includes(ch)) { i++; return o; }
        o += ch === '\n' || ch === '\t' ? ch : ch < ' ' ? ' ' : ch; i++;
      }
      return o;
    };
    while (i < s.length) {
      const c = s[i];
      if (c <= ' ' || c === ' ') { i++; continue; }
      if (c === '/' && (s[i + 1] === '/' || s[i + 1] === '*')) { const line = s[i + 1] === '/'; const n = line ? s.indexOf('\n', i) : s.indexOf('*/', i + 2); i = n < 0 ? s.length : n + (line ? 0 : 2); continue; }
      if (c === '{' || c === '[') {
        if (c === '{' && prev === 'open' && stack[stack.length - 1] === '{') { stack.push('x'); i++; continue; }   // {{ … }}
        if (prev === 'value') { out.push(','); prev = 'comma'; }
        if (keyDue()) out.push('"_":'); else if (top() === '{' && prev === 'key') out.push(':');
        out.push(c); stack.push(c); prev = 'open'; i++; continue;
      }
      if (c === '}' || c === ']') { if (stack[stack.length - 1] === 'x') { stack.pop(); i++; continue; } if (!stack.length) break; close(); i++; if (!stack.length) break; continue; }
      if (c === ':' || c === '=') { if (prev === 'key') { out.push(':'); prev = 'colon'; } i++; continue; }
      if (c === ',' || c === ';') { if (prev === 'value') { out.push(','); prev = 'comma'; } i++; continue; }
      if (ENDQ[c]) { const v = readStr(); token(JSON.stringify(v), v); continue; }
      // a bare word, number or expression: up to , } ] or the end of the line (brackets inside it are kept)
      const kd = keyDue() || (top() === '{' && prev === 'value'); let j = i, d = 0;   // after a value with no comma: the next key
      while (j < s.length) {
        const ch = s[j];
        if (d === 0 && (',}]\n;"'.includes(ch) || (kd && ':={['.includes(ch)) || (ch === '/' && (s[j + 1] === '/' || s[j + 1] === '*')))) break;
        if (ch === '(' || ch === '{' || ch === '[') d++; else if (d > 0 && (ch === ')' || ch === '}' || ch === ']')) d--;
        j++;
      }
      const raw = s.slice(i, j).trim(); i = Math.max(j, i + 1);
      if (!raw) continue;
      if (kd) { token('', raw); continue; }
      token(BARE.test(raw) ? (Number.isFinite(+raw) ? String(+raw) : 'null') : /^(true|false|null)$/i.test(raw) ? raw.toLowerCase() : /^(none|nil|undefined|nan|[+-]?(inf|infinity|∞|oo))$/i.test(raw) ? 'null' : JSON.stringify(raw), raw);
    }
    while (stack.length) { if (stack[stack.length - 1] === 'x') { stack.pop(); continue; } close(); }
    try { const o = JSON.parse(out.join('')); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (e) { return null; }
  }
  /* how many { and [ are still open (outside strings): a drawing that goes on over the next lines */
  function depth(text) {
    const s = String(text || ''); let d = 0, q = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) { if (ch === '\\') i++; else if (q.includes(ch)) q = ''; continue; }
      if (ch === '"') q = '"'; else if (ch === '“') q = '”"'; else if (ch === '{' || ch === '[') d++; else if (ch === '}' || ch === ']') d--;
    }
    return d;
  }

  /* ---------- functions: LaTeX, Unicode and "y = …" become what App.compileExpr reads ---------- */
  const FN = ['arcsin', 'arccos', 'arctan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'exp', 'ln', 'log10', 'log2', 'log', 'sqrt', 'abs', 'cbrt', 'floor', 'ceil'];
  const WORDS = FN.concat(['pi', 'e', 'x', 't']).sort((a, b) => b.length - a.length);
  const SUPC = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+', '⁽': '(', '⁾': ')', 'ⁿ': 'n', 'ˣ': 'x' };
  function tidy(src) {
    let s = String(src).replace(/\$/g, ' ').replace(/[−–—]/g, '-').replace(/[·⋅∙×✕]/g, '*').replace(/÷/g, '/').replace(/\b(?:math|np|numpy)\./gi, '');
    s = s.replace(/^\s*(?:y|[a-zA-Z]\w*\s*\(\s*[a-zA-Z]\s*\))\s*=\s*/, '');   // "y =", "f(x) =", "y(t) ="
    s = s.replace(/\s*(?:,|;|\bfor\b|\bwhen\b|\bif\b|\bwhere\b)\s*[^,;]*(?:[<>≤≥]|\\[lg]eq?\b)[^,;]*$/i, '');   // ", x ≥ 0": the domain (read apart)
    s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺⁽⁾ⁿˣ]+/g, m => `^(${[...m].map(c => SUPC[c]).join('')})`);
    s = s.replace(/√/g, ' sqrt ').replace(/∛/g, ' cbrt ').replace(/π/g, ' pi ').replace(/θ/g, ' t ');
    s = s.replace(/\\left|\\right|\\[bB]igg?[lr]?|\\displaystyle/g, '').replace(/\\[lr]?[vV]ert\b|\\mid\b/g, '|').replace(/\\[,;:! ]/g, ' ').replace(/\\(?:mathrm|text|operatorname|mathit|rm)\s*\{([^{}]*)\}/g, ' $1 ');
    s = s.replace(/\\(?:cdot|times|ast)\b/g, '*').replace(/\\div\b/g, '/').replace(/\\pi\b/g, ' pi ').replace(/\\theta\b/g, ' t ');
    for (let k = 0; k < 12; k++) {   // innermost first: x^{2}, \sqrt{…}, \sqrt[3]{…}, \frac{…}{…}
      const t = s.replace(/([\^_])\{([^{}]*)\}/g, '$1($2)').replace(/\\sqrt\s*\[([^\[\]{}]*)\]\s*\{([^{}]*)\}/g, '(($2)^(1/($1)))').replace(/\\sqrt\s*\{([^{}]*)\}/g, ' sqrt($1)').replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))');
      if (t === s) break; s = t;
    }
    s = s.replace(/\\[dt]?frac\s*(\d)\s*(\d)/g, '(($1)/($2))');
    s = s.replace(/(^|[^a-z])\\?(sin|cos|tan)\s*\^\s*\(?\s*-\s*1\s*\)?/gi, '$1 a$2');   // sin⁻¹ x
    s = s.replace(/(^|[^a-z])\\?(sinh|cosh|tanh|sin|cos|tan|sec|csc|cot|ln|log)\s*\^\s*(\(\s*\d+\s*\)|\d+)\s*(\([^()]*\)|[a-z0-9.]+)/gi, (m, b, f, p, a) => `${b}(${f}(${a.replace(/^\(|\)$/g, '')}))^${p}`);   // sin²x
    s = s.replace(/\\?log\s*_\s*\(?\s*(\d+(?:\.\d+)?|e)\s*\)?/gi, (m, b) => b === '2' ? ' log2 ' : b === '10' ? ' log10 ' : b.toLowerCase() === 'e' ? ' ln ' : ` (1/ln(${b}))*ln `);
    s = s.replace(/\\([a-zA-Z]+)/g, ' $1 ').replace(/\\?\{/g, '(').replace(/\\?\}/g, ')').replace(/\[/g, '(').replace(/\]/g, ')');
    return s.toLowerCase();
  }
  // a, b, k… (sliders) become their values; function names, pi, e, x and t stay
  const subst = (s, P) => !P ? s : s.replace(/[a-z]+/g, run => { let o = '', i = 0; while (i < run.length) { const w = WORDS.find(n => run.startsWith(n, i)); if (w) { o += w; i += w.length; continue; } const c = run[i]; o += Object.prototype.hasOwnProperty.call(P, c) ? `(${P[c]})` : c; i++; } return o; });
  // the letters in an expression that are not x, t, e, pi or a function: parameters ("a x^2 + c"). Two unknown letters
  // side by side are a word, not parameters ("alert"), and then there are none
  const freeOf = f => { const out = new Set(); let word = false; tidy(String(f).slice(0, 200)).replace(/[a-z]+/g, run => { let i = 0, prev = false; while (i < run.length) { const w = WORDS.find(n => run.startsWith(n, i)); if (w) { i += w.length; prev = false; continue; } if (prev) word = true; out.add(run[i]); prev = true; i++; } return run; }); return word ? [] : [...out]; };
  function compile(f, P) {
    if ((typeof f !== 'string' && typeof f !== 'number') || !App.compileExpr) return null;
    const src = String(f).slice(0, 200); if (!src.trim()) return null;
    try { const fn = App.compileExpr(subst(tidy(src), P)); fn(0.5); return fn; } catch (e) { return null; }
  }
  /* a number from what he wrote: 3, "3", "pi/4", "\frac{1}{2}", "√2", "30%", "1,200", "a" (a slider); otherwise NaN */
  function value(v, P) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    if (typeof v !== 'string') return NaN;
    let s = v.trim().replace(/%$/, ''); if (!s || s.length > 60) return NaN;
    if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    if (BARE.test(s)) return +s;
    const f = compile(s, P); if (!f) return NaN;
    const a = f(0.37), b = f(1.91); return Number.isFinite(a) && Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a)) ? a : NaN;
  }
  const clamp = v => Math.max(-1e9, Math.min(1e9, v));
  const fin = v => Number.isFinite(value(v));
  const num = (v, d) => { const x = value(v); return Number.isFinite(x) ? clamp(x) : d; };
  /* a point: [x, y], {x, y}, "(x, y)" */
  function pair(v) {
    if (typeof v === 'string') { const m = /^\s*[(\[]?\s*([^,;()\[\]]+?(?:\([^()]*\))?[^,;()\[\]]*?)\s*[,;]\s*([^,;]+?)\s*[)\]]?\s*$/.exec(v); v = m ? [m[1], m[2]] : null; }
    else if (v && typeof v === 'object' && !Array.isArray(v)) v = [v.x ?? v[0], v.y ?? v[1]];
    if (!Array.isArray(v) || v.length < 2) return null;
    const a = value(v[0]), b = value(v[1]); return Number.isFinite(a) && Number.isFinite(b) ? [clamp(a), clamp(b)] : null;
  }
  /* a range: [a, b], {min, max}, {from, to}, "[a, b]", or its two ends given apart */
  function span(v, lo, hi) {
    let p = null;
    if (v && typeof v === 'object' && !Array.isArray(v)) p = pair([v.min ?? v.from ?? v.start ?? v.lo ?? v.low ?? v[0], v.max ?? v.to ?? v.end ?? v.hi ?? v.high ?? v[1]]);
    else if (v != null) p = pair(v);
    if (!p && lo != null && hi != null) p = pair([lo, hi]);
    return p && p[1] > p[0] ? p : null;
  }
  // an end of an interval: a number, or null when there is none (∞, "inf", left out); NaN when it makes no sense
  const endv = v => v == null || v === '' || (typeof v === 'string' && /^\s*[+-]?\s*(inf|infinity|∞|oo|\\infty)\s*$/i.test(v)) ? null : value(v);
  const str = (v, n = 60) => (typeof v === 'string' || typeof v === 'number') ? String(v).replace(/\t(?=[a-z])/g, '\\t').replace(/\f(?=[a-z])/g, '\\f').replace(/\x08(?=[a-z])/g, '\\b').replace(/\r(?=[a-z])/g, '\\r').replace(/\s+/g, ' ').trim().slice(0, n) : '';
  const list = (v, n) => Array.isArray(v) ? v.slice(0, n) : v != null && v !== false ? [v].slice(0, n) : [];
  const col = (v, i) => { const s = String(v || '').toLowerCase(); const k = COLORS.indexOf(s); return k >= 0 ? k : COLOR_ALIAS[s] != null ? COLOR_ALIAS[s] : i % 5; };
  // an object of named things ({"A": [1, 2]}) as a list, each with its name
  const named = (v, key) => v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v).map(([k, x]) => x && typeof x === 'object' && !Array.isArray(x) ? Object.assign({ [key]: k }, x) : { [key]: k, _v: x }) : v;

  /* "x > 2", "-1 < x ≤ 3", "[2, 5)", "(-∞, 4]" → { from, to, left, right } (null: no end) */
  function ineq(text) {
    const s = String(text || '').replace(/\$/g, '').replace(/\\le(q)?\b|≤|=</g, '<=').replace(/\\ge(q)?\b|≥|=>/g, '>=').replace(/\\infty|∞|infinity/gi, 'inf').replace(/[−–]/g, '-').trim();
    let m = /^([\[(])\s*([^,]+?)\s*,\s*([^,]+?)\s*([\])])$/.exec(s);
    if (m) { const a = endv(m[2]), b = endv(m[3]); return (a === null || Number.isFinite(a)) && (b === null || Number.isFinite(b)) && !(a === null && b === null) ? { from: a, to: b, left: m[1] === '(' ? 'open' : 'closed', right: m[4] === ')' ? 'open' : 'closed' } : null; }
    m = /^(.+?)\s*(<=|<)\s*[a-z]\s*(<=|<)\s*(.+)$/i.exec(s);
    if (m) { const a = value(m[1]), b = value(m[4]); return Number.isFinite(a) && Number.isFinite(b) && b >= a ? { from: a, to: b, left: m[2] === '<' ? 'open' : 'closed', right: m[3] === '<' ? 'open' : 'closed' } : null; }
    m = /^(.+?)\s*(>=|>)\s*[a-z]\s*(>=|>)\s*(.+)$/i.exec(s);
    if (m) { const a = value(m[4]), b = value(m[1]); return Number.isFinite(a) && Number.isFinite(b) && b >= a ? { from: a, to: b, left: m[3] === '>' ? 'open' : 'closed', right: m[2] === '>' ? 'open' : 'closed' } : null; }
    m = /^[a-z]\s*(<=|>=|<|>)\s*(.+)$/i.exec(s); let op, v;
    if (m) { op = m[1]; v = value(m[2]); } else { m = /^(.+?)\s*(<=|>=|<|>)\s*[a-z]$/i.exec(s); if (m) { op = { '<': '>', '>': '<', '<=': '>=', '>=': '<=' }[m[2]]; v = value(m[1]); } }
    if (!op || !Number.isFinite(v)) return null;
    return op[0] === '>' ? { from: v, to: null, left: op === '>' ? 'open' : 'closed', right: 'open' } : { from: null, to: v, left: 'open', right: op === '<' ? 'open' : 'closed' };
  }

  /* ---------- what kind of drawing: its type, a synonym, or what its keys say ---------- */
  const ALIAS = { plot: 'graph', function: 'graph', functions: 'graph', curve: 'graph', curves: 'graph', cartesian: 'graph', coordinate: 'graph', coordinates: 'graph', axes: 'graph', parametric: 'graph', line: 'graph', lines: 'graph', slope: 'graph', tangent: 'graph', riemann: 'graph', integral: 'graph', area: 'graph', derivative: 'graph', xy: 'graph',
    number: 'numberline', numline: 'numberline', interval: 'numberline', intervals: 'numberline', inequality: 'numberline', inequalities: 'numberline',
    geometry: 'figure', shape: 'figure', shapes: 'figure', diagram: 'figure', triangle: 'figure', polygon: 'figure', vector: 'figure', vectors: 'figure', freebody: 'figure', forces: 'figure', drawing: 'figure', picture: 'figure', circle: 'figure', sketch: 'figure', rectangle: 'figure', square: 'figure',
    unit: 'unitcircle', trig: 'unitcircle', trigcircle: 'unitcircle',
    values: 'table', tableofvalues: 'table', grid: 'table',
    bar: 'bars', barchart: 'bars', bargraph: 'bars', column: 'bars', columns: 'bars', histogram: 'bars', hist: 'bars', frequency: 'bars',
    piechart: 'pie', donut: 'pie', circlegraph: 'pie',
    scatterplot: 'scatter', regression: 'scatter', correlation: 'scatter', linearregression: 'scatter', bestfit: 'scatter', lineofbestfit: 'scatter',
    box: 'boxplot', boxandwhisker: 'boxplot', boxwhisker: 'boxplot', whisker: 'boxplot', fivenumber: 'boxplot', boxes: 'boxplot',
    bell: 'normal', bellcurve: 'normal', normalcurve: 'normal', normaldistribution: 'normal', gaussian: 'normal', zscore: 'normal', z: 'normal', distribution: 'normal',
    probabilitytree: 'tree', treediagram: 'tree', probtree: 'tree', probability: 'tree',
    venndiagram: 'venn', sets: 'venn', set: 'venn',
    flowchart: 'flow', process: 'flow', steps: 'flow', algorithm: 'flow', cycle: 'flow', pipeline: 'flow', chain: 'flow' };
  function typeOf(o) {
    const t = String(typeof o.type === 'string' ? o.type : typeof o.kind === 'string' ? o.kind : typeof o.chart === 'string' ? o.chart : '').toLowerCase().replace(/[^a-z]/g, '');
    if (TYPES.includes(t)) return t; if (ALIAS[t]) return ALIAS[t];
    const u = t.replace(/(diagram|chart|plot|graph|curve|line)s?$/, ''); if (u && TYPES.includes(u)) return u; if (u && ALIAS[u]) return ALIAS[u];
    if (o.slices) return 'pie'; if (o.sets) return 'venn'; if (o.boxes || o.q1 != null) return 'boxplot'; if (o.branches) return 'tree'; if (o.steps || o.nodes) return 'flow';
    if (o.intervals || o.interval || o.inequality) return 'numberline'; if (o.shapes) return 'figure'; if (o.rows) return 'table'; if (o.bars) return 'bars';
    if (o.mean != null && (o.sd != null || o.sigma != null || o.std != null)) return 'normal';
    if (o.fns || o.functions || o.f || o.fn || o.curves || o.tangent || o.riemann || o.equation || (typeof o.y === 'string' && !fin(o.y))) return 'graph';
    if (o.points) return o.fit || o.regression ? 'scatter' : 'graph';
    return '';
  }
  // {"drawing": {…}} or {"drawing": "{…}"}: the drawing inside
  function unwrap(o) {
    for (let k = 0; k < 3; k++) {
      if (TYPES.includes(String(o.type || '').toLowerCase())) return o;
      const w = o.drawing ?? o.draw ?? o.spec; if (!w) return o;
      const inner = typeof w === 'string' ? json(w) : w && typeof w === 'object' && !Array.isArray(w) ? w : null; if (!inner) return o;
      o = Object.assign({}, inner, inner.caption == null && o.caption != null ? { caption: o.caption } : {});
    }
    return o;
  }

  /* ---------- reading each kind ---------- */
  const MAKE = {};
  function pts(v, n, dc) {   // [[x, y], …], [{x, y, label}], {"A": [x, y]}, ["(1, 2)"]
    if (v && typeof v === 'object' && !Array.isArray(v)) v = v.x != null || v.at != null || v.xy != null ? [v] : named(v, 'label');
    if (v != null && !Array.isArray(v)) v = [v]; if (!Array.isArray(v)) return [];
    return v.slice(0, n).map(p => {
      if (p && p._v !== undefined) p = { at: p._v, label: p.label };
      if (Array.isArray(p) || typeof p === 'string') { const xy = pair(p); return xy ? { x: xy[0], y: xy[1], label: Array.isArray(p) ? str(p[2], 30) : '', open: false, c: dc } : null; }
      if (!p || typeof p !== 'object') return null;
      const xy = pair(p.at ?? p.xy ?? p.coords ?? p.point ?? p.pos ?? p.position) || pair([p.x, p.y]);
      return xy ? { x: xy[0], y: xy[1], label: str(p.label ?? p.name ?? p.text, 30), open: !!(p.open || p.hollow || p.empty || p.filled === false || p.style === 'open'), c: col(p.color ?? p.colour, dc) } : null;
    }).filter(Boolean);
  }
  function segs(v, n, arrow, c0 = 2) {
    if (v && !Array.isArray(v)) v = [v]; if (!Array.isArray(v)) return [];
    return v.slice(0, n).map((s, i) => {
      if (Array.isArray(s)) s = { from: s[0], to: s[1] };
      if (!s || typeof s !== 'object') return null;
      let a = pair(s.from ?? s.start ?? s.p1 ?? s.tail ?? s.a ?? (Array.isArray(s.points) ? s.points[0] : null)), b = pair(s.to ?? s.end ?? s.p2 ?? s.tip ?? s.b ?? (Array.isArray(s.points) ? s.points[1] : null));
      if (!a && fin(s.x1) && fin(s.y1)) a = [num(s.x1), num(s.y1)]; if (!b && fin(s.x2) && fin(s.y2)) b = [num(s.x2), num(s.y2)];
      const dv = pair(s.vector ?? s.v ?? s.d); if (!a && dv) a = [0, 0]; if (a && !b && dv) b = [a[0] + dv[0], a[1] + dv[1]];
      return a && b ? { from: a, to: b, label: str(s.label ?? s.name ?? s.text, 30), arrow: !!(arrow || s.arrow || /arrow|vector|ray|force/i.test(String(s.kind || s.type || ''))), dash: !!(s.dash || s.dashed), c: col(s.color ?? s.colour, i + c0) } : null;
    }).filter(Boolean);
  }
  function guides(v, axis) {   // dashed lines: [2, 3], [{x: 2, label}], ["x = 2"]
    return list(v, 6).map(g => {
      if (typeof g === 'string') { const m = /^\s*([xy])\s*=\s*(.+)$/i.exec(g); return m ? (m[1].toLowerCase() === axis ? { v: value(m[2]), label: '' } : null) : { v: value(g), label: '' }; }
      if (typeof g === 'number') return { v: g, label: '' };
      return g && typeof g === 'object' ? { v: value(g[axis] ?? g.at ?? g.value ?? g.v ?? g.pos), label: str(g.label ?? g.text ?? g.name, 30) } : null;
    }).filter(g => g && Number.isFinite(g.v)).map(g => ({ v: clamp(g.v), label: g.label }));
  }
  function asymptotes(a) {   // ["x = 2", "y = 1", "y = x + 1"], {vertical: [2], horizontal: [1]}, [{x: 2}, {y: 1}]
    if (a == null) return [];
    let L = [];
    if (Array.isArray(a) || typeof a !== 'object') L = [].concat(a);
    else for (const [k, ax] of [['vertical', 'x'], ['v', 'x'], ['x', 'x'], ['horizontal', 'y'], ['h', 'y'], ['y', 'y'], ['oblique', 'f'], ['slant', 'f']]) if (a[k] != null) [].concat(a[k]).forEach(v => L.push(v && typeof v === 'object' ? Object.assign({ axis: ax }, v) : ax === 'f' ? { axis: 'f', f: v } : { axis: ax, v }));
    return L.slice(0, 6).map(g => {
      if (typeof g === 'string') { const m = /^\s*([xy])\s*=\s*(.+)$/i.exec(g); if (!m) return null; const ax = m[1].toLowerCase(); const v = value(m[2]); return ax === 'y' && !Number.isFinite(v) ? { axis: 'f', f: m[2] } : { axis: ax, v }; }
      if (typeof g === 'number') return { axis: 'x', v: g };
      if (!g || typeof g !== 'object') return null;
      if (g.axis === 'f') return { axis: 'f', f: g.f ?? g.y, label: str(g.label, 30) };
      const kind = String(g.type || g.kind || ''); const ax = g.axis || (/^h/i.test(kind) ? 'y' : /^v/i.test(kind) ? 'x' : g.y != null && g.x == null ? 'y' : 'x');
      return { axis: ax, v: value(ax === 'y' ? g.y ?? g.v ?? g.value ?? g.at : g.x ?? g.v ?? g.value ?? g.at), label: str(g.label, 30) };
    }).filter(g => g && (g.axis === 'f' ? compile(g.f) : Number.isFinite(g.v)));
  }
  function sliders(o) {
    let v = o.sliders ?? o.slider ?? o.params ?? o.parameters;
    if (v && typeof v === 'object' && !Array.isArray(v)) v = v.name ? [v] : Object.entries(v).map(([name, s]) => Array.isArray(s) ? { name, min: s[0], max: s[1], value: s[2] } : s && typeof s === 'object' ? Object.assign({ name }, s) : { name, value: s });
    const seen = new Set();
    return list(v, 3).map(s => {
      if (typeof s === 'string') s = { name: s };
      if (!s || typeof s !== 'object') return null;
      const name = String(s.name ?? s.param ?? s.var ?? s.letter ?? s.symbol ?? '').trim().toLowerCase();
      if (!/^[a-z]$/.test(name) || 'ext'.includes(name) || seen.has(name)) return null; seen.add(name);
      const r = Array.isArray(s.range) ? s.range : [];
      const v0 = value(s.value ?? s.start ?? s.default ?? s.initial ?? s.init);
      let lo = value(s.min ?? s.from ?? r[0]), hi = value(s.max ?? s.to ?? r[1]);
      if (!Number.isFinite(lo)) lo = Number.isFinite(v0) ? v0 - 5 : -5; if (!Number.isFinite(hi)) hi = Number.isFinite(v0) ? v0 + 5 : 5;
      if (!(hi > lo)) return null;
      let step = value(s.step); const whole = name === 'n' || s.integer === true || s.whole === true;
      if (!(step > 0) || (hi - lo) / step > 2000) step = whole ? 1 : niceStep(hi - lo, 100);
      let val = Number.isFinite(v0) ? v0 : lo <= 1 && hi >= 1 ? 1 : (lo + hi) / 2; val = Math.max(lo, Math.min(hi, val));
      return { name, min: lo, max: hi, step, value: val, label: str(s.label, 30) };
    }).filter(Boolean);
  }
  const hasF = o => o.f != null || o.fn != null || o.function != null || o.expr != null || o.equation != null;
  function curves(o, P) {
    let v = o.fns ?? o.functions ?? o.curves ?? o.equations ?? o.graphs ?? o.plots;
    const single = o.f ?? o.fn ?? o.function ?? o.expr ?? o.expression ?? o.equation ?? (typeof o.y === 'string' && !fin(o.y) && !(typeof o.x === 'string' && !fin(o.x)) ? o.y : undefined);
    if (v == null && single != null) v = [{ f: single, label: o.label, domain: o.domain, color: o.color }];
    if (v == null && typeof o.x === 'string' && typeof o.y === 'string' && !fin(o.x) && !fin(o.y)) v = [{ x: o.x, y: o.y, t: o.t, label: o.label }];   // a parametric curve, written at the top
    if (v == null) return [];
    if (typeof v === 'string') v = v.split(/\s*;\s*/);
    if (!Array.isArray(v)) v = typeof v === 'object' && v.f == null && v.y == null && v.fn == null && v.expr == null && v.x == null ? named(v, 'label').map(g => g._v !== undefined ? { f: g._v, label: g.label } : g) : [v];
    return v.slice(0, 6).map((g, i) => {
      if (typeof g === 'string' || typeof g === 'number') g = { f: g };
      if (!g || typeof g !== 'object') return null;
      let f = g.f ?? g.fn ?? g.function ?? g.expr ?? g.expression ?? g.equation ?? g.formula, xt = g.x ?? g.xt, yt = g.y ?? g.yt;
      if (f == null && typeof yt === 'string' && !(typeof xt === 'string' && !fin(xt))) { f = yt; xt = yt = null; }
      const par = f == null && typeof xt === 'string' && typeof yt === 'string';
      const fs = par ? '' : str(f, 160), xs = par ? str(xt, 160) : '', ys = par ? str(yt, 160) : '';
      if (par ? !(compile(xs, P) && compile(ys, P)) : !compile(fs, P)) return null;
      let dom = span(g.domain ?? g.interval ?? g.xrange);
      if (!dom && (fin(g.from) || fin(g.to))) dom = [fin(g.from) ? num(g.from) : -1e9, fin(g.to) ? num(g.to) : 1e9];
      if (!dom && !par) { const m = /(?:,|;|\bfor\b|\bwhen\b|\bif\b|\bwhere\b)\s*([^,;]*(?:[<>≤≥]|\\[lg]eq?\b)[^,;]*)$/i.exec(String(f)); const q = m && ineq(m[1]); if (q) dom = [q.from === null ? -1e9 : q.from, q.to === null ? 1e9 : q.to]; }
      return { f: fs, xt: xs, yt: ys, t: span(g.t ?? g.trange ?? g.tRange), label: str(g.label ?? g.name ?? g.title, 40), domain: dom, c: col(g.color ?? g.colour, i), dash: !!(g.dash || g.dashed || g.style === 'dashed') };
    }).filter(Boolean);
  }
  const fnOf = (t, fns) => t.f ?? t.fn ?? t.of ?? t.function ?? (fns[0] ? fns[0].f || null : null);
  const raw = v => typeof v === 'number' ? v : str(v, 40);
  MAKE.graph = (o, sp) => {
    sp.sliders = sliders(o);
    if (!sp.sliders.length) {   // "a x^2 + c" with no sliders: a and c get one each, so the drawing still comes out
      const raw0 = [o.f, o.fn, o.function, o.expr, o.equation, typeof o.y === 'string' ? o.y : null].concat(list(o.fns ?? o.functions ?? o.curves, 6).map(g => typeof g === 'string' ? g : g && typeof g === 'object' ? g.f ?? g.fn ?? g.expr ?? (typeof g.y === 'string' ? g.y : null) : null)).filter(x => typeof x === 'string');
      const free = [...new Set([].concat(...raw0.map(freeOf)))];
      if (free.length && free.length <= 3 && free.every(c => /^[a-df-su-wyz]$/.test(c))) sp.sliders = free.map(name => ({ name, min: -5, max: 5, step: 0.1, value: 1, label: '' }));
    }
    const P = sp.sliders.length ? Object.fromEntries(sp.sliders.map(s => [s.name, s.value])) : null; sp.params = P;
    sp.fns = curves(o, P);
    const A = asymptotes(o.asymptotes ?? o.asymptote);
    A.filter(a => a.axis === 'f').slice(0, 2).forEach(a => sp.fns.push({ f: str(a.f, 160), xt: '', yt: '', t: null, label: a.label || `y = ${str(a.f, 30)}`, domain: null, c: 5, dash: true }));
    sp.points = pts(o.points ?? o.dots ?? o.marks, 30, 1);
    sp.segments = segs(o.segments ?? o.lines, 20).concat(segs(o.vectors ?? o.arrows, 8, true));
    const sh0 = o.shade ?? o.area ?? o.fill; const sh = Array.isArray(sh0) ? sh0[0] : sh0;
    if (sh && typeof sh === 'object') {
      let f = sh.f ?? sh.fn ?? sh.top ?? sh.upper ?? sh.under ?? sh.below ?? sh.curve ?? sh.y, g = sh.g ?? sh.bottom ?? sh.lower ?? sh.base;
      if (Array.isArray(sh.between)) { f = sh.between[0]; g = sh.between[1]; }
      if (f == null && sp.fns[0]) f = sp.fns[0].f || null;
      const r = Array.isArray(sh.x ?? sh.domain ?? sh.interval) ? (sh.x ?? sh.domain ?? sh.interval) : [];
      const a = sh.from ?? sh.a ?? sh.start ?? sh.left ?? r[0], b = sh.to ?? sh.b ?? sh.end ?? sh.right ?? r[1];
      const ok = x => x == null || Number.isFinite(value(x, P));
      sp.shade = compile(f, P) && (g == null || compile(g, P)) && ok(a) && ok(b) && !(Number.isFinite(value(a, P)) && Number.isFinite(value(b, P)) && value(b, P) <= value(a, P)) ? { f: str(f, 160), g: g == null ? '0' : str(g, 160), from: a == null ? null : raw(a), to: b == null ? null : raw(b), c: col(sh.color, 0) } : null;
    } else sp.shade = null;
    const added = new Set(sp.fns.map(g => g.f));
    const need = f => { const s = str(f, 160); if (s && !added.has(s) && sp.fns.length < 6) { added.add(s); sp.fns.push({ f: s, xt: '', yt: '', t: null, label: '', domain: null, c: sp.fns.length % 5, dash: false }); } };
    sp.tangents = list(o.tangent ?? o.tangents, 3).map(t => {
      if (typeof t !== 'object' || Array.isArray(t)) t = { at: Array.isArray(t) ? t[0] : t };
      if (!t) return null; let at = t.at ?? t.x ?? t.x0 ?? t.a ?? t.point; if (Array.isArray(at)) at = at[0];
      const f = fnOf(t, sp.fns); if (!f || !compile(f, P) || !Number.isFinite(value(at, P))) return null; need(f);
      return { f: str(f, 160), at: raw(at), label: t.label === false ? false : str(t.label, 40), c: col(t.color, 1) };
    }).filter(Boolean);
    sp.secants = list(o.secant ?? o.secants, 2).map(t => {
      if (!t || typeof t !== 'object') return null; const f = fnOf(t, sp.fns); const a = t.from ?? t.a ?? t.x1 ?? (Array.isArray(t.at) ? t.at[0] : null), b = t.to ?? t.b ?? t.x2 ?? (Array.isArray(t.at) ? t.at[1] : null);
      if (!f || !compile(f, P) || !Number.isFinite(value(a, P)) || !Number.isFinite(value(b, P))) return null; need(f);
      return { f: str(f, 160), from: raw(a), to: raw(b), label: t.label === false ? false : str(t.label, 40), c: col(t.color, 4) };
    }).filter(Boolean);
    const R0 = o.riemann ?? o.rectangles ?? o.sum;
    if (R0 && typeof R0 === 'object') {
      const f = fnOf(R0, sp.fns); const a = R0.from ?? R0.a ?? R0.start, b = R0.to ?? R0.b ?? R0.end, n = R0.n ?? R0.count ?? R0.rects ?? R0.rectangles ?? 4;
      const rule = String(R0.rule ?? R0.method ?? R0.type ?? R0.kind ?? R0.side ?? 'left').toLowerCase();
      if (f && compile(f, P) && Number.isFinite(value(a, P)) && Number.isFinite(value(b, P)) && Number.isFinite(value(n, P))) { need(f); sp.riemann = { f: str(f, 160), from: raw(a), to: raw(b), n: raw(n), rule: /trap/.test(rule) ? 'trap' : /mid/.test(rule) ? 'mid' : /right|upper/.test(rule) ? 'right' : 'left', c: col(R0.color, 2) }; }
    }
    sp.vlines = guides(o.vlines ?? o.vertical, 'x').concat(A.filter(a => a.axis === 'x').map(a => ({ v: clamp(a.v), label: a.label || `x = ${fmt(a.v)}` })));
    sp.hlines = guides(o.hlines ?? o.horizontal, 'y').concat(A.filter(a => a.axis === 'y').map(a => ({ v: clamp(a.v), label: a.label || `y = ${fmt(a.v)}` })));
    sp.notes = list(o.notes ?? o.labels ?? o.texts ?? o.annotations, 10).map(n => { if (Array.isArray(n)) n = { x: n[0], y: n[1], text: n[2] }; if (!n || typeof n !== 'object') return null; const xy = pair(n.at ?? n.xy ?? n.pos) || pair([n.x, n.y]); const t = str(n.text ?? n.label ?? n.note, 40); return xy && t ? { x: xy[0], y: xy[1], text: t } : null; }).filter(Boolean);
    sp.x = span(o.x ?? o.xrange ?? o.xRange ?? o.xaxis ?? (o.window && o.window.x), o.xmin ?? o.xMin ?? o.x_min, o.xmax ?? o.xMax ?? o.x_max) || (hasF(o) ? null : span(o.domain));
    sp.y = span(o.y ?? o.yrange ?? o.yRange ?? o.yaxis ?? o.range ?? (o.window && o.window.y), o.ymin ?? o.yMin ?? o.y_min, o.ymax ?? o.yMax ?? o.y_max);
    sp.equal = !!(o.equal || o.square || o.aspect === 'equal'); sp.xlabel = str(o.xlabel ?? o.xLabel ?? o.x_label, 24); sp.ylabel = str(o.ylabel ?? o.yLabel ?? o.y_label, 24);
    if (sp.fns.length > 1 && sp.fns.length <= 3) sp.fns.forEach(g => { if (!g.label && g.f && g.f.length <= 22) g.label = `y = ${g.f}`; });   // two or three curves: which is which
    return sp.fns.length || sp.points.length || sp.segments.length;
  };
  MAKE.numberline = (o, sp) => {
    let I = o.intervals ?? o.interval ?? o.ranges ?? o.inequality ?? o.inequalities ?? o.solution;
    if (I == null && ('from' in o || 'to' in o)) I = [{ from: o.from, to: o.to, left: o.left, right: o.right, open: o.open }];
    sp.intervals = list(I, 4).map((v, i) => {
      if (typeof v === 'string') { const q = ineq(v); return q ? Object.assign(q, { c: col(null, i) }) : null; }
      if (Array.isArray(v)) v = { from: v[0], to: v[1] };
      if (!v || typeof v !== 'object') return null;
      const txt = v.text ?? v.expr ?? v.inequality ?? v.set; if (typeof txt === 'string') { const q = ineq(txt); if (q) return Object.assign(q, { c: col(v.color, i) }); }
      const a = endv(v.from ?? v.start ?? v.min ?? v.a ?? v.lo), b = endv(v.to ?? v.end ?? v.max ?? v.b ?? v.hi);
      if (Number.isNaN(a) || Number.isNaN(b) || (a === null && b === null)) return null;
      const both = v.open === true || v.open === 'both' ? 'open' : v.closed === true ? 'closed' : null;
      const side = (x, flagOpen, flagIn) => typeof x === 'string' ? (/open|\(|\)|exclu|hollow/i.test(x) ? 'open' : 'closed') : typeof x === 'boolean' ? (x ? 'closed' : 'open') : flagOpen ? 'open' : flagIn === false ? 'open' : flagIn === true ? 'closed' : both || 'closed';
      return { from: a === null ? null : clamp(a), to: b === null ? null : clamp(b), left: side(v.left ?? v.leftEnd, v.leftOpen || v.openLeft || v.open === 'left', v.includeLeft ?? v.leftClosed), right: side(v.right ?? v.rightEnd, v.rightOpen || v.openRight || v.open === 'right', v.includeRight ?? v.rightClosed), c: col(v.color, i) };
    }).filter(Boolean);
    sp.points = list(o.points, 16).map(p => typeof p === 'number' || typeof p === 'string' ? { x: value(p), label: '', open: false, c: 0 } : p && typeof p === 'object' ? { x: value(p.x ?? p.at ?? p.value), label: str(p.label ?? p.text, 24), open: !!(p.open || p.hollow || p.filled === false), c: col(p.color, 0) } : null).filter(p => p && Number.isFinite(p.x)).map(p => Object.assign(p, { x: clamp(p.x) }));
    const xs = sp.points.map(p => p.x).concat(...sp.intervals.map(v => [v.from, v.to].filter(x => x !== null)));
    let lo = fin(o.min) ? num(o.min) : (xs.length ? Math.min(...xs) - 2 : -5), hi = fin(o.max) ? num(o.max) : (xs.length ? Math.max(...xs) + 2 : 5);
    const r = span(o.range ?? o.x); if (r) [lo, hi] = r;
    if (!(hi > lo)) { lo -= 1; hi += 1; }
    sp.min = lo; sp.max = hi; sp.step = fin(o.step) && num(o.step) > 0 && (hi - lo) / num(o.step) <= 40 ? num(o.step) : 0;
    return sp.points.length || sp.intervals.length;
  };
  const SHAPE = { point: 'point', dot: 'point', vertex: 'point', segment: 'segment', line: 'segment', side: 'segment', edge: 'segment', arrow: 'arrow', vector: 'arrow', ray: 'arrow', force: 'arrow', polygon: 'polygon', triangle: 'polygon', poly: 'polygon', quadrilateral: 'polygon', curve: 'curve', polyline: 'curve', path: 'curve', circle: 'circle', angle: 'angle', text: 'text', label: 'text', note: 'text', rect: 'rect', rectangle: 'rect', box: 'rect', square: 'rect' };
  MAKE.figure = (o, sp) => {
    let S = o.shapes ?? o.objects ?? o.items ?? o.elements;
    if (S == null && (o.polygon || o.triangle || o.vertices)) S = [{ kind: 'polygon', points: o.polygon ?? o.triangle ?? o.vertices, labels: o.labels }];
    if (S == null && SHAPE[String(o.type || o.kind || '').toLowerCase()]) S = [Object.assign({}, o, { kind: o.kind || o.type })];   // one shape, written as the drawing
    sp.shapes = list(S, 60).map(s => {
      if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
      let kind = SHAPE[String(s.kind ?? s.type ?? s.shape ?? '').toLowerCase()]; if (!kind) return null;
      const vs = s.points ?? s.vertices ?? s.corners; if (kind === 'rect' && Array.isArray(vs)) kind = 'polygon';
      const c = col(s.color ?? s.colour, kind === 'arrow' ? 1 : 0);
      const base = { kind, label: str(s.label ?? s.name, 30), c, dash: !!(s.dash || s.dashed), fill: !!(s.fill || s.filled || s.shade) };
      if (kind === 'point' || kind === 'text') { const at = pair(s.at ?? s.position ?? s.pos ?? s.center) || pair([s.x, s.y]); return at ? Object.assign(base, { at, text: str(s.text, 50) }) : null; }
      if (kind === 'segment' || kind === 'arrow') { const g = segs([s], 1, kind === 'arrow')[0]; return g ? Object.assign(base, { from: g.from, to: g.to }) : null; }
      if (kind === 'polygon' || kind === 'curve') { const P = list(vs, 24).map(pair).filter(Boolean); return P.length >= 2 ? Object.assign(base, { points: P, labels: list(s.labels ?? s.names, 24).map(x => str(x, 12)) }) : null; }
      if (kind === 'circle') { const c0 = pair(s.center ?? s.centre ?? s.at) || pair([s.x, s.y]); const r = num(s.r ?? s.radius, 0); return c0 && r > 0 ? Object.assign(base, { center: c0, r }) : null; }
      if (kind === 'angle') { const at = pair(s.at ?? s.vertex), a = pair(s.from ?? s.p1), b = pair(s.to ?? s.p2); return at && a && b ? Object.assign(base, { at, from: a, to: b, right: !!(s.right || s.square) }) : null; }
      if (kind === 'rect') { const at = pair(s.at ?? s.corner ?? s.position) || pair([s.x, s.y]); const w = num(s.w ?? s.width ?? s.size, 0), h = num(s.h ?? s.height ?? s.size, 0); return at && w > 0 && h > 0 ? Object.assign(base, { at, w, h, text: str(s.text, 40) }) : null; }
      return null;
    }).filter(Boolean);
    return sp.shapes.length;
  };
  MAKE.table = (o, sp) => {
    let head = o.head ?? o.headers ?? o.header ?? o.columns ?? o.cols, rows = o.rows ?? o.data ?? o.body ?? o.values;
    if (head && typeof head === 'object' && !Array.isArray(head)) { const ks = Object.keys(head).slice(0, 6); const n = Math.max(0, ...ks.map(k => Array.isArray(head[k]) ? head[k].length : 0)); rows = Array.from({ length: Math.min(n, 12) }, (_, r) => ks.map(k => (head[k] || [])[r])); head = ks; }
    if (Array.isArray(rows) && rows.length && rows[0] && typeof rows[0] === 'object' && !Array.isArray(rows[0])) { const ks = Array.isArray(head) && head.length ? head.map(String) : Object.keys(rows[0]); rows = rows.map(r => ks.map(k => r && typeof r === 'object' ? r[k] : '')); head = ks; }
    const cell = x => str(x === true ? '✓' : x === false ? '✗' : x && typeof x === 'object' ? x.text ?? x.label ?? '' : x, 60);
    sp.head = list(head, 6).map(cell);
    sp.rows = list(rows, 12).map(r => Array.isArray(r) ? r.slice(0, 6).map(cell) : [cell(r)]).filter(r => r.some(Boolean));
    return sp.rows.length;
  };
  // values given with their labels apart ([3, 5], labels: ["A", "B"]) or as a map ({"A": 3})
  function entries(v, labels) {
    if (Array.isArray(v) && v.length && !v.some(b => b && typeof b === 'object')) return v.map((x, k) => ({ value: x, label: Array.isArray(labels) ? labels[k] : '' }));
    if (v && typeof v === 'object' && !Array.isArray(v)) return Object.entries(v).map(([label, value]) => ({ label, value }));
    return Array.isArray(v) ? v : [];
  }
  MAKE.bars = (o, sp) => {
    const B = entries(o.bars ?? o.data ?? o.values ?? o.items ?? o.counts ?? o.frequencies, o.labels ?? o.categories ?? o.bins ?? (Array.isArray(o.x) ? o.x : null));
    sp.bars = B.slice(0, 24).map(b => Array.isArray(b) ? { label: str(b[0], 14), value: value(b[1]) } : b && typeof b === 'object' ? { label: str(b.label ?? b.name ?? b.category ?? b.bin ?? b.x, 14), value: value(b.value ?? b.count ?? b.y ?? b.n ?? b.freq ?? b.frequency ?? b.height) } : null).filter(b => b && Number.isFinite(b.value)).map(b => Object.assign(b, { value: clamp(b.value) }));
    sp.hist = !!(o.hist ?? o.histogram) || /hist/i.test(String(o.type || ''));
    sp.ylabel = str(o.ylabel ?? o.yLabel, 24); sp.xlabel = str(o.xlabel ?? o.xLabel, 24);
    const hl = o.highlight ?? o.mark; sp.mark = typeof hl === 'string' && !fin(hl) ? sp.bars.findIndex(b => b.label.toLowerCase() === hl.toLowerCase()) : fin(hl) ? Math.round(num(hl)) : -1;
    return sp.bars.length && !sp.bars.every(b => b.value === 0);
  };
  MAKE.pie = (o, sp) => {
    let L = entries(o.slices ?? o.data ?? o.values ?? o.parts ?? o.items ?? o.bars, o.labels ?? o.categories).slice(0, 12).map(b => Array.isArray(b) ? { label: str(b[0], 16), value: value(b[1]) } : b && typeof b === 'object' ? { label: str(b.label ?? b.name ?? b.category, 16), value: value(b.value ?? b.count ?? b.share ?? b.percent ?? b.n ?? b.p) } : null).filter(b => b && b.value > 0);
    if (L.length > 6) { L.sort((a, b) => b.value - a.value); L = L.slice(0, 5).concat({ label: 'Other', value: L.slice(5).reduce((a, b) => a + b.value, 0) }); }
    sp.slices = L; const hl = o.highlight ?? o.mark; sp.mark = typeof hl === 'string' && !fin(hl) ? L.findIndex(b => b.label.toLowerCase() === hl.toLowerCase()) : fin(hl) ? Math.round(num(hl)) : -1;
    return L.length >= 2;
  };
  MAKE.normal = (o, sp) => {
    sp.mean = num(o.mean ?? o.mu ?? o['μ'] ?? o.average ?? o.center, 0); sp.sd = num(o.sd ?? o.sigma ?? o['σ'] ?? o.std ?? o.stdev ?? o.stddev, 1); if (!(sp.sd > 0)) return false;
    const sh = o.shade ?? o.region ?? o.area; let a = o.from ?? o.lower ?? o.low ?? o.left, b = o.to ?? o.upper ?? o.high ?? o.right;
    let has = ['from', 'to', 'lower', 'upper', 'low', 'high', 'left', 'right'].some(k => k in o);
    if (sh && typeof sh === 'object' && !Array.isArray(sh)) { a = sh.from ?? sh.lower ?? sh.a; b = sh.to ?? sh.upper ?? sh.b; has = true; }
    else if (Array.isArray(sh)) { a = sh[0]; b = sh[1]; has = true; } else if (typeof sh === 'string') { const q = ineq(sh); if (q) { a = q.from; b = q.to; has = true; } }
    const ea = endv(a), eb = endv(b); sp.from = Number.isFinite(ea) ? clamp(ea) : null; sp.to = Number.isFinite(eb) ? clamp(eb) : null;
    sp.shade = has && !(Number.isNaN(ea) && Number.isNaN(eb));
    sp.both = /both|two/i.test(String(o.tails ?? o.tail ?? '')) && (sp.from !== null || sp.to !== null);
    sp.area = o.showArea !== false && sh !== false;
    sp.label = str(o.label ?? o.xlabel, 30); sp.marks = list(o.marks, 4).map(m => m && typeof m === 'object' && fin(m.x) ? { x: num(m.x), label: str(m.label, 20) } : fin(m) ? { x: num(m), label: '' } : null).filter(Boolean);
    return true;
  };
  MAKE.tree = (o, sp) => {
    const node = (b, d) => b && typeof b === 'object' ? { label: str(b.label ?? b.name ?? b.event ?? b.outcome, 16), p: str(b.p ?? b.prob ?? b.probability, 12), result: str(b.result ?? b.end ?? b.final ?? b.leaf, 24), children: d < 3 ? list(b.children ?? b.branches ?? b.next ?? b.then, 4).map(c => node(c, d + 1)).filter(Boolean) : [] } : null;
    sp.root = str(typeof o.root === 'string' ? o.root : '', 16); sp.branches = list(o.branches ?? o.children ?? (o.root && typeof o.root === 'object' ? o.root.children ?? o.root.branches : null) ?? o.tree, 4).map(b => node(b, 1)).filter(Boolean);
    const leaves = n => n.children.length ? n.children.reduce((s, c) => s + leaves(c), 0) : 1;
    return sp.branches.length && sp.branches.reduce((s, b) => s + leaves(b), 0) <= 16;
  };
  const deg = v => { if (typeof v === 'number') return v; const s = String(v ?? '').trim(); if (!s) return NaN; if (/π|pi/i.test(s)) return value(s) * 180 / Math.PI; return value(s.replace(/°|\s*deg(rees)?$/i, '')); };
  const n360 = d => { const r = Math.round(((d % 360) + 360) % 360 * 1e6) / 1e6; return r === 360 ? 0 : r; };
  MAKE.unitcircle = (o, sp) => {
    const A = o.angles ?? o.points;
    sp.angles = (Array.isArray(A) ? A : A == null || A === 'all' || A === true ? [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330] : [A]).slice(0, 24).map(deg).filter(Number.isFinite).map(n360);
    sp.hi = list(o.highlight ?? o.angle ?? o.show ?? o.theta ?? o.mark, 2).map(deg).filter(Number.isFinite).map(n360);
    sp.hi.forEach(d => { if (!sp.angles.some(a => Math.abs(a - d) < 1e-6)) sp.angles.push(d); });
    sp.angles = sp.angles.filter((d, k, a) => a.findIndex(x => Math.abs(x - d) < 1e-6) === k).sort((a, b) => a - b);
    const u = String(o.labels ?? o.units ?? o.unit ?? ''); sp.units = /deg/i.test(u) ? 'deg' : /none|off|^no/i.test(u) ? 'none' : 'rad';
    sp.coords = !!(o.coords ?? o.coordinates);
    return sp.angles.length;
  };
  function lsq(P) {   // the least-squares line y = a + bx, and r
    const n = P.length; const mx = P.reduce((s, p) => s + p.x, 0) / n, my = P.reduce((s, p) => s + p.y, 0) / n;
    let sxx = 0, syy = 0, sxy = 0; P.forEach(p => { sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; sxy += (p.x - mx) * (p.y - my); });
    if (sxx < 1e-12) return null; const b = sxy / sxx; return { a: my - b * mx, b, r: syy > 1e-12 ? sxy / Math.sqrt(sxx * syy) : NaN, n };
  }
  MAKE.scatter = (o, sp) => {
    let P = o.points ?? o.data ?? o.pairs; if (P == null && Array.isArray(o.x) && Array.isArray(o.y)) P = o.x.map((x, k) => [x, o.y[k]]);
    sp.points = pts(P, 80, 0); if (sp.points.length < 2) return false;
    const want = o.fit ?? o.line ?? o.regression ?? o.trend ?? o.bestfit ?? true;
    sp.fit = want !== false && want !== 'none' ? lsq(sp.points) : null;
    sp.residuals = !!(o.residuals ?? o.residual); sp.showR = o.r !== false;
    const pr = value(o.predict ?? o.estimate ?? o.at); sp.predict = Number.isFinite(pr) ? clamp(pr) : null;
    sp.x = span(o.xrange ?? o.xRange ?? (Array.isArray(o.y) ? null : o.x), o.xmin, o.xmax); sp.y = span(o.yrange ?? o.yRange ?? (Array.isArray(o.x) ? null : o.y), o.ymin, o.ymax);
    sp.xlabel = str(o.xlabel ?? o.xLabel, 24); sp.ylabel = str(o.ylabel ?? o.yLabel, 24);
    return true;
  };
  function five(d) {   // the five numbers (Q1 and Q3: the medians of the lower and upper halves); whiskers end at the last values inside 1.5 IQR
    const s = d.slice().sort((a, b) => a - b), n = s.length; const med = a => a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
    const lower = s.slice(0, Math.floor(n / 2)), upper = s.slice(Math.ceil(n / 2)); const q1 = med(lower.length ? lower : s), q3 = med(upper.length ? upper : s), iqr = q3 - q1;
    const inside = s.filter(v => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
    return { min: s[0], q1, med: med(s), q3, max: s[n - 1], lo: inside[0], hi: inside[inside.length - 1], out: s.filter(v => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr).slice(0, 30), n };
  }
  MAKE.boxplot = (o, sp) => {
    let B = o.boxes ?? o.groups ?? o.plots ?? o.datasets;
    if (B == null) B = Array.isArray(o.data ?? o.values) ? [{ data: o.data ?? o.values, label: o.name }] : o.q1 != null || o.median != null ? [o] : null;
    if (B && typeof B === 'object' && !Array.isArray(B)) B = Object.entries(B).map(([label, d]) => Array.isArray(d) ? { label, data: d } : Object.assign({ label }, d));
    sp.boxes = list(B, 4).map(b => {
      if (Array.isArray(b)) b = { data: b };
      if (!b || typeof b !== 'object') return null;
      const D = Array.isArray(b.data ?? b.values) ? (b.data ?? b.values).slice(0, 400).map(v => value(v)).filter(Number.isFinite) : [];
      let f;
      if (D.length >= 2) f = five(D);
      else { const v = [b.min, b.q1 ?? b.Q1, b.median ?? b.med ?? b.q2 ?? b.Q2, b.q3 ?? b.Q3, b.max].map(x => value(x)); if (!v.every(Number.isFinite)) return null; v.sort((p, q) => p - q); f = { min: v[0], q1: v[1], med: v[2], q3: v[3], max: v[4], lo: v[0], hi: v[4], out: [], n: 0 }; }
      if (Array.isArray(b.outliers)) f.out = f.out.concat(b.outliers.map(x => value(x)).filter(Number.isFinite)).slice(0, 30);
      return Object.assign(f, { label: str(b === o ? '' : b.label ?? b.name, 14) });
    }).filter(Boolean);
    sp.xlabel = str(o.xlabel ?? o.label ?? o.axis, 30); sp.x = span(o.x ?? o.range, o.xmin, o.xmax);
    return sp.boxes.length;
  };
  /* Venn regions are numbers: bit k set = inside set k (A = 1, B = 2, C = 4); 0 is outside them all */
  function venn(expr, names) {   // "A ∩ B'", "A only", "B - A", "neither" → the regions where it holds, or null
    let s = String(expr ?? '').replace(/\$/g, ' ').trim(); const n = names.length; if (!s) return null;
    if (/^(none|neither|outside|nothing|out|rest|other|not any)$/i.test(s)) return [0];
    if (/^(all|everything|universe|u|s)$/i.test(s) && !names.some(x => x.toLowerCase() === s.toLowerCase())) return Array.from({ length: 1 << n }, (_, m) => m);
    const only = /\bonly\b/i.test(s); s = s.replace(/\bonly\b/ig, ' ');
    s = s.replace(/\\cap|∩|⋂|&|\band\b|\bintersect(?:ion)?\b/gi, ' & ').replace(/\\cup|∪|⋃|\||\+|\bor\b|\bunion\b/gi, ' | ').replace(/\\setminus|\\backslash|∖|−|\bminus\b|\bbut not\b|\bwithout\b/gi, ' - ').replace(/\\/g, ' - ')
      .replace(/\^\s*\{?\s*c\s*\}?|\^\s*\(\s*c\s*\)|ᶜ|[’′'`]|\\prime/g, " ' ").replace(/\bnot\b|¬|~/gi, ' ! ');
    const byLen = names.map((x, k) => [x.toLowerCase(), k]).sort((a, b) => b[0].length - a[0].length); const toks = []; let i = 0;
    while (i < s.length) {
      const c = s[i]; if (/\s/.test(c)) { i++; continue; }
      if ('&|-\'!()'.includes(c)) { toks.push(c); i++; continue; }
      const low = s.slice(i).toLowerCase(); const hit = byLen.find(([w]) => w && low.startsWith(w) && !/[a-z0-9]/i.test(s[i + w.length] || ''));
      if (hit) { toks.push(hit[1]); i += hit[0].length; continue; }
      const k = 'ABC'.indexOf(c.toUpperCase()); const nextLetter = s[i + 1] || '';
      if (k >= 0 && k < n && (!/[a-z]/i.test(nextLetter) || (/[A-C]/.test(c) && /[A-C]/.test(nextLetter)))) { toks.push(k); i++; continue; }
      return null;
    }
    // "AB", "A(B ∪ C)", "A'B": side by side means both
    const T = []; toks.forEach((t, k) => { const p = T[T.length - 1]; if (k && (typeof t === 'number' || t === '(' || t === '!') && (typeof p === 'number' || p === ')' || p === "'")) T.push('&'); T.push(t); });
    let j = 0; const used = new Set(); let pure = true;
    const peek = () => T[j];
    function E() { let l = D(); while (peek() === '|') { j++; const r = D(), a = l; l = m => a(m) || r(m); pure = false; } return l; }
    function D() { let l = I(); while (peek() === '-') { j++; const r = I(), a = l; l = m => a(m) && !r(m); pure = false; } return l; }
    function I() { let l = U(); while (peek() === '&') { j++; const r = U(), a = l; l = m => a(m) && r(m); } return l; }
    function U() { if (peek() === '!') { j++; const r = U(); pure = false; return m => !r(m); } let a = Atom(); while (peek() === "'") { j++; const b = a; a = m => !b(m); pure = false; } return a; }
    function Atom() { const t = T[j++]; if (typeof t === 'number') { used.add(t); return m => !!(m & (1 << t)); } if (t === '(') { const e = E(); if (T[j++] !== ')') throw 0; return e; } throw 0; }
    let f; try { f = E(); if (j < T.length) return null; } catch (e) { return null; }
    if (only) return pure ? [[...used].reduce((m, k) => m | (1 << k), 0)] : null;
    return Array.from({ length: 1 << n }, (_, m) => m).filter(f);
  }
  // a region for a count: "A" (A only), "AB", "A∩B", "neither"; or any expression that is one region
  function region(key, names) {
    const s = String(key).trim(); if (/^(none|neither|outside|nothing|out|rest|other)$/i.test(s)) return 0;
    const r = venn(/\bonly\b/i.test(s) ? s : s + ' only', names); if (r && r.length === 1) return r[0];
    const e = venn(s, names); return e && e.length === 1 ? e[0] : null;
  }
  MAKE.venn = (o, sp) => {
    let S = o.sets ?? o.circles ?? o.groups; if (S && typeof S === 'object' && !Array.isArray(S)) S = Object.keys(S);
    sp.sets = list(S, 3).map(s => str(s && typeof s === 'object' ? s.label ?? s.name : s, 18)).filter(Boolean); if (sp.sets.length < 2) return false;
    const sh = new Set(); list(o.shade ?? o.shaded ?? o.highlight ?? o.region, 8).forEach(e => (venn(e, sp.sets) || []).forEach(m => sh.add(m))); sp.shade = [...sh];
    const V = o.values ?? o.counts ?? o.regions ?? o.numbers ?? o.elements ?? o.items ?? o.labels; sp.values = {};
    if (V && typeof V === 'object' && !Array.isArray(V)) Object.entries(V).slice(0, 12).forEach(([k, v]) => { const m = region(k, sp.sets); if (m != null && m < (1 << sp.sets.length)) sp.values[m] = str(Array.isArray(v) ? v.join(', ') : v, 24); });
    sp.universe = str(o.universe ?? o.U ?? o.u ?? o.total ?? o.S, 20);
    return true;
  };
  MAKE.flow = (o, sp) => {
    sp.steps = list(o.steps ?? o.nodes ?? o.boxes ?? o.stages ?? o.items, 8).map(s => {
      if (typeof s === 'string' || typeof s === 'number') s = { text: s };
      if (!s || typeof s !== 'object') return null;
      const text = str(s.text ?? s.label ?? s.name ?? s.title, 90), k = String(s.kind ?? s.type ?? s.shape ?? '');
      return text ? { text, kind: /dec|cond|if|question|diamond|choice|\?/i.test(k) || (!k && /\?\s*$/.test(text)) ? 'decision' : /start|begin|end|stop|terminal|finish|done/i.test(k) ? 'end' : 'box', note: str(s.note ?? s.yes ?? s.arrow ?? s.edge, 16) } : null;
    }).filter(Boolean);
    const n = sp.steps.length; let L = o.loops ?? o.loop ?? o.back ?? o.arrows; if (L === true) L = null;
    const nums = list(L, 2).map(l => Array.isArray(l) ? l : l && typeof l === 'object' ? [l.from, l.to] : []); const zero = nums.some(p => p.some(x => typeof x !== 'string' && value(x) === 0));
    const idx = v => { if (typeof v === 'string' && !fin(v)) return sp.steps.findIndex(s => s.text.toLowerCase() === v.trim().toLowerCase()); const k = Math.round(value(v)); return Number.isFinite(k) ? k - (zero ? 0 : 1) : -1; };
    sp.loops = list(L, 2).map(l => { if (Array.isArray(l)) l = { from: l[0], to: l[1] }; if (!l || typeof l !== 'object') return null; const a = idx(l.from), b = idx(l.to); return a >= 0 && a < n && b >= 0 && b < n && a !== b ? { from: a, to: b, label: str(l.label ?? l.text ?? l.note, 22) } : null; }).filter(Boolean);
    if ((o.cycle === true || o.loop === true || o.repeat === true) && n > 1 && sp.loops.length < 2) sp.loops.push({ from: n - 1, to: 0, label: '' });
    sp.dir = /right|across|horizontal|row/i.test(String(o.dir ?? o.direction ?? o.layout ?? '')) && n <= 3 ? 'right' : 'down';
    return n >= 2;
  };

  function parse(input) {
    let o = typeof input === 'string' ? json(input) : input;
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    o = unwrap(o);
    const type = typeOf(o); if (!type) return null;
    const sp = { type, caption: str(o.caption ?? o.title ?? (typeof o.note === 'string' ? o.note : ''), 160) };
    try { return MAKE[type] && MAKE[type](o, sp) ? sp : null; } catch (e) { return null; }
  }

  /* ---------- labels: a little TeX becomes plain symbols (x^2 → x², \theta → θ) ---------- */
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', n: 'ⁿ', x: 'ˣ', i: 'ⁱ', '(': '⁽', ')': '⁾', t: 'ᵗ', k: 'ᵏ' };
  const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', n: 'ₙ', x: 'ₓ', i: 'ᵢ', a: 'ₐ', o: 'ₒ', k: 'ₖ', t: 'ₜ' };
  const SYM = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ', tau: 'τ', phi: 'φ', omega: 'ω', Omega: 'Ω', infty: '∞', cdot: '·', times: '×', div: '÷', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', pm: '±', to: '→', rightarrow: '→', circ: '°', degree: '°', sqrt: '√', int: '∫', angle: '∠', perp: '⊥', parallel: '∥', in: '∈', cup: '∪', cap: '∩', hat: '', bar: '' };
  const script = (x, map, mark) => [...x].every(ch => map[ch]) ? [...x].map(ch => map[ch]).join('') : mark + (x.length > 1 ? `(${x})` : x);
  function pretty(s) {
    let t = String(s || '').replace(/\$/g, '');
    t = t.replace(/\\(?:text|mathrm|operatorname|mathbf)\{([^{}]*)\}/g, '$1').replace(/\\left|\\right|\\,|\\;|\\!|\\ /g, m => m === '\\ ' || m === '\\,' || m === '\\;' ? ' ' : '');
    t = t.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (m, a, b) => `${/^[\w.]+$/.test(a) ? a : `(${a})`}/${/^[\w.]+$/.test(b) ? b : `(${b})`}`);
    t = t.replace(/\\sqrt\{([^{}]*)\}/g, (m, a) => /^[\w.]+$/.test(a) ? `√${a}` : `√(${a})`);
    t = t.replace(/\\([A-Za-z]+)/g, (m, w) => SYM[w] !== undefined ? SYM[w] : w);
    t = t.replace(/\^\{([^{}]*)\}/g, (m, x) => script(x, SUP, '^')).replace(/\^([0-9a-z+\-−])/gi, (m, x) => script(x, SUP, '^'));
    t = t.replace(/_\{([^{}]*)\}/g, (m, x) => script(x, SUB, '_')).replace(/_([0-9a-z])/gi, (m, x) => script(x, SUB, '_'));
    t = t.replace(/\b(theta|alpha|beta|lambda|sigma|mu|Delta|delta|omega|phi)\b/g, w => SYM[w]).replace(/\bpi\b/g, 'π').replace(/\binfinity\b/gi, '∞');
    t = t.replace(/<=/g, '≤').replace(/>=/g, '≥').replace(/!=/g, '≠').replace(/\bsqrt\(/g, '√(').replace(/(\d)\s*\*\s*(\w)/g, '$1$2').replace(/\*/g, '·');
    return t.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  }
  const lab = s => esc(pretty(s));

  /* ---------- numbers on the axes ---------- */
  function niceStep(span, want) { const raw = span / Math.max(1, want); const p = Math.pow(10, Math.floor(Math.log10(raw))); const m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
  const decimals = step => Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9)));
  const fmt = (v, step) => { const d = step ? decimals(step) : 2; let s = Math.abs(v) < 1e-12 ? '0' : (+v.toFixed(d)).toString(); if (Math.abs(v) >= 1e5 || (Math.abs(v) > 0 && Math.abs(v) < 1e-4)) s = (+v.toPrecision(3)).toExponential().replace('e+', 'e'); return s.replace('-', '−'); };
  // n significant figures (more for big numbers, so 12345 is not 1.23e4)
  const sig = (v, n = 3) => { if (!Number.isFinite(v)) return '?'; if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v)).replace('-', '−'); const a = Math.abs(v); const s = a >= 1e6 || a < 1e-3 ? (+v.toPrecision(n)).toExponential().replace('e+', 'e') : String(+v.toPrecision(Math.max(n, Math.floor(Math.log10(a)) + 1))); return s.replace('-', '−'); };
  const approx = (v, n = 3) => (Math.abs(v - +v.toPrecision(n)) > 1e-9 * Math.max(1, Math.abs(v)) ? '≈ ' : '= ') + sig(v, n);
  const ticks = (a, b, step) => { const out = []; const k0 = Math.ceil(a / step - 1e-9), k1 = Math.floor(b / step + 1e-9); for (let k = k0; k <= k1 && out.length < 41; k++) out.push(+(k * step).toFixed(10)); return out; };
  const r1 = v => Math.round(v * 10) / 10;

  /* ---------- SVG pieces: every stroke is drawn in order (--i), labels appear after it ---------- */
  function Ink() {
    let i = 0; const parts = [];
    const add = s => { parts.push(s); return s; };
    return {
      next() { return i++; },
      path(d, cls, c, o = {}) { const n = o.i != null ? o.i : i++; return add(`<path d="${d}" class="${cls}${c != null ? ' bd-c' + c : ''}${o.dash ? ' bd-dash bd-pop' : ' bd-ink'}" pathLength="1" style="--i:${n}"${o.extra || ''}/>`); },
      fill(d, c, n, cls = 'bd-fill') { return add(`<path d="${d}" class="${cls} bd-c${c} bd-pop" style="--i:${n != null ? n : i}"/>`); },
      dot(x, y, c, open, n) { return add(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${open ? 4.2 : 4.6}" class="bd-dot bd-c${c}${open ? ' open' : ''} bd-pop" style="--i:${n != null ? n : i}"/>`); },
      text(x, y, t, cls, o = {}) { if (!t) return ''; return add(`<text x="${r1(x)}" y="${r1(y)}" class="${cls}${o.c != null ? ' bd-c' + o.c : ''} bd-pop"${o.anchor ? ` text-anchor="${o.anchor}"` : ''} style="--i:${o.i != null ? o.i : Math.max(0, i - 1)}"${o.rot ? ` transform="rotate(${o.rot} ${r1(x)} ${r1(y)})"` : ''}>${t}</text>`); },
      lines(x, y, ls, cls, o = {}) { if (!ls.length) return ''; const lh = o.lh || 15; return add(`<text x="${r1(x)}" y="${r1(y)}" class="${cls}${o.c != null ? ' bd-c' + o.c : ''} bd-pop"${o.anchor ? ` text-anchor="${o.anchor}"` : ''} style="--i:${o.i != null ? o.i : Math.max(0, i - 1)}">${ls.map((l, k) => `<tspan x="${r1(x)}"${k ? ` dy="${lh}"` : ''}>${l}</tspan>`).join('')}</text>`); },
      raw(s) { return add(s); },
      out() { return parts.join(''); }
    };
  }
  const M = (x, y) => `M${r1(x)} ${r1(y)}`, L = (x, y) => `L${r1(x)} ${r1(y)}`;
  function head(ink, x0, y0, x1, y1, c, n) {   // an arrowhead at (x1, y1), pointing away from (x0, y0)
    const a = Math.atan2(y1 - y0, x1 - x0), s = 9;
    const p = (da) => [x1 - s * Math.cos(a + da), y1 - s * Math.sin(a + da)];
    const [ax, ay] = p(0.45), [bx, by] = p(-0.45);
    ink.raw(`<path d="${M(ax, ay)}${L(x1, y1)}${L(bx, by)}" class="bd-head ${c == null ? 'bd-axhead' : 'bd-c' + c} bd-pop" style="--i:${n}"/>`);
  }
  const svgOpen = (w, h, title, id) => `<svg viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${id}" xmlns="http://www.w3.org/2000/svg"><title id="${id}">${esc(title)}</title>`;
  const circ = (x, y, r) => `${M(x + r, y)}A${r1(r)} ${r1(r)} 0 1 0 ${r1(x - r)} ${r1(y)}A${r1(r)} ${r1(r)} 0 1 0 ${r1(x + r)} ${r1(y)}`;
  const tw = t => pretty(t).length * 7.2 + 4;   // about how wide a label is
  function wrap(t, n) {   // words into lines of about n characters (at most four)
    const out = []; let cur = '';
    String(t).split(/\s+/).forEach(w => { if (!w) return; if (cur && (cur + ' ' + w).length > n) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; });
    if (cur) out.push(cur); if (out.length > 4) { out.length = 4; out[3] = out[3].slice(0, n - 1) + '…'; } return out;
  }
  // the part of a line inside a box (pixels): Liang–Barsky
  function clipTo(b, x0, y0, x1, y1) {
    let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
    for (const [p, q] of [[-dx, x0 - b[0]], [dx, b[2] - x0], [-dy, y0 - b[1]], [dy, b[3] - y0]]) { if (p === 0) { if (q < 0) return null; continue; } const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; } }
    return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
  }

  /* ---------- graph ---------- */
  function where(fns) {   // where his functions are defined, when that is not everywhere (√x, ln x, √(4 − x²))
    const ff = fns.filter(g => !g.par); if (!ff.length) return null;
    let lo = Infinity, hi = -Infinity, gaps = 0;
    for (let k = 0; k <= 400; k++) { const x = -10 + k / 20; if (ff.some(g => Number.isFinite(g.fn(x)))) { lo = Math.min(lo, x); hi = Math.max(hi, x); } else gaps++; }
    return gaps && hi > lo && hi - lo <= 19 ? [lo, Math.min(hi, lo + 12)] : null;
  }
  const slope = (f, a) => App.d1 ? App.d1(f, a) : (f(a + 1e-5) - f(a - 1e-5)) / 2e-5;
  function riemann(Rm, P) {
    const f = compile(Rm.f, P), a = value(Rm.from, P), b = value(Rm.to, P); let n = Math.round(value(Rm.n, P));
    if (!f || !(b > a) || !(n >= 1)) return null; n = Math.min(n, 100); const h = (b - a) / n; const rects = []; let sum = 0;
    for (let k = 0; k < n; k++) {
      const l = a + k * h, r = l + h;
      if (Rm.rule === 'trap') { const yl = f(l), yr = f(r); if (!Number.isFinite(yl) || !Number.isFinite(yr)) continue; rects.push({ l, r, yl, yr }); sum += (yl + yr) / 2 * h; }
      else { const s = Rm.rule === 'right' ? r : Rm.rule === 'mid' ? l + h / 2 : l; const y = f(s); if (!Number.isFinite(y)) continue; rects.push({ l, r, yl: y, yr: y }); sum += y * h; }
    }
    return { rects, sum, n, a, b, rule: Rm.rule, c: Rm.c };
  }
  function graph(sp, id) {
    const W = 360, H = 250, pl = 30, pr = 14, pt = 14, pb = 24; const P = sp.params || null; const ev = v => v == null ? NaN : value(v, P);
    const fns = sp.fns.map(g => {
      if (g.xt && g.yt) { const fx = compile(g.xt, P), fy = compile(g.yt, P); return fx && fy ? Object.assign({}, g, { par: true, fx, fy }) : null; }
      const f = compile(g.f, P); return f ? Object.assign({}, g, { fn: f }) : null;
    }).filter(Boolean);
    const sh = sp.shade ? { f: compile(sp.shade.f, P), g: compile(sp.shade.g, P), from: ev(sp.shade.from), to: ev(sp.shade.to), c: sp.shade.c } : null;
    const tans = (sp.tangents || []).map(t => { const f = compile(t.f, P), a = ev(t.at); if (!f || !Number.isFinite(a)) return null; const y = f(a), m = slope(f, a); return Number.isFinite(y) && Number.isFinite(m) ? { a, y, m, label: t.label, c: t.c } : null; }).filter(Boolean);
    const secs = (sp.secants || []).map(s => { const f = compile(s.f, P), a = ev(s.from), b = ev(s.to); if (!f || !Number.isFinite(a) || !Number.isFinite(b) || a === b) return null; const ya = f(a), yb = f(b); return Number.isFinite(ya) && Number.isFinite(yb) ? { a, b, ya, yb, m: (yb - ya) / (b - a), label: s.label, c: s.c } : null; }).filter(Boolean);
    const rs = sp.riemann ? riemann(sp.riemann, P) : null;
    // the x range: what he asked for, or what holds his points, segments, shading and lines
    const xs = [].concat(sp.points.map(p => p.x), ...sp.segments.map(s => [s.from[0], s.to[0]]), sh ? [sh.from, sh.to].filter(Number.isFinite) : [], sp.vlines.map(v => v.v), ...fns.filter(g => g.domain).map(g => g.domain.filter(v => Math.abs(v) < 1e8)), tans.map(t => t.a), ...secs.map(s => [s.a, s.b]), rs ? [rs.a, rs.b] : []);
    fns.filter(g => g.par).forEach(g => { const [t0, t1] = g.t || [0, 2 * Math.PI]; for (let k = 0; k <= 240; k++) { const t = t0 + (t1 - t0) * k / 240; const X = g.fx(t), Y = g.fy(t); if (Number.isFinite(X) && Number.isFinite(Y)) xs.push(X); } });
    let x0, x1;
    if (sp.x) [x0, x1] = sp.x;
    else {
      const dom = xs.length ? null : where(fns);
      [x0, x1] = xs.length ? [Math.min(...xs), Math.max(...xs)] : dom || [-5, 5];
      if (x1 - x0 < 1e-9) { x0 -= 2; x1 += 2; } const pad = (x1 - x0) * (dom ? 0.08 : xs.length ? 0.25 : 0); x0 -= pad; x1 += pad;   // nothing to hold: −5 to 5
      if (x0 > 0 && x0 < (x1 - x0) * 0.6) x0 = -(x1 - x0) * 0.06; if (x1 < 0 && -x1 < (x1 - x0) * 0.6) x1 = (x1 - x0) * 0.06;
    }
    // sample the curves; the y range is what most of them cover
    const N = 320; const curves = fns.map(g => {
      if (g.par) { const [t0, t1] = g.t || [0, 2 * Math.PI]; const pts = []; for (let k = 0; k <= N; k++) { const t = t0 + (t1 - t0) * k / N; pts.push([g.fx(t), g.fy(t)]); } return pts; }
      const a = g.domain ? Math.max(x0, g.domain[0]) : x0, b = g.domain ? Math.min(x1, g.domain[1]) : x1; const pts = [];
      if (b > a) for (let k = 0; k <= N; k++) { const x = a + (b - a) * k / N; pts.push([x, g.fn(x)]); }
      return pts;
    });
    let [y0, y1] = sp.y || (() => {
      const ys = [].concat(...curves.map(c => c.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[0] >= x0 && p[0] <= x1).map(p => p[1])), sp.points.map(p => p.y), ...sp.segments.map(s => [s.from[1], s.to[1]]), sp.hlines.map(h => h.v), sp.notes.map(n => n.y), tans.map(t => t.y), ...secs.map(s => [s.ya, s.yb]), rs ? [0] : []);
      if (!ys.length) return [-5, 5];
      const s = ys.slice().sort((a, b) => a - b); const q = p => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
      let lo = s.length > 40 ? q(0.03) : s[0], hi = s.length > 40 ? q(0.97) : s[s.length - 1];
      sp.points.forEach(p => { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); });
      if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
      const pad = (hi - lo) * 0.14; lo -= pad; hi += pad;
      if (lo > 0 && lo < (hi - lo) * 0.7) lo = -(hi - lo) * 0.05; if (hi < 0 && -hi < (hi - lo) * 0.7) hi = (hi - lo) * 0.05;
      return [lo, hi];
    })();
    if (sp.equal) { const kx = (W - pl - pr) / (x1 - x0), ky = (H - pt - pb) / (y1 - y0); if (kx > ky) { const m = (x0 + x1) / 2, h = (W - pl - pr) / ky / 2; x0 = m - h; x1 = m + h; } else { const m = (y0 + y1) / 2, h = (H - pt - pb) / kx / 2; y0 = m - h; y1 = m + h; } }
    if (sp.sliders && sp.sliders.length) { sp.x = [x0, x1]; sp.y = [y0, y1]; }   // the axes stay put while the student drags a slider
    const X = x => pl + (x - x0) / (x1 - x0) * (W - pl - pr), Y = y => pt + (y1 - y) / (y1 - y0) * (H - pt - pb);
    const box = [pl, pt, W - pr, H - pb];
    const ink = Ink(); const clip = `${id}-c`;
    ink.raw(`<defs><clipPath id="${clip}"><rect x="${pl}" y="${pt}" width="${W - pl - pr}" height="${H - pt - pb}"/></clipPath></defs>`);
    // the grid and the axes
    const sx = niceStep(x1 - x0, 8), sy = niceStep(y1 - y0, 6); const tx = ticks(x0, x1, sx), ty = ticks(y0, y1, sy);
    ink.raw(`<g class="bd-grid">${tx.map(v => `<path d="${M(X(v), pt)}${L(X(v), H - pb)}"/>`).join('')}${ty.map(v => `<path d="${M(pl, Y(v))}${L(W - pr, Y(v))}"/>`).join('')}</g>`);
    const ax = Y(Math.min(Math.max(0, y0), y1)), ay = X(Math.min(Math.max(0, x0), x1)); const n0 = ink.next();
    ink.path(`${M(pl, ax)}${L(W - pr + 4, ax)}`, 'bd-axis', null, { i: n0 }); ink.path(`${M(ay, H - pb)}${L(ay, pt - 4)}`, 'bd-axis', null, { i: n0 });
    const lblX = tx.filter(v => Math.abs(X(v) - ay) > 6 || ay <= pl + 1), lblY = ty.filter(v => Math.abs(Y(v) - ax) > 6);
    const every = (arr, max) => arr.filter((v, k) => arr.length <= max || k % Math.ceil(arr.length / max) === 0);
    const taken = [];   // label boxes already on the page: {x: centre, y: baseline, w}
    every(lblX, 9).forEach(v => { const t = fmt(v, sx), y = Math.min(H - 6, ax + 14); ink.text(X(v), y, t, 'bd-tick', { anchor: 'middle', i: n0 }); taken.push({ x: X(v), y, w: t.length * 6.2 }); });
    every(lblY, 7).forEach(v => { const t = fmt(v, sy), x = Math.max(ay - 5, 24); ink.text(x, Y(v) + 3.5, t, 'bd-tick', { anchor: 'end', i: n0 }); taken.push({ x: x - t.length * 3.1, y: Y(v) + 3.5, w: t.length * 6.2 }); });
    if (sp.xlabel) { ink.text(W - pr, ax - 6, lab(sp.xlabel), 'bd-axl', { anchor: 'end', i: n0 }); const w = tw(sp.xlabel); taken.push({ x: W - pr - w / 2, y: ax - 6, w }); }
    if (sp.ylabel) { ink.text(ay + 6, pt + 8, lab(sp.ylabel), 'bd-axl', { i: n0 }); const w = tw(sp.ylabel); taken.push({ x: ay + 6 + w / 2, y: pt + 8, w }); }
    const yc = v => Math.max(y0 - (y1 - y0), Math.min(y1 + (y1 - y0), v));
    // the shaded area (under the curves)
    if (sh && sh.f && sh.g) {
      const a = Math.max(x0, Number.isFinite(sh.from) ? sh.from : x0), b = Math.min(x1, Number.isFinite(sh.to) ? sh.to : x1); const up = [], dn = [];
      if (b > a) for (let k = 0; k <= 120; k++) { const x = a + (b - a) * k / 120; const fy = sh.f(x), gy = sh.g(x); if (Number.isFinite(fy) && Number.isFinite(gy)) { up.push([X(x), Y(yc(fy))]); dn.push([X(x), Y(yc(gy))]); } }
      if (up.length > 1) ink.raw(`<g clip-path="url(#${clip})"><path d="${up.map((p, k) => (k ? L : M)(p[0], p[1])).join('')}${dn.reverse().map(p => L(p[0], p[1])).join('')}Z" class="bd-fill bd-c${sh.c} bd-pop" style="--i:${ink.next()}"/></g>`);
    }
    // Riemann rectangles (or trapezoids), under the curve
    if (rs && rs.rects.length) { const n = ink.next(); ink.raw(`<g clip-path="url(#${clip})">${rs.rects.map(r => `<path d="${M(X(r.l), Y(yc(0)))}${L(X(r.l), Y(yc(r.yl)))}${L(X(r.r), Y(yc(r.yr)))}${L(X(r.r), Y(yc(0)))}Z" class="bd-rbox bd-c${rs.c} bd-pop" style="--i:${n}"/>`).join('')}</g>`); }
    // the curves: a gap where a function jumps (an asymptote) or is undefined
    const spanY = y1 - y0; const labels = [];
    curves.forEach((pts, k) => {
      const g = fns[k]; let d = '', pen = false, prev = null;
      pts.forEach(p => {
        const ok = Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[1] - (y0 + y1) / 2) < spanY * 20;
        if (!ok) { pen = false; prev = null; return; }
        if (prev && !g.par && Math.abs(p[1] - prev[1]) > spanY * 1.5) pen = false;
        d += (pen ? L : M)(X(p[0]), Y(p[1])); pen = true; prev = p;
      });
      if (!d) return; const n = ink.next();
      ink.raw(`<g clip-path="url(#${clip})">`); ink.path(d, 'bd-curve', g.c, { i: n, dash: g.dash }); ink.raw('</g>');
      if (g.label) { const vis = pts.filter(p => Number.isFinite(p[1]) && p[1] > y0 && p[1] < y1 && p[0] >= x0 && p[0] <= x1); const at = [0.88, 0.78, 0.66, 0.54, 0.42, 0.3, 0.18, 0.08].map(f => vis[Math.floor(vis.length * f)]).filter(Boolean).map(p => [X(p[0]), Y(p[1])]); if (at.length) labels.push({ at, t: g.label, c: g.c, n }); }
    });
    // tangent and secant lines: straight across the plot
    const across = (a, y, m) => clipTo(box, X(x0), Y(y + m * (x0 - a)), X(x1), Y(y + m * (x1 - a)));
    const straight = []; tans.forEach(t => { const s = across(t.a, t.y, t.m); if (s) straight.push({ s, c: t.c, n: ink.next(), t }); }); secs.forEach(t => { const s = across(t.a, t.ya, t.m); if (s) straight.push({ s, c: t.c, n: ink.next(), sec: t }); });
    straight.forEach(l => ink.path(`${M(l.s[0], l.s[1])}${L(l.s[2], l.s[3])}`, 'bd-seg', l.c, { i: l.n }));
    // where labels can go: as far as possible from the curves and from labels already placed
    // what is drawn: the curves, the axes, the dashed lines, the segments, the straight lines, the rectangles and the points
    const ink2 = []; curves.forEach(pts => pts.forEach(p => { if (Number.isFinite(p[1]) && p[1] >= y0 && p[1] <= y1 && p[0] >= x0 && p[0] <= x1) ink2.push([X(p[0]), Y(p[1])]); }));
    const line = (a, b, c, d) => { const s = clipTo([pl - 20, pt - 20, W - pr + 20, H - pb + 20], a, b, c, d); if (!s) return; const n = Math.max(2, Math.min(200, Math.ceil(Math.hypot(s[2] - s[0], s[3] - s[1]) / 6))); for (let k = 0; k <= n; k++) ink2.push([s[0] + (s[2] - s[0]) * k / n, s[1] + (s[3] - s[1]) * k / n]); };
    line(pl, ax, W - pr, ax); line(ay, pt, ay, H - pb);
    sp.vlines.forEach(v => { if (v.v >= x0 && v.v <= x1) line(X(v.v), pt, X(v.v), H - pb); }); sp.hlines.forEach(v => { if (v.v >= y0 && v.v <= y1) line(pl, Y(v.v), W - pr, Y(v.v)); });
    sp.segments.forEach(g => line(X(g.from[0]), Y(g.from[1]), X(g.to[0]), Y(g.to[1]))); sp.points.forEach(q => ink2.push([X(q.x), Y(q.y)]));
    straight.forEach(l => line(l.s[0], l.s[1], l.s[2], l.s[3]));
    if (rs && rs.rects.length <= 40) rs.rects.forEach(r => { line(X(r.l), Y(yc(r.yl)), X(r.r), Y(yc(r.yr))); line(X(r.l), Y(yc(0)), X(r.l), Y(yc(r.yl))); });
    // how good a spot is for a label box (x..x+w, baseline y, about 13px tall): clear of the ink, and never on
    // top of another label (that costs the most); -100 if it would leave the plot
    const room = (x, y, w) => {
      if (x < pl || x + w > W - pr || y - 11 < pt - 2 || y + 2 > H - pb + 2) return -100;
      let c = 1e9, t = 1e9;
      for (const q of ink2) { const dx = Math.max(0, x - q[0], q[0] - (x + w)), dy = Math.max(0, (y - 11) - q[1], q[1] - (y + 2)); c = Math.min(c, Math.hypot(dx, dy)); }
      for (const o of taken) { const dx = Math.max(0, Math.abs(o.x - (x + w / 2)) - (w + o.w) / 2), dy = Math.max(0, Math.abs(o.y - y) - 13); t = Math.min(t, Math.hypot(dx, dy)); }
      return Math.min(c, 18) + (t < 1 ? -40 : Math.min(t, 18));
    };
    const best = (cands, w) => cands.reduce((b, c, k) => { const r = room(c.x, c.y, w) - k * 0.3; return r > b.r ? Object.assign({ r }, c) : b; }, { r: -1e9 });
    const place = (t, cands, o, far) => { const w = tw(t); let b = best(cands, w); if (far && b.r < 8) { const f = best(far, w); if (f.r > b.r) b = f; } if (b.r <= -90) return; taken.push({ x: b.x + w / 2, y: b.y, w }); ink.text(b.x, b.y, lab(t), 'bd-lab', Object.assign({}, o)); };   // far: places to try when nothing near is clear
    const corners = w => [{ x: pl + 6, y: pt + 14 }, { x: W - pr - 6 - w, y: pt + 14 }, { x: pl + 6, y: H - pb - 8 }, { x: W - pr - 6 - w, y: H - pb - 8 }];
    const around = (px, py, w) => [{ x: px + 8, y: py - 8 }, { x: px - 8 - w, y: py - 8 }, { x: px + 8, y: py + 17 }, { x: px - 8 - w, y: py + 17 }, { x: px - w / 2, y: py - 13 }, { x: px - w / 2, y: py + 22 }, { x: px + 11, y: py + 4 }, { x: px - 11 - w, y: py + 4 }, { x: px + 14, y: py - 22 }, { x: px - 14 - w, y: py - 22 }];
    // asymptotes and guide lines
    sp.vlines.forEach(v => { if (v.v < x0 || v.v > x1) return; const n = ink.next(); ink.path(`${M(X(v.v), pt)}${L(X(v.v), H - pb)}`, 'bd-guide', 5, { i: n, dash: true }); if (v.label) { const w = tw(v.label); place(v.label, [[pt + 12, 1], [pt + 12, -1], [H - pb - 6, 1], [H - pb - 6, -1], [(pt + H - pb) / 2, 1]].map(([y, sd]) => ({ x: sd > 0 ? X(v.v) + 5 : X(v.v) - 5 - w, y })), { i: n }); } });
    sp.hlines.forEach(v => { if (v.v < y0 || v.v > y1) return; const n = ink.next(); ink.path(`${M(pl, Y(v.v))}${L(W - pr, Y(v.v))}`, 'bd-guide', 5, { i: n, dash: true }); if (v.label) { const w = tw(v.label); place(v.label, [[W - pr - 4 - w, -6], [pl + 6, -6], [W - pr - 4 - w, 15], [pl + 6, 15]].map(([x, dy]) => ({ x, y: Y(v.v) + dy })), { i: n }); } });
    // segments and vectors
    sp.segments.forEach(s => { const n = ink.next(); const [a, b] = [[X(s.from[0]), Y(s.from[1])], [X(s.to[0]), Y(s.to[1])]]; ink.path(`${M(a[0], a[1])}${L(b[0], b[1])}`, 'bd-seg', s.c, { i: n, dash: s.dash }); if (s.arrow) head(ink, a[0], a[1], b[0], b[1], s.c, n); if (s.label) { const w = tw(s.label), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l; place(s.label, [[1, 12], [-1, 12], [1, 20], [-1, 20]].map(([sd, d]) => ({ x: mx + sd * nx * d - w / 2, y: my + sd * ny * d + 4 })), { i: n, c: s.c }); } });
    // the curves' names
    labels.forEach(l => { const w = tw(l.t); place(l.t, [].concat(...l.at.map(([x, y]) => [{ x: x + 9, y: y - 10 }, { x: x - 9 - w, y: y - 10 }, { x: x + 9, y: y + 19 }, { x: x - 9 - w, y: y + 19 }, { x: x + 12, y: y + 4 }, { x: x - 12 - w, y: y + 4 }, { x: x + 16, y: y - 22 }, { x: x - 16 - w, y: y - 22 }, { x: x + 16, y: y + 30 }, { x: x - 16 - w, y: y + 30 }])), { i: l.n, c: l.c }); });
    // where the tangent and secant lines touch the curve, and their slopes
    straight.forEach(l => {
      const at = l.t ? [[l.t.a, l.t.y]] : [[l.sec.a, l.sec.ya], [l.sec.b, l.sec.yb]]; const m = l.t ? l.t.m : l.sec.m; const want = (l.t || l.sec).label;
      at.forEach(([px, py]) => { if (px >= x0 && px <= x1 && py >= y0 && py <= y1) ink.dot(X(px), Y(py), l.c, false, l.n); });
      const t = want === false ? '' : want || `slope ${approx(m)}`; if (!t) return; const [px, py] = at[at.length - 1]; const w = tw(t);
      place(t, around(X(px), Y(py), w), { i: l.n, c: l.c }, corners(w));
    });
    if (rs) { const t = `${{ left: 'Left', right: 'Right', mid: 'Midpoint', trap: 'Trapezoid' }[rs.rule]} sum (n = ${rs.n}) ${approx(rs.sum, 4)}`; const w = tw(t); place(t, corners(w), { i: ink.next(), c: rs.c }); }
    if (sp.corner) { const w = tw(sp.corner); place(sp.corner, corners(w), { i: ink.next() }); }
    // the points on top
    sp.points.forEach(p => { if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) return; const n = ink.next(); const px = X(p.x), py = Y(p.y); ink.dot(px, py, p.c, p.open, n); if (p.label) { const w = tw(p.label); place(p.label, around(px, py, w), { i: n }); } });
    sp.notes.forEach(o => { if (o.x < x0 || o.x > x1 || o.y < y0 || o.y > y1) return; ink.text(X(o.x), Y(o.y), lab(o.text), 'bd-note', { anchor: 'middle', i: ink.next() }); });
    return { w: W, h: H, body: ink.out() };
  }

  /* ---------- scatter plot: a graph of the data and its least-squares line ---------- */
  function scatter(sp, id) {
    const F = sp.fit; const g = { type: 'graph', fns: [], points: sp.points.map(p => Object.assign({}, p)), segments: [], shade: null, vlines: [], hlines: [], notes: [], x: sp.x, y: sp.y, xlabel: sp.xlabel, ylabel: sp.ylabel, tangents: [], secants: [], riemann: null, corner: '' };
    if (F) {
      g.fns.push({ f: `${F.a}+(${F.b})*x`, label: `ŷ = ${sig(F.a)} ${F.b < 0 ? '−' : '+'} ${sig(Math.abs(F.b))}x`, c: 1, dash: false });
      if (sp.residuals) sp.points.forEach(p => g.segments.push({ from: [p.x, p.y], to: [p.x, F.a + F.b * p.x], label: '', arrow: false, dash: true, c: 5 }));
      if (sp.predict !== null) { const y = F.a + F.b * sp.predict; g.points.push({ x: sp.predict, y, label: `ŷ = ${sig(y)}`, open: false, c: 2 }); g.vlines.push({ v: sp.predict, label: '' }); }
    }
    return graph(g, id);
  }

  /* ---------- number line ---------- */
  function numberline(sp) {
    const W = 360, H = 96, pl = 18, pr = 18, y = 58;
    const X = x => pl + 10 + (x - sp.min) / (sp.max - sp.min) * (W - pl - pr - 20);
    const ink = Ink(); const n0 = ink.next();
    ink.path(`${M(pl, y)}${L(W - pr, y)}`, 'bd-axis', null, { i: n0 }); head(ink, W - pr - 10, y, W - pr, y, null, n0); head(ink, pl + 10, y, pl, y, null, n0);
    const step = sp.step || niceStep(sp.max - sp.min, 10); const tk = ticks(sp.min, sp.max, step);
    ink.raw(`<g class="bd-ticks">${tk.map(v => `<path d="${M(X(v), y - 5)}${L(X(v), y + 5)}"/>`).join('')}</g>`);
    tk.filter((v, k) => tk.length <= 13 || k % Math.ceil(tk.length / 13) === 0).forEach(v => ink.text(X(v), y + 20, fmt(v, step), 'bd-tick', { anchor: 'middle', i: n0 }));
    const lanes = [];
    sp.intervals.forEach(v => {
      const n = ink.next(); const lo = v.from === null ? -Infinity : v.from, hi = v.to === null ? Infinity : v.to;
      let lane = 0; while (lanes.some(o => o.lane === lane && lo <= o.hi && hi >= o.lo)) lane++; lanes.push({ lo, hi, lane }); const lift = y - lane * 9; const a = v.from === null ? pl + 2 : X(Math.max(sp.min, v.from)), b = v.to === null ? W - pr - 2 : X(Math.min(sp.max, v.to));
      ink.path(`${M(a, lift)}${L(b, lift)}`, 'bd-band', v.c, { i: n });
      if (v.from === null) head(ink, a + 10, lift, a, lift, v.c, n); else ink.dot(a, lift, v.c, v.left === 'open', n);
      if (v.to === null) head(ink, b - 10, lift, b, lift, v.c, n); else ink.dot(b, lift, v.c, v.right === 'open', n);
    });
    sp.points.forEach(p => { if (p.x < sp.min || p.x > sp.max) return; const n = ink.next(); ink.dot(X(p.x), y, p.c, p.open, n); if (p.label) ink.text(X(p.x), y - 16, lab(p.label), 'bd-lab', { anchor: 'middle', i: n }); });
    return { w: W, h: H, body: ink.out() };
  }

  /* ---------- figure: shapes in Bo's own coordinates, the same scale both ways, y up ---------- */
  function figure(sp) {
    const pts = []; sp.shapes.forEach(s => {
      if (s.at) pts.push(s.at); if (s.from) pts.push(s.from); if (s.to) pts.push(s.to); if (s.points) pts.push(...s.points);
      if (s.kind === 'circle') { pts.push([s.center[0] - s.r, s.center[1] - s.r], [s.center[0] + s.r, s.center[1] + s.r]); }
      if (s.kind === 'rect') pts.push([s.at[0] + s.w, s.at[1] + s.h]);
    });
    let x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
    if (x1 - x0 < 1e-9) { x0 -= 1; x1 += 1; } if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
    const W = 360, m = 30; const k = Math.min((W - 2 * m) / (x1 - x0), (300 - 2 * m) / (y1 - y0)); const H = Math.max(150, Math.round((y1 - y0) * k + 2 * m));
    const ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
    const X = x => ox + (x - x0) * k, Y = y => H - oy - (y - y0) * k;
    const cx = X((x0 + x1) / 2), cy = Y((y0 + y1) / 2);
    const ink = Ink();
    const away = (x, y, d) => { const dx = x - cx, dy = y - cy; const l = Math.hypot(dx, dy) || 1; return [x + dx / l * d, y + dy / l * d]; };
    sp.shapes.forEach(s => {
      const n = ink.next(); const c = s.c;
      if (s.kind === 'polygon' || s.kind === 'curve') {
        const P = s.points.map(p => [X(p[0]), Y(p[1])]); const d = P.map((p, j) => (j ? L : M)(p[0], p[1])).join('') + (s.kind === 'polygon' ? 'Z' : '');
        if (s.fill && s.kind === 'polygon') ink.fill(d, c, n); ink.path(d, 'bd-shape', c, { i: n, dash: s.dash });
        (s.labels || []).forEach((t, j) => { if (!t || !P[j]) return; const [lx, ly] = away(P[j][0], P[j][1], 13); ink.text(lx, ly + 4, lab(t), 'bd-lab', { anchor: 'middle', i: n }); });
        if (s.label) { const gx = P.reduce((a, p) => a + p[0], 0) / P.length, gy = P.reduce((a, p) => a + p[1], 0) / P.length; ink.text(gx, gy + 4, lab(s.label), 'bd-note', { anchor: 'middle', i: n }); }
      } else if (s.kind === 'segment' || s.kind === 'arrow') {
        const a = [X(s.from[0]), Y(s.from[1])], b = [X(s.to[0]), Y(s.to[1])]; ink.path(`${M(a[0], a[1])}${L(b[0], b[1])}`, 'bd-shape', c, { i: n, dash: s.dash });
        if (s.kind === 'arrow') head(ink, a[0], a[1], b[0], b[1], c, n);
        if (s.label) { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l; if ((mx + nx - cx) * nx + (my + ny - cy) * ny < 0) { nx = -nx; ny = -ny; } ink.text(mx + nx * 12, my + ny * 12 + 4, lab(s.label), 'bd-lab', { anchor: 'middle', i: n, c }); }
      } else if (s.kind === 'circle') {
        const x = X(s.center[0]), y = Y(s.center[1]), r = s.r * k; const d = circ(x, y, r);
        if (s.fill) ink.fill(d, c, n); ink.path(d, 'bd-shape', c, { i: n, dash: s.dash });
        if (s.label) ink.text(x + r * 0.72 + 4, y - r * 0.72 - 4, lab(s.label), 'bd-lab', { i: n, c });
      } else if (s.kind === 'angle') {
        const vx = X(s.at[0]), vy = Y(s.at[1]); const a1 = Math.atan2(Y(s.from[1]) - vy, X(s.from[0]) - vx), a2 = Math.atan2(Y(s.to[1]) - vy, X(s.to[0]) - vx);
        let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const r = 18; const mid = a1 + da / 2;
        if (s.right) { const u = [Math.cos(a1), Math.sin(a1)], v = [Math.cos(a2), Math.sin(a2)], q = 11; ink.path(`${M(vx + u[0] * q, vy + u[1] * q)}${L(vx + (u[0] + v[0]) * q, vy + (u[1] + v[1]) * q)}${L(vx + v[0] * q, vy + v[1] * q)}`, 'bd-mark', c, { i: n }); }
        else ink.path(`${M(vx + r * Math.cos(a1), vy + r * Math.sin(a1))}A${r} ${r} 0 0 ${da > 0 ? 1 : 0} ${r1(vx + r * Math.cos(a2))} ${r1(vy + r * Math.sin(a2))}`, 'bd-mark', c, { i: n });
        if (s.label) ink.text(vx + 32 * Math.cos(mid), vy + 32 * Math.sin(mid) + 4, lab(s.label), 'bd-lab', { anchor: 'middle', i: n, c });
      } else if (s.kind === 'point') {
        const x = X(s.at[0]), y = Y(s.at[1]); ink.dot(x, y, c, false, n); const t = s.label || s.text; if (t) { const [lx, ly] = away(x, y, 14); ink.text(lx, ly + 4, lab(t), 'bd-lab', { anchor: lx < x - 2 ? 'end' : lx > x + 2 ? 'start' : 'middle', i: n }); }
      } else if (s.kind === 'text') {
        ink.text(X(s.at[0]), Y(s.at[1]) + 4, lab(s.text || s.label), 'bd-note', { anchor: 'middle', i: n });
      } else if (s.kind === 'rect') {
        const x = X(s.at[0]), y = Y(s.at[1] + s.h), w = s.w * k, h = s.h * k; const d = `${M(x, y)}${L(x + w, y)}${L(x + w, y + h)}${L(x, y + h)}Z`;
        if (s.fill) ink.fill(d, c, n); ink.path(d, 'bd-shape', c, { i: n, dash: s.dash });
        const t = s.text || s.label; if (t) ink.text(x + w / 2, y + h / 2 + 4, lab(t), 'bd-lab', { anchor: 'middle', i: n });
      }
    });
    return { w: W, h: H, body: ink.out() };
  }

  /* ---------- the unit circle: special angles, exact coordinates ---------- */
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  function radName(d) { if (Math.abs(d - Math.round(d)) > 1e-6) return fmt(d * Math.PI / 180, 0.01); d = Math.round(d); if (!d) return '0'; const g = gcd(d, 180), p = d / g, q = 180 / g; return `${p === 1 ? '' : p}π${q === 1 ? '' : '/' + q}`; }
  function trig(d) {   // exact cos and sin of a special angle (degrees); two decimals otherwise
    const r = d % 180, ref = r > 90 ? 180 - r : r; const E = { 0: ['1', '0'], 30: ['√3/2', '1/2'], 45: ['√2/2', '√2/2'], 60: ['1/2', '√3/2'], 90: ['0', '1'] }[Math.round(ref * 1e6) / 1e6];
    const c = Math.cos(d * Math.PI / 180), s = Math.sin(d * Math.PI / 180);
    if (!E) return [fmt(c, 0.01), fmt(s, 0.01)];
    const sg = (v, t) => t === '0' ? '0' : (v < 0 ? '−' : '') + t; return [sg(c, E[0]), sg(s, E[1])];
  }
  const angName = (sp, d) => sp.units === 'deg' ? `${sig(d)}°` : sp.units === 'none' ? '' : radName(d);
  function unitcircle(sp) {
    const W = 400, H = 330, cx = 200, cy = 165, R = 104; const X = x => cx + x * R, Y = y => cy - y * R;
    const ink = Ink(); const n0 = ink.next();
    ink.path(`${M(cx - R - 34, cy)}${L(cx + R + 34, cy)}`, 'bd-axis', null, { i: n0 }); head(ink, cx + R + 24, cy, cx + R + 34, cy, null, n0);
    ink.path(`${M(cx, cy + R + 30)}${L(cx, cy - R - 30)}`, 'bd-axis', null, { i: n0 }); head(ink, cx, cy - R - 20, cx, cy - R - 30, null, n0);
    ink.text(cx + R + 30, cy + 15, 'x', 'bd-axl', { anchor: 'middle', i: n0 }); ink.text(cx - 8, cy - R - 22, 'y', 'bd-axl', { anchor: 'end', i: n0 });
    ink.path(circ(cx, cy, R), 'bd-shape', 0, { i: ink.next() });
    const hi = new Set(sp.hi.map(d => Math.round(d * 1e6)));
    sp.hi.forEach((d, k) => {   // the angle, its triangle, and cos and sin along its legs
      const n = ink.next(); const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); const [cs, sn] = trig(d);
      ink.path(`${M(cx, cy)}${L(X(c), Y(s))}`, 'bd-seg', 1, { i: n });
      if (Math.abs(s) > 1e-9) ink.path(`${M(X(c), cy)}${L(X(c), Y(s))}`, 'bd-seg', 2, { i: n, dash: true });
      if (Math.abs(c) > 1e-9) ink.path(`${M(cx, cy)}${L(X(c), cy)}`, 'bd-band', 0, { i: n });
      const r = 22 + k * 8, big = d > 180 ? 1 : 0; if (d > 0.5) ink.path(`${M(cx + r, cy)}A${r} ${r} 0 ${big} 0 ${r1(cx + r * Math.cos(a))} ${r1(cy - r * Math.sin(a))}`, 'bd-mark', 4, { i: n });
      const ma = a / 2; if (d > 0.5 && sp.units !== 'none') ink.text(cx + (r + 16) * Math.cos(ma), cy - (r + 16) * Math.sin(ma) + 4, esc(angName(sp, d)), 'bd-lab', { anchor: 'middle', i: n, c: 4 });
      if (Math.abs(c) > 0.15) ink.text(X(c / 2), cy + (s >= 0 ? 16 : -8), esc(cs), 'bd-lab', { anchor: 'middle', i: n, c: 0 });
      if (Math.abs(s) > 0.15) ink.text(X(c) + (c >= 0 ? 7 : -7), Y(s / 2) + 4, esc(sn), 'bd-lab', { anchor: c >= 0 ? 'start' : 'end', i: n, c: 2 });
    });
    sp.angles.forEach(d => {   // each angle: a dot on the circle, its name (or coordinates) outside
      const n = ink.next(); const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); const on = hi.has(Math.round(d * 1e6));
      ink.dot(X(c), Y(s), on ? 1 : 0, false, n);
      const [cs, sn] = trig(d); const name = angName(sp, d); const ls = on || sp.coords ? [esc(`(${cs}, ${sn})`)] : name ? [esc(name)] : [];
      if (sp.coords && !on && name) ls.unshift(esc(name));
      if (!ls.length) return; const rr = R + 14; const flat = Math.abs(s) < 0.01, up = Math.abs(c) < 0.01;   // on an axis: beside it, not on it
      const x = cx + rr * c + (up ? 6 : 0), y = cy - rr * s - (flat ? 8 : 0); const anchor = up ? 'start' : c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
      const lh = 13; const top = y + 4 - (ls.length - 1) * lh * (s > 0.3 ? 1 : s < -0.3 ? 0 : flat ? 1 : 0.5) + (s > 0.9 ? -4 : s < -0.9 ? 8 : 0);
      ink.lines(x, top, ls, on ? 'bd-lab' : 'bd-uc', { anchor, i: n, lh, c: on ? 1 : null });
    });
    return { w: W, h: H, body: ink.out() };
  }

  /* ---------- bar chart or histogram ---------- */
  function bars(sp) {
    const W = 360, H = 230, pl = 34, pr = 10, pt = 14, pb = sp.xlabel ? 40 : 28;
    const hi = Math.max(0, ...sp.bars.map(b => b.value)), lo = Math.min(0, ...sp.bars.map(b => b.value)); const step = niceStep((hi - lo) || 1, 5);
    const top = Math.ceil(hi / step) * step || step, bot = Math.floor(lo / step) * step;
    const Y = v => pt + (top - v) / (top - bot) * (H - pt - pb); const n = sp.bars.length; const slot = (W - pl - pr) / n; const bw = sp.hist ? slot : slot * 0.64;
    const ink = Ink(); const n0 = ink.next();
    ink.raw(`<g class="bd-grid">${ticks(bot, top, step).map(v => `<path d="${M(pl, Y(v))}${L(W - pr, Y(v))}"/>`).join('')}</g>`);
    ticks(bot, top, step).forEach(v => ink.text(pl - 5, Y(v) + 3.5, fmt(v, step), 'bd-tick', { anchor: 'end', i: n0 }));
    ink.path(`${M(pl, Y(0))}${L(W - pr, Y(0))}`, 'bd-axis', null, { i: n0 }); ink.path(`${M(pl, pt - 4)}${L(pl, H - pb)}`, 'bd-axis', null, { i: n0 });
    sp.bars.forEach((b, k) => {
      const i = ink.next(); const x = pl + slot * k + (slot - bw) / 2; const ya = Y(Math.max(0, b.value)), yb = Y(Math.min(0, b.value));
      const c = sp.mark === k ? 1 : 0; const d = `${M(x, yb)}${L(x, ya)}${L(x + bw, ya)}${L(x + bw, yb)}`;
      ink.fill(`${d}Z`, c, i); ink.path(d, 'bd-shape', c, { i });
      if (n <= 12) ink.text(x + bw / 2, ya - 5, fmt(b.value, b.value % 1 ? 0.01 : 1), 'bd-tick', { anchor: 'middle', i });
      if (b.label) ink.text(x + bw / 2, H - pb + 14, esc(b.label.slice(0, n > 10 ? 5 : 12)), 'bd-tick', { anchor: 'middle', i });
    });
    if (sp.ylabel) ink.text(pl + 4, pt + 4, lab(sp.ylabel), 'bd-axl', { i: n0 });
    if (sp.xlabel) ink.text((W + pl) / 2, H - 6, lab(sp.xlabel), 'bd-axl', { anchor: 'middle', i: n0 });
    return { w: W, h: H, body: ink.out() };
  }

  /* ---------- pie chart: slices in order, a key with each share ---------- */
  function pie(sp) {
    const W = 360, H = 220, cx = 108, cy = 110, R = 88; const tot = sp.slices.reduce((a, s) => a + s.value, 0);
    const ink = Ink(); let a = -Math.PI / 2; const pct = v => { const p = v / tot * 100; return `${p >= 10 || Math.abs(p - Math.round(p)) < 0.05 ? Math.round(p) : p.toFixed(1)}%`; };
    sp.slices.forEach((s, k) => {
      const n = ink.next(); const da = s.value / tot * 2 * Math.PI, a1 = a + da, mid = a + da / 2; const off = sp.mark === k ? 8 : 0; const ox = cx + off * Math.cos(mid), oy = cy + off * Math.sin(mid);
      const d = da >= 2 * Math.PI - 1e-6 ? circ(ox, oy, R) : `${M(ox, oy)}${L(ox + R * Math.cos(a), oy + R * Math.sin(a))}A${R} ${R} 0 ${da > Math.PI ? 1 : 0} 1 ${r1(ox + R * Math.cos(a1))} ${r1(oy + R * Math.sin(a1))}Z`;
      ink.fill(d, k % 6, n, 'bd-slice'); a = a1;
    });
    const top = cy - (sp.slices.length - 1) * 13;
    sp.slices.forEach((s, k) => { const y = top + k * 26; ink.raw(`<rect x="216" y="${y - 9}" width="12" height="12" rx="3" class="bd-key bd-c${k % 6} bd-pop" style="--i:${k}"/>`); ink.text(234, y + 1.5, `${esc((s.label || '?').slice(0, 12))} <tspan class="bd-pct">${pct(s.value)}</tspan>`, sp.mark === k ? 'bd-lab' : 'bd-keyt', { i: k }); });
    return { w: W, h: H, body: ink.out() };
  }

  /* ---------- box plots on one axis ---------- */
  function boxplot(sp) {
    const B = sp.boxes; const one = B.length === 1; const lw = B.some(b => b.label) ? Math.min(74, Math.max(...B.map(b => tw(b.label)))) + 8 : 0;
    const W = 360, pl = 16 + lw, pr = 16, rowH = one ? 74 : 52, pt = one ? 30 : 12, axY = pt + rowH * B.length + 4, H = axY + 30 + (sp.xlabel ? 16 : 0);
    const all = [].concat(...B.map(b => [b.min, b.max, ...b.out])); let [x0, x1] = sp.x || [Math.min(...all), Math.max(...all)];
    if (!sp.x) { const pad = (x1 - x0) * 0.08 || 1; x0 -= pad; x1 += pad; }
    const X = v => pl + (v - x0) / (x1 - x0) * (W - pl - pr); const step = niceStep(x1 - x0, 7); const tk = ticks(x0, x1, step);
    const ink = Ink(); const n0 = ink.next();
    ink.raw(`<g class="bd-grid">${tk.map(v => `<path d="${M(X(v), pt - 6)}${L(X(v), axY)}"/>`).join('')}</g>`);
    ink.path(`${M(pl - 4, axY)}${L(W - pr + 4, axY)}`, 'bd-axis', null, { i: n0 });
    ink.raw(`<g class="bd-ticks">${tk.map(v => `<path d="${M(X(v), axY)}${L(X(v), axY + 5)}"/>`).join('')}</g>`);
    tk.forEach(v => ink.text(X(v), axY + 18, fmt(v, step), 'bd-tick', { anchor: 'middle', i: n0 }));
    if (sp.xlabel) ink.text((pl + W - pr) / 2, H - 4, lab(sp.xlabel), 'bd-axl', { anchor: 'middle', i: n0 });
    B.forEach((b, k) => {
      const n = ink.next(); const c = k % 5; const cy = pt + rowH * (k + 0.5), h = Math.min(30, rowH * 0.56);
      ink.path(`${M(X(b.lo), cy)}${L(X(b.q1), cy)}${M(X(b.q3), cy)}${L(X(b.hi), cy)}${M(X(b.lo), cy - h / 4)}${L(X(b.lo), cy + h / 4)}${M(X(b.hi), cy - h / 4)}${L(X(b.hi), cy + h / 4)}`, 'bd-seg', c, { i: n });
      const d = `${M(X(b.q1), cy - h / 2)}${L(X(b.q3), cy - h / 2)}${L(X(b.q3), cy + h / 2)}${L(X(b.q1), cy + h / 2)}Z`; ink.fill(d, c, n); ink.path(d, 'bd-shape', c, { i: n });
      ink.path(`${M(X(b.med), cy - h / 2)}${L(X(b.med), cy + h / 2)}`, 'bd-median', c, { i: n });
      b.out.forEach(v => ink.dot(X(v), cy, c, true, n));
      if (b.label) ink.text(pl - 10, cy + 4, lab(b.label), 'bd-lab', { anchor: 'end', i: n, c });
      if (one) {   // the five numbers above the box, and below it where two would touch
        let edge = -1e9, down = false;
        [['min', b.min], ['Q1', b.q1], ['med', b.med], ['Q3', b.q3], ['max', b.max]].forEach(([nm, v]) => { const x = X(v); const t = `${nm} ${sig(v)}`; const w = t.length * 6.2; down = x - w / 2 < edge + 4 && !down; if (!down) edge = x + w / 2; ink.text(x, down ? cy + h / 2 + 15 : cy - h / 2 - 7, esc(t), 'bd-tick', { anchor: 'middle', i: n }); });
      }
    });
    return { w: W, h: H, body: ink.out() };
  }

  /* ---------- normal curve: the shaded share (and its area), the mean ± 1, 2, 3 SD ---------- */
  function erf(x) { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
  const Phi = z => z === Infinity ? 1 : z === -Infinity ? 0 : 0.5 * (1 + erf(z / Math.SQRT2));
  function normal(sp) {
    const W = 360, H = 210, pl = 12, pr = 12, pt = 16, pb = sp.label ? 44 : 30; const mu = sp.mean, s = sp.sd;
    const x0 = mu - 3.6 * s, x1 = mu + 3.6 * s; const pdf = x => Math.exp(-0.5 * ((x - mu) / s) ** 2); const X = x => pl + (x - x0) / (x1 - x0) * (W - pl - pr), Y = v => H - pb - v * (H - pb - pt);
    const ink = Ink(); const n0 = ink.next();
    ink.path(`${M(pl, Y(0))}${L(W - pr, Y(0))}`, 'bd-axis', null, { i: n0 });
    const fill = (a, b) => { a = Math.max(x0, a); b = Math.min(x1, b); if (!(b > a)) return; let d = M(X(a), Y(0)); for (let k = 0; k <= 80; k++) { const x = a + (b - a) * k / 80; d += L(X(x), Y(pdf(x))); } ink.fill(`${d}${L(X(b), Y(0))}Z`, 0, ink.next()); };
    let area = null;
    if (sp.shade) {
      if (sp.both) { const e = sp.to !== null ? sp.to : sp.from; const dd = Math.abs(e - mu); fill(-Infinity, mu - dd); fill(mu + dd, Infinity); area = 2 * (1 - Phi(dd / s)); }
      else { const a = sp.from === null ? -Infinity : sp.from, b = sp.to === null ? Infinity : sp.to; fill(a, b); area = Phi((b - mu) / s) - Phi((a - mu) / s); }
    }
    let d = ''; for (let k = 0; k <= 200; k++) { const x = x0 + (x1 - x0) * k / 200; d += (k ? L : M)(X(x), Y(pdf(x))); } ink.path(d, 'bd-curve', 0, { i: ink.next() });
    const n1 = ink.next();
    [-3, -2, -1, 0, 1, 2, 3].forEach(k => { const x = mu + k * s; ink.raw(`<path d="${M(X(x), Y(0) - 4)}${L(X(x), Y(0) + 4)}" class="bd-tickline"/>`); ink.text(X(x), Y(0) + 16, fmt(x, s / 10), 'bd-tick', { anchor: 'middle', i: n1 }); });
    ink.raw(`<path d="${M(X(mu), Y(0))}${L(X(mu), Y(1))}" class="bd-guide bd-c5 bd-dash bd-pop" style="--i:${n1}"/>`);
    sp.marks.forEach(m => { if (m.x < x0 || m.x > x1) return; const n = ink.next(); ink.path(`${M(X(m.x), Y(0))}${L(X(m.x), Y(pdf(m.x)) - 6)}`, 'bd-guide', 1, { i: n }); if (m.label) ink.text(X(m.x), Y(pdf(m.x)) - 10, lab(m.label), 'bd-lab', { anchor: 'middle', i: n }); });
    if (area !== null && sp.area && Number.isFinite(area)) { const t = `area ≈ ${area < 0.001 ? area.toExponential(2) : area.toFixed(4)}`; const left = !sp.both && sp.from !== null && sp.from > mu; ink.text(left ? pl + 2 : W - pr - 2, pt + 6, esc(t), 'bd-lab', { anchor: left ? 'start' : 'end', i: ink.next(), c: 0 }); }
    if (sp.label) ink.text(W / 2, H - 8, lab(sp.label), 'bd-axl', { anchor: 'middle', i: n1 });
    return { w: W, h: H, body: ink.out() };
  }

  /* ---------- probability tree ---------- */
  function tree(sp) {
    const depthOf = n => n.children.length ? 1 + Math.max(...n.children.map(depthOf)) : 1;
    const leaves = n => n.children.length ? n.children.reduce((a, c) => a + leaves(c), 0) : 1;
    const D = Math.max(...sp.branches.map(depthOf)); const total = sp.branches.reduce((a, b) => a + leaves(b), 0);
    const tw2 = t => pretty(t).length * 7.3;
    // the widest label at each level, and the widest result at the ends
    const lw = Array(D + 1).fill(0); let rw = 0;
    (function walk(ns, d) { ns.forEach(n => { lw[d] = Math.max(lw[d], tw2(n.label)); if (!n.children.length && n.result) rw = Math.max(rw, tw2(n.result) + 10); walk(n.children, d + 1); }); })(sp.branches, 1);
    const pl = 14, edge0 = 76; const need = pl + 8 + lw.reduce((a, b) => a + b, 0) + D * (edge0 + 8) + rw + 12; const W = Math.max(360, Math.round(need));
    const edge = (W - pl - 8 - lw.reduce((a, b) => a + b, 0) - D * 8 - rw - 12) / D;
    const inX = [0], outX = [pl + 4]; for (let d = 1; d <= D; d++) { inX[d] = outX[d - 1] + edge; outX[d] = inX[d] + lw[d] + 8; }
    const rowH = 30, H = Math.max(110, total * rowH + 24); const ink = Ink(); let row = 0;
    const lay = (n, d) => { n.d = d; if (!n.children.length) n.y = 12 + rowH * (row++ + 0.5); else { n.children.forEach(c => lay(c, d + 1)); n.y = (n.children[0].y + n.children[n.children.length - 1].y) / 2; } };
    sp.branches.forEach(b => lay(b, 1)); const root = { y: (sp.branches[0].y + sp.branches[sp.branches.length - 1].y) / 2 };
    ink.dot(pl, root.y, 5, false, ink.next()); if (sp.root) ink.text(pl - 2, root.y - 10, lab(sp.root), 'bd-tick', { i: 0 });
    const draw = (fx, fy, n) => {
      const i = ink.next(); const tx = inX[n.d] - 4, ty = n.y;
      ink.path(`${M(fx, fy)}${L(tx, ty)}`, 'bd-shape', 0, { i });
      if (n.p) { const mx = (fx + tx) / 2, my = (fy + ty) / 2; const up = ty <= fy; ink.text(mx, my + (up ? -6 : 14), lab(n.p), 'bd-prob', { anchor: 'middle', i }); }
      ink.text(inX[n.d], ty + 4.5, lab(n.label), 'bd-lab', { i });
      if (!n.children.length && n.result) ink.text(outX[n.d] + 4, ty + 4.5, lab(n.result), 'bd-note', { i });
      n.children.forEach(c => draw(inX[n.d] + tw2(n.label) + 5, ty, c));
    };
    sp.branches.forEach(b => draw(pl + 5, root.y, b));
    return { w: W, h: H, body: ink.out() };
  }

  /* ---------- Venn diagram: the sets as circles, regions shaded with clips and masks ---------- */
  const VENN = {
    2: { W: 360, H: 228, c: [[140, 118], [220, 118]], r: 76, lab: [[78, 34, 'end'], [282, 34, 'start']], at: { 1: [104, 122], 2: [256, 122], 3: [180, 122], 0: [22, 204] } },
    3: { W: 360, H: 282, c: [[145, 110], [215, 110], [180, 170]], r: 70, lab: [[84, 40, 'end'], [276, 40, 'start'], [264, 262, 'start']], at: { 1: [115, 94], 2: [245, 94], 4: [180, 214], 3: [180, 80], 5: [147, 157], 6: [213, 157], 7: [180, 131], 0: [22, 258] } }
  };
  function vennDraw(sp, id) {
    const n = sp.sets.length, G = VENN[n]; const { W, H, r } = G; const ink = Ink(); const n0 = ink.next();
    ink.path(`${M(10, 10)}${L(W - 10, 10)}${L(W - 10, H - 10)}${L(10, H - 10)}Z`, 'bd-frame', null, { i: n0 });
    if (sp.universe) ink.text(W - 18, H - 18, lab(sp.universe), 'bd-axl', { anchor: 'end', i: n0 });
    let defs = G.c.map((c, k) => `<clipPath id="${id}-s${k}"><circle cx="${c[0]}" cy="${c[1]}" r="${r}"/></clipPath>`).join('');
    const shades = sp.shade.filter(m => m < (1 << n)).map(m => {
      defs += `<mask id="${id}-m${m}"><rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>${G.c.map((c, k) => m & (1 << k) ? '' : `<circle cx="${c[0]}" cy="${c[1]}" r="${r}" fill="#000"/>`).join('')}</mask>`;
      let g = `<rect x="11" y="11" width="${W - 22}" height="${H - 22}" class="bd-vshade"/>`; G.c.forEach((c, k) => { if (m & (1 << k)) g = `<g clip-path="url(#${id}-s${k})">${g}</g>`; });
      return `<g mask="url(#${id}-m${m})">${g}</g>`;
    });
    ink.raw(`<defs>${defs}</defs>`);
    if (shades.length) ink.raw(`<g class="bd-pop" style="--i:${ink.next()}">${shades.join('')}</g>`);
    G.c.forEach((c, k) => { const i = ink.next(); ink.path(circ(c[0], c[1], r), 'bd-shape', k, { i }); const [lx, ly, an] = G.lab[k]; ink.text(lx, ly, lab(sp.sets[k]), 'bd-lab', { anchor: an, i, c: k }); });
    const nv = ink.next(); Object.keys(sp.values).forEach(m => { const at = G.at[m]; if (at) ink.text(at[0], at[1] + 5, lab(sp.values[m]), +m === 0 ? 'bd-note' : 'bd-vnum', { anchor: +m === 0 ? 'start' : 'middle', i: nv }); });
    return { w: W, h: H, body: ink.out() };
  }
  const regionName = (m, sets) => { const inn = sets.filter((s, k) => m & (1 << k)); return !inn.length ? `outside ${sets.length > 2 ? 'all of them' : 'both'}` : inn.join(' and ') + (inn.length < sets.length ? ' only' : ''); };

  /* ---------- flow chart: steps top to bottom (or left to right), arrows between, loops back on the side ---------- */
  function flow(sp) {
    const S = sp.steps, n = S.length; const ink = Ink(); const right = sp.dir === 'right';
    const W = 360; let H; const boxes = [];
    const hOf = (s, ls) => s.kind === 'decision' ? ls.length * 16 + 34 : ls.length * 16 + 18;
    if (!right) {
      const bw = 200, cx = 150; let y = 12;
      S.forEach(s => { const ls = wrap(pretty(s.text), s.kind === 'decision' ? 20 : 26); const h = hOf(s, ls); boxes.push({ s, ls, x: cx, y: y + h / 2, w: bw, h }); y += h + 30; });
      H = y - 30 + 14;
    } else {
      const gap = 26, bw = (W - 20 - gap * (n - 1)) / n, chars = Math.max(8, Math.floor((bw - 14) / 7)); const lsAll = S.map(s => wrap(pretty(s.text), s.kind === 'decision' ? Math.max(6, chars - 4) : chars));
      const h = Math.max(...lsAll.map((ls, k) => hOf(S[k], ls))); S.forEach((s, k) => boxes.push({ s, ls: lsAll[k], x: 10 + bw / 2 + k * (bw + gap), y: 12 + h / 2, w: bw, h }));
      H = 12 + h + 20 + sp.loops.length * 22;
    }
    const shape = b => { const { x, y, w, h } = b; if (b.s.kind === 'decision') return `${M(x, y - h / 2)}${L(x + w / 2, y)}${L(x, y + h / 2)}${L(x - w / 2, y)}Z`; const rr = b.s.kind === 'end' ? h / 2 : 8; return `${M(x - w / 2 + rr, y - h / 2)}${L(x + w / 2 - rr, y - h / 2)}A${r1(rr)} ${r1(rr)} 0 0 1 ${r1(x + w / 2)} ${r1(y - h / 2 + rr)}${L(x + w / 2, y + h / 2 - rr)}A${r1(rr)} ${r1(rr)} 0 0 1 ${r1(x + w / 2 - rr)} ${r1(y + h / 2)}${L(x - w / 2 + rr, y + h / 2)}A${r1(rr)} ${r1(rr)} 0 0 1 ${r1(x - w / 2)} ${r1(y + h / 2 - rr)}${L(x - w / 2, y - h / 2 + rr)}A${r1(rr)} ${r1(rr)} 0 0 1 ${r1(x - w / 2 + rr)} ${r1(y - h / 2)}Z`; };
    const loopFrom = new Set(sp.loops.map(l => l.from));
    boxes.forEach((b, k) => {
      const i = ink.next(); const c = b.s.kind === 'decision' ? 4 : b.s.kind === 'end' ? 2 : 0;
      ink.fill(shape(b), c, i); ink.path(shape(b), 'bd-shape', c, { i });
      ink.lines(b.x, b.y + 4.5 - (b.ls.length - 1) * 8, b.ls.map(esc), 'bd-flowt', { anchor: 'middle', i, lh: 16 });
      if (k < n - 1) {   // the arrow to the next step, and what it says ("yes" out of a question that loops back on "no")
        const nb = boxes[k + 1]; const note = b.s.note || (b.s.kind === 'decision' && loopFrom.has(k) ? 'yes' : '');
        if (!right) { const ya = b.y + b.h / 2 + 2, yb = nb.y - nb.h / 2 - 3; ink.path(`${M(b.x, ya)}${L(b.x, yb)}`, 'bd-seg', 5, { i }); head(ink, b.x, ya, b.x, yb, 5, i); if (note) ink.text(b.x + 8, (ya + yb) / 2 + 4, lab(note), 'bd-prob', { i }); }
        else { const xa = b.x + b.w / 2 + 2, xb = nb.x - nb.w / 2 - 3; ink.path(`${M(xa, b.y)}${L(xb, b.y)}`, 'bd-seg', 5, { i }); head(ink, xa, b.y, xb, b.y, 5, i); if (note) ink.text((xa + xb) / 2, b.y - 7, lab(note), 'bd-prob', { anchor: 'middle', i }); }
      }
    });
    sp.loops.forEach((l, k) => {
      const i = ink.next(); const a = boxes[l.from], b = boxes[l.to]; const label = l.label || (a.s.kind === 'decision' ? 'no' : '');
      if (!right) {
        const lane = 268 + k * 18; const ya = a.y, yb = b.y; const xa = a.x + a.w / 2 + 2, xb = b.x + b.w / 2 + 3;
        ink.path(`${M(xa, ya)}${L(lane, ya)}${L(lane, yb)}${L(xb, yb)}`, 'bd-seg', 1, { i }); head(ink, lane, yb, xb, yb, 1, i);
        if (label) { const ls = wrap(pretty(label), k ? 9 : 11).slice(0, 2); ink.lines(lane + 6, (ya + yb) / 2 - (ls.length - 1) * 7 + 4, ls.map(esc), 'bd-prob', { i, lh: 14, c: 1 }); }
      } else {
        const lane = 12 + Math.max(...boxes.map(x => x.y + x.h / 2)) + 12 + k * 20; const xa = a.x, xb = b.x;
        ink.path(`${M(xa, a.y + a.h / 2 + 2)}${L(xa, lane)}${L(xb, lane)}${L(xb, b.y + b.h / 2 + 3)}`, 'bd-seg', 1, { i }); head(ink, xb, lane, xb, b.y + b.h / 2 + 3, 1, i);
        if (label) ink.text((xa + xb) / 2, lane - 5, lab(label), 'bd-prob', { anchor: 'middle', i, c: 1 });
      }
    });
    return { w: W, h: H, body: ink.out() };
  }

  /* ---------- table (HTML, so $TeX$ in cells is typeset) ---------- */
  const cell = t => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const table = sp => `<div class="bd-table-wrap"><table class="bd-table">${sp.head.length ? `<thead><tr>${sp.head.map(h => `<th scope="col">${cell(h)}</th>`).join('')}</tr></thead>` : ''}<tbody>${sp.rows.map(r => `<tr>${r.map((c, j) => j === 0 && sp.head.length ? `<th scope="row">${cell(c)}</th>` : `<td>${cell(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  /* ---------- in words: for screen readers, copying and the chat ---------- */
  function plain(sp) {
    if (!sp) return 'A drawing';
    const P = x => pretty(x); const pt = p => { const c = `(${fmt(p.x)}, ${fmt(p.y)})`; const l = p.label ? P(p.label) : ''; return !l || l.replace(/\s|−/g, m => m === '−' ? '-' : '') === c.replace(/\s|−/g, m => m === '−' ? '-' : '') ? c : `${l} ${c}`; };
    const pv = v => { const x = value(v, sp.params); return Number.isFinite(x) ? fmt(x) : String(v); };
    let s = '';
    if (sp.type === 'graph') {
      s = `Graph of ${sp.fns.length ? sp.fns.map(g => P(g.label || (g.f ? 'y = ' + g.f : `x = ${g.xt}, y = ${g.yt}`))).join(' and ') : sp.points.length ? 'points' : 'lines'}${sp.x && !(sp.sliders && sp.sliders.length) ? ` for x from ${fmt(sp.x[0])} to ${fmt(sp.x[1])}` : ''}${sp.points.length ? `; points ${sp.points.map(pt).join(', ')}` : ''}${sp.shade ? `; shaded${sp.shade.from != null ? ` from x = ${pv(sp.shade.from)}` : ''}${sp.shade.to != null ? ` to ${pv(sp.shade.to)}` : ''}` : ''}${sp.vlines.length ? `; dashed line${sp.vlines.length > 1 ? 's' : ''} at x = ${sp.vlines.map(v => fmt(v.v)).join(', ')}` : ''}`;
      (sp.tangents || []).forEach(t => { const f = compile(t.f, sp.params), a = value(t.at, sp.params); if (f && Number.isFinite(a)) s += `; tangent line at x = ${fmt(a)}, slope ${approx(slope(f, a))}`; });
      (sp.secants || []).forEach(t => { const f = compile(t.f, sp.params), a = value(t.from, sp.params), b = value(t.to, sp.params); if (f && Number.isFinite(a) && Number.isFinite(b) && a !== b) s += `; secant line from x = ${fmt(a)} to ${fmt(b)}, slope ${approx((f(b) - f(a)) / (b - a))}`; });
      if (sp.riemann) { const r = riemann(sp.riemann, sp.params); if (r) s += `; ${r.rule === 'trap' ? 'trapezoid' : r.rule === 'mid' ? 'midpoint' : r.rule} Riemann sum with ${r.n} ${r.rule === 'trap' ? 'trapezoids' : 'rectangles'} from ${fmt(r.a)} to ${fmt(r.b)}, sum ${approx(r.sum, 4)}`; }
      if (sp.sliders && sp.sliders.length) s += `; slider${sp.sliders.length > 1 ? 's' : ''} for ${sp.sliders.map(x => `${x.name} (now ${fmt(sp.params[x.name])}, from ${fmt(x.min)} to ${fmt(x.max)})`).join(', ')}`;
    }
    else if (sp.type === 'numberline') s = `Number line${sp.intervals.length ? ' showing ' + sp.intervals.map(v => `${v.from === null ? '−∞' : (v.left === 'open' ? '(' : '[') + fmt(v.from)} to ${v.to === null ? '∞' : fmt(v.to) + (v.right === 'open' ? ')' : ']')}`).join(' and ') : ''}${sp.points.length ? `; points at ${sp.points.map(p => fmt(p.x) + (p.open ? ' (open)' : '')).join(', ')}` : ''}`;
    else if (sp.type === 'figure') s = `Figure: ${sp.shapes.map(x => x.kind === 'polygon' ? `${x.points.length === 3 ? 'triangle' : 'polygon'}${x.labels.length ? ' ' + x.labels.join('') : ''}` : x.kind === 'angle' ? `${x.right ? 'right ' : ''}angle${x.label ? ' ' + P(x.label) : ''}` : `${x.kind}${x.label || x.text ? ' ' + P(x.label || x.text) : ''}`).slice(0, 8).join(', ')}`;
    else if (sp.type === 'unitcircle') s = `Unit circle${sp.angles.length ? ` with the angles ${sp.angles.map(d => radName(d)).join(', ')}` : ''}${sp.hi.length ? `; ${sp.hi.map(d => { const [c, n] = trig(d); return `at ${radName(d)}: cos = ${c}, sin = ${n}`; }).join('; ')}` : ''}`;
    else if (sp.type === 'table') s = `Table${sp.head.length ? ' of ' + sp.head.map(P).join(', ') : ''}: ${sp.rows.map(r => r.map(P).join(', ')).join('; ')}`;
    else if (sp.type === 'bars') s = `${sp.hist ? 'Histogram' : 'Bar chart'}${sp.ylabel ? ' of ' + P(sp.ylabel) : ''}: ${sp.bars.map(b => `${b.label || '?'} ${fmt(b.value)}`).join(', ')}`;
    else if (sp.type === 'pie') { const t = sp.slices.reduce((a, b) => a + b.value, 0); s = `Pie chart: ${sp.slices.map(b => `${b.label || '?'} ${Math.round(b.value / t * 1000) / 10}%`).join(', ')}`; }
    else if (sp.type === 'scatter') s = `Scatter plot of ${sp.points.length} points${sp.xlabel || sp.ylabel ? ` (${P(sp.xlabel || 'x')} and ${P(sp.ylabel || 'y')})` : ''}${sp.fit ? `; least-squares line ŷ = ${sig(sp.fit.a)} ${sp.fit.b < 0 ? '−' : '+'} ${sig(Math.abs(sp.fit.b))}x${Number.isFinite(sp.fit.r) ? `, r = ${sp.fit.r.toFixed(3).replace('-', '−')}` : ''}` : ''}${sp.fit && sp.predict !== null ? `; at x = ${fmt(sp.predict)} it predicts ${sig(sp.fit.a + sp.fit.b * sp.predict)}` : ''}`;
    else if (sp.type === 'boxplot') s = `Box plot${sp.boxes.length > 1 ? 's' : ''}: ${sp.boxes.map(b => `${b.label ? P(b.label) + ': ' : ''}min ${sig(b.min)}, Q1 ${sig(b.q1)}, median ${sig(b.med)}, Q3 ${sig(b.q3)}, max ${sig(b.max)}${b.out.length ? `, outliers ${b.out.map(v => sig(v)).join(', ')}` : ''}`).join('; ')}`;
    else if (sp.type === 'normal') s = `Normal curve, mean ${fmt(sp.mean)}, standard deviation ${fmt(sp.sd)}${sp.shade ? (sp.both ? `, both tails shaded beyond ${fmt(sp.to !== null ? sp.to : sp.from)}` : `, shaded ${sp.from === null ? 'below' : 'from ' + fmt(sp.from)} ${sp.to === null ? (sp.from === null ? '' : 'up') : (sp.from === null ? fmt(sp.to) : 'to ' + fmt(sp.to))}`) : ''}`;
    else if (sp.type === 'tree') { const walk = (n, pre) => n.children.length ? n.children.map(c => walk(c, pre.concat(n))).join('; ') : pre.concat(n).map(x => `${P(x.label)}${x.p ? ' (' + P(x.p) + ')' : ''}`).join(' then ') + (n.result ? ` = ${P(n.result)}` : ''); s = `Probability tree: ${sp.branches.map(b => walk(b, [])).join('; ')}`; }
    else if (sp.type === 'venn') s = `Venn diagram of ${sp.sets.map(P).join(', ')}${sp.shade.length ? `; shaded: ${sp.shade.map(m => regionName(m, sp.sets.map(P))).join(', ')}` : ''}${Object.keys(sp.values).length ? `; ${Object.keys(sp.values).map(m => `${regionName(+m, sp.sets.map(P))}: ${P(sp.values[m])}`).join(', ')}` : ''}`;
    else if (sp.type === 'flow') s = `Flow chart: ${sp.steps.map((x, k) => `${k + 1}. ${P(x.text)}`).join(' → ')}${sp.loops.map(l => `; from step ${l.from + 1} back to step ${l.to + 1}${l.label ? ` (${P(l.label)})` : ''}`).join('')}`;
    return (s + (sp.caption ? `. ${P(sp.caption)}` : '')).replace(/\s+/g, ' ').trim();
  }

  /* ---------- the drawing as markup; a graph with sliders redraws as they move ---------- */
  const R = { graph, numberline, figure, unitcircle, bars, pie, scatter, boxplot, normal, tree, venn: vennDraw, flow };
  const LIVE = new Map();
  const sliderHtml = (sp, id) => `<div class="bd-sliders" role="group" aria-label="Change the numbers in the drawing">${sp.sliders.map(s => `<label class="bd-sl"><span class="bd-sl-n">${s.label ? `${lab(s.label)} ` : ''}<i>${esc(s.name)}</i> = <output>${esc(sig(s.value))}</output></span><input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}" data-bd-id="${id}" data-bd-p="${esc(s.name)}" aria-label="${esc(s.label || s.name)}"></label>`).join('')}</div>`;
  function html(sp, animate) {
    if (!sp) return '';
    const id = `bd${++uid}`; let inner;
    try {
      if (sp.type === 'table') inner = table(sp);
      else { const g = R[sp.type](sp, id); inner = `${svgOpen(g.w, g.h, plain(sp), id)}${g.body}</svg>`; }
    } catch (e) { return `<p class="bd-bad">This drawing could not be shown.</p>`; }
    const live = sp.sliders && sp.sliders.length; if (live) { LIVE.set(id, sp); if (LIVE.size > 60) LIVE.delete(LIVE.keys().next().value); }
    const F = sp.type === 'scatter' && sp.showR && sp.fit; const stat = F && Number.isFinite(F.r) ? `<p class="bd-stat">r = ${F.r.toFixed(3).replace('-', '−')} · r² = ${(F.r * F.r).toFixed(3)} · n = ${F.n}</p>` : '';
    return `<div class="bd bd-${sp.type}${animate ? ' bd-anim' : ''}" data-bd="${id}">${inner}</div>${stat}${live ? sliderHtml(sp, id) : ''}${sp.caption ? `<figcaption class="bd-cap">${esc(sp.caption).replace(/\$([^$]+)\$/g, '\\($1\\)')}</figcaption>` : ''}`;
  }
  let raf = 0; const dirty = new Set();
  function redraw() {
    raf = 0;
    dirty.forEach(id => { const sp = LIVE.get(id); const box = document.querySelector(`.bd[data-bd="${id}"]`); const svg = box && box.querySelector('svg'); if (!sp || !svg) return; try { const g = R[sp.type](sp, id); svg.innerHTML = `<title id="${id}">${esc(plain(sp))}</title>${g.body}`; } catch (e) {} box.classList.remove('bd-anim'); });
    dirty.clear();
  }
  if (global.document) document.addEventListener('input', e => {
    const el = e.target; if (!el || !el.matches || !el.matches('input[data-bd-p]')) return;
    const sp = LIVE.get(el.dataset.bdId); if (!sp || !sp.params) return;
    sp.params[el.dataset.bdP] = +el.value; const out = el.closest('.bd-sl') && el.closest('.bd-sl').querySelector('output'); if (out) out.textContent = sig(+el.value);
    dirty.add(el.dataset.bdId); if (!raf) raf = requestAnimationFrame(redraw);
  });

  App.boDraw = { parse, html, plain, pretty, json, depth, value, TYPES };
})(window);
