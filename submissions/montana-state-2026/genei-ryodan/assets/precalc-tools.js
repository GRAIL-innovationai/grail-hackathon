/* ============================================================
   Mathub — Precalculus tools: function explorer, unit circle & triangles
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App;
  const { $, $$, esc, icon, bind, typeset, fmtNum, fitCanvas, cssVar, niceStep, pageHead, parseNumber } = App;
  const s3 = x => isFinite(x) ? (Math.abs(x) < 1e-9 ? '0' : String(+x.toPrecision(4))) : '—';
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;

  /* ---------- Function explorer ---------- */
  const BASES = {
    'x^2': { f: x => x * x, tex: 'x^2', dom: [-Infinity, Infinity, 0, 0], rng: [0, Infinity, 0, 0], name: 'y = x²' },
    'x^3': { f: x => x * x * x, tex: 'x^3', dom: [-Infinity, Infinity, 0, 0], rng: [-Infinity, Infinity, 0, 0], name: 'y = x³' },
    'sqrt': { f: x => Math.sqrt(x), tex: '\\sqrt{x}', dom: [0, Infinity, 0, 0], rng: [0, Infinity, 0, 0], name: 'y = √x' },
    'cbrt': { f: x => Math.cbrt(x), tex: '\\sqrt[3]{x}', dom: [-Infinity, Infinity, 0, 0], rng: [-Infinity, Infinity, 0, 0], name: 'y = ∛x' },
    'recip': { f: x => 1 / x, tex: '\\frac{1}{x}', dom: [-Infinity, Infinity, 0, 0, 0], rng: [-Infinity, Infinity, 0, 0, 0], name: 'y = 1/x' },
    'recip2': { f: x => 1 / (x * x), tex: '\\frac{1}{x^2}', dom: [-Infinity, Infinity, 0, 0, 0], rng: [0, Infinity, 1, 0], name: 'y = 1/x²' },
    'abs': { f: x => Math.abs(x), tex: '|x|', dom: [-Infinity, Infinity, 0, 0], rng: [0, Infinity, 0, 0], name: 'y = |x|' },
    'exp': { f: x => Math.pow(2, x), tex: '2^x', dom: [-Infinity, Infinity, 0, 0], rng: [0, Infinity, 1, 0], name: 'y = 2ˣ' },
    'ln': { f: x => Math.log(x), tex: '\\ln x', dom: [0, Infinity, 1, 0], rng: [-Infinity, Infinity, 0, 0], name: 'y = ln x' },
    'sin': { f: x => Math.sin(x), tex: '\\sin x', dom: [-Infinity, Infinity, 0, 0], rng: [-1, 1, 0, 0], name: 'y = sin x' },
    'cos': { f: x => Math.cos(x), tex: '\\cos x', dom: [-Infinity, Infinity, 0, 0], rng: [-1, 1, 0, 0], name: 'y = cos x' }
  };
  const FX = { base: 'x^2', a: 1, b: 1, h: 0, k: 0, view: { xmin: -8, xmax: 8, ymin: -6, ymax: 6 } };
  const ivl = (lo, hi, loOpen, hiOpen, excl) => { const L = lo === -Infinity ? '(−∞' : (loOpen ? '(' : '[') + s3(lo); const H = hi === Infinity ? '∞)' : s3(hi) + (hiOpen ? ')' : ']'); const core = `${L}, ${H}`; return excl !== undefined ? `${core} except x = ${s3(excl)}` : core; };
  function transformedDomain() { const B = BASES[FX.base]; const [lo, hi, lop, hip, excl] = B.dom; const map = t => FX.h + t / FX.b; let a = map(lo), c = map(hi), ao = lop, co = hip; if (FX.b < 0) { [a, c] = [c, a]; [ao, co] = [co, ao]; } return ivl(a, c, ao, co, excl !== undefined ? map(excl) : undefined).replace('except x =', 'except x ='); }
  function transformedRange() { const B = BASES[FX.base]; const [lo, hi, lop, hip, excl] = B.rng; const map = t => FX.a * t + FX.k; let a = map(lo), c = map(hi), ao = lop, co = hip; if (FX.a < 0) { [a, c] = [c, a]; [ao, co] = [co, ao]; } if (FX.a === 0) return `{${s3(FX.k)}}`; return ivl(a, c, ao, co, excl !== undefined ? map(excl) : undefined).replace('except x =', 'except y ='); }
  function describe() {
    const parts = [];
    if (FX.h !== 0) parts.push(`shift ${FX.h > 0 ? 'right' : 'left'} ${s3(Math.abs(FX.h))}`);
    if (Math.abs(FX.b) !== 1) parts.push(Math.abs(FX.b) > 1 ? `compress horizontally by a factor of ${s3(Math.abs(FX.b))}` : `stretch horizontally by a factor of ${s3(1 / Math.abs(FX.b))}`);
    if (FX.b < 0) parts.push('reflect across the y-axis');
    if (Math.abs(FX.a) !== 1) parts.push(Math.abs(FX.a) > 1 ? `stretch vertically by ${s3(Math.abs(FX.a))}` : `compress vertically by ${s3(Math.abs(FX.a))}`);
    if (FX.a < 0) parts.push('reflect across the x-axis');
    if (FX.k !== 0) parts.push(`shift ${FX.k > 0 ? 'up' : 'down'} ${s3(Math.abs(FX.k))}`);
    return parts.length ? parts.join(', then ') + '.' : 'No transformation: this is the parent function.';
  }
  function formulaTex() {
    const B = BASES[FX.base]; const inner = FX.h === 0 ? 'x' : `(x ${FX.h > 0 ? '-' : '+'} ${s3(Math.abs(FX.h))})`;
    const arg = FX.b === 1 ? inner : FX.b === -1 ? `(-${inner})` : `(${s3(FX.b)}${inner})`;
    const argIn = FX.b === 1 && FX.h === 0 ? 'x' : arg;
    const bodyOf = { 'x^2': `${argIn}^2`, 'x^3': `${argIn}^3`, sqrt: `\\sqrt{${argIn}}`, cbrt: `\\sqrt[3]{${argIn}}`, recip: `\\frac{1}{${argIn}}`, recip2: `\\frac{1}{${argIn}^2}`, abs: `\\left|${argIn}\\right|`, exp: `2^{${argIn}}`, ln: `\\ln${argIn === 'x' ? ' x' : argIn}`, sin: `\\sin${argIn === 'x' ? ' x' : argIn}`, cos: `\\cos${argIn === 'x' ? ' x' : argIn}` };
    const body = bodyOf[FX.base]; const aT = FX.a === 1 ? '' : FX.a === -1 ? '-' : `${s3(FX.a)}`; const kT = FX.k === 0 ? '' : ` ${FX.k > 0 ? '+' : '-'} ${s3(Math.abs(FX.k))}`;
    return `y = ${aT}${body}${kT}`;
  }
  App.views.explorer = {
    title: 'Function explorer',
    render(root) {
      root.innerHTML = pageHead('Function explorer', 'Pick a parent function and move the four sliders of y = a·f(b(x − h)) + k. The dashed curve is the parent; the solid curve is the result. The domain, range and a plain-English description update as you go.') + `
        <div class="graph-layout">
          <div class="graph-wrap"><canvas class="graph" id="fx-canvas"></canvas><div class="graph-legend" id="fx-legend"></div></div>
          <div class="stack">
            <div class="panel">
              <div class="field"><label>Parent function f(x)</label><select class="select" id="fx-base">${Object.entries(BASES).map(([k, b]) => `<option value="${k}"${FX.base === k ? ' selected' : ''}>${b.name}</option>`).join('')}</select></div>
              ${[['a', 'Vertical stretch a', -4, 4, 0.25], ['b', 'Horizontal factor b', -4, 4, 0.25], ['h', 'Horizontal shift h', -6, 6, 0.5], ['k', 'Vertical shift k', -6, 6, 0.5]].map(([id, label, mn, mx, st]) => `<div class="field mt-1"><label>${label} = <span class="mono" id="fx-${id}-val">${FX[id]}</span></label><input type="range" id="fx-${id}" min="${mn}" max="${mx}" step="${st}" value="${FX[id]}"></div>`).join('')}
              <div class="row mt-2"><button class="btn sm" data-action="reset">${icon('rotate', 13)} Reset</button><button class="btn sm" data-action="preset" data-p='{"base":"x^2","a":-2,"b":1,"h":-3,"k":4}'>Exam 1 #10</button><button class="btn sm" data-action="preset" data-p='{"base":"sqrt","a":1,"b":1,"h":2,"k":-5}'>Exam 1 #11</button><button class="btn sm" data-action="preset" data-p='{"base":"sin","a":3,"b":2,"h":0,"k":1}'>Sinusoid</button></div>
            </div>
            <div class="panel"><div class="eyebrow mb-1">Result</div><div id="fx-formula" style="font-size:18px"></div><div class="divider"></div><div class="readout" id="fx-read"></div><div class="divider"></div><div class="small" id="fx-words"></div></div>
          </div></div>`;
      const upd = () => { FX.base = $('#fx-base', root).value; ['a', 'b', 'h', 'k'].forEach(id => { FX[id] = +$('#fx-' + id, root).value; $(`#fx-${id}-val`, root).textContent = FX[id]; }); this.draw(root); };
      $('#fx-base', root).addEventListener('change', upd); ['a', 'b', 'h', 'k'].forEach(id => $('#fx-' + id, root).addEventListener('input', upd));
      bind(root, { reset: () => { Object.assign(FX, { a: 1, b: 1, h: 0, k: 0 }); this.render(root); }, preset: el => { Object.assign(FX, JSON.parse(el.dataset.p)); this.render(root); } });
      const canvas = $('#fx-canvas', root); let down = null;
      const toWorld = (px, py) => { const r = canvas.getBoundingClientRect(); const v = FX.view; return { x: v.xmin + (px - r.left) / r.width * (v.xmax - v.xmin), y: v.ymax - (py - r.top) / r.height * (v.ymax - v.ymin) }; };
      canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, view: { ...FX.view } }; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointermove', e => { if (!down) return; const r = canvas.getBoundingClientRect(); const v = down.view; const sx = (v.xmax - v.xmin) / r.width, sy = (v.ymax - v.ymin) / r.height; const dx = e.clientX - down.x, dy = e.clientY - down.y; FX.view = { xmin: v.xmin - dx * sx, xmax: v.xmax - dx * sx, ymin: v.ymin + dy * sy, ymax: v.ymax + dy * sy }; this.draw(root); });
      canvas.addEventListener('pointerup', () => { down = null; });
      canvas.addEventListener('wheel', e => { e.preventDefault(); const w = toWorld(e.clientX, e.clientY); const k = e.deltaY > 0 ? 1.15 : 0.87; const v = FX.view; FX.view = { xmin: w.x - (w.x - v.xmin) * k, xmax: w.x + (v.xmax - w.x) * k, ymin: w.y - (w.y - v.ymin) * k, ymax: w.y + (v.ymax - w.y) * k }; this.draw(root); }, { passive: false });
      canvas.addEventListener('dblclick', () => { FX.view = { xmin: -8, xmax: 8, ymin: -6, ymax: 6 }; this.draw(root); });
      this.resize = () => this.draw(root); window.addEventListener('resize', this.resize);
      this.draw(root);
    },
    unmount() { window.removeEventListener('resize', this.resize); },
    draw(root) {
      const canvas = $('#fx-canvas', root); if (!canvas) return; const { ctx, W, H } = fitCanvas(canvas); const v = FX.view;
      const sx = W / (v.xmax - v.xmin), sy = H / (v.ymax - v.ymin); const X = x => (x - v.xmin) * sx, Y = y => (v.ymax - y) * sy;
      const col = { surface: cssVar('--surface'), grid: cssVar('--border'), axis: cssVar('--border-strong'), ink: cssVar('--muted'), parent: cssVar('--muted'), f: cssVar('--accent'), anchor: cssVar('--gold') };
      ctx.fillStyle = col.surface; ctx.fillRect(0, 0, W, H);
      const stepX = niceStep(v.xmax - v.xmin), stepY = niceStep(v.ymax - v.ymin); ctx.lineWidth = 1; ctx.strokeStyle = col.grid; ctx.font = '11px "IBM Plex Mono", monospace'; ctx.fillStyle = col.ink;
      for (let x = Math.ceil(v.xmin / stepX) * stepX; x <= v.xmax; x += stepX) { ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), H); ctx.stroke(); if (Math.abs(x) > 1e-9) ctx.fillText(fmtNum(x, 3), X(x) + 3, Math.min(H - 4, Math.max(12, Y(0) + 13))); }
      for (let y = Math.ceil(v.ymin / stepY) * stepY; y <= v.ymax; y += stepY) { ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(W, Y(y)); ctx.stroke(); if (Math.abs(y) > 1e-9) ctx.fillText(fmtNum(y, 3), Math.min(W - 30, Math.max(3, X(0) + 4)), Y(y) - 3); }
      ctx.strokeStyle = col.axis; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.moveTo(X(0), 0); ctx.lineTo(X(0), H); ctx.stroke();
      const B = BASES[FX.base]; const g = x => FX.a * B.f(FX.b * (x - FX.h)) + FX.k;
      const plot = (fn, color, width, dash) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.beginPath(); let pen = false, prev = null; for (let px = 0; px <= W; px++) { const x = v.xmin + px / sx; const y = fn(x); const ok = isFinite(y) && Math.abs(y) < 1e6; if (!ok) { pen = false; prev = null; continue; } const py = Y(y); if (!pen || (prev !== null && Math.abs(py - prev) > H * 2)) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py); prev = py; } ctx.stroke(); ctx.setLineDash([]); };
      plot(B.f, col.parent, 1.6, [6, 5]); plot(g, col.f, 2.8);
      // anchor: image of the origin (or of (1,0) for ln, (0,1) for exp)
      const anchorX = FX.base === 'ln' ? 1 : 0, anchorY = B.f(anchorX); if (isFinite(anchorY)) { const ax = FX.h + anchorX / FX.b, ay = FX.a * anchorY + FX.k; ctx.fillStyle = col.anchor; ctx.beginPath(); ctx.arc(X(ax), Y(ay), 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = col.ink; ctx.fillText(`(${s3(ax)}, ${s3(ay)})`, X(ax) + 8, Y(ay) - 8); }
      const leg = $('#fx-legend', root); if (leg) leg.innerHTML = `<span><i style="background:${col.parent}"></i>parent</span><span><i style="background:${col.f}"></i>transformed</span><span><i style="background:${col.anchor}"></i>anchor point</span>`;
      const fm = $('#fx-formula', root); if (fm) { fm.innerHTML = `$$${formulaTex()}$$`; typeset(fm); }
      const rd = $('#fx-read', root); if (rd) rd.innerHTML = `<span class="k">Domain</span><span class="v">${transformedDomain()}</span><span class="k">Range</span><span class="v">${transformedRange()}</span><span class="k">y-intercept</span><span class="v">${isFinite(g(0)) ? s3(g(0)) : 'none'}</span>`;
      const w = $('#fx-words', root); if (w) w.textContent = 'Starting from ' + B.name + ': ' + describe() + (Math.abs(FX.b) !== 1 && FX.h !== 0 ? ' Note the factor b applies to (x − h), so the shift is h, not bh.' : '');
    }
  };

  /* ---------- Unit circle & triangles ---------- */
  const UC = { tab: 'circle', deg: 135, tri: { a: '8', b: '5', c: '', A: '', B: '', C: '60' }, rt: { opp: '', adj: '6', hyp: '10', ang: '' } };
  const EXACT_TABLE = { 0: ['0', '1', '0'], 30: ['\\tfrac12', '\\tfrac{\\sqrt3}{2}', '\\tfrac{\\sqrt3}{3}'], 45: ['\\tfrac{\\sqrt2}{2}', '\\tfrac{\\sqrt2}{2}', '1'], 60: ['\\tfrac{\\sqrt3}{2}', '\\tfrac12', '\\sqrt3'], 90: ['1', '0', '\\text{undef}'] };
  function exactTrig(d) { d = ((d % 360) + 360) % 360; const q = d < 90 ? 1 : d < 180 ? 2 : d < 270 ? 3 : 4; const ref = d <= 90 ? d : d <= 180 ? 180 - d : d <= 270 ? d - 180 : 360 - d; if (!(ref in EXACT_TABLE)) return null; const [s, c, t] = EXACT_TABLE[ref]; const sgnS = (q <= 2) ? 1 : -1, sgnC = (q === 1 || q === 4) ? 1 : -1; const sgn = (v, sg) => v === '0' ? '0' : (sg < 0 ? '-' : '') + v; let tan = t === '\\text{undef}' ? t : (ref === 0 ? '0' : sgn(t, sgnS * sgnC)); if (d === 180) return ['0', '-1', '0']; if (d === 270) return ['-1', '0', '\\text{undef}']; return [sgn(s, sgnS), sgn(c, sgnC), tan]; }
  App.views.unitcircle = {
    title: 'Unit circle & triangles',
    render(root, param) {
      if (param && ['circle', 'right', 'tri'].includes(param)) UC.tab = param;
      root.innerHTML = pageHead('Unit circle & triangles', 'Drag the angle around the unit circle to see reference angles, quadrant signs and exact values. Solve any right triangle or oblique triangle and see which law did the work.') + `<div class="tabs">${[['circle', 'Unit circle'], ['right', 'Right-triangle solver'], ['tri', 'Law of Sines / Cosines solver']].map(([k, l]) => `<button class="tab${UC.tab === k ? ' active' : ''}" data-action="tab" data-t="${k}">${l}</button>`).join('')}</div><div id="uc-body"></div>`;
      bind(root, { tab: el => { UC.tab = el.dataset.t; this.paint(root); }, compute: () => this.compute(root), snap: el => { UC.deg = +el.dataset.d; this.drawCircle(root); }, 'rt-preset': el => { UC.rt = JSON.parse(el.dataset.p); this.paint(root); }, 'tri-preset': el => { UC.tri = JSON.parse(el.dataset.p); this.paint(root); } });
      this.paint(root);
    },
    unmount() { window.removeEventListener('resize', this.resize); },
    paint(root) {
      const b = $('#uc-body', root);
      if (UC.tab === 'circle') {
        b.innerHTML = `<div class="graph-layout"><div class="graph-wrap"><canvas class="graph" id="uc-canvas" style="height:440px"></canvas></div><div class="stack"><div class="panel"><div class="field"><label>Angle θ (degrees) = <span class="mono" id="uc-deg-val">${UC.deg}</span></label><input type="range" id="uc-deg" min="0" max="360" step="1" value="${UC.deg}"><input class="input mono mt-1" id="uc-deg-num" type="number" step="1" value="${UC.deg}"></div><div class="chips mt-2">${[0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330].map(d => `<span class="chip toggle" data-action="snap" data-d="${d}">${d}°</span>`).join('')}</div></div><div class="panel"><div class="eyebrow mb-1">At this angle</div><div class="readout" id="uc-read"></div><div class="divider"></div><div id="uc-exact" class="small"></div></div></div></div>`;
        const upd = v => { UC.deg = ((+v % 360) + 360) % 360; $('#uc-deg', root).value = UC.deg; $('#uc-deg-num', root).value = UC.deg; $('#uc-deg-val', root).textContent = UC.deg; this.drawCircle(root); };
        $('#uc-deg', root).addEventListener('input', e => upd(e.target.value)); $('#uc-deg-num', root).addEventListener('change', e => upd(e.target.value));
        const c = $('#uc-canvas', root); let down = false; const setFromPointer = e => { const r = c.getBoundingClientRect(); const cx = r.width / 2, cy = r.height / 2; const ang = Math.atan2(cy - (e.clientY - r.top), (e.clientX - r.left) - cx); upd(Math.round(deg(ang))); };
        c.addEventListener('pointerdown', e => { down = true; c.setPointerCapture(e.pointerId); setFromPointer(e); }); c.addEventListener('pointermove', e => { if (down) setFromPointer(e); }); c.addEventListener('pointerup', () => { down = false; });
        this.resize = () => this.drawCircle(root); window.addEventListener('resize', this.resize); this.drawCircle(root);
      } else if (UC.tab === 'right') {
        const r = UC.rt; const F = (id, l, v) => `<div class="field"><label>${l}</label><input class="input mono" id="${id}" value="${esc(v)}"></div>`;
        b.innerHTML = `<div class="grid cols-3"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('target')} Right triangle</div></div><p class="small muted mb-1">Enter any two of the four (at least one side). θ is the acute angle opposite the side "opp".</p><div class="grid cols-2" style="gap:8px">${F('rt-opp', 'opp', r.opp)}${F('rt-adj', 'adj', r.adj)}${F('rt-hyp', 'hyp', r.hyp)}${F('rt-ang', 'θ (degrees)', r.ang)}</div><div class="preset-row mt-2">${[['{"opp":"","adj":"6","hyp":"10","ang":""}', 'Two sides'], ['{"opp":"","adj":"","hyp":"6","ang":"68"}', 'Ladder, 68°'], ['{"opp":"5","adj":"12","hyp":"","ang":""}', '5-12-13']].map(p => `<button class="btn xs" data-action="rt-preset" data-p='${p[0]}'>${p[1]}</button>`).join('')}</div><button class="btn primary mt-2" data-action="compute" style="width:100%">Solve</button></div><div class="panel span-2"><div class="graph-wrap"><canvas class="graph" id="rt-canvas" style="height:280px"></canvas></div><div id="uc-out" class="mt-2"></div></div></div>`;
        $('#uc-body', root).addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); this.compute(root); } });
        this.compute(root);
      } else {
        const t = UC.tri; const F = (id, l, v) => `<div class="field"><label>${l}</label><input class="input mono" id="${id}" value="${esc(v)}"></div>`;
        b.innerHTML = `<div class="grid cols-3"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('target')} Any triangle</div></div><p class="small muted mb-1">Side a is opposite angle A, and so on. Enter three values including at least one side (SSS, SAS, ASA, AAS or SSA).</p><div class="grid cols-2" style="gap:8px">${F('t-a', 'a', t.a)}${F('t-A', 'A (°)', t.A)}${F('t-b', 'b', t.b)}${F('t-B', 'B (°)', t.B)}${F('t-c', 'c', t.c)}${F('t-C', 'C (°)', t.C)}</div><div class="preset-row mt-2">${[['{"a":"8","b":"5","c":"","A":"","B":"","C":"60"}', 'SAS'], ['{"a":"7","b":"8","c":"9","A":"","B":"","C":""}', 'SSS'], ['{"a":"10","b":"","c":"","A":"40","B":"65","C":""}', 'AAS'], ['{"a":"7","b":"10","c":"","A":"40","B":"","C":""}', 'SSA (two triangles)']].map(p => `<button class="btn xs" data-action="tri-preset" data-p='${p[0]}'>${p[1]}</button>`).join('')}</div><button class="btn primary mt-2" data-action="compute" style="width:100%">Solve</button></div><div class="panel span-2" id="uc-out"></div></div>`;
        $('#uc-body', root).addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); this.compute(root); } });
        this.compute(root);
      }
    },
    drawCircle(root) {
      const c = $('#uc-canvas', root); if (!c) return; const { ctx, W, H } = fitCanvas(c);
      const col = { surface: cssVar('--surface'), grid: cssVar('--border'), axis: cssVar('--border-strong'), ink: cssVar('--muted'), circle: cssVar('--accent'), ray: cssVar('--gold'), sin: cssVar('--bad'), cos: cssVar('--good'), pt: cssVar('--ink'), ref: cssVar('--lab') };
      ctx.fillStyle = col.surface; ctx.fillRect(0, 0, W, H); const cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.38;
      ctx.strokeStyle = col.axis; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
      ctx.strokeStyle = col.circle; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = col.ink; ctx.font = '11px "IBM Plex Mono", monospace'; [[0, '0°'], [90, '90°'], [180, '180°'], [270, '270°']].forEach(([d, l]) => { ctx.fillText(l, cx + (r + 14) * Math.cos(rad(d)) - 10, cy - (r + 14) * Math.sin(rad(d)) + 4); });
      const th = rad(UC.deg); const px = cx + r * Math.cos(th), py = cy - r * Math.sin(th);
      ctx.strokeStyle = col.ray; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, 28, 0, -th, true); ctx.stroke();
      ctx.strokeStyle = col.ray; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
      ctx.strokeStyle = col.cos; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, cy); ctx.stroke();
      ctx.strokeStyle = col.sin; ctx.beginPath(); ctx.moveTo(px, cy); ctx.lineTo(px, py); ctx.stroke();
      const ref = UC.deg <= 90 ? UC.deg : UC.deg <= 180 ? 180 - UC.deg : UC.deg <= 270 ? UC.deg - 180 : 360 - UC.deg;
      if (UC.deg % 90 !== 0) { ctx.strokeStyle = col.ref; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); const start = UC.deg <= 90 ? 0 : UC.deg <= 180 ? Math.PI : UC.deg <= 270 ? Math.PI : 2 * Math.PI; ctx.arc(cx, cy, 44, -start, -th, UC.deg <= 90 || (UC.deg > 180 && UC.deg <= 270)); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = col.pt; ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col.ink; ctx.font = '12px "IBM Plex Mono", monospace'; ctx.fillText(`(${s3(Math.cos(th))}, ${s3(Math.sin(th))})`, px + (Math.cos(th) >= 0 ? 10 : -120), py + (Math.sin(th) >= 0 ? -10 : 18));
      ctx.fillStyle = col.cos; ctx.fillText('cos θ', (cx + px) / 2 - 16, cy + (Math.sin(th) >= 0 ? 16 : -6)); ctx.fillStyle = col.sin; ctx.fillText('sin θ', px + (Math.cos(th) >= 0 ? 6 : -44), (cy + py) / 2 + 4);
      const q = UC.deg < 90 ? 'I' : UC.deg < 180 ? 'II' : UC.deg < 270 ? 'III' : 'IV'; const ex = exactTrig(UC.deg);
      const rd = $('#uc-read', root); if (rd) rd.innerHTML = `<span class="k">θ</span><span class="v">${UC.deg}° = ${s3(th)} rad = ${(() => { const g = (a, b) => b ? g(b, a % b) : a; const gg = g(UC.deg, 180); return UC.deg === 0 ? '0' : `${UC.deg / gg === 1 ? '' : UC.deg / gg}π/${180 / gg}`.replace('/1', ''); })()}</span><span class="k">Quadrant</span><span class="v">${UC.deg % 90 === 0 ? 'axis' : q}</span><span class="k">Reference angle</span><span class="v">${ref}°</span><span class="k">sin θ</span><span class="v">${s3(Math.sin(th))}</span><span class="k">cos θ</span><span class="v">${s3(Math.cos(th))}</span><span class="k">tan θ</span><span class="v">${Math.abs(Math.cos(th)) < 1e-9 ? 'undefined' : s3(Math.tan(th))}</span>`;
      const exEl = $('#uc-exact', root); if (exEl) { exEl.innerHTML = ex ? `Exact values: $\\sin\\theta = ${ex[0]},\\ \\cos\\theta = ${ex[1]},\\ \\tan\\theta = ${ex[2]}$. ${UC.deg % 90 ? `Quadrant ${q}: ${q === 'I' ? 'everything positive' : q === 'II' ? 'sine positive, cosine and tangent negative' : q === 'III' ? 'tangent positive, sine and cosine negative' : 'cosine positive, sine and tangent negative'}.` : ''}` : `Not a special angle: no exact radical form. The point on the unit circle is (cos θ, sin θ) and tan θ = sin θ / cos θ.`; typeset(exEl); }
    },
    compute(root) {
      const out = $('#uc-out', root); const val = id => { const el = $('#' + id, root); const s = el ? el.value.trim() : ''; return s === '' ? null : parseNumber(s); };
      try {
        if (UC.tab === 'right') {
          UC.rt = { opp: $('#rt-opp', root).value, adj: $('#rt-adj', root).value, hyp: $('#rt-hyp', root).value, ang: $('#rt-ang', root).value };
          let o = val('rt-opp'), a = val('rt-adj'), h = val('rt-hyp'), t = val('rt-ang'); const given = [o, a, h, t].filter(v => v !== null && !isNaN(v)).length; if (given < 2) throw new Error('Enter two values.'); if (o === null && a === null && h === null) throw new Error('Enter at least one side.');
          const steps = [];
          if (t !== null) { const T = rad(t); if (t <= 0 || t >= 90) throw new Error('θ must be between 0 and 90.'); if (h !== null) { o = h * Math.sin(T); a = h * Math.cos(T); steps.push(`opp = hyp·sin θ = ${s3(o)}`, `adj = hyp·cos θ = ${s3(a)}`); } else if (o !== null) { h = o / Math.sin(T); a = o / Math.tan(T); steps.push(`hyp = opp / sin θ = ${s3(h)}`, `adj = opp / tan θ = ${s3(a)}`); } else { h = a / Math.cos(T); o = a * Math.tan(T); steps.push(`hyp = adj / cos θ = ${s3(h)}`, `opp = adj·tan θ = ${s3(o)}`); } }
          else { if (o !== null && a !== null) { h = Math.hypot(o, a); t = deg(Math.atan2(o, a)); steps.push(`hyp = √(opp² + adj²) = ${s3(h)}`, `θ = tan⁻¹(opp/adj) = ${s3(t)}°`); } else if (o !== null && h !== null) { if (o >= h) throw new Error('The hypotenuse must be the longest side.'); a = Math.sqrt(h * h - o * o); t = deg(Math.asin(o / h)); steps.push(`adj = √(hyp² − opp²) = ${s3(a)}`, `θ = sin⁻¹(opp/hyp) = ${s3(t)}°`); } else { if (a >= h) throw new Error('The hypotenuse must be the longest side.'); o = Math.sqrt(h * h - a * a); t = deg(Math.acos(a / h)); steps.push(`opp = √(hyp² − adj²) = ${s3(o)}`, `θ = cos⁻¹(adj/hyp) = ${s3(t)}°`); } }
          out.innerHTML = `<div class="grid cols-4" style="gap:10px">${[['opp', o], ['adj', a], ['hyp', h], ['θ', t, '°'], ['other angle', 90 - t, '°']].map(([l, v, u]) => `<div class="stat"><div class="stat-num" style="font-size:20px">${s3(v)}${u || ''}</div><div class="stat-label">${l}</div></div>`).join('')}</div><div class="callout mt-2">${steps.map(s => `<div class="mono small">${esc(s)}</div>`).join('')}<div class="small mt-1">Check: ${s3(o)}² + ${s3(a)}² = ${s3(o * o + a * a)} ≈ ${s3(h)}² = ${s3(h * h)} ✓</div></div>`;
          this.drawRight(root, o, a, h, t);
        } else {
          UC.tri = { a: $('#t-a', root).value, b: $('#t-b', root).value, c: $('#t-c', root).value, A: $('#t-A', root).value, B: $('#t-B', root).value, C: $('#t-C', root).value };
          const sols = this.solveTriangle({ a: val('t-a'), b: val('t-b'), c: val('t-c'), A: val('t-A'), B: val('t-B'), C: val('t-C') });
          out.innerHTML = sols.map((S, i) => `<div class="${i ? 'mt-3' : ''}"><div class="eyebrow mb-1">${sols.length > 1 ? `Triangle ${i + 1} of ${sols.length} (ambiguous case)` : `Solution (${S.method})`}</div><div class="table-wrap"><table class="table compact"><thead><tr><th></th><th class="num">a</th><th class="num">b</th><th class="num">c</th><th class="num">A</th><th class="num">B</th><th class="num">C</th></tr></thead><tbody><tr><td>value</td><td class="num">${s3(S.a)}</td><td class="num">${s3(S.b)}</td><td class="num">${s3(S.c)}</td><td class="num">${s3(S.A)}°</td><td class="num">${s3(S.B)}°</td><td class="num">${s3(S.C)}°</td></tr></tbody></table></div><div class="callout mt-2">${S.steps.map(s => `<div class="small">${s}</div>`).join('')}<div class="small mt-1">Area = ½·a·b·sin C = ${s3(0.5 * S.a * S.b * Math.sin(rad(S.C)))}</div></div></div>`).join('');
          typeset(out);
        }
      } catch (e) { out.innerHTML = `<div class="callout warn">${esc(e.message)}</div>`; }
    },
    solveTriangle(T) {
      const has = k => T[k] !== null && !isNaN(T[k]); const sides = ['a', 'b', 'c'].filter(has), angs = ['A', 'B', 'C'].filter(has);
      if (sides.length + angs.length < 3) throw new Error('Enter three values.'); if (!sides.length) throw new Error('At least one side is needed (angles alone fix only the shape).');
      if (angs.some(k => T[k] <= 0 || T[k] >= 180)) throw new Error('Angles must be between 0° and 180°.'); if (angs.length === 2 && T[angs[0]] + T[angs[1]] >= 180) throw new Error('Two angles must add to less than 180°.');
      const fin = (S, method, steps) => { S.method = method; S.steps = steps; return S; };
      if (sides.length === 3) { const { a, b, c } = T; if (a + b <= c || a + c <= b || b + c <= a) throw new Error('These sides violate the triangle inequality.'); const C = deg(Math.acos((a * a + b * b - c * c) / (2 * a * b))), A = deg(Math.acos((b * b + c * c - a * a) / (2 * b * c))); return [fin({ a, b, c, A, B: 180 - A - C, C }, 'SSS, Law of Cosines', [`cos C = (a² + b² − c²)/(2ab) = ${s3((a * a + b * b - c * c) / (2 * a * b))} ⇒ C = ${s3(C)}°`, `cos A = (b² + c² − a²)/(2bc) ⇒ A = ${s3(A)}°`, `B = 180° − A − C = ${s3(180 - A - C)}°`])]; }
      if (sides.length === 2 && angs.length === 1) {
        const ang = angs[0]; const opp = ang.toLowerCase();
        if (!has(opp)) { // SAS: angle included between the two known sides
          const [s1, s2] = sides; const third = opp; const c2 = T[s1] ** 2 + T[s2] ** 2 - 2 * T[s1] * T[s2] * Math.cos(rad(T[ang])); const cc = Math.sqrt(c2); const S = { ...T }; S[third] = cc; const other1 = s1.toUpperCase(); const sinO = T[s1] * Math.sin(rad(T[ang])) / cc; S[other1] = deg(Math.asin(Math.min(1, sinO))); if (T[s1] > cc && T[s1] * T[s1] > T[s2] * T[s2] + c2) S[other1] = 180 - S[other1]; const other2 = s2.toUpperCase(); S[other2] = 180 - T[ang] - S[other1]; return [fin(S, 'SAS, Law of Cosines then Law of Sines', [`${third}² = ${s1}² + ${s2}² − 2·${s1}·${s2}·cos ${ang} = ${s3(c2)} ⇒ ${third} = ${s3(cc)}`, `sin ${other1} = ${s1}·sin ${ang} / ${third} ⇒ ${other1} = ${s3(S[other1])}°`, `${other2} = 180° − ${ang} − ${other1} = ${s3(S[other2])}°`])]; }
        // SSA: angle opposite one known side
        const known = opp, other = sides.find(s => s !== known); const otherAng = other.toUpperCase(); const sinO = T[other] * Math.sin(rad(T[ang])) / T[known];
        if (sinO > 1 + 1e-9) throw new Error(`No triangle: ${other}·sin ${ang} / ${known} = ${s3(sinO)} > 1.`);
        const O1 = deg(Math.asin(Math.min(1, sinO))); const cands = [O1]; if (Math.abs(sinO - 1) > 1e-9 && 180 - O1 + T[ang] < 180) cands.push(180 - O1);
        const third = ['a', 'b', 'c'].find(s => s !== known && s !== other); const thirdAng = third.toUpperCase();
        return cands.map((O, i) => { const S = { ...T }; S[otherAng] = O; S[thirdAng] = 180 - T[ang] - O; S[third] = T[known] * Math.sin(rad(S[thirdAng])) / Math.sin(rad(T[ang])); return fin(S, 'SSA, Law of Sines', [`sin ${otherAng} = ${other}·sin ${ang} / ${known} = ${s3(sinO)} ⇒ ${otherAng} = ${s3(O)}°${i ? ' (the supplement of the first solution)' : cands.length > 1 ? ' (or its supplement: see Triangle 2)' : ''}`, `${thirdAng} = 180° − ${ang} − ${otherAng} = ${s3(S[thirdAng])}°`, `${third} = ${known}·sin ${thirdAng} / sin ${ang} = ${s3(S[third])}`]); });
      }
      // two angles and one side (AAS / ASA)
      const S = { ...T }; const missingAng = ['A', 'B', 'C'].find(k => !has(k)); S[missingAng] = 180 - T[angs[0]] - T[angs[1]]; const side = sides[0]; const ratio = T[side] / Math.sin(rad(S[side.toUpperCase()])); ['a', 'b', 'c'].forEach(s => { if (s !== side) S[s] = ratio * Math.sin(rad(S[s.toUpperCase()])); });
      return [fin(S, 'AAS/ASA, Law of Sines', [`${missingAng} = 180° − ${angs[0]} − ${angs[1]} = ${s3(S[missingAng])}°`, `${side}/sin ${side.toUpperCase()} = ${s3(ratio)}`, ...['a', 'b', 'c'].filter(s => s !== side).map(s => `${s} = ${s3(ratio)}·sin ${s.toUpperCase()} = ${s3(S[s])}`)])];
    },
    drawRight(root, o, a, h, t) {
      const c = $('#rt-canvas', root); if (!c) return; const { ctx, W, H } = fitCanvas(c); const col = { surface: cssVar('--surface'), line: cssVar('--accent'), fill: cssVar('--accent-soft'), ink: cssVar('--ink'), muted: cssVar('--muted') };
      ctx.fillStyle = col.surface; ctx.fillRect(0, 0, W, H); const scale = Math.min((W - 120) / a, (H - 80) / o); const x0 = 60, y0 = H - 40; const x1 = x0 + a * scale, y1 = y0 - o * scale;
      ctx.fillStyle = col.fill; ctx.strokeStyle = col.line; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = col.muted; ctx.lineWidth = 1; ctx.strokeRect(x1 - 14, y0 - 14, 14, 14);
      ctx.fillStyle = col.ink; ctx.font = '13px "Helvetica Neue", "TeX Gyre Heros", Helvetica, Arial, sans-serif'; ctx.fillText(`adj = ${s3(a)}`, (x0 + x1) / 2 - 30, y0 + 20); ctx.fillText(`opp = ${s3(o)}`, x1 + 8, (y0 + y1) / 2 + 4); ctx.fillText(`hyp = ${s3(h)}`, (x0 + x1) / 2 - 60, (y0 + y1) / 2 - 10); ctx.fillText(`θ = ${s3(t)}°`, x0 + 26, y0 - 8);
    }
  };
})(window);
