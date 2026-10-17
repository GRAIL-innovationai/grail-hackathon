/* ============================================================
   Languages (assets/i18n.js): English, Español, Русский
   - the page in the language picked: html lang, the navigation, the footer picker; pages fit on a computer and a phone
   - the footer picker switches back to English and remembers it
   - Bo is told to answer in the student's language
   ============================================================ */
const T = require('./lib');
const fs = require('fs'); const path = require('path'); const LAST = path.join(__dirname, 'fixtures', 'ai-last.json');
(async () => {
  const { mk, go, txt, check, hscroll, login, api } = await T.start();
  for (const L of ['es', 'ru']) {
    const setup = new Function(`try { const s = JSON.parse(localStorage.getItem('studyhub-settings') || '{}'); s.tourDone = true; s.courses = ['calc', 'physics']; s.asof = '2026-10-13'; s.boFloatSeen = 1; if (!s.lang) s.lang = '${L}'; localStorage.setItem('studyhub-settings', JSON.stringify(s)); } catch (e) {}`);
    const [c, p] = await mk(1360, 900, { serviceWorkers: 'block' }); await c.addInitScript(setup);
    await go(p, '#/calc/dashboard', 2200);
    const r = await p.evaluate(() => ({ lang: document.documentElement.lang, nav: document.querySelector('#sidebar-nav').textContent, pick: document.querySelector('#lang-pick').value, opts: [...document.querySelectorAll('#lang-pick option')].map(o => o.textContent) }));
    check(`${L}: the page is in ${L} (html lang, the nav, the picker)`, r.lang === L && r.pick === L && r.opts.join() === 'English,Español,Русский' && (L === 'es' ? /Tarjetas/.test(r.nav) : /Карточки/.test(r.nav)), r);
    for (const h of ['#/calc/practice', '#/today', '#/settings', '#/calc/flashcards']) { await go(p, h, 3000); check(`${L}: ${h} has no page error and fits`, await hscroll(p)); }
    // phone
    const [c2, ph] = await mk(390, 844, { serviceWorkers: 'block' }); await c2.addInitScript(setup);
    await go(ph, '#/calc/dashboard', 2200); check(`${L}: phone dashboard fits the screen`, await hscroll(ph));
    await c.close(); await c2.close();
  }
  // switching back to English from the footer
  const [c3, e] = await mk(1360, 900, { serviceWorkers: 'block' }); await c3.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('studyhub-settings') || '{}'); s.tourDone = true; if (!s.lang) s.lang = 'es'; localStorage.setItem('studyhub-settings', JSON.stringify(s)); } catch (x) {} });
  await go(e, '#/calc/dashboard', 1800); await e.selectOption('#lang-pick', 'en'); await e.waitForTimeout(2500);
  check('the footer picker switches the language (back to English) and remembers it', await e.evaluate(() => document.documentElement.lang === 'en' && JSON.parse(localStorage.getItem('studyhub-settings')).lang === 'en' && /Flashcards/.test(document.querySelector('#sidebar-nav').textContent)));
  // Bo answers in the student's language
  const [c4, m] = await mk(1360, 900, { serviceWorkers: 'block' }); await c4.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('studyhub-settings') || '{}'); s.tourDone = true; s.courses = ['calc']; if (!s.lang) s.lang = 'ru'; s.aiConsent = Date.now(); localStorage.setItem('studyhub-settings', JSON.stringify(s)); } catch (x) {} });
  await go(m, '#/', 600); await login(m, 'mod.user@montana.edu'); await m.reload(); await m.waitForTimeout(900);
  await m.evaluate(() => App.boAsk({ class: 'calc', q: 'What is a limit?', snapshot: {}, today: App.todayISO() }, () => {}));
  const sys = JSON.parse(fs.readFileSync(LAST, 'utf8')).system.map(b => b.text).join('\n');
  check('Bo is told to answer in Russian, with the English terms the class uses', /LANGUAGE: the student uses Mathub in Russian\. Always answer in Russian/.test(sys) && /English term in brackets/.test(sys), sys.slice(-400));
  await api(m, 'ai_forget', { what: 'all' });
  await T.finish();
})();
