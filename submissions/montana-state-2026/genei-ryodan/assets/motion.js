/* ============================================================
   Mathub — motion helpers
   The top loading bar (class downloads), staggered card entrances,
   ring and progress-bar fills, scroll reveal for long pages, the
   theme-change fade, and the "Reduce motion" setting. Pure polish:
   with motion off, everything simply appears.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, settings, setSetting } = App;
  const reduced = () => settings().motion === 'off' || (global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  App.motionReduced = reduced;
  App.applyMotion = () => { document.documentElement.setAttribute('data-motion', settings().motion === 'off' ? 'off' : 'on'); };
  // no saved choice means Classic ('default', no attribute); Realm and the others are opt-in
  App.skinOf = () => settings().skin || 'default';
  App.applySkin = () => { const s = App.skinOf(); if (s !== 'default') document.documentElement.setAttribute('data-skin', s); else document.documentElement.removeAttribute('data-skin'); };
  App.SKINS = [['default', 'Big Sky', 'Bright and friendly: each class its own colour, Bo on the mountain', ['#F4F7FB', '#1A64D6']], ['realm', 'Realm', 'Parchment, runes and dice', ['#EDE1C6', '#9E1B2E']], ['bobcat', 'Bobcat', 'MSU blue and gold', ['#EEF3FB', '#003F7F']], ['paper', 'Paper', 'Warm and easy on the eyes', ['#F6F1E7', '#8A6A16']], ['forest', 'Forest', 'Calm greens', ['#EDF4EF', '#2E7D32']], ['midnight', 'Midnight', 'Deeper dark mode', ['#03050C', '#7C86FF']]];

  /* ---------- loading bar ---------- */
  let barTimer = null, barCount = 0;
  const bar = () => { let el = $('#loadbar'); if (!el) { el = document.createElement('div'); el.id = 'loadbar'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); } return el; };
  App.loadbar = {
    start() { barCount++; const el = bar(); clearTimeout(barTimer); el.classList.remove('done'); void el.offsetWidth; el.classList.add('on'); },
    done() { barCount = Math.max(0, barCount - 1); if (barCount) return; const el = bar(); el.classList.add('done'); barTimer = setTimeout(() => { el.classList.remove('on', 'done'); el.style.width = ''; }, 700); },
    wrap(promise) { this.start(); return Promise.resolve(promise).finally(() => this.done()); }
  };

  /* ---------- entrances, rings, bars, reveal ---------- */
  const SEL = '.panel, .course-card, .today-card, .resume-card, .gs-card, .card-link, .tile, .stat-strip, .issue, .rs-item, .guide-card, .recap-slide, .fz-card';
  let io = null;
  function observer() {
    if (io || !('IntersectionObserver' in global)) return io;
    io = new IntersectionObserver(entries => { entries.forEach(en => { if (en.isIntersecting) { en.target.style.setProperty('--i', 0); en.target.classList.add('mh-enter'); io.unobserve(en.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    return io;
  }
  App.motionRender = function (root) {
    if (!root || reduced()) return;
    const els = $$(SEL, root).filter(el => !el.closest('.mh-enter, .mh-reveal') || el.matches('.panel, .course-card')); const vh = global.innerHeight || 800;
    let k = 0; els.forEach(el => { if (el.classList.contains('mh-enter') || el.classList.contains('mh-reveal')) return; const r = el.getBoundingClientRect(); if (r.top < vh + 40 && k < 18) { el.style.setProperty('--i', k++); el.classList.add('mh-enter'); } else { el.classList.add('mh-reveal'); const o = observer(); if (o) o.observe(el); else el.classList.add('mh-enter'); } });
    // rings: draw from empty to their value
    $$('.ring-fg', root).forEach(c => { const dash = parseFloat(c.getAttribute('stroke-dasharray')); if (!dash || c.classList.contains('ring-anim')) return; c.style.setProperty('--ring-c', dash); c.classList.add('ring-anim'); });
    // progress bars: grow from zero
    $$('.bar-fill', root).forEach(b => { if (b.dataset.grown) return; b.dataset.grown = '1'; const w = b.style.width; if (!w) return; b.style.transition = 'none'; b.style.width = '0'; void b.offsetWidth; b.style.transition = ''; requestAnimationFrame(() => { b.style.width = w; }); });
  };

  /* ---------- theme fade + button spin ---------- */
  App.themeFade = function () {
    if (reduced()) return; const html = document.documentElement; html.classList.add('theme-fade'); setTimeout(() => html.classList.remove('theme-fade'), 420);
    $$('.theme-btn').forEach(b => { b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin'); setTimeout(() => b.classList.remove('spin'), 600); });
  };

  /* ---------- small helpers other modules use ---------- */
  App.burst = function (el, cls = 'pop') { if (!el || reduced()) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  App.tada = el => App.burst(el, 'tada');
  // dialogs and toasts leave softer and faster than they arrive (transitions.dev modal and toast close).
  // The element stops counting as open at once: ids go (so $('#auth-modal') and the tests see it gone),
  // it turns inert, and it is removed when the exit has played. With motion reduced it simply goes.
  App.dismiss = function (el, ms = 190) {
    if (!el || !el.isConnected) return;
    if (reduced()) { el.remove(); return; }
    el.removeAttribute('id'); $$('[id]', el).forEach(n => n.removeAttribute('id')); el.inert = true; el.classList.add('is-closing');
    setTimeout(() => el.remove(), ms);
  };
  App.applyMotion(); App.applySkin();
  document.addEventListener('DOMContentLoaded', () => { App.applyMotion(); App.applySkin(); });
})(window);
