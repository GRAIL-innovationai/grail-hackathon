const T = require('./lib');
(async () => {
  const { browser, base, errors, mk, txt, login, api, hscroll, go, log, check } = await T.start({});
  const loaded = p => p.evaluate(() => Object.keys(Courses).filter(id => Courses[id].loaded).join(',') || '-');
  const scripts = p => p.evaluate(() => [...document.querySelectorAll('script[data-src]')].map(s => s.dataset.src).join(','));

  const [c, p] = await mk(); const js = []; p.on('response', r => { if (/assets\/.*\.js/.test(r.url())) js.push(r.url().replace(/.*assets\//, '').replace(/\?.*/, '')); });
  await go(p, '#/'); await p.waitForTimeout(800);
  const isClassFile = f => /^(calc|physics|precalc|writ|csci|biob|kin|psyx)-(data|quiz|tools)|phonetics|pylab/.test(f); check('landing downloads no class files', js.length > 5 && !js.some(isClassFile), js.filter(isClassFile));
  log('landing cards:', (await p.$$('.course-card')).length, '| stat strip:', await txt(p, '.stat-strip'));
  const card = await txt(p, '.course-card'); log('first card:', card.slice(0, 160));
  await p.evaluate(() => { const s = App.settings(); s.courses = ['calc', 'writ', 'csci']; s.lastVisit = { hash: '#/calc/notes/1.3', label: 'Calc I · Notes', course: 'calc', t: Date.now() - 3600000 }; localStorage.setItem('studyhub-settings', JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(3000); check('last visited class is prefetched on idle', (await loaded(p)) === 'calc', await loaded(p));
  await go(p, '#/physics'); log('physics dashboard:', (await txt(p, '#topbar-title')), '| loaded:', await loaded(p), '| dashboard panels:', (await p.$$('#view .panel')).length);
  await go(p, '#/precalc/grapher'); log('precalc grapher view direct:', await txt(p, '#topbar-title'), '| has canvas/svg:', !!(await p.$('#view canvas, #view svg')));
  await go(p, '#/writ/phonetics'); log('writ phonetics:', await txt(p, '#topbar-title'), '| ph ui:', !!(await p.$('.ph-tabs, .ph-wrap, [class*=ph-]')));
  await go(p, '#/writ/readings'); log('writ readings:', (await p.$$('#view .rd-card, #view .reading-card, #view .card-link')).length);
  await go(p, '#/csci/playground'); await p.waitForTimeout(500); log('csci code view:', await txt(p, '#topbar-title'), '| editor:', !!(await p.$('#py-code, textarea')));
  await go(p, '#/csci/practice'); log('csci practice question:', (await txt(p, '.q-prompt')).slice(0, 60));
  await go(p, '#/calc/flashcards'); log('calc flashcards:', (await txt(p, '.fc-front, .flashcard')).slice(0, 60), '| scripts:', await scripts(p));
  await go(p, '#/calc/lesson'); log('calc lesson:', (await txt(p, '.lesson-q, .q-prompt, .lesson-foot')).slice(0, 60));
  // sidebar nav built after load
  log('sidebar items:', (await p.$$('.nav-item')).length, '| path in nav:', !!(await p.$('.nav-item[data-view="path"]')));
  // today counts before/after load in a fresh context
  await c.close();
  const [c2, p2] = await mk(1360, 850, { serviceWorkers: 'block' }); await go(p2, '#/'); await p2.evaluate(() => { const s = App.settings(); s.courses = ['calc', 'physics']; localStorage.setItem('studyhub-settings', JSON.stringify(s)); App.store.poke('physics', d => { d.flashcards = { 'fc-x1': 1, 'fc-x2': 0 }; d.fcAt = { 'fc-x1': Date.now() - 5 * 86400000, 'fc-x2': Date.now() }; }); });
  await go(p2, '#/today'); log('today (stubs) loaded:', await loaded(p2), '| plan:', (await txt(p2, '#td-plan .td-item')).slice(0, 120), '| classes:', (await txt(p2, '#td-classes')).slice(0, 160));
  await p2.click('[data-action="td-review"]'); await p2.waitForTimeout(1500); log('review loads classes:', await loaded(p2), '| card:', (await txt(p2, '#td-card')).slice(0, 60));
  await go(p2, '#/challenge?course=physics'); await p2.waitForTimeout(1200); log('challenge standalone:', (await txt(p2, '#ch-q .q-prompt')).slice(0, 60), '| chips:', (await p2.$$('.chips .chip')).length);
  await go(p2, '#/'); await p2.keyboard.press('Control+k'); await p2.waitForTimeout(200); await p2.fill('#search-input', 'chain rule'); await p2.waitForTimeout(1500); log('search after load:', (await p2.$$('.search-item')).length, '| first:', (await txt(p2, '.search-item')).slice(0, 80), '| loaded:', await loaded(p2)); await p2.keyboard.press('Escape');
  // stale hash view before load e.g. #/physics/motion
  await go(p2, '#/physics/motion'); log('physics tool direct:', await txt(p2, '#topbar-title'));
  // failed load
  await p2.route('**/assets/precalc-quiz.js*', r => r.abort()); await go(p2, '#/precalc'); await p2.waitForTimeout(800); check('failed download shows an error with retry', /Could not download/.test(await txt(p2, '#view .empty')) && !!(await p2.$('[data-action="retry"]')), await txt(p2, '#view .empty'));
  await p2.unroute('**/assets/precalc-quiz.js*'); await p2.click('[data-action="retry"]'); await p2.waitForTimeout(1200); check('retry loads the class', /Precalc/.test(await txt(p2, '#topbar-title')) && /precalc/.test(await loaded(p2)));
  await c2.close();
  const [c3, m] = await mk(390, 760); await m.goto(base + '#/calc'); await m.waitForTimeout(1200); log('mobile calc no hscroll:', await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '| tabbar:', await m.$$eval('#tabbar .tab-item', t => t.map(x => x.textContent.trim()).join(','))); await c3.close();
  await T.finish();
})();
