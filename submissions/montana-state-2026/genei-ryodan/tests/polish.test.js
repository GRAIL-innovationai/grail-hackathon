/* Interface polish (2026.10.02): the 11 px type floor, AA contrast on class colours and the dark exam hero, the sliding tab pill, the sidebar accordion, dialogs and toasts that ease out (App.dismiss), the phone focus-sounds button in the top bar, the GSAP recap story and the reading-progress line, and the Reduce motion fallbacks. */
const T = require('./lib');
(async () => {
  const { mk, go, log, check } = await T.start({});
  const [c, p] = await mk(1440, 900, { serviceWorkers: 'block' });

  // type floor and contrast on a class dashboard
  await go(p, '#/calc', 1500);
  const small = await p.evaluate(() => {
    const out = []; const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) { const el = tw.currentNode.parentElement; if (!el || !tw.currentNode.textContent.trim()) continue; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); if (!r.width || cs.visibility === 'hidden' || el.closest('sup, sub, code, pre, svg, mjx-container, #ambient, #gk-status')) continue; if (parseFloat(cs.fontSize) < 11) out.push(el.className + ' ' + cs.fontSize); }
    return out;
  });
  check('no readable text under 11 px on the dashboard', small.length === 0, small.slice(0, 5));
  const lum = h => { const c = h.match(/\d+/g).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const accents = await p.evaluate(() => { const d = document.createElement('div'); document.body.appendChild(d); const out = {}; ['phys', 'precalc', 'calc', 'biob', 'kin', 'psyx'].forEach(k => { d.style.color = `var(--${k}-accent)`; out[k] = getComputedStyle(d).color; }); d.remove(); return out; });
  const weak = Object.entries(accents).filter(([, col]) => ratio(col, 'rgb(255, 255, 255)') < 4.5).map(([k, col]) => k + ' ' + col);
  check('white text passes 4.5:1 on every light-mode class colour', weak.length === 0, weak);

  // sliding tab pill
  const pill = await p.evaluate(() => { const bar = document.querySelector('.dash-tabs'); const pl = bar && bar.querySelector('.tab-pill'); const on = bar && bar.querySelector('.tab.on'); return pl && on ? { w: pl.offsetWidth, tw: on.offsetWidth, tf: pl.style.transform, left: on.offsetLeft } : null; });
  check('the tab pill sits under the active tab', pill && Math.abs(pill.w - pill.tw) < 2 && pill.tf.includes(pill.left + 'px'), pill);
  await p.click('.dash-tabs .tab[data-tab="progress"]'); await p.waitForTimeout(400);
  const pill2 = await p.evaluate(() => { const bar = document.querySelector('.dash-tabs'); const pl = bar.querySelector('.tab-pill'); const on = bar.querySelector('.tab.on'); return { on: on.dataset.tab, tf: pl.style.transform, left: on.offsetLeft, shown: !document.querySelector('.pane[data-pane="progress"]').hidden }; });
  check('clicking a tab slides the pill and shows its pane', pill2.on === 'progress' && pill2.tf.includes(pill2.left + 'px') && pill2.shown, pill2);

  // sidebar accordion
  const g = await p.$eval('.nav-toggle:not(.open)', b => b.dataset.g).catch(() => null);
  if (g) {
    await p.click(`.nav-toggle[data-g="${g}"]`); await p.waitForTimeout(400);
    const open = await p.evaluate(g => { const el = document.querySelector(`.nav-group[data-g="${g}"]`); return { h: el.offsetHeight, vis: getComputedStyle(el.querySelector('.nav-group-in')).visibility }; }, g);
    await p.click(`.nav-toggle[data-g="${g}"]`); await p.waitForTimeout(450);
    const shut = await p.evaluate(g => { const el = document.querySelector(`.nav-group[data-g="${g}"]`); return { h: el.offsetHeight, vis: getComputedStyle(el.querySelector('.nav-group-in')).visibility }; }, g);
    check('sidebar groups open and close, and closed items leave the tab order', open.h > 30 && open.vis === 'visible' && shut.h < 2 && shut.vis === 'hidden', { open, shut });
  }

  // dialogs and toasts ease out but count as closed at once
  await p.keyboard.press('Control+k'); await p.waitForTimeout(400);
  await p.keyboard.press('Escape'); await p.waitForTimeout(30);
  const mid = await p.evaluate(() => ({ byId: !!document.querySelector('#search-modal'), closing: !!document.querySelector('.modal-backdrop.is-closing') }));
  await p.waitForTimeout(300);
  check('search closes: gone by id at once, eases out, then removed', !mid.byId && mid.closing && !(await p.$('.modal-backdrop')), mid);
  await p.evaluate(() => App.toast('hello', 300)); await p.waitForTimeout(340);
  const tcls = await p.evaluate(() => { const t = document.querySelector('.toast'); return t ? t.className : ''; }); await p.waitForTimeout(300);
  check('toasts ease out before they go', /is-closing/.test(tcls) && !(await p.$('.toast')), tcls);

  // the study guide reading line follows the article and goes when you leave
  await go(p, '#/guides/math-exam', 1600); await p.mouse.wheel(0, 900); await p.waitForTimeout(800);
  const rp = await p.evaluate(() => { const b = document.querySelector('.read-progress'); return b ? { on: b.classList.contains('on'), tf: getComputedStyle(b).transform } : null; });
  check('a study guide shows a reading-progress line that moves with the scroll', rp && rp.on && rp.tf !== 'none', rp);
  await go(p, '#/calc', 600); check('the reading line is removed on the next page', !(await p.$('.read-progress')));

  // the recap story runs on GSAP and moves on by itself
  await go(p, '#/recap?w=this', 1400);
  const rc = await p.evaluate(() => ({ gs: document.querySelector('#rc-root').classList.contains('gs'), gsap: !!window.gsap, segs: document.querySelectorAll('.rc-segs i').length, day: getComputedStyle(document.querySelector('.rc-day i')).transform }));
  check('the recap story uses the GSAP timeline, one segment per slide, and settles cleanly', rc.gs && rc.gsap && rc.segs === 5 && rc.day === 'none', rc);
  await p.evaluate(() => { const t = gsap.getTweensOf(document.querySelector('.rc-segs i.on b'))[0]; if (t) t.progress(0.995); }); await p.waitForTimeout(900);
  check('the segment bar advances the story on its own', (await p.evaluate(() => document.querySelectorAll('.rc-segs i.done').length)) >= 1);
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(600);
  check('quick key presses still land on the last slide', !!(await p.$('.recap-slide.end')));
  await c.close();

  // phones: the focus-sounds toggle lives in the top bar, its panel drops from there
  const [cm, m] = await mk(390, 844, { serviceWorkers: 'block' });
  await go(m, '#/calc/flashcards', 1400);
  const ph = await m.evaluate(() => ({ top: getComputedStyle(document.querySelector('.amb-top')).display, bubble: getComputedStyle(document.querySelector('#ambient .amb-bubble')).display }));
  check('on a class page the bubble hides and the top-bar button shows', ph.top !== 'none' && ph.bubble === 'none', ph);
  await m.click('.amb-top'); await m.waitForTimeout(400);
  const pan = await m.evaluate(() => { const pn = document.querySelector('#amb-panel'); const r = pn.getBoundingClientRect(); return { hidden: pn.hidden, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, exp: document.querySelector('.amb-top').getAttribute('aria-expanded') }; });
  check('the panel opens under the top bar and fits the screen', !pan.hidden && pan.top >= 56 && pan.top < 90 && pan.bottom <= pan.vh && pan.exp === 'true', pan);
  await m.click('.topbar-title'); await m.waitForTimeout(300);
  check('a tap outside closes it', await m.evaluate(() => document.querySelector('#amb-panel').hidden));
  await go(m, '#/', 1000);
  check('the start page has the sound button next to search, and no floating bubble until something plays', await m.evaluate(() => getComputedStyle(document.querySelector('.hero-actions .amb-top')).display !== 'none' && getComputedStyle(document.querySelector('#ambient .amb-bubble')).display === 'none'));
  await cm.close();

  // Reduce motion: no GSAP, dialogs simply go
  const [cr, r] = await mk(1440, 900, { serviceWorkers: 'block', reducedMotion: 'reduce' });
  await go(r, '#/recap?w=this', 1200);
  check('with Reduce motion the recap uses the plain path', await r.evaluate(() => !document.querySelector('#rc-root').classList.contains('gs') && !window.gsap && !!document.querySelector('.rc-day')));
  await r.keyboard.press('Control+k'); await r.waitForTimeout(300); await r.keyboard.press('Escape'); await r.waitForTimeout(20);
  check('with Reduce motion a dialog closes at once', !(await r.$('.modal-backdrop')));
  await cr.close();
  log('done');
  await T.finish();
})();
