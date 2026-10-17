/* ============================================================
   Mathub — Physics I interactive tools
   Views: motion (projectile simulator, motion graphs), solvers
   (kinematics, vectors, incline & friction, unit converter).
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App;
  const R = String.raw;
  const { $, $$, esc, icon, bind, toast, typeset, compileExpr, d1, d2, parseNumber, fmtNum, fitCanvas, cssVar, niceStep, pageHead } = App;
  const g0 = 9.8;
  const rad = d => d * Math.PI / 180;
  const deg = r => r * 180 / Math.PI;
  const s3 = x => isFinite(x) ? (Math.abs(x) < 1e-9 ? '0' : String(+x.toPrecision(4))) : '—';
  const field = (id, label, val, help, extra = '') => `<div class="field"><label>${label}</label><input class="input mono" id="${id}" value="${esc(val)}" spellcheck="false" autocomplete="off" ${extra}>${help ? `<span class="help">${help}</span>` : ''}</div>`;

  /* ======================================================
     VIEW: Projectile & motion
     ====================================================== */
  const PJ = { v0: 20, ang: 35, h: 0, g: 9.8, compare: false, t: 0, playing: false, raf: null, last: 0 };
  const MG = { expr: '3t^2 - 2t + 1', T: 5, hover: null };
  function projectileStats(v0, ang, h, g) {
    const vx = v0 * Math.cos(rad(ang)), vy = v0 * Math.sin(rad(ang));
    const T = (vy + Math.sqrt(vy * vy + 2 * g * h)) / g;
    const Rr = vx * T;
    const tTop = vy > 0 ? vy / g : 0;
    const H = vy > 0 ? h + vy * vy / (2 * g) : h;
    const vyEnd = vy - g * T;
    return { vx, vy, T, R: Rr, tTop, H, vEnd: Math.hypot(vx, vyEnd), angEnd: deg(Math.atan2(vyEnd, vx)), pos: t => ({ x: vx * t, y: h + vy * t - 0.5 * g * t * t, vx, vy: vy - g * t }) };
  }
  App.views.motion = {
    title: 'Projectile & motion',
    render(root, param) {
      const tab = param === 'graphs' ? 'graphs' : 'projectile';
      root.innerHTML = pageHead('Projectile & motion', 'Watch the two axes of projectile motion separate, or type a position function and read velocity and acceleration off its graphs.') +
        `<div class="tabs"><button class="tab${tab === 'projectile' ? ' active' : ''}" data-action="tab" data-t="projectile">Projectile simulator</button><button class="tab${tab === 'graphs' ? ' active' : ''}" data-action="tab" data-t="graphs">Motion graphs x(t) → v(t) → a(t)</button></div><div id="mo-body"></div>`;
      bind(root, { tab: el => App.go('motion', el.dataset.t), launch: () => this.launch(root), reset: () => { this.stop(); PJ.t = 0; this.drawProjectile(root); }, step: el => { this.stop(); const st = projectileStats(PJ.v0, PJ.ang, PJ.h, PJ.g); PJ.t = Math.max(0, Math.min(st.T, PJ.t + (+el.dataset.d))); this.drawProjectile(root); } });
      if (tab === 'projectile') this.paintProjectile(root); else this.paintGraphs(root);
    },
    unmount() { this.stop(); window.removeEventListener('resize', this.resize); },
    stop() { PJ.playing = false; if (PJ.raf) cancelAnimationFrame(PJ.raf); PJ.raf = null; },
    paintProjectile(root) {
      $('#mo-body', root).innerHTML = `<div class="graph-layout">
        <div class="stack"><div class="graph-wrap"><canvas class="graph" id="pj-canvas" style="height:420px"></canvas><div class="graph-legend" id="pj-legend"></div></div>
          <div class="panel"><div class="panel-h"><div class="panel-title">${icon('list')} Position and velocity every ${'⅛'} of the flight</div></div><div class="table-wrap" id="pj-table"></div></div></div>
        <div class="stack">
          <div class="panel">
            <div class="grid cols-2" style="gap:10px">${field('pj-v0', 'Launch speed v₀ (m/s)', PJ.v0, '', 'type="number" step="0.5" min="0")')}${field('pj-ang', 'Angle θ (° above horizontal)', PJ.ang, '', 'type="number" step="1" min="-89" max="90"')}${field('pj-h', 'Launch height (m)', PJ.h, '', 'type="number" step="0.5" min="0"')}${field('pj-g', 'g (m/s²)', PJ.g, 'Moon 1.62 · Mars 3.71', 'type="number" step="0.1" min="0.1"')}</div>
            <label class="chip toggle mt-2${PJ.compare ? ' on' : ''}" style="display:inline-flex;white-space:normal;line-height:1.3"><input type="checkbox" id="pj-cmp" ${PJ.compare ? 'checked' : ''} hidden>Compare with the complementary angle (90° − θ)</label>
            <div class="row mt-2"><button class="btn primary" data-action="launch">${icon('play', 14)} Launch</button><button class="btn" data-action="step" data-d="-0.1">−0.1 s</button><button class="btn" data-action="step" data-d="0.1">+0.1 s</button><button class="btn" data-action="reset">${icon('rotate', 14)} Reset</button></div>
          </div>
          <div class="panel"><div class="eyebrow mb-1">Flight summary</div><div class="readout" id="pj-read"></div><div class="divider"></div><div class="small" id="pj-words"></div></div>
        </div></div>`;
      const read = () => { PJ.v0 = Math.max(0, +$('#pj-v0', root).value || 0); PJ.ang = +$('#pj-ang', root).value || 0; PJ.h = Math.max(0, +$('#pj-h', root).value || 0); PJ.g = Math.max(0.1, +$('#pj-g', root).value || 9.8); PJ.compare = $('#pj-cmp', root).checked; $('#pj-cmp', root).closest('.chip').classList.toggle('on', PJ.compare); this.stop(); PJ.t = 0; this.drawProjectile(root); };
      ['pj-v0', 'pj-ang', 'pj-h', 'pj-g', 'pj-cmp'].forEach(id => $('#' + id, root).addEventListener(id === 'pj-cmp' ? 'change' : 'input', read));
      this.resize = () => this.drawProjectile(root); window.addEventListener('resize', this.resize);
      this.drawProjectile(root);
    },
    launch(root) {
      const st = projectileStats(PJ.v0, PJ.ang, PJ.h, PJ.g);
      if (PJ.t >= st.T) PJ.t = 0;
      PJ.playing = true; PJ.last = performance.now();
      const slow = st.T < 1.5 ? 0.4 : 1;
      const tick = now => { if (!PJ.playing) return; PJ.t += (now - PJ.last) / 1000 * slow; PJ.last = now; if (PJ.t >= st.T) { PJ.t = st.T; PJ.playing = false; } this.drawProjectile(root); if (PJ.playing) PJ.raf = requestAnimationFrame(tick); };
      PJ.raf = requestAnimationFrame(tick);
    },
    drawProjectile(root) {
      const c = $('#pj-canvas', root); if (!c) return;
      const { ctx, W, H } = fitCanvas(c);
      const col = { surface: cssVar('--surface'), grid: cssVar('--border'), axis: cssVar('--border-strong'), ink: cssVar('--muted'), path: cssVar('--accent'), alt: cssVar('--lab'), ball: cssVar('--ink'), vx: cssVar('--good'), vy: cssVar('--bad'), v: cssVar('--gold'), ground: cssVar('--surface-3') };
      const st = projectileStats(PJ.v0, PJ.ang, PJ.h, PJ.g);
      const st2 = PJ.compare ? projectileStats(PJ.v0, 90 - PJ.ang, PJ.h, PJ.g) : null;
      const xmax = Math.max(1, st.R, st2 ? st2.R : 0) * 1.08, ymax = Math.max(1, st.H, st2 ? st2.H : 0) * 1.25;
      const pad = { l: 46, r: 16, t: 16, b: 30 };
      const sx = (W - pad.l - pad.r) / xmax, sy = (H - pad.t - pad.b) / ymax; const s = Math.min(sx, sy);
      const X = x => pad.l + x * s, Y = y => H - pad.b - y * s;
      ctx.fillStyle = col.surface; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = col.ground; ctx.fillRect(0, Y(0), W, H - Y(0));
      const step = niceStep(Math.max(xmax, ymax) / 1.2);
      ctx.strokeStyle = col.grid; ctx.lineWidth = 1; ctx.font = '11px "IBM Plex Mono", monospace'; ctx.fillStyle = col.ink;
      for (let x = 0; x <= xmax + 1e-9; x += step) { ctx.beginPath(); ctx.moveTo(X(x), pad.t); ctx.lineTo(X(x), Y(0)); ctx.stroke(); ctx.fillText(fmtNum(x, 2), X(x) - 6, H - pad.b + 14); }
      for (let y = 0; y <= ymax + 1e-9; y += step) { ctx.beginPath(); ctx.moveTo(pad.l, Y(y)); ctx.lineTo(X(xmax), Y(y)); ctx.stroke(); ctx.fillText(fmtNum(y, 2), 4, Y(y) + 4); }
      ctx.strokeStyle = col.axis; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(W - pad.r, Y(0)); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, Y(0)); ctx.stroke();
      ctx.fillText('x (m)', W - pad.r - 34, Y(0) - 6); ctx.fillText('y (m)', pad.l + 6, pad.t + 10);
      const drawPath = (S, color, dash) => { ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.setLineDash(dash || []); ctx.beginPath(); for (let i = 0; i <= 200; i++) { const p = S.pos(S.T * i / 200); if (i === 0) ctx.moveTo(X(p.x), Y(p.y)); else ctx.lineTo(X(p.x), Y(p.y)); } ctx.stroke(); ctx.setLineDash([]); };
      if (st2) drawPath(st2, col.alt, [6, 5]);
      drawPath(st, col.path);
      // apex + landing markers
      const apex = st.pos(st.tTop); ctx.fillStyle = col.ink; ctx.beginPath(); ctx.arc(X(apex.x), Y(apex.y), 3, 0, Math.PI * 2); ctx.fill(); ctx.fillText(`H = ${fmtNum(st.H, 2)} m`, X(apex.x) + 6, Y(apex.y) - 6);
      ctx.fillText(`R = ${fmtNum(st.R, 2)} m`, Math.min(X(st.R) - 40, W - 90), Y(0) - 8);
      // ball and velocity arrows
      const p = st.pos(Math.min(PJ.t, st.T));
      const arrow = (x0, y0, dx, dy, color, label) => { const L = Math.hypot(dx, dy); if (L < 1e-6) return; const k = Math.min(70, L * 2.5) / L; const x1 = x0 + dx * k, y1 = y0 - dy * k; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); const a = Math.atan2(y1 - y0, x1 - x0); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 8 * Math.cos(a - 0.4), y1 - 8 * Math.sin(a - 0.4)); ctx.lineTo(x1 - 8 * Math.cos(a + 0.4), y1 - 8 * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill(); ctx.fillText(label, x1 + 4, y1 - 2); };
      arrow(X(p.x), Y(p.y), p.vx, 0, col.vx, 'vx'); arrow(X(p.x), Y(p.y), 0, p.vy, col.vy, 'vy'); arrow(X(p.x), Y(p.y), p.vx, p.vy, col.v, 'v');
      ctx.fillStyle = col.ball; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col.ink; ctx.fillText(`t = ${fmtNum(PJ.t, 2)} s`, W - pad.r - 80, pad.t + 12);
      const leg = $('#pj-legend', root); if (leg) leg.innerHTML = `<span><i style="background:${col.path}"></i>θ = ${PJ.ang}°</span>${st2 ? `<span><i style="background:${col.alt}"></i>θ = ${90 - PJ.ang}°</span>` : ''}<span><i style="background:${col.vx}"></i>vx</span><span><i style="background:${col.vy}"></i>vy</span><span><i style="background:${col.v}"></i>v</span>`;
      const read = $('#pj-read', root); if (read) {
        read.innerHTML = `<span class="k">v₀x, v₀y</span><span class="v">${s3(st.vx)}, ${s3(st.vy)} m/s</span><span class="k">Time of flight</span><span class="v">${s3(st.T)} s</span><span class="k">Range</span><span class="v">${s3(st.R)} m</span><span class="k">Max height</span><span class="v">${s3(st.H)} m at t = ${s3(st.tTop)} s</span><span class="k">Impact speed</span><span class="v">${s3(st.vEnd)} m/s</span><span class="k">Impact angle</span><span class="v">${s3(Math.abs(st.angEnd))}° below horizontal</span>${st2 ? `<span class="k">Range at ${90 - PJ.ang}°</span><span class="v">${s3(st2.R)} m</span>` : ''}`;
        $('#pj-words', root).innerHTML = `Horizontal: $x = ${s3(st.vx)}\\,t$ (no acceleration). Vertical: $y = ${PJ.h} + ${s3(st.vy)}\\,t - ${s3(PJ.g / 2)}\\,t^2$. ${PJ.h === 0 ? `On level ground the shortcuts give $T = 2v_0\\sin\\theta/g = ${s3(st.T)}$ s and $R = v_0^2\\sin2\\theta/g = ${s3(st.R)}$ m.` : 'With a raised launch point the level-ground range formula does not apply; the time comes from solving the vertical quadratic.'}${st2 ? ` Complementary angles share the same range on level ground${PJ.h > 0 ? ' (but not from a height, as the dashed path shows)' : ''}.` : ''}`;
        typeset($('#pj-words', root));
      }
      const tb = $('#pj-table', root); if (tb) { const rows = []; for (let i = 0; i <= 8; i++) { const t = st.T * i / 8; const q = st.pos(t); rows.push(`<tr><td class="num">${s3(t)}</td><td class="num">${s3(q.x)}</td><td class="num">${s3(q.y)}</td><td class="num">${s3(q.vx)}</td><td class="num">${s3(q.vy)}</td><td class="num">${s3(Math.hypot(q.vx, q.vy))}</td></tr>`); } tb.innerHTML = `<table class="table compact"><thead><tr><th class="num">t (s)</th><th class="num">x (m)</th><th class="num">y (m)</th><th class="num">vx (m/s)</th><th class="num">vy (m/s)</th><th class="num">speed</th></tr></thead><tbody>${rows.join('')}</tbody></table>`; }
    },
    paintGraphs(root) {
      $('#mo-body', root).innerHTML = `<div class="graph-layout">
        <div class="stack"><div class="graph-wrap"><canvas class="graph" id="mg-x" style="height:200px"></canvas></div><div class="graph-wrap"><canvas class="graph" id="mg-v" style="height:200px"></canvas></div><div class="graph-wrap"><canvas class="graph" id="mg-a" style="height:200px"></canvas></div></div>
        <div class="stack"><div class="panel">${field('mg-expr', 'x(t) =', MG.expr, 'Position in meters as a function of t in seconds. Try 5t, 20t - 4.9t^2, 3sin(2t), or 2t^3 - 9t^2.')}<div class="mt-1"></div>${field('mg-T', 'Show t from 0 to', MG.T, '', 'type="number" step="1" min="1"')}<div class="preset-row mt-2">${[['20t - 4.9t^2', 'Thrown up'], ['0.5*3*t^2', 'Constant a = 3'], ['4t', 'Constant velocity'], ['3sin(2t)', 'SHM'], ['t^3 - 6t^2 + 9t', 'Turns twice']].map(p => `<button class="btn xs" data-action="preset" data-e="${esc(p[0])}">${p[1]}</button>`).join('')}</div><span class="help" id="mg-err" style="color:var(--bad)"></span></div>
          <div class="panel"><div class="eyebrow mb-1">Hover the graphs</div><div class="readout" id="mg-read"><span class="k">t</span><span class="v">—</span></div><div class="divider"></div><div class="small" id="mg-words">Move the mouse over any graph. The same instant is marked on all three.</div></div></div></div>`;
      let f = null; const setExpr = v => { MG.expr = v; try { f = compileExpr(v); $('#mg-err', root).textContent = ''; } catch (e) { f = null; $('#mg-err', root).textContent = e.message; } draw(); };
      const cvs = ['mg-x', 'mg-v', 'mg-a'].map(id => $('#' + id, root));
      const draw = () => {
        const T = Math.max(1, +$('#mg-T', root).value || 5); MG.T = T;
        const fns = f ? [t => f(t), t => d1(f, t), t => d2(f, t)] : [null, null, null];
        const labels = ['x (m)', 'v (m/s)', 'a (m/s²)'];
        const colors = [cssVar('--accent'), cssVar('--good'), cssVar('--lab')];
        cvs.forEach((c, i) => {
          const { ctx, W, H } = fitCanvas(c); const col = { surface: cssVar('--surface'), grid: cssVar('--border'), axis: cssVar('--border-strong'), ink: cssVar('--muted') };
          ctx.fillStyle = col.surface; ctx.fillRect(0, 0, W, H);
          const fn = fns[i]; if (!fn) return;
          const N = 400; const ys = []; for (let k = 0; k <= N; k++) { const y = fn(T * k / N); ys.push(isFinite(y) ? y : NaN); }
          let ymin = Math.min(...ys.filter(v => !isNaN(v))), ymax = Math.max(...ys.filter(v => !isNaN(v))); if (!isFinite(ymin)) { ymin = -1; ymax = 1; } if (ymax - ymin < 1e-9) { ymin -= 1; ymax += 1; } const padY = (ymax - ymin) * 0.15; ymin -= padY; ymax += padY; if (ymin > 0) ymin = 0; if (ymax < 0) ymax = 0;
          const pl = 48, pr = 10, pt = 10, pb = 22; const X = t => pl + t / T * (W - pl - pr), Y = y => pt + (ymax - y) / (ymax - ymin) * (H - pt - pb);
          ctx.strokeStyle = col.grid; ctx.lineWidth = 1; ctx.font = '11px "IBM Plex Mono", monospace'; ctx.fillStyle = col.ink;
          const stY = niceStep(ymax - ymin); for (let y = Math.ceil(ymin / stY) * stY; y <= ymax; y += stY) { ctx.beginPath(); ctx.moveTo(pl, Y(y)); ctx.lineTo(W - pr, Y(y)); ctx.stroke(); ctx.fillText(fmtNum(y, 2), 4, Y(y) + 4); }
          const stT = niceStep(T); for (let t = 0; t <= T + 1e-9; t += stT) { ctx.beginPath(); ctx.moveTo(X(t), pt); ctx.lineTo(X(t), H - pb); ctx.stroke(); ctx.fillText(fmtNum(t, 2), X(t) - 6, H - 6); }
          ctx.strokeStyle = col.axis; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(pl, Y(0)); ctx.lineTo(W - pr, Y(0)); ctx.stroke();
          ctx.fillStyle = col.ink; ctx.font = '12px "Helvetica Neue", "TeX Gyre Heros", Helvetica, Arial, sans-serif'; ctx.fillText(labels[i], pl + 8, pt + 12);
          ctx.strokeStyle = colors[i]; ctx.lineWidth = 2.2; ctx.beginPath(); let pen = false; ys.forEach((y, k) => { if (isNaN(y)) { pen = false; return; } const px = X(T * k / N), py = Y(y); if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py); }); ctx.stroke();
          if (MG.hover !== null) { const t = MG.hover; const y = fn(t); ctx.strokeStyle = col.axis; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(t), pt); ctx.lineTo(X(t), H - pb); ctx.stroke(); ctx.setLineDash([]); if (isFinite(y)) { ctx.fillStyle = colors[i]; ctx.beginPath(); ctx.arc(X(t), Y(y), 4, 0, Math.PI * 2); ctx.fill(); } }
          c.__map = { X, T, pl, pr, W };
        });
        if (f && MG.hover !== null) {
          const t = MG.hover, x = f(t), v = d1(f, t), a = d2(f, t);
          $('#mg-read', root).innerHTML = `<span class="k">t</span><span class="v">${s3(t)} s</span><span class="k">x</span><span class="v">${s3(x)} m</span><span class="k">v = dx/dt</span><span class="v">${s3(v)} m/s</span><span class="k">a = dv/dt</span><span class="v">${s3(a)} m/s²</span>`;
          const dir = Math.abs(v) < 1e-6 ? 'momentarily at rest' : v > 0 ? 'moving in the +x direction' : 'moving in the −x direction';
          const sp = Math.abs(v) < 1e-6 || Math.abs(a) < 1e-6 ? '' : (v * a > 0 ? ' and speeding up (v and a have the same sign)' : ' and slowing down (v and a have opposite signs)');
          $('#mg-words', root).textContent = `At t = ${s3(t)} s the object is ${dir}${sp}. The slope of the x–t graph here is ${s3(v)}; the slope of the v–t graph is ${s3(a)}.`;
        }
      };
      cvs.forEach(c => { c.addEventListener('pointermove', e => { const m = c.__map; if (!m) return; const r = c.getBoundingClientRect(); const t = (e.clientX - r.left - m.pl) / (r.width - m.pl - m.pr) * m.T; MG.hover = Math.max(0, Math.min(m.T, t)); draw(); }); c.addEventListener('pointerleave', () => { MG.hover = null; draw(); }); });
      $('#mg-expr', root).addEventListener('input', e => setExpr(e.target.value));
      $('#mg-T', root).addEventListener('input', draw);
      bind(root, { tab: el => App.go('motion', el.dataset.t), preset: el => { $('#mg-expr', root).value = el.dataset.e; setExpr(el.dataset.e); } });
      this.resize = draw; window.addEventListener('resize', this.resize);
      setExpr(MG.expr);
    }
  };

  /* ======================================================
     VIEW: Solvers
     ====================================================== */
  const SV = { tab: 'kin', kin: { dx: '', v0: '0', v: '', a: '-9.8', t: '3' }, vec: [{ m: '5', a: '37' }, { m: '8', a: '270' }, { m: '', a: '' }], inc: { m: '5', th: '30', mus: '0.5', muk: '0.3', F: '0' }, unit: { cat: 'speed', val: '72', from: 'km/h', to: 'm/s' } };
  const UNITS = {
    length: { base: 'm', u: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.34, ft: 0.3048, in: 0.0254, yd: 0.9144, 'light-year': 9.461e15 } },
    speed: { base: 'm/s', u: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, 'ft/s': 0.3048, knot: 0.514444 } },
    acceleration: { base: 'm/s²', u: { 'm/s²': 1, 'g (9.8)': 9.8, 'ft/s²': 0.3048, 'km/h per s': 1 / 3.6 } },
    mass: { base: 'kg', u: { kg: 1, g: 0.001, mg: 1e-6, lb: 0.453592, oz: 0.0283495, 'metric ton': 1000 } },
    force: { base: 'N', u: { N: 1, kN: 1000, 'lbf': 4.44822, dyne: 1e-5, 'kgf': 9.80665 } },
    energy: { base: 'J', u: { J: 1, kJ: 1000, cal: 4.184, kcal: 4184, kWh: 3.6e6, eV: 1.602e-19, 'ft·lbf': 1.35582 } },
    power: { base: 'W', u: { W: 1, kW: 1000, hp: 745.7, 'ft·lbf/s': 1.35582 } },
    pressure: { base: 'Pa', u: { Pa: 1, kPa: 1000, atm: 101325, bar: 1e5, psi: 6894.76, mmHg: 133.322 } },
    angle: { base: 'rad', u: { rad: 1, deg: Math.PI / 180, rev: 2 * Math.PI } },
    'angular speed': { base: 'rad/s', u: { 'rad/s': 1, rpm: 2 * Math.PI / 60, 'deg/s': Math.PI / 180, 'rev/s': 2 * Math.PI } },
    time: { base: 's', u: { s: 1, ms: 0.001, min: 60, h: 3600, day: 86400, year: 3.156e7 } },
    area: { base: 'm²', u: { 'm²': 1, 'cm²': 1e-4, 'mm²': 1e-6, 'km²': 1e6, 'ft²': 0.092903, 'in²': 6.4516e-4 } },
    volume: { base: 'm³', u: { 'm³': 1, L: 1e-3, mL: 1e-6, 'cm³': 1e-6, gal: 3.78541e-3, 'ft³': 0.0283168 } },
    density: { base: 'kg/m³', u: { 'kg/m³': 1, 'g/cm³': 1000, 'g/mL': 1000, 'lb/ft³': 16.0185 } }
  };
  App.views.solvers = {
    title: 'Solvers',
    render(root, param) {
      if (param && ['kin', 'vec', 'inc', 'unit'].includes(param)) SV.tab = param;
      const tabs = [['kin', 'Kinematics'], ['vec', 'Vectors'], ['inc', 'Incline & friction'], ['unit', 'Unit converter']];
      root.innerHTML = pageHead('Solvers', 'Enter what you know, see what follows, and check which equation did the work. Use them to check problem sets, not to skip them.') + `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab${SV.tab === k ? ' active' : ''}" data-action="tab" data-t="${k}">${l}</button>`).join('')}</div><div id="sv-body"></div>`;
      bind(root, { tab: el => { SV.tab = el.dataset.t; this.paint(root); }, compute: () => this.compute(root), 'kin-preset': el => { const p = JSON.parse(el.dataset.p); SV.kin = p; this.paint(root); }, 'vec-preset': el => { SV.vec = JSON.parse(el.dataset.p); this.paint(root); }, swap: () => { const u = SV.unit; [u.from, u.to] = [u.to, u.from]; this.paint(root); } });
      $('#sv-body', root).addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); this.compute(root); } });
      this.paint(root);
    },
    paint(root) {
      const b = $('#sv-body', root);
      if (SV.tab === 'kin') {
        const k = SV.kin;
        b.innerHTML = `<div class="grid cols-3"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('flask')} Constant acceleration</div></div><p class="small muted mb-1">Fill in any <b>three</b> of the five quantities (leave the rest blank). Signs matter: choose a positive direction.</p>
          ${field('k-dx', 'Displacement Δx (m)', k.dx)}<div class="mt-1"></div>${field('k-v0', 'Initial velocity v₀ (m/s)', k.v0)}<div class="mt-1"></div>${field('k-v', 'Final velocity v (m/s)', k.v)}<div class="mt-1"></div>${field('k-a', 'Acceleration a (m/s²)', k.a)}<div class="mt-1"></div>${field('k-t', 'Time t (s)', k.t)}
          <div class="preset-row mt-2">${[['{"dx":"","v0":"0","v":"","a":"-9.8","t":"3"}', 'Dropped, 3 s'], ['{"dx":"","v0":"25","v":"0","a":"-9.8","t":""}', 'Thrown up at 25'], ['{"dx":"40","v0":"20","v":"0","a":"","t":""}', 'Braking in 40 m'], ['{"dx":"100","v0":"0","v":"","a":"2.5","t":""}', 'From rest, 100 m']].map(p => `<button class="btn xs" data-action="kin-preset" data-p='${p[0]}'>${p[1]}</button>`).join('')}</div>
          <button class="btn primary mt-2" data-action="compute" style="width:100%">Solve</button></div><div class="panel span-2" id="sv-out"><div class="empty">Results appear here.</div></div></div>`;
      } else if (SV.tab === 'vec') {
        b.innerHTML = `<div class="grid cols-3"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('flask')} Vector addition</div></div><p class="small muted mb-1">Up to three vectors by magnitude and angle (degrees counterclockwise from +x). Leave a row blank to skip it.</p>
          ${SV.vec.map((v, i) => `<div class="grid cols-2 mt-1" style="gap:8px">${field('vm' + i, `|${'ABC'[i]}|`, v.m)}${field('va' + i, `angle of ${'ABC'[i]} (°)`, v.a)}</div>`).join('')}
          <div class="preset-row mt-2">${[['[{"m":"5","a":"37"},{"m":"8","a":"270"},{"m":"","a":""}]', 'Exam 1 #2'], ['[{"m":"12","a":"0"},{"m":"9","a":"90"},{"m":"","a":""}]', 'Two forces'], ['[{"m":"4","a":"90"},{"m":"3","a":"0"},{"m":"","a":""}]', 'Boat & river']].map(p => `<button class="btn xs" data-action="vec-preset" data-p='${p[0]}'>${p[1]}</button>`).join('')}</div>
          <button class="btn primary mt-2" data-action="compute" style="width:100%">Add vectors</button></div>
          <div class="panel span-2"><div class="graph-wrap"><canvas class="graph" id="vec-canvas" style="height:320px"></canvas></div><div id="sv-out" class="mt-2"><div class="empty">Results appear here.</div></div></div></div>`;
      } else if (SV.tab === 'inc') {
        const k = SV.inc;
        b.innerHTML = `<div class="grid cols-3"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('flask')} Block on an incline</div></div>
          ${field('i-m', 'Mass (kg)', k.m)}<div class="mt-1"></div>${field('i-th', 'Incline angle θ (°)', k.th)}<div class="grid cols-2 mt-1" style="gap:8px">${field('i-mus', 'μs', k.mus)}${field('i-muk', 'μk', k.muk)}</div><div class="mt-1"></div>${field('i-F', 'Applied force along slope (N, + up-slope)', k.F, 'Set 0 for none.')}
          <button class="btn primary mt-2" data-action="compute" style="width:100%">Analyze</button></div>
          <div class="panel span-2"><div class="graph-wrap"><canvas class="graph" id="inc-canvas" style="height:300px"></canvas></div><div id="sv-out" class="mt-2"><div class="empty">Results appear here.</div></div></div></div>`;
      } else {
        const u = SV.unit; const cat = UNITS[u.cat] || UNITS.speed; const names = Object.keys(cat.u);
        if (!cat.u[u.from]) u.from = names[0]; if (!cat.u[u.to]) u.to = names[1] || names[0];
        b.innerHTML = `<div class="grid cols-3"><div class="panel"><div class="panel-h"><div class="panel-title">${icon('flask')} Unit converter</div></div>
          <div class="field"><label>Quantity</label><select class="select" id="u-cat">${Object.keys(UNITS).map(c => `<option value="${c}"${u.cat === c ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
          <div class="mt-1"></div>${field('u-val', 'Value', u.val)}
          <div class="grid cols-2 mt-1" style="gap:8px"><div class="field"><label>From</label><select class="select" id="u-from">${names.map(n => `<option${u.from === n ? ' selected' : ''}>${n}</option>`).join('')}</select></div><div class="field"><label>To</label><select class="select" id="u-to">${names.map(n => `<option${u.to === n ? ' selected' : ''}>${n}</option>`).join('')}</select></div></div>
          <div class="row mt-2"><button class="btn primary" data-action="compute">Convert</button><button class="btn" data-action="swap">${icon('rotate', 13)} Swap</button></div></div>
          <div class="panel span-2"><div id="sv-out"><div class="empty">Results appear here.</div></div><div class="divider"></div><div class="eyebrow mb-1">Constants you will use all semester</div><div class="table-wrap"><table class="table compact"><tbody>
            <tr><td>g (Earth surface)</td><td class="num">9.8 m/s²</td><td>G</td><td class="num">6.67 × 10⁻¹¹ N·m²/kg²</td></tr>
            <tr><td>Earth mass / radius</td><td class="num">5.97 × 10²⁴ kg / 6.37 × 10⁶ m</td><td>Moon mass / radius</td><td class="num">7.35 × 10²² kg / 1.74 × 10⁶ m</td></tr>
            <tr><td>Speed of sound (20 °C)</td><td class="num">343 m/s</td><td>Speed of light</td><td class="num">3.00 × 10⁸ m/s</td></tr>
            <tr><td>Water density</td><td class="num">1000 kg/m³</td><td>Air density</td><td class="num">1.2 kg/m³</td></tr>
            <tr><td>Atmospheric pressure</td><td class="num">1.013 × 10⁵ Pa</td><td>1 hp</td><td class="num">746 W</td></tr>
          </tbody></table></div></div></div>`;
        $('#u-cat', root).addEventListener('change', e => { SV.unit.cat = e.target.value; const n = Object.keys(UNITS[SV.unit.cat].u); SV.unit.from = n[0]; SV.unit.to = n[1] || n[0]; this.paint(root); });
        $('#u-from', root).addEventListener('change', e => { SV.unit.from = e.target.value; this.compute(root); });
        $('#u-to', root).addEventListener('change', e => { SV.unit.to = e.target.value; this.compute(root); });
      }
      this.compute(root);
    },
    compute(root) {
      const out = $('#sv-out', root); const val = id => $('#' + id, root).value; const numv = id => { const s = val(id).trim(); return s === '' ? null : parseNumber(s); };
      try {
        if (SV.tab === 'kin') {
          SV.kin = { dx: val('k-dx'), v0: val('k-v0'), v: val('k-v'), a: val('k-a'), t: val('k-t') };
          const K = { dx: numv('k-dx'), v0: numv('k-v0'), v: numv('k-v'), a: numv('k-a'), t: numv('k-t') };
          const known = Object.keys(K).filter(k => K[k] !== null && !isNaN(K[k]));
          if (known.length !== 3) throw new Error(`Enter exactly three quantities (you entered ${known.length}).`);
          const sols = this.solveKin(K, known);
          out.innerHTML = sols.map((S, i) => `<div class="${i ? 'mt-2' : ''}"><div class="eyebrow mb-1">${sols.length > 1 ? `Solution ${i + 1}` : 'Solution'}</div><div class="grid cols-5" style="gap:10px;grid-template-columns:repeat(5,minmax(0,1fr))">${[['Δx', S.dx, 'm'], ['v₀', S.v0, 'm/s'], ['v', S.v, 'm/s'], ['a', S.a, 'm/s²'], ['t', S.t, 's']].map(([l, v, u]) => `<div class="stat"><div class="stat-num" style="font-size:20px">${s3(v)}</div><div class="stat-label">${l} (${u})${known.includes({ 'Δx': 'dx', 'v₀': 'v0', v: 'v', a: 'a', t: 't' }[l]) ? ' · given' : ''}</div></div>`).join('')}</div><div class="callout mt-2">${S.eq.map(e => `$${e}$`).join('<br>')}</div></div>`).join('');
          typeset(out);
        } else if (SV.tab === 'vec') {
          SV.vec = [0, 1, 2].map(i => ({ m: val('vm' + i), a: val('va' + i) }));
          const vs = SV.vec.map((v, i) => ({ name: 'ABC'[i], m: parseNumber(v.m), a: parseNumber(v.a) })).filter(v => !isNaN(v.m) && !isNaN(v.a) && v.m !== 0);
          if (!vs.length) throw new Error('Enter at least one vector.');
          vs.forEach(v => { v.x = v.m * Math.cos(rad(v.a)); v.y = v.m * Math.sin(rad(v.a)); });
          const rx = vs.reduce((s, v) => s + v.x, 0), ry = vs.reduce((s, v) => s + v.y, 0); const rm = Math.hypot(rx, ry); let ra = deg(Math.atan2(ry, rx)); if (ra < 0) ra += 360;
          let dot = ''; if (vs.length >= 2) { const d = vs[0].x * vs[1].x + vs[0].y * vs[1].y; const ang = deg(Math.acos(Math.max(-1, Math.min(1, d / (vs[0].m * vs[1].m))))); dot = `<div class="callout mt-2">$\\vec A\\cdot\\vec B = A_xB_x + A_yB_y = ${s3(d)}$; the angle between $\\vec A$ and $\\vec B$ is $${s3(ang)}^\\circ$. $|\\vec A\\times\\vec B| = AB\\sin\\theta = ${s3(Math.abs(vs[0].x * vs[1].y - vs[0].y * vs[1].x))}$.</div>`; }
          out.innerHTML = `<div class="table-wrap"><table class="table compact"><thead><tr><th></th><th class="num">magnitude</th><th class="num">angle</th><th class="num">x-comp</th><th class="num">y-comp</th></tr></thead><tbody>${vs.map(v => `<tr><td><b>${v.name}</b></td><td class="num">${s3(v.m)}</td><td class="num">${s3(v.a)}°</td><td class="num">${s3(v.x)}</td><td class="num">${s3(v.y)}</td></tr>`).join('')}<tr class="hl"><td><b>Resultant</b></td><td class="num">${s3(rm)}</td><td class="num">${s3(ra)}°</td><td class="num">${s3(rx)}</td><td class="num">${s3(ry)}</td></tr></tbody></table></div><div class="callout mt-2">$R_x = \\sum A_x = ${s3(rx)}$, $R_y = \\sum A_y = ${s3(ry)}$; $|\\vec R| = \\sqrt{R_x^2 + R_y^2} = ${s3(rm)}$ at $${s3(ra)}^\\circ$ counterclockwise from $+x$${ra > 180 ? ` (equivalently $${s3(ra - 360)}^\\circ$)` : ''}.</div>${dot}`;
          typeset(out); this.drawVectors(root, vs, { x: rx, y: ry });
        } else if (SV.tab === 'inc') {
          SV.inc = { m: val('i-m'), th: val('i-th'), mus: val('i-mus'), muk: val('i-muk'), F: val('i-F') };
          const m = parseNumber(SV.inc.m), th = parseNumber(SV.inc.th), mus = parseNumber(SV.inc.mus), muk = parseNumber(SV.inc.muk), F = parseNumber(SV.inc.F) || 0;
          if ([m, th, mus, muk].some(isNaN) || m <= 0) throw new Error('Enter mass, angle and both coefficients.');
          const N = m * g0 * Math.cos(rad(th)), wPar = m * g0 * Math.sin(rad(th)), fsMax = mus * N, fk = muk * N;
          const drive = F - wPar; // net of non-friction forces along slope (+ up)
          let verdict, a = 0, fric = 0, dir = 0;
          if (Math.abs(drive) <= fsMax) { verdict = `<span class="chip good">Stays at rest</span> The non-friction forces along the slope add to $${s3(drive)}$ N, within the static limit $\\mu_sN = ${s3(fsMax)}$ N. Static friction supplies exactly $${s3(Math.abs(drive))}$ N ${drive > 0 ? 'down' : 'up'} the slope.`; fric = -drive; }
          else { dir = Math.sign(drive); fric = -dir * fk; a = (drive + fric) / m; verdict = `<span class="chip warn">Slides ${dir > 0 ? 'up' : 'down'} the slope</span> $|${s3(drive)}| > \\mu_sN = ${s3(fsMax)}$ N, so it moves; kinetic friction $\\mu_kN = ${s3(fk)}$ N acts ${dir > 0 ? 'down' : 'up'} the slope. $a = \\dfrac{${s3(drive)} ${fric < 0 ? '-' : '+'} ${s3(Math.abs(fric))}}{${m}} = ${s3(a)}\\ \\text{m/s}^2$ (${dir > 0 ? 'up' : 'down'}-slope positive).`; }
          out.innerHTML = `<div class="grid cols-4" style="gap:10px">${[['Normal force', N, 'N'], ['mg sin θ (down slope)', wPar, 'N'], ['μs N (max static)', fsMax, 'N'], ['μk N (kinetic)', fk, 'N']].map(([l, v, u]) => `<div class="stat"><div class="stat-num" style="font-size:20px">${s3(v)}</div><div class="stat-label">${l} (${u})</div></div>`).join('')}</div><div class="callout mt-2">${verdict}</div><p class="small muted mt-1">Axes tilted along the incline: $N = mg\\cos\\theta$, gravity's slope component $mg\\sin\\theta$, applied force $F$ along the slope, friction opposing the motion (or the tendency to move).</p>`;
          typeset(out); this.drawIncline(root, { th, N, wPar, F, fric, m });
        } else {
          SV.unit.val = val('u-val'); const u = SV.unit; const cat = UNITS[u.cat]; const x = parseNumber(u.val); if (isNaN(x)) throw new Error('Enter a number to convert.');
          const base = x * cat.u[u.from]; const y = base / cat.u[u.to];
          out.innerHTML = `<div class="stat"><div class="stat-num">${(+y.toPrecision(6)).toString()} ${esc(u.to)}</div><div class="stat-label">${esc(u.val)} ${esc(u.from)} = ${esc(String(+base.toPrecision(6)))} ${esc(cat.base)} = ${(+y.toPrecision(6)).toString()} ${esc(u.to)}</div></div><div class="table-wrap mt-2"><table class="table compact"><thead><tr><th>Unit</th><th class="num">Value</th></tr></thead><tbody>${Object.keys(cat.u).map(n => `<tr${n === u.to ? ' class="hl"' : ''}><td>${esc(n)}</td><td class="num">${(+(base / cat.u[n]).toPrecision(5)).toString()}</td></tr>`).join('')}</tbody></table></div>`;
        }
      } catch (e) { out.innerHTML = `<div class="callout warn">${esc(e.message)}</div>`; }
    },
    solveKin(K, known) {
      const has = k => known.includes(k); const { dx, v0, v, a, t } = K;
      const one = (S, eq) => [Object.assign({}, K, S, { eq })];
      if (has('v0') && has('a') && has('t')) return one({ v: v0 + a * t, dx: v0 * t + 0.5 * a * t * t }, [R`v = v_0 + at`, R`\Delta x = v_0t + \tfrac12at^2`]);
      if (has('v0') && has('v') && has('t')) return one({ a: (v - v0) / t, dx: 0.5 * (v0 + v) * t }, [R`a = \frac{v - v_0}{t}`, R`\Delta x = \tfrac12(v_0 + v)t`]);
      if (has('v0') && has('v') && has('a')) { if (a === 0) throw new Error('With a = 0 and v ≠ v₀ there is no solution; with v = v₀ time is undetermined.'); return one({ t: (v - v0) / a, dx: (v * v - v0 * v0) / (2 * a) }, [R`t = \frac{v - v_0}{a}`, R`\Delta x = \frac{v^2 - v_0^2}{2a}`]); }
      if (has('v0') && has('dx') && has('t')) { const aa = 2 * (dx - v0 * t) / (t * t); return one({ a: aa, v: v0 + aa * t }, [R`a = \frac{2(\Delta x - v_0t)}{t^2}`, R`v = v_0 + at`]); }
      if (has('v0') && has('dx') && has('a')) { if (a === 0) return one({ v: v0, t: dx / v0 }, [R`a = 0:\ v = v_0`, R`t = \Delta x / v_0`]); const disc = v0 * v0 + 2 * a * dx; if (disc < 0) throw new Error('No real solution: v² would be negative. Check signs.'); const sols = []; for (const s of [1, -1]) { const vv = s * Math.sqrt(disc); const tt = (vv - v0) / a; if (tt >= -1e-9) sols.push(Object.assign({}, K, { v: vv, t: tt, eq: [R`v = \pm\sqrt{v_0^2 + 2a\Delta x}`, R`t = \frac{v - v_0}{a}`] })); } if (!sols.length) throw new Error('No solution with t ≥ 0. Check signs.'); return sols; }
      if (has('v0') && has('dx') && has('v')) { if (v0 + v === 0) throw new Error('v₀ + v = 0: time is undetermined.'); return one({ t: 2 * dx / (v0 + v), a: (v * v - v0 * v0) / (2 * dx) }, [R`t = \frac{2\Delta x}{v_0 + v}`, R`a = \frac{v^2 - v_0^2}{2\Delta x}`]); }
      if (has('v') && has('a') && has('t')) return one({ v0: v - a * t, dx: v * t - 0.5 * a * t * t }, [R`v_0 = v - at`, R`\Delta x = vt - \tfrac12at^2`]);
      if (has('v') && has('dx') && has('t')) { const vv0 = 2 * dx / t - v; return one({ v0: vv0, a: (v - vv0) / t }, [R`v_0 = \frac{2\Delta x}{t} - v`, R`a = \frac{v - v_0}{t}`]); }
      if (has('v') && has('dx') && has('a')) { if (a === 0) return one({ v0: v, t: dx / v }, [R`a = 0:\ v_0 = v`, R`t = \Delta x / v`]); const disc = v * v - 2 * a * dx; if (disc < 0) throw new Error('No real solution: v₀² would be negative. Check signs.'); const sols = []; for (const s of [1, -1]) { const vv0 = s * Math.sqrt(disc); const tt = (v - vv0) / a; if (tt >= -1e-9) sols.push(Object.assign({}, K, { v0: vv0, t: tt, eq: [R`v_0 = \pm\sqrt{v^2 - 2a\Delta x}`, R`t = \frac{v - v_0}{a}`] })); } if (!sols.length) throw new Error('No solution with t ≥ 0. Check signs.'); return sols; }
      if (has('dx') && has('a') && has('t')) { const vv0 = (dx - 0.5 * a * t * t) / t; return one({ v0: vv0, v: vv0 + a * t }, [R`v_0 = \frac{\Delta x - \tfrac12at^2}{t}`, R`v = v_0 + at`]); }
      throw new Error('Unsupported combination.');
    },
    drawVectors(root, vs, Rr) {
      const c = $('#vec-canvas', root); if (!c) return; const { ctx, W, H } = fitCanvas(c);
      const col = { surface: cssVar('--surface'), grid: cssVar('--border'), axis: cssVar('--border-strong'), ink: cssVar('--muted'), v: [cssVar('--accent'), cssVar('--good'), cssVar('--lab')], r: cssVar('--gold') };
      ctx.fillStyle = col.surface; ctx.fillRect(0, 0, W, H);
      // extent: head-to-tail chain
      let px = 0, py = 0, minx = 0, maxx = 0, miny = 0, maxy = 0; vs.forEach(v => { px += v.x; py += v.y; minx = Math.min(minx, px); maxx = Math.max(maxx, px); miny = Math.min(miny, py); maxy = Math.max(maxy, py); });
      const span = Math.max(maxx - minx, maxy - miny, 1) * 1.3; const s = Math.min(W, H) / span; const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
      const X = x => W / 2 + (x - cx) * s, Y = y => H / 2 - (y - cy) * s;
      const step = niceStep(span); ctx.strokeStyle = col.grid; ctx.lineWidth = 1; ctx.font = '11px "IBM Plex Mono", monospace'; ctx.fillStyle = col.ink;
      for (let x = Math.ceil((cx - span / 2) / step) * step; x <= cx + span / 2; x += step) { ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), H); ctx.stroke(); }
      for (let y = Math.ceil((cy - span / 2) / step) * step; y <= cy + span / 2; y += step) { ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(W, Y(y)); ctx.stroke(); }
      ctx.strokeStyle = col.axis; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.moveTo(X(0), 0); ctx.lineTo(X(0), H); ctx.stroke();
      const arrow = (x0, y0, x1, y1, color, label, width = 2.4) => { ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(X(x0), Y(y0)); ctx.lineTo(X(x1), Y(y1)); ctx.stroke(); const a = Math.atan2(Y(y1) - Y(y0), X(x1) - X(x0)); ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x1) - 10 * Math.cos(a - 0.4), Y(y1) - 10 * Math.sin(a - 0.4)); ctx.lineTo(X(x1) - 10 * Math.cos(a + 0.4), Y(y1) - 10 * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill(); ctx.font = 'bold 13px "Helvetica Neue", "TeX Gyre Heros", Helvetica, Arial, sans-serif'; ctx.fillText(label, (X(x0) + X(x1)) / 2 + 6, (Y(y0) + Y(y1)) / 2 - 6); };
      px = 0; py = 0; vs.forEach((v, i) => { arrow(px, py, px + v.x, py + v.y, col.v[i], v.name); px += v.x; py += v.y; });
      if (vs.length > 1) arrow(0, 0, Rr.x, Rr.y, col.r, 'R', 3);
    },
    drawIncline(root, o) {
      const c = $('#inc-canvas', root); if (!c) return; const { ctx, W, H } = fitCanvas(c);
      const col = { surface: cssVar('--surface'), slope: cssVar('--surface-3'), edge: cssVar('--border-strong'), ink: cssVar('--ink'), N: cssVar('--accent'), w: cssVar('--bad'), f: cssVar('--good'), F: cssVar('--gold'), muted: cssVar('--muted') };
      ctx.fillStyle = col.surface; ctx.fillRect(0, 0, W, H);
      const th = rad(Math.max(0, Math.min(89, o.th))); const baseY = H - 30, x0 = 40, L = Math.min(W - 80, (H - 70) / Math.max(Math.tan(th), 0.25));
      const topX = x0 + L, topY = baseY - L * Math.tan(th);
      ctx.fillStyle = col.slope; ctx.strokeStyle = col.edge; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0, baseY); ctx.lineTo(topX, baseY); ctx.lineTo(topX, topY); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col.muted; ctx.font = '12px "Helvetica Neue", "TeX Gyre Heros", Helvetica, Arial, sans-serif'; ctx.fillText(`θ = ${o.th}°`, x0 + 46, baseY - 6);
      // block center at 55% up the slope
      const bx = x0 + L * 0.55, by = baseY - L * 0.55 * Math.tan(th); const ux = Math.cos(th), uy = -Math.sin(th); // up-slope unit (screen)
      const nx = Math.sin(th), ny = -Math.cos(th) * 1; // normal (screen, pointing up-left away from slope): perpendicular to slope, outward
      const size = 26; const cxb = bx + nx * size * 0.7, cyb = by + ny * size * 0.7 - 0; // block center just above surface... use rotated square
      ctx.save(); ctx.translate(bx, by); ctx.rotate(-th); ctx.fillStyle = col.ink; ctx.globalAlpha = 0.85; ctx.fillRect(-size / 2, -size, size, size); ctx.globalAlpha = 1; ctx.restore();
      const ccx = bx + Math.sin(th) * size / 2, ccy = by - Math.cos(th) * size / 2;
      const maxF = Math.max(o.N, o.wPar, Math.abs(o.F), Math.abs(o.fric), o.m * g0, 1); const scale = 80 / maxF;
      const arrow = (dx, dy, mag, color, label) => { const len = Math.max(6, mag * scale); const x1 = ccx + dx * len, y1 = ccy + dy * len; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(ccx, ccy); ctx.lineTo(x1, y1); ctx.stroke(); const a = Math.atan2(y1 - ccy, x1 - ccx); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 9 * Math.cos(a - 0.4), y1 - 9 * Math.sin(a - 0.4)); ctx.lineTo(x1 - 9 * Math.cos(a + 0.4), y1 - 9 * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill(); ctx.font = 'bold 12px "Helvetica Neue", "TeX Gyre Heros", Helvetica, Arial, sans-serif'; ctx.fillText(label, x1 + dx * 8 + 2, y1 + dy * 8 + 4); };
      arrow(0, 1, o.m * g0, col.w, `mg = ${s3(o.m * g0)} N`);
      arrow(Math.sin(th), -Math.cos(th), o.N, col.N, `N = ${s3(o.N)} N`);
      if (o.F) arrow(Math.sign(o.F) * ux, Math.sign(o.F) * uy, Math.abs(o.F), col.F, `F = ${s3(Math.abs(o.F))} N`);
      if (Math.abs(o.fric) > 1e-9) arrow(Math.sign(o.fric) * ux, Math.sign(o.fric) * uy, Math.abs(o.fric), col.f, `f = ${s3(Math.abs(o.fric))} N`);
      ctx.fillStyle = col.muted; ctx.font = '11px "IBM Plex Mono", monospace'; ctx.fillText('Free-body diagram (arrow lengths to scale)', 10, 16);
    }
  };
})(window);
