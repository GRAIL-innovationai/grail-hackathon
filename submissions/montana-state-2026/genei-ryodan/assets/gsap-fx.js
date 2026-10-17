/* ============================================================
   Mathub — GSAP, on demand
   GSAP and ScrollTrigger live in assets/vendor/ (precached for
   offline) and are fetched only by the two things that use them:
   the weekly recap story (a timeline: progress segments, counting
   numbers, growing bars, the accuracy ring) and the reading-progress
   line on study guides and section notes (ScrollTrigger, tied to the
   article rather than the whole page). With Reduce motion on, or if
   the scripts cannot load, both fall back to the plain page.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const BUILD = global.MATHUB_BUILD || 'dev';
  const reduced = () => !!(App.motionReduced && App.motionReduced());
  const add = file => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = `assets/vendor/${file}?v=${BUILD}`; s.async = true; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
  let core = null, scroll = null;

  // resolves with gsap (and ScrollTrigger registered when asked), or null when motion is reduced or loading failed
  App.gsapLoad = function (withScroll) {
    if (reduced()) return Promise.resolve(null);
    if (!core) core = (global.gsap ? Promise.resolve() : add('gsap.min.js')).then(() => { const g = global.gsap || null; if (g) g.config({ nullTargetWarn: false }); return g; }).catch(() => { core = null; return null; });
    if (!withScroll) return core;
    if (!scroll) scroll = core.then(g => { if (!g) return null; if (global.ScrollTrigger) return g; return add('ScrollTrigger.min.js').then(() => { g.registerPlugin(global.ScrollTrigger); return g; }); }).catch(() => { scroll = null; return null; });
    return scroll;
  };
  // gsap if it is already here and motion is allowed, else null (the caller uses its CSS path)
  App.gsapNow = () => (global.gsap && !reduced() ? global.gsap : null);
  // gsap if it arrives within ms, else null: a first visit never waits long on the network
  App.gsapWithin = (ms, withScroll) => Promise.race([App.gsapLoad(withScroll), new Promise(r => setTimeout(() => r(null), ms))]);

  /* ---------- reading progress: a hairline that tracks how far through the article you are ---------- */
  let rp = null;
  App.scrollProgress = function (article) {
    App.scrollProgress.clear(); if (!article) return;
    App.gsapLoad(true).then(g => {
      if (!g || !article.isConnected || rp) return;
      // a page that already fits on screen has nothing to track
      if (article.offsetHeight < global.innerHeight * 1.15) return;
      const bar = document.createElement('div'); bar.className = 'read-progress'; bar.setAttribute('aria-hidden', 'true'); document.body.appendChild(bar);
      const tw = g.fromTo(bar, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: article, start: 'top 80px', end: 'bottom bottom', scrub: 0.3, onUpdate: st => bar.classList.toggle('on', st.progress > 0.002) } });
      rp = { bar, tw };
    });
  };
  App.scrollProgress.clear = function () { if (!rp) return; if (rp.tw.scrollTrigger) rp.tw.scrollTrigger.kill(); rp.tw.kill(); rp.bar.remove(); rp = null; };
  global.addEventListener('hashchange', () => App.scrollProgress.clear());
})(window);
