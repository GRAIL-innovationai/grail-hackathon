/* ============================================================
   Mathub — Calculus I tools: grapher and labs
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App;
  const { $, $$, esc, icon, bind, toast, typeset, compileExpr, d1, d2, parseNumber, fmtNum, cssVar, fitCanvas, niceStep, pageHead } = App;
  const L = App.link;
  /* ======================================================
     VIEW: Grapher
     ====================================================== */
  const PRESETS = [
    ['x^2 - 4x + 3', 'Parabola'], ['x^3 - 3x', 'Cubic'], ['sin(x)', 'sin x'], ['cos(x)', 'cos x'], ['e^x - 2', 'eˣ − 2'], ['ln(x)', 'ln x'], ['1/(x+1)', '1/(x+1)'],
    ['11 - 5x - 3x^2', 'Exam 1 #15a'], ['sqrt(2x-1)', 'Exam 1 #15b: √(2x−1)'], ['9/(2-x)', 'Exam 1 #15c: 9/(2−x)'], ['5 + sqrt(x)', 'Exam 1 #5: 5+√x'], ['|2x-1|', 'Exam 1 #6: |2t−1|'], ['(x^2-4x-5)/(x-5)', 'Exam 1 #11 (hole at 5)'],
    ['sin(x)/x', 'sin x / x'], ['x e^(-x)', 'x·e⁻ˣ'], ['x^4 - 2x^2', 'x⁴ − 2x²'], ['arctan(x)', 'arctan x']
  ];
  const G = { expr: 'x^2 - 4x + 3', f: null, err: '', a: 1, b: 2.5, tangent: true, secant: false, d1: false, d2: false, view: { xmin: -6, xmax: 6, ymin: -5, ymax: 5 }, hover: null };
  try { G.f = compileExpr(G.expr); } catch {}
  App.views.grapher = {
    title: 'Grapher',
    render(root) {
      root.innerHTML = pageHead('Grapher', 'Type any function. Drag to pan, scroll to zoom, click the graph to move the point a. The tangent line is the derivative made visible; the secant line is the average rate of change.') + `
        <div class="graph-layout">
          <div class="graph-wrap"><canvas class="graph" id="gcanvas"></canvas><div class="graph-legend" id="glegend"></div></div>
          <div class="stack">
            <div class="panel">
              <div class="field"><label>f(x) =</label><input class="input mono" id="g-expr" value="${esc(G.expr)}" spellcheck="false" autocomplete="off"><span class="help" id="g-err" style="color:var(--bad)">${esc(G.err)}</span><span class="help">Use ^ for powers, sqrt, abs or |…|, sin, cos, tan, e^x, ln, log, pi.</span></div>
              <div class="field mt-1"><label>Presets</label><select class="select" id="g-preset"><option value="">Choose…</option>${PRESETS.map(p => `<option value="${esc(p[0])}">${esc(p[1])}</option>`).join('')}</select></div>
              <div class="divider"></div>
              <div class="field"><label>Point a</label><div class="slider-row"><input type="range" id="g-a" min="${G.view.xmin}" max="${G.view.xmax}" step="0.05" value="${G.a}"><input class="input mono" id="g-a-num" type="number" step="0.1" value="${G.a}"></div></div>
              <div class="field mt-1"><label>Second point b (secant)</label><div class="slider-row"><input type="range" id="g-b" min="${G.view.xmin}" max="${G.view.xmax}" step="0.05" value="${G.b}"><input class="input mono" id="g-b-num" type="number" step="0.1" value="${G.b}"></div></div>
              <div class="chips mt-2">
                <label class="chip toggle${G.tangent ? ' on' : ''}"><input type="checkbox" id="g-tan" ${G.tangent ? 'checked' : ''} hidden>Tangent at a</label>
                <label class="chip toggle${G.secant ? ' on' : ''}"><input type="checkbox" id="g-sec" ${G.secant ? 'checked' : ''} hidden>Secant a→b</label>
                <label class="chip toggle${G.d1 ? ' on' : ''}"><input type="checkbox" id="g-d1" ${G.d1 ? 'checked' : ''} hidden>Show f′</label>
                <label class="chip toggle${G.d2 ? ' on' : ''}"><input type="checkbox" id="g-d2" ${G.d2 ? 'checked' : ''} hidden>Show f″</label>
              </div>
              <div class="row mt-2"><button class="btn sm" data-action="zin">${icon('zoomin', 13)}</button><button class="btn sm" data-action="zout">${icon('zoomout', 13)}</button><button class="btn sm" data-action="reset">${icon('rotate', 13)} Reset view</button></div>
            </div>
            <div class="panel"><div class="eyebrow mb-1">At x = a</div><div class="readout" id="g-read"></div><div class="divider"></div><div id="g-words" class="small"></div></div>
          </div>
        </div>`;
      const canvas = $('#gcanvas', root);
      const syncChip = id => { const inp = $('#' + id, root); inp.closest('.chip').classList.toggle('on', inp.checked); };
      const readInputs = () => { G.tangent = $('#g-tan', root).checked; G.secant = $('#g-sec', root).checked; G.d1 = $('#g-d1', root).checked; G.d2 = $('#g-d2', root).checked; ['g-tan', 'g-sec', 'g-d1', 'g-d2'].forEach(syncChip); this.draw(root); };
      ['g-tan', 'g-sec', 'g-d1', 'g-d2'].forEach(id => $('#' + id, root).addEventListener('change', readInputs));
      const setExpr = v => { G.expr = v; try { G.f = compileExpr(v); G.err = ''; } catch (e) { G.err = e.message; } $('#g-err', root).textContent = G.err; $('#g-expr', root).classList.toggle('invalid', !!G.err); this.draw(root); };
      $('#g-expr', root).addEventListener('input', e => setExpr(e.target.value));
      $('#g-preset', root).addEventListener('change', e => { if (e.target.value) { $('#g-expr', root).value = e.target.value; setExpr(e.target.value); } });
      const setA = v => { G.a = +v; $('#g-a', root).value = G.a; $('#g-a-num', root).value = Math.round(G.a * 100) / 100; this.draw(root); };
      const setB = v => { G.b = +v; $('#g-b', root).value = G.b; $('#g-b-num', root).value = Math.round(G.b * 100) / 100; this.draw(root); };
      $('#g-a', root).addEventListener('input', e => setA(e.target.value)); $('#g-a-num', root).addEventListener('change', e => setA(e.target.value));
      $('#g-b', root).addEventListener('input', e => setB(e.target.value)); $('#g-b-num', root).addEventListener('change', e => setB(e.target.value));
      bind(root, { zin: () => this.zoom(root, 0.8), zout: () => this.zoom(root, 1.25), reset: () => { G.view = { xmin: -6, xmax: 6, ymin: -5, ymax: 5 }; this.syncSliders(root); this.draw(root); } });
      // pointer interactions
      let down = null, dragged = false;
      const toWorld = (px, py) => { const r = canvas.getBoundingClientRect(); const v = G.view; return { x: v.xmin + (px - r.left) / r.width * (v.xmax - v.xmin), y: v.ymax - (py - r.top) / r.height * (v.ymax - v.ymin) }; };
      canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, view: { ...G.view } }; dragged = false; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointermove', e => {
        if (down) {
          const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true;
          if (dragged) { const r = canvas.getBoundingClientRect(); const v = down.view; const sx = (v.xmax - v.xmin) / r.width, sy = (v.ymax - v.ymin) / r.height; G.view = { xmin: v.xmin - dx * sx, xmax: v.xmax - dx * sx, ymin: v.ymin + dy * sy, ymax: v.ymax + dy * sy }; this.syncSliders(root); }
        }
        G.hover = toWorld(e.clientX, e.clientY); this.draw(root);
      });
      canvas.addEventListener('pointerup', e => { if (down && !dragged) { const w = toWorld(e.clientX, e.clientY); setA(Math.round(w.x * 20) / 20); } down = null; });
      canvas.addEventListener('pointerleave', () => { G.hover = null; down = null; this.draw(root); });
      canvas.addEventListener('wheel', e => { e.preventDefault(); const w = toWorld(e.clientX, e.clientY); const k = e.deltaY > 0 ? 1.15 : 0.87; const v = G.view; G.view = { xmin: w.x - (w.x - v.xmin) * k, xmax: w.x + (v.xmax - w.x) * k, ymin: w.y - (w.y - v.ymin) * k, ymax: w.y + (v.ymax - w.y) * k }; this.syncSliders(root); this.draw(root); }, { passive: false });
      canvas.addEventListener('dblclick', () => { G.view = { xmin: -6, xmax: 6, ymin: -5, ymax: 5 }; this.syncSliders(root); this.draw(root); });
      this.resize = () => this.draw(root); window.addEventListener('resize', this.resize);
      this.draw(root);
    },
    unmount() { window.removeEventListener('resize', this.resize); },
    syncSliders(root) { ['g-a', 'g-b'].forEach(id => { const s = $('#' + id, root); s.min = G.view.xmin; s.max = G.view.xmax; }); },
    zoom(root, k) { const v = G.view; const cx = (v.xmin + v.xmax) / 2, cy = (v.ymin + v.ymax) / 2; G.view = { xmin: cx - (cx - v.xmin) * k, xmax: cx + (v.xmax - cx) * k, ymin: cy - (cy - v.ymin) * k, ymax: cy + (v.ymax - cy) * k }; this.syncSliders(root); this.draw(root); },
    draw(root) {
      const canvas = $('#gcanvas', root); if (!canvas) return;
      const { ctx, W, H } = fitCanvas(canvas); const v = G.view;
      const sx = W / (v.xmax - v.xmin), sy = H / (v.ymax - v.ymin);
      const X = x => (x - v.xmin) * sx, Y = y => (v.ymax - y) * sy;
      const col = { surface: cssVar('--surface'), grid: cssVar('--border'), axis: cssVar('--border-strong'), ink: cssVar('--muted'), f: cssVar('--accent'), tan: cssVar('--gold'), sec: cssVar('--bad'), d1: cssVar('--good'), d2: cssVar('--lab'), point: cssVar('--ink') };
      ctx.fillStyle = col.surface; ctx.fillRect(0, 0, W, H);
      // grid
      const stepX = niceStep(v.xmax - v.xmin), stepY = niceStep(v.ymax - v.ymin);
      ctx.lineWidth = 1; ctx.strokeStyle = col.grid; ctx.font = '11px "IBM Plex Mono", monospace'; ctx.fillStyle = col.ink;
      for (let x = Math.ceil(v.xmin / stepX) * stepX; x <= v.xmax; x += stepX) { ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), H); ctx.stroke(); if (Math.abs(x) > 1e-9) ctx.fillText(fmtNum(x, 3), X(x) + 3, Math.min(H - 4, Math.max(12, Y(0) + 13))); }
      for (let y = Math.ceil(v.ymin / stepY) * stepY; y <= v.ymax; y += stepY) { ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(W, Y(y)); ctx.stroke(); if (Math.abs(y) > 1e-9) ctx.fillText(fmtNum(y, 3), Math.min(W - 30, Math.max(3, X(0) + 4)), Y(y) - 3); }
      ctx.strokeStyle = col.axis; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.moveTo(X(0), 0); ctx.lineTo(X(0), H); ctx.stroke();
      const f = G.f; if (!f) return;
      const plot = (fn, color, width, dash) => {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.beginPath(); let pen = false; let prevY = null;
        for (let px = 0; px <= W; px += 1) { const x = v.xmin + px / sx; const y = fn(x); const ok = isFinite(y) && Math.abs(y) < 1e6; if (!ok) { pen = false; prevY = null; continue; } const py = Y(y); const jump = prevY !== null && Math.abs(py - prevY) > H * 2; if (!pen || jump) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py); prevY = py; }
        ctx.stroke(); ctx.setLineDash([]);
      };
      if (G.d2) plot(x => d2(f, x), col.d2, 1.5, [4, 4]);
      if (G.d1) plot(x => d1(f, x), col.d1, 1.8, [6, 4]);
      plot(f, col.f, 2.6);
      const a = G.a, fa = f(a), fpa = d1(f, a), fppa = d2(f, a);
      if (G.tangent && isFinite(fa) && isFinite(fpa)) plot(x => fa + fpa * (x - a), col.tan, 2);
      const b = G.b, fb = f(b), m = (fb - fa) / (b - a);
      if (G.secant && isFinite(fa) && isFinite(fb) && b !== a) { plot(x => fa + m * (x - a), col.sec, 1.6, [8, 5]); ctx.fillStyle = col.sec; ctx.beginPath(); ctx.arc(X(b), Y(fb), 5, 0, Math.PI * 2); ctx.fill(); }
      if (isFinite(fa)) { ctx.fillStyle = col.point; ctx.beginPath(); ctx.arc(X(a), Y(fa), 5.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = col.surface; ctx.beginPath(); ctx.arc(X(a), Y(fa), 2.2, 0, Math.PI * 2); ctx.fill(); }
      if (G.hover) { const hx = G.hover.x, hy = f(hx); ctx.strokeStyle = col.axis; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(hx), 0); ctx.lineTo(X(hx), H); ctx.stroke(); ctx.setLineDash([]); if (isFinite(hy)) { ctx.fillStyle = col.f; ctx.beginPath(); ctx.arc(X(hx), Y(hy), 3.5, 0, Math.PI * 2); ctx.fill(); } const label = `x = ${fmtNum(hx, 2)}   f(x) = ${isFinite(hy) ? fmtNum(hy, 3) : 'undefined'}`; ctx.font = '12px "IBM Plex Mono", monospace'; const tw = ctx.measureText(label).width + 12; const lx = Math.min(W - tw - 6, X(hx) + 10), ly = 12; ctx.fillStyle = col.surface; ctx.globalAlpha = 0.92; ctx.fillRect(lx, H - 30, tw, 22); ctx.globalAlpha = 1; ctx.fillStyle = col.point; ctx.fillText(label, lx + 6, H - 15); }
      // legend + readouts
      const leg = $('#glegend', root); if (leg) leg.innerHTML = `<span><i style="background:${col.f}"></i>f</span>${G.tangent ? `<span><i style="background:${col.tan}"></i>tangent</span>` : ''}${G.secant ? `<span><i style="background:${col.sec}"></i>secant</span>` : ''}${G.d1 ? `<span><i style="background:${col.d1}"></i>f′</span>` : ''}${G.d2 ? `<span><i style="background:${col.d2}"></i>f″</span>` : ''}`;
      const read = $('#g-read', root);
      if (read) {
        const k = fa - fpa * a;
        read.innerHTML = `<span class="k">a</span><span class="v">${fmtNum(a, 3)}</span><span class="k">f(a)</span><span class="v">${fmtNum(fa)}</span><span class="k">f′(a)</span><span class="v">${fmtNum(fpa)}</span><span class="k">f″(a)</span><span class="v">${fmtNum(fppa)}</span><span class="k">tangent</span><span class="v">y = ${fmtNum(fpa, 3)}x ${k < 0 ? '−' : '+'} ${fmtNum(Math.abs(k), 3)}</span>${G.secant ? `<span class="k">AV[a,b]</span><span class="v">${fmtNum(m)}</span>` : ''}`;
        const words = $('#g-words', root);
        if (isFinite(fa) && isFinite(fpa) && isFinite(fppa)) {
          const inc = Math.abs(fpa) < 1e-6 ? 'has a horizontal tangent (f′ = 0)' : fpa > 0 ? 'is increasing (f′ > 0)' : 'is decreasing (f′ < 0)';
          const conc = Math.abs(fppa) < 1e-6 ? 'and f″ ≈ 0 (possible inflection point)' : fppa > 0 ? 'and concave up (f″ > 0)' : 'and concave down (f″ < 0)';
          words.innerHTML = `At <b>x = ${fmtNum(a, 2)}</b>, f ${inc} ${conc}. ${G.tangent ? `The tangent line is L(x) = ${fmtNum(fa, 3)} + ${fmtNum(fpa, 3)}(x − ${fmtNum(a, 2)})${fppa > 1e-6 ? '; it lies below the curve, so it underestimates f nearby.' : fppa < -1e-6 ? '; it lies above the curve, so it overestimates f nearby.' : '.'}` : ''}${G.secant && isFinite(m) ? ` The secant from a to b = ${fmtNum(b, 2)} has slope AV = ${fmtNum(m, 4)}, the average rate of change.` : ''}`;
        } else words.textContent = 'f is undefined at this a.';
      }
    }
  };

  /* ======================================================
     VIEW: Labs
     ====================================================== */
  const LAB = { tab: 'limit', limit: { f: '(x^2 - 4x - 5)/(x - 5)', a: '5' }, dq: { f: '11 - 5x - 3x^2', a: '2' }, riemann: { f: 'x^2', a: '0', b: '2', n: '4', method: 'left' }, data: { t: '1, 5, 9, 13, 17, 21, 25', f: '27, 26, 24, 21, 18, 16, 15' }, aroc: { f: '5 + sqrt(x)', a: '4', b: '25' } };
  App.views.labs = {
    title: 'Labs',
    render(root, param) {
      if (param && ['limit', 'dq', 'riemann', 'data', 'aroc'].includes(param)) LAB.tab = param;
      const tabs = [['limit', 'Limit table'], ['dq', 'Difference quotient'], ['riemann', 'Riemann sums'], ['data', 'Derivative from data'], ['aroc', 'Average rate of change']];
      root.innerHTML = pageHead('Labs', 'Numerical experiments that mirror the course labs. Type a function, press Compute, and read the pattern.') + `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab${LAB.tab === k ? ' active' : ''}" data-action="tab" data-t="${k}">${l}</button>`).join('')}</div><div id="lab-body"></div>`;
      bind(root, { tab: el => { LAB.tab = el.dataset.t; this.paint(root); }, compute: () => this.compute(root) });
      $('#lab-body', root).addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); this.compute(root); } });
      this.paint(root);
    },
    field: (id, label, val, help, mono = true) => `<div class="field"><label>${label}</label><input class="input${mono ? ' mono' : ''}" id="${id}" value="${esc(val)}" spellcheck="false" autocomplete="off">${help ? `<span class="help">${help}</span>` : ''}</div>`,
    paint(root) {
      const b = $('#lab-body', root); const F = this.field;
      if (LAB.tab === 'limit') b.innerHTML = `<div class="grid cols-3"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('flask')} Limit table</div></div>${F('l-f', 'f(x) =', LAB.limit.f, 'Try (sqrt(x+7)-3)/(x-2) at 2, or (x+4)/x at 0.')}<div class="mt-1"></div>${F('l-a', 'x → a, with a =', LAB.limit.a)}<button class="btn primary mt-2" data-action="compute" style="width:100%">Compute</button></div><div class="panel span-2" id="lab-out"><div class="empty">Results appear here.</div></div></div>`;
      else if (LAB.tab === 'dq') b.innerHTML = `<div class="grid cols-3"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('flask')} Difference quotient</div></div><p class="small muted mb-1">Watch $\\dfrac{f(a+h)-f(a)}{h}$ settle down as $h \\to 0$. That limit is $f'(a)$.</p>${F('d-f', 'f(x) =', LAB.dq.f)}<div class="mt-1"></div>${F('d-a', 'a =', LAB.dq.a)}<button class="btn primary mt-2" data-action="compute" style="width:100%">Compute</button></div><div class="panel span-2" id="lab-out"><div class="empty">Results appear here.</div></div></div>`;
      else if (LAB.tab === 'riemann') b.innerHTML = `<div class="grid cols-3"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('flask')} Riemann sums</div></div>${F('r-f', 'f(x) =', LAB.riemann.f)}<div class="grid cols-3 mt-1" style="gap:8px">${F('r-a', 'a', LAB.riemann.a)}${F('r-b', 'b', LAB.riemann.b)}${F('r-n', 'n', LAB.riemann.n)}</div><div class="field mt-1"><label>Draw</label><select class="select" id="r-m">${[['left', 'Left sum Lₙ'], ['right', 'Right sum Rₙ'], ['mid', 'Midpoint sum Mₙ'], ['trap', 'Trapezoids']].map(([k, l]) => `<option value="${k}"${LAB.riemann.method === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div><button class="btn primary mt-2" data-action="compute" style="width:100%">Compute</button></div><div class="panel span-2"><canvas class="riemann" id="rcanvas"></canvas><div id="lab-out" class="mt-2"><div class="empty">Results appear here.</div></div></div></div>`;
      else if (LAB.tab === 'data') b.innerHTML = `<div class="grid cols-3"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('flask')} Derivative from data</div></div><p class="small muted mb-1">Exactly the Exam 1 problem 17 setup: estimate $f'(t)$ from a table with forward, backward and central differences.</p>${F('t-t', 't values (comma separated)', LAB.data.t)}<div class="mt-1"></div>${F('t-f', 'f(t) values', LAB.data.f)}<button class="btn primary mt-2" data-action="compute" style="width:100%">Compute</button></div><div class="panel span-2" id="lab-out"><div class="empty">Results appear here.</div></div></div>`;
      else b.innerHTML = `<div class="grid cols-3"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('flask')} Average rate of change</div></div>${F('v-f', 'f(x) =', LAB.aroc.f)}<div class="grid cols-2 mt-1" style="gap:8px">${F('v-a', 'a', LAB.aroc.a)}${F('v-b', 'b', LAB.aroc.b)}</div><button class="btn primary mt-2" data-action="compute" style="width:100%">Compute</button></div><div class="panel span-2" id="lab-out"><div class="empty">Results appear here.</div></div></div>`;
      typeset(b); this.compute(root);
    },
    compute(root) {
      const out = $('#lab-out', root); const val = id => $('#' + id, root).value;
      const bad = msg => { out.innerHTML = `<div class="callout warn">${esc(msg)}</div>`; };
      try {
        if (LAB.tab === 'limit') {
          LAB.limit = { f: val('l-f'), a: val('l-a') }; const f = compileExpr(LAB.limit.f); const a = parseNumber(LAB.limit.a); if (isNaN(a)) throw new Error('a must be a number.');
          const hs = [0.1, 0.01, 0.001, 0.0001, 0.00001];
          const L = hs.map(h => ({ x: a - h, y: f(a - h) })), Rr = hs.map(h => ({ x: a + h, y: f(a + h) }));
          const fa = f(a); const lv = L[L.length - 1].y, rv = Rr[Rr.length - 1].y;
          const big = y => !isFinite(y) || Math.abs(y) > 1e5;
          let verdict;
          if (big(lv) || big(rv)) verdict = `<span class="chip bad">Unbounded</span> The outputs blow up near $x = ${fmtNum(a)}$: a vertical asymptote, so $\\lim_{x\\to ${fmtNum(a)}} f(x)$ does not exist (write $+\\infty$ or $-\\infty$ for each side).`;
          else if (Math.abs(lv - rv) < 1e-3 * Math.max(1, Math.abs(lv))) verdict = `<span class="chip good">Limit exists</span> Both sides approach $${fmtNum(lv, 4)}$, so $\\lim_{x\\to ${fmtNum(a)}} f(x) \\approx ${fmtNum(lv, 4)}$. ${isFinite(fa) ? (Math.abs(fa - lv) < 1e-6 ? `Since $f(${fmtNum(a)}) = ${fmtNum(fa)}$ matches, $f$ is continuous there.` : `Note $f(${fmtNum(a)}) = ${fmtNum(fa)}$ is different: a removable discontinuity.`) : `$f(${fmtNum(a)})$ is undefined (a hole), but the limit still exists.`}`;
          else verdict = `<span class="chip warn">Does not exist</span> Left-hand limit $\\approx ${fmtNum(lv, 4)}$, right-hand limit $\\approx ${fmtNum(rv, 4)}$. They differ, so the two-sided limit does not exist (a jump).`;
          out.innerHTML = `<div class="grid cols-2"><div><div class="eyebrow mb-1">From the left (x → a⁻)</div><div class="table-wrap"><table class="table compact"><thead><tr><th class="num">x</th><th class="num">f(x)</th></tr></thead><tbody>${L.map(r => `<tr><td class="num">${fmtNum(r.x, 6)}</td><td class="num">${fmtNum(r.y, 6)}</td></tr>`).join('')}</tbody></table></div></div><div><div class="eyebrow mb-1">From the right (x → a⁺)</div><div class="table-wrap"><table class="table compact"><thead><tr><th class="num">x</th><th class="num">f(x)</th></tr></thead><tbody>${Rr.map(r => `<tr><td class="num">${fmtNum(r.x, 6)}</td><td class="num">${fmtNum(r.y, 6)}</td></tr>`).join('')}</tbody></table></div></div></div><div class="callout mt-2">${verdict}</div>`;
        } else if (LAB.tab === 'dq') {
          LAB.dq = { f: val('d-f'), a: val('d-a') }; const f = compileExpr(LAB.dq.f); const a = parseNumber(LAB.dq.a); if (isNaN(a)) throw new Error('a must be a number.');
          const fa = f(a); if (!isFinite(fa)) throw new Error('f(a) is undefined; the derivative there does not exist.');
          const hs = [0.1, 0.01, 0.001, 0.0001, -0.0001, -0.001, -0.01, -0.1];
          const rows = hs.map(h => ({ h, fah: f(a + h), dq: (f(a + h) - fa) / h }));
          const est = d1(f, a);
          out.innerHTML = `<div class="table-wrap"><table class="table compact"><thead><tr><th class="num">h</th><th class="num">a + h</th><th class="num">f(a + h)</th><th class="num">[f(a+h) − f(a)] / h</th></tr></thead><tbody>${rows.map(r => `<tr${Math.abs(r.h) === 0.0001 ? ' class="hl"' : ''}><td class="num">${r.h > 0 ? '+' : ''}${r.h}</td><td class="num">${fmtNum(a + r.h, 5)}</td><td class="num">${fmtNum(r.fah, 6)}</td><td class="num"><b>${fmtNum(r.dq, 6)}</b></td></tr>`).join('')}</tbody></table></div><div class="callout mt-2">The difference quotients from both sides settle toward <b>$f'(${fmtNum(a)}) \\approx ${fmtNum(est, 5)}$</b>. Each row is the slope of a secant line through $(${fmtNum(a)}, ${fmtNum(fa, 4)})$ and a nearby point; the limit is the slope of the tangent line.</div>`;
        } else if (LAB.tab === 'riemann') {
          LAB.riemann = { f: val('r-f'), a: val('r-a'), b: val('r-b'), n: val('r-n'), method: $('#r-m', root).value };
          const f = compileExpr(LAB.riemann.f); const a = parseNumber(LAB.riemann.a), bb = parseNumber(LAB.riemann.b); const n = Math.max(1, Math.min(2000, Math.round(parseNumber(LAB.riemann.n))));
          if ([a, bb, n].some(isNaN) || bb <= a) throw new Error('Need numbers with a < b and n ≥ 1.');
          const dx = (bb - a) / n; let L = 0, Rr = 0, M = 0;
          for (let i = 0; i < n; i++) { L += f(a + i * dx) * dx; Rr += f(a + (i + 1) * dx) * dx; M += f(a + (i + 0.5) * dx) * dx; }
          const T = (L + Rr) / 2;
          let S = 0; const ns = 2000, hs = (bb - a) / ns; for (let i = 0; i <= ns; i++) { const w = i === 0 || i === ns ? 1 : i % 2 ? 4 : 2; S += w * f(a + i * hs); } S *= hs / 3;
          const chosen = { left: L, right: Rr, mid: M, trap: T }[LAB.riemann.method];
          out.innerHTML = `<div class="grid cols-4" style="gap:10px">${[['Left L' + n, L], ['Right R' + n, Rr], ['Midpoint M' + n, M], ['Trapezoid T' + n, T]].map(([k, v]) => `<div class="stat"><div class="stat-num" style="font-size:20px">${fmtNum(v, 5)}</div><div class="stat-label">${esc(k)}</div></div>`).join('')}</div><div class="callout mt-2">Reference value (Simpson, 2000 intervals): <b>${fmtNum(S, 6)}</b>. Δx = ${fmtNum(dx, 5)}. The drawn ${LAB.riemann.method} sum is off by ${fmtNum(Math.abs(chosen - S), 6)}. ${n < 50 ? 'Increase n and watch every sum converge to the same number: that is the definite integral.' : ''}</div>${n <= 12 ? `<div class="table-wrap mt-2"><table class="table compact"><thead><tr><th class="num">i</th><th class="num">xᵢ</th><th class="num">f(xᵢ)</th><th class="num">midpoint</th><th class="num">f(mid)</th></tr></thead><tbody>${Array.from({ length: n + 1 }, (_, i) => `<tr><td class="num">${i}</td><td class="num">${fmtNum(a + i * dx, 4)}</td><td class="num">${fmtNum(f(a + i * dx), 5)}</td><td class="num">${i < n ? fmtNum(a + (i + 0.5) * dx, 4) : ''}</td><td class="num">${i < n ? fmtNum(f(a + (i + 0.5) * dx), 5) : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
          this.drawRiemann(root, f, a, bb, n, LAB.riemann.method);
        } else if (LAB.tab === 'data') {
          LAB.data = { t: val('t-t'), f: val('t-f') };
          const ts = LAB.data.t.split(/[,\s]+/).filter(Boolean).map(Number), fs = LAB.data.f.split(/[,\s]+/).filter(Boolean).map(Number);
          if (ts.length < 2 || ts.length !== fs.length || ts.some(isNaN) || fs.some(isNaN)) throw new Error('Enter the same number of t and f values (at least two).');
          const rows = ts.map((t, i) => { const fwd = i < ts.length - 1 ? (fs[i + 1] - fs[i]) / (ts[i + 1] - t) : null; const bwd = i > 0 ? (fs[i] - fs[i - 1]) / (t - ts[i - 1]) : null; const ctr = i > 0 && i < ts.length - 1 ? (fs[i + 1] - fs[i - 1]) / (ts[i + 1] - ts[i - 1]) : null; return { t, f: fs[i], fwd, bwd, ctr }; });
          const cell = v => v === null ? '<span class="muted">—</span>' : fmtNum(v, 4);
          out.innerHTML = `<div class="table-wrap"><table class="table compact"><thead><tr><th class="num">t</th><th class="num">f(t)</th><th class="num">Forward</th><th class="num">Backward</th><th class="num">Central</th></tr></thead><tbody>${rows.map(r => `<tr><td class="num">${r.t}</td><td class="num">${r.f}</td><td class="num">${cell(r.fwd)}</td><td class="num">${cell(r.bwd)}</td><td class="num"><b>${cell(r.ctr)}</b></td></tr>`).join('')}</tbody></table></div><div class="callout mt-2">Forward: $\\frac{f(t_{i+1})-f(t_i)}{t_{i+1}-t_i}$. Backward: $\\frac{f(t_i)-f(t_{i-1})}{t_i-t_{i-1}}$. Central (usually best): $\\frac{f(t_{i+1})-f(t_{i-1})}{t_{i+1}-t_{i-1}}$. At the ends only one-sided estimates exist. Always attach units: (units of f) per (unit of t).</div>`;
        } else {
          LAB.aroc = { f: val('v-f'), a: val('v-a'), b: val('v-b') }; const f = compileExpr(LAB.aroc.f); const a = parseNumber(LAB.aroc.a), bb = parseNumber(LAB.aroc.b); if ([a, bb].some(isNaN) || a === bb) throw new Error('Need two different numbers a and b.');
          const fa = f(a), fb = f(bb), av = (fb - fa) / (bb - a);
          out.innerHTML = `<div class="grid cols-3" style="gap:10px"><div class="stat"><div class="stat-num" style="font-size:20px">${fmtNum(fa, 5)}</div><div class="stat-label">f(a) = f(${fmtNum(a)})</div></div><div class="stat"><div class="stat-num" style="font-size:20px">${fmtNum(fb, 5)}</div><div class="stat-label">f(b) = f(${fmtNum(bb)})</div></div><div class="stat"><div class="stat-num" style="font-size:20px">${fmtNum(av, 5)}</div><div class="stat-label">AV[${fmtNum(a)}, ${fmtNum(bb)}]</div></div></div><div class="callout mt-2">$AV_{[${fmtNum(a)},${fmtNum(bb)}]} = \\dfrac{f(${fmtNum(bb)}) - f(${fmtNum(a)})}{${fmtNum(bb)} - ${fmtNum(a)}} = \\dfrac{${fmtNum(fb, 5)} - ${fmtNum(fa, 5)}}{${fmtNum(bb - a)}} = ${fmtNum(av, 5)}$. Secant line: $y = ${fmtNum(fa, 4)} + ${fmtNum(av, 4)}(x - ${fmtNum(a)})$. For comparison the instantaneous rates are $f'(${fmtNum(a)}) \\approx ${fmtNum(d1(f, a), 4)}$ and $f'(${fmtNum(bb)}) \\approx ${fmtNum(d1(f, bb), 4)}$. <a href="${L('grapher')}">See it in the grapher</a> with the secant toggle on.</div>`;
        }
        typeset(out);
      } catch (e) { bad(e.message); }
    },
    drawRiemann(root, f, a, b, n, method) {
      const c = $('#rcanvas', root); if (!c) return; const { ctx, W, H } = fitCanvas(c);
      const col = { surface: cssVar('--surface'), axis: cssVar('--border-strong'), f: cssVar('--accent'), fill: cssVar('--accent-soft'), edge: cssVar('--accent-line'), ink: cssVar('--muted') };
      const pad = (b - a) * 0.15; const xmin = a - pad, xmax = b + pad;
      let ymin = 0, ymax = 0; for (let i = 0; i <= 200; i++) { const y = f(xmin + (xmax - xmin) * i / 200); if (isFinite(y)) { ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); } }
      if (ymax === ymin) ymax = ymin + 1; const yp = (ymax - ymin) * 0.12; ymin -= yp; ymax += yp;
      const X = x => 40 + (x - xmin) / (xmax - xmin) * (W - 50), Y = y => 10 + (ymax - y) / (ymax - ymin) * (H - 30);
      ctx.fillStyle = col.surface; ctx.fillRect(0, 0, W, H);
      const dx = (b - a) / n;
      ctx.fillStyle = col.fill; ctx.strokeStyle = col.edge; ctx.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        const x0 = a + i * dx, x1 = x0 + dx;
        if (method === 'trap') { const y0 = f(x0), y1 = f(x1); ctx.beginPath(); ctx.moveTo(X(x0), Y(0)); ctx.lineTo(X(x0), Y(y0)); ctx.lineTo(X(x1), Y(y1)); ctx.lineTo(X(x1), Y(0)); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        else { const xs = method === 'left' ? x0 : method === 'right' ? x1 : (x0 + x1) / 2; const y = f(xs); if (!isFinite(y)) continue; const top = Y(y), base = Y(0); ctx.fillRect(X(x0), Math.min(top, base), X(x1) - X(x0), Math.abs(base - top)); ctx.strokeRect(X(x0), Math.min(top, base), X(x1) - X(x0), Math.abs(base - top)); }
      }
      ctx.strokeStyle = col.axis; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X(xmin), Y(0)); ctx.lineTo(X(xmax), Y(0)); ctx.stroke();
      ctx.strokeStyle = col.f; ctx.lineWidth = 2.4; ctx.beginPath(); let pen = false; for (let px = 40; px <= W - 10; px++) { const x = xmin + (px - 40) / (W - 50) * (xmax - xmin); const y = f(x); if (!isFinite(y)) { pen = false; continue; } if (!pen) { ctx.moveTo(px, Y(y)); pen = true; } else ctx.lineTo(px, Y(y)); } ctx.stroke();
      ctx.fillStyle = col.ink; ctx.font = '11px "IBM Plex Mono", monospace'; ctx.fillText(`a = ${fmtNum(a)}`, X(a) - 10, H - 4); ctx.fillText(`b = ${fmtNum(b)}`, X(b) - 10, H - 4); ctx.fillText(fmtNum(ymax - yp, 2), 4, 16); ctx.fillText('0', 28, Y(0) + 4);
    }
  };

})(window);
