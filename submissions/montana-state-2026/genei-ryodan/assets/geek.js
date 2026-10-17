/* ============================================================
   Mathub — geek mode
   Terminal and CRT flavoured transitions on top of the motion layer:
   - page headings, the breadcrumb and panel titles decode from random
     glyphs into their text, left to right, with a blinking cursor
   - a status line types the route you opened and how long it took
     ("~/mathub $ cd calc/notes/1.1 ✓ 84 ms")
   - a scanline sweeps the screen on every route change and theme flip
   - opening a class prints a boot log of the real files as they arrive
   - dialogs power on like an old monitor, toasts read like shell output,
     dashboard tabs swap with a stepped wipe, cards materialise
   - primary buttons shed a few bits when clicked
   - ↑ ↑ ↓ ↓ ← → ← → B A rains math glyphs for a few seconds
   Settings → Preferences → "Geek mode" turns it off, and so does Reduce
   motion or the system's reduced-motion setting. Headings keep their
   real text for screen readers (aria-label) while they decode, and the
   decode starts after the router has read them, so nothing downstream
   ever sees scrambled text.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, settings } = App;
  const GLYPHS = '0101010110ABCDEF∑∫∂πλΔ√∞≈≠±θΩμσφ<>{}[]#%&*+=/|~^';
  const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ✦';
  const realm = () => document.documentElement.getAttribute('data-skin') === 'realm';
  const glyph = () => { const set = realm() ? RUNES : GLYPHS; return set[(Math.random() * set.length) | 0]; };
  const on = () => settings().geek === true && !(App.motionReduced && App.motionReduced());   // opt-in since the trail-map redesign
  App.geekOn = on;
  App.applyGeek = () => document.documentElement.setAttribute('data-geek', on() ? 'on' : 'off');
  const baseApplyMotion = App.applyMotion; App.applyMotion = () => { if (baseApplyMotion) baseApplyMotion(); App.applyGeek(); };
  App.applyGeek();

  /* ---------- decoder: one animation loop for every heading that is decoding ---------- */
  const active = new Set(); let looping = false;
  const loop = now => { active.forEach(d => d.step(now)); if (active.size) requestAnimationFrame(loop); else looping = false; };
  const kick = () => { if (!looping) { looping = true; requestAnimationFrame(loop); } };
  function decode(el, opts = {}) {
    if (!el || !el.isConnected || el.dataset.gkDone || el.closest('[data-gk="off"]')) return null;
    const full = el.textContent.replace(/\s+/g, ' ').trim();
    if (!full || full.length > 96 || /[$\\]/.test(full) || el.querySelector('mjx-container, .MathJax, input, textarea, select')) return null;
    const nodes = []; const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
    while ((n = tw.nextNode())) if (n.nodeValue.trim()) nodes.push(n);
    if (!nodes.length) return null;
    el.dataset.gkDone = '1';
    const ms = opts.ms || 480, delay = opts.delay || 0; const total = nodes.reduce((a, t) => a + t.nodeValue.length, 0);
    const block = getComputedStyle(el).display !== 'inline'; const prev = { height: el.style.height, overflow: el.style.overflow };
    if (block) { el.style.height = el.getBoundingClientRect().height + 'px'; el.style.overflow = 'hidden'; }
    el.setAttribute('aria-label', full); el.classList.add('gk-decoding');
    // each text node becomes: revealed text + <i> scrambled tail, restored to the original node at the end
    const parts = nodes.map(t => { const s = document.createElement('span'); s.className = 'gk-dec'; t.replaceWith(s); return { t, s, text: t.nodeValue }; });
    let t0 = null, last = 0;
    const paint = (p, now) => {
      const fresh = now - last > 45; if (fresh) last = now; let idx = 0;
      parts.forEach(x => {
        let shown = '', tail = '';
        for (let i = 0; i < x.text.length; i++, idx++) { const ch = x.text[i]; const at = 0.18 + 0.82 * (idx / total); if (p >= at || ch === ' ') { if (tail) tail += ch === ' ' ? ' ' : glyph(); else shown += ch; } else tail += fresh || !x.s.lastChild ? glyph() : (x.s.lastChild.textContent[tail.length] || glyph()); }
        if (!x.s.firstChild || x.s.firstChild.nodeType !== 3) { x.s.textContent = ''; x.s.append(document.createTextNode(''), document.createElement('i')); }
        x.s.firstChild.nodeValue = shown; x.s.lastChild.textContent = tail;
      });
    };
    const d = {
      step(now) {
        if (!el.isConnected || parts.some(x => !x.s.isConnected)) return this.end(false);
        if (t0 === null) t0 = now + delay; const p = Math.max(0, Math.min(1, (now - t0) / ms));
        if (p >= 1) return this.end(true); paint(p, now);
      },
      end(ok) {
        active.delete(d); parts.forEach(x => { if (x.s.isConnected) x.s.replaceWith(x.t); });
        el.removeAttribute('aria-label'); el.classList.remove('gk-decoding'); if (block) { el.style.height = prev.height; el.style.overflow = prev.overflow; }
        if (ok && opts.caret) { el.classList.add('gk-caret'); setTimeout(() => el.classList.remove('gk-caret'), 1700); }
      }
    };
    paint(0, performance.now()); active.add(d); kick(); return d;
  }
  App.geekDecode = (el, opts) => on() ? decode(el, opts) : null;

  /* ---------- status line: the route you opened, typed out, with the real time it took ---------- */
  let navAt = null, pendingNav = true, chipTimer = null, typeTimer = null;
  global.addEventListener('hashchange', () => { navAt = performance.now(); pendingNav = true; });
  const chip = () => { let el = $('#gk-status'); if (!el) { el = document.createElement('div'); el.id = 'gk-status'; el.setAttribute('aria-hidden', 'true'); el.innerHTML = '<span class="gk-path">~/mathub</span> <span class="gk-dollar">$</span> <span class="gk-cmd"></span><span class="gk-ok"></span><span class="gk-cur"></span>'; document.body.appendChild(el); } return el; };
  function placeChip(el) {
    const side = $('.app:not(.landing) .sidebar'); const r = side ? side.getBoundingClientRect() : null;
    el.style.left = (r && r.width > 40 && r.right > 60 ? Math.round(r.right + 16) : 16) + 'px';
    const tb = $('#tabbar'); const tbOn = tb && getComputedStyle(tb).display !== 'none';
    const lf = $('.lesson-foot'); const lfOn = lf && getComputedStyle(lf).display !== 'none' ? lf.offsetHeight : 0;
    el.style.bottom = (Math.max(tbOn ? tb.offsetHeight : 0, lfOn) + (tbOn || lfOn ? 12 : 16)) + 'px';
  }
  function status(cmd, ms) {
    const el = chip(); placeChip(el); clearTimeout(chipTimer); clearInterval(typeTimer);
    const c = $('.gk-cmd', el), ok = $('.gk-ok', el); $('.gk-path', el).textContent = realm() ? '~/realm' : '~/mathub'; c.textContent = ''; ok.textContent = ''; el.classList.remove('done', 'out'); void el.offsetWidth; el.classList.add('show');
    let i = 0; const step = Math.max(1, Math.ceil(cmd.length / 18));
    typeTimer = setInterval(() => { i = Math.min(cmd.length, i + step); c.textContent = cmd.slice(0, i); if (i >= cmd.length) { clearInterval(typeTimer); ok.textContent = ` ✓ ${ms} ms`; el.classList.add('done'); chipTimer = setTimeout(() => { el.classList.add('out'); chipTimer = setTimeout(() => el.classList.remove('show', 'out', 'done'), 380); }, 1500); } }, 16);
  }
  const cmdFor = () => { const raw = location.hash.replace(/^#\/?/, '').split('?')[0].replace(/\/+$/, ''); return realm() ? `teleport ${raw || '~'}` : (raw ? `cd ${raw}` : 'cd ~'); };

  /* ---------- scanline sweep ---------- */
  function sweep() { let el = $('#gk-scan'); if (!el) { el = document.createElement('div'); el.id = 'gk-scan'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); } el.classList.remove('run'); void el.offsetWidth; el.classList.add('run'); }
  App.geekSweep = () => { if (on()) sweep(); };

  /* ---------- after every render: sweep, status line, decode headings ---------- */
  const baseMotionRender = App.motionRender;
  App.motionRender = function (root) {
    if (baseMotionRender) baseMotionRender(root);
    if (!on() || !root || !pendingNav || $('.page-load', root)) return;
    pendingNav = false; const boot = navAt === null; const ms = Math.max(1, Math.round(performance.now() - (boot ? 0 : navAt))); navAt = null;
    sweep(); status(boot ? (realm() ? './mathub --roll-initiative' : './mathub --boot') : cmdFor(), ms);
    // decode after the router has finished reading the page (it stores the title for "pick up where you left off")
    queueMicrotask(() => {
      const main = $('.note-title, .rd-title, .page-title, .landing-title', root); if (main) decode(main, { ms: 520, caret: true });
      const crumb = $('#topbar .crumb-cur'); if (crumb && !root.closest('.landing')) { delete crumb.dataset.gkDone; decode(crumb, { ms: 380 }); }
      const vh = global.innerHeight || 800; let k = 0;
      $$('.panel-title', root).forEach(t => { if (k >= 8 || t === main) return; const r = t.getBoundingClientRect(); if (r.top > vh || r.bottom < 0) return; decode(t, { ms: 340, delay: 90 + k * 55 }); k++; });
    });
  };

  /* ---------- theme flip gets a sweep too ---------- */
  const baseThemeFade = App.themeFade; App.themeFade = function () { if (baseThemeFade) baseThemeFade(); if (on()) sweep(); };

  /* ---------- class download boot log: the real files, their size and time ---------- */
  document.addEventListener('mh:load', e => {
    if (!on()) return; const { course, files } = e.detail || {}; const box = $(`#view .page-load[data-course="${course}"]`); if (!box || $('.gk-boot', box)) return;
    const pre = document.createElement('pre'); pre.className = 'gk-boot'; pre.setAttribute('aria-hidden', 'true');
    pre.innerHTML = realm() ? `<b>$</b> summon ${course}\n<span class="gk-dim">  unrolling ${files.length} scroll${files.length === 1 ? '' : 's'}…</span>\n` : `<b>$</b> mathub open ${course}\n<span class="gk-dim">  resolving ${files.length} module${files.length === 1 ? '' : 's'}…</span>\n`;
    const skel = $('.skel', box); box.insertBefore(pre, skel || null);
  });
  document.addEventListener('mh:file', e => {
    const { course, src, ms, url } = e.detail || {}; const pre = $(`#view .page-load[data-course="${course}"] .gk-boot`); if (!pre) return;
    let kb = ''; try { const en = performance.getEntriesByName(url)[0]; const b = en && (en.decodedBodySize || en.encodedBodySize); if (b) kb = `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB`; } catch (err) {}
    const line = document.createElement('span'); line.className = 'gk-line'; line.textContent = `  ✓ ${src}.js`.padEnd(30) + `${kb.padStart(8)}  ${String(ms).padStart(4)} ms\n`; pre.appendChild(line);
  });
  document.addEventListener('mh:loaded', e => { const pre = $(`#view .page-load[data-course="${(e.detail || {}).course}"] .gk-boot`); if (pre) { const l = document.createElement('span'); l.className = 'gk-line gk-ready'; l.textContent = realm() ? '  the tome is open.' : '  ready.'; pre.appendChild(l); } });

  /* ---------- dashboard tabs: stepped wipe on the pane you switch to ---------- */
  document.addEventListener('click', e => {
    const tab = e.target.closest('.dash-tabs .tab'); if (!tab || !on()) return;
    requestAnimationFrame(() => { const panes = tab.closest('.dash-tabs').nextElementSibling; const pane = panes && $(':scope > .pane:not([hidden])', panes); if (!pane) return; pane.classList.remove('gk-swap'); void pane.offsetWidth; pane.classList.add('gk-swap'); $$('.panel-title', pane).slice(0, 6).forEach((t, i) => { delete t.dataset.gkDone; decode(t, { ms: 300, delay: 60 + i * 50 }); }); });
  });

  /* ---------- bits fly off primary buttons ---------- */
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('.btn.primary, .btn.gk-bits'); if (!b || b.disabled || !on()) return;
    for (let i = 0; i < 7; i++) {
      const s = document.createElement('span'); s.className = 'gk-bit'; s.setAttribute('aria-hidden', 'true'); s.textContent = Math.random() < 0.7 ? (Math.random() < 0.5 ? '0' : '1') : '∑π∫λ√Δ'[(Math.random() * 6) | 0];
      const a = Math.random() * Math.PI * 2, r = 26 + Math.random() * 30; s.style.left = e.clientX + 'px'; s.style.top = e.clientY + 'px'; s.style.setProperty('--dx', Math.round(Math.cos(a) * r) + 'px'); s.style.setProperty('--dy', Math.round(Math.sin(a) * r - 12) + 'px'); s.style.setProperty('--rot', Math.round(Math.random() * 90 - 45) + 'deg');
      document.body.appendChild(s); setTimeout(() => s.remove(), 700);
    }
  }, { passive: true });

  /* ---------- ↑ ↑ ↓ ↓ ← → ← → B A ---------- */
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']; let kpos = 0;
  document.addEventListener('keydown', e => {
    if (e.target.matches && e.target.matches('input, textarea, select, [contenteditable]')) { kpos = 0; return; }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; kpos = k === KONAMI[kpos] ? kpos + 1 : (k === KONAMI[0] ? 1 : 0);
    if (kpos === KONAMI.length) { kpos = 0; App.geekRain(); }
  });
  App.geekRain = function (ms = 4200) {
    if ($('#gk-rain')) return; if (App.motionReduced && App.motionReduced()) { if (App.toast) App.toast('Cheat code accepted. It is worth exactly 0 XP.', 2400); return; }
    const c = document.createElement('canvas'); c.id = 'gk-rain'; c.setAttribute('aria-hidden', 'true'); document.body.appendChild(c);
    const dpr = Math.min(2, global.devicePixelRatio || 1); const W = c.width = Math.round(innerWidth * dpr), H = c.height = Math.round(innerHeight * dpr); const x = c.getContext('2d');
    const fs = Math.round(16 * dpr), cols = Math.ceil(W / fs), drops = Array.from({ length: cols }, () => Math.random() * -H / fs); const t0 = performance.now(); let raf = 0;
    const draw = now => {
      const rl = realm(); x.fillStyle = rl ? 'rgba(14, 9, 20, 0.16)' : 'rgba(3, 7, 18, 0.16)'; x.fillRect(0, 0, W, H); x.font = rl ? `${fs}px "Mathub Runes", "Segoe UI Historic", serif` : `${fs}px "JetBrains Mono", ui-monospace, monospace`;
      for (let i = 0; i < cols; i++) { const y = drops[i] * fs; x.fillStyle = Math.random() < 0.08 ? (rl ? '#FFF3D6' : '#E6F0FF') : rl ? (i % 3 ? '#E8B84E' : (i % 2 ? '#B69BE8' : '#F07A86')) : (i % 3 ? '#4ADE80' : '#5B8CFF'); x.fillText(glyph(), i * fs, y); drops[i] = y > H && Math.random() > 0.975 ? 0 : drops[i] + 1; }
      if (now - t0 < ms) raf = requestAnimationFrame(draw); else { c.classList.add('out'); setTimeout(() => c.remove(), 600); }
    };
    raf = requestAnimationFrame(draw); c.addEventListener('click', () => { cancelAnimationFrame(raf); c.remove(); });
    if (App.sfx) App.sfx.play('levelup'); if (App.toast) App.toast(realm() ? 'Cheat code accepted. You rolled a natural 20 on a check worth 0 XP.' : 'Cheat code accepted. It is worth exactly 0 XP.', 2600);
  };
})(window);
