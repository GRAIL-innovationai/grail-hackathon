/* Resources hub, guides, bookmarks, suggestions, search integration and the resource-suggestion API. */
const T = require('./lib');
(async () => {
  const { mk, login, go, log, check, txt, api } = await T.start({});
  const [c, p] = await mk(1360, 900, { serviceWorkers: 'block' }); await go(p, '#/', 700);
  check('landing guides strip', (await p.$$('.guides-strip .guide-card')).length === 3);
  await go(p, '#/resources', 700); const n0 = (await p.$$('.rs-item')).length; check('resources general list', n0 >= 20, n0); check('guides shown on general', (await p.$$('#rs-guides .guide-card')).length === 6);
  await p.click('.rs-groups .chip[data-g="calc"]'); await p.waitForTimeout(200); check('calc group', (await p.$$('.rs-item')).length >= 10 && (await txt(p, '#rs-blurb')).includes('Active Calculus'));
  await p.click('#rs-kinds .chip[data-k="video"]'); await p.waitForTimeout(200); check('kind filter', (await p.$$('.rs-item')).length >= 3 && (await p.$$eval('.rs-item .rs-ic', e => e.every(x => x.classList.contains('kind-video')))));
  await p.click('#rs-kinds .chip[data-k="all"]'); await p.fill('#rs-q', 'cheat sheet'); await p.waitForTimeout(200); check('search filter', (await p.$$('.rs-item')).length >= 1 && (await txt(p, '.rs-item h3')).toLowerCase().includes('cheat'));
  await p.fill('#rs-q', ''); await p.click('#rs-kinds .chip[data-k="all"]'); await p.waitForTimeout(150);
  await p.click('.rs-item .rs-save'); await p.waitForTimeout(150); check('save toggles', await p.$eval('.rs-item .rs-save', e => e.classList.contains('on')) && (await txt(p, '#rs-saved-n')) === '1');
  await p.click('.rs-groups .chip[data-g="saved"]'); await p.waitForTimeout(200); check('saved tab lists it', (await p.$$('.rs-item')).length === 1);
  check('external links open new tab', await p.$$eval('.rs-item h3 a', a => a.filter(x => /^https?:/.test(x.getAttribute('href'))).every(x => x.target === '_blank' && /noopener/.test(x.rel))));
  await p.click('[data-action="rs-suggest"]'); await p.waitForTimeout(200); check('suggest opens report with resource reason', !!(await p.$('#report-modal')) && (await p.$eval('#rp-reason', e => e.value)) === 'resource'); await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  await go(p, '#/guides', 600); check('guides index', (await p.$$('.guide-card')).length === 17);
  await p.click('.rs-groups .chip[data-f="csci"]'); await p.waitForTimeout(150); const nc = (await p.$$('.guide-card')).length; check('guides class filter', nc < 16 && nc >= 8, nc);
  await go(p, '#/guides/math-exam', 600); check('guide renders', (await p.$$('.guide h2')).length >= 4 && !!(await p.$('.guide-tip')) && !!(await p.$('.guide-quote')));
  check('inline links render', await p.$eval('.guide', e => !!e.querySelector('a[href="#/calc/practice"]') && e.innerHTML.includes('<b>do</b>')));
  const xp0 = await p.evaluate(() => App.xpToday()); await p.click('[data-action="g-done"]'); await p.waitForTimeout(400); check('mark read gives XP', (await p.evaluate(() => App.xpToday())) === xp0 + 5 && (await p.evaluate(() => App.settings().guidesRead)).includes('math-exam'));
  await go(p, '#/calc/resources', 900); check('in-course resources defaults to class', await p.$eval('.rs-groups .chip.on', e => e.dataset.g) === 'calc');
  check('nav has Resources and Blitz slot', !!(await p.$('.nav-item[data-view="resources"]')));
  await go(p, '#/', 300); await p.keyboard.press('Control+k'); await p.fill('#search-input', 'python tutor'); await p.waitForTimeout(300); check('search finds resources', (await txt(p, '.search-item')).includes('Python Tutor')); await p.keyboard.press('Escape');
  await go(p, '#/', 300); await login(p, 'alice.a@montana.edu'); const rep = await api(p, 'issue_report', { view: 'Resources', reason: 'resource', comment: 'https://example.org great', ref: 'general' }); check('resource suggestion accepted by API', rep.json && rep.json.ok === true, rep.json);
  await c.close(); await T.finish();
})();
