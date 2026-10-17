/* ============================================================
   Mathub — tools (#/tools)
   Small utilities students reach for every week, all offline:
   a scientific calculator (degrees or radians, history, keyboard),
   a unit converter for physics, a citation builder (APA 7 and MLA 9
   for websites, books and journal articles), a word counter with
   reading time and readability, and a significant-figures helper.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, on, toast, settings, setSetting } = App;

  /* ---------- calculator ---------- */
  const CALC = { history: [], ans: 0 };
  function wrapTrig(s, name, pre, post) {
    let out = '', i = 0;
    while (i < s.length) {
      if (s.startsWith(name + '(', i) && !/[a-z]/i.test(s[i - 1] || '')) {
        let j = i + name.length + 1, depth = 1; while (j < s.length && depth) { if (s[j] === '(') depth++; else if (s[j] === ')') depth--; j++; }
        const inner = wrapTrig(s.slice(i + name.length + 1, j - 1), name, pre, post); out += pre + inner + post; i = j;
      } else { out += s[i]; i++; }
    }
    return out;
  }
  function evaluate(expr, deg) {
    let s = String(expr).replace(/ans/gi, `(${CALC.ans})`).replace(/√/g, 'sqrt').replace(/×/g, '*').replace(/÷/g, '/').replace(/²/g, '^2').replace(/%/g, '/100');
    if (deg) { ['sin', 'cos', 'tan'].forEach(f => { s = wrapTrig(s, f, `${f}((pi/180)*(`, '))'); }); ['asin', 'acos', 'atan'].forEach(f => { s = wrapTrig(s, f, `((180/pi)*${f}(`, '))'); }); }
    const v = App.compileExpr(s)(0); if (!isFinite(v)) throw new Error('That is not a number (division by zero or out of range).');
    return v;
  }
  const fmtNum = v => { if (Math.abs(v) >= 1e12 || (Math.abs(v) < 1e-6 && v !== 0)) return v.toExponential(6).replace(/\.?0+e/, 'e'); const r = Math.round(v * 1e10) / 1e10; return String(r).length > 14 ? v.toPrecision(10).replace(/\.?0+$/, '') : String(r); };
  function calcHtml() {
    const keys = [['7', '8', '9', '÷', 'sin', 'asin'], ['4', '5', '6', '×', 'cos', 'acos'], ['1', '2', '3', '−', 'tan', 'atan'], ['0', '.', '(', ')', '+', '^'], ['π', 'e', '√', 'ln', 'log', 'x²'], ['ans', '!', 'C', '⌫', '=', '=']];
    return `<div class="tool-calc"><div class="tc-display"><input class="input mono tc-input" id="tc-in" placeholder="2*sin(30) + sqrt(16)" autocomplete="off" spellcheck="false" aria-label="Expression"><div class="tc-out" id="tc-out" aria-live="polite">0</div></div>
      <div class="row between mb-1"><div class="row gap-sm"><button class="chip toggle${settings().calcDeg === false ? '' : ' on'}" data-action="tc-mode" data-m="deg">DEG</button><button class="chip toggle${settings().calcDeg === false ? ' on' : ''}" data-action="tc-mode" data-m="rad">RAD</button></div><span class="small muted">Enter evaluates · functions: sin cos tan asin acos atan ln log log2 sqrt abs floor ceil exp · pi, e, ans</span></div>
      <div class="tc-keys">${keys.flat().map((k, i) => { if (k === '=' && i % 6 === 5) return ''; const wide = k === '=' ? ' wide' : ''; const cls = /^[0-9.]$/.test(k) ? ' num' : k === '=' ? ' eq' : /^(C|⌫)$/.test(k) ? ' fn danger' : ' fn'; return `<button class="tc-key${cls}${wide}" data-action="tc-key" data-k="${esc(k)}">${k}</button>`; }).join('')}</div>
      <div class="tc-hist" id="tc-hist"></div></div>`;
  }
  function calcBind(root) {
    const inp = $('#tc-in', root), out = $('#tc-out', root), hist = $('#tc-hist', root);
    const deg = () => settings().calcDeg !== false;
    const run = () => { const e = inp.value.trim(); if (!e) return; try { const v = evaluate(e, deg()); CALC.ans = v; out.textContent = fmtNum(v); out.classList.remove('err'); CALC.history.unshift([e, fmtNum(v)]); CALC.history = CALC.history.slice(0, 12); paintHist(); if (App.burst) App.burst(out, 'pop'); } catch (err) { out.textContent = err.message; out.classList.add('err'); if (App.burst) App.burst(out, 'shake'); } };
    const paintHist = () => { hist.innerHTML = CALC.history.length ? CALC.history.map(([e, v]) => `<button class="tc-row" data-action="tc-recall" data-e="${esc(e)}"><span class="mono">${esc(e)}</span><b class="mono">= ${esc(v)}</b></button>`).join('') : '<div class="small muted">Results appear here. Click one to reuse it.</div>'; };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    bind(root, {
      'tc-key': b => { const k = b.dataset.k; if (k === '=') return run(); if (k === 'C') { inp.value = ''; out.textContent = '0'; out.classList.remove('err'); inp.focus(); return; } if (k === '⌫') { inp.value = inp.value.slice(0, -1); inp.focus(); return; }
        const ins = { '×': '*', '÷': '/', '−': '-', 'π': 'pi', '√': 'sqrt(', 'x²': '^2', sin: 'sin(', cos: 'cos(', tan: 'tan(', asin: 'asin(', acos: 'acos(', atan: 'atan(', ln: 'ln(', log: 'log(', '!': '!' }[k] ?? k;
        if (k === '!') { try { const v = evaluate(inp.value || '0', deg()); const n = Math.round(v); if (n < 0 || n > 170 || n !== v) throw new Error('Factorial needs a whole number from 0 to 170.'); let f = 1; for (let i = 2; i <= n; i++) f *= i; inp.value = String(f); out.textContent = fmtNum(f); } catch (err) { out.textContent = err.message; out.classList.add('err'); } return; }
        const start = inp.selectionStart ?? inp.value.length; inp.value = inp.value.slice(0, start) + ins + inp.value.slice(inp.selectionEnd ?? start); inp.focus(); inp.setSelectionRange(start + ins.length, start + ins.length); },
      'tc-mode': b => { setSetting('calcDeg', b.dataset.m === 'deg'); $$('[data-action="tc-mode"]', root).forEach(x => x.classList.toggle('on', x === b)); if (inp.value) run(); },
      'tc-recall': b => { inp.value = b.dataset.e; inp.focus(); }
    });
    paintHist(); inp.focus();
  }

  /* ---------- units ---------- */
  const UNITS = {
    length: { label: 'Length', base: 'm', u: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 } },
    mass: { label: 'Mass', base: 'kg', u: { mg: 1e-6, g: 0.001, kg: 1, lb: 0.45359237, oz: 0.028349523, 'metric ton': 1000 } },
    time: { label: 'Time', base: 's', u: { ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, week: 604800, year: 31557600 } },
    speed: { label: 'Speed', base: 'm/s', u: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, 'ft/s': 0.3048, knot: 0.514444 } },
    acceleration: { label: 'Acceleration', base: 'm/s²', u: { 'm/s²': 1, 'ft/s²': 0.3048, g: 9.80665, 'km/h/s': 1 / 3.6 } },
    force: { label: 'Force', base: 'N', u: { N: 1, kN: 1000, lbf: 4.4482216, dyn: 1e-5, kgf: 9.80665 } },
    energy: { label: 'Energy', base: 'J', u: { J: 1, kJ: 1000, MJ: 1e6, cal: 4.184, kcal: 4184, eV: 1.602176634e-19, kWh: 3.6e6, 'ft·lb': 1.3558179, BTU: 1055.056 } },
    power: { label: 'Power', base: 'W', u: { W: 1, kW: 1000, MW: 1e6, hp: 745.69987, 'ft·lb/s': 1.3558179 } },
    pressure: { label: 'Pressure', base: 'Pa', u: { Pa: 1, kPa: 1000, MPa: 1e6, atm: 101325, bar: 1e5, psi: 6894.757, mmHg: 133.322, torr: 133.322 } },
    angle: { label: 'Angle', base: 'rad', u: { rad: 1, deg: Math.PI / 180, rev: 2 * Math.PI, grad: Math.PI / 200 } },
    area: { label: 'Area', base: 'm²', u: { 'mm²': 1e-6, 'cm²': 1e-4, 'm²': 1, 'km²': 1e6, 'in²': 0.00064516, 'ft²': 0.09290304, acre: 4046.8564, hectare: 10000 } },
    volume: { label: 'Volume', base: 'L', u: { mL: 0.001, L: 1, 'm³': 1000, 'cm³': 0.001, 'fl oz (US)': 0.0295735, 'cup (US)': 0.236588, 'gal (US)': 3.78541, 'in³': 0.0163871 } },
    temperature: { label: 'Temperature', base: '°C', u: { '°C': 1, '°F': 1, K: 1 } },
    data: { label: 'Data', base: 'B', u: { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1048576, GiB: 1073741824 } }
  };
  function convert(cat, v, from, to) {
    if (cat === 'temperature') { let c = from === '°C' ? v : from === '°F' ? (v - 32) * 5 / 9 : v - 273.15; return to === '°C' ? c : to === '°F' ? c * 9 / 5 + 32 : c + 273.15; }
    const U = UNITS[cat].u; return v * U[from] / U[to];
  }
  const sig = (v, n = 6) => { if (v === 0) return '0'; const s = Number(v.toPrecision(n)); return Math.abs(s) >= 1e9 || Math.abs(s) < 1e-4 ? s.toExponential(n - 1).replace(/\.?0+e/, 'e') : String(s); };
  App.convertUnits = convert;
  function unitsHtml() {
    const cat = settings().unitCat || 'speed';
    return `<div class="tool-units"><div class="field"><label for="tu-cat">Quantity</label><select class="select" id="tu-cat">${Object.entries(UNITS).map(([k, c]) => `<option value="${k}"${k === cat ? ' selected' : ''}>${c.label}</option>`).join('')}</select></div>
      <div class="tu-row"><div class="field"><label for="tu-v">Value</label><input class="input mono" id="tu-v" value="1" inputmode="decimal"></div><div class="field"><label for="tu-from">From</label><select class="select" id="tu-from"></select></div><button class="icon-btn tu-swap" data-action="tu-swap" title="Swap" aria-label="Swap units">${icon('rotate', 15)}</button><div class="field"><label for="tu-to">To</label><select class="select" id="tu-to"></select></div></div>
      <div class="tu-out" id="tu-out" aria-live="polite"></div><div class="tu-table" id="tu-table"></div></div>`;
  }
  function unitsBind(root) {
    const catEl = $('#tu-cat', root), vEl = $('#tu-v', root), fromEl = $('#tu-from', root), toEl = $('#tu-to', root), out = $('#tu-out', root), table = $('#tu-table', root);
    const DEF = { length: ['km', 'mi'], mass: ['kg', 'lb'], time: ['h', 'min'], speed: ['km/h', 'm/s'], acceleration: ['g', 'm/s²'], force: ['lbf', 'N'], energy: ['kcal', 'J'], power: ['hp', 'W'], pressure: ['atm', 'Pa'], angle: ['deg', 'rad'], area: ['ft²', 'm²'], volume: ['gal (US)', 'L'], temperature: ['°F', '°C'], data: ['GB', 'MB'] };
    const fill = () => { const cat = catEl.value; setSetting('unitCat', cat); const names = Object.keys(UNITS[cat].u); const [a, b] = DEF[cat] || names; fromEl.innerHTML = names.map(n => `<option${n === a ? ' selected' : ''}>${n}</option>`).join(''); toEl.innerHTML = names.map(n => `<option${n === b ? ' selected' : ''}>${n}</option>`).join(''); calc(); };
    const calc = () => { const cat = catEl.value; const v = App.parseNumber(vEl.value); if (isNaN(v)) { out.innerHTML = '<span class="muted">Enter a number (fractions and 2pi work too).</span>'; table.innerHTML = ''; return; } const r = convert(cat, v, fromEl.value, toEl.value); out.innerHTML = `<span class="mono">${esc(sig(v))} ${esc(fromEl.value)}</span> = <b class="mono">${esc(sig(r))} ${esc(toEl.value)}</b>`; const names = Object.keys(UNITS[cat].u); table.innerHTML = `<table class="table compact"><tbody>${names.filter(n => n !== fromEl.value).map(n => `<tr><td class="mono">${esc(sig(convert(cat, v, fromEl.value, n)))}</td><td>${esc(n)}</td></tr>`).join('')}</tbody></table>`; };
    catEl.addEventListener('change', fill); [vEl, fromEl, toEl].forEach(el => el.addEventListener('input', calc)); bind(root, { 'tu-swap': () => { const a = fromEl.value; fromEl.value = toEl.value; toEl.value = a; calc(); } }); fill();
  }

  /* ---------- citations ---------- */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MLA_MON = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
  function authors(raw, style) {
    const list = String(raw || '').split(/;|\band\b|&/).map(s => s.trim()).filter(Boolean).map(name => { const parts = name.split(/\s+/); const last = parts.pop(); const first = parts.join(' '); return { first, last }; });
    if (!list.length) return '';
    if (style === 'apa') { const f = a => a.first ? `${a.last}, ${a.first.split(/\s+/).map(x => x[0].toUpperCase() + '.').join(' ')}` : a.last; if (list.length === 1) return f(list[0]); if (list.length === 2) return `${f(list[0])}, & ${f(list[1])}`; return list.slice(0, -1).map(f).join(', ') + ', & ' + f(list[list.length - 1]); }
    const first = list[0].first ? `${list[0].last}, ${list[0].first}` : list[0].last; if (list.length === 1) return first; if (list.length === 2) return `${first}, and ${list[1].first ? list[1].first + ' ' + list[1].last : list[1].last}`; return `${first}, et al.`;
  }
  const dateParts = iso => { const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(iso || '').trim()); if (!m) return null; return { y: m[1], mo: m[2] ? +m[2] : null, d: m[3] ? +m[3] : null }; };
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const endDot = s => (s && !/[.?!]$/.test(s.trim())) ? s.trim() + '.' : (s || '').trim();
  function cite(f) {
    const dp = dateParts(f.date); const yr = dp ? dp.y : 'n.d.'; const apaDate = dp ? (dp.mo ? `${dp.y}, ${MONTHS[dp.mo - 1]}${dp.d ? ' ' + dp.d : ''}` : dp.y) : 'n.d.'; const mlaDate = dp ? `${dp.d ? dp.d + ' ' : ''}${dp.mo ? MLA_MON[dp.mo - 1] + ' ' : ''}${dp.y}` : 'n.d.';
    const A = authors(f.author, 'apa'), M = authors(f.author, 'mla'); const t = (f.title || '').trim(); const src = (f.source || '').trim(); const url = (f.url || '').trim();
    let apa, mla;
    if (f.type === 'web') {
      apa = `${A ? endDot(A) + ' ' : ''}(${apaDate}). *${t}*. ${src ? endDot(src) + ' ' : ''}${url}`.trim(); if (!A && src) apa = `${endDot(src)} (${apaDate}). *${t}*. ${url}`;
      mla = `${M ? endDot(M) + ' ' : ''}"${endDot(t)}" *${src || 'Web'}*, ${mlaDate}, ${url.replace(/^https?:\/\//, '')}.`;
    } else if (f.type === 'book') {
      apa = `${A ? endDot(A) + ' ' : ''}(${yr}). *${t}*${f.edition ? ` (${f.edition} ed.)` : ''}. ${src || 'Publisher'}.`;
      mla = `${M ? endDot(M) + ' ' : ''}*${t}*. ${f.edition ? f.edition + ' ed., ' : ''}${src || 'Publisher'}, ${yr}.`;
    } else {
      apa = `${A ? endDot(A) + ' ' : ''}(${yr}). ${endDot(t)} *${src}*${f.volume ? `, *${f.volume}*` : ''}${f.issue ? `(${f.issue})` : ''}${f.pages ? `, ${f.pages}` : ''}. ${url}`.trim();
      mla = `${M ? endDot(M) + ' ' : ''}"${endDot(t)}" *${src}*${f.volume ? `, vol. ${f.volume}` : ''}${f.issue ? `, no. ${f.issue}` : ''}, ${yr}${f.pages ? `, pp. ${f.pages}` : ''}${url ? `, ${url.replace(/^https?:\/\//, '')}` : ''}.`;
    }
    return { apa, mla };
  }
  App.cite = cite;
  const md2html = s => esc(s).replace(/\*([^*]+)\*/g, '<i>$1</i>');
  function citeHtml() {
    return `<div class="tool-cite"><div class="row gap-sm mb-2">${[['web', 'Website'], ['book', 'Book'], ['journal', 'Journal article']].map(([k, l], i) => `<button class="chip toggle${i === 0 ? ' on' : ''}" data-action="ct-type" data-t="${k}">${l}</button>`).join('')}</div>
      <div class="grid cols-2 ct-fields"><div class="field"><label for="ct-author">Author(s) <span class="muted">(First Last; First Last)</span></label><input class="input" id="ct-author" placeholder="Tommy Orange"></div><div class="field"><label for="ct-date">Date <span class="muted">(YYYY, YYYY-MM or YYYY-MM-DD)</span></label><input class="input" id="ct-date" placeholder="2018-06-05"></div>
        <div class="field"><label for="ct-title" id="ct-title-l">Page title</label><input class="input" id="ct-title" placeholder="Title"></div><div class="field"><label for="ct-source" id="ct-source-l">Website name</label><input class="input" id="ct-source" placeholder="Site, publisher or journal"></div>
        <div class="field ct-web ct-journal"><label for="ct-url">URL or DOI</label><input class="input" id="ct-url" placeholder="https://"></div><div class="field ct-book"><label for="ct-edition">Edition</label><input class="input" id="ct-edition" placeholder="2nd"></div>
        <div class="field ct-journal"><label for="ct-volume">Volume</label><input class="input" id="ct-volume"></div><div class="field ct-journal"><label for="ct-issue">Issue</label><input class="input" id="ct-issue"></div><div class="field ct-journal"><label for="ct-pages">Pages</label><input class="input" id="ct-pages" placeholder="12-34"></div></div>
      <div class="ct-out"><div class="ct-cite"><div class="row between"><span class="eyebrow">MLA 9</span><button class="btn xs" data-action="ct-copy" data-s="mla">${icon('file', 12)} Copy</button></div><p id="ct-mla" class="ct-text"></p></div><div class="ct-cite"><div class="row between"><span class="eyebrow">APA 7</span><button class="btn xs" data-action="ct-copy" data-s="apa">${icon('file', 12)} Copy</button></div><p id="ct-apa" class="ct-text"></p></div></div>
      <p class="small muted">Italics are shown; when you paste into a document, italicize the same part. Check capitalization against <a href="https://owl.purdue.edu/owl/purdue_owl.html" target="_blank" rel="noopener">Purdue OWL</a> for anything unusual.</p></div>`;
  }
  function citeBind(root) {
    let type = 'web'; const cur = {};
    const labels = { web: ['Page title', 'Website name'], book: ['Book title', 'Publisher'], journal: ['Article title', 'Journal name'] };
    const paint = () => { const f = { type, author: $('#ct-author', root).value, date: $('#ct-date', root).value, title: $('#ct-title', root).value, source: $('#ct-source', root).value, url: $('#ct-url', root).value, edition: $('#ct-edition', root).value, volume: $('#ct-volume', root).value, issue: $('#ct-issue', root).value, pages: $('#ct-pages', root).value }; const r = cite(f); cur.apa = r.apa; cur.mla = r.mla; $('#ct-mla', root).innerHTML = md2html(r.mla); $('#ct-apa', root).innerHTML = md2html(r.apa); };
    const setType = t => { type = t; $$('[data-action="ct-type"]', root).forEach(b => b.classList.toggle('on', b.dataset.t === t)); $$('.ct-fields .field', root).forEach(el => { const cls = [...el.classList].filter(c => c.startsWith('ct-')); el.hidden = cls.length > 0 && !cls.includes('ct-' + t); }); $('#ct-title-l', root).textContent = labels[t][0]; $('#ct-source-l', root).textContent = labels[t][1]; paint(); };
    $$('.ct-fields input', root).forEach(i => i.addEventListener('input', paint));
    bind(root, { 'ct-type': b => setType(b.dataset.t), 'ct-copy': async b => { const txt = (cur[b.dataset.s] || '').replace(/\*/g, ''); try { await navigator.clipboard.writeText(txt); toast('Copied. Italicize the title where shown.', 2200); } catch (e) { toast('Select the text and copy it.'); } } });
    setType('web');
  }

  /* ---------- word counter ---------- */
  const STOP = new Set('the a an and or but of to in on at for with is are was were be been it its this that these those as by from i you he she they we my your our their his her not no so if then than too very can will just do does did have has had about into over after before also more most such what which who whom when where why how'.split(' '));
  const syllables = w => { w = w.toLowerCase().replace(/[^a-z]/g, ''); if (!w) return 0; if (w.length <= 3) return 1; w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, ''); const m = w.match(/[aeiouy]{1,2}/g); return m ? m.length : 1; };
  function textStats(t) {
    const words = (t.match(/[A-Za-z0-9'’-]+/g) || []); const sentences = (t.match(/[^.!?]+[.!?]+(\s|$)/g) || (t.trim() ? [t] : [])); const paras = t.split(/\n\s*\n/).filter(p => p.trim()).length;
    const syl = words.reduce((n, w) => n + syllables(w), 0); const W = words.length, S = Math.max(1, sentences.length);
    const flesch = W ? Math.round(206.835 - 1.015 * (W / S) - 84.6 * (syl / W)) : null;
    const longest = sentences.reduce((m, s) => Math.max(m, (s.match(/[A-Za-z0-9'’-]+/g) || []).length), 0);
    const freq = {}; words.forEach(w => { const k = w.toLowerCase(); if (!STOP.has(k) && k.length > 2) freq[k] = (freq[k] || 0) + 1; }); const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { words: W, chars: t.length, charsNoSpace: t.replace(/\s/g, '').length, sentences: t.trim() ? sentences.length : 0, paras, avg: W ? Math.round(10 * W / S) / 10 : 0, read: Math.ceil(W / 238), speak: Math.ceil(W / 150), flesch, longest, top };
  }
  App.textStats = textStats;
  function wordsHtml() { return `<div class="tool-words"><div class="row between mb-1"><label for="tw-in" class="eyebrow">Paste your draft</label><div class="row gap-sm"><label class="small muted" for="tw-target">Target words</label><input class="input sm mono" id="tw-target" type="number" value="${settings().wordTarget || 1000}" style="width:90px"></div></div><textarea class="input" id="tw-in" rows="9" placeholder="Nothing leaves your browser."></textarea><div class="bar sm mt-1"><div class="bar-fill" id="tw-bar" style="width:0%"></div></div><div class="tw-stats" id="tw-stats"></div></div>`; }
  function wordsBind(root) {
    const ta = $('#tw-in', root), tg = $('#tw-target', root), st = $('#tw-stats', root), bar = $('#tw-bar', root);
    const paint = () => { const s = textStats(ta.value); const target = Math.max(1, +tg.value || 1000); setSetting('wordTarget', target); bar.style.width = Math.min(100, 100 * s.words / target) + '%'; bar.classList.toggle('good', s.words >= target); const ease = s.flesch === null ? '—' : s.flesch >= 70 ? `${s.flesch} · easy` : s.flesch >= 50 ? `${s.flesch} · fairly readable` : s.flesch >= 30 ? `${s.flesch} · dense` : `${s.flesch} · very dense`;
      st.innerHTML = [['Words', s.words], ['Characters', s.chars], ['Sentences', s.sentences], ['Paragraphs', s.paras], ['Words per sentence', s.avg], ['Longest sentence', s.longest ? s.longest + ' words' : '—'], ['Reading time', s.words ? s.read + ' min' : '—'], ['Speaking time', s.words ? s.speak + ' min' : '—'], ['Reading ease', ease]].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('') + (s.top.length ? `<div class="tw-top"><small>Most used words</small><span>${s.top.map(([w, n]) => `<span class="chip xs">${esc(w)} ×${n}</span>`).join(' ')}</span></div>` : ''); };
    ta.addEventListener('input', paint); tg.addEventListener('input', paint); paint();
  }

  /* ---------- significant figures ---------- */
  function sigfigs(str) {
    const s = String(str).trim().replace(/,/g, ''); if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
    const mant = s.replace(/[eE].*$/, '').replace(/^[-+]/, ''); const hasDot = mant.includes('.'); let digits = mant.replace('.', '').replace(/^0+/, '');
    if (!digits.length) return { n: 1, note: 'Zero has one significant figure by convention.' };
    if (!hasDot) { const trailing = (digits.match(/0+$/) || [''])[0].length; return { n: digits.length - trailing, ambiguous: trailing > 0, note: trailing ? `Trailing zeros without a decimal point are ambiguous: write ${Number(s).toExponential()} to make it clear.` : '' }; }
    return { n: digits.length, note: '' };
  }
  const roundSig = (v, n) => v === 0 ? '0' : Number(v.toPrecision(n)).toString();
  App.sigfigs = sigfigs;
  function sigHtml() { return `<div class="tool-sig"><div class="grid cols-2"><div class="field"><label for="ts-in">Number</label><input class="input mono" id="ts-in" placeholder="0.004500" value="0.004500"></div><div class="field"><label for="ts-n">Round to</label><select class="select" id="ts-n">${[1, 2, 3, 4, 5, 6].map(n => `<option${n === 3 ? ' selected' : ''}>${n}</option>`).join('')}</select></div></div><div class="ts-out" id="ts-out"></div><p class="small muted">Rules: non-zero digits always count; zeros between them count; leading zeros never count; trailing zeros count only with a decimal point. Multiplying or dividing keeps the fewest sig figs of the inputs; adding keeps the fewest decimal places.</p></div>`; }
  function sigBind(root) { const inp = $('#ts-in', root), sel = $('#ts-n', root), out = $('#ts-out', root); const paint = () => { const r = sigfigs(inp.value); if (!r) { out.innerHTML = '<span class="muted">Enter a plain number such as 0.004500 or 6.02e23.</span>'; return; } const v = Number(inp.value.replace(/,/g, '')); const n = +sel.value; out.innerHTML = `<div class="ts-row"><small>Significant figures</small><b>${r.n}${r.ambiguous ? ' (or more)' : ''}</b></div><div class="ts-row"><small>Rounded to ${n}</small><b class="mono">${roundSig(v, n)}</b></div><div class="ts-row"><small>Scientific notation</small><b class="mono">${v === 0 ? '0' : v.toExponential(Math.max(0, r.n - 1))}</b></div>${r.note ? `<p class="small muted">${esc(r.note)}</p>` : ''}`; }; inp.addEventListener('input', paint); sel.addEventListener('change', paint); paint(); }

  /* ---------- view ---------- */
  const TABS = [['calc', 'Calculator', 'calc', calcHtml, calcBind], ['units', 'Units', 'sliders', unitsHtml, unitsBind], ['cite', 'Citations', 'pen', citeHtml, citeBind], ['words', 'Word counter', 'file', wordsHtml, wordsBind], ['sig', 'Sig figs', 'sigma', sigHtml, sigBind]];
  App.views.tools = {
    title: 'Tools', blurb: 'Calculator, unit converter, citation builder, word counter and sig figs. Everything runs in your browser and works offline.',
    render(root, param, query, standalone) {
      const head = standalone ? `<div class="landing-wrap"><header class="landing-top"><div><div class="eyebrow">Mathub</div><h1 class="landing-title"><span class="logo-mark">${App.logoSvg(44)}</span>Tools</h1><p class="muted">${this.blurb}</p></div><div class="row gap-sm"><span id="landing-account"></span><a class="btn" href="#/">${icon('left', 14)} All classes</a></div></header>` : App.pageHead('Tools', this.blurb);
      root.innerHTML = `${head}<div class="dash-tabs" data-store="toolsTab" role="tablist">${TABS.map(([k, l, ic]) => `<button class="tab" data-tab="${k}" role="tab">${icon(ic, 14)}<span>${l}</span></button>`).join('')}</div><div class="panes">${TABS.map(([k, , , html]) => `<div class="pane" data-pane="${k}"><div class="panel">${html()}</div></div>`).join('')}</div>${standalone ? '</div>' : ''}`;
      TABS.forEach(([k, , , , bindFn]) => bindFn($(`.pane[data-pane="${k}"]`, root)));
      if (param && TABS.some(t => t[0] === param)) { setSetting('toolsTab', param); }
      const slot = $('#landing-account', root); if (slot && App.auth && App.auth.ready) App.auth.paintLandingAccount(slot);
    }
  };
})(window);
