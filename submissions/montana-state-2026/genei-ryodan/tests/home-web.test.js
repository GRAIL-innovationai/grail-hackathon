/* ============================================================
   The website's start page in the apps' layout (assets/home.js) and exam week:
   - a returning student sees the class they pick (next exam, readiness, the next lesson, the unit they
     are in) beside Today across all classes and the class's tools; a first visit keeps the intro
   - from 7 days before an exam: a plan for today and for each day until the exam, on the start page
     and the class page; the timed practice exam opens the quizzer in exam mode
   ============================================================ */
const T = require('./lib');
(async () => {
  const { mk, txt, go, hscroll, check } = await T.start();
  const setup = asof => { try { const s = JSON.parse(localStorage.getItem('studyhub-settings') || '{}'); s.tourDone = true; s.courses = ['calc', 'physics', 'precalc']; s.lastVisit = { hash: '#/calc/notes/1.3', label: 'Calc I · Notes', course: 'calc', t: Date.now() - 3600000 }; s.appClass = 'calc'; if (asof) s.asof = asof; else delete s.asof; localStorage.setItem('studyhub-settings', JSON.stringify(s)); } catch (e) {} };
  const open = async (w, h, asof) => { const [c, p] = await mk(w, h, { serviceWorkers: 'block' }); await c.addInitScript(setup, asof); await go(p, '#/', 900); await p.evaluate(() => App.addXP(10, { course: 'calc', silent: true })); await p.reload(); await p.waitForTimeout(2200); return [c, p]; };

  // calc's Exam 2 is on Oct 16, 2026: three days after Oct 13 is exam week, ten days before is not
  const [c1, p] = await open(1360, 900, '2026-10-13');
  const home = await p.evaluate(() => { const h = document.querySelector('.land-next #web-home'); return h && { tabs: [...h.querySelectorAll('.wh-tab')].map(t => t.textContent.trim()), on: (h.querySelector('.wh-tab.on') || {}).textContent, hero: (h.querySelector('.ah-hero h2') || {}).textContent, go: (h.querySelector('.ah-go') || {}).getAttribute && h.querySelector('.ah-go').getAttribute('href'), today: !!h.querySelector('.wh-side .ah-today'), tools: h.querySelectorAll('.wh-side .ah-tool').length, all: (h.querySelector('.wh-side a.ah-tool:last-child') || {}).getAttribute && h.querySelector('.wh-side a.ah-tool:last-child').getAttribute('href'), units: h.querySelectorAll('.ap-unit').length, whole: !!h.querySelector('.ah-whole'), resume: !!h.querySelector('.wh-side .resume-card'), quick: h.querySelectorAll('.wh-side .quick-row > *').length, cols: getComputedStyle(h.querySelector('.wh-grid')).gridTemplateColumns.split(' ').length }; });
  check('returning students get the apps\' start page under "Your next step"', !!home && /Your next step/.test(await txt(p, '.land-next .sec-title')), home);
  check('a tab for each of their classes, the last one they studied picked', home && home.tabs.join('|') === 'Calc I|Physics I|Precalc' && home.on === 'Calc I', home && home.tabs);
  check('the class card: its name and the next lesson', home && /Calculus I/.test(home.hero) && /#\/calc\/lesson\?topics=/.test(home.go), home);
  check('beside it: Today across all classes, the class\'s tools (All tools goes to the class page), where they left off, and the quick buttons', home && home.today && home.tools >= 6 && home.all === '#/calc/dashboard' && home.resume && home.quick === 4, home);
  check('the path shows the unit they are in, with a link to the whole path', home && home.units === 1 && home.whole, home);
  check('two columns on a wide screen', home && home.cols === 2, home && home.cols);
  // exam week on the start page
  const xw = await p.evaluate(() => { const x = document.querySelector('#web-home .xw'); return x && { h: x.querySelector('h2').textContent, items: [...x.querySelectorAll('.xw-today .xw-item')].map(a => [a.querySelector('b').textContent, a.getAttribute('href')]), days: [...x.querySelectorAll('.xw-plan li')].map(li => li.querySelector('b').textContent), last: (x.querySelector('.xw-plan li:last-child span') || {}).textContent, heroExam: !!document.querySelector('#web-home .ah-hero .ah-ex') }; });
  check('exam week: the start page names the exam and the days left', xw && /Exam week: Exam 2 in 3 days/.test(xw.h), xw && xw.h);
  check('today\'s plan starts with the weakest topic as a lesson', xw && /^Weakest topic: /.test(xw.items[0][0]) && /#\/calc\/lesson\?topics=/.test(xw.items[0][1]), xw && xw.items);
  check('with flashcards, a timed practice exam and the prep checklist', xw && xw.items.some(i => /flashcard/.test(i[0])) && xw.items.some(i => i[0] === 'Timed practice exam' && /#\/calc\/practice\?exam=.+&timed=1/.test(i[1])) && xw.items.some(i => /Prep checklist: \d+ of \d+/.test(i[0])), xw && xw.items);
  check('a plan for each day: today, tomorrow, the day before, exam day', xw && xw.days.length === 4 && xw.days[0] === 'Today' && xw.days[1] === 'Tomorrow' && /Exam day/.test(xw.last), xw && xw.days);
  check('the class card does not repeat the exam row during exam week', xw && !xw.heroExam);
  // switching class
  await p.click('.wh-tab[data-wh="physics"]'); await p.waitForTimeout(1500);
  check('picking another class shows its card', /Physics/.test(await txt(p, '#web-home .ah-hero h2')) && await p.evaluate(() => document.querySelector('.wh-tab.on').dataset.wh === 'physics'));
  await p.click('.wh-tab[data-wh="calc"]'); await p.waitForTimeout(1500);
  // a lesson on the path opens its small card
  await p.click('#web-home .ap-li.current [data-node]'); await p.waitForTimeout(300);
  check('a lesson on the path opens its card: start, practise, notes', await p.evaluate(() => { const pop = document.querySelector('#web-home .ap-li.open .ap-pop'); return !!pop && !pop.hidden && pop.querySelectorAll('.btn').length === 3; }));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  check('Escape closes it', await p.evaluate(() => !document.querySelector('#web-home .ap-li.open')));
  // the class page
  await go(p, '#/calc/dashboard', 1800);
  const dash = await p.evaluate(() => { const x = document.querySelector('.xw-dash .xw'); return x && { wide: x.classList.contains('xw-wide'), afterHead: x.parentElement.previousElementSibling && x.parentElement.previousElementSibling.classList.contains('page-head'), planOpen: x.querySelector('.xw-plan').open }; });
  check('the class page shows exam week right under its heading, with the plan open', dash && dash.wide && dash.afterHead && dash.planOpen, dash);
  // the timed practice exam
  const timed = await p.$eval('.xw-dash .xw-item[href*="timed=1"]', a => a.getAttribute('href'));
  await go(p, timed, 1500);
  check('"Timed practice exam" opens the quizzer in exam mode on the exam\'s topics', /practice/.test(p.url()) && await p.evaluate(() => (document.querySelector('#pq-mode') || {}).value === 'exam'), p.url());
  await c1.close();

  // ten days out: no exam week
  const [c2, q] = await open(1360, 900, '2026-10-06');
  check('more than 7 days before the exam there is no exam-week plan', !(await q.$('.xw')) && !!(await q.$('#web-home .ah-hero .ah-ex')));
  await go(q, '#/calc/dashboard', 1500); check('nor on the class page', !(await q.$('.xw')));
  await c2.close();

  // phones
  const [c3, m] = await open(390, 844, '2026-10-13');
  check('phone: the start page is one column and does not scroll sideways', await hscroll(m) && await m.evaluate(() => getComputedStyle(document.querySelector('.wh-grid')).gridTemplateColumns.split(' ').length === 1));
  await go(m, '#/calc/dashboard', 1500); check('phone: the class page with exam week does not scroll sideways', await hscroll(m) && !!(await m.$('.xw')));
  await c3.close();

  // a first visit keeps the intro and the steps
  const [c4, g] = await mk(1360, 900, { serviceWorkers: 'block' }); await go(g, '#/', 1200);
  check('a first visit keeps the intro: classes, then three steps, no start-page card', !(await g.$('#web-home')) && (await g.$$('.start-steps .start-step')).length === 3 && (await g.$$('.course-grid .course-card')).length > 3);
  await c4.close();
  await T.finish();
})();
