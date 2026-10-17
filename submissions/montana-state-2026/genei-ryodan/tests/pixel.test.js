/* Pixel art: the sprite engine, the start page skyline, empty-state friends, class loading, game over, the footer signature, the streak flame, the XP coin, Blitz's arcade end screen, the character sheet inventory and reduced motion. */
const T = require('./lib');
(async () => {
  const { mk, go, log, check } = await T.start({});
  const [c, p] = await mk(1360, 900, { serviceWorkers: 'block' });
  await go(p, '#/', 1200);
  const eng = await p.evaluate(() => { const names = App.pixelSprites; const svgs = names.map(n => App.pixel(n, 2)); return { names, ok: svgs.every(s => /^<svg class="px px-/.test(s) && /shape-rendering="crispEdges"/.test(s) && /aria-hidden="true"/.test(s)), unknown: App.pixel('nope'), sized: App.pixel('heart', 4).match(/width="(\d+)" height="(\d+)"/).slice(1).join('x'), frames: (App.pixel('invader', 2).match(/class="pxf /g) || []).length, still: (App.pixel('invader', 2, { still: true }).match(/class="pxf /g) || []).length }; });
  log('sprites:', eng.names.join(', '));
  check('every sprite renders as crisp, hidden-from-readers SVG', eng.names.length >= 14 && eng.ok, eng);
  check('unknown sprites render nothing, sizes scale by pixel', eng.unknown === '' && eng.sized === '28x24', eng);
  check('two-frame sprites carry both frames unless held still', eng.frames === 2 && eng.still === 0, eng);
  const sky = await p.evaluate(() => { const s = document.querySelector('.landing-top.hero .px-skyline'); const h = document.querySelector('.landing-top.hero'); const cs = s && getComputedStyle(s); const text = h.querySelector(':scope > div:first-child'); return s ? { bg: /data:image\/svg\+xml/.test(cs.backgroundImage), w: Math.round(s.getBoundingClientRect().width), hw: Math.round(h.getBoundingClientRect().width), textCapped: getComputedStyle(text).maxWidth !== 'none', hidden: s.getAttribute('aria-hidden') } : null; });
  check('the Bridger Range skyline spans the whole hero', sky && sky.bg && sky.w >= sky.hw - 2 && sky.hidden === 'true', sky);
  check('the hero text column keeps its width cap', sky && sky.textCapped, sky);
  const foot = await p.evaluate(() => { const s = document.querySelector('.site-foot .px-sig'); return s ? { inv: !!s.querySelector('.px-invader'), heart: !!s.querySelector('.px-heart'), text: s.textContent.replace(/\s+/g, ' ').trim() } : null; });
  check('footer signature: invader, heart and readable text', foot && foot.inv && foot.heart && foot.text === 'Handmade with love in Bozeman', foot);
  const flame = await p.evaluate(() => { const f = document.querySelector('.streak-chip .px-flame'); return f ? { grey: getComputedStyle(f).filter.includes('grayscale'), lit: f.closest('.streak-chip').classList.contains('lit') } : null; });
  check('streak chip uses the pixel flame, grey until today counts', flame && (flame.lit ? !flame.grey : flame.grey), flame);
  const anim = await p.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.pixel('bo', 3); document.body.appendChild(d); const f1 = getComputedStyle(d.querySelector('.pxf1')).animationName, f2 = getComputedStyle(d.querySelector('.pxf2')).visibility; d.remove(); return { f1, f2 }; });
  check('Bo blinks (frame 1 animates, frame 2 starts hidden)', anim.f1 === 'pxBlinkA' && anim.f2 === 'hidden', anim);

  // empty states get a stable pixel friend; skeletons do not
  await go(p, '#/mistakes', 900);
  const friend1 = await p.evaluate(() => { const e = document.querySelector('.empty.bo .bo-mini .px'); return e ? e.getAttribute('class') : null; });
  await p.reload(); await p.waitForTimeout(900); const friend2 = await p.evaluate(() => { const e = document.querySelector('.empty.bo .bo-mini .px'); return e ? e.getAttribute('class') : null; });
  check('empty states show the same pixel friend every time', !!friend1 && friend1 === friend2, { friend1, friend2 });
  check('skeleton boxes stay plain', await p.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.skeleton(3); const el = d.firstChild; document.body.appendChild(el); App.paintMascots && App.paintMascots(); const has = !!el.querySelector('.px'); el.remove(); return !has; }));

  // class loading, then the XP coin
  await p.route('**/calc-quiz.js*', async r => { await new Promise(res => setTimeout(res, 800)); r.continue(); });
  await p.evaluate(() => { location.hash = '#/calc/dashboard'; }); await p.waitForTimeout(300);
  const loader = await p.evaluate(() => { const l = document.querySelector('#view .px-loader'); return l ? { bo: !!l.querySelector('.px-bo'), label: l.textContent.trim() } : null; });
  check('class loading shows pixel Bo and a pixel LOADING label', loader && loader.bo && /Loading/i.test(loader.label), loader);
  await p.waitForTimeout(1200); await p.unroute('**/calc-quiz.js*');
  await p.evaluate(() => App.addXP(10, { course: 'calc' })); await p.waitForTimeout(250);
  const xp = await p.evaluate(() => { const x = document.querySelector('.xp-float'); return x ? { coin: !!x.querySelector('.px-coin'), text: x.textContent.trim(), font: getComputedStyle(x).fontFamily } : null; });
  check('XP pop-up shows a pixel coin in the arcade font', xp && xp.coin && xp.text === '+10 XP' && /Press Start 2P/.test(xp.font), xp);

  // Blitz end screen
  await go(p, '#/calc/blitz', 900); await p.click('[data-action="bz-start"]'); await p.waitForTimeout(300); await p.evaluate(() => { App.blitz.left = 1; }); await p.waitForTimeout(1500);
  const bz = await p.evaluate(() => ({ label: (document.querySelector('.bz-endlabel') || {}).textContent, art: !!document.querySelector('.bz-endart .px'), font: getComputedStyle(document.querySelector('.bz-final')).fontFamily }));
  check('Blitz ends like an arcade cabinet', /Time up|New hi-score!/.test(bz.label) && bz.art && /Press Start 2P/.test(bz.font), bz);

  // character sheet inventory
  await go(p, '#/sheet', 900);
  const inv = await p.$$eval('.cs-inv .cs-item .px', els => els.map(e => e.getAttribute('class').split(' ')[1]));
  check('character sheet inventory is pixel art', ['px-potion', 'px-invader', 'px-scroll', 'px-book'].every(n => inv.includes(n)), inv);

  // Realm hides the skyline; game over on a failed download
  await p.evaluate(() => { const s = App.settings(); s.skin = 'realm'; localStorage.setItem('studyhub-settings', JSON.stringify(s)); App.applySkin(); }); await go(p, '#/', 700);
  check('Realm keeps its own map instead of the skyline', await p.evaluate(() => getComputedStyle(document.querySelector('.px-skyline')).display === 'none'));
  await p.evaluate(() => { const s = App.settings(); s.skin = 'default'; localStorage.setItem('studyhub-settings', JSON.stringify(s)); App.applySkin(); });
  await p.route('**/assets/precalc-quiz.js*', r => r.abort()); await go(p, '#/precalc', 1000);
  const go1 = await p.evaluate(() => { const e = document.querySelector('#view .empty.px-gameover'); return e ? { sad: !!e.querySelector('.px-boSad'), title: (e.querySelector('.px-go-title') || {}).textContent, msg: e.querySelector('p').textContent, retry: !!e.querySelector('[data-action="retry"]') } : null; });
  check('a failed download is a game over with a way to continue', go1 && go1.sad && go1.title === 'Game over' && /Could not download/.test(go1.msg) && go1.retry, go1);
  await p.unroute('**/assets/precalc-quiz.js*');
  await c.close();

  // reduced motion holds sprites on their first frame
  const [cr, r] = await mk(1200, 800, { serviceWorkers: 'block', reducedMotion: 'reduce' }); await go(r, '#/', 700);
  const still = await r.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.pixel('invader', 3); document.body.appendChild(d); const res = { a1: getComputedStyle(d.querySelector('.pxf1')).animationName, v1: getComputedStyle(d.querySelector('.pxf1')).visibility, v2: getComputedStyle(d.querySelector('.pxf2')).visibility }; d.remove(); return res; });
  check('reduced motion shows one still frame', still.a1 === 'none' && still.v1 === 'visible' && still.v2 === 'hidden', still);
  await cr.close();

  const [cm, m] = await mk(390, 820, { serviceWorkers: 'block' }); await go(m, '#/', 900);
  check('phone: skyline fits and nothing scrolls sideways', await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && !!document.querySelector('.px-skyline')));
  await cm.close();
  await T.finish();
})();
