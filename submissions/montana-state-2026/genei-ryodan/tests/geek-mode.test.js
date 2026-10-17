/* Geek mode: decoding headings, the status line, scanline, boot log, CRT dialogs, shell toasts, tab wipes, bits, the Konami rain, and the switches that turn it off. */
const T = require('./lib');
(async () => {
  const { mk, go, log, check } = await T.start({ geek: true });
  const [c, p] = await mk(1360, 900, { serviceWorkers: 'block' });
  // these checks use the Classic wording; tests/realm.test.js covers the Realm variants (runes, teleport)
  await c.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('studyhub-settings') || '{}'); if (!s.skin) { s.skin = 'default'; localStorage.setItem('studyhub-settings', JSON.stringify(s)); } } catch (e) {} });
  await go(p, '#/', 900);
  check('geek mode on once switched on', await p.evaluate(() => document.documentElement.getAttribute('data-geek')) === 'on');
  const boot = await p.evaluate(() => { const s = document.querySelector('#gk-status'); return s ? s.textContent : ''; });
  check('first render prints a boot line with a time', /\.\/mathub --boot/.test(boot) || /cd ~/.test(boot), boot);
  check('scanline ran', !!(await p.$('#gk-scan.run')));

  // class download boot log: slow one file down so the log is visible
  await p.route('**/calc-quiz.js*', async r => { await new Promise(res => setTimeout(res, 700)); r.continue(); });
  await p.evaluate(() => { location.hash = '#/calc/dashboard'; }); await p.waitForTimeout(350);
  const bootlog = await p.evaluate(() => { const b = document.querySelector('#view .page-load .gk-boot'); return b ? b.textContent : null; });
  log('boot log while loading:', JSON.stringify(bootlog));
  check('boot log names the class and the first file', !!bootlog && /mathub open calc/.test(bootlog) && /✓ calc-data\.js/.test(bootlog) && /ms/.test(bootlog), bootlog);
  await p.waitForTimeout(1200); await p.unroute('**/calc-quiz.js*');
  const st = await p.evaluate(() => { const s = document.querySelector('#gk-status'); const side = document.querySelector('.sidebar').getBoundingClientRect(); return { text: s && s.textContent, left: s ? parseFloat(s.style.left) : 0, sideRight: side.right }; });
  log('status after load:', st.text);
  check('status line types the route with a real time', /cd calc\/dashboard/.test(st.text || '') && /✓ \d+ ms/.test(st.text || ''), st.text);
  check('status line sits right of the sidebar', st.left > st.sideRight, st);

  // headings decode, keep the real text for screen readers, and the router stores the real title
  const mid = await p.evaluate(() => new Promise(res => { addEventListener('hashchange', () => setTimeout(() => { const h = document.querySelector('#view .note-title'); res(h ? { decoding: h.classList.contains('gk-decoding'), label: h.getAttribute('aria-label'), glyphs: !!h.querySelector('.gk-dec i'), text: h.textContent, height: h.style.height } : null); }, 30), { once: true }); location.hash = '#/calc/notes/1.1'; }));
  log('mid decode:', JSON.stringify(mid));
  check('note title is decoding right after navigation', mid && mid.decoding && mid.glyphs, mid);
  check('real title kept in aria-label while decoding', mid && mid.label && mid.label.length > 3 && mid.label !== mid.text, mid);
  check('heading height locked while decoding', mid && /px$/.test(mid.height || ''), mid);
  await p.waitForTimeout(900);
  const after = await p.evaluate(() => { const h = document.querySelector('#view .note-title'); const lv = App.settings().lastVisit || {}; return { text: h.textContent, decoding: h.classList.contains('gk-decoding'), label: h.getAttribute('aria-label'), height: h.style.height, overflow: h.style.overflow, detail: lv.detail, spans: h.querySelectorAll('.gk-dec').length }; });
  log('after decode:', JSON.stringify(after));
  check('heading settles on its real text', after.text === mid.label && !after.decoding && !after.label && after.spans === 0, after);
  check('heading styles restored', after.height === '' && after.overflow === '', after);
  check('"pick up where you left off" stored the real title, not glyphs', after.detail === mid.label, after);
  const crumb = await p.evaluate(() => { const c = document.querySelector('#topbar .crumb-cur'); return c && c.textContent; });
  check('breadcrumb settles on the view name', crumb === 'Section notes' || /notes/i.test(crumb || ''), crumb);

  // toasts, dialogs, bits, tabs
  await p.evaluate(() => App.toast('hello', 3000)); await p.waitForTimeout(80);
  const tb = await p.evaluate(() => { const t = document.querySelector('.toast'); return { before: getComputedStyle(t, '::before').content, font: getComputedStyle(t).fontFamily }; });
  check('toast reads like shell output', /\$/.test(tb.before) && /Mono|monospace/i.test(tb.font), tb);
  await p.keyboard.press('Control+k'); await p.waitForTimeout(60);
  const anim = await p.evaluate(() => { const m = document.querySelector('#search-modal .modal'); return m && getComputedStyle(m).animationName; });
  check('dialogs power on like a monitor', anim === 'gkCrtOn', anim); await p.keyboard.press('Escape');
  await go(p, '#/calc/dashboard', 900);
  const bits = await p.evaluate(() => { const b = document.querySelector('#view .btn.primary'); if (!b) return -1; b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 300 })); return document.querySelectorAll('.gk-bit').length; });
  check('primary buttons shed bits', bits === 7, bits);
  await p.waitForTimeout(800); check('bits clean themselves up', (await p.$$('.gk-bit')).length === 0);
  const tabs = await p.$$('#view .dash-tabs .tab');
  if (tabs.length > 1) { await tabs[1].click(); await p.waitForTimeout(40); check('dashboard tab swap wipes in', await p.evaluate(() => !!document.querySelector('#view .pane.gk-swap:not([hidden])'))); }
  else log('no dashboard tabs to test');

  // Konami rain
  for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) await p.keyboard.press(k);
  await p.waitForTimeout(200); check('Konami code starts the glyph rain', !!(await p.$('#gk-rain')));
  await p.click('#gk-rain'); await p.waitForTimeout(100); check('rain dismisses on click', !(await p.$('#gk-rain')));

  // switches: the setting, reduce motion, and first paint on reload
  await go(p, '#/settings', 900);
  check('settings has a geek mode switch, on', await p.$eval('#s-geek', e => e.checked).catch(() => null) === true);
  await p.click('#s-geek'); await p.waitForTimeout(120);
  check('switching it off clears data-geek', await p.evaluate(() => document.documentElement.getAttribute('data-geek')) === 'off');
  const offNav = await p.evaluate(() => new Promise(res => { addEventListener('hashchange', () => setTimeout(() => { const h = document.querySelector('#view .note-title'); const s = document.querySelector('#gk-status'); res({ decoding: !!(h && h.classList.contains('gk-decoding')), status: !!(s && s.classList.contains('show') && getComputedStyle(s).display !== 'none') }); }, 30), { once: true }); location.hash = '#/calc/notes/1.2'; }));
  check('with geek mode off nothing decodes and no status line shows', !offNav.decoding && !offNav.status, offNav);
  await p.reload(); await p.waitForTimeout(300);
  check('off state applies before paint on reload', await p.evaluate(() => document.documentElement.getAttribute('data-geek')) === 'off');
  await go(p, '#/settings', 800); await p.click('#s-geek'); await p.waitForTimeout(100);
  check('switching it back on', await p.evaluate(() => document.documentElement.getAttribute('data-geek')) === 'on');
  await p.click('#s-motion'); await p.waitForTimeout(100);
  check('reduce motion turns geek mode off too', await p.evaluate(() => document.documentElement.getAttribute('data-geek')) === 'off');
  await p.click('#s-motion'); await p.waitForTimeout(100);
  check('and back on when motion returns', await p.evaluate(() => document.documentElement.getAttribute('data-geek')) === 'on');
  await c.close();

  // system reduced motion wins
  const [cr, r] = await mk(1200, 800, { serviceWorkers: 'block', reducedMotion: 'reduce' }); await go(r, '#/', 700);
  check('system reduced motion keeps geek mode off', await r.evaluate(() => document.documentElement.getAttribute('data-geek')) === 'off');
  await cr.close();

  // phone: the status line clears the tab bar
  const [cm, m] = await mk(390, 800, { serviceWorkers: 'block' }); await go(m, '#/', 700); await m.evaluate(() => { location.hash = '#/today'; }); await m.waitForTimeout(500);
  const mob = await m.evaluate(() => { const s = document.querySelector('#gk-status'); const t = document.querySelector('#tabbar'); return { bottom: s ? parseFloat(s.style.bottom) : 0, tab: t ? t.offsetHeight : 0, left: s ? parseFloat(s.style.left) : 0, noScroll: document.documentElement.scrollWidth <= innerWidth + 1 }; });
  check('status line sits above the phone tab bar', mob.bottom > mob.tab && mob.left === 16, mob);
  check('no sideways scroll on phones', mob.noScroll, mob);
  await cm.close();
  await T.finish();
})();
