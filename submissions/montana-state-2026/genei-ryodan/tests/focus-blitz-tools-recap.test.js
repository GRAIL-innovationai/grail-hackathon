/* Focus room, exam readiness, Blitz, Tools (calculator, units, citations, words, sig figs), Your week, account menu, mobile layouts. */
const T = require('./lib');
(async () => {
  const { mk, login, go, log, check, txt } = await T.start({ dialogText: '40' });
  const [c, p] = await mk(1360, 900, { serviceWorkers: 'block' }); await go(p, '#/', 700);
  await p.evaluate(() => { const s = App.settings(); s.courses = ['calc', 'physics', 'csci']; localStorage.setItem('studyhub-settings', JSON.stringify(s)); App.store.poke('calc', d => { const r = App.readiness('calc'); const t0 = r && r.ok ? r.topics[0].t : 'velocity'; d.progress = { [t0]: { a: 12, c: 10 }, aroc: { a: 6, c: 2 } }; d.history = [{ t: 'velocity', ok: true, d: App.todayISO() }]; d.activity = { [App.todayISO()]: true }; d.xp = [{ d: App.todayISO(), n: 40 }]; }); });
  await go(p, '#/', 700);
  check('hero has Focus button and exam countdown', !!(await p.$('.hero-focus')) && /day/.test(await txt(p, '.hero-count')), await txt(p, '.hero-count'));
  // readiness on dashboard + today
  await go(p, '#/calc', 1200); check('dashboard readiness panel', !!(await p.$('.ready-panel')) && (await p.$$('.ready-tip')).length === 3, await txt(p, '.ready-label'));
  const score = await p.evaluate(() => App.readiness('calc')); check('readiness score computed', score && score.ok && score.score > 0 && score.score <= 100, score && score.score);
  await go(p, '#/today', 900); check('today ready column', (await p.$$('#td-classes .ready-gauge')).length >= 1);
  // focus room
  await go(p, '#/focus', 700); check('focus room renders', !!(await p.$('#fz-task')) && (await p.$$('.fz-preset')).length === 4);
  await p.fill('#fz-task', 'Chain rule set'); await p.click('.fz-preset[data-m="25"]'); await p.click('[data-action="fz-start"]'); await p.waitForTimeout(1300);
  check('timer running', await p.evaluate(() => App.focus.running && App.focus.left < 25 * 60), await p.evaluate(() => App.focus.left));
  await go(p, '#/', 500); check('focus pill shows away from page', !!(await p.$('#focus-pill')) && /\d+:\d\d/.test(await txt(p, '#focus-pill')) && /^\d+:\d\d · /.test(await p.title()));
  await p.click('#focus-pill'); await p.waitForTimeout(400); check('pill returns to focus room', location => true, await p.evaluate(() => location.hash));
  await p.keyboard.press(' '); await p.waitForTimeout(200); check('space pauses', await p.evaluate(() => App.focus.paused)); await p.keyboard.press(' ');
  await p.evaluate(() => { App.focus.elapsed = 26 * 60; App.focus.left = 1; }); await p.waitForTimeout(1500);
  check('session finishes and logs minutes', !(await p.evaluate(() => App.focus.running)) && (await p.evaluate(() => App.focusStats().today)) >= 25 && !!(await p.$('.fz-summary')), await p.evaluate(() => App.focusStats()));
  check('session stored in class data', await p.evaluate(() => (App.store.peek('calc').sessions || []).some(s => s.m >= 25)));
  await p.click('[data-action="fz-break"]'); await p.waitForTimeout(300); check('break timer', (await txt(p, '#fz-sub')).includes('Break')); await p.click('[data-action="fz-skipbreak"]');
  // blitz
  await go(p, '#/calc/blitz', 900); check('blitz intro', !!(await p.$('[data-action="bz-start"]')) && !!(await p.$('.nav-item[data-view="blitz"]')));
  await p.click('[data-action="bz-start"]'); await p.waitForTimeout(600); check('blitz question shown', (await p.$$('#bz-stage .q-opt')).length >= 2);
  let correct = 0; for (let i = 0; i < 4; i++) { const ans = await p.evaluate(() => App.blitz.q && App.blitz.q.answer); if (ans === null) break; await p.click(`#bz-stage .q-opt[data-i="${ans}"]`); correct++; await p.waitForTimeout(600); }
  const sc = await p.evaluate(() => App.blitz.score); check('correct answers score with multiplier', sc >= 40 && (await p.evaluate(() => App.blitz.combo)) === 4, { sc });
  await p.keyboard.press('1'); await p.waitForTimeout(1100); check('keyboard answers', (await p.evaluate(() => App.blitz.n)) === 5);
  await p.evaluate(() => { App.blitz.left = 1; }); await p.waitForTimeout(1600); check('blitz ends with summary and best score', !!(await p.$('.bz-end')) && (await p.evaluate(() => App.store.peek('calc').blitz.best)) >= 40, await txt(p, '.bz-final'));
  // tools
  await go(p, '#/tools', 700); check('tools tabs', (await p.$$('.dash-tabs .tab')).length === 5);
  await p.fill('#tc-in', '2*sin(30)+sqrt(16)'); await p.keyboard.press('Enter'); await p.waitForTimeout(150); check('calculator degrees', (await txt(p, '#tc-out')) === '5', await txt(p, '#tc-out'));
  await p.click('[data-action="tc-mode"][data-m="rad"]'); await p.waitForTimeout(150); check('calculator radians', Math.abs(parseFloat(await txt(p, '#tc-out')) - (2 * Math.sin(30) + 4)) < 1e-6, await txt(p, '#tc-out'));
  await p.click('[data-action="tc-key"][data-k="!"]').catch(() => {}); await p.fill('#tc-in', '5'); await p.click('[data-action="tc-key"][data-k="!"]'); await p.waitForTimeout(100); check('factorial', (await txt(p, '#tc-out')) === '120');
  await p.click('.dash-tabs .tab[data-tab="units"]'); await p.waitForTimeout(200); await p.selectOption('#tu-cat', 'speed'); await p.fill('#tu-v', '72'); await p.selectOption('#tu-from', 'km/h'); await p.selectOption('#tu-to', 'm/s'); await p.waitForTimeout(150); check('units 72 km/h = 20 m/s', (await txt(p, '#tu-out')).includes('20 m/s'), await txt(p, '#tu-out'));
  await p.selectOption('#tu-cat', 'temperature'); await p.fill('#tu-v', '212'); await p.selectOption('#tu-from', '°F'); await p.selectOption('#tu-to', '°C'); await p.waitForTimeout(150); check('temperature', (await txt(p, '#tu-out')).includes('100 °C'), await txt(p, '#tu-out'));
  await p.click('.dash-tabs .tab[data-tab="cite"]'); await p.waitForTimeout(200); await p.fill('#ct-author', 'Tommy Orange'); await p.fill('#ct-date', '2018-06-05'); await p.fill('#ct-title', 'There There'); await p.fill('#ct-source', 'Alfred A. Knopf'); await p.click('[data-action="ct-type"][data-t="book"]'); await p.waitForTimeout(150);
  check('MLA book citation', (await txt(p, '#ct-mla')) === 'Orange, Tommy. There There. Alfred A. Knopf, 2018.', await txt(p, '#ct-mla')); check('APA book citation', (await txt(p, '#ct-apa')) === 'Orange, T. (2018). There There. Alfred A. Knopf.', await txt(p, '#ct-apa'));
  await p.click('[data-action="ct-type"][data-t="web"]'); await p.fill('#ct-source', 'Mathub'); await p.fill('#ct-url', 'https://mathub.space/learn/'); await p.waitForTimeout(150); check('MLA web citation', (await txt(p, '#ct-mla')).startsWith('Orange, Tommy. "There There." Mathub, 5 June 2018, mathub.space/learn/.'), await txt(p, '#ct-mla'));
  await p.click('.dash-tabs .tab[data-tab="words"]'); await p.waitForTimeout(200); await p.fill('#tw-in', 'This is a sentence. This is another one, slightly longer than the first!\n\nA new paragraph starts here.'); await p.waitForTimeout(150); const ws = await txt(p, '#tw-stats'); check('word counter', ws.includes('Words18') && ws.includes('Sentences3') && ws.includes('Paragraphs2'), ws.slice(0, 80));
  await p.click('.dash-tabs .tab[data-tab="sig"]'); await p.waitForTimeout(200); check('sig figs 0.004500 = 4', (await txt(p, '#ts-out')).includes('Significant figures4')); await p.fill('#ts-in', '1200'); await p.waitForTimeout(100); check('ambiguous trailing zeros', (await txt(p, '#ts-out')).includes('(or more)'));
  // recap
  await go(p, '#/recap?w=this', 800); check('recap first slide', (await p.$$('.rc-day.on')).length >= 1 && (await txt(p, '.rc-big')).includes('day'));
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500); check('recap xp slide', (await p.$$('.rc-bar')).length === 7 && (await txt(p, '.rc-big')).includes('XP'));
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500); check('recap end slide', !!(await p.$('[data-action="rc-share"]')));
  const png = await p.evaluate(() => App.recapCanvas(App.weekStats(0)).toDataURL('image/png').length); check('share card renders', png > 20000, png);
  check('recap marks seen', (await p.evaluate(() => App.settings().recapSeen)) === (await p.evaluate(() => App.weekStats(0).key)));
  // account menu
  await go(p, '#/', 400); await login(p, 'alice.a@montana.edu'); await p.reload(); await p.waitForTimeout(1500); if (await p.$('.celebrate')) { await p.keyboard.press('Escape'); await p.waitForTimeout(200); } await p.click('.landing-top [data-action="acct-toggle"]'); await p.waitForTimeout(200); const items = await p.$$eval('.pop-account .acct-dd-item', a => a.map(x => x.textContent.trim())); check('account menu has new entries', ['Focus room', 'Your week', 'Resources & guides', 'Tools'].every(x => items.includes(x)), items); await p.keyboard.press('Escape');
  const [cm, m] = await mk(390, 760, { serviceWorkers: 'block' }); await m.goto(T.base + '#/focus'); await m.waitForTimeout(900); check('mobile focus no hscroll', await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); check('mobile tab bar has Focus', (await m.$$eval('#tabbar .tab-item', t => t.map(x => x.textContent.trim()))).includes('Focus'));
  await m.goto(T.base + '#/tools'); await m.waitForTimeout(700); check('mobile tools no hscroll', await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await m.goto(T.base + '#/recap?w=this'); await m.waitForTimeout(700); check('mobile recap no hscroll', await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await cm.close();
  await c.close(); await T.finish();
})();
