/* JPNS 150D Japanese Culture & Civilization: the class pack built from the Fall 2026 syllabus, version 3
   (packs/src/jpns150d.js). It installs itself, follows the syllabus calendar with each class's reading,
   and its notes, key terms, quizzer, exam prep, grade calculator and syllabus page work. */
const T = require('./lib');
(async () => {
  const { mk, go, txt, login, log, check, hscroll } = await T.start();
  const setSettings = (p, patch) => p.evaluate(patch => { const s = App.settings(); Object.assign(s, patch); localStorage.setItem('studyhub-settings', JSON.stringify(s)); }, patch);
  const [c, p] = await mk(1360, 900, { serviceWorkers: 'block' });
  await go(p, '#/', 1200);
  await setSettings(p, { asof: '2026-10-05', motion: 'off' }); await p.reload(); await p.waitForTimeout(1500);
  check('the start page lists JPNS 150D', await p.evaluate(() => [...document.querySelectorAll('.course-card')].some(c => c.classList.contains('jpns150d'))));

  await go(p, '#/jpns150d', 2200);
  const dash = await p.evaluate(() => { const C = window.Courses.jpns150d; return { loaded: !!(C && C.loaded), title: (document.querySelector('.page-title') || {}).textContent || '', chip: (document.querySelector('#exam-chip') || {}).textContent || '', current: App.currentSectionOf(C).id }; });
  log('dashboard:', dash);
  check('JPNS 150D opens on its dashboard', dash.loaded && dash.title.length > 3, dash);
  check('as of Oct 5 the next exam is Exam 2', /Exam 2/.test(dash.chip), dash.chip);
  check('as of Oct 5 the current topic is the Tokugawa transition', dash.current === 'tokugawa', dash.current);

  await go(p, '#/jpns150d/notes/intro', 900);
  check('the first note is open to visitors', /Kojiki/.test(await txt(p, '#view')) && /Amaterasu/.test(await txt(p, '#view')));
  await go(p, '#/jpns150d/flashcards', 900); check('flashcards view', /flash/i.test(await txt(p, '.page-title')));
  await go(p, '#/jpns150d/calendar', 900);
  check('the calendar shows exams and readings before class', /Exam/.test(await txt(p, '#view')) && await p.evaluate(() => window.Courses.jpns150d.CALENDAR.filter(e => /Before class:/.test(e[2])).length === 33));

  await login(p, 'alice.a@montana.edu'); await p.reload(); await p.waitForTimeout(1200); await p.evaluate(() => document.querySelectorAll('.celebrate').forEach(e => e.remove()));
  await go(p, '#/jpns150d/notes/genji', 900);
  const note = await txt(p, '#view');
  check('signed in, the Genji note renders', note.length > 800 && /mono no aware/i.test(note) && /Yūgao/.test(note), note.slice(0, 120));
  await go(p, '#/jpns150d/formulas', 900);
  const ks = await txt(p, '#view');
  check('signed in, the key terms sheet has periods, aesthetics and works', /Key terms/.test(await txt(p, '.page-title')) && /Muromachi/.test(ks) && /yūgen/.test(ks) && /Ghost in the Shell/.test(ks));
  await go(p, '#/jpns150d/practice', 1200); if (await p.isVisible('#view [data-action="start"]')) { await p.click('#view [data-action="start"]'); await p.waitForTimeout(600); }
  check('every quizzer option has a letter', !/undefined|NaN/.test(await txt(p, '#view')) && (await p.$$eval('.q-opt .letter', ls => ls.map(l => l.textContent))).every(l => /^[A-F]$/.test(l)));
  const gen = await p.evaluate(() => { const Q = window.Courses.jpns150d.quiz; let n = 0, bad = 0; for (let r = 0; r < 10; r++) { const set = Q.generateSet(Object.keys(Q.TOPICS), 30); n += set.length; bad += set.filter(q => !(q.type === 'mc' && q.answer >= 0 && q.answer < q.options.length && q.options.length === 4)).length; } return { n, bad, topics: Object.keys(Q.TOPICS).length }; });
  check('the quizzer generates 300 four-choice questions across 30 topics', gen.n === 300 && gen.bad === 0 && gen.topics === 30, gen);

  await go(p, '#/jpns150d/exam/exam2', 900);
  check('Exam 2 prep covers the samurai to the Bakumatsu', /Exam prep/.test(await txt(p, '.page-title')) && /Heike/.test(await txt(p, '#view')) && /Bakumatsu/.test(await txt(p, '#view')));
  await go(p, '#/jpns150d/grades', 900);
  check('the grade calculator has the six point categories', (await p.$$('.grade-row')).length === 6 && /380 points/.test(await txt(p, '#view')));
  await go(p, '#/jpns150d/course', 900);
  const course = await txt(p, '#view');
  check('the syllabus page has the professor, presentations and exam rules', /Tillack/.test(course) && /10 pm the day before/.test(course) && /closed book/.test(course) && (await p.$$('#view .panel')).length >= 5);
  await c.close();

  const [cm, m] = await mk(390, 844, { serviceWorkers: 'block' });
  await go(m, '#/', 900); await setSettings(m, { motion: 'off' });
  for (const h of ['#/jpns150d', '#/jpns150d/notes/noh', '#/jpns150d/formulas', '#/jpns150d/calendar']) { await go(m, h, 1400); check(`no sideways scroll on ${h} at 390px`, await hscroll(m)); }
  await cm.close();
  await T.finish();
})();
